const validationBasePath = window.__VALIDATION_BASE_PATH__ || '';

function withValidationBase(path) {
    return `${validationBasePath}${path}`;
}

const requestedExpertId = (() => {
    const parts = location.pathname.split('/').filter(Boolean);
    const routeParts = parts[0] === 'validation' ? parts.slice(1) : parts;
    if (routeParts.length === 0) return '';
    const last = routeParts.at(-1) ?? '';
    if (last === 'index.html' || last === 'index') return routeParts.at(-2) ?? '';
    return last.replace(/\.html$/, '');
})();

const chartMap = await fetch(withValidationBase('/chart_map.json')).then(r => r.json());
const expertId = requestedExpertId && chartMap[requestedExpertId]
    ? requestedExpertId
    : Object.keys(chartMap)[0] ?? '';
const expertCharts = chartMap[expertId] ?? {};
const chartIds = Object.keys(expertCharts);

const counterEl     = document.getElementById('chartCounter');
const chartIdEl     = document.getElementById('chartId');
const containerEl   = document.getElementById('chartContainer');
const questionEl    = document.getElementById('questionText');
const explanationEl = document.getElementById('explanationArea');
const completionEl  = document.getElementById('completionArea');
const commentEl     = document.getElementById('commentArea');
const prevBtn       = document.getElementById('prevBtn');
const nextBtn       = document.getElementById('nextBtn');

let currentIndex = getPageIndexFromUrl();
let currentMod   = null;
let stepsUnlocked = 0;
let selectedStepIndex = -1;
let stepRunInProgress = false;
let startSvgByStep = [];
let endSvgByStep = [];

const moduleCache = {};
const missingFunctionWarnings = new Set();
const D3_REPLAY_MOTION_CONTROLLER_KEY = '__validationReplayMotionController';
const FIRESTORE_HOST = 'https://firestore.googleapis.com/v1';
const COMMENT_COLLECTION = 'validation-comments';
const CHART_VIEWBOX_PADDING = 16;

let firestoreSettings = null;
let firestoreSettingsTask = null;
let commentsBySentence = {};
let commentStatus = '';
let commentError = '';
let commentLoadToken = 0;
let commentMutationVersion = 0;
let activeCommentSentenceKey = '';
let editingCommentId = '';
let completionAcknowledged = false;
let completionChecked = false;
let completionStatus = '';
let completionError = '';
let completionLoadToken = 0;
let completionReturnTimer = null;

function clampChartIndex(index) {
    if (chartIds.length === 0) return 0;
    return Math.max(0, Math.min(index, chartIds.length - 1));
}

function getPageIndexFromUrl() {
    const pageParam = new URLSearchParams(location.search).get('page');
    if (pageParam == null) return 0;

    const page = Number(pageParam);
    if (!Number.isInteger(page)) return 0;
    return clampChartIndex(page - 1);
}

function getExpertBasePath() {
    return expertId ? withValidationBase(`/${expertId}/`) : `${validationBasePath || '/'}`;
}

function getChartUrl(index) {
    const url = new URL(getExpertBasePath(), location.origin);

    if (index > 0) {
        url.searchParams.set('page', String(index + 1));
    }

    return `${url.pathname}${url.search}`;
}

function syncChartUrl(index, replace = false) {
    const nextUrl = getChartUrl(index);
    const currentUrl = `${location.pathname}${location.search}`;

    if (nextUrl === currentUrl) {
        return;
    }

    const method = replace ? 'replaceState' : 'pushState';
    history[method]({ chartIndex: index }, '', nextUrl);
}

async function getModule(chartId) {
    if (!moduleCache[chartId]) {
        moduleCache[chartId] = await import(withValidationBase(`/data/${expertId}/${chartId}.js`));
    }
    return moduleCache[chartId];
}

function findRenderFn(mod) {
    return Object.values(mod).find(
        v => typeof v === 'function' && v.name.toLowerCase().startsWith('render')
    );
}

function getCurrentChartId() {
    return chartIds[currentIndex] ?? '';
}

