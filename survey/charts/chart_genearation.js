import {renderChart} from "../../util/util.js";
import {executeAtomicOps} from "../../router/router.js";

async function getVegaLiteSpec(questionName) {
    let vegaLiteSpec;

    await fetch(`specs/charts/ch_${questionName}.json`)
        .then((r) => vegaLiteSpec = r.json())

    return vegaLiteSpec;
}

async function getOperationSpec(questionName) {
    let operationSpec;

    await fetch(`specs/operations/op_${questionName}.json`)
        .then((r) => operationSpec = r.json())

    return operationSpec;
}


export async function renderQuestionChartAndButton(
    htmlElement,
    questionName,
) {
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
    await renderChart(chartId, vegaLiteSpec);

    const operationSpec = await getOperationSpec(questionName);

    // Add button below chart
    const btn = document.createElement("button");

    btn.style.width = "80%";
    btn.style.display = "block";
    btn.style.margin = "5px auto";
    btn.style.padding = "5px 0";
    btn.textContent = "Run";

    btn.addEventListener("click", () => {executeAtomicOps(chartId, vegaLiteSpec, operationSpec)});
    chartDiv.after(btn);
}