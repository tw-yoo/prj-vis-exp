import {validateAtomicOpsSpec} from "./routerUtil.js";
import {getChartType, renderChart} from "../util/util.js";
import {ChartType} from "../object/chartType.js";
import {runSimpleBarOps} from "../operations/bar/simple/simpleBarUtil.js";
import {runStackedBarOps} from "../operations/bar/stacked/stackedBarUtil.js";
import {runGroupedBarOps} from "../operations/bar/grouped/groupedBarUtil.js";
import {runSimpleLineOps} from "../operations/line/simple/simpleLineUtil.js";
import {runMultipleLineOps} from "../operations/line/multiple/multiLineUtil.js";

// ---- helpers for handling 'last' ----
function splitOpsByLast(opsSpec) {
    // opsSpec is expected to have shape { ops: [...] } or be an array itself
    const opsArray = Array.isArray(opsSpec) ? opsSpec : (Array.isArray(opsSpec.ops) ? opsSpec.ops : []);
    if (!opsArray.length) return { pre: null, last: null };
    const lastIdx = opsArray.map(o => o && o.op).lastIndexOf('last');
    if (lastIdx === -1) return { pre: null, last: null };
    const preOps = opsArray.slice(0, lastIdx);            // run with original chart
    const lastOp = opsArray[lastIdx];                     // force to simple bar
    return {
        pre: (Array.isArray(opsSpec) ? preOps : { ...opsSpec, ops: preOps }),
        last: (Array.isArray(opsSpec) ? [lastOp] : { ...opsSpec, ops: [lastOp] })
    };
}

function toSimpleBarSpec(vlSpec) {
    // Heuristic conversion of any bar/line/facet spec into a simple bar spec that reuses the same data
    const enc = vlSpec.encoding || {};
    const dataSpec = vlSpec.data ? JSON.parse(JSON.stringify(vlSpec.data)) : {};
    const xField = (enc.column && enc.column.field)
                 || (enc.x && enc.x.field)
                 || 'target';
    const yField = (enc.y && enc.y.field) || 'value';
    const colorField = (enc.color && enc.color.field) ? enc.color.field : null;
    const axisTitle = (enc.y && enc.y.axis && enc.y.axis.title) ? enc.y.axis.title : '';

    const base = {
        $schema: vlSpec.$schema || 'https://vega.github.io/schema/vega-lite/v3.json',
        description: 'Auto-generated simple bar for last op',
        data: dataSpec,
        mark: 'bar',
        encoding: {
            x: { field: xField, type: 'ordinal', axis: { title: '' } },
            y: { aggregate: 'sum', field: yField, type: 'quantitative', axis: { title: axisTitle, grid: false } }
        },
        config: vlSpec.config || {}
    };
    if (colorField) base.encoding.color = { field: colorField, type: 'nominal', scale: enc.color && enc.color.scale ? enc.color.scale : undefined };
    return base;
}

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

    const validationError = validateAtomicOpsSpec(opsSpec);
    if (validationError) {
        console.error('Atomic-Ops Spec Error:', validationError);
        return;
    }

    const chartType = getChartType(vlSpec);

    const { pre, last } = splitOpsByLast(opsSpec);

    if (!last) {
        // No 'last' → original behavior
        switch (chartType) {
            case ChartType.SIMPLE_BAR:
                await runSimpleBarOps(chartId, vlSpec, opsSpec, textSpec);
                break;
            case ChartType.STACKED_BAR:
                await runStackedBarOps(chartId, vlSpec, opsSpec);
                break;
            case ChartType.GROUPED_BAR:
                await runGroupedBarOps(chartId, vlSpec, opsSpec);
                break;
            case ChartType.MULTIPLE_BAR:
                await runGroupedBarOps(chartId, vlSpec, opsSpec);
                break;
            case ChartType.SIMPLE_LINE:
                await runSimpleLineOps(chartId, vlSpec, opsSpec);
                break;
            case ChartType.MULTI_LINE:
                await runMultipleLineOps(chartId, vlSpec, opsSpec);
                break;
        }
        return;
    }

    // There is a 'last' op → two-phase execution
    // Phase 1: run everything before 'last' on the original chart
    if (pre && (Array.isArray(pre.ops) ? pre.ops.length : Array.isArray(pre) ? pre.length : false)) {
        switch (chartType) {
            case ChartType.SIMPLE_BAR:
                await runSimpleBarOps(chartId, vlSpec, pre, textSpec);
                break;
            case ChartType.STACKED_BAR:
                await runStackedBarOps(chartId, vlSpec, pre);
                break;
            case ChartType.GROUPED_BAR:
                await runGroupedBarOps(chartId, vlSpec, pre);
                break;
            case ChartType.MULTIPLE_BAR:
                await runGroupedBarOps(chartId, vlSpec, pre);
                break;
            case ChartType.SIMPLE_LINE:
                await runSimpleLineOps(chartId, vlSpec, pre);
                break;
            case ChartType.MULTI_LINE:
                await runMultipleLineOps(chartId, vlSpec, pre);
                break;
        }
    }

    // Phase 2: force a simple bar view for the 'last' op and run it under simple-bar ops
    const simpleSpec = toSimpleBarSpec(vlSpec);
    await renderChart(chartId, simpleSpec);
    await runSimpleBarOps(chartId, simpleSpec, last, textSpec);
}