function getCurrentChartInfo() {
    return expertCharts[getCurrentChartId()] ?? {};
}

function getCurrentSentences() {
    return Object.entries(getCurrentChartInfo().explanation ?? {});
}

function getCommentStepIndex() {
    const sentences = getCurrentSentences();
    if (sentences.length === 0) return -1;
    if (selectedStepIndex >= 0) return selectedStepIndex;
    return Math.min(stepsUnlocked, sentences.length - 1);
}

function getCommentSentenceKey() {
    const sentence = getCurrentSentences()[getCommentStepIndex()];
    return sentence?.[0] ?? '';
}

function getSvgSnapshot() {
    return containerEl.querySelector('svg')?.outerHTML ?? '';
}

function parseSvgViewBox(svgNode) {
    const rawViewBox = svgNode.getAttribute('viewBox') || '';
    const values = rawViewBox.split(/[\s,]+/).map(Number).filter(Number.isFinite);

    if (values.length === 4) {
        const [x, y, width, height] = values;
        if (width > 0 && height > 0) return { x, y, width, height };
    }

    const width = Number(svgNode.getAttribute('width')) || 640;
    const height = Number(svgNode.getAttribute('height')) || 360;
    return { x: 0, y: 0, width, height };
}

function formatSvgNumber(value) {
    const rounded = Math.round(value * 1000) / 1000;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function fitSvgViewBoxToContent(container = containerEl) {
    const svgNode = container.querySelector('svg');
    if (!svgNode || typeof svgNode.getBBox !== 'function') return;

    let contentBox;
    try {
        contentBox = svgNode.getBBox();
    } catch (_) {
        return;
    }

    if (
        !contentBox ||
        !Number.isFinite(contentBox.x) ||
        !Number.isFinite(contentBox.y) ||
        !Number.isFinite(contentBox.width) ||
        !Number.isFinite(contentBox.height) ||
        contentBox.width <= 0 ||
        contentBox.height <= 0
    ) {
        return;
    }

    const current = parseSvgViewBox(svgNode);
    const currentRight = current.x + current.width;
    const currentBottom = current.y + current.height;
    const contentRight = contentBox.x + contentBox.width + CHART_VIEWBOX_PADDING;
    const contentBottom = contentBox.y + contentBox.height + CHART_VIEWBOX_PADDING;

    const nextX = Math.min(current.x, contentBox.x - CHART_VIEWBOX_PADDING);
    const nextY = Math.min(current.y, contentBox.y - CHART_VIEWBOX_PADDING);
    const nextRight = Math.max(currentRight, contentRight);
    const nextBottom = Math.max(currentBottom, contentBottom);
    const nextWidth = nextRight - nextX;
    const nextHeight = nextBottom - nextY;

    if (
        Math.abs(nextX - current.x) < 0.5 &&
        Math.abs(nextY - current.y) < 0.5 &&
        Math.abs(nextWidth - current.width) < 0.5 &&
        Math.abs(nextHeight - current.height) < 0.5
    ) {
        return;
    }

    svgNode.setAttribute('viewBox', [
        formatSvgNumber(nextX),
        formatSvgNumber(nextY),
        formatSvgNumber(nextWidth),
        formatSvgNumber(nextHeight)
    ].join(' '));
}

function nextFrame() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
            return;
        }

        setTimeout(resolve, 0);
    });
}

