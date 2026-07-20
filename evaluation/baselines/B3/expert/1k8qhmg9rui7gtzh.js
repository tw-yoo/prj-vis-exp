import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2007, Country: 'US', Favorable_View_Percentage: 44 },
    { Year: 2007, Country: 'Germany', Favorable_View_Percentage: 34 },
    { Year: 2009, Country: 'US', Favorable_View_Percentage: 43 },
    { Year: 2009, Country: 'Germany', Favorable_View_Percentage: 42 },
    { Year: 2010, Country: 'US', Favorable_View_Percentage: 49 },
    { Year: 2010, Country: 'Germany', Favorable_View_Percentage: 50 },
    { Year: 2011, Country: 'US', Favorable_View_Percentage: 49 },
    { Year: 2011, Country: 'Germany', Favorable_View_Percentage: 47 },
    { Year: 2012, Country: 'US', Favorable_View_Percentage: 37 },
    { Year: 2012, Country: 'Germany', Favorable_View_Percentage: 33 },
    { Year: 2013, Country: 'US', Favorable_View_Percentage: 37 },
    { Year: 2013, Country: 'Germany', Favorable_View_Percentage: 32 },
    { Year: 2014, Country: 'US', Favorable_View_Percentage: 19 },
    { Year: 2014, Country: 'Germany', Favorable_View_Percentage: 19 },
    { Year: 2015, Country: 'US', Favorable_View_Percentage: 22 },
    { Year: 2015, Country: 'Germany', Favorable_View_Percentage: 27 },
    { Year: 2017, Country: 'US', Favorable_View_Percentage: 29 },
    { Year: 2017, Country: 'Germany', Favorable_View_Percentage: 27 },
    { Year: 2018, Country: 'US', Favorable_View_Percentage: 21 },
    { Year: 2018, Country: 'Germany', Favorable_View_Percentage: 35 }
];

// Workbench multiple-line color palette (resolveColorPalette fallback)
const MULTI_LINE_PALETTE = ['#60a5fa', '#fb7185', '#f59e0b', '#10b981', '#c084fc', '#f472b6', '#22d3ee', '#a3e635', '#f97316'];

function resolveSeriesColor(seriesDomain, series) {
    const index = seriesDomain.indexOf(series);
    return MULTI_LINE_PALETTE[index >= 0 ? index % MULTI_LINE_PALETTE.length : 0];
}

