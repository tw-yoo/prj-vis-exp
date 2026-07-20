import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2000, Percentage_of_Population: 0.088 },
    { Year: 2001, Percentage_of_Population: 0.086 },
    { Year: 2002, Percentage_of_Population: 0.105 },
    { Year: 2003, Percentage_of_Population: 0.109 },
    { Year: 2004, Percentage_of_Population: 0.109 },
    { Year: 2005, Percentage_of_Population: 0.102 },
    { Year: 2006, Percentage_of_Population: 0.106 },
    { Year: 2007, Percentage_of_Population: 0.097 },
    { Year: 2008, Percentage_of_Population: 0.096 },
    { Year: 2009, Percentage_of_Population: 0.115 },
    { Year: 2010, Percentage_of_Population: 0.132 },
    { Year: 2011, Percentage_of_Population: 0.135 },
    { Year: 2012, Percentage_of_Population: 0.128 },
    { Year: 2013, Percentage_of_Population: 0.127 },
    { Year: 2014, Percentage_of_Population: 0.117 },
    { Year: 2015, Percentage_of_Population: 0.113 },
    { Year: 2016, Percentage_of_Population: 0.102 },
    { Year: 2017, Percentage_of_Population: 0.097 },
    { Year: 2018, Percentage_of_Population: 0.09 },
    { Year: 2019, Percentage_of_Population: 0.089 }
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
    const yField = 'Percentage_of_Population';

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

function getFocusedPopulationRows() {
    return data_rows.filter((d) => Number(d.Year) >= 2000 && Number(d.Year) <= 2008);
}

function getPopulationTargets() {
    const rows = getFocusedPopulationRows();
    const smallest = rows.reduce((best, row) => (
        Number(row.Percentage_of_Population) < Number(best.Percentage_of_Population) ? row : best
    ), rows[0]);
    // Positional ranking (D1 decision): with 2003/2004 tied at 0.109, the
    // second-largest VALUE is the second entry of the sorted list (0.109),
    // not the second distinct value.
    const sortedRows = [...rows].sort((a, b) => Number(b.Percentage_of_Population) - Number(a.Percentage_of_Population));
    const secondLargest = sortedRows[1] ?? sortedRows[0];
    return { smallest, secondLargest };
}

function focusPopulationInPlace({ d3, container }) {
    // Per reviewer (round-2 row 7): do NOT rebuild the chart. Reuse the existing
    // line + circles + axes. Transition xScale/yScale to the focus range so
    // points outside 2000–2008 fade out and the line + axes rescale smoothly.
    const xField = 'Year';
    const yField = 'Percentage_of_Population';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const focusedRows = getFocusedPopulationRows();
    const focusedYears = new Set(focusedRows.map((d) => String(d[xField])));
    const focusedYValues = focusedRows.map((d) => Number(d[yField]));

    const newXDomain = focusedRows.map((d) => String(d[xField]));
    const newXScale = d3.scalePoint().domain(newXDomain).range([0, plotW]).padding(0.5);
    const newYScale = d3.scaleLinear().domain([d3.min(focusedYValues), d3.max(focusedYValues)]).nice().range([plotH, 0]);

    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    // Re-fit each axis with the new scales.
    g.select('.y-axis').transition().duration(700).call(d3.axisLeft(newYScale).ticks(6));
    g.select('.x-axis').transition().duration(700).call(d3.axisBottom(newXScale)).on('end', function () {
        autoRotateXAxisLabels(d3.select(this));
    });

    // Slide focused circles to their new positions; fade out non-focused ones.
    g.selectAll('circle[data-target]')
        .transition()
        .duration(700)
        .attr('cx', function () {
            const year = this.getAttribute('data-target');
            if (!focusedYears.has(year)) return Number(this.getAttribute('cx'));
            return newXScale(year);
        })
        .attr('cy', function () {
            const year = this.getAttribute('data-target');
            if (!focusedYears.has(year)) return Number(this.getAttribute('cy'));
            const v = Number(this.getAttribute('data-y-value'));
            return newYScale(v);
        })
        .attr('opacity', function () {
            return focusedYears.has(this.getAttribute('data-target')) ? 0.85 : 0;
        });

    // Recompute the line path to span only focused years.
    const lineGen = d3.line()
        .x((d) => newXScale(String(d[xField])))
        .y((d) => newYScale(Number(d[yField])));
    g.select('path.main-line')
        .datum(focusedRows)
        .transition()
        .duration(700)
        .attrTween('d', function () {
            const prev = this.getAttribute('d') ?? '';
            const next = lineGen(focusedRows);
            return d3.interpolateString(prev, next);
        })
        .attr('stroke-dasharray', null)
        .attr('stroke-dashoffset', null);
}

