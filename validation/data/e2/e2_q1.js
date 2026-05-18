import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2011, 'Investments in Billion Euros': 37 },
    { Year: 2012, 'Investments in Billion Euros': 27.6 },
    { Year: 2013, 'Investments in Billion Euros': 15.3 },
    { Year: 2014, 'Investments in Billion Euros': 37.5 },
    { Year: 2015, 'Investments in Billion Euros': 48 },
    { Year: 2016, 'Investments in Billion Euros': 58.6 },
    { Year: 2017, 'Investments in Billion Euros': 36.6 },
    { Year: 2018, 'Investments in Billion Euros': 86.8 }
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
    const xField = 'Year';
    const yField = 'Investments in Billion Euros';

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
    const referenceValue = 22;
    const yField = 'Investments in Billion Euros';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const yValues = data_rows.map((d) => Number(d[yField])).filter(Number.isFinite);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...yValues), Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    const y = yScale(referenceValue);
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    g.selectAll('.validation-threshold-22').remove();

    g.append('line')
        .attr('class', 'validation-threshold-22')
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
        .attr('class', 'validation-threshold-22')
        .attr('x', plotW + 6)
        .attr('y', y)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .attr('opacity', 0)
        .text('22')
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function2({ d3, container }) {
    const focusYears = new Set(['2011', '2012', '2013', '2014']);
    const aboveThresholdYears = new Set(['2011', '2012', '2014']);
    const width = 640;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotH = 360 - margin.top - margin.bottom;
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const focusBars = g.selectAll('.main-bar')
        .filter((d) => focusYears.has(String(d.Year)));
    const xValues = focusBars.nodes().map((node) => Number(node.getAttribute('x')));
    const widths = focusBars.nodes().map((node) => Number(node.getAttribute('width')));
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues.map((x, index) => x + widths[index]));

    g.selectAll('.validation-focus-2011-2014').remove();
    g.insert('rect', ':first-child')
        .attr('class', 'validation-focus-2011-2014')
        .attr('x', minX - 8)
        .attr('y', 0)
        .attr('width', maxX - minX + 16)
        .attr('height', plotH)
        .attr('fill', '#dbeafe')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.55);

    g.selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('fill', (d) => {
            const year = String(d.Year);
            if (aboveThresholdYears.has(year)) return '#2563eb';
            if (focusYears.has(year)) return '#f97316';
            return '#d1d5db';
        })
        .attr('opacity', (d) => focusYears.has(String(d.Year)) ? 1 : 0.35);
}

export function function3({ d3, container }) {}
