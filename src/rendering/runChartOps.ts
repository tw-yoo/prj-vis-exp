import {ChartType, getChartType, renderVegaLiteChart, type VegaLiteSpec} from "../utils/chartRenderer.ts";
import {runSimpleBarOps} from "../opsRunner/simpleBarOps.ts";
import {runStackedBarOps} from "../opsRunner/stackedBarOps.ts";
import {runGroupedBarOps} from "../opsRunner/groupedBarOps.ts";
import {runSimpleLineOps} from "../opsRunner/simpleLineOps.ts";
import {runMultipleLineOps} from "../opsRunner/multipleLineOps.ts";
import {normalizeSpec} from "./renderChart.ts";

export async function runChartOps(container: HTMLElement, spec: VegaLiteSpec, opsSpec: any) {

    const chartType = getChartType(spec)
    const normalized = normalizeSpec(spec)

    switch (chartType) {
        case ChartType.SIMPLE_BAR:
            return runSimpleBarOps(container, normalized as any, opsSpec)
        case ChartType.STACKED_BAR:
            return runStackedBarOps(container, normalized as any, opsSpec)
        case ChartType.GROUPED_BAR:
            return runGroupedBarOps(container, normalized as any, opsSpec)
        case ChartType.SIMPLE_LINE:
            return runSimpleLineOps(container, normalized as any, opsSpec)
        case ChartType.MULTI_LINE:
            return runMultipleLineOps(container, normalized as any, opsSpec)
        default:
            console.warn('runChartOps: unknown chart type, running plain render then no-op ops')
            await renderVegaLiteChart(container, normalized)
            return normalized
    }
}