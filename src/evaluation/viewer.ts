import {
  loadSession,
  buildSequence,
  type ParticipantData,
  type SequenceItem,
  type OrderSystemFile,
  type OrderChartFile,
  type ChartGroupFile,
} from './participantSession'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './renderers/types'
import { OursRenderer } from './renderers/oursRenderer'
import { SvgRenderer } from './renderers/svgRenderer'
import { BaselineRenderer } from './renderers/baselineRenderer'

declare global {
  interface Window {
    __EVALUATION_BASE_PATH__?: string
  }
}

type ChartMapEntry = {
  question?: string
  description?: string
  ours?: { steps?: Array<{ id: string; text: string }> }
  d3?: { model?: string }
  svg?: { model?: string }
}

type ChartMap = {
  charts: Record<string, ChartMapEntry>
  defaults?: {
    d3?: { model?: string }
    svg?: { model?: string }
  }
}

type SurveyQuestion = {
  id: string
  text: string
  kind: 'yes-no' | 'likert7'
}

type SurveyPage = {
  questions: SurveyQuestion[]
}

type IntroKind = 'intro-welcome' | 'tutorial-interact' | 'tutorial-task'

type PageDescriptor =
  | { kind: IntroKind }
  | { kind: 'survey'; itemIdx: number; surveyPageIdx: number }

const surveyPages: SurveyPage[] = [
  {
    questions: [
      {
        id: 'answer-correct',
        text: 'Is the answer correct?',
        kind: 'yes-no',
      },
    ],
  },
  {
    questions: [
      { id: 'reasoning-easy', text: 'The output of the system is easy to understand.', kind: 'likert7' },
      { id: 'derivation-clear', text: 'The the reasoning process of the system is transparent.', kind: 'likert7' },
      { id: 'trust-judgment', text: 'I trust this system.', kind: 'likert7' },
    ],
  },
]

const INTRO_PAGE_KINDS: IntroKind[] = ['intro-welcome', 'tutorial-interact', 'tutorial-task']
const EVAL_TUTORIAL_CHART_ID = '0w88bu7qm4ilsqmh'

const WELCOME_BODY_HTML = `
  <p>Thank you for participating in this research study.</p>
  <p>We are investigating how different <strong>visual explanations</strong> help people understand and verify answers to questions about charts.</p>
  <p>In this study, you will see a series of charts paired with questions and AI-generated answers. For each pair, a step-by-step visual explanation will show how the answer was derived. <strong>Three different explanation systems</strong> are compared in this study; you will see explanations from all three throughout the survey.</p>
  <p>Your task on each question:</p>
  <ol>
    <li>Decide whether the provided answer is correct.</li>
    <li>Rate how clearly the explanation showed the reasoning behind the answer.</li>
  </ol>
  <p>The study takes about <strong>50&ndash;60 minutes</strong>. Your responses are anonymous and linked only to your participant code (<code>{code}</code>).</p>
  <p>The next two pages will walk you through how to interact with the explanations and what we'll ask you to do.</p>
`

const TUTORIAL_INTERACT_BODY_HTML = `
  <p>Each visual explanation is broken into a few reasoning steps. <strong>Every numbered block is one step</strong> &mdash; a single step may include one or more sentences.</p>
  <p>To see what a step looks like on the chart, <strong>click on a block</strong>. The chart will update to reflect that step. You can click blocks in any order &mdash; revisit earlier steps, jump ahead, or replay.</p>
  <p>Try it now on the live example below.</p>
`

const TUTORIAL_TASK_BODY_HTML = `
  <p>For each of the <strong>{sequenceLength}</strong> questions in this study, please follow these steps:</p>
  <ol>
    <li><strong>Read the chart.</strong> Examine the data carefully (e.g., axes, labels, values.)</li>
    <li><strong>Read the question and the proposed answer.</strong></li>
    <li><strong>Read the visual explanation</strong> by clicking through each numbered block.</li>
    <li><strong>Verify the answer.</strong> After reviewing the explanation, decide: Yes (correct) or No (incorrect).</li>
    <li><strong>Rate the explanation.</strong> Three statements use a 7-point scale (Strongly disagree &rarr; Strongly agree).</li>
  </ol>
  <div class="intro-notes">
    <p class="intro-notes__title">Important notes</p>
    <ul>
      <li><strong>Answer the first question quickly.</strong> We measure how long you take to answer the "Is the answer correct?" question on each page. Please stay focused and respond as soon as you have made your decision.</li>
      <li><strong>Use external tools freely.</strong> A calculator or scrap paper is fine if you need to verify a calculation &mdash; just try to keep it brief.</li>
      <li><strong>One direction.</strong> Once you advance past a question's survey, you cannot return to that question.</li>
    </ul>
  </div>
  <p>When you're ready, click <strong>Next</strong> to begin the survey.</p>
`

