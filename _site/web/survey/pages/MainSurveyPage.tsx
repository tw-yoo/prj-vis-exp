import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OpenEndedInput, PostSessionPanel, SevenPointScale, SurveyNav, YesNoSegment } from '../components'
import {
  ensureSurveyDocument,
  fetchMainSessionItems,
  fetchPostSessionResponse,
  fetchSurveyJson,
  fetchSurveyText,
  saveMainSessionItem,
  savePostSessionResponse,
  saveSurveyTiming,
  validateSurveyCode,
} from '../services'
import type { VegaLiteSpec, JsonValue, OpsSpecInput } from '../../../src/api/types'
import { browserEngine } from '../../engine/createBrowserEngine'
import { buildMainSurveyPageDescriptors, type QuestionPageConfig, type SurveyPageDescriptor } from '../engine/mainSurveyConfig'
import type { MainSessionResponseItem, PostSessionExample, PostSessionResponse, SystemId } from '../types'
import './mainSurvey.css'

const renderChart = browserEngine.renderChart
const runChartOps = browserEngine.runChartOps

const MAIN_SESSION_STORAGE_KEY = 'main_survey_v2_main_session'
const POST_SESSION_STORAGE_KEY = 'main_survey_v2_post_session'
const META_STORAGE_KEY = 'main_survey_v2_meta'
const TIMING_KEY = 'main_survey_v2_page_timing'

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

const SKIP_REMOTE_IO = OFFLINE_MODE || TEST_MODE

const SYSTEM_IDS: SystemId[] = ['system1', 'system2', 'system3']
const CONFIDENCE_SCALE_LABELS = [
  'Not confident at all',
  'Slightly not confident',
  'Somewhat not confident',
  'Neutral',
  'Somewhat confident',
  'Confident',
  'Very confident',
]
const AGREEMENT_SCALE_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Slightly disagree',
  'Neutral',
  'Slightly agree',
  'Agree',
  'Strongly agree',
]

type TimingState = Record<string, number[]>

type MainSessionField = 'answerCorrect' | 'confidenceQ1' | 'explanationHelpQ3' | 'reasonQ4'

interface MetaState {
  pageIndex: number
  participantCode: string
  completionCode: string
}

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

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key)
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

function createEmptyPostSessionResponse(): PostSessionResponse {
  return {
    matrix: {
      system1: { clarity: null, complexConfidence: null, evidence: null },
      system2: { clarity: null, complexConfidence: null, evidence: null },
      system3: { clarity: null, complexConfidence: null, evidence: null },
    },
    ranking: {
      trustMost: [],
      easiestExplanation: [],
      realWorldUse: [],
    },
    keyDifferences: '',
  }
}

function readInitialMeta(totalPages: number): MetaState {
  const fallbackPage = getInitialPageIndex(totalPages)
  const stored = readJsonStorage<Partial<MetaState>>(META_STORAGE_KEY, {})
  const normalizedCode = normalizeCode(localStorage.getItem(PARTICIPANT_CODE_KEY) || stored.participantCode || '')
  const storedPage = typeof stored.pageIndex === 'number' ? stored.pageIndex : fallbackPage
  const completionCode = typeof stored.completionCode === 'string' && stored.completionCode ? stored.completionCode : randomCompletionCode()
  return {
    pageIndex: clampPageIndex(storedPage, Math.max(0, totalPages - 1)),
    participantCode: normalizedCode,
    completionCode,
  }
}

function sanitizeMainSessionResponse(input: Partial<MainSessionResponseItem>): MainSessionResponseItem | null {
  if (!input.chartId) return null
  if (input.phase !== 'tutorial' && input.phase !== 'main') return null

  const answerCorrect = input.answerCorrect === 'yes' || input.answerCorrect === 'no' ? input.answerCorrect : ''
  const confidenceQ1 = typeof input.confidenceQ1 === 'number' && input.confidenceQ1 >= 1 && input.confidenceQ1 <= 7 ? input.confidenceQ1 : null
  const explanationHelpQ3 =
    typeof input.explanationHelpQ3 === 'number' && input.explanationHelpQ3 >= 1 && input.explanationHelpQ3 <= 7 ? input.explanationHelpQ3 : null

  return {
    chartId: input.chartId,
    phase: input.phase,
    answerCorrect,
    confidenceQ1,
    explanationHelpQ3,
    reasonQ4: typeof input.reasonQ4 === 'string' ? input.reasonQ4 : '',
  }
}

function mergePostSessionResponse(base: PostSessionResponse, incoming?: Partial<PostSessionResponse> | null): PostSessionResponse {
  if (!incoming) return base

  const next = createEmptyPostSessionResponse()
  next.keyDifferences = typeof incoming.keyDifferences === 'string' ? incoming.keyDifferences : base.keyDifferences

  SYSTEM_IDS.forEach((systemId) => {
    const source = incoming.matrix?.[systemId]
    const fallback = base.matrix[systemId]

    next.matrix[systemId].clarity = typeof source?.clarity === 'number' ? source.clarity : fallback.clarity
    next.matrix[systemId].complexConfidence = typeof source?.complexConfidence === 'number' ? source.complexConfidence : fallback.complexConfidence
    next.matrix[systemId].evidence = typeof source?.evidence === 'number' ? source.evidence : fallback.evidence
  })

  const trustMost = Array.isArray(incoming.ranking?.trustMost) ? incoming.ranking?.trustMost : base.ranking.trustMost
  const easiestExplanation = Array.isArray(incoming.ranking?.easiestExplanation)
    ? incoming.ranking?.easiestExplanation
    : base.ranking.easiestExplanation
  const realWorldUse = Array.isArray(incoming.ranking?.realWorldUse) ? incoming.ranking?.realWorldUse : base.ranking.realWorldUse

  next.ranking.trustMost = trustMost.filter((value): value is SystemId => SYSTEM_IDS.includes(value as SystemId))
  next.ranking.easiestExplanation = easiestExplanation.filter((value): value is SystemId => SYSTEM_IDS.includes(value as SystemId))
  next.ranking.realWorldUse = realWorldUse.filter((value): value is SystemId => SYSTEM_IDS.includes(value as SystemId))

  return next
}

function createDefaultMainSessionResponses(descriptors: Array<SurveyPageDescriptor & { kind: 'question'; question: QuestionPageConfig }>) {
  return descriptors.map((descriptor) => ({
    chartId: descriptor.question.responseId,
    phase: descriptor.question.phase,
    answerCorrect: '' as const,
    confidenceQ1: null,
    explanationHelpQ3: null,
    reasonQ4: '',
  }))
}

function mergeMainSessionResponses(defaultItems: MainSessionResponseItem[], storedItems: MainSessionResponseItem[]) {
  const storedMap = new Map<string, MainSessionResponseItem>()
  storedItems.forEach((item) => {
    const sanitized = sanitizeMainSessionResponse(item)
    if (!sanitized) return
    storedMap.set(sanitized.chartId, sanitized)
  })

  return defaultItems.map((item) => {
    const stored = storedMap.get(item.chartId)
    if (!stored) return item
    return {
      ...item,
      ...stored,
      chartId: item.chartId,
      phase: item.phase,
    }
  })
}

function isMainSessionComplete(item: MainSessionResponseItem | null | undefined) {
  if (!item) return false
  return (
    (item.answerCorrect === 'yes' || item.answerCorrect === 'no') &&
    typeof item.confidenceQ1 === 'number' &&
    typeof item.explanationHelpQ3 === 'number' &&
    item.reasonQ4.trim().length > 0
  )
}

function isRankingComplete(values: SystemId[]) {
  if (values.length !== 3) return false
  const unique = new Set(values)
  return unique.size === 3
}

function isPostSessionComplete(response: PostSessionResponse) {
  const matrixComplete = SYSTEM_IDS.every((systemId) => {
    const row = response.matrix[systemId]
    return (
      typeof row.clarity === 'number' &&
      typeof row.complexConfidence === 'number' &&
      typeof row.evidence === 'number' &&
      row.clarity >= 1 &&
      row.clarity <= 7 &&
      row.complexConfidence >= 1 &&
      row.complexConfidence <= 7 &&
      row.evidence >= 1 &&
      row.evidence <= 7
    )
  })

  if (!matrixComplete) return false
  if (!isRankingComplete(response.ranking.trustMost)) return false
  if (!isRankingComplete(response.ranking.easiestExplanation)) return false
  if (!isRankingComplete(response.ranking.realWorldUse)) return false
  return response.keyDifferences.trim().length > 0
}

function toMainAnswers(item: MainSessionResponseItem) {
  return {
    answerCorrect: item.answerCorrect,
    confidenceQ1: item.confidenceQ1 == null ? '' : String(item.confidenceQ1),
    explanationHelpQ3: item.explanationHelpQ3 == null ? '' : String(item.explanationHelpQ3),
    reasonQ4: item.reasonQ4,
  }
}

function toPostAnswers(response: PostSessionResponse) {
  return {
    system1_clarity: response.matrix.system1.clarity == null ? '' : String(response.matrix.system1.clarity),
    system1_complexConfidence:
      response.matrix.system1.complexConfidence == null ? '' : String(response.matrix.system1.complexConfidence),
    system1_evidence: response.matrix.system1.evidence == null ? '' : String(response.matrix.system1.evidence),
    system2_clarity: response.matrix.system2.clarity == null ? '' : String(response.matrix.system2.clarity),
    system2_complexConfidence:
      response.matrix.system2.complexConfidence == null ? '' : String(response.matrix.system2.complexConfidence),
    system2_evidence: response.matrix.system2.evidence == null ? '' : String(response.matrix.system2.evidence),
    system3_clarity: response.matrix.system3.clarity == null ? '' : String(response.matrix.system3.clarity),
    system3_complexConfidence:
      response.matrix.system3.complexConfidence == null ? '' : String(response.matrix.system3.complexConfidence),
    system3_evidence: response.matrix.system3.evidence == null ? '' : String(response.matrix.system3.evidence),
    ranking_trustMost: response.ranking.trustMost.join(','),
    ranking_easiestExplanation: response.ranking.easiestExplanation.join(','),
    ranking_realWorldUse: response.ranking.realWorldUse.join(','),
    keyDifferences: response.keyDifferences,
  }
}

interface MainQuestionCardProps {
  config: QuestionPageConfig
  value: MainSessionResponseItem
  onChange: <T extends MainSessionField>(chartId: string, field: T, value: MainSessionResponseItem[T]) => void
}

function MainQuestionCard({ config, value, onChange }: MainQuestionCardProps) {
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
            await runChartOps(explanationChartRef.current, spec, ops as OpsSpecInput)
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
        <p>Review the chart and explanation, then answer the four questions in the question box.</p>
      </div>

      <div className="split-container" data-role="main-question-root">
        <div className="left">
          <div className="pane-header">
            <h3>Chart, Question, and Answer</h3>
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
            <h3>Explanation</h3>
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

      <section className="question-box" aria-labelledby={`question-box-${config.responseId}`}>
        <header className="question-box__header">
          <h2 id={`question-box-${config.responseId}`}>Questions</h2>
          {/*<p>All four questions are required.</p>*/}
        </header>

        <div className="question-box__fields">
          <YesNoSegment
            id={`${config.responseId}-answer-correct`}
            label="Q1: The answer provided by this system is correct."
            value={value.answerCorrect}
            onChange={(next) => onChange(config.responseId, 'answerCorrect', next)}
          />

          <SevenPointScale
            id={`${config.responseId}-confidence`}
            label="Q2: How confident are you in your assessment of the answer in Q1?"
            leftLabel="Not confident at all"
            rightLabel="Very confident"
            valueLabels={CONFIDENCE_SCALE_LABELS}
            value={value.confidenceQ1}
            onChange={(next) => onChange(config.responseId, 'confidenceQ1', next)}
          />

          <SevenPointScale
            id={`${config.responseId}-helpfulness`}
            label="Q3: The provided explanation helped me verify the accuracy of the answer."
            leftLabel="Strongly disagree"
            rightLabel="Strongly agree"
            valueLabels={AGREEMENT_SCALE_LABELS}
            value={value.explanationHelpQ3}
            onChange={(next) => onChange(config.responseId, 'explanationHelpQ3', next)}
          />

          <OpenEndedInput
            id={`${config.responseId}-reason`}
            labelText="Q4: Please briefly explain the reason for your judgment in Q1."
            multiline
            rows={4}
            value={value.reasonQ4}
            onChange={(next) => onChange(config.responseId, 'reasonQ4', next)}
          />
        </div>
      </section>
    </div>
  )
}

export default function MainSurveyPage() {
  const descriptors = useMemo(() => buildMainSurveyPageDescriptors(), [])
  const questionDescriptors = useMemo(
    () =>
      descriptors.filter(
        (descriptor): descriptor is SurveyPageDescriptor & { kind: 'question'; question: QuestionPageConfig } =>
          descriptor.kind === 'question' && Boolean(descriptor.question),
      ),
    [descriptors],
  )

  const defaultMainResponses = useMemo(() => createDefaultMainSessionResponses(questionDescriptors), [questionDescriptors])
  const initialMeta = useMemo(() => readInitialMeta(descriptors.length), [descriptors.length])

  const [pageIndex, setPageIndex] = useState(() => initialMeta.pageIndex)
  const [participantCode, setParticipantCode] = useState(() => initialMeta.participantCode)
  const [completionCode, setCompletionCode] = useState(() => initialMeta.completionCode)
  const [accessCodeDraft, setAccessCodeDraft] = useState(() => initialMeta.participantCode)

  const [mainSessionResponses, setMainSessionResponses] = useState<MainSessionResponseItem[]>(() => {
    const stored = readJsonStorage<MainSessionResponseItem[]>(MAIN_SESSION_STORAGE_KEY, [])
    return mergeMainSessionResponses(defaultMainResponses, stored)
  })

  const [postSessionResponse, setPostSessionResponse] = useState<PostSessionResponse>(() => {
    const stored = readJsonStorage<Partial<PostSessionResponse> | null>(POST_SESSION_STORAGE_KEY, null)
    return mergePostSessionResponse(createEmptyPostSessionResponse(), stored)
  })

  const [postSessionExamples, setPostSessionExamples] = useState<PostSessionExample[]>([])
  const [codeValidated, setCodeValidated] = useState(() => SKIP_REMOTE_IO && Boolean(initialMeta.participantCode))
  const [submitting, setSubmitting] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [staticHtml, setStaticHtml] = useState('')
  const [staticError, setStaticError] = useState<string | null>(null)
  const [pageValidationError, setPageValidationError] = useState<string | null>(null)
  const [dismissedValidationMessage, setDismissedValidationMessage] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const currentPageRef = useRef<HTMLDivElement | null>(null)
  const navLockRef = useRef(false)
  const startAtRef = useRef<number | null>(null)
  const activeTimerRef = useRef<number | null>(null)

  const descriptor = descriptors[pageIndex]
  const isAccessCodePage = descriptor?.id === 'access_code'
  const accessCodeIntroHtml = useMemo(() => {
    if (!isAccessCodePage) return staticHtml
    return staticHtml.replace(new RegExp('<div class="code-access">[\\s\\S]*?</div>', 'i'), '')
  }, [isAccessCodePage, staticHtml])

  const mainResponseMap = useMemo(() => {
    const map: Record<string, MainSessionResponseItem> = {}
    mainSessionResponses.forEach((item) => {
      map[item.chartId] = item
    })
    return map
  }, [mainSessionResponses])

  const submissionLocked = useMemo(() => {
    if (!participantCode) return false
    if (shouldBypassSubmissionLock(participantCode)) return false
    const map = readSubmissionLockMap()
    return Boolean(map[participantCode])
  }, [participantCode])

  const resolveSurveyCode = useCallback(async (rawCode: string) => {
    const trimmed = rawCode.trim()
    if (!trimmed) return null
    if (TEST_MODE || OFFLINE_MODE) return normalizeCode(trimmed)
    const normalized = normalizeCode(trimmed)
    if (await validateSurveyCode(normalized)) return normalized
    if (normalized !== trimmed && (await validateSurveyCode(trimmed))) return trimmed
    return null
  }, [])

  const hydrateRemoteState = useCallback(
    async (code: string) => {
      if (SKIP_REMOTE_IO) return
      try {
        const [remoteMainMap, remotePost] = await Promise.all([fetchMainSessionItems(code), fetchPostSessionResponse(code)])

        setMainSessionResponses((previous) => {
          const mergedBase = mergeMainSessionResponses(defaultMainResponses, previous)
          const next = mergedBase.map((item) => {
            const remoteRaw = remoteMainMap[item.chartId]
            if (!remoteRaw || typeof remoteRaw !== 'object') return item
            const sanitized = sanitizeMainSessionResponse(remoteRaw as Partial<MainSessionResponseItem>)
            if (!sanitized) return item
            return {
              ...item,
              ...sanitized,
              chartId: item.chartId,
              phase: item.phase,
            }
          })
          writeJsonStorage(MAIN_SESSION_STORAGE_KEY, next)
          return next
        })

        if (remotePost) {
          setPostSessionResponse((previous) => {
            const next = mergePostSessionResponse(previous, remotePost)
            writeJsonStorage(POST_SESSION_STORAGE_KEY, next)
            return next
          })
        }
      } catch (error) {
        console.warn('Failed to hydrate main survey v2 state', error)
      }
    },
    [defaultMainResponses],
  )

  const initializeParticipantSession = useCallback(
    async (code: string) => {
      const normalized = normalizeCode(code)
      setParticipantCode(normalized)
      setAccessCodeDraft(normalized)
      setCodeValidated(true)
      localStorage.setItem(PARTICIPANT_CODE_KEY, normalized)

      if (!SKIP_REMOTE_IO) {
        await ensureSurveyDocument(normalized)
      }
      await hydrateRemoteState(normalized)
    },
    [hydrateRemoteState],
  )

  const updateMainSessionField = useCallback(
    <T extends MainSessionField>(chartId: string, field: T, value: MainSessionResponseItem[T]) => {
      setMainSessionResponses((previous) => {
        const next = previous.map((item) => (item.chartId === chartId ? { ...item, [field]: value } : item))
        writeJsonStorage(MAIN_SESSION_STORAGE_KEY, next)
        return next
      })
      setPageValidationError(null)
    },
    [],
  )

  const updatePostSessionMatrix = useCallback((systemId: SystemId, field: 'clarity' | 'complexConfidence' | 'evidence', score: number) => {
    setPostSessionResponse((previous) => {
      const next: PostSessionResponse = {
        ...previous,
        matrix: {
          ...previous.matrix,
          [systemId]: {
            ...previous.matrix[systemId],
            [field]: score,
          },
        },
      }
      writeJsonStorage(POST_SESSION_STORAGE_KEY, next)
      return next
    })
    setPageValidationError(null)
  }, [])

  const updatePostSessionRanking = useCallback((key: keyof PostSessionResponse['ranking'], value: SystemId[]) => {
    setPostSessionResponse((previous) => {
      const next: PostSessionResponse = {
        ...previous,
        ranking: {
          ...previous.ranking,
          [key]: value,
        },
      }
      writeJsonStorage(POST_SESSION_STORAGE_KEY, next)
      return next
    })
    setPageValidationError(null)
  }, [])

  const updatePostKeyDifferences = useCallback((value: string) => {
    setPostSessionResponse((previous) => {
      const next: PostSessionResponse = {
        ...previous,
        keyDifferences: value,
      }
      writeJsonStorage(POST_SESSION_STORAGE_KEY, next)
      return next
    })
    setPageValidationError(null)
  }, [])

  const persistCurrentPageResponses = useCallback(
    async (index: number) => {
      const currentDescriptor = descriptors[index]
      if (!currentDescriptor) {
        return { answers: {}, slug: '' }
      }

      if (currentDescriptor.kind === 'question' && currentDescriptor.question) {
        const item = mainResponseMap[currentDescriptor.question.responseId]
        if (!item) {
          return { answers: {}, slug: currentDescriptor.slug }
        }
        const answers = toMainAnswers(item)

        if (!SKIP_REMOTE_IO && participantCode && codeValidated) {
          await saveMainSessionItem(participantCode, item.chartId, item)
        }

        return { answers, slug: currentDescriptor.slug }
      }

      if (currentDescriptor.kind === 'post-session') {
        const answers = toPostAnswers(postSessionResponse)
        if (!SKIP_REMOTE_IO && participantCode && codeValidated) {
          await savePostSessionResponse(participantCode, postSessionResponse)
        }
        return { answers, slug: currentDescriptor.slug }
      }

      return { answers: {}, slug: currentDescriptor.slug }
    },
    [codeValidated, descriptors, mainResponseMap, participantCode, postSessionResponse],
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

      if (!SKIP_REMOTE_IO && participantCode && codeValidated) {
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
    if (!descriptor) return false

    if (descriptor.kind === 'question' && descriptor.question) {
      const item = mainResponseMap[descriptor.question.responseId]
      if (!isMainSessionComplete(item)) {
        setDismissedValidationMessage(null)
        setPageValidationError('Please answer all required questions before continuing.')
        return false
      }
      setPageValidationError(null)
      return true
    }

    if (descriptor.kind === 'post-session') {
      if (!isPostSessionComplete(postSessionResponse)) {
        setDismissedValidationMessage(null)
        setPageValidationError('Please complete all matrix, ranking, and open-ended fields before continuing.')
        return false
      }
      setPageValidationError(null)
      return true
    }

    setPageValidationError(null)
    return true
  }, [descriptor, mainResponseMap, postSessionResponse])

  const persistAllResponses = useCallback(async () => {
    if (SKIP_REMOTE_IO || !participantCode || !codeValidated) return
    await Promise.all(mainSessionResponses.map((item) => saveMainSessionItem(participantCode, item.chartId, item)))
    await savePostSessionResponse(participantCode, postSessionResponse)
  }, [codeValidated, mainSessionResponses, participantCode, postSessionResponse])

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
        setPageValidationError(null)
      } finally {
        navLockRef.current = false
        setNavigating(false)
      }
    },
    [descriptors.length, pageIndex, persistCurrentPageResponses, saveTimeForPage, stopTimer],
  )

  const resetSurveyState = useCallback(() => {
    const nextCompletionCode = randomCompletionCode()
    setMainSessionResponses(defaultMainResponses)
    setPostSessionResponse(createEmptyPostSessionResponse())
    setParticipantCode('')
    setAccessCodeDraft('')
    setCodeValidated(false)
    setCompletionCode(nextCompletionCode)
    setPageValidationError(null)

    removeStorage(MAIN_SESSION_STORAGE_KEY)
    removeStorage(POST_SESSION_STORAGE_KEY)
    writeJsonStorage(TIMING_KEY, {})

    localStorage.removeItem(PARTICIPANT_CODE_KEY)

    const meta: MetaState = {
      pageIndex: 0,
      participantCode: '',
      completionCode: nextCompletionCode,
    }
    writeJsonStorage(META_STORAGE_KEY, meta)

    setPageIndex(0)
    writePageIndexToUrl(0, false)
  }, [defaultMainResponses])

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
      await persistAllResponses()

      alert('Your response has been successfully submitted!')

      if (participantCode && !shouldBypassSubmissionLock(participantCode)) {
        const lockMap = readSubmissionLockMap()
        lockMap[participantCode] = true
        writeSubmissionLockMap(lockMap)
      }

      resetSurveyState()
    } finally {
      setSubmitting(false)
    }
  }, [
    pageIndex,
    participantCode,
    persistAllResponses,
    persistCurrentPageResponses,
    resetSurveyState,
    saveTimeForPage,
    stopTimer,
    submissionLocked,
    validateCurrentPage,
  ])

  const handleNext = useCallback(async () => {
    if (!descriptor || navigating || submitting) return

    if (descriptor.id === 'access_code' && !codeValidated) {
      const normalized = normalizeCode(accessCodeDraft)
      if (normalized.length !== 6) {
        setDismissedValidationMessage(null)
        setPageValidationError('Please enter the six-character access code.')
        return
      }

      try {
        const resolved = await resolveSurveyCode(normalized)
        if (!resolved) {
          setDismissedValidationMessage(null)
          setPageValidationError('We could not find that access code. Please double-check it.')
          return
        }
        await initializeParticipantSession(resolved)
      } catch {
        setDismissedValidationMessage(null)
        setPageValidationError('We ran into an issue verifying the code. Please try again in a moment.')
        return
      }
      await goToPage(pageIndex + 1, true)
      return
    }

    if (!validateCurrentPage()) return

    const isLastPage = pageIndex === descriptors.length - 1
    if (isLastPage || descriptor.id === 'completion') {
      await handleSubmitSurvey()
      return
    }

    await goToPage(pageIndex + 1, true)
  }, [
    accessCodeDraft,
    codeValidated,
    descriptor,
    descriptors.length,
    goToPage,
    handleSubmitSurvey,
    initializeParticipantSession,
    navigating,
    pageIndex,
    resolveSurveyCode,
    submitting,
    validateCurrentPage,
  ])

  useEffect(() => {
    setMainSessionResponses((previous) => mergeMainSessionResponses(defaultMainResponses, previous))
  }, [defaultMainResponses])

  useEffect(() => {
    const meta: MetaState = {
      pageIndex,
      participantCode,
      completionCode,
    }
    writeJsonStorage(META_STORAGE_KEY, meta)

    if (participantCode) {
      localStorage.setItem(PARTICIPANT_CODE_KEY, participantCode)
    } else {
      localStorage.removeItem(PARTICIPANT_CODE_KEY)
    }
  }, [completionCode, pageIndex, participantCode])

  useEffect(() => {
    writeJsonStorage(MAIN_SESSION_STORAGE_KEY, mainSessionResponses)
  }, [mainSessionResponses])

  useEffect(() => {
    writeJsonStorage(POST_SESSION_STORAGE_KEY, postSessionResponse)
  }, [postSessionResponse])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const target = typeof event.state?.pageIndex === 'number' ? event.state.pageIndex : getInitialPageIndex(descriptors.length)
      const clamped = clampPageIndex(target, descriptors.length - 1)
      setPageIndex(clamped)
      writePageIndexToUrl(clamped, false)
      setPageValidationError(null)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [descriptors.length])

  useEffect(() => {
    writePageIndexToUrl(pageIndex, false)

    if (descriptor?.kind === 'question' && descriptor.question?.trackTime) {
      startTimer()
      return
    }

    if (descriptor?.kind === 'post-session' && descriptor.postSession?.trackTime) {
      startTimer()
      return
    }

    if (descriptor?.kind === 'static' && descriptor.static?.trackTime) {
      startTimer()
      return
    }

    stopTimer()
  }, [descriptor, pageIndex, startTimer, stopTimer])

  useEffect(() => {
    let cancelled = false

    const loadStatic = async () => {
      if (!descriptor || descriptor.kind !== 'static' || !descriptor.static) {
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
    const bootstrap = async () => {
      const savedCode = normalizeCode(localStorage.getItem(PARTICIPANT_CODE_KEY) || '')
      if (!savedCode) return

      if (SKIP_REMOTE_IO) {
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

  useEffect(() => {
    let cancelled = false

    const loadExamples = async () => {
      if (!descriptor || descriptor.kind !== 'post-session' || !descriptor.postSession) {
        setPostSessionExamples([])
        return
      }

      try {
        const raw = await fetchSurveyJson<PostSessionExample[]>(descriptor.postSession.examplesPath, false)
        if (!cancelled) {
          setPostSessionExamples(Array.isArray(raw) ? raw : [])
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load post-session examples', error)
          setPostSessionExamples([])
        }
      }
    }

    void loadExamples()
    return () => {
      cancelled = true
    }
  }, [descriptor])

  const progressTotal = Math.max(1, descriptors.length - 1)
  const showProgress = pageIndex !== 0
  const progressCurrent = showProgress ? Math.min(progressTotal, pageIndex) : null
  const validationBannerTop = TEST_MODE ? 56 : 8

  const nextLabel = descriptor?.id === 'completion' ? (submitting ? 'Submitting...' : 'Submit') : 'Next'
  const nextDisabled = navigating || submitting || (descriptor?.id === 'completion' && submissionLocked)

  const currentQuestionItem =
    descriptor?.kind === 'question' && descriptor.question ? mainResponseMap[descriptor.question.responseId] : null

  return (
    <div className="survey-engine">
      {TEST_MODE && (
        <div className="survey-engine__timer">
          <strong>Time on page:</strong> {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
        </div>
      )}

      {pageValidationError && pageValidationError !== dismissedValidationMessage ? (
        <div
          className="survey-engine__validation-banner"
          role="status"
          aria-live="polite"
          style={{ top: `${validationBannerTop}px` }}
        >
          <span>{pageValidationError}</span>
          <button
            type="button"
            className="survey-engine__validation-close"
            aria-label="Dismiss validation message"
            onClick={() => setDismissedValidationMessage(pageValidationError)}
          >
            x
          </button>
        </div>
      ) : null}

      <div className="survey-engine__content" ref={currentPageRef}>
        {descriptor?.kind === 'question' && descriptor.question && currentQuestionItem ? (
          <MainQuestionCard config={descriptor.question} value={currentQuestionItem} onChange={updateMainSessionField} />
        ) : descriptor?.kind === 'post-session' ? (
          <PostSessionPanel
            examples={postSessionExamples}
            value={postSessionResponse}
            onMatrixChange={updatePostSessionMatrix}
            onRankingChange={updatePostSessionRanking}
            onKeyDifferencesChange={updatePostKeyDifferences}
            errorMessage={undefined}
          />
        ) : staticError ? (
          <div className="survey-engine__error">Failed to load page: {staticError}</div>
        ) : isAccessCodePage ? (
          <div className="page-content">
            <div dangerouslySetInnerHTML={{ __html: accessCodeIntroHtml }} />
            <div className="code-access">
              <label htmlFor="participant-code" className="question">
                Participant Access Code
              </label>
              <input
                id="participant-code"
                type="text"
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
                value={accessCodeDraft}
                onChange={(event) => {
                  setAccessCodeDraft(event.target.value)
                  setPageValidationError(null)
                }}
                placeholder="Enter your 6-character code"
              />
              <p className="code-hint">Please type the six-letter code you received. Press Next to validate the code and continue.</p>
            </div>
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: staticHtml }} />
        )}
      </div>

      <SurveyNav
        onPrev={() => void goToPage(pageIndex - 1, true)}
        onNext={() => void handleNext()}
        prevDisabled={navigating || pageIndex === 0}
        nextDisabled={nextDisabled}
        nextLabel={nextLabel}
        totalPages={showProgress ? progressTotal : null}
        currentPage={progressCurrent}
        showProgress={showProgress}
      />
    </div>
  )
}
