import {validateAtomicOpsSpec} from "./routerUtil.js";
import {getChartType} from "../util/util.js";
import {ChartType} from "../object/chartType.js";
import {runSimpleBarOps} from "../operations/bar/simple/simpleBarUtil.js";
import {runStackedBarOps} from "../operations/bar/stacked/stackedBarUtil.js";
//import {runStackedBarOps} from "../operations/bar/stacked/stackedBarUtil.js";
import {runGroupedBarOps} from "../operations/bar/grouped/groupedBarUtil.js";
import {runSimpleLineOps} from "../operations/line/simple/simpleLineUtil.js";
import {runGroupedBarOps} from "../operations/bar/grouped/groupedBarUtil.js";
import {runSimpleLineOps} from "../operations/line/simple/simpleLineUtil.js";

export async function executeAtomicOps(vlSpec, opsSpec) {
    if (validateAtomicOpsSpec(opsSpec)) {
        console.error('Atomic-Ops Spec Error:', error);
        return;
    }

    const chartType = getChartType(vlSpec);

    switch (chartType) {
        case ChartType.SIMPLE_BAR:
            await runSimpleBarOps("chart", opsSpec);
            break
        case ChartType.STACKED_BAR:
            await runStackedBarOps(opsSpec);
            break
        case ChartType.GROUPED_BAR:
            await runGroupedBarOps(opsSpec);
            break
        case ChartType.MULTIPLE_BAR:
            await runGroupedBarOps(opsSpec);
            break
        case ChartType.SIMPLE_LINE:
            await runSimpleLineOps(opsSpec);
            break
        case ChartType.MULTI_LINE:
            await runSimpleLineOps(opsSpec);
            break
    }
}
