import { useEffect, useRef, useState } from 'react'
import { Theory } from './components/Theory.tsx'
import { BASE_POINTS, DEFAULT_RULES } from './core/rules.ts'
import { createTraining, getTotalPoints, updateTraining } from './core/training.ts'
import type { Difficulty, Equation, FieldValidation, TrainingAction, TrainingState } from './core/types.ts'
import './App.css'

const LEVELS: Record<Difficulty, string> = {
  easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный',
}
const MAX_POINTS = DEFAULT_RULES.reduce((sum, rule) => sum + rule.count * BASE_POINTS[rule.difficulty], 0)
const TASK_COUNT = DEFAULT_RULES.reduce((sum, rule) => sum + rule.count, 0)
const number = (value: number) => value.toLocaleString('ru-RU')

// Presentation only: coefficients and roots come from the core.
function equationText({ p, q }: Equation): string {
  const linear = p === 0 ? '' : ` ${p < 0 ? '−' : '+'} ${Math.abs(p) === 1 ? '' : Math.abs(p)}x`
  const constant = q === 0 ? '' : ` ${q < 0 ? '−' : '+'} ${Math.abs(q)}`
  return `x²${linear}${constant} = 0`
}

function fieldError(field: FieldValidation | undefined): string | null {
  if (!field || field.status === 'valid') return null
  switch (field.error) {
    case 'empty': return 'Введите корень.'
    case 'invalid-integer': return 'Введите целое число, например −3 или 0.'
    case 'unsafe-integer': return 'Число слишком большое. Проверьте запись.'
  }
}

