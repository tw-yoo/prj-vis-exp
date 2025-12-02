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
import { renderTutorialExamplePlaceholders } from './pages/tutorial/tutorial_example_template.js';

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
let opsOptionsCache = null;

const container = () => document.querySelector('.main-scroll');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');
const DEFAULT_TUTORIAL_SPEC = 'pages/tutorial/tutorial_chart.json';
const OPS_CHECKBOX_NAME = 'ops-check';
const FORM_STAGE_QA = 'qa';
const FORM_STAGE_OPS = 'ops';

// --- 1b. Local session persistence ---
const SESSION_STORAGE_KEY = 'data_collection_state_v1';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
let restoredFormStage = null;
let restoredPageIndex = null;
let draftParticipantCode = '';
let persistTimer = null;
let lastActivityAt = Date.now();

const getCurrentDescriptor = () => pageDescriptors?.[idx];

function clearStoredSession() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(SESSION_STORAGE_KEY);
        }
    } catch (err) {
        console.warn('Failed to clear stored session:', err);
    }
}

function loadStoredSession() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const expiresAt = parsed?.expiresAt;
        if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch (err) {
        console.warn('Failed to load stored session:', err);
        try {
            localStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (_) {}
        return null;
    }
}

function syncCurrentDraftFromPage(descriptor = getCurrentDescriptor(), root = container()) {
    const extras = {};
    if (!descriptor || !root) return extras;

    if (descriptor.id === 'login') {
        const codeInput = root.querySelector('#participant-code');
        draftParticipantCode = (codeInput?.value || '').trim().toUpperCase();
        extras.draftParticipantCode = draftParticipantCode;
        return extras;
    }

    const isExampleTutorial = !!root.querySelector('.tutorial-page--example');
    if (descriptor.id === 'main-task') {
        saveCurrentChartData({ silent: true });
    } else if (descriptor.id === 'tutorial-task' || isExampleTutorial) {
        saveCurrentTutorialData();
    }
    return extras;
}

function persistSessionState(options = {}) {
    if (typeof localStorage === 'undefined') return;
    const { skipSync = false, markActivity = true } = options;
    const descriptor = getCurrentDescriptor();
    const extras = skipSync ? {} : syncCurrentDraftFromPage(descriptor, container());
    const activityTime = markActivity ? Date.now() : lastActivityAt;
    if (markActivity) {
        lastActivityAt = activityTime;
    }
    const state = {
        version: 1,
        idx,
        participantCode,
        draftParticipantCode,
        assignedCharts: Array.isArray(assignedCharts) ? assignedCharts : [],
        tutorialCharts: Array.isArray(tutorialCharts) ? tutorialCharts : [],
        allResponses,
        tutorialResponses,
        currentChartIndex,
        currentTutorialIndex,
        formStage: getFormStage(container()),
        pageSlug: descriptor?.slug,
        pageId: descriptor?.id,
        lastUpdated: activityTime,
        expiresAt: activityTime + SESSION_TTL_MS,
        ...extras
    };
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        console.warn('Failed to persist survey state:', err);
    }
}

function schedulePersistSession(delay = 400) {
    lastActivityAt = Date.now();
    if (persistTimer) {
        clearTimeout(persistTimer);
    }
    persistTimer = window.setTimeout(() => {
        persistTimer = null;
        persistSessionState();
    }, delay);
}

function ensureAutosaveListeners() {
    const root = container();
    if (!root || root.dataset.autosaveBound === 'true') return;
    const handler = () => schedulePersistSession();
    root.addEventListener('input', handler, true);
    root.addEventListener('change', handler, true);
    root.dataset.autosaveBound = 'true';
}

function clampIndex(value, length) {
    const max = Math.max(0, (length || 1) - 1);
    const num = Number.isFinite(value) ? value : 0;
    if (num < 0) return 0;
    if (num > max) return max;
    return num;
}

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
const TUTORIAL_EXAMPLE_TEMPLATE_PATH = 'pages/tutorial/tutorial_example_template.html';

