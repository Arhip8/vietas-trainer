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

export type AnswerInput = readonly [string, string]

export type FieldValidation =
  | { readonly status: 'valid'; readonly value: number }
  | { readonly status: 'invalid'; readonly error: 'empty' | 'invalid-integer' | 'unsafe-integer' }

export type AnswerCheckResult =
  | {
    readonly status: 'invalid'
    readonly fields: readonly [FieldValidation, FieldValidation]
    readonly countsAsIncorrectAttempt: false
  }
  | {
    readonly status: 'incorrect'
    readonly roots: RootPair
    readonly countsAsIncorrectAttempt: true
  }
  | {
    readonly status: 'correct'
    readonly roots: RootPair
    readonly countsAsIncorrectAttempt: false
  }

export interface AnswerAssistance {
  readonly hintUsed: boolean
  readonly solutionViewed: boolean
}

export interface TrainingTask {
  readonly task: Task
  readonly status: 'open' | 'solved' | 'solution-viewed'
  readonly incorrectAttempts: number
  readonly hintUsed: boolean
  readonly points: number
  readonly input: AnswerInput
  readonly lastCheck: AnswerCheckResult | null
}

export interface TrainingState {
  readonly id: string
  readonly status: 'active' | 'completed'
  readonly currentIndex: number
  readonly tasks: readonly TrainingTask[]
}

/** Both identifiers are required, including for navigation and input edits. */
export type TrainingAction = {
  readonly trainingId: string
  readonly taskId: string
} & (
  | { readonly type: 'set-input'; readonly input: AnswerInput }
  | { readonly type: 'check-answer' }
  | { readonly type: 'request-hint' }
  | { readonly type: 'view-solution' }
  | { readonly type: 'next-task' }
)
