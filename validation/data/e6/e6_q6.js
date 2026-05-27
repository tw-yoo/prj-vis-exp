import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Company: 'Huawei & Honor', 'Sales volume in million units': 102.55 },
    { Company: 'Oppo', 'Sales volume in million units': 77.56 },
    { Company: 'Vivo', 'Sales volume in million units': 72.23 },
    { Company: 'Apple', 'Sales volume in million units': 51.05 },
    { Company: 'Xiaomi', 'Sales volume in million units': 50.94 },
    { Company: 'Meizu', 'Sales volume in million units': 16.81 },
    { Company: 'Gionee', 'Sales volume in million units': 14.94 },
    { Company: 'Samsung', 'Sales volume in million units': 11.07 },
    { Company: 'Lephone', 'Sales volume in million units': 4.67 },
    { Company: 'Lenovo', 'Sales volume in million units': 1.79 },
    { Company: 'Others', 'Sales volume in million units': 45.83 }
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
    const xField = 'Company';
    const yField = 'Sales volume in million units';

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

function getCompanySalesMetrics({ d3, container }) {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const values = data_rows.map((d) => d['Sales volume in million units']);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...values), Math.max(0, ...values)])
        .nice()
        .range([plotH, 0]);
    return {
        g: d3.select(container).select('svg > g'),
        plotW,
        yScale,
    };
}

function drawSalesReferenceLine({ g, plotW, yScale, value, label, className, color }) {
    const y = yScale(value);
    g.append('line')
        .attr('class', className)
        .attr('x1', 0)
        .attr('x2', plotW)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4');

    g.append('text')
        .attr('class', className)
        .attr('x', plotW + 8)
        .attr('y', y)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', color)
        .text(label);
}

export function function1({ d3, container }) {
    const csvThreshold = 60;
    const csvTargets = new Set(['Huawei & Honor', 'Oppo', 'Vivo']);
    const { g, plotW, yScale } = getCompanySalesMetrics({ d3, container });

    d3.select(container).selectAll('.e6-q6-function1').remove();
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (d) => (csvTargets.has(d.Company) ? 1 : 0.22))
        .attr('fill', (d) => (csvTargets.has(d.Company) ? '#ef4444' : '#9ca3af'))
        .attr('stroke', (d) => (csvTargets.has(d.Company) ? '#7f1d1d' : 'none'))
        .attr('stroke-width', (d) => (csvTargets.has(d.Company) ? 1.5 : 0));

    drawSalesReferenceLine({
        g,
        plotW,
        yScale,
        value: csvThreshold,
        label: String(csvThreshold),
        className: 'e6-q6-function1',
        color: '#111827',
    });
}

export function function2({ d3, container }) {
    function1({ d3, container });

    const csvAverage = 81.45;
    const { g, plotW, yScale } = getCompanySalesMetrics({ d3, container });
    g.selectAll('.e6-q6-function2').remove();
    drawSalesReferenceLine({
        g,
        plotW,
        yScale,
        value: csvAverage,
        label: `Average: ${csvAverage}`,
        className: 'e6-q6-function2',
        color: '#dc2626',
    });
}

export function function3({ d3, container }) {}
