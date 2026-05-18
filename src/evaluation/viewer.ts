import * as d3 from 'd3'
import { renderChart, type ChartSpec } from '../api/rendering'
import { runChartOps } from '../api/operation-run'
import { normalizeOpsGroups, type OpsSpecInput } from '../api/types'
import { isOperationNextRunOutcome, type OperationNextRunOutcome } from '../operation-next/executionState'

declare global {
  interface Window {
    __EVALUATION_BASE_PATH__?: string
  }
}

type EvaluationStep = {
  id: string
  text: string
  opsSpec: OpsSpecInput
}

type EvaluationStepManifest = {
  id: string
  text: string
  opsSpec?: OpsSpecInput
}

type EvaluationChart = {
  chart_id: string
  question: string
  description?: string
  spec: ChartSpec
  steps: EvaluationStep[]
}

type EvaluationChartManifest = {
  chart_id: string
  question: string
  description?: string
  spec?: ChartSpec
  specPath?: string
  opsSpec?: OpsSpecInput
  opsPath?: string
  steps: EvaluationStepManifest[]
}

type ChartMapEntry = {
  question?: string
  description?: string
  steps?: Array<{ id: string; text: string }>
}

type ChartMap = Record<string, Record<string, ChartMapEntry>>

type StepRecord = {
  runtimeSnapshot: OperationNextRunOutcome['runtimeSnapshot']
  continuation: OperationNextRunOutcome['continuation']
  endSvg: string
}

type SurveyQuestion = {
  id: string
  text: string
  kind: 'yes-no' | 'likert7'
}

type SurveyPage = {
  questions: SurveyQuestion[]
}

const surveyPages: SurveyPage[] = [
  {
    questions: [
      {
        id: 'answer-correct',
        text: 'Based on the explanation, is the answer correct?',
        kind: 'yes-no',
      },
    ],
  },
  {
    questions: [
      {
        id: 'reasoning-easy',
        text: 'This system made the reasoning process easy to understand.',
        kind: 'likert7',
      },
      {
        id: 'derivation-clear',
        text: 'This system clearly showed how the answer was derived from the chart.',
        kind: 'likert7',
      },
      {
        id: 'trust-judgment',
        text: 'I trust this system when judging whether an answer is correct.',
        kind: 'likert7',
      },
    ],
  },
]

const evaluationBasePath = window.__EVALUATION_BASE_PATH__ ?? ''

function withEvaluationBase(path: string) {
  return `${evaluationBasePath}${path}`
}

const requestedExpertId = (() => {
  const parts = location.pathname.split('/').filter(Boolean)
  const routeParts = parts[0] === 'evaluation' ? parts.slice(1) : parts
  if (routeParts.length === 0) return ''
  const last = routeParts.at(-1) ?? ''
  if (last === 'index.html' || last === 'index') return routeParts.at(-2) ?? ''
  return last.replace(/\.html$/, '')
})()

const chartMap = await fetch(withEvaluationBase('/chart_map.json')).then((response) => response.json()) as ChartMap
const expertId = requestedExpertId && chartMap[requestedExpertId]
  ? requestedExpertId
  : Object.keys(chartMap)[0] ?? ''
const expertCharts = chartMap[expertId] ?? {}
const chartIds = Object.keys(expertCharts)

const counterEl = document.getElementById('chartCounter') as HTMLElement
const chartIdEl = document.getElementById('chartId') as HTMLElement
const containerEl = document.getElementById('chartContainer') as HTMLElement
const questionEl = document.getElementById('questionText') as HTMLElement
const descriptionEl = document.getElementById('descriptionText') as HTMLElement
const explanationEl = document.getElementById('explanationArea') as HTMLElement
const statusEl = document.getElementById('statusArea') as HTMLElement
const surveyEl = document.getElementById('surveyArea') as HTMLFormElement
const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement
const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement

let currentPageIndex = getPageIndexFromUrl()
let currentChartIndex = getChartIndexFromPage(currentPageIndex)
let currentChart: EvaluationChart | null = null
let stepsUnlocked = 0
let selectedStepIndex = -1
let stepRunInProgress = false
let stepRecords: Array<StepRecord | null> = []
let stepErrors = new Map<number, string>()
let startSvgByStep: string[] = []
let endSvgByStep: string[] = []
let surveyResponses = new Map<string, string>()

function getTotalPages() {
  return chartIds.length * surveyPages.length
}

function clampPageIndex(index: number) {
  const totalPages = getTotalPages()
  if (totalPages === 0) return 0
  return Math.max(0, Math.min(index, totalPages - 1))
}

