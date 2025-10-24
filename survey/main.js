// main.js
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('reset') === 'true') {
    localStorage.clear();
    window.history.replaceState({}, document.title, window.location.pathname);
}

import {getRandomCompletionCode} from "./util.js";
import {
  createNavButtons,
  createLikertQuestion,
  createOpenEndedInput, createChart, createCompletionCode
} from './components.js';

const completionCode = getRandomCompletionCode();
// State for form responses
const responses = {
  "completion-code": completionCode,
};

const STORAGE_KEY = 'formResponses';
const TIMING_KEY = 'pageTiming';

// Load any saved responses on initial load
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  Object.assign(responses, JSON.parse(saved));
}

// 페이지 타이밍 관리
let pageStartTime = null;
let timerInterval = null;
let timerElement = null;
let accumulatedTime = 0; // 누적 시간

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function createTimer() {
  const timer = document.createElement('div');
  timer.className = 'page-timer';
  timer.innerHTML = `
    <div class="timer-label">Time on page</div>
    <div class="timer-display">0:00</div>
  `;
  document.body.appendChild(timer);
  return timer.querySelector('.timer-display');
}

function startTimer(pageIndex) {
  pageStartTime = Date.now();
  
  // 이전에 저장된 시간 불러오기
  const timingData = JSON.parse(localStorage.getItem(TIMING_KEY) || '{}');
  accumulatedTime = timingData[`page_${pageIndex}`] || 0;
  
  if (!timerElement) {
    timerElement = createTimer();
  }
  
  // Clear any existing interval
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  // Update timer every second
  timerInterval = setInterval(() => {
    const currentSession = Math.floor((Date.now() - pageStartTime) / 1000);
    const totalTime = accumulatedTime + currentSession;
    if (timerElement) {
      timerElement.textContent = formatTime(totalTime);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  if (pageStartTime) {
    const currentSession = Math.floor((Date.now() - pageStartTime) / 1000);
    const totalTime = accumulatedTime + currentSession;
    return totalTime;
  }
  return accumulatedTime;
}

function savePageTiming(pageIndex, timeSpent) {
  const timingData = JSON.parse(localStorage.getItem(TIMING_KEY) || '{}');
  timingData[`page_${pageIndex}`] = timeSpent;
  localStorage.setItem(TIMING_KEY, JSON.stringify(timingData));
  
  // Also add to responses
  responses[`page_${pageIndex}_time`] = timeSpent;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
}

// Persist responses on input change
document.addEventListener('change', e => {
  if (e.target.matches('input[type="radio"]')) {
    responses[e.target.name] = e.target.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
  }
});
document.addEventListener('input', e => {
  if (e.target.matches('input[type="text"], textarea')) {
    responses[e.target.name] = e.target.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
  }
});

// Handle browser back/forward navigation
window.addEventListener('popstate', event => {
  const state = event.state;
  if (state && typeof state.pageIndex === 'number') {
    loadPage(state.pageIndex, false);
  }
});

// Save timing when leaving page
window.addEventListener('beforeunload', () => {
  if (pageStartTime) {
    const timeSpent = stopTimer();
    savePageTiming(idx, timeSpent);
  }
});

function renderComponents() {

  document.querySelectorAll('[data-component="chart"]').forEach(async el  => {
    const { chart } = el.dataset;
    await createChart(chart, el);
  });

  document.querySelectorAll('[data-component="likert"]').forEach(el => {
    const { name, question, labels, baseid } = el.dataset;
    const comp = createLikertQuestion({
      name,
      questionText: question,
      labels: labels.split('|'),
      baseId: baseid
    });
    el.replaceWith(comp);
  });

  // Open-ended inputs
  document.querySelectorAll('[data-component="open-ended"]').forEach(el => {
    const { id, labeltext, placeholder, multiline } = el.dataset;
    const comp = createOpenEndedInput({
      id,
      labelText: labeltext,
      placeholder,
      multiline: multiline === 'true'
    });
    el.replaceWith(comp);
  });

  document.querySelectorAll('[data-component="completion-code"]').forEach(el => {
    const comp = createCompletionCode(completionCode);
    el.replaceWith(comp);
  });
}

function restoreResponses() {
  for (const [name, value] of Object.entries(responses)) {
    const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    if (radios.length) {
      radios.forEach(radio => radio.checked = radio.value === value);
    } else {
      const input = document.querySelector(`input[type="text"][name="${name}"], textarea[name="${name}"]`);
      if (input) input.value = value;
    }
  }
}

// 페이지 검증 함수
function validatePage() {
  // completion 페이지는 검증 스킵
  if (idx === pages.length - 1) {
    return true;
  }
  
  // 1. Likert 질문 검증
  const likertGroups = document.querySelectorAll('.likert-group[data-required="true"]');
  for (const group of likertGroups) {
    const inputName = group.getAttribute('data-input-name');
    const checked = document.querySelector(`input[name="${inputName}"]:checked`);
    if (!checked) {
      alert('모든 필수 질문에 답해주세요.');
      return false;
    }
  }
  
  // 2. 텍스트 입력 검증
  const textWrappers = document.querySelectorAll('.text-input-wrapper[data-required="true"]');
  for (const wrapper of textWrappers) {
    const input = wrapper.querySelector('input, textarea');
    if (input && input.value.trim() === '') {
      alert('모든 필수 질문에 답해주세요.');
      return false;
    }
  }
  
  // 3. Ranking 질문 검증
  const rankingGroups = document.querySelectorAll('.ranking-group[data-required="true"]');
  for (const group of rankingGroups) {
    const inputName = group.getAttribute('data-input-name');
    const hiddenInput = document.querySelector(`input[type="hidden"][name="${inputName}"]`);
    if (hiddenInput) {
      const values = hiddenInput.value.split(',').filter(v => v.trim() !== '');
      const expectedLength = group.querySelectorAll('.rank-slot').length;
      if (values.length !== expectedLength) {
        alert('모든 필수 질문에 답해주세요.');
        return false;
      }
    }
  }
  
  return true;
}

const pages = [
    // 'pages/main.html',
    // 'pages/tutorial/tutorial_intro.html',
    // 'pages/tutorial/tutorial_overview.html',
    // 'pages/tutorial/tutorial_question.html',
    // 'pages/main_survey/main_intro.html',
    // 'pages/main_survey/exp1/exp1_round1.html',
    'pages/main_survey/exp1/exp1_round2.html',
    'pages/main_survey/exp1/exp1_block.html',
    'pages/main_survey/main_last.html',
    'pages/completion.html'
];
// Initialize page index from URL, defaulting to 0
const params = new URLSearchParams(window.location.search);
let idx = parseInt(params.get('page'), 10);
if (isNaN(idx) || idx < 0 || idx >= pages.length) {
  idx = 0;
}

const container = () => document.querySelector('.main-scroll');
const dynInsert = () => document.getElementById('dynamic-insert');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');

function updateButtons() {
    const prev = btnPrev();
    const next = btnNext();
    if (prev) prev.disabled = idx === 0;
    if (next) next.disabled = idx === pages.length - 1;
}

async function loadPage(i, pushHistory = true) {
  if (i < 0 || i >= pages.length) return;
  
  // Stop timer for current page and save timing
  if (pageStartTime) {
    const timeSpent = stopTimer();
    savePageTiming(idx, timeSpent);
  }
  
  idx = i;
  
  // Reflect current page in the URL without reloading
  if (pushHistory) {
    history.pushState({ pageIndex: i }, '', `?page=${i}`);
  } else {
    history.replaceState({ pageIndex: i }, '', `?page=${i}`);
  }
  updateButtons();
  const scrollEl = container();
  if (!scrollEl) return;
  // Reset content placeholder
  scrollEl.innerHTML = '<div id="dynamic-insert"></div>';
  try {
    const isLastPage = idx === pages.length - 1;
    const res = await fetch(pages[idx], { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const frag = await res.text();
    const placeholder = scrollEl.querySelector('#dynamic-insert');
    if (placeholder) placeholder.insertAdjacentHTML('afterend', frag);
    // Instantiate components declared in fragment
    renderComponents();
    // Restore form inputs from saved responses
    restoreResponses();
    // Reload in-memory responses in case of full reload
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      Object.assign(responses, JSON.parse(savedData));
    }
    // Navigation buttons appended after content
    const nav = createNavButtons({
      prevId: `prev_${idx}`,
      nextId: `next_${idx}`,
      onPrev: () => loadPage(idx - 1),
      onNext: () => {
        // 페이지 검증 추가
        if (!validatePage()) {
          return; // 검증 실패 시 페이지 이동 중단
        }
        loadPage(idx + 1);
      },
      isLastPage,
      isAvailable: true,
      totalPages: pages.length,
      currentPage: idx + 1,
      onSubmit: async () => {
        if (!validatePage()) {
          return;
        }
        
        // 마지막 타이밍 저장
        if (pageStartTime) {
          const timeSpent = stopTimer();
          savePageTiming(idx, timeSpent);
        }
        
        // 모든 데이터 출력
        console.log("=== Survey Completed ===");
        console.log("Responses:", responses);
        console.log("Timing Data:", JSON.parse(localStorage.getItem(TIMING_KEY) || '{}'));
        
        alert('설문이 제출되었습니다!');
      },
      submitFormId: "survey-form"
    });
    scrollEl.appendChild(nav);
  } catch (e) {
    scrollEl.innerHTML = `<div class="error">Error: ${e.message}</div>`;
  }
  updateButtons();
  
  // Start timer for new page (이전 시간부터 이어서)
  startTimer(idx);
}

document.addEventListener('DOMContentLoaded', () => {
  history.replaceState({ pageIndex: idx }, '', `?page=${idx}`);
  loadPage(idx, false);
});