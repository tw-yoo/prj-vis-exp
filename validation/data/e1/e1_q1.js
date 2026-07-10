import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 1999, 'Production in million units': 2.04 },
    { Year: 2000, 'Production in million units': 2.49 },
    { Year: 2001, 'Production in million units': 2.71 },
    { Year: 2002, 'Production in million units': 2.89 },
    { Year: 2003, 'Production in million units': 2.93 },
    { Year: 2004, 'Production in million units': 3 },
    { Year: 2005, 'Production in million units': 2.98 },
    { Year: 2006, 'Production in million units': 2.96 },
    { Year: 2007, 'Production in million units': 3.02 },
    { Year: 2008, 'Production in million units': 2.84 },
    { Year: 2009, 'Production in million units': 2.77 },
    { Year: 2010, 'Production in million units': 3.21 },
    { Year: 2011, 'Production in million units': 3.16 },
    { Year: 2012, 'Production in million units': 2.55 },
    { Year: 2013, 'Production in million units': 2.45 },
    { Year: 2014, 'Production in million units': 2.52 }
];

const X_FIELD = 'Year';
const Y_FIELD = 'Production in million units';
const BASE_FILL = '#69b3a2';
const ABOVE_FILL = '#2563eb';   // above-average bars turn blue
const AVG_COLOR = '#dc2626';    // average reference line

function injectChartStyles() {
    if (document.getElementById('validation-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-chart-styles';
    style.textContent = `
        .validation-chart-host { position: relative; background: #ffffff; color: #000000; }
        .validation-chart-host svg { display: block; overflow: visible; max-width: 100%; height: auto; }
        .validation-chart-host .x-axis line,
        .validation-chart-host .x-axis path,
        .validation-chart-host .y-axis line,
        .validation-chart-host .y-axis path { stroke: #000000; stroke-opacity: 1; }
        .validation-chart-host .x-axis text,
        .validation-chart-host .y-axis text,
        .validation-chart-host .x-axis-label,
        .validation-chart-host .y-axis-label { fill: #000000; fill-opacity: 1; font-size: 11px; font-family: sans-serif; }
        .validation-chart-host .main-bar { cursor: pointer; }
        .validation-chart-tooltip {
            position: absolute; z-index: 6; min-width: 120px; padding: 10px 12px;
            border: 1px solid rgba(203, 213, 225, 0.9); border-radius: 10px;
            background: rgba(255, 255, 255, 0.96); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
            pointer-events: none; font-family: sans-serif;
        }
        .validation-chart-tooltip[hidden] { display: none; }
        .validation-chart-tooltip__row { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; }
        .validation-chart-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-chart-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

function getGeometry() {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const yValues = data_rows.map((d) => Number(d[Y_FIELD])).filter(Number.isFinite);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...yValues), Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    return { width, height, margin, plotW, plotH, yScale };
}

export function renderValidationSimpleBarChart({ container }) {
    if (container.querySelector('svg')) {
        return;
    }
    injectChartStyles();

    const data = data_rows;
    const { width, height, margin, plotW, plotH, yScale } = getGeometry();

    container.innerHTML = '';
    container.classList.add('validation-chart-host');

    const xDomain = data.map((d) => String(d[X_FIELD]));
    const zeroY = yScale(0);

    const xScale = d3.scaleBand()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.2);

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    // Bars. Explicit opacity='1' is required so D3 transitions interpolate from 1,
    // not from +null (=0) which would flash the bar in from invisible.
    g.selectAll('rect.main-bar')
        .data(data)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(String(d[X_FIELD])))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => (Number(d[Y_FIELD]) >= 0 ? yScale(Number(d[Y_FIELD])) : zeroY))
        .attr('height', (d) => Math.abs(yScale(Number(d[Y_FIELD])) - zeroY))
        .attr('fill', BASE_FILL)
        .attr('opacity', 1)
        .attr('data-target', (d) => String(d[X_FIELD]))
        .attr('data-value', (d) => Number(d[Y_FIELD]))
        .attr('data-x-value', (d) => String(d[X_FIELD]))
        .attr('data-y-value', (d) => String(Number(d[Y_FIELD])));

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-chart-tooltip__row">
            <span class="validation-chart-tooltip__label">${X_FIELD}</span>
            <span class="validation-chart-tooltip__value" id="tt-x-val"></span>
        </div>
        <div class="validation-chart-tooltip__row">
            <span class="validation-chart-tooltip__label">${Y_FIELD}</span>
            <span class="validation-chart-tooltip__value" id="tt-y-val"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, d) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#tt-x-val').textContent = String(d[X_FIELD]);
            tooltip.querySelector('#tt-y-val').textContent = String(Number(d[Y_FIELD]));
        })
        .on('mousemove', function (event) {
            const rect = container.getBoundingClientRect();
            tooltip.style.left = `${event.clientX - rect.left + 12}px`;
            tooltip.style.top = `${event.clientY - rect.top - 10}px`;
        })
        .on('mouseout', function () {
            tooltip.setAttribute('hidden', '');
        });
}

const AVG_VALUE = d3.mean(data_rows, (d) => Number(d[Y_FIELD]));

// Step 1: draw the average reference line.
export function function1({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotW, yScale } = getGeometry();
    const y = yScale(AVG_VALUE);

    g.selectAll('.validation-avg-line, .validation-avg-label').remove();

    g.append('line')
        .attr('class', 'validation-avg-line')
        .attr('x1', 0)
        .attr('x2', 0)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', AVG_COLOR)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4')
        .transition()
        .duration(650)
        .attr('x2', plotW);

    g.append('text')
        .attr('class', 'validation-avg-label')
        .attr('x', plotW - 4)
        .attr('y', y - 6)
        .attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', AVG_COLOR)
        .attr('opacity', 0)
        .text(`average = ${AVG_VALUE.toFixed(2)}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

// Step 2: keep above-average bars (highlight blue), dim the rest, and count them.
export function function2({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotW } = getGeometry();
    const aboveCount = data_rows.filter((d) => Number(d[Y_FIELD]) > AVG_VALUE).length;

    g.selectAll('rect.main-bar')
        .transition()
        .duration(600)
        .attr('fill', (d) => (Number(d[Y_FIELD]) > AVG_VALUE ? ABOVE_FILL : BASE_FILL))
        .attr('opacity', (d) => (Number(d[Y_FIELD]) > AVG_VALUE ? 1 : 0.3));

    g.selectAll('.validation-count-label').remove();
    g.append('text')
        .attr('class', 'validation-count-label')
        .attr('x', plotW / 2)
        .attr('y', -12)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', ABOVE_FILL)
        .attr('opacity', 0)
        .text(`${aboveCount} years above average`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function3({ d3, container }) {}
