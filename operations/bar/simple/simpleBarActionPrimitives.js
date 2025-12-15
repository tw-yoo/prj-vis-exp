import * as Helpers from "../../animationHelpers.js";
import * as Templates from "../../operationTemplates.js";
import { DURATIONS } from "../../animationConfig.js";
import { clearAnnotations } from "../../common/annotations.js";
import {
  getMarkValue as readMarkValue,
  getMarkKey,
  selectMarks
} from "../../common/markAccessors.js";
import { OP_COLORS } from "../../../object/colorPalette.js";

const selectAllBars = (g) => selectMarks(g, "rect");

export function makeValueScaleFromData(ctx, data) {
  const { plot, orientation } = ctx;
  const numeric = (Array.isArray(data) ? data : [])
    .map(d => Number(d?.value))
    .filter(Number.isFinite);
  const maxVal = numeric.length ? d3.max(numeric) : 0;
  const domain = [0, maxVal || 0];
  return orientation === "horizontal"
    ? d3.scaleLinear().domain(domain).nice().range([0, plot.w])
    : d3.scaleLinear().domain(domain).nice().range([plot.h, 0]);
}

function barCenter(node, orientation, margins) {
  const x0 = +node.getAttribute("x"), y0 = +node.getAttribute("y");
  const w = +node.getAttribute("width"), h = +node.getAttribute("height");
  const valueAttr = Number(node.getAttribute("data-value"));
  const isNegative = Number.isFinite(valueAttr) && valueAttr < 0;
  if (orientation === "horizontal") {
    return isNegative
      ? { x: x0 - 6 + margins.left, y: y0 + h / 2 + margins.top }
      : { x: x0 + w + 6 + margins.left, y: y0 + h / 2 + margins.top };
  }
  return isNegative
    ? { x: x0 + w / 2 + margins.left, y: y0 + h + 14 + margins.top }
    : { x: x0 + w / 2 + margins.left, y: y0 - 6 + margins.top };
}

export async function highlightBarsByKeys(ctx, { keys, color }) {
  const { g } = ctx;
  const set = new Set((keys || []).map(String));
  const bars = selectAllBars(g).filter(function () {
    const k = getMarkKey(this, "");
    return set.has(String(k));
  });
  if (bars.empty()) return null;
  await Helpers.changeBarColor(bars, color, 250);
  return bars;
}

export async function labelBars(ctx, { bars, textFn, color }) {
  if (!bars || bars.empty()) return;
  const { svg, margins, orientation } = ctx;
  bars.each(function () {
    const val = readMarkValue(this);
    const { x, y } = barCenter(this, orientation, margins);
    const text = textFn ? textFn(val, this) : val;
    Helpers.addValueLabel(svg, x, y, text, color);
  });
}

export async function drawValueGuideline(ctx, { data, value, color }) {
  const { svg, margins, plot, orientation } = ctx;
  const valueScale = makeValueScaleFromData(ctx, data);
  const pos = valueScale(value);
  if (orientation === "horizontal") {
    await Helpers.drawVerticalGuideline(svg, pos, 0, plot.h, color, margins);
  } else {
    await Helpers.drawHorizontalGuideline(svg, pos, color, margins, plot.w);
  }
}

export async function drawCenterGuideline(ctx, { bars, valueScale, orientation, color }) {
  if (!bars || bars.empty()) return;
  const { svg, margins, plot } = ctx;
  bars.each(function () {
    const val = readMarkValue(this);
    const pos = valueScale(val);
    if (orientation === "horizontal") {
      Helpers.drawVerticalGuideline(svg, pos, 0, plot.h, color, margins);
    } else {
      Helpers.drawHorizontalGuideline(svg, pos, color, margins, plot.w);
    }
  });
}

export function resetAnnotations(ctx) {
  clearAnnotations(ctx.svg);
}

export async function sortBars(ctx, { sortedIds, orientation }) {
  const { g, plot } = ctx;
  const bars = selectAllBars(g);
  if (bars.empty()) return;

  if (orientation === "horizontal") {
    const yScale = d3.scaleBand().domain(sortedIds).range([0, plot.h]).padding(0.2);
    await Templates.repositionPattern({
      elements: bars,
      newXScale: yScale,
      orientation: "horizontal",
      g,
      duration: DURATIONS.REPOSITION
    });
    return;
  }

  const xScale = d3.scaleBand().domain(sortedIds).range([0, plot.w]).padding(0.2);
  await Templates.repositionPattern({
    elements: bars,
    newXScale: xScale,
    orientation: "vertical",
    g,
    duration: DURATIONS.REPOSITION
  });
}

