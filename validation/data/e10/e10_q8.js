import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2014, Sector: 'Healthcare', Revenue_Million_Euros: 6621 },
    { Year: 2014, Sector: 'Life Science', Revenue_Million_Euros: 2683 },
    { Year: 2014, Sector: 'Performance Materials', Revenue_Million_Euros: 2060 },
    { Year: 2015, Sector: 'Healthcare', Revenue_Million_Euros: 6934 },
    { Year: 2015, Sector: 'Life Science', Revenue_Million_Euros: 3355 },
    { Year: 2015, Sector: 'Performance Materials', Revenue_Million_Euros: 2556 },
    { Year: 2016, Sector: 'Healthcare', Revenue_Million_Euros: 6855 },
    { Year: 2016, Sector: 'Life Science', Revenue_Million_Euros: 5658 },
    { Year: 2016, Sector: 'Performance Materials', Revenue_Million_Euros: 2511 },
    { Year: 2017, Sector: 'Healthcare', Revenue_Million_Euros: 6999 },
    { Year: 2017, Sector: 'Life Science', Revenue_Million_Euros: 5882 },
    { Year: 2017, Sector: 'Performance Materials', Revenue_Million_Euros: 2446 },
    { Year: 2018, Sector: 'Healthcare', Revenue_Million_Euros: 6246 },
    { Year: 2018, Sector: 'Life Science', Revenue_Million_Euros: 6185 },
    { Year: 2018, Sector: 'Performance Materials', Revenue_Million_Euros: 2406 },
    { Year: 2019, Sector: 'Healthcare', Revenue_Million_Euros: 6715 },
    { Year: 2019, Sector: 'Life Science', Revenue_Million_Euros: 6864 },
    { Year: 2019, Sector: 'Performance Materials', Revenue_Million_Euros: 2574 },
    { Year: 2020, Sector: 'Healthcare', Revenue_Million_Euros: 6639 },
    { Year: 2020, Sector: 'Life Science', Revenue_Million_Euros: 7515 },
    { Year: 2020, Sector: 'Performance Materials', Revenue_Million_Euros: 3380 }
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
    const seriesField = 'Sector';
    const yField = 'Revenue_Million_Euros';

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

function renderSectorYearStackedBarChart({ d3, container }) {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d.Year)))).sort((a, b) => Number(a) - Number(b));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d.Sector))));
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 56, left: 64 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const colorScale = d3.scaleOrdinal().domain(seriesDomain).range(WORKBENCH_PALETTE);
    const segments = [];

    xDomain.forEach((year) => {
        let y0 = 0;
        seriesDomain.forEach((sector) => {
            const value = data_rows
                .filter((row) => String(row.Year) === year && String(row.Sector) === sector)
                .reduce((sum, row) => sum + Number(row.Revenue_Million_Euros), 0);
            const y1 = y0 + value;
            segments.push({ year, sector, value, y0, y1 });
            y0 = y1;
        });
    });

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear().domain([0, d3.max(segments, (d) => d.y1) ?? 0]).nice().range([plotH, 0]);


    container.classList.add('validation-grouped-chart-host');

    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}`, instant: true });
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    g.selectAll('rect.main-bar')
        .data(segments)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.year))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.y1))
        .attr('height', (d) => yScale(d.y0) - yScale(d.y1))
        .attr('fill', (d) => colorScale(d.sector))
        .attr('opacity', 1)
        .attr('data-target', (d) => d.year)
        .attr('data-series', (d) => d.sector)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.year)
        .attr('data-y-value', (d) => String(d.value))
        .attr('data-group-value', (d) => d.sector);

    g.selectAll('text.validation-segment-label')
        .data(segments.filter((d) => yScale(d.y0) - yScale(d.y1) > 14))
        .join('text')
        .attr('class', 'validation-segment-label')
        .attr('x', (d) => (xScale(d.year) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => (yScale(d.y0) + yScale(d.y1)) / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 9)
        .attr('font-weight', 700)
        .attr('fill', '#ffffff')
        .text((d) => String(d.value));

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    seriesDomain.forEach((series, index) => {
        const y = index * 30 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', colorScale(series));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 14).text(series);
    });
}

export function function1({ d3, container }) {
    renderSectorYearStackedBarChart({ d3, container });
}

export function function2({ d3, container }) {
    const targetYear = '2020';
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (svg.empty() || g.empty()) return;

    g.selectAll('.main-bar')
        .attr('opacity', (d) => String(d.year ?? d.target ?? d.Year) === targetYear ? 1 : 0.28)
        .attr('stroke', (d) => String(d.year ?? d.target ?? d.Year) === targetYear ? '#111827' : 'none')
        .attr('stroke-width', (d) => String(d.year ?? d.target ?? d.Year) === targetYear ? 2 : 0);

    g.selectAll('.x-axis text')
        .attr('font-weight', function () {
            return d3.select(this).text() === targetYear ? 800 : 400;
        })
        .attr('fill', function () {
            return d3.select(this).text() === targetYear ? '#ef4444' : '#000000';
        });

    g.selectAll('.validation-segment-label')
        .attr('fill', (d) => String(d.year) === targetYear ? '#ef4444' : '#ffffff')
        .attr('font-size', (d) => String(d.year) === targetYear ? 11 : 9)
        .attr('paint-order', (d) => String(d.year) === targetYear ? 'stroke' : null)
        .attr('stroke', (d) => String(d.year) === targetYear ? '#ffffff' : null)
        .attr('stroke-width', (d) => String(d.year) === targetYear ? 3 : null);
}

export function function3({ d3, container }) {}