function injectMultiLineStyles() {
    if (document.getElementById('validation-multi-line-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-multi-line-styles';
    style.textContent = `
        .validation-multi-line-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-multi-line-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-multi-line-host .x-axis line,
        .validation-multi-line-host .x-axis path,
        .validation-multi-line-host .y-axis line,
        .validation-multi-line-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-multi-line-host .x-axis text,
        .validation-multi-line-host .y-axis text,
        .validation-multi-line-host .x-axis-label,
        .validation-multi-line-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-multi-line-host .color-legend text {
            fill: #000000;
            font-family: sans-serif;
        }
        .validation-multi-line-tooltip {
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
        .validation-multi-line-tooltip[hidden] { display: none; }
        .validation-multi-line-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-multi-line-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-multi-line-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationMultipleLineChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    const xField = 'Year';
    const seriesField = 'Country';
    const yField = 'Favorable_View_Percentage';
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[xField]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[seriesField]))));

    injectMultiLineStyles();

    const data = data_rows;

    // Build RenderPoint objects: { target, series, yValue, xDisplayLabel }
    const allPoints = [];
    xDomain.forEach((x) => {
        seriesDomain.forEach((ser) => {
            const row = data.find((d) => String(d[xField]) === x && String(d[seriesField]) === ser);
            if (!row) return;
            const yValue = Number(row[yField]);
            if (!Number.isFinite(yValue)) return;
            allPoints.push({ target: x, series: ser, yValue, xDisplayLabel: x });
        });
    });

    // Group by series for line rendering
    const seriesGroups = seriesDomain.map((ser) => ({
        series: ser,
        points: allPoints.filter((p) => p.series === ser),
    }));

    const yValues = allPoints.map((p) => p.yValue);
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;

    // Canvas / layout matching Workbench (with legend)
    // legendReserve = legendWidth(136) + legendOffsetX(64) = 200
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    // Workbench style defaults for multi-line
    const lineStrokeWidth = 2;
    const pointRadius = 4;

    // X: scalePoint for nominal values, padding=0.5 (Workbench default)
    const xScale = d3.scalePoint()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.5);

    // Y: no forced zero (Workbench default for line charts)
    const domainMin = minY === maxY ? minY - 1 : minY;
    const domainMax = minY === maxY ? maxY + 1 : maxY;
    const yScale = d3.scaleLinear()
        .domain([domainMin, domainMax])
        .nice()
        .range([plotH, 0]);

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-multi-line-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        // Store margin for function1/2 coordinate offset calculation
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

    // Line generator (operates on RenderPoint[])
    const lineGen = d3.line()
        .x((p) => xScale(p.target))
        .y((p) => yScale(p.yValue));

    // Render each series: path + points group
    seriesGroups.forEach((sg) => {
        const stroke = resolveSeriesColor(seriesDomain, sg.series);

        // Line path — datum bound as { series, points } for function1 access
        g.append('path')
            .datum(sg)
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', lineStrokeWidth)
            .attr('opacity', 1)
            .attr('d', (d) => lineGen(d.points))
            .attr('data-series', sg.series);

        // Points group — individual RenderPoint objects bound per circle
        g.selectAll(`circle[data-series="${sg.series}"]`)
            .data(sg.points)
            .join('circle')
            .attr('cx', (p) => xScale(p.target))
            .attr('cy', (p) => yScale(p.yValue))
            .attr('r', pointRadius)
            .attr('fill', stroke)
            .attr('opacity', 0.85)
            // Workbench data attributes
            .attr('data-target', (p) => p.target)
            .attr('data-series', (p) => p.series)
            .attr('data-value', (p) => String(p.yValue))
            .attr('data-x-value', (p) => p.xDisplayLabel)
            .attr('data-y-value', (p) => String(p.yValue))
            .attr('data-group-value', (p) => p.series);
    });

    // Color legend — matches Workbench renderColorLegend (circles, not rects)
    // legendLabel=20, rowGap=10 → row height = 30; circle cy = rowY + 10
    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${legendX},${margin.top})`);

    const legendRowH = 30;

    seriesDomain.forEach((ser, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 10;

        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', resolveSeriesColor(seriesDomain, ser))
            .attr('opacity', 0.85);

        legend.append('text')
            .attr('x', 20)
            .attr('y', cy)
            .attr('font-size', 20) // CHART_TEXT_SIZE.legendLabel
            .attr('dominant-baseline', 'middle')
            .text(ser);
    });

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-multi-line-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${xField}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-x"></span>
        </div>
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${seriesField}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-s"></span>
        </div>
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${yField}</span>
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

function getFocusedCountryRows() {
    return data_rows.filter((d) => Number(d.Year) >= 2010 && Number(d.Year) <= 2015);
}

function getCountryTargets() {
    const rows = getFocusedCountryRows();
    const germanyRows = rows.filter((d) => d.Country === 'Germany');
    const usRows = rows.filter((d) => d.Country === 'US');
    const germanyMax = germanyRows.reduce((best, row) => (
        Number(row.Favorable_View_Percentage) > Number(best.Favorable_View_Percentage) ? row : best
    ), germanyRows[0]);
    const usMin = usRows.reduce((best, row) => (
        Number(row.Favorable_View_Percentage) < Number(best.Favorable_View_Percentage) ? row : best
    ), usRows[0]);
    return { germanyMax, usMin };
}

function focusCountryLineInPlace({ d3, container }) {
    // Per reviewer (round-2 row 9): do NOT rebuild. Reuse existing paths + circles
    // and transition the scales so points outside 2010–2015 fade out and the axes
    // rescale smoothly.
    const focusedRows = getFocusedCountryRows();
    const focusedYears = new Set(focusedRows.map((d) => String(d.Year)));
    const newXDomain = Array.from(new Set(focusedRows.map((d) => String(d.Year))));
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const yValues = focusedRows.map((d) => Number(d.Favorable_View_Percentage));
    const newXScale = d3.scalePoint().domain(newXDomain).range([0, plotW]).padding(0.5);
    const newYScale = d3.scaleLinear().domain([d3.min(yValues), d3.max(yValues)]).nice().range([plotH, 0]);

    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    // Transition axes to the new scales.
    g.select('.y-axis').transition().duration(700).call(d3.axisLeft(newYScale).ticks(6));
    g.select('.x-axis').transition().duration(700).call(d3.axisBottom(newXScale)).on('end', function () {
        autoRotateXAxisLabels(d3.select(this));
    });

    // Move focused circles to new positions; fade out unfocused.
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
            const v = Number(this.getAttribute('data-value'));
            return newYScale(v);
        })
        .attr('opacity', function () {
            return focusedYears.has(this.getAttribute('data-target')) ? 0.85 : 0;
        });

    // Update each series' line path to its filtered shape.
    const seriesNames = Array.from(new Set(focusedRows.map((d) => String(d.Country))));
    seriesNames.forEach((country) => {
        const countryRows = focusedRows.filter((d) => String(d.Country) === country);
        const lineGen = d3.line()
            .x((d) => newXScale(String(d.Year)))
            .y((d) => newYScale(Number(d.Favorable_View_Percentage)));
        g.select(`path[data-series="${country}"]`)
            .datum({ country, points: countryRows })
            .transition()
            .duration(700)
            .attrTween('d', function () {
                const prev = this.getAttribute('d') ?? '';
                const next = lineGen(countryRows);
                return d3.interpolateString(prev, next);
            })
            .attr('stroke-dasharray', null)
            .attr('stroke-dashoffset', null);
    });
}

