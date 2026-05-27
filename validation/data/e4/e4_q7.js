import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Season: '2015/16', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1090 },
    { Season: '2015/16', Revenue_Type: 'Matchday', Revenue_Million_Euros: 622 },
    { Season: '2015/16', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 1927 },
    { Season: '2016/17', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1168 },
    { Season: '2016/17', Revenue_Type: 'Matchday', Revenue_Million_Euros: 620 },
    { Season: '2016/17', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 2768 },
    { Season: '2017/18', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1305 },
    { Season: '2017/18', Revenue_Type: 'Matchday', Revenue_Million_Euros: 670 },
    { Season: '2017/18', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 2844 },
    { Season: '2018/19', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1592 },
    { Season: '2018/19', Revenue_Type: 'Matchday', Revenue_Million_Euros: 763 },
    { Season: '2018/19', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 3406 },
    { Season: '2019/20', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1731 },
    { Season: '2019/20', Revenue_Type: 'Matchday', Revenue_Million_Euros: 614 },
    { Season: '2019/20', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 2457 },
    { Season: '2020/21', Revenue_Type: 'Commercial', Revenue_Million_Euros: 1508 },
    { Season: '2020/21', Revenue_Type: 'Matchday', Revenue_Million_Euros: 391 },
    { Season: '2020/21', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 4133 }
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

const E4_Q7_X_FIELD = 'Season';
const E4_Q7_SERIES_FIELD = 'Revenue_Type';
const E4_Q7_Y_FIELD = 'Revenue_Million_Euros';

function buildE4Q7Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E4_Q7_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E4_Q7_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E4_Q7_X_FIELD]) === cat && String(d[E4_Q7_SERIES_FIELD]) === ser)?.[E4_Q7_Y_FIELD] ?? 0,
            );
            const y1 = y0 + value;
            segments.push({ target: cat, series: ser, value, y0, y1 });
            y0 = y1;
        });
    });
    return { xDomain, seriesDomain, segments };
}

export function renderValidationStackedBarChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    injectStackedChartStyles();

    const { xDomain, seriesDomain, segments } = buildE4Q7Segments();
    const seriesLabels = Object.fromEntries(seriesDomain.map((s) => [s, s]));
    const getSeriesColor = (key) => {
        const index = seriesDomain.indexOf(String(key));
        return WORKBENCH_PALETTE[index >= 0 ? index % WORKBENCH_PALETTE.length : 0];
    };

    // Canvas / layout constants matching e10 stacked validation charts
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xScale = d3.scaleBand()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.2);

    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);

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

    // Stacked bars — class "main-bar" matches Workbench
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
        // Workbench data attributes
        .attr('data-target', (s) => s.target)
        .attr('data-value', (s) => s.value)
        .attr('data-series', (s) => s.series)
        .attr('data-x-value', (s) => s.target)
        .attr('data-y-value', (s) => String(s.value))
        .attr('data-group-value', (s) => s.series);

    // Color legend
    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${legendX},${margin.top})`);

    const legendRowH = 22;

    seriesDomain.forEach((key, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 8;

        legend.append('circle')
            .attr('class', 'validation-legend-swatch')
            .attr('data-series', key)
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', getSeriesColor(key))
            .attr('opacity', 0.85);

        legend.append('text')
            .attr('class', 'validation-legend-label')
            .attr('data-series', key)
            .attr('x', 20)
            .attr('y', cy)
            .attr('font-size', 11)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('fill', '#000000')
            .text(seriesLabels[key]);
    });

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-stacked-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">year</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">series</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">value</span>
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

function getE4Q7Geometry(d3) {
    const { xDomain, seriesDomain, segments } = buildE4Q7Segments();
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const maxY = d3.max(segments, (s) => s.y1) ?? 0;
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);
    return { xDomain, seriesDomain, segments, plotW, plotH, xScale, yScale, margin, legendOffsetX };
}

const E4_Q7_FOCUS = new Set(['Matchday', 'Commercial']);

function getE4Q7Averages() {
    const { segments } = buildE4Q7Segments();
    const avg = (ser) => {
        const rows = segments.filter((s) => s.series === ser);
        return rows.reduce((sum, r) => sum + r.value, 0) / Math.max(rows.length, 1);
    };
    return { avgCommercial: avg('Commercial'), avgMatchday: avg('Matchday') };
}

export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            return E4_Q7_FOCUS.has(this.getAttribute('data-series')) ? 1 : 0.18;
        });

    svg.selectAll('.validation-legend-swatch')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            return E4_Q7_FOCUS.has(this.getAttribute('data-series')) ? 0.95 : 0.25;
        });
    svg.selectAll('.validation-legend-label')
        .transition()
        .duration(600)
        .attr('fill-opacity', function () {
            return E4_Q7_FOCUS.has(this.getAttribute('data-series')) ? 1 : 0.35;
        })
        .attr('font-weight', function () {
            return E4_Q7_FOCUS.has(this.getAttribute('data-series')) ? 700 : 400;
        });
}

export function function2({ d3, container }) {
    const { segments, xScale, yScale } = getE4Q7Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q7-segment-label').remove();

    segments.forEach((s) => {
        if (!E4_Q7_FOCUS.has(s.series)) return;
        const cx = (xScale(s.target) ?? 0) + xScale.bandwidth() / 2;
        const cy = (yScale(s.y0) + yScale(s.y1)) / 2;
        const segH = Math.abs(yScale(s.y0) - yScale(s.y1));
        if (segH < 12) return;
        g.append('text')
            .attr('class', 'validation-q7-segment-label')
            .attr('x', cx)
            .attr('y', cy)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#ffffff')
            .attr('opacity', 0)
            .text(s.value)
            .transition()
            .duration(600)
            .attr('opacity', 1);
    });
}

export function function3({ d3, container }) {
    const { margin, plotW, legendOffsetX } = getE4Q7Geometry(d3);
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    svg.selectAll('.validation-q7-summary').remove();

    const { avgCommercial, avgMatchday } = getE4Q7Averages();
    const summary = svg.append('g')
        .attr('class', 'validation-q7-summary')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top + 130})`);

    summary.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', 190)
        .attr('height', 100)
        .attr('rx', 8)
        .attr('fill', '#ffffff')
        .attr('stroke', '#cbd5e1')
        .attr('opacity', 0)
        .transition()
        .duration(500)
        .attr('opacity', 1);

    const drawRow = (yOffset, label, value, color) => {
        summary.append('circle')
            .attr('cx', 14)
            .attr('cy', yOffset)
            .attr('r', 5)
            .attr('fill', color)
            .attr('opacity', 0)
            .transition().duration(500).attr('opacity', 1);
        summary.append('text')
            .attr('x', 26)
            .attr('y', yOffset)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 12)
            .attr('fill', '#111827')
            .attr('opacity', 0)
            .text(`${label}: ${value.toFixed(0)} M€`)
            .transition().duration(500).attr('opacity', 1);
    };

    drawRow(22, 'avg Commercial', avgCommercial, '#f97316');
    drawRow(48, 'avg Matchday', avgMatchday, '#4f46e5');

    summary.append('text')
        .attr('x', 14)
        .attr('y', 80)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 14)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`Δ ${(avgCommercial - avgMatchday).toFixed(0)} M€`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
