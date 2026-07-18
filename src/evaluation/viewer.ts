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

type IntroKind = 'intro-welcome' | 'tutorial-text' | 'tutorial-task' | 'eval-intro'

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
  | { kind: 'demographics' }
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
  { id: 'worst-aspect', text: 'What recommendations or suggestions do you have for improving this system?', kind: 'text', required: true },
]

const INTRO_PAGE_KINDS: IntroKind[] = ['intro-welcome', 'tutorial-text', 'tutorial-task']
// Pages shown before the survey trials: the 4 intro/tutorial pages + the
// one-time demographics page inserted right after the welcome page. Drives the
// progress-bar denominator.
const PRE_SURVEY_PAGE_COUNT = INTRO_PAGE_KINDS.length + 1
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
  <p>In this study, you will see a series of charts paired with questions and AI-generated answers. For each pair, an explanation will show how the answer was derived. <strong>Four different explanation systems</strong> are compared in this study, labeled <strong>System A</strong>, <strong>System B</strong>, <strong>System C</strong>, and <strong>System D</strong>. You will see explanations from all four.</p>
  <p>The study has two parts:</p>
  <ol>
    <li><strong>20 questions.</strong> You answer 20 chart questions one at a time. The explanations for these are drawn from the four systems in a <strong>completely random order</strong>, so which system produced each explanation changes from question to question, so you will not know which system is which.</li>
    <li><strong>System evaluation.</strong> After the 20 questions, you evaluate each system (A, B, C, and D) one at a time. For each system you can review all of the explanations it produced, then answer questions about it.</li>
  </ol>
  <p>Your task on each of the 20 questions:</p>
  <ol>
    <li>Decide whether the provided answer is correct.</li>
    <li>Rate how clearly the explanation showed the reasoning behind the answer.</li>
  </ol>
  <p><strong>These systems can make mistakes while producing an explanation.</strong> The reasoning an explanation shows may itself contain an error. Please decide for yourself whether each answer and its explanation are actually correct &mdash; do not assume they are right.</p>
  <p>The study takes about <strong>70&ndash;90 minutes</strong>.</p>
  <p>The next pages will walk you through how the explanations are shown and what we'll ask you to do.</p>
`

// Step-by-step (visual) practice page. The body introduces BOTH formats
// neutrally (the participant meets them in a random order, so both must be
// previewed) and frames the live demo below as the step-by-step format.
// First tutorial page: introduces the two explanation formats, then practices
// the text format (the step-by-step format is practiced on the task page).
const TUTORIAL_TEXT_BODY_HTML = `
  <p>For each item you will see a chart, a question, and an answer, together with an explanation of how the answer was reached.</p>
  <p>Explanations appear in <strong>different formats</strong> from one item to the next: some are shown <strong>step by step on the chart</strong> (you press to reveal each step in turn), and some are shown <strong>as text</strong>, with the whole explanation visible at once.</p>
  <p>The example below is the <strong>text format</strong> &mdash; try pressing it; it is normal for nothing more to appear, as the text you see is the whole explanation. You will practice the step-by-step format on the next page.</p>
`

const TUTORIAL_TASK_BODY_HTML = `
  <p>For each of the <strong>{sequenceLength}</strong> questions in this study, please follow these steps:</p>
  <ol>
    <li><strong>Read the chart.</strong> Examine the data carefully (e.g., axes, labels, values.)</li>
    <li><strong>Read the question and the proposed answer.</strong></li>
    <li><strong>Read the explanation.</strong> If it is shown step by step, press each block to move through it; if it is shown as text, the full explanation is already visible.</li>
    <li><strong>Verify the answer.</strong> After reviewing the explanation, decide: Yes (correct) or No (incorrect).</li>
    <li><strong>Rate the explanation.</strong> A few statements use a 7-point scale (Strongly disagree &rarr; Strongly agree).</li>
  </ol>
  <div class="intro-notes">
    <p class="intro-notes__title">Important notes</p>
    <ul>
      <li><strong>Some answers are correct and some are not.</strong> Whether the shown answer is right is exactly what we ask you to judge. So please read the explanation and decide for yourself.</li>
      <li><strong>Systems can make mistakes while producing an explanation.</strong> An explanation may go wrong at one of its steps. Do not assume an explanation is correct just because it looks confident. Please check the reasoning yourself. If you judge the answer incorrect, you will then be asked which step the reasoning first goes wrong.</li>
      <li><strong>Answer the first question accurately.</strong> We measure how long you take to answer the "The answer is correct." question on each page. Please stay focused and respond as accurate as you have made your decision.</li>
      <li><strong>Use external tools freely.</strong> A calculator or scrap paper is fine if you need to verify a calculation, so please just try to keep it brief.</li>
    </ul>
  </div>
  <p>Below is a <strong>complete practice trial</strong> — the chart, its explanation, and the exact questions you will answer each time. Step through the explanation and try the questions. When you're ready, click <strong>Next</strong> to begin the survey.</p>
