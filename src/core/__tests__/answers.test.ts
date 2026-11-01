/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAnswer, parseRoot } from '../answers.ts'
import { equationFromRoots } from '../equations.ts'
import type { AnswerInput, RootPair } from '../types.ts'

test('correct roots are accepted in either order, including zero and negative roots', () => {
  const pairs: readonly RootPair[] = [[2, 5], [-7, -3], [-4, 6], [0, 12], [-12, 0], [-5, 5]]
  for (const pair of pairs) {
    const equation = equationFromRoots(pair)
    for (const input of [[String(pair[0]), String(pair[1])], [String(pair[1]), String(pair[0])]] as AnswerInput[]) {
      assert.equal(checkAnswer(equation, input).status, 'correct')
    }
  }
})

test('repeated roots require both fields, and multiplicity is preserved', () => {
  for (const root of [-4, 0, 4]) {
    const equation = equationFromRoots([root, root])
    assert.equal(checkAnswer(equation, [String(root), String(root)]).status, 'correct')
    assert.equal(checkAnswer(equation, [String(root), '']).status, 'invalid')
    assert.equal(checkAnswer(equation, [String(root), String(root + 1)]).status, 'incorrect')
  }
  assert.equal(checkAnswer(equationFromRoots([2, 5]), ['2', '2']).status, 'incorrect')
})

test('parser accepts signs, whitespace, leading zeros and Unicode minus', () => {
  for (const [text, value] of [
    ['  +003  ', 3], ['−7', -7], ['-0', 0], ['0', 0],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['-9007199254740991', -Number.MAX_SAFE_INTEGER],
  ] as const) {
    assert.deepEqual(parseRoot(text), { status: 'valid', value })
  }
})

test('empty, malformed, fractional and unsafe values produce structured field errors', () => {
  const cases = [
    ['', 'empty'], [' \n\t ', 'empty'], ['abc', 'invalid-integer'],
    ['2.5', 'invalid-integer'], ['2,5', 'invalid-integer'], ['2.0', 'invalid-integer'],
    ['1e2', 'invalid-integer'], ['0x10', 'invalid-integer'], ['Infinity', 'invalid-integer'],
    ['NaN', 'invalid-integer'], ['2/1', 'invalid-integer'], ['x=2', 'invalid-integer'],
    ['--2', 'invalid-integer'], ['+ 2', 'invalid-integer'], ['2 3', 'invalid-integer'],
    ['9007199254740992', 'unsafe-integer'], ['9'.repeat(400), 'unsafe-integer'],
  ] as const
  const equation = equationFromRoots([2, 5])
  for (const [text, error] of cases) {
    assert.deepEqual(parseRoot(text), { status: 'invalid', error })
    for (const input of [[text, '5'], ['2', text]] as AnswerInput[]) {
      const result = checkAnswer(equation, input)
      assert.equal(result.status, 'invalid')
      assert.equal(result.countsAsIncorrectAttempt, false)
    }
  }
  assert.deepEqual(checkAnswer(equation, ['', 'abc']), {
    status: 'invalid', countsAsIncorrectAttempt: false,
    fields: [{ status: 'invalid', error: 'empty' }, { status: 'invalid', error: 'invalid-integer' }],
  })
})

test('only mathematically incorrect answers count as incorrect attempts', () => {
  const equation = equationFromRoots([2, 5])
  assert.equal(checkAnswer(equation, ['2', '6']).countsAsIncorrectAttempt, true)
  assert.equal(checkAnswer(equation, ['2', '5']).countsAsIncorrectAttempt, false)
  assert.deepEqual(checkAnswer(equation, ['2', '']), {
    status: 'invalid', countsAsIncorrectAttempt: false,
    fields: [{ status: 'valid', value: 2 }, { status: 'invalid', error: 'empty' }],
  })
})

test('checking answers never changes the equation or the input', () => {
  const equation = { p: -7, q: 10, roots: [5, 2] as RootPair }
  const before = structuredClone(equation)
  const input: AnswerInput = ['5', '2']
  checkAnswer(equation, input)
  checkAnswer(equation, ['bad', ''])
  checkAnswer(equation, ['0', '0'])
  assert.deepEqual(equation, before)
  assert.deepEqual(input, ['5', '2'])
})
