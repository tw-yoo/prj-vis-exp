import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2008, 'Asset Size': '0 – 500 million US dollars', 'Market share': 23.4 },
    { Year: 2008, 'Asset Size': '501 – 2,000 million US dollars', 'Market share': 19.3 },
    { Year: 2008, 'Asset Size': '2,001 – 10,000 million US dollars', 'Market share': 27.9 },
    { Year: 2008, 'Asset Size': 'Over 10,001 million US dollars', 'Market share': 29.4 },
    { Year: 2009, 'Asset Size': '0 – 500 million US dollars', 'Market share': 22.5 },
    { Year: 2009, 'Asset Size': '501 – 2,000 million US dollars', 'Market share': 20.5 },
    { Year: 2009, 'Asset Size': '2,001 – 10,000 million US dollars', 'Market share': 27.5 },
    { Year: 2009, 'Asset Size': 'Over 10,001 million US dollars', 'Market share': 29.6 },
    { Year: 2010, 'Asset Size': '0 – 500 million US dollars', 'Market share': 24.8 },
    { Year: 2010, 'Asset Size': '501 – 2,000 million US dollars', 'Market share': 27.5 },
    { Year: 2010, 'Asset Size': '2,001 – 10,000 million US dollars', 'Market share': 32.3 },
    { Year: 2010, 'Asset Size': 'Over 10,001 million US dollars', 'Market share': 15.4 },
    { Year: 2011, 'Asset Size': '0 – 500 million US dollars', 'Market share': 24.8 },
    { Year: 2011, 'Asset Size': '501 – 2,000 million US dollars', 'Market share': 26.3 },
    { Year: 2011, 'Asset Size': '2,001 – 10,000 million US dollars', 'Market share': 33.9 },
    { Year: 2011, 'Asset Size': 'Over 10,001 million US dollars', 'Market share': 15 },
    { Year: 2012, 'Asset Size': '0 – 500 million US dollars', 'Market share': 23.2 },
    { Year: 2012, 'Asset Size': '501 – 2,000 million US dollars', 'Market share': 28.3 },
    { Year: 2012, 'Asset Size': '2,001 – 10,000 million US dollars', 'Market share': 30.6 },
    { Year: 2012, 'Asset Size': 'Over 10,001 million US dollars', 'Market share': 17.9 }
];

const X_FIELD = 'Year';
const SERIES_FIELD = 'Asset Size';
const Y_FIELD = 'Market share';
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];
const BLUE_SERIES = '0 – 500 million US dollars';
const GRAY_SERIES = 'Over 10,001 million US dollars';
const KEEP = [BLUE_SERIES, GRAY_SERIES];
const BLUE_FILL = '#2563eb';
const GRAY_FILL = '#6b7280';
const KEEP_FILL = { [BLUE_SERIES]: BLUE_FILL, [GRAY_SERIES]: GRAY_FILL };
const DIFF_COLOR = '#111827';
const MAX_BG = '#fde68a';

function seriesDomainAll() {
    return Array.from(new Set(data_rows.map((d) => String(d[SERIES_FIELD]))));
}
function seriesColor(ser) {
    const dom = seriesDomainAll();
    const i = dom.indexOf(ser);
    return WORKBENCH_PALETTE[i >= 0 ? i % WORKBENCH_PALETTE.length : 0];
}
function years() {
    return Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
}
function val(year, ser) {
    const row = data_rows.find((d) => String(d[X_FIELD]) === year && String(d[SERIES_FIELD]) === ser);
    return row ? Number(row[Y_FIELD]) : 0;
}

