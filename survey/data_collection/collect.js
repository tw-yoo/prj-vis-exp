import {
    createNavButtons,
    createOpenEndedInput,
    createLikertQuestion // [수정] renderComponents 대신 createLikertQuestion을 import
} from '../components.js';
import {
    getDocument,
    patchDocument,
    getSettings // <-- [수정] getSettings를 import 목록에 추가합니다.
} from '../firestore.js';
// (중요) renderPlainVegaLiteChart를 root의 util.js에서 임포트
// [수정] 경로를 '../util/util.js' -> '../../util/util.js'로 변경
import { renderPlainVegaLiteChart } from '../../util/util.js';

// --- 1. 전역 상태 변수 ---
let participantCode = null;
let assignedCharts = [];    // 참가자에게 할당된 차트 ID 목록 (예: ["tutorial1", "q1"])
let allResponses = {};      // 이 참가자의 모든 응답 (차트 ID 기준)
let currentChartIndex = 0;  // 현재 작업 중인 차트의 인덱스
let pageDescriptors = [];   // SPA 페이지 목록
let TOTAL_PAGES = 0;        // 전체 페이지 수 (동적으로 설정됨)
let navigationInProgress = false;

const container = () => document.querySelector('.main-scroll');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');

// --- 2. Firebase 헬퍼 함수 ---
const FIRESTORE_COLLECTION = 'data_collection';

async function fetchParticipantData(code) {
    try {
        // config.json에서 projectId 등을 읽어올 때까지 기다립니다.
        await getSettings(); 
        const doc = await getDocument([FIRESTORE_COLLECTION, code]);
        return doc ? doc.fields.questions || {} : {};
    } catch (e) {
        console.error("Error fetching participant data:", e);
        return {}; // 오프라인 모드 또는 오류 발생 시 빈 객체 반환
    }
}