function installD3ReplayMotionController(d3) {
    if (!d3) return null;
    if (d3[D3_REPLAY_MOTION_CONTROLLER_KEY]) {
        return d3[D3_REPLAY_MOTION_CONTROLLER_KEY];
    }

    const transitionPrototype = d3.transition?.prototype;
    const selectionPrototype = d3.selection?.prototype;

    if (!transitionPrototype || !selectionPrototype) {
        return null;
    }

    const originalDuration = transitionPrototype.duration;
    const originalDelay = transitionPrototype.delay;
    const originalSelectionTransition = selectionPrototype.transition;
    const originalTransitionTransition = transitionPrototype.transition;

    if (
        typeof originalDuration !== 'function' ||
        typeof originalDelay !== 'function' ||
        typeof originalSelectionTransition !== 'function'
    ) {
        return null;
    }

    const controller = {
        disabledDepth: 0,
        isDisabled() {
            return this.disabledDepth > 0;
        },
        async withMotionDisabled(callback) {
            this.disabledDepth++;

            try {
                return await callback();
            } finally {
                this.disabledDepth--;
            }
        },
        forceZeroTiming(transition) {
            if (!this.isDisabled() || !transition) {
                return transition;
            }

            originalDelay.call(transition, 0);
            originalDuration.call(transition, 0);
            return transition;
        }
    };

    transitionPrototype.duration = function replayAwareDuration(...args) {
        if (controller.isDisabled() && args.length > 0) {
            return originalDuration.call(this, 0);
        }

        return originalDuration.apply(this, args);
    };

    transitionPrototype.delay = function replayAwareDelay(...args) {
        if (controller.isDisabled() && args.length > 0) {
            return originalDelay.call(this, 0);
        }

        return originalDelay.apply(this, args);
    };

    selectionPrototype.transition = function replayAwareSelectionTransition(...args) {
        const transition = originalSelectionTransition.apply(this, args);
        return controller.forceZeroTiming(transition);
    };

    if (typeof originalTransitionTransition === 'function') {
        transitionPrototype.transition = function replayAwareChainedTransition(...args) {
            const transition = originalTransitionTransition.apply(this, args);
            return controller.forceZeroTiming(transition);
        };
    }

    d3[D3_REPLAY_MOTION_CONTROLLER_KEY] = controller;
    return controller;
}

async function waitForD3Transitions(container) {
    const hasPendingTransitions = () => Array.from(container.querySelectorAll('*')).some((node) => {
        return node.__transition && Object.keys(node.__transition).length > 0;
    });

    const now = () => typeof performance === 'object' ? performance.now() : Date.now();
    const timeoutAt = now() + 5000;

    while (hasPendingTransitions() && now() < timeoutAt) {
        window.d3?.timerFlush?.();
        await new Promise((resolve) => setTimeout(resolve, 16));
    }

    window.d3?.timerFlush?.();
    await nextFrame();
}

async function invokeStepFunction(fn, { replay = false } = {}) {
    const run = async () => {
        const result = fn({ d3: window.d3, container: containerEl });

        if (result && typeof result.then === 'function') {
            await result;
        }
    };

    const motionController = installD3ReplayMotionController(window.d3);

    if (replay && motionController) {
        await motionController.withMotionDisabled(run);
    } else {
        await run();
    }
}

async function waitForStepSettled() {
    await nextFrame();
    await waitForD3Transitions(containerEl);
    await nextFrame();
}

function createChartFreezeOverlay() {
    const rect = containerEl.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(containerEl);
    const overlay = document.createElement('div');

    overlay.className = ['validation-chart-freeze-overlay', containerEl.className]
        .filter(Boolean)
        .join(' ');
    overlay.style.position = 'fixed';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.boxSizing = computedStyle.boxSizing;
    overlay.style.padding = computedStyle.padding;
    overlay.style.border = computedStyle.border;
    overlay.style.borderRadius = computedStyle.borderRadius;
    overlay.style.background = computedStyle.background;
    overlay.style.zIndex = '1000';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = computedStyle.overflow;

    overlay.innerHTML = containerEl.innerHTML;
    document.body.appendChild(overlay);

    return {
        remove() {
            overlay.remove();
        }
    };
}

function warnMissingFunction(chartId, fnName) {
    const warningKey = `${chartId}:${fnName}`;
    if (missingFunctionWarnings.has(warningKey)) return;

    missingFunctionWarnings.add(warningKey);
    console.warn(`Validation step function is missing: ${chartId}.${fnName}`);
}

