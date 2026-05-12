import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { 'City (Street)': 'Sydney (Pitt Street Mall)', 'US dollars per square foot': 732 },
    { 'City (Street)': 'Melbourne (Bourke Street Mall)', 'US dollars per square foot': 646 },
    { 'City (Street)': 'Brisbane (Brisbane Mall)', 'US dollars per square foot': 422 },
    { 'City (Street)': 'Brisbane (Queen Street Mall)', 'US dollars per square foot': 280 },
    { 'City (Street)': 'Adelaide (Rundle Street Mall)', 'US dollars per square foot': 256 },
    { 'City (Street)': 'Perth (Hay Street & Murray Street Malls)', 'US dollars per square foot': 227 },
    { 'City (Street)': 'Auckland (Queen Street)', 'US dollars per square foot': 202 },
    { 'City (Street)': 'Wellington (Lambton Quay)', 'US dollars per square foot': 141 }
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
    injectChartStyles();

    const data = data_rows;
    const xField = 'City (Street)';
    const yField = 'US dollars per square foot';

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

function getMallChartMetrics({ d3, container }) {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const values = data_rows.map((d) => d['US dollars per square foot']);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...values), Math.max(0, ...values)])
        .nice()
        .range([plotH, 0]);
    return {
        svg: d3.select(container).select('svg'),
        g: d3.select(container).select('svg > g'),
        plotW,
        yScale,
    };
}

export function function1({ d3, container }) {
    const csvTargets = new Set([
        'Sydney (Pitt Street Mall)',
        'Melbourne (Bourke Street Mall)',
        'Brisbane (Brisbane Mall)',
    ]);

    d3.select(container).selectAll('.e6-q1-function1').remove();
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (d) => (csvTargets.has(d['City (Street)']) ? 1 : 0.22))
        .attr('fill', (d) => (csvTargets.has(d['City (Street)']) ? '#ef4444' : '#9ca3af'))
        .attr('stroke', (d) => (csvTargets.has(d['City (Street)']) ? '#7f1d1d' : 'none'))
        .attr('stroke-width', (d) => (csvTargets.has(d['City (Street)']) ? 1.5 : 0));
}

export function function2({ d3, container }) {
    function1({ d3, container });

    const csvAverage = 674;
    const { g, plotW, yScale } = getMallChartMetrics({ d3, container });
    const y = yScale(csvAverage);

    g.selectAll('.e6-q1-function2').remove();
    g.append('line')
        .attr('class', 'e6-q1-function2')
        .attr('x1', 0)
        .attr('x2', plotW)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', '#dc2626')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4');

    g.append('text')
        .attr('class', 'e6-q1-function2')
        .attr('x', plotW + 8)
        .attr('y', y)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#dc2626')
        .text(`Average: ${csvAverage}`);
}

export function function3({ d3, container }) {}
