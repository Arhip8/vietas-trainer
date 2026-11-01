import type { Difficulty } from './types.ts'

export type RootPattern =
  | 'positive'
  | 'negative'
  | 'mixed'
  | 'distinct'
  | 'zero'
  | 'repeated'

export interface GenerationRule {
  readonly difficulty: Difficulty
  readonly pattern: RootPattern
  /** Inclusive bounds for the magnitude of nonzero roots. */
  readonly minAbs: number
  readonly maxAbs: number
  readonly count: number
}

// Finite pools are intentionally limited to school-sized numbers.
export const MAX_ROOT_MAGNITUDE = 100
export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard']

export const BASE_POINTS: Readonly<Record<Difficulty, number>> = Object.freeze({
  easy: 1,
  medium: 2,
  hard: 3,
})

export const DEFAULT_RULES: readonly GenerationRule[] = Object.freeze(([
  { difficulty: 'easy', pattern: 'positive', minAbs: 1, maxAbs: 6, count: 3 },
  { difficulty: 'medium', pattern: 'negative', minAbs: 1, maxAbs: 9, count: 1 },
  { difficulty: 'medium', pattern: 'mixed', minAbs: 1, maxAbs: 9, count: 2 },
  { difficulty: 'hard', pattern: 'distinct', minAbs: 10, maxAbs: 20, count: 1 },
  { difficulty: 'hard', pattern: 'zero', minAbs: 10, maxAbs: 20, count: 1 },
  { difficulty: 'hard', pattern: 'repeated', minAbs: 10, maxAbs: 20, count: 1 },
] satisfies GenerationRule[]).map((rule) => Object.freeze(rule)))
