import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Platform: 'Facebook', Frequency: 'Several times a day', Percentage: 51 },
    { Platform: 'Facebook', Frequency: 'About once a day', Percentage: 23 },
    { Platform: 'Facebook', Frequency: 'Less often', Percentage: 26 },
    { Platform: 'Snapchat', Frequency: 'Several times a day', Percentage: 49 },
    { Platform: 'Snapchat', Frequency: 'About once a day', Percentage: 14 },
    { Platform: 'Snapchat', Frequency: 'Less often', Percentage: 36 },
    { Platform: 'Instagram', Frequency: 'Several times a day', Percentage: 38 },
    { Platform: 'Instagram', Frequency: 'About once a day', Percentage: 22 },
    { Platform: 'Instagram', Frequency: 'Less often', Percentage: 39 },
    { Platform: 'Twitter', Frequency: 'Several times a day', Percentage: 26 },
    { Platform: 'Twitter', Frequency: 'About once a day', Percentage: 20 },
    { Platform: 'Twitter', Frequency: 'Less often', Percentage: 53 },
    { Platform: 'YouTube', Frequency: 'Several times a day', Percentage: 29 },
    { Platform: 'YouTube', Frequency: 'About once a day', Percentage: 17 },
    { Platform: 'YouTube', Frequency: 'Less often', Percentage: 55 }
];

// Workbench default category color palette (DEFAULT_CATEGORY_COLORS)
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];

function injectStackedChartStyles() {
    if (document.getElementById('validation-stacked-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-stacked-chart-styles';
    style.textContent = `
        .validation-stacked-chart-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-stacked-chart-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-stacked-chart-host .x-axis line,
        .validation-stacked-chart-host .x-axis path,
        .validation-stacked-chart-host .y-axis line,
        .validation-stacked-chart-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-stacked-chart-host .x-axis text,
        .validation-stacked-chart-host .y-axis text,
        .validation-stacked-chart-host .x-axis-label,
        .validation-stacked-chart-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-stacked-chart-host .main-bar {
            cursor: pointer;
        }
        .validation-stacked-chart-host .color-legend text {
            fill: #000000;
            font-family: sans-serif;
        }
        .validation-stacked-chart-tooltip {
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
        .validation-stacked-chart-tooltip[hidden] { display: none; }
        .validation-stacked-chart-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-stacked-chart-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-stacked-chart-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

const E8_Q7_X_FIELD = 'Platform';
const E8_Q7_SERIES_FIELD = 'Frequency';
const E8_Q7_Y_FIELD = 'Percentage';

function buildE8_Q7Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E8_Q7_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E8_Q7_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E8_Q7_X_FIELD]) === cat && String(d[E8_Q7_SERIES_FIELD]) === ser)?.[E8_Q7_Y_FIELD] ?? 0,
            );
            const y1 = y0 + value;
            segments.push({ target: cat, series: ser, value, y0, y1 });
            y0 = y1;
        });
    });
    return { xDomain, seriesDomain, segments };
}

export function renderValidationStackedBarChart({ container }) {
    if (container.querySelector('svg')) { return; }
    injectStackedChartStyles();

    const { xDomain, seriesDomain, segments } = buildE8_Q7Segments();
    const seriesLabels = Object.fromEntries(seriesDomain.map((s) => [s, s]));
    const getSeriesColor = (key) => {
        const index = seriesDomain.indexOf(String(key));
        return WORKBENCH_PALETTE[index >= 0 ? index % WORKBENCH_PALETTE.length : 0];
    };

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(segments)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (s) => xScale(s.target))
        .attr('width', xScale.bandwidth())
        .attr('y', (s) => yScale(Math.max(s.y0, s.y1)))
        .attr('height', (s) => Math.abs(yScale(s.y0) - yScale(s.y1)))
        .attr('fill', (s) => getSeriesColor(s.series))
        .attr('opacity', 1)
        .attr('data-target', (s) => s.target)
        .attr('data-value', (s) => s.value)
        .attr('data-series', (s) => s.series)
        .attr('data-x-value', (s) => s.target)
        .attr('data-y-value', (s) => String(s.value))
        .attr('data-group-value', (s) => s.series);

    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    const legendRowH = 22;
    seriesDomain.forEach((key, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 8;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', getSeriesColor(key)).attr('opacity', 0.85);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 11).attr('dominant-baseline', 'middle').attr('font-family', 'sans-serif').attr('fill', '#000000').text(seriesLabels[key]);
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-stacked-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E8_Q7_X_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E8_Q7_SERIES_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E8_Q7_Y_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, s) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#stk-tt-x').textContent = s.target;
            tooltip.querySelector('#stk-tt-s').textContent = seriesLabels[s.series] ?? s.series;
            tooltip.querySelector('#stk-tt-y').textContent = String(s.value);
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


function renderMetaFrequencyChart({ d3, container, showSum = false }) {
    injectStackedChartStyles();

    const severalTimes = [
        { label: 'Facebook', value: 51 },
        { label: 'Instagram', value: 38 },
    ];
    const csvContributions = [
        { label: 'Facebook several', value: 51 },
        { label: 'Instagram several', value: 38 },
        { label: 'Facebook once', value: 23 },
        { label: 'Instagram once', value: 22 },
    ];
    const csvSum = 138;
    const data = showSum ? [...csvContributions, { label: 'Sum', value: csvSum, isSum: true }] : severalTimes;

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 36, bottom: 72, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    container.classList.add('validation-stacked-chart-host');

    const xScale = d3.scaleBand().domain(data.map((d) => d.label)).range([0, plotW]).padding(0.25);
    const yScale = d3.scaleLinear().domain([0, showSum ? csvSum : 60]).nice().range([plotH, 0]);

    // Use rebuildSvgInPlace (smooth crossfade) instead of container.innerHTML = '' wipe.
    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}` });
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    // Per reviewer: NO grow-from-bottom animation. Bars enter at their final
    // y/height directly. The rebuildSvgInPlace crossfade handles the visual
    // transition between function1 (2 bars) and function2 (5 bars).
    g.selectAll('rect.main-bar')
        .data(data)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.label))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', (d) => d.isSum ? '#dc2626' : '#2563eb')
        .attr('opacity', (d) => d.isSum ? 0.95 : 0.45)
        .attr('data-target', (d) => d.label)
        .attr('data-value', (d) => d.value);

    g.selectAll('text.e8-q7-value')
        .data(data)
        .join('text')
        .attr('class', 'e8-q7-value')
        .attr('x', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => yScale(d.value) - 7)
        .attr('text-anchor', 'middle')
        .attr('fill', (d) => d.isSum ? '#dc2626' : '#111827')
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .text((d) => d.value);

    if (!showSum) return;

    g.append('text')
        .attr('class', 'e8-q7-function2')
        .attr('x', plotW)
        .attr('y', 18)
        .attr('text-anchor', 'end')
        .attr('fill', '#dc2626')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .text('Sum: 138');
}

export function function1({ d3, container }) {
    renderMetaFrequencyChart({ d3, container, showSum: false });
}

export function function2({ d3, container }) {
    renderMetaFrequencyChart({ d3, container, showSum: true });
}

export function function3({ d3, container }) {}
