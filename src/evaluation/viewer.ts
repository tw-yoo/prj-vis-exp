import {
  loadSession,
  clearSession,
  buildSequence,
  type ParticipantData,
  type SequenceItem,
  type OrderSystemFile,
  type OrderChartFile,
  type ChartGroupFile,
} from './participantSession'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './renderers/types'
import { OursRenderer } from './renderers/oursRenderer'
import { BaselineRenderer } from './renderers/baselineRenderer'
import { loadFirestoreSettings, getDocumentFields, patchDocumentFields, type FirestoreSettings, type FsJson } from './firestore'

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

type ScaleLabels = { low: string; high: string }

type SurveyQuestion = {
  id: string
  text: string
  kind: 'yes-no' | 'likert7' | 'text'
  scale?: ScaleLabels
}

type SurveyPage = {
  questions: SurveyQuestion[]
}

type IntroKind = 'intro-welcome' | 'tutorial-interact' | 'tutorial-task'

// One block = the 5 charts a participant sees for a single (system, group) pair.
type SessionBlock = { system: string; group: string; startIdx: number; endIdx: number }

// A draggable system in the final ranking. `label` (System A/B/C) is shown to
// the participant; `system` (Ours/B1/B2) is recorded internally.
type FinalItem = { key: string; label: string; system: string }

type PageDescriptor =
  | { kind: IntroKind }
  | { kind: 'survey'; itemIdx: number; surveyPageIdx: number }
  | { kind: 'post-session'; blockIdx: number }
  | { kind: 'final' }

const surveyPages: SurveyPage[] = [
  {
    questions: [
      // {
      //   id: 'answer-correct',
      //   text: 'The answer is correct.',
      //   kind: 'yes-no',
      // },
    ],
  },
  {
    questions: [
      // H2 (understanding) + H3 (transparency). Trust (H3) is measured per
      // system on the post-session page, not here.
      // { id: 'reasoning-easy', text: 'The explanation was easy to understand.', kind: 'likert7' },
      // { id: 'derivation-clear', text: 'The explanation was transparent.', kind: 'likert7' },
    ],
  },
]

const AGREE_SCALE: ScaleLabels = { low: 'Strongly disagree', high: 'Strongly agree' }

// Shown once at the END of each system block (after that system's 5 charts):
// the 6 NASA-TLX cognitive-load dimensions, phrased about "this explanation" as
// agreement statements on a Strongly disagree–Strongly agree scale (note:
// tlx-performance is positively valenced, the others negatively) + an optional
// open-ended. The system identity (Ours/B1/B2) is not revealed.
const postSessionQuestions: SurveyQuestion[] = [
  { id: 'tlx-mental', text: 'Understanding this explanation was mentally demanding.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-physical', text: 'Understanding this explanation was physically demanding.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-temporal', text: 'I felt hurried or rushed while going through this explanation.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-performance', text: 'I was successful in understanding the explanation.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-effort', text: 'I had to work hard to understand this explanation.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-frustration', text: 'I felt frustrated, irritated, or stressed while going through this explanation.', kind: 'likert7', scale: AGREE_SCALE },
  // Per-system open-ended (optional).
  { id: 'open-feedback', text: 'What helped or made this system hard to use? (optional)', kind: 'text' },
]

const RANKING_DIMENSIONS: Array<{ id: string; promptHtml: string }> = [
  { id: 'trust', promptHtml: 'Rank the three systems by <strong>how much you trusted the explanation</strong>, from the one you trusted <strong>most (1)</strong> to the one you trusted <strong>least (3)</strong>. Drag each system into a numbered slot.' },
  { id: 'transparency', promptHtml: 'Rank the three systems by <strong>how clearly the explanation showed how the answer was reached</strong>, from the <strong>clearest (1)</strong> to the <strong>least clear (3)</strong>. Drag each system into a numbered slot.' },
  { id: 'error-detection', promptHtml: 'Rank the three systems by <strong>how easily you could tell whether the explanation was correct or contained a mistake</strong>, from the <strong>easiest (1)</strong> to the <strong>hardest (3)</strong>. Drag each system into a numbered slot.' },
  { id: 'ease', promptHtml: 'Rank the three systems by <strong>how easy the explanation was to understand</strong>, from the <strong>easiest (1)</strong> to the <strong>hardest (3)</strong>. Drag each system into a numbered slot.' },
  { id: 'preference', promptHtml: 'Rank the three systems by <strong>which you would most prefer to use</strong>, from <strong>most preferred (1)</strong> to <strong>least preferred (3)</strong>. Drag each system into a numbered slot.' },
]

const INTRO_PAGE_KINDS: IntroKind[] = ['intro-welcome', 'tutorial-interact', 'tutorial-task']
const EVAL_TUTORIAL_CHART_ID = '1gdzafocxmz7rswi'

