export async function renderGroupedBarChart(chartId, spec) {
  // Clear container
  const host = d3.select(`#${chartId}`);
  host.selectAll('*').remove();

  // Dimensions and margins
  const fullWidth = 1200;
  const fullHeight = 900;
  const margin = { top: 50, right: 100, bottom: 50, left: 60 };
  const width = fullWidth - margin.left - margin.right;
  const height = fullHeight - margin.top - margin.bottom;
  const padding = 20;

  // Encoding fields
  const colField   = spec.encoding.column.field;
  const xField     = spec.encoding.x.field;
  const yField     = spec.encoding.y.field;
  const colorField = spec.encoding.color.field;

  // Load and parse data
  const data = await d3.csv(spec.data.url, d => {
    d[yField] = +d[yField];
    return d;
  });

  // Facet grouping
  const facets = d3.groups(data, d => d[colField]);
  const nFacets = facets.length;
  const facetWidth = (width - (nFacets - 1) * padding) / nFacets;

  // Scales
  const xDomain = Array.from(new Set(data.map(d => d[xField])));
  const xScale = d3.scaleBand()
    .domain(xDomain)
    .range([0, facetWidth])
    .padding(0.1);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[yField])])
    .nice()
    .range([height, 0]);

  const colorDomain = Array.from(new Set(data.map(d => d[colorField])));
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(colorDomain);

  // Create SVG
  const svg = host
    .append('svg')
    .attr('width', fullWidth)
    .attr('height', fullHeight);

  // Render each facet
  facets.forEach(([colValue, vals], i) => {
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left + i * (facetWidth + padding)},${margin.top})`);

    // Bars
    g.selectAll('rect')
      .data(vals)
      .join('rect')
      .attr('x', d => xScale(d[xField]))
      .attr('y', d => yScale(d[yField]))
      .attr('width', xScale.bandwidth())
      .attr('height', d => height - yScale(d[yField]))
      .attr('fill', d => colorScale(d[colorField]));

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickSizeOuter(0));

    // Y Axis only on first facet
    if (i === 0) {
      g.append('g')
        .call(d3.axisLeft(yScale).ticks(5));
    }

    // Facet title
    g.append('text')
      .attr('x', facetWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-weight', 'bold')
      .text(colValue);
  });

  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left + width + 20},${margin.top})`);
  legend.append('text')
    .attr('y', -10)
    .attr('font-weight', 'bold')
    .text(colorField);

  colorDomain.forEach((c, idx) => {
    const row = legend.append('g')
      .attr('transform', `translate(0,${idx * 20})`);
    row.append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', colorScale(c));
    row.append('text')
      .attr('x', 16)
      .attr('y', 10)
      .attr('font-size', '10px')
      .attr('text-anchor', 'start')
      .text(c);
  });
}