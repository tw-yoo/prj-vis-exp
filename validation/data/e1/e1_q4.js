import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 1996, 'Year on yaer percentage change (%)': 0.7 },
    { Year: 1997, 'Year on yaer percentage change (%)': 1.9 },
    { Year: 1998, 'Year on yaer percentage change (%)': 2.6 },
    { Year: 1999, 'Year on yaer percentage change (%)': 1.7 },
    { Year: 2000, 'Year on yaer percentage change (%)': 3.6 },
    { Year: 2001, 'Year on yaer percentage change (%)': 5.2 },
    { Year: 2002, 'Year on yaer percentage change (%)': 3.9 },
    { Year: 2003, 'Year on yaer percentage change (%)': 2.1 },
    { Year: 2004, 'Year on yaer percentage change (%)': 1.9 },
    { Year: 2005, 'Year on yaer percentage change (%)': 2 },
    { Year: 2006, 'Year on yaer percentage change (%)': 2.9 },
    { Year: 2007, 'Year on yaer percentage change (%)': 4 },
    { Year: 2008, 'Year on yaer percentage change (%)': 4.6 },
    { Year: 2009, 'Year on yaer percentage change (%)': 0.2 },
    { Year: 2010, 'Year on yaer percentage change (%)': 0.6 },
    { Year: 2011, 'Year on yaer percentage change (%)': 1.9 },
    { Year: 2012, 'Year on yaer percentage change (%)': 1.8 },
    { Year: 2013, 'Year on yaer percentage change (%)': 0.2 },
    { Year: 2014, 'Year on yaer percentage change (%)': 0.9 },
    { Year: 2015, 'Year on yaer percentage change (%)': 1.9 },
    { Year: 2016, 'Year on yaer percentage change (%)': 2 },
    { Year: 2017, 'Year on yaer percentage change (%)': 2.3 }
];

const X_FIELD = 'Year';
const Y_FIELD = 'Year on yaer percentage change (%)';
const LINE_STROKE = '#4f46e5';
const RISE_COLOR = '#dc2626';
const HIGHLIGHT_BG = '#fde68a';
const BAR_FILL = '#dc2626';

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
    const margin = { top: 40, right: 24, bottom: 48, left: 56 };
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

