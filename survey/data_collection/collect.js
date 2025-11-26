import {
    createNavButtons,
    createOpenEndedInput,
    createLikertQuestion
} from '../components.js';
import {
    getSettings,
    getDocument,
    patchDocument
} from '../firestore.js';
import { renderPlainVegaLiteChart } from '../../util/util.js';

// --- 1. 전역 상태 변수 ---
let participantCode = null;
let assignedCharts = [];
let allResponses = {};
let currentChartIndex = 0;
let tutorialCharts = [];
let tutorialResponses = {};
let currentTutorialIndex = 0;
let pageDescriptors = [];
let TOTAL_PAGES = 0;
let navigationInProgress = false;
let participantAssignments = null;

const container = () => document.querySelector('.main-scroll');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');
const DEFAULT_TUTORIAL_SPEC = 'pages/tutorial/tutorial_chart.json';
const OPS_CHECKBOX_NAME = 'ops-check';
const FORM_STAGE_QA = 'qa';
const FORM_STAGE_OPS = 'ops';

// --- 2. Firebase 헬퍼 함수 ---
const FIRESTORE_COLLECTION = 'data_collection';

async function fetchParticipantData(code) {
    try {
        const doc = await getDocument([FIRESTORE_COLLECTION, code]);
        return doc ? doc.fields.questions || {} : {};
    } catch (e) {
        console.error("Error fetching participant data:", e);
        return {};
    }
}

async function saveToFirebase(code, questionsMap) {
    if (!code) return;
    try {
        await patchDocument([FIRESTORE_COLLECTION, code], {
            questions: questionsMap,
            updatedAt: new Date()
        });
        console.log(`Saved data for ${code}`);
    } catch (e) {
        console.error("Error saving data to Firebase:", e);
        alert("Error saving progress. Please check your connection and try again.");
    }
}

