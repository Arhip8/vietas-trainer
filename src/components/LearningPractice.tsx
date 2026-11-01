import { useEffect, useRef } from 'react'
import type { PracticeAction, PracticeState } from '../learning/practice.ts'
import { equationText, number } from '../presentation.ts'

const steps = { sum: '1. Сумма корней', product: '2. Произведение корней', roots: '3. Поиск корней' }
const levels = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' }

export function LearningPractice({ state, onAction, onStartTest, onHome }: {
  state: PracticeState
  onAction: (action: PracticeAction) => void
  onStartTest: () => void
  onHome: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const completed = state.phase === 'completed'
  useEffect(() => { heading.current?.focus() }, [state.currentIndex, state.step, completed])
  const task = state.tasks[state.currentIndex]
  const { p, q, roots: [a, b] } = task.equation
  const locked = state.phase !== 'answering' || state.feedback === 'correct'
  const send = (type: 'check' | 'hint' | 'solution' | 'next-step' | 'next-task') => {
    onAction({ type, taskId: task.id, step: state.step })
  }
  const explanation = state.step === 'sum'
    ? `Сумма корней равна −p. Здесь p = ${number(p)}, поэтому x₁ + x₂ = ${number(-p || 0)}.`
    : state.step === 'product'
      ? `Произведение корней равно свободному члену q = ${number(q)}. Его знак менять не нужно.`
      : `Числа ${number(a)} и ${number(b)} имеют нужную сумму ${number(-p || 0)} и произведение ${number(q)}.`

  if (state.phase === 'completed') return (
    <section className="card" aria-labelledby="learning-heading">
      <span className="eyebrow">Три задания пройдены</span>
      <h2 id="learning-heading" ref={heading} tabIndex={-1}>Обучающая практика завершена!</h2>
      <p className="intro">Ты прошёл три шага: найти сумму, найти произведение и подобрать корни. Теперь попробуй решить уравнения самостоятельно.</p>
      <div className="theory-navigation">
        <button type="button" className="secondary" onClick={onHome}>На главную</button>
        <button type="button" className="primary" onClick={onStartTest}>Проверить знания</button>
      </div>
    </section>
  )
  return (
    <section className="card" aria-labelledby="learning-heading">
      <div className="section-top"><span className={`badge ${task.difficulty}`}>{levels[task.difficulty]} уровень</span><span>Задание {state.currentIndex + 1} из {state.tasks.length}</span></div>
      <span className="eyebrow">Практика с обучением · без баллов</span>
      <h2 id="learning-heading" ref={heading} tabIndex={-1}>{steps[state.step]}</h2>
      <p className="equation">{equationText(task.equation)}</p>
      <p className="muted">{state.step === 'sum' ? 'Чему равна сумма двух корней?' : state.step === 'product' ? 'Чему равно произведение двух корней?' : 'Подбери два целых корня. Порядок не важен; совпадающие корни введи дважды.'}</p>
      <form className="learning-form" noValidate onSubmit={(event) => { event.preventDefault(); send('check') }}>
        <div className={state.step === 'roots' ? 'root-fields' : ''}>
          {(state.step === 'roots' ? [0, 1] as const : [0] as const).map((index) => (
            <div key={`${state.step}-${index}`}>
              <label htmlFor={`learning-input-${index}`}>{state.step === 'roots' ? `Корень x${index === 0 ? '₁' : '₂'}` : state.step === 'sum' ? 'Сумма корней' : 'Произведение корней'}</label>
              <input id={`learning-input-${index}`} type="text" autoComplete="off" spellCheck={false} disabled={locked}
                value={state.input[index]} aria-invalid={state.feedback === 'invalid'} aria-describedby="learning-feedback"
                onChange={(event) => {
                  const input: [string, string] = [...state.input]
                  input[index] = event.target.value
                  onAction({ type: 'input', input, taskId: task.id, step: state.step })
                }} />
            </div>
          ))}
        </div>
        <div id="learning-feedback" className="feedback" role="status" aria-live="polite" aria-atomic="true">
          {state.feedback === 'invalid' && <p className="notice error">Заполни поля целыми числами, например −3 или 0. Дроби и буквы не подходят. Это ошибка записи, а не решения.</p>}
          {state.feedback === 'incorrect' && !state.solutionViewed && <p className="notice error">Пока неверно. {state.step === 'sum' ? 'Проверь знак коэффициента при x: для суммы он меняется на противоположный.' : state.step === 'product' ? 'Найди свободный член — число без x. Его знак сохраняется.' : 'Проверь и сумму, и произведение выбранных чисел.'} Можно пробовать сколько угодно.</p>}
          {state.feedback === 'correct' && <p className="notice success">Верно! {explanation}</p>}
        </div>
        {!locked && <button type="submit" className="primary full">Проверить шаг</button>}
      </form>
      {state.phase === 'answering' && state.feedback === 'correct' && <button type="button" className="primary full next" onClick={() => send('next-step')}>К следующему этапу →</button>}
      {!locked && <div className="help-actions">
        <button type="button" className="secondary" onClick={() => send('hint')} disabled={state.hintShown}>Подсказка без штрафа</button>
        <button type="button" className="text-button" onClick={() => send('solution')}>Показать полное решение</button>
      </div>}
      {state.hintShown && <aside className="notice hint" aria-label="Подсказка">
        <h3>Как рассуждать</h3>
        <p>{state.step === 'sum' ? 'В уравнении x² + px + q = 0 сумма корней равна −p. Выпиши коэффициент при x вместе со знаком и возьми противоположное число.' : state.step === 'product' ? 'Произведение корней равно q — числу без x. Если свободного члена нет, он равен нулю.' : 'Перебери пары множителей свободного члена и проверь их сумму. При отрицательном произведении знаки разные; при положительном — одинаковые. Нулевое произведение означает хотя бы один нулевой корень. Одинаковые корни тоже возможны.'}</p>
      </aside>}
      {state.phase === 'task-complete' && <>
        <aside className="notice solution" aria-label="Разбор решения">
          <h3>{state.solutionViewed ? 'Полное решение' : 'Почему это работает'}</h3>
          <p>По теореме Виета: x₁ + x₂ = −p = {number(-p || 0)}, x₁ · x₂ = q = {number(q)}.</p>
          <p>Подходят числа {number(a)} и {number(b)}: ({number(a)}) + ({number(b)}) = {number(-p || 0)}, ({number(a)}) · ({number(b)}) = {number(q)}.</p>
          <p><strong>Ответ: x₁ = {number(a)}, x₂ = {number(b)}.</strong></p>
          {a === b && <p>Корни совпадают: в формулах одно и то же число учитывается дважды.</p>}
        </aside>
        <button type="button" className="primary full next" onClick={() => send('next-task')}>{state.currentIndex === state.tasks.length - 1 ? 'Завершить обучение' : 'Следующее задание →'}</button>
      </>}
      <p className="muted small optional-theory">Здесь нет баллов и ограничений на ошибки. Подсказки помогают учиться.</p>
    </section>
  )
}
