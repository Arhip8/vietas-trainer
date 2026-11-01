import { checkAnswer } from './answers.ts'
import { generateTraining } from './generator.ts'
import { calculateScore } from './scoring.ts'
import type { RandomSource, TrainingAction, TrainingState, TrainingTask } from './types.ts'

/** The caller supplies a new unique ID for each training, including restarts. */
export function createTraining(id: string, random: RandomSource = Math.random): TrainingState {
  if (!id.trim()) throw new Error('Идентификатор тренировки не должен быть пустым.')
  return {
    id,
    status: 'active',
    currentIndex: 0,
    tasks: generateTraining(random).map((task) => ({
      task,
      status: 'open',
      incorrectAttempts: 0,
      hintUsed: false,
      points: 0,
      input: ['', ''],
      lastCheck: null,
    })),
  }
}

function replaceCurrent(state: TrainingState, current: TrainingTask): TrainingState {
  const completed = state.currentIndex === state.tasks.length - 1 && current.status !== 'open'
  return {
    ...state,
    status: completed ? 'completed' : 'active',
    tasks: state.tasks.map((task, index) => index === state.currentIndex ? current : task),
  }
}

/** Pure state transition. Rejected or redundant actions return the original state. */
export function updateTraining(state: TrainingState, action: TrainingAction): TrainingState {
  if (state.status === 'completed' || action.trainingId !== state.id) return state
  const current = state.tasks[state.currentIndex]
  if (!current || action.taskId !== current.task.id) return state

  if (action.type === 'next-task') {
    if (current.status === 'open' || state.currentIndex >= state.tasks.length - 1) return state
    return { ...state, currentIndex: state.currentIndex + 1 }
  }
  if (current.status !== 'open') return state

  switch (action.type) {
    case 'set-input':
      return replaceCurrent(state, {
        ...current,
        input: [action.input[0], action.input[1]],
        lastCheck: null,
      })
    case 'request-hint':
      return current.hintUsed ? state : replaceCurrent(state, { ...current, hintUsed: true })
    case 'view-solution':
      return replaceCurrent(state, { ...current, status: 'solution-viewed', points: 0 })
    case 'check-answer': {
      const result = checkAnswer(current.task.equation, current.input)
      return replaceCurrent(state, {
        ...current,
        lastCheck: result,
        incorrectAttempts: current.incorrectAttempts + (result.countsAsIncorrectAttempt ? 1 : 0),
        status: result.status === 'correct' ? 'solved' : 'open',
        points: calculateScore(current.task.difficulty, result, {
          hintUsed: current.hintUsed,
          solutionViewed: false,
        }),
      })
    }
  }
}

/** Derived from individual task results; never stored as a mutable counter. */
export function getTotalPoints(state: TrainingState): number {
  return state.tasks.reduce((total, task) => total + task.points, 0)
}