const evaluationBasePath = window.__EVALUATION_BASE_PATH__ ?? ''
const withBase = (p: string) => `${evaluationBasePath}${p}`

const session = loadSession()
if (!session) {
  location.replace(withBase('/'))
  throw new Error('No participant session; redirecting to entry.')
}
const participant: ParticipantData = session

const chartCardEl = document.getElementById('chartCard') as HTMLElement
const bottomAreaEl = document.getElementById('bottomArea') as HTMLElement
const taskBannerEl = document.getElementById('taskBanner') as HTMLElement
const containerEl = document.getElementById('chartContainer') as HTMLElement
const questionEl = document.getElementById('questionText') as HTMLElement
const descriptionEl = document.getElementById('descriptionText') as HTMLElement
const debugMetaEl = document.getElementById('debugMeta') as HTMLElement
const explanationEl = document.getElementById('explanationArea') as HTMLElement
const statusEl = document.getElementById('statusArea') as HTMLElement
const surveyEl = document.getElementById('surveyArea') as HTMLFormElement
const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement
const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement
const progressFillEl = document.getElementById('progressFill') as HTMLElement
const progressLabelEl = document.getElementById('progressLabel') as HTMLElement
const progressTrackEl = document.getElementById('progressTrack') as HTMLElement
const surveyWarningEl = document.getElementById('surveyWarning') as HTMLElement
const methodBadgeEl = document.getElementById('methodBadge') as HTMLElement | null
const introCardEl = document.getElementById('introCard') as HTMLElement
const introEyebrowEl = document.getElementById('introEyebrow') as HTMLElement
const introTitleEl = document.getElementById('introTitle') as HTMLElement
const introBodyEl = document.getElementById('introBody') as HTMLElement
const introDemoEl = document.getElementById('introDemo') as HTMLElement
const introDemoChartEl = document.getElementById('introDemoChart') as HTMLElement
const introDemoQuestionEl = document.getElementById('introDemoQuestion') as HTMLElement
const introDemoExplanationEl = document.getElementById('introDemoExplanation') as HTMLElement
const introDemoHintEl = document.getElementById('introDemoHint') as HTMLElement

const chartMap = await fetch(withBase('/chart_map.json')).then((r) => r.json()) as ChartMap
const charts = chartMap.charts ?? {}
const defaultD3Model = chartMap.defaults?.d3?.model ?? 'gpt-5.2'
const defaultSvgModel = chartMap.defaults?.svg?.model ?? 'gpt-5.2'
const baselineModel = chartMap.defaults?.svg?.model ?? 'gpt-5.2'

const rendererContext: RendererContext = {
  container: containerEl,
  baselineBase: withBase('/baselines'),
  oursBase: withBase('/data/ours'),
  defaultD3Model,
  defaultSvgModel,
  baselineModel,
}

// Build the per-participant sequence from the order model:
//   order.system -> order_system.json -> [Ours, B1, B2]
//   order.chart  -> order_chart.json  -> [G1, G2, G3]
// system i is paired with group i; each group's 5 charts (chart_group.json) are
// listed in an order randomized deterministically by the participant code (so
// reloads / ?page navigation stay aligned). 3 systems x 5 charts = 15 items.
const [orderSystem, orderChart, chartGroup] = await Promise.all([
  fetch(withBase('/order_system.json')).then((r) => r.json()) as Promise<OrderSystemFile>,
  fetch(withBase('/order_chart.json')).then((r) => r.json()) as Promise<OrderChartFile>,
  fetch(withBase('/chart_group.json')).then((r) => r.json()) as Promise<ChartGroupFile>,
])
const sequence: SequenceItem[] = buildSequence(
  participant.order,
  { orderSystem, orderChart, chartGroup },
  participant.code,
)
const allPages: PageDescriptor[] = (() => {
  const intros: PageDescriptor[] = INTRO_PAGE_KINDS.map((kind) => ({ kind }))
  const surveys: PageDescriptor[] = []
  for (let i = 0; i < sequence.length; i += 1) {
    for (let j = 0; j < surveyPages.length; j += 1) {
      surveys.push({ kind: 'survey', itemIdx: i, surveyPageIdx: j })
    }
  }
  return [...intros, ...surveys]
})()