async function loadParticipantAssignments() {
    if (participantAssignments) return participantAssignments;
    try {
        const res = await fetch('participant_assignments.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        participantAssignments = await res.json();
        tutorialCharts = Array.isArray(participantAssignments?.TUTORIAL) ? participantAssignments.TUTORIAL : [];
    } catch (e) {
        console.error("Failed to load participant assignments:", e);
        participantAssignments = null;
        tutorialCharts = [];
    }
    return participantAssignments;
}

const LOGIN_PAGE = { id: 'login', path: 'pages/code-entry.html', slug: 'login' };

const TUTORIAL_PAGES = [
    { id: 'tutorial_index', path: 'pages/tutorial/tutorial_index.html', slug: 'tutorial_index', group: 'tutorial', onLoad: setupTutorialExample },
    { id: 'tutorial_overview', path: 'pages/tutorial/tutorial_overview.html', slug: 'tutorial_overview', group: 'tutorial', onLoad: setupTutorialExample },
    // { id: 'tutorial_tip', path: 'pages/tutorial/tutorial_tip.html', slug: 'tutorial_tip', group: 'tutorial', onLoad: setupTutorialExample },
];

const STATIC_PAGES_BEFORE_TASK = [
    ...TUTORIAL_PAGES
];

const STATIC_PAGES_AFTER_TASK = [
    { id: 'complete', path: 'pages/completion.html', slug: 'complete' }
];

function getStaticPageCount() {
    return STATIC_PAGES_BEFORE_TASK.length + STATIC_PAGES_AFTER_TASK.length;
}

function buildPageDescriptorsForAssignedCharts() {
    const tutorialTaskDescriptors = (Array.isArray(tutorialCharts) ? tutorialCharts : []).map((chartId, i) => ({
        id: 'tutorial-task',
        slug: `tutorial-${chartId}`,
        path: 'pages/tutorial-task.html',
        group: 'tutorial-task',
        onLoad: (root, pageIdx) => {
            const offset = 1 + STATIC_PAGES_BEFORE_TASK.length;
            currentTutorialIndex = pageIdx - offset;
            const currentChartId = tutorialCharts[currentTutorialIndex];
            const label = root.querySelector('.tutorial-task-title');
            if (label) {
                label.textContent = `Tutorial Practice (${currentTutorialIndex + 1}/${tutorialCharts.length})`;
            }
            renderChartForTask(currentChartId, 'tutorial-chart-view');
            restoreTutorialInputs(currentChartId);
        }
    }));

    return [
        LOGIN_PAGE,
        ...STATIC_PAGES_BEFORE_TASK,
        ...tutorialTaskDescriptors,
        ...assignedCharts.map((chartId, i) => ({
            id: 'main-task',
            slug: chartId,
            path: 'pages/main-task.html',
            onLoad: (root, pageIdx) => {
                const offset = 1 + STATIC_PAGES_BEFORE_TASK.length + tutorialTaskDescriptors.length;
                currentChartIndex = pageIdx - offset;
                const currentChartId = assignedCharts[currentChartIndex];

                const dropdown = root.querySelector('#chart-dropdown');
                dropdown.innerHTML = '';
                assignedCharts.forEach((id, index) => {
                    const opt = new Option(`${index + 1} / ${assignedCharts.length}: ${id}`, id);
                    dropdown.appendChild(opt);
                });
                dropdown.value = currentChartId;

                dropdown.onchange = () => {
                    guardedNavigate(async () => {
                        saveCurrentChartData();
                        await persistAllData();
                        const newIdx = assignedCharts.indexOf(dropdown.value);
                        const offsetIndex = 1 + STATIC_PAGES_BEFORE_TASK.length;
                        loadPage(newIdx + offsetIndex);
                    });
                };

                renderChartForTask(currentChartId, 'chart-main-view');
                restoreInputsForChart(currentChartId);
            }
        })),
        ...STATIC_PAGES_AFTER_TASK
    ];
}

function computeTotalPagesForCharts(chartList, tutorialList = tutorialCharts) {
    const chartCount = Array.isArray(chartList) ? chartList.length : 0;
    const tutorialCount = Array.isArray(tutorialList) ? tutorialList.length : 0;
    const staticCount = getStaticPageCount(); // excludes login
    const total = chartCount + tutorialCount + staticCount;
    return total > 0 ? total : 1;
}

function normalizeSpecPath(rawPath) {
    const p = (rawPath || '').trim();
    if (!p) return null;
    if (p.startsWith('http') || p.startsWith('../../')) return p;
    if (p.startsWith('ChartQA/')) return `../../${p}`;
    if (p.startsWith('data/')) return `../../ChartQA/${p}`;
    return p;
}

function patchSpecDataUrl(spec) {
    if (!spec || !spec.data || !spec.data.url) return spec;
    return spec;
}

function ensureTooltipConfig(spec) {
    if (!spec || typeof spec !== 'object') return spec;
    const config = spec.config || {};
    const markConfig = config.mark || {};
    const barConfig = config.bar || {};
    const lineConfig = config.line || {};
    const areaConfig = config.area || {};
    const pointConfig = config.point || {};

    const applyIfUnset = (obj) => {
        if (obj.tooltip === undefined) {
            obj.tooltip = true;
        }
    };

    applyIfUnset(markConfig);
    applyIfUnset(barConfig);
    applyIfUnset(lineConfig);
    applyIfUnset(areaConfig);
    applyIfUnset(pointConfig);

    spec.config = {
        ...config,
        mark: markConfig,
        bar: barConfig,
        line: lineConfig,
        area: areaConfig,
        point: pointConfig
    };
    return spec;
}

async function renderChartIntoHost({ specPath, targetId, hostElement = null, placeholderText = 'Loading chart...' }) {
    const host = hostElement || document.getElementById(targetId);
    const normalizedPath = normalizeSpecPath(specPath);

    if (!host) {
        console.warn(`renderChartIntoHost: no host found for targetId="${targetId}"`);
        return;
    }
    if (!normalizedPath) {
        host.innerHTML = `<div class="chart-placeholder" style="color:red;">Missing chart spec path.</div>`;
        return;
    }

    host.innerHTML = `<div class="chart-placeholder">${placeholderText}</div>`;

    try {
        const response = await fetch(normalizedPath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const spec = ensureTooltipConfig(await response.json());
        patchSpecDataUrl(spec);
        delete host.dataset.chartBaseWidth;
        delete host.dataset.chartBaseHeight;
        host.innerHTML = '';
        await renderPlainVegaLiteChart(targetId, spec);
        fitChartToContainer(targetId);
    } catch (err) {
        console.error(`Failed to render chart from ${normalizedPath}`, err);
        host.innerHTML = `<div class="chart-placeholder" style="color:red;">Failed to load chart: ${err.message}</div>`;
    }
}

async function setupTutorialExample(root) {
    const chartWrap = root.querySelector('.tutorial-example-chart');
    const viewEl = root.querySelector('#tutorial-chart-view');
    const targetId = 'tutorial-chart-view';

    if (!chartWrap || !viewEl) return;

    const rawPath = chartWrap.dataset.specPath || DEFAULT_TUTORIAL_SPEC;
    const normalized = normalizeSpecPath(rawPath) || normalizeSpecPath(DEFAULT_TUTORIAL_SPEC);
    const specLabel = chartWrap.querySelector('.spec-path');
    if (specLabel) {
        specLabel.textContent = rawPath || DEFAULT_TUTORIAL_SPEC;
    }

    return renderChartIntoHost({
        specPath: normalized,
        targetId,
        hostElement: viewEl,
        placeholderText: 'Loading chart...'
    });
}

function refreshProgressIndicator(currentIndex = idx) {
    const progressBar = document.querySelector('.progress-bar');
    const progressLabel = document.querySelector('.progress-container span');
    if (!progressBar || !progressLabel) return;
    // login page is excluded from totals and hidden, so progress starts from tutorial (idx 1)
    const total = Math.max(1, TOTAL_PAGES || 1);
    const current = Math.min(Math.max(1, (currentIndex ?? 1)), total);
    progressBar.max = total;
    progressBar.value = current;
    const percentage = ((current / total) * 100).toFixed(2);
    progressLabel.textContent = `(${current}/${total}) ${percentage}%`;
}

function setTotalPages(nextTotal) {
    const sanitized = Number.isFinite(nextTotal) && nextTotal > 0 ? nextTotal : 1;
    if (TOTAL_PAGES !== sanitized) {
        TOTAL_PAGES = sanitized;
        refreshProgressIndicator();
    }
}

async function previewTotalPagesForCode(code) {
    const assignments = await loadParticipantAssignments();
    const charts = assignments?.[code] || [];
    const tutorialList = Array.isArray(assignments?.TUTORIAL) ? assignments.TUTORIAL : tutorialCharts;
    tutorialCharts = tutorialList;
    setTotalPages(computeTotalPagesForCharts(charts, tutorialList));
}

// --- 3. 핵심 로직 함수 ---

function renderComponents(root) {
  root.querySelectorAll('[data-component="likert"]').forEach(el => {
    const { name, question, labels, baseid } = el.dataset;
    const comp = createLikertQuestion({
      name,
      questionText: question,
      labels: labels.split('|'),
      baseId: baseid
    });
    el.replaceWith(comp);
  });

  root.querySelectorAll('[data-component="open-ended"]').forEach(el => {
    const { id, labeltext, placeholder, multiline } = el.dataset;
    const comp = createOpenEndedInput({
      id,
      labelText: labeltext,
      placeholder,
      multiline: multiline === 'true'
    });
    el.replaceWith(comp);
  });
}

function syncStageTabs(root, stage) {
    root?.querySelectorAll('[data-stage-btn]').forEach((btn) => {
        const target = btn.dataset.stageBtn;
        const isActive = target === stage;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function setFormStage(root, stage) {
    const normalized = stage === FORM_STAGE_OPS ? FORM_STAGE_OPS : FORM_STAGE_QA;
    if (root) {
        root.dataset.formStage = normalized;
    }
    root?.querySelectorAll('[data-stage]').forEach((panel) => {
        const isActive = (panel.dataset.stage || '') === normalized;
        panel.classList.toggle('is-active', isActive);
        panel.style.display = isActive ? '' : 'none';
    });
    syncStageTabs(root, normalized);
    updateQaReview(root);
}

function getFormStage(root) {
    return root?.dataset.formStage === FORM_STAGE_OPS ? FORM_STAGE_OPS : FORM_STAGE_QA;
}

function updateQaReview(root = container()) {
    const qText = (root?.querySelector('#q-question')?.value || '').trim() || 'No question yet.';
    const aText = (root?.querySelector('#q-answer')?.value || '').trim() || 'No answer yet.';
    const qDisplay = root?.querySelector('#qa-review-question');
    const aDisplay = root?.querySelector('#qa-review-answer');
    if (qDisplay) qDisplay.textContent = qText;
    if (aDisplay) aDisplay.textContent = aText;
}

function initStageTabs(root) {
    root?.querySelectorAll('[data-stage-btn]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.stageBtn;
            if (target === FORM_STAGE_OPS && !validateStage(root, FORM_STAGE_QA)) return;
            setFormStage(root, target);
        });
    });
}

function wireQaReviewListeners(root) {
    const qInput = root?.querySelector('#q-question');
    const aInput = root?.querySelector('#q-answer');
    if (qInput) qInput.addEventListener('input', () => updateQaReview(root));
    if (aInput) aInput.addEventListener('input', () => updateQaReview(root));
}

function addCustomOp(value) {
    const normalized = (value || '').trim();
    if (!normalized) return;
    const list = document.getElementById('ops-custom-list');
    if (!list) return;
    const existing = Array.from(list.querySelectorAll('[data-value]'))
        .map((el) => (el.dataset.value || '').toLowerCase());
    if (existing.includes(normalized.toLowerCase())) {
        return;
    }
    const chip = document.createElement('div');
    chip.className = 'ops-chip';
    chip.dataset.value = normalized;
    const label = document.createElement('span');
    label.className = 'ops-chip__label';
    label.textContent = normalized;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ops-chip__remove';
    removeBtn.textContent = '-';
    removeBtn.setAttribute('aria-label', `Remove ${normalized}`);
    removeBtn.addEventListener('click', () => {
        chip.remove();
    });
    chip.append(label, removeBtn);
    list.appendChild(chip);
}

function setCustomOps(values) {
    const list = document.getElementById('ops-custom-list');
    if (!list) return;
    list.innerHTML = '';
    (Array.isArray(values) ? values : []).forEach((v) => addCustomOp(v));
}

function getCustomOps() {
    const list = document.getElementById('ops-custom-list');
    if (!list) return [];
    return Array.from(list.querySelectorAll('[data-value]'))
        .map((el) => el.dataset.value)
        .filter(Boolean);
}

function initCustomOpsUI(root) {
    const input = root?.querySelector('#ops-custom-input');
    const addBtn = root?.querySelector('#ops-custom-add-btn');
    const handleAdd = () => {
        if (!input) return;
        addCustomOp(input.value);
        input.value = '';
        input.focus();
    };
    if (addBtn) {
        addBtn.addEventListener('click', handleAdd);
    }
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
            }
        });
    }
}

