import { useCallback, useEffect, useMemo, useState } from 'react'
import { recordPreRegistration } from '../services'
import { LikertQuestion, OpenEndedInput, SurveyNav } from '../components'
import './preRegistration.css'

type BinaryChoice = '1' | '2' | ''
type PreRegResponses = Record<string, string>
type PreRegPageId = 'pre_screen' | 'pre_pass' | 'pre_fail' | 'pre_complete'
type ScreeningKey = 'pre_screen_q1' | 'pre_screen_q2' | 'pre_screen_q3' | 'pre_screen_q4'

interface ScreeningStatement {
  statement: string
  isTrue: boolean
}

const STORAGE_KEY = 'preRegResponses'
const SCREENING_KEYS: ScreeningKey[] = ['pre_screen_q1', 'pre_screen_q2', 'pre_screen_q3', 'pre_screen_q4']
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STATEMENTS: Record<string, ScreeningStatement> = {
  s0: { statement: 'The value increased from 1940 to 1980.', isTrue: false },
  s1: { statement: 'The value reached its maximum in 1960.', isTrue: true },
  s2: { statement: 'The value in 1900 was 5.', isTrue: true },
  s3: { statement: 'The value in 2000 is smaller than the value in 1900', isTrue: true },
  s4: {
    statement:
      'The value drop between 1960 and 1980 is smaller than the value drop between 1980 and 2000.',
    isTrue: false,
  },
  s5: { statement: 'The highest value ever reached was 13.', isTrue: true },
  s6: { statement: 'The lowest value ever reached was 5.', isTrue: false },
  s7: { statement: 'The value started decreasing in 1940.', isTrue: false },
  s8: { statement: 'The steepest decrease was between 1960 and 1980.', isTrue: true },
  s9: { statement: 'The increment in value between 1940 and 1960 is 4.', isTrue: false },
  s10: { statement: 'The steepest increase was between 1920 and 1940', isTrue: true },
  s11: { statement: 'The value in 1980 was equal to the value in 1900.', isTrue: false },
  s12: { statement: 'The value reached its minimum in 2000.', isTrue: true },
  s13: { statement: 'The values shown in the chart are between 1 and 13.', isTrue: true },
  s14: { statement: 'The chart shows values observed between 1900 and 2000.', isTrue: true },
}

const PAGE_IDS: PreRegPageId[] = ['pre_screen', 'pre_pass', 'pre_fail', 'pre_complete']

function clampPageIndex(pageIndex: number) {
  if (!Number.isFinite(pageIndex)) return 0
  return Math.max(0, Math.min(PAGE_IDS.length - 1, pageIndex))
}

function getInitialPageIndex() {
  const params = new URLSearchParams(window.location.search)
  return clampPageIndex(Number(params.get('page')))
}

function shuffle<T>(array: T[]) {
  const copy = array.slice()
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const temp = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = temp
  }
  return copy
}

function generateStatementMap() {
  const selected = shuffle(Object.keys(STATEMENTS)).slice(0, 4)
  return SCREENING_KEYS.reduce(
    (accumulator, key, index) => {
      accumulator[key] = selected[index]
      return accumulator
    },
    {} as Record<ScreeningKey, string>,
  )
}

function parseBinaryChoice(value: unknown): BinaryChoice {
  return value === '1' || value === '2' ? value : ''
}

function readStoredResponses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const normalized: PreRegResponses = {}
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === 'string') {
        normalized[key] = value
      }
    })
    return normalized
  } catch {
    return {}
  }
}

function createInitialResponses() {
  const saved = readStoredResponses()
  const responses: PreRegResponses = {
    ...saved,
    pre_q1: parseBinaryChoice(saved.pre_q1),
    pre_q2: parseBinaryChoice(saved.pre_q2),
    email: typeof saved.email === 'string' ? saved.email : '',
  }

  SCREENING_KEYS.forEach((key) => {
    responses[key] = ''
  })

  return responses
}

function writePageToUrl(pageIndex: number, pushHistory: boolean) {
  const url = new URL(window.location.href)
  url.searchParams.set('page', String(clampPageIndex(pageIndex)))
  const target = `${url.pathname}${url.search}${url.hash}`
  const state = { pageIndex: clampPageIndex(pageIndex) }
  if (pushHistory) {
    window.history.pushState(state, '', target)
  } else {
    window.history.replaceState(state, '', target)
  }
}

