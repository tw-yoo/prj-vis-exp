import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LikertQuestion, SurveyNav } from '../components'
import {
  ensureSurveyDocument,
  fetchSurveyJson,
  fetchSurveyState,
  fetchSurveyText,
  saveSurveyResponse,
  saveSurveyTiming,
  validateSurveyCode,
} from '../services'
import { renderChart } from '../../renderer/renderChart'
import { runChartOps } from '../../renderer/runChartOps'
import type { VegaLiteSpec } from '../../utils/chartRenderer'
import type { JsonValue } from '../../types'
import { buildMainSurveyPageDescriptors, type QuestionPageConfig } from '../engine/mainSurveyConfig'
import './mainSurvey.css'

const STORAGE_KEY = 'formResponses'
const TIMING_KEY = 'pageTiming'
const PAGE_RESPONSES_KEY = 'pageResponses'
const SUBMISSION_LOCK_KEY = 'survey_submission_locked'
const PARTICIPANT_CODE_KEY = 'participant_code'

const PAGE_QUERY_KEY = 'page'

const TEST_MODE = (() => {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('test')
  if (!raw) return false
  return raw === '1' || raw.toLowerCase() === 'true'
})()

const OFFLINE_MODE = (() => {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('offline')
  if (!raw) return false
  return raw === '1' || raw.toLowerCase() === 'true'
})()

type ResponseState = Record<string, string>
type TimingState = Record<string, number[]>
type PageResponseState = Record<string, Record<string, string>>

function randomCompletionCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const length = 6
  let code = ''
  try {
    const values = new Uint32Array(length)
    crypto.getRandomValues(values)
    for (let index = 0; index < length; index += 1) {
      code += alphabet[values[index] % alphabet.length]
    }
  } catch {
    for (let index = 0; index < length; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
  }
  return code
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJsonStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage failure and continue.
  }
}

function clampPageIndex(value: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(max, value))
}

function getInitialPageIndex(totalPages: number) {
  const params = new URLSearchParams(window.location.search)
  return clampPageIndex(Number(params.get(PAGE_QUERY_KEY)), Math.max(0, totalPages - 1))
}

function writePageIndexToUrl(pageIndex: number, pushHistory: boolean) {
  const url = new URL(window.location.href)
  url.searchParams.set(PAGE_QUERY_KEY, String(pageIndex))
  const target = `${url.pathname}${url.search}${url.hash}`
  const state = { pageIndex }
  if (pushHistory) {
    window.history.pushState(state, '', target)
  } else {
    window.history.replaceState(state, '', target)
  }
}

function normalizeCode(code: string) {
  return code.replace(/[^0-9a-z]/gi, '').toUpperCase()
}

function readSubmissionLockMap() {
  return readJsonStorage<Record<string, boolean>>(SUBMISSION_LOCK_KEY, {})
}

function writeSubmissionLockMap(map: Record<string, boolean>) {
  writeJsonStorage(SUBMISSION_LOCK_KEY, map)
}

function shouldBypassSubmissionLock(code: string) {
  return TEST_MODE && code.toUpperCase() === 'AAAAAA'
}

function getQuestionFieldKeys(config: QuestionPageConfig) {
  return config.questions.map((_, index) => `${config.questionId}_q${index + 1}`)
}

interface QuestionCardProps {
  config: QuestionPageConfig
  responses: ResponseState
  onChange: (name: string, value: string) => void
}

