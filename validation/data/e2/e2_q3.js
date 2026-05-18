import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, Region: 'North America', 'Media rights revenue in billion US dollars': 8.61 },
    { Year: 2009, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 9.95 },
    { Year: 2009, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 3.53 },
    { Year: 2009, Region: 'Latin America', 'Media rights revenue in billion US dollars': 0.99 },
    { Year: 2010, Region: 'North America', 'Media rights revenue in billion US dollars': 9.74 },
    { Year: 2010, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 12.37 },
    { Year: 2010, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 3.93 },
    { Year: 2010, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.17 },
    { Year: 2011, Region: 'North America', 'Media rights revenue in billion US dollars': 9.3 },
    { Year: 2011, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 10.68 },
    { Year: 2011, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 3.73 },
    { Year: 2011, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.14 },
    { Year: 2012, Region: 'North America', 'Media rights revenue in billion US dollars': 10.66 },
    { Year: 2012, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 13.46 },
    { Year: 2012, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 4.06 },
    { Year: 2012, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.21 },
    { Year: 2013, Region: 'North America', 'Media rights revenue in billion US dollars': 9.58 },
    { Year: 2013, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 11.85 },
    { Year: 2013, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 4.01 },
    { Year: 2013, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.27 }
];

// Workbench default category color palette (DEFAULT_CATEGORY_COLORS)
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];

function resolveSeriesColor(seriesDomain, key) {
    const index = seriesDomain.indexOf(String(key));
    return WORKBENCH_PALETTE[index >= 0 ? index % WORKBENCH_PALETTE.length : 0];
}

