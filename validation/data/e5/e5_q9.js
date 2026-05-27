import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, 'Inhabitants in billions': 6.84 },
    { Year: 2010, 'Inhabitants in billions': 6.92 },
    { Year: 2011, 'Inhabitants in billions': 7 },
    { Year: 2012, 'Inhabitants in billions': 7.09 },
    { Year: 2013, 'Inhabitants in billions': 7.17 },
    { Year: 2014, 'Inhabitants in billions': 7.25 },
    { Year: 2015, 'Inhabitants in billions': 7.34 },
    { Year: 2016, 'Inhabitants in billions': 7.42 },
    { Year: 2017, 'Inhabitants in billions': 7.51 },
    { Year: 2018, 'Inhabitants in billions': 7.59 },
    { Year: 2019, 'Inhabitants in billions': 7.67 }
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
    const xField = 'Year';
    const yField = 'Inhabitants in billions';

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
    const csvValues = [
        { year: '2011', value: 7.00 },
        { year: '2012', value: 7.09 },
        { year: '2013', value: 7.17 },
        { year: '2014', value: 7.25 },
        { year: '2015', value: 7.34 },
        { year: '2016', value: 7.42 },
        { year: '2017', value: 7.51 },
    ];
    const csvSumLabel = 'Sum: 51.78';

    injectSimpleLineStyles();

    container.classList.add('validation-simple-line-host');

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 32, bottom: 48, left: 64 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const xScale = d3.scaleBand()
        .domain(csvValues.map((d) => d.year))
        .range([0, plotW])
        .padding(0.25);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(csvValues, (d) => d.value) ?? 1])
        .nice()
        .range([plotH, 0]);

    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}`, instant: true });

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(csvValues)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.year))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', '#4f46e5')
        .attr('opacity', 1)
        .attr('data-target', (d) => d.year)
        .attr('data-value', (d) => String(d.value))
        .attr('data-x-value', (d) => d.year)
        .attr('data-y-value', (d) => String(d.value));

    g.selectAll('text.e5-q9-value-label')
        .data(csvValues)
        .join('text')
        .attr('class', 'e5-q9-value-label')
        .attr('x', (d) => (xScale(d.year) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => yScale(d.value) - 7)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text((d) => d.value.toFixed(2));

    g.append('text')
        .attr('class', 'e5-q9-sum-label')
        .attr('x', plotW)
        .attr('y', 4)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'hanging')
        .attr('font-size', 14)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text(csvSumLabel);
}

export function function2({ d3, container }) {}

export function function3({ d3, container }) {}
