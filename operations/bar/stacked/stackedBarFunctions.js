/* ------------------------------------------------------------------ */
/*   stackedBarRetrieveValue  (robust & high-contrast)                */
/* ------------------------------------------------------------------ */
export function stackedBarRetrieveValue(chartId, op) {
  const svg = d3.select(`#${chartId}`).select("svg:last-of-type"); // 가장 최신 SVG
  if (svg.empty()) return chartId;

  /* reset */
  svg.selectAll(".retrieve-rect,.retrieve-label").remove();
  svg.selectAll("g.tick text").attr("fill", "#000").attr("font-weight", null);

  /* params */
  const key            = String(op.key);                 // "8"  ← String 강제
  const keyField       = op.keyField       || "month";
  const subgroupKey    = String(op.subgroupKey);         // "rain"
  const subgroupField  = op.subgroupField  || "weather";

  /* locate rect */
  let targetRect = null;
  svg.selectAll("rect").each(function () {
    const d = d3.select(this).datum();
    if (!d || d.start === undefined) return;             // legend pass

    const catVal = String((keyField in d) ? d[keyField] : d.category);
    const subVal = String((subgroupField in d) ? d[subgroupField] : d.subgroup);
    if (catVal === key && subVal === subgroupKey) targetRect = d3.select(this);
  });

  if (!targetRect) { console.warn("stackedBarRetrieveValue: target not found"); return chartId; }

  /* geometry & value */
  const { x, y, width, height } = targetRect.node().getBBox();
  const { start, end } = targetRect.datum();
  const value = end - start;

  /* highlight colours */
  const hl   = "#ffeb3b"; // bright yellow outline
  const halo = "#ffffff"; // white halo

  /* outline (white halo + yellow) */
  const pad  = 2;
  svg.append("rect").attr("class", "retrieve-rect")
     .attr("x", x-pad).attr("y", y-pad)
     .attr("width", width+pad*2).attr("height", height+pad*2)
     .attr("fill", "none").attr("stroke", halo).attr("stroke-width", 4)
     .attr("pointer-events", "none").raise();

  svg.append("rect").attr("class", "retrieve-rect")
     .attr("x", x-pad).attr("y", y-pad)
     .attr("width", width+pad*2).attr("height", height+pad*2)
     .attr("fill", "none").attr("stroke", hl).attr("stroke-width", 3)
     .attr("pointer-events", "none").raise();

  /* value label with black stroke */
  const horiz = width > height;
  svg.append("text").attr("class", "retrieve-label")
     .attr("x", horiz ? x + width + 6 : x + width / 2)
     .attr("y", horiz ? y + height / 2 : y - 6)
     .attr("fill", hl).attr("font-size", "12px").attr("font-weight", "bold")
     .attr("paint-order", "stroke").attr("stroke", "#000").attr("stroke-width", 3)
     .attr("dominant-baseline", horiz ? "middle" : "auto")
     .attr("text-anchor", horiz ? "start" : "middle")
     .text(value.toLocaleString()).raise();

  /* x-axis tick highlight */
  svg.selectAll("g.tick").each(function (t) {
    if (String(t) === key) {
      d3.select(this).select("text").attr("fill", hl).attr("font-weight", "bold");
    }
  });

  return chartId;
}


export function stackedBarFilter(chartId, op) {}

export function stackedBarFindExtremum(chartId, op) {}

export function stackedBarCompare(chartId, op) {}

export function stackedBarDetermineRange(chartId, op) {}

export function stackedBarSort(chartId, op) {}