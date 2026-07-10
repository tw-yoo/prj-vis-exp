import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2002, Opinion: 'Favorable', Value: 72 },
    { Year: 2002, Opinion: 'Unfavorable', Value: 27 },
    { Year: 2003, Opinion: 'Favorable', Value: 63 },
    { Year: 2003, Opinion: 'Unfavorable', Value: 34 },
    { Year: 2005, Opinion: 'Favorable', Value: 59 },
    { Year: 2005, Opinion: 'Unfavorable', Value: 37 },
    { Year: 2007, Opinion: 'Favorable', Value: 55 },
    { Year: 2007, Opinion: 'Unfavorable', Value: 42 },
    { Year: 2009, Opinion: 'Favorable', Value: 68 },
    { Year: 2009, Opinion: 'Unfavorable', Value: 28 },
    { Year: 2013, Opinion: 'Favorable', Value: 64 },
    { Year: 2013, Opinion: 'Unfavorable', Value: 30 },
    { Year: 2015, Opinion: 'Favorable', Value: 68 },
    { Year: 2015, Opinion: 'Unfavorable', Value: 26 }
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
    const xField = 'Year';
    const seriesField = 'Opinion';
    const yField = 'Value';
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

function buildOpinionDifferenceRows() {
    const excludedYears = new Set([2002, 2007]);
    const years = Array.from(new Set(data_rows.map((d) => Number(d.Year)))).sort((a, b) => a - b);

    return years.map((year) => {
        const favorable = data_rows.find((d) => Number(d.Year) === year && d.Opinion === 'Favorable');
        const unfavorable = data_rows.find((d) => Number(d.Year) === year && d.Opinion === 'Unfavorable');
        const rawDifference = Number(favorable?.Value ?? 0) - Number(unfavorable?.Value ?? 0);
        return {
            year: String(year),
            value: excludedYears.has(year) ? 0 : rawDifference,
            excluded: excludedYears.has(year)
        };
    });
}

function renderOpinionDifferenceBarChart({ d3, container, showAverage = false }) {
    const rows = buildOpinionDifferenceRows();
    const includedRows = rows.filter((d) => !d.excluded);
    const average = d3.mean(includedRows, (d) => d.value) ?? 0;
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 72, bottom: 56, left: 64 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const maxY = Math.max(0, d3.max(rows, (d) => d.value) ?? 0, showAverage ? average : 0);
    const xScale = d3.scaleBand()
        .domain(rows.map((d) => d.year))
        .range([0, plotW])
        .padding(0.22);
    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);

    d3.select(container).selectAll('.validation-multi-line-tooltip').remove();

    container.classList.add('validation-chart-host');

    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}`, instant: true });
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));
    const xAxis = g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    g.selectAll('rect.main-bar')
        .data(rows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.year))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', (d) => d.excluded ? '#d1d5db' : '#4f46e5')
        .attr('opacity', 1)
        .attr('stroke', (d) => d.excluded ? '#6b7280' : 'none')
        .attr('data-target', (d) => d.year)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.year)
        .attr('data-y-value', (d) => String(d.value));

    g.selectAll('text.validation-bar-label')
        .data(rows)
        .join('text')
        .attr('class', 'validation-bar-label')
        .attr('x', (d) => (xScale(d.year) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => yScale(d.value) - 8)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        // Reviewer (e10 q10): excluded years should read "N/A", not "0".
        .text((d) => d.excluded ? 'N/A' : String(d.value));

    if (!showAverage) return;

    const avgY = yScale(average);
    g.append('line')
        .attr('class', 'validation-average-line')
        .attr('x1', 0)
        .attr('x2', plotW)
        .attr('y1', avgY)
        .attr('y2', avgY)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4');
    g.append('text')
        .attr('class', 'validation-average-line')
        .attr('x', plotW + 8)
        .attr('y', avgY)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text(`avg ${average.toFixed(1)}`);
}

export function function1({ d3, container }) {
    const excludedYears = new Set(['2002', '2007']);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (svg.empty() || g.empty()) return;

    const positions = Array.from(g.selectAll('circle[data-target]').nodes())
        .map((node) => ({
            year: node.getAttribute('data-target'),
            x: Number(node.getAttribute('cx'))
        }))
        .filter((d, index, all) => Number.isFinite(d.x) && all.findIndex((v) => v.year === d.year) === index)
        .sort((a, b) => Number(a.year) - Number(b.year));
    const step = Math.min(...positions.slice(1).map((d, i) => d.x - positions[i].x).filter((d) => d > 0));
    const bandWidth = Number.isFinite(step) ? step * 0.58 : 36;
    const plotH = 280;

    g.selectAll('.validation-excluded-year-band').remove();
    positions
        .filter((d) => excludedYears.has(d.year))
        .forEach((d) => {
            g.insert('rect', ':first-child')
                .attr('class', 'validation-excluded-year-band')
                .attr('x', d.x - bandWidth / 2)
                .attr('y', 0)
                .attr('width', bandWidth)
                .attr('height', plotH)
                .attr('fill', '#111827')
                .attr('opacity', 0.12);
        });

    g.selectAll('circle[data-target]')
        .attr('opacity', (d) => excludedYears.has(String(d.target)) ? 1 : 0.28)
        .attr('fill', (d) => excludedYears.has(String(d.target)) ? '#374151' : resolveSeriesColor(['Favorable', 'Unfavorable'], d.series));
}

export function function2({ d3, container }) {
    renderOpinionDifferenceBarChart({ d3, container, showAverage: false });
}

export function function3({ d3, container }) {
    renderOpinionDifferenceBarChart({ d3, container, showAverage: true });
}