export default function PreRegistrationPage() {
  const [pageIndex, setPageIndex] = useState(getInitialPageIndex)
  const [statementMap] = useState<Record<ScreeningKey, string>>(generateStatementMap)
  const [responses, setResponses] = useState<PreRegResponses>(createInitialResponses)
  const [submitting, setSubmitting] = useState(false)

  const pageId = PAGE_IDS[pageIndex]

  const screeningItems = useMemo(() => {
    return SCREENING_KEYS.map((key) => ({
      key,
      statementKey: statementMap[key],
      statement: STATEMENTS[statementMap[key]]?.statement || '',
    }))
  }, [statementMap])

  const navigateTo = useCallback((nextIndex: number, pushHistory = true) => {
    const clamped = clampPageIndex(nextIndex)
    setPageIndex(clamped)
    writePageToUrl(clamped, pushHistory)
  }, [])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const fromState = event.state?.pageIndex
      if (typeof fromState === 'number') {
        setPageIndex(clampPageIndex(fromState))
        return
      }
      const params = new URLSearchParams(window.location.search)
      setPageIndex(clampPageIndex(Number(params.get('page'))))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    writePageToUrl(pageIndex, false)
  }, [pageIndex])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(responses))
  }, [responses])

  const setBinaryResponse = useCallback((name: string, value: BinaryChoice) => {
    setResponses((prev) => ({ ...prev, [name]: value }))
  }, [])

  const validateScreeningPage = useCallback(() => {
    const requiredKeys = ['pre_q1', 'pre_q2', ...SCREENING_KEYS]
    const isValid = requiredKeys.every((key) => {
      const choice = parseBinaryChoice(responses[key])
      return choice === '1' || choice === '2'
    })
    if (!isValid) {
      alert('Please answer all of the questions')
    }
    return isValid
  }, [responses])

  const evaluateScreening = useCallback(() => {
    return SCREENING_KEYS.every((key) => {
      const statementKey = statementMap[key]
      const statementSpec = STATEMENTS[statementKey]
      if (!statementSpec) return false
      const expected = statementSpec.isTrue ? '1' : '2'
      return responses[key] === expected
    })
  }, [responses, statementMap])

  const handleNext = useCallback(async () => {
    if (pageId === 'pre_screen') {
      if (!validateScreeningPage()) return
      navigateTo(evaluateScreening() ? 1 : 2)
      return
    }

    if (pageId === 'pre_pass') {
      const email = (responses.email || '').trim()
      if (!EMAIL_REGEX.test(email)) {
        alert('Please enter a valid email address.')
        return
      }

      setSubmitting(true)
      try {
        await recordPreRegistration({
          ...responses,
          email,
          submittedAt: new Date().toISOString(),
        })
        navigateTo(3)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        alert(`Failed to submit pre-registration: ${message}`)
      } finally {
        setSubmitting(false)
      }
    }
  }, [evaluateScreening, navigateTo, pageId, responses, validateScreeningPage])

  if (pageId === 'pre_fail') {
    return (
      <div className="pre-reg-page">
        <div className="pr-shell">
          <div className="pr-status pr-status--fail">
            <div className="pr-status__icon">!</div>
            <div>
              <h1>You are not eligible to participate</h1>
              <p className="pr-footnote">
                Thank you for your interest in our study. Your responses did not meet the screening criteria.
              </p>
            </div>
          </div>
          <section className="pr-card pr-card--note">
            <div className="pr-card__body">
              <p className="pr-subtle">
                You may close this window. If you believe this is an error, please contact Taewon Yoo at{' '}
                <strong>twyoo@yonsei.ac.kr</strong>.
              </p>
            </div>
          </section>
        </div>
      </div>
    )
  }

  if (pageId === 'pre_complete') {
    return (
      <div className="pre-reg-page">
        <div className="pr-shell">
          <div className="pr-status pr-status--done">
            <div className="pr-status__icon">✓</div>
            <div>
              <h1>Your response has been submitted</h1>
              <p className="pr-footnote">Thank you for completing the pre-registration. You may now close this page.</p>
            </div>
          </div>
          <section className="pr-card pr-card--note">
            <div className="pr-card__body">
              <p className="pr-subtle">
                If you do not receive the consent form within a few minutes, please check your spam folder or reach out
                to <strong> twyoo@yonsei.ac.kr</strong>.
              </p>
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="pre-reg-page">
      <div className="pr-shell">
        {pageId === 'pre_screen' && (
          <>
            <header className="pr-hero">
              <p className="pr-eyebrow">Pre-registration</p>
              <h1>Thank you for your interest in our study!</h1>
              <p className="pr-lede">
                We are a team from the Human-Data Interaction Lab at Yonsei University. Please complete this short
                pre-registration so we can confirm eligibility before moving to consent and the main survey. It will take
                a maximum of 2 minutes to complete.
              </p>
            </header>

            <div className="pr-grid">
              <section className="pr-card">
                <div className="pr-card__header">
                  <h3>About this pre-registration</h3>
                </div>
                <div className="pr-card__body">
                  <ul className="pr-list">
                    <li>This step confirms basic eligibility and chart comprehension.</li>
                    <li>Answer the quick questions below, then complete brief screening questions.</li>
                    <li>
                      Questions? Contact Taewon Yoo at <strong>twyoo@yonsei.ac.kr</strong>.
                    </li>
                  </ul>
                </div>
              </section>
            </div>

            <section className="pr-card">
              <div className="pr-card__header">
                <h3>Quick eligibility check</h3>
              </div>
              <div className="pr-card__body pr-stack">
                <LikertQuestion
                  name="pre_q1"
                  questionText="Is this your first time participating in our survey?"
                  labels={['Yes', 'No']}
                  value={parseBinaryChoice(responses.pre_q1)}
                  onChange={(value) => setBinaryResponse('pre_q1', parseBinaryChoice(value))}
                />
                <LikertQuestion
                  name="pre_q2"
                  questionText="Are you currently between the ages of 18 and 64?"
                  labels={['Yes', 'No']}
                  value={parseBinaryChoice(responses.pre_q2)}
                  onChange={(value) => setBinaryResponse('pre_q2', parseBinaryChoice(value))}
                />
              </div>
            </section>

            <section className="pr-card">
              <div className="pr-card__header">
                <div>
                  <h3>Screening Questions</h3>
                  <p className="pr-subtle">Review the chart and mark each statement as True or False.</p>
                </div>
              </div>
              <div className="pr-card__body pr-screening-grid">
                <div className="pr-chart-wrap">
                  <p className="pr-chart-label">Reference chart</p>
                  <img
                    className="pr-chart"
                    src="/survey/pre-registration/pages/chart01.png"
                    alt="Line chart used for screening questions"
                  />
                </div>
                <div className="pr-screening">
                  <p className="pr-subtle">Please answer all of the questions to proceed.</p>
                  <div className="pr-likert-container">
                    {screeningItems.map((item) => (
                      <LikertQuestion
                        key={item.key}
                        name={item.key}
                        questionText={item.statement}
                        labels={['True', 'False']}
                        value={parseBinaryChoice(responses[item.key])}
                        onChange={(value) => setBinaryResponse(item.key, parseBinaryChoice(value))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {pageId === 'pre_pass' && (
          <>
            <div className="pr-status pr-status--pass">
              <div className="pr-status__icon">✓</div>
              <div>
                <h1>You're qualified to participate</h1>
                <p className="pr-footnote">Great job on the screening! We just need an email to send the consent form.</p>
              </div>
            </div>

            <section className="pr-card">
              <div className="pr-card__header">
                <h3>
                  To proceed with the main study, please provide your email address. We will reach out to you via the
                  email address you provide.
                </h3>
              </div>
              <div className="pr-card__body pr-stack">
                <OpenEndedInput
                  id="pre-reg-email"
                  labelText="Please enter your email address"
                  placeholder="abc@xyz.com"
                  inputType="email"
                  required
                  value={responses.email || ''}
                  onChange={(value) => setResponses((prev) => ({ ...prev, email: value }))}
                />
                <p className="pr-subtle">We will only use this email to send the consent form for this study.</p>
                <p className="pr-footnote">
                  After filling your email, click <strong>Submit</strong> to continue.
                </p>
              </div>
            </section>
          </>
        )}

        <SurveyNav
          align="center"
          hidePrev
          onNext={() => void handleNext()}
          nextLabel={pageId === 'pre_pass' ? (submitting ? 'Submitting...' : 'Submit') : 'Next'}
          nextDisabled={submitting}
        />
      </div>
    </div>
  )
}
