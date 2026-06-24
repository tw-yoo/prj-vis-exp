import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Method: 'In person', Frequency: 'EVERY DAY', Share_of_Respondents: 0.25 },
    { Method: 'In person', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.39 },
    { Method: 'In person', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.32 },
    { Method: 'Text messaging', Frequency: 'EVERY DAY', Share_of_Respondents: 0.55 },
    { Method: 'Text messaging', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.2 },
    { Method: 'Text messaging', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.13 },
    { Method: 'Talking on the phone', Frequency: 'EVERY DAY', Share_of_Respondents: 0.19 },
    { Method: 'Talking on the phone', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.24 },
    { Method: 'Talking on the phone', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.41 },
    { Method: 'Instant messaging', Frequency: 'EVERY DAY', Share_of_Respondents: 0.27 },
    { Method: 'Instant messaging', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.26 },
    { Method: 'Instant messaging', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.25 },
    { Method: 'On social media sites', Frequency: 'EVERY DAY', Share_of_Respondents: 0.23 },
    { Method: 'On social media sites', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.28 },
    { Method: 'On social media sites', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.21 },
    { Method: 'Emailing', Frequency: 'EVERY DAY', Share_of_Respondents: 0.06 },
    { Method: 'Emailing', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.14 },
    { Method: 'Emailing', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.43 },
    { Method: 'Video chatting', Frequency: 'EVERY DAY', Share_of_Respondents: 0.07 },
    { Method: 'Video chatting', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.14 },
    { Method: 'Video chatting', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.37 },
    { Method: 'Video gaming', Frequency: 'EVERY DAY', Share_of_Respondents: 0.13 },
    { Method: 'Video gaming', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.16 },
    { Method: 'Video gaming', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.24 },
    { Method: 'On messaging apps', Frequency: 'EVERY DAY', Share_of_Respondents: 0.14 },
    { Method: 'On messaging apps', Frequency: 'EVERY FEW DAYS', Share_of_Respondents: 0.11 },
    { Method: 'On messaging apps', Frequency: 'LESS OFTEN', Share_of_Respondents: 0.17 }
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

const E7_Q7_X_FIELD = 'Method';
const E7_Q7_SERIES_FIELD = 'Frequency';
const E7_Q7_Y_FIELD = 'Share_of_Respondents';

function buildE7_Q7Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E7_Q7_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E7_Q7_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E7_Q7_X_FIELD]) === cat && String(d[E7_Q7_SERIES_FIELD]) === ser)?.[E7_Q7_Y_FIELD] ?? 0,
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

    const { xDomain, seriesDomain, segments } = buildE7_Q7Segments();
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
            <span class="validation-stacked-chart-tooltip__label">${E7_Q7_X_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E7_Q7_SERIES_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E7_Q7_Y_FIELD}</span>
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


// Blur-in-place comparison of EVERY DAY vs LESS OFTEN (E7's same-layout
// principle): keep the stacked chart, dim the uncompared EVERY FEW DAYS
// segment, and label the two compared segments + their difference. A stacked
// segment's pixel HEIGHT equals value × scale regardless of its stack position,
// so the two bright segment thicknesses are directly comparable — no misleading
// vertical gap arrow needed.
const E7_Q7_COMPARED = new Set(['EVERY DAY', 'LESS OFTEN']);
const E7_Q7_TARGET = { method: 'Text messaging', difference: 0.42 };

function annotateMethodDifferences({ d3, container, highlightMethod = null }) {
    const bars = d3.select(container).selectAll('rect.main-bar');
    const g = d3.select(bars.node()?.parentNode);
    if (g.empty()) return;

    g.selectAll('.e7-q7-annotation').remove();

    const methods = Array.from(new Set(data_rows.map((d) => d.Method)));
    methods.forEach((method) => {
        const edSel = bars.filter((s) => s.target === method && s.series === 'EVERY DAY');
        const loSel = bars.filter((s) => s.target === method && s.series === 'LESS OFTEN');
        const edNode = edSel.node();
        const loNode = loSel.node();
        if (!edNode || !loNode) return;

        const vEd = edSel.datum().value;
        const vLo = loSel.datum().value;
        const diff = method === E7_Q7_TARGET.method ? E7_Q7_TARGET.difference : Math.abs(vEd - vLo);

        const isFocus = !highlightMethod || method === highlightMethod;
        const isHi = method === highlightMethod;
        const labelOpacity = isFocus ? 1 : 0.2;

        // Value label centered in each compared segment.
        [{ sel: edSel, node: edNode, v: vEd }, { sel: loSel, node: loNode, v: vLo }].forEach(({ node, v }) => {
            const x = Number(node.getAttribute('x')) + Number(node.getAttribute('width')) / 2;
            const y = Number(node.getAttribute('y')) + Number(node.getAttribute('height')) / 2;
            g.append('text')
                .attr('class', 'e7-q7-annotation')
                .attr('x', x)
                .attr('y', y)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('font-size', isHi ? 11 : 9)
                .attr('font-weight', 700)
                .attr('fill', '#ffffff')
                .attr('opacity', labelOpacity)
                .text(v.toFixed(2));
        });

        // Difference label above the bar (top segment = LESS OFTEN is topmost).
        const barLeft = Number(edNode.getAttribute('x'));
        const barWidth = Number(edNode.getAttribute('width'));
        const topY = Number(loNode.getAttribute('y'));
        g.append('text')
            .attr('class', 'e7-q7-annotation')
            .attr('x', barLeft + barWidth / 2)
            .attr('y', topY - 8)
            .attr('text-anchor', 'middle')
            .attr('font-size', isHi ? 13 : 10)
            .attr('font-weight', isHi ? 800 : 700)
            .attr('fill', '#dc2626')
            .attr('opacity', labelOpacity)
            .text(`Δ ${diff.toFixed(2)}`);
    });
}

export function function1({ d3, container }) {
    // Dim the uncompared frequency; keep EVERY DAY + LESS OFTEN bright.
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (s) => (E7_Q7_COMPARED.has(s.series) ? 1 : 0.18));
    annotateMethodDifferences({ d3, container });
}

export function function2({ d3, container }) {
    // Emphasize the winner (Text messaging); fade other methods' compared
    // segments so the largest difference stands out.
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (s) => {
            if (!E7_Q7_COMPARED.has(s.series)) return 0.18;
            return s.target === E7_Q7_TARGET.method ? 1 : 0.3;
        });
    annotateMethodDifferences({ d3, container, highlightMethod: E7_Q7_TARGET.method });
}

export function function3({ d3, container }) {}
