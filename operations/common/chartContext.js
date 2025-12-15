/**
 * Shared chart context helper used by bar/line operation modules.
 * Returns common attributes and selects the primary plot group.
 */

import { getPrimarySvgElement } from "../operationUtil.js";

function inferOrientation(svgNode, fallback) {
  const raw = (svgNode?.getAttribute("data-orientation")
    || svgNode?.getAttribute("data-orient")
    || svgNode?.getAttribute("data-layout")
    || "").toLowerCase();
  if (raw === "horizontal" || raw === "h") return "horizontal";
  if (raw === "vertical" || raw === "v") return "vertical";
  return fallback;
}

function selectPlotGroup(svg, preferPlotArea = true) {
  if (!svg || typeof svg.select !== "function") return d3.select(null);
  if (preferPlotArea) {
    const plot = svg.select(".plot-area");
    if (!plot.empty()) return plot;
  }
  const g = svg.select("g");
  return g.empty() ? svg.select(".plot-area") : g;
}

/**
 * Read chart-level attributes and convenience references.
 * Options:
 * - preferPlotArea: prefer `.plot-area` group when present.
 * - defaultOrientation: fallback orientation if none is declared.
 */
export function getChartContext(chartId, opts = {}) {
  const { preferPlotArea = true, defaultOrientation = undefined } = opts;
  const svgNode = getPrimarySvgElement(chartId);
  const svg = svgNode ? d3.select(svgNode) : d3.select(null);

  const orientation = inferOrientation(svgNode, defaultOrientation);
  const margins = {
    left: +(svgNode?.getAttribute("data-m-left") || 0),
    top: +(svgNode?.getAttribute("data-m-top") || 0)
  };
  const plot = {
    w: +(svgNode?.getAttribute("data-plot-w") || 0),
    h: +(svgNode?.getAttribute("data-plot-h") || 0)
  };

  const g = selectPlotGroup(svg, preferPlotArea);

  return {
    svg,
    g,
    margins,
    plot,
    orientation,
    xField: svgNode?.getAttribute("data-x-field"),
    yField: svgNode?.getAttribute("data-y-field"),
    colorField: svgNode?.getAttribute("data-color-field"),
    facetField: svgNode?.getAttribute("data-facet-field"),
    chartInfo: svgNode?.__chartInfo ?? null
  };
}

export function makeGetSvgAndSetup(opts = {}) {
  return (chartId) => getChartContext(chartId, opts);
}
