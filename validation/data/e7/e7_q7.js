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

export function renderValidationStackedBarChart({ container }) {
    const seriesKeys = ['desktop', 'mobile', 'tablet'];
    const seriesLabels = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' };
    const getSeriesColor = (key) => {
        const index = seriesKeys.indexOf(key);
        return WORKBENCH_PALETTE[index] ?? WORKBENCH_PALETTE[0];
    };

    injectStackedChartStyles();

    const data = data_rows;

    // Canvas / layout constants matching e10 stacked validation charts
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    // Build stacked segments using d3.stack (same logic as Workbench buildStackedSegments)
    const stackedData = d3.stack().keys(seriesKeys)(data);

    // Flatten to StackedSegment objects matching Workbench's data model:
    // { target, series, value, y0, y1 }
    const segments = [];
    stackedData.forEach((layer) => {
        layer.forEach((d) => {
            segments.push({
                target: d.data.year,
                series: layer.key,
                value: d.data[layer.key],
                y0: d[0],
                y1: d[1],
            });
        });
    });

    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xDomain = data.map((d) => d.year);

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

    const legendRowH = 24;

    seriesKeys.forEach((key, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 8;

        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', getSeriesColor(key))
            .attr('opacity', 0.85);

        legend.append('text')
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

function renderMethodFrequencyComparison({ d3, container, highlightMethod = null }) {
    const selectedFrequencies = ['EVERY DAY', 'LESS OFTEN'];
    const csvTarget = { method: 'Text messaging', difference: 0.42 };
    const methods = Array.from(new Set(data_rows.map((d) => d.Method)));
    const rows = methods.map((method) => {
        const row = { method };
        selectedFrequencies.forEach((frequency) => {
            row[frequency] = Number(data_rows.find((d) => d.Method === method && d.Frequency === frequency)?.Share_of_Respondents ?? 0);
        });
        row.difference = method === csvTarget.method
            ? csvTarget.difference
            : Math.abs(row['EVERY DAY'] - row['LESS OFTEN']);
        return row;
    });

    injectStackedChartStyles();
    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 132, bottom: 62, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(methods).range([0, plotW]).paddingInner(0.18).paddingOuter(0.08);
    const innerScale = d3.scaleBand().domain(selectedFrequencies).range([0, xScale.bandwidth()]).padding(0.08);
    const yScale = d3.scaleLinear().domain([0, d3.max(rows, (d) => Math.max(d['EVERY DAY'], d['LESS OFTEN'])) ?? 1]).nice().range([plotH, 0]);
    const color = d3.scaleOrdinal().domain(selectedFrequencies).range(['#4f46e5', '#14b8a6']);
    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const markerId = 'e7-q7-difference-arrow';
    svg.append('defs').append('marker')
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
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    const bars = rows.flatMap((row) => selectedFrequencies.map((frequency) => ({ method: row.method, frequency, value: row[frequency], difference: row.difference })));
    g.selectAll('rect.main-bar')
        .data(bars)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => (xScale(d.method) ?? 0) + (innerScale(d.frequency) ?? 0))
        .attr('width', innerScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', (d) => color(d.frequency))
        .attr('opacity', (d) => (!highlightMethod || d.method === highlightMethod ? 1 : 0.22))
        .attr('data-target', (d) => d.method)
        .attr('data-series', (d) => d.frequency)
        .attr('data-value', (d) => String(d.value));

    rows.forEach((row) => {
        const values = selectedFrequencies.map((frequency) => ({ frequency, value: row[frequency] })).sort((a, b) => b.value - a.value);
        const high = values[0];
        const low = values[1];
        const x = (xScale(row.method) ?? 0) + (innerScale(low.frequency) ?? 0) + innerScale.bandwidth() / 2;
        const highY = yScale(high.value);
        const lowY = yScale(low.value);
        const left = xScale(row.method) ?? 0;
        const right = left + xScale.bandwidth();
        const isFocus = !highlightMethod || row.method === highlightMethod;
        const isHighlight = row.method === highlightMethod;

        g.append('line')
            .attr('class', 'e7-q7-annotation')
            .attr('x1', left + 4)
            .attr('x2', right - 4)
            .attr('y1', highY)
            .attr('y2', highY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', isHighlight ? 2.8 : 1.6)
            .attr('opacity', isFocus ? 1 : 0.22);

        g.append('line')
            .attr('class', 'e7-q7-annotation')
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', lowY)
            .attr('y2', highY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', isHighlight ? 2.8 : 1.6)
            .attr('opacity', isFocus ? 1 : 0.22)
            .attr('marker-start', `url(#${markerId})`)
            .attr('marker-end', `url(#${markerId})`);

        g.append('text')
            .attr('class', 'e7-q7-annotation')
            .attr('x', x + 5)
            .attr('y', (highY + lowY) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', isHighlight ? 12 : 10)
            .attr('font-weight', isHighlight ? 800 : 700)
            .attr('fill', '#dc2626')
            .attr('opacity', isFocus ? 1 : 0.22)
            .text(row.difference.toFixed(2));
    });

    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${margin.left + plotW + 24},${margin.top})`);
    selectedFrequencies.forEach((frequency, index) => {
        const y = index * 24 + 8;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', color(frequency));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 11).text(frequency);
    });
}

export function function1({ d3, container }) {
    renderMethodFrequencyComparison({ d3, container });
}

export function function2({ d3, container }) {
    renderMethodFrequencyComparison({ d3, container, highlightMethod: 'Text messaging' });
}

export function function3({ d3, container }) {}
