import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { 'Fiscal Year': '05/06', 'Average ticket price in US dollars': 44.08 },
    { 'Fiscal Year': '06/07', 'Average ticket price in US dollars': 45.53 },
    { 'Fiscal Year': '07/08', 'Average ticket price in US dollars': 47.76 },
    { 'Fiscal Year': '08/09', 'Average ticket price in US dollars': 47.66 },
    { 'Fiscal Year': '09/10', 'Average ticket price in US dollars': 47.66 },
    { 'Fiscal Year': '10/11', 'Average ticket price in US dollars': 47.66 },
    { 'Fiscal Year': '11/12', 'Average ticket price in US dollars': 47.95 },
    { 'Fiscal Year': '12/13', 'Average ticket price in US dollars': 47.95 },
    { 'Fiscal Year': '13/14', 'Average ticket price in US dollars': 47.06 },
    { 'Fiscal Year': '14/15', 'Average ticket price in US dollars': 48.9 }
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

function getE4Q1Geometry(d3) {
    const xField = 'Fiscal Year';
    const yField = 'Average ticket price in US dollars';
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

function getE4Q1Average() {
    const yField = 'Average ticket price in US dollars';
    const yValues = data_rows.map((d) => Number(d[yField]));
    return yValues.reduce((s, v) => s + v, 0) / yValues.length;
}

function getE4Q1MaxDiffYear() {
    const yField = 'Average ticket price in US dollars';
    const xField = 'Fiscal Year';
    const avg = getE4Q1Average();
    return data_rows.reduce(
        (best, row) => {
            const diff = Math.abs(Number(row[yField]) - avg);
            return diff > best.diff ? { year: String(row[xField]), value: Number(row[yField]), diff } : best;
        },
        { diff: -Infinity },
    );
}

export function function1({ d3, container }) {
    const { plotW, yScale } = getE4Q1Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q1-avg-line, .validation-q1-avg-label').remove();

    const avg = getE4Q1Average();
    const y = yScale(avg);

    g.append('line')
        .attr('class', 'validation-q1-avg-line')
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
        .attr('class', 'validation-q1-avg-label')
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

export function function2({ d3, container }) {
    const { xField, yField, xScale, yScale } = getE4Q1Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q1-diff-segment').remove();

    const avg = getE4Q1Average();
    const yAvg = yScale(avg);

    data_rows.forEach((row) => {
        const cx = (xScale(String(row[xField])) ?? 0) + xScale.bandwidth() / 2;
        const yTop = yScale(Number(row[yField]));
        g.append('line')
            .attr('class', 'validation-q1-diff-segment')
            .attr('data-year', String(row[xField]))
            .attr('x1', cx)
            .attr('x2', cx)
            .attr('y1', yAvg)
            .attr('y2', yAvg)
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '3 3')
            .attr('opacity', 0.55)
            .transition()
            .duration(600)
            .attr('y2', yTop);
    });
}

export function function3({ d3, container }) {
    const { xField, yField, plotW, plotH, xScale, yScale } = getE4Q1Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q1-max-rect, .validation-q1-max-label').remove();

    const best = getE4Q1MaxDiffYear();

    g.insert('rect', ':first-child')
        .attr('class', 'validation-q1-max-rect')
        .attr('x', (xScale(best.year) ?? 0) - 6)
        .attr('y', 0)
        .attr('width', xScale.bandwidth() + 12)
        .attr('height', plotH)
        .attr('fill', '#fde68a')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.55);

    g.selectAll('.main-bar')
        ;

    g.selectAll('.validation-q1-diff-segment')
        .filter(function () { return this.getAttribute('data-year') === best.year; })
        .transition()
        .duration(600)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2.5)
        .attr('opacity', 1)
        .attr('stroke-dasharray', null);

    g.append('text')
        .attr('class', 'validation-q1-max-label')
        .attr('x', plotW - 4)
        .attr('y', 12)
        .attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`max |Δ| = ${best.diff.toFixed(2)} ← ${best.year}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}