function compareStepSnapshot(kind, stepIndex, nextSnapshot) {
    const snapshots = kind === 'start' ? startSvgByStep : endSvgByStep;
    const previousSnapshot = snapshots[stepIndex];

    if (previousSnapshot == null) {
        snapshots[stepIndex] = nextSnapshot;
        return;
    }

    if (previousSnapshot !== nextSnapshot) {
        const chartId = getCurrentChartId();
        console.warn(`Validation ${kind} SVG mismatch for ${chartId} step ${stepIndex + 1}.`);
    }
}

function renderCurrentChart() {
    containerEl.innerHTML = '';
    const renderFn = findRenderFn(currentMod);
    if (renderFn) renderFn({ container: containerEl });
    fitSvgViewBoxToContent();
}

async function loadChart(index) {
    if (completionReturnTimer) {
        clearTimeout(completionReturnTimer);
        completionReturnTimer = null;
    }

    currentIndex = clampChartIndex(index);
    const chartId = chartIds[currentIndex];
    currentMod = await getModule(chartId);

    renderCurrentChart();

    stepsUnlocked = 0;
    selectedStepIndex = -1;
    stepRunInProgress = false;
    startSvgByStep = [];
    endSvgByStep = [];
    commentsBySentence = {};
    commentStatus = '';
    commentError = '';
    commentMutationVersion = 0;
    activeCommentSentenceKey = '';
    editingCommentId = '';
    completionAcknowledged = false;
    completionStatus = '';
    completionError = '';
    updateUI();
    loadCompletionStatus();
    loadCommentsForCurrentSentence();
}

function navigateToChart(index, replace = false) {
    const nextIndex = clampChartIndex(index);
    syncChartUrl(nextIndex, replace);
    loadChart(nextIndex);
}

async function runStep(stepIndex) {
    if (stepRunInProgress) return;

    const sentences = getCurrentSentences();
    const [fnName, _displayText] = sentences[stepIndex] ?? [];
    const targetFn = currentMod?.[fnName];

    if (typeof targetFn !== 'function') {
        warnMissingFunction(getCurrentChartId(), fnName ?? `step${stepIndex + 1}`);
        return;
    }

    stepRunInProgress = true;
    updateUI();

    const freezeOverlay = createChartFreezeOverlay();

    try {
        renderCurrentChart();
        await nextFrame();

        for (let i = 0; i < stepIndex; i++) {
            const [replayFnName] = sentences[i] ?? [];
            const replayFn = currentMod?.[replayFnName];

            if (typeof replayFn !== 'function') {
                warnMissingFunction(getCurrentChartId(), replayFnName ?? `step${i + 1}`);
                return;
            }

            await invokeStepFunction(replayFn, { replay: true });
            fitSvgViewBoxToContent();
            await waitForStepSettled();
            fitSvgViewBoxToContent();
        }

        fitSvgViewBoxToContent();
        const startSnapshot = getSvgSnapshot();

        await invokeStepFunction(targetFn, { replay: false });
        await nextFrame();
        fitSvgViewBoxToContent();
        freezeOverlay.remove();
        await waitForStepSettled();
        fitSvgViewBoxToContent();
        const endSnapshot = getSvgSnapshot();

        compareStepSnapshot('start', stepIndex, startSnapshot);
        compareStepSnapshot('end', stepIndex, endSnapshot);

        selectedStepIndex = stepIndex;
        stepsUnlocked = Math.max(stepsUnlocked, stepIndex + 1);
    } finally {
        freezeOverlay.remove();
        stepRunInProgress = false;
        updateUI();
        loadCommentsForCurrentSentence();
    }
}

