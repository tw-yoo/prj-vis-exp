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
import {
  validateSurveyCode,
  ensureSurveyDocument,
  saveSurveyResponse,
  saveSurveyTiming,
  fetchSurveyState
} from './firestore.js';
import {MAIN_SURVEY_QUESTIONS} from "./pages/main_survey/main_questions/index.js";
import {TUTORIAL_QUESTIONS} from "./pages/tutorial/tutorial_questions.js";

const TEST_MODE = (() => {
  const flag = urlParams.get('test');
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return false;
})();

const FIRESTORE_DISABLED = (() => {
  const flag = urlParams.get('offline');
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return false;
})();

let completionCode = getRandomCompletionCode();
// State for form responses
const responses = {
  "completion-code": completionCode,
  "participant-code": ""
};

let participantCode = null;
let codeValidated = false;
let navigationInProgress = false;
let activePageQuestionKeys = [];
let submissionLocked = false;
let submissionLockMap = {};
const SUBMISSION_LOCK_KEY = 'survey_submission_locked';

const storedParticipantCode = (() => {
  try {
    return localStorage.getItem('participant_code') || '';
  } catch (_) {
    return '';
  }
})();

function readSubmissionLockMap() {
  try {
    const raw = localStorage.getItem(SUBMISSION_LOCK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (_) {
    console.warn('Unable to read submission lock state');
  }
  return {};
}

function writeSubmissionLockMap(map) {
  try {
    localStorage.setItem(SUBMISSION_LOCK_KEY, JSON.stringify(map));
  } catch (_) {
    console.warn('Unable to persist submission lock state');
  }
}

function getCurrentParticipantCode() {
  if (participantCode) return participantCode.toUpperCase();
  try {
    const cached = localStorage.getItem('participant_code');
    if (cached) return cached.toUpperCase();
  } catch (_) {
    // ignore
  }
  return '';
}

function shouldBypassSubmissionLock() {
  const code = getCurrentParticipantCode();
  return TEST_MODE && code === 'AAAAAA';
}

function refreshSubmissionLockState() {
  submissionLockMap = readSubmissionLockMap();
  const code = getCurrentParticipantCode();
  if (!code) {
    submissionLocked = false;
    updateButtons();
    return;
  }
  submissionLocked = Boolean(submissionLockMap[code]);
  if (shouldBypassSubmissionLock()) {
    submissionLocked = false;
  }
  updateButtons();
}

function setSubmissionLock() {
  if (shouldBypassSubmissionLock()) {
    const code = getCurrentParticipantCode();
    if (code) {
      delete submissionLockMap[code];
      writeSubmissionLockMap(submissionLockMap);
    }
    submissionLocked = false;
    return;
  }
  const code = getCurrentParticipantCode();
  if (!code) {
    submissionLocked = true;
    return;
  }
  submissionLockMap[code] = true;
  writeSubmissionLockMap(submissionLockMap);
  submissionLocked = true;
  updateButtons();
}

function isSubmissionLocked() {
  return submissionLocked && !shouldBypassSubmissionLock();
}

function escapeSelector(value) {
  if (typeof value !== 'string') return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function getPageSlug(path) {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function readJSONFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function writeJSONToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    console.warn(`Failed to persist ${key} to storage`);
  }
}

function readPageResponses() {
  return readJSONFromStorage(PAGE_RESPONSES_KEY);
}

function writePageResponses(value) {
  writeJSONToStorage(PAGE_RESPONSES_KEY, value);
}

async function guardedNavigate(task) {
  if (navigationInProgress) return;
  navigationInProgress = true;
  try {
    await task();
  } finally {
    navigationInProgress = false;
    updateButtons();
  }
}

const STORAGE_KEY = 'formResponses';
const TIMING_KEY = 'pageTiming';
const PAGE_RESPONSES_KEY = 'pageResponses';

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
    pageStartTime = null;
    accumulatedTime = totalTime;
    return totalTime;
  }
  pageStartTime = null;
  return accumulatedTime;
}

