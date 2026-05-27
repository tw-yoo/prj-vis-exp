import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2010, 'Production in billion heads': 1.35 },
    { Year: 2011, 'Production in billion heads': 1.57 },
    { Year: 2012, 'Production in billion heads': 1.66 },
    { Year: 2013, 'Production in billion heads': 1.79 },
    { Year: 2014, 'Production in billion heads': 1.87 },
    { Year: 2015, 'Production in billion heads': 1.97 },
    { Year: 2016, 'Production in billion heads': 2.09 },
    { Year: 2017, 'Production in billion heads': 3.48 },
    { Year: 2018, 'Production in billion heads': 3.7 },
    { Year: 2019, 'Production in billion heads': 3.73 }
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
    const yField = 'Production in billion heads';

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

// ── Shared geometry for function1/function2 ──
function getQ1Geometry(d3) {
    const xField = 'Year';
    const yField = 'Production in billion heads';
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

function ensureQ1ArrowMarker(svg) {
    if (!svg.select('defs#e3-q1-defs').empty()) return;
    const defs = svg.append('defs').attr('id', 'e3-q1-defs');
    defs.append('marker')
        .attr('id', 'e3-q1-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');
}

function drawQ1JumpArrow({ g, xScale, yScale, fromYear, toYear, fromValue, toValue, label, className }) {
    g.selectAll(`.${className}`).remove();
    const cx = (xScale(String(toYear)) ?? 0) + xScale.bandwidth() / 2;
    const y0 = yScale(fromValue);
    const y1 = yScale(toValue);
    const group = g.append('g').attr('class', className);
    group.append('line')
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', y0)
        .attr('y2', y0)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#e3-q1-arrow)')
        .transition()
        .duration(650)
        .attr('y2', y1 + (y1 < y0 ? 6 : -6));
    group.append('text')
        .attr('x', cx + 8)
        .attr('y', (y0 + y1) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(label)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function1({ d3, container }) {
    const { xField, yField, xScale, yScale } = getQ1Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    ensureQ1ArrowMarker(svg);

    const focusYears = new Set(['2016', '2017']);
    g.selectAll('.main-bar')
        .transition()
        .duration(600)

        .attr('opacity', (d) => focusYears.has(String(d[xField])) ? 1 : 0.35);

    const v2016 = Number(data_rows.find((d) => d.Year === 2016)?.[yField] ?? 0);
    const v2017 = Number(data_rows.find((d) => d.Year === 2017)?.[yField] ?? 0);
    drawQ1JumpArrow({
        g, xScale, yScale,
        fromYear: 2016, toYear: 2017,
        fromValue: v2016, toValue: v2017,
        label: `+${(v2017 - v2016).toFixed(2)}`,
        className: 'validation-q1-jump-16-17',
    });
}

export function function2({ d3, container }) {
    const { xField, yField, xScale, yScale } = getQ1Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    ensureQ1ArrowMarker(svg);

    const focusYears = new Set(['2016', '2017', '2018']);
    g.selectAll('.main-bar')
        .transition()
        .duration(600)

        .attr('opacity', (d) => focusYears.has(String(d[xField])) ? 1 : 0.35);

    const v2017 = Number(data_rows.find((d) => d.Year === 2017)?.[yField] ?? 0);
    const v2018 = Number(data_rows.find((d) => d.Year === 2018)?.[yField] ?? 0);
    drawQ1JumpArrow({
        g, xScale, yScale,
        fromYear: 2017, toYear: 2018,
        fromValue: v2017, toValue: v2018,
        label: `+${(v2018 - v2017).toFixed(2)}`,
        className: 'validation-q1-jump-17-18',
    });
}

export function function3({ d3, container }) {}