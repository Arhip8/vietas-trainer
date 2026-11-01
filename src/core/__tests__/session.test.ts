/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionStorage, decodeSession, SESSION_KEY } from '../../persistence/session.ts'
import type { SavedSession, StoragePort } from '../../persistence/session.ts'
import { createTraining, getTotalPoints, updateTraining } from '../training.ts'
import { createPractice, updatePractice } from '../../learning/practice.ts'

class MemoryStorage implements StoragePort {
  value: string | null = null
  failRead = false
  failWrite = false
  failRemove = false
  getItem(key: string) {
    assert.equal(key, SESSION_KEY)
    if (this.failRead) throw new Error('Denied')
    return this.value
  }
  setItem(key: string, value: string) {
    assert.equal(key, SESSION_KEY)
    if (this.failWrite) throw new Error('Quota exceeded')
    this.value = value
  }
  removeItem(key: string) {
    assert.equal(key, SESSION_KEY)
    if (this.failRemove) throw new Error('Denied')
    this.value = null
  }
}
function training(id = 'session-1'): Extract<SavedSession, { mode: 'training' }> {
  return { version: 1, id, mode: 'training', state: createTraining(id, () => 0), showResults: false }
}
function solvedTraining() {
  const session = training()
  let state = session.state
  const taskId = state.tasks[0].task.id
  const base = { trainingId: state.id, taskId }
  state = updateTraining(state, { ...base, type: 'set-input', input: ['0', '0'] })
  state = updateTraining(state, { ...base, type: 'check-answer' })
  state = updateTraining(state, { ...base, type: 'request-hint' })
  const [a, b] = state.tasks[0].task.equation.roots
  state = updateTraining(state, { ...base, type: 'set-input', input: [String(a), String(b)] })
  state = updateTraining(state, { ...base, type: 'check-answer' })
  return { ...session, state }
}

test('empty, broken JSON, incompatible versions and invalid shapes safely load home', () => {
  const memory = new MemoryStorage()
  assert.deepEqual(createSessionStorage(() => memory).load(), { session: null, error: null })
  for (const value of ['{broken', 'null', '[]', '{}', JSON.stringify({ ...training(), version: 2 }), JSON.stringify({ ...training(), mode: 'unknown' })]) {
    memory.value = value
    assert.deepEqual(createSessionStorage(() => memory).load(), { session: null, error: 'invalid' })
  }
})

test('draft values restore exactly without generation or empty initialization overwriting storage', () => {
  const memory = new MemoryStorage()
  const store = createSessionStorage(() => memory)
  store.load()
  const session = training()
  const state = updateTraining(session.state, { type: 'set-input', trainingId: session.id, taskId: session.state.tasks[0].task.id, input: ['−', ' 5 '] })
  const saved = { ...session, state }
  assert.equal(store.save(saved, true), null)
  const raw = memory.value
  const restored = createSessionStorage(() => memory).load()
  assert.deepEqual(restored.session, saved)
  assert.equal(memory.value, raw)
})

test('points, errors, hints and completion locks survive reload without duplicate awards', () => {
  const memory = new MemoryStorage()
  const store = createSessionStorage(() => memory)
  store.load()
  const saved = solvedTraining()
  assert.equal(store.save(saved, true), null)
  const restored = createSessionStorage(() => memory).load().session
  assert.ok(restored?.mode === 'training')
  assert.equal(restored.state.tasks[0].incorrectAttempts, 1)
  assert.equal(restored.state.tasks[0].hintUsed, true)
  assert.equal(getTotalPoints(restored.state), 0.5)
  const repeated = updateTraining(restored.state, { type: 'check-answer', trainingId: restored.id, taskId: restored.state.tasks[0].task.id })
  assert.strictEqual(repeated, restored.state)
  assert.equal(getTotalPoints(repeated), 0.5)
})

test('training snapshots at every transition, final feedback and results all validate', () => {
  let session = training()
  for (let i = 0; i < 9; i++) {
    const base = { trainingId: session.id, taskId: session.state.tasks[i].task.id }
    const [a, b] = session.state.tasks[i].task.equation.roots
    for (const action of [
      { ...base, type: 'set-input' as const, input: [String(a), String(b)] as const },
      { ...base, type: 'check-answer' as const },
      ...(i < 8 ? [{ ...base, type: 'next-task' as const }] : []),
    ]) {
      session = { ...session, state: updateTraining(session.state, action) }
      assert.deepEqual(decodeSession(JSON.stringify(session)), session)
    }
  }
  assert.equal(session.state.status, 'completed')
  assert.equal(getTotalPoints(session.state), 18)
  assert.equal(decodeSession(JSON.stringify(session))?.mode, 'training')
  session = { ...session, showResults: true }
  assert.deepEqual(decodeSession(JSON.stringify(session)), session)
})

