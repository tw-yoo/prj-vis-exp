import { OperationType } from "../../../object/operationType.js";

export function renderStackedBarChart(chartId, spec) {

    const host   = d3.select(`#${chartId}`);
    host.selectAll("*").remove();

    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const colorField = spec.encoding.color.field;

    const width = 600;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 30, left: 100 };

    d3.csv(spec.data.url).then(data => {
        data.forEach(d => {
            d[xField] = +d[xField];
        });

        const series = d3.rollup(
            data,
            v => {
                const total = d3.sum(v, d => d[xField]);
                let acc = 0;
                return v.map(d => {
                    const start = acc;
                    acc += d[xField];
                    return {
                        [yField]: d[yField],
                        [colorField]: d[colorField],
                        [xField]: d[xField],
                        start: start,
                        end: acc,
                        normStart: start / total,
                        normEnd: acc / total
                    };
                });
            },
            d => d[yField]
        );

        const stackData = Array.from(series.values()).flat();

        const categories = Array.from(new Set(data.map(d => d[yField])));
        const subgroups = Array.from(new Set(data.map(d => d[colorField])));

        // Determine stacking type from Vega-Lite spec: 'normalize' for 100% stacked, default to normal stacking
        const stackType = spec.encoding.x?.stack || spec.encoding.y?.stack;
        const isNormalized = stackType === "normalize";

        const xMax = isNormalized ? 1 : d3.max(stackData, d => d.end);

        const xScale = d3.scaleLinear()
            .domain([0, xMax])
            .range([margin.left, width - margin.right]);

        const yScale = d3.scaleBand()
            .domain(categories)
            .range([margin.top, height - margin.bottom])
            .padding(0.1);

        const color = d3.scaleOrdinal(d3.schemeCategory10)
            .domain(subgroups);

        const svg = d3.select("#chart")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        svg.selectAll("g.bar-group")
            .data(stackData)
            .enter()
            .append("rect")
            .attr("x", d => xScale(isNormalized ? d.normStart : d.start))
            .attr("width", d => xScale(isNormalized ? d.normEnd : d.end) - xScale(isNormalized ? d.normStart : d.start))
            .attr("y", d => yScale(d[yField]))
            .attr("height", yScale.bandwidth())
            .attr("fill", d => color(d[colorField]));

        // X Axis
        svg.append("g")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(isNormalized ? 5 : null).tickFormat(d => isNormalized ? d * 100 + "%" : d));

        // X Axis Label
        svg.append("text")
            .attr("x", (margin.left + (width - margin.right)) / 2)
            .attr("y", height - margin.bottom + 25)
            .attr("text-anchor", "middle")
            .text(spec.encoding.x.field);

        // Y Axis
        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(yScale));

        // Y Axis Label
        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -(margin.top + (height - margin.bottom)) / 2)
            .attr("y", margin.left - 40)
            .attr("text-anchor", "middle")
            .text(spec.encoding.y.field);
        // Legend
        const legend = svg.append("g")
            .attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);

        legend.append("text")
            .attr("x", 0)
            .attr("y", -10)
            .attr("text-anchor", "start")
            .text(spec.encoding.color.field);

        subgroups.forEach((name, i) => {
            const row = legend.append("g")
                .attr("transform", `translate(0, ${i * 20})`);

            row.append("rect")
                .attr("width", 15)
                .attr("height", 15)
                .attr("fill", color(name));

            row.append("text")
                .attr("x", 20)
                .attr("y", 12)
                .attr("text-anchor", "start")
                .text(name);
        });
    });
}