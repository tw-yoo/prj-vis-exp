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
let pageDescriptors = [];
let TOTAL_PAGES = 0;
let navigationInProgress = false;
let participantAssignments = null;

const container = () => document.querySelector('.main-scroll');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');
const DEFAULT_TUTORIAL_SPEC = 'ChartQA/data/vlSpec/bar/simple/0a5npu4o61dz4r5f.json';

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
    } catch (e) {
        console.error("Failed to load participant assignments:", e);
        participantAssignments = null;
    }
    return participantAssignments;
}

const LOGIN_PAGE = { id: 'login', path: 'pages/code-entry.html', slug: 'login' };

const STATIC_PAGES_BEFORE_TASK = [
    { id: 'tutorial', path: 'pages/tutorial.html', slug: 'tutorial' }
];

const STATIC_PAGES_AFTER_TASK = [
    { id: 'complete', path: 'pages/completion.html', slug: 'complete' }
];

function getStaticPageCount() {
    return STATIC_PAGES_BEFORE_TASK.length + STATIC_PAGES_AFTER_TASK.length;
}

function buildPageDescriptorsForAssignedCharts() {
    return [
        LOGIN_PAGE,
        ...STATIC_PAGES_BEFORE_TASK,
        ...assignedCharts.map((chartId, i) => ({
            id: 'main-task',
            slug: chartId,
            path: 'pages/main-task.html',
            onLoad: (root, pageIdx) => {
                const offset = 1 + STATIC_PAGES_BEFORE_TASK.length;
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

function computeTotalPagesForCharts(chartList) {
    const chartCount = Array.isArray(chartList) ? chartList.length : 0;
    const staticCount = getStaticPageCount(); // excludes login
    const total = chartCount + staticCount;
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
    if (dataUrl.startsWith('http') || dataUrl.startsWith('../../')) {
        return spec;
    }
    // if (dataUrl.startsWith('ChartQA/')) {
    //     spec.data.url = `../../${dataUrl}`;
    // } else if (dataUrl.startsWith('data/')) {
    //     spec.data.url = `../../ChartQA/${dataUrl}`;
    // } else {
    //     spec.data.url = `../../ChartQA/${dataUrl}`;
    // }
    return spec;
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

    const render = async () => {
        if (!normalized) return;
        viewEl.innerHTML = '<div class="chart-placeholder">Loading chart...</div>';
        try {
            const spec = await (await fetch(normalized)).json();
            patchSpecDataUrl(spec);
            delete viewEl.dataset.chartBaseWidth;
            delete viewEl.dataset.chartBaseHeight;
            viewEl.innerHTML = '';
            await renderPlainVegaLiteChart(targetId, spec);
            fitChartToContainer(targetId);
        } catch (err) {
            console.error('Failed to render tutorial chart', err);
            viewEl.innerHTML = `<div class="chart-placeholder" style="color:red;">Failed to load chart: ${err.message}</div>`;
        }
    };

    render();
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
    setTotalPages(computeTotalPagesForCharts(charts));
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
    
    try {
        const spec = await (await fetch(specPath)).json();
        const host = document.getElementById(elementId);
        if (host) {
            delete host.dataset.chartBaseWidth;
            delete host.dataset.chartBaseHeight;
        }
        patchSpecDataUrl(spec);
        
        // 데이터 경로 수정
        if (spec.data && spec.data.url) {
            const dataUrl = spec.data.url;
            
            // 절대 경로나 이미 수정된 경로는 건드리지 않음
            if (dataUrl.startsWith('http') || dataUrl.startsWith('../../')) {
                // 그대로 유지
            }
            // ChartQA로 시작하는 경우 (이미 ChartQA 포함)
            else if (dataUrl.startsWith('ChartQA/')) {
                spec.data.url = `../../${dataUrl}`;
            }
            // data로 시작하는 경우 (ChartQA 없음)
            else if (dataUrl.startsWith('data/')) {
                spec.data.url = `../../ChartQA/${dataUrl}`;
            }
            // 기타 경우
            else {
                spec.data.url = `../../ChartQA/${dataUrl}`;
            }
        }
        
        await renderPlainVegaLiteChart(elementId, spec);
        fitChartToContainer(elementId);
        
    } catch (e) {
        console.error(`Failed to render chart ${chartId} from ${specPath}`, e);
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = `<p style="color: red;">Error loading chart: ${e.message}<br>Path: ${specPath}</p>`;
    }
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
        explanation: eInput.value || ""
    };
    
    allResponses[chartId] = data;
    console.log(`Saving locally for ${chartId}:`, data);
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
    const prefersHeight = baseHeight >= baseWidth;
    const scale = prefersHeight
        ? (clientHeight / baseHeight)
        : (clientWidth / baseWidth);

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
    const data = allResponses[chartId] || { question: "", answer: "", explanation: "" };

    const qInput = document.getElementById('q-question');
    const aInput = document.getElementById('q-answer');
    const eInput = document.getElementById('q-explanation');

    if (qInput) qInput.value = data.question;
    if (aInput) aInput.value = data.answer;
    if (eInput) eInput.value = data.explanation;
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

        if (typeof descriptor.onLoad === 'function') {
            descriptor.onLoad(root, pageIndex);
        }
        
        renderComponents(root);
        
        if (descriptor.id === 'login') {
             const codeInput = document.getElementById('participant-code');
             if(codeInput && participantCode) codeInput.value = participantCode;
             if (codeInput) {
                 const handleInput = () => previewTotalPagesForCode(codeInput.value.trim().toUpperCase());
                 codeInput.addEventListener('input', handleInput);
                 handleInput();
             }
        } else if (descriptor.id === 'tutorial') {
             setupTutorialExample(root);
        } else if (descriptor.id === 'main-task') {
             // onLoad에서 이미 복원됨
        }

        const nav = createNavButtons({
            prevId: `prev_${idx}`,
            nextId: `next_${idx}`,
            onPrev: () => guardedNavigate(async () => {
                if (descriptor.id === 'main-task') {
                    saveCurrentChartData();
                    await persistAllData();
                }
                loadPage(idx - 1);
            }),
            onNext: () => guardedNavigate(async () => {
                if (!validatePage(root)) return;
                
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
                    
                    pageDescriptors = buildPageDescriptorsForAssignedCharts();
                    setTotalPages(computeTotalPagesForCharts(assignedCharts));
                    
                    loadPage(idx + 1);

                } else if (descriptor.id === 'tutorial') {
                    loadPage(idx + 1);
                    
                } else if (descriptor.id === 'main-task') {
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
            showProgress: descriptor.id !== 'login'
        });
        root.appendChild(nav);

    } catch (e) {
        root.innerHTML = `<div class="error">Error loading page: ${e.message}</div>`;
    }
    refreshProgressIndicator(idx);
    updateButtons();
}

// --- 5. 유효성 검사 ---
function validatePage(root) {
    const qInput = root.querySelector('#q-question');
    const aInput = root.querySelector('#q-answer');
    const eInput = root.querySelector('#q-explanation');

    if (!qInput && !aInput && !eInput) {
        return true;
    }

    if (!qInput || qInput.value.trim() === '') {
        alert('Please enter your question.');
        qInput.focus();
        return false;
    }
    
    if (!aInput || aInput.value.trim() === '') {
        alert('Please enter the answer.');
        aInput.focus();
        return false;
    }
    
    if (!eInput || eInput.value.trim() === '') {
        alert('Please enter the explanation.');
        eInput.focus();
        return false;
    }
    
    return true; 
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

    if (codeFromQuery && assignments?.[codeFromQuery]) {
        participantCode = codeFromQuery;
        assignedCharts = assignments[codeFromQuery];
        allResponses = await fetchParticipantData(codeFromQuery);
        currentChartIndex = 0;
        pageDescriptors = buildPageDescriptorsForAssignedCharts();
        setTotalPages(computeTotalPagesForCharts(assignedCharts));
    }
    
    let startPage = parseInt(urlParams.get('page'), 10);
    if (isNaN(startPage) || startPage < 0 || startPage >= pageDescriptors.length) {
        startPage = 0;
    }
    
    loadPage(startPage);
}