function injectStackedChartStyles() {
    if (document.getElementById('validation-stacked-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-stacked-chart-styles';
    style.textContent = `
        .validation-stacked-chart-host { position: relative; background: #ffffff; color: #000000; }
        .validation-stacked-chart-host svg { display: block; overflow: visible; max-width: 100%; height: auto; }
        .validation-stacked-chart-host .x-axis line,
        .validation-stacked-chart-host .x-axis path,
        .validation-stacked-chart-host .y-axis line,
        .validation-stacked-chart-host .y-axis path { stroke: #000000; stroke-opacity: 1; }
        .validation-stacked-chart-host .x-axis text,
        .validation-stacked-chart-host .y-axis text,
        .validation-stacked-chart-host .x-axis-label,
        .validation-stacked-chart-host .y-axis-label { fill: #000000; fill-opacity: 1; font-size: 11px; font-family: sans-serif; }
        .validation-stacked-chart-host .main-bar { cursor: pointer; }
        .validation-stacked-chart-host .color-legend text { fill: #000000; font-family: sans-serif; }
        .validation-stacked-chart-tooltip {
            position: absolute; z-index: 6; min-width: 120px; padding: 10px 12px;
            border: 1px solid rgba(203, 213, 225, 0.9); border-radius: 10px;
            background: rgba(255, 255, 255, 0.96); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
            pointer-events: none; font-family: sans-serif;
        }
        .validation-stacked-chart-tooltip[hidden] { display: none; }
        .validation-stacked-chart-tooltip__row { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; }
        .validation-stacked-chart-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-stacked-chart-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationStackedBarChart({ container }) {
    if (container.querySelector('svg')) {
        return;
    }
    injectStackedChartStyles();

    const xDomain = years();
    const seriesDomain = seriesDomainAll();

    const wideData = xDomain.map((cat) => {
        const row = { [X_FIELD]: cat };
        seriesDomain.forEach((ser) => { row[ser] = val(cat, ser); });
        return row;
    });
    const stackedData = d3.stack().keys(seriesDomain)(wideData);
    const segments = [];
    stackedData.forEach((layer) => {
        layer.forEach((d) => {
            segments.push({ target: d.data[X_FIELD], series: layer.key, value: d.data[layer.key], y0: d[0], y1: d[1] });
        });
    });
    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendReserve = 260;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.25);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(segments)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (s) => xScale(s.target))
        .attr('width', xScale.bandwidth())
        .attr('y', (s) => yScale(Math.max(s.y0, s.y1)))
        .attr('height', (s) => Math.abs(yScale(s.y0) - yScale(s.y1)))
        .attr('fill', (s) => seriesColor(s.series))
        .attr('opacity', 1)
        .attr('data-target', (s) => s.target)
        .attr('data-value', (s) => s.value)
        .attr('data-series', (s) => s.series);

    const legendX = margin.left + plotW + 24;
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    seriesDomain.forEach((ser, i) => {
        const cy = i * 26 + 8;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', seriesColor(ser)).attr('opacity', 0.85);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 11).attr('dominant-baseline', 'middle').attr('font-family', 'sans-serif').attr('fill', '#000').text(ser);
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-stacked-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${X_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${SERIES_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${Y_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, s) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#stk-tt-x').textContent = s.target;
            tooltip.querySelector('#stk-tt-s').textContent = s.series;
            tooltip.querySelector('#stk-tt-y').textContent = String(s.value);
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

function getChartGeom() {
    const width = 640;
    const height = 360;
    const margin = { top: 44, right: 16, bottom: 48, left: 56 };
    const legendReserve = 150;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(years()).range([0, plotW]).padding(0.3);
    return { width, height, margin, plotW, plotH, xScale };
}

function drawLegend(svg, geom) {
    const legendX = geom.margin.left + geom.plotW + 24;
    svg.selectAll('.color-legend').remove();
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${geom.margin.top})`);
    KEEP.forEach((ser, i) => {
        const cy = i * 24 + 8;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', KEEP_FILL[ser]).attr('opacity', 0.9);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 11).attr('dominant-baseline', 'middle').attr('font-family', 'sans-serif').attr('fill', '#000').text(ser);
    });
}

// Step 1: keep only the blue and gray series as a stacked bar.
export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;
    d3.select(container).selectAll('.validation-stacked-chart-tooltip').remove();

    const geom = getChartGeom();
    const { margin, plotW, plotH, xScale } = geom;
    const yMax = d3.max(years(), (y) => KEEP.reduce((sum, ser) => sum + val(y, ser), 0));
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plotH, 0]);

    const oldLayers = svg.selectAll(':scope > g');

    const gNew = svg.append('g').attr('class', 'validation-kept-layer').attr('transform', `translate(${margin.left},${margin.top})`).attr('opacity', 0);
    gNew.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    gNew.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    years().forEach((y) => {
        let acc = 0;
        KEEP.forEach((ser) => {
            const v = val(y, ser);
            const y0 = acc; const y1 = acc + v; acc = y1;
            gNew.append('rect')
                .attr('class', 'main-bar')
                .attr('x', xScale(y))
                .attr('width', xScale.bandwidth())
                .attr('y', yScale(y1))
                .attr('height', plotH - yScale(v))
                .attr('fill', KEEP_FILL[ser])
                .attr('opacity', 1)
                .attr('data-target', y)
                .attr('data-series', ser)
                .attr('data-value', v);
        });
    });

    drawLegend(svg, geom);
    svg.selectAll('.color-legend').attr('opacity', 0).transition().duration(500).attr('opacity', 1);
    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}

