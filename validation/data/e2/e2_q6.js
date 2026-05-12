import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Season: '2006/07', 'Average ticket price in US dollars': 52.49 },
    { Season: '2007/08', 'Average ticket price in US dollars': 57 },
    { Season: '2008/09', 'Average ticket price in US dollars': 54.5 },
    { Season: '2009/10', 'Average ticket price in US dollars': 53.5 },
    { Season: '2010/11', 'Average ticket price in US dollars': 51.47 },
    { Season: '2011/12', 'Average ticket price in US dollars': 51.47 },
    { Season: '2012/13', 'Average ticket price in US dollars': 63.1 },
    { Season: '2013/14', 'Average ticket price in US dollars': 65.55 },
    { Season: '2014/15', 'Average ticket price in US dollars': 78.43 },
    { Season: '2015/16', 'Average ticket price in US dollars': 79.83 }
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
    const xField = 'Season';
    const yField = 'Average ticket price in US dollars';

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

function renderTicketPriceSplitChart({ d3, container, showAverage = false }) {
    const yField = 'Average ticket price in US dollars';
    const threshold = 60;
    const rows = [
        ...data_rows.filter((d) => Number(d[yField]) <= threshold).map((d) => ({ ...d, group: '<= 60' })),
        ...data_rows.filter((d) => Number(d[yField]) > threshold).map((d) => ({ ...d, group: '> 60' }))
    ];
    const selectedRows = rows.filter((d) => d.group === '<= 60');
    const average = d3.mean(selectedRows, (d) => Number(d[yField])) ?? 0;
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 64, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(rows.map((d) => d.Season)).range([0, plotW]).padding(0.22);
    const yScale = d3.scaleLinear()
        .domain([0, Math.max(threshold, d3.max(rows, (d) => Number(d[yField])) ?? 0)])
        .nice()
        .range([plotH, 0]);

    container.innerHTML = '';
    container.classList.add('validation-chart-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    g.selectAll('rect.main-bar')
        .data(rows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.Season))
        .attr('width', xScale.bandwidth())
        .attr('y', plotH)
        .attr('height', 0)
        .attr('fill', (d) => d.group === '<= 60' ? '#2563eb' : '#d1d5db')
        .attr('data-target', (d) => d.Season)
        .attr('data-value', (d) => Number(d[yField]))
        .transition()
        .duration(700)
        .attr('y', (d) => yScale(Number(d[yField])))
        .attr('height', (d) => plotH - yScale(Number(d[yField])));

    const thresholdY = yScale(threshold);
    g.append('line')
        .attr('class', 'validation-threshold-60')
        .attr('x1', 0)
        .attr('x2', 0)
        .attr('y1', thresholdY)
        .attr('y2', thresholdY)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4')
        .transition()
        .duration(650)
        .attr('x2', plotW);

    if (!showAverage) return;

    const selectedX = selectedRows.map((d) => xScale(d.Season) ?? 0);
    const avgY = yScale(average);
    g.append('line')
        .attr('class', 'validation-average-line')
        .attr('x1', Math.min(...selectedX))
        .attr('x2', Math.min(...selectedX))
        .attr('y1', avgY)
        .attr('y2', avgY)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .transition()
        .duration(650)
        .attr('x2', Math.max(...selectedX) + xScale.bandwidth());
    g.append('text')
        .attr('class', 'validation-average-line')
        .attr('x', Math.max(...selectedX) + xScale.bandwidth() + 8)
        .attr('y', avgY)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`avg ${average.toFixed(2)}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function1({ d3, container }) {
    renderTicketPriceSplitChart({ d3, container, showAverage: false });
}

export function function2({ d3, container }) {
    renderTicketPriceSplitChart({ d3, container, showAverage: true });
}

export function function3({ d3, container }) {}
