import { renderChart } from "../../../util/util.js";

export async function renderChartWithFade(chartId, spec, duration = 400) {
    const host = d3.select(`#${chartId}`);
    const current = host.select("svg");
    if (!current.empty()) {
        current.interrupt();
        try {
            await current.transition().duration(duration).style("opacity", 0).end();
        } catch {
            current.style("opacity", 0);
        }
    }

    await renderChart(chartId, spec);

    const next = d3.select(`#${chartId}`).select("svg");
    if (!next.empty()) {
        next.style("opacity", 0);
        try {
            await next.transition().duration(duration).style("opacity", 1).end();
        } catch {
            next.style("opacity", 1);
        }
    }
}
