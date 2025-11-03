import {renderChart} from "../util/util.js";
import {executeAtomicOps} from "../router/router.js";
import {getVegaLiteSpec, getOperationSpec} from "./util.js"
import { runOpsSequence, attachOpNavigator, updateNavigatorStates } from "../operations/operationUtil.js";

export function createNavButtons({ prevId, nextId, onPrev, onNext, onSubmit = null, submitFormId = null, isLastPage = false, isAvailable = true, hidePrev = false, totalPages = null, currentPage = null }) {
    const w = document.createElement('div');
    w.className = 'survey-nav';
    if (!isAvailable) {
        w.style.display = 'none';
        return w;
    }
    let p;
    const n = document.createElement('button');
    n.id = nextId;
    n.className = 'button next-btn';
    n.textContent = isLastPage ? 'Submit' : 'Next';

    const shouldSubmit = isLastPage && (typeof onSubmit === 'function' || !!submitFormId);
    n.type = 'button';
    n.dataset.isSubmit = shouldSubmit ? 'true' : 'false';
    if (shouldSubmit && typeof onSubmit === 'function') {
        n.addEventListener('click', onSubmit);
    } else {
        n.addEventListener('click', onNext);
    }
    if (shouldSubmit && submitFormId) {
        n.setAttribute('form', submitFormId);
    }

    const progress = document.createElement('progress');
    progress.className = 'progress-bar';
    progress.max = totalPages;
    progress.value = currentPage;
    if (totalPages !== null && currentPage !== null) {
        progress.max = totalPages;
        progress.value = currentPage;
    }

    const progressLabel = document.createElement('span');
    if (totalPages !== null && currentPage !== null) {
        const percentage = ((currentPage / totalPages) * 100).toFixed(2);
        progressLabel.textContent = `(${currentPage}/${totalPages}) ${percentage}%`;
    }

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.append(progress);
    progressContainer.append(document.createElement('br'));
    progressContainer.append(progressLabel);

    if (!hidePrev) {
        p = document.createElement('button');
        p.id = prevId;
        p.className = 'button prev-btn';
        p.textContent = 'Previous';
        p.disabled = true;
        p.addEventListener('click', onPrev);
        // Order: Previous, progress container, Next
        w.append(p, progressContainer, n);
    } else {
        // Order: progress container, Next
        w.append(progressContainer, n);
    }
    return w;
}

const chartInstanceCounts = new Map();

function nextChartDomId(baseId) {
    const current = chartInstanceCounts.get(baseId) || 0;
    const next = current + 1;
    chartInstanceCounts.set(baseId, next);
    return `chart-${baseId}-${next}`;
}

async function fetchSpecFromPath(path) {
    try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const spec = await res.json();
        Object.defineProperty(spec, '__resolvedFrom', {
            value: path,
            configurable: true,
            enumerable: false
        });
        return spec;
    } catch (err) {
        console.error(`Failed to load chart spec from ${path}`, err);
        throw err;
    }
}

function normalizeDataUrl(url) {
    if (typeof url !== 'string') return url;
    if (url.startsWith('../') || url.startsWith('./') || url.startsWith('/')) {
        return url;
    }
    if (/^[a-z][a-z0-9+\-.]*:/i.test(url)) {
        return url;
    }
    return `../${url}`;
}