// Maximal runs of consecutive increases spanning two or more year-to-year steps.
function getIncreasingRuns() {
    const rows = data_rows;
    const runs = [];
    let s = 0;
    for (let i = 1; i <= rows.length; i++) {
        const inc = i < rows.length && Number(rows[i][Y_FIELD]) > Number(rows[i - 1][Y_FIELD]);
        if (!inc) {
            const end = i - 1;
            if (end - s >= 2) runs.push({ start: s, end });
            s = i;
        }
    }
    return runs;
}
function getBiggestRun() {
    const runs = getIncreasingRuns();
    return runs.reduce((best, r) => {
        const rise = Number(data_rows[r.end][Y_FIELD]) - Number(data_rows[r.start][Y_FIELD]);
        const bestRise = best ? Number(data_rows[best.end][Y_FIELD]) - Number(data_rows[best.start][Y_FIELD]) : -Infinity;
        return rise > bestRise ? r : best;
    }, null);
}
function runYears(run) {
    return data_rows.slice(run.start, run.end + 1).map((d) => String(d[X_FIELD]));
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

// Step 1: highlight every rising stretch (2+ consecutive increases) in red.
export function function1({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { xScale, yScale } = getGeometry();
    const runs = getIncreasingRuns();

    g.selectAll('.validation-rise-line').remove();

    const lineGen = d3.line()
        .x((p) => xScale(String(p[X_FIELD])))
        .y((p) => yScale(Number(p[Y_FIELD])));

    runs.forEach((run, idx) => {
        const seg = data_rows.slice(run.start, run.end + 1);
        g.append('path')
            .datum(seg)
            .attr('class', 'validation-rise-line')
            .attr('fill', 'none')
            .attr('stroke', RISE_COLOR)
            .attr('stroke-width', 3.5)
            .attr('d', lineGen)
            .attr('opacity', 0)
            .transition()
            .delay(idx * 120)
            .duration(450)
            .attr('opacity', 1);
    });

    const riseYears = new Set(runs.flatMap((r) => runYears(r)));
    g.selectAll('circle[data-target]')
        .transition()
        .duration(500)
        .attr('fill', function () { return riseYears.has(this.getAttribute('data-target')) ? RISE_COLOR : LINE_STROKE; })
        .attr('r', function () { return riseYears.has(this.getAttribute('data-target')) ? 5 : 4; });
}

// Step 2: highlight the rising run with the greatest total rise.
export function function2({ d3, container }) {
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    const { plotH, xScale } = getGeometry();
    const run = getBiggestRun();
    if (!run) return;
    const years = runYears(run);
    const x0 = xScale(years[0]);
    const x1 = xScale(years[years.length - 1]);
    const pad = 14;

    g.selectAll('.validation-run-bg').remove();
    g.insert('rect', ':first-child')
        .attr('class', 'validation-run-bg')
        .attr('x', x0 - pad)
        .attr('y', 0)
        .attr('width', (x1 - x0) + pad * 2)
        .attr('height', plotH)
        .attr('fill', HIGHLIGHT_BG)
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.7);

    g.selectAll('.validation-run-caption').remove();
    g.append('text')
        .attr('class', 'validation-run-caption')
        .attr('x', (x0 + x1) / 2)
        .attr('y', -14)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', RISE_COLOR)
        .attr('opacity', 0)
        .text(`Steepest rise: ${years[0]}–${years[years.length - 1]}`)
        .transition()
        .duration(600)
        .attr('opacity', 1);
}

// Step 3: isolate the steepest run as a small bar chart.
export function function3({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const { margin, plotW, plotH } = getGeometry();
    const run = getBiggestRun();
    const rows = data_rows.slice(run.start, run.end + 1);

    const xScale = d3.scaleBand()
        .domain(rows.map((d) => String(d[X_FIELD])))
        .range([0, plotW])
        .padding(0.45);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(rows, (d) => Number(d[Y_FIELD]))])
        .nice()
        .range([plotH, 0]);

    const oldLayers = svg.selectAll(':scope > g');

    const gNew = svg.append('g')
        .attr('class', 'validation-bar-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('opacity', 0);

    gNew.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    gNew.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    gNew.selectAll('rect.main-bar')
        .data(rows, (d) => String(d[X_FIELD]))
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(String(d[X_FIELD])))
        .attr('width', xScale.bandwidth())
        .attr('fill', BAR_FILL)
        .attr('opacity', 1)
        .attr('data-target', (d) => String(d[X_FIELD]))
        .attr('data-value', (d) => Number(d[Y_FIELD]))
        .attr('data-x-value', (d) => String(d[X_FIELD]))
        .attr('data-y-value', (d) => String(Number(d[Y_FIELD])))
        .attr('y', yScale(0))
        .attr('height', 0)
        .transition()
        .delay(350)
        .duration(700)
        .attr('y', (d) => yScale(Number(d[Y_FIELD])))
        .attr('height', (d) => plotH - yScale(Number(d[Y_FIELD])));

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}

// Step 4: sum the bars into a single summed bar.
export function function4({ d3, container }) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    const { margin, plotW, plotH } = getGeometry();
    const run = getBiggestRun();
    const rows = data_rows.slice(run.start, run.end + 1);
    const vals = rows.map((d) => Number(d[Y_FIELD]));
    const sum = vals.reduce((a, b) => a + b, 0);
    const sumRounded = Math.round(sum * 100) / 100;

    const xScale = d3.scaleBand().domain(['Sum']).range([0, plotW]).padding(0.6);
    const yScale = d3.scaleLinear().domain([0, sum]).nice().range([plotH, 0]);

    const oldLayers = svg.selectAll(':scope > g');

    const gNew = svg.append('g')
        .attr('class', 'validation-sum-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('opacity', 0);

    gNew.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    gNew.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));

    const bx = xScale('Sum');
    gNew.append('rect')
        .attr('class', 'main-bar')
        .attr('x', bx)
        .attr('width', xScale.bandwidth())
        .attr('fill', BAR_FILL)
        .attr('opacity', 1)
        .attr('y', yScale(0))
        .attr('height', 0)
        .transition()
        .delay(350)
        .duration(750)
        .attr('y', yScale(sum))
        .attr('height', plotH - yScale(sum));

    gNew.append('text')
        .attr('x', bx + xScale.bandwidth() / 2)
        .attr('y', yScale(sum) - 10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 15)
        .attr('font-weight', 700)
        .attr('fill', BAR_FILL)
        .attr('opacity', 0)
        .text(`Sum = ${sumRounded}`)
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
        .text(`${vals.join(' + ')}`)
        .transition()
        .delay(900)
        .duration(500)
        .attr('opacity', 1);

    gNew.transition().duration(500).attr('opacity', 1);
    oldLayers.transition().duration(500).attr('opacity', 0).remove();
}
