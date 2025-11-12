import { executeAtomicOps } from './router/router.js';
import { updateAnswerFromGemini } from "./util/api.js";
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

const answerButton = document.getElementById('answer-button');
const runOpsButton = document.getElementById('run-ops-button');

const setStatus = (el, text, isError = false) => {
    if (!el) return;
    el.textContent = text || '';
    if (isError) el.classList.add('error');
    else el.classList.remove('error');
};

const setAnswerStatus = (text, isError = false) => {
    setStatus(document.getElementById('answer-status'), text, isError);
};

const setOpsStatus = (text, isError = false) => {
    setStatus(document.getElementById('ops-status'), text, isError);
};

document.getElementById('render-chart-button').addEventListener('click', async () => {
    const vlText  = vlEditor.getValue();
    const vlSpec = JSON.parse(vlText);
    await renderChart("chart", vlSpec);
});

answerButton.addEventListener('click', async () => {
    const vlText  = vlEditor.getValue();
    const vlSpec = JSON.parse(vlText);
    const questionText = questionEditor.getValue();
    try {
        await updateAnswerFromGemini(vlSpec, questionText, {
            onAnswerStart: () => {
                setAnswerStatus('⏳ Generating answer…');
                setOpsStatus('');
                answerButton.disabled = true;
            },
            onAnswerEnd: ({ success }) => {
                if (success) {
                    setAnswerStatus('');
                } else {
                    setAnswerStatus('⚠ Failed to generate answer', true);
                }
                answerButton.disabled = false;
            },
            onOpsStart: () => {
                setOpsStatus('⏳ Generating ChartOps spec…');
            },
            onOpsEnd: ({ success }) => {
                if (success) {
                    setOpsStatus('');
                } else {
                    setOpsStatus('⚠ Failed to generate ChartOps spec', true);
                }
            }
        });
    } catch (error) {
        console.error(error);
        const answerEl = document.getElementById('explanation');
        if (answerEl) {
            answerEl.value = 'Unable to generate answer.\nSee console for details.';
        }
    }
});

runOpsButton.addEventListener('click', async () => {
    const vlText  = vlEditor.getValue();
    const vlSpec = JSON.parse(vlText);
    // await renderChart("chart", vlSpec);
    const opsText = opsEditor.getValue();
    const opsError = validateOpsSpec(opsText);
    document.getElementById('ops-error').innerText = '';
    if (opsError) {
        document.getElementById('ops-error').innerText = 'Atomic-Ops Spec Error: ' + opsError;
        return;
    }
    const opsSpec = JSON.parse(opsText);
    await executeAtomicOps("chart", vlSpec, opsSpec);
});
