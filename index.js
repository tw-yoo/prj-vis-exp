import { executeAtomicOps } from './router/router.js';
import { updateAnswerFromBackend } from "./util/api.js";
import {renderChart} from "./util/util.js";

var vlSpec = '';

function validateVLSpec(text) {
    try {
        JSON.parse(text);
        return null;
    } catch (e) {
        return e.message;
    }
}

function validateOpsSpec(text) {
    let obj;
    try {
        obj = JSON.parse(text);
    } catch (e) {
        return e.message;
    }
    if (!Array.isArray(obj.ops)) {
        return "'ops' must be an array";
    }
    for (let i = 0; i < obj.ops.length; i++) {
        if (!obj.ops[i].op) {
            return `Operation at index ${i} is missing 'op' property`;
        }
    }
    return null;
}

document.getElementById('render-chart-button').addEventListener('click', async () => {
    const vlText  = vlEditor.getValue();
    const vlSpec = JSON.parse(vlText);
    await renderChart("chart", vlSpec);
});

document.getElementById('answer-button').addEventListener('click', async () => {
    const vlText  = vlEditor.getValue();
    const questionText = questionEditor.getValue();
    await updateAnswerFromBackend(vlText, questionText);
});

document.getElementById('run-ops-button').addEventListener('click', async () => {
    const vlText  = vlEditor.getValue();
    const vlSpec = JSON.parse(vlText);
    await renderChart("chart", vlSpec);
    const opsText = opsEditor.getValue();
    const opsError = validateOpsSpec(opsText);
    document.getElementById('ops-error').innerText = '';
    if (opsError) {
        document.getElementById('ops-error').innerText = 'Atomic-Ops Spec Error: ' + opsError;
        return;
    }
    const opsSpec = JSON.parse(opsText);
    await executeAtomicOps(vlSpec, opsSpec);
});