function injectGroupedChartStyles() {
    if (document.getElementById('validation-grouped-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-grouped-chart-styles';
    style.textContent = `
        .validation-grouped-chart-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-grouped-chart-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-grouped-chart-host .x-axis line,
        .validation-grouped-chart-host .x-axis path,
        .validation-grouped-chart-host .y-axis line,
        .validation-grouped-chart-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-grouped-chart-host .x-axis text,
        .validation-grouped-chart-host .y-axis text,
        .validation-grouped-chart-host .x-axis-label,
        .validation-grouped-chart-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-grouped-chart-host .main-bar {
            cursor: pointer;
        }
        .validation-grouped-chart-host .color-legend text {
            fill: #000000;
            font-family: sans-serif;
        }
        .validation-grouped-chart-tooltip {
            position: absolute;
            z-index: 6;
            min-width: 120px;
            padding: 10px 12px;
            border: 1px solid rgba(203, 213, 225, 0.9);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
            pointer-events: none;
            font-family: sans-serif;
        }
        .validation-grouped-chart-tooltip[hidden] { display: none; }
        .validation-grouped-chart-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-grouped-chart-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-grouped-chart-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationGroupedBarChart({ container }) {
    const xField = 'Year';
    const seriesField = 'Region';
    const yField = 'Media rights revenue in billion US dollars';

    injectGroupedChartStyles();

    const data = data_rows;

    // Derive domains from data — no hardcoded variable names
    const xDomain = Array.from(new Set(data.map((d) => String(d[xField]))));
    const seriesDomain = Array.from(new Set(data.map((d) => String(d[seriesField]))));

    // Aggregate rows into GroupedBarPoint objects matching Workbench's data model:
    // { category, series, value, rows }
    const aggregated = [];
    xDomain.forEach((cat) => {
        seriesDomain.forEach((ser) => {
            const rows = data.filter((d) => String(d[xField]) === cat && String(d[seriesField]) === ser);
            if (!rows.length) return;
            const value = rows.reduce((sum, d) => sum + Number(d[yField]), 0);
            aggregated.push({ category: cat, series: ser, value, rows });
        });
    });

    const maxY = Math.max(0, ...aggregated.map((d) => d.value));

    // Canvas / layout constants matching Workbench defaults (with legend)
    // legendReserve = legendWidth(136) + legendOffsetX(64) = 200
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    // Outer scale (categories), inner scale (series) — same padding as Workbench
    const xScale = d3.scaleBand()
        .domain(xDomain)
        .range([0, plotW])
        .paddingInner(0.18)
        .paddingOuter(0.08);

    const innerScale = d3.scaleBand()
        .domain(seriesDomain)
        .range([0, Math.max(xScale.bandwidth(), 1)])
        .padding(0.08);

    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);

    const zeroY = yScale(0);

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-grouped-chart-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Y axis
    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    // X axis
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    // Grouped bars — class "main-bar" matches Workbench
    g.selectAll('rect.main-bar')
        .data(aggregated)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (datum) => (xScale(datum.category) ?? 0) + (innerScale(datum.series) ?? 0))
        .attr('width', innerScale.bandwidth())
        .attr('y', (datum) => (datum.value >= 0 ? yScale(datum.value) : zeroY))
        .attr('height', (datum) => Math.abs(yScale(datum.value) - zeroY))
        .attr('fill', (datum) => resolveSeriesColor(seriesDomain, datum.series))
        // Workbench data attributes
        .attr('data-target', (datum) => String(datum.category))
        .attr('data-value', (datum) => datum.value)
        .attr('data-series', (datum) => String(datum.series))
        .attr('data-x-value', (datum) => String(datum.category))
        .attr('data-y-value', (datum) => String(datum.value))
        .attr('data-group-value', (datum) => String(datum.series));

    // Color legend — matches Workbench renderColorLegend (circles, not rects)
    // legendLabel=20, rowGap=10 → each row height = 30; circle cy = rowY + 10
    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${legendX},${margin.top})`);

    const legendRowH = 30; // legendLabel(20) + rowGap(10)

    seriesDomain.forEach((ser, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 10; // legendLabel / 2

        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', resolveSeriesColor(seriesDomain, ser))
            .attr('opacity', 0.85);

        legend.append('text')
            .attr('x', 20)
            .attr('y', cy)
            .attr('font-size', 20) // CHART_TEXT_SIZE.legendLabel
            .attr('dominant-baseline', 'middle')
            .text(ser);
    });

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-grouped-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${xField}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-x"></span>
        </div>
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${seriesField}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-s"></span>
        </div>
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${yField}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, datum) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#grp-tt-x').textContent = String(datum.category);
            tooltip.querySelector('#grp-tt-s').textContent = String(datum.series);
            tooltip.querySelector('#grp-tt-y').textContent = String(datum.value);
        })
        .on('mousemove', function (event) {
            const rect = container.getBoundingClientRect();
            tooltip.style.left = `${event.clientX - rect.left + 12}px`;
            tooltip.style.top = `${event.clientY - rect.top - 10}px`;
        })
        .on('mouseout', function () {
            tooltip.setAttribute('hidden', '');
        });
}

function getRegionRows() {
    const selectedRegions = ['North America', 'Latin America'];
    return data_rows.filter((d) => selectedRegions.includes(String(d.Region)));
}

function renderSelectedRegionGroupedChart({ d3, container, rows }) {
    const xDomain = Array.from(new Set(rows.map((d) => String(d.Year))));
    const seriesDomain = Array.from(new Set(rows.map((d) => String(d.Region))));
    const yField = 'Media rights revenue in billion US dollars';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 56, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).paddingInner(0.18).paddingOuter(0.08);
    const innerScale = d3.scaleBand().domain(seriesDomain).range([0, xScale.bandwidth()]).padding(0.08);
    const yScale = d3.scaleLinear().domain([0, d3.max(rows, (d) => Number(d[yField])) ?? 0]).nice().range([plotH, 0]);

    container.innerHTML = '';
    container.classList.add('validation-grouped-chart-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    g.selectAll('rect.main-bar')
        .data(rows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => (xScale(String(d.Year)) ?? 0) + (innerScale(String(d.Region)) ?? 0))
        .attr('width', innerScale.bandwidth())
        .attr('y', plotH)
        .attr('height', 0)
        .attr('fill', (d) => resolveSeriesColor(seriesDomain, d.Region))
        .attr('data-target', (d) => String(d.Year))
        .attr('data-series', (d) => String(d.Region))
        .attr('data-value', (d) => Number(d[yField]))
        .transition()
        .duration(700)
        .attr('y', (d) => yScale(Number(d[yField])))
        .attr('height', (d) => plotH - yScale(Number(d[yField])));

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    seriesDomain.forEach((region, index) => {
        const y = index * 30 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', resolveSeriesColor(seriesDomain, region));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 14).text(region);
    });
}

