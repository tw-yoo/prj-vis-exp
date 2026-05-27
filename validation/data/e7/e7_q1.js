import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 1995, 'Installed base in million units': 64 },
    { Year: 1999, 'Installed base in million units': 54 },
    { Year: 2006, 'Installed base in million units': 64 },
    { Year: 2008, 'Installed base in million units': 63 },
    { Year: 2010, 'Installed base in million units': 109 },
    { Year: 2013, 'Installed base in million units': 128 },
    { Year: 2017, 'Installed base in million units': 105 }
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
    const yField = 'Installed base in million units';

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

function getInstalledBaseMetrics({ d3, container }) {
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
        .domain([0, d3.max(data_rows, (d) => d['Installed base in million units']) ?? 1])
        .nice()
        .range([plotH, 0]);
    return { svg: d3.select(container).select('svg'), g: d3.select(container).select('svg > g'), plotW, xScale, yScale };
}

function drawInstalledAverageLines({ d3, container }) {
    const csvAverages = [
        { key: 'before', years: ['1995', '1999'], value: 59, label: 'Before 2000 avg: 59', color: '#2563eb' },
        { key: 'after', years: ['2010', '2013', '2017'], value: 114, label: 'From 2010 avg: 114', color: '#dc2626' },
    ];
    const { g, xScale, yScale } = getInstalledBaseMetrics({ d3, container });

    g.selectAll('.e7-q1-function2').remove();
    csvAverages.forEach((avg) => {
        const x1 = xScale(avg.years[0]) ?? 0;
        const lastYear = avg.years[avg.years.length - 1];
        const x2 = (xScale(lastYear) ?? 0) + xScale.bandwidth();
        const y = yScale(avg.value);

        g.append('line')
            .attr('class', 'e7-q1-function2')
            .attr('x1', x1)
            .attr('x2', x2)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', avg.color)
            .attr('stroke-width', 2.4);

        g.append('text')
            .attr('class', 'e7-q1-function2')
            .attr('x', x2 + 6)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', avg.color)
            .text(avg.label);
    });
}

export function function1({ d3, container }) {
    const csvTargetYears = new Set(['1995', '1999', '2010', '2013', '2017']);
    d3.select(container).selectAll('.e7-q1-function1').remove();
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (d) => (csvTargetYears.has(String(d.Year)) ? 1 : 0.22))
        .attr('fill', (d) => (csvTargetYears.has(String(d.Year)) ? '#4f46e5' : '#9ca3af'));
}

export function function2({ d3, container }) {
    function1({ d3, container });
    drawInstalledAverageLines({ d3, container });
}

export function function3({ d3, container }) {
    function2({ d3, container });

    const csvDifference = 55;
    const { svg, g, xScale, yScale } = getInstalledBaseMetrics({ d3, container });
    const markerId = 'e7-q1-difference-arrow';
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
        .attr('fill', '#111827');

    g.selectAll('.e7-q1-function3').remove();
    const arrowX = ((xScale('1999') ?? 0) + xScale.bandwidth() + (xScale('2010') ?? 0)) / 2;
    const yBefore = yScale(59);
    const yAfter = yScale(114);

    g.append('line')
        .attr('class', 'e7-q1-function3')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', yAfter)
        .attr('y2', yBefore)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2)
        .attr('marker-start', `url(#${markerId})`)
        .attr('marker-end', `url(#${markerId})`);

    g.append('text')
        .attr('class', 'e7-q1-function3')
        .attr('x', arrowX + 8)
        .attr('y', (yBefore + yAfter) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 800)
        .attr('fill', '#111827')
        .text(String(csvDifference));
}
