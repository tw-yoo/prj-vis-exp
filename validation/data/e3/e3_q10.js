import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 1972, Gender: 'Women', Percentage: 38 },
    { Year: 1972, Gender: 'Men', Percentage: 36 },
    { Year: 1976, Gender: 'Women', Percentage: 50 },
    { Year: 1976, Gender: 'Men', Percentage: 50 },
    { Year: 1980, Gender: 'Women', Percentage: 45 },
    { Year: 1980, Gender: 'Men', Percentage: 36 },
    { Year: 1984, Gender: 'Women', Percentage: 44 },
    { Year: 1984, Gender: 'Men', Percentage: 37 },
    { Year: 1988, Gender: 'Women', Percentage: 49 },
    { Year: 1988, Gender: 'Men', Percentage: 41 },
    { Year: 1992, Gender: 'Women', Percentage: 45 },
    { Year: 1992, Gender: 'Men', Percentage: 41 },
    { Year: 1996, Gender: 'Women', Percentage: 54 },
    { Year: 1996, Gender: 'Men', Percentage: 43 },
    { Year: 2000, Gender: 'Women', Percentage: 54 },
    { Year: 2000, Gender: 'Men', Percentage: 42 },
    { Year: 2004, Gender: 'Women', Percentage: 51 },
    { Year: 2004, Gender: 'Men', Percentage: 44 },
    { Year: 2008, Gender: 'Women', Percentage: 56 },
    { Year: 2008, Gender: 'Men', Percentage: 49 },
    { Year: 2012, Gender: 'Women', Percentage: 55 },
    { Year: 2012, Gender: 'Men', Percentage: 45 }
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
    const seriesField = 'Gender';
    const yField = 'Percentage';
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

function getQ10Geometry(d3) {
    const xField = 'Year';
    const seriesField = 'Gender';
    const yField = 'Percentage';
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[xField]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[seriesField]))));
    const yValues = data_rows.map((d) => Number(d[yField]));
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const yScale = d3.scaleLinear().domain([minY, maxY]).nice().range([plotH, 0]);
    return { xField, seriesField, yField, xDomain, seriesDomain, plotW, plotH, xScale, yScale };
}

function getQ10GapsFrom2000() {
    const yField = 'Percentage';
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d.Year))));
    return xDomain
        .filter((year) => Number(year) >= 2000)
        .map((year) => {
            const women = Number(data_rows.find((d) => String(d.Year) === year && d.Gender === 'Women')?.[yField] ?? 0);
            const men = Number(data_rows.find((d) => String(d.Year) === year && d.Gender === 'Men')?.[yField] ?? 0);
            return { year, women, men, gap: women - men };
        });
}

function ensureQ10ArrowMarker(svg) {
    if (!svg.select('defs#e3-q10-defs').empty()) return;
    const defs = svg.append('defs').attr('id', 'e3-q10-defs');
    defs.append('marker')
        .attr('id', 'e3-q10-arrow')
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
    const { plotH, xScale } = getQ10Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q10-pre-2000-tint, .validation-q10-gap-line, .validation-q10-gap-label').remove();

    const x2000 = xScale('2000') ?? 0;
    const xPrev = xScale('1996') ?? 0;
    const splitX = (xPrev + x2000) / 2;

    g.insert('rect', ':first-child')
        .attr('class', 'validation-q10-pre-2000-tint')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', splitX)
        .attr('height', plotH)
        .attr('fill', '#f3f4f6')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.6);

    const gaps = getQ10GapsFrom2000();
    gaps.forEach((row) => {
        const cx = xScale(row.year) ?? 0;
        const yWomen = getQ10Geometry(d3).yScale(row.women);
        const yMen = getQ10Geometry(d3).yScale(row.men);
        g.append('line')
            .attr('class', 'validation-q10-gap-line')
            .attr('data-year', row.year)
            .attr('x1', cx)
            .attr('x2', cx)
            .attr('y1', yWomen)
            .attr('y2', yWomen)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3 3')
            .transition()
            .duration(650)
            .attr('y2', yMen);

        g.append('text')
            .attr('class', 'validation-q10-gap-label')
            .attr('data-year', row.year)
            .attr('x', cx)
            .attr('y', (yWomen + yMen) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'start')
            .attr('dx', 6)
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#ef4444')
            .attr('opacity', 0)
            .text(row.gap.toFixed(0))
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });
}

export function function2({ d3, container }) {
    const { plotW, yScale } = getQ10Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q10-avg-arrow, .validation-q10-avg-label').remove();
    ensureQ10ArrowMarker(svg);

    const gaps = getQ10GapsFrom2000();
    const avgWomen = gaps.reduce((s, r) => s + r.women, 0) / gaps.length;
    const avgMen = gaps.reduce((s, r) => s + r.men, 0) / gaps.length;
    const avgGap = gaps.reduce((s, r) => s + r.gap, 0) / gaps.length;

    const yTop = yScale(avgWomen);
    const yBot = yScale(avgMen);
    const arrowX = plotW - 18;

    g.append('line')
        .attr('class', 'validation-q10-avg-arrow')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', yBot)
        .attr('y2', yBot)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#e3-q10-arrow)')
        .transition()
        .duration(650)
        .attr('y2', yTop + 6);

    // Theme D (#10 round 3): move avg-gap label to the right of the arrow tip
    // instead of crowding the circles next to the arrow.
    g.append('text')
        .attr('class', 'validation-q10-avg-label')
        .attr('x', arrowX + 8)
        .attr('y', (yTop + yBot) / 2)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`avg gap = ${avgGap.toFixed(0)}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}