function updateUI() {
    const total     = chartIds.length;
    const chartId   = getCurrentChartId();
    const chartInfo = getCurrentChartInfo();

    counterEl.textContent = `${currentIndex + 1} / ${total}`;
    chartIdEl.textContent = chartId;

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === total - 1;

    // Question
    questionEl.textContent = chartInfo.question ?? '';

    // Explanation:
    //   key   = function name  (e.g. "function1")
    //   value = display text   (e.g. "sentence1")
    const sentences = getCurrentSentences();
    explanationEl.innerHTML = '';

    sentences.forEach(([fnName, displayText], i) => {
        const fn = currentMod?.[fnName];
        const isUnlocked = i <= stepsUnlocked;
        const isMissing = typeof fn !== 'function';
        const state = isMissing
            ? 'missing'
            : i === selectedStepIndex
                ? 'selected'
                : isUnlocked
                    ? i === stepsUnlocked
                        ? 'active'
                        : 'completed'
                    : 'pending';

        const span = document.createElement('span');
        span.className = `sentence sentence--${state}`;
        span.textContent = displayText;

        if (isMissing) {
            warnMissingFunction(chartId, fnName);
        }

        if (isUnlocked && !isMissing && !stepRunInProgress) {
            span.addEventListener('click', () => {
                runStep(i);
            });
        }

        explanationEl.appendChild(span);

        if (i < sentences.length - 1) {
            explanationEl.appendChild(document.createTextNode(' '));
        }
    });

    renderCompletionArea();
    renderCommentArea();
}

function returnToFirstChartAfterCompletion() {
    if (completionReturnTimer) {
        clearTimeout(completionReturnTimer);
    }

    completionAcknowledged = true;
    completionChecked = true;
    saveCompletionStatus(true);
    renderCompletionArea();

    completionReturnTimer = setTimeout(() => {
        completionReturnTimer = null;
        completionAcknowledged = false;
        navigateToChart(0);
    }, 1200);
}

function renderCompletionArea() {
    if (!completionEl) return;

    completionEl.innerHTML = '';

    const isLastChart = chartIds.length > 0 && currentIndex === chartIds.length - 1;
    if (!isLastChart) return;

    const panel = document.createElement('div');
    panel.className = 'completion-panel';

    if (completionChecked || completionAcknowledged) {
        const message = document.createElement('div');
        message.className = 'completion-message';
        message.textContent = completionAcknowledged
            ? 'All checked. Returning to page 1...'
            : 'All checked';
        panel.appendChild(message);
    } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'completion-btn';
        button.textContent = 'Click to confirm that all visual explanation have been checked';
        button.addEventListener('click', returnToFirstChartAfterCompletion);
        panel.appendChild(button);
    }

    if (completionError || completionStatus) {
        const status = document.createElement('div');
        status.className = completionError
            ? 'completion-status completion-status--error'
            : 'completion-status';
        status.textContent = completionError || completionStatus;
        panel.appendChild(status);
    }

    completionEl.appendChild(panel);
}

function makeCommentId() {
    if (typeof crypto === 'object' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `comment_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getConfigUrl() {
    return withValidationBase('/config.json');
}

async function getFirestoreSettings() {
    if (firestoreSettings) return firestoreSettings;

    if (!firestoreSettingsTask) {
        firestoreSettingsTask = (async () => {
            const response = await fetch(getConfigUrl(), { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to load config.json (${response.status})`);
            }

            const raw = await response.json();
            const apiKey = raw.API_KEY || raw.apiKey || '';
            const projectId = raw.PROJECT_ID || raw.projectId || '';
            const databaseId = raw.DATABASE_ID || raw.databaseId || '(default)';

            if (!apiKey || !projectId) {
                throw new Error('Missing API_KEY or PROJECT_ID in config.json');
            }

            return { apiKey, projectId, databaseId };
        })();
    }

    try {
        firestoreSettings = await firestoreSettingsTask;
        return firestoreSettings;
    } catch (error) {
        firestoreSettingsTask = null;
        throw error;
    }
}

function encodeFirestoreValue(value) {
    if (Array.isArray(value)) {
        return {
            arrayValue: {
                values: value.map((item) => encodeFirestoreValue(item))
            }
        };
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
    }

    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }

    if (value && typeof value === 'object') {
        return {
            mapValue: {
                fields: encodeFirestoreFields(value)
            }
        };
    }

    return { stringValue: value == null ? '' : String(value) };
}

