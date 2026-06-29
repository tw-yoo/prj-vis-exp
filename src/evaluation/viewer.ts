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
import { TextRenderer } from './renderers/textRenderer'
import { ExpertRenderer } from './renderers/expertRenderer'
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
  kind: 'yes-no' | 'likert7' | 'text' | 'error-localization'
  scale?: ScaleLabels
  required?: boolean  // text questions are optional by default; set true to require
  // Declarative conditional: render (and require) this question only when the
  // predicate holds. The getter reads responses by question id — its own survey
  // page first, then (for per-chart pages) the same item's OTHER survey pages,
  // so a question may depend on an answer given one page earlier (e.g. the
  // error-localization page depends on the Yes/No page). Absent → always
  // shown/required. When the predicate flips to false the question is hidden,
  // its stored responses are reset, and it is dropped from the completeness
  // check; a page whose questions are ALL hidden is skipped during navigation.
  showWhen?: (get: (questionId: string) => string | undefined) => boolean
}

// The 'error-localization' question stores TWO values: the selected step index
// under its own question id, and the free-text reason under this sibling id.
const ERROR_DESCRIPTION_FIELD = 'error-description'

type SurveyPage = {
  questions: SurveyQuestion[]
}

type IntroKind = 'intro-welcome' | 'tutorial-interact' | 'tutorial-text' | 'tutorial-task'

// One block = the 5 charts a participant saw for a single (system, group) pair.
// After full interleaving those 5 charts are scattered across the presentation
// order, so `items` holds them grouped back together (in presentation order) for
// the per-system evaluation + review carousel shown at the end of the study.
type SessionBlock = { system: string; group: string; items: SequenceItem[] }

// A draggable system in the final ranking. `label` (System A/B/C/D) is shown to
// the participant; `system` (Ours/B1/B2/B3) is recorded internally.
type FinalItem = { key: string; label: string; system: string }

type PageDescriptor =
  | { kind: IntroKind }
  | { kind: 'survey'; itemIdx: number; surveyPageIdx: number }
  | { kind: 'post-session'; blockIdx: number }
  | { kind: 'final' }

const surveyPages: SurveyPage[] = [
  // Page 0 — the timed Yes/No judgment ONLY. responseTimeMs measures the dwell
  // on this page until Next is pressed, so nothing else may live here (writing
  // the error reason must NOT count toward the decision time).
  {
    questions: [
      {
        id: 'answer-correct',
        text: 'The answer is correct.',
        kind: 'yes-no',
      },
    ],
  },
  // Page 1 — error localization, on its own (untimed) page AFTER the Yes/No.
  // Shown only when the participant judged the answer wrong ("No"); on "Yes"
  // every question here is hidden and the whole page is skipped by
  // resolveSkips(). They mark the explanation step where the reasoning first
  // goes wrong + describe what is wrong. Both required while shown.
  {
    questions: [
      {
        id: 'first-error-step',
        text: 'At which step does the reasoning first go wrong? Select the step.',
        kind: 'error-localization',
        showWhen: (get) => get('answer-correct') === 'No',
      },
    ],
  },
  // Page 2 — per-chart judgments: ease/understanding (H2), transparency (H3),
  // and usefulness. Trust is measured per system on the post-session page.
  {
    questions: [
      { id: 'reasoning-easy', text: 'The explanation was easy to understand.', kind: 'likert7' },
      { id: 'derivation-clear', text: 'The explanation was transparent.', kind: 'likert7' },
      { id: 'usefulness', text: 'The explanation was useful.', kind: 'likert7' },
    ],
  },
]

// Survey-page indices, used wherever stored response keys (`${itemKey}:${idx}::id`)
// are read or written. Keep in sync with the surveyPages array above.
const YES_NO_PAGE_IDX = 0
const ERROR_LOC_PAGE_IDX = 1
const RATINGS_PAGE_IDX = 2

const AGREE_SCALE: ScaleLabels = { low: 'Strongly disagree', high: 'Strongly agree' }

