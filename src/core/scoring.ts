import { BASE_POINTS } from './rules.ts'
import type { AnswerAssistance, AnswerCheckResult, Difficulty } from './types.ts'

/**
 * Returns the score for one answer, not an increment to an accumulated total.
 * Attempts do not affect the score. A hint flag represents one or many hints.
 * Half-integer points (0.5, 1, 1.5) are represented exactly by JavaScript numbers.
 */
export function calculateScore(
  difficulty: Difficulty,
  answer: AnswerCheckResult,
  assistance: AnswerAssistance = { hintUsed: false, solutionViewed: false },
): number {
  if (assistance.solutionViewed || answer.status !== 'correct') return 0
  return BASE_POINTS[difficulty] * (assistance.hintUsed ? 0.5 : 1)
}
