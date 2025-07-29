export async function renderSimpleLineChart(chartId, spec) {
    // 1. Setup
    const container = d3.select(`#${chartId}`);
    container.selectAll("*").remove();
    const width = 1200;
    const height = 800;
    const margin = { top: 40, right: 120, bottom: 50, left: 60 };

    // 2. Extract encoding fields
    const xField = spec.encoding.x.field;
    const yField = spec.encoding.y.field;
    const colorField = spec.encoding.color?.field;

    // 3. Load and parse data
    const parseDate = d => {
        const parsed = new Date(d[xField]);
        return parsed;
    };
    let data = await d3.csv(spec.data.url, d => {
        d[xField] = spec.encoding.x.type === "temporal" ? new Date(d[xField]) : d[xField];
        d[yField] = +d[yField];
        if (colorField) d[colorField] = d[colorField];
        return d;
    });

    // 4. Group into series
    let series;
    if (colorField) {
        const grouped = d3.groups(data, d => d[colorField]).slice(0, 15);
        series = grouped.map(([key, values]) => ({ key, values }));
    } else {
        series = [{ key: yField, values: data }];
    }

    // 5. Scales
    const xValues = data.map(d => d[xField]);
    const yMax = d3.max(data, d => d[yField]);
    const xScale = spec.encoding.x.type === "temporal"
        ? d3.scaleTime().domain(d3.extent(xValues)).range([margin.left, width - margin.right])
        : d3.scalePoint().domain([...new Set(xValues)]).range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([height - margin.bottom, margin.top]);

    // 6. Color scale
    const colorDomain = series.map(s => s.key);
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(colorDomain);

    // 7. SVG container
    const svg = container.append("svg").attr("width", width).attr("height", height);

    // 8. Axes
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale));
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale));

    // 9. Line generator
    const lineGen = d3.line()
        .x(d => xScale(d[xField]))
        .y(d => yScale(d[yField]));

    // 10. Draw lines
    series.forEach(s => {
        svg.append("path")
            .datum(s.values)
            .attr("fill", "none")
            .attr("stroke", colorScale(s.key))
            .attr("stroke-width", 2)
            .attr("d", lineGen);
    });

    // 11. Legend for multi-line
    if (series.length > 1) {
        const legend = svg.append("g")
            .attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);
        legend.append("text")
            .attr("x", 0).attr("y", -10).text(colorField).attr("font-weight", "bold");
        series.forEach((s, i) => {
            const g = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
            g.append("rect").attr("width", 12).attr("height", 12).attr("fill", colorScale(s.key));
            g.append("text").attr("x", 16).attr("y", 10).text(s.key).attr("font-size", "10px");
        });
    }
}