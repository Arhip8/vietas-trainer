/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { equationFromRoots, equationKey } from '../equations.ts'
import type { RootPair } from '../types.ts'

test('Vieta formulas cover positive, negative, mixed, repeated and zero roots', () => {
  const cases: readonly (readonly [RootPair, number, number])[] = [
    [[2, 5], -7, 10], [[-3, -7], 10, 21], [[-4, 6], -2, -24],
    [[4, 4], -8, 16], [[-4, -4], 8, 16], [[0, 12], -12, 0],
    [[-12, 0], 12, 0], [[-5, 5], 0, -25], [[0, 0], 0, 0],
  ]
  for (const [roots, p, q] of cases) {
    const equation = equationFromRoots(roots)
    assert.equal(equation.p, p)
    assert.equal(equation.q, q)
    for (const root of roots) assert.equal(root ** 2 + p * root + q, 0)
    assert.equal(p ** 2 - 4 * q, (roots[0] - roots[1]) ** 2)
  }
})

test('root order does not affect identity; inputs and results stay immutable', () => {
  const roots: RootPair = [5, 2]
  const equation = equationFromRoots(roots)
  assert.deepEqual(roots, [5, 2])
  assert.deepEqual(equation.roots, [2, 5])
  assert.equal(equationKey(equation), equationKey(equationFromRoots([2, 5])))
  assert.ok(Object.isFrozen(equation))
  assert.ok(Object.isFrozen(equation.roots))
  assert.notEqual(equationKey(equation), equationKey(equationFromRoots([2, 6])))
})

test('negative zero is normalized', () => {
  const equation = equationFromRoots([-0, 0])
  assert.equal(equation.p, 0)
  assert.equal(equation.q, 0)
  assert.deepEqual(equation.roots, [0, 0])
})

test('invalid roots and unsafe coefficients are rejected', () => {
  for (const value of [0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => equationFromRoots([value, 1]), /целыми/)
  }
  assert.throws(() => equationFromRoots([Number.MAX_SAFE_INTEGER, 1]), /Коэффициенты/)
  assert.throws(() => equationFromRoots([100_000_000, 100_000_000]), /Коэффициенты/)
})
