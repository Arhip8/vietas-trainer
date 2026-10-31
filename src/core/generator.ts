import { equationFromRoots, equationKey } from './equations.ts'
import { DEFAULT_RULES, DIFFICULTY_ORDER, MAX_ROOT_MAGNITUDE } from './rules.ts'
import type { GenerationRule, RootPattern } from './rules.ts'
import type { Equation, RandomSource, Task } from './types.ts'

const patterns: readonly RootPattern[] = [
  'positive', 'negative', 'mixed', 'distinct', 'zero', 'repeated',
]

function validateRules(rules: readonly GenerationRule[]): void {
  for (const rule of rules) {
    if (!DIFFICULTY_ORDER.includes(rule.difficulty) || !patterns.includes(rule.pattern)
      || !Number.isSafeInteger(rule.count) || rule.count < 1
      || !Number.isSafeInteger(rule.minAbs) || !Number.isSafeInteger(rule.maxAbs)
      || rule.minAbs < 1 || rule.maxAbs < rule.minAbs
      || rule.maxAbs > MAX_ROOT_MAGNITUDE) {
      throw new Error(`Некорректное правило генерации: модули корней должны быть от 1 до ${MAX_ROOT_MAGNITUDE}, количество — положительным целым.`)
    }
  }
  for (const difficulty of DIFFICULTY_ORDER) {
    if (rules.filter((rule) => rule.difficulty === difficulty)
      .reduce((sum, rule) => sum + rule.count, 0) !== 3) {
      throw new Error(`Для уровня ${difficulty} требуется ровно 3 задания.`)
    }
  }
}

function matches(first: number, second: number, pattern: RootPattern): boolean {
  switch (pattern) {
    case 'positive': return first > 0 && second > first
    case 'negative': return first < second && second < 0
    case 'mixed': return first < 0 && second > 0
    case 'distinct': return first !== 0 && second !== 0 && first < second
    case 'zero': return (first === 0) !== (second === 0)
    case 'repeated': return first === second && first !== 0
  }
}

function candidates(rule: GenerationRule): Equation[] {
  const values: number[] = []
  for (let root = -rule.maxAbs; root <= rule.maxAbs; root++) {
    if (Math.abs(root) >= rule.minAbs || (root === 0 && rule.pattern === 'zero')) {
      values.push(root)
    }
  }
  const result: Equation[] = []
  for (let i = 0; i < values.length; i++) {
    for (let j = i; j < values.length; j++) {
      if (matches(values[i], values[j], rule.pattern)) {
        result.push(equationFromRoots([values[i], values[j]]))
      }
    }
  }
  return result
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('Источник случайности должен возвращать число от 0 включительно до 1 не включительно.')
    }
    const j = Math.floor(value * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Generates exactly nine tasks. Inputs and rules are never mutated. */
export function generateTraining(
  random: RandomSource = Math.random,
  rules: readonly GenerationRule[] = DEFAULT_RULES,
): readonly Task[] {
  validateRules(rules)
  const slots = DIFFICULTY_ORDER.flatMap((difficulty) =>
    rules.filter((rule) => rule.difficulty === difficulty).flatMap((rule) => {
      const pool = candidates(rule)
      return Array.from({ length: rule.count }, () => ({
        difficulty, pool: shuffle(pool, random),
      }))
    }),
  )

  // Bipartite matching: reassign earlier choices if custom pools overlap.
  // Each search visits an equation at most once, so failure always terminates.
  const owners = new Map<string, number>()
  const selected = new Map<number, Equation>()
  function assign(slot: number, visited: Set<string>): boolean {
    for (const equation of slots[slot].pool) {
      const key = equationKey(equation)
      if (visited.has(key)) continue
      visited.add(key)
      const owner = owners.get(key)
      if (owner === undefined || assign(owner, visited)) {
        owners.set(key, slot)
        selected.set(slot, equation)
        return true
      }
    }
    return false
  }
  for (let slot = 0; slot < slots.length; slot++) {
    if (!assign(slot, new Set())) {
      throw new Error('Недостаточно уникальных уравнений для тренировки из 9 заданий. Проверьте диапазоны и пересечение правил.')
    }
  }

  return Object.freeze(DIFFICULTY_ORDER.flatMap((difficulty) => {
    const equations = slots.flatMap((slot, index) =>
      slot.difficulty === difficulty ? [selected.get(index)!] : [],
    )
    return shuffle(equations, random).map((equation, index) => Object.freeze({
      id: `${difficulty}-${index + 1}`,
      difficulty,
      equation,
    }))
  }))
}
