import {renderChart} from "../util/util.js";
import {executeAtomicOps} from "../router/router.js";
import {getVegaLiteSpec, getOperationSpec} from "./util.js"

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
    // n.type = shouldSubmit ? 'submit' : 'button';
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

export async function createChart(cId) {
    const chartId = `chart-${cId}`;

    const chartDiv = document.createElement('div');
    chartDiv.id = chartId;
    chartDiv.className = 'd3chart-container';
    chartDiv.style.margine = "0 auto";

    // Find the target container by data attributes
    const container = document.querySelector(
        `[data-component="chart"][data-chart="${cId}"]`
    );
    if (!container) {
        console.error(`Chart container for "${cId}" not found`);
        return;
    }
    // Insert chart div
    container.appendChild(chartDiv);

    const vegaLiteSpec = await getVegaLiteSpec(cId);
    vegaLiteSpec.data.url = "../" + vegaLiteSpec.data.url;
    await renderChart(chartId, vegaLiteSpec);

    const operationSpec = await getOperationSpec(cId);

    if (operationSpec) {
        for (let i = 0; i < 10; i ++) {
            await renderChart(chartId, vegaLiteSpec);
            await sleep(3000)
            await executeAtomicOps(chartId, vegaLiteSpec, operationSpec);
            await sleep(3000)
        }
    }
}

export function createLikertQuestion({ name, questionText, labels }) {
    const f = document.createElement('fieldset'); f.className = 'likert-group'; f.setAttribute('aria-label', questionText);
    const l = document.createElement('legend'); l.className = 'question'; l.textContent = questionText; f.append(l);
    const opts = document.createElement('div'); opts.className = 'options';
    labels.forEach((txt, i) => {
        const lab = document.createElement('label'); lab.className = 'likert-option';
        const inp = document.createElement('input'); inp.type = 'radio'; inp.name = name; inp.value = (i+1)+'';
        inp.id = `${name}-opt-${i+1}`;
        const dot = document.createElement('span'); dot.className = 'custom-radio';
        const txtSpan = document.createElement('span'); txtSpan.className = 'option-text'; txtSpan.textContent = txt;
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

    // legend
    const l = document.createElement('legend');
    l.className = 'question';
    l.textContent = questionText;
    f.append(l);

    // hidden input to store ordered values (CSV)
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = name;
    hidden.value = '';
    f.append(hidden);

    // state
    const order = []; // stores indices (0..n-1) in the order clicked

    // container for options (4 methods)
    const opts = document.createElement('div');
    opts.className = 'rank-options';

    // utility: update UI badges according to `order`
    const updateBadges = () => {
        // set rank numbers and classes
        const children = Array.from(opts.querySelectorAll('.rank-option'));
        children.forEach((btn) => {
            const i = Number(btn.dataset.index);
            const pos = order.indexOf(i);
            const badge = btn.querySelector('.rank-badge');
            if (pos === -1) {
                btn.classList.remove('has-rank');
                btn.setAttribute('aria-pressed', 'false');
                if (badge) badge.textContent = '';
            } else {
                btn.classList.add('has-rank');
                btn.setAttribute('aria-pressed', 'true');
                if (badge) badge.textContent = String(pos + 1);
            }
        });
        // update hidden input as CSV of option values
        const orderedValues = order.map(i => String(options[i]));
        hidden.value = orderedValues.join(',');
        // dispatch survey-response event for the framework to capture
        const responseEvent = new CustomEvent('survey-response', {
            detail: { name, value: orderedValues }
        });
        document.dispatchEvent(responseEvent);
    };

    // click handler toggles membership; removing a middle rank reindexes others
    const onToggle = (i) => {
        const pos = order.indexOf(i);
        if (pos === -1) {
            // add to end (limit to options.length)
            if (order.length < options.length) order.push(i);
        } else {
            // remove and reindex
            order.splice(pos, 1);
        }
        updateBadges();
    };

    // build buttons
    options.forEach((label, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rank-option';
        btn.dataset.index = String(i);
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', `${label} ranking toggle`);

        const badge = document.createElement('span');
        badge.className = 'rank-badge';
        badge.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.className = 'option-text';
        text.textContent = label;

        btn.append(badge, text);
        btn.addEventListener('click', () => onToggle(i));
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle(i);
            }
        });
        opts.append(btn);
    });

    f.append(opts);
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
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Expose manual hook (optional): window.mountRanking(root?)
    try { window.mountRanking = mountAll; } catch (_) {}
})();

export function createOpenEndedInput({ id, labelText, placeholder, multiline }) {
    const w = document.createElement('div'); w.className = 'text-input-wrapper';
    const l = document.createElement('label'); l.className = 'question'; l.setAttribute('for', id); l.textContent = labelText;
    const inp = multiline
        ? Object.assign(document.createElement('textarea'), { id, placeholder, rows: 3, className: 'text-input', style: 'resize:vertical;' })
        : Object.assign(document.createElement('input'), { type:'text', id, placeholder, className:'text-input' });
    inp.name = id;
    // Dispatch a survey-response event when the input changes
    inp.addEventListener('input', e => {
        const responseEvent = new CustomEvent('survey-response', {
            detail: { name: id, value: e.target.value }
        });
        document.dispatchEvent(responseEvent);
    });
    w.append(l, inp); return w;
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