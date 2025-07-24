import { ChartType } from "../object/chartType.js";
import {renderSimpleBarChart} from "../operations/bar/simple/simpleBarUtil.js";

export function getChartType(spec) {
    const mark = spec.mark;
    const encoding = spec.encoding || {};
    const hasColor = !!encoding.color;
    const hasXOffset = !!encoding.xOffset;
    const hasFacet = spec.facet || spec.repeat || spec.columns || spec.rows;

    // Check for multiple bar chart via faceting or repeating
    if (mark === "bar" && hasFacet) {
        return ChartType.MULTIPLE_BAR;
    }

    // Grouped bar chart: bar mark + xOffset or column/facet with color
    else if (mark === "bar" && hasXOffset) {
        return ChartType.GROUPED_BAR;
    }

    // Stacked bar chart: bar mark + color + (stack explicitly set or implied)
    else if (
        mark === "bar" &&
        hasColor &&
        encoding.y?.stack !== "none"
    ) {
        return ChartType.STACKED_BAR;
    }

    // Simple bar chart: bar mark + no stacking
    else if (mark === "bar") {
        return ChartType.SIMPLE_BAR;
    }

    // Simple line chart: line mark + no color
    else if (mark === "line") {
        return ChartType.SIMPLE_LINE;
    }

    // Multi-line chart: line mark + color
    else if (mark === "line" && hasColor) {
        return ChartType.MULTI_LINE;
    }

    return null;
}

export function renderChart(chartId, spec) {
    const chartType = getChartType(spec);

    switch (chartType) {
        case ChartType.SIMPLE_BAR:
            renderSimpleBarChart(chartId, spec);
            break
    }
}