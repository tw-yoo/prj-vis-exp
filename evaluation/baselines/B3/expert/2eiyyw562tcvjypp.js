import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2007, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 41 },
    { Year: 2007, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 44 },
    { Year: 2009, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 44 },
    { Year: 2009, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 43 },
    { Year: 2010, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 57 },
    { Year: 2010, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 49 },
    { Year: 2011, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 56 },
    { Year: 2011, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 49 },
    { Year: 2012, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 52 },
    { Year: 2012, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 37 },
    { Year: 2013, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 51 },
    { Year: 2013, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 37 },
    { Year: 2014, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 23 },
    { Year: 2014, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 19 },
    { Year: 2015, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 15 },
    { Year: 2015, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 22 },
    { Year: 2017, Favorability_Direction: 'US favorability in Russia', Favorable_View_Percentage: 41 },
    { Year: 2017, Favorability_Direction: 'Russia favorability in US', Favorable_View_Percentage: 29 }
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
    const seriesField = 'Favorability_Direction';
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

function ensureFavorabilityMarker({ d3, svg, markerId, color }) {
    svg.select(`#${markerId}`).remove();
    svg.append('defs')
        .append('marker')
        .attr('id', markerId)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 5)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
}

export function function1({ d3, container }) {
    const csvRussiaHigherYears = new Set(['2007', '2009', '2015']);
    const seriesColors = {
        'US favorability in Russia': '#60a5fa',
        'Russia favorability in US': '#fb7185',
    };
    const markerIds = {
        'US favorability in Russia': 'e6-q5-arrow-us',
        'Russia favorability in US': 'e6-q5-arrow-russia',
    };
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const plotW = 640 - 56 - 16 - 200;

    g.selectAll('.e6-q5-function1').remove();
    ensureFavorabilityMarker({ d3, svg, markerId: markerIds['US favorability in Russia'], color: seriesColors['US favorability in Russia'] });
    ensureFavorabilityMarker({ d3, svg, markerId: markerIds['Russia favorability in US'], color: seriesColors['Russia favorability in US'] });

    const years = Array.from(new Set(data_rows.map((d) => String(d.Year))));
    years.forEach((year) => {
        const circles = d3.select(container).selectAll(`circle[data-target="${year}"]`).nodes();
        if (circles.length < 2) return;
        const points = circles.map((node) => {
            const selection = d3.select(node);
            const datum = selection.datum();
            return {
                series: datum.series,
                value: Number(datum.yValue),
                x: Number(selection.attr('cx')),
                y: Number(selection.attr('cy')),
            };
        });
        const high = points.slice().sort((a, b) => b.value - a.value)[0];
        const low = points.slice().sort((a, b) => a.value - b.value)[0];
        const color = seriesColors[high.series];
        const markerId = markerIds[high.series];
        const x = high.x;
        const diff = Math.abs(high.value - low.value);
        const isRussiaHigher = csvRussiaHigherYears.has(year);

        g.append('line')
            .attr('class', 'e6-q5-function1')
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', high.y)
            .attr('y2', low.y)
            .attr('stroke', color)
            .attr('stroke-width', isRussiaHigher ? 2.4 : 1.5)
            .attr('opacity', isRussiaHigher ? 1 : 0.55)
            .attr('marker-start', `url(#${markerId})`)
            .attr('marker-end', `url(#${markerId})`);

        g.append('text')
            .attr('class', 'e6-q5-function1')
            .attr('x', x + 5)
            .attr('y', (high.y + low.y) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', isRussiaHigher ? 11 : 9)
            .attr('font-weight', isRussiaHigher ? 800 : 700)
            .attr('fill', color)
            .attr('opacity', isRussiaHigher ? 1 : 0.55)
            .text(String(diff));
    });

    g.append('text')
        .attr('class', 'e6-q5-function1')
        .attr('x', plotW)
        .attr('y', 8)
        .attr('text-anchor', 'end')
        .attr('font-size', 13)
        .attr('font-weight', 800)
        .attr('fill', seriesColors['Russia favorability in US'])
        .text('Russia higher: 3 years (incl. near-tie 2009)');
}

export function function2({ d3, container }) {}

export function function3({ d3, container }) {}
