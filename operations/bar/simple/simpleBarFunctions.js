export function simpleBarRetrieveValue(chartId, op) {

    let returnChartId = chartId;

    const hlColor  = "#ff6961";
    const origColor = "#69b3a2";
    const duration = 600;

    const svg  = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return chartId;

    const marginL = +svg.attr("data-m-left") || 0;
    const marginT = +svg.attr("data-m-top")  || 0;

    const bars = svg.selectAll("rect");

    /* 초기화 */
    bars.interrupt()
        .attr("fill", origColor)
        .attr("stroke", "none")
        .attr("opacity", 1);

    svg.selectAll(".annotation, .filter-label").remove();

    /* ▶︎ BUG FIX: function() { …this… } 로 교체 */
    const target = bars.filter(function () {
        return d3.select(this).attr("data-id") === `${op.key}`;
    });

    target.transition()
        .duration(duration)
        .attr("fill", hlColor)
        .attr("stroke", "black")
        .attr("stroke-width", 2);

    const bar = target.node();          // 이제 실제 SVGRectElement
    if (bar) {
        const x = +bar.getAttribute("x") + (+bar.getAttribute("width") / 2) + marginL;
        const y = +bar.getAttribute("y") - 6 + marginT;

        svg.append("text")
            .attr("class", "annotation")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", "middle")
            .attr("font-size", 12)
            .attr("fill", hlColor)
            .text(op.key);
    }

    return returnChartId;
}

export function simpleBarFilter(chartId, op) {

    let returnChartId = chartId;

    console.log(op)

    const duration = 600;

    const matchColor = "#ffa500";
    const dimOpacity = 0.15;
    const origColor  = "#69b3a2";

    const svg  = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) return chartId;

    const bars = svg.selectAll("rect");

    /* 초기화 */
    bars.interrupt()
        .attr("fill", origColor)
        .attr("opacity", 1)
        .attr("stroke", "none");

    svg.selectAll(".annotation, .filter-label").remove();

    /* 조건 판별 */
    const satisfy = {
        ">":  (a, b) => a >  b,
        ">=": (a, b) => a >= b,
        "<":  (a, b) => a <  b,
        "<=": (a, b) => a <= b,
        "==": (a, b) => a === b,
    }[op.satisfy] ?? (() => true);

    /* 애니메이션 */
    bars.each(function () {
        const node = d3.select(this);
        const val  = +node.attr("data-value");
        const pass = satisfy(val, op.key);

        node.transition()
            .duration(duration)
            .attr("fill", pass ? matchColor : origColor)
            .attr("opacity", pass ? 1 : dimOpacity);
    });

    /* 라벨 */
    svg.append("text")
        .attr("class", "filter-label")
        .attr("x", 8)
        .attr("y", 14)
        .attr("font-size", 12)
        .attr("fill", matchColor)
        .text(`Filter: value ${op.satisfy} ${op.key}`);

    return returnChartId;
}