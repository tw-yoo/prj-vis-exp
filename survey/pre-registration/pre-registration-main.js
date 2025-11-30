import {
  createNavButtons,
  createLikertQuestion,
  createOpenEndedInput,
  createChart
} from '../components.js';
import {recordPreRegistration} from '../firestore.js';

const STORAGE_KEY = 'preRegResponses';
const SCREENING_PREFIX = 'pre_screen_q';

const STATEMENTS = {
  s0: { statement: 'The value increased from 1940 to 1980.', isTrue: false },
  s1: { statement: 'The value reached its maximum in 1960.', isTrue: true },
  s2: { statement: 'The value in 1900 was 5.', isTrue: true },
  s3: { statement: 'The value in 2000 is smaller than the value in 1900', isTrue: true },
  s4: { statement: 'The value drop between 1960 and 1980 is smaller than the value drop between 1980 and 2000.', isTrue: false },
  s5: { statement: 'The highest value ever reached was 13.', isTrue: true },
  s6: { statement: 'The lowest value ever reached was 5.', isTrue: false },
  s7: { statement: 'The value started decreasing in 1940.', isTrue: false },
  s8: { statement: 'The steepest decrease was between 1960 and 1980.', isTrue: true },
  s9: { statement: 'The increment in value between 1940 and 1960 is 4.', isTrue: false },
  s10: { statement: 'The steepest increase was between 1920 and 1940', isTrue: true },
  s11: { statement: 'The value in 1980 was equal to the value in 1900.', isTrue: false },
  s12: { statement: 'The value reached its minimum in 2000.', isTrue: true },
  s13: { statement: 'The values shown in the chart are between 1 and 13.', isTrue: true },
  s14: { statement: 'The chart shows values observed between 1900 and 2000.', isTrue: true }
};

const responses = {
  pre_q1: '',
  pre_q2: ''
};

try {
  localStorage.removeItem('preRegStatementMap');
} catch (_) {
  // ignore legacy cleanup failure
}

const saved = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
})();
if (saved) Object.assign(responses, saved);

function persistResponses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
  } catch (_) {
    console.warn('Failed to persist pre-registration responses');
  }
}

document.addEventListener('change', event => {
  const target = event.target;
  if (!target || target.type !== 'radio') return;
  responses[target.name] = target.value;
  persistResponses();
});

document.addEventListener('input', event => {
  const target = event.target;
  if (!target) return;
  const name = target.name || target.id;
  if (!name) return;
  responses[name] = target.value;
  persistResponses();
});

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

let currentStatementMap = null;

function generateStatementMap() {
  const keys = shuffle(Object.keys(STATEMENTS).slice());
  const selected = keys.slice(0, 4);
  const map = {};
  selected.forEach((statementKey, index) => {
    const inputName = `${SCREENING_PREFIX}${index + 1}`;
    map[inputName] = statementKey;
    responses[inputName] = '';
  });
  currentStatementMap = map;
  Object.keys(responses)
    .filter(name => name.startsWith(SCREENING_PREFIX))
    .forEach(name => {
      if (!map[name]) {
        delete responses[name];
      }
    });
  persistResponses();
  return map;
}

function renderScreeningQuestions(root) {
  const container = root.querySelector('[data-role="screening-container"]');
  if (!container) return;
  container.innerHTML = '';
  const map = generateStatementMap();
  Object.entries(map).forEach(([inputName, statementKey], index) => {
    const statement = STATEMENTS[statementKey];
    if (!statement) return;
    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-component', 'likert');
    placeholder.dataset.name = inputName;
    placeholder.dataset.question = statement.statement;
    placeholder.dataset.labels = 'True|False';
    placeholder.dataset.baseid = `${inputName}_${index}`;
    container.appendChild(placeholder);
  });
}