// 🔥 차트 ID에서 경로 추출 함수
// 형식: bar_simple_0egzejn5mejtnfdm 또는 line_multiple_abc123def456
function parseChartId(chartId) {
    const parts = chartId.split('_');
    
    if (parts.length !== 3) {
        console.error('Invalid chart ID format:', chartId);
        return null;
    }
    
    const type = parts[0];      // bar 또는 line
    const subtype = parts[1];   // simple, stacked, grouped, multiple
    const filename = parts[2];  // 0egzejn5mejtnfdm
    
    return { type, subtype, filename };
}

// 🔥 차트 스펙 경로 생성 함수
// ChartQA/data/vlSpec/{type}/{subtype}/{filename}.json
function getChartSpecPath(chartId) {
    const parsed = parseChartId(chartId);
    
    if (!parsed) {
        console.error('Could not parse chart ID:', chartId);
        return null;
    }
    
    // ../../ = survey/data_collection/ -> root/
    // ChartQA/data/vlSpec/...
    return `../../ChartQA/data/vlSpec/${parsed.type}/${parsed.subtype}/${parsed.filename}.json`;
}

async function renderChartForTask(chartId, elementId) {
    const specPath = getChartSpecPath(chartId);
    
    if (!specPath) {
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = `<p style="color: red;">Invalid chart ID: ${chartId}</p>`;
        return;
    }
    
    return renderChartIntoHost({
        specPath,
        targetId: elementId,
        placeholderText: 'Loading chart...'
    });
}