export async function createChart(cId, host = null) {
    const chartDomId = nextChartDomId(cId);

    const chartDiv = document.createElement('div');
    chartDiv.id = chartDomId;
    chartDiv.className = 'd3chart-container';
    chartDiv.style.margine = "0 auto";

    const container = host || document.querySelector(
        `[data-component="chart"][data-chart="${cId}"]`
    );
    if (!container) {
        console.error(`Chart container for "${cId}" not found`);
        return;
    }
    // Insert chart div
    container.appendChild(chartDiv);

    const explicitSpecPath = (container.getAttribute('data-spec-path') || container.dataset.specPath || '').trim();
    let vegaLiteSpec = null;
    try {
        if (explicitSpecPath) {
            vegaLiteSpec = await fetchSpecFromPath(explicitSpecPath);
        } else {
            vegaLiteSpec = await getVegaLiteSpec(cId);
        }
    } catch (err) {
        chartDiv.innerHTML = `<div class="error">Failed to load chart specification.</div>`;
        return;
    }

    if (!vegaLiteSpec) {
        chartDiv.innerHTML = '<div class="error">Chart specification is empty.</div>';
        return;
    }

    if (vegaLiteSpec.data && typeof vegaLiteSpec.data.url === 'string') {
        vegaLiteSpec.data.url = normalizeDataUrl(vegaLiteSpec.data.url);
    }
    if (Object.prototype.hasOwnProperty.call(vegaLiteSpec, '__resolvedFrom')) {
        delete vegaLiteSpec.__resolvedFrom;
    }
    await renderChart(chartDomId, vegaLiteSpec);
    const disableNavigator = container.getAttribute('data-disable-navigator') === 'true';
    let ctrl = null;
    if (!disableNavigator) {
        ctrl = attachOpNavigator(chartDomId, { mount: 'footer' });
        updateNavigatorStates(ctrl, 0, 1);
    }

    // Enable interactive operation sequence only when opspec is declared on the chart placeholder
    const rawOpSpec = (container.getAttribute('data-opspec') || container.dataset.opspec || '').trim();
    if (rawOpSpec) {
        // Resolve path: allow full path (*.json) or a logical key mapping to specs/ops/<key>.json
        const opSpecPath = (/\.json$/i.test(rawOpSpec) || rawOpSpec.includes('/'))
            ? rawOpSpec
            : `specs/ops/op_${rawOpSpec}.json`;

        let operationSpec = null;
        try {
            const resp = await fetch(opSpecPath, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`Failed to load opspec: ${resp.status}`);
            operationSpec = await resp.json();
        } catch (e) {
            console.error('Failed to fetch operation spec', e);
        }

        if (operationSpec) {
            // Hand off the full multi-key spec (including text/ops/ops2/last) to the router.
            // The router will delegate to the chart-type-specific runner, which manages sequencing/UI.
            await executeAtomicOps(chartDomId, vegaLiteSpec, operationSpec);
        }
    }
}

export function createLikertQuestion({ name, questionText, labels }) {
    const f = document.createElement('fieldset');
    f.className = 'likert-group';
    f.setAttribute('aria-label', questionText);
    f.setAttribute('data-required', 'true');
    f.setAttribute('data-input-name', name);
    f.dataset.name = name;
    f.setAttribute('data-name', name);

    const l = document.createElement('legend');
    l.className = 'question';
    l.textContent = questionText;
    f.append(l);

    const opts = document.createElement('div');
    opts.className = 'options';
    labels.forEach((txt, i) => {
        const lab = document.createElement('label');
        lab.className = 'likert-option';
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = name;
        inp.value = (i+1)+'';
        inp.id = `${name}-opt-${i+1}`;
        const dot = document.createElement('span');
        dot.className = 'custom-radio';
        const txtSpan = document.createElement('span');
        txtSpan.className = 'option-text';
        txtSpan.textContent = txt;
        lab.append(inp, dot, txtSpan);
        opts.append(lab);
    });
    f.append(opts);
    return f;
}