function QuestionCard({ config, responses, onChange }: QuestionCardProps) {
  const primaryChartRef = useRef<HTMLDivElement | null>(null)
  const explanationChartRef = useRef<HTMLDivElement | null>(null)
  const [baselineHtml, setBaselineHtml] = useState('')
  const [explanationError, setExplanationError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const renderPrimary = async () => {
      if (!primaryChartRef.current) return
      const chartPath = `data/vlSpec/ch_${config.questionId}.json`
      try {
        const spec = await fetchSurveyJson<VegaLiteSpec>(chartPath, false)
        if (cancelled || !primaryChartRef.current) return
        await renderChart(primaryChartRef.current, spec)
      } catch (error) {
        if (!cancelled && primaryChartRef.current) {
          const message = error instanceof Error ? error.message : String(error)
          primaryChartRef.current.innerHTML = `<div class="survey-engine__error">Failed to render chart: ${message}</div>`
        }
      }
    }
    void renderPrimary()
    return () => {
      cancelled = true
    }
  }, [config.questionId])

  useEffect(() => {
    let cancelled = false
    const renderExplanation = async () => {
      setExplanationError(null)
      setBaselineHtml('')

      if (config.explanationType === 'BASELINE') {
        try {
          const html = await fetchSurveyText(`data/opsSpec/op_${config.questionId}.html`, false)
          if (!cancelled) {
            setBaselineHtml(html)
          }
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : String(error)
            setExplanationError(message)
          }
        }
        return
      }

      if (!explanationChartRef.current) return
      try {
        const spec = await fetchSurveyJson<VegaLiteSpec>(`data/vlSpec/ch_${config.questionId}.json`, false)
        if (cancelled || !explanationChartRef.current) return

        if (config.explanationType === 'OURS') {
          try {
            const ops = await fetchSurveyJson<JsonValue>(`data/opsSpec/op_${config.questionId}.json`, false)
            if (cancelled || !explanationChartRef.current) return
            await runChartOps(explanationChartRef.current, spec, ops)
            return
          } catch {
            // Fallback to plain chart rendering if operation spec is missing.
          }
        }
        await renderChart(explanationChartRef.current, spec)
      } catch (error) {
        if (!cancelled && explanationChartRef.current) {
          const message = error instanceof Error ? error.message : String(error)
          explanationChartRef.current.innerHTML = `<div class="survey-engine__error">Failed to render explanation: ${message}</div>`
        }
      }
    }

    void renderExplanation()
    return () => {
      cancelled = true
    }
  }, [config.explanationType, config.questionId])

  return (
    <div className="page-content">
      <div className="page-fixed-header">
        <h3>Task: Evaluate Correctness</h3>
        <p>Please indicate how much you agree with the following statements about the accuracy of the system-generated answer and its explanation.</p>
      </div>

      {config.isContinuation && (
        <p className="continuation-note">
          <strong>Continued:</strong> This page continues the same chart and explanation from the previous page.
        </p>
      )}

      <p>
        <strong>During the survey, please follow these steps carefully:</strong>
      </p>
      <ol>
        <li>
          <strong>Start with the left panel:</strong> Study the chart thoroughly, read the question carefully, and check the provided answer.
        </li>
        <li>
          <strong>Next, move to the right panel:</strong> Read the detailed explanation provided, step-by-step, to see how the answer was derived.
        </li>
        <li>
          <strong>Evaluate the answer and explanation:</strong> Consider whether the provided answer and its explanation clearly match your own interpretation of the chart.
        </li>
        <li>
          <strong>Answer the questions:</strong> After reviewing everything, answer the questions below.
        </li>
      </ol>

      <div className="split-container" data-role="main-question-root">
        <div className="left">
          <div className="pane-header">
            <h3>Chart, Related Question, and Answer</h3>
          </div>
          <div className="pane-body">
            <div ref={primaryChartRef} className="survey-chart-host" />
            <p>
              <strong>Question:</strong> {config.chartQuestionText}
            </p>
            <p>
              <strong>Answer:</strong> {config.chartQuestionAnswer}
            </p>
          </div>
        </div>

        <div className="right">
          <div className="pane-header">
            <h3>Explanation of the Answer</h3>
          </div>
          <div className="pane-body">
            {config.explanationType === 'BASELINE' ? (
              explanationError ? (
                <div className="survey-engine__error">Failed to load baseline explanation: {explanationError}</div>
              ) : (
                <div className="baseline-explanation" dangerouslySetInnerHTML={{ __html: baselineHtml }} />
              )
            ) : (
              <div ref={explanationChartRef} className="survey-chart-host" />
            )}
          </div>
        </div>
      </div>

      <h2>{config.isContinuation ? '(Continued) Please answer all of the questions below.' : 'Please answer all of the questions below.'}</h2>
      <div className="likert-container">
        {config.questions.map((question, index) => {
          const name = `${config.questionId}_q${index + 1}`
          return (
            <LikertQuestion
              key={name}
              name={name}
              questionText={question.prompt}
              labels={question.labels}
              value={responses[name] || ''}
              onChange={(value) => onChange(name, value)}
            />
          )
        })}
      </div>

      <p>When you are ready, click <strong>Next</strong> to continue.</p>
    </div>
  )
}