let currentPageIndex = getPageIndexFromUrl()
let currentItemIndex = -1
let currentRenderer: ExplanationRenderer | null = null
let currentItemKey = ''
let stepsUnlocked = 0
let selectedStepIndex = -1
let stepRunInProgress = false
let stepErrors = new Map<number, string>()
const surveyResponses = new Map<string, string>()

let demoRenderer: ExplanationRenderer | null = null
let demoChartId = ''
let demoStepTexts: string[] = []
let demoStepsUnlocked = 0
let demoSelectedStepIndex = -1
let demoStepRunInProgress = false
let demoErrors = new Map<number, string>()

function clampPageIndex(idx: number) {
  if (allPages.length === 0) return 0
  return Math.max(0, Math.min(idx, allPages.length - 1))
}

function getPageIndexFromUrl() {
  const param = new URLSearchParams(location.search).get('page')
  if (param == null) return 0
  const n = Number(param)
  if (!Number.isInteger(n)) return 0
  return clampPageIndex(n - 1)
}

function getPageUrl(idx: number) {
  const url = new URL(location.pathname, location.origin)
  url.searchParams.set('page', String(clampPageIndex(idx) + 1))
  return `${url.pathname}${url.search}`
}

function syncPageUrl(idx: number, replace = false) {
  const next = getPageUrl(idx)
  const current = `${location.pathname}${location.search}`
  if (next === current) return
  history[replace ? 'replaceState' : 'pushState']({ pageIndex: idx }, '', next)
}

function getItemKey(item: SequenceItem) {
  return `${item.chart_id}::${item.method}`
}

function createRenderer(method: ExplanationMethod): ExplanationRenderer {
  if (method === 'ours') return new OursRenderer(rendererContext)
  if (method === 'b1') return new BaselineRenderer(rendererContext, 'b1')
  if (method === 'b2') return new BaselineRenderer(rendererContext, 'b2')
  throw new Error(`Unknown method: ${method}`)
}

function currentSurveyDescriptor(): { surveyPageIdx: number; item: SequenceItem } | null {
  const page = allPages[currentPageIndex]
  if (!page || page.kind !== 'survey') return null
  return { surveyPageIdx: page.surveyPageIdx, item: sequence[page.itemIdx] }
}

function getSurveyResponseKey(questionId: string) {
  const info = currentSurveyDescriptor()
  if (!info) return `none:${questionId}`
  return `${getItemKey(info.item)}:${info.surveyPageIdx}:${questionId}`
}

