import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Date_Range: 'May 28 – Jun 17', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'May 28 – Jun 17', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jun 4 – Jun 24', Candidate: 'Obama', Share_of_Respondents: 0.45 },
    { Date_Range: 'Jun 4 – Jun 24', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jun 11 – Jul 1', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jun 11 – Jul 1', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Jun 18 – Jul 8', Candidate: 'Obama', Share_of_Respondents: 0.47 },
    { Date_Range: 'Jun 18 – Jul 8', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Jun 25 – Jul 15', Candidate: 'Obama', Share_of_Respondents: 0.47 },
    { Date_Range: 'Jun 25 – Jul 15', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Jul 2 – Jul 22', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 2 – Jul 22', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Jul 9 – Jul 29', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 9 – Jul 29', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 16 – Aug 5', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 16 – Aug 5', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 23 – Aug 12', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 23 – Aug 12', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 30 – Aug 19', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'Jul 30 – Aug 19', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Aug 6 – Aug 26', Candidate: 'Obama', Share_of_Respondents: 0.46 },
    { Date_Range: 'Aug 6 – Aug 26', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Aug 13 – Sep 2', Candidate: 'Obama', Share_of_Respondents: 0.47 },
    { Date_Range: 'Aug 13 – Sep 2', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Aug 20 – Sep 9', Candidate: 'Obama', Share_of_Respondents: 0.48 },
    { Date_Range: 'Aug 20 – Sep 9', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Aug 27 – Sep 16', Candidate: 'Obama', Share_of_Respondents: 0.48 },
    { Date_Range: 'Aug 27 – Sep 16', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Sep 3 – Sep 23', Candidate: 'Obama', Share_of_Respondents: 0.49 },
    { Date_Range: 'Sep 3 – Sep 23', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Sep 10 – Sep 30', Candidate: 'Obama', Share_of_Respondents: 0.48 },
    { Date_Range: 'Sep 10 – Sep 30', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Sep 17 – Oct 7', Candidate: 'Obama', Share_of_Respondents: 0.49 },
    { Date_Range: 'Sep 17 – Oct 7', Candidate: 'Romney', Share_of_Respondents: 0.45 },
    { Date_Range: 'Sep 24 – Oct 14', Candidate: 'Obama', Share_of_Respondents: 0.49 },
    { Date_Range: 'Sep 24 – Oct 14', Candidate: 'Romney', Share_of_Respondents: 0.46 },
    { Date_Range: 'Oct 1 – Oct 21', Candidate: 'Obama', Share_of_Respondents: 0.48 },
    { Date_Range: 'Oct 1 – Oct 21', Candidate: 'Romney', Share_of_Respondents: 0.47 },
    { Date_Range: 'Oct 8 – Oct 28', Candidate: 'Obama', Share_of_Respondents: 0.47 },
    { Date_Range: 'Oct 8 – Oct 28', Candidate: 'Romney', Share_of_Respondents: 0.47 }
];

const X_FIELD = 'Date_Range';
const SERIES_FIELD = 'Candidate';
const Y_FIELD = 'Share_of_Respondents';
const MULTI_LINE_PALETTE = ['#60a5fa', '#fb7185', '#f59e0b', '#10b981', '#c084fc', '#f472b6', '#22d3ee', '#a3e635', '#f97316'];
const OBAMA_BG = '#bfdbfe';
const ROMNEY_BG = '#fecaca';

function resolveSeriesColor(seriesDomain, series) {
    const index = seriesDomain.indexOf(series);
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
    const margin = { top: 40, right: 16, bottom: 64, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
    const yValues = data_rows.map((d) => Number(d[Y_FIELD])).filter(Number.isFinite);
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;
    const domainMin = minY === maxY ? minY - 1 : minY;
    const domainMax = minY === maxY ? maxY + 1 : maxY;
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([plotH, 0]);
    return { width, height, margin, legendOffsetX, plotW, plotH, xScale, yScale, xDomain };
}

// Winner (higher share) at each Date_Range.
function getWinners() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[X_FIELD]))));
    return xDomain.map((x) => {
        const o = Number(data_rows.find((d) => String(d[X_FIELD]) === x && d[SERIES_FIELD] === 'Obama')?.[Y_FIELD]);
        const r = Number(data_rows.find((d) => String(d[X_FIELD]) === x && d[SERIES_FIELD] === 'Romney')?.[Y_FIELD]);
        const winner = o > r ? 'Obama' : (r > o ? 'Romney' : 'tie');
        return { x, winner };
    });
}

export function renderValidationMultipleLineChart({ container }) {
    if (container.querySelector('svg')) {
        return;
    }
    injectMultiLineStyles();

    const { width, height, margin, legendOffsetX, plotW, plotH, xScale, yScale, xDomain } = getGeometry();
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[SERIES_FIELD]))));

    const allPoints = [];
    xDomain.forEach((x) => {
        seriesDomain.forEach((ser) => {
            const row = data_rows.find((d) => String(d[X_FIELD]) === x && String(d[SERIES_FIELD]) === ser);
            if (!row) return;
            allPoints.push({ target: x, series: ser, yValue: Number(row[Y_FIELD]), xDisplayLabel: x });
        });
    });
    const seriesGroups = seriesDomain.map((ser) => ({ series: ser, points: allPoints.filter((p) => p.series === ser) }));

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

    seriesGroups.forEach((sg) => {
        const stroke = resolveSeriesColor(seriesDomain, sg.series);
        g.append('path')
            .datum(sg)
            .attr('class', 'main-line')
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', 2)
            .attr('opacity', 1)
            .attr('d', (d) => lineGen(d.points))
            .attr('data-series', sg.series);

        g.selectAll(`circle[data-series="${sg.series}"]`)
            .data(sg.points)
            .join('circle')
            .attr('cx', (p) => xScale(p.target))
            .attr('cy', (p) => yScale(p.yValue))
            .attr('r', 4)
            .attr('fill', stroke)
            .attr('opacity', 0.85)
            .attr('data-target', (p) => p.target)
            .attr('data-series', (p) => p.series)
            .attr('data-value', (p) => String(p.yValue))
            .attr('data-x-value', (p) => p.xDisplayLabel)
            .attr('data-y-value', (p) => String(p.yValue))
            .attr('data-group-value', (p) => p.series);
    });

    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    seriesDomain.forEach((ser, i) => {
        const cy = i * 30 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', resolveSeriesColor(seriesDomain, ser)).attr('opacity', 0.85);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 13).attr('dominant-baseline', 'middle').text(ser);
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
            tooltip.querySelector('#ml-tt-x').textContent = p.xDisplayLabel;
            tooltip.querySelector('#ml-tt-s').textContent = p.series;
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

// Step 1: shade each date by who leads, and label the two totals.
export function function1({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotH, xScale } = getGeometry();
    const winners = getWinners();
    const band = xScale.step();

    g.selectAll('.validation-lead-band, .validation-lead-count').remove();

    winners.forEach((w, i) => {
        if (w.winner === 'tie') return;
        const cx = xScale(w.x);
        g.insert('rect', ':first-child')
            .attr('class', 'validation-lead-band')
            .attr('x', cx - band / 2)
            .attr('y', 0)
            .attr('width', band)
            .attr('height', plotH)
            .attr('fill', w.winner === 'Obama' ? OBAMA_BG : ROMNEY_BG)
            .attr('opacity', 0)
            .transition()
            .delay(i * 25)
            .duration(400)
            .attr('opacity', 0.75);
    });

    const obamaCount = winners.filter((w) => w.winner === 'Obama').length;
    const romneyCount = winners.filter((w) => w.winner === 'Romney').length;
    const dayWord = (n) => (n === 1 ? 'day' : 'days');

    g.append('text')
        .attr('class', 'validation-lead-count')
        .attr('x', 0)
        .attr('y', -20)
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#2563eb')
        .attr('opacity', 0)
        .text(`Obama higher: ${obamaCount} ${dayWord(obamaCount)}`)
        .transition().duration(600).attr('opacity', 1);

    g.append('text')
        .attr('class', 'validation-lead-count')
        .attr('x', 0)
        .attr('y', -4)
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#dc2626')
        .attr('opacity', 0)
        .text(`Romney higher: ${romneyCount} ${dayWord(romneyCount)}`)
        .transition().duration(600).attr('opacity', 1);
}

// Step 2: show the difference between the two totals.
export function function2({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotW } = getGeometry();
    const winners = getWinners();
    const obamaCount = winners.filter((w) => w.winner === 'Obama').length;
    const romneyCount = winners.filter((w) => w.winner === 'Romney').length;
    const diff = Math.abs(obamaCount - romneyCount);

    g.selectAll('.validation-diff-text').remove();
    g.append('text')
        .attr('class', 'validation-diff-text')
        .attr('x', plotW)
        .attr('y', -12)
        .attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 15)
        .attr('font-weight', 800)
        .attr('fill', '#111827')
        .attr('opacity', 0)
        .text(`${obamaCount} − ${romneyCount} = ${diff} days`)
        .transition().duration(650).attr('opacity', 1);
}

export function function3({ d3, container }) {}