// Shown once at the END of each system block (after that system's 5 charts):
// per-system summary judgments of the three target constructs (trust,
// usefulness, transparency), then the 6 NASA-TLX cognitive-load dimensions,
// then an optional open-ended. All are agreement statements on a Strongly
// disagree–Strongly agree scale (note: tlx-performance is positively valenced,
// the others negatively). The system identity (Ours/B1/B2/B3) is not revealed.
const postSessionQuestions: SurveyQuestion[] = [
  // Trust / Usefulness / Transparency — measured per system here (the per-chart
  // page measures ease + transparency + usefulness at the single-chart level).
  { id: 'trust', text: 'I trusted the explanations from this system.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'trust-reason', text: 'Why did you choose this response?', kind: 'text', required: true },
  { id: 'usefulness', text: 'The explanations from this system were useful.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'usefulness-reason', text: 'Why did you choose this response?', kind: 'text', required: true },
  { id: 'transparency', text: 'The explanations from this system were transparent.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'transparency-reason', text: 'Why did you choose this response?', kind: 'text', required: true },
  { id: 'tlx-mental', text: 'Understanding this explanation was mentally demanding.', kind: 'likert7', scale: AGREE_SCALE },
  // { id: 'tlx-physical', text: 'Understanding this explanation was physically demanding.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-mental-reason', text: 'Why did you choose this response?', kind: 'text', required: true },
  { id: 'tlx-temporal', text: 'I felt hurried or rushed while going through this explanation.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-temporal-reason', text: 'Why did you choose this response?', kind: 'text', required: true },
  { id: 'tlx-performance', text: 'I was successful in understanding the explanation.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-performance-reason', text: 'Why did you choose this response?', kind: 'text', required: true },
  { id: 'tlx-effort', text: 'I had to work hard to understand this explanation.', kind: 'likert7', scale: AGREE_SCALE },
  // { id: 'tlx-frustration', text: 'I felt frustrated, irritated, or stressed while going through this explanation.', kind: 'likert7', scale: AGREE_SCALE },
  { id: 'tlx-effort-reason', text: 'Why did you choose this response?', kind: 'text', required: true },
  // Per-system open-ended.
  { id: 'best-aspect', text: 'What was the best thing about this system?', kind: 'text', required: true },
  { id: 'worst-aspect', text: 'What was the most disappointing thing about this system?', kind: 'text', required: true },
]

const INTRO_PAGE_KINDS: IntroKind[] = ['intro-welcome', 'tutorial-interact', 'tutorial-text', 'tutorial-task']
// Tutorial demo charts: G5 (backup) charts, so they are NOT in the main-study
// sequence for CO1–CO4 participants (G5 appears only in the PRE practice order).
// The step-by-step practice uses the Ours engine; the text practice uses the
// TextRenderer (the base chart SVG + plain explanation prose). Two different G5
// charts so the two practice pages don't show the same chart twice.
const EVAL_TUTORIAL_CHART_ID = '0vmvmj77j3p6vcy7'
const EVAL_TUTORIAL_TEXT_CHART_ID = '20qa83ih1gn6toqt'

const WELCOME_BODY_HTML = `
  <p>Thank you for participating in this research study.</p>
  <p>We are investigating how different <strong>visual explanations</strong> help people understand and verify answers to questions about charts.</p>
  <p>In this study, you will see a series of charts paired with questions and AI-generated answers. For each pair, an explanation will show how the answer was derived. <strong>Four different explanation systems</strong> are compared in this study; you will see explanations from all four, in a mixed order, throughout the survey.</p>
  <p>Your task on each question:</p>
  <ol>
    <li>Decide whether the provided answer is correct.</li>
    <li>Rate how clearly the explanation showed the reasoning behind the answer.</li>
  </ol>
  <p><strong>These systems can make mistakes while producing an explanation.</strong> The reasoning an explanation shows may itself contain an error. Please decide for yourself whether each answer and its explanation are actually correct &mdash; do not assume they are right.</p>
  <p>The study takes about <strong>70&ndash;90 minutes</strong>. Your responses are anonymous and linked only to your participant code (<code>{code}</code>).</p>
  <p>The next pages will walk you through how the explanations are shown and what we'll ask you to do.</p>
`

// Step-by-step (visual) practice page. The body introduces BOTH formats
// neutrally (the participant meets them in a random order, so both must be
// previewed) and frames the live demo below as the step-by-step format.
const TUTORIAL_INTERACT_BODY_HTML = `
  <p>For each item you will see a chart, a question, and an answer to that question. Each answer comes with an explanation of how the answer was reached.</p>
  <p>Explanations may be presented in <strong>different formats</strong> from one item to the next:</p>
  <ul>
    <li>Some are shown <strong>step by step on the chart</strong> &mdash; pressing the screen or a step block reveals each step in turn.</li>
    <li>Some are shown <strong>as text</strong>, with the full explanation visible all at once. There is nothing to press, and pressing it reveals no further content; the text you see is the whole explanation. This is not an error &mdash; it is simply that explanation's format.</li>
  </ul>
  <p>We will now practice each format once. The example below is the <strong>step-by-step</strong> format &mdash; try pressing the blocks to move through it.</p>
`

// Text-format practice page.
const TUTORIAL_TEXT_BODY_HTML = `
  <p>This explanation is in <strong>text format</strong>. Try pressing it &mdash; it is normal for no further content to appear. Read the text shown and continue.</p>
`

const TUTORIAL_TASK_BODY_HTML = `
  <p>For each of the <strong>{sequenceLength}</strong> questions in this study, please follow these steps:</p>
  <ol>
    <li><strong>Read the chart.</strong> Examine the data carefully (e.g., axes, labels, values.)</li>
    <li><strong>Read the question and the proposed answer.</strong></li>
    <li><strong>Read the explanation.</strong> If it is shown step by step, press each block to move through it; if it is shown as text, the full explanation is already visible.</li>
    <li><strong>Verify the answer.</strong> After reviewing the explanation, decide: Yes (correct) or No (incorrect).</li>
    <li><strong>Rate the explanation.</strong> Two statements use a 7-point scale (Strongly disagree &rarr; Strongly agree).</li>
  </ol>
  <div class="intro-notes">
    <p class="intro-notes__title">Important notes</p>
    <ul>
      <li><strong>Some answers are correct and some are not.</strong> Whether the shown answer is right is exactly what we ask you to judge &mdash; read the explanation and decide for yourself.</li>
      <li><strong>Systems can make mistakes while producing an explanation.</strong> An explanation may go wrong at one of its steps. Do not assume an explanation is correct just because it looks confident &mdash; check the reasoning yourself. If you judge the answer incorrect, you will then be asked which step the reasoning first goes wrong.</li>
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
debugMetaEl.style.display = 'none'
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
if (methodBadgeEl) methodBadgeEl.style.display = 'none' // system/question badge removed from the participant UI
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
//   order.system -> order_system.json -> [Ours, B1, B2, B3]
//   order.chart  -> order_chart.json  -> [G1, G2, G3, G4]
// system i is paired with group i; all paired charts are then fully interleaved
// (shuffled together) into one presentation order, deterministic in the
// participant code (so reloads / ?page navigation stay aligned). The per-system
// evaluations come at the end, not after each system. 4 systems x 5 = 20 items.
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
// Group the interleaved sequence back into per-system blocks, ordered by the
// participant's canonical system order (orderSystem[...]), NOT presentation
// order. This stable order drives the System A/B/C/D labels and the order of the
// per-system evaluation pages shown at the end. Each block's 5 charts are the
// (scattered) items whose `system` matches.
const blocks: SessionBlock[] = (orderSystem[participant.order.system] ?? [])
  .map((system) => ({ system, items: sequence.filter((it) => it.system === system) }))
  .filter((b) => b.items.length > 0)
  .map((b) => ({ system: b.system, group: b.items[0].group, items: b.items }))

// The systems, labelled A/B/C/D in canonical block order, for the per-chart
// label, the per-system evaluation, and the final ranking. The label is
// participant-facing; `system` (Ours/B1/B2/B3) is internal.
const finalItems: FinalItem[] = blocks.map((block, i) => ({
  key: String.fromCharCode(65 + i),
  label: `System ${String.fromCharCode(65 + i)}`,
  system: block.system,
}))

// internal system (Ours/B1/B2/B3) -> participant-facing label ("System A"...).
const systemLabels = new Map(finalItems.map((it) => [it.system, it.label]))
const labelForSystem = (system: string): string => systemLabels.get(system) ?? 'System ?'

// Page flow: 3 intros, then EVERY chart's survey pages in the fully-interleaved
// presentation order (all 20 charts, systems randomized), then the per-system
// evaluation pages (one per system, in canonical A/B/C/D order), then one final
// ranking + comments page.
const allPages: PageDescriptor[] = (() => {
  const pages: PageDescriptor[] = INTRO_PAGE_KINDS.map((kind) => ({ kind }))
  for (let i = 0; i < sequence.length; i += 1) {
    for (let j = 0; j < surveyPages.length; j += 1) {
      pages.push({ kind: 'survey', itemIdx: i, surveyPageIdx: j })
    }
  }
  blocks.forEach((_, blockIdx) => {
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
  // B1 = simple text (chart + explanation prose, no visual annotation).
  // B2 = SVG-scene visual explanation (baselines/B2, scenes filled by pipeline).
  // B3 = expert explanation (validation/ expert modules, baselines/B3/expert).
  if (method === 'ours') return new OursRenderer(context)
  if (method === 'b1') return new TextRenderer(context)
  if (method === 'b2') return new BaselineRenderer(context, 'b2')
  if (method === 'b3') return new ExpertRenderer(context)
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
  fieldset.className = `survey-question survey-question--${
    question.kind === 'yes-no' ? 'choice' : question.kind === 'error-localization' ? 'error-loc' : 'likert'
  }`

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
      handleSurveyChange()
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
  } else if (question.kind === 'error-localization') {
    // (a) Full-width, single-select list of the explanation's step chunks
    //     (currentRenderer.getStepTexts() — Ours steps / B2 scenes / B3 manifest
    //     steps / B1 single chunk). Stores the chosen index under the question id.
    const stepTexts = currentRenderer?.getStepTexts() ?? []
    const selectedStep = surveyResponses.get(name)
    const list = document.createElement('div')
    list.className = 'error-loc-steps'
    stepTexts.forEach((stepText, index) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'error-loc-step'
      const isSelected = selectedStep === String(index)
      btn.classList.toggle('is-selected', isSelected)
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false')

      const badge = document.createElement('span')
      badge.className = 'error-loc-step__badge'
      badge.textContent = String(index + 1)
      const span = document.createElement('span')
      span.className = 'error-loc-step__text'
      span.textContent = stepText

      btn.appendChild(badge)
      btn.appendChild(span)
      btn.addEventListener('click', () => {
        surveyResponses.set(name, String(index))
        // Single-select highlight without a full re-render (visibility unchanged).
        list.querySelectorAll('.error-loc-step').forEach((el) => {
          const on = el === btn
          el.classList.toggle('is-selected', on)
          el.setAttribute('aria-pressed', on ? 'true' : 'false')
        })
        scheduleSave()
      })
      list.appendChild(btn)
    })
    if (stepTexts.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'survey-question__hint'
      empty.textContent = 'No explanation steps are available for this item.'
      list.appendChild(empty)
    }
    fieldset.appendChild(list)

    // (b) Required free-text reason for the selected step.
    const descName = fieldKey(keyPrefix, ERROR_DESCRIPTION_FIELD)
    const descLabel = document.createElement('label')
    descLabel.className = 'error-loc-desc__label'
    descLabel.htmlFor = descName
    descLabel.textContent = 'Describe what is wrong with this step.'
    fieldset.appendChild(descLabel)

    const descArea = document.createElement('textarea')
    descArea.className = 'survey-text'
    descArea.rows = 3
    descArea.id = descName
    descArea.name = descName
    descArea.value = surveyResponses.get(descName) ?? ''
    descArea.addEventListener('input', () => { surveyResponses.set(descName, descArea.value); scheduleSave() })
    fieldset.appendChild(descArea)
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

// True iff a question should be shown/required right now (its showWhen holds).
// The getter checks the question's own page first, then — for per-chart survey
// prefixes (`${itemKey}:${pageIdx}`) — the same item's other survey pages, so
// the error-localization page can read the Yes/No given one page earlier.
// Questions without showWhen always show.
function isQuestionVisible(question: SurveyQuestion, keyPrefix: string): boolean {
  if (!question.showWhen) return true
  return question.showWhen((id) => {
    const own = surveyResponses.get(fieldKey(keyPrefix, id))
    if (own != null) return own
    const itemScope = keyPrefix.match(/^(.+):(\d+)$/)
    if (!itemScope) return undefined
    for (let j = 0; j < surveyPages.length; j += 1) {
      const v = surveyResponses.get(fieldKey(`${itemScope[1]}:${j}`, id))
      if (v != null) return v
    }
    return undefined
  })
}

function appendReasonTextarea(fieldset: HTMLFieldSetElement, question: SurveyQuestion, keyPrefix: string) {
  const name = fieldKey(keyPrefix, question.id)
  const label = document.createElement('label')
  label.className = 'survey-question__reason-label'
  label.htmlFor = name
  label.textContent = question.text
  fieldset.appendChild(label)

  const textarea = document.createElement('textarea')
  textarea.className = 'survey-text'
  textarea.rows = 3
  textarea.id = name
  textarea.name = name
  textarea.value = surveyResponses.get(name) ?? ''
  textarea.addEventListener('input', () => { surveyResponses.set(name, textarea.value); scheduleSave() })
  fieldset.appendChild(textarea)
}

function renderSurveyPage() {
  surveyEl.innerHTML = ''
  const ctx = currentSurveyContext()
  if (!ctx) return
  const visible = ctx.questions.filter((q) => isQuestionVisible(q, ctx.keyPrefix))
  let i = 0
  while (i < visible.length) {
    const q = visible[i]
    const next = visible[i + 1]
    // Group a likert7 question with its immediately following required-text reason into one fieldset.
    if (q.kind === 'likert7' && next?.kind === 'text' && next.required) {
      const fieldset = renderSurveyQuestion(q, ctx.keyPrefix)
      appendReasonTextarea(fieldset, next, ctx.keyPrefix)
      surveyEl.appendChild(fieldset)
      i += 2
    } else {
      surveyEl.appendChild(renderSurveyQuestion(q, ctx.keyPrefix))
      i += 1
    }
  }
}

// Remove every response a question owns — used when a conditional question is
// hidden so stale values never reach the submission. error-localization owns its
// step value (question id) plus the sibling description field.
function clearQuestionResponses(question: SurveyQuestion, keyPrefix: string) {
  surveyResponses.delete(fieldKey(keyPrefix, question.id))
  if (question.kind === 'error-localization') {
    surveyResponses.delete(fieldKey(keyPrefix, ERROR_DESCRIPTION_FIELD))
  }
}

// A response on the current survey page changed: persist, then re-evaluate the
// conditional (showWhen) questions. For per-chart pages a conditional can live
// on ANY of the item's survey pages (the error-localization page depends on the
// Yes/No page), so every page of the item is checked and any now-hidden
// question's responses are reset so stale values never reach the submission.
// The visible page only re-renders when it has conditionals of its own.
function handleSurveyChange() {
  scheduleSave()
  const page = allPages[currentPageIndex]
  if (page?.kind === 'survey') {
    const item = sequence[page.itemIdx]
    if (item) {
      surveyPages.forEach((sp, j) => {
        const prefix = `${getItemKey(item)}:${j}`
        sp.questions.forEach((q) => {
          if (q.showWhen && !isQuestionVisible(q, prefix)) clearQuestionResponses(q, prefix)
        })
      })
    }
  }
  const ctx = currentSurveyContext()
  if (!ctx || !ctx.questions.some((q) => q.showWhen)) return
  ctx.questions.forEach((q) => {
    if (q.showWhen && !isQuestionVisible(q, ctx.keyPrefix)) clearQuestionResponses(q, ctx.keyPrefix)
  })
  renderSurveyPage()
}

function isSurveyPageComplete(): boolean {
  // Pilot exception: PILOTA / PILOTB may leave any question blank (nothing required).
  if (['PILOTA', 'PILOTB'].includes(participant.code.toUpperCase())) return true
  const ctx = currentSurveyContext()
  if (!ctx) return true
  return ctx.questions.every((q) => {
    // Hidden conditional questions are not required.
    if (!isQuestionVisible(q, ctx.keyPrefix)) return true
    if (q.kind === 'text') {
      if (!q.required) return true // open-ended is optional unless marked required
      return (surveyResponses.get(fieldKey(ctx.keyPrefix, q.id)) ?? '').trim() !== ''
    }
    if (q.kind === 'error-localization') {
      // Both the step selection and the reason text are required while shown.
      const step = surveyResponses.get(fieldKey(ctx.keyPrefix, q.id)) ?? ''
      const desc = surveyResponses.get(fieldKey(ctx.keyPrefix, ERROR_DESCRIPTION_FIELD)) ?? ''
      return step !== '' && desc.trim() !== ''
    }
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
    surveyPages[RATINGS_PAGE_IDX].questions.forEach((q) => {
      const v = surveyResponses.get(`${k}:${RATINGS_PAGE_IDX}::${q.id}`)
      if (v != null) ratings[q.id] = v
    })
    const errStep = surveyResponses.get(`${k}:${ERROR_LOC_PAGE_IDX}::first-error-step`) ?? ''
    const errDesc = surveyResponses.get(`${k}:${ERROR_LOC_PAGE_IDX}::${ERROR_DESCRIPTION_FIELD}`) ?? ''
    charts[item.chart_id] = {
      system: item.system,
      group: item.group,
      // Participant's judgment (their Yes/No to "The answer is correct.").
      answerCorrect: surveyResponses.get(`${k}:${YES_NO_PAGE_IDX}::answer-correct`) ?? '',
      // Conditional error-localization (only populated when answerCorrect === 'No';
      // reset to empty/null otherwise so stale picks aren't submitted).
      firstErrorChunkIndex: errStep === '' ? null : Number(errStep),
      errorDescription: errDesc,
      // Ground truth of the correct/incorrect-answer manipulation, for scoring
      // (was the shown answer actually correct, and what was the true value).
      answerShown: item.answer,
      answerIsCorrect: item.answerIsCorrect,
      correctAnswer: item.correctAnswer,
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

  const systems: Record<string, FsJson> = {}
  finalItems.forEach((it) => { systems[it.key] = it.system })

  return {
    code: participant.code,
    order: { system: participant.order.system, chart: participant.order.chart },
    systems,
    sequence: sequence.map((it) => ({ chart_id: it.chart_id, system: it.system, group: it.group })),
    charts,
    postSession,
    final: { comment: surveyResponses.get('final::comment') ?? '' },
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
    if (c.answerCorrect) surveyResponses.set(`${k}:${YES_NO_PAGE_IDX}::answer-correct`, String(c.answerCorrect))
    if (c.firstErrorChunkIndex != null && c.firstErrorChunkIndex !== '') {
      surveyResponses.set(`${k}:${ERROR_LOC_PAGE_IDX}::first-error-step`, String(c.firstErrorChunkIndex))
    }
    if (c.errorDescription) surveyResponses.set(`${k}:${ERROR_LOC_PAGE_IDX}::${ERROR_DESCRIPTION_FIELD}`, String(c.errorDescription))
    if (typeof c.responseTimeMs === 'number') responseTimes.set(item.chart_id, c.responseTimeMs)
    Object.entries(c.ratings ?? {}).forEach(([qid, val]) => {
      if (val != null && val !== '') surveyResponses.set(`${k}:${RATINGS_PAGE_IDX}::${qid}`, String(val))
    })
  })
  Object.entries((fields.postSession as Record<string, any>) ?? {}).forEach(([system, obj]) => {
    Object.entries((obj as Record<string, any>) ?? {}).forEach(([qid, val]) => {
      if (val != null && val !== '') surveyResponses.set(`postsession:${system}::${qid}`, String(val))
    })
  })
  const final = (fields.final as any) ?? {}
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

// Final page: an optional free-text comment (stored as `final::comment`) plus a
// "you're done" note and the Submit button. (System rankings were removed.)
function renderFinalPage() {
  surveyEl.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'final-survey'

  const doneNote = document.createElement('p')
  doneNote.className = 'final-done'
  doneNote.textContent = 'Thank you — you have reached the end. Add any comments below (optional), then submit.'
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
  updateFinalNav()
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

// B1 (text condition) explanation: the full prose shown at once as a plain,
// non-interactive paragraph — no badges, no step blocks, no pointer/hover
// affordance. A passive listener records taps silently (no state/visual change),
// so pressing the text does nothing the participant can see.
function buildPlainExplanation(container: HTMLElement, text: string, answer = '', onTap?: () => void) {
  container.innerHTML = ''
  const para = document.createElement('p')
  para.className = 'explanation-plain'
  para.textContent = stripLeadingNumber(text).trim()
  container.appendChild(para)

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

  if (onTap) {
    container.addEventListener('click', () => {
      try { onTap() } catch { /* logging must never break the study */ }
    })
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
  const renderer = createRenderer('ours', demoContext)
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
  const item = reviewItems[reviewIdx]
  if (item?.method === 'b1') {
    // Text condition: static paragraph, no interaction (same as the main view).
    buildPlainExplanation(reviewExplanationEl, reviewStepTexts.join(' '), item.answer ?? '', () => {
      console.log('[evaluation] text-condition tap (no-op, review)', { chartId: item.chart_id, condition: item.method })
    })
    return
  }
  buildSentenceSpans(reviewExplanationEl, reviewStepTexts, {
    selectedStepIndex: reviewSelectedStepIndex,
    stepsUnlocked: reviewStepsUnlocked,
    stepErrors: reviewErrors,
    stepRunInProgress: reviewStepRunInProgress,
    onClick: (i) => { void runReviewStep(i) },
  }, item?.answer ?? '')
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
    console.error('[evaluation] review item load failed', { chartId: item.chart_id, error })
    reviewChartEl.innerHTML = '<div class="renderer-empty">Explanation unavailable.</div>'
    reviewStepTexts = []
  }
  renderReviewExplanation()
}

async function setupReview(block: SessionBlock | undefined) {
  teardownReview()
  if (!block) return
  reviewItems = block.items
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
    introTitleEl.textContent = 'Compositional Chart Question and Explanation Study'
    introBodyEl.innerHTML = WELCOME_BODY_HTML.replace('{code}', participant.code)
    introDemoEl.hidden = true
    return
  }

  if (kind === 'tutorial-interact') {
    introEyebrowEl.textContent = 'TUTORIAL · 1 OF 3'
    introTitleEl.textContent = 'How Explanations Are Shown'
    introBodyEl.innerHTML = TUTORIAL_INTERACT_BODY_HTML
    introDemoEl.hidden = false
    introDemoHintEl.textContent = '↑ Try pressing each block to move through the explanation.'

    // ensureDemoLoaded reloads when the demo was torn down by the text-practice
    // page, so the step-by-step chart is always present in the shared container.
    await ensureDemoLoaded()
    const tutorialEntry = Object.values(chartGroup).flatMap((g) => Object.values(g)).find((c) => c.id === demoChartId)
    introDemoQuestionEl.textContent = tutorialEntry?.question ?? ''
    renderDemoExplanation()
    return
  }

  if (kind === 'tutorial-text') {
    // Text-format practice: a static chart + plain-text explanation (no
    // stepping). Tear down the step-by-step demo so the shared demo container
    // shows this chart; render via TextRenderer (the B1 condition's renderer).
    teardownDemo()
    introEyebrowEl.textContent = 'TUTORIAL · 2 OF 3'
    introTitleEl.textContent = 'Text-Format Explanation'
    introBodyEl.innerHTML = TUTORIAL_TEXT_BODY_HTML
    introDemoEl.hidden = false
    introDemoHintEl.textContent = '↑ Press the text — nothing more appears, and that is normal.'

    const textCtx: RendererContext = { ...rendererContext, container: introDemoChartEl }
    const renderer = createRenderer('b1', textCtx)
    try {
      await renderer.loadChart(EVAL_TUTORIAL_TEXT_CHART_ID)
      await renderer.renderStep(-1)
      const entry = Object.values(chartGroup).flatMap((g) => Object.values(g)).find((c) => c.id === EVAL_TUTORIAL_TEXT_CHART_ID)
      introDemoQuestionEl.textContent = entry?.question ?? ''
      buildPlainExplanation(introDemoExplanationEl, renderer.getStepTexts().join(' '), entry?.answer ?? '', () => {
        console.log('[evaluation] tutorial text-practice tap (no-op)', { chartId: EVAL_TUTORIAL_TEXT_CHART_ID })
      })
    } catch (error) {
      console.error('[evaluation] text demo load failed', error)
      introDemoChartEl.innerHTML = '<div class="renderer-empty">Demo chart unavailable.</div>'
    }
    return
  }

  // tutorial-task
  introEyebrowEl.textContent = 'TUTORIAL · 3 OF 3'
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

// The final page now holds only an optional free-text comment, so it is always
// complete — the Next button is immediately a ready-to-Submit button.
function isFinalComplete(): boolean {
  return true
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
    if (page?.kind === 'intro-welcome') progressLabelEl.textContent = 'Introduction · 1 of 4'
    else if (page?.kind === 'tutorial-interact') progressLabelEl.textContent = 'Introduction · 2 of 4'
    else if (page?.kind === 'tutorial-text') progressLabelEl.textContent = 'Introduction · 3 of 4'
    else if (page?.kind === 'tutorial-task') progressLabelEl.textContent = 'Introduction · 4 of 4'
    else progressLabelEl.textContent = ''
    return
  }

  // Final ranking + comments page (no chart).
  if (page.kind === 'final') {
    progressLabelEl.textContent = `Page ${currentPageIndex + 1} of ${totalPages}`
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    // Anonymized: the A->system mapping is persisted in the saved doc's `systems`
    // field for the researcher; never reveal it in the participant-facing UI.
    debugMetaEl.textContent = `Final · ${finalItems.length} systems (${finalItems.map((it) => it.key).join('/')})`
    questionEl.textContent = 'Final step: share any comments, then submit.'
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
    const blockLabel = block ? labelForSystem(block.system) : 'System ?'
    progressLabelEl.textContent = `Page ${currentPageIndex + 1} of ${totalPages}`
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    // Anonymized researcher readout (the System label, never the raw name).
    debugMetaEl.textContent = block ? `Post-session · ${blockLabel} · Group ${block.group}` : ''
    // Heading sits ABOVE the review carousel (#postSessionHeading); keep the
    // in-flow questionText empty so it is not duplicated below the panel. Name
    // the (anonymized) system so the participant knows which one they're rating.
    postSessionHeadingEl.textContent = `Questions about "${blockLabel}". Below are the 5 explanations "${blockLabel}" produced. Use the arrows to review them, then answer the questions about "${blockLabel}".`
    questionEl.textContent = ''
    descriptionEl.textContent = ''
    explanationEl.hidden = true
    explanationEl.innerHTML = ''
    renderSurveyPage()
    return
  }

  // Per-chart survey page.
  const item = sequence[page.itemIdx]
  const itemLabel = labelForSystem(item.system)
  progressLabelEl.textContent = `Page ${currentPageIndex + 1} of ${totalPages}`
  // Participant-facing badge names the (anonymized) system for this chart so the
  // participant always knows which system produced the explanation they see.
  if (methodBadgeEl) methodBadgeEl.textContent = `${itemLabel} · Question ${page.itemIdx + 1} / ${sequence.length}`
  questionEl.textContent = item.question
  descriptionEl.textContent = ''
  // debugMeta is a subtle researcher readout; keep it anonymized (the System
  // label, never the raw Ours/B1/B2/B3 name) so identity can't be inferred.
  debugMetaEl.textContent = `${itemLabel} · Group ${item.group} · ID ${item.chart_id}`

  const stepTexts = currentRenderer?.getStepTexts() ?? []
  if (item.method === 'b1') {
    // Text condition: static paragraph, no interaction.
    buildPlainExplanation(explanationEl, stepTexts.join(' '), item.answer, () => {
      console.log('[evaluation] text-condition tap (no-op)', { chartId: item.chart_id, condition: item.method })
    })
  } else {
    buildSentenceSpans(explanationEl, stepTexts, {
      selectedStepIndex,
      stepsUnlocked,
      stepErrors,
      stepRunInProgress,
      onClick: (i) => { void runStep(i) },
    }, item.answer)
  }

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
    console.error('[evaluation] activateItem failed', { chartId: item.chart_id, error })
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
    if (itemChanged) {
      await activateItem(item)
      // Researcher log of each item's condition + format (the condition is also
      // persisted per chart in the saved doc). Console only — never shown in the UI.
      console.log('[evaluation] item', {
        chartId: item.chart_id,
        condition: item.method,
        format: item.method === 'b1' ? 'text' : 'visual',
      })
    }
    updateUI()
    // Time ONLY the Yes/No page until the participant navigates away (Next).
    // The error-localization and ratings pages are deliberately untimed so
    // writing the reason never counts toward responseTimeMs.
    if (page.surveyPageIdx === YES_NO_PAGE_IDX) activeTimer = { chartId: item.chart_id, startedAt: performance.now() }
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

// A per-chart survey page whose questions are ALL currently hidden (e.g. the
// error-localization page when the participant answered "Yes") must never be
// shown; navigation passes over it in the direction of travel.
function pageHasVisibleQuestions(idx: number): boolean {
  const page = allPages[idx]
  if (!page || page.kind !== 'survey') return true
  const item = sequence[page.itemIdx]
  const surveyPage = surveyPages[page.surveyPageIdx]
  if (!item || !surveyPage) return true
  const keyPrefix = `${getItemKey(item)}:${page.surveyPageIdx}`
  return surveyPage.questions.some((q) => isQuestionVisible(q, keyPrefix))
}

function resolveSkips(idx: number, dir: 1 | -1): number {
  let i = clampPageIndex(idx)
  while (!pageHasVisibleQuestions(i)) {
    const next = clampPageIndex(i + dir)
    if (next === i) return i
    i = next
  }
  return i
}

function navigateToPage(idx: number, replace = false) {
  const dir: 1 | -1 = idx >= currentPageIndex ? 1 : -1
  const next = resolveSkips(idx, dir)
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
  // Browser back/forward can land on a fully-hidden conditional page (e.g. the
  // error page after a "Yes"); resolve skips in the direction of travel and
  // keep the URL in sync with where we actually settle.
  const urlIdx = getPageIndexFromUrl()
  const resolved = resolveSkips(urlIdx, urlIdx >= currentPageIndex ? 1 : -1)
  if (resolved !== urlIdx) syncPageUrl(resolved, true)
  void loadPage(resolved)
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

// Resolve AFTER hydration so a reload/deep link onto a fully-hidden conditional
// page (e.g. the error page of a "Yes" item) settles on the next visible page.
currentPageIndex = resolveSkips(currentPageIndex, 1)
syncPageUrl(currentPageIndex, true)
void loadPage(currentPageIndex)