function renderSurveyQuestion(question: SurveyQuestion): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset')
  fieldset.className = `survey-question survey-question--${question.kind === 'yes-no' ? 'choice' : 'likert'}`

  const legend = document.createElement('legend')
  legend.className = 'survey-question__text'
  legend.textContent = question.text
  fieldset.appendChild(legend)

  const info = currentSurveyDescriptor()
  const itemKey = info ? getItemKey(info.item) : 'unknown'
  const surveyPageIdx = info?.surveyPageIdx ?? 0
  const inputName = `${itemKey}-${surveyPageIdx}-${question.id}`
  const selectedValue = surveyResponses.get(getSurveyResponseKey(question.id))

  const buildOption = (value: string, optionClass: string) => {
    const label = document.createElement('label')
    label.className = optionClass

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = inputName
    input.value = value
    input.checked = selectedValue === value

    label.addEventListener('click', () => {
      surveyResponses.set(getSurveyResponseKey(question.id), value)
    })

    const text = document.createElement('span')
    text.className = `${optionClass}__label`
    text.textContent = value

    label.appendChild(input)
    label.appendChild(text)
    return label
  }

  if (question.kind === 'yes-no') {
    const row = document.createElement('div')
    row.className = 'choice-row'
    ;['Yes', 'No'].forEach((opt) => row.appendChild(buildOption(opt, 'choice-option')))
    fieldset.appendChild(row)
  } else {
    const scale = document.createElement('div')
    scale.className = 'likert-scale'

    const optionsRow = document.createElement('div')
    optionsRow.className = 'likert-scale__options'
    ;['1', '2', '3', '4', '5', '6', '7'].forEach((opt) => optionsRow.appendChild(buildOption(opt, 'likert-option')))
    scale.appendChild(optionsRow)

    const endpoints = document.createElement('div')
    endpoints.className = 'likert-scale__endpoints'
    const leftLabel = document.createElement('span')
    leftLabel.className = 'likert-scale__endpoint likert-scale__endpoint--low'
    leftLabel.textContent = 'Strongly disagree'
    const rightLabel = document.createElement('span')
    rightLabel.className = 'likert-scale__endpoint likert-scale__endpoint--high'
    rightLabel.textContent = 'Strongly agree'
    endpoints.appendChild(leftLabel)
    endpoints.appendChild(rightLabel)
    scale.appendChild(endpoints)

    fieldset.appendChild(scale)
  }

  return fieldset
}

function renderSurveyPage() {
  surveyEl.innerHTML = ''
  const info = currentSurveyDescriptor()
  if (!info) return
  const surveyPage = surveyPages[info.surveyPageIdx]
  surveyPage?.questions.forEach((q) => surveyEl.appendChild(renderSurveyQuestion(q)))
}

function isSurveyPageComplete(): boolean {
  const info = currentSurveyDescriptor()
  if (!info) return true
  const surveyPage = surveyPages[info.surveyPageIdx]
  if (!surveyPage) return true
  const itemKey = getItemKey(info.item)
  return surveyPage.questions.every((q) => {
    const name = `${itemKey}-${info.surveyPageIdx}-${q.id}`
    return surveyEl.querySelector(`input[name="${CSS.escape(name)}"]:checked`) !== null
  })
}

function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*\d+\.\s*/, '')
}

function buildSentenceSpans(
  container: HTMLElement,
  stepTexts: string[],
  state: {
    selectedStepIndex: number
    stepsUnlocked: number
    stepErrors: Map<number, string>
    stepRunInProgress: boolean
    onClick: (index: number) => void
  },
) {
  container.innerHTML = ''
  stepTexts.forEach((text, index) => {
    const isUnlocked = index <= state.stepsUnlocked
    const hasError = state.stepErrors.has(index)
    const stateName = hasError
      ? 'error'
      : index === state.selectedStepIndex
        ? 'selected'
        : isUnlocked
          ? index === state.stepsUnlocked
            ? 'active'
            : 'completed'
          : 'pending'

    const span = document.createElement('span')
    span.className = `sentence sentence--${stateName}`

    const badge = document.createElement('span')
    badge.className = 'sentence__badge'
    badge.textContent = String(index + 1)
    span.appendChild(badge)

    const textSpan = document.createElement('span')
    textSpan.className = 'sentence__text'
    textSpan.textContent = stripLeadingNumber(text)
    span.appendChild(textSpan)

    if ((isUnlocked || hasError) && !state.stepRunInProgress) {
      span.addEventListener('click', () => state.onClick(index))
    }

    container.appendChild(span)
    if (index < stepTexts.length - 1) container.appendChild(document.createTextNode(' '))
  })
}

async function runStep(stepIndex: number) {
  if (stepRunInProgress || !currentRenderer) return
  stepRunInProgress = true
  statusEl.className = ''
  statusEl.textContent = 'Running...'
  updateUI()

  try {
    await currentRenderer.renderStep(stepIndex)
    selectedStepIndex = stepIndex
    stepsUnlocked = Math.max(stepsUnlocked, stepIndex + 1)
    stepErrors.delete(stepIndex)
    statusEl.textContent = ''
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] renderStep failed', { itemKey: currentItemKey, stepIndex, error })
    stepErrors.set(stepIndex, message)
    selectedStepIndex = stepIndex
    statusEl.className = 'status--error'
    statusEl.textContent = message
  } finally {
    stepRunInProgress = false
    updateUI()
  }
}