export default function MainSurveyPage() {
  const descriptors = useMemo(() => buildMainSurveyPageDescriptors(), [])
  const [pageIndex, setPageIndex] = useState(() => getInitialPageIndex(descriptors.length))
  const [responses, setResponses] = useState<ResponseState>(() => {
    const stored = readJsonStorage<ResponseState>(STORAGE_KEY, {})
    if (!stored['completion-code']) {
      stored['completion-code'] = randomCompletionCode()
    }
    if (!stored['participant-code']) {
      const savedCode = localStorage.getItem(PARTICIPANT_CODE_KEY) || ''
      stored['participant-code'] = normalizeCode(savedCode)
    }
    return stored
  })
  const [participantCode, setParticipantCode] = useState(() => normalizeCode(localStorage.getItem(PARTICIPANT_CODE_KEY) || ''))
  const [codeValidated, setCodeValidated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [staticHtml, setStaticHtml] = useState('')
  const [staticError, setStaticError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const currentPageRef = useRef<HTMLDivElement | null>(null)
  const navLockRef = useRef(false)
  const startAtRef = useRef<number | null>(null)
  const activeTimerRef = useRef<number | null>(null)

  const descriptor = descriptors[pageIndex]

  const submissionLocked = useMemo(() => {
    if (!participantCode) return false
    if (shouldBypassSubmissionLock(participantCode)) return false
    const map = readSubmissionLockMap()
    return Boolean(map[participantCode])
  }, [participantCode])

  const updateResponse = useCallback((name: string, value: string) => {
    setResponses((previous) => {
      const next = { ...previous, [name]: value }
      writeJsonStorage(STORAGE_KEY, next)
      return next
    })
  }, [])

  const resolveSurveyCode = useCallback(async (rawCode: string) => {
    const trimmed = rawCode.trim()
    if (!trimmed) return null
    if (TEST_MODE || OFFLINE_MODE) return normalizeCode(trimmed)
    const normalized = normalizeCode(trimmed)
    if (await validateSurveyCode(normalized)) return normalized
    if (normalized !== trimmed && (await validateSurveyCode(trimmed))) return trimmed
    return null
  }, [])

  const hydrateRemoteState = useCallback(async (code: string) => {
    if (OFFLINE_MODE) return
    try {
      const snapshot = await fetchSurveyState(code)
      const remoteResponses = snapshot.responses || {}
      const merged = { ...responses }
      let changed = false
      Object.entries(remoteResponses).forEach(([key, value]) => {
        if (typeof value !== 'string') return
        if (merged[key] === value) return
        merged[key] = value
        changed = true
      })
      if (changed) {
        setResponses(merged)
        writeJsonStorage(STORAGE_KEY, merged)
      }
    } catch (error) {
      console.warn('Failed to hydrate survey state', error)
    }
  }, [responses])

  const initializeParticipantSession = useCallback(
    async (code: string) => {
      const normalized = normalizeCode(code)
      setParticipantCode(normalized)
      setCodeValidated(true)
      setResponses((previous) => {
        const next = { ...previous, 'participant-code': normalized }
        writeJsonStorage(STORAGE_KEY, next)
        return next
      })
      localStorage.setItem(PARTICIPANT_CODE_KEY, normalized)
      if (!OFFLINE_MODE) {
        await ensureSurveyDocument(normalized)
      }
      await hydrateRemoteState(normalized)
    },
    [hydrateRemoteState],
  )

  const persistCurrentPageResponses = useCallback(
    async (index: number) => {
      const currentDescriptor = descriptors[index]
      if (!currentDescriptor || currentDescriptor.kind !== 'question' || !currentDescriptor.question) {
        return { answers: {}, slug: currentDescriptor?.slug ?? '' }
      }

      const keys = getQuestionFieldKeys(currentDescriptor.question)
      const answers: Record<string, string> = {}
      keys.forEach((key) => {
        answers[key] = responses[key] || ''
      })

      const pageResponses = readJsonStorage<PageResponseState>(PAGE_RESPONSES_KEY, {})
      pageResponses[currentDescriptor.slug] = answers
      writeJsonStorage(PAGE_RESPONSES_KEY, pageResponses)

      if (!OFFLINE_MODE && participantCode && codeValidated) {
        await Promise.all(
          Object.entries(answers).map(([key, value]) => saveSurveyResponse(participantCode, key, value)),
        )
      }
      return { answers, slug: currentDescriptor.slug }
    },
    [codeValidated, descriptors, participantCode, responses],
  )

  const saveTimeForPage = useCallback(
    async (index: number, seconds: number, answers: Record<string, string>) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return
      const currentDescriptor = descriptors[index]
      if (!currentDescriptor) return
      const storageKey = `page_${index}`
      const timing = readJsonStorage<TimingState>(TIMING_KEY, {})
      const sessions = Array.isArray(timing[storageKey]) ? timing[storageKey].slice() : []
      sessions.push(seconds)
      timing[storageKey] = sessions
      writeJsonStorage(TIMING_KEY, timing)

      if (!OFFLINE_MODE && participantCode && codeValidated) {
        await saveSurveyTiming(participantCode, currentDescriptor.slug, seconds, {
          pageId: currentDescriptor.id,
          pageIndex: index,
          totalVisits: sessions.length,
          visitIndex: sessions.length - 1,
          sessions,
          answers,
        })
      }
    },
    [codeValidated, descriptors, participantCode],
  )

  const stopTimer = useCallback(() => {
    if (activeTimerRef.current != null) {
      window.clearInterval(activeTimerRef.current)
      activeTimerRef.current = null
    }
    if (!startAtRef.current) return 0
    const delta = Math.floor((Date.now() - startAtRef.current) / 1000)
    startAtRef.current = null
    setElapsedSeconds(0)
    return Math.max(0, delta)
  }, [])

  const startTimer = useCallback(() => {
    startAtRef.current = Date.now()
    setElapsedSeconds(0)
    if (activeTimerRef.current != null) {
      window.clearInterval(activeTimerRef.current)
    }
    activeTimerRef.current = window.setInterval(() => {
      if (!startAtRef.current) {
        setElapsedSeconds(0)
        return
      }
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startAtRef.current) / 1000)))
    }, 1000)
  }, [])

  const validateCurrentPage = useCallback(() => {
    if (descriptor.kind !== 'question' || !descriptor.question) return true
    const keys = getQuestionFieldKeys(descriptor.question)
    const missing = keys.some((key) => !(responses[key] || '').trim())
    if (missing) {
      alert('Please answer all of the questions')
      return false
    }
    return true
  }, [descriptor, responses])

  const goToPage = useCallback(
    async (nextIndex: number, pushHistory = true) => {
      const clamped = clampPageIndex(nextIndex, descriptors.length - 1)
      if (clamped === pageIndex) return
      if (navLockRef.current) return
      navLockRef.current = true
      setNavigating(true)
      try {
        const snapshot = await persistCurrentPageResponses(pageIndex)
        const seconds = stopTimer()
        await saveTimeForPage(pageIndex, seconds, snapshot.answers)
        setPageIndex(clamped)
        writePageIndexToUrl(clamped, pushHistory)
      } finally {
        navLockRef.current = false
        setNavigating(false)
      }
    },
    [descriptors.length, pageIndex, persistCurrentPageResponses, saveTimeForPage, stopTimer],
  )

  const handleSubmitSurvey = useCallback(async () => {
    if (submissionLocked) {
      alert('You have already submitted your response. Thank you!')
      return
    }
    if (!validateCurrentPage()) return
    setSubmitting(true)
    try {
      const snapshot = await persistCurrentPageResponses(pageIndex)
      const seconds = stopTimer()
      await saveTimeForPage(pageIndex, seconds, snapshot.answers)

      alert('Your response has been successfully submitted!')
      if (participantCode && !shouldBypassSubmissionLock(participantCode)) {
        const lockMap = readSubmissionLockMap()
        lockMap[participantCode] = true
        writeSubmissionLockMap(lockMap)
      }

      const freshCompletionCode = randomCompletionCode()
      const resetResponses: ResponseState = {
        'completion-code': freshCompletionCode,
        'participant-code': '',
      }
      setResponses(resetResponses)
      setParticipantCode('')
      setCodeValidated(false)
      localStorage.removeItem(PARTICIPANT_CODE_KEY)
      writeJsonStorage(STORAGE_KEY, resetResponses)
      writeJsonStorage(TIMING_KEY, {})
      writeJsonStorage(PAGE_RESPONSES_KEY, {})

      setPageIndex(0)
      writePageIndexToUrl(0, false)
    } finally {
      setSubmitting(false)
    }
  }, [
    pageIndex,
    participantCode,
    persistCurrentPageResponses,
    saveTimeForPage,
    stopTimer,
    submissionLocked,
    validateCurrentPage,
  ])

  const handleNext = useCallback(async () => {
    if (navigating || submitting) return
    const isLastPage = pageIndex === descriptors.length - 1
    if (descriptor.id === 'access_code' && !codeValidated) {
      const input = currentPageRef.current?.querySelector<HTMLInputElement>('[data-role="participant-code"]')
      const rawCode = input?.value ?? responses['participant-code'] ?? ''
      const normalized = normalizeCode(rawCode)
      if (normalized.length !== 6) {
        alert('Please enter the six-character access code.')
        input?.focus()
        return
      }
      try {
        const resolved = await resolveSurveyCode(normalized)
        if (!resolved) {
          alert('We could not find that access code. Please double-check it.')
          return
        }
        await initializeParticipantSession(resolved)
        if (input) input.value = resolved
      } catch {
        alert('We ran into an issue verifying the code. Please try again in a moment.')
        return
      }
    } else if (!validateCurrentPage()) {
      return
    }

    if (isLastPage) {
      await handleSubmitSurvey()
      return
    }
    await goToPage(pageIndex + 1, true)
  }, [
    codeValidated,
    descriptor.id,
    descriptors.length,
    goToPage,
    handleSubmitSurvey,
    initializeParticipantSession,
    navigating,
    pageIndex,
    resolveSurveyCode,
    responses,
    submitting,
    validateCurrentPage,
  ])

  useEffect(() => {
    writeJsonStorage(STORAGE_KEY, responses)
  }, [responses])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const target = typeof event.state?.pageIndex === 'number' ? event.state.pageIndex : getInitialPageIndex(descriptors.length)
      const clamped = clampPageIndex(target, descriptors.length - 1)
      setPageIndex(clamped)
      writePageIndexToUrl(clamped, false)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [descriptors.length])

  useEffect(() => {
    writePageIndexToUrl(pageIndex, false)
    if (descriptor.kind === 'question' && descriptor.question?.trackTime) {
      startTimer()
      return
    }
    if (descriptor.kind === 'static' && descriptor.static?.trackTime) {
      startTimer()
      return
    }
    stopTimer()
  }, [descriptor, pageIndex, startTimer, stopTimer])

  useEffect(() => {
    return () => {
      const flush = async () => {
        const snapshot = await persistCurrentPageResponses(pageIndex)
        const seconds = stopTimer()
        await saveTimeForPage(pageIndex, seconds, snapshot.answers)
      }
      void flush()
    }
  }, [pageIndex, persistCurrentPageResponses, saveTimeForPage, stopTimer])

  useEffect(() => {
    let cancelled = false
    const loadStatic = async () => {
      if (descriptor.kind !== 'static' || !descriptor.static) {
        setStaticHtml('')
        setStaticError(null)
        return
      }
      try {
        const html = await fetchSurveyText(descriptor.static.path, false)
        if (!cancelled) {
          setStaticHtml(html)
          setStaticError(null)
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error)
          setStaticError(message)
          setStaticHtml('')
        }
      }
    }
    void loadStatic()
    return () => {
      cancelled = true
    }
  }, [descriptor])

  useEffect(() => {
    if (descriptor.id !== 'access_code') return
    const input = currentPageRef.current?.querySelector<HTMLInputElement>('[data-role="participant-code"]')
    if (!input) return
    const initialValue = normalizeCode(responses['participant-code'] || participantCode)
    input.value = initialValue
    const onInput = () => {
      const normalized = normalizeCode(input.value)
      if (normalized !== input.value) {
        input.value = normalized
      }
      updateResponse('participant-code', normalized)
      setParticipantCode(normalized)
    }
    input.addEventListener('input', onInput)
    return () => {
      input.removeEventListener('input', onInput)
    }
  }, [descriptor.id, participantCode, responses, updateResponse])

  useEffect(() => {
    const bootstrap = async () => {
      const savedCode = normalizeCode(localStorage.getItem(PARTICIPANT_CODE_KEY) || '')
      if (!savedCode) return
      if (OFFLINE_MODE || TEST_MODE) {
        await initializeParticipantSession(savedCode || 'AAAAAA')
        return
      }
      try {
        const resolved = await resolveSurveyCode(savedCode)
        if (!resolved) {
          localStorage.removeItem(PARTICIPANT_CODE_KEY)
          return
        }
        await initializeParticipantSession(resolved)
      } catch (error) {
        console.warn('Failed to restore participant session', error)
      }
    }
    void bootstrap()
  }, [initializeParticipantSession, resolveSurveyCode])

  const progressTotal = Math.max(1, descriptors.length - 1)
  const showProgress = pageIndex !== 0
  const progressCurrent = showProgress ? Math.min(progressTotal, pageIndex) : null
  const isLastPage = pageIndex === descriptors.length - 1

  return (
    <div className="survey-engine">
      {TEST_MODE && (
        <div className="survey-engine__timer">
          <strong>Time on page:</strong> {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
        </div>
      )}

      <div className="survey-engine__content" ref={currentPageRef}>
        {descriptor.kind === 'question' && descriptor.question ? (
          <QuestionCard config={descriptor.question} responses={responses} onChange={updateResponse} />
        ) : staticError ? (
          <div className="survey-engine__error">Failed to load page: {staticError}</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: staticHtml }} />
        )}
      </div>

      <SurveyNav
        onPrev={() => void goToPage(pageIndex - 1, true)}
        onNext={() => void handleNext()}
        prevDisabled={navigating || pageIndex === 0}
        nextDisabled={navigating || submitting || (isLastPage && submissionLocked)}
        nextLabel={isLastPage ? (submitting ? 'Submitting...' : 'Submit') : 'Next'}
        totalPages={showProgress ? progressTotal : null}
        currentPage={progressCurrent}
        showProgress={showProgress}
      />
    </div>
  )
}
