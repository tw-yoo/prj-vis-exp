// 1. 필요한 함수 임포트
// [수정] listDocuments를 새로 임포트합니다.
// [경로 수정] ../../ (survey/firestore.js)
import { listDocuments } from '../../firestore.js';
// [경로 수정] ../../../ (root/util/util.js)
import { renderPlainVegaLiteChart } from '../../../util/util.js';

// 2. DOM 요소 캐시
const chartListEl = document.getElementById('chart-list-links');
const chartViewEl = document.getElementById('chart-view');
const submissionListEl = document.getElementById('submission-list');

let allSubmissionsData = {}; // { participantCode: { questions: {...} } }
let uniqueChartIds = new Set();
let currentChartId = null;

// 3. 차트 렌더링 (참가자용 코드 재사용)
async function renderChart(chartId, elementId) {
    // [경로 수정] vlSpec 경로는 ../../ (survey/data/vlSpec) 여야 함
    const specPath = `../../data/vlSpec/ch_${chartId}.json`;
    try {
        const spec = await (await fetch(specPath)).json();
        
        // [경로 수정] 데이터 경로도 ../../../ (root/) 기준으로
        if (spec.data && spec.data.url) {
            if (spec.data.url.startsWith('survey/')) {
                 spec.data.url = `../../../${spec.data.url}`;
            } else if (spec.data.url.startsWith('data/')) {
                 spec.data.url = `../../../${spec.data.url}`;
            }
        }
        
        await renderPlainVegaLiteChart(elementId, spec);
        
    } catch (e) {
        console.error(`Failed to render chart ${chartId} from ${specPath}`, e);
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = `<p style="color: red;">Error loading chart: ${e.message}</p>`;
    }
}

// 4. 왼쪽 차트 목록 렌더링
function renderChartList() {
    if (uniqueChartIds.size === 0) {
        chartListEl.innerHTML = '<p>No submissions found yet.</p>';
        return;
    }
    
    chartListEl.innerHTML = ''; // 기존 목록 삭제
    
    // Set을 배열로 변환하여 정렬
    const sortedChartIds = Array.from(uniqueChartIds).sort();
    
    sortedChartIds.forEach(chartId => {
        const link = document.createElement('a');
        link.href = `#${chartId}`;
        link.textContent = chartId;
        if (chartId === currentChartId) {
            link.className = 'selected';
        }
        chartListEl.appendChild(link);
    });
}

// 5. 오른쪽 질문 목록 렌더링
function renderSubmissionsForChart(chartId) {
    if (!chartId) {
        submissionListEl.innerHTML = '<p>Select a chart to see submissions.</p>';
        return;
    }
    
    submissionListEl.innerHTML = ''; // 기존 목록 삭제
    let foundSubmissions = false;

    // 모든 참가자 데이터를 순회
    for (const [participantCode, data] of Object.entries(allSubmissionsData)) {
        const submission = data.questions ? data.questions[chartId] : null;
        
        // 이 차트에 대한 제출 데이터가 있으면
        if (submission && (submission.question || submission.answer || submission.explanation)) {
            foundSubmissions = true;
            
            const div = document.createElement('div');
            div.className = 'submission';
            
            // html-safe 텍스트로 변환하는 헬퍼 함수
            const escapeHTML = (str) => {
                if (!str) return '(No submission)';
                return str.replace(/[&<>"']/g, function(m) {
                    return {
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#39;'
                    }[m];
                });
            };

            div.innerHTML = `
                <h4>Participant: <span>${escapeHTML(participantCode)}</span></h4>
                <strong>Question:</strong>
                <pre>${escapeHTML(submission.question)}</pre>
                <strong>Answer:</strong>
                <pre>${escapeHTML(submission.answer)}</pre>
                <strong>Explanation:</strong>
                <pre>${escapeHTML(submission.explanation)}</pre>
            `;
            submissionListEl.appendChild(div);
        }
    }
    
    if (!foundSubmissions) {
        submissionListEl.innerHTML = '<p>No submissions found for this chart yet.</p>';
    }
}

// 6. 메인 뷰 로드 (해시 변경 시)
async function loadViewFromHash() {
    const hash = window.location.hash.replace('#', '');
    currentChartId = hash || null;
    
    // 차트 목록 (선택된 항목 하이라이트)
    renderChartList();
    
    if (currentChartId) {
        // 1. 차트 렌더링
        chartViewEl.innerHTML = '<p>Loading chart...</p>';
        await renderChart(currentChartId, 'chart-view');
        
        // 2. 제출물 렌더링
        renderSubmissionsForChart(currentChartId);
    } else {
        // 해시가 없으면 기본 메시지
        chartViewEl.innerHTML = '<p style="padding: 10px;">Select a chart from the list on the left.</p>';
        submissionListEl.innerHTML = '';
    }
}

// 7. 초기 데이터 로드 (최초 1회)
async function initializeViewer() {
    try {
        // 'data_collection' 컬렉션의 모든 문서를 가져옴
        const participantDocs = await listDocuments(['data_collection']);
        
        allSubmissionsData = {};
        uniqueChartIds = new Set();
        
        participantDocs.forEach(doc => {
            allSubmissionsData[doc.id] = doc.fields; // 참가자 코드(ID)로 데이터 저장
            
            if (doc.fields.questions) {
                // 이 참가자가 제출한 모든 차트 ID를 Set에 추가
                Object.keys(doc.fields.questions).forEach(chartId => {
                    uniqueChartIds.add(chartId);
                });
            }
        });
        
        // 해시(#)가 변경될 때마다 뷰를 다시 로드하도록 이벤트 리스너 설정
        window.addEventListener('hashchange', loadViewFromHash);
        
        // 현재 URL 해시를 기반으로 뷰를 로드
        loadViewFromHash();

    } catch (e) {
        console.error("Failed to initialize viewer:", e);
        chartListEl.innerHTML = `<p style="color: red;">Error: ${e.message}</p>`;
    }
}

// --- 8. 실행 ---
// DOM이 로드되면 뷰어 초기화
document.addEventListener('DOMContentLoaded', initializeViewer);