function saveCurrentChartData() {
    if (currentChartIndex < 0 || currentChartIndex >= assignedCharts.length) return;
    
    const chartId = assignedCharts[currentChartIndex];
    if (!chartId) return;

    const qInput = document.getElementById('q-question');
    const aInput = document.getElementById('q-answer');
    const eInput = document.getElementById('q-explanation');

    if (!qInput || !aInput || !eInput) {
        return;
    }

    const data = {
        question: qInput.value || "",
        answer: aInput.value || "",
        explanation: eInput.value || "",
        ops: getOpsSelection()
    };
    
    allResponses[chartId] = data;
    console.log(`Saving locally for ${chartId}:`, data);
}

function saveCurrentTutorialData() {
    if (currentTutorialIndex < 0 || currentTutorialIndex >= tutorialCharts.length) return;
    const chartId = tutorialCharts[currentTutorialIndex];
    if (!chartId) return;

    const qInput = document.getElementById('q-question');
    const aInput = document.getElementById('q-answer');
    const eInput = document.getElementById('q-explanation');
    if (!qInput || !aInput || !eInput) return;

    const data = {
        question: qInput.value || "",
        answer: aInput.value || "",
        explanation: eInput.value || "",
        ops: getOpsSelection()
    };
    tutorialResponses[chartId] = data;
}

