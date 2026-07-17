import type { ChartGroupEntry, ChartGroupFile } from './participantSession'
import type { ExplanationMethod, ExplanationRenderer, RendererContext } from './renderers/types'
import { OursRenderer } from './renderers/oursRenderer'
import { BaselineRenderer } from './renderers/baselineRenderer'
import { TextRenderer } from './renderers/textRenderer'
import { ExpertRenderer } from './renderers/expertRenderer'

// /evaluation/all — an INTERNAL review page, not part of the participant flow.
// It lays every active study chart out in one scrollable list, grouped by chart
// type, and lets you flip each one between all four systems to check that the
// question, the explanation and the shown answer line up. No survey questions,
// no participant code, nothing written back to Firestore.
//
// Scope: the 20 active items — chart_group.json groups G1-G4 x 5 chart types,
// i.e. 4 charts per type. (G0/G5/GTM are tutorial, backup and tutorial-mode
// entries; they are not shown to participants as study items and are skipped.)

type ChartMap = {
  defaults?: {
    d3?: { model?: string }
    svg?: { model?: string }
  }
}

type Card = {
  chartId: string
  group: string
  entry: ChartGroupEntry
  method: ExplanationMethod
  renderer: ExplanationRenderer | null
  context: RendererContext
  chartEl: HTMLElement
  chartWrapEl: HTMLElement
  explanationEl: HTMLElement
  buttons: Map<ExplanationMethod, HTMLButtonElement>
  selectedStepIndex: number
  stepsUnlocked: number
  busy: boolean
  started: boolean
}

// Presentation order: all Simple Bars, then Stacked, Grouped, Simple Line,
// Multiple Line. Within a type the charts run G1 -> G4.
const TYPE_SECTIONS: Array<{ slot: string; label: string }> = [
  { slot: 'bar_simple', label: 'Simple Bar' },
  { slot: 'bar_stacked', label: 'Stacked Bar' },
  { slot: 'bar_grouped', label: 'Grouped Bar' },
  { slot: 'line_simple', label: 'Simple Line' },
  { slot: 'line_multiple', label: 'Multiple Line' },
]

const GROUPS = ['G1', 'G2', 'G3', 'G4']

const METHODS: Array<{ method: ExplanationMethod; label: string }> = [
  { method: 'ours', label: 'Ours' },
  { method: 'b1', label: 'B1' },
  { method: 'b2', label: 'B2' },
  { method: 'b3', label: 'B3' },
]

const DEFAULT_METHOD: ExplanationMethod = 'ours'

const evaluationBasePath = window.__EVALUATION_BASE_PATH__ ?? ''
const withBase = (p: string) => `${evaluationBasePath}${p}`

const rootEl = document.getElementById('allRoot') as HTMLElement
const subtitleEl = document.getElementById('allSubtitle') as HTMLElement

const [chartMap, chartGroup] = await Promise.all([
  fetch(withBase('/chart_map.json')).then((r) => r.json()) as Promise<ChartMap>,
  fetch(withBase('/chart_group.json')).then((r) => r.json()) as Promise<ChartGroupFile>,
])

const baselineModel = chartMap.defaults?.svg?.model ?? 'gpt-5.2'
const defaultD3Model = chartMap.defaults?.d3?.model ?? 'gpt-5.2'
const defaultSvgModel = baselineModel

// Same as the viewer's: the participant-facing renderers keep their own step
// state, so each card needs its own container + renderer instance.
function createRenderer(method: ExplanationMethod, context: RendererContext): ExplanationRenderer {
  if (method === 'ours') return new OursRenderer(context)
  if (method === 'b1') return new TextRenderer(context)
  if (method === 'b2') return new BaselineRenderer(context, 'b2')
  if (method === 'b3') return new ExpertRenderer(context)
  throw new Error(`Unknown method: ${method}`)
}

function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*\d+\.\s*/, '')
}

// The shown answer plus the ground truth, so a reviewer can see at a glance
// whether the value on screen is the planted-wrong one or the real one.
function appendAnswer(container: HTMLElement, entry: ChartGroupEntry) {
  const answerText = (entry.answer ?? '').trim()
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
  if (entry.answerIsCorrect === false) {
    const truth = document.createElement('div')
    truth.className = 'all-truth-line'
    truth.textContent = `True answer: ${entry.correctAnswer ?? '(unknown)'}`
    container.appendChild(truth)
  }
}

