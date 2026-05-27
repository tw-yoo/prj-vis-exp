import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2011, Type: 'Lending', 'Value in billion US dollars': 0.52 },
    { Year: 2011, Type: 'Investment', 'Value in billion US dollars': 0.11 },
    { Year: 2011, Type: 'Donation', 'Value in billion US dollars': 0.68 },
    { Year: 2012, Type: 'Lending', 'Value in billion US dollars': 1.2 },
    { Year: 2012, Type: 'Investment', 'Value in billion US dollars': 0.12 },
    { Year: 2012, Type: 'Donation', 'Value in billion US dollars': 1.4 },
    { Year: 2013, Type: 'Lending', 'Value in billion US dollars': 3.4 },
    { Year: 2013, Type: 'Investment', 'Value in billion US dollars': 0.4 },
    { Year: 2013, Type: 'Donation', 'Value in billion US dollars': 1.3 },
    { Year: 2014, Type: 'Lending', 'Value in billion US dollars': 11.1 },
    { Year: 2014, Type: 'Investment', 'Value in billion US dollars': 1.1 },
    { Year: 2014, Type: 'Donation', 'Value in billion US dollars': 1.9 }
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
    const xField = 'Year';
    const seriesField = 'Type';
    const yField = 'Value in billion US dollars';

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

function getE4Q3Geometry(d3) {
    const xField = 'Year';
    const seriesField = 'Type';
    const yField = 'Value in billion US dollars';
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[xField]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[seriesField]))));
    const aggregated = [];
    xDomain.forEach((cat) => {
        seriesDomain.forEach((ser) => {
            const row = data_rows.find((d) => String(d[xField]) === cat && String(d[seriesField]) === ser);
            if (!row) return;
            aggregated.push({ category: cat, series: ser, value: Number(row[yField]) });
        });
    });
    const maxY = Math.max(0, ...aggregated.map((d) => d.value));
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).paddingInner(0.18).paddingOuter(0.08);
    const innerScale = d3.scaleBand().domain(seriesDomain).range([0, Math.max(xScale.bandwidth(), 1)]).padding(0.08);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);
    return { xField, seriesField, yField, xDomain, seriesDomain, aggregated, plotW, plotH, xScale, innerScale, yScale };
}

function getE4Q3LendInvestGaps() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d.Year))));
    return xDomain.map((year) => {
        const lending = Number(data_rows.find((d) => String(d.Year) === year && d.Type === 'Lending')?.['Value in billion US dollars'] ?? 0);
        const investment = Number(data_rows.find((d) => String(d.Year) === year && d.Type === 'Investment')?.['Value in billion US dollars'] ?? 0);
        return { year, lending, investment, gap: Math.abs(lending - investment) };
    });
}

export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            return this.getAttribute('data-series') === 'Donation' ? 0.22 : 1;
        });

    svg.selectAll('.color-legend text, .color-legend circle')
        .each(function () {
            // Donation is the third entry — fade it
        });
    // Legend cells don't have data-series; dim by index (3rd row in seriesDomain order)
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d.Type))));
    const donationIdx = seriesDomain.indexOf('Donation');
    if (donationIdx >= 0) {
        svg.selectAll('.color-legend circle').filter((_, i) => i === donationIdx)
            .transition().duration(600).attr('opacity', 0.25);
        svg.selectAll('.color-legend text').filter((_, i) => i === donationIdx)
            .transition().duration(600).attr('fill-opacity', 0.35);
    }
}

function ensureE4Q3ArrowMarker(svg) {
    if (!svg.select('defs#e4-q3-defs').empty()) return;
    const defs = svg.append('defs').attr('id', 'e4-q3-defs');
    defs.append('marker')
        .attr('id', 'e4-q3-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');
}

export function function2({ d3, container }) {
    const { xScale, innerScale, yScale } = getE4Q3Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    // R8 (round 3): comparison line must be RED with arrowhead.
    ensureE4Q3ArrowMarker(svg);

    g.selectAll('.validation-q3-gap-line, .validation-q3-gap-label').remove();

    const gaps = getE4Q3LendInvestGaps();
    gaps.forEach(({ year, lending, investment, gap }) => {
        const xLending = (xScale(year) ?? 0) + (innerScale('Lending') ?? 0) + innerScale.bandwidth() / 2;
        const xInvest = (xScale(year) ?? 0) + (innerScale('Investment') ?? 0) + innerScale.bandwidth() / 2;
        const yLending = yScale(lending);
        const yInvest = yScale(investment);
        g.append('line')
            .attr('class', 'validation-q3-gap-line')
            .attr('data-year', year)
            .attr('x1', xLending)
            .attr('y1', yLending)
            .attr('x2', xLending)
            .attr('y2', yLending)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#e4-q3-arrow)')
            .transition()
            .duration(650)
            .attr('x2', xInvest)
            .attr('y2', yInvest);
        g.append('text')
            .attr('class', 'validation-q3-gap-label')
            .attr('data-year', year)
            .attr('x', (xLending + xInvest) / 2)
            .attr('y', Math.min(yLending, yInvest) - 6)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#ef4444')
            .attr('opacity', 0)
            .text(`Δ${gap.toFixed(2)}`)
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });
}

export function function3({ d3, container }) {
    const { plotH, plotW, xScale } = getE4Q3Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q3-min-rect, .validation-q3-summary').remove();

    const best = getE4Q3LendInvestGaps().reduce((b, row) => row.gap < b.gap ? row : b, { gap: Infinity });

    g.insert('rect', ':first-child')
        .attr('class', 'validation-q3-min-rect')
        .attr('x', (xScale(best.year) ?? 0) - 6)
        .attr('y', 0)
        .attr('width', xScale.bandwidth() + 12)
        .attr('height', plotH)
        .attr('fill', '#fde68a')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.55);

    g.selectAll('.validation-q3-gap-line')
        .filter(function () { return this.getAttribute('data-year') === best.year; })
        .transition()
        .duration(600)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', null);

    g.selectAll('.validation-q3-gap-label')
        .filter(function () { return this.getAttribute('data-year') === best.year; })
        .transition()
        .duration(600)
        .attr('fill', '#ef4444')
        .attr('font-size', 13);

    // Theme D (#15 round 3): move summary to top-center, above the chart.
    g.append('text')
        .attr('class', 'validation-q3-summary')
        .attr('x', plotW / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`smallest gap → ${best.year} (Δ ${best.gap.toFixed(2)})`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