`

// Transition page shown after all trials, before the per-system evaluation.
const EVAL_INTRO_BODY_HTML = `
  <p>You have completed all <strong>{sequenceLength}</strong> tasks &mdash; thank you!</p>
  <p>Next, you will <strong>evaluate each system</strong> one at a time. The explanations you just saw were produced by different systems, labeled <strong>System A</strong>, <strong>System B</strong>, <strong>System C</strong>, and <strong>System D</strong>.</p>
  <p>On each of the following pages, you can <strong>review every explanation that one system produced</strong>. Look through them, then answer the questions about that system.</p>
  <p>When you're ready, click <strong>Next</strong> to begin.</p>
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
const introDemoSurveyEl = document.getElementById('introDemoSurvey') as HTMLElement
const reviewPanelEl = document.getElementById('reviewPanel') as HTMLElement
const postSessionHeadingEl = document.getElementById('postSessionHeading') as HTMLElement
const reviewPrevBtn = document.getElementById('reviewPrev') as HTMLButtonElement
const reviewNextBtn = document.getElementById('reviewNext') as HTMLButtonElement
const reviewCounterEl = document.getElementById('reviewCounter') as HTMLElement
const reviewChartEl = document.getElementById('reviewChart') as HTMLElement
const reviewQuestionEl = document.getElementById('reviewQuestion') as HTMLElement
const reviewExplanationEl = document.getElementById('reviewExplanation') as HTMLElement
const reviewTitleEl = reviewPanelEl.querySelector('.review-title') as HTMLElement

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
  const pages: PageDescriptor[] = []
  INTRO_PAGE_KINDS.forEach((kind) => {
    pages.push({ kind })
    // The demographics ("About You") page comes immediately after the welcome page.
    if (kind === 'intro-welcome') pages.push({ kind: 'demographics' })
  })
  for (let i = 0; i < sequence.length; i += 1) {
    for (let j = 0; j < surveyPages.length; j += 1) {
      pages.push({ kind: 'survey', itemIdx: i, surveyPageIdx: j })
    }
  }
  // Transition into the per-system evaluation phase.
  pages.push({ kind: 'eval-intro' })
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