const TUTORIAL_PAGES = [
    {
        id: 'tutorial_index',
        path: 'pages/tutorial/tutorial_index.html',
        slug: 'tutorial_index',
        group: 'tutorial',
        onLoad: setupTutorialExample
    },
    { 
        id: 'tutorial_ex1', 
        path: TUTORIAL_EXAMPLE_TEMPLATE_PATH, 
        slug: 'tutorial_ex1', 
        group: 'tutorial', 
        tutorialExampleId: 'tutorial_ex1',
        onLoad: setupTutorialExample 
    },
    { 
        id: 'tutorial_ex2', 
        path: TUTORIAL_EXAMPLE_TEMPLATE_PATH, 
        slug: 'tutorial_ex2', 
        group: 'tutorial', 
        tutorialExampleId: 'tutorial_ex2',
        onLoad: setupTutorialExample 
    },
    { 
        id: 'tutorial_ex3', 
        path: TUTORIAL_EXAMPLE_TEMPLATE_PATH, 
        slug: 'tutorial_ex3', 
        group: 'tutorial', 
        tutorialExampleId: 'tutorial_ex3',
        onLoad: setupTutorialExample 
    },
    { 
        id: 'tutorial_ex4', 
        path: TUTORIAL_EXAMPLE_TEMPLATE_PATH, 
        slug: 'tutorial_ex4', 
        group: 'tutorial', 
        tutorialExampleId: 'tutorial_ex4',
        onLoad: setupTutorialExample 
    },
    { 
        id: 'tutorial_ex5', 
        path: TUTORIAL_EXAMPLE_TEMPLATE_PATH, 
        slug: 'tutorial_ex5', 
        group: 'tutorial', 
        tutorialExampleId: 'tutorial_ex5',
        onLoad: setupTutorialExample 
    },
    // {
    //     id: 'tutorial_overview',
    //     path: 'pages/tutorial/tutorial_overview.html',
    //     slug: 'tutorial_overview',
    //     group: 'tutorial',
    //     onLoad: setupTutorialExample
    // },
    
];

const PAGES_BEFORE_INTRO = [
    { id: 'tutorial_end', path: 'pages/tutorial/tutorial_end.html', slug: 'tutorial_end', group: 'tutorial', onLoad: setupTutorialExample },
]