test('practice saves all stages, drafts, hints, invalid feedback and final completion', () => {
  const memory = new MemoryStorage()
  const store = createSessionStorage(() => memory)
  store.load()
  let state = createPractice(() => 0)
  for (let i = 0; i < 3; i++) {
    for (const step of ['sum', 'product', 'roots'] as const) {
      const task = state.tasks[i]
      const base = { taskId: task.id, step }
      const { p, q, roots: [a, b] } = task.equation
      const correct = step === 'sum' ? [String(-p), ''] as const : step === 'product' ? [String(q), ''] as const : [String(a), String(b)] as const
      for (const action of [
        { ...base, type: 'input' as const, input: ['', ''] as const },
        { ...base, type: 'check' as const }, { ...base, type: 'hint' as const },
        { ...base, type: 'input' as const, input: correct }, { ...base, type: 'check' as const },
        { ...base, type: step === 'roots' ? 'next-task' as const : 'next-step' as const },
      ]) {
        state = updatePractice(state, action)
        const saved: SavedSession = { version: 1, id: 'practice-1', mode: 'practice', state }
        assert.equal(store.save(saved), null)
        assert.deepEqual(createSessionStorage(() => memory).load().session, saved)
      }
    }
  }
  assert.equal(state.phase, 'completed')
})

test('viewed practice solutions and zero training scores survive serialization', () => {
  const practice = createPractice(() => 0)
  const state = updatePractice(practice, { type: 'solution', taskId: practice.tasks[0].id, step: 'sum' })
  const saved: SavedSession = { version: 1, id: 'solution', mode: 'practice', state }
  assert.deepEqual(decodeSession(JSON.stringify(saved)), saved)
  const session = training()
  const viewed = { ...session, state: updateTraining(session.state, { type: 'view-solution', taskId: session.state.tasks[0].task.id, trainingId: session.id }) }
  assert.deepEqual(decodeSession(JSON.stringify(viewed)), viewed)
})

test('confirmed exit deletes saved session, cancellation leaves it intact', () => {
  const memory = new MemoryStorage()
  const store = createSessionStorage(() => memory)
  store.load()
  store.save(solvedTraining(), true)
  const beforeCancel = memory.value
  // Cancellation does not call save(null), matching the UI navigation guard.
  assert.deepEqual(store.load().session, solvedTraining())
  assert.equal(memory.value, beforeCancel)
  assert.equal(store.save(null), null)
  assert.deepEqual(createSessionStorage(() => memory).load(), { session: null, error: null })
})

test('old tabs cannot overwrite or delete a newly started session or different revision', () => {
  const memory = new MemoryStorage()
  const oldTab = createSessionStorage(() => memory)
  oldTab.load()
  oldTab.save(training('old'), true)
  const newTab = createSessionStorage(() => memory)
  newTab.load()
  newTab.save(training('new'), true)
  assert.equal(oldTab.save(solvedTraining()), 'conflict')
  // Leaving the stale tab must succeed without deleting the newer session.
  assert.equal(oldTab.save(null), null)
  assert.equal(newTab.load().session?.id, 'new')
})

test('unavailable storage, blocked access, quota failures and deletion failures are contained', () => {
  const unavailable = createSessionStorage(() => { throw new Error('SecurityError') })
  assert.deepEqual(unavailable.load(), { session: null, error: 'unavailable' })
  assert.equal(unavailable.save(training(), true), 'unavailable')
  const memory = new MemoryStorage()
  const store = createSessionStorage(() => memory)
  store.load()
  memory.failWrite = true
  assert.equal(store.save(training(), true), 'unavailable')
  memory.failWrite = false
  assert.equal(store.save(training(), true), null)
  memory.failRemove = true
  assert.equal(store.save(null), 'unavailable')
  assert.notEqual(memory.value, null)
  memory.failRead = true
  assert.equal(store.load().error, 'unavailable')
})

test('a failed replacement preserves the existing saved session while the UI retains it', () => {
  const memory = new MemoryStorage()
  const store = createSessionStorage(() => memory)
  store.load()
  store.save(training('old'), true)
  memory.failWrite = true
  assert.equal(store.save(training('new'), true), 'unavailable')
  assert.deepEqual(createSessionStorage(() => memory).load().session, training('old'))
})

