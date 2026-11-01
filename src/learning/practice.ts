import { checkAnswer, parseRoot } from '../core/answers.ts'
import { generateTraining } from '../core/generator.ts'
import { DIFFICULTY_ORDER } from '../core/rules.ts'
import type { AnswerInput, Equation, RandomSource, Task } from '../core/types.ts'

export type LearningStep = 'sum' | 'product' | 'roots'
export type LearningFeedback = 'correct' | 'incorrect' | 'invalid'
export interface PracticeState {
  readonly tasks: readonly Task[]
  readonly currentIndex: number
  readonly step: LearningStep
  readonly phase: 'answering' | 'task-complete' | 'completed'
  readonly input: AnswerInput
  readonly feedback: LearningFeedback | null
  readonly hintShown: boolean
  readonly solutionViewed: boolean
}
export type PracticeAction = { readonly taskId: string; readonly step: LearningStep } & (
  | { readonly type: 'input'; readonly input: AnswerInput }
  | { readonly type: 'check' | 'hint' | 'solution' | 'next-step' | 'next-task' }
)

export function checkCoefficientAnswer(equation: Equation, step: 'sum' | 'product', input: string): LearningFeedback {
  const parsed = parseRoot(input)
  if (parsed.status === 'invalid') return 'invalid'
  const expected = step === 'sum' ? -equation.p : equation.q
  return parsed.value === expected ? 'correct' : 'incorrect'
}

export function createPractice(random: RandomSource = Math.random): PracticeState {
  const generated = generateTraining(random)
  // A repeated-root example adds a new concept after positive and negative roots.
  const tasks = DIFFICULTY_ORDER.map((difficulty) => generated.find((task) =>
    task.difficulty === difficulty && (difficulty !== 'hard' || task.equation.roots[0] === task.equation.roots[1]),
  )!)
  return {
    tasks, currentIndex: 0, step: 'sum', phase: 'answering', input: ['', ''],
    feedback: null, hintShown: false, solutionViewed: false,
  }
}

/** Learning-only transitions: no points, penalties or attempt limits. */
export function updatePractice(state: PracticeState, action: PracticeAction): PracticeState {
  const current = state.tasks[state.currentIndex]
  if (state.phase === 'completed' || action.taskId !== current.id || action.step !== state.step) return state
  if (action.type === 'next-task') {
    if (state.phase !== 'task-complete') return state
    if (state.currentIndex === state.tasks.length - 1) return { ...state, phase: 'completed' }
    return {
      ...state, currentIndex: state.currentIndex + 1, step: 'sum', phase: 'answering',
      input: ['', ''], feedback: null, hintShown: false, solutionViewed: false,
    }
  }
  if (state.phase !== 'answering') return state
  if (action.type === 'solution') return { ...state, phase: 'task-complete', solutionViewed: true, feedback: null }
  if (action.type === 'hint') return { ...state, hintShown: true }
  if (action.type === 'next-step') {
    if (state.feedback !== 'correct' || state.step === 'roots') return state
    return {
      ...state, step: state.step === 'sum' ? 'product' : 'roots', input: ['', ''],
      feedback: null, hintShown: false,
    }
  }
  // A correct step remains visible and cannot be edited until the learner continues.
  if (state.feedback === 'correct') return state
  if (action.type === 'input') return { ...state, input: [...action.input], feedback: null }
  if (action.type === 'check') {
    const feedback = state.step === 'roots'
      ? checkAnswer(current.equation, state.input).status
      : checkCoefficientAnswer(current.equation, state.step, state.input[0])
    return {
      ...state, feedback,
      phase: feedback === 'correct' && state.step === 'roots' ? 'task-complete' : 'answering',
    }
  }
  return state
}
