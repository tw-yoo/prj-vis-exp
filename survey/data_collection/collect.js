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

const container = () => document.querySelector('.main-scroll');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');

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
                    
                    const assignments = await (await fetch('participant_assignments.json')).json();
                    
                    if (!assignments[code]) {
                        return alert("Invalid participant code.");
                    }
                    
                    participantCode = code;
                    assignedCharts = assignments[code];
                    allResponses = await fetchParticipantData(code);
                    currentChartIndex = 0;
                    
                    pageDescriptors = [
                        { id: 'login', path: 'pages/code-entry.html', slug: 'login' },
                        { id: 'tutorial', path: 'pages/tutorial.html', slug: 'tutorial' },
                        ...assignedCharts.map((chartId, i) => ({
                            id: 'main-task',
                            slug: chartId,
                            path: 'pages/main-task.html',
                            onLoad: (root, pageIdx) => {
                                currentChartIndex = pageIdx - 2;
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
                                        loadPage(newIdx + 2);
                                    });
                                };

                                renderChartForTask(currentChartId, 'chart-main-view');
                                restoreInputsForChart(currentChartId);
                            }
                        })),
                        { id: 'complete', path: 'pages/completion.html', slug: 'complete' } 
                    ];
                    TOTAL_PAGES = pageDescriptors.length;
                    
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
            totalPages: TOTAL_PAGES,
            currentPage: idx + 1
        });
        root.appendChild(nav);

    } catch (e) {
        root.innerHTML = `<div class="error">Error loading page: ${e.message}</div>`;
    }
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
    pageDescriptors = [
        { id: 'login', path: 'pages/code-entry.html', slug: 'login' } 
    ];
    TOTAL_PAGES = 1;
    
    const urlParams = new URLSearchParams(window.location.search);
    let startPage = parseInt(urlParams.get('page'), 10);
    if (isNaN(startPage) || startPage < 0) {
        startPage = 0;
    }
    
    loadPage(startPage);
});