import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Country: 'Brazil', 'Procedure Type': 'Surgical', 'Number of procedures': 1493673 },
    { Country: 'Brazil', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 1072002 },
    { Country: 'United States', 'Procedure Type': 'Surgical', 'Number of procedures': 1351917 },
    { Country: 'United States', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 2630832 },
    { Country: 'Mexico', 'Procedure Type': 'Surgical', 'Number of procedures': 580659 },
    { Country: 'Mexico', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 619804 },
    { Country: 'Russia', 'Procedure Type': 'Surgical', 'Number of procedures': 93735 },
    { Country: 'Russia', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 483152 },
    { Country: 'India', 'Procedure Type': 'Surgical', 'Number of procedures': 394728 },
    { Country: 'India', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 249024 },
    { Country: 'Turkey', 'Procedure Type': 'Surgical', 'Number of procedures': 351930 },
    { Country: 'Turkey', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 402462 },
    { Country: 'Germany', 'Procedure Type': 'Surgical', 'Number of procedures': 336244 },
    { Country: 'Germany', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 647188 },
    { Country: 'France', 'Procedure Type': 'Surgical', 'Number of procedures': 320997 },
    { Country: 'France', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 423084 },
    { Country: 'Italy', 'Procedure Type': 'Surgical', 'Number of procedures': 314432 },
    { Country: 'Italy', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 774272 },
    { Country: 'Japan', 'Procedure Type': 'Surgical', 'Number of procedures': 249543 },
    { Country: 'Japan', 'Procedure Type': 'Nonsurgical', 'Number of procedures': 1223678 }
];

const X_FIELD = 'Country';
const SERIES_FIELD = 'Procedure Type';
const Y_FIELD = 'Number of procedures';
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];
const SURGICAL_FILL = '#4f46e5';
const NONSURGICAL_FILL = '#14b8a6';
const AVG_COLOR = '#dc2626';
const EUROPEAN = ['Germany', 'France', 'Italy'];
const ASIAN = ['India', 'Turkey', 'Japan'];
const fmt = d3.format(',');
const fmtSI = d3.format('~s');

function seriesDomainAll() {
    return Array.from(new Set(data_rows.map((d) => String(d[SERIES_FIELD]))));
}
function seriesColor(ser) {
    const dom = seriesDomainAll();
    const i = dom.indexOf(ser);
    return WORKBENCH_PALETTE[i >= 0 ? i % WORKBENCH_PALETTE.length : 0];
}
function countries() {
    return Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
}
function val(country, proc) {
    const row = data_rows.find((d) => String(d[X_FIELD]) === country && String(d[SERIES_FIELD]) === proc);
    return row ? Number(row[Y_FIELD]) : 0;
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

export function renderValidationGroupedBarChart({ container }) {
    if (container.querySelector('svg')) {
        return;
    }
    injectGroupedChartStyles();

    const xDomain = countries();
    const seriesDomain = seriesDomainAll();
    const aggregated = [];
    xDomain.forEach((cat) => {
        seriesDomain.forEach((ser) => {
            aggregated.push({ category: cat, series: ser, value: val(cat, ser) });
        });
    });
    const maxY = Math.max(0, ...aggregated.map((d) => d.value));

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 64, left: 64 };
    const legendReserve = 150;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    container.innerHTML = '';
    container.classList.add('validation-grouped-chart-host');

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).paddingInner(0.18).paddingOuter(0.08);
    const innerScale = d3.scaleBand().domain(seriesDomain).range([0, Math.max(xScale.bandwidth(), 1)]).padding(0.08);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5).tickFormat(fmtSI));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(aggregated)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => (xScale(d.category) ?? 0) + (innerScale(d.series) ?? 0))
        .attr('width', innerScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', (d) => seriesColor(d.series))
        .attr('opacity', 1)
        .attr('data-target', (d) => d.category)
        .attr('data-value', (d) => d.value)
        .attr('data-series', (d) => d.series);

    const legendX = margin.left + plotW + 40;
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    seriesDomain.forEach((ser, i) => {
        const cy = i * 26 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', seriesColor(ser)).attr('opacity', 0.85);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 12).attr('dominant-baseline', 'middle').text(ser);
    });

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
            tooltip.querySelector('#grp-tt-x').textContent = d.category;
            tooltip.querySelector('#grp-tt-s').textContent = d.series;
            tooltip.querySelector('#grp-tt-y').textContent = fmt(d.value);
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

// Two side-by-side panels.
const PANEL = { top: 48, plotH: 244, leftX: 60, rightX: 372, plotW: 224 };

function buildPanel(gParent, { title, fill, countryList, valFn, xScale, yScale, plotH, panelClass }) {
    const panel = gParent.append('g').attr('class', panelClass);
    panel.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5).tickFormat(fmtSI));
    panel.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(panel.select('.x-axis'));
    panel.append('text')
        .attr('x', 0).attr('y', -14)
        .attr('font-family', 'sans-serif').attr('font-size', 13).attr('font-weight', 700).attr('fill', fill)
        .text(title);

    panel.selectAll('rect.main-bar')
        .data(countryList.map((c) => ({ country: c, value: valFn(c) })), (d) => d.country)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.country))
        .attr('width', xScale.bandwidth())
        .attr('fill', fill)
        .attr('opacity', 1)
        .attr('data-target', (d) => d.country)
        .attr('data-value', (d) => d.value)
        .attr('y', yScale(0))
        .attr('height', 0)
        .transition().delay(300).duration(650)
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value));
    return panel;
}