const STATIC_PAGES_BEFORE_TASK = [
    ...TUTORIAL_PAGES,
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
        ...PAGES_BEFORE_INTRO,
        ...assignedCharts.map((chartId, i) => ({
            id: 'main-task',
            slug: chartId,
            path: 'pages/main-task.html',
            onLoad: (root, pageIdx) => {
                // 📌 수정: offset 계산 수정
                const offset = 1 + STATIC_PAGES_BEFORE_TASK.length + tutorialTaskDescriptors.length + PAGES_BEFORE_INTRO.length;
                currentChartIndex = pageIdx - offset;
                
                // 📌 디버깅 로그 추가
                console.log('🔍 Debug:', {
                    pageIdx,
                    offset,
                    currentChartIndex,
                    totalCharts: assignedCharts.length,
                    chartId: assignedCharts[currentChartIndex]
                });
                
                const currentChartId = assignedCharts[currentChartIndex];

                // 📌 안전 장치 추가
                if (!currentChartId) {
                    console.error('❌ Invalid currentChartIndex:', currentChartIndex, 'assignedCharts:', assignedCharts);
                    return;
                }

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
                        const offsetIndex = 1 + STATIC_PAGES_BEFORE_TASK.length + tutorialTaskDescriptors.length + PAGES_BEFORE_INTRO.length;
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

    const dataUrl = spec.data.url;
    if (dataUrl.startsWith("ChartQA")) {
        spec.data.url = `../../${dataUrl}`;
    }

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

    const applyTooltipEncoding = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.layer)) {
            node.layer.forEach(applyTooltipEncoding);
        }
        const encoding = node.encoding || {};
        if (encoding.tooltip === undefined) {
            node.encoding = {
                ...encoding,
                tooltip: { content: 'data' }
            };
        }
    };
    const applyMarkTooltip = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.layer)) {
            node.layer.forEach(applyMarkTooltip);
        }
        if (node.mark !== undefined) {
            if (typeof node.mark === 'string') {
                node.mark = { type: node.mark, tooltip: true };
            } else if (node.mark && typeof node.mark === 'object' && node.mark.tooltip === undefined) {
                node.mark = { ...node.mark, tooltip: true };
            }
        }
    };
    applyTooltipEncoding(spec);
    applyMarkTooltip(spec);

    // 축 설정 - 기본값만 제공
    const axisConfig = {
        labelFontSize: 11,
        titleFontSize: 13,
        titlePadding: 10,
        labelPadding: 5,
        labelLimit: 0,
        ...(config.axis || {})
    };

    spec.config = {
        ...config,
        mark: markConfig,
        bar: barConfig,
        line: lineConfig,
        area: areaConfig,
        point: pointConfig,
        axis: axisConfig
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

function getDefaultOpsOptions() {
    return [
        { value: 'Retrieve Value', label: 'Retrieve Value', tip: 'Look up a single data point.' },
        { value: 'Filter', label: 'Filter', tip: 'Select data points that meet conditions.' },
        { value: 'Find Extremum', label: 'Find Extremum', tip: 'Find the maximum or minimum value.' },
        { value: 'Determine Range', label: 'Determine Range', tip: 'Difference between max and min values.' },
        { value: 'Compare', label: 'Compare', tip: 'Compare values between two items/groups.' },
        { value: 'Sort', label: 'Sort', tip: 'Order data ascending or descending.' },
        { value: 'Sum', label: 'Sum', tip: 'Add values together.' },
        { value: 'Average', label: 'Average', tip: 'Compute the mean of values.' },
        { value: 'Difference', label: 'Difference', tip: 'Subtract one value or group from another.' },
        { value: 'Nth', label: 'Nth', tip: 'Pick the 1st/2nd/3rd (or Nth) item after sorting.' },
        { value: 'Count', label: 'Count', tip: 'Count the number of items that meet a condition.' },
    ];
}

async function loadOpsOptions() {
    if (opsOptionsCache) return opsOptionsCache;
    try {
        const res = await fetch('ops_options.json', { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        const parsed = Array.isArray(json?.ops) ? json.ops : (Array.isArray(json) ? json : []);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('Invalid ops_options.json format');
        }
        opsOptionsCache = parsed;
    } catch (e) {
        console.warn('Failed to load ops_options.json, using defaults:', e);
        opsOptionsCache = getDefaultOpsOptions();
    }
    return opsOptionsCache;
}

async function populateOpsChecklist(root) {
    const container = root?.querySelector('#ops-checklist');
    if (!container) return;
    
    // Detailed operation information with examples
    const opsDetailed = [
        {
            value: "Retrieve Value",
            label: "Retrieve Value",
            tip: "Get a specific value from the chart\n\nExamples:\n• GDP of USA in 2020\n• Sunny days in July\n• Sales for Product A in Q2"
        },
        {
            value: "Filter",
            label: "Filter",
            tip: "Select data meeting conditions\n\nExamples:\n• By X-axis: Countries in Asia\n• By Y-axis: Values > 100\n• By Group: Only Group A\n• By Time: Years after 2015"
        },
        {
            value: "Find Extremum",
            label: "Find Extremum",
            tip: "Find maximum or minimum value\n\nExamples:\n• Country with highest GDP\n• Month with lowest rainfall\n• Product with min sales"
        },
        {
            value: "Determine Range",
            label: "Determine Range",
            tip: "Difference between max and min\n\nExamples:\n• Range of GDP values\n• Temperature range\n• Price variation"
        },
        {
            value: "Compare",
            label: "Compare",
            tip: "Compare values between items\n\nExamples:\n• USA vs China GDP\n• Q1 vs Q2 sales\n• Group A vs Group B average"
        },
        {
            value: "Sort",
            label: "Sort",
            tip: "Arrange data in order\n\nExamples:\n• Sort by GDP (descending)\n• Order by rainfall (ascending)\n• Rank products by sales"
        },
        {
            value: "Sum",
            label: "Sum",
            tip: "Add multiple values together\n\nExamples:\n• Total GDP of Asian countries\n• Combined product sales\n• Total summer rainfall"
        },
        {
            value: "Average",
            label: "Average",
            tip: "Calculate the mean of values\n\nExamples:\n• Average GDP across countries\n• Mean temperature in January\n• Average sales per quarter"
        },
        {
            value: "Difference",
            label: "Difference",
            tip: "Subtract one value from another\n\nExamples:\n• USA GDP - China GDP\n• Q4 sales - Q1 sales\n• Max value - Min value"
        },
        {
            value: "Nth",
            label: "Nth",
            tip: "Select the nth item after sorting\n\nExamples:\n• 3rd highest GDP country\n• 2nd lowest temp month\n• 5th ranked product"
        },
        {
            value: "Count",
            label: "Count",
            tip: "Count items meeting a condition\n\nExamples:\n• Countries with GDP > 1000\n• Months with rain > 50mm\n• Products with sales < avg"
        }
    ];
    
    container.innerHTML = '';
    opsDetailed.forEach((op) => {
        const { value, label, tip } = op || {};
        if (!value && !label) return;
        const wrapper = document.createElement('label');
        wrapper.className = 'ops-check';
        wrapper.dataset.tip = tip || '';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = value || label || '';
        const span = document.createElement('span');
        span.textContent = label || value || '';
        wrapper.appendChild(input);
        wrapper.appendChild(span);
        container.appendChild(wrapper);
    });
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

async function renderOpsReferenceTags(root) {
    if (!root) return;
    const target = root.querySelector('[data-name="q-explanation"]');
    if (!target || target.dataset.opsRefRendered === 'true') return;

    const options = await loadOpsOptions();
    const allOptions = Array.isArray(options) ? options : getDefaultOpsOptions();
    if (!Array.isArray(allOptions) || allOptions.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'ops-reference';

    const heading = document.createElement('div');
    heading.className = 'ops-reference__title';
    heading.textContent = 'Available operations (for reference)';

    const tags = document.createElement('div');
    tags.className = 'ops-reference__tags';

    allOptions.forEach((op) => {
        const label = op?.value || op?.label;
        if (!label) return;
        const tag = document.createElement('span');
        tag.className = 'op-tag';
        if (op?.tip) {
            tag.dataset.tip = op.tip;
        }
        tag.textContent = label;
        tags.appendChild(tag);
    });

    wrapper.append(heading, tags);
    target.insertAdjacentElement('afterend', wrapper);
    target.dataset.opsRefRendered = 'true';
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
    persistSessionState();
}

function getFormStage(root) {
    return root?.dataset.formStage === FORM_STAGE_OPS ? FORM_STAGE_OPS : FORM_STAGE_QA;
}

function updateQaReview(root = container()) {
    const qText = (root?.querySelector('#q-question')?.value || '').trim() || 'No question yet.';
    const eText = (root?.querySelector('#q-explanation')?.value || '').trim() || 'No explanation yet.';
    const qDisplay = root?.querySelector('#qa-review-question');
    const eDisplay = root?.querySelector('#qa-review-explanation');
    if (qDisplay) qDisplay.textContent = qText;
    if (eDisplay) eDisplay.textContent = eText;
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
    const eInput = root?.querySelector('#q-explanation');
    if (qInput) qInput.addEventListener('input', () => updateQaReview(root));
    if (eInput) eInput.addEventListener('input', () => updateQaReview(root));
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
        schedulePersistSession();
    });
    chip.append(label, removeBtn);
    list.appendChild(chip);
    schedulePersistSession();
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

function saveCurrentChartData(options = {}) {
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
    if (!options?.silent) {
        console.log(`Saving locally for ${chartId}:`, data);
    }
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

function applyTutorialExampleDescriptor(root, descriptor) {
    if (!root || !descriptor?.tutorialExampleId) return;
    const placeholders = root.querySelectorAll('[data-tutorial-example-placeholder]');
    placeholders.forEach((placeholder) => {
        if (placeholder.dataset.tutorialExampleId) return;
        placeholder.dataset.tutorialExampleId = descriptor.tutorialExampleId;
    });
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

function applyRestoredStage(descriptor, root) {
    if (restoredPageIndex === null || restoredFormStage === null) return;
    if (restoredPageIndex !== idx) return;
    const targetStage = restoredFormStage === FORM_STAGE_OPS ? FORM_STAGE_OPS : FORM_STAGE_QA;
    const isStagePage = descriptor?.id === 'main-task'
        || descriptor?.id === 'tutorial-task'
        || !!root?.querySelector('.tutorial-page--example');
    if (isStagePage) {
        setFormStage(root, targetStage);
    }
    restoredPageIndex = null;
    restoredFormStage = null;
}

function bindCompletionPageHandlers(root) {
    const backHomeBtn = root?.querySelector('#btn-back-home');
    if (!backHomeBtn) return;
    backHomeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        guardedNavigate(() => loadPage(0));
    }, { capture: true });
}

async function loadPage(pageIndex) {
    idx = pageIndex;
    const descriptor = pageDescriptors[idx];
    if (!descriptor) return;

    const url = new URL(window.location.href);
    url.searchParams.set('page', pageIndex);
    history.replaceState({ pageIndex: idx }, '', url.href);
    
    updateButtons();
    ensureAutosaveListeners();

    const root = container();
    root.innerHTML = '<div id="dynamic-insert"></div>';
    const placeholder = root.querySelector('#dynamic-insert');

    try {
        const html = await (await fetch(descriptor.path)).text();
        placeholder.insertAdjacentHTML('afterend', html);
        placeholder.remove();
        applyTutorialExampleDescriptor(root, descriptor);
        renderTutorialExamplePlaceholders(root);

        const onLoadHandler = typeof descriptor.onLoad === 'function'
            ? descriptor.onLoad
            : (descriptor.group === 'tutorial' ? setupTutorialExample : null);

        if (onLoadHandler) {
            onLoadHandler(root, pageIndex);
        }

        renderComponents(root);
        await populateOpsChecklist(root);
        await renderOpsReferenceTags(root);
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

        applyRestoredStage(descriptor, root);

        if (descriptor.id === 'login') {
             const codeInput = document.getElementById('participant-code');
             if (codeInput) {
                 const prefill = participantCode || draftParticipantCode;
                 if (prefill) codeInput.value = prefill;
                 const handleInput = () => {
                     const value = codeInput.value.trim().toUpperCase();
                     draftParticipantCode = value;
                     previewTotalPagesForCode(value);
                     schedulePersistSession();
                 };
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
                persistSessionState({ skipSync: true });
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
                    draftParticipantCode = code;
                    assignedCharts = assignments[code];
                    allResponses = await fetchParticipantData(code);
                    currentChartIndex = 0;
                    tutorialCharts = Array.isArray(assignments?.TUTORIAL) ? assignments.TUTORIAL : tutorialCharts;
                    tutorialResponses = {};

                    pageDescriptors = buildPageDescriptorsForAssignedCharts();
                    setTotalPages(computeTotalPagesForCharts(assignedCharts, tutorialCharts));
                    persistSessionState({ skipSync: true });
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
                    persistSessionState({ skipSync: true });
                    loadPage(idx + 1);

                } else if (descriptor.id === 'main-task') {
                    const stage = getFormStage(root);
                    if (stage === FORM_STAGE_QA) {
                        setFormStage(root, FORM_STAGE_OPS);
                        return;
                    }
                    saveCurrentChartData();
                    await persistAllData();
                    persistSessionState({ skipSync: true });
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
        if (descriptor.id === 'complete') {
            bindCompletionPageHandlers(root);
        }

    } catch (e) {
        root.innerHTML = `<div class="error">Error loading page: ${e.message}</div>`;
    }
    persistSessionState();
    refreshProgressIndicator(idx);
    updateButtons();
}

// --- 5. 유효성 검사 ---
function validateStage(root, stage) {
    const qInput = root?.querySelector('#q-question');
    const eInput = root?.querySelector('#q-explanation');
    const aInput = root?.querySelector('#q-answer');

    if (!qInput && !eInput && !aInput) {
        return true;
    }

    if (!qInput || qInput.value.trim() === '') {
        alert('Please enter your question.');
        qInput?.focus();
        return false;
    }

    if (!eInput || eInput.value.trim() === '') {
        alert('Please enter the explanation.');
        eInput?.focus();
        return false;
    }

    if (stage === FORM_STAGE_OPS) {
        if (!aInput || aInput.value.trim() === '') {
            alert('Please enter the answer.');
            aInput?.focus();
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
window.addEventListener('beforeunload', () => {
    try {
        persistSessionState({ markActivity: false });
    } catch (err) {
        console.warn('Failed to persist session on unload:', err);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initSurvey();
});

async function initSurvey() {
    pageDescriptors = [LOGIN_PAGE];
    setTotalPages(0);
    ensureAutosaveListeners();

    const urlParams = new URLSearchParams(window.location.search);
    const codeFromQuery = (urlParams.get('code') || '').trim().toUpperCase();
    const storedSession = loadStoredSession();
    const assignments = await loadParticipantAssignments();
    tutorialCharts = Array.isArray(assignments?.TUTORIAL) ? assignments.TUTORIAL : tutorialCharts;

    let startPage = 0;

    if (codeFromQuery && assignments?.[codeFromQuery]) {
        participantCode = codeFromQuery;
        draftParticipantCode = codeFromQuery;
        assignedCharts = assignments[codeFromQuery];
        try {
            const remote = await fetchParticipantData(codeFromQuery);
            allResponses = remote || {};
        } catch (err) {
            console.warn('Failed to fetch responses for code from query:', err);
        }
        currentChartIndex = 0;
        pageDescriptors = buildPageDescriptorsForAssignedCharts();
        setTotalPages(computeTotalPagesForCharts(assignedCharts, tutorialCharts));
        const pageParam = parseInt(urlParams.get('page'), 10);
        startPage = clampIndex(pageParam, pageDescriptors.length);
    } else if (storedSession) {
        draftParticipantCode = storedSession.draftParticipantCode || '';
        lastActivityAt = Number(storedSession.lastUpdated) || lastActivityAt;
        const storedCode = storedSession.participantCode;
        const assigned = storedCode && assignments?.[storedCode] ? assignments[storedCode] : null;
        if (assigned && assigned.length > 0) {
            participantCode = storedCode;
            assignedCharts = assigned;
            let remoteResponses = {};
            try {
                remoteResponses = await fetchParticipantData(storedCode);
            } catch (err) {
                console.warn('Failed to fetch responses for stored session:', err);
            }
            allResponses = { ...(remoteResponses || {}), ...(storedSession.allResponses || {}) };
            tutorialResponses = storedSession.tutorialResponses || {};
            tutorialCharts = Array.isArray(assignments?.TUTORIAL)
                ? assignments.TUTORIAL
                : (Array.isArray(storedSession.tutorialCharts) ? storedSession.tutorialCharts : tutorialCharts);
            currentChartIndex = clampIndex(storedSession.currentChartIndex, assignedCharts.length);
            currentTutorialIndex = clampIndex(storedSession.currentTutorialIndex, tutorialCharts.length);
            pageDescriptors = buildPageDescriptorsForAssignedCharts();
            setTotalPages(computeTotalPagesForCharts(assignedCharts, tutorialCharts));
            startPage = clampIndex(Number(storedSession.idx), pageDescriptors.length);
            restoredFormStage = storedSession.formStage === FORM_STAGE_OPS ? FORM_STAGE_OPS : FORM_STAGE_QA;
            restoredPageIndex = startPage;
        } else {
            startPage = clampIndex(Number(storedSession.idx), pageDescriptors.length);
        }
    } else {
        const pageParam = parseInt(urlParams.get('page'), 10);
        startPage = (isNaN(pageParam) || pageParam < 0 || pageParam >= pageDescriptors.length) ? 0 : pageParam;
    }

    loadPage(startPage);
}
