import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { 'Region/Entity': 'Metro Eastern Europe*', 'Number of employees': 27681 },
    { 'Region/Entity': 'Metro Western Europe**', 'Number of employees': 23483 },
    { 'Region/Entity': 'Metro Russia', 'Number of employees': 11583 },
    { 'Region/Entity': 'Metro Germany', 'Number of employees': 11580 },
    { 'Region/Entity': 'Metro Asia', 'Number of employees': 7182 },
    { 'Region/Entity': 'Others***', 'Number of employees': 7054 },
    { 'Region/Entity': 'Metro AG', 'Number of employees': 796 },
    { 'Region/Entity': 'Metro Total', 'Number of employees': 89359 }
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
    const xField = 'Region/Entity';
    const yField = 'Number of employees';

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

export function function1({ d3, container }) {
    const xField = 'Region/Entity';
    const yField = 'Number of employees';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    const margin = { top: 32, right: 132, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const sourceRows = data_rows.filter((d) => String(d[xField]) !== 'Metro Total');
    const baselineValue = 50000;
    const totalValue = d3.sum(sourceRows, (d) => Number(d[yField]));

    const colorScale = d3.scaleSequential()
        .domain([0, Math.max(1, sourceRows.length - 1)])
        .interpolator(d3.interpolateYlGnBu);

    const xScale = d3.scaleBand()
        .domain(['Sum', 'Baseline'])
        .range([0, plotW])
        .padding(0.38);

    const yScale = d3.scaleLinear()
        .domain([0, Math.max(totalValue, baselineValue)])
        .nice()
        .range([plotH, 0]);

    svg.selectAll('.validation-chart-tooltip').remove();

    let g = svg.select('g.validation-function1-layer');
    if (g.empty()) {
        svg.selectAll('g').remove();
        g = svg.append('g')
            .attr('class', 'validation-function1-layer')
            .attr('transform', `translate(${margin.left},${margin.top})`);
    }

    g.selectAll('*').remove();

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    const stackedSegments = [];
    let runningTotal = 0;
    sourceRows.forEach((row, index) => {
        const value = Number(row[yField]);
        const y0 = runningTotal;
        const y1 = runningTotal + value;
        stackedSegments.push({
            ...row,
            index,
            y0,
            y1,
            value,
            color: colorScale(index)
        });
        runningTotal = y1;
    });

    const sumX = xScale('Sum');
    const baselineX = xScale('Baseline');
    const barW = xScale.bandwidth();

    g.append('g')
        .attr('class', 'sum-bar')
        .selectAll('rect.sum-segment')
        .data(stackedSegments)
        .join('rect')
        .attr('class', 'sum-segment main-bar')
        .attr('x', sumX)
        .attr('width', barW)
        .attr('y', plotH)
        .attr('height', 0)
        .attr('fill', (d) => d.color)
        .attr('data-target', (d) => String(d[xField]))
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => String(d[xField]))
        .attr('data-y-value', (d) => String(d.value))
        .attr('y', (d) => yScale(d.y1))
        .attr('height', (d) => Math.max(0, yScale(d.y0) - yScale(d.y1)));

    g.append('rect')
        .attr('class', 'baseline-bar main-bar')
        .attr('x', baselineX)
        .attr('width', barW)
        .attr('y', plotH)
        .attr('height', 0)
        .attr('fill', '#9ca3af')
        .attr('data-target', 'Baseline')
        .attr('data-value', baselineValue)
        .attr('data-x-value', 'Baseline')
        .attr('data-y-value', String(baselineValue))
        .attr('y', yScale(baselineValue))
        .attr('height', plotH - yScale(baselineValue));

    const legend = g.append('g')
        .attr('class', 'sum-bar-legend')
        .attr('transform', `translate(${plotW + 24},0)`);

    const legendItems = legend.selectAll('g.legend-item')
        .data(stackedSegments)
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (_, i) => `translate(0,${i * 28})`)
        .style('opacity', 0);

    legendItems.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('rx', 2)
        .attr('fill', (d) => d.color);

    legendItems.append('text')
        .attr('x', 18)
        .attr('y', 10)
        .attr('fill', '#000000')
        .attr('font-size', 10)
        .attr('font-family', 'sans-serif')
        .text((d) => String(d[xField]));

    legendItems
        .style('opacity', 1);
}
