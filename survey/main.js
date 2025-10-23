// main.js
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
// Load any saved responses on initial load
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  Object.assign(responses, JSON.parse(saved));
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
      onSubmit: () => {
        if (!validatePage()) {
          return;
        }
        console.log("submit");
      },
      submitFormId: "survey-form"
    });
    scrollEl.appendChild(nav);
  } catch (e) {
    scrollEl.innerHTML = `<div class="error">Error: ${e.message}</div>`;
  }
  updateButtons();
}

document.addEventListener('DOMContentLoaded', () => {
  history.replaceState({ pageIndex: idx }, '', `?page=${idx}`);
  loadPage(idx, false);
});