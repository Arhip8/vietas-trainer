/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTraining, getTotalPoints, updateTraining } from '../training.ts'
import type { AnswerInput, TrainingAction, TrainingState } from '../types.ts'

type Command =
  | { type: 'set-input'; input: AnswerInput }
  | { type: 'check-answer' | 'request-hint' | 'view-solution' | 'next-task' }

function dispatch(state: TrainingState, command: Command): TrainingState {
  return updateTraining(state, {
    ...command, trainingId: state.id, taskId: state.tasks[state.currentIndex].task.id,
  })
}

function solve(state: TrainingState): TrainingState {
  const [a, b] = state.tasks[state.currentIndex].task.equation.roots
  return dispatch(dispatch(state, { type: 'set-input', input: [String(b), String(a)] }), {
    type: 'check-answer',
  })
}

test('initial training has nine ordered tasks with independent empty progress', () => {
  const state = createTraining('training-1', () => 0)
  assert.equal(state.status, 'active')
  assert.equal(state.currentIndex, 0)
  assert.equal(state.tasks.length, 9)
  assert.deepEqual(state.tasks.map(({ task }) => task.difficulty), [
    'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard',
  ])
  for (const task of state.tasks) {
    assert.equal(task.status, 'open')
    assert.equal(task.incorrectAttempts, 0)
    assert.equal(task.hintUsed, false)
    assert.equal(task.points, 0)
    assert.equal(task.lastCheck, null)
    assert.deepEqual(task.input, ['', ''])
  }
  assert.equal(getTotalPoints(state), 0)
  assert.deepEqual(state, createTraining('training-1', () => 0))
  assert.throws(() => createTraining('  '), /Идентификатор/)
})

test('draft input is copied, preserved unchecked, and old validation is cleared on edit', () => {
  const initial = createTraining('draft', () => 0)
  const input: [string, string] = ['-2', '']
  const draft = dispatch(initial, { type: 'set-input', input })
  input[0] = 'changed externally'
  assert.deepEqual(draft.tasks[0].input, ['-2', ''])
  assert.equal(draft.tasks[0].lastCheck, null)
  assert.equal(draft.tasks[0].incorrectAttempts, 0)
  assert.deepEqual(initial.tasks[0].input, ['', ''])
  const checked = dispatch(draft, { type: 'check-answer' })
  assert.equal(checked.tasks[0].lastCheck?.status, 'invalid')
  const edited = dispatch(checked, { type: 'set-input', input: ['1', '2'] })
  assert.equal(edited.tasks[0].lastCheck, null)
})

test('mathematical errors count as attempts and leave task open without hints or points', () => {
  let state = createTraining('errors', () => 0)
  state = dispatch(state, { type: 'set-input', input: ['0', '0'] })
  state = dispatch(state, { type: 'check-answer' })
  assert.equal(state.tasks[0].incorrectAttempts, 1)
  assert.equal(state.tasks[0].lastCheck?.status, 'incorrect')
  assert.equal(state.tasks[0].status, 'open')
  assert.equal(state.tasks[0].hintUsed, false)
  assert.equal(getTotalPoints(state), 0)
  assert.strictEqual(dispatch(state, { type: 'next-task' }), state)
})

test('invalid inputs never count as incorrect attempts or trigger hints', () => {
  let state = createTraining('invalid', () => 0)
  for (const input of [['', ''], ['abc', '2'], ['1.5', '2']] as AnswerInput[]) {
    state = dispatch(state, { type: 'set-input', input })
    state = dispatch(state, { type: 'check-answer' })
    assert.equal(state.tasks[0].lastCheck?.status, 'invalid')
    assert.equal(state.tasks[0].incorrectAttempts, 0)
    assert.equal(state.tasks[0].status, 'open')
    assert.equal(state.tasks[0].hintUsed, false)
    assert.equal(getTotalPoints(state), 0)
  }
})

test('correct answer after multiple errors awards full points and preserves history', () => {
  let state = createTraining('retry', () => 0)
  state = dispatch(state, { type: 'set-input', input: ['0', '0'] })
  for (let i = 0; i < 3; i++) state = dispatch(state, { type: 'check-answer' })
  state = solve(state)
  assert.equal(state.tasks[0].status, 'solved')
  assert.equal(state.tasks[0].incorrectAttempts, 3)
  assert.equal(state.tasks[0].lastCheck?.status, 'correct')
  assert.equal(state.tasks[0].points, 1)
})

test('one or many hints award the same half points on every difficulty', () => {
  for (const hints of [1, 4]) {
    let state = createTraining(`hints-${hints}`, () => 0)
    for (let i = 0; i < 9; i++) {
      for (let n = 0; n < hints; n++) state = dispatch(state, { type: 'request-hint' })
      assert.equal(state.tasks[i].hintUsed, true)
      assert.equal(state.tasks[i].points, 0)
      state = solve(state)
      assert.equal(state.tasks[i].points, i < 3 ? 0.5 : i < 6 ? 1 : 1.5)
      if (i < 8) state = dispatch(state, { type: 'next-task' })
    }
    assert.equal(getTotalPoints(state), 9)
  }
})

