import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Season: '2009/10', Revenue_Type: 'Matchday', Revenue_Million_Euros: 129.1 },
    { Season: '2009/10', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 158.7 },
    { Season: '2009/10', Revenue_Type: 'Commercial', Revenue_Million_Euros: 150.8 },
    { Season: '2010/11', Revenue_Type: 'Matchday', Revenue_Million_Euros: 123.6 },
    { Season: '2010/11', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 183.5 },
    { Season: '2010/11', Revenue_Type: 'Commercial', Revenue_Million_Euros: 172.4 },
    { Season: '2011/12', Revenue_Type: 'Matchday', Revenue_Million_Euros: 126.2 },
    { Season: '2011/12', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 199.2 },
    { Season: '2011/12', Revenue_Type: 'Commercial', Revenue_Million_Euros: 187.2 },
    { Season: '2012/13', Revenue_Type: 'Matchday', Revenue_Million_Euros: 119 },
    { Season: '2012/13', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 188.3 },
    { Season: '2012/13', Revenue_Type: 'Commercial', Revenue_Million_Euros: 211.6 },
    { Season: '2013/14', Revenue_Type: 'Matchday', Revenue_Million_Euros: 113.8 },
    { Season: '2013/14', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 204.2 },
    { Season: '2013/14', Revenue_Type: 'Commercial', Revenue_Million_Euros: 231.5 },
    { Season: '2014/15', Revenue_Type: 'Matchday', Revenue_Million_Euros: 129.8 },
    { Season: '2014/15', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 199.9 },
    { Season: '2014/15', Revenue_Type: 'Commercial', Revenue_Million_Euros: 247.3 },
    { Season: '2015/16', Revenue_Type: 'Matchday', Revenue_Million_Euros: 129 },
    { Season: '2015/16', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 227.7 },
    { Season: '2015/16', Revenue_Type: 'Commercial', Revenue_Million_Euros: 263.4 },
    { Season: '2016/17', Revenue_Type: 'Matchday', Revenue_Million_Euros: 136.4 },
    { Season: '2016/17', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 236.8 },
    { Season: '2016/17', Revenue_Type: 'Commercial', Revenue_Million_Euros: 301.4 },
    { Season: '2017/18', Revenue_Type: 'Matchday', Revenue_Million_Euros: 143.4 },
    { Season: '2017/18', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 251.3 },
    { Season: '2017/18', Revenue_Type: 'Commercial', Revenue_Million_Euros: 356.2 },
    { Season: '2018/19', Revenue_Type: 'Matchday', Revenue_Million_Euros: 144.8 },
    { Season: '2018/19', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 257.9 },
    { Season: '2018/19', Revenue_Type: 'Commercial', Revenue_Million_Euros: 354.6 },
    { Season: '2019/20', Revenue_Type: 'Matchday', Revenue_Million_Euros: 108.2 },
    { Season: '2019/20', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 224 },
    { Season: '2019/20', Revenue_Type: 'Commercial', Revenue_Million_Euros: 359.6 }
];

const X_FIELD = 'Season';
const SERIES_FIELD = 'Revenue_Type';
const Y_FIELD = 'Revenue_Million_Euros';
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];
const AVG_COLOR = '#dc2626';
const BOTH_BG = '#fde68a';

function seriesDomainAll() {
    return Array.from(new Set(data_rows.map((d) => String(d[SERIES_FIELD]))));
}
function seriesColor(ser) {
    const dom = seriesDomainAll();
    const i = dom.indexOf(ser);
    return WORKBENCH_PALETTE[i >= 0 ? i % WORKBENCH_PALETTE.length : 0];
}
function seriesVal(season, type) {
    const row = data_rows.find((d) => String(d[X_FIELD]) === season && String(d[SERIES_FIELD]) === type);
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

    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
    const seriesDomain = seriesDomainAll();

    const wideData = xDomain.map((cat) => {
        const row = { [X_FIELD]: cat };
        seriesDomain.forEach((ser) => { row[ser] = seriesVal(cat, ser); });
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
    const legendOffsetX = 24;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
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

    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    seriesDomain.forEach((ser, i) => {
        const cy = i * 24 + 8;
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

// Two-panel split layout (Commercial on top, Broadcasting below).
function getSplitLayout() {
    const MARGIN_L = 56;
    const MARGIN_R = 24;
    const width = 640;
    const plotW = width - MARGIN_L - MARGIN_R;
    const TOP1 = 48;
    const PANEL_H = 168;
    const GAP = 70;
    const TOP2 = TOP1 + PANEL_H + GAP;
    const seasons = Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
    const xScale = d3.scaleBand().domain(seasons).range([0, plotW]).padding(0.2);
    const commVals = seasons.map((s) => seriesVal(s, 'Commercial'));
    const broadVals = seasons.map((s) => seriesVal(s, 'Broadcasting'));
    const yCommercial = d3.scaleLinear().domain([0, d3.max(commVals)]).nice().range([PANEL_H, 0]);
    const yBroadcasting = d3.scaleLinear().domain([0, d3.max(broadVals)]).nice().range([PANEL_H, 0]);
    return { MARGIN_L, plotW, TOP1, TOP2, PANEL_H, GAP, seasons, xScale, yCommercial, yBroadcasting };
}

function buildPanel(gParent, { type, fill, xScale, yScale, plotW, plotH, seasons, panelClass }) {
    const panel = gParent.append('g').attr('class', panelClass);

    panel.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    panel.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(panel.select('.x-axis'));

    panel.append('text')
        .attr('x', 0).attr('y', -12)
        .attr('font-family', 'sans-serif').attr('font-size', 13).attr('font-weight', 700).attr('fill', fill)
        .text(type);

    panel.selectAll('rect.main-bar')
        .data(seasons.map((s) => ({ season: s, value: seriesVal(s, type) })), (d) => d.season)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.season))
        .attr('width', xScale.bandwidth())
        .attr('fill', fill)
        .attr('opacity', 1)
        .attr('data-target', (d) => d.season)
        .attr('data-value', (d) => d.value)
        .attr('data-panel', type.toLowerCase())
        .attr('y', yScale(0))
        .attr('height', 0)
        .transition().delay(300).duration(700)
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value));

    return panel;
}

// Step 1: split the stacked bars into Commercial (top) and Broadcasting (bottom).
export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;
    d3.select(container).selectAll('.validation-stacked-chart-tooltip').remove();

    const L = getSplitLayout();
    svg.attr('viewBox', '0 0 640 500');

    const oldLayers = svg.selectAll(':scope > g');

    const gNew = svg.append('g').attr('class', 'validation-split-layer').attr('opacity', 0);

    const top = gNew.append('g').attr('class', 'panel-wrap-commercial').attr('transform', `translate(${L.MARGIN_L},${L.TOP1})`);
    buildPanel(top, { type: 'Commercial', fill: seriesColor('Commercial'), xScale: L.xScale, yScale: L.yCommercial, plotW: L.plotW, plotH: L.PANEL_H, seasons: L.seasons, panelClass: 'panel-commercial' });

    const bottom = gNew.append('g').attr('class', 'panel-wrap-broadcasting').attr('transform', `translate(${L.MARGIN_L},${L.TOP2})`);
    buildPanel(bottom, { type: 'Broadcasting', fill: seriesColor('Broadcasting'), xScale: L.xScale, yScale: L.yBroadcasting, plotW: L.plotW, plotH: L.PANEL_H, seasons: L.seasons, panelClass: 'panel-broadcasting' });

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}