async function persistAllData() {
    if (participantCode) {
        await saveToFirebase(participantCode, allResponses);
    }
}

function fitChartToContainer(elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    const embedRoot = container.querySelector('.vega-embed');
    if (embedRoot) {
        embedRoot.style.width = '100%';
        embedRoot.style.height = '100%';
        embedRoot.style.display = 'flex';
        embedRoot.style.alignItems = 'center';
        embedRoot.style.justifyContent = 'center';
    }

    const target = container.querySelector('.vega-embed svg, .vega-embed canvas, svg, canvas');
    if (!target) return;

    // Cache the original rendered size so we can scale relative to it
    let baseWidth = Number(container.dataset.chartBaseWidth);
    let baseHeight = Number(container.dataset.chartBaseHeight);
    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) {
        const attrWidth = Number(target.getAttribute('width'));
        const attrHeight = Number(target.getAttribute('height'));
        const viewBox = target.viewBox && target.viewBox.baseVal ? target.viewBox.baseVal : null;
        baseWidth = Number.isFinite(attrWidth) && attrWidth > 0 ? attrWidth : (viewBox ? viewBox.width : target.clientWidth);
        baseHeight = Number.isFinite(attrHeight) && attrHeight > 0 ? attrHeight : (viewBox ? viewBox.height : target.clientHeight);
        if (!Number.isFinite(baseWidth) || baseWidth <= 0 || !Number.isFinite(baseHeight) || baseHeight <= 0) return;
        container.dataset.chartBaseWidth = `${baseWidth}`;
        container.dataset.chartBaseHeight = `${baseHeight}`;
    }

    const { clientWidth, clientHeight } = container;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    // Decide which dimension to align to container, maintain aspect ratio
    const scaleWidth = clientWidth / baseWidth;
    const scaleHeight = clientHeight / baseHeight;
    const scale = Math.min(scaleWidth, scaleHeight);

    const newWidth = baseWidth * scale;
    const newHeight = baseHeight * scale;

    target.style.width = `${newWidth}px`;
    target.style.height = `${newHeight}px`;
    target.setAttribute('width', `${newWidth}`);
    target.setAttribute('height', `${newHeight}`);

    if (target.tagName && target.tagName.toLowerCase() === 'svg') {
        target.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    if (!container.dataset.fitListenerAttached) {
        const resizeHandler = () => fitChartToContainer(elementId);
        container.dataset.fitListenerAttached = 'true';
        window.addEventListener('resize', resizeHandler, { passive: true });
    }
}

