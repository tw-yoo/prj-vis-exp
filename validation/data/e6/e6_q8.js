import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Sector: 'Industrial', Year: 2003, 'Average length of lease in years': 4.7 },
    { Sector: 'Industrial', Year: 'mid-2013', 'Average length of lease in years': 3.2 },
    { Sector: 'Offices', Year: 2003, 'Average length of lease in years': 5.3 },
    { Sector: 'Offices', Year: 'mid-2013', 'Average length of lease in years': 4.5 },
    { Sector: 'SMEs', Year: 2003, 'Average length of lease in years': 5 },
    { Sector: 'SMEs', Year: 'mid-2013', 'Average length of lease in years': 4.1 },
    { Sector: 'Retail', Year: 2003, 'Average length of lease in years': 8.8 },
    { Sector: 'Retail', Year: 'mid-2013', 'Average length of lease in years': 5.3 },
    { Sector: 'Large companies', Year: 2003, 'Average length of lease in years': 9.5 },
    { Sector: 'Large companies', Year: 'mid-2013', 'Average length of lease in years': 5.2 },
    { Sector: 'All', Year: 2003, 'Average length of lease in years': 6.8 },
    { Sector: 'All', Year: 'mid-2013', 'Average length of lease in years': 4.5 }
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
    const xField = 'Sector';
    const seriesField = 'Year';
    const yField = 'Average length of lease in years';

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

function ensureLeaseArrowMarker({ d3, svg }) {
    const markerId = 'e6-q8-decline-arrow';
    svg.select(`#${markerId}`).remove();
    svg.append('defs')
        .append('marker')
        .attr('id', markerId)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 5)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#dc2626');
    return markerId;
}

function drawLeaseDeclines({ d3, container, emphasizeSector = null }) {
    const csvDeclines = {
        Industrial: 1.5,
        Offices: 0.8,
        SMEs: 0.9,
        Retail: 3.5,
        'Large companies': 4.3,
        All: 2.3,
    };
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const markerId = ensureLeaseArrowMarker({ d3, svg });

    g.selectAll('.e6-q8-annotation').remove();
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (d) => (!emphasizeSector || d.category === emphasizeSector ? 1 : 0.18))
        .attr('stroke', (d) => (d.category === emphasizeSector ? '#111827' : 'none'))
        .attr('stroke-width', (d) => (d.category === emphasizeSector ? 1.5 : 0));

    Object.entries(csvDeclines).forEach(([sector, decline]) => {
        const bars = d3.select(container).selectAll('rect.main-bar')
            .filter((d) => d.category === sector)
            .nodes()
            .map((node) => ({ node, datum: d3.select(node).datum() }));
        const high = bars.find((bar) => bar.datum.series === '2003');
        const low = bars.find((bar) => bar.datum.series === 'mid-2013');
        if (!high || !low) return;

        const highBar = d3.select(high.node);
        const lowBar = d3.select(low.node);
        const highY = Number(highBar.attr('y'));
        const lowY = Number(lowBar.attr('y'));
        const groupLeft = Math.min(Number(highBar.attr('x')), Number(lowBar.attr('x')));
        const groupRight = Math.max(
            Number(highBar.attr('x')) + Number(highBar.attr('width')),
            Number(lowBar.attr('x')) + Number(lowBar.attr('width'))
        );
        const arrowX = Number(lowBar.attr('x')) + Number(lowBar.attr('width')) / 2;
        const isEmphasis = emphasizeSector === sector;
        const opacity = !emphasizeSector || isEmphasis ? 1 : 0.18;

        g.append('line')
            .attr('class', 'e6-q8-annotation')
            .attr('data-sector', sector)
            .attr('x1', groupLeft)
            .attr('x2', groupRight)
            .attr('y1', highY)
            .attr('y2', highY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', isEmphasis ? 2.8 : 1.6)
            .attr('opacity', opacity);

        g.append('line')
            .attr('class', 'e6-q8-annotation')
            .attr('data-sector', sector)
            .attr('x1', arrowX)
            .attr('x2', arrowX)
            .attr('y1', lowY)
            .attr('y2', highY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', isEmphasis ? 2.8 : 1.6)
            .attr('opacity', opacity)
            .attr('marker-start', `url(#${markerId})`)
            .attr('marker-end', `url(#${markerId})`);

        g.append('text')
            .attr('class', 'e6-q8-annotation')
            .attr('data-sector', sector)
            .attr('x', arrowX + 4)
            .attr('y', (lowY + highY) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', isEmphasis ? 12 : 10)
            .attr('font-weight', isEmphasis ? 800 : 700)
            .attr('fill', '#dc2626')
            .attr('opacity', opacity)
            .text(decline.toFixed(1));
    });
}

export function function1({ d3, container }) {
    drawLeaseDeclines({ d3, container });
}

export function function2({ d3, container }) {
    drawLeaseDeclines({ d3, container, emphasizeSector: 'Large companies' });
}

export function function3({ d3, container }) {}