function Exercise({ training, onAction, onResults }: {
  training: TrainingState
  onAction: (action: TrainingAction) => void
  onResults: () => void
}) {
  const current = training.tasks[training.currentIndex]
  const { task } = current
  const { equation } = task
  const finished = current.status !== 'open'
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  const action = (type: 'check-answer' | 'request-hint' | 'view-solution' | 'next-task') => {
    onAction({ type, trainingId: training.id, taskId: task.id })
  }
  const errors = current.lastCheck?.status === 'invalid'
    ? current.lastCheck.fields.map(fieldError) : [null, null]

  return (
    <section className="card exercise" aria-labelledby="exercise-heading">
      <div className="section-top">
        <span className={`badge ${task.difficulty}`}>{LEVELS[task.difficulty]} уровень</span>
        <span className="muted">Задание {training.currentIndex + 1} из {training.tasks.length}</span>
      </div>
      <h2 id="exercise-heading" ref={heading} tabIndex={-1}>Найди корни уравнения</h2>
      <p className="equation">{equationText(equation)}</p>
      <form noValidate onSubmit={(event) => { event.preventDefault(); action('check-answer') }}>
        <div className="root-fields">
          {([0, 1] as const).map((index) => (
            <div key={index}>
              <label htmlFor={`root-${index}`}>Корень x{index === 0 ? '₁' : '₂'}</label>
              <input
                id={`root-${index}`}
                type="text"
                value={current.input[index]}
                disabled={finished}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors[index])}
                aria-describedby={`answer-help${errors[index] ? ` root-error-${index}` : ''}`}
                onChange={(event) => {
                  const input: [string, string] = [...current.input]
                  input[index] = event.target.value
                  onAction({ type: 'set-input', input, trainingId: training.id, taskId: task.id })
                }}
              />
              {errors[index] && <p className="field-error" id={`root-error-${index}`}>{errors[index]}</p>}
            </div>
          ))}
        </div>
        <p className="muted small" id="answer-help">Порядок не важен. Если корни совпадают, введи одинаковое число в оба поля.</p>
        <div className="feedback" role="status" aria-live="polite" aria-atomic="true">
          {current.status === 'solved' && <p className="notice success">Верно! Начислено баллов: {number(current.points)}. Отличная работа.</p>}
          {current.status === 'solution-viewed' && <p className="notice">Задание завершено с готовым решением. За него начислено 0 баллов.</p>}
          {current.lastCheck?.status === 'incorrect' && !finished && <p className="notice error">Пока неверно. Проверь оба корня и попробуй ещё раз — ошибки не уменьшают баллы.</p>}
          {current.lastCheck?.status === 'invalid' && !finished && <p className="notice error">Проверь запись чисел в полях. Это не считается ошибкой решения.</p>}
        </div>
        {!finished && <button className="primary full" type="submit">Проверить ответ</button>}
      </form>
      <p className="muted small">Неправильных попыток: {current.incorrectAttempts}. Баллы без подсказки: {BASE_POINTS[task.difficulty]}; с подсказкой — половина.</p>
      {!finished && (
        <div className="help-actions">
          <button type="button" className="secondary" disabled={current.hintUsed} onClick={() => action('request-hint')}>
            {current.hintUsed ? 'Подсказка открыта' : 'Подсказка · 50% баллов'}
          </button>
          <button type="button" className="text-button" onClick={() => action('view-solution')}>Показать решение · 0 баллов</button>
        </div>
      )}
      {current.hintUsed && (
        <aside className="notice hint" aria-label="Подсказка">
          <h3>Вспомни теорему Виета</h3>
          <p>Нужны два целых числа, для которых:</p>
          <p className="math-line">x₁ + x₂ = −p = {number(-equation.p || 0)}</p>
          <p className="math-line">x₁ · x₂ = q = {number(equation.q)}</p>
          <p className="small">Подсказка уменьшает награду вдвое только один раз.</p>
        </aside>
      )}
      {current.status === 'solution-viewed' && (
        <aside className="notice solution" aria-label="Готовое решение">
          <h3>Разберём решение</h3>
          <p>По теореме Виета сумма корней равна −p = {number(-equation.p || 0)}, а произведение равно q = {number(equation.q)}.</p>
          <p>Этим условиям подходят числа {number(equation.roots[0])} и {number(equation.roots[1])}:</p>
          <p className="math-line">({number(equation.roots[0])}) + ({number(equation.roots[1])}) = {number(-equation.p || 0)}</p>
          <p className="math-line">({number(equation.roots[0])}) · ({number(equation.roots[1])}) = {number(equation.q)}</p>
          <p><strong>Ответ: x₁ = {number(equation.roots[0])}, x₂ = {number(equation.roots[1])}.</strong></p>
          {equation.roots[0] === equation.roots[1] && <p>Корни совпадают — одно и то же число записываем дважды.</p>}
        </aside>
      )}
      {finished && <button type="button" className="primary full next" onClick={() => {
        if (training.status === 'completed') onResults()
        else action('next-task')
      }}>{training.status === 'completed' ? 'Посмотреть результаты' : 'Следующее задание →'}</button>}
    </section>
  )
}