function restoreInputsForChart(chartId) {
    const data = allResponses[chartId] || { question: "", answer: "", explanation: "", ops: null };

    const qInput = document.getElementById('q-question');
    const aInput = document.getElementById('q-answer');
    const eInput = document.getElementById('q-explanation');

    if (qInput) qInput.value = data.question;
    if (aInput) aInput.value = data.answer;
    if (eInput) eInput.value = data.explanation;
    applyOpsSelection(data.ops);
    updateQaReview(container());
}

function restoreTutorialInputs(chartId) {
    const data = tutorialResponses[chartId] || { question: "", answer: "", explanation: "", ops: null };

    const qInput = document.getElementById('q-question');
    const aInput = document.getElementById('q-answer');
    const eInput = document.getElementById('q-explanation');

    if (qInput) qInput.value = data.question;
    if (aInput) aInput.value = data.answer;
    if (eInput) eInput.value = data.explanation;
    applyOpsSelection(data.ops);
    updateQaReview(container());
}

function setupTaskUI(root) {
    initStageTabs(root);
    initCustomOpsUI(root);
    wireQaReviewListeners(root);
    setFormStage(root, FORM_STAGE_QA);
    updateQaReview(root);
}

function setupExampleTutorialPage(root) {
    // Render chart using the existing tutorial renderer
    setupTutorialExample(root);
    initCustomOpsUI(root);
    wireQaReviewListeners(root);
    setFormStage(root, FORM_STAGE_QA);
    updateQaReview(root);
}

function getOpsSelection() {
    const checks = Array.from(document.querySelectorAll(`#ops-checklist input[type="checkbox"][value]`));
    const selected = checks.filter((c) => c.checked).map((c) => c.value);
    const others = getCustomOps();
    return {
        selected,
        others
    };
}

function applyOpsSelection(saved) {
    const checks = Array.from(document.querySelectorAll(`#ops-checklist input[type="checkbox"][value]`));
    const selected = Array.isArray(saved?.selected) ? saved.selected : [];
    checks.forEach((c) => {
        c.checked = selected.includes(c.value);
    });
    const customList = Array.isArray(saved?.others) ? saved.others : (Array.isArray(saved?.custom) ? saved.custom : []);
    setCustomOps(customList);
}

// --- 4. SPA 페이지 로더 및 라우터 ---

function updateButtons() {
    const prev = btnPrev();
    const next = btnNext();
    if (prev) prev.disabled = navigationInProgress || idx === 0;
    if (next) next.disabled = navigationInProgress;
}