export function createRankingQuestion({ name, questionText, options }) {
    // fieldset wrapper
    const f = document.createElement('fieldset');
    f.className = 'ranking-group';
    f.setAttribute('aria-label', questionText);
    f.setAttribute('data-required', 'true');
    f.setAttribute('data-input-name', name);
    f.dataset.name = name;
    f.setAttribute('data-name', name);

    // legend
    const l = document.createElement('legend');
    l.className = 'question';
    l.textContent = questionText;
    f.append(l);

    // hidden input to store ordered values (CSV; length === options.length)
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = name;
    hidden.value = '';
    f.append(hidden);

    // live region for screen readers (accessibility)
    const live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    f.append(live);

    // state: assignments[rankIndex] = optionIndex | null
    const assignments = new Array(options.length).fill(null);
    let selectedOption = null; // index of currently selected option button


    // ---------- utilities ----------
    const dispatchResponse = () => {
        const orderedValues = assignments.map(idx => (idx === null ? '' : String(options[idx])));
        hidden.value = orderedValues.join(',');
        const responseEvent = new CustomEvent('survey-response', {
            detail: { name, value: orderedValues }
        });
        document.dispatchEvent(responseEvent);
    };

    const ranks = [];     // DOM buttons for rank slots
    const optBtns = [];   // DOM buttons for options

    const updateUI = () => {
        // Update rank slots: number/label, state classes, ARIA label
        ranks.forEach((slot, r) => {
            const assignedIdx = assignments[r];
            if (assignedIdx === null) {
                slot.textContent = String(r + 1);
                slot.classList.add('is-empty');
                slot.classList.remove('has-assignment');
                slot.removeAttribute('data-option-index');
                slot.setAttribute('aria-label', `Rank ${r + 1} (empty)`);
            } else {
                const label = String(options[assignedIdx]);
                slot.textContent = `${r + 1}. ${label}`;
                slot.classList.remove('is-empty');
                slot.classList.add('has-assignment');
                slot.dataset.optionIndex = String(assignedIdx);
                slot.setAttribute('aria-label', `Rank ${r + 1}: ${label}`);
            }
        });

        // Update option buttons: badge shows assigned rank, selected styling
        optBtns.forEach((btn, i) => {
            const badge = btn.querySelector('.rank-badge');
            const pos = assignments.indexOf(i);
            const hasRank = pos !== -1;

            btn.classList.toggle('has-rank', hasRank);
            btn.classList.toggle('is-selected', selectedOption === i);
            btn.setAttribute('aria-pressed', selectedOption === i ? 'true' : 'false');

            if (badge) badge.textContent = hasRank ? String(pos + 1) : '';
        });
    };

    const assign = (optionIndex, rankIndex) => {
        // Remove existing placement of this option
        for (let r = 0; r < assignments.length; r++) {
            if (assignments[r] === optionIndex) assignments[r] = null;
        }
        // Replace whatever was in the target slot
        assignments[rankIndex] = optionIndex;

        // After assignment, clear selection for faster multiple placements
        selectedOption = null;

        dispatchResponse();
        updateUI();
        try { live.textContent = `"${String(options[optionIndex])}" placed at rank ${String(rankIndex + 1)}.`; } catch (e) {}
    };

    const clearRank = (rankIndex) => {
        assignments[rankIndex] = null;
        dispatchResponse();
        updateUI();
        try { live.textContent = `Rank ${String(rankIndex + 1)} cleared.`; } catch (e) {}
    };

    // Microcopy above rank grid (EN)
    const gridHelp = document.createElement('p');
    gridHelp.className = 'ranking-help';
    gridHelp.textContent = 'Place selected options here: click a number or drop a button onto a slot.';
    f.append(gridHelp);

    // ---------- UI: rank slots (top row) ----------
    const grid = document.createElement('div');
    grid.className = 'rank-grid';
    grid.setAttribute('aria-label', 'Ranked order');

    for (let r = 0; r < options.length; r++) {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'rank-slot is-empty';
        slot.dataset.rank = String(r);
        slot.setAttribute('aria-label', `Rank ${r + 1} (empty)`);
        slot.textContent = String(r + 1);

        // Click: place selected option, or clear if already assigned
        slot.addEventListener('click', () => {
            if (selectedOption !== null) {
                assign(selectedOption, r);
            } else if (assignments[r] !== null) {
                clearRank(r);
            }
        });

        // Drag & Drop
        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            slot.classList.add('drag-over');
        });

        slot.addEventListener('dragleave', () => {
            slot.classList.remove('drag-over');
        });

        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            const data = e.dataTransfer.getData('text/plain');
            const i = Number(data);
            if (!Number.isNaN(i) && i >= 0 && i < options.length) {
                assign(i, r);
            }
        });

        // Keyboard: Enter/Space to place/clear
        slot.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                if (selectedOption !== null) {
                    assign(selectedOption, r);
                } else if (assignments[r] !== null) {
                    clearRank(r);
                }
            }
        });

        grid.append(slot);
        ranks.push(slot);
    }
    f.append(grid);

    // ---------- UI: option pool (bottom) ----------
    const pool = document.createElement('div');
    pool.className = 'option-pool';

    // Microcopy above option pool (EN)
    const poolHelp = document.createElement('p');
    poolHelp.className = 'ranking-help';
    poolHelp.textContent = 'Drag these buttons onto the numbered slots above, or click a button then a number.';
    f.append(poolHelp);

    options.forEach((label, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rank-option';
        btn.dataset.index = String(i);
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', `${label} (Click to select, then click a rank above. Press 1…${options.length} to place.)`);

        // Draggable assignment
        btn.draggable = true;
        btn.addEventListener('dragstart', (e) => {
            try {
                e.dataTransfer.setData('text/plain', String(i));
                e.dataTransfer.effectAllowed = 'move';
            } catch (_) {}
        });

        // Click to select / deselect
        btn.addEventListener('click', () => {
            selectedOption = (selectedOption === i) ? null : i;
            updateUI();
        });

        // Keyboard: Space/Enter to select; numbers 1..N to assign directly
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectedOption = (selectedOption === i) ? null : i;
                updateUI();
                return;
            }
            const digit = Number(e.key);
            if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
                e.preventDefault();
                assign(i, digit - 1);
            }
        });

        const text = document.createElement('span');
        text.className = 'option-text';
        text.textContent = label;

        // rank badge (shows current rank if assigned)
        const badge = document.createElement('span');
        badge.className = 'rank-badge';
        badge.setAttribute('aria-hidden', 'true');

        btn.append(text, badge);
        pool.append(btn);
        optBtns.push(btn);
    });

    f.append(pool);

    // Initialize
    dispatchResponse();
    updateUI();

    return f;
}

