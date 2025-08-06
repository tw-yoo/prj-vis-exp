import {renderChart} from "../util/util.js";
import {executeAtomicOps} from "../router/router.js";
import {getVegaLiteSpec, getOperationSpec} from "./util.js"

export function createNavButtons({ prevId, nextId, onPrev, onNext, isLastPage = false, isAvailable = true, hidePrev = false }) {
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
    n.addEventListener('click', onNext);
    if (!hidePrev) {
        p = document.createElement('button');
        p.id = prevId;
        p.className = 'button prev-btn';
        p.textContent = 'Previous';
        p.disabled = true;
        p.addEventListener('click', onPrev);
        w.append(p, n);
    } else {
        w.append(n);
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

export function createLikertQuestion({ name, questionText, labels, baseId }) {
    const f = document.createElement('fieldset'); f.className = 'likert-group'; f.setAttribute('aria-label', questionText);
    const l = document.createElement('legend'); l.className = 'question'; l.textContent = questionText; f.append(l);
    const opts = document.createElement('div'); opts.className = 'options';
    labels.forEach((txt, i) => {
        const lab = document.createElement('label'); lab.className = 'likert-option';
        const inp = document.createElement('input'); inp.type = 'radio'; inp.name = name; inp.value = (i+1)+'';
        inp.id = `${baseId}-opt-${i+1}`;
        const dot = document.createElement('span'); dot.className = 'custom-radio';
        const txtSpan = document.createElement('span'); txtSpan.className = 'option-text'; txtSpan.textContent = txt;
        lab.append(inp, dot, txtSpan);
        opts.append(lab);
    });
    f.append(opts);
    return f;
}

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