// ── DEMO-mode "Save SVG" button ─────────────────────────────────────────────
// In any DEMO* walkthrough, add a button on the chart card that downloads the
// current chart as an SVG named `{chart_id}_{opsNumber}.svg`. opsNumber is the
// currently-shown step (0 = base chart, 1 = after ops, 2 = after ops2, …).
if (participant.order.system.startsWith('DEMO') && chartCardEl && containerEl) {
  const SVG_NS = 'http://www.w3.org/2000/svg'

  // Composite the WHOLE chart container into ONE standalone <svg>. A split chart
  // holds several <svg>s (a zero-sized root plus the left/right panels plus a
  // diff overlay); serialising only the first saved an empty/tiny file. Each
  // VISIBLE (non-zero) svg is embedded as a nested <svg> positioned at its
  // container-relative coordinates, in DOM paint order, over a white background.
  const buildCompositeSvg = (container: HTMLElement): SVGSVGElement => {
    const contRect = container.getBoundingClientRect()
    const placed = Array.from(container.querySelectorAll('svg'))
      .map((svg) => ({ svg, r: svg.getBoundingClientRect(), cs: getComputedStyle(svg) }))
      .filter(({ r, cs }) => r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden')
      .map(({ svg, r }) => ({ svg, x: r.left - contRect.left, y: r.top - contRect.top, w: r.width, h: r.height }))
    if (!placed.length) throw new Error('no visible chart svg to export')

    const width = Math.ceil(Math.max(...placed.map((p) => p.x + p.w)))
    const height = Math.ceil(Math.max(...placed.map((p) => p.y + p.h)))

    const wrapper = document.createElementNS(SVG_NS, 'svg')
    wrapper.setAttribute('xmlns', SVG_NS)
    wrapper.setAttribute('width', String(width))
    wrapper.setAttribute('height', String(height))
    wrapper.setAttribute('viewBox', `0 0 ${width} ${height}`)
    const bg = document.createElementNS(SVG_NS, 'rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', String(width))
    bg.setAttribute('height', String(height))
    bg.setAttribute('fill', '#ffffff')
    wrapper.appendChild(bg)
    for (const p of placed) {
      const clone = p.svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('x', String(p.x))
      clone.setAttribute('y', String(p.y))
      clone.setAttribute('width', String(p.w))
      clone.setAttribute('height', String(p.h))
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', SVG_NS)
      wrapper.appendChild(clone)
    }
    return wrapper
  }

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('failed to load svg for crop scan'))
      image.src = src
    })

  // Shrink the wrapper's viewBox/width/height to the tightest box that still
  // contains every non-white pixel, independently on each of the 4 sides —
  // whichever side hits real content first wins, so uneven whitespace (e.g. a
  // tall diff-overlay leaving blank space only at the bottom) is trimmed
  // correctly per-side rather than by a single uniform bounding box guess.
  // Renders to an offscreen canvas at a fixed raster scale purely to LOCATE
  // the crop box; the saved file stays the original vector markup with an
  // adjusted viewBox, so there is no quality loss.
  const cropToContent = async (wrapper: SVGSVGElement): Promise<void> => {
    const scale = 2
    const width = Number(wrapper.getAttribute('width'))
    const height = Number(wrapper.getAttribute('height'))
    if (!(width > 0) || !(height > 0)) return

    const serialized = new XMLSerializer().serializeToString(wrapper)
    const url = URL.createObjectURL(
      new Blob(['<?xml version="1.0" encoding="utf-8"?>\n', serialized], { type: 'image/svg+xml;charset=utf-8' }),
    )
    let image: HTMLImageElement
    try {
      image = await loadImage(url)
    } finally {
      URL.revokeObjectURL(url)
    }

    const canvasW = Math.max(1, Math.round(width * scale))
    const canvasH = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, 0, 0, canvasW, canvasH)

    let data: Uint8ClampedArray
    try {
      data = ctx.getImageData(0, 0, canvasW, canvasH).data
    } catch {
      return // canvas tainted (shouldn't happen for same-origin inline svg) — keep uncropped
    }
    const isWhitePixel = (x: number, y: number) => {
      const i = (y * canvasW + x) * 4
      return data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250
    }

    let top = 0
    outerTop: for (; top < canvasH; top += 1) {
      for (let x = 0; x < canvasW; x += 1) if (!isWhitePixel(x, top)) break outerTop
    }
    let bottom = canvasH - 1
    outerBottom: for (; bottom > top; bottom -= 1) {
      for (let x = 0; x < canvasW; x += 1) if (!isWhitePixel(x, bottom)) break outerBottom
    }
    let left = 0
    outerLeft: for (; left < canvasW; left += 1) {
      for (let y = top; y <= bottom; y += 1) if (!isWhitePixel(left, y)) break outerLeft
    }
    let right = canvasW - 1
    outerRight: for (; right > left; right -= 1) {
      for (let y = top; y <= bottom; y += 1) if (!isWhitePixel(right, y)) break outerRight
    }

    if (right <= left || bottom <= top) return // all-white or scan failed — keep uncropped

    const cropX = left / scale
    const cropY = top / scale
    const cropRight = right / scale
    const cropBottom = bottom / scale
    const cropW = Math.ceil(cropRight - cropX)
    const cropH = Math.ceil(cropBottom - cropY)

    wrapper.setAttribute('viewBox', `${cropX} ${cropY} ${cropW} ${cropH}`)
    wrapper.setAttribute('width', String(cropW))
    wrapper.setAttribute('height', String(cropH))
  }

  if (getComputedStyle(chartCardEl).position === 'static') chartCardEl.style.position = 'relative'
  const downloadBtn = document.createElement('button')
  downloadBtn.type = 'button'
  downloadBtn.id = 'demoDownloadBtn'
  downloadBtn.textContent = '⤓ Save SVG'
  downloadBtn.style.cssText =
    'position:absolute;top:12px;right:12px;z-index:20;padding:6px 12px;font-size:13px;font-weight:600;' +
    'background:#1e40af;color:#fff;border:none;border-radius:6px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.2);'
  downloadBtn.addEventListener('click', async () => {
    if (!containerEl.querySelector('svg')) {
      console.warn('[evaluation] Save SVG: no chart svg found')
      return
    }
    const chartId = sequence[currentItemIndex]?.chart_id ?? 'chart'
    const opsNumber = selectedStepIndex + 1 // base=0, ops=1, ops2=2, ops3=3
    const filename = `${chartId}_${opsNumber}.svg`
    downloadBtn.disabled = true
    try {
      const composite = buildCompositeSvg(containerEl)
      await cropToContent(composite)
      const serialized = new XMLSerializer().serializeToString(composite)
      const blob = new Blob(['<?xml version="1.0" encoding="utf-8"?>\n', serialized], {
        type: 'image/svg+xml;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (error) {
      console.error('[evaluation] Save SVG export failed', error)
    } finally {
      downloadBtn.disabled = false
    }
  })
  chartCardEl.appendChild(downloadBtn)
}

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

function surveyContextForPage(page: PageDescriptor | undefined): SurveyContext | null {
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

function currentSurveyContext(): SurveyContext | null {
  return surveyContextForPage(allPages[currentPageIndex])
}

function fieldKey(keyPrefix: string, questionId: string): string {
  return `${keyPrefix}::${questionId}`
}

function renderSurveyQuestion(question: SurveyQuestion, keyPrefix: string): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset')
  fieldset.className = `survey-question survey-question--${question.kind === 'yes-no' ? 'choice' : question.kind === 'error-localization' ? 'error-loc' : 'likert'
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
  // Pilot / demo exception: PILOTA / PILOTB, any DEMO* walkthrough (DEMO,
  // DEMOB1/B2/B3), and any participant CODE starting with "DEMO" (even one
  // riding a real system/chart order, e.g. DEMOP2 = order SO1CO2's exact
  // interface but freely navigable) may leave any question blank, so they can
  // click straight through.
  if (['PILOTA', 'PILOTB'].includes(participant.code.toUpperCase())) return true
  if (participant.code.toUpperCase().startsWith('DEMO')) return true
  if (participant.order.system.startsWith('DEMO')) return true
  if (allPages[currentPageIndex]?.kind === 'demographics') return isDemographicsComplete()
  return isContextComplete(currentSurveyContext())
}

// DOM-independent completeness check for a survey/post-session context. Reads
// only from `surveyResponses` (hydrated from Firebase at startup), so it can be
// evaluated for pages the participant is not currently viewing — this is what
// the page-navigation guard relies on. Radio (yes-no / likert7) selections are
// mirrored into surveyResponses on click, so no DOM lookup is needed.
function isContextComplete(ctx: SurveyContext | null): boolean {
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
    return (surveyResponses.get(fieldKey(ctx.keyPrefix, q.id)) ?? '').trim() !== ''
  })
}

// A page is "complete" for guard purposes when it has no pending required input.
// Intro / eval-intro / final pages carry no required questions, so they never
// block forward navigation on their own; survey and post-session pages defer to
// their context. A page with no visible questions (e.g. an error-localization
// page skipped because the answer was "Yes") is trivially complete.
function isPageCompleteAt(idx: number): boolean {
  const page = allPages[idx]
  if (!page) return true
  if (page.kind === 'demographics') return isDemographicsComplete()
  if (page.kind !== 'survey' && page.kind !== 'post-session') return true
  return isContextComplete(surveyContextForPage(page))
}

// The furthest page a non-DEMO participant is allowed to reach: the first page
// they have not yet completed. They may freely revisit earlier pages, but may
// not skip ahead past unfinished work (enforced on URL entry + history nav).
// DEMO* walkthroughs and pilots are exempt — they roam freely.
function furthestAllowedPageIndex(): number {
  // Exempt exactly the accounts for which completeness is not enforced (mirrors
  // isSurveyPageComplete): DEMO* walkthroughs and the PILOT pilots click through
  // freely, so the guard would otherwise trap them on their first blank page.
  const code = participant.code.toUpperCase()
  if (
    code.startsWith('DEMO') ||
    participant.order.system.startsWith('DEMO') ||
    ['PILOTA', 'PILOTB'].includes(code)
  ) {
    return allPages.length - 1
  }
  for (let i = 0; i < allPages.length; i += 1) {
    if (!isPageCompleteAt(i)) return i
  }
  return allPages.length - 1
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

  // Aggregate-only background details (age stored as a number for mean/SD/range).
  const demographics: Record<string, FsJson> = {}
  const demoAge = (surveyResponses.get(demoKey('age')) ?? '').trim()
  if (demoAge !== '') {
    const n = Number(demoAge)
    demographics.age = Number.isFinite(n) ? n : demoAge
  }
  DEMOGRAPHICS_TEXT_FIELDS.forEach((id) => {
    const v = surveyResponses.get(demoKey(id))
    if (v != null && v.trim() !== '') demographics[id] = v
  })

  return {
    code: participant.code,
    order: { system: participant.order.system, chart: participant.order.chart },
    systems,
    sequence: sequence.map((it) => ({ chart_id: it.chart_id, system: it.system, group: it.group })),
    charts,
    demographics,
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
  const demographics = (fields.demographics as Record<string, any>) ?? {}
  Object.entries(demographics).forEach(([id, val]) => {
    if (val != null && val !== '') surveyResponses.set(demoKey(id), String(val))
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
  const blockLabel = labelForSystem(block.system)
  reviewTitleEl.innerHTML = `Below are 5 explanations from <b><u>${blockLabel}</u></b>. Use the <b><u>arrows</u></b> (&#8249; &#8250;) to review them.`
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

// A radio option matching the real survey's markup (.choice-option /
// .likert-option). Purely for the tutorial preview — native radios + the
// existing `:has(input:checked)` CSS handle selection, so no JS state needed.
function buildPreviewChoice(name: string, value: string, optionClass: string): HTMLLabelElement {
  const label = document.createElement('label')
  label.className = optionClass
  const input = document.createElement('input')
  input.type = 'radio'
  input.name = name
  input.value = value
  const span = document.createElement('span')
  span.className = `${optionClass}__label`
  span.textContent = value
  label.append(input, span)
  return label
}

function buildPreviewLikert(name: string, legendText: string): HTMLFieldSetElement {
  const fs = document.createElement('fieldset')
  fs.className = 'survey-question survey-question--likert'
  const legend = document.createElement('legend')
  legend.className = 'survey-question__text'
  legend.textContent = legendText
  fs.appendChild(legend)
  const scale = document.createElement('div')
  scale.className = 'likert-scale'
  const options = document.createElement('div')
  options.className = 'likert-scale__options'
  ;['1', '2', '3', '4', '5', '6', '7'].forEach((v) => options.appendChild(buildPreviewChoice(name, v, 'likert-option')))
  scale.appendChild(options)
  const endpoints = document.createElement('div')
  endpoints.className = 'likert-scale__endpoints'
  const low = document.createElement('span')
  low.className = 'likert-scale__endpoint likert-scale__endpoint--low'
  low.textContent = AGREE_SCALE.low
  const high = document.createElement('span')
  high.className = 'likert-scale__endpoint likert-scale__endpoint--high'
  high.textContent = AGREE_SCALE.high
  endpoints.append(low, high)
  scale.appendChild(endpoints)
  fs.appendChild(scale)
  return fs
}

// Non-recording preview of the exact per-trial questions (Yes/No verify → the
// conditional "which step is wrong" → the three ratings), for the tutorial's
// full-practice-trial page. Uses the real survey CSS classes so it looks
// identical, but writes to nothing (a throwaway `tutorial-preview` radio group)
// and is decoupled from navigation/gating. `stepTexts` are the demo
// explanation's steps, so the error-localization list is the demo's own steps.
function renderTutorialSurveyPreview(container: HTMLElement, stepTexts: string[]) {
  container.innerHTML = ''

  const heading = document.createElement('p')
  heading.className = 'intro-demo__survey-heading'
  heading.textContent =
    'After reviewing the explanation above, you answer these questions on every trial — one screen at a time, just like here. This is practice, so nothing is recorded.'
  container.appendChild(heading)

  // (1) Timed Yes/No verification. In the real study this is its OWN screen and
  // is TIMED, so we present it alone first and reveal the rest only after the
  // participant answers and presses “Next”.
  const yesNo = document.createElement('fieldset')
  yesNo.className = 'survey-question survey-question--choice'
  const ynLegend = document.createElement('legend')
  ynLegend.className = 'survey-question__text'
  ynLegend.textContent = 'The answer is correct.'
  yesNo.appendChild(ynLegend)
  const timerNote = document.createElement('p')
  timerNote.className = 'intro-demo__survey-timer'
  timerNote.textContent =
    '⏱ We measure how long you take on this question. Answer it as soon as you have decided, then press Next.'
  yesNo.appendChild(timerNote)
  const ynRow = document.createElement('div')
  ynRow.className = 'choice-row'
  ;['Yes', 'No'].forEach((v) => ynRow.appendChild(buildPreviewChoice('tutorial-answer-correct', v, 'choice-option')))
  yesNo.appendChild(ynRow)
  container.appendChild(yesNo)

  // Mock “Next” that advances to the follow-up questions (mirrors pressing Next
  // after the timed Yes/No screen).
  const nextRow = document.createElement('div')
  nextRow.className = 'intro-demo__survey-nextrow'
  const nextBtn = document.createElement('button')
  nextBtn.type = 'button'
  nextBtn.className = 'intro-demo__survey-next'
  nextBtn.textContent = 'Next →'
  const nextWarn = document.createElement('span')
  nextWarn.className = 'intro-demo__survey-warn'
  nextWarn.textContent = 'Choose Yes or No first.'
  nextWarn.hidden = true
  nextRow.append(nextBtn, nextWarn)
  container.appendChild(nextRow)

  // (2) Follow-up screen: error-localization (only after “No”) + the three
  // ratings. Hidden until Next is pressed.
  const followup = document.createElement('div')
  followup.className = 'intro-demo__survey-followup'
  followup.hidden = true

  const errFs = document.createElement('fieldset')
  errFs.className = 'survey-question survey-question--error-loc'
  errFs.hidden = true // only when the answer was “No”
  const errLegend = document.createElement('legend')
  errLegend.className = 'survey-question__text'
  errLegend.textContent = 'At which step does the reasoning first go wrong? Select the step.'
  errFs.appendChild(errLegend)
  const errNote = document.createElement('p')
  errNote.className = 'survey-question__hint'
  errNote.textContent = 'This screen appears only when you answered “No”.'
  errFs.appendChild(errNote)
  const list = document.createElement('div')
  list.className = 'error-loc-steps'
  stepTexts.forEach((stepText, index) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'error-loc-step'
    const badge = document.createElement('span')
    badge.className = 'error-loc-step__badge'
    badge.textContent = String(index + 1)
    const span = document.createElement('span')
    span.className = 'error-loc-step__text'
    span.textContent = stripLeadingNumber(stepText)
    btn.append(badge, span)
    btn.addEventListener('click', () => {
      list.querySelectorAll('.error-loc-step').forEach((el) => {
        const on = el === btn
        el.classList.toggle('is-selected', on)
        el.setAttribute('aria-pressed', on ? 'true' : 'false')
      })
    })
    list.appendChild(btn)
  })
  errFs.appendChild(list)
  const descLabel = document.createElement('label')
  descLabel.className = 'error-loc-desc__label'
  descLabel.textContent = 'Describe what is wrong with this step.'
  errFs.appendChild(descLabel)
  const descArea = document.createElement('textarea')
  descArea.className = 'survey-text'
  descArea.rows = 3
  errFs.appendChild(descArea)
  followup.appendChild(errFs)

  // (3) The three per-trial ratings (matches surveyPages[RATINGS_PAGE_IDX]).
  ;[
    'The explanation was easy to understand.',
    'The explanation was transparent.',
    'The explanation was useful.',
  ].forEach((text, i) => followup.appendChild(buildPreviewLikert(`tutorial-rating-${i}`, text)))
  container.appendChild(followup)

  nextBtn.addEventListener('click', () => {
    const selected = ynRow.querySelector<HTMLInputElement>('input:checked')
    if (!selected) {
      nextWarn.hidden = false
      return
    }
    nextWarn.hidden = true
    errFs.hidden = selected.value !== 'No' // error-localization only after “No”
    followup.hidden = false
    nextBtn.disabled = true
    nextBtn.textContent = 'Next ✓'
    followup.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

async function renderIntroPage(kind: IntroKind) {
  introCardEl.hidden = false
  chartCardEl.hidden = true
  bottomAreaEl.hidden = true
  taskBannerEl.hidden = true
  introDemoSurveyEl.hidden = true // shown only on the full-practice-trial (tutorial-task) page
  introCardEl.classList.toggle('intro-card--welcome', kind === 'intro-welcome')

  if (kind === 'intro-welcome') {
    introEyebrowEl.textContent = 'WELCOME'
    introTitleEl.textContent = 'Compositional Chart Question and Explanation Study'
    introBodyEl.innerHTML = WELCOME_BODY_HTML.replace('{code}', participant.code)
    introDemoEl.hidden = true
    return
  }

  if (kind === 'tutorial-text') {
    // First tutorial page: introduce the formats + practice the text format.
    // A static chart + plain-text explanation (no stepping). Tear down any
    // step-by-step demo so the shared demo container shows this chart; render
    // via TextRenderer (the B1 condition's renderer).
    teardownDemo()
    introEyebrowEl.textContent = 'TUTORIAL · 1 OF 2'
    introTitleEl.textContent = 'How Explanations Are Shown'
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

  if (kind === 'eval-intro') {
    introEyebrowEl.textContent = 'SYSTEM EVALUATION'
    introTitleEl.textContent = 'Evaluate Each System'
    introBodyEl.innerHTML = EVAL_INTRO_BODY_HTML.replace(/\{sequenceLength\}/g, String(sequence.length))
    introDemoEl.hidden = true
    return
  }

  // tutorial-task — a complete practice trial: the step-by-step demo chart +
  // explanation, then the exact Yes/No + follow-up questions each trial asks,
  // so participants (and researchers demoing the study) see a full trial once
  // before it counts.
  introEyebrowEl.textContent = 'TUTORIAL · 2 OF 2'
  introTitleEl.textContent = 'Your Task'
  introBodyEl.innerHTML = TUTORIAL_TASK_BODY_HTML.replace(/\{sequenceLength\}/g, String(sequence.length))
  introDemoEl.hidden = false
  introDemoHintEl.textContent = '↑ Press the blocks to step through the explanation, then answer the questions below.'
  await ensureDemoLoaded()
  const taskEntry = Object.values(chartGroup).flatMap((g) => Object.values(g)).find((c) => c.id === demoChartId)
  introDemoQuestionEl.textContent = taskEntry?.question ?? ''
  renderDemoExplanation()
  introDemoSurveyEl.hidden = false
  renderTutorialSurveyPreview(introDemoSurveyEl, demoStepTexts)
}

// ============================================================================
// Demographics — a one-time "About You" page shown right after the welcome
// page. Background details are collected for aggregate reporting only (mean age,
// gender split, STEM %, student/worker split). Stored under `demographics::*`
// keys in surveyResponses and emitted as a `demographics` object in the saved
// doc; hydrated back on reload like every other response.
// ============================================================================
const DEMOGRAPHICS_PREFIX = 'demographics'
const demoKey = (id: string) => `${DEMOGRAPHICS_PREFIX}::${id}`
const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to answer']
const EDUCATION_OPTIONS = [
  'High school or below',
  'Some college (no degree yet)',
  "Associate's / 2-year degree",
  "Bachelor's degree",
  "Master's degree",
  'Doctoral degree',
  'Other',
]
const OCCUPATION_OPTIONS = ['Student', 'Employed', 'Self-employed', 'Other']
// Fields whose value is a plain string carried into the saved `demographics` map.
const DEMOGRAPHICS_TEXT_FIELDS = ['gender', 'gender-self', 'education', 'field', 'occupation', 'occupation-detail']

// Pilots / DEMO walkthroughs can click straight through (nothing required),
// mirroring isSurveyPageComplete's exemption.
function isDemographicsExempt(): boolean {
  const code = participant.code.toUpperCase()
  return ['PILOTA', 'PILOTB'].includes(code) || code.startsWith('DEMO') || participant.order.system.startsWith('DEMO')
}

function isDemographicsComplete(): boolean {
  if (isDemographicsExempt()) return true
  const get = (id: string) => (surveyResponses.get(demoKey(id)) ?? '').trim()
  const age = get('age')
  const ageNum = Number(age)
  const ageOk = age !== '' && Number.isFinite(ageNum) && ageNum > 0
  return ageOk && get('gender') !== '' && get('education') !== '' && get('field') !== '' && get('occupation') !== ''
}

function showDemographicsLayout() {
  introCardEl.hidden = true
  chartCardEl.hidden = true
  bottomAreaEl.hidden = false
  taskBannerEl.hidden = true
  introDemoEl.hidden = true
}

// Persist on any demographics edit; clear the warning once the page is complete.
function onDemographicsChange() {
  scheduleSave()
  if (isDemographicsComplete()) surveyWarningEl.textContent = ''
}

// Store/clear a text-ish value (empty string → delete so it never reaches the doc).
function setDemoValue(id: string, value: string) {
  if (value.trim() === '') surveyResponses.delete(demoKey(id))
  else surveyResponses.set(demoKey(id), value)
}

function demoFieldset(legendText: string): HTMLFieldSetElement {
  const fs = document.createElement('fieldset')
  fs.className = 'survey-question survey-question--demo'
  const legend = document.createElement('legend')
  legend.className = 'survey-question__text'
  legend.textContent = legendText
  fs.appendChild(legend)
  return fs
}

function demoTextInput(id: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'demo-input'
  input.placeholder = placeholder
  input.value = surveyResponses.get(demoKey(id)) ?? ''
  input.addEventListener('input', () => { setDemoValue(id, input.value); onDemographicsChange() })
  return input
}

// Radio group reusing the survey `.choice-option` cards (sr-only input +
// `:has(input:checked)` styling — no re-render needed on selection).
function demoChoiceField(id: string, legendText: string, options: string[], onSelect?: (value: string) => void): HTMLFieldSetElement {
  const fs = demoFieldset(legendText)
  const row = document.createElement('div')
  row.className = 'choice-row choice-row--quad'
  const name = demoKey(id)
  const current = surveyResponses.get(name) ?? ''
  options.forEach((value) => {
    const label = document.createElement('label')
    label.className = 'choice-option'
    const input = document.createElement('input')
    input.type = 'radio'
    input.name = name
    input.value = value
    input.checked = current === value
    const span = document.createElement('span')
    span.className = 'choice-option__label'
    span.textContent = value
    label.append(input, span)
    input.addEventListener('change', () => {
      surveyResponses.set(name, value)
      onSelect?.(value)
      onDemographicsChange()
    })
    row.appendChild(label)
  })
  fs.appendChild(row)
  return fs
}

function buildDemoAge(): HTMLFieldSetElement {
  const fs = demoFieldset('How old are you? (international age)')
  const input = document.createElement('input')
  input.type = 'number'
  input.className = 'demo-input demo-input--age'
  input.min = '1'
  input.max = '120'
  input.step = '1'
  input.inputMode = 'numeric'
  input.placeholder = 'e.g., 27'
  input.value = surveyResponses.get(demoKey('age')) ?? ''
  input.addEventListener('input', () => { setDemoValue('age', input.value); onDemographicsChange() })
  const hint = document.createElement('p')
  hint.className = 'demo-hint'
  // Korea uses a different age reckoning, so spell out international ("full") age
  // explicitly to avoid off-by-one/two errors.
  hint.innerHTML =
    'Please enter your <strong>international age</strong> — the number of full years since you were born. ' +
    'This is typically 1–2 years lower than the traditional Korean age (한국식 나이가 아닌 만 나이를 적어주세요).'
  fs.append(input, hint)
  return fs
}

function buildDemoGender(): HTMLFieldSetElement {
  const selfWrap = document.createElement('div')
  selfWrap.className = 'demo-selfdescribe'
  selfWrap.appendChild(demoTextInput('gender-self', 'Prefer to self-describe? (optional)'))
  const setSelfVisible = (value: string) => {
    selfWrap.hidden = value !== 'Other'
    if (value !== 'Other') { setDemoValue('gender-self', '') ; (selfWrap.firstElementChild as HTMLInputElement).value = '' }
  }
  const fs = demoChoiceField('gender', 'What is your gender?', GENDER_OPTIONS, setSelfVisible)
  selfWrap.hidden = (surveyResponses.get(demoKey('gender')) ?? '') !== 'Other'
  fs.appendChild(selfWrap)
  return fs
}

function buildDemoEducation(): HTMLFieldSetElement {
  const fs = demoFieldset('What is your highest level of education, and your field of study?')
  const select = document.createElement('select')
  select.className = 'demo-select'
  select.name = demoKey('education')
  const current = surveyResponses.get(demoKey('education')) ?? ''
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = 'Select your highest level of education…'
  placeholder.disabled = true
  placeholder.selected = current === ''
  select.appendChild(placeholder)
  EDUCATION_OPTIONS.forEach((level) => {
    const option = document.createElement('option')
    option.value = level
    option.textContent = level
    option.selected = current === level
    select.appendChild(option)
  })
  select.addEventListener('change', () => { surveyResponses.set(demoKey('education'), select.value); onDemographicsChange() })
  const field = demoTextInput('field', 'Field of study or expertise (e.g., Computer Science, Nursing — write N/A if none)')
  fs.append(select, field)
  return fs
}

function buildDemoOccupation(): HTMLFieldSetElement {
  const fs = demoChoiceField('occupation', 'Which best describes your current status?', OCCUPATION_OPTIONS)
  fs.appendChild(demoTextInput('occupation-detail', 'Your occupation or affiliation (optional)'))
  return fs
}

function renderDemographicsPage() {
  questionEl.textContent = 'A few questions about you'
  descriptionEl.innerHTML =
    'Before the study begins, we would kindly ask for a little background information. We use it only to describe our participants as a group in the research paper (for example, the group’s average age). <strong>Your responses are used for research purposes only, are kept confidential and never linked to your identity, and will be permanently discarded once the study is complete.</strong>'
  descriptionEl.hidden = false
  explanationEl.hidden = true
  explanationEl.innerHTML = ''
  debugMetaEl.textContent = ''
  surveyEl.innerHTML = ''
  surveyEl.append(buildDemoAge(), buildDemoGender(), buildDemoEducation(), buildDemoOccupation())
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

  let logicalCurrentPage = 0
  const logicalTotalPages = sequence.length + blocks.length + 1
  if (page) {
    if (page.kind === 'survey') logicalCurrentPage = page.itemIdx + 1
    else if (page.kind === 'post-session') logicalCurrentPage = sequence.length + page.blockIdx + 1
    else if (page.kind === 'final') logicalCurrentPage = sequence.length + blocks.length + 1
  }

  const totalLogicalSteps = PRE_SURVEY_PAGE_COUNT + logicalTotalPages
  let pct = 0
  if (page && (page.kind === 'survey' || page.kind === 'post-session' || page.kind === 'final')) {
    pct = Math.round((PRE_SURVEY_PAGE_COUNT + logicalCurrentPage) / totalLogicalSteps * 100)
  } else {
    pct = Math.round((currentPageIndex + 1) / totalLogicalSteps * 100)
  }

  progressFillEl.style.width = `${pct}%`
  progressTrackEl.setAttribute('aria-valuenow', String(pct))
  surveyWarningEl.textContent = ''

  explanationEl.hidden = false

  // Intro pages.
  if (!page || (page.kind !== 'survey' && page.kind !== 'post-session' && page.kind !== 'final')) {
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    debugMetaEl.textContent = ''
    if (page?.kind === 'intro-welcome') progressLabelEl.textContent = 'Introduction · 1 of 3'
    else if (page?.kind === 'demographics') progressLabelEl.textContent = 'About You'
    else if (page?.kind === 'tutorial-text') progressLabelEl.textContent = 'Introduction · 2 of 3'
    else if (page?.kind === 'tutorial-task') progressLabelEl.textContent = 'Introduction · 3 of 3'
    else if (page?.kind === 'eval-intro') progressLabelEl.textContent = 'System Evaluation'
    else progressLabelEl.textContent = ''
    return
  }

  // Final ranking + comments page (no chart).
  if (page.kind === 'final') {
    progressLabelEl.textContent = `Page ${logicalCurrentPage} of ${logicalTotalPages}`
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    // No researcher readout in the participant-facing UI: the A->system mapping
    // is persisted in the saved doc's `systems` field instead.
    debugMetaEl.textContent = ''
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
    progressLabelEl.textContent = `Page ${logicalCurrentPage} of ${logicalTotalPages}`
    if (methodBadgeEl) methodBadgeEl.textContent = ''
    // No researcher readout here — it would expose the internal group assignment.
    debugMetaEl.textContent = ''
    // Heading sits ABOVE the review carousel (#postSessionHeading); keep the
    // in-flow questionText empty so it is not duplicated below the panel. Name
    // the (anonymized) system so the participant knows which one they're rating.
    postSessionHeadingEl.innerHTML = `Questions about <b><u>${blockLabel}</u></b>. Below are the 5 explanations <b><u>${blockLabel}</u></b> produced. Use the <b><u>arrows</u></b> (&#8249; &#8250;) to review them, then answer the questions about <b><u>${blockLabel}</u></b>.`
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
  progressLabelEl.textContent = `Page ${logicalCurrentPage} of ${logicalTotalPages}`
  // Participant-facing badge names the (anonymized) system for this chart so the
  // participant always knows which system produced the explanation they see.
  if (methodBadgeEl) methodBadgeEl.textContent = `${itemLabel} · Question ${page.itemIdx + 1} / ${sequence.length}`
  questionEl.textContent = item.question
  descriptionEl.textContent = ''
  // NEVER surface chart id / group / answer correctness here — this element is
  // participant-facing and printing the deception ground truth would give the
  // task away. The condition + correctness ground truth is persisted in the
  // saved doc (see buildSubmission) and logged to the console for researchers.
  debugMetaEl.textContent = ''

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

  if (page.kind === 'demographics') {
    currentItemIndex = -1
    showDemographicsLayout()
    updateUI()
    renderDemographicsPage() // runs last so it owns the shared question/description/survey containers
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
  let resolved = resolveSkips(urlIdx, urlIdx >= currentPageIndex ? 1 : -1)
  // Guard: a non-DEMO participant may not jump past their first unfinished page.
  resolved = Math.min(resolved, furthestAllowedPageIndex())
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
// Guard (post-hydration): a non-DEMO participant who deep-links to a page beyond
// their first unfinished one is snapped back to that furthest legitimate page,
// so every required response is collected in order. DEMO*/pilots are exempt.
currentPageIndex = Math.min(currentPageIndex, furthestAllowedPageIndex())
syncPageUrl(currentPageIndex, true)
void loadPage(currentPageIndex)