// --- Auto mount for data-component="ranking" placeholders ---
(function initRankingAutobind(){
    const SELECTOR = '[data-component="ranking"]';

    const mountOne = (host) => {
        if (!host || host.__ranking_mounted__) return;
        host.__ranking_mounted__ = true; // guard against double-mount
        const name = host.getAttribute('data-name') || host.dataset.name || '';
        const questionText = host.getAttribute('data-question') || host.dataset.question || '';
        const raw = host.getAttribute('data-options') || host.dataset.options || '';
        const options = raw.split('|').map(s => s.trim()).filter(Boolean);
        const node = createRankingQuestion({ name, questionText, options });
        host.replaceWith(node);
    };

    const mountAll = (root = document) => {
        const nodes = root.querySelectorAll ? root.querySelectorAll(SELECTOR) : [];
        nodes.forEach(mountOne);
    };

    // Initial mount
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => mountAll());
    } else {
        mountAll();
    }

    // Observe dynamic injections (SPA route changes, async templates, etc.)
    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
                m.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    if (node.matches && node.matches(SELECTOR)) {
                        mountOne(node);
                    } else {
                        mountAll(node);
                    }
                });
            }
        }
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
})();

export function createOpenEndedInput({ id, labelText, placeholder, multiline }) {
    const w = document.createElement('div');
    w.className = 'text-input-wrapper';
    w.dataset.name = id;
    w.setAttribute('data-name', id);

    // "Optional"이 포함되어 있으면 필수가 아님
    const isOptional = labelText.toLowerCase().includes('optional') ||
        placeholder.toLowerCase().includes('optional');

    if (!isOptional) {
        w.setAttribute('data-required', 'true');
    }

    const l = document.createElement('label');
    l.className = 'question';

    // Optional인 경우 클래스 추가
    if (isOptional) {
        l.classList.add('optional-question');
    }

    l.setAttribute('for', id);
    l.textContent = labelText;

    const inp = multiline
        ? Object.assign(document.createElement('textarea'), {
            id, placeholder, rows: 3, className: 'text-input',
            style: 'resize:vertical;'
        })
        : Object.assign(document.createElement('input'), {
            type:'text', id, placeholder, className:'text-input'
        });

    if (!isOptional) {
        inp.required = true;
    }

    inp.name = id;
    // Dispatch a survey-response event when the input changes
    inp.addEventListener('input', e => {
        const responseEvent = new CustomEvent('survey-response', {
            detail: { name: id, value: e.target.value }
        });
        document.dispatchEvent(responseEvent);
    });
    w.append(l, inp);
    return w;
}

export function createCompletionCode(completionCode) {

    // Persist so other pages (e.g., completion page) can read it
    try { localStorage.setItem('completion_code', completionCode); } catch (_) {}

    // Build DOM: "Completion Code: <strong>XXXXXX</strong>"
    const w = document.createElement('div');
    w.className = 'completion-code';

    const label = document.createElement('span');
    label.textContent = 'Completion Code: ';

    const strong = document.createElement('strong');
    strong.id = 'completion-code';
    strong.textContent = completionCode;

    w.append(label, strong);
    return w;
}