function renderComponents(root) {
  const charts = root.querySelectorAll('[data-component="chart"]');
  charts.forEach(async el => {
    const { chart } = el.dataset;
    await createChart(chart, el);
  });

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

function restoreResponses(root) {
  Object.entries(responses).forEach(([name, value]) => {
    if (!value) return;
    const radios = root.querySelectorAll(`input[type="radio"][name="${name}"]`);
    if (radios.length) {
      radios.forEach(radio => {
        radio.checked = radio.value === value;
      });
      return;
    }
    const input = root.querySelector(`#${name}, input[name="${name}"], textarea[name="${name}"]`);
    if (input) input.value = value;
  });
}

function validatePage(root) {
  const likertGroups = root.querySelectorAll('.likert-group[data-required="true"]');
  for (const group of likertGroups) {
    const inputName = group.getAttribute('data-input-name');
    const checked = root.querySelector(`input[name="${inputName}"]:checked`);
    if (!checked) {
      alert('Please answer all of the questions');
      return false;
    }
  }

  const textWrappers = root.querySelectorAll('.text-input-wrapper[data-required="true"]');
  for (const wrapper of textWrappers) {
    const input = wrapper.querySelector('input, textarea');
    if (input && input.value.trim() === '') {
      alert('Please answer all of the questions');
      return false;
    }
  }

  return true;
}

function evaluateScreening() {
  if (!currentStatementMap) {
    currentStatementMap = generateStatementMap();
  }
  for (const [inputName, statementKey] of Object.entries(currentStatementMap)) {
    const answer = responses[inputName];
    if (!answer) {
      return false;
    }
    const spec = STATEMENTS[statementKey];
    if (!spec) {
      console.warn(`Unknown statement key: ${statementKey}`);
      return false;
    }
    const expectedValue = spec.isTrue ? '1' : '2';
    if (answer !== expectedValue) {
      return false;
    }
  }
  return true;
}

const pageDescriptors = [
  {
    id: 'pre_screen',
    path: 'pages/pre-registration.html',
    slug: 'pre_registration',
    showNav: true,
    hidePrev: true,
    progressIndex: 1,
    onLoad: renderScreeningQuestions
  },
  {
    id: 'pre_pass',
    path: 'pages/pre-registration-pass.html',
    slug: 'pre_registration_pass',
    showNav: true,
    hidePrev: true,
    isSubmitPage: true,
    progressIndex: 2
  },
  {
    id: 'pre_fail',
    path: 'pages/pre-registration-fail.html',
    slug: 'pre_registration_fail',
    showNav: false
  },
  {
    id: 'pre_complete',
    path: 'pages/pre-registration-last.html',
    slug: 'pre_registration_complete',
    showNav: false
  }
];

const PROGRESS_TOTAL = Math.max(
  ...pageDescriptors
    .map(descriptor => descriptor.progressIndex || 0)
);

const slugToIndex = new Map();
pageDescriptors.forEach((descriptor, index) => {
  slugToIndex.set(descriptor.slug, index);
});

const params = new URLSearchParams(window.location.search);
let idx = parseInt(params.get('page'), 10);
if (Number.isNaN(idx) || idx < 0 || idx >= pageDescriptors.length) {
  idx = 0;
}

const container = () => document.querySelector('.main-scroll');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');

function updateButtons() {
  const prev = btnPrev();
  const next = btnNext();
  if (prev) {
    prev.disabled = idx === 0;
  }
  if (next) {
    next.disabled = false;
  }
}

async function loadPage(targetIndex, pushHistory = true) {
  if (targetIndex < 0 || targetIndex >= pageDescriptors.length) return;
  idx = targetIndex;

  const descriptor = pageDescriptors[idx];
  if (!descriptor) return;

  if (pushHistory) {
    history.pushState({ pageIndex: idx }, '', `?page=${idx}`);
  } else {
    history.replaceState({ pageIndex: idx }, '', `?page=${idx}`);
  }

  const root = container();
  if (!root) return;

  root.innerHTML = '<div id="dynamic-insert"></div>';
  const placeholder = root.querySelector('#dynamic-insert');

  try {
    const res = await fetch(descriptor.path, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const html = await res.text();
    placeholder.insertAdjacentHTML('afterend', html);
    placeholder.remove();

    if (typeof descriptor.onLoad === 'function') {
      descriptor.onLoad(root);
    }

    renderComponents(root);
    restoreResponses(root);

    if (descriptor.showNav === false) {
      updateButtons();
      return;
    }

    const nav = createNavButtons({
      prevId: `prev_${idx}`,
      nextId: `next_${idx}`,
      onPrev: () => loadPage(Math.max(0, idx - 1)),
      onNext: () => handleNext(descriptor, root),
      isLastPage: descriptor.isSubmitPage === true,
      isAvailable: descriptor.showNav !== false,
      hidePrev: descriptor.hidePrev === true,
      totalPages: PROGRESS_TOTAL,
      currentPage: descriptor.progressIndex || PROGRESS_TOTAL,
      align: 'center'
    });
    root.appendChild(nav);
  } catch (err) {
    root.innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }

  updateButtons();
}

async function handleNext(descriptor, root) {
  if (!validatePage(root)) return;

  if (descriptor.id === 'pre_screen') {
    if (evaluateScreening()) {
      await loadPage(slugToIndex.get('pre_registration_pass'));
    } else {
      await loadPage(slugToIndex.get('pre_registration_fail'));
    }
    return;
  }

  if (descriptor.id === 'pre_pass') {
    const email = (responses.email || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }
    try {
      await recordPreRegistration({
        email,
        ...responses,
        submittedAt: new Date().toISOString()
      });
      await loadPage(slugToIndex.get('pre_registration_complete'));
    } catch (err) {
      alert(`Failed to submit pre-registration: ${err.message}`);
    }
    return;
  }

  await loadPage(Math.min(pageDescriptors.length - 1, idx + 1));
}

window.addEventListener('popstate', event => {
  const state = event.state;
  if (state && typeof state.pageIndex === 'number') {
    loadPage(state.pageIndex, false);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  history.replaceState({ pageIndex: idx }, '', `?page=${idx}`);
  loadPage(idx, false);
});
