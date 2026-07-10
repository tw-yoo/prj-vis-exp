import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2001, News_Source: 'Television', Share_of_Respondents: 74 },
    { Year: 2001, News_Source: 'Newspaper', Share_of_Respondents: 45 },
    { Year: 2001, News_Source: 'Internet', Share_of_Respondents: 13 },
    { Year: 2001, News_Source: 'Radio', Share_of_Respondents: 18 },
    { Year: 2002, News_Source: 'Television', Share_of_Respondents: 82 },
    { Year: 2002, News_Source: 'Newspaper', Share_of_Respondents: 42 },
    { Year: 2002, News_Source: 'Internet', Share_of_Respondents: 14 },
    { Year: 2002, News_Source: 'Radio', Share_of_Respondents: 21 },
    { Year: 2003, News_Source: 'Television', Share_of_Respondents: 80 },
    { Year: 2003, News_Source: 'Newspaper', Share_of_Respondents: 50 },
    { Year: 2003, News_Source: 'Internet', Share_of_Respondents: 20 },
    { Year: 2003, News_Source: 'Radio', Share_of_Respondents: 18 },
    { Year: 2004, News_Source: 'Television', Share_of_Respondents: 74 },
    { Year: 2004, News_Source: 'Newspaper', Share_of_Respondents: 46 },
    { Year: 2004, News_Source: 'Internet', Share_of_Respondents: 24 },
    { Year: 2004, News_Source: 'Radio', Share_of_Respondents: 21 },
    { Year: 2005, News_Source: 'Television', Share_of_Respondents: 73 },
    { Year: 2005, News_Source: 'Newspaper', Share_of_Respondents: 36 },
    { Year: 2005, News_Source: 'Internet', Share_of_Respondents: 20 },
    { Year: 2005, News_Source: 'Radio', Share_of_Respondents: 16 },
    { Year: 2006, News_Source: 'Television', Share_of_Respondents: 72 },
    { Year: 2006, News_Source: 'Newspaper', Share_of_Respondents: 36 },
    { Year: 2006, News_Source: 'Internet', Share_of_Respondents: 24 },
    { Year: 2006, News_Source: 'Radio', Share_of_Respondents: 14 },
    { Year: 2007, News_Source: 'Television', Share_of_Respondents: 74 },
    { Year: 2007, News_Source: 'Newspaper', Share_of_Respondents: 34 },
    { Year: 2007, News_Source: 'Internet', Share_of_Respondents: 24 },
    { Year: 2007, News_Source: 'Radio', Share_of_Respondents: 13 },
    { Year: 2008, News_Source: 'Television', Share_of_Respondents: 70 },
    { Year: 2008, News_Source: 'Newspaper', Share_of_Respondents: 35 },
    { Year: 2008, News_Source: 'Internet', Share_of_Respondents: 40 },
    { Year: 2008, News_Source: 'Radio', Share_of_Respondents: 18 },
    { Year: 2009, News_Source: 'Television', Share_of_Respondents: 70 },
    { Year: 2009, News_Source: 'Newspaper', Share_of_Respondents: 32 },
    { Year: 2009, News_Source: 'Internet', Share_of_Respondents: 35 },
    { Year: 2009, News_Source: 'Radio', Share_of_Respondents: 17 },
    { Year: 2010, News_Source: 'Television', Share_of_Respondents: 66 },
    { Year: 2010, News_Source: 'Newspaper', Share_of_Respondents: 31 },
    { Year: 2010, News_Source: 'Internet', Share_of_Respondents: 41 },
    { Year: 2010, News_Source: 'Radio', Share_of_Respondents: 16 }
];

const X_FIELD = 'Year';
const SERIES_FIELD = 'News_Source';
const Y_FIELD = 'Share_of_Respondents';
const MULTI_LINE_PALETTE = ['#60a5fa', '#fb7185', '#f59e0b', '#10b981', '#c084fc', '#f472b6', '#22d3ee', '#a3e635', '#f97316'];
const HIGHLIGHT_BG = '#fde68a';
const AVG_COLOR = '#dc2626';
const FOCUS_YEARS = ['2003', '2004', '2005', '2006', '2007'];

function seriesDomainAll() {
    return Array.from(new Set(data_rows.map((d) => String(d[SERIES_FIELD]))));
}
function resolveSeriesColor(series) {
    const dom = seriesDomainAll();
    const index = dom.indexOf(series);
    return MULTI_LINE_PALETTE[index >= 0 ? index % MULTI_LINE_PALETTE.length : 0];
}

