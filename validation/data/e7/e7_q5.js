import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2012, Metric: 'Taste', 'Has a great impact': 87 },
    { Year: 2012, Metric: 'Price', 'Has a great impact': 73 },
    { Year: 2012, Metric: 'Healthfulness', 'Has a great impact': 61 },
    { Year: 2012, Metric: 'Convenience', 'Has a great impact': 53 },
    { Year: 2012, Metric: 'Sustainability', 'Has a great impact': 35 },
    { Year: 2013, Metric: 'Taste', 'Has a great impact': 89 },
    { Year: 2013, Metric: 'Price', 'Has a great impact': 71 },
    { Year: 2013, Metric: 'Healthfulness', 'Has a great impact': 64 },
    { Year: 2013, Metric: 'Convenience', 'Has a great impact': 56 },
    { Year: 2013, Metric: 'Sustainability', 'Has a great impact': 36 },
    { Year: 2014, Metric: 'Taste', 'Has a great impact': 90 },
    { Year: 2014, Metric: 'Price', 'Has a great impact': 73 },
    { Year: 2014, Metric: 'Healthfulness', 'Has a great impact': 71 },
    { Year: 2014, Metric: 'Convenience', 'Has a great impact': 51 },
    { Year: 2014, Metric: 'Sustainability', 'Has a great impact': 38 },
    { Year: 2015, Metric: 'Taste', 'Has a great impact': 83 },
    { Year: 2015, Metric: 'Price', 'Has a great impact': 68 },
    { Year: 2015, Metric: 'Healthfulness', 'Has a great impact': 60 },
    { Year: 2015, Metric: 'Convenience', 'Has a great impact': 52 },
    { Year: 2015, Metric: 'Sustainability', 'Has a great impact': 35 },
    { Year: 2016, Metric: 'Taste', 'Has a great impact': 84 },
    { Year: 2016, Metric: 'Price', 'Has a great impact': 71 },
    { Year: 2016, Metric: 'Healthfulness', 'Has a great impact': 64 },
    { Year: 2016, Metric: 'Convenience', 'Has a great impact': 52 },
    { Year: 2016, Metric: 'Sustainability', 'Has a great impact': 41 }
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
    const seriesField = 'Metric';
    const yField = 'Has a great impact';
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

function drawPriceConvenienceGaps({ d3, container, highlightYear = null }) {
    const csvGaps = { 2012: 20, 2013: 15, 2014: 22, 2015: 16, 2016: 19 };
    const targetSeries = new Set(['Price', 'Convenience']);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const markerId = 'e7-q5-gap-arrow';

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
        .attr('fill', '#dc2626');

    g.selectAll('.e7-q5-annotation').remove();
    d3.select(container).selectAll('path[data-series]')
        .attr('opacity', (d) => (targetSeries.has(d.series) ? 1 : 0.08))
        .attr('stroke-width', (d) => (targetSeries.has(d.series) ? 2.5 : 1));
    d3.select(container).selectAll('circle[data-target]')
        .attr('opacity', (p) => (targetSeries.has(p.series) ? 1 : 0.08))
        .attr('r', (p) => (targetSeries.has(p.series) ? 4.5 : 2.5));

    Object.entries(csvGaps).forEach(([year, gap]) => {
        const points = d3.select(container).selectAll(`circle[data-target="${year}"]`)
            .filter((p) => targetSeries.has(p.series))
            .nodes();
        if (points.length < 2) return;
        const mapped = points.map((node) => {
            const selection = d3.select(node);
            const datum = selection.datum();
            return { series: datum.series, x: Number(selection.attr('cx')), y: Number(selection.attr('cy')) };
        });
        const price = mapped.find((p) => p.series === 'Price');
        const convenience = mapped.find((p) => p.series === 'Convenience');
        const isFocus = !highlightYear || year === highlightYear;

        g.append('line')
            .attr('class', 'e7-q5-annotation')
            .attr('x1', price.x)
            .attr('x2', price.x)
            .attr('y1', price.y)
            .attr('y2', convenience.y)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', year === highlightYear ? 2.8 : 1.8)
            .attr('opacity', isFocus ? 1 : 0.18)
            .attr('marker-start', `url(#${markerId})`)
            .attr('marker-end', `url(#${markerId})`);

        g.append('text')
            .attr('class', 'e7-q5-annotation')
            .attr('x', price.x + 6)
            .attr('y', (price.y + convenience.y) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', year === highlightYear ? 12 : 10)
            .attr('font-weight', year === highlightYear ? 800 : 700)
            .attr('fill', '#dc2626')
            .attr('opacity', isFocus ? 1 : 0.18)
            .text(String(gap));
    });

    if (highlightYear) {
        d3.select(container).selectAll('circle[data-target]')
            .attr('opacity', (p) => (targetSeries.has(p.series) && String(p.target) === highlightYear ? 1 : 0.16))
            .attr('r', (p) => (targetSeries.has(p.series) && String(p.target) === highlightYear ? 6 : 3));
    }
}

export function function1({ d3, container }) {
    drawPriceConvenienceGaps({ d3, container });
}

export function function2({ d3, container }) {
    drawPriceConvenienceGaps({ d3, container, highlightYear: '2013' });
}

export function function3({ d3, container }) {}