export async function drawDiffBridge(ctx, { posA, posB, orientation, color, label }) {
  const { svg, margins, plot } = ctx;
  if (!Number.isFinite(posA) || !Number.isFinite(posB)) return;
  if (orientation === "vertical") {
    const minY = Math.min(posA, posB);
    const maxY = Math.max(posA, posB);
    const diffX = margins.left + plot.w - 8;
    svg.append("line").attr("class", "annotation diff-line")
      .attr("x1", diffX).attr("x2", diffX)
      .attr("y1", minY).attr("y2", maxY)
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5 5");
    if (label) {
      svg.append("text").attr("class", "annotation diff-label")
        .attr("x", diffX - 6)
        .attr("y", (minY + maxY) / 2)
        .attr("text-anchor", "end")
        .attr("font-size", 12)
        .attr("font-weight", "bold")
        .attr("fill", color)
        .attr("stroke", "white")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .text(label);
    }
  } else {
    const minX = Math.min(posA, posB);
    const maxX = Math.max(posA, posB);
    const diffY = margins.top + plot.h - 8;
    svg.append("line").attr("class", "annotation diff-line")
      .attr("x1", minX).attr("x2", maxX)
      .attr("y1", diffY).attr("y2", diffY)
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5 5");
    if (label) {
      svg.append("text").attr("class", "annotation diff-label")
        .attr("x", (minX + maxX) / 2)
        .attr("y", diffY + 16)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .attr("font-weight", "bold")
        .attr("fill", color)
        .attr("stroke", "white")
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .text(label);
    }
  }
}

export async function highlightFirstNBars(ctx, { n, orientation, color, showIndex = false }) {
  const { g, margins } = ctx;
  const bars = selectAllBars(g);
  if (bars.empty() || n <= 0) return { pickedKeys: [], pickedBars: null };
  const items = bars.nodes().map((node) => {
    const x = +node.getAttribute("x") || 0;
    const value = readMarkValue(node);
    return { node, selection: d3.select(node), x, value, key: getMarkKey(node, "") };
  });
  const ordered = orientation === "vertical"
    ? items.slice().sort((a, b) => a.x - b.x)
    : items.slice().sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const picked = ordered.slice(0, Math.min(n, ordered.length));
  for (let i = 0; i < picked.length; i++) {
    const { selection, node } = picked[i];
    await Helpers.changeBarColor(selection, color, DURATIONS.NTH_HIGHLIGHT);
    await Helpers.fadeElements(selection, 1, DURATIONS.NTH_HIGHLIGHT);
    if (showIndex) {
      const { x, y } = barCenter(node, orientation, margins);
      await Helpers.addValueLabel(ctx.svg, x, y, String(i + 1), color, { className: "annotation count-label", fontSize: 14 });
    }
  }
  const pickedKeys = picked.map(p => String(p.key));
  const pickedBars = bars.filter(function () { return pickedKeys.includes(getMarkKey(this, "")); });
  return { pickedKeys, pickedBars };
}

export async function dimBarsExcludingKeys(ctx, { keys, opacity = 0.2, duration = 250 }) {
  const { g } = ctx;
  const set = new Set((keys || []).map(String));
  const bars = selectAllBars(g);
  if (bars.empty()) return;
  const dimTargets = bars.filter(function () {
    return !set.has(getMarkKey(this, ""));
  });
  if (!dimTargets.empty()) {
    await Helpers.fadeElements(dimTargets, opacity, duration);
  }
}

export async function dimAllBars(ctx, { opacity = 0.3, duration = 200 } = {}) {
  const bars = selectAllBars(ctx.g);
  if (bars.empty()) return;
  await Helpers.fadeElements(bars, opacity, duration);
}

export function selectBarsByKeys(ctx, keys) {
  const set = new Set((keys || []).map(String));
  return selectAllBars(ctx.g).filter(function () {
    return set.has(getMarkKey(this, ""));
  });
}

export async function addCenterValueLabel(ctx, { value, text, color, data }) {
  const { svg, margins, plot, orientation } = ctx;
  const valueScale = makeValueScaleFromData(ctx, data || []);
  const pos = valueScale(value);
  const x = orientation === "vertical"
    ? margins.left + plot.w / 2
    : margins.left + pos;
  const y = orientation === "vertical"
    ? margins.top + pos - 8
    : margins.top + plot.h / 2;
  await Helpers.addValueLabel(svg, x, y, text, color);
}

