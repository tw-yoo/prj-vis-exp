import {validateAtomicOpsSpec} from "./routerUtil.js";
import {getChartType, renderChart} from "../util/util.js";
import {ChartType} from "../object/chartType.js";
import {runSimpleBarOps} from "../operations/bar/simple/simpleBarUtil.js";
import {runStackedBarOps} from "../operations/bar/stacked/stackedBarUtil.js";
import {runGroupedBarOps} from "../operations/bar/grouped/groupedBarUtil.js";
import {runSimpleLineOps} from "../operations/line/simple/simpleLineUtil.js";
import {runMultipleLineOps} from "../operations/line/multiple/multiLineUtil.js";

export async function executeAtomicOps(chartId, vlSpec, opsSpecWithText) {

    await renderChart(chartId, vlSpec);

    let opsSpec = {};
    let textSpec = {};
    if (Object.keys(opsSpecWithText).includes("text")) {
        textSpec = opsSpecWithText.text;
        delete opsSpecWithText.text;
        opsSpec = opsSpecWithText;
    } else {
        opsSpec = opsSpecWithText;
    }

    if (validateAtomicOpsSpec(opsSpec)) {
        console.error('Atomic-Ops Spec Error:', error);
        return;
    }

    const chartType = getChartType(vlSpec);

    switch (chartType) {
        case ChartType.SIMPLE_BAR:
            await runSimpleBarOps(chartId, vlSpec, opsSpec, textSpec);
            break
        case ChartType.STACKED_BAR:
            await runStackedBarOps(chartId, vlSpec, opsSpec);
            break
        case ChartType.GROUPED_BAR:
            await runGroupedBarOps(chartId, vlSpec, opsSpec);
            break
        case ChartType.MULTIPLE_BAR:
            await runGroupedBarOps(chartId, vlSpec, opsSpec);
            break
        case ChartType.SIMPLE_LINE:
            await runSimpleLineOps(chartId, vlSpec, opsSpec);
            break
        case ChartType.MULTI_LINE:
            await runMultipleLineOps(chartId, vlSpec, opsSpec);
            break;
    }
}
