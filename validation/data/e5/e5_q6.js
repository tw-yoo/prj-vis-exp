import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2006, 'Revenue multiple': 4.66 },
    { Year: 2007, 'Revenue multiple': 4.69 },
    { Year: 2008, 'Revenue multiple': 4.68 },
    { Year: 2009, 'Revenue multiple': 4.41 },
    { Year: 2010, 'Revenue multiple': 4.08 },
    { Year: 2011, 'Revenue multiple': 3.97 },
    { Year: 2012, 'Revenue multiple': 4.01 },
    { Year: 2013, 'Revenue multiple': 4.07 },
    { Year: 2014, 'Revenue multiple': 4.77 },
    { Year: 2015, 'Revenue multiple': 5.67 },
    { Year: 2016, 'Revenue multiple': 6.16 },
    { Year: 2017, 'Revenue multiple': 6.14 },
    { Year: 2018, 'Revenue multiple': 6.01 },
    { Year: 2019, 'Revenue multiple': 6.31 },
    { Year: 2020, 'Revenue multiple': 6.39 }
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
    const xField = 'Year';
    const yField = 'Revenue multiple';

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

function getRevenueChartMetrics(d3, container) {
    const yField = 'Revenue multiple';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotH = height - margin.top - margin.bottom;
    const yValues = data_rows.map((d) => Number(d[yField])).filter(Number.isFinite);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...yValues), Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    return { g, yScale, plotH };
}

function getRevenueFocusBounds(g) {
    const focusYears = new Set(['2006', '2007', '2008', '2009', '2010', '2011']);
    const bars = g.selectAll('.main-bar')
        .filter((d) => focusYears.has(String(d.Year)))
        .nodes();
    const xs = bars.map((node) => Number(node.getAttribute('x')));
    const rights = bars.map((node) => Number(node.getAttribute('x')) + Number(node.getAttribute('width')));
    return {
        x1: Math.min(...xs) - 8,
        x2: Math.max(...rights) + 8
    };
}

export function function1({ d3, container }) {
    const { g, plotH } = getRevenueChartMetrics(d3, container);
    if (g.empty()) return;
    g.selectAll('.e5-q6-focus').remove();
    const bounds = getRevenueFocusBounds(g);
    g.insert('rect', ':first-child')
        .attr('class', 'e5-q6-focus')
        .attr('x', bounds.x1)
        .attr('y', 0)
        .attr('width', bounds.x2 - bounds.x1)
        .attr('height', plotH)
        .attr('fill', '#dbeafe')
        .attr('opacity', 0.55);
}

export function function2({ d3, container }) {
    const csvAverage = 4.42;
    const { g, yScale } = getRevenueChartMetrics(d3, container);
    if (g.empty()) return;
    g.selectAll('.e5-q6-average').remove();
    const bounds = getRevenueFocusBounds(g);
    const y = yScale(csvAverage);
    g.append('line')
        .attr('class', 'e5-q6-average')
        .attr('x1', bounds.x1)
        .attr('x2', bounds.x2)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4');
    g.append('text')
        .attr('class', 'e5-q6-average')
        .attr('x', bounds.x2 + 6)
        .attr('y', y)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .text('4.42');
}

export function function3({ d3, container }) {}
