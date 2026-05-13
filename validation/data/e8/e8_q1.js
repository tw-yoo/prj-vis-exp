import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Company: 'Conad', 'Market shares': 0.148 },
    { Company: 'Coop Italia', 'Market shares': 0.129 },
    { Company: 'Selex', 'Market shares': 0.101 },
    { Company: 'Esselunga', 'Market shares': 0.088 },
    { Company: 'VeGè Group', 'Market shares': 0.072 },
    { Company: 'Eurospin', 'Market shares': 0.064 },
    { Company: 'Carrefour Group', 'Market shares': 0.056 },
    { Company: 'Lidl Italia', 'Market shares': 0.044 },
    { Company: 'Gruppo Sun', 'Market shares': 0.032 },
    { Company: 'Agorà', 'Market shares': 0.031 },
    { Company: 'MD', 'Market shares': 0.031 },
    { Company: 'Gruppo Pam', 'Market shares': 0.026 },
    { Company: 'Crai', 'Market shares': 0.024 },
    { Company: 'Finiper', 'Market shares': 0.024 },
    { Company: 'Aspiag', 'Market shares': 0.024 }
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
    const xField = 'Company';
    const yField = 'Market shares';

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

function renderCompanyNameLengthChart({ d3, container, showAverage = false }) {
    injectChartStyles();

    const csvTargets = ['Conad', 'Selex', 'MD', 'Crai', 'Aspiag'];
    const csvAverage = 0.082;
    const selected = data_rows.filter((d) => csvTargets.includes(d.Company));
    const other = data_rows.filter((d) => !csvTargets.includes(d.Company));
    const data = [...selected, ...other];

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 64, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    container.innerHTML = '';
    container.classList.add('validation-chart-host');

    const xScale = d3.scaleBand()
        .domain(data.map((d) => d.Company))
        .range([0, plotW])
        .padding(0.22);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data_rows, (d) => d['Market shares']) ?? 0])
        .nice()
        .range([plotH, 0]);

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(data)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.Company))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d['Market shares']))
        .attr('height', (d) => plotH - yScale(d['Market shares']))
        .attr('fill', (d) => csvTargets.includes(d.Company) ? '#2563eb' : '#d1d5db')
        .attr('opacity', (d) => csvTargets.includes(d.Company) ? 0.95 : 0.12)
        .attr('data-target', (d) => d.Company)
        .attr('data-value', (d) => d['Market shares'])
        .attr('data-x-value', (d) => d.Company)
        .attr('data-y-value', (d) => String(d['Market shares']));

    if (!showAverage) return;

    const firstX = xScale(csvTargets[0]) ?? 0;
    const lastX = (xScale(csvTargets[csvTargets.length - 1]) ?? 0) + xScale.bandwidth();
    const avgY = yScale(csvAverage);
    g.append('line')
        .attr('class', 'e8-q1-function2')
        .attr('x1', firstX)
        .attr('x2', lastX)
        .attr('y1', avgY)
        .attr('y2', avgY)
        .attr('stroke', '#dc2626')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4');
    g.append('text')
        .attr('class', 'e8-q1-function2')
        .attr('x', lastX + 8)
        .attr('y', avgY - 6)
        .attr('fill', '#dc2626')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .text('Average: 0.082');
}

export function function1({ d3, container }) {
    renderCompanyNameLengthChart({ d3, container, showAverage: false });
}

export function function2({ d3, container }) {
    renderCompanyNameLengthChart({ d3, container, showAverage: true });
}

export function function3({ d3, container }) {}
