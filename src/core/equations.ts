import type { Equation, RootPair } from './types.ts'

/** Constructs x² + px + q = 0 using Vieta's formulas. */
export function equationFromRoots(roots: RootPair): Equation {
  if (!roots.every(Number.isSafeInteger)) {
    throw new Error('Корни должны быть безопасными целыми числами.')
  }

  const [first, second] = roots
  const p = -(first + second)
  const q = first * second
  if (!Number.isSafeInteger(p) || !Number.isSafeInteger(q)) {
    throw new Error('Коэффициенты выходят за безопасный целочисленный диапазон.')
  }

  return Object.freeze({
    p: p === 0 ? 0 : p,
    q: q === 0 ? 0 : q,
    roots: Object.freeze([
      Math.min(first, second) || 0,
      Math.max(first, second) || 0,
    ]) as RootPair,
  })
}

export function equationKey(equation: Pick<Equation, 'p' | 'q'>): string {
  return `${equation.p}:${equation.q}`
}
