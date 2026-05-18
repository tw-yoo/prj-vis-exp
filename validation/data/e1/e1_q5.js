import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { month: 'Jan', product: 'Alpha', value: 32 },
    { month: 'Feb', product: 'Alpha', value: 36 },
    { month: 'Mar', product: 'Alpha', value: 34 },
    { month: 'Apr', product: 'Alpha', value: 42 },
    { month: 'May', product: 'Alpha', value: 45 },
    { month: 'Jun', product: 'Alpha', value: 51 },
    { month: 'Jul', product: 'Alpha', value: 56 },
    { month: 'Aug', product: 'Alpha', value: 54 },

    { month: 'Jan', product: 'Beta', value: 28 },
    { month: 'Feb', product: 'Beta', value: 33 },
    { month: 'Mar', product: 'Beta', value: 39 },
    { month: 'Apr', product: 'Beta', value: 44 },
    { month: 'May', product: 'Beta', value: 48 },
    { month: 'Jun', product: 'Beta', value: 57 },
    { month: 'Jul', product: 'Beta', value: 63 },
    { month: 'Aug', product: 'Beta', value: 68 },

    { month: 'Jan', product: 'Gamma', value: 40 },
    { month: 'Feb', product: 'Gamma', value: 43 },
    { month: 'Mar', product: 'Gamma', value: 41 },
    { month: 'Apr', product: 'Gamma', value: 46 },
    { month: 'May', product: 'Gamma', value: 44 },
    { month: 'Jun', product: 'Gamma', value: 50 },
    { month: 'Jul', product: 'Gamma', value: 49 },
    { month: 'Aug', product: 'Gamma', value: 52 }
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
    const xField = 'month';
    const seriesField = 'product';
    const yField = 'value';
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

export function function1({ d3, container }) {}

export function function2({ d3, container }) {}

export function function3({ d3, container }) {}