function renderRegionAverageComparison({ d3, container }) {
    const rows = getRegionRows();
    const regions = ['North America', 'Latin America'];
    const years = Array.from(new Set(rows.map((d) => String(d.Year))));
    const yField = 'Media rights revenue in billion US dollars';
    const averages = regions.map((region) => ({
        region,
        average: d3.mean(rows.filter((d) => d.Region === region), (d) => Number(d[yField])) ?? 0
    }));
    const width = 640;
    const height = 420;
    const margin = { top: 28, right: 70, bottom: 50, left: 56 };
    const panelGap = 28;
    const panelH = (height - margin.top - margin.bottom - panelGap) / 2;
    const plotW = width - margin.left - margin.right;
    const xScale = d3.scaleBand().domain(years).range([0, plotW]).padding(0.18);
    const yScale = d3.scaleLinear().domain([0, d3.max(rows, (d) => Number(d[yField])) ?? 0]).nice().range([panelH, 0]);

    container.innerHTML = '';
    container.classList.add('validation-grouped-chart-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');

    regions.forEach((region, panelIndex) => {
        const panelY = margin.top + panelIndex * (panelH + panelGap);
        const g = svg.append('g').attr('transform', `translate(${margin.left},${panelY})`);
        const regionRows = rows.filter((d) => d.Region === region);
        const average = averages.find((d) => d.region === region)?.average ?? 0;

        g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(3));
        const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${panelH})`).call(d3.axisBottom(xScale));
        autoRotateXAxisLabels(xAxis);
        g.append('text')
            .attr('x', 0)
            .attr('y', -8)
            .attr('font-family', 'sans-serif')
            .attr('font-size', 13)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .text(region);

        g.selectAll('rect.main-bar')
            .data(regionRows)
            .join('rect')
            .attr('class', 'main-bar')
            .attr('x', (d) => xScale(String(d.Year)))
            .attr('width', xScale.bandwidth())
            .attr('y', panelH)
            .attr('height', 0)
            .attr('fill', panelIndex === 0 ? '#4f46e5' : '#14b8a6')
            .transition()
            .duration(700)
            .attr('y', (d) => yScale(Number(d[yField])))
            .attr('height', (d) => panelH - yScale(Number(d[yField])));

        g.append('line')
            .attr('class', 'validation-average-line')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', yScale(average))
            .attr('y2', yScale(average))
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5 4')
            .transition()
            .duration(700)
            .attr('x2', plotW);
        g.append('text')
            .attr('x', plotW + 8)
            .attr('y', yScale(average))
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', '#ef4444')
            .attr('opacity', 0)
            .text(average.toFixed(2))
            .transition()
            .duration(700)
            .attr('opacity', 1);
    });

    const x = width - margin.right + 28;
    const y1 = margin.top + yScale(averages[0].average);
    const y2 = margin.top + panelH + panelGap + yScale(averages[1].average);
    const defs = svg.append('defs');
    defs.append('marker')
        .attr('id', 'e2-q3-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');
    svg.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', y1)
        .attr('y2', y1)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q3-arrow)')
        .attr('marker-end', 'url(#e2-q3-arrow)')
        .transition()
        .duration(700)
        .attr('y2', y2);
    svg.append('text')
        .attr('x', x + 8)
        .attr('y', (y1 + y2) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text((averages[0].average - averages[1].average).toFixed(2))
        .transition()
        .duration(700)
        .attr('opacity', 1);
}

export function function1({ d3, container }) {
    renderSelectedRegionGroupedChart({ d3, container, rows: getRegionRows() });
}

export function function2({ d3, container }) {
    renderRegionAverageComparison({ d3, container });
}

export function function3({ d3, container }) {}
