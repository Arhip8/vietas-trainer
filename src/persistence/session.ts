import { checkAnswer } from '../core/answers.ts'
import { equationFromRoots, equationKey } from '../core/equations.ts'
import { calculateScore } from '../core/scoring.ts'
import { MAX_ROOT_MAGNITUDE } from '../core/rules.ts'
import type { Task, TrainingState } from '../core/types.ts'
import { checkCoefficientAnswer } from '../learning/practice.ts'
import type { PracticeState } from '../learning/practice.ts'

export const SESSION_KEY = 'vietas-trainer.active-session'
export const SESSION_VERSION = 1
export type SavedSession =
  | { readonly version: 1; readonly id: string; readonly mode: 'training'; readonly state: TrainingState; readonly showResults: boolean }
  | { readonly version: 1; readonly id: string; readonly mode: 'practice'; readonly state: PracticeState }
export interface StoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export type StorageError = 'unavailable' | 'invalid' | 'conflict' | null
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const input = (value: unknown): value is [string, string] => Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'string')
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => same(item, b[i]))
  if (!record(a) || !record(b)) return false
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
}
function validTask(value: unknown): value is Task {
  if (!record(value) || !id(value.id) || !['easy', 'medium', 'hard'].includes(String(value.difficulty)) || !record(value.equation)) return false
  const equation = value.equation
  if (!Array.isArray(equation.roots) || equation.roots.length !== 2 || !equation.roots.every(integer)) return false
  const [a, b] = equation.roots
  if (Math.abs(a) > MAX_ROOT_MAGNITUDE || Math.abs(b) > MAX_ROOT_MAGNITUDE) return false
  const expected = equationFromRoots([a, b])
  return equation.p === expected.p && equation.q === expected.q
}
function uniqueTasks(tasks: readonly Task[]): boolean {
  return new Set(tasks.map((task) => task.id)).size === tasks.length
    && new Set(tasks.map((task) => equationKey(task.equation))).size === tasks.length
}

function validTraining(value: unknown): value is TrainingState {
  if (!record(value) || !id(value.id) || !['active', 'completed'].includes(String(value.status))
    || !integer(value.currentIndex) || value.currentIndex < 0 || value.currentIndex > 8
    || !Array.isArray(value.tasks) || value.tasks.length !== 9) return false
  const tasks: Task[] = []
  for (let index = 0; index < value.tasks.length; index++) {
    const item: unknown = value.tasks[index]
    if (!record(item) || !validTask(item.task) || !input(item.input)
      || !integer(item.incorrectAttempts) || item.incorrectAttempts < 0 || typeof item.hintUsed !== 'boolean'
      || !['open', 'solved', 'solution-viewed'].includes(String(item.status))) return false
    if (item.task.difficulty !== (index < 3 ? 'easy' : index < 6 ? 'medium' : 'hard')) return false
    tasks.push(item.task)
    const checked = checkAnswer(item.task.equation, item.input)
    if (item.lastCheck !== null && !same(item.lastCheck, checked)) return false
    if (item.status === 'solved') {
      if (checked.status !== 'correct' || item.lastCheck === null || item.points !== calculateScore(item.task.difficulty, checked, { hintUsed: item.hintUsed, solutionViewed: false })) return false
    } else {
      if (item.points !== 0 || (item.lastCheck !== null && checked.status === 'correct')) return false
    }
    if (index < value.currentIndex && item.status === 'open') return false
    if (index > value.currentIndex && (item.status !== 'open' || item.points !== 0 || item.incorrectAttempts !== 0 || item.hintUsed || item.lastCheck !== null || item.input.some((text) => text !== ''))) return false
  }
  if (!uniqueTasks(tasks)) return false
  const last = value.tasks[value.currentIndex]
  const finished = value.currentIndex === 8 && last.status !== 'open'
  return (value.status === 'completed') === finished
}

function validPractice(value: unknown): value is PracticeState {
  if (!record(value) || !Array.isArray(value.tasks) || value.tasks.length !== 3
    || !value.tasks.every(validTask) || !uniqueTasks(value.tasks)
    || !integer(value.currentIndex) || value.currentIndex < 0 || value.currentIndex > 2
    || !['sum', 'product', 'roots'].includes(String(value.step))
    || !['answering', 'task-complete', 'completed'].includes(String(value.phase))
    || !input(value.input) || typeof value.hintShown !== 'boolean' || typeof value.solutionViewed !== 'boolean'
    || ![null, 'correct', 'incorrect', 'invalid'].includes(value.feedback as string | null)) return false
  if (value.tasks.some((task, i) => task.difficulty !== ['easy', 'medium', 'hard'][i])) return false
  if (value.phase === 'completed' && value.currentIndex !== 2) return false
  if (value.solutionViewed) return value.phase !== 'answering' && value.feedback === null
  const expected = value.step === 'roots'
    ? checkAnswer(value.tasks[value.currentIndex].equation, value.input).status
    : checkCoefficientAnswer(value.tasks[value.currentIndex].equation, value.step as 'sum' | 'product', value.input[0])
  if (value.feedback !== null && value.feedback !== expected) return false
  if (value.phase !== 'answering') return value.step === 'roots' && value.feedback === 'correct'
  return !(value.step === 'roots' && value.feedback === 'correct')
}

export function decodeSession(raw: string): SavedSession | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value) || value.version !== SESSION_VERSION || !id(value.id)) return null
    if (value.mode === 'training' && validTraining(value.state) && value.state.id === value.id
      && typeof value.showResults === 'boolean' && (!value.showResults || value.state.status === 'completed')) {
      return value as SavedSession
    }
    if (value.mode === 'practice' && validPractice(value.state)) return value as SavedSession
    return null
  } catch {
    return null
  }
}

/** One key and an ownership check prevent an older tab from overwriting a new session. */
export function createSessionStorage(getStorage: () => StoragePort) {
  let expected: string | null | undefined
  return {
    load(): { session: SavedSession | null; error: StorageError } {
      try {
        const raw = getStorage().getItem(SESSION_KEY)
        expected = raw
        if (raw === null) return { session: null, error: null }
        const session = decodeSession(raw)
        return { session, error: session ? null : 'invalid' }
      } catch {
        return { session: null, error: 'unavailable' }
      }
    },
    save(session: SavedSession | null, replace = false): StorageError {
      try {
        const storage = getStorage()
        const current = storage.getItem(SESSION_KEY)
        if (!replace && current !== expected) return 'conflict'
        const raw = session === null ? null : JSON.stringify(session)
        // A failed new-session write must not leave an older session to restore.
        if (replace && current !== null && current !== raw) {
          storage.removeItem(SESSION_KEY)
          expected = null
        }
        if (raw === null) storage.removeItem(SESSION_KEY)
        else storage.setItem(SESSION_KEY, raw)
        if (storage.getItem(SESSION_KEY) !== raw) return 'conflict'
        expected = raw
        return null
      } catch {
        return 'unavailable'
      }
    },
  }
}
