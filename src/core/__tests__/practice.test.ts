/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCoefficientAnswer, createPractice, updatePractice } from '../../learning/practice.ts'
import type { LearningStep, PracticeAction, PracticeState } from '../../learning/practice.ts'
import { equationFromRoots } from '../equations.ts'
import type { AnswerInput, RootPair } from '../types.ts'

type Command = { type: 'input'; input: AnswerInput } | { type: 'check' | 'hint' | 'solution' | 'next-step' | 'next-task' }
function send(state: PracticeState, command: Command): PracticeState {
  return updatePractice(state, { ...command, taskId: state.tasks[state.currentIndex].id, step: state.step })
}
function answer(state: PracticeState, input: AnswerInput): PracticeState {
  return send(send(state, { type: 'input', input }), { type: 'check' })
}
function correctStep(state: PracticeState): PracticeState {
  const { p, q, roots } = state.tasks[state.currentIndex].equation
  return answer(state, state.step === 'roots' ? [String(roots[1]), String(roots[0])] : [String(state.step === 'sum' ? -p : q), ''])
}

test('sum and product checks cover positive, negative, zero and repeated roots', () => {
  const pairs: readonly RootPair[] = [[2, 3], [-3, -4], [-3, 2], [0, -4], [-3, 3], [3, 3], [0, 0]]
  for (const [a, b] of pairs) {
    const equation = equationFromRoots([a, b])
    assert.equal(checkCoefficientAnswer(equation, 'sum', String(a + b)), 'correct')
    assert.equal(checkCoefficientAnswer(equation, 'product', String(a * b)), 'correct')
    assert.equal(checkCoefficientAnswer(equation, 'sum', String(a + b + 1)), 'incorrect')
    assert.equal(checkCoefficientAnswer(equation, 'product', String(a * b + 1)), 'incorrect')
  }
})

test('coefficient checks distinguish invalid input and accept signed decimal integers', () => {
  const equation = equationFromRoots([0, -4])
  for (const step of ['sum', 'product'] as const) {
    for (const input of ['', ' ', 'abc', '1.5', '1,5', 'Infinity', '9007199254740992']) {
      assert.equal(checkCoefficientAnswer(equation, step, input), 'invalid')
    }
  }
  assert.equal(checkCoefficientAnswer(equation, 'sum', ' −4 '), 'correct')
  assert.equal(checkCoefficientAnswer(equation, 'product', '-0'), 'correct')
})

test('practice starts with exactly three ordered generated tasks and no scoring fields', () => {
  const state = createPractice(() => 0)
  assert.deepEqual(state.tasks.map((task) => task.difficulty), ['easy', 'medium', 'hard'])
  assert.equal(state.step, 'sum')
  assert.equal(state.phase, 'answering')
  assert.equal(state.feedback, null)
  assert.deepEqual(state.input, ['', ''])
  assert.equal(state.tasks[2].equation.roots[0], state.tasks[2].equation.roots[1])
  assert.equal('points' in state, false)
})

test('invalid and incorrect responses stay on step, with unlimited retries and free hints', () => {
  let state = createPractice(() => 0)
  for (let attempt = 0; attempt < 20; attempt++) {
    state = answer(state, ['', ''])
    assert.equal(state.feedback, 'invalid')
    state = answer(state, ['999', ''])
    assert.equal(state.feedback, 'incorrect')
    state = send(state, { type: 'hint' })
    assert.equal(state.hintShown, true)
    assert.equal(state.step, 'sum')
    assert.equal(state.phase, 'answering')
    assert.strictEqual(send(state, { type: 'next-step' }), state)
    assert.strictEqual(send(state, { type: 'next-task' }), state)
  }
  assert.equal(correctStep(state).feedback, 'correct')
})

test('correct steps require explicit continuation, clear inputs and hints, and reject stale actions', () => {
  let state = send(createPractice(() => 0), { type: 'hint' })
  state = correctStep(state)
  assert.equal(state.step, 'sum')
  assert.equal(state.feedback, 'correct')
  assert.strictEqual(send(state, { type: 'check' }), state)
  assert.strictEqual(send(state, { type: 'input', input: ['bad', ''] }), state)
  const stale: PracticeAction = { type: 'next-step', step: 'sum', taskId: state.tasks[0].id }
  state = updatePractice(state, stale)
  assert.equal(state.step, 'product')
  assert.equal(state.hintShown, false)
  assert.deepEqual(state.input, ['', ''])
  assert.strictEqual(updatePractice(state, stale), state)
  state = send(correctStep(state), { type: 'next-step' })
  assert.equal(state.step, 'roots')
  state = correctStep(state)
  assert.equal(state.phase, 'task-complete')
})

test('roots use order-independent checking, multiplicity and separate input errors', () => {
  for (const pair of [[-4, 0], [3, 3], [0, 0]] as RootPair[]) {
    const initial = createPractice(() => 0)
    let state: PracticeState = {
      ...initial, step: 'roots', tasks: [{ ...initial.tasks[0], equation: equationFromRoots(pair) }],
    }
    state = answer(state, ['', '0'])
    assert.equal(state.feedback, 'invalid')
    state = answer(state, ['998', '999'])
    assert.equal(state.feedback, 'incorrect')
    state = answer(state, [String(pair[1]), String(pair[0])])
    assert.equal(state.feedback, 'correct')
    assert.equal(state.phase, 'task-complete')
  }
})

test('full solution is available on each step and permits progression without correct answers', () => {
  for (const step of ['sum', 'product', 'roots'] as LearningStep[]) {
    const state = answer({ ...createPractice(() => 0), step }, ['', ''])
    const revealed = send(state, { type: 'solution' })
    assert.equal(revealed.solutionViewed, true)
    assert.equal(revealed.phase, 'task-complete')
    assert.equal(revealed.feedback, null)
    assert.strictEqual(send(revealed, { type: 'check' }), revealed)
    assert.strictEqual(send(revealed, { type: 'input', input: ['1', '2'] }), revealed)
    const next = send(revealed, { type: 'next-task' })
    assert.equal(next.currentIndex, 1)
    assert.equal(next.step, 'sum')
    assert.equal(next.solutionViewed, false)
    assert.deepEqual(next.input, ['', ''])
  }
})

test('all three tasks complete after nine correct steps with an explicit final confirmation', () => {
  let state = createPractice(() => 0)
  for (let task = 0; task < 3; task++) {
    for (const step of ['sum', 'product', 'roots']) {
      assert.equal(state.step, step)
      state = correctStep(state)
      if (step !== 'roots') state = send(state, { type: 'next-step' })
    }
    assert.equal(state.phase, 'task-complete')
    state = send(state, { type: 'next-task' })
  }
  assert.equal(state.phase, 'completed')
  assert.equal(state.currentIndex, 2)
  for (const type of ['check', 'hint', 'solution', 'next-task', 'next-step'] as const) {
    assert.strictEqual(send(state, { type }), state)
  }
})

test('all tasks can finish via solutions, stale task actions are ignored and snapshots remain unchanged', () => {
  const initial = createPractice(() => 0)
  const snapshot = structuredClone(initial)
  let state = initial
  for (let task = 0; task < 3; task++) {
    state = send(send(state, { type: 'solution' }), { type: 'next-task' })
    if (task === 0) assert.strictEqual(updatePractice(state, { type: 'solution', step: 'sum', taskId: initial.tasks[0].id }), state)
  }
  assert.equal(state.phase, 'completed')
  assert.deepEqual(initial, snapshot)
})
