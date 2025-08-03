import {renderChart} from "../../util/util.js";
import {executeAtomicOps} from "../../router/router.js";

async function getVegaLiteSpec(questionName) {
    let vegaLiteSpec;

    await fetch(`specs/charts/ch_${questionName}.json`)
        .then((r) => vegaLiteSpec = r.json())

    return vegaLiteSpec;
}

async function getOperationSpec(questionName) {
    try {
        const res = await fetch(`specs/operations/op_${questionName}.json`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.warn("Could not load operation spec:", e);
        return null;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function renderQuestionChart(htmlElement, questionName) {
    const chartId = `chart-${questionName}`;

    const chartDiv = document.createElement("div");
    chartDiv.className = "d3chart-container";
    chartDiv.id = chartId;
    chartDiv.style.margin = "0 auto";

    // Find insertion point in question body
    const bodyEl =
        htmlElement.querySelector(".sd-question-body")
        || htmlElement.querySelector(".sd-text__content")
        || htmlElement;
    bodyEl.prepend(chartDiv);

    const vegaLiteSpec = await getVegaLiteSpec(questionName);
    vegaLiteSpec.data.url = "../" + vegaLiteSpec.data.url;
    console.log(vegaLiteSpec);
    await renderChart(chartId, vegaLiteSpec);

    const operationSpec = await getOperationSpec(questionName);

    if (operationSpec) {
        for (let i = 0; i < 10; i ++) {
            await renderChart(chartId, vegaLiteSpec);
            await sleep(3000)
            await executeAtomicOps(chartId, vegaLiteSpec, operationSpec);
            await sleep(3000)
        }
    }
}