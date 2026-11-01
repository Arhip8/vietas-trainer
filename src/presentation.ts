import type { Equation } from './core/types.ts'

export const number = (value: number) => value.toLocaleString('ru-RU')

/** Presentation only: coefficients come from the mathematical core. */
export function equationText({ p, q }: Equation): string {
  const linear = p === 0 ? '' : ` ${p < 0 ? '−' : '+'} ${Math.abs(p) === 1 ? '' : Math.abs(p)}x`
  const constant = q === 0 ? '' : ` ${q < 0 ? '−' : '+'} ${Math.abs(q)}`
  return `x²${linear}${constant} = 0`
}