async function savePageTiming(pageIndex, timeSpent, snapshot = null) {
  const timingData = readJSONFromStorage(TIMING_KEY);
  timingData[`page_${pageIndex}`] = timeSpent;
  writeJSONToStorage(TIMING_KEY, timingData);
  responses[`page_${pageIndex}_time`] = timeSpent;
  writeJSONToStorage(STORAGE_KEY, responses);
  const pageDocId = getPageDocId(pageIndex);
  let answers = snapshot?.answers;
  if (!answers || !Object.keys(answers).length) {
    const stored = readPageResponses();
    answers = stored[pageDocId] || {};
  }
  if (FIRESTORE_DISABLED) return;
  if (!participantCode || !codeValidated) return;
  try {
    const descriptor = pageDescriptors[pageIndex];
    const extra = {
      pageIndex,
      pageId: descriptor?.id || '',
      pageSlug: descriptor?.slug || ''
    };
    if (answers && Object.keys(answers).length) {
      extra.answers = answers;
    }
    await saveSurveyTiming(participantCode, pageDocId, timeSpent, extra);
  } catch (err) {
    console.warn('Failed to save page timing to Firestore', err);
  }
}

function clearResponsesCache() {
  Object.keys(responses).forEach(key => delete responses[key]);
  responses['completion-code'] = completionCode;
  responses['participant-code'] = participantCode || '';
  writePageResponses({});
}

function resetSurveyState() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  pageStartTime = null;
  accumulatedTime = 0;
  if (timerElement) {
    timerElement.textContent = formatTime(0);
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TIMING_KEY);
    localStorage.removeItem('participant_code');
    localStorage.removeItem(PAGE_RESPONSES_KEY);
  } catch (_) {
    console.warn('Failed to clear survey storage');
  }
  participantCode = null;
  codeValidated = false;
  activePageQuestionKeys = [];
  completionCode = getRandomCompletionCode();
  clearResponsesCache();
  writePageResponses({});
  try {
    localStorage.setItem('completion_code', completionCode);
  } catch (_) {
    console.warn('Failed to update completion code cache');
  }
  refreshSubmissionLockState();
  updateButtons();
}

// Persist responses on input change
document.addEventListener('change', e => {
  if (e.target.matches('input[type="radio"]')) {
    responses[e.target.name] = e.target.value;
    writeJSONToStorage(STORAGE_KEY, responses);
  }
});
document.addEventListener('input', e => {
  if (e.target.matches('input[type="text"], textarea')) {
    responses[e.target.name] = e.target.value;
    writeJSONToStorage(STORAGE_KEY, responses);
  }
});

// Handle browser back/forward navigation
window.addEventListener('popstate', event => {
  const state = event.state;
  if (state && typeof state.pageIndex === 'number') {
    guardedNavigate(async () => {
      const snapshot = await persistCurrentPageResponses();
      await loadPage(state.pageIndex, false, snapshot);
    });
  }
});

