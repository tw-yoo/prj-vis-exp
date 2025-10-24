import {
    createNavButtons,
    createLikertQuestion,
    createOpenEndedInput, createChart
} from '../components.js';

// Sync browser back/forward buttons with SPA navigation
window.addEventListener('popstate', event => {
  const state = event.state;
  if (state && typeof state.pageIndex === 'number') {
    loadPage(state.pageIndex, false);
  }
});

let pageHistory = [];
function goBack() {
  if (pageHistory.length <= 1) return;
  pageHistory.pop();
  const prevIndex = pageHistory[pageHistory.length - 1];
  loadPage(prevIndex, false);
}

const responses = {};
const STORAGE_KEY = 'preRegResponses';
// Load saved responses from localStorage
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  Object.assign(responses, JSON.parse(saved));
}
const screeningAnswers = {
    pre_q1: "1",
    pre_q2: "1",
    pre_screen_q1: "1",
    pre_screen_q2: "1",
    pre_screen_q3: "1",
    pre_screen_q4: "1"
}

function screeningPassed(userResponses) {
    for (const [key, value] of Object.entries(userResponses)) {
        if (screeningAnswers[key] === undefined || screeningAnswers[key] !== value ) {
            return false;
        }
    }
    return true;
}

// Save responses to localStorage on change/input
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

function renderComponents() {

    document.querySelectorAll('[data-component="chart"]').forEach(async el  => {
        const { chart } = el.dataset;
        await createChart(chart);
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
    'pages/pre-registration.html',
    'pages/pre-registration-pass.html',
    'pages/pre-registration-fail.html',
    'pages/pre-registration-last.html'
  ];

// Prevent manual skipping: track highest unlocked page
let maxAllowedIndex = 0;

const params = new URLSearchParams(window.location.search);
let idx = parseInt(params.get('page'), 10);
if (isNaN(idx) || idx < 0 || idx >= pages.length || idx > maxAllowedIndex) {
  idx = 0;
}

const container = () => document.querySelector('.main-scroll');
const dynInsert = () => document.getElementById('dynamic-insert');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');

function updateButtons() {
    const prev = btnPrev();
    const next = btnNext();
    if (prev) prev.disabled = pageHistory.length <= 1;
    if (next) next.disabled = idx === pages.length - 1;
}

async function loadPage(i, pushHistory = true) {
  // Block manual jumps to locked pages
  if (!pushHistory && i > maxAllowedIndex) {
    alert('You cannot navigate to that page yet.');
    i = maxAllowedIndex;
  }
    if (i < 0 || i >= pages.length) return;
    if (pushHistory) {
        pageHistory.push(i);
    }
    idx = i;

  if (pushHistory) {
    maxAllowedIndex = Math.max(maxAllowedIndex, idx);
  }

    // Update browser history
    if (pushHistory) {
      history.pushState({ pageIndex: idx }, '', `?page=${idx}`);
    } else {
      history.replaceState({ pageIndex: idx }, '', `?page=${idx}`);
    }

    updateButtons();
    const scrollEl = container();
    if (!scrollEl) return;

    scrollEl.innerHTML = '<div id="dynamic-insert"></div>';
    try {
        const isLastPage = idx > 0;
        const isAvailable = idx === 0 ||  idx === 1;
        const res = await fetch(pages[idx], { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status);
        const frag = await res.text();
        const placeholder = scrollEl.querySelector('#dynamic-insert');
        if (placeholder) placeholder.insertAdjacentHTML('afterend', frag);

        renderComponents();
        restoreResponses();
        // Reload responses from localStorage to keep JS state in sync
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
          Object.assign(responses, JSON.parse(savedData));
        }

        const nav = createNavButtons({
            prevId: `prev_${idx}`,
            nextId: `next_${idx}`,
            onPrev: goBack,
            onNext: async () => {
                // 페이지 검증 추가
                if (!validatePage()) {
                    return;
                }
                
                if (isLastPage) {
                    const email = responses.email || '';
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                      alert('Please enter a valid email address.');
                      return;
                    }
                    try {
                        const payload = { email: responses.email, ...responses };
                        const res = await fetch('http://localhost:3000/pre-registration/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (!res.ok) throw new Error(res.statusText);
                        loadPage(3);
                    } catch (err) {
                        alert('Error: '+ err.message);
                    }
                    return;
                } else if (idx === 0) {
                    if (screeningPassed(responses)) {
                        loadPage(idx + 1);
                    } else {
                        loadPage(idx + 2);
                    }
                } else {
                    loadPage(idx + 1);
                }
            },
            isLastPage: isLastPage,
            isAvailable: isAvailable,
            totalPages: 2,
            currentPage: Math.min(idx+1, 2),
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

function restoreResponses() {
  Object.entries(responses).forEach(([name, value]) => {
    // Restore radio buttons
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (radio) radio.checked = true;
    // Restore text inputs and textareas
    const inputEl = document.querySelector(`#${name}`);
    if (inputEl && (inputEl.tagName === 'INPUT' || inputEl.tagName === 'TEXTAREA')) {
      inputEl.value = value;
    }
  });
}