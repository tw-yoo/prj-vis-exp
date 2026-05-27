import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, Audience_Millions: 12.9 },
    { Year: 2010, Audience_Millions: 22.9 },
    { Year: 2011, Audience_Millions: 35 },
    { Year: 2012, Audience_Millions: 45.5 },
    { Year: 2013, Audience_Millions: 48.5 },
    { Year: 2014, Audience_Millions: 58.2 },
    { Year: 2015, Audience_Millions: 69.5 }
];

function injectSimpleLineStyles() {
    if (document.getElementById('validation-simple-line-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-simple-line-styles';
    style.textContent = `
        .validation-simple-line-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-simple-line-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-simple-line-host .x-axis line,
        .validation-simple-line-host .x-axis path,
        .validation-simple-line-host .y-axis line,
        .validation-simple-line-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-simple-line-host .x-axis text,
        .validation-simple-line-host .y-axis text,
        .validation-simple-line-host .x-axis-label,
        .validation-simple-line-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-simple-line-tooltip {
            position: absolute;
            z-index: 6;
            min-width: 120px;
            padding: 10px 12px;
            border: 1px solid rgba(203, 213, 225, 0.9);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
            pointer-events: none;
            font-family: sans-serif;
        }
        .validation-simple-line-tooltip[hidden] { display: none; }
        .validation-simple-line-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-simple-line-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-simple-line-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationSimpleLineChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    const xField = 'Year';
    const yField = 'Audience_Millions';

    injectSimpleLineStyles();

    const data = data_rows;

    // Derive domain from data (preserves insertion order)
    const xDomain = Array.from(new Set(data.map((d) => String(d[xField]))));
    const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite);
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;

    // Build RenderPoint objects matching Workbench's shape { target, yValue, xDisplayLabel }
    const points = xDomain.map((label) => {
        const row = data.find((d) => String(d[xField]) === label);
        return {
            target: label,
            xDisplayLabel: label,
            yValue: Number(row?.[yField] ?? 0),
        };
    }).filter((p) => Number.isFinite(p.yValue));

    // Canvas / layout constants matching Workbench defaults
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // X: scalePoint for nominal values (Workbench default for nominal x)
    const xScale = d3.scalePoint()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.5);

    // Y: linear, no forced zero (Workbench default for line charts)
    const domainMin = minY === maxY ? minY - 1 : minY;
    const domainMax = minY === maxY ? maxY + 1 : maxY;
    const yScale = d3.scaleLinear()
        .domain([domainMin, domainMax])
        .nice()
        .range([plotH, 0]);

    // Workbench line style defaults
    const lineStroke = '#4f46e5';
    const lineStrokeWidth = 2;
    const pointRadius = 4;

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-simple-line-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        // Store margin as data attributes (same as Workbench) for function1/2 offset calc
        .attr('data-m-left', margin.left)
        .attr('data-m-top', margin.top)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Y axis (6 ticks — matches Workbench)
    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(6));

    // X axis
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    // Line path — class="main-line" for function1/2 selection
    const lineGenerator = d3.line()
        .x((p) => xScale(p.target))
        .y((p) => yScale(p.yValue));

    g.append('path')
        .datum(points)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', lineStroke)
        .attr('stroke-width', lineStrokeWidth)
        .attr('opacity', 1)
        .attr('d', lineGenerator);

    // Point circles — no class (Workbench style); use data-target for selection
    g.selectAll('circle[data-target]')
        .data(points)
        .join('circle')
        .attr('cx', (p) => xScale(p.target))
        .attr('cy', (p) => yScale(p.yValue))
        .attr('r', pointRadius)
        .attr('fill', lineStroke)
        .attr('opacity', 0.85)
        // Workbench data attributes
        .attr('data-target', (p) => p.target)
        .attr('data-value', (p) => String(p.yValue))
        .attr('data-x-value', (p) => p.xDisplayLabel)
        .attr('data-y-value', (p) => String(p.yValue));

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-simple-line-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${xField}</span>
            <span class="validation-simple-line-tooltip__value" id="ln-tt-x"></span>
        </div>
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${yField}</span>
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

function getE4Q4Geometry(d3) {
    const xField = 'Year';
    const yField = 'Audience_Millions';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = data_rows.map((d) => String(d[xField]));
    const yValues = data_rows.map((d) => Number(d[yField]));
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const yScale = d3.scaleLinear().domain([minY, maxY]).nice().range([plotH, 0]);
    return { xField, yField, plotW, plotH, xScale, yScale };
}

function getE4Q4Jumps() {
    const yField = 'Audience_Millions';
    const jumps = [];
    for (let i = 1; i < data_rows.length; i++) {
        const fromYear = String(data_rows[i - 1].Year);
        const toYear = String(data_rows[i].Year);
        const fromValue = Number(data_rows[i - 1][yField]);
        const toValue = Number(data_rows[i][yField]);
        jumps.push({ fromYear, toYear, fromValue, toValue, delta: toValue - fromValue });
    }
    return jumps;
}

function ensureE4Q4ArrowMarker(svg) {
    if (!svg.select('defs#e4-q4-defs').empty()) return;
    const defs = svg.append('defs').attr('id', 'e4-q4-defs');
    defs.append('marker')
        .attr('id', 'e4-q4-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');
}

export function function1({ d3, container }) {
    const { xScale, yScale } = getE4Q4Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q4-step-arrow, .validation-q4-step-label').remove();
    ensureE4Q4ArrowMarker(svg);

    const jumps = getE4Q4Jumps();
    jumps.forEach(({ toYear, fromValue, toValue, delta }) => {
        const cx = xScale(toYear) ?? 0;
        const y0 = yScale(fromValue);
        const y1 = yScale(toValue);
        g.append('line')
            .attr('class', 'validation-q4-step-arrow')
            .attr('data-toyear', toYear)
            .attr('x1', cx)
            .attr('x2', cx)
            .attr('y1', y0)
            .attr('y2', y0)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#e4-q4-arrow)')
            .transition()
            .duration(650)
            .attr('y2', y1 + (y1 < y0 ? 6 : -6));
        g.append('text')
            .attr('class', 'validation-q4-step-label')
            .attr('data-toyear', toYear)
            .attr('x', cx + 6)
            .attr('y', (y0 + y1) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#ef4444')
            .attr('opacity', 0)
            .text(`+${delta.toFixed(1)}`)
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });
}

export function function2({ d3, container }) {
    const { plotH, xScale } = getE4Q4Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q4-max-rect').remove();

    const best = getE4Q4Jumps().reduce((b, row) => row.delta > b.delta ? row : b, { delta: -Infinity });

    // Per reviewer: highlight should span from the MIDPOINT of (prevYear,toYear)
    // to the MIDPOINT of (toYear,nextYear) — centered on the year of the jump
    // (best.toYear). Fall back to the bar edges when a neighbor year is missing.
    const allYears = data_rows.map((d) => String(d.Year));
    const toIndex = allYears.indexOf(best.toYear);
    const fromXc = xScale(best.fromYear) ?? 0;        // prev year point
    const toXc   = xScale(best.toYear) ?? 0;          // this year point
    const nextYear = toIndex >= 0 && toIndex < allYears.length - 1 ? allYears[toIndex + 1] : null;
    const nextXc = nextYear ? (xScale(nextYear) ?? 0) : null;

    const x0 = (fromXc + toXc) / 2;                                    // midpoint(prev, this)
    const x1 = nextXc != null ? (toXc + nextXc) / 2 : toXc;             // midpoint(this, next) or this
    g.insert('rect', ':first-child')
        .attr('class', 'validation-q4-max-rect')
        .attr('x', x0)
        .attr('y', 0)
        .attr('width', x1 - x0)
        .attr('height', plotH)
        .attr('fill', '#fde68a')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.55);

    g.selectAll('.validation-q4-step-arrow')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            return this.getAttribute('data-toyear') === best.toYear ? 1 : 0.3;
        })
        .attr('stroke-width', function () {
            return this.getAttribute('data-toyear') === best.toYear ? 3 : 2;
        });
    g.selectAll('.validation-q4-step-label')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            return this.getAttribute('data-toyear') === best.toYear ? 1 : 0.3;
        })
        .attr('font-size', function () {
            return this.getAttribute('data-toyear') === best.toYear ? 14 : 11;
        });
}

export function function3({ d3, container }) {
    const { plotW } = getE4Q4Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q4-summary').remove();

    const best = getE4Q4Jumps().reduce((b, row) => row.delta > b.delta ? row : b, { delta: -Infinity });

    // Per reviewer: move summary ABOVE the plot area so it doesn't overlap
    // the line chart. y=-10 places it 10px above the plot top, inside the
    // (32px) top margin where there's clear space.
    g.append('text')
        .attr('class', 'validation-q4-summary')
        .attr('x', plotW / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`biggest jump → ${best.fromYear} → ${best.toYear} (+${best.delta.toFixed(1)})`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
