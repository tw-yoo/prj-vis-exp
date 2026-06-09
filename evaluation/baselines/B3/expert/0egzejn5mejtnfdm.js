import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { ResponseCategory: 'Strongly in favour', Region: 'England & Wales', SharePercentage: 18 },
    { ResponseCategory: 'Strongly in favour', Region: 'Scotland', SharePercentage: 13 },
    { ResponseCategory: 'Somewhat in favour', Region: 'England & Wales', SharePercentage: 25 },
    { ResponseCategory: 'Somewhat in favour', Region: 'Scotland', SharePercentage: 24 },
    { ResponseCategory: 'Neither in favour nor against', Region: 'England & Wales', SharePercentage: 17 },
    { ResponseCategory: 'Neither in favour nor against', Region: 'Scotland', SharePercentage: 16 },
    { ResponseCategory: 'Somewhat against', Region: 'England & Wales', SharePercentage: 16 },
    { ResponseCategory: 'Somewhat against', Region: 'Scotland', SharePercentage: 18 },
    { ResponseCategory: 'Strongly against', Region: 'England & Wales', SharePercentage: 2 },
    { ResponseCategory: 'Strongly against', Region: 'Scotland', SharePercentage: 28 }
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
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    const xField = 'ResponseCategory';
    const seriesField = 'Region';
    const yField = 'SharePercentage';

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

function getReferendumChartMetrics({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const maxY = d3.max(data_rows, (d) => d.SharePercentage) ?? 1;
    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);

    return { svg, g, plotW, yScale };
}

function applyReferendumTargetHighlight({ d3, container }) {
    const csvTargets = [
        { category: 'Strongly against', region: 'Scotland', value: 28 },
        { category: 'Strongly against', region: 'England & Wales', value: 2 },
    ];
    const isTarget = (datum) => csvTargets.some((target) => (
        datum.category === target.category && datum.series === target.region
    ));

    d3.select(container).selectAll('.e5-q8-annotation').remove();

    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (datum) => (isTarget(datum) ? 1 : 0.22))
        .attr('stroke', (datum) => (isTarget(datum) ? '#111827' : 'none'))
        .attr('stroke-width', (datum) => (isTarget(datum) ? 2 : 0));

    d3.select(container).selectAll('rect.main-bar')
        .filter((datum) => isTarget(datum))
        .each(function (datum) {
            const bar = d3.select(this);
            const x = Number(bar.attr('x')) + Number(bar.attr('width')) / 2;
            const y = Number(bar.attr('y')) - 8;

            d3.select(this.parentNode)
                .append('text')
                .attr('class', 'e5-q8-annotation')
                .attr('x', x)
                .attr('y', y)
                .attr('text-anchor', 'middle')
                .attr('font-size', 12)
                .attr('font-weight', 700)
                .attr('fill', '#111827')
                .text(String(datum.value));
        });
}

function ensureReferendumArrowMarker({ d3, svg }) {
    const markerId = 'e5-q8-arrow-marker';
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

export function function1({ d3, container }) {
    applyReferendumTargetHighlight({ d3, container });
}

export function function2({ d3, container }) {
    applyReferendumTargetHighlight({ d3, container });

    const csvValues = { scotlandMax: 28, englandWalesMin: 2, difference: 26 };
    const { svg, g, plotW, yScale } = getReferendumChartMetrics({ d3, container });
    const markerId = ensureReferendumArrowMarker({ d3, svg });

    g.selectAll('.e5-q8-difference').remove();

    [csvValues.scotlandMax, csvValues.englandWalesMin].forEach((value) => {
        const y = yScale(value);
        g.append('line')
            .attr('class', 'e5-q8-difference')
            .attr('x1', 0)
            .attr('x2', plotW)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5 4');
    });

    const arrowX = plotW + 36;
    const highY = yScale(csvValues.scotlandMax);
    const lowY = yScale(csvValues.englandWalesMin);

    g.append('line')
        .attr('class', 'e5-q8-difference')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', highY)
        .attr('y2', lowY)
        .attr('stroke', '#dc2626')
        .attr('stroke-width', 2)
        .attr('marker-start', `url(#${markerId})`)
        .attr('marker-end', `url(#${markerId})`);

    g.append('text')
        .attr('class', 'e5-q8-difference')
        .attr('x', arrowX + 10)
        .attr('y', (highY + lowY) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#dc2626')
        .text(String(csvValues.difference));
}

export function function3({ d3, container }) {}
