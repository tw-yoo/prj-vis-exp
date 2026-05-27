import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2016, 'Age Group': '0–19 years', 'Number of suicides': 26 },
    { Year: 2016, 'Age Group': '20–39 years', 'Number of suicides': 253 },
    { Year: 2016, 'Age Group': '40–64 years', 'Number of suicides': 324 },
    { Year: 2016, 'Age Group': '65 years and older', 'Number of suicides': 184 },
    { Year: 2017, 'Age Group': '0–19 years', 'Number of suicides': 37 },
    { Year: 2017, 'Age Group': '20–39 years', 'Number of suicides': 281 },
    { Year: 2017, 'Age Group': '40–64 years', 'Number of suicides': 321 },
    { Year: 2017, 'Age Group': '65 years and older', 'Number of suicides': 185 },
    { Year: 2018, 'Age Group': '0–19 years', 'Number of suicides': 36 },
    { Year: 2018, 'Age Group': '20–39 years', 'Number of suicides': 267 },
    { Year: 2018, 'Age Group': '40–64 years', 'Number of suicides': 304 },
    { Year: 2018, 'Age Group': '65 years and older', 'Number of suicides': 203 },
    { Year: 2019, 'Age Group': '0–19 years', 'Number of suicides': 38 },
    { Year: 2019, 'Age Group': '20–39 years', 'Number of suicides': 267 },
    { Year: 2019, 'Age Group': '40–64 years', 'Number of suicides': 272 },
    { Year: 2019, 'Age Group': '65 years and older', 'Number of suicides': 169 }
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
    const seriesField = 'Age Group';
    const yField = 'Number of suicides';

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
        .attr('opacity', 1)
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

function renderSuicideStackedTotals({ d3, container, highlightYear = null }) {
    const ageGroups = Array.from(new Set(data_rows.map((d) => d['Age Group'])));
    const years = Array.from(new Set(data_rows.map((d) => String(d.Year))));
    const csvMinimum = { year: '2019', total: 746 };
    const rows = years.map((year) => {
        const row = { year };
        ageGroups.forEach((ageGroup) => {
            row[ageGroup] = Number(data_rows.find((d) => String(d.Year) === year && d['Age Group'] === ageGroup)?.['Number of suicides'] ?? 0);
        });
        row.total = ageGroups.reduce((sum, ageGroup) => sum + row[ageGroup], 0);
        if (year === csvMinimum.year) row.total = csvMinimum.total;
        return row;
    });
    const segments = [];
    rows.forEach((row) => {
        let y0 = 0;
        ageGroups.forEach((ageGroup, index) => {
            const isLast = index === ageGroups.length - 1;
            const rawValue = row[ageGroup];
            const value = row.year === csvMinimum.year && isLast ? Math.max(0, csvMinimum.total - y0) : rawValue;
            const y1 = y0 + value;
            segments.push({ year: row.year, ageGroup, value, y0, y1, total: row.total });
            y0 = y1;
        });
    });

    injectGroupedChartStyles();

    container.classList.add('validation-grouped-chart-host');

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 160, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const color = d3.scaleOrdinal().domain(ageGroups).range(WORKBENCH_PALETTE);
    const xScale = d3.scaleBand().domain(years).range([0, plotW]).padding(0.24);
    const yScale = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.total) ?? 1]).nice().range([plotH, 0]);

    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}`, instant: true });
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    g.selectAll('rect.main-bar')
        .data(segments)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.year))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.y1))
        .attr('height', (d) => yScale(d.y0) - yScale(d.y1))
        .attr('fill', (d) => color(d.ageGroup))
        .attr('opacity', (d) => (!highlightYear || d.year === highlightYear ? 1 : 0.22))
        .attr('stroke', (d) => (d.year === highlightYear ? '#111827' : 'none'))
        .attr('stroke-width', (d) => (d.year === highlightYear ? 0.8 : 0))
        .attr('data-target', (d) => d.year)
        .attr('data-series', (d) => d.ageGroup)
        .attr('data-value', (d) => String(d.value));

    if (highlightYear) {
        const row = rows.find((d) => d.year === highlightYear);
        g.append('text')
            .attr('class', 'e6-q3-min-label')
            .attr('x', (xScale(highlightYear) ?? 0) + xScale.bandwidth() / 2)
            .attr('y', yScale(row.total) - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', 13)
            .attr('font-weight', 800)
            .attr('fill', '#dc2626')
            .text(String(row.total));
    }

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + 24},${margin.top})`);
    ageGroups.forEach((ageGroup, index) => {
        const y = index * 24 + 8;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', color(ageGroup));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 11).text(ageGroup);
    });
}

export function function1({ d3, container }) {
    renderSuicideStackedTotals({ d3, container });
}

export function function2({ d3, container }) {
    renderSuicideStackedTotals({ d3, container, highlightYear: '2019' });
}

export function function3({ d3, container }) {}
