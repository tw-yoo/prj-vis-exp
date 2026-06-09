import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2006, 'Net income in USD': 1209.9 },
    { Year: 2007, 'Net income in USD': 1584.9 },
    { Year: 2008, 'Net income in USD': 1979 },
    { Year: 2009, 'Net income in USD': 2636 },
    { Year: 2010, 'Net income in USD': 2901 },
    { Year: 2011, 'Net income in USD': 2804 },
    { Year: 2012, 'Net income in USD': 2592 },
    { Year: 2013, 'Net income in USD': 3075 },
    { Year: 2014, 'Net income in USD': 12101 },
    { Year: 2015, 'Net income in USD': 18108 },
    { Year: 2016, 'Net income in USD': 13501 },
    { Year: 2017, 'Net income in USD': 4628 },
    { Year: 2018, 'Net income in USD': 5455 },
    { Year: 2019, 'Net income in USD': 5386 },
    { Year: 2020, 'Net income in USD': 123 }
];

function injectChartStyles() {
    if (document.getElementById('validation-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-chart-styles';
    style.textContent = `
        .validation-chart-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-chart-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-chart-host .x-axis line,
        .validation-chart-host .x-axis path,
        .validation-chart-host .y-axis line,
        .validation-chart-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-chart-host .x-axis text,
        .validation-chart-host .y-axis text,
        .validation-chart-host .x-axis-label,
        .validation-chart-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-chart-host .main-bar {
            cursor: pointer;
        }
        .validation-chart-tooltip {
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
        .validation-chart-tooltip[hidden] {
            display: none;
        }
        .validation-chart-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-chart-tooltip__label {
            color: #6b7280;
            font-size: 12px;
        }
        .validation-chart-tooltip__value {
            color: #111827;
            font-size: 13px;
            font-weight: 600;
            text-align: right;
        }
    `;
    document.head.appendChild(style);
}

export function renderValidationSimpleBarChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    injectChartStyles();

    const data = data_rows;
    const xField = 'Year';
    const yField = 'Net income in USD';

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Clear previous content
    container.innerHTML = '';
    container.classList.add('validation-chart-host');

    const xDomain = data.map((d) => String(d[xField]));
    const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite);
    const maxY = Math.max(0, ...yValues);
    const minY = Math.min(0, ...yValues);

    const xScale = d3.scaleBand()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.2);

    const yScale = d3.scaleLinear()
        .domain([minY, maxY])
        .nice()
        .range([plotH, 0]);

    const zeroY = yScale(0);

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

    // Bars
    g.selectAll('rect.main-bar')
        .data(data)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(String(d[xField])))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => {
            const v = Number(d[yField]);
            return v >= 0 ? yScale(v) : zeroY;
        })
        .attr('height', (d) => Math.abs(yScale(Number(d[yField])) - zeroY))
        .attr('fill', '#69b3a2')
        .attr('opacity', 1)
        .attr('data-target', (d) => String(d[xField]))
        .attr('data-value', (d) => Number(d[yField]))
        .attr('data-x-value', (d) => String(d[xField]))
        .attr('data-y-value', (d) => String(Number(d[yField])));

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-chart-tooltip__row">
            <span class="validation-chart-tooltip__label">label</span>
            <span class="validation-chart-tooltip__value" id="tt-x-val"></span>
        </div>
        <div class="validation-chart-tooltip__row">
            <span class="validation-chart-tooltip__label">value</span>
            <span class="validation-chart-tooltip__value" id="tt-y-val"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, d) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#tt-x-val').textContent = String(d[xField]);
            tooltip.querySelector('#tt-y-val').textContent = String(Number(d[yField]));
        })
        .on('mousemove', function (event) {
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left + 12;
            const y = event.clientY - rect.top - 10;
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        })
        .on('mouseout', function () {
            tooltip.setAttribute('hidden', '');
        });
}

function getNetIncomeMetrics({ d3, container }) {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand()
        .domain(data_rows.map((d) => String(d.Year)))
        .range([0, plotW])
        .padding(0.2);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data_rows, (d) => d['Net income in USD']) ?? 1])
        .nice()
        .range([plotH, 0]);
    return { svg: d3.select(container).select('svg'), g: d3.select(container).select('svg > g'), plotH, xScale, yScale };
}

export function function1({ d3, container }) {
    const csvYears = ['2010', '2011', '2012', '2013', '2014', '2015'];
    const { g, plotH, xScale } = getNetIncomeMetrics({ d3, container });

    g.selectAll('.e7-q6-function1').remove();
    const x1 = xScale(csvYears[0]) ?? 0;
    const x2 = (xScale(csvYears[csvYears.length - 1]) ?? 0) + xScale.bandwidth();
    g.insert('rect', ':first-child')
        .attr('class', 'e7-q6-function1')
        .attr('x', x1 - 4)
        .attr('y', 0)
        .attr('width', x2 - x1 + 8)
        .attr('height', plotH)
        .attr('fill', '#fef3c7')
        .attr('opacity', 0.75);
}

export function function2({ d3, container }) {
    const csvValues = [
        { year: '2010', cumulative: 2901 },
        { year: '2011', cumulative: 5705 },
        { year: '2012', cumulative: 8297 },
        { year: '2013', cumulative: 11372 },
        { year: '2014', cumulative: 23473 },
        { year: '2015', cumulative: 41581 },
    ];
    function1({ d3, container });

    const { svg, g, xScale, yScale } = getNetIncomeMetrics({ d3, container });
    const markerId = 'e7-q6-cumulative-arrow';
    svg.select(`#${markerId}`).remove();
    svg.append('defs')
        .append('marker')
        .attr('id', markerId)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#dc2626');

    g.selectAll('.e7-q6-function2').remove();
    csvValues.forEach((datum, index) => {
        const rawValue = Number(data_rows.find((d) => String(d.Year) === datum.year)?.['Net income in USD'] ?? 0);
        const x = (xScale(datum.year) ?? 0) + xScale.bandwidth() / 2;
        const y = yScale(rawValue);

        g.append('text')
            .attr('class', 'e7-q6-function2')
            .attr('x', x)
            .attr('y', y - 8)
            .attr('text-anchor', 'middle')
            .attr('font-size', 11)
            .attr('font-weight', 800)
            .attr('fill', '#dc2626')
            .text(String(datum.cumulative));

        const next = csvValues[index + 1];
        if (!next) return;
        const nextRawValue = Number(data_rows.find((d) => String(d.Year) === next.year)?.['Net income in USD'] ?? 0);
        const nextX = (xScale(next.year) ?? 0) + xScale.bandwidth() / 2;
        const nextY = yScale(nextRawValue);
        g.append('line')
            .attr('class', 'e7-q6-function2')
            .attr('x1', x)
            .attr('y1', y - 4)
            .attr('x2', nextX)
            .attr('y2', nextY - 4)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', 1.8)
            .attr('marker-end', `url(#${markerId})`);
    });
}

export function function3({ d3, container }) {}