async function guardedNavigate(task) {
    if (navigationInProgress) return;
    navigationInProgress = true;
    updateButtons();
    try {
        await task();
    } finally {
        navigationInProgress = false;
        updateButtons();
    }
}

let idx = 0;

async function loadPage(pageIndex) {
    idx = pageIndex;
    const descriptor = pageDescriptors[idx];
    if (!descriptor) return;

    const url = new URL(window.location.href);
    url.searchParams.set('page', pageIndex);
    history.replaceState({ pageIndex: idx }, '', url.href);
    
    updateButtons();

    const root = container();
    root.innerHTML = '<div id="dynamic-insert"></div>';
    const placeholder = root.querySelector('#dynamic-insert');

    try {
        const html = await (await fetch(descriptor.path)).text();
        placeholder.insertAdjacentHTML('afterend', html);
        placeholder.remove();

        const onLoadHandler = typeof descriptor.onLoad === 'function'
            ? descriptor.onLoad
            : (descriptor.group === 'tutorial' ? setupTutorialExample : null);

        if (onLoadHandler) {
            onLoadHandler(root, pageIndex);
        }

        renderComponents(root);
        if (descriptor.id === 'main-task') {
            setupTaskUI(root);
            const chartId = assignedCharts[currentChartIndex];
            if (chartId) {
                restoreInputsForChart(chartId);
            }
        } else if (descriptor.id === 'tutorial-task') {
            setupTaskUI(root);
            const chartId = tutorialCharts[currentTutorialIndex];
            if (chartId) {
                restoreTutorialInputs(chartId);
            }
        }
        const isExampleTutorial = !!root.querySelector('.tutorial-page--example');
        if (isExampleTutorial) {
            setupExampleTutorialPage(root);
        }

        if (descriptor.id === 'login') {
             const codeInput = document.getElementById('participant-code');
             if(codeInput && participantCode) codeInput.value = participantCode;
             if (codeInput) {
                 const handleInput = () => previewTotalPagesForCode(codeInput.value.trim().toUpperCase());
                 codeInput.addEventListener('input', handleInput);
                 handleInput();
             }
        } else if (descriptor.id === 'main-task') {
             // onLoad에서 이미 복원됨
        }

        const nav = createNavButtons({
            prevId: `prev_${idx}`,
            nextId: `next_${idx}`,
            onPrev: () => guardedNavigate(async () => {
                const stage = getFormStage(root);
                const isExampleTutorial = !!root.querySelector('.tutorial-page--example');
                if ((descriptor.id === 'main-task' || descriptor.id === 'tutorial-task' || isExampleTutorial) && stage === FORM_STAGE_OPS) {
                    setFormStage(root, FORM_STAGE_QA);
                    return;
                }
                if (descriptor.id === 'main-task') {
                    saveCurrentChartData();
                    await persistAllData();
                } else if (descriptor.id === 'tutorial-task') {
                    saveCurrentTutorialData();
                }
                loadPage(idx - 1);
            }),
            onNext: () => guardedNavigate(async () => {
                if (!validatePage(root)) return;
                const isExampleTutorial = !!root.querySelector('.tutorial-page--example');

                if (descriptor.id === 'login') {
                    const codeInput = document.getElementById('participant-code');
                    const code = codeInput.value.trim().toUpperCase();
                    if (!code) return alert("Please enter a code.");
                    
                    const assignments = await loadParticipantAssignments();
                    if (!assignments || !assignments[code]) {
                        return alert("Invalid participant code.");
                    }
                    
                    participantCode = code;
                    assignedCharts = assignments[code];
                    allResponses = await fetchParticipantData(code);
                    currentChartIndex = 0;
                    tutorialCharts = Array.isArray(assignments?.TUTORIAL) ? assignments.TUTORIAL : tutorialCharts;
                    tutorialResponses = {};

                    pageDescriptors = buildPageDescriptorsForAssignedCharts();
                    setTotalPages(computeTotalPagesForCharts(assignedCharts, tutorialCharts));

                    loadPage(idx + 1);

                } else if (isExampleTutorial) {
                    const stage = getFormStage(root);
                    if (stage === FORM_STAGE_QA) {
                        setFormStage(root, FORM_STAGE_OPS);
                        return;
                    }
                    loadPage(idx + 1);

                } else if (descriptor.group === 'tutorial') {
                    loadPage(idx + 1);
                    
                } else if (descriptor.id === 'tutorial-task') {
                    const stage = getFormStage(root);
                    if (stage === FORM_STAGE_QA) {
                        setFormStage(root, FORM_STAGE_OPS);
                        return;
                    }
                    saveCurrentTutorialData();
                    loadPage(idx + 1);

                } else if (descriptor.id === 'main-task') {
                    const stage = getFormStage(root);
                    if (stage === FORM_STAGE_QA) {
                        setFormStage(root, FORM_STAGE_OPS);
                        return;
                    }
                    saveCurrentChartData();
                    await persistAllData();
                    loadPage(idx + 1);
                }
            }),
            isLastPage: (descriptor.id === 'complete'),
            isAvailable: (descriptor.id !== 'complete'),
            hidePrev: (descriptor.id === 'login'),
            totalPages: descriptor.id === 'login' ? null : TOTAL_PAGES,
            currentPage: descriptor.id === 'login' ? null : Math.max(1, idx),
            showProgress: descriptor.id !== 'login',
            align: descriptor.id === 'login' ? 'start' : 'center'
        });
        root.appendChild(nav);

    } catch (e) {
        root.innerHTML = `<div class="error">Error loading page: ${e.message}</div>`;
    }
    refreshProgressIndicator(idx);
    updateButtons();
}