// Step 1: split the grouped bars into Surgical (left) and Nonsurgical (right).
export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;
    d3.select(container).selectAll('.validation-grouped-chart-tooltip').remove();

    const cs = countries();
    const surgMax = d3.max(cs, (c) => val(c, 'Surgical'));
    const nonMax = d3.max(cs, (c) => val(c, 'Nonsurgical'));
    const xScaleL = d3.scaleBand().domain(cs).range([0, PANEL.plotW]).padding(0.15);
    const yL = d3.scaleLinear().domain([0, surgMax]).nice().range([PANEL.plotH, 0]);
    const yR = d3.scaleLinear().domain([0, nonMax]).nice().range([PANEL.plotH, 0]);

    const oldLayers = svg.selectAll(':scope > g');
    const gNew = svg.append('g').attr('class', 'validation-split-layer').attr('opacity', 0);

    const left = gNew.append('g').attr('transform', `translate(${PANEL.leftX},${PANEL.top})`);
    buildPanel(left, { title: 'Surgical', fill: SURGICAL_FILL, countryList: cs, valFn: (c) => val(c, 'Surgical'), xScale: xScaleL, yScale: yL, plotH: PANEL.plotH, panelClass: 'panel-surgical' });

    const right = gNew.append('g').attr('transform', `translate(${PANEL.rightX},${PANEL.top})`);
    buildPanel(right, { title: 'Nonsurgical', fill: NONSURGICAL_FILL, countryList: cs, valFn: (c) => val(c, 'Nonsurgical'), xScale: xScaleL, yScale: yR, plotH: PANEL.plotH, panelClass: 'panel-nonsurgical' });

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}

// Shared y-scale for the Surgical European vs Asian comparison.
function regionYScale() {
    const vals = [...EUROPEAN, ...ASIAN].map((c) => val(c, 'Surgical'));
    return d3.scaleLinear().domain([0, d3.max(vals)]).nice().range([PANEL.plotH, 0]);
}

