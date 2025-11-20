// 1. 필요한 함수 임포트
import { listDocuments } from '../../firestore.js';
import { renderPlainVegaLiteChart } from '../../../util/util.js';

// 2. DOM 요소 캐시
const chartListEl = document.getElementById('chart-list-links');
const chartViewEl = document.getElementById('chart-view');
const submissionListEl = document.getElementById('submission-list');

let allSubmissionsData = {};
let uniqueChartIds = new Set();
let currentChartId = null;

// 🔥 차트 ID에서 경로 추출 함수
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
function getChartSpecPath(chartId) {
    const parsed = parseChartId(chartId);
    
    if (!parsed) {
        console.error('Could not parse chart ID:', chartId);
        return null;
    }
    
    // ../../../ = survey/data_collection/result/ -> root/
    // ChartQA/data/vlSpec/...
    return `../../../ChartQA/data/vlSpec/${parsed.type}/${parsed.subtype}/${parsed.filename}.json`;
}

// 3. 차트 렌더링
async function renderChart(chartId, elementId) {
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
            if (dataUrl.startsWith('http') || dataUrl.startsWith('../../../')) {
                // 그대로 유지
            }
            // ChartQA로 시작하는 경우 (이미 ChartQA 포함)
            else if (dataUrl.startsWith('ChartQA/')) {
                spec.data.url = `../../../${dataUrl}`;
            }
            // data로 시작하는 경우 (ChartQA 없음)
            else if (dataUrl.startsWith('data/')) {
                spec.data.url = `../../../ChartQA/${dataUrl}`;
            }
            // 기타 경우
            else {
                spec.data.url = `../../../ChartQA/${dataUrl}`;
            }
        }
        
        await renderPlainVegaLiteChart(elementId, spec);
        
    } catch (e) {
        console.error(`Failed to render chart ${chartId} from ${specPath}`, e);
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = `<p style="color: red;">Error loading chart: ${e.message}<br>Path: ${specPath}</p>`;
    }
}

// 4. 왼쪽 차트 목록 렌더링
function renderChartList() {
    if (uniqueChartIds.size === 0) {
        chartListEl.innerHTML = '<p>No submissions found yet.</p>';
        return;
    }
    
    chartListEl.innerHTML = '';
    
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
    
    submissionListEl.innerHTML = '';
    let foundSubmissions = false;

    for (const [participantCode, data] of Object.entries(allSubmissionsData)) {
        const submission = data.questions ? data.questions[chartId] : null;
        
        if (submission && (submission.question || submission.answer || submission.explanation)) {
            foundSubmissions = true;
            
            const div = document.createElement('div');
            div.className = 'submission';
            
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
    
    renderChartList();
    
    if (currentChartId) {
        chartViewEl.innerHTML = '<p>Loading chart...</p>';
        await renderChart(currentChartId, 'chart-view');
        renderSubmissionsForChart(currentChartId);
    } else {
        chartViewEl.innerHTML = '<p style="padding: 10px;">Select a chart from the list on the left.</p>';
        submissionListEl.innerHTML = '';
    }
}

// 7. 초기 데이터 로드 (최초 1회)
async function initializeViewer() {
    try {
        const participantDocs = await listDocuments(['data_collection']);
        
        allSubmissionsData = {};
        uniqueChartIds = new Set();
        
        participantDocs.forEach(doc => {
            allSubmissionsData[doc.id] = doc.fields;
            
            if (doc.fields.questions) {
                Object.keys(doc.fields.questions).forEach(chartId => {
                    uniqueChartIds.add(chartId);
                });
            }
        });
        
        window.addEventListener('hashchange', loadViewFromHash);
        loadViewFromHash();

    } catch (e) {
        console.error("Failed to initialize viewer:", e);
        chartListEl.innerHTML = `<p style="color: red;">Error: ${e.message}</p>`;
    }
}

// --- 8. 실행 ---
document.addEventListener('DOMContentLoaded', initializeViewer);