const WELCOME_BODY_HTML = `
  <p>Thank you for participating in this research study.</p>
  <p>We are investigating how different <strong>visual explanations</strong> help people understand and verify answers to questions about charts.</p>
  <p>In this study, you will see a series of charts paired with questions and AI-generated answers. For each pair, a step-by-step visual explanation will show how the answer was derived. <strong>Three different explanation systems</strong> are compared in this study; you will see explanations from all three throughout the survey.</p>
  <p>Your task on each question:</p>
  <ol>
    <li>Decide whether the provided answer is correct.</li>
    <li>Rate how clearly the explanation showed the reasoning behind the answer.</li>
  </ol>
  <p>The study takes about <strong>70&ndash;90 minutes</strong>. Your responses are anonymous and linked only to your participant code (<code>{code}</code>).</p>
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
      <li><strong>Answer the first question accurately.</strong> We measure how long you take to answer the "The answer is correct." question on each page. Please stay focused and respond as accurate as you have made your decision.</li>
      <li><strong>Use external tools freely.</strong> A calculator or scrap paper is fine if you need to verify a calculation &mdash; just try to keep it brief.</li>
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
const surveyEl = document.getElementById('surveyArea') as HTMLFormElement
const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement
const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement
const nextBtnLabel = nextBtn.querySelector('.nav-btn__label') as HTMLElement
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
const reviewPanelEl = document.getElementById('reviewPanel') as HTMLElement
const postSessionHeadingEl = document.getElementById('postSessionHeading') as HTMLElement
const reviewPrevBtn = document.getElementById('reviewPrev') as HTMLButtonElement
const reviewNextBtn = document.getElementById('reviewNext') as HTMLButtonElement
const reviewCounterEl = document.getElementById('reviewCounter') as HTMLElement
const reviewChartEl = document.getElementById('reviewChart') as HTMLElement
const reviewQuestionEl = document.getElementById('reviewQuestion') as HTMLElement
const reviewExplanationEl = document.getElementById('reviewExplanation') as HTMLElement

const chartMap = await fetch(withBase('/chart_map.json')).then((r) => r.json()) as ChartMap
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
// Group the flat sequence into blocks (one (system, group) pair = 5 charts).
const blocks: SessionBlock[] = (() => {
  const result: SessionBlock[] = []
  sequence.forEach((item, i) => {
    const last = result[result.length - 1]
    if (last && last.system === item.system && last.group === item.group) {
      last.endIdx = i
    } else {
      result.push({ system: item.system, group: item.group, startIdx: i, endIdx: i })
    }
  })
  return result
})()

// The 3 systems, labelled A/B/C in presentation (block) order, for the final
// ranking. The label is participant-facing; `system` (Ours/B1/B2) is internal.
const finalItems: FinalItem[] = blocks.map((block, i) => ({
  key: String.fromCharCode(65 + i),
  label: `System ${String.fromCharCode(65 + i)}`,
  system: block.system,
}))

// Page flow: 3 intros, then per block [ each chart's survey pages, then one
// post-session reflection page ], then one final ranking + comments page.
const allPages: PageDescriptor[] = (() => {
  const pages: PageDescriptor[] = INTRO_PAGE_KINDS.map((kind) => ({ kind }))
  blocks.forEach((block, blockIdx) => {
    for (let i = block.startIdx; i <= block.endIdx; i += 1) {
      for (let j = 0; j < surveyPages.length; j += 1) {
        pages.push({ kind: 'survey', itemIdx: i, surveyPageIdx: j })
      }
    }
    pages.push({ kind: 'post-session', blockIdx })
  })
  pages.push({ kind: 'final' })
  return pages
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
// Accumulated dwell time (ms) on each chart's Yes/No page, summed across visits.
const responseTimes = new Map<string, number>()
let activeTimer: { chartId: string; startedAt: number } | null = null
let firestoreSettings: FirestoreSettings | null = null
let persistenceReady = false
let saveTimer: number | null = null

let demoRenderer: ExplanationRenderer | null = null
let demoChartId = ''
let demoStepTexts: string[] = []
let demoAnswer = ''
let demoStepsUnlocked = 0
let demoSelectedStepIndex = -1
let demoStepRunInProgress = false
let demoErrors = new Map<number, string>()

// Post-session review carousel: replay this system's 5 chart/question/
// explanation sets one at a time, above the survey. Mirrors the demo pattern
// (a renderer pointed at its own container + interactive steps).
const reviewContext: RendererContext = { ...rendererContext, container: reviewChartEl }
let reviewItems: SequenceItem[] = []
let reviewIdx = 0
let reviewRenderer: ExplanationRenderer | null = null
let reviewStepTexts: string[] = []
let reviewStepsUnlocked = 0
let reviewSelectedStepIndex = -1
let reviewStepRunInProgress = false
let reviewErrors = new Map<number, string>()

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

function createRenderer(method: ExplanationMethod, context: RendererContext = rendererContext): ExplanationRenderer {
  if (method === 'ours') return new OursRenderer(context)
  if (method === 'b1') return new BaselineRenderer(context, 'b1')
  if (method === 'b2') return new BaselineRenderer(context, 'b2')
  throw new Error(`Unknown method: ${method}`)
}

// Unifies the two survey contexts: per-chart survey pages and the per-system
// post-session page. `keyPrefix` makes input names + stored responses unique.
type SurveyContext = { questions: SurveyQuestion[]; keyPrefix: string }

function currentSurveyContext(): SurveyContext | null {
  const page = allPages[currentPageIndex]
  if (!page) return null
  if (page.kind === 'survey') {
    const item = sequence[page.itemIdx]
    const surveyPage = surveyPages[page.surveyPageIdx]
    if (!item || !surveyPage) return null
    return { questions: surveyPage.questions, keyPrefix: `${getItemKey(item)}:${page.surveyPageIdx}` }
  }
  if (page.kind === 'post-session') {
    const block = blocks[page.blockIdx]
    if (!block) return null
    return { questions: postSessionQuestions, keyPrefix: `postsession:${block.system}` }
  }
  return null
}

function fieldKey(keyPrefix: string, questionId: string): string {
  return `${keyPrefix}::${questionId}`
}

function renderSurveyQuestion(question: SurveyQuestion, keyPrefix: string): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset')
  fieldset.className = `survey-question survey-question--${question.kind === 'yes-no' ? 'choice' : 'likert'}`

  const legend = document.createElement('legend')
  legend.className = 'survey-question__text'
  legend.textContent = question.text
  fieldset.appendChild(legend)

  const name = fieldKey(keyPrefix, question.id)
  const selectedValue = surveyResponses.get(name)

  const buildOption = (value: string, optionClass: string) => {
    const label = document.createElement('label')
    label.className = optionClass

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = name
    input.value = value
    input.checked = selectedValue === value

    label.addEventListener('click', () => {
      surveyResponses.set(name, value)
      scheduleSave()
    })

    const text = document.createElement('span')
    text.className = `${optionClass}__label`
    text.textContent = value

    label.appendChild(input)
    label.appendChild(text)
    return label
  }

  if (question.kind === 'yes-no') {
    const hint = document.createElement('p')
    hint.className = 'survey-question__hint'
    hint.textContent = '(Answer this question as accurate as possible)'
    fieldset.appendChild(hint)

    const row = document.createElement('div')
    row.className = 'choice-row'
    ;['Yes', 'No'].forEach((opt) => row.appendChild(buildOption(opt, 'choice-option')))
    fieldset.appendChild(row)
  } else if (question.kind === 'text') {
    const textarea = document.createElement('textarea')
    textarea.className = 'survey-text'
    textarea.rows = 3
    textarea.name = name
    textarea.value = surveyResponses.get(name) ?? ''
    textarea.addEventListener('input', () => { surveyResponses.set(name, textarea.value); scheduleSave() })
    fieldset.appendChild(textarea)
  } else {
    const labels = question.scale ?? { low: 'Strongly disagree', high: 'Strongly agree' }
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
    leftLabel.textContent = labels.low
    const rightLabel = document.createElement('span')
    rightLabel.className = 'likert-scale__endpoint likert-scale__endpoint--high'
    rightLabel.textContent = labels.high
    endpoints.appendChild(leftLabel)
    endpoints.appendChild(rightLabel)
    scale.appendChild(endpoints)

    fieldset.appendChild(scale)
  }

  return fieldset
}

function renderSurveyPage() {
  surveyEl.innerHTML = ''
  const ctx = currentSurveyContext()
  if (!ctx) return
  ctx.questions.forEach((q) => surveyEl.appendChild(renderSurveyQuestion(q, ctx.keyPrefix)))
}

function isSurveyPageComplete(): boolean {
  const ctx = currentSurveyContext()
  if (!ctx) return true
  return ctx.questions.every((q) => {
    if (q.kind === 'text') return true // open-ended is optional
    const name = fieldKey(ctx.keyPrefix, q.id)
    return surveyEl.querySelector(`input[name="${CSS.escape(name)}"]:checked`) !== null
  })
}

// Stop timing the current Yes/No page and add the elapsed time to its running
// total (so revisits accumulate). Idempotent when no timer is active.
function flushTimer() {
  if (!activeTimer) return
  const elapsed = Math.max(0, performance.now() - activeTimer.startedAt)
  responseTimes.set(activeTimer.chartId, (responseTimes.get(activeTimer.chartId) ?? 0) + elapsed)
  activeTimer = null
}

// Per-participant document, structured for later aggregation across participants.
// One doc per code: evaluation_responses/{code}.
function buildSubmission(): Record<string, FsJson> {
  const charts: Record<string, FsJson> = {}
  sequence.forEach((item) => {
    const k = getItemKey(item)
    const ratings: Record<string, FsJson> = {}
    surveyPages[1].questions.forEach((q) => {
      const v = surveyResponses.get(`${k}:1::${q.id}`)
      if (v != null) ratings[q.id] = v
    })
    charts[item.chart_id] = {
      system: item.system,
      group: item.group,
      answerCorrect: surveyResponses.get(`${k}:0::answer-correct`) ?? '',
      responseTimeMs: Math.round(responseTimes.get(item.chart_id) ?? 0),
      ratings,
    }
  })

  const postSession: Record<string, FsJson> = {}
  blocks.forEach((block) => {
    const obj: Record<string, FsJson> = {}
    postSessionQuestions.forEach((q) => {
      const v = surveyResponses.get(`postsession:${block.system}::${q.id}`)
      if (v != null) obj[q.id] = v
    })
    postSession[block.system] = obj
  })

  // One ranking per dimension: rankings[dim] = { '1': system, '2': system, '3': system }.
  const rankings: Record<string, FsJson> = {}
  RANKING_DIMENSIONS.forEach((dim) => {
    const ranks: Record<string, FsJson> = {}
    ;(['1', '2', '3'] as const).forEach((n) => {
      const v = surveyResponses.get(`final::rank-${dim.id}-${n}`)
      if (v != null) ranks[n] = v
    })
    rankings[dim.id] = ranks
  })
  const systems: Record<string, FsJson> = {}
  finalItems.forEach((it) => { systems[it.key] = it.system })

  return {
    code: participant.code,
    order: { system: participant.order.system, chart: participant.order.chart },
    systems,
    sequence: sequence.map((it) => ({ chart_id: it.chart_id, system: it.system, group: it.group })),
    charts,
    postSession,
    final: { rankings, comment: surveyResponses.get('final::comment') ?? '' },
    updatedAt: new Date().toISOString(),
  }
}

// Restore in-memory state from a previously saved document, so back/forward and
// reloads both show prior answers.
function hydrateFromDoc(fields: Record<string, FsJson>) {
  const charts = (fields.charts as Record<string, any>) ?? {}
  sequence.forEach((item) => {
    const c = charts[item.chart_id]
    if (!c || typeof c !== 'object') return
    const k = getItemKey(item)
    if (c.answerCorrect) surveyResponses.set(`${k}:0::answer-correct`, String(c.answerCorrect))
    if (typeof c.responseTimeMs === 'number') responseTimes.set(item.chart_id, c.responseTimeMs)
    Object.entries(c.ratings ?? {}).forEach(([qid, val]) => {
      if (val != null && val !== '') surveyResponses.set(`${k}:1::${qid}`, String(val))
    })
  })
  Object.entries((fields.postSession as Record<string, any>) ?? {}).forEach(([system, obj]) => {
    Object.entries((obj as Record<string, any>) ?? {}).forEach(([qid, val]) => {
      if (val != null && val !== '') surveyResponses.set(`postsession:${system}::${qid}`, String(val))
    })
  })
  const final = (fields.final as any) ?? {}
  Object.entries(final.rankings ?? {}).forEach(([dimId, ranks]) => {
    Object.entries((ranks as Record<string, any>) ?? {}).forEach(([n, system]) => {
      if (system != null && system !== '') surveyResponses.set(`final::rank-${dimId}-${n}`, String(system))
    })
  })
  if (typeof final.comment === 'string' && final.comment) surveyResponses.set('final::comment', final.comment)
}

async function saveNow(keepalive = false) {
  if (!firestoreSettings || !persistenceReady) return
  try {
    await patchDocumentFields(firestoreSettings, ['evaluation_responses', participant.code], buildSubmission(), keepalive)
  } catch (error) {
    console.error('[evaluation] save failed', error)
  }
}

function scheduleSave() {
  if (saveTimer != null) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { saveTimer = null; void saveNow() }, 600)
}

// Final page: one drag-and-drop ranking per RANKING_DIMENSIONS entry (the 3
// systems A/B/C into numbered slots 1..3), plus an optional free-text comment.
// Each dimension's ranking is stored as `final::rank-{dim.id}-{1,2,3}` -> system;
// comment as `final::comment`. Rebuilt from stored responses on every render so
// it survives back/forward navigation.
function renderFinalPage() {
  surveyEl.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'final-survey'

  const doneNote = document.createElement('p')
  doneNote.className = 'final-done'
  doneNote.hidden = true
  doneNote.textContent = 'Thank you — you have completed the study.'

  // Keep the "done" note and Submit button in sync with full completion (all
  // rankings filled). Recomputed from surveyResponses across every widget.
  const syncDoneAndNav = () => {
    doneNote.hidden = !isFinalComplete()
    updateFinalNav()
  }

  // One self-contained ranking widget: its own 3 chips + 3 slots, lookups scoped
  // to this widget's board, storing into `final::rank-{dim.id}-{1,2,3}`.
  const buildRanking = (dim: { id: string; promptHtml: string }) => {
    const section = document.createElement('section')
    section.className = 'final-section'
    const prompt = document.createElement('p')
    prompt.className = 'final-prompt'
    prompt.innerHTML = dim.promptHtml
    section.appendChild(prompt)

    const board = document.createElement('div')
    board.className = 'rank-board'

    const pool = document.createElement('div')
    pool.className = 'rank-pool'
    const poolHint = document.createElement('div')
    poolHint.className = 'rank-pool__hint'
    poolHint.textContent = 'Systems'
    const poolDrop = document.createElement('div')
    poolDrop.className = 'rank-pool__drop'
    pool.append(poolHint, poolDrop)

    const slotsWrap = document.createElement('div')
    slotsWrap.className = 'rank-slots'
    const slotDrops: HTMLElement[] = []
    ;[1, 2, 3].forEach((n) => {
      const slot = document.createElement('div')
      slot.className = 'rank-slot'
      const num = document.createElement('div')
      num.className = 'rank-slot__num'
      num.textContent = String(n)
      const drop = document.createElement('div')
      drop.className = 'rank-slot__drop'
      drop.dataset.rank = String(n)
      slot.append(num, drop)
      slotsWrap.appendChild(slot)
      slotDrops.push(drop)
    })

    board.append(pool, slotsWrap)
    section.appendChild(board)

    const findChip = (key: string) => board.querySelector<HTMLElement>(`.rank-item[data-item="${CSS.escape(key)}"]`)

    const updateState = () => {
      slotDrops.forEach((drop) => {
        const chip = drop.querySelector<HTMLElement>('.rank-item')
        const rank = drop.dataset.rank as string
        const item = chip ? finalItems.find((it) => it.key === chip.dataset.item) : undefined
        if (item) surveyResponses.set(`final::rank-${dim.id}-${rank}`, item.system)
        else surveyResponses.delete(`final::rank-${dim.id}-${rank}`)
      })
      syncDoneAndNav()
      scheduleSave()
    }

    const makeChip = (item: FinalItem) => {
      const chip = document.createElement('div')
      chip.className = 'rank-item'
      chip.draggable = true
      chip.dataset.item = item.key
      chip.textContent = item.label
      chip.addEventListener('dragstart', (e) => {
        chip.classList.add('rank-item--dragging')
        e.dataTransfer?.setData('text/plain', item.key)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      })
      chip.addEventListener('dragend', () => chip.classList.remove('rank-item--dragging'))
      return chip
    }

    const wireZone = (zone: HTMLElement, isSlot: boolean) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('rank-drop--over') })
      zone.addEventListener('dragleave', () => zone.classList.remove('rank-drop--over'))
      zone.addEventListener('drop', (e) => {
        e.preventDefault()
        zone.classList.remove('rank-drop--over')
        const key = e.dataTransfer?.getData('text/plain')
        const chip = key ? findChip(key) : null
        if (!chip) return
        const origin = chip.parentElement as HTMLElement | null
        if (isSlot) {
          // A slot holds one chip: displace the current occupant (swap back to
          // the dragged chip's slot, or to the pool).
          const existing = zone.querySelector<HTMLElement>('.rank-item')
          if (existing && existing !== chip) {
            if (origin && origin.classList.contains('rank-slot__drop')) origin.appendChild(existing)
            else poolDrop.appendChild(existing)
          }
        }
        zone.appendChild(chip)
        updateState()
      })
    }

    wireZone(poolDrop, false)
    slotDrops.forEach((drop) => wireZone(drop, true))

    // Initial placement: restore saved ranks, otherwise everything in the pool.
    finalItems.forEach((item) => {
      const chip = makeChip(item)
      const savedRank = (['1', '2', '3'] as const).find((r) => surveyResponses.get(`final::rank-${dim.id}-${r}`) === item.system)
      if (savedRank) slotDrops[Number(savedRank) - 1].appendChild(chip)
      else poolDrop.appendChild(chip)
    })
    updateState()
    return section
  }

  RANKING_DIMENSIONS.forEach((dim) => wrap.appendChild(buildRanking(dim)))
  wrap.appendChild(doneNote)

  // --- Any other comments (optional) ---
  const commentSection = document.createElement('section')
  commentSection.className = 'final-section'
  const commentLabel = document.createElement('label')
  commentLabel.className = 'final-prompt'
  commentLabel.htmlFor = 'finalComment'
  commentLabel.textContent = 'Any other comments? (optional)'
  const commentInput = document.createElement('textarea')
  commentInput.id = 'finalComment'
  commentInput.className = 'final-comment'
  commentInput.rows = 4
  commentInput.value = surveyResponses.get('final::comment') ?? ''
  commentInput.addEventListener('input', () => { surveyResponses.set('final::comment', commentInput.value); scheduleSave() })
  commentSection.append(commentLabel, commentInput)
  wrap.appendChild(commentSection)

  surveyEl.appendChild(wrap)
  syncDoneAndNav()
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
  answer = '',
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

  // The proposed answer the participant verifies, shown below the reasoning
  // steps (value comes from chart_group.json's `answer` per chart).
  const answerText = answer.trim()
  if (answerText) {
    const answerEl = document.createElement('div')
    answerEl.className = 'explanation-answer'
    const label = document.createElement('span')
    label.className = 'explanation-answer__label'
    label.textContent = 'Answer:'
    const value = document.createElement('span')
    value.className = 'explanation-answer__value'
    value.textContent = answerText
    answerEl.append(label, ' ', value)
    container.appendChild(answerEl)
  }
}

async function runStep(stepIndex: number) {
  if (stepRunInProgress || !currentRenderer) return
  // Re-clicking the currently shown step undoes it: step back to the previous
  // step, or to the original chart (renderStep(-1)) when undoing the first step.
  const isUndo = stepIndex === selectedStepIndex
  const target = isUndo ? stepIndex - 1 : stepIndex
  stepRunInProgress = true
  updateUI()

  try {
    await currentRenderer.renderStep(target)
    selectedStepIndex = target
    stepsUnlocked = isUndo ? target + 1 : Math.max(stepsUnlocked, target + 1)
    if (target >= 0) stepErrors.delete(target)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] renderStep failed', { itemKey: currentItemKey, stepIndex: target, error })
    if (target >= 0) stepErrors.set(target, message)
    selectedStepIndex = target
  } finally {
    stepRunInProgress = false
    updateUI()
  }
}

async function runDemoStep(stepIndex: number) {
  if (demoStepRunInProgress || !demoRenderer) return
  // Re-clicking the shown step undoes it (back to the previous step / original).
  const isUndo = stepIndex === demoSelectedStepIndex
  const target = isUndo ? stepIndex - 1 : stepIndex
  demoStepRunInProgress = true
  // Update state synchronously so the user sees responsive feedback even if
  // the underlying chart re-run takes time or fails silently.
  demoSelectedStepIndex = target
  demoStepsUnlocked = isUndo ? target + 1 : Math.max(demoStepsUnlocked, target + 1)
  renderDemoExplanation()
  try {
    await Promise.race([
      demoRenderer.renderStep(target),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ])
    if (target >= 0) demoErrors.delete(target)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] demo renderStep failed', { stepIndex: target, error })
    if (target >= 0) demoErrors.set(target, message)
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
  }, demoAnswer)
}

async function ensureDemoLoaded() {
  if (demoRenderer) return
  const demoContext: RendererContext = { ...rendererContext, container: introDemoChartEl }
  const renderer = new BaselineRenderer(demoContext, 'b2')
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
  demoAnswer = Object.values(chartGroup).flatMap((g) => Object.values(g)).find((c) => c.id === EVAL_TUTORIAL_CHART_ID)?.answer ?? ''
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
  demoAnswer = ''
  demoStepsUnlocked = 0
  demoSelectedStepIndex = -1
  demoErrors = new Map()
  introDemoChartEl.innerHTML = ''
  introDemoExplanationEl.innerHTML = ''
}

// ---- Post-session review carousel -------------------------------------------
function renderReviewExplanation() {
  buildSentenceSpans(reviewExplanationEl, reviewStepTexts, {
    selectedStepIndex: reviewSelectedStepIndex,
    stepsUnlocked: reviewStepsUnlocked,
    stepErrors: reviewErrors,
    stepRunInProgress: reviewStepRunInProgress,
    onClick: (i) => { void runReviewStep(i) },
  }, reviewItems[reviewIdx]?.answer ?? '')
}

async function runReviewStep(stepIndex: number) {
  if (reviewStepRunInProgress || !reviewRenderer) return
  // Re-clicking the shown step undoes it (back to the previous step / original).
  const isUndo = stepIndex === reviewSelectedStepIndex
  const target = isUndo ? stepIndex - 1 : stepIndex
  reviewStepRunInProgress = true
  reviewSelectedStepIndex = target
  reviewStepsUnlocked = isUndo ? target + 1 : Math.max(reviewStepsUnlocked, target + 1)
  renderReviewExplanation()
  try {
    await reviewRenderer.renderStep(target)
    if (target >= 0) reviewErrors.delete(target)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] review renderStep failed', { stepIndex: target, error })
    if (target >= 0) reviewErrors.set(target, message)
  } finally {
    reviewStepRunInProgress = false
    renderReviewExplanation()
  }
}

function updateReviewArrows() {
  reviewPrevBtn.disabled = reviewIdx <= 0
  reviewNextBtn.disabled = reviewIdx >= reviewItems.length - 1
  reviewCounterEl.textContent = reviewItems.length ? `Explanation ${reviewIdx + 1} of ${reviewItems.length}` : ''
}

// Load one of the block's items into the review panel and reset its step state.
async function activateReviewItem(idx: number) {
  if (idx < 0 || idx >= reviewItems.length) return
  reviewIdx = idx
  const item = reviewItems[idx]
  if (reviewRenderer) { reviewRenderer.teardown(); reviewRenderer = null }
  reviewChartEl.innerHTML = ''
  reviewStepTexts = []
  reviewStepsUnlocked = 0
  reviewSelectedStepIndex = -1
  reviewStepRunInProgress = false
  reviewErrors = new Map()
  reviewQuestionEl.textContent = item.question
  updateReviewArrows()
  renderReviewExplanation()
  try {
    const renderer = createRenderer(item.method, reviewContext)
    await renderer.loadChart(item.chart_id)
    await renderer.renderStep(-1)
    reviewRenderer = renderer
    reviewStepTexts = renderer.getStepTexts()
  } catch (error) {
    console.error('[evaluation] review item load failed', { item, error })
    reviewChartEl.innerHTML = '<div class="renderer-empty">Explanation unavailable.</div>'
    reviewStepTexts = []
  }
  renderReviewExplanation()
}

async function setupReview(block: SessionBlock | undefined) {
  teardownReview()
  if (!block) return
  reviewItems = sequence.slice(block.startIdx, block.endIdx + 1)
  await activateReviewItem(0)
}

function teardownReview() {
  if (reviewRenderer) { reviewRenderer.teardown(); reviewRenderer = null }
  reviewItems = []
  reviewIdx = 0
  reviewStepTexts = []
  reviewStepsUnlocked = 0
  reviewSelectedStepIndex = -1
  reviewStepRunInProgress = false
  reviewErrors = new Map()
  reviewChartEl.innerHTML = ''
  reviewQuestionEl.textContent = ''
  reviewExplanationEl.innerHTML = ''
  reviewCounterEl.textContent = ''
}

async function renderIntroPage(kind: IntroKind) {
  introCardEl.hidden = false
  chartCardEl.hidden = true
  bottomAreaEl.hidden = true
  taskBannerEl.hidden = true
  introCardEl.classList.toggle('intro-card--welcome', kind === 'intro-welcome')

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
    const tutorialEntry = Object.values(chartGroup).flatMap((g) => Object.values(g)).find((c) => c.id === demoChartId)
    introDemoQuestionEl.textContent = tutorialEntry?.question ?? ''
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

function showPostSessionLayout() {
  introCardEl.hidden = true
  chartCardEl.hidden = true
  bottomAreaEl.hidden = false
  taskBannerEl.hidden = true
  introDemoEl.hidden = true
}

// The final page is complete when all three systems are ranked AND the required
// "reason for your ranking" is non-empty. (The extra free comment is optional.)
function isFinalComplete(): boolean {
  // Complete when every dimension's 3 slots are filled (the open comment is optional).
  return RANKING_DIMENSIONS.every((dim) =>
    (['1', '2', '3'] as const).every((n) => !!surveyResponses.get(`final::rank-${dim.id}-${n}`)),
  )
}

// On the final page the Next button becomes Submit, enabled once the page is complete.
function updateFinalNav() {
  const complete = isFinalComplete()
  nextBtnLabel.textContent = complete ? 'Submit' : 'Next'
  nextBtn.disabled = !complete || stepRunInProgress
}

// Final save to Firebase, then return to the participant-code entry page.
async function submitAndExit() {
  if (!isFinalComplete()) return
  flushTimer()
  if (saveTimer != null) { clearTimeout(saveTimer); saveTimer = null }
  nextBtn.disabled = true
  nextBtnLabel.textContent = 'Submitting…'
  await saveNow()
  clearSession()
  location.assign(withBase('/'))
}

function updateUI() {
  const page = allPages[currentPageIndex]
  const totalPages = allPages.length

  prevBtn.disabled = currentPageIndex === 0 || stepRunInProgress
  nextBtn.disabled = currentPageIndex === totalPages - 1 || stepRunInProgress
  nextBtnLabel.textContent = 'Next'

  const pct = totalPages > 0 ? Math.round((currentPageIndex + 1) / totalPages * 100) : 0
  progressFillEl.style.width = `${pct}%`
  progressTrackEl.setAttribute('aria-valuenow', String(pct))
  surveyWarningEl.textContent = ''

  explanationEl.hidden = false

  // Intro pages.
  if (!page || (page.kind !== 'survey' && page.kind !== 'post-session' && page.kind !== 'final')) {
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    debugMetaEl.textContent = ''
    if (page?.kind === 'intro-welcome') progressLabelEl.textContent = 'Introduction · 1 of 3'
    else if (page?.kind === 'tutorial-interact') progressLabelEl.textContent = 'Introduction · 2 of 3'
    else if (page?.kind === 'tutorial-task') progressLabelEl.textContent = 'Introduction · 3 of 3'
    else progressLabelEl.textContent = ''
    return
  }

  // Final ranking + comments page (no chart).
  if (page.kind === 'final') {
    progressLabelEl.textContent = `Page ${currentPageIndex + 1} of ${totalPages}`
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    debugMetaEl.textContent = `Final · ${finalItems.map((it) => `${it.key}=${it.system}`).join(' ')}`
    questionEl.textContent = 'Final step: rank the systems and share any comments.'
    descriptionEl.textContent = ''
    explanationEl.hidden = true
    explanationEl.innerHTML = ''
    renderFinalPage()
    updateFinalNav()
    return
  }

  // Post-session reflection page (one per system block; no chart).
  if (page.kind === 'post-session') {
    const block = blocks[page.blockIdx]
    progressLabelEl.textContent = `Page ${currentPageIndex + 1} of ${totalPages}`
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    debugMetaEl.textContent = block ? `Post-session · System ${block.system} · Group ${block.group}` : ''
    // Heading sits ABOVE the review carousel (#postSessionHeading); keep the
    // in-flow questionText empty so it is not duplicated below the panel.
    postSessionHeadingEl.textContent = 'You have finished one system. Please answer a few questions about the system you just used.'
    questionEl.textContent = ''
    descriptionEl.textContent = ''
    explanationEl.hidden = true
    explanationEl.innerHTML = ''
    renderSurveyPage()
    return
  }

  // Per-chart survey page.
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
  }, item.answer)

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

  try {
    const renderer = createRenderer(item.method)
    await renderer.loadChart(item.chart_id)
    currentRenderer = renderer
    currentItemKey = key
    await renderer.renderStep(-1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[evaluation] activateItem failed', { item, error })
    currentItemKey = key
  }
}

async function loadPage(idx: number) {
  flushTimer() // accumulate dwell time on the page we are leaving
  const nextPageIndex = clampPageIndex(idx)
  currentPageIndex = nextPageIndex
  const page = allPages[nextPageIndex]
  if (!page) return
  scheduleSave()
  teardownReview()
  reviewPanelEl.hidden = true
  postSessionHeadingEl.hidden = true

  if (page.kind === 'survey') {
    showSurveyLayout()
    const item = sequence[page.itemIdx]
    const itemChanged = page.itemIdx !== currentItemIndex || currentRenderer == null
    currentItemIndex = page.itemIdx
    if (itemChanged) await activateItem(item)
    updateUI()
    // Time the Yes/No page (surveyPageIdx 0) until the participant navigates away.
    if (page.surveyPageIdx === 0) activeTimer = { chartId: item.chart_id, startedAt: performance.now() }
    return
  }

  if (page.kind === 'post-session') {
    currentItemIndex = -1
    showPostSessionLayout()
    updateUI()
    postSessionHeadingEl.hidden = false
    reviewPanelEl.hidden = false
    await setupReview(blocks[page.blockIdx])
    return
  }

  if (page.kind === 'final') {
    currentItemIndex = -1
    showPostSessionLayout()
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
reviewPrevBtn.addEventListener('click', () => { void activateReviewItem(reviewIdx - 1) })
reviewNextBtn.addEventListener('click', () => { void activateReviewItem(reviewIdx + 1) })
nextBtn.addEventListener('click', () => {
  if (allPages[currentPageIndex]?.kind === 'final') {
    void submitAndExit()
    return
  }
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

// Load persisted responses (so back/forward and reloads show prior answers),
// then start. If Firestore is unreachable, the study still runs without saving.
try {
  firestoreSettings = await loadFirestoreSettings(withBase('/config.json'))
  const existing = await getDocumentFields(firestoreSettings, ['evaluation_responses', participant.code])
  if (existing) hydrateFromDoc(existing)
  persistenceReady = true
} catch (error) {
  console.error('[evaluation] Firestore unavailable; responses will not be saved.', error)
}

// Best-effort flush of the final dwell + a save when the tab is hidden/closed.
window.addEventListener('pagehide', () => { flushTimer(); void saveNow(true) })

syncPageUrl(currentPageIndex, true)
void loadPage(currentPageIndex)