function highlightCountryPoints(d3, container, targets) {
    // Cumulative-highlight (round 4 fix per reviewer): function3 must KEEP
    // function2's red circle (Germany 2010) visible while adding its own
    // (US min). So we accept an array of {country, year} pairs — function2
    // passes one entry, function3 passes both.
    //
    // Also R12 stale-cleanup: non-focused-range circles (years OUTSIDE 2010-2015)
    // stay fully HIDDEN (opacity 0), never dim back to 0.25.
    const focusedYears = new Set(getFocusedCountryRows().map((d) => String(d.Year)));
    const targetSet = new Set((targets ?? []).map((t) => `${t.country}|${String(t.year)}`));
    const highlightedCountries = new Set((targets ?? []).map((t) => t.country));

    d3.select(container).selectAll('circle[data-target]')
        .each(function () {
            const yearStr = this.getAttribute('data-target');
            const seriesStr = this.getAttribute('data-series');
            const isTarget = targetSet.has(`${seriesStr}|${yearStr}`);
            const isInFocusRange = focusedYears.has(yearStr);

            let nextR, nextFill, nextOpacity;
            if (isTarget && isInFocusRange) {
                nextR = 8;
                nextFill = '#ef4444';
                nextOpacity = 1;
            } else if (isInFocusRange) {
                nextR = 3.5;
                // Preserve the existing fill (set by the multi-line palette).
                nextFill = d3.select(this).attr('fill');
                nextOpacity = 0.25;
            } else {
                // OUTSIDE focus range — must remain invisible.
                nextR = 3.5;
                nextFill = d3.select(this).attr('fill');
                nextOpacity = 0;
            }

            // R6 no-op-skip: don't transition if attrs already match.
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

    d3.select(container).selectAll('.color-legend text')
        .transition()
        .duration(600)
        .attr('font-weight', function () {
            return highlightedCountries.has(d3.select(this).text()) ? 800 : 400;
        });
}

export function function1({ d3, container }) {
    focusCountryLineInPlace({ d3, container });
}

export function function2({ d3, container }) {
    const { germanyMax } = getCountryTargets();
    highlightCountryPoints(d3, container, [{ country: 'Germany', year: germanyMax.Year }]);
}

export function function3({ d3, container }) {
    // Cumulative per reviewer: function2's Germany 2010 red dot must STAY visible
    // while US min is also highlighted. So we pass BOTH highlights.
    const { germanyMax, usMin } = getCountryTargets();
    highlightCountryPoints(d3, container, [
        { country: 'Germany', year: germanyMax.Year },
        { country: 'US', year: usMin.Year },
    ]);
}

export function function4({ d3, container }) {
    const { germanyMax, usMin } = getCountryTargets();
    const rows = getFocusedCountryRows();
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const yScale = d3.scaleLinear()
        .domain([d3.min(rows, (d) => Number(d.Favorable_View_Percentage)) ?? 0, d3.max(rows, (d) => Number(d.Favorable_View_Percentage)) ?? 1])
        .nice()
        .range([plotH, 0]);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-country-diff').remove();
    svg.select('defs#e2-q10-defs').remove();
    const defs = svg.append('defs').attr('id', 'e2-q10-defs');
    defs.append('marker')
        .attr('id', 'e2-q10-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 10)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 L 3 5 z')
        .attr('fill', '#ef4444');

    [germanyMax, usMin].forEach((row) => {
        const value = Number(row.Favorable_View_Percentage);
        const y = yScale(value);
        g.append('line')
            .attr('class', 'validation-country-diff')
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
            .attr('class', 'validation-country-diff')
            .attr('x', plotW + 6)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .attr('opacity', 0)
            .text(String(value))
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });

    const y1 = yScale(Number(germanyMax.Favorable_View_Percentage));
    const y2 = yScale(Number(usMin.Favorable_View_Percentage));
    const arrowX = plotW + 46;
    g.append('line')
        .attr('class', 'validation-country-diff')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', y1)
        .attr('y2', y1)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q10-arrow)')
        .attr('marker-end', 'url(#e2-q10-arrow)')
        .transition()
        .duration(650)
        .attr('y2', y2);
    g.append('text')
        .attr('class', 'validation-country-diff')
        .attr('x', arrowX + 8)
        .attr('y', (y1 + y2) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(String(Number(germanyMax.Favorable_View_Percentage) - Number(usMin.Favorable_View_Percentage)))
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
