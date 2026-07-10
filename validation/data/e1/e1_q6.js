import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, 'Number of fatalities': 399 },
    { Year: 2010, 'Number of fatalities': 314 },
    { Year: 2011, 'Number of fatalities': 337 },
    { Year: 2012, 'Number of fatalities': 342 },
    { Year: 2013, 'Number of fatalities': 314 },
    { Year: 2014, 'Number of fatalities': 334 },
    { Year: 2015, 'Number of fatalities': 319 },
    { Year: 2016, 'Number of fatalities': 304 },
    { Year: 2017, 'Number of fatalities': 293 },
    { Year: 2018, 'Number of fatalities': 383 },
    { Year: 2019, 'Number of fatalities': 273 }
];

const X_FIELD = 'Year';
const Y_FIELD = 'Number of fatalities';
const BASE_FILL = '#69b3a2';
const MEDIAN_FILL = '#dc2626';

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
    const margin = { top: 40, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const yValues = data_rows.map((d) => Number(d[Y_FIELD])).filter(Number.isFinite);
    const yScale = d3.scaleLinear()
        .domain([0, Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    return { width, height, margin, plotW, plotH, yScale };
}

// Sorted ascending; the median trio is the middle three of the sorted list.
function getSortedRows() {
    return [...data_rows].sort((a, b) => Number(a[Y_FIELD]) - Number(b[Y_FIELD]));
}
function getMedianYears() {
    const sorted = getSortedRows();
    const mid = Math.floor(sorted.length / 2);
    return sorted.slice(mid - 1, mid + 2).map((d) => String(d[X_FIELD]));
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

    g.selectAll('rect.main-bar')
        .data(data, (d) => String(d[X_FIELD]))
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(String(d[X_FIELD])))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(Number(d[Y_FIELD])))
        .attr('height', (d) => plotH - yScale(Number(d[Y_FIELD])))
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

// Step 1: sort the bars ascending (bars and x labels slide into sorted order).
export function function1({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotW } = getGeometry();
    const sortedDomain = getSortedRows().map((d) => String(d[X_FIELD]));

    const xScale = d3.scaleBand()
        .domain(sortedDomain)
        .range([0, plotW])
        .padding(0.2);

    g.selectAll('rect.main-bar')
        .transition()
        .duration(750)
        .attr('x', function () { return xScale(this.getAttribute('data-target')); })
        .attr('width', xScale.bandwidth());

    g.select('.x-axis')
        .transition()
        .duration(750)
        .call(d3.axisBottom(xScale))
        .on('end', function () { autoRotateXAxisLabels(g.select('.x-axis')); });
}

// Step 2: highlight the three median bars, drop the rest, and re-center them.
export function function2({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotW } = getGeometry();
    const medianYears = getMedianYears();
    const medianSet = new Set(medianYears);

    const xScale = d3.scaleBand()
        .domain(medianYears)
        .range([0, plotW])
        .padding(0.45);

    // Non-median bars fade out and are removed.
    g.selectAll('rect.main-bar')
        .filter(function () { return !medianSet.has(this.getAttribute('data-target')); })
        .transition()
        .duration(500)
        .attr('opacity', 0)
        .remove();

    // Median bars turn red and slide to the re-centered positions.
    g.selectAll('rect.main-bar')
        .filter(function () { return medianSet.has(this.getAttribute('data-target')); })
        .transition()
        .delay(200)
        .duration(700)
        .attr('fill', MEDIAN_FILL)
        .attr('x', function () { return xScale(this.getAttribute('data-target')); })
        .attr('width', xScale.bandwidth());

    g.select('.x-axis')
        .transition()
        .delay(200)
        .duration(700)
        .call(d3.axisBottom(xScale))
        .on('end', function () { autoRotateXAxisLabels(g.select('.x-axis')); });
}

// Step 3: merge the three median bars into a single summed bar.
export function function3({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const { margin, plotW, plotH } = getGeometry();
    const medianYears = getMedianYears();
    const medianVals = medianYears.map((y) => Number(data_rows.find((d) => String(d[X_FIELD]) === y)[Y_FIELD]));
    const sum = medianVals.reduce((a, b) => a + b, 0);

    const yScale = d3.scaleLinear()
        .domain([0, sum])
        .nice()
        .range([plotH, 0]);

    const xScale = d3.scaleBand()
        .domain(['Median sum'])
        .range([0, plotW])
        .padding(0.55);

    // Crossfade: fade out the current layers, fade in the summed-bar layer.
    const oldLayers = svg.selectAll(':scope > g');

    const gNew = svg.append('g')
        .attr('class', 'validation-sum-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('opacity', 0);

    gNew.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    gNew.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    const bx = xScale('Median sum');
    gNew.append('rect')
        .attr('class', 'main-bar')
        .attr('x', bx)
        .attr('width', xScale.bandwidth())
        .attr('y', yScale(0))
        .attr('height', 0)
        .attr('fill', MEDIAN_FILL)
        .attr('opacity', 1)
        .transition()
        .delay(350)
        .duration(750)
        .attr('y', yScale(sum))
        .attr('height', plotH - yScale(sum));

    gNew.append('text')
        .attr('class', 'validation-sum-label')
        .attr('x', bx + xScale.bandwidth() / 2)
        .attr('y', yScale(sum) - 10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 15)
        .attr('font-weight', 700)
        .attr('fill', MEDIAN_FILL)
        .attr('opacity', 0)
        .text(`Sum = ${sum}`)
        .transition()
        .delay(900)
        .duration(500)
        .attr('opacity', 1);

    gNew.append('text')
        .attr('x', bx + xScale.bandwidth() / 2)
        .attr('y', -16)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('fill', '#6b7280')
        .attr('opacity', 0)
        .text(`${medianVals.join(' + ')}`)
        .transition()
        .delay(900)
        .duration(500)
        .attr('opacity', 1);

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}
