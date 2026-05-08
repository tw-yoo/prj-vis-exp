import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, Metric: 'Favorable view of US', Percentage: 44 },
    { Year: 2009, Metric: 'Confidence in Obama', Percentage: 37 },
    { Year: 2010, Metric: 'Favorable view of US', Percentage: 57 },
    { Year: 2010, Metric: 'Confidence in Obama', Percentage: 41 },
    { Year: 2011, Metric: 'Favorable view of US', Percentage: 56 },
    { Year: 2011, Metric: 'Confidence in Obama', Percentage: 41 },
    { Year: 2012, Metric: 'Favorable view of US', Percentage: 52 },
    { Year: 2012, Metric: 'Confidence in Obama', Percentage: 36 },
    { Year: 2013, Metric: 'Favorable view of US', Percentage: 51 },
    { Year: 2013, Metric: 'Confidence in Obama', Percentage: 29 },
    { Year: 2014, Metric: 'Favorable view of US', Percentage: 23 },
    { Year: 2014, Metric: 'Confidence in Obama', Percentage: 15 },
    { Year: 2015, Metric: 'Favorable view of US', Percentage: 15 },
    { Year: 2015, Metric: 'Confidence in Obama', Percentage: 11 }
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

export function function1({ d3, container }) {
    const xField = 'Year';
    const yField = 'Absolute percentage-point difference';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    d3.select(container).selectAll('.validation-multi-line-tooltip').remove();

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    const margin = { top: 32, right: 24, bottom: 56, left: 72 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const years = Array.from(new Set(data_rows.map((d) => Number(d.Year)))).sort((a, b) => a - b);
    const differenceRows = years.map((year) => {
        const favorable = data_rows.find((d) => Number(d.Year) === year && d.Metric === 'Favorable view of US')?.Percentage ?? 0;
        const confidence = data_rows.find((d) => Number(d.Year) === year && d.Metric === 'Confidence in Obama')?.Percentage ?? 0;
        return {
            year: String(year),
            value: Math.abs(Number(favorable) - Number(confidence))
        };
    });

    const xScale = d3.scalePoint()
        .domain(differenceRows.map((d) => d.year))
        .range([0, plotW])
        .padding(0.5);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(differenceRows, (d) => d.value) ?? 0])
        .nice()
        .range([plotH, 0]);

    const line = d3.line()
        .x((d) => xScale(d.year) ?? 0)
        .y((d) => yScale(d.value))
        .curve(d3.curveMonotoneX);
    svg.selectAll('*').remove();

    const g = svg.append('g')
        .attr('class', 'validation-function1-difference-line-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    const xAxis = g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(xAxis);

    g.append('text')
        .attr('class', 'x-axis-label')
        .attr('x', plotW / 2)
        .attr('y', plotH + 48)
        .attr('text-anchor', 'middle')
        .text(xField);

    g.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -plotH / 2)
        .attr('y', -54)
        .attr('text-anchor', 'middle')
        .text(yField);

    const path = g.append('path')
        .datum(differenceRows)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', '#4f46e5')
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('d', line);

    g.selectAll('circle.main-point')
        .data(differenceRows)
        .join('circle')
        .attr('class', 'main-point main-bar')
        .attr('cx', (d) => xScale(d.year) ?? 0)
        .attr('cy', (d) => yScale(d.value))
        .attr('r', 0)
        .attr('fill', '#4f46e5')
        .attr('opacity', 0.9)
        .attr('data-target', (d) => d.year)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.year)
        .attr('data-y-value', (d) => String(d.value))
        .attr('r', 4);
}

export function function2({ d3, container }) {
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d.product))));
    const svg = d3.select(container).select('svg');
    const mLeft = +svg.attr('data-m-left') || 0;
    const mTop = +svg.attr('data-m-top') || 0;

    svg.selectAll('path[data-series]')
        .attr('opacity', (d) => d.series === 'Beta' ? 0.55 : 0.12)
        .attr('stroke-width', (d) => d.series === 'Beta' ? 4 : 2);

    svg.selectAll('circle[data-target]')
        .attr('opacity', (p) => p.series === 'Beta' && (p.target === 'Jul' || p.target === 'Aug') ? 1 : 0.18)
        .attr('r', (p) => p.series === 'Beta' && (p.target === 'Jul' || p.target === 'Aug') ? 8 : 3.5)
        .attr('fill', (p) => p.series === 'Beta' && (p.target === 'Jul' || p.target === 'Aug') ? '#ef4444' : resolveSeriesColor(seriesDomain, p.series))
        .attr('stroke', (p) => p.series === 'Beta' && (p.target === 'Jul' || p.target === 'Aug') ? '#111827' : '#ffffff')
        .attr('stroke-width', (p) => p.series === 'Beta' && (p.target === 'Jul' || p.target === 'Aug') ? 2.5 : 1.5);

    svg.selectAll('.step-annotation-2').remove();

    // Circles are inside <g translate(mLeft, mTop)>; add margin to convert to SVG coords
    const julCircle = svg.select('circle[data-series="Beta"][data-target="Jul"]');
    const augCircle = svg.select('circle[data-series="Beta"][data-target="Aug"]');
    const x1 = mLeft + (+julCircle.attr('cx') || 0);
    const y1 = mTop + (+julCircle.attr('cy') || 0);
    const x2 = mLeft + (+augCircle.attr('cx') || 0);
    const y2 = mTop + (+augCircle.attr('cy') || 0);

    svg.append('line')
        .attr('class', 'step-annotation step-annotation-2')
        .attr('x1', x1).attr('y1', y1)
        .attr('x2', x2).attr('y2', y2)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 4)
        .attr('stroke-linecap', 'round');

    svg.append('text')
        .attr('class', 'step-annotation step-annotation-2')
        .attr('x', (x1 + x2) / 2)
        .attr('y', Math.min(y1, y2) - 18)
        .attr('text-anchor', 'middle')
        .attr('font-size', 14)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .text('function2: compare Jul to Aug');
}