// ----- Sum stack animation -----
export async function runSumStackAnimation(ctx, totalSum) {
  const { svg, g, plot, margins } = ctx;
  const bars = g.selectAll("rect");
  if (bars.empty()) return;

  const newYScale = d3.scaleLinear().domain([0, totalSum]).nice().range([plot.h, 0]);
  const yAxis = svg.select(".y-axis");
  if (!yAxis.empty()) {
    await yAxis.transition().duration(DURATIONS.STACK).call(d3.axisLeft(newYScale)).end().catch(() => {});
  }

  const barWidth = +bars.attr("width") || 0;
  const targetX = plot.w / 2 - barWidth / 2;
  let runningTotal = 0;
  const stackPromises = [];

  bars.each(function() {
    const rect = d3.select(this);
    const raw = readMarkValue(this);
    const value = Number.isFinite(+raw) ? +raw : 0;
    const t = rect.transition().duration(DURATIONS.STACK)
      .attr("x", targetX)
      .attr("y", newYScale(runningTotal + value))
      .attr("height", plot.h - newYScale(value))
      .end();
    stackPromises.push(t);
    runningTotal += value;
  });

  await Promise.all(stackPromises);

  await Helpers.drawHorizontalGuideline(
    svg,
    newYScale(totalSum),
    "#f59e0b",
    margins,
    plot.w
  );
  await Helpers.addValueLabel(
    svg,
    margins.left + plot.w / 2,
    newYScale(totalSum) - 6,
    `Sum: ${totalSum.toLocaleString()}`,
    "#f59e0b"
  );
}

// ----- Lag diff actions -----
export function computeLagDiffDomain(values) {
  const finite = values.filter(Number.isFinite);
  const minVal = d3.min(finite);
  const maxVal = d3.max(finite);
  let domainMin = Math.min(0, Number.isFinite(minVal) ? minVal : 0);
  let domainMax = Math.max(0, Number.isFinite(maxVal) ? maxVal : 0);
  if (domainMin === domainMax) {
    domainMax = domainMin === 0 ? 1 : domainMin + Math.abs(domainMin) * 0.5;
  }
  if (!Number.isFinite(domainMin)) domainMin = 0;
  if (!Number.isFinite(domainMax)) domainMax = 1;
  if (domainMax <= domainMin) domainMax = domainMin + 1;
  return [domainMin, domainMax];
}

export function formatLagDiffValue(value) {
  if (!Number.isFinite(value) || value === 0) return "0";
  const magnitude = Math.abs(value);
  const base = magnitude.toLocaleString();
  return value > 0 ? `+${base}` : `-${base}`;
}

export function formatLagDiffLabel(datum) {
  const head = datum.prevTarget ? `${datum.prevTarget} -> ${datum.target}` : datum.target;
  return `${head}: ${formatLagDiffValue(datum.value)}`;
}

export async function renderLagDiffBars(ctx, diffData) {
  const { g, plot, orientation } = ctx;
  const categories = diffData.map(d => String(d.target));
  const values = diffData.map(d => Number(d.value) || 0);
  const [domainMin, domainMax] = computeLagDiffDomain(values);

  if (orientation === "horizontal") {
    const yScale = d3.scaleBand().domain(categories).range([0, plot.h]).padding(0.2);
    const xScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([0, plot.w]);
    const zeroX = xScale(0);

    const bars = g.selectAll("rect").classed("main-bar", true).data(diffData, d => d.target);
    const exiting = bars.exit();
    if (!exiting.empty()) {
      await exiting.transition().duration(200).attr("opacity", 0).remove().end().catch(() => {});
    }

    const entered = bars.enter().append("rect")
      .attr("class", "main-bar")
      .attr("y", d => yScale(d.target))
      .attr("height", yScale.bandwidth())
      .attr("x", zeroX)
      .attr("width", 0)
      .attr("opacity", 0.05);

    await entered.merge(bars)
      .attr("data-target", d => d.target)
      .attr("data-id", d => d.id ?? d.target)
      .attr("data-value", d => d.value)
      .transition().duration(500)
      .attr("y", d => yScale(d.target))
      .attr("height", yScale.bandwidth())
      .attr("x", d => (d.value >= 0 ? zeroX : xScale(d.value)))
      .attr("width", d => {
        const span = Math.abs(xScale(d.value) - zeroX);
        return span < 2 ? 2 : span;
      })
      .attr("fill", d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
      .attr("opacity", 0.95)
      .end().catch(() => {});

    const xAxis = g.select(".x-axis");
    if (!xAxis.empty()) {
      xAxis.call(d3.axisBottom(xScale).ticks(5));
    }
    const yAxis = g.select(".y-axis");
    if (!yAxis.empty()) {
      yAxis.call(d3.axisLeft(yScale));
    }

    return { xScale, yScale, zeroPos: zeroX };
  }

  const xScale = d3.scaleBand().domain(categories).range([0, plot.w]).padding(0.2);
  const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plot.h, 0]);
  const zeroY = yScale(0);

  const bars = g.selectAll("rect").classed("main-bar", true).data(diffData, d => d.target);
  const exiting = bars.exit();
  if (!exiting.empty()) {
    await exiting.transition().duration(200).attr("opacity", 0).attr("height", 0).remove().end().catch(() => {});
  }

  const entered = bars.enter().append("rect")
    .attr("class", "main-bar")
    .attr("x", d => xScale(d.target))
    .attr("width", xScale.bandwidth())
    .attr("y", zeroY)
    .attr("height", 0)
    .attr("opacity", 0.05);

  await entered.merge(bars)
    .attr("data-target", d => d.target)
    .attr("data-id", d => d.id ?? d.target)
    .attr("data-value", d => d.value)
    .transition().duration(500)
    .attr("x", d => xScale(d.target))
    .attr("width", xScale.bandwidth())
    .attr("y", d => (d.value >= 0 ? yScale(d.value) : zeroY))
    .attr("height", d => {
      const span = Math.abs(yScale(d.value) - zeroY);
      return span < 2 ? 2 : span;
    })
    .attr("fill", d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
    .attr("opacity", 0.95)
    .end().catch(() => {});

  const xAxis = g.select(".x-axis");
  if (!xAxis.empty()) {
    xAxis.call(d3.axisBottom(xScale));
    xAxis.selectAll("text").attr("transform", "rotate(-45)").style("text-anchor", "end");
  }
  const yAxis = g.select(".y-axis");
  if (!yAxis.empty()) {
    yAxis.call(d3.axisLeft(yScale).ticks(5));
  }

  return { xScale, yScale, zeroPos: zeroY };
}