function renderExplanation(card: Card) {
  const container = card.explanationEl
  container.innerHTML = ''
  const stepTexts = card.renderer?.getStepTexts() ?? []

  // B1 is the plain-text condition: the whole prose at once, no stepping.
  if (card.method === 'b1') {
    const para = document.createElement('p')
    para.className = 'explanation-plain'
    para.textContent = stripLeadingNumber(stepTexts[0] ?? '').trim()
    container.appendChild(para)
    appendAnswer(container, card.entry)
    return
  }

  stepTexts.forEach((text, index) => {
    const isUnlocked = index <= card.stepsUnlocked
    const stateName = index === card.selectedStepIndex
      ? 'selected'
      : isUnlocked
        ? index === card.stepsUnlocked
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

    if (isUnlocked && !card.busy) {
      span.addEventListener('click', () => { void runStep(card, index) })
    }

    container.appendChild(span)
    if (index < stepTexts.length - 1) container.appendChild(document.createTextNode(' '))
  })

  appendAnswer(container, card.entry)
}

function showCardError(card: Card, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const errEl = document.createElement('div')
  errEl.className = 'renderer-error'
  errEl.textContent = `Render error: ${message}`
  card.chartEl.appendChild(errEl)
}

// Step semantics mirror the viewer: clicking an unlocked step runs up to it,
// and re-clicking the step you are on undoes it (back to the previous step, or
// to the un-annotated chart when undoing the first).
async function runStep(card: Card, stepIndex: number) {
  if (card.busy || !card.renderer) return
  const isUndo = stepIndex === card.selectedStepIndex
  const target = isUndo ? stepIndex - 1 : stepIndex
  card.busy = true
  renderExplanation(card)
  try {
    await card.renderer.renderStep(target)
    card.selectedStepIndex = target
    card.stepsUnlocked = isUndo ? target + 1 : Math.max(card.stepsUnlocked, target + 1)
  } catch (error) {
    console.error('[evaluation/all] renderStep failed', { chartId: card.chartId, method: card.method, stepIndex: target, error })
    card.selectedStepIndex = target
    showCardError(card, error)
  } finally {
    card.busy = false
    renderExplanation(card)
  }
}

async function selectMethod(card: Card, method: ExplanationMethod) {
  if (card.busy) return
  card.busy = true
  card.method = method
  card.selectedStepIndex = -1
  card.stepsUnlocked = 0
  card.buttons.forEach((btn, key) => {
    btn.classList.toggle('all-method-btn--active', key === method)
    btn.disabled = true
  })
  card.explanationEl.innerHTML = ''

  if (card.renderer) {
    card.renderer.teardown()
    card.renderer = null
  }
  // teardown() only empties the container, but Ours' summary caption lives in
  // the wrapper alongside it — drop it too, or it would hang over the next
  // system's chart.
  card.chartWrapEl.querySelector('.operation-summary-html-box')?.remove()
  card.chartEl.innerHTML = '<div class="all-chart__placeholder">Loading…</div>'

  try {
    const renderer = createRenderer(method, card.context)
    await renderer.loadChart(card.chartId)
    card.renderer = renderer
    card.chartEl.innerHTML = ''
    await renderer.renderStep(-1)
  } catch (error) {
    console.error('[evaluation/all] loadChart failed', { chartId: card.chartId, method, error })
    card.chartEl.innerHTML = ''
    showCardError(card, error)
  } finally {
    card.busy = false
    card.buttons.forEach((btn) => { btn.disabled = false })
    renderExplanation(card)
  }
}

