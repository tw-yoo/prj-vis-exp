import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2005, 'Percentage of internet users': 8 },
    { Year: 2006, 'Percentage of internet users': 16 },
    { Year: 2008, 'Percentage of internet users': 29 },
    { Year: 2009, 'Percentage of internet users': 46 },
    { Year: 2010, 'Percentage of internet users': 61 },
    { Year: 2011, 'Percentage of internet users': 65 },
    { Year: 2012, 'Percentage of internet users': 67 },
    { Year: 2013, 'Percentage of internet users': 73 },
    { Year: 2014, 'Percentage of internet users': 74 },
    { Year: 2015, 'Percentage of internet users': 76 }
];

function injectSimpleLineStyles() {
    if (document.getElementById('validation-simple-line-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-simple-line-styles';
    style.textContent = `
        .validation-simple-line-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-simple-line-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-simple-line-host .x-axis line,
        .validation-simple-line-host .x-axis path,
        .validation-simple-line-host .y-axis line,
        .validation-simple-line-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-simple-line-host .x-axis text,
        .validation-simple-line-host .y-axis text,
        .validation-simple-line-host .x-axis-label,
        .validation-simple-line-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-simple-line-tooltip {
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
        .validation-simple-line-tooltip[hidden] { display: none; }
        .validation-simple-line-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-simple-line-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-simple-line-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationSimpleLineChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    const xField = 'Year';
    const yField = 'Percentage of internet users';

    injectSimpleLineStyles();

    const data = data_rows;

    // Derive domain from data (preserves insertion order)
    const xDomain = Array.from(new Set(data.map((d) => String(d[xField]))));
    const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite);
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;

    // Build RenderPoint objects matching Workbench's shape { target, yValue, xDisplayLabel }
    const points = xDomain.map((label) => {
        const row = data.find((d) => String(d[xField]) === label);
        return {
            target: label,
            xDisplayLabel: label,
            yValue: Number(row?.[yField] ?? 0),
        };
    }).filter((p) => Number.isFinite(p.yValue));

    // Canvas / layout constants matching Workbench defaults
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // X: scalePoint for nominal values (Workbench default for nominal x)
    const xScale = d3.scalePoint()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.5);

    // Y: linear, no forced zero (Workbench default for line charts)
    const domainMin = minY === maxY ? minY - 1 : minY;
    const domainMax = minY === maxY ? maxY + 1 : maxY;
    const yScale = d3.scaleLinear()
        .domain([domainMin, domainMax])
        .nice()
        .range([plotH, 0]);

    // Workbench line style defaults
    const lineStroke = '#4f46e5';
    const lineStrokeWidth = 2;
    const pointRadius = 4;

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-simple-line-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        // Store margin as data attributes (same as Workbench) for function1/2 offset calc
        .attr('data-m-left', margin.left)
        .attr('data-m-top', margin.top)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Y axis (6 ticks — matches Workbench)
    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(6));

    // X axis
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    // Line path — class="main-line" for function1/2 selection
    const lineGenerator = d3.line()
        .x((p) => xScale(p.target))
        .y((p) => yScale(p.yValue));

    g.append('path')
        .datum(points)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', lineStroke)
        .attr('stroke-width', lineStrokeWidth)
        .attr('opacity', 1)
        .attr('d', lineGenerator);

    // Point circles — no class (Workbench style); use data-target for selection
    g.selectAll('circle[data-target]')
        .data(points)
        .join('circle')
        .attr('cx', (p) => xScale(p.target))
        .attr('cy', (p) => yScale(p.yValue))
        .attr('r', pointRadius)
        .attr('fill', lineStroke)
        .attr('opacity', 0.85)
        // Workbench data attributes
        .attr('data-target', (p) => p.target)
        .attr('data-value', (p) => String(p.yValue))
        .attr('data-x-value', (p) => p.xDisplayLabel)
        .attr('data-y-value', (p) => String(p.yValue));

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-simple-line-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${xField}</span>
            <span class="validation-simple-line-tooltip__value" id="ln-tt-x"></span>
        </div>
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${yField}</span>
            <span class="validation-simple-line-tooltip__value" id="ln-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('circle[data-target]')
        .on('mouseover', function (event, p) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#ln-tt-x').textContent = p.xDisplayLabel;
            tooltip.querySelector('#ln-tt-y').textContent = String(p.yValue);
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

function getInternetLineMetrics({ d3, container }) {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scalePoint()
        .domain(data_rows.map((d) => String(d.Year)))
        .range([0, plotW])
        .padding(0.5);
    const yScale = d3.scaleLinear()
        .domain([d3.min(data_rows, (d) => d['Percentage of internet users']) ?? 0, d3.max(data_rows, (d) => d['Percentage of internet users']) ?? 1])
        .nice()
        .range([plotH, 0]);
    return { svg: d3.select(container).select('svg'), g: d3.select(container).select('svg > g'), plotW, xScale, yScale };
}

function drawInternetAverageSegments({ d3, container }) {
    const csvGroups = [
        { key: 'upTo2010', years: ['2005', '2006', '2008', '2009', '2010'], average: 32.0, color: '#2563eb' },
        { key: 'from2011', years: ['2011', '2012', '2013', '2014', '2015'], average: 52.5, color: '#dc2626' },
    ];
    const { g, xScale, yScale } = getInternetLineMetrics({ d3, container });
    const line = d3.line()
        .x((d) => xScale(String(d.Year)))
        .y((d) => yScale(d['Percentage of internet users']));

    d3.select(container).select('.main-line').attr('opacity', 0.12);
    g.selectAll('.e7-q9-function1').remove();

    csvGroups.forEach((group) => {
        const points = data_rows.filter((d) => group.years.includes(String(d.Year)));
        g.append('path')
            .datum(points)
            .attr('class', 'e7-q9-function1')
            .attr('fill', 'none')
            .attr('stroke', group.color)
            .attr('stroke-width', 3)
            .attr('opacity', 1)
            .attr('d', line);

        const x1 = xScale(group.years[0]) ?? 0;
        const x2 = xScale(group.years[group.years.length - 1]) ?? 0;
        const y = yScale(group.average);
        g.append('line')
            .attr('class', 'e7-q9-function1 e7-q9-average-line')
            .attr('data-group', group.key)
            .attr('x1', x1)
            .attr('x2', x2)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', group.color)
            .attr('stroke-width', 2.2);
        g.append('text')
            .attr('class', 'e7-q9-function1')
            .attr('x', x2 + 6)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', group.color)
            .text(group.average.toFixed(1));
    });
}

export function function1({ d3, container }) {
    drawInternetAverageSegments({ d3, container });
}

export function function2({ d3, container }) {
    function1({ d3, container });

    const csvDifference = 20.5;
    const { svg, g, plotW, yScale } = getInternetLineMetrics({ d3, container });
    const markerId = 'e7-q9-difference-arrow';
    const yLow = yScale(32.0);
    const yHigh = yScale(52.5);
    const arrowX = plotW + 10;

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

    g.selectAll('.e7-q9-function2').remove();
    [yLow, yHigh].forEach((y) => {
        g.append('line')
            .attr('class', 'e7-q9-function2')
            .attr('x1', plotW - 60)
            .attr('x2', arrowX)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', '#111827')
            .attr('stroke-width', 1.4)
            .attr('stroke-dasharray', '4 3');
    });
    g.append('line')
        .attr('class', 'e7-q9-function2')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', yHigh)
        .attr('y2', yLow)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2)
        .attr('marker-start', `url(#${markerId})`)
        .attr('marker-end', `url(#${markerId})`);
    g.append('text')
        .attr('class', 'e7-q9-function2')
        .attr('x', arrowX + 8)
        .attr('y', (yHigh + yLow) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 800)
        .attr('fill', '#111827')
        .text(String(csvDifference));
}

export function function3({ d3, container }) {}
