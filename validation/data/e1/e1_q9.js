import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2001, 'Cinema visits in millions': 173 },
    { Year: 2002, 'Cinema visits in millions': 159 },
    { Year: 2003, 'Cinema visits in millions': 144 },
    { Year: 2004, 'Cinema visits in millions': 153 },
    { Year: 2005, 'Cinema visits in millions': 126 },
    { Year: 2006, 'Cinema visits in millions': 135 },
    { Year: 2007, 'Cinema visits in millions': 124 },
    { Year: 2008, 'Cinema visits in millions': 128 },
    { Year: 2009, 'Cinema visits in millions': 145 },
    { Year: 2010, 'Cinema visits in millions': 124 },
    { Year: 2011, 'Cinema visits in millions': 126 },
    { Year: 2012, 'Cinema visits in millions': 132 },
    { Year: 2013, 'Cinema visits in millions': 127.4 },
    { Year: 2014, 'Cinema visits in millions': 120.4 },
    { Year: 2015, 'Cinema visits in millions': 135.9 },
    { Year: 2016, 'Cinema visits in millions': 118.4 },
    { Year: 2017, 'Cinema visits in millions': 117 },
    { Year: 2018, 'Cinema visits in millions': 100.1 },
    { Year: 2019, 'Cinema visits in millions': 113 }
];

const X_FIELD = 'Year';
const Y_FIELD = 'Cinema visits in millions';
const LINE_STROKE = '#4f46e5';
const BELOW_FILL = '#dc2626';
const AVG_COLOR = '#dc2626';

function injectSimpleLineStyles() {
    if (document.getElementById('validation-simple-line-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-simple-line-styles';
    style.textContent = `
        .validation-simple-line-host { position: relative; background: #ffffff; color: #000000; }
        .validation-simple-line-host svg { display: block; overflow: visible; max-width: 100%; height: auto; }
        .validation-simple-line-host .x-axis line,
        .validation-simple-line-host .x-axis path,
        .validation-simple-line-host .y-axis line,
        .validation-simple-line-host .y-axis path { stroke: #000000; stroke-opacity: 1; }
        .validation-simple-line-host .x-axis text,
        .validation-simple-line-host .y-axis text,
        .validation-simple-line-host .x-axis-label,
        .validation-simple-line-host .y-axis-label { fill: #000000; fill-opacity: 1; font-size: 11px; font-family: sans-serif; }
        .validation-simple-line-tooltip {
            position: absolute; z-index: 6; min-width: 120px; padding: 10px 12px;
            border: 1px solid rgba(203, 213, 225, 0.9); border-radius: 10px;
            background: rgba(255, 255, 255, 0.96); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
            pointer-events: none; font-family: sans-serif;
        }
        .validation-simple-line-tooltip[hidden] { display: none; }
        .validation-simple-line-tooltip__row { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; }
        .validation-simple-line-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-simple-line-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

function getGeometry() {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = data_rows.map((d) => String(d[X_FIELD]));
    const yValues = data_rows.map((d) => Number(d[Y_FIELD])).filter(Number.isFinite);
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;
    const domainMin = minY === maxY ? minY - 1 : minY;
    const domainMax = minY === maxY ? maxY + 1 : maxY;
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0]);
    return { width, height, margin, plotW, plotH, xScale, yScale };
}

export function renderValidationSimpleLineChart({ container }) {
    if (container.querySelector('svg')) {
        return;
    }
    injectSimpleLineStyles();

    const { width, height, margin, plotW, plotH, xScale, yScale } = getGeometry();

    const points = data_rows.map((d) => ({
        target: String(d[X_FIELD]),
        xDisplayLabel: String(d[X_FIELD]),
        yValue: Number(d[Y_FIELD]),
    }));

    container.innerHTML = '';
    container.classList.add('validation-simple-line-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('data-m-left', margin.left)
        .attr('data-m-top', margin.top)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(6));

    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    const lineGenerator = d3.line()
        .x((p) => xScale(p.target))
        .y((p) => yScale(p.yValue));

    g.append('path')
        .datum(points)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', LINE_STROKE)
        .attr('stroke-width', 2)
        .attr('opacity', 1)
        .attr('d', lineGenerator);

    g.selectAll('circle[data-target]')
        .data(points)
        .join('circle')
        .attr('cx', (p) => xScale(p.target))
        .attr('cy', (p) => yScale(p.yValue))
        .attr('r', 4)
        .attr('fill', LINE_STROKE)
        .attr('opacity', 0.85)
        .attr('data-target', (p) => p.target)
        .attr('data-value', (p) => String(p.yValue))
        .attr('data-x-value', (p) => p.xDisplayLabel)
        .attr('data-y-value', (p) => String(p.yValue));

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-simple-line-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${X_FIELD}</span>
            <span class="validation-simple-line-tooltip__value" id="ln-tt-x"></span>
        </div>
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${Y_FIELD}</span>
            <span class="validation-simple-line-tooltip__value" id="ln-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('circle[data-target]')
        .on('mouseover', function (event, p) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#ln-tt-x').textContent = p.xDisplayLabel;
            tooltip.querySelector('#ln-tt-y').textContent = String(p.yValue);
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
        .text(`average = ${AVG_VALUE.toFixed(1)}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

// Step 2: mark the points below the average in red and count them.
export function function2({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotW } = getGeometry();
    const belowCount = data_rows.filter((d) => Number(d[Y_FIELD]) < AVG_VALUE).length;

    g.selectAll('circle[data-target]')
        .transition()
        .duration(600)
        .attr('fill', function () {
            return Number(this.getAttribute('data-value')) < AVG_VALUE ? BELOW_FILL : LINE_STROKE;
        })
        .attr('r', function () {
            return Number(this.getAttribute('data-value')) < AVG_VALUE ? 6 : 4;
        })
        .attr('opacity', function () {
            return Number(this.getAttribute('data-value')) < AVG_VALUE ? 1 : 0.55;
        });

    g.selectAll('.validation-count-label').remove();
    g.append('text')
        .attr('class', 'validation-count-label')
        .attr('x', plotW / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', BELOW_FILL)
        .attr('opacity', 0)
        .text(`${belowCount} years below average`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function3({ d3, container }) {}