// Step 2: convert to a grouped bar (the two series side by side per year).
export function function2({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const geom = getChartGeom();
    const { margin, plotW, plotH, xScale } = geom;
    const innerScale = d3.scaleBand().domain(KEEP).range([0, xScale.bandwidth()]).padding(0.12);
    const yMax = d3.max(data_rows.filter((d) => KEEP.includes(String(d[SERIES_FIELD]))), (d) => Number(d[Y_FIELD]));
    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([plotH, 0]);

    const toRemove = svg.selectAll(':scope > g').filter(function () { return !this.classList.contains('color-legend'); });

    const gNew = svg.append('g').attr('class', 'validation-grouped-layer').attr('transform', `translate(${margin.left},${margin.top})`).attr('opacity', 0);
    gNew.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    gNew.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    years().forEach((y) => {
        KEEP.forEach((ser) => {
            const v = val(y, ser);
            gNew.append('rect')
                .attr('class', 'main-bar')
                .attr('x', xScale(y) + innerScale(ser))
                .attr('width', innerScale.bandwidth())
                .attr('fill', KEEP_FILL[ser])
                .attr('opacity', 1)
                .attr('data-target', y)
                .attr('data-series', ser)
                .attr('data-value', v)
                .attr('y', yScale(0))
                .attr('height', 0)
                .transition().delay(300).duration(650)
                .attr('y', yScale(v))
                .attr('height', plotH - yScale(v));
        });
    });

    gNew.transition().duration(500).attr('opacity', 1);
    toRemove.transition().duration(500).attr('opacity', 0).remove();
}

function groupedYScale(plotH) {
    const yMax = d3.max(data_rows.filter((d) => KEEP.includes(String(d[SERIES_FIELD]))), (d) => Number(d[Y_FIELD]));
    return d3.scaleLinear().domain([0, yMax]).nice().range([plotH, 0]);
}

// Step 3: show each year's difference with a connector and vertical arrow.
export function function3({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const layer = svg.select('.validation-grouped-layer');
    if (layer.empty()) return;

    const geom = getChartGeom();
    const { plotH, xScale } = geom;
    const innerScale = d3.scaleBand().domain(KEEP).range([0, xScale.bandwidth()]).padding(0.12);
    const yScale = groupedYScale(plotH);

    // Arrowhead marker.
    let defs = svg.select('defs');
    if (defs.empty()) defs = svg.append('defs');
    if (defs.select('#q7-arrow').empty()) {
        const marker = defs.append('marker')
            .attr('id', 'q7-arrow').attr('viewBox', '0 0 10 10')
            .attr('refX', 5).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto-start-reverse');
        marker.append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', DIFF_COLOR);
    }

    layer.selectAll('.validation-diff').remove();

    years().forEach((y, i) => {
        const blueV = val(y, BLUE_SERIES);
        const grayV = val(y, GRAY_SERIES);
        const blueX = xScale(y) + innerScale(BLUE_SERIES) + innerScale.bandwidth() / 2;
        const grayX = xScale(y) + innerScale(GRAY_SERIES) + innerScale.bandwidth() / 2;
        const blueTop = yScale(blueV);
        const grayTop = yScale(grayV);
        const highTop = Math.min(blueTop, grayTop);
        const lowTop = Math.max(blueTop, grayTop);
        const arrowX = (blueX + grayX) / 2;
        const diff = Math.abs(blueV - grayV);

        // Horizontal guide from the taller bar top across to the arrow.
        const tallX = blueTop < grayTop ? blueX : grayX;
        layer.append('line')
            .attr('class', 'validation-diff')
            .attr('x1', tallX).attr('y1', highTop).attr('x2', arrowX).attr('y2', highTop)
            .attr('stroke', DIFF_COLOR).attr('stroke-width', 1).attr('stroke-dasharray', '3 3')
            .attr('opacity', 0).transition().delay(i * 60).duration(400).attr('opacity', 0.8);

        // Vertical double arrow between the two tops.
        layer.append('line')
            .attr('class', 'validation-diff')
            .attr('x1', arrowX).attr('y1', lowTop).attr('x2', arrowX).attr('y2', highTop)
            .attr('stroke', DIFF_COLOR).attr('stroke-width', 1.5)
            .attr('marker-start', 'url(#q7-arrow)').attr('marker-end', 'url(#q7-arrow)')
            .attr('opacity', 0).transition().delay(i * 60 + 150).duration(400).attr('opacity', 1);

        layer.append('text')
            .attr('class', 'validation-diff')
            .attr('x', arrowX + 4).attr('y', (highTop + lowTop) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif').attr('font-size', 11).attr('font-weight', 700).attr('fill', DIFF_COLOR)
            .attr('opacity', 0)
            .text(diff.toFixed(1))
            .transition().delay(i * 60 + 250).duration(400).attr('opacity', 1);
    });
}

// Step 4: highlight the year with the greatest difference.
export function function4({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const layer = svg.select('.validation-grouped-layer');
    if (layer.empty()) return;

    const geom = getChartGeom();
    const { plotH, xScale } = geom;

    const diffs = years().map((y) => ({ year: y, diff: Math.abs(val(y, BLUE_SERIES) - val(y, GRAY_SERIES)) }));
    const maxYear = diffs.reduce((best, d) => (d.diff > best.diff ? d : best), diffs[0]);

    layer.selectAll('.validation-max-bg, .validation-max-label').remove();
    layer.insert('rect', ':first-child')
        .attr('class', 'validation-max-bg')
        .attr('x', xScale(maxYear.year) - 6)
        .attr('y', 0)
        .attr('width', xScale.bandwidth() + 12)
        .attr('height', plotH)
        .attr('fill', MAX_BG)
        .attr('opacity', 0)
        .transition().duration(600).attr('opacity', 0.7);

    layer.append('text')
        .attr('class', 'validation-max-label')
        .attr('x', xScale(maxYear.year) + xScale.bandwidth() / 2)
        .attr('y', -14)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif').attr('font-size', 12).attr('font-weight', 700).attr('fill', '#b45309')
        .attr('opacity', 0)
        .text(`Greatest difference: ${maxYear.year} (${maxYear.diff.toFixed(1)})`)
        .transition().duration(600).attr('opacity', 1);
}