function drawPanelAverage(panel, yScale, avg, plotW) {
    const y = yScale(avg);
    panel.selectAll('.validation-avg-line, .validation-avg-label').remove();
    panel.append('line')
        .attr('class', 'validation-avg-line')
        .attr('x1', 0).attr('x2', 0).attr('y1', y).attr('y2', y)
        .attr('stroke', AVG_COLOR).attr('stroke-width', 2).attr('stroke-dasharray', '6 4')
        .transition().duration(600).attr('x2', plotW);
    panel.append('text')
        .attr('class', 'validation-avg-label')
        .attr('x', plotW - 2).attr('y', y - 5).attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif').attr('font-size', 11).attr('font-weight', 700).attr('fill', AVG_COLOR)
        .attr('opacity', 0)
        .text(`avg ${avg.toFixed(1)}`)
        .transition().duration(600).attr('opacity', 1);
}

// Step 2: draw each panel's average line.
export function function2({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.select('.validation-split-layer').empty()) return;
    const L = getSplitLayout();
    const commAvg = d3.mean(L.seasons.map((s) => seriesVal(s, 'Commercial')));
    const broadAvg = d3.mean(L.seasons.map((s) => seriesVal(s, 'Broadcasting')));

    drawPanelAverage(svg.select('.panel-commercial'), L.yCommercial, commAvg, L.plotW);
    drawPanelAverage(svg.select('.panel-broadcasting'), L.yBroadcasting, broadAvg, L.plotW);
}

// Step 3: keep the above-average bars in each panel, dim the rest.
export function function3({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.select('.validation-split-layer').empty()) return;
    const L = getSplitLayout();
    const commAvg = d3.mean(L.seasons.map((s) => seriesVal(s, 'Commercial')));
    const broadAvg = d3.mean(L.seasons.map((s) => seriesVal(s, 'Broadcasting')));

    svg.select('.panel-commercial').selectAll('rect.main-bar')
        .transition().duration(600)
        .attr('opacity', function () { return Number(this.getAttribute('data-value')) > commAvg ? 1 : 0.3; });
    svg.select('.panel-broadcasting').selectAll('rect.main-bar')
        .transition().duration(600)
        .attr('opacity', function () { return Number(this.getAttribute('data-value')) > broadAvg ? 1 : 0.3; });
}

// Step 4: highlight the seasons above average in BOTH panels.
export function function4({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const layer = svg.select('.validation-split-layer');
    if (layer.empty()) return;
    const L = getSplitLayout();
    const commAvg = d3.mean(L.seasons.map((s) => seriesVal(s, 'Commercial')));
    const broadAvg = d3.mean(L.seasons.map((s) => seriesVal(s, 'Broadcasting')));

    const bothSeasons = L.seasons.filter((s) => seriesVal(s, 'Commercial') > commAvg && seriesVal(s, 'Broadcasting') > broadAvg);
    const topY = L.TOP1;
    const bottomY = L.TOP2 + L.PANEL_H;

    layer.selectAll('.validation-both-bg, .validation-both-label').remove();
    bothSeasons.forEach((s, i) => {
        layer.insert('rect', ':first-child')
            .attr('class', 'validation-both-bg')
            .attr('x', L.MARGIN_L + L.xScale(s))
            .attr('y', topY)
            .attr('width', L.xScale.bandwidth())
            .attr('height', bottomY - topY)
            .attr('fill', BOTH_BG)
            .attr('opacity', 0)
            .transition().delay(i * 90).duration(500).attr('opacity', 0.65);
    });

    layer.append('text')
        .attr('class', 'validation-both-label')
        .attr('x', L.MARGIN_L)
        .attr('y', topY - 24)
        .attr('font-family', 'sans-serif').attr('font-size', 12).attr('font-weight', 700).attr('fill', '#b45309')
        .attr('opacity', 0)
        .text(`Above average in both: ${bothSeasons.join(', ')}`)
        .transition().duration(600).attr('opacity', 1);
}
