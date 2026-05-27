import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { 'Fiscal Year': '00/01', 'Expenditure in billion GBP': 1.4 },
    { 'Fiscal Year': '01/02', 'Expenditure in billion GBP': 1.7 },
    { 'Fiscal Year': '02/03', 'Expenditure in billion GBP': 2.1 },
    { 'Fiscal Year': '03/04', 'Expenditure in billion GBP': 2.3 },
    { 'Fiscal Year': '04/05', 'Expenditure in billion GBP': 2.5 },
    { 'Fiscal Year': '05/06', 'Expenditure in billion GBP': 3 },
    { 'Fiscal Year': '06/07', 'Expenditure in billion GBP': 2.9 },
    { 'Fiscal Year': '07/08', 'Expenditure in billion GBP': 3.3 },
    { 'Fiscal Year': '08/09', 'Expenditure in billion GBP': 3.2 },
    { 'Fiscal Year': '09/10', 'Expenditure in billion GBP': 3.6 },
    { 'Fiscal Year': '10/11', 'Expenditure in billion GBP': 3.4 },
    { 'Fiscal Year': '11/12', 'Expenditure in billion GBP': 3.6 },
    { 'Fiscal Year': '12/13', 'Expenditure in billion GBP': 3.3 },
    { 'Fiscal Year': '13/14', 'Expenditure in billion GBP': 4.2 },
    { 'Fiscal Year': '14/15', 'Expenditure in billion GBP': 4.4 },
    { 'Fiscal Year': '15/16', 'Expenditure in billion GBP': 4.7 },
    { 'Fiscal Year': '16/17', 'Expenditure in billion GBP': 4.5 },
    { 'Fiscal Year': '17/18', 'Expenditure in billion GBP': 5 },
    { 'Fiscal Year': '18/19', 'Expenditure in billion GBP': 6.4 }
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
    const xField = 'Fiscal Year';
    const yField = 'Expenditure in billion GBP';

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

function getQ6Geometry(d3) {
    const xField = 'Fiscal Year';
    const yField = 'Expenditure in billion GBP';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = data_rows.map((d) => String(d[xField]));
    const yValues = data_rows.map((d) => Number(d[yField])).filter(Number.isFinite);
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...yValues), Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    return { xField, yField, plotW, plotH, xScale, yScale };
}

function getQ6Average() {
    const yField = 'Expenditure in billion GBP';
    const yValues = data_rows.map((d) => Number(d[yField]));
    return yValues.reduce((s, v) => s + v, 0) / yValues.length;
}

export function function1({ d3, container }) {
    const { plotW, plotH, yScale } = getQ6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q6-gridline').remove();

    const ticks = yScale.ticks(5);
    ticks.forEach((tickValue, i) => {
        const y = yScale(tickValue);
        if (y >= plotH - 0.5 || y <= 0.5) return;
        g.insert('line', ':first-child')
            .attr('class', 'validation-q6-gridline')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', '#e5e7eb')
            .attr('stroke-width', 1)
            .transition()
            .duration(500 + i * 60)
            .attr('x2', plotW);
    });
}

export function function2({ d3, container }) {
    const { plotW, yScale } = getQ6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q6-avg-line, .validation-q6-avg-label').remove();

    const avg = getQ6Average();
    const y = yScale(avg);

    g.append('line')
        .attr('class', 'validation-q6-avg-line')
        .attr('x1', 0)
        .attr('x2', 0)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4')
        .transition()
        .duration(650)
        .attr('x2', plotW);

    g.append('text')
        .attr('class', 'validation-q6-avg-label')
        .attr('x', plotW + 6)
        .attr('y', y)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .attr('opacity', 0)
        .text(`avg ${avg.toFixed(2)}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function3({ d3, container }) {
    const { yField } = getQ6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    const avg = getQ6Average();

    g.selectAll('.main-bar')
        .transition()
        .duration(600)

        .attr('opacity', 1);
}

export function function4({ d3, container }) {
    const { plotW, yField } = getQ6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q6-summary').remove();

    const avg = getQ6Average();
    const belowCount = data_rows.filter((d) => Number(d[yField]) < avg).length;

    g.append('text')
        .attr('class', 'validation-q6-summary')
        .attr('x', plotW - 4)
        .attr('y', 12)
        .attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#2563eb')
        .attr('opacity', 0)
        .text(`${belowCount} fiscal years below avg`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
