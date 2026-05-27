import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2008, Gender: 'female', 'Life expectancy at virth in years': 72.17 },
    { Year: 2008, Gender: 'male', 'Life expectancy at virth in years': 65.25 },
    { Year: 2009, Gender: 'female', 'Life expectancy at virth in years': 72.47 },
    { Year: 2009, Gender: 'male', 'Life expectancy at virth in years': 65.57 },
    { Year: 2010, Gender: 'female', 'Life expectancy at virth in years': 72.86 },
    { Year: 2010, Gender: 'male', 'Life expectancy at virth in years': 65.96 },
    { Year: 2011, Gender: 'female', 'Life expectancy at virth in years': 73.31 },
    { Year: 2011, Gender: 'male', 'Life expectancy at virth in years': 66.4 },
    { Year: 2012, Gender: 'female', 'Life expectancy at virth in years': 73.76 },
    { Year: 2012, Gender: 'male', 'Life expectancy at virth in years': 66.84 },
    { Year: 2013, Gender: 'female', 'Life expectancy at virth in years': 74.18 },
    { Year: 2013, Gender: 'male', 'Life expectancy at virth in years': 67.23 },
    { Year: 2014, Gender: 'female', 'Life expectancy at virth in years': 74.55 },
    { Year: 2014, Gender: 'male', 'Life expectancy at virth in years': 67.56 },
    { Year: 2015, Gender: 'female', 'Life expectancy at virth in years': 74.86 },
    { Year: 2015, Gender: 'male', 'Life expectancy at virth in years': 67.84 },
    { Year: 2016, Gender: 'female', 'Life expectancy at virth in years': 75.12 },
    { Year: 2016, Gender: 'male', 'Life expectancy at virth in years': 68.06 },
    { Year: 2017, Gender: 'female', 'Life expectancy at virth in years': 75.34 },
    { Year: 2017, Gender: 'male', 'Life expectancy at virth in years': 68.25 },
    { Year: 2018, Gender: 'female', 'Life expectancy at virth in years': 75.55 },
    { Year: 2018, Gender: 'male', 'Life expectancy at virth in years': 68.44 }
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
    const seriesField = 'Gender';
    const yField = 'Life expectancy at virth in years';
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

function getLifeExpectancyGapRows(d3) {
    const years = Array.from(new Set(data_rows.map((d) => String(d.Year)))).sort((a, b) => Number(a) - Number(b));
    const gaps = years.map((year) => {
        const female = data_rows.find((d) => String(d.Year) === year && d.Gender === 'female');
        const male = data_rows.find((d) => String(d.Year) === year && d.Gender === 'male');
        return {
            year,
            gap: Number(female?.['Life expectancy at virth in years'] ?? 0) - Number(male?.['Life expectancy at virth in years'] ?? 0)
        };
    });
    const averageGap = d3.mean(gaps, (d) => d.gap) ?? 0;
    return gaps.map((d) => ({ ...d, value: d.gap - averageGap }));
}