function encodeFirestoreFields(fields) {
    return Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value)])
    );
}

function decodeFirestoreValue(value) {
    if (!value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return String(value.timestampValue);
    if ('mapValue' in value) return decodeFirestoreFields(value.mapValue?.fields || {});
    if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeFirestoreValue);
    return null;
}

function decodeFirestoreFields(fields) {
    return Object.fromEntries(
        Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)])
    );
}

function encodeFirestoreSegment(segment) {
    return encodeURIComponent(segment);
}

async function requestFirestore(pathSegments, { method = 'GET', body = null } = {}) {
    const { apiKey, projectId, databaseId } = await getFirestoreSettings();
    const path = pathSegments.map(encodeFirestoreSegment).join('/');
    const url = `${FIRESTORE_HOST}/projects/${projectId}/databases/${databaseId}/documents/${path}?key=${encodeURIComponent(apiKey)}`;
    const headers = { Accept: 'application/json' };
    const options = { method, headers };

    if (body) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (response.status === 404) return null;
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Firestore ${method} failed (${response.status}): ${text}`);
    }
    if (response.status === 204) return null;

    return response.json();
}

async function getFirestoreDocument(pathSegments) {
    const doc = await requestFirestore(pathSegments);
    if (!doc) return null;
    return decodeFirestoreFields(doc.fields || {});
}

async function patchFirestoreDocument(pathSegments, fields) {
    await requestFirestore(pathSegments, {
        method: 'PATCH',
        body: { fields: encodeFirestoreFields(fields) }
    });
}

function getCommentDocumentPath(sentenceKey = getCommentSentenceKey()) {
    const chartId = getCurrentChartId();
    if (!expertId || !chartId || !sentenceKey) return [];

    return [COMMENT_COLLECTION, expertId, 'questions', chartId, 'sentences', sentenceKey];
}

function getCommentQuestionDocumentPath() {
    const chartId = getCurrentChartId();
    if (!expertId || !chartId) return [];

    return [COMMENT_COLLECTION, expertId, 'questions', chartId];
}

function getCompletionDocumentPath() {
    if (!expertId) return [];

    return [COMMENT_COLLECTION, expertId, 'completion', 'status'];
}

async function loadCompletionStatus() {
    const docPath = getCompletionDocumentPath();
    const loadToken = ++completionLoadToken;

    if (docPath.length === 0) return;

    try {
        const doc = await getFirestoreDocument(docPath);
        if (loadToken !== completionLoadToken) return;

        completionChecked = Boolean(doc?.checked);
        completionStatus = '';
        completionError = '';
    } catch (error) {
        if (loadToken !== completionLoadToken) return;

        completionStatus = '';
        completionError = error.message || 'Failed to load completion status';
    }

    renderCompletionArea();
}

async function saveCompletionStatus(checked) {
    const docPath = getCompletionDocumentPath();
    if (docPath.length === 0) return;

    completionStatus = 'Saving...';
    completionError = '';
    renderCompletionArea();

    try {
        const now = new Date().toISOString();
        await patchFirestoreDocument([COMMENT_COLLECTION, expertId], {
            expertId,
            updatedAt: now
        });
        await patchFirestoreDocument(docPath, {
            expertId,
            checked,
            updatedAt: now
        });
        completionStatus = '';
        completionError = '';
    } catch (error) {
        completionStatus = '';
        completionError = error.message || 'Failed to save completion status';
    }

    renderCompletionArea();
}

function getLegacyCommentDocumentId(sentenceKey = getCommentSentenceKey()) {
    const chartId = getCurrentChartId();
    if (!expertId || !chartId || !sentenceKey) return '';

    return `${expertId}_${chartId}_${sentenceKey}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getCommentsForSentence(sentenceKey = getCommentSentenceKey()) {
    return commentsBySentence[sentenceKey] || [];
}

function normalizeComment(raw) {
    return {
        id: raw?.id || makeCommentId(),
        text: String(raw?.text || ''),
        checked: Boolean(raw?.checked),
        createdAt: String(raw?.createdAt || new Date().toISOString()),
        updatedAt: String(raw?.updatedAt || new Date().toISOString())
    };
}

function getCommentSortTime(comment) {
    const updatedAt = Date.parse(comment.updatedAt || '');
    if (Number.isFinite(updatedAt)) return updatedAt;

    const createdAt = Date.parse(comment.createdAt || '');
    return Number.isFinite(createdAt) ? createdAt : 0;
}

async function loadCommentsForCurrentSentence() {
    const sentenceKey = getCommentSentenceKey();
    const docPath = getCommentDocumentPath(sentenceKey);
    const legacyDocId = getLegacyCommentDocumentId(sentenceKey);
    const loadToken = ++commentLoadToken;
    const mutationVersionAtLoad = commentMutationVersion;

    if (!sentenceKey || docPath.length === 0) {
        renderCommentArea();
        return;
    }

    commentStatus = 'Loading comments...';
    commentError = '';
    renderCommentArea();

    try {
        let doc = await getFirestoreDocument(docPath);

        if (!doc && legacyDocId) {
            doc = await getFirestoreDocument([COMMENT_COLLECTION, legacyDocId]);
        }

        if (loadToken !== commentLoadToken) return;
        if (mutationVersionAtLoad !== commentMutationVersion) return;

        commentsBySentence = {
            ...commentsBySentence,
            [sentenceKey]: Array.isArray(doc?.comments)
                ? doc.comments.map(normalizeComment)
                : []
        };
        commentStatus = 'Comments loaded';
    } catch (error) {
        if (loadToken !== commentLoadToken) return;

        commentStatus = '';
        commentError = error.message || 'Failed to load comments';
    }

    renderCommentArea();
}

async function saveCommentsForSentence(sentenceKey, comments) {
    const docPath = getCommentDocumentPath(sentenceKey);
    const questionDocPath = getCommentQuestionDocumentPath();
    if (docPath.length === 0 || questionDocPath.length === 0) return;

    commentStatus = 'Saving...';
    commentError = '';
    renderCommentArea();

    try {
        const now = new Date().toISOString();
        await patchFirestoreDocument([COMMENT_COLLECTION, expertId], {
            expertId,
            updatedAt: now
        });
        await patchFirestoreDocument(questionDocPath, {
            expertId,
            chartId: getCurrentChartId(),
            updatedAt: now
        });
        await patchFirestoreDocument(docPath, {
            expertId,
            chartId: getCurrentChartId(),
            sentenceKey,
            comments,
            updatedAt: now
        });
        commentStatus = 'Saved';
    } catch (error) {
        commentStatus = '';
        commentError = error.message || 'Failed to save comments';
    }

    renderCommentArea();
}

function updateCommentsForSentence(sentenceKey, updater) {
    const currentComments = getCommentsForSentence(sentenceKey);
    const nextComments = updater(currentComments).map(normalizeComment);
    commentMutationVersion++;
    commentsBySentence = {
        ...commentsBySentence,
        [sentenceKey]: nextComments
    };
    renderCommentArea();
    saveCommentsForSentence(sentenceKey, nextComments);
}

function renderCommentArea() {
    if (!commentEl) return;

    const sentenceKey = getCommentSentenceKey();
    const sentenceIndex = getCommentStepIndex();

    commentEl.innerHTML = '';

    if (!sentenceKey || sentenceIndex < 0) {
        const empty = document.createElement('div');
        empty.className = 'comment-panel comment-panel--empty';
        empty.textContent = 'No sentence selected.';
        commentEl.appendChild(empty);
        return;
    }

    if (sentenceKey !== activeCommentSentenceKey) {
        activeCommentSentenceKey = sentenceKey;
        editingCommentId = '';
    }

    const panel = document.createElement('div');
    panel.className = 'comment-panel';

    const header = document.createElement('div');
    header.className = 'comment-panel__header';
    header.textContent = `Comments for sentence ${sentenceIndex + 1}`;
    panel.appendChild(header);

    const addRow = document.createElement('div');
    addRow.className = 'comment-add';

    const addInput = document.createElement('textarea');
    addInput.className = 'comment-add__input';
    addInput.placeholder = 'Add a comment';
    addInput.rows = 2;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'comment-btn';
    addButton.textContent = 'Add';
    addButton.addEventListener('click', () => {
        const text = addInput.value.trim();
        if (!text) return;

        const now = new Date().toISOString();
        const nextComment = {
            id: makeCommentId(),
            text,
            checked: false,
            createdAt: now,
            updatedAt: now
        };
        addInput.value = '';

        updateCommentsForSentence(sentenceKey, (prev) => [nextComment, ...prev]);
    });

    addRow.appendChild(addInput);
    addRow.appendChild(addButton);
    panel.appendChild(addRow);

    const comments = getCommentsForSentence(sentenceKey)
        .slice()
        .sort((a, b) => getCommentSortTime(b) - getCommentSortTime(a));
    const list = document.createElement('div');
    list.className = 'comment-list';

    if (comments.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'comment-list__empty';
        empty.textContent = '';
        list.appendChild(empty);
    }

    comments.forEach((comment) => {
        const isEditing = comment.id === editingCommentId;
        const item = document.createElement('div');
        item.className = 'comment-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'comment-item__check';
        checkbox.checked = comment.checked;
        checkbox.addEventListener('change', () => {
            updateCommentsForSentence(sentenceKey, (prev) => prev.map((entry) => (
                entry.id === comment.id
                    ? { ...entry, checked: checkbox.checked, updatedAt: new Date().toISOString() }
                    : entry
            )));
        });

        const editorWrap = document.createElement('div');
        editorWrap.className = 'comment-item__body';

        if (isEditing) {
            const textarea = document.createElement('textarea');
            textarea.className = 'comment-item__text';
            textarea.value = comment.text;
            textarea.rows = 2;

            const actions = document.createElement('div');
            actions.className = 'comment-item__actions';

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'comment-btn comment-btn--small';
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', () => {
                const nextText = textarea.value.trim();
                editingCommentId = '';
                updateCommentsForSentence(sentenceKey, (prev) => prev.map((entry) => (
                    entry.id === comment.id
                        ? { ...entry, text: nextText, updatedAt: new Date().toISOString() }
                        : entry
                )));
            });

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'comment-btn comment-btn--small';
            cancelButton.textContent = 'Cancel';
            cancelButton.addEventListener('click', () => {
                editingCommentId = '';
                renderCommentArea();
            });

            actions.appendChild(saveButton);
            actions.appendChild(cancelButton);
            editorWrap.appendChild(textarea);
            editorWrap.appendChild(actions);
        } else {
            const text = document.createElement('div');
            text.className = 'comment-item__text-display';
            text.textContent = comment.text || '(empty)';

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'comment-btn comment-btn--small';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', () => {
                editingCommentId = comment.id;
                renderCommentArea();
            });

            editorWrap.appendChild(text);
            editorWrap.appendChild(editButton);
        }

        item.appendChild(checkbox);
        item.appendChild(editorWrap);
        list.appendChild(item);
    });

    panel.appendChild(list);

    const status = document.createElement('div');
    status.className = commentError ? 'comment-status comment-status--error' : 'comment-status';
    status.textContent = commentError || commentStatus || '';
    panel.appendChild(status);

    commentEl.appendChild(panel);
}

prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) navigateToChart(currentIndex - 1);
});

nextBtn.addEventListener('click', () => {
    if (currentIndex < chartIds.length - 1) navigateToChart(currentIndex + 1);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft'  && !prevBtn.disabled) prevBtn.click();
    if (e.key === 'ArrowRight' && !nextBtn.disabled) nextBtn.click();
});

window.addEventListener('popstate', () => {
    loadChart(getPageIndexFromUrl());
});

if (chartIds.length > 0) {
    navigateToChart(currentIndex, true);
}