// Save timing when leaving page
window.addEventListener('beforeunload', () => {
  const snapshot = snapshotActivePageState();
  persistCurrentPageResponses(snapshot).catch(err => {
    console.warn('Failed to persist responses before unload', err);
  });
  if (pageStartTime) {
    const timeSpent = stopTimer();
    savePageTiming(idx, timeSpent, snapshot).catch(err => {
      console.warn('Failed to flush timing before unload', err);
    });
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

  const codeInput = document.querySelector('[data-role="participant-code"]');
  if (codeInput) {
    if (!codeInput.dataset.normalizerAttached) {
      codeInput.addEventListener('input', () => {
        const sanitized = codeInput.value.replace(/[^0-9a-z]/gi, '').toUpperCase();
        if (codeInput.value !== sanitized) {
          codeInput.value = sanitized;
        }
      });
      codeInput.dataset.normalizerAttached = 'true';
    }
    if (storedParticipantCode && !codeValidated && !codeInput.value) {
      codeInput.value = storedParticipantCode;
    }
  }
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
  if (requiresAccessCode && idx === codePageIndex) {
    return true;
  }
  // completion 페이지는 검증 스킵
  if (idx === pageDescriptors.length - 1) {
    return true;
  }
  
  // 1. Likert 질문 검증
  const likertGroups = document.querySelectorAll('.likert-group[data-required="true"]');
  for (const group of likertGroups) {
    const inputName = group.getAttribute('data-input-name');
    const checked = document.querySelector(`input[name="${inputName}"]:checked`);
    if (!checked) {
      alert('Please answer all of the questions');
      return false;
    }
  }
  
  // 2. 텍스트 입력 검증
  const textWrappers = document.querySelectorAll('.text-input-wrapper[data-required="true"]');
  for (const wrapper of textWrappers) {
    const input = wrapper.querySelector('input, textarea');
    if (input && input.value.trim() === '') {
      alert('Please answer all of the questions');
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
        alert('Please answer all of the questions');
        return false;
      }
    }
  }
  
  return true;
}

function normalizePagePath(path) {
  if (typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('pages/') ? trimmed : `pages/${trimmed}`;
}

function createStaticPageDescriptor(path, options = {}) {
  const { trackTime = true, slug: explicitSlug } = options;
  const normalized = normalizePagePath(path);
  if (!normalized) {
    throw new Error(`Invalid page path: ${path}`);
  }
  return {
    id: normalized,
    slug: explicitSlug || getPageSlug(normalized),
    kind: 'static',
    trackTime,
    async load() {
      const res = await fetch(normalized, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      return res.text();
    }
  };
}

function createTemplatePageDescriptor(id, loader, { slug, trackTime = true } = {}) {
  const effectiveId = isNaN(id) ? String(id) : `page_${id}`;
  const descriptorSlug = slug || effectiveId;
  return {
    id: effectiveId,
    slug: descriptorSlug,
    kind: 'dynamic',
    trackTime,
    async load() {
      const result = await loader();
      if (typeof result === 'string') {
        return result;
      }
      if (typeof Node !== 'undefined' && result instanceof Node) {
        const wrapper = document.createElement('div');
        wrapper.appendChild(result.cloneNode(true));
        return wrapper.innerHTML;
      }
      if (typeof DocumentFragment !== 'undefined' && result instanceof DocumentFragment) {
        const wrapper = document.createElement('div');
        wrapper.appendChild(result.cloneNode(true));
        return wrapper.innerHTML;
      }
      return result == null ? '' : String(result);
    }
  };
}

function loadMainPages() {
  return [
    createStaticPageDescriptor('main.html')
  ];
}

function loadTutorialPages() {
  const introPages = [
    createStaticPageDescriptor('tutorial/tutorial_intro.html', { trackTime: false }),
    createStaticPageDescriptor('tutorial/tutorial_overview.html', { trackTime: false })
  ];
  const questionPages = TUTORIAL_QUESTIONS.map(question => createTemplatePageDescriptor(
    question.pageId,
    () => question.render(),
    { slug: question.slug, trackTime: false }
  ));
  return [
    ...introPages,
    ...questionPages
  ];
}

function loadMainSurveyPages() {
  const introPages = [
    createStaticPageDescriptor('main_survey/main_intro.html')
  ];
  const questionPages = MAIN_SURVEY_QUESTIONS.map(question => createTemplatePageDescriptor(
    question.pageId,
    () => question.render(),
    { slug: question.slug }
  ));
  const closingPages = [
    createStaticPageDescriptor('main_survey/main_last.html')
  ];
  return [
    ...introPages,
    ...questionPages,
    ...closingPages
  ];
}

function loadFinalQuestionPages() {
  return [
    createStaticPageDescriptor('completion.html')
  ];
}

function buildPageDescriptors() {
  return [
    ...loadMainPages(),
    ...loadTutorialPages(),
    ...loadMainSurveyPages(),
    ...loadFinalQuestionPages()
  ];
}

const pageDescriptors = buildPageDescriptors();

const CODE_PAGE_PATH = 'pages/main.html';
const requiresAccessCode = pageDescriptors.some(desc => desc.id === CODE_PAGE_PATH);
const codePageIndex = requiresAccessCode ? pageDescriptors.findIndex(desc => desc.id === CODE_PAGE_PATH) : -1;
const pageSlugByIndex = pageDescriptors.map(desc => desc.slug);
const slugToPageIndex = new Map();
pageSlugByIndex.forEach((slug, index) => {
  if (!slugToPageIndex.has(slug)) {
    slugToPageIndex.set(slug, index);
  }
});

function collectQuestionKeys(root) {
  if (!root) return [];
  const keys = new Set();
  const nodes = root.querySelectorAll('[data-name]');
  nodes.forEach(node => {
    const key = node.getAttribute('data-name') || (node.dataset ? node.dataset.name : '');
    if (key) keys.add(key);
  });
  return Array.from(keys);
}

function shallowEqual(a = {}, b = {}) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function snapshotActivePageState(keys = activePageQuestionKeys) {
  const answers = {};
  if (!Array.isArray(keys) || !keys.length) {
    return { answers, changed: false };
  }
  let changed = false;
  for (const key of keys) {
    if (!key) continue;
    const value = getResponseValueForKey(key);
    answers[key] = value;
    if (responses[key] !== value) {
      responses[key] = value;
      changed = true;
    }
  }
  if (changed) {
    writeJSONToStorage(STORAGE_KEY, responses);
  }
  return { answers, changed };
}

function getResponseValueForKey(key) {
  const escaped = escapeSelector(key);
  if (!escaped) return '';
  const radio = document.querySelector(`input[type="radio"][name="${escaped}"]:checked`);
  if (radio) return radio.value;
  const textarea = document.querySelector(`textarea[name="${escaped}"]`);
  if (textarea) return textarea.value;
  const select = document.querySelector(`select[name="${escaped}"]`);
  if (select) return select.value;
  const inputs = document.querySelectorAll(`input[name="${escaped}"]`);
  for (const input of inputs) {
    if (input.type === 'radio') continue;
    return input.value;
  }
  return '';
}

function getPageDocId(index) {
  return pageSlugByIndex[index] || `page_${index}`;
}

async function persistCurrentPageResponses(snapshot = null) {
  const activeKeys = Array.isArray(activePageQuestionKeys)
    ? activePageQuestionKeys.slice()
    : [];
  const effectiveSnapshot = snapshot ?? snapshotActivePageState(activeKeys);
  const { answers } = effectiveSnapshot;
  const answerKeys = Object.keys(answers || {});
  if (!answerKeys.length) {
    effectiveSnapshot.pageDocId = getPageDocId(idx);
    effectiveSnapshot.pageIndex = idx;
    return effectiveSnapshot;
  }

  const pageDocId = getPageDocId(idx);
  effectiveSnapshot.pageDocId = pageDocId;
  effectiveSnapshot.pageIndex = idx;
  const storedPageResponses = readPageResponses();
  const previousAnswers = storedPageResponses[pageDocId] || {};
  if (!shallowEqual(previousAnswers, answers)) {
    storedPageResponses[pageDocId] = answers;
    writePageResponses(storedPageResponses);
  }

  if (FIRESTORE_DISABLED || !participantCode || !codeValidated) {
    return effectiveSnapshot;
  }

  const updates = [];
  for (const [key, value] of Object.entries(answers)) {
    updates.push(saveSurveyResponse(participantCode, key, value));
  }
  if (updates.length) {
    try {
      await Promise.all(updates);
    } catch (err) {
      console.warn('Failed to save responses to Firestore', err);
    }
  }

  return effectiveSnapshot;
}

async function hydrateFromFirestore(code) {
  if (FIRESTORE_DISABLED) return;
  try {
    const state = await fetchSurveyState(code);
    const remoteResponses = state.responses || {};
    const remoteTimings = state.timings || {};
    const remotePageAnswers = state.pageAnswers || {};

    let responsesDirty = false;
    for (const [key, value] of Object.entries(remoteResponses)) {
      if (typeof value === 'undefined') continue;
      if (responses[key] === value) continue;
      responses[key] = value;
      responsesDirty = true;
    }

    const timingData = readJSONFromStorage(TIMING_KEY);
    let timingsDirty = false;
    let pageResponsesDirty = false;
    const pageResponsesStore = readPageResponses();

    for (const [slug, seconds] of Object.entries(remoteTimings)) {
      const index = slugToPageIndex.get(slug);
      if (typeof index !== 'number') continue;
      if (timingData[`page_${index}`] === seconds) continue;
      timingData[`page_${index}`] = seconds;
      responses[`page_${index}_time`] = seconds;
      timingsDirty = true;
    }

    for (const [slug, answers] of Object.entries(remotePageAnswers)) {
      if (!answers || typeof answers !== 'object') continue;
      if (!shallowEqual(pageResponsesStore[slug] || {}, answers)) {
        pageResponsesStore[slug] = answers;
        pageResponsesDirty = true;
      }
      for (const [key, value] of Object.entries(answers)) {
        if (responses[key] === value) continue;
        responses[key] = value;
        responsesDirty = true;
      }
    }

    if (timingsDirty) {
      writeJSONToStorage(TIMING_KEY, timingData);
    }
    if (responsesDirty) {
      writeJSONToStorage(STORAGE_KEY, responses);
    }
    if (pageResponsesDirty) {
      writePageResponses(pageResponsesStore);
    }
  } catch (err) {
    console.warn('Failed to hydrate survey state', err);
  }
}

async function initializeParticipantSession(code, { ensureDoc = true } = {}) {
  if (!code) return false;
  const normalizedCode = typeof code === 'string' ? code.toUpperCase() : code;
  if (participantCode === normalizedCode && codeValidated) return true;
  const previousCode = participantCode;
  participantCode = normalizedCode;
  refreshSubmissionLockState();
  if (previousCode && previousCode !== normalizedCode) {
    clearResponsesCache();
  }
  codeValidated = true;
  responses['participant-code'] = normalizedCode;
  writeJSONToStorage(STORAGE_KEY, responses);
  try {
    localStorage.setItem('participant_code', code);
  } catch (_) {
    console.warn('Unable to cache participant code locally');
  }
  if (!FIRESTORE_DISABLED && ensureDoc) {
    try {
      await ensureSurveyDocument(normalizedCode);
    } catch (err) {
      console.warn('Failed to ensure survey document', err);
    }
  }
  await hydrateFromFirestore(normalizedCode);
  updateButtons();
  return true;
}

async function resolveSurveyCode(rawCode, { requireValidation = true } = {}) {
  const trimmed = (rawCode || '').trim();
  if (!trimmed) return null;
  if (TEST_MODE) return trimmed.toUpperCase();
  if (!requireValidation) return trimmed;
  const normalized = trimmed.toUpperCase();
  try {
    if (await validateSurveyCode(normalized)) {
      return normalized;
    }
    if (normalized !== trimmed && await validateSurveyCode(trimmed)) {
      return trimmed;
    }
  } catch (err) {
    console.warn('Code validation failed', err);
    throw err;
  }
  return null;
}

async function handleCodePageNext() {
  const input = document.querySelector('[data-role="participant-code"]');
  if (!input) return false;
  const rawCode = input.value.trim();
  if (rawCode.length !== 6) {
      alert('Please enter the six-character access code.');
    input.focus();
    return false;
  }
  try {
    const resolved = await resolveSurveyCode(rawCode, { requireValidation: !TEST_MODE });
    if (!resolved) {
      alert('We could not find that access code. Please double-check it.');
      return false;
    }
    input.value = resolved;
    await initializeParticipantSession(resolved, { ensureDoc: !FIRESTORE_DISABLED });
    return true;
  } catch (err) {
    alert('We ran into an issue verifying the code. Please try again in a moment.');
    return false;
  }
}
// Initialize page index from URL, defaulting to 0
const params = new URLSearchParams(window.location.search);
let idx = parseInt(params.get('page'), 10);
if (isNaN(idx) || idx < 0 || idx >= pageDescriptors.length) {
  idx = 0;
}

const container = () => document.querySelector('.main-scroll');
const dynInsert = () => document.getElementById('dynamic-insert');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');

function updateButtons() {
    const prev = btnPrev();
    const next = btnNext();
    if (prev) {
      prev.disabled = navigationInProgress || idx === 0;
    }
    if (next) {
      const isSubmit = next.dataset?.isSubmit === 'true';
      if (navigationInProgress) {
        next.disabled = true;
      } else if (isSubmit && isSubmissionLocked()) {
        next.disabled = true;
      } else if (!isSubmit && idx === pageDescriptors.length - 1) {
        next.disabled = true;
      } else {
        next.disabled = false;
      }
    }
}
refreshSubmissionLockState();


async function loadPage(i, pushHistory = true, previousSnapshot = null) {
  if (i < 0 || i >= pageDescriptors.length) return;
  
  // Stop timer for current page and save timing
  if (pageStartTime) {
    let snapshot = previousSnapshot;
    if (!snapshot) {
      snapshot = await persistCurrentPageResponses();
    }
    const timeSpent = stopTimer();
    await savePageTiming(idx, timeSpent, snapshot);
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
  activePageQuestionKeys = [];
  // Reset content placeholder
  scrollEl.innerHTML = '<div id="dynamic-insert"></div>';
  let descriptor = null;
  try {
    descriptor = pageDescriptors[idx];
    if (!descriptor) {
      throw new Error(`Missing page descriptor for index ${idx}`);
    }
    const isLastPage = idx === pageDescriptors.length - 1;
    const frag = await descriptor.load();
    const placeholder = scrollEl.querySelector('#dynamic-insert');
    if (placeholder) placeholder.insertAdjacentHTML('afterend', frag);
    // Instantiate components declared in fragment
    renderComponents();
    const savedData = readJSONFromStorage(STORAGE_KEY);
    Object.assign(responses, savedData);
    // Restore form inputs from saved or remote responses
    restoreResponses();
    activePageQuestionKeys = collectQuestionKeys(scrollEl);
    // Navigation buttons appended after content
    const nav = createNavButtons({
      prevId: `prev_${idx}`,
      nextId: `next_${idx}`,
      onPrev: () => guardedNavigate(async () => {
        const snapshot = await persistCurrentPageResponses();
        await loadPage(idx - 1, true, snapshot);
      }),
      onNext: () => guardedNavigate(async () => {
        if (requiresAccessCode && idx === codePageIndex && !codeValidated) {
          const ok = await handleCodePageNext();
          if (!ok) return;
        } else {
          if (!validatePage()) {
            return;
          }
        }
        const snapshot = await persistCurrentPageResponses();
        await loadPage(idx + 1, true, snapshot);
      }),
      isLastPage,
      isAvailable: true,
      totalPages: pageDescriptors.length,
      currentPage: idx + 1,
      onSubmit: () => guardedNavigate(async () => {
        if (!validatePage()) {
          return;
        }
        if (isSubmissionLocked()) {
          alert('You have already submitted your response. Thank you!');
          return;
        }
        const snapshot = await persistCurrentPageResponses();
        if (pageStartTime) {
          const timeSpent = stopTimer();
          await savePageTiming(idx, timeSpent, snapshot);
        }
        console.log("=== Survey Completed ===");
        console.log("Responses:", responses);
        console.log("Timing Data:", readJSONFromStorage(TIMING_KEY));

        alert('Your response has been successfully submitted!');
        setSubmissionLock();
        resetSurveyState();
        if (!requiresAccessCode) {
          await initializeParticipantSession('aaaaaa', { ensureDoc: true });
        }
        await loadPage(0, false);
      }),
      submitFormId: "survey-form"
    });
    scrollEl.appendChild(nav);
  } catch (e) {
    descriptor = null;
    scrollEl.innerHTML = `<div class="error">Error: ${e.message}</div>`;
  }
  updateButtons();
  
  // Start timer for new page (이전 시간부터 이어서)
  if (descriptor && descriptor.trackTime !== false) {
    startTimer(idx);
  } else {
    stopTimer();
    accumulatedTime = 0;
    if (timerElement) {
      timerElement.textContent = formatTime(0);
    }
  }
}

async function bootstrapParticipantSession() {
  if (!requiresAccessCode) {
    await initializeParticipantSession('aaaaaa', { ensureDoc: !FIRESTORE_DISABLED });
    return;
  }
  if (TEST_MODE) {
    const defaultCode = storedParticipantCode || 'AAAAAA';
    await initializeParticipantSession(defaultCode, { ensureDoc: !FIRESTORE_DISABLED });
    return;
  }
  if (!storedParticipantCode) return;
  try {
    const resolved = await resolveSurveyCode(storedParticipantCode, { requireValidation: true });
    if (!resolved) {
      localStorage.removeItem('participant_code');
      return;
    }
    await initializeParticipantSession(resolved);
  } catch (err) {
    console.warn('Failed to restore participant session from cache', err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  history.replaceState({ pageIndex: idx }, '', `?page=${idx}`);
  await bootstrapParticipantSession();
  await loadPage(idx, false);
});
