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

const E2_Q6_Y_FIELD = 'Average ticket price in US dollars';
const E2_Q6_THRESHOLD = 60;

function getE2Q6Geometry(d3) {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = data_rows.map((d) => String(d['Season']));
    const yValues = data_rows.map((d) => Number(d[E2_Q6_Y_FIELD]));
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear()
        .domain([0, Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    return { plotW, plotH, xScale, yScale };
}

export function function1({ d3, container }) {
    // Per reviewer (e2_feedback round-4 row 5): bars > 60 must have LOWER OPACITY
    // (dimmed). Below-threshold bars keep the original base color + full opacity.
    // Above-threshold bars stay at their base fill but with opacity 0.35 so the
    // "below-60" group reads as the focus.
    const { plotW, yScale } = getE2Q6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-threshold-60').remove();

    g.selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            const value = Number(this.getAttribute('data-y-value'));
            return value > E2_Q6_THRESHOLD ? 0.35 : 1;
        });

    const thresholdY = yScale(E2_Q6_THRESHOLD);
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
    g.append('text')
        .attr('class', 'validation-threshold-60')
        .attr('x', plotW + 6)
        .attr('y', thresholdY)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .attr('opacity', 0)
        .text('60')
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function2({ d3, container }) {
    // Per reviewer (round-2 row 5): the avg line MUST span exactly the filtered
    // bars region (left edge of the first filtered bar to right edge of the last).
    // Annotation-only (no rebuild). Compute positions from the existing rendered
    // bars' x/width attributes so it's always aligned with what the user sees.
    const { yScale } = getE2Q6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-average-line').remove();

    const filteredYears = new Set(
        data_rows
            .filter((d) => Number(d[E2_Q6_Y_FIELD]) <= E2_Q6_THRESHOLD + 4)
            .map((d) => String(d['Season']))
    );
    const filteredValues = data_rows
        .filter((d) => filteredYears.has(String(d['Season'])))
        .map((d) => Number(d[E2_Q6_Y_FIELD]));
    if (filteredValues.length === 0) return;

    // Read the actual rendered bar positions for filtered years (so we're aligned
    // with what's on screen regardless of any scale-padding quirks).
    const filteredBars = g.selectAll('.main-bar').nodes().filter((node) => filteredYears.has(node.getAttribute('data-target')));
    if (filteredBars.length === 0) return;
    const lefts = filteredBars.map((n) => Number(n.getAttribute('x')));
    const rights = filteredBars.map((n) => Number(n.getAttribute('x')) + Number(n.getAttribute('width')));
    const xStart = Math.min(...lefts);
    const xEnd = Math.max(...rights);
    const average = filteredValues.reduce((a, b) => a + b, 0) / filteredValues.length;
    const avgY = yScale(average);

    g.append('line')
        .attr('class', 'validation-average-line')
        .attr('x1', xStart)
        .attr('x2', xStart)
        .attr('y1', avgY)
        .attr('y2', avgY)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4')
        .transition()
        .duration(650)
        .attr('x2', xEnd);

    g.append('text')
        .attr('class', 'validation-average-line')
        .attr('x', xEnd + 6)
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

export function function3({ d3, container }) {}
