/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { equationKey } from '../equations.ts'
import { generateTraining } from '../generator.ts'
import { DEFAULT_RULES } from '../rules.ts'
import type { GenerationRule } from '../rules.ts'

test('default rules array and every rule are frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_RULES))
  for (const rule of DEFAULT_RULES) {
    assert.ok(Object.isFrozen(rule))
  }
})

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

test('100 seeds preserve mathematics, uniqueness, order and all difficulty rules', () => {
  for (let seed = 0; seed < 100; seed++) {
    const tasks = generateTraining(seededRandom(seed))
    assert.equal(tasks.length, 9)
    assert.equal(new Set(tasks.map((task) => task.id)).size, 9)
    assert.equal(new Set(tasks.map((task) => equationKey(task.equation))).size, 9)
    assert.deepEqual(tasks.map((task) => task.difficulty), [
      'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard',
    ])
    for (const { equation: { roots: [a, b], p, q } } of tasks) {
      assert.ok(Number.isSafeInteger(a) && Number.isSafeInteger(b))
      assert.ok(a <= b)
      assert.equal(a + b || 0, -p || 0)
      assert.equal(a * b || 0, q)
      assert.equal(a * a + p * a + q, 0)
      assert.equal(b * b + p * b + q, 0)
      assert.equal(p * p - 4 * q, (a - b) ** 2)
    }
    for (const { equation: { roots: [a, b] } } of tasks.slice(0, 3)) {
      assert.ok(1 <= a && a < b && b <= 6)
    }
    const medium = tasks.slice(3, 6).map((task) => task.equation.roots)
    assert.equal(medium.filter(([, b]) => b < 0).length, 1)
    assert.equal(medium.filter(([a, b]) => a < 0 && b > 0).length, 2)
    for (const roots of medium) {
      assert.ok(roots.every((root) => Math.abs(root) >= 1 && Math.abs(root) <= 9))
      assert.notEqual(roots[0], roots[1])
    }
    const hard = tasks.slice(6).map((task) => task.equation.roots)
    assert.equal(hard.filter(([a, b]) => a === b).length, 1)
    assert.equal(hard.filter(([a, b]) => a === 0 || b === 0).length, 1)
    assert.equal(hard.filter(([a, b]) => a !== b && a !== 0 && b !== 0).length, 1)
    for (const roots of hard) {
      assert.ok(roots.every((root) => root === 0 || (Math.abs(root) >= 10 && Math.abs(root) <= 20)))
    }
  }
})

test('same seed gives same training; different seeds give different trainings', () => {
  assert.deepEqual(generateTraining(seededRandom(42)), generateTraining(seededRandom(42)))
  assert.notDeepEqual(generateTraining(seededRandom(42)), generateTraining(seededRandom(43)))
})

test('constant random sources terminate with unique results, including boundary values', () => {
  for (const value of [0, 1 - Number.EPSILON]) {
    const tasks = generateTraining(() => value)
    assert.equal(new Set(tasks.map((task) => equationKey(task.equation))).size, 9)
  }
  assert.equal(generateTraining().length, 9)
})

test('invalid random values are rejected', () => {
  for (const value of [-0.1, 1, NaN, Infinity]) {
    assert.throws(() => generateTraining(() => value), /Источник случайности/)
  }
})

test('rules are configurable and inputs are not mutated', () => {
  const rules = DEFAULT_RULES.map((rule) => ({ ...rule, minAbs: rule.minAbs + 1 }))
  const before = structuredClone(rules)
  const tasks = generateTraining(seededRandom(8), rules)
  assert.deepEqual(rules, before)
  assert.ok(tasks.slice(0, 3).every((task) => task.equation.roots[0] >= 2))
  assert.ok(Object.isFrozen(tasks))
  assert.ok(tasks.every(Object.isFrozen))
})

test('insufficient candidates produce a clear error instead of retrying forever', () => {
  const rules = DEFAULT_RULES.map((rule) => rule.difficulty === 'easy'
    ? { ...rule, minAbs: 1, maxAbs: 2 } : rule)
  assert.throws(() => generateTraining(() => 0, rules), /Недостаточно уникальных/)
})

test('overlapping pools are reassigned when a valid global allocation exists', () => {
  // Broad pool comes before the narrow pool; a greedy choice would consume it.
  const rules: readonly GenerationRule[] = [
    { difficulty: 'easy', pattern: 'positive', minAbs: 1, maxAbs: 4, count: 2 },
    { difficulty: 'easy', pattern: 'positive', minAbs: 1, maxAbs: 2, count: 1 },
    ...DEFAULT_RULES.filter((rule) => rule.difficulty !== 'easy'),
  ]
  const tasks = generateTraining(() => 1 - Number.EPSILON, rules)
  assert.equal(new Set(tasks.map((task) => equationKey(task.equation))).size, 9)
  assert.ok(tasks.some((task) => task.equation.p === -3 && task.equation.q === 2))
})

test('global shortage is detected even when every individual pool is large enough', () => {
  const rules: readonly GenerationRule[] = ['easy', 'medium', 'hard'].map((difficulty) => ({
    difficulty: difficulty as GenerationRule['difficulty'],
    pattern: 'positive', minAbs: 1, maxAbs: 4, count: 3,
  }))
  assert.throws(() => generateTraining(() => 0, rules), /Недостаточно уникальных/)
})

test('invalid rules and incorrect difficulty counts are rejected', () => {
  for (const change of [
    { minAbs: 0 }, { maxAbs: 101 }, { minAbs: 8, maxAbs: 6 },
    { minAbs: 1.5 }, { maxAbs: Infinity }, { count: 0 }, { count: 1.5 },
  ]) {
    const rules = DEFAULT_RULES.map((rule, i) => i === 0 ? { ...rule, ...change } : rule)
    assert.throws(() => generateTraining(() => 0, rules), /Некорректное правило/)
  }
  assert.throws(() => generateTraining(() => 0, []), /ровно 3/)
  assert.throws(() => generateTraining(() => 0, DEFAULT_RULES.slice(1)), /ровно 3/)
})