test('viewing solution finishes task for zero, retaining attempts and hint flag', () => {
  let state = createTraining('solution', () => 0)
  state = dispatch(state, { type: 'request-hint' })
  state = dispatch(state, { type: 'set-input', input: ['0', '0'] })
  state = dispatch(state, { type: 'check-answer' })
  state = dispatch(state, { type: 'view-solution' })
  assert.equal(state.tasks[0].status, 'solution-viewed')
  assert.equal(state.tasks[0].points, 0)
  assert.equal(state.tasks[0].incorrectAttempts, 1)
  assert.equal(state.tasks[0].hintUsed, true)
  assert.equal(dispatch(state, { type: 'next-task' }).currentIndex, 1)
})

test('all result-changing actions are ignored after solving or viewing solution', () => {
  const initial = createTraining('locked', () => 0)
  for (const state of [solve(initial), dispatch(initial, { type: 'view-solution' })]) {
    for (const command of [
      { type: 'set-input', input: ['0', '0'] }, { type: 'check-answer' },
      { type: 'request-hint' }, { type: 'view-solution' },
    ] as Command[]) {
      assert.strictEqual(dispatch(state, command), state)
    }
  }
})

test('stale, unknown, future and previous-training identifiers are ignored', () => {
  const solved = solve(createTraining('current-training', () => 0))
  const nextAction: TrainingAction = {
    type: 'next-task', trainingId: solved.id, taskId: solved.tasks[0].task.id,
  }
  const next = updateTraining(solved, nextAction)
  assert.equal(next.currentIndex, 1)
  assert.strictEqual(updateTraining(next, nextAction), next)
  for (const type of ['check-answer', 'request-hint', 'view-solution', 'next-task'] as const) {
    for (const taskId of [solved.tasks[0].task.id, solved.tasks[2].task.id, 'unknown']) {
      assert.strictEqual(updateTraining(next, { type, trainingId: next.id, taskId }), next)
    }
    assert.strictEqual(updateTraining(next, {
      type, trainingId: 'previous-training', taskId: next.tasks[1].task.id,
    }), next)
  }
  assert.strictEqual(updateTraining(next, {
    type: 'set-input', input: ['3', '4'], trainingId: next.id, taskId: solved.tasks[0].task.id,
  }), next)
})

test('navigation requires completion and difficulty changes only with task index', () => {
  let state = createTraining('navigation', () => 0)
  assert.strictEqual(dispatch(state, { type: 'next-task' }), state)
  for (let i = 0; i < 8; i++) {
    state = dispatch(state, { type: 'view-solution' })
    const finished = state.tasks[i]
    state = dispatch(state, { type: 'next-task' })
    assert.equal(state.currentIndex, i + 1)
    assert.strictEqual(state.tasks[i], finished)
    assert.deepEqual(state.tasks[i + 1].input, ['', ''])
    assert.equal(state.status, 'active')
  }
  assert.equal(state.tasks[8].task.difficulty, 'hard')
})

test('ninth completion finishes training immediately, with final index still in bounds', () => {
  for (const finalAction of ['solve', 'view-solution'] as const) {
    let state = createTraining(`finish-${finalAction}`, () => 0)
    for (let i = 0; i < 8; i++) {
      state = dispatch(solve(state), { type: 'next-task' })
    }
    assert.equal(state.status, 'active')
    state = finalAction === 'solve' ? solve(state) : dispatch(state, { type: 'view-solution' })
    assert.equal(state.status, 'completed')
    assert.equal(state.currentIndex, 8)
    assert.equal(getTotalPoints(state), finalAction === 'solve' ? 18 : 15)
    for (const command of [
      { type: 'next-task' }, { type: 'check-answer' }, { type: 'request-hint' },
      { type: 'view-solution' }, { type: 'set-input', input: ['', ''] },
    ] as Command[]) assert.strictEqual(dispatch(state, command), state)
  }
})

test('mixed outcomes derive the correct total without accumulating repeated scores', () => {
  let state = createTraining('mixed', () => 0)
  for (let i = 0; i < 9; i++) {
    if (i % 3 === 2) state = dispatch(state, { type: 'view-solution' })
    else {
      if (i % 3 === 1) state = dispatch(state, { type: 'request-hint' })
      state = solve(state)
      const repeated = dispatch(state, { type: 'check-answer' })
      assert.strictEqual(repeated, state)
    }
    if (i < 8) state = dispatch(state, { type: 'next-task' })
  }
  assert.equal(getTotalPoints(state), 1 + 0.5 + 2 + 1 + 3 + 1.5)
  assert.equal(state.status, 'completed')
})

test('updates preserve previous snapshots and state can round-trip through JSON', () => {
  const initial = createTraining('serializable', () => 0)
  const snapshot = structuredClone(initial)
  const changed = dispatch(initial, { type: 'request-hint' })
  const solved = solve(changed)
  assert.deepEqual(initial, snapshot)
  assert.equal(changed.tasks[0].status, 'open')
  assert.equal(solved.tasks[0].status, 'solved')
  assert.strictEqual(initial.tasks[1], changed.tasks[1])
  const restored: TrainingState = JSON.parse(JSON.stringify(solved))
  assert.deepEqual(restored, solved)
  const next = dispatch(restored, { type: 'next-task' })
  assert.equal(next.currentIndex, 1)
  assert.equal(getTotalPoints(next), 0.5)
})
