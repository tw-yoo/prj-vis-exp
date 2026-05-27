import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { 'Quarter/Year': 'Q1 \'16', 'Price in US dollars per peak watt': 0.63 },
    { 'Quarter/Year': 'Q2 \'16', 'Price in US dollars per peak watt': 0.59 },
    { 'Quarter/Year': 'Q3 \'16', 'Price in US dollars per peak watt': 0.49 },
    { 'Quarter/Year': 'Q4 \'16', 'Price in US dollars per peak watt': 0.39 },
    { 'Quarter/Year': 'Q1 \'17', 'Price in US dollars per peak watt': 0.38 },
    { 'Quarter/Year': 'Q2 \'17', 'Price in US dollars per peak watt': 0.39 },
    { 'Quarter/Year': 'Q3 \'17', 'Price in US dollars per peak watt': 0.4 },
    { 'Quarter/Year': 'Q4 \'17', 'Price in US dollars per peak watt': 0.45 },
    { 'Quarter/Year': 'Q1 \'18', 'Price in US dollars per peak watt': 0.48 },
    { 'Quarter/Year': 'Q2 \'18', 'Price in US dollars per peak watt': 0.47 },
    { 'Quarter/Year': 'Q3 \'18', 'Price in US dollars per peak watt': 0.42 },
    { 'Quarter/Year': 'Q4 \'18', 'Price in US dollars per peak watt': 0.34 },
    { 'Quarter/Year': 'Q1 \'19', 'Price in US dollars per peak watt': 0.34 },
    { 'Quarter/Year': 'Q2 \'19', 'Price in US dollars per peak watt': 0.33 },
    { 'Quarter/Year': 'Q3 \'19', 'Price in US dollars per peak watt': 0.32 },
    { 'Quarter/Year': 'Q4 \'19', 'Price in US dollars per peak watt': 0.29 },
    { 'Quarter/Year': 'Q1 \'20', 'Price in US dollars per peak watt': 0.22 },
    { 'Quarter/Year': 'Q2 \'20', 'Price in US dollars per peak watt': 0.21 },
    { 'Quarter/Year': 'Q3 \'20', 'Price in US dollars per peak watt': 0.19 }
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
    const xField = 'Quarter/Year';
    const yField = 'Price in US dollars per peak watt';

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

export function function1({ d3, container }) {
    const xField = 'Year';
    const yField = 'Absolute price change in US dollars per peak watt';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    d3.select(container).selectAll('.validation-simple-line-tooltip').remove();

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    const margin = { top: 32, right: 24, bottom: 56, left: 72 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const changeRows = [
        {
            year: '2016',
            value: Math.abs(0.39 - 0.63)
        },
        {
            year: '2017',
            value: Math.abs(0.45 - 0.38)
        },
        {
            year: '2018',
            value: Math.abs(0.34 - 0.48)
        },
        {
            year: '2019',
            value: Math.abs(0.29 - 0.34)
        },
        {
            year: '2020',
            value: Math.abs(0.19 - 0.22)
        }
    ];

    const xScale = d3.scalePoint()
        .domain(changeRows.map((d) => d.year))
        .range([0, plotW])
        .padding(0.5);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(changeRows, (d) => d.value) ?? 0])
        .nice()
        .range([plotH, 0]);

    const line = d3.line()
        .x((d) => xScale(d.year) ?? 0)
        .y((d) => yScale(d.value))
        .curve(d3.curveMonotoneX);
    svg.selectAll('*').remove();

    const g = svg.append('g')
        .attr('class', 'validation-function1-year-change-line-layer')
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
        .attr('y', plotH + 48)
        .attr('text-anchor', 'middle')
        .text(xField);

    g.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -plotH / 2)
        .attr('y', -54)
        .attr('text-anchor', 'middle')
        .text(yField);

    const path = g.append('path')
        .datum(changeRows)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', '#4f46e5')
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', line);

    g.selectAll('circle.main-point')
        .data(changeRows)
        .join('circle')
        .attr('class', 'main-point main-bar')
        .attr('cx', (d) => xScale(d.year) ?? 0)
        .attr('cy', (d) => yScale(d.value))
        .attr('r', 0)
        .attr('fill', '#4f46e5')
        .attr('opacity', 0.9)
        .attr('data-target', (d) => d.year)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.year)
        .attr('data-y-value', (d) => String(d.value))
        .attr('r', 4);
}

export function function2({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const mLeft = +svg.attr('data-m-left') || 0;
    const mTop = +svg.attr('data-m-top') || 0;

    svg.selectAll('circle[data-target]')
        .attr('r', (p) => p.target === 'Jun' || p.target === 'Jul' ? 8 : 4)
        .attr('fill', (p) => p.target === 'Jun' || p.target === 'Jul' ? '#ef4444' : '#bfdbfe')
        .attr('opacity', (p) => p.target === 'Jun' || p.target === 'Jul' ? 1 : 0.25)
        .attr('stroke', (p) => p.target === 'Jun' || p.target === 'Jul' ? '#111827' : '#ffffff')
        .attr('stroke-width', (p) => p.target === 'Jun' || p.target === 'Jul' ? 2.5 : 1.5);

    svg.select('.main-line')
        .attr('stroke', '#bfdbfe')
        .attr('opacity', 0.4);

    svg.selectAll('.step-annotation-2').remove();

    const junCircle = svg.select('circle[data-target="Jun"]');
    const julCircle = svg.select('circle[data-target="Jul"]');
    const x1 = mLeft + (+junCircle.attr('cx') || 0);
    const y1 = mTop + (+junCircle.attr('cy') || 0);
    const x2 = mLeft + (+julCircle.attr('cx') || 0);
    const y2 = mTop + (+julCircle.attr('cy') || 0);

    svg.append('line')
        .attr('class', 'step-annotation step-annotation-2')
        .attr('x1', x1).attr('y1', y1)
        .attr('x2', x2).attr('y2', y2)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 4)
        .attr('stroke-linecap', 'round');

    svg.append('text')
        .attr('class', 'step-annotation step-annotation-2')
        .attr('x', (x1 + x2) / 2)
        .attr('y', Math.min(y1, y2) - 18)
        .attr('text-anchor', 'middle')
        .attr('font-size', 14)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .text('function2: compare Jun to Jul');
}