function Results({ training, onRestart }: { training: TrainingState; onRestart: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const solved = training.tasks.filter((task) => task.status === 'solved').length
  return (
    <section className="card" aria-labelledby="results-heading">
      <span className="eyebrow">Все задания пройдены</span>
      <h2 id="results-heading" ref={heading} tabIndex={-1}>Тренировка завершена!</h2>
      <p className="result-score">{number(getTotalPoints(training))}<span> / {MAX_POINTS}</span></p>
      <p className="muted">Решено: {solved} из {training.tasks.length}. Продолжай практиковаться в своём темпе.</p>
      <div className="table-scroll">
        <table>
          <caption>Результаты по заданиям</caption>
          <thead><tr><th scope="col">№</th><th scope="col">Уровень</th><th scope="col">Результат</th><th scope="col">Баллы</th></tr></thead>
          <tbody>{training.tasks.map((item, index) => <tr key={item.task.id}>
            <th scope="row">{index + 1}</th><td>{LEVELS[item.task.difficulty]}</td>
            <td>{item.status === 'solution-viewed' ? 'Готовое решение' : item.hintUsed ? 'С подсказкой' : 'Без подсказки'}</td>
            <td>{number(item.points)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <button type="button" className="primary full" onClick={onRestart}>Начать заново</button>
    </section>
  )
}

function App() {
  const [training, setTraining] = useState<TrainingState | null>(null)
  const [screen, setScreen] = useState<'home' | 'theory' | 'training'>('home')
  const homeHeading = useRef<HTMLHeadingElement>(null)
  // Screen navigation is separate from the core's completion status: the last
  // task's feedback stays visible until the student explicitly opens results.
  const [showResults, setShowResults] = useState(false)
  const unfinished = screen === 'training' && training?.status === 'active'

  useEffect(() => {
    if (screen === 'home') homeHeading.current?.focus()
  }, [screen])

  useEffect(() => {
    if (!unfinished) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Browsers display their own confirmation text for reload/close/back.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [unfinished])

  const navigate = (target: 'home' | 'theory') => {
    if (unfinished && !window.confirm('Тренировка ещё не завершена. При выходе ответы и прогресс будут потеряны. Выйти из тренировки?')) return
    setTraining(null)
    setShowResults(false)
    setScreen(target)
  }
  const start = () => {
    const next = createTraining(crypto.randomUUID())
    setTraining(next)
    setShowResults(false)
    setScreen('training')
  }
  const dispatch = (action: TrainingAction) => {
    setTraining((previous) => previous ? updateTraining(previous, action) : previous)
  }
  const completedCount = training?.tasks.filter((task) => task.status !== 'open').length ?? 0

  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="brand-mark" aria-hidden="true">x²</span>
        <div><p className="eyebrow">Алгебра · 8 класс</p><h1>Тренажёр по теореме Виета</h1></div>
      </header>
      {screen !== 'home' && <nav className="page-navigation" aria-label="Разделы приложения">
        <button type="button" className="secondary" onClick={() => navigate('home')}>На главную</button>
        <button type="button" className="secondary" disabled={screen === 'theory'} onClick={() => navigate('theory')}>Изучить теорию</button>
      </nav>}
      {screen === 'theory' ? <Theory onHome={() => navigate('home')} onStart={start} /> : screen === 'home' ? (
        <section className="card welcome">
          <span className="eyebrow">От простого к сложному</span>
          <h2 ref={homeHeading} tabIndex={-1}>Два корня. Девять шагов.</h2>
          <p className="intro">Потренируйся находить целые корни квадратных уравнений с помощью теоремы Виета.</p>
          <div className="welcome-stats"><span><strong>{TASK_COUNT}</strong> заданий</span><span><strong>3</strong> уровня</span><span><strong>{MAX_POINTS}</strong> баллов максимум</span></div>
          <ul className="rules-list">
            <li>Ошибаться можно: попытки не уменьшают баллы.</li>
            <li>Подсказка оставляет половину баллов за задание.</li>
            <li>Готовое решение завершает задание с нулём баллов.</li>
          </ul>
          <div className="home-actions">
            <button type="button" className="secondary full" onClick={() => navigate('theory')}>Изучить теорию</button>
            <button type="button" className="primary full" onClick={start}>Начать тренировку</button>
          </div>
          <p className="muted small optional-theory">Уже знаешь правило? Начинай тренировку сразу — теория необязательна.</p>
        </section>
      ) : training && (showResults ? <Results training={training} onRestart={start} /> : <>
        <section className="training-progress" aria-label="Прогресс тренировки">
          <div><span>Завершено: {completedCount} из {training.tasks.length}</span><strong>Баллы: {number(getTotalPoints(training))} / {MAX_POINTS}</strong></div>
          <progress value={completedCount} max={training.tasks.length} aria-label={`Завершено ${completedCount} из ${training.tasks.length} заданий`} />
        </section>
        <Exercise key={`${training.id}:${training.currentIndex}`} training={training} onAction={dispatch} onResults={() => setShowResults(true)} />
      </>)}
      <footer>Учись в своём темпе. Каждая попытка — практика.</footer>
    </main>
  )
}

export default App