function buildCard(group: string, entry: ChartGroupEntry): { el: HTMLElement; card: Card } {
  const el = document.createElement('section')
  el.className = 'chart-card all-card'

  const head = document.createElement('div')
  head.className = 'all-card__head'
  const groupTag = document.createElement('span')
  groupTag.className = 'all-card__group'
  groupTag.textContent = group
  const idTag = document.createElement('span')
  idTag.className = 'all-card__id'
  idTag.textContent = entry.id
  const truth = document.createElement('span')
  const isCorrect = entry.answerIsCorrect !== false
  truth.className = `all-truth ${isCorrect ? 'all-truth--correct' : 'all-truth--incorrect'}`
  truth.textContent = isCorrect ? 'CORRECT' : 'INCORRECT'
  head.append(groupTag, idTag, truth)

  const question = document.createElement('div')
  question.className = 'question-text'
  question.textContent = entry.question ?? ''

  const methods = document.createElement('div')
  methods.className = 'all-methods'

  // Ours draws its summary caption into the chart container's PARENT (see
  // drawSummaryTextBox), anchored 25px from that parent's top. The viewer's
  // parent is the chart card, whose top IS the chart; here the card starts with
  // the header and question, so the chart gets its own positioned wrapper and
  // the caption stays over the chart instead of landing on the question.
  const chartWrapEl = document.createElement('div')
  chartWrapEl.className = 'all-chart-wrap'
  const chartEl = document.createElement('div')
  chartEl.className = 'all-chart'
  chartEl.innerHTML = '<div class="all-chart__placeholder">Scroll to load</div>'
  chartWrapEl.appendChild(chartEl)

  const explanationEl = document.createElement('div')
  explanationEl.className = 'explanation-area'

  el.append(head, question, methods, chartWrapEl, explanationEl)

  const card: Card = {
    chartId: entry.id,
    group,
    entry,
    method: DEFAULT_METHOD,
    renderer: null,
    context: {
      container: chartEl,
      baselineBase: withBase('/baselines'),
      oursBase: withBase('/data/ours'),
      defaultD3Model,
      defaultSvgModel,
      baselineModel,
    },
    chartEl,
    chartWrapEl,
    explanationEl,
    buttons: new Map(),
    selectedStepIndex: -1,
    stepsUnlocked: 0,
    busy: false,
    started: false,
  }

  METHODS.forEach(({ method, label }) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `all-method-btn${method === DEFAULT_METHOD ? ' all-method-btn--active' : ''}`
    btn.textContent = label
    btn.addEventListener('click', () => {
      card.started = true
      void selectMethod(card, method)
    })
    card.buttons.set(method, btn)
    methods.appendChild(btn)
  })

  const hint = document.createElement('p')
  hint.className = 'all-hint'
  hint.textContent = 'Click a numbered step to run it; click the step you are on to undo it.'
  el.appendChild(hint)

  return { el, card }
}

const cards: Card[] = []
let shown = 0

for (const section of TYPE_SECTIONS) {
  const entries = GROUPS
    .map((group) => ({ group, entry: chartGroup[group]?.[section.slot] }))
    .filter((it): it is { group: string; entry: ChartGroupEntry } => Boolean(it.entry?.id))
  if (entries.length === 0) continue

  const title = document.createElement('h2')
  title.className = 'all-section-title'
  title.textContent = `${section.label} (${entries.length})`
  rootEl.appendChild(title)

  for (const { group, entry } of entries) {
    const { el, card } = buildCard(group, entry)
    rootEl.appendChild(el)
    cards.push(card)
    shown += 1
  }
}

const incorrect = cards.filter((c) => c.entry.answerIsCorrect === false).length
subtitleEl.textContent = `${shown} charts (G1–G4) · ${incorrect} with an incorrect answer · each chart renders with Ours by default; use the buttons to switch system.`

// 20 charts x an ops replay each is a lot to run up front, so a card only builds
// its chart once it is close to the viewport. Manual method clicks mark the card
// as started so the observer never overwrites the reviewer's choice.
const observer = new IntersectionObserver((observed) => {
  for (const record of observed) {
    if (!record.isIntersecting) continue
    const card = cards.find((c) => c.chartEl.closest('.all-card') === record.target)
    observer.unobserve(record.target)
    if (!card || card.started) continue
    card.started = true
    void selectMethod(card, DEFAULT_METHOD)
  }
}, { rootMargin: '300px 0px' })

cards.forEach((card) => {
  const el = card.chartEl.closest('.all-card')
  if (el) observer.observe(el)
})
