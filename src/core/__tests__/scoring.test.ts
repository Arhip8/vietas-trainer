/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAnswer } from '../answers.ts'
import { equationFromRoots } from '../equations.ts'
import { generateTraining } from '../generator.ts'
import { calculateScore } from '../scoring.ts'
import type { Difficulty } from '../types.ts'

const equation = equationFromRoots([2, 5])
const correct = checkAnswer(equation, ['2', '5'])
const incorrect = checkAnswer(equation, ['2', '6'])
const invalid = checkAnswer(equation, ['', 'abc'])
const cases: readonly (readonly [Difficulty, number])[] = [['easy', 1], ['medium', 2], ['hard', 3]]

test('all difficulties award full points without hints and half points with hints', () => {
  for (const [difficulty, points] of cases) {
    assert.equal(calculateScore(difficulty, correct), points)
    assert.equal(calculateScore(difficulty, correct, { hintUsed: true, solutionViewed: false }), points / 2)
  }
})

test('incorrect and invalid answers award zero points with any assistance', () => {
  for (const [difficulty] of cases) {
    for (const hintUsed of [false, true]) {
      for (const solutionViewed of [false, true]) {
        for (const result of [invalid, incorrect]) {
          assert.equal(calculateScore(difficulty, result, { hintUsed, solutionViewed }), 0)
        }
      }
    }
  }
})

test('viewing the solution overrides a correct answer and any hint usage', () => {
  for (const [difficulty] of cases) {
    for (const hintUsed of [false, true]) {
      assert.equal(calculateScore(difficulty, correct, { hintUsed, solutionViewed: true }), 0)
    }
  }
})

test('several incorrect attempts do not reduce a subsequent correct score', () => {
  for (const [difficulty, points] of cases) {
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal(calculateScore(difficulty, incorrect), 0)
    }
    assert.equal(calculateScore(difficulty, correct), points)
    assert.equal(calculateScore(difficulty, correct, { hintUsed: true, solutionViewed: false }), points / 2)
  }
})

test('repeated calls with hints return the same score and do not mutate arguments', () => {
  const assistance = Object.freeze({ hintUsed: true, solutionViewed: false })
  const before = structuredClone(correct)
  for (const [difficulty, points] of cases) {
    for (let hint = 0; hint < 5; hint++) {
      assert.equal(calculateScore(difficulty, correct, assistance), points / 2)
    }
  }
  assert.deepEqual(correct, before)
  assert.deepEqual(assistance, { hintUsed: true, solutionViewed: false })
})

test('generated training totals 18 points without hints and 9 points with hints', () => {
  const tasks = generateTraining(() => 0)
  for (const hintUsed of [false, true]) {
    const total = tasks.reduce((sum, task) => {
      const [a, b] = task.equation.roots
      const result = checkAnswer(task.equation, [String(b), String(a)])
      return sum + calculateScore(task.difficulty, result, { hintUsed, solutionViewed: false })
    }, 0)
    assert.equal(total, hintUsed ? 9 : 18)
  }
})
