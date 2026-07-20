import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { City: 'Delhi', Year: 2025, 'Population in millions': 28.6 },
    { City: 'Delhi', Year: 2010, 'Population in millions': 22.2 },
    { City: 'Mumbai', Year: 2025, 'Population in millions': 25.8 },
    { City: 'Mumbai', Year: 2010, 'Population in millions': 20 },
    { City: 'New York-Newark', Year: 2025, 'Population in millions': 20.6 },
    { City: 'New York-Newark', Year: 2010, 'Population in millions': 19.4 },
    { City: 'Calcutta', Year: 2025, 'Population in millions': 20.1 },
    { City: 'Calcutta', Year: 2010, 'Population in millions': 15.6 },
    { City: 'Dhaka', Year: 2025, 'Population in millions': 20.9 },
    { City: 'Dhaka', Year: 2010, 'Population in millions': 14.6 },
    { City: 'Karachi', Year: 2025, 'Population in millions': 18.7 },
    { City: 'Karachi', Year: 2010, 'Population in millions': 13.1 }
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
    const xField = 'City';
    const seriesField = 'Year';
    const yField = 'Population in millions';

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

function drawCityPopulationJumps({ d3, container, highlightCity = null }) {
    const csvJumps = {
        Delhi: 6.4,
        Mumbai: 5.8,
        'New York-Newark': 1.2,
        Calcutta: 4.5,
        Dhaka: 6.3,
        Karachi: 5.6,
    };
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const markerId = 'e7-q3-jump-marker';

    svg.select(`#${markerId}`).remove();
    svg.append('defs')
        .append('marker')
        .attr('id', markerId)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 10)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5L3,0Z')
        .attr('fill', '#dc2626');

    g.selectAll('.e7-q3-annotation').remove();
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (d) => (!highlightCity || d.category === highlightCity ? 1 : 0.2))
        .attr('stroke', (d) => (d.category === highlightCity ? '#111827' : 'none'))
        .attr('stroke-width', (d) => (d.category === highlightCity ? 1.5 : 0));

    Object.entries(csvJumps).forEach(([city, jump]) => {
        const bars = d3.select(container).selectAll('rect.main-bar')
            .filter((d) => d.category === city)
            .nodes()
            .map((node) => ({ node, datum: d3.select(node).datum() }));
        const high = bars.find((bar) => String(bar.datum.series) === '2025');
        const low = bars.find((bar) => String(bar.datum.series) === '2010');
        if (!high || !low) return;

        const highBar = d3.select(high.node);
        const lowBar = d3.select(low.node);
        const highY = Number(highBar.attr('y'));
        const lowY = Number(lowBar.attr('y'));
        const groupLeft = Math.min(Number(highBar.attr('x')), Number(lowBar.attr('x')));
        const groupRight = Math.max(Number(highBar.attr('x')) + Number(highBar.attr('width')), Number(lowBar.attr('x')) + Number(lowBar.attr('width')));
        const arrowX = Number(lowBar.attr('x')) + Number(lowBar.attr('width')) / 2;
        const isFocus = !highlightCity || city === highlightCity;

        g.append('line')
            .attr('class', 'e7-q3-annotation')
            .attr('x1', groupLeft)
            .attr('x2', groupRight)
            .attr('y1', highY)
            .attr('y2', highY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', city === highlightCity ? 2.8 : 1.6)
            .attr('opacity', isFocus ? 1 : 0.2);

        g.append('line')
            .attr('class', 'e7-q3-annotation')
            .attr('x1', arrowX)
            .attr('x2', arrowX)
            .attr('y1', lowY)
            .attr('y2', highY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', city === highlightCity ? 2.8 : 1.6)
            .attr('opacity', isFocus ? 1 : 0.2)
            // Single-sided (E7 feedback): a population jump is a directional
            // change over time, so the arrow points up to the 2025 value only.
            .attr('marker-end', `url(#${markerId})`);

        g.append('text')
            .attr('class', 'e7-q3-annotation')
            .attr('x', arrowX + 5)
            .attr('y', (lowY + highY) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', city === highlightCity ? 12 : 10)
            .attr('font-weight', city === highlightCity ? 800 : 700)
            .attr('fill', '#dc2626')
            .attr('opacity', isFocus ? 1 : 0.2)
            .text(`+${jump}`);
    });

    if (highlightCity) {
        g.selectAll('.x-axis text')
            .attr('font-size', function () {
                return d3.select(this).text() === highlightCity ? 14 : 11;
            })
            .attr('font-weight', function () {
                return d3.select(this).text() === highlightCity ? 800 : 400;
            })
            .attr('fill', function () {
                return d3.select(this).text() === highlightCity ? '#dc2626' : '#000000';
            });
    }
}

export function function1({ d3, container }) {
    drawCityPopulationJumps({ d3, container });
}

export function function2({ d3, container }) {
    drawCityPopulationJumps({ d3, container, highlightCity: 'Delhi' });
}

export function function3({ d3, container }) {}