test('storage can recover from an initial read failure when no saved session exists', () => {
  const memory = new MemoryStorage()
  memory.failRead = true
  const store = createSessionStorage(() => memory)
  assert.equal(store.load().error, 'unavailable')
  memory.failRead = false
  assert.equal(store.save(training()), null)
})

test('a verification read failure does not permanently block later saves', () => {
  const memory = new MemoryStorage()
  const port: StoragePort = {
    getItem: (key) => memory.getItem(key),
    removeItem: (key) => memory.removeItem(key),
    setItem: (key, value) => { memory.setItem(key, value); memory.failRead = true },
  }
  const store = createSessionStorage(() => port)
  store.load()
  assert.equal(store.save(training(), true), 'unavailable')
  memory.failRead = false
  // The next write reaches verification instead of failing an ownership check.
  assert.equal(store.save(solvedTraining()), 'unavailable')
  memory.failRead = false
  assert.deepEqual(decodeSession(memory.value!), solvedTraining())
})

test('enum-shaped arrays in corrupted JSON are rejected rather than coerced to strings', () => {
  const saved = training()
  for (const patch of [{ status: ['active'] }]) {
    assert.equal(decodeSession(JSON.stringify({ ...saved, state: { ...saved.state, ...patch } })), null)
  }
  const tasks = saved.state.tasks.map((item, index) => index === 0 ? { ...item, status: ['open'] } : item)
  assert.equal(decodeSession(JSON.stringify({ ...saved, state: { ...saved.state, tasks } })), null)
  const practice = { version: 1, id: 'practice', mode: 'practice', state: createPractice(() => 0) }
  for (const patch of [{ phase: ['answering'] }, { step: ['sum'] }]) {
    assert.equal(decodeSession(JSON.stringify({ ...practice, state: { ...practice.state, ...patch } })), null)
  }
})

test('starting another mode replaces the single saved session with a new identifier', () => {
  const memory = new MemoryStorage()
  const store = createSessionStorage(() => memory)
  store.load()
  store.save(solvedTraining(), true)
  let state = createPractice(() => 0)
  state = updatePractice(state, { type: 'input', taskId: state.tasks[0].id, step: 'sum', input: ['−', ''] })
  const practice: SavedSession = { version: 1, id: 'new-practice-id', mode: 'practice', state }
  assert.equal(store.save(practice, true), null)
  assert.deepEqual(createSessionStorage(() => memory).load().session, practice)
  assert.equal(memory.value?.includes('session-1'), false)
})

test('zero coefficients and repeated zero roots are safe to restore', () => {
  const session = training()
  const tasks = session.state.tasks.map((item, i) => i === 8
    ? { ...item, task: { ...item.task, equation: { p: 0, q: 0, roots: [0, 0] as const } } }
    : item)
  const saved = { ...session, state: { ...session.state, tasks } }
  assert.deepEqual(decodeSession(JSON.stringify(saved)), saved)
})

test('structural and mathematical corruption is rejected before use', () => {
  const valid = solvedTraining()
  const mutations: ((value: ReturnType<typeof solvedTraining>) => void)[] = [
    (value) => { Object.assign(value, { id: 'mismatch' }) },
    (value) => { Object.assign(value.state, { currentIndex: 9 }) },
    (value) => { Object.assign(value.state.tasks[0], { points: 100 }) },
    (value) => { Object.assign(value.state.tasks[0], { incorrectAttempts: -1 }) },
    (value) => { Object.assign(value.state.tasks[0].task.equation, { p: 999 }) },
    (value) => { Object.assign(value.state.tasks[0], { input: [null, '1'] }) },
    (value) => { Object.assign(value.state.tasks[1], { status: 'solved' }) },
    (value) => { Object.assign(value.state, { status: 'completed' }) },
    (value) => { Object.assign(value, { showResults: true }) },
  ]
  for (const mutate of mutations) {
    const corrupted = structuredClone(valid)
    mutate(corrupted)
    assert.equal(decodeSession(JSON.stringify(corrupted)), null)
  }
  const practice: SavedSession = { version: 1, id: 'practice', mode: 'practice', state: createPractice(() => 0) }
  for (const patch of [{ currentIndex: -1 }, { step: 'unknown' }, { feedback: 'correct' }, { phase: 'completed' }, { tasks: [] }, { solutionViewed: true }]) {
    assert.equal(decodeSession(JSON.stringify({ ...practice, state: { ...practice.state, ...patch } })), null)
  }
})
