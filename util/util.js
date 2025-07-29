import { ChartType } from "../object/chartType.js";
import {renderSimpleBarChart} from "../operations/bar/simple/simpleBarUtil.js";
import {renderStackedBarChart} from "../operations/bar/stacked/stackedBarUtil.js";
import {renderGroupedBarChart} from "../operations/bar/grouped/groupedBarUtil.js";
import {renderSimpleLineChart} from "../operations/line/simple/simpleLineUtil.js";

export function getChartType(spec) {
    const mark = spec.mark;
    const encoding = spec.encoding || {};
    const hasColor = !!encoding.color;
    const hasXOffset = !!encoding.xOffset;
    const hasFacet = !!(encoding.column || encoding.row || spec.facet || spec.repeat);

    if (mark === "bar") {
        if (hasFacet) {
            return ChartType.MULTIPLE_BAR;
        }
        if (hasColor) {
            const stackType = encoding.y?.stack || encoding.x?.stack || null;
            if (stackType !== "none") {
                return ChartType.STACKED_BAR;
            } else {
                return ChartType.GROUPED_BAR;
            }
        }
        return ChartType.SIMPLE_BAR;
    }

    else if (mark === "line") {
        return ChartType.SIMPLE_LINE;
    }

    else if (mark === "line" && hasColor) {
        return ChartType.MULTI_LINE;
    }

    return null;
}

export async function renderChart(chartId, spec) {
    const chartType = getChartType(spec);

    switch (chartType) {
        case ChartType.SIMPLE_BAR:
            await renderSimpleBarChart(chartId, spec);
            break
        case ChartType.STACKED_BAR:
            await renderStackedBarChart(chartId, spec);
            break;
        case ChartType.GROUPED_BAR:
            await renderGroupedBarChart(chartId, spec);
            break;
        case ChartType.MULTIPLE_BAR:
            await renderGroupedBarChart(chartId, spec);
            break;
        case ChartType.SIMPLE_LINE:
            await renderSimpleLineChart(chartId, spec);
            break;
        case ChartType.MULTI_LINE:
            await renderSimpleLineChart(chartId, spec);
            break;
    }
}