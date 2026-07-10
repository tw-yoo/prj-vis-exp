import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Frequency: 'Frequently (one or more times per month)', 'Race/Ethnicity': 'White', 'Share of respondents': 0.12 },
    { Frequency: 'Frequently (one or more times per month)', 'Race/Ethnicity': 'Hispanic', 'Share of respondents': 0.27 },
    { Frequency: 'Frequently (one or more times per month)', 'Race/Ethnicity': 'African–American', 'Share of respondents': 0.22 },
    { Frequency: 'Frequently (one or more times per month)', 'Race/Ethnicity': 'Other', 'Share of respondents': 0.16 },
    { Frequency: 'Occasionally (less than once a month)', 'Race/Ethnicity': 'White', 'Share of respondents': 0.4 },
    { Frequency: 'Occasionally (less than once a month)', 'Race/Ethnicity': 'Hispanic', 'Share of respondents': 0.43 },
    { Frequency: 'Occasionally (less than once a month)', 'Race/Ethnicity': 'African–American', 'Share of respondents': 0.41 },
    { Frequency: 'Occasionally (less than once a month)', 'Race/Ethnicity': 'Other', 'Share of respondents': 0.47 },
    { Frequency: 'Infrequently (once a year or less)', 'Race/Ethnicity': 'White', 'Share of respondents': 0.48 },
    { Frequency: 'Infrequently (once a year or less)', 'Race/Ethnicity': 'Hispanic', 'Share of respondents': 0.3 },
    { Frequency: 'Infrequently (once a year or less)', 'Race/Ethnicity': 'African–American', 'Share of respondents': 0.37 },
    { Frequency: 'Infrequently (once a year or less)', 'Race/Ethnicity': 'Other', 'Share of respondents': 0.37 }
];

const X_FIELD = 'Frequency';
const SERIES_FIELD = 'Race/Ethnicity';
const Y_FIELD = 'Share of respondents';
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];
const FREQUENTLY = 'Frequently (one or more times per month)';
const OCCASIONALLY = 'Occasionally (less than once a month)';
const INFREQUENTLY = 'Infrequently (once a year or less)';
const MAX_COLOR = '#dc2626';

function raceDomain() {
    return Array.from(new Set(data_rows.map((d) => String(d[SERIES_FIELD]))));
}
function freqDomain() {
    return Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
}
function raceColor(race) {
    const dom = raceDomain();
    const i = dom.indexOf(race);
    return WORKBENCH_PALETTE[i >= 0 ? i % WORKBENCH_PALETTE.length : 0];
}
function val(freq, race) {
    const row = data_rows.find((d) => String(d[X_FIELD]) === freq && String(d[SERIES_FIELD]) === race);
    return row ? Number(row[Y_FIELD]) : 0;
}
function shortFreq(freq) {
    return freq.split(' (')[0];
}

