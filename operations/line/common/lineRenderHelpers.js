/**
 * Reusable rendering helpers for line-chart operations.
 * Encapsulates crosshair, point highlight, and label drawing with
 * the same timings/styles currently used in simple line ops.
 */

const DEFAULT_DURATIONS = {
  crosshair: 400,
  point: 400,
  label: 300
};

export async function drawCrosshair(g, cx, cy, plot, color, duration = DEFAULT_DURATIONS.crosshair) {
  const hLine = g.append("line").attr("class", "annotation")
    .attr("x1", 0).attr("y1", cy)
    .attr("x2", 0).attr("y2", cy)
    .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "4 4");

  const vLine = g.append("line").attr("class", "annotation")
    .attr("x1", cx).attr("y1", plot.h)
    .attr("x2", cx).attr("y2", plot.h)
    .attr("stroke", color).attr("stroke-width", 2).attr("stroke-dasharray", "4 4");

  await Promise.all([
    hLine.transition().duration(duration).attr("x2", cx).end().catch(() => {}),
    vLine.transition().duration(duration).attr("y2", cy).end().catch(() => {})
  ]);
}

export async function highlightPoint(selection, color, opts = {}) {
  if (!selection || selection.empty()) return;
  const {
    radius = 10,
    stroke = "white",
    strokeWidth = 3,
    duration = DEFAULT_DURATIONS.point,
    delay = 0
  } = opts;

  await selection.transition().duration(duration)
    .delay(delay)
    .attr("opacity", 1)
    .attr("r", radius)
    .attr("fill", color)
    .attr("stroke", stroke)
    .attr("stroke-width", strokeWidth)
    .end()
    .catch(() => {});
}

export async function createGhostPoint(g, cx, cy, color, opts = {}) {
  const {
    radius = 8,
    stroke = "white",
    strokeWidth = 3,
    duration = DEFAULT_DURATIONS.point,
    delay = 0
  } = opts;

  const circle = g.append("circle").attr("class", "annotation")
    .attr("cx", cx).attr("cy", cy).attr("r", 0)
    .attr("fill", color).attr("stroke", stroke).attr("stroke-width", strokeWidth);
  await circle.transition().duration(duration).delay(delay).attr("r", radius).end().catch(() => {});
}

export async function addValueLabel(g, cx, cy, text, color, opts = {}) {
  if (text === undefined || text === null) return;
  const {
    offsetX = 10,
    offsetY = -10,
    fontSize = "14px",
    fontWeight = "bold",
    textAnchor = "start",
    stroke = "white",
    strokeWidth = 4,
    paintOrder = "stroke",
    duration = DEFAULT_DURATIONS.label
  } = opts;

  const label = g.append("text").attr("class", "annotation")
    .attr("x", cx + offsetX).attr("y", cy + offsetY)
    .attr("fill", color).attr("font-weight", fontWeight).attr("font-size", fontSize)
    .attr("text-anchor", textAnchor)
    .attr("stroke", stroke).attr("stroke-width", strokeWidth).attr("paint-order", paintOrder)
    .text(text)
    .attr("opacity", 0);

  await label.transition().duration(duration).attr("opacity", 1).end().catch(() => {});
}
