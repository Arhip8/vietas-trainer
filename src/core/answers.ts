import type { AnswerCheckResult, AnswerInput, Equation, FieldValidation, RootPair } from './types.ts'

/** Accepts decimal integers, optional sign, surrounding whitespace and Unicode minus. */
export function parseRoot(input: string): FieldValidation {
  const text = input.trim().replace(/^−/, '-')
  if (text === '') return { status: 'invalid', error: 'empty' }
  if (!/^[+-]?[0-9]+$/.test(text)) {
    return { status: 'invalid', error: 'invalid-integer' }
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value)) {
    return { status: 'invalid', error: 'unsafe-integer' }
  }
  return { status: 'valid', value: value === 0 ? 0 : value }
}

/** Pure check: never changes the equation or counts attempts itself. */
export function checkAnswer(equation: Equation, input: AnswerInput): AnswerCheckResult {
  const first = parseRoot(input[0])
  const second = parseRoot(input[1])
  if (first.status === 'invalid' || second.status === 'invalid') {
    return {
      status: 'invalid', fields: [first, second], countsAsIncorrectAttempt: false,
    }
  }

  const roots: RootPair = [first.value, second.value]
  const [a, b] = equation.roots
  const correct = (roots[0] === a && roots[1] === b)
    || (roots[0] === b && roots[1] === a)
  return correct
    ? { status: 'correct', roots, countsAsIncorrectAttempt: false }
    : { status: 'incorrect', roots, countsAsIncorrectAttempt: true }
}