function injectGroupedChartStyles() {
    if (document.getElementById('validation-grouped-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-grouped-chart-styles';
    style.textContent = `
        .validation-grouped-chart-host { position: relative; background: #ffffff; color: #000000; }
        .validation-grouped-chart-host svg { display: block; overflow: visible; max-width: 100%; height: auto; }
        .validation-grouped-chart-host .x-axis line,
        .validation-grouped-chart-host .x-axis path,
        .validation-grouped-chart-host .y-axis line,
        .validation-grouped-chart-host .y-axis path { stroke: #000000; stroke-opacity: 1; }
        .validation-grouped-chart-host .x-axis text,
        .validation-grouped-chart-host .y-axis text,
        .validation-grouped-chart-host .x-axis-label,
        .validation-grouped-chart-host .y-axis-label { fill: #000000; fill-opacity: 1; font-size: 11px; font-family: sans-serif; }
        .validation-grouped-chart-host .main-bar { cursor: pointer; }
        .validation-grouped-chart-host .color-legend text { fill: #000000; font-family: sans-serif; }
        .validation-grouped-chart-tooltip {
            position: absolute; z-index: 6; min-width: 120px; padding: 10px 12px;
            border: 1px solid rgba(203, 213, 225, 0.9); border-radius: 10px;
            background: rgba(255, 255, 255, 0.96); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
            pointer-events: none; font-family: sans-serif;
        }
        .validation-grouped-chart-tooltip[hidden] { display: none; }
        .validation-grouped-chart-tooltip__row { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; }
        .validation-grouped-chart-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-grouped-chart-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

function getGeometry() {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 56, left: 56 };
    const legendReserve = 180;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    return { width, height, margin, plotW, plotH };
}

function drawLegend(svg, margin, plotW) {
    const legendX = margin.left + plotW + 32;
    svg.selectAll('.color-legend').remove();
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    raceDomain().forEach((race, i) => {
        const cy = i * 26 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', raceColor(race)).attr('opacity', 0.85);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 12).attr('dominant-baseline', 'middle').text(race);
    });
}

export function renderValidationGroupedBarChart({ container }) {
    if (container.querySelector('svg')) {
        return;
    }
    injectGroupedChartStyles();

    const { width, height, margin, plotW, plotH } = getGeometry();
    const xDomain = freqDomain();
    const races = raceDomain();

    const aggregated = [];
    xDomain.forEach((freq) => {
        races.forEach((race) => { aggregated.push({ category: freq, series: race, value: val(freq, race) }); });
    });
    const maxY = Math.max(0, ...aggregated.map((d) => d.value));

    container.innerHTML = '';
    container.classList.add('validation-grouped-chart-host');

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).paddingInner(0.2).paddingOuter(0.1);
    const innerScale = d3.scaleBand().domain(races).range([0, Math.max(xScale.bandwidth(), 1)]).padding(0.08);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale).tickFormat(shortFreq));
    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(aggregated)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => (xScale(d.category) ?? 0) + (innerScale(d.series) ?? 0))
        .attr('width', innerScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', (d) => raceColor(d.series))
        .attr('opacity', 1)
        .attr('data-target', (d) => d.category)
        .attr('data-value', (d) => d.value)
        .attr('data-series', (d) => d.series);

    drawLegend(svg, margin, plotW);

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-grouped-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${X_FIELD}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-x"></span>
        </div>
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${SERIES_FIELD}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-s"></span>
        </div>
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${Y_FIELD}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, d) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#grp-tt-x').textContent = shortFreq(d.category);
            tooltip.querySelector('#grp-tt-s').textContent = d.series;
            tooltip.querySelector('#grp-tt-y').textContent = String(d.value);
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

// Step 1: remove the "Frequently" group, keeping Occasionally and Infrequently.
export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    const { margin, plotW } = getGeometry();
    const remaining = [OCCASIONALLY, INFREQUENTLY];
    const races = raceDomain();
    const xScale = d3.scaleBand().domain(remaining).range([0, plotW]).paddingInner(0.25).paddingOuter(0.12);
    const innerScale = d3.scaleBand().domain(races).range([0, Math.max(xScale.bandwidth(), 1)]).padding(0.08);

    g.selectAll('rect.main-bar')
        .filter((d) => d.category === FREQUENTLY)
        .transition().duration(500).attr('opacity', 0).remove();

    g.selectAll('rect.main-bar')
        .filter((d) => remaining.includes(d.category))
        .transition().delay(200).duration(700)
        .attr('x', (d) => xScale(d.category) + innerScale(d.series))
        .attr('width', innerScale.bandwidth());

    g.select('.x-axis')
        .transition().delay(200).duration(700)
        .call(d3.axisBottom(xScale).tickFormat(shortFreq))
        .on('end', function () { autoRotateXAxisLabels(g.select('.x-axis')); });
}

// Step 2: sum Occasionally + Infrequently per race into a single bar chart.
export function function2({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const races = raceDomain();
    const margin = { top: 44, right: 24, bottom: 56, left: 60 };
    const plotW = 640 - margin.left - margin.right;
    const plotH = 360 - margin.top - margin.bottom;

    const sums = races.map((race) => ({ race, value: val(OCCASIONALLY, race) + val(INFREQUENTLY, race) }));
    const xScale = d3.scaleBand().domain(races).range([0, plotW]).padding(0.4);
    const yScale = d3.scaleLinear().domain([0, d3.max(sums, (d) => d.value)]).nice().range([plotH, 0]);

    const oldLayers = svg.selectAll(':scope > g');

    const gNew = svg.append('g').attr('class', 'validation-sum-layer').attr('transform', `translate(${margin.left},${margin.top})`).attr('opacity', 0);
    gNew.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    gNew.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    gNew.append('text')
        .attr('class', 'x-axis-label')
        .attr('x', plotW / 2).attr('y', plotH + 46).attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif').attr('font-size', 12).text('Race/Ethnicity');

    gNew.selectAll('rect.main-bar')
        .data(sums, (d) => d.race)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.race))
        .attr('width', xScale.bandwidth())
        .attr('fill', (d) => raceColor(d.race))
        .attr('opacity', 1)
        .attr('data-target', (d) => d.race)
        .attr('data-value', (d) => d.value)
        .attr('y', yScale(0))
        .attr('height', 0)
        .transition().delay(350).duration(700)
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value));

    sums.forEach((d) => {
        gNew.append('text')
            .attr('x', xScale(d.race) + xScale.bandwidth() / 2)
            .attr('y', yScale(d.value) - 8)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'sans-serif').attr('font-size', 12).attr('font-weight', 700).attr('fill', '#111827')
            .attr('opacity', 0)
            .text(d.value.toFixed(2))
            .transition().delay(950).duration(400).attr('opacity', 1);
    });

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}

// Step 3: mark the largest sum with a horizontal line.
export function function3({ d3, container }) {
    const g = d3.select(container).select('.validation-sum-layer');
    if (g.empty()) return;

    const races = raceDomain();
    const margin = { top: 44, right: 24, bottom: 56, left: 60 };
    const plotW = 640 - margin.left - margin.right;
    const plotH = 360 - margin.top - margin.bottom;

    const sums = races.map((race) => ({ race, value: val(OCCASIONALLY, race) + val(INFREQUENTLY, race) }));
    const maxItem = sums.reduce((best, d) => (d.value > best.value ? d : best), sums[0]);
    const yScale = d3.scaleLinear().domain([0, d3.max(sums, (d) => d.value)]).nice().range([plotH, 0]);
    const y = yScale(maxItem.value);

    g.selectAll('.validation-max-line, .validation-max-label').remove();
    g.append('line')
        .attr('class', 'validation-max-line')
        .attr('x1', 0).attr('x2', 0).attr('y1', y).attr('y2', y)
        .attr('stroke', MAX_COLOR).attr('stroke-width', 2).attr('stroke-dasharray', '6 4')
        .transition().duration(650).attr('x2', plotW);

    g.append('text')
        .attr('class', 'validation-max-label')
        .attr('x', plotW - 4).attr('y', y - 6).attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif').attr('font-size', 12).attr('font-weight', 700).attr('fill', MAX_COLOR)
        .attr('opacity', 0)
        .text(`Highest: ${maxItem.race} (${maxItem.value.toFixed(2)})`)
        .transition().duration(650).attr('opacity', 1);
}