// Step 2: focus on Surgical and keep the European and Asian countries.
export function function2({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const xScaleE = d3.scaleBand().domain(EUROPEAN).range([0, PANEL.plotW]).padding(0.35);
    const xScaleA = d3.scaleBand().domain(ASIAN).range([0, PANEL.plotW]).padding(0.35);
    const yScale = regionYScale();

    const oldLayers = svg.selectAll(':scope > g');
    const gNew = svg.append('g').attr('class', 'validation-region-layer').attr('opacity', 0);

    const left = gNew.append('g').attr('transform', `translate(${PANEL.leftX},${PANEL.top})`);
    buildPanel(left, { title: 'European (Surgical)', fill: SURGICAL_FILL, countryList: EUROPEAN, valFn: (c) => val(c, 'Surgical'), xScale: xScaleE, yScale, plotH: PANEL.plotH, panelClass: 'panel-european' });

    const right = gNew.append('g').attr('transform', `translate(${PANEL.rightX},${PANEL.top})`);
    buildPanel(right, { title: 'Asian (Surgical)', fill: SURGICAL_FILL, countryList: ASIAN, valFn: (c) => val(c, 'Surgical'), xScale: xScaleA, yScale, plotH: PANEL.plotH, panelClass: 'panel-asian' });

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}

function drawPanelAverage(panel, yScale, avg, labelText) {
    const y = yScale(avg);
    panel.selectAll('.validation-avg-line, .validation-avg-label').remove();
    panel.append('line')
        .attr('class', 'validation-avg-line')
        .attr('x1', 0).attr('x2', 0).attr('y1', y).attr('y2', y)
        .attr('stroke', AVG_COLOR).attr('stroke-width', 2).attr('stroke-dasharray', '6 4')
        .transition().duration(600).attr('x2', PANEL.plotW);
    panel.append('text')
        .attr('class', 'validation-avg-label')
        .attr('x', PANEL.plotW - 2).attr('y', y - 5).attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif').attr('font-size', 11).attr('font-weight', 700).attr('fill', AVG_COLOR)
        .attr('opacity', 0)
        .text(labelText)
        .transition().duration(600).attr('opacity', 1);
}

// Step 3: draw the Surgical average line on each region panel.
export function function3({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.select('.validation-region-layer').empty()) return;
    const yScale = regionYScale();
    const euroAvg = d3.mean(EUROPEAN.map((c) => val(c, 'Surgical')));
    const asiaAvg = d3.mean(ASIAN.map((c) => val(c, 'Surgical')));
    drawPanelAverage(svg.select('.panel-european'), yScale, euroAvg, `avg ${fmt(Math.round(euroAvg))}`);
    drawPanelAverage(svg.select('.panel-asian'), yScale, asiaAvg, `avg ${fmt(Math.round(asiaAvg))}`);
}

// Step 4: compare the two averages and show the difference.
export function function4({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const euroAvg = d3.mean(EUROPEAN.map((c) => val(c, 'Surgical')));
    const asiaAvg = d3.mean(ASIAN.map((c) => val(c, 'Surgical')));
    const diff = euroAvg - asiaAvg;

    const margin = { top: 56, left: 80 };
    const plotW = 420;
    const plotH = 236;
    const rows = [
        { label: 'European avg', value: euroAvg },
        { label: 'Asian avg', value: asiaAvg }
    ];
    const xScale = d3.scaleBand().domain(rows.map((r) => r.label)).range([0, plotW]).padding(0.45);
    const yScale = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.value)]).nice().range([plotH, 0]);

    const oldLayers = svg.selectAll(':scope > g');
    const gNew = svg.append('g').attr('class', 'validation-diff-layer').attr('transform', `translate(${margin.left},${margin.top})`).attr('opacity', 0);

    gNew.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5).tickFormat(fmtSI));
    gNew.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    gNew.selectAll('rect.main-bar')
        .data(rows, (d) => d.label)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.label))
        .attr('width', xScale.bandwidth())
        .attr('fill', SURGICAL_FILL)
        .attr('opacity', 1)
        .attr('data-target', (d) => d.label)
        .attr('data-value', (d) => Math.round(d.value))
        .attr('y', yScale(0))
        .attr('height', 0)
        .transition().delay(350).duration(700)
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value));

    rows.forEach((r) => {
        gNew.append('text')
            .attr('x', xScale(r.label) + xScale.bandwidth() / 2)
            .attr('y', yScale(r.value) - 8)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'sans-serif').attr('font-size', 12).attr('font-weight', 700).attr('fill', '#111827')
            .attr('opacity', 0)
            .text(fmt(Math.round(r.value)))
            .transition().delay(950).duration(400).attr('opacity', 1);
    });

    gNew.append('text')
        .attr('x', plotW / 2)
        .attr('y', -18)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif').attr('font-size', 14).attr('font-weight', 800).attr('fill', diff < 0 ? '#dc2626' : '#2563eb')
        .attr('opacity', 0)
        .text(`European − Asian = ${diff < 0 ? '−' : ''}${fmt(Math.abs(Math.round(diff)))}`)
        .transition().delay(950).duration(500).attr('opacity', 1);

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}