// --- 5. 유효성 검사 ---
function validateStage(root, stage) {
    const qInput = root?.querySelector('#q-question');
    const aInput = root?.querySelector('#q-answer');
    const eInput = root?.querySelector('#q-explanation');

    if (!qInput && !aInput && !eInput) {
        return true;
    }

    if (!qInput || qInput.value.trim() === '') {
        alert('Please enter your question.');
        qInput?.focus();
        return false;
    }
    
    if (!aInput || aInput.value.trim() === '') {
        alert('Please enter the answer.');
        aInput?.focus();
        return false;
    }

    if (stage === FORM_STAGE_OPS) {
        if (!eInput || eInput.value.trim() === '') {
            alert('Please enter the explanation.');
            eInput?.focus();
            return false;
        }
    }
    
    return true; 
}

function validatePage(root) {
    const stage = getFormStage(root);
    if (stage === FORM_STAGE_OPS) {
        return validateStage(root, FORM_STAGE_OPS);
    }
    return validateStage(root, FORM_STAGE_QA);
}

// --- 6. 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
    initSurvey();
});

async function initSurvey() {
    pageDescriptors = [LOGIN_PAGE];
    setTotalPages(0);

    const urlParams = new URLSearchParams(window.location.search);
    const codeFromQuery = (urlParams.get('code') || '').trim().toUpperCase();
    const assignments = await loadParticipantAssignments();
    tutorialCharts = Array.isArray(assignments?.TUTORIAL) ? assignments.TUTORIAL : [];

    if (codeFromQuery && assignments?.[codeFromQuery]) {
        participantCode = codeFromQuery;
        assignedCharts = assignments[codeFromQuery];
        allResponses = await fetchParticipantData(codeFromQuery);
        currentChartIndex = 0;
        pageDescriptors = buildPageDescriptorsForAssignedCharts();
        setTotalPages(computeTotalPagesForCharts(assignedCharts, tutorialCharts));
    }
    
    let startPage = parseInt(urlParams.get('page'), 10);
    if (isNaN(startPage) || startPage < 0 || startPage >= pageDescriptors.length) {
        startPage = 0;
    }
    
    loadPage(startPage);
}