function highlightPopulationPoints(d3, container, years) {
    // R12 + cumulative-highlight (round 4 fix per reviewer): explicitly reset
    // every circle, but accept MULTIPLE target years. function3 must KEEP
    // function2's red circle visible while adding its own — so it calls this
    // with [smallest, secondLargest] (both red), not just [secondLargest].
    // Non-focused-range circles (2009–2019) stay hidden at opacity 0.
    const focusedYears = new Set(getFocusedPopulationRows().map((d) => String(d.Year)));
    const targetYears = new Set((years ?? []).map((y) => String(y)));

    d3.select(container).selectAll('circle[data-target]')
        .each(function () {
            const targetYear = this.getAttribute('data-target');
            const isTarget = targetYears.has(targetYear);
            const isInFocusRange = focusedYears.has(targetYear);

            let nextR, nextFill, nextOpacity;
            if (isTarget && isInFocusRange) {
                nextR = 8;
                nextFill = '#ef4444';
                nextOpacity = 1;
            } else if (isInFocusRange) {
                nextR = 3.5;
                nextFill = '#bfdbfe';
                nextOpacity = 0.35;
            } else {
                // Non-focused range — must remain invisible.
                nextR = 3.5;
                nextFill = '#bfdbfe';
                nextOpacity = 0;
            }

            // R6 no-op-skip: don't transition if the attr is already at the target.
            const curOpacity = Number(this.getAttribute('opacity') ?? 1);
            const curR = Number(this.getAttribute('r') ?? 4);
            const curFill = this.getAttribute('fill');
            const needsChange = Math.abs(curOpacity - nextOpacity) > 0.001
                || Math.abs(curR - nextR) > 0.001
                || curFill !== nextFill;
            if (!needsChange) return;

            d3.select(this).transition().duration(600)
                .attr('r', nextR)
                .attr('fill', nextFill)
                .attr('opacity', nextOpacity);
        });
}

export function function1({ d3, container }) {
    focusPopulationInPlace({ d3, container });
}

export function function2({ d3, container }) {
    const { smallest } = getPopulationTargets();
    highlightPopulationPoints(d3, container, [smallest.Year]);
}

export function function3({ d3, container }) {
    // Cumulative per reviewer: smallest's red circle (function2) must STAY visible
    // when secondLargest is also highlighted. So we pass BOTH years.
    const { smallest, secondLargest } = getPopulationTargets();
    highlightPopulationPoints(d3, container, [smallest.Year, secondLargest.Year]);
}

export function function4({ d3, container }) {
    const { smallest, secondLargest } = getPopulationTargets();
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 80, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const rows = getFocusedPopulationRows();
    const yValues = rows.map((d) => Number(d.Percentage_of_Population));
    const yScale = d3.scaleLinear().domain([d3.min(yValues) ?? 0, d3.max(yValues) ?? 1]).nice().range([plotH, 0]);
    const g = d3.select(container).select('svg > g');
    const svg = d3.select(container).select('svg');
    if (g.empty()) return;

    g.selectAll('.validation-population-diff').remove();
    svg.select('defs#e2-q9-defs').remove();
    const defs = svg.append('defs').attr('id', 'e2-q9-defs');
    defs.append('marker')
        .attr('id', 'e2-q9-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 10)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 L 3 5 z')
        .attr('fill', '#ef4444');

    [smallest, secondLargest].forEach((row) => {
        const value = Number(row.Percentage_of_Population);
        const y = yScale(value);
        g.append('line')
            .attr('class', 'validation-population-diff')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', '#111827')
            .attr('stroke-width', 1.8)
            .attr('stroke-dasharray', '5 4')
            .transition()
            .duration(650)
            .attr('x2', plotW);
        g.append('text')
            .attr('class', 'validation-population-diff')
            .attr('x', plotW + 6)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .attr('opacity', 0)
            .text(value.toFixed(3))
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });

    const y1 = yScale(Number(smallest.Percentage_of_Population));
    const y2 = yScale(Number(secondLargest.Percentage_of_Population));
    const arrowX = plotW + 46;
    g.append('line')
        .attr('class', 'validation-population-diff')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', y1)
        .attr('y2', y1)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q9-arrow)')
        .attr('marker-end', 'url(#e2-q9-arrow)')
        .transition()
        .duration(650)
        .attr('y2', y2);
    g.append('text')
        .attr('class', 'validation-population-diff')
        .attr('x', arrowX + 8)
        .attr('y', (y1 + y2) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(Math.abs(Number(secondLargest.Percentage_of_Population) - Number(smallest.Percentage_of_Population)).toFixed(3))
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function mergedStep2({ d3, container }) {
    function2({ d3, container });
    function3({ d3, container });
}