function injectMultiLineStyles() {
    if (document.getElementById('validation-multi-line-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-multi-line-styles';
    style.textContent = `
        .validation-multi-line-host { position: relative; background: #ffffff; color: #000000; }
        .validation-multi-line-host svg { display: block; overflow: visible; max-width: 100%; height: auto; }
        .validation-multi-line-host .x-axis line,
        .validation-multi-line-host .x-axis path,
        .validation-multi-line-host .y-axis line,
        .validation-multi-line-host .y-axis path { stroke: #000000; stroke-opacity: 1; }
        .validation-multi-line-host .x-axis text,
        .validation-multi-line-host .y-axis text,
        .validation-multi-line-host .x-axis-label,
        .validation-multi-line-host .y-axis-label { fill: #000000; fill-opacity: 1; font-size: 11px; font-family: sans-serif; }
        .validation-multi-line-host .color-legend text { fill: #000000; font-family: sans-serif; }
        .validation-multi-line-tooltip {
            position: absolute; z-index: 6; min-width: 120px; padding: 10px 12px;
            border: 1px solid rgba(203, 213, 225, 0.9); border-radius: 10px;
            background: rgba(255, 255, 255, 0.96); box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
            pointer-events: none; font-family: sans-serif;
        }
        .validation-multi-line-tooltip[hidden] { display: none; }
        .validation-multi-line-tooltip__row { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; }
        .validation-multi-line-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-multi-line-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

function getGeometry() {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    return { width, height, margin, legendOffsetX, plotW, plotH, xScale, xDomain };
}

// Y scale for a given subset of series (used to rescale after dropping Television).
function yScaleFor(seriesList) {
    const { plotH } = getGeometry();
    const vals = data_rows
        .filter((d) => seriesList.includes(String(d[SERIES_FIELD])))
        .map((d) => Number(d[Y_FIELD]));
    const minY = d3.min(vals) ?? 0;
    const maxY = d3.max(vals) ?? 1;
    return d3.scaleLinear().domain([minY, maxY]).nice().range([plotH, 0]);
}

function seriesPoints(ser) {
    return data_rows
        .filter((d) => String(d[SERIES_FIELD]) === ser)
        .map((d) => ({ target: String(d[X_FIELD]), yValue: Number(d[Y_FIELD]) }));
}

export function renderValidationMultipleLineChart({ container }) {
    if (container.querySelector('svg')) {
        return;
    }
    injectMultiLineStyles();

    const { width, height, margin, legendOffsetX, plotW, plotH, xScale, xDomain } = getGeometry();
    const seriesDomain = seriesDomainAll();
    const yScale = yScaleFor(seriesDomain);

    container.innerHTML = '';
    container.classList.add('validation-multi-line-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('data-m-left', margin.left)
        .attr('data-m-top', margin.top)
        .style('overflow', 'visible');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(6));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    const lineGen = d3.line().x((p) => xScale(p.target)).y((p) => yScale(p.yValue));

    seriesDomain.forEach((ser) => {
        const stroke = resolveSeriesColor(ser);
        const pts = seriesPoints(ser);
        g.append('path')
            .datum(pts)
            .attr('class', 'main-line')
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', 2)
            .attr('opacity', 1)
            .attr('d', lineGen)
            .attr('data-series', ser);

        g.selectAll(`circle[data-series="${ser}"]`)
            .data(pts)
            .join('circle')
            .attr('cx', (p) => xScale(p.target))
            .attr('cy', (p) => yScale(p.yValue))
            .attr('r', 4)
            .attr('fill', stroke)
            .attr('opacity', 0.85)
            .attr('data-target', (p) => p.target)
            .attr('data-series', ser)
            .attr('data-value', (p) => String(p.yValue))
            .attr('data-x-value', (p) => p.target)
            .attr('data-y-value', (p) => String(p.yValue))
            .attr('data-group-value', ser);
    });

    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    seriesDomain.forEach((ser, i) => {
        const cy = i * 26 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', resolveSeriesColor(ser)).attr('opacity', 0.85).attr('data-legend', ser);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 13).attr('dominant-baseline', 'middle').attr('data-legend', ser).text(ser);
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-multi-line-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${X_FIELD}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-x"></span>
        </div>
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${SERIES_FIELD}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-s"></span>
        </div>
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${Y_FIELD}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('circle[data-target]')
        .on('mouseover', function (event, p) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#ml-tt-x').textContent = p.target;
            tooltip.querySelector('#ml-tt-s').textContent = this.getAttribute('data-series');
            tooltip.querySelector('#ml-tt-y').textContent = String(p.yValue);
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

// Step 1: drop the Television series and rescale the y-axis to the remaining lines.
export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    const { xScale } = getGeometry();
    const remaining = ['Newspaper', 'Internet', 'Radio'];
    const yScale = yScaleFor(remaining);
    const lineGen = d3.line().x((p) => xScale(p.target)).y((p) => yScale(p.yValue));

    // Fade out Television line, points, and its legend entry.
    g.selectAll('[data-series="Television"]').transition().duration(500).attr('opacity', 0).remove();
    svg.selectAll('.color-legend [data-legend="Television"]').transition().duration(500).attr('opacity', 0).remove();

    remaining.forEach((ser) => {
        g.select(`path[data-series="${ser}"]`)
            .transition().duration(750)
            .attr('d', lineGen(seriesPoints(ser)));
        g.selectAll(`circle[data-series="${ser}"]`)
            .transition().duration(750)
            .attr('cy', function () { return yScale(Number(this.getAttribute('data-value'))); });
    });

    g.select('.y-axis').transition().duration(750).call(d3.axisLeft(yScale).ticks(6));
}

// Step 2: highlight the 2003–2007 span where Internet sits between Radio and Newspaper.
export function function2({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotH, xScale } = getGeometry();
    const x0 = xScale(FOCUS_YEARS[0]);
    const x1 = xScale(FOCUS_YEARS[FOCUS_YEARS.length - 1]);
    const pad = 16;

    g.selectAll('.validation-focus-bg').remove();
    g.insert('rect', ':first-child')
        .attr('class', 'validation-focus-bg')
        .attr('x', x0 - pad)
        .attr('y', 0)
        .attr('width', (x1 - x0) + pad * 2)
        .attr('height', plotH)
        .attr('fill', HIGHLIGHT_BG)
        .attr('opacity', 0)
        .transition().duration(600).attr('opacity', 0.7);
}

// Step 3: keep only the Internet series over 2003–2007 as a simple line chart.
export function function3({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const { margin, plotW, plotH } = getGeometry();
    const pts = seriesPoints('Internet').filter((p) => FOCUS_YEARS.includes(p.target));

    const xScale = d3.scalePoint().domain(FOCUS_YEARS).range([0, plotW]).padding(0.5);
    const vals = pts.map((p) => p.yValue);
    const minY = d3.min(vals);
    const maxY = d3.max(vals);
    const yScale = d3.scaleLinear().domain([minY === maxY ? minY - 1 : minY, minY === maxY ? maxY + 1 : maxY]).nice().range([plotH, 0]);
    const stroke = resolveSeriesColor('Internet');

    const oldLayers = svg.selectAll(':scope > g');

    const gNew = svg.append('g')
        .attr('class', 'validation-internet-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('opacity', 0);

    gNew.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(6));
    gNew.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    const lineGen = d3.line().x((p) => xScale(p.target)).y((p) => yScale(p.yValue));
    gNew.append('path')
        .datum(pts)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', stroke)
        .attr('stroke-width', 2.5)
        .attr('d', lineGen);

    gNew.selectAll('circle')
        .data(pts)
        .join('circle')
        .attr('cx', (p) => xScale(p.target))
        .attr('cy', (p) => yScale(p.yValue))
        .attr('r', 4.5)
        .attr('fill', stroke)
        .attr('data-target', (p) => p.target)
        .attr('data-value', (p) => String(p.yValue));

    gNew.append('text')
        .attr('x', plotW / 2)
        .attr('y', -12)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', stroke)
        .text('Internet (2003–2007)');

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}

// Step 4: draw the average of the Internet values across 2003–2007.
export function function4({ d3, container }) {
    const g = d3.select(container).select('.validation-internet-layer');
    if (g.empty()) return;

    const { plotW, plotH } = getGeometry();
    const pts = seriesPoints('Internet').filter((p) => FOCUS_YEARS.includes(p.target));
    const vals = pts.map((p) => p.yValue);
    const avg = d3.mean(vals);
    const minY = d3.min(vals);
    const maxY = d3.max(vals);
    const yScale = d3.scaleLinear().domain([minY === maxY ? minY - 1 : minY, minY === maxY ? maxY + 1 : maxY]).nice().range([plotH, 0]);
    const y = yScale(avg);

    g.selectAll('.validation-avg-line, .validation-avg-label').remove();
    g.append('line')
        .attr('class', 'validation-avg-line')
        .attr('x1', 0).attr('x2', 0).attr('y1', y).attr('y2', y)
        .attr('stroke', AVG_COLOR).attr('stroke-width', 2).attr('stroke-dasharray', '6 4')
        .transition().duration(650).attr('x2', plotW);

    g.append('text')
        .attr('class', 'validation-avg-label')
        .attr('x', plotW - 4).attr('y', y - 6)
        .attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif').attr('font-size', 12).attr('font-weight', 700).attr('fill', AVG_COLOR)
        .attr('opacity', 0)
        .text(`average = ${avg.toFixed(1)}`)
        .transition().duration(650).attr('opacity', 1);
}