export async function drawLagDiffZeroLine(ctx, zeroPos) {
  const { svg, margins, plot, orientation } = ctx;
  svg.selectAll(".lagdiff-zero-line").remove();
  if (!Number.isFinite(zeroPos)) return;

  if (orientation === "horizontal") {
    const x = margins.left + zeroPos;
    svg.append("line")
      .attr("class", "annotation lagdiff-zero-line")
      .attr("x1", x).attr("x2", x)
      .attr("y1", margins.top)
      .attr("y2", margins.top + plot.h)
      .attr("stroke", "#666")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 4");
    return;
  }

  const y = margins.top + zeroPos;
  svg.append("line")
    .attr("class", "annotation lagdiff-zero-line")
    .attr("x1", margins.left)
    .attr("x2", margins.left + plot.w)
    .attr("y1", y)
    .attr("y2", y)
    .attr("stroke", "#666")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4 4");
}

export async function labelLagDiffBars(ctx, diffData, scales) {
  if (!scales || !scales.xScale || !scales.yScale) return;
  const { svg, margins, orientation } = ctx;
  const labels = svg.selectAll(".lagdiff-label").data(diffData, d => d.id || d.target);
  labels.exit().remove();

  const addLabel = (selection) => {
    selection.enter().append("text").attr("class", "annotation lagdiff-label")
      .merge(selection)
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .attr("stroke", "white")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .attr("fill", d => d.value >= 0 ? OP_COLORS.LAG_DIFF_POS : OP_COLORS.LAG_DIFF_NEG)
      .text(formatLagDiffLabel);
  };

  if (orientation === "horizontal") {
    addLabel(labels)
      .attr("text-anchor", d => d.value >= 0 ? "start" : "end")
      .attr("x", d => {
        const valueX = scales.xScale(d.value);
        const offset = 10;
        return margins.left + valueX + (d.value >= 0 ? offset : -offset);
      })
      .attr("y", d => margins.top + scales.yScale(d.target) + scales.yScale.bandwidth() / 2 + 4);
    return;
  }

  addLabel(labels)
    .attr("text-anchor", "middle")
    .attr("x", d => margins.left + scales.xScale(d.target) + scales.xScale.bandwidth() / 2)
    .attr("y", d => {
      const base = d.value >= 0 ? scales.yScale(d.value) - 8 : Math.max(scales.yScale(d.value), scales.yScale(0)) + 16;
      return margins.top + base;
    });
}

export async function summarizeLagDiff(ctx, diffData) {
  const { svg, margins } = ctx;
  svg.selectAll(".lagdiff-summary").remove();
  const positiveTotal = diffData
    .map(d => Number(d.value))
    .filter(v => Number.isFinite(v) && v > 0)
    .reduce((sum, v) => sum + v, 0);

  svg.append("text").attr("class", "annotation lagdiff-summary")
    .attr("x", margins.left + 4)
    .attr("y", margins.top - 12)
    .attr("font-size", 14)
    .attr("font-weight", "bold")
    .attr("fill", OP_COLORS.SUM)
    .text(
      Number.isFinite(positiveTotal)
        ? `lagDiff computed ${diffData.length} changes (sum of positives = ${positiveTotal.toLocaleString()})`
        : `lagDiff computed ${diffData.length} changes`
    );
}