function renderLifeExpectancyCompositeChart({ d3, container }) {
    const xField = 'Year';
    const seriesField = 'Gender';
    const yField = 'Life expectancy at virth in years';
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[xField])))).sort((a, b) => Number(a) - Number(b));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[seriesField]))));
    const gapRows = getLifeExpectancyGapRows(d3);
    const width = 640;
    const height = 460;
    const margin = { top: 28, right: 16, bottom: 52, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const topH = 108;
    const panelGap = 34;
    const bottomH = height - margin.top - margin.bottom - topH - panelGap;
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const maxAbs = d3.max(gapRows, (d) => Math.abs(d.value)) ?? 1;
    const topYScale = d3.scaleLinear().domain([-maxAbs, maxAbs]).nice().range([topH, 0]);
    const zeroY = topYScale(0);

    const allPoints = data_rows.map((row) => ({
        target: String(row[xField]),
        series: String(row[seriesField]),
        yValue: Number(row[yField])
    }));
    const bottomYScale = d3.scaleLinear()
        .domain([d3.min(allPoints, (d) => d.yValue) ?? 0, d3.max(allPoints, (d) => d.yValue) ?? 1])
        .nice()
        .range([bottomH, 0]);

    d3.select(container).selectAll('.validation-multi-line-tooltip').remove();

    container.classList.add('validation-multi-line-host');

    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}` });
    const topG = svg.append('g')
        .attr('class', 'validation-life-gap-panel')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    const bottomG = svg.append('g')
        .attr('class', 'validation-life-line-panel')
        .attr('transform', `translate(${margin.left},${margin.top + topH + panelGap})`);

    topG.append('g').attr('class', 'y-axis').call(d3.axisLeft(topYScale).ticks(3));
    topG.append('line')
        .attr('x1', 0)
        .attr('x2', plotW)
        .attr('y1', zeroY)
        .attr('y2', zeroY)
        .attr('stroke', '#111827')
        .attr('stroke-width', 1.5);

    const barWidth = Math.max(16, plotW / xDomain.length * 0.48);
    topG.selectAll('rect.main-bar')
        .data(gapRows)
        .join('rect')
        .attr('class', 'main-bar validation-gap-bar')
        .attr('x', (d) => (xScale(d.year) ?? 0) - barWidth / 2)
        .attr('width', barWidth)
        .attr('y', (d) => d.value >= 0 ? topYScale(d.value) : zeroY)
        .attr('height', (d) => Math.abs(topYScale(d.value) - zeroY))
        .attr('fill', '#4f46e5')
        .attr('data-target', (d) => d.year)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.year)
        .attr('data-y-value', (d) => String(d.value));

    bottomG.append('g').attr('class', 'y-axis').call(d3.axisLeft(bottomYScale).ticks(5));
    const xAxis = bottomG.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${bottomH})`)
        .call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    const lineGen = d3.line().x((d) => xScale(d.target) ?? 0).y((d) => bottomYScale(d.yValue));
    seriesDomain.forEach((series) => {
        const points = allPoints.filter((d) => d.series === series);
        bottomG.append('path')
            .datum({ series, points })
            .attr('fill', 'none')
            .attr('stroke', resolveSeriesColor(seriesDomain, series))
            .attr('stroke-width', 2)
            .attr('data-series', series)
            .attr('d', (d) => lineGen(d.points));
        bottomG.selectAll(`circle[data-series="${series}"]`)
            .data(points)
            .join('circle')
            .attr('cx', (d) => xScale(d.target) ?? 0)
            .attr('cy', (d) => bottomYScale(d.yValue))
            .attr('r', 4)
            .attr('fill', resolveSeriesColor(seriesDomain, series))
            .attr('opacity', 0.85)
            .attr('data-target', (d) => d.target)
            .attr('data-series', (d) => d.series)
            .attr('data-value', (d) => String(d.yValue))
            .attr('data-x-value', (d) => d.target)
            .attr('data-y-value', (d) => String(d.yValue));
    });

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top + topH + panelGap})`);
    seriesDomain.forEach((series, index) => {
        const y = index * 30 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', resolveSeriesColor(seriesDomain, series));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 14).text(series);
    });
}

export function function1({ d3, container }) {
    renderLifeExpectancyCompositeChart({ d3, container });
}

export function function2({ d3, container }) {
    if (!container.querySelector('.validation-life-gap-panel')) {
        renderLifeExpectancyCompositeChart({ d3, container });
    }

    const targetYear = '2013';
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d.Year)))).sort((a, b) => Number(a) - Number(b));
    const width = 640;
    const height = 460;
    const margin = { top: 28, right: 16, bottom: 52, left: 56 };
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const topH = 108;
    const panelGap = 34;
    const bottomH = height - margin.top - margin.bottom - topH - panelGap;
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const step = plotW / Math.max(1, xDomain.length - 1);
    const bandWidth = step * 0.64;
    const x = margin.left + (xScale(targetYear) ?? 0) - bandWidth / 2;

    const svg = d3.select(container).select('svg');
    svg.selectAll('.validation-highlight-2013').remove();
    svg.insert('rect', ':first-child')
        .attr('class', 'validation-highlight-2013')
        .attr('x', x)
        .attr('y', margin.top)
        .attr('width', bandWidth)
        .attr('height', topH + panelGap + bottomH)
        .attr('fill', '#d1d5db')
        .attr('opacity', 0.42);
}

export function function3({ d3, container }) {}
