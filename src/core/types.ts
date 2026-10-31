export type Difficulty = 'easy' | 'medium' | 'hard'

export type RootPair = readonly [number, number]

export interface Equation {
  readonly p: number
  readonly q: number
  readonly roots: RootPair
}

export interface Task {
  readonly id: string
  readonly difficulty: Difficulty
  readonly equation: Equation
}

/** Returns a finite number in [0, 1). */
export type RandomSource = () => number