function getChartIndexFromPage(pageIndex: number) {
  if (chartIds.length === 0) return 0
  return Math.floor(clampPageIndex(pageIndex) / surveyPages.length)
}

function getSurveyPageIndexFromPage(pageIndex: number) {
  if (surveyPages.length === 0) return 0
  return clampPageIndex(pageIndex) % surveyPages.length
}

function getPageIndexFromUrl() {
  const pageParam = new URLSearchParams(location.search).get('page')
  if (pageParam == null) return 0
  const page = Number(pageParam)
  if (!Number.isInteger(page)) return 0
  return clampPageIndex(page - 1)
}

function getExpertBasePath() {
  return expertId ? withEvaluationBase(`/${expertId}/`) : `${evaluationBasePath || '/'}`
}

function getPageUrl(index: number) {
  const url = new URL(getExpertBasePath(), location.origin)
  url.searchParams.set('page', String(clampPageIndex(index) + 1))
  return `${url.pathname}${url.search}`
}

function syncPageUrl(index: number, replace = false) {
  const nextUrl = getPageUrl(index)
  const currentUrl = `${location.pathname}${location.search}`
  if (nextUrl === currentUrl) return
  history[replace ? 'replaceState' : 'pushState']({ pageIndex: index }, '', nextUrl)
}

function getCurrentChartId() {
  return chartIds[currentChartIndex] ?? ''
}

function normalizeEvaluationDataUrl(rawUrl: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) return trimmed
  if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  if (trimmed.startsWith('ChartQA/')) return `/${trimmed}`
  if (trimmed.startsWith('data/test/')) return `/${trimmed}`
  if (trimmed.startsWith('data/')) return `/ChartQA/${trimmed}`
  return trimmed
}

function normalizeSpecDataUrls<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as unknown

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    const record = node as Record<string, unknown>
    const data = record.data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const dataRecord = data as Record<string, unknown>
      if (typeof dataRecord.url === 'string') {
        dataRecord.url = normalizeEvaluationDataUrl(dataRecord.url)
      }
    }

    Object.values(record).forEach(visit)
  }

  visit(clone)
  return clone as T
}

function isAbsoluteAssetPath(path: string) {
  return path.startsWith('/') || /^[a-z][a-z0-9+\-.]*:/i.test(path)
}