async function runDemoStep(stepIndex: number) {
  if (demoStepRunInProgress || !demoRenderer) return
  demoStepRunInProgress = true
  // Update state synchronously so the user sees responsive feedback even if
  // the underlying chart re-run takes time or fails silently.
  demoSelectedStepIndex = stepIndex
  demoStepsUnlocked = Math.max(demoStepsUnlocked, stepIndex + 1)
  renderDemoExplanation()
  try {
    await Promise.race([
      demoRenderer.renderStep(stepIndex),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ])
    demoErrors.delete(stepIndex)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] demo renderStep failed', { stepIndex, error })
    demoErrors.set(stepIndex, message)
  } finally {
    demoStepRunInProgress = false
    renderDemoExplanation()
  }
}

function renderDemoExplanation() {
  buildSentenceSpans(introDemoExplanationEl, demoStepTexts, {
    selectedStepIndex: demoSelectedStepIndex,
    stepsUnlocked: demoStepsUnlocked,
    stepErrors: demoErrors,
    stepRunInProgress: demoStepRunInProgress,
    onClick: (i) => { void runDemoStep(i) },
  })
}

async function ensureDemoLoaded() {
  if (demoRenderer) return
  const demoContext: RendererContext = { ...rendererContext, container: introDemoChartEl }
  const renderer = new SvgRenderer(demoContext)
  try {
    await renderer.loadChart(EVAL_TUTORIAL_CHART_ID)
  } catch (error) {
    console.error('[evaluation] demo chart load failed', error)
    introDemoChartEl.innerHTML = '<div class="renderer-empty">Demo chart unavailable.</div>'
    demoStepTexts = []
    return
  }
  try {
    await renderer.renderStep(-1)
  } catch (error) {
    console.error('[evaluation] demo base render failed', error)
  }
  demoRenderer = renderer
  demoChartId = EVAL_TUTORIAL_CHART_ID
  demoStepTexts = renderer.getStepTexts()
  demoStepsUnlocked = 0
  demoSelectedStepIndex = -1
  demoErrors = new Map()
}

function teardownDemo() {
  if (demoRenderer) {
    demoRenderer.teardown()
    demoRenderer = null
  }
  demoChartId = ''
  demoStepTexts = []
  demoStepsUnlocked = 0
  demoSelectedStepIndex = -1
  demoErrors = new Map()
  introDemoChartEl.innerHTML = ''
  introDemoExplanationEl.innerHTML = ''
}

async function renderIntroPage(kind: IntroKind) {
  introCardEl.hidden = false
  chartCardEl.hidden = true
  bottomAreaEl.hidden = true
  taskBannerEl.hidden = true

  if (kind === 'intro-welcome') {
    introEyebrowEl.textContent = 'WELCOME'
    introTitleEl.textContent = 'Compistional Chart Question and Explanation Study'
    introBodyEl.innerHTML = WELCOME_BODY_HTML.replace('{code}', participant.code)
    introDemoEl.hidden = true
    return
  }

  if (kind === 'tutorial-interact') {
    introEyebrowEl.textContent = 'TUTORIAL · 1 OF 2'
    introTitleEl.textContent = 'How the Visual Explanation Works'
    introBodyEl.innerHTML = TUTORIAL_INTERACT_BODY_HTML
    introDemoEl.hidden = false
    introDemoHintEl.textContent = '↑ Try clicking each block to see how the chart changes.'

    await ensureDemoLoaded()
    const demoEntry = charts[demoChartId]
    introDemoQuestionEl.textContent = demoEntry?.question ?? ''
    renderDemoExplanation()
    return
  }

  // tutorial-task
  introEyebrowEl.textContent = 'TUTORIAL · 2 OF 2'
  introTitleEl.textContent = 'Your Task'
  introBodyEl.innerHTML = TUTORIAL_TASK_BODY_HTML.replace(/\{sequenceLength\}/g, String(sequence.length))
  introDemoEl.hidden = true
}