async function saveToFirebase(code, questionsMap) {
    if (!code) return;
    try {
        // config.json에서 projectId 등을 읽어올 때까지 기다립니다.
        await getSettings();
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

// [추가] renderComponents 함수를 여기에 정의합니다.
// (pre-registration-main.js 등에서 사용하는 로직과 동일)
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
  
  // createChart 호출은 여기서 의도적으로 제외합니다.
  // 메인 차트는 2-main-task.html의 onLoad에서 renderChartForTask로 별도 처리됩니다.
}


// (중요) renderPlainVegaLiteChart를 사용하는 차트 렌더링 헬퍼
async function renderChartForTask(chartId, elementId) {
    // [수정] ch_ 접두사가 없는 ID를 사용하므로, 경로를 올바르게 조합합니다.
    const specPath = `../data/vlSpec/ch_${chartId}.json`;
    try {
        const response = await fetch(specPath);
        if (!response.ok) {
             throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
        }
        const spec = await response.json();
        
        // (필수) 데이터 경로 수정: util.js가 아닌 이 파일 기준이므로 '../' 추가
        if (spec.data && spec.data.url) {
            // [수정] 데이터 경로는 root/data/.. 이므로 `../../`
            if (!spec.data.url.startsWith('../')) {
                 spec.data.url = `../../${spec.data.url}`;
            }
        }
        
        // 요청하신 renderPlainVegaLiteChart 사용
        await renderPlainVegaLiteChart(elementId, spec);
        
    } catch (e) {
        console.error(`Failed to render chart ${chartId} from ${specPath}`, e);
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = `<p style="color: red;">Error loading chart: ${e.message}</p>`;
    }
}

// 현재 차트의 입력 데이터를 allResponses 객체에 저장
function saveCurrentChartData() {
    if (currentChartIndex < 0 || currentChartIndex >= assignedCharts.length) return;
    
    const chartId = assignedCharts[currentChartIndex];
    if (!chartId) return;

    const qInput = document.getElementById('q-question');
    const aInput = document.getElementById('q-answer');
    const eInput = document.getElementById('q-explanation');

    if (!qInput || !aInput || !eInput) {
        // 페이지에 입력 필드가 없으면 (예: 로그인 페이지) 저장 안함
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

// allResponses 객체의 데이터를 Firebase에 저장 (네비게이션 시 호출됨)
async function persistAllData() {
    if (participantCode) {
        saveCurrentChartData(); // 저장하기 직전에 현재 페이지 데이터 갱신
        await saveToFirebase(participantCode, allResponses);
    }
}

// 차트 변경 시 입력 필드 복원
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
    
    // [추가] Prev/Next 버튼 텍스트 업데이트
    if (pageDescriptors[idx] && pageDescriptors[idx].id === 'main-task') {
        if (prev) {
             prev.style.visibility = (currentChartIndex === 0) ? 'hidden' : 'visible';
        }
        if (next) {
            next.textContent = (currentChartIndex === assignedCharts.length - 1) ? 'Submit' : 'Next';
        }
    } else if (pageDescriptors[idx] && pageDescriptors[idx].id === 'login') {
         if (prev) prev.style.visibility = 'hidden';
         if (next) next.textContent = 'Next';
    }
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

let idx = 0; // 현재 페이지 인덱스

async function loadPage(pageIndex) {
    idx = pageIndex;
    const descriptor = pageDescriptors[idx];
    if (!descriptor) {
         console.error(`No page descriptor found for index: ${pageIndex}`);
         return;
    }

    // URL 업데이트 (페이지 인덱스 대신 slug 사용)
    const slug = descriptor.slug || `page-${idx}`;
    // [수정] URL을 localhost:8000/survey/collect/question/chart_100 형태로
    if (descriptor.id === 'login') {
        history.replaceState({ pageIndex: idx }, '', `index.html`);
    } else if (descriptor.id === 'main-task') {
        history.replaceState({ pageIndex: idx }, '', `question/${slug}`);
    } else if (descriptor.id === 'complete') {
        history.replaceState({ pageIndex: idx }, '', `complete`);
    }

    const root = container();
    root.innerHTML = '<div id="dynamic-insert"></div>'; // 이전 내용 삭제
    const placeholder = root.querySelector('#dynamic-insert');

    try {
        const html = await (await fetch(descriptor.path)).text();
        placeholder.insertAdjacentHTML('afterend', html);
        placeholder.remove();

        // 페이지별 로드 후 작업 (onLoad)
        if (typeof descriptor.onLoad === 'function') {
            descriptor.onLoad(root, pageIndex);
        }
        
        // 컴포넌트 렌더링
        renderComponents(root);
        
        // (중요) 작업 페이지가 아닌 경우 입력 필드 복원
        if (descriptor.id === 'login') {
             const codeInput = document.getElementById('participant-code');
             if(codeInput && participantCode) codeInput.value = participantCode;
        }

        // 네비게이션 버튼 생성
        const nav = createNavButtons({
            prevId: `prev_${idx}`,
            nextId: `next_${idx}`,
            onPrev: () => guardedNavigate(async () => {
                if (descriptor.id === 'main-task') {
                    await persistAllData(); // 저장
                    loadPage(idx - 1);
                } else {
                    loadPage(idx - 1);
                }
            }),
            onNext: () => guardedNavigate(async () => {
                if (!validatePage(root)) return;
                
                if (descriptor.id === 'login') {
                    // 로그인 페이지 'Next' 로직
                    const codeInput = document.getElementById('participant-code');
                    const code = codeInput.value.trim().toUpperCase();
                    if (!code) return alert("Please enter a code.");
                    
                    // [수정] participant_assignments.json 경로 수정
                    const assignments = await (await fetch('participant_assignments.json')).json();
                    
                    if (!assignments[code]) {
                        return alert("Invalid participant code.");
                    }
                    
                    participantCode = code;
                    assignedCharts = assignments[code];
                    allResponses = await fetchParticipantData(code);
                    currentChartIndex = 0;
                    
                    // (중요) 차트 페이지 동적 생성
                    pageDescriptors = [
                        { id: 'login', path: 'pages/code-entry.html', slug: 'login' }, // [수정] 1-login.html -> code-entry.html
                        ...assignedCharts.map((chartId, i) => ({
                            id: 'main-task', // 모든 차트 페이지가 동일한 템플릿/ID 사용
                            slug: chartId,
                            path: 'pages/main-task.html', // [수정] 2-main-task.html -> main-task.html
                            onLoad: (root, pageIdx) => {
                                currentChartIndex = pageIdx - 1; // 0번은 로그인
                                const currentChartId = assignedCharts[currentChartIndex];
                                
                                // 1. 드롭다운 채우기
                                const dropdown = root.querySelector('#chart-dropdown');
                                dropdown.innerHTML = '';
                                assignedCharts.forEach((id, index) => {
                                    const opt = new Option(`${index + 1} / ${assignedCharts.length}: ${id}`, id);
                                    dropdown.appendChild(opt);
                                });
                                dropdown.value = currentChartId;
                                
                                // 드롭다운 변경 시
                                dropdown.onchange = () => {
                                    guardedNavigate(async () => {
                                        await persistAllData(); // 현재 작업 저장
                                        const newIdx = assignedCharts.indexOf(dropdown.value);
                                        loadPage(newIdx + 1); // +1 (로그인 페이지)
                                    });
                                };

                                // 2. 차트 렌더링
                                renderChartForTask(currentChartId, 'chart-main-view');

                                // 3. 입력 필드 복원
                                restoreInputsForChart(currentChartId);
                            }
                        })),
                        { id: 'complete', path: 'pages/completion.html', slug: 'complete' } // [수정] 3-complete.html -> completion.html
                    ];
                    TOTAL_PAGES = pageDescriptors.length;
                    
                    loadPage(idx + 1); // 첫 번째 차트 페이지로 이동

                } else if (descriptor.id === 'main-task') {
                    // 메인 작업 페이지 'Next' 로직
                    await persistAllData(); // 전체 Firebase에 저장
                    loadPage(idx + 1); // 다음 페이지 (다음 차트 또는 완료)
                }
            }),
            isLastPage: (descriptor.id === 'complete'), // 마지막 페이지만 Submit
            isAvailable: (descriptor.id !== 'complete'), // 완료 페이지에서는 버튼 숨김
            hidePrev: (descriptor.id === 'login'),
            totalPages: TOTAL_PAGES,
            currentPage: idx + 1
        });
        root.appendChild(nav);
        
        // [추가] 페이지 로드 후 버튼 상태 즉시 업데이트
        updateButtons(); 

    } catch (e) {
        root.innerHTML = `<div class="error">Error loading page: ${e.message}</div>`;
    }
    updateButtons();
}

// --- 5. 유효성 검사 (간단) ---
function validatePage(root) {
    // 지금은 간단히 true로 두지만, `pre-registration-main.js`의 `validatePage`를 복사해와
    // `data-required="true"`인 필드를 검사하도록 확장할 수 있습니다.
    // (예: 질문, 정답, 풀이 모두 필수 입력)
    return true; 
}

// --- 6. 초기화 ---
document.addEventListener('DOMContentLoaded', () => {
    // 초기 페이지 목록 (로그인 페이지만)
    pageDescriptors = [
        { id: 'login', path: 'pages/code-entry.html', slug: 'login' } // [수정] 1-login.html -> code-entry.html
    ];
    TOTAL_PAGES = 1; // 시작은 1
    
    // [수정] URL 기반 라우팅 (간단하게)
    const path = window.location.pathname;
    if (path.includes("/question/")) {
         // URL에 차트 ID가 있으면, 코드 입력을 건너뛰었다고 가정하고
         // participantCode를 추후 설정해야 함.
         // 지금은 단순화를 위해 로그인 페이지로 강제 리디렉션
         console.warn("Direct access to question page not supported. Redirecting to login.");
         history.replaceState(null, '', 'index.html');
         loadPage(0);
    } else {
         loadPage(0); // 로그인 페이지로 시작
    }
});