export async function createChartExp(chartDir) {
    // Locate host container
    const host = document.querySelector(`[data-component="chart-exp"][data-chart-exp="${chartDir}"]`);
    if (!host) {
        console.error(`chart-exp host for "${chartDir}" not found`);
        return;
    }

    // Create an inner container for rendering and a nav area
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-exp-wrapper';

    const chartHolder = document.createElement('div');
    chartHolder.className = 'd3chart-container';
    const chartId = `chart-exp-${chartDir.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    // Remove ad-hoc nav area and use navigator overlay
    wrapper.append(chartHolder);
    host.append(wrapper);

    // --- helpers ---
    const join = (base, seg) => {
        if (!base) return seg || '';
        if (!seg) return base;
        const b = base.endsWith('/') ? base.slice(0, -1) : base;
        const s = seg.startsWith('/') ? seg.slice(1) : seg;
        return `${b}/${s}`;
    };

    const resolveBase = (dir) => dir.endsWith('/') ? dir : `${dir}/`;

    async function fetchJSON(url) {
        try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch (_) { return null; }
    }

    async function resolveFileList(dir, hostEl) {
        // Priority 0: explicit list provided via data-files="a.json|b.json"
        const explicit = (hostEl.getAttribute('data-files') || '').trim();
        if (explicit) {
            const parts = explicit.split('|').map(s => s.trim()).filter(Boolean);
            return parts.map(p => p.includes('/') ? p : join(resolveBase(dir), p));
        }
        const base = resolveBase(dir);
        // Priority 1: manifest files
        for (const m of ['manifest.json', 'index.json', '_manifest.json']) {
            const url = join(base, m);
            const data = await fetchJSON(url);
            if (Array.isArray(data) && data.length) {
                return data.map(p => p.includes('/') ? p : join(base, p));
            }
        }
        // Priority 2: numeric sequence 1.json, 2.json, ... (stop at first miss, cap 50)
        const out = [];
        for (let i = 1; i <= 50; i++) {
            const url = join(base, `${i}.json`);
            const spec = await fetchJSON(url);
            if (!spec) break;
            out.push(url);
        }
        return out;
    }

    const files = await resolveFileList(chartDir, host);
    if (!files || files.length === 0) {
        console.error(`chart-exp: no specs found under ${chartDir}. Provide data-files or a manifest.json.`);
        host.insertAdjacentHTML('beforeend', `<div class="error">No charts found in <code>${chartDir}</code></div>`);
        return;
    }

    let idx = 0;
    // --- navigator helpers ---
    let ctrl = null;
    function bindNav() {
        if (!ctrl) return;
        const prevBtn = ctrl.prevButton;
        const nextBtn = ctrl.nextButton;
        if (prevBtn && !prevBtn.dataset.bound) {
            prevBtn.addEventListener('click', () => { if (idx > 0) renderAt(idx - 1); });
            prevBtn.dataset.bound = '1';
        }
        if (nextBtn && !nextBtn.dataset.bound) {
            nextBtn.addEventListener('click', () => { if (idx < files.length - 1) renderAt(idx + 1); });
            nextBtn.dataset.bound = '1';
        }
    }

    async function renderAt(i) {
        idx = i;
        const file = files[i];
        const spec = await fetchJSON(file);
        if (!spec) {
            chartHolder.innerHTML = `<div class="error">Failed to load ${file}</div>`;
            return;
        }
        // Make data URL work with our folder layout (match createChart behavior)
        if (spec && spec.data && typeof spec.data.url === 'string') {
            spec.data.url = spec.data.url.startsWith('../') ? spec.data.url : `../${spec.data.url}`;
        }
        // Reset inner chart node with a stable id
        chartHolder.innerHTML = '';
        const inner = document.createElement('div');
        inner.id = chartId;
        inner.className = 'd3chart-container';
        chartHolder.appendChild(inner);
        await renderChart(chartId, spec);
        // Attach/update the shared navigator overlay for this chartId
        ctrl = attachOpNavigator(chartId, { mount: 'footer' });
        bindNav();
        updateNavigatorStates(ctrl, idx, files.length);
    }

    await renderAt(0);
}

// --- Auto mount for data-component="chart-exp" placeholders ---
(function initChartExpAutobind(){
    const SELECTOR = '[data-component="chart-exp"]';

    const mountOne = async (host) => {
        if (!host || host.__chart_exp_mounted__) return;
        host.__chart_exp_mounted__ = true;
        const dir = host.getAttribute('data-chart') || host.dataset.chart || '';
        if (!dir) return;
        await createChartExp(dir);
    };

    const mountAll = (root = document) => {
        const nodes = root.querySelectorAll ? root.querySelectorAll(SELECTOR) : [];
        nodes.forEach(mountOne);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => mountAll());
    } else {
        mountAll();
    }

    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
                m.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    if (node.matches && node.matches(SELECTOR)) {
                        mountOne(node);
                    } else {
                        mountAll(node);
                    }
                });
            }
        }
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
})();