function showSurveyLayout() {
  introCardEl.hidden = true
  chartCardEl.hidden = false
  bottomAreaEl.hidden = false
  taskBannerEl.hidden = false
  introDemoEl.hidden = true
}

function updateUI() {
  const page = allPages[currentPageIndex]
  const totalPages = allPages.length

  prevBtn.disabled = currentPageIndex === 0 || stepRunInProgress
  nextBtn.disabled = currentPageIndex === totalPages - 1 || stepRunInProgress

  const pct = totalPages > 0 ? Math.round((currentPageIndex + 1) / totalPages * 100) : 0
  progressFillEl.style.width = `${pct}%`
  progressTrackEl.setAttribute('aria-valuenow', String(pct))
  surveyWarningEl.textContent = ''

  if (!page || page.kind !== 'survey') {
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    debugMetaEl.textContent = ''
    if (page?.kind === 'intro-welcome') progressLabelEl.textContent = 'Introduction · 1 of 3'
    else if (page?.kind === 'tutorial-interact') progressLabelEl.textContent = 'Introduction · 2 of 3'
    else if (page?.kind === 'tutorial-task') progressLabelEl.textContent = 'Introduction · 3 of 3'
    else progressLabelEl.textContent = ''
    return
  }

  const item = sequence[page.itemIdx]
  progressLabelEl.textContent = `Page ${currentPageIndex + 1} of ${totalPages}`
  if (methodBadgeEl) methodBadgeEl.textContent = `Question ${page.itemIdx + 1} / ${sequence.length}`
  questionEl.textContent = item.question
  descriptionEl.textContent = ''
  debugMetaEl.textContent = `System ${item.system} · Group ${item.group} · ID ${item.chart_id}`

  const stepTexts = currentRenderer?.getStepTexts() ?? []
  buildSentenceSpans(explanationEl, stepTexts, {
    selectedStepIndex,
    stepsUnlocked,
    stepErrors,
    stepRunInProgress,
    onClick: (i) => { void runStep(i) },
  })

  renderSurveyPage()
}

async function activateItem(item: SequenceItem) {
  const key = getItemKey(item)
  if (currentRenderer && currentItemKey === key) return
  if (currentRenderer) {
    currentRenderer.teardown()
    currentRenderer = null
  }
  containerEl.innerHTML = ''
  stepsUnlocked = 0
  selectedStepIndex = -1
  stepErrors = new Map()
  statusEl.className = ''
  statusEl.textContent = ''

  try {
    const renderer = createRenderer(item.method)
    await renderer.loadChart(item.chart_id)
    currentRenderer = renderer
    currentItemKey = key
    await renderer.renderStep(-1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] activateItem failed', { item, error })
    statusEl.className = 'status--error'
    statusEl.textContent = `Failed to load (${item.method}) for ${item.chart_id}: ${message}`
    currentItemKey = key
  }
}

async function loadPage(idx: number) {
  const nextPageIndex = clampPageIndex(idx)
  currentPageIndex = nextPageIndex
  const page = allPages[nextPageIndex]
  if (!page) return

  if (page.kind === 'survey') {
    showSurveyLayout()
    const item = sequence[page.itemIdx]
    const itemChanged = page.itemIdx !== currentItemIndex || currentRenderer == null
    currentItemIndex = page.itemIdx
    if (itemChanged) await activateItem(item)
    updateUI()
    return
  }

  currentItemIndex = -1
  await renderIntroPage(page.kind)
  updateUI()
}

function navigateToPage(idx: number, replace = false) {
  const next = clampPageIndex(idx)
  syncPageUrl(next, replace)
  void loadPage(next)
}

prevBtn.addEventListener('click', () => navigateToPage(currentPageIndex - 1))
nextBtn.addEventListener('click', () => {
  if (!isSurveyPageComplete()) {
    surveyWarningEl.textContent = 'Please answer all questions before proceeding.'
    surveyWarningEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    return
  }
  surveyWarningEl.textContent = ''
  navigateToPage(currentPageIndex + 1)
})

window.addEventListener('popstate', () => {
  void loadPage(getPageIndexFromUrl())
})

syncPageUrl(currentPageIndex, true)
void loadPage(currentPageIndex)
