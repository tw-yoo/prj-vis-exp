// index.js
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

// export async function renderChart(vlSpec) {
//
//     document.getElementById('vl-error').innerText = '';
//     document.getElementById('ops-error').innerText = '';
//
//     const vlText  = vlEditor.getValue();
//     const opsText = opsEditor.getValue();
//
//     const vlError = validateVLSpec(vlText);
//     if (vlError) {
//       document.getElementById('vl-error').innerText = 'Vega-Lite Spec Error: ' + vlError;
//       return;
//     }
//     const opsError = validateOpsSpec(opsText);
//     if (opsError) {
//       document.getElementById('ops-error').innerText = 'Atomic-Ops Spec Error: ' + opsError;
//       return;
//     }
//
//     if (vlSpec.data && typeof vlSpec.data === 'object') {
//         vlSpec.data = {
//             ...vlSpec.data,
//             name: 'table'
//         };
//     }
//
//     let vegaSpec;
//     try {
//         vegaSpec = vegaLite.compile(vlSpec).spec;
//     } catch (err) {
//         document.getElementById('vl-error').innerText = 'Error compiling Vega-Lite spec:\n' + err.message;
//         return;
//     }
//
//     const chartDiv = document.getElementById('chart');
//     chartDiv.innerHTML = '';
//
//     window.view = new vega.View(vega.parse(vegaSpec), {
//         renderer: 'svg',
//         container: chartDiv,
//         hover: true
//     });
//
//     try {
//         await view.runAsync();
//     } catch (err) {
//         console.error(err);
//         document.getElementById('vl-error').innerText = 'Error rendering chart:\n' + err.message;
//     }
// }

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

// Stub for future atomic-ops implementation
function applyAtomicOps(view, opsSpec) {
    console.log('Applying atomic operations:', opsSpec);
    // TODO: implement each operation using view.change() or view.signal()
}