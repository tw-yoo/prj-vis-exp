// main.js
import {
  createNavButtons,
  createLikertQuestion,
  createOpenEndedInput, createChart
} from './components.js';

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
}

const pages = [
  'pages/main.html',
  'pages/tutorial/tutorial_intro.html',
  'pages/tutorial/tutorial_question1.html',
  'pages/temp2.html',
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

async function loadPage(i) {
  if (i < 0 || i >= pages.length) return;
  idx = i;
  // Reflect current page in the URL without reloading
  history.replaceState(null, '', `?page=${idx}`);
  updateButtons();
  const scrollEl = container();
  if (!scrollEl) return;
  // Reset content placeholder
  scrollEl.innerHTML = '<div id="dynamic-insert"></div>';
  try {
    const isLastPage = pages[pages.length - 1] === idx;
    const res = await fetch(pages[idx], { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const frag = await res.text();
    const placeholder = scrollEl.querySelector('#dynamic-insert');
    if (placeholder) placeholder.insertAdjacentHTML('afterend', frag);
    // Instantiate components declared in fragment
    renderComponents();
    // Navigation buttons appended after content
    const nav = createNavButtons({
      prevId: `prev_${idx}`,
      nextId: `next_${idx}`,
      onPrev: () => loadPage(idx - 1),
      onNext: () => loadPage(idx + 1),
      isLastPage
    });
    scrollEl.appendChild(nav);
  } catch (e) {
    scrollEl.innerHTML = `<div class="error">Error: ${e.message}</div>`;
  }
  updateButtons();
}

document.addEventListener('DOMContentLoaded', () => {
  loadPage(idx);
});