function resolveEvaluationChartAssetPath(path: string) {
  const trimmed = path.trim()
  if (!trimmed) return trimmed
  if (isAbsoluteAssetPath(trimmed)) return trimmed
  const normalized = trimmed.replace(/^\.?\//, '')
  return withEvaluationBase(`/data/${expertId}/${normalized}`)
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`)
  }
  return response.json() as Promise<T>
}

function buildStepOpsSpec(fullOpsSpec: OpsSpecInput, stepId: string): OpsSpecInput {
  if (Array.isArray(fullOpsSpec)) {
    if (stepId === 'ops') return { ops: fullOpsSpec } as OpsSpecInput
    throw new Error(`Operation group "${stepId}" is missing from ops spec.`)
  }
  if (fullOpsSpec && typeof fullOpsSpec === 'object') {
    const record = fullOpsSpec as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(record, stepId)) {
      return { [stepId]: record[stepId] } as OpsSpecInput
    }
  }

  const group = normalizeOpsGroups(fullOpsSpec).find((candidate) => candidate.name === stepId)
  if (!group) {
    throw new Error(`Operation group "${stepId}" is missing from ops spec.`)
  }
  return { [group.name]: group.ops } as OpsSpecInput
}

async function hydrateChartManifest(manifest: EvaluationChartManifest): Promise<EvaluationChart> {
  const rawSpec = manifest.spec ?? (
    manifest.specPath
      ? await fetchJson<ChartSpec>(resolveEvaluationChartAssetPath(manifest.specPath))
      : null
  )
  if (!rawSpec) {
    throw new Error(`Evaluation chart "${manifest.chart_id}" is missing spec or specPath.`)
  }

  const fullOpsSpec = manifest.opsSpec ?? (
    manifest.opsPath
      ? await fetchJson<OpsSpecInput>(resolveEvaluationChartAssetPath(manifest.opsPath))
      : null
  )

  const steps = manifest.steps.map((step) => {
    if (step.opsSpec) {
      return { ...step, opsSpec: step.opsSpec }
    }
    if (!fullOpsSpec) {
      throw new Error(`Evaluation chart "${manifest.chart_id}" step "${step.id}" is missing opsSpec and no opsPath was provided.`)
    }
    return {
      ...step,
      opsSpec: buildStepOpsSpec(fullOpsSpec, step.id),
    }
  })

  return {
    chart_id: manifest.chart_id,
    question: manifest.question,
    description: manifest.description,
    spec: normalizeSpecDataUrls(rawSpec),
    steps,
  }
}

async function fetchCurrentChart() {
  const chartId = getCurrentChartId()
  const manifest = await fetchJson<EvaluationChartManifest>(withEvaluationBase(`/data/${expertId}/${chartId}.json`))
  return hydrateChartManifest(manifest)
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function getSvgSnapshot() {
  return containerEl.querySelector('svg')?.outerHTML ?? ''
}

function parseSvgViewBox(svgNode: SVGSVGElement) {
  const values = (svgNode.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number).filter(Number.isFinite)
  if (values.length === 4) {
    const [x, y, width, height] = values
    if (width > 0 && height > 0) return { x, y, width, height }
  }
  const width = Number(svgNode.getAttribute('width')) || 640
  const height = Number(svgNode.getAttribute('height')) || 360
  return { x: 0, y: 0, width, height }
}

function formatSvgNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function fitSvgViewBoxToContent() {
  const svgNode = containerEl.querySelector<SVGSVGElement>('svg')
  if (!svgNode || typeof svgNode.getBBox !== 'function') return

  let contentBox: DOMRect | SVGRect
  try {
    contentBox = svgNode.getBBox()
  } catch {
    return
  }

  if (!contentBox || contentBox.width <= 0 || contentBox.height <= 0) return

  const padding = 16
  const current = parseSvgViewBox(svgNode)
  const nextX = Math.min(current.x, contentBox.x - padding)
  const nextY = Math.min(current.y, contentBox.y - padding)
  const nextRight = Math.max(current.x + current.width, contentBox.x + contentBox.width + padding)
  const nextBottom = Math.max(current.y + current.height, contentBox.y + contentBox.height + padding)
  svgNode.setAttribute('viewBox', [
    formatSvgNumber(nextX),
    formatSvgNumber(nextY),
    formatSvgNumber(nextRight - nextX),
    formatSvgNumber(nextBottom - nextY),
  ].join(' '))
}

type D3MotionController = {
  disabledDepth: number
  isDisabled: () => boolean
  withMotionDisabled: <T>(callback: () => Promise<T>) => Promise<T>
  forceZeroTiming: <T>(transition: T) => T
}

let replayMotionController: D3MotionController | null = null

function installD3ReplayMotionController(): D3MotionController | null {
  if (replayMotionController) return replayMotionController

  const transitionPrototype = d3.transition?.prototype
  const selectionPrototype = d3.selection?.prototype
  if (!transitionPrototype || !selectionPrototype) return null

  const originalDuration = transitionPrototype.duration
  const originalDelay = transitionPrototype.delay
  const originalSelectionTransition = selectionPrototype.transition
  const originalTransitionTransition = transitionPrototype.transition
  if (typeof originalDuration !== 'function' || typeof originalDelay !== 'function' || typeof originalSelectionTransition !== 'function') {
    return null
  }

  const controller: D3MotionController = {
    disabledDepth: 0,
    isDisabled() {
      return this.disabledDepth > 0
    },
    async withMotionDisabled(callback) {
      this.disabledDepth += 1
      try {
        return await callback()
      } finally {
        this.disabledDepth -= 1
      }
    },
    forceZeroTiming(transition) {
      if (!this.isDisabled() || !transition) return transition
      originalDelay.call(transition, 0)
      originalDuration.call(transition, 0)
      return transition
    },
  }

  transitionPrototype.duration = function replayAwareDuration(this: unknown, ...args: unknown[]) {
    if (controller.isDisabled() && args.length > 0) {
      return originalDuration.call(this, 0)
    }
    return originalDuration.apply(this, args)
  }
  transitionPrototype.delay = function replayAwareDelay(this: unknown, ...args: unknown[]) {
    if (controller.isDisabled() && args.length > 0) {
      return originalDelay.call(this, 0)
    }
    return originalDelay.apply(this, args)
  }
  selectionPrototype.transition = function replayAwareSelectionTransition(this: unknown, ...args: unknown[]) {
    const transition = originalSelectionTransition.apply(this, args)
    return controller.forceZeroTiming(transition)
  }
  if (typeof originalTransitionTransition === 'function') {
    transitionPrototype.transition = function replayAwareChainedTransition(this: unknown, ...args: unknown[]) {
      const transition = originalTransitionTransition.apply(this, args)
      return controller.forceZeroTiming(transition)
    }
  }

  replayMotionController = controller
  return replayMotionController
}

async function waitForD3Transitions() {
  const hasPendingTransitions = () => Array.from(containerEl.querySelectorAll<HTMLElement | SVGElement>('*')).some((node) => {
    return (node as unknown as { __transition?: Record<string, unknown> }).__transition
  })
  const timeoutAt = performance.now() + 5000
  while (hasPendingTransitions() && performance.now() < timeoutAt) {
    d3.timerFlush()
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  d3.timerFlush()
  await nextFrame()
}

function validateOpsSpec(opsSpec: OpsSpecInput) {
  const groups = normalizeOpsGroups(opsSpec)
  if (!groups.length || groups.every((group) => group.ops.length === 0)) {
    throw new Error('Invalid operation spec: no executable operations found.')
  }
}

async function renderSourceChart() {
  if (!currentChart) return
  containerEl.innerHTML = ''
  await renderChart(containerEl, currentChart.spec)
  fitSvgViewBoxToContent()
}

async function runEvaluationStep(stepIndex: number, previous: StepRecord | null, replay: boolean) {
  if (!currentChart) throw new Error('No chart is loaded.')
  const step = currentChart.steps[stepIndex]
  if (!step) throw new Error(`Step ${stepIndex + 1} is missing.`)
  validateOpsSpec(step.opsSpec)

  const run = async () => {
    const result = await runChartOps(containerEl, currentChart!.spec, step.opsSpec, {
      initialRenderMode: 'reuse-existing',
      resetRuntime: previous == null,
      runtimeSnapshot: previous?.runtimeSnapshot,
      initialChainState: previous?.continuation ?? null,
    })
    if (!isOperationNextRunOutcome(result)) {
      throw new Error('Operation runner did not return a continuation snapshot.')
    }
    return result
  }

  const controller = installD3ReplayMotionController()
  const outcome = replay && controller ? await controller.withMotionDisabled(run) : await run()
  await nextFrame()
  fitSvgViewBoxToContent()
  await waitForD3Transitions()
  fitSvgViewBoxToContent()

  return {
    runtimeSnapshot: outcome.runtimeSnapshot,
    continuation: outcome.continuation,
    endSvg: getSvgSnapshot(),
  } satisfies StepRecord
}

function compareStepSnapshot(kind: 'start' | 'end', stepIndex: number, nextSnapshot: string) {
  const snapshots = kind === 'start' ? startSvgByStep : endSvgByStep
  const previousSnapshot = snapshots[stepIndex]
  if (previousSnapshot == null) {
    snapshots[stepIndex] = nextSnapshot
    return
  }
  if (previousSnapshot !== nextSnapshot) {
    console.warn(`Evaluation ${kind} SVG mismatch for ${getCurrentChartId()} step ${stepIndex + 1}.`)
  }
}

function getSurveyResponseKey(questionId: string) {
  return `${getCurrentChartId()}:${getSurveyPageIndexFromPage(currentPageIndex)}:${questionId}`
}

function renderSurveyQuestion(question: SurveyQuestion) {
  const fieldset = document.createElement('fieldset')
  fieldset.className = 'survey-question'

  const legend = document.createElement('legend')
  legend.className = 'survey-question__text'
  legend.textContent = question.text
  fieldset.appendChild(legend)

  const options = question.kind === 'yes-no'
    ? ['Yes', 'No']
    : ['1', '2', '3', '4', '5', '6', '7']
  const row = document.createElement('div')
  row.className = question.kind === 'yes-no' ? 'choice-row' : 'likert-scale'
  const inputName = `${getCurrentChartId()}-${getSurveyPageIndexFromPage(currentPageIndex)}-${question.id}`
  const selectedValue = surveyResponses.get(getSurveyResponseKey(question.id))

  options.forEach((option) => {
    const label = document.createElement('label')
    label.className = question.kind === 'yes-no' ? 'choice-option' : 'likert-option'

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = inputName
    input.value = option
    input.checked = selectedValue === option
    input.addEventListener('change', () => {
      surveyResponses.set(getSurveyResponseKey(question.id), option)
    })

    label.appendChild(input)
    label.appendChild(document.createTextNode(option))
    row.appendChild(label)
  })

  fieldset.appendChild(row)
  return fieldset
}

function renderSurveyPage() {
  surveyEl.innerHTML = ''
  const surveyPage = surveyPages[getSurveyPageIndexFromPage(currentPageIndex)]
  surveyPage?.questions.forEach((question) => {
    surveyEl.appendChild(renderSurveyQuestion(question))
  })
}

async function runStep(stepIndex: number) {
  if (stepRunInProgress || !currentChart) return
  stepRunInProgress = true
  statusEl.className = ''
  statusEl.textContent = 'Running...'
  updateUI()

  try {
    await renderSourceChart()
    await nextFrame()

    let previous: StepRecord | null = null
    for (let index = 0; index < stepIndex; index += 1) {
      previous = await runEvaluationStep(index, previous, true)
      stepRecords[index] = previous
      stepErrors.delete(index)
    }

    const startSnapshot = getSvgSnapshot()
    const current = await runEvaluationStep(stepIndex, previous, false)
    stepRecords[stepIndex] = current
    stepErrors.delete(stepIndex)

    compareStepSnapshot('start', stepIndex, startSnapshot)
    compareStepSnapshot('end', stepIndex, current.endSvg)

    selectedStepIndex = stepIndex
    stepsUnlocked = Math.max(stepsUnlocked, stepIndex + 1)
    statusEl.textContent = ''
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] operation step failed', { chartId: getCurrentChartId(), stepIndex, error })
    stepErrors.set(stepIndex, message)
    selectedStepIndex = stepIndex
    statusEl.className = 'status--error'
    statusEl.textContent = message
    if (!containerEl.querySelector('svg')) {
      await renderSourceChart()
    }
  } finally {
    stepRunInProgress = false
    updateUI()
  }
}

function updateUI() {
  const totalCharts = chartIds.length
  const totalPages = getTotalPages()
  const chartId = getCurrentChartId()
  counterEl.textContent = totalPages > 0
    ? `Page ${currentPageIndex + 1} / ${totalPages} · Chart ${currentChartIndex + 1} / ${totalCharts}`
    : 'Page 0 / 0'
  chartIdEl.textContent = chartId
  prevBtn.disabled = currentPageIndex === 0 || stepRunInProgress
  nextBtn.disabled = currentPageIndex === totalPages - 1 || stepRunInProgress

  questionEl.textContent = currentChart?.question ?? expertCharts[chartId]?.question ?? ''
  descriptionEl.textContent = currentChart?.description ?? expertCharts[chartId]?.description ?? ''
  explanationEl.innerHTML = ''

  const steps = currentChart?.steps ?? []
  steps.forEach((step, index) => {
    const isUnlocked = index <= stepsUnlocked
    const state = stepErrors.has(index)
      ? 'error'
      : index === selectedStepIndex
        ? 'selected'
        : isUnlocked
          ? index === stepsUnlocked
            ? 'active'
            : 'completed'
          : 'pending'

    const span = document.createElement('span')
    span.className = `sentence sentence--${state}`
    span.textContent = step.text

    if ((isUnlocked || stepErrors.has(index)) && !stepRunInProgress) {
      span.addEventListener('click', () => {
        void runStep(index)
      })
    }

    explanationEl.appendChild(span)
    if (index < steps.length - 1) {
      explanationEl.appendChild(document.createTextNode(' '))
    }
  })
  renderSurveyPage()
}

async function loadPage(index: number) {
  const nextPageIndex = clampPageIndex(index)
  const nextChartIndex = getChartIndexFromPage(nextPageIndex)
  const chartChanged = nextChartIndex !== currentChartIndex || currentChart == null
  currentPageIndex = nextPageIndex
  currentChartIndex = nextChartIndex

  if (!chartChanged) {
    updateUI()
    return
  }

  currentChart = await fetchCurrentChart()
  stepsUnlocked = 0
  selectedStepIndex = -1
  stepRunInProgress = false
  stepRecords = []
  stepErrors = new Map()
  startSvgByStep = []
  endSvgByStep = []
  statusEl.className = ''
  statusEl.textContent = ''
  await renderSourceChart()
  updateUI()
}

function navigateToPage(index: number, replace = false) {
  const nextIndex = clampPageIndex(index)
  syncPageUrl(nextIndex, replace)
  void loadPage(nextIndex)
}

prevBtn.addEventListener('click', () => navigateToPage(currentPageIndex - 1))
nextBtn.addEventListener('click', () => navigateToPage(currentPageIndex + 1))

window.addEventListener('popstate', () => {
  void loadPage(getPageIndexFromUrl())
})

syncPageUrl(currentPageIndex, true)
void loadPage(currentPageIndex)
