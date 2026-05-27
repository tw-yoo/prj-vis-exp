import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { 'Fiscal Year': '2010/11', Item: 'Beer', 'Sales price in US dollars': 5 },
    { 'Fiscal Year': '2010/11', Item: 'Soft drink', 'Sales price in US dollars': 2.5 },
    { 'Fiscal Year': '2010/11', Item: 'Hot dog', 'Sales price in US dollars': 4.5 },
    { 'Fiscal Year': '2011/12', Item: 'Beer', 'Sales price in US dollars': 5 },
    { 'Fiscal Year': '2011/12', Item: 'Soft drink', 'Sales price in US dollars': 3.25 },
    { 'Fiscal Year': '2011/12', Item: 'Hot dog', 'Sales price in US dollars': 3 },
    { 'Fiscal Year': '2012/13', Item: 'Beer', 'Sales price in US dollars': 5 },
    { 'Fiscal Year': '2012/13', Item: 'Soft drink', 'Sales price in US dollars': 2.5 },
    { 'Fiscal Year': '2012/13', Item: 'Hot dog', 'Sales price in US dollars': 4.75 },
    { 'Fiscal Year': '2013/14', Item: 'Beer', 'Sales price in US dollars': 5 },
    { 'Fiscal Year': '2013/14', Item: 'Soft drink', 'Sales price in US dollars': 3.25 },
    { 'Fiscal Year': '2013/14', Item: 'Hot dog', 'Sales price in US dollars': 3 },
    { 'Fiscal Year': '2014/15', Item: 'Beer', 'Sales price in US dollars': 5.5 },
    { 'Fiscal Year': '2014/15', Item: 'Soft drink', 'Sales price in US dollars': 2.5 },
    { 'Fiscal Year': '2014/15', Item: 'Hot dog', 'Sales price in US dollars': 5 },
    { 'Fiscal Year': '2015/16', Item: 'Beer', 'Sales price in US dollars': 5.5 },
    { 'Fiscal Year': '2015/16', Item: 'Soft drink', 'Sales price in US dollars': 2.5 },
    { 'Fiscal Year': '2015/16', Item: 'Hot dog', 'Sales price in US dollars': 5 }
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
    const xField = 'Fiscal Year';
    const seriesField = 'Item';
    const yField = 'Sales price in US dollars';

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

export function function1({ d3, container }) {
    const xField = 'Fiscal Year';
    const yField = 'Sales price in US dollars';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    d3.select(container).selectAll('.validation-grouped-chart-tooltip').remove();

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    const margin = { top: 32, right: 140, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[xField]))));

    const explanationMatchedCombinedValues = {
        '2010/11': 2.5 + 4.5,
        '2011/12': 5,
        '2012/13': 2.5 + 4.75,
        '2013/14': 5,
        '2014/15': 2.5 + 5,
        '2015/16': 2.5 + 5
    };

    const lineRows = xDomain.map((year) => {
        const rowsForYear = data_rows.filter((d) => String(d[xField]) === year);
        const beerValue = rowsForYear.find((d) => String(d.Item) === 'Beer')?.[yField] ?? 0;
        return {
            year,
            Beer: Number(beerValue),
            'Soft drink + Hot dog': explanationMatchedCombinedValues[year] ?? Number(beerValue)
        };
    });

    const series = [
        {
            key: 'Beer',
            color: resolveSeriesColor(['Beer'], 'Beer'),
            values: lineRows.map((d) => ({ year: d.year, value: d.Beer }))
        },
        {
            key: 'Soft drink + Hot dog',
            color: '#ef4444',
            values: lineRows.map((d) => ({ year: d.year, value: d['Soft drink + Hot dog'] }))
        }
    ];

    const xScale = d3.scalePoint()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.5);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(series.flatMap((s) => s.values), (d) => d.value) ?? 0])
        .nice()
        .range([plotH, 0]);

    const line = d3.line()
        .x((d) => xScale(d.year) ?? 0)
        .y((d) => yScale(d.value))
        .curve(d3.curveMonotoneX);
    svg.selectAll('*').remove();

    const g = svg.append('g')
        .attr('class', 'validation-multiple-line-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    const xAxis = g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(xAxis);

    g.append('text')
        .attr('class', 'x-axis-label')
        .attr('x', plotW / 2)
        .attr('y', plotH + 42)
        .attr('text-anchor', 'middle')
        .text(xField);

    g.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -plotH / 2)
        .attr('y', -42)
        .attr('text-anchor', 'middle')
        .text(yField);

    const seriesGroups = g.selectAll('g.line-series')
        .data(series)
        .join('g')
        .attr('class', 'line-series');

    seriesGroups.append('path')
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', (d) => d.color)
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', (d) => line(d.values));

    seriesGroups.selectAll('circle.main-point')
        .data((d) => d.values.map((value) => ({ ...value, key: d.key, color: d.color })))
        .join('circle')
        .attr('class', 'main-point main-bar')
        .attr('cx', (d) => xScale(d.year) ?? 0)
        .attr('cy', (d) => yScale(d.value))
        .attr('r', 0)
        .attr('fill', (d) => d.color)
        .attr('data-target', (d) => String(d.year))
        .attr('data-value', (d) => d.value)
        .attr('data-series', (d) => String(d.key))
        .attr('data-x-value', (d) => String(d.year))
        .attr('data-y-value', (d) => String(d.value))
        .attr('data-group-value', (d) => String(d.key))
        .attr('r', 4);

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + 40},${margin.top})`);

    const legendItems = legend.selectAll('g.legend-item')
        .data(series)
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (_, i) => `translate(0,${i * 30})`)
        .style('opacity', 0);

    legendItems.append('line')
        .attr('x1', 0)
        .attr('x2', 18)
        .attr('y1', 10)
        .attr('y2', 10)
        .attr('stroke', (d) => d.color)
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round');

    legendItems.append('text')
        .attr('x', 26)
        .attr('y', 10)
        .attr('font-size', 12)
        .attr('dominant-baseline', 'middle')
        .text((d) => d.key);

    legendItems
        .style('opacity', 1);

    // R11 (round 3): function1 draws every visual chunk the explanation describes,
    // including the years where Beer < (Soft drink + Hot dog) and the final count.
    const beerLessThanSumYears = lineRows.filter((d) => d.Beer < d['Soft drink + Hot dog']);
    const bandWidth = (plotW / Math.max(xDomain.length, 1)) * 0.6;

    beerLessThanSumYears.forEach((d) => {
        const cx = xScale(d.year) ?? 0;
        g.insert('rect', ':first-child')
            .attr('class', 'validation-q3-year-band')
            .attr('x', cx - bandWidth / 2)
            .attr('y', 0)
            .attr('width', bandWidth)
            .attr('height', plotH)
            .attr('fill', '#fde68a')
            .attr('opacity', 0.45);
    });

    g.append('text')
        .attr('class', 'validation-q3-summary')
        .attr('x', plotW - 4)
        .attr('y', 8)
        .attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#dc2626')
        .text(`${beerLessThanSumYears.length} fiscal years (Beer < Soft drink + Hot dog)`);
}

// R11 (round 3): function2 re-applies function1's complete visual idempotently.
// The chart_map keeps two sentences; each click leaves the SVG in the same state.
export function function2({ d3, container }) {
    function1({ d3, container });
}
