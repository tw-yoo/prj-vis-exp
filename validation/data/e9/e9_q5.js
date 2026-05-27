import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, Gender: 'Male', Population: 5268651 },
    { Year: 2009, Gender: 'Female', Population: 5484429 },
    { Year: 2010, Gender: 'Male', Population: 5312221 },
    { Year: 2010, Gender: 'Female', Population: 5527684 },
    { Year: 2011, Gender: 'Male', Population: 5370234 },
    { Year: 2011, Gender: 'Female', Population: 5581032 },
    { Year: 2012, Gender: 'Male', Population: 5413801 },
    { Year: 2012, Gender: 'Female', Population: 5622147 },
    { Year: 2013, Gender: 'Male', Population: 5448305 },
    { Year: 2013, Gender: 'Female', Population: 5676207 },
    { Year: 2014, Gender: 'Male', Population: 5474309 },
    { Year: 2014, Gender: 'Female', Population: 5716278 },
    { Year: 2015, Gender: 'Male', Population: 5506045 },
    { Year: 2015, Gender: 'Female', Population: 5730378 },
    { Year: 2016, Gender: 'Male', Population: 5537532 },
    { Year: 2016, Gender: 'Female', Population: 5757788 },
    { Year: 2017, Gender: 'Male', Population: 5565319 },
    { Year: 2017, Gender: 'Female', Population: 5778164 },
    { Year: 2018, Gender: 'Male', Population: 5597906 },
    { Year: 2018, Gender: 'Female', Population: 5800000 },
    { Year: 2019, Gender: 'Male', Population: 5630000 },
    { Year: 2019, Gender: 'Female', Population: 5820000 },
    { Year: 2020, Gender: 'Male', Population: 5660064 },
    { Year: 2020, Gender: 'Female', Population: 5832577 }
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
    const yField = 'Population';
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

function renderAveragePopulationBarChart({ d3, container, rows, averageLabel, sourceColor = '#60a5fa', averageColor = '#ef4444' }) {
    const xField = 'Year';
    const yField = 'Population';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    d3.select(container).selectAll('.validation-multi-line-tooltip').remove();

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    const margin = { top: 32, right: 32, bottom: 64, left: 72 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const averageValue = d3.mean(rows, (d) => Number(d[yField])) ?? 0;
    const chartRows = averageLabel
        ? [
            ...rows.map((d) => ({
                label: String(d[xField]),
                value: Number(d[yField]),
                type: 'source'
            })),
            {
                label: averageLabel,
                value: averageValue,
                type: 'average'
            }
        ]
        : rows.map((d, index) => ({
            label: String(d[xField]),
            value: Number(d[yField]),
            type: index === 0 ? 'source' : 'average'
        }));

    const xScale = d3.scaleBand()
        .domain(chartRows.map((d) => d.label))
        .range([0, plotW])
        .padding(0.28);

    const maxValue = d3.max(chartRows, (d) => d.value) ?? 1;

    const yScale = d3.scaleLinear()
        .domain([0, maxValue])
        .nice()
        .range([plotH, 0]);

    const baselineY = plotH;
    svg.selectAll('*').remove();

    const g = svg.append('g')
        .attr('class', 'validation-average-population-bar-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(6));

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
        .attr('y', -52)
        .attr('text-anchor', 'middle')
        .text(yField);

    g.selectAll('rect.main-bar')
        .data(chartRows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.label))
        .attr('width', xScale.bandwidth())
        .attr('fill', (d) => d.type === 'average' ? averageColor : sourceColor)
        .attr('opacity', 1)
        .attr('data-target', (d) => d.label)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.label)
        .attr('data-y-value', (d) => String(d.value))
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => Math.max(0, baselineY - yScale(d.value)));
}

export function function1({ d3, container }) {
    const rows = data_rows.filter((d) => (
        d.Gender === 'Male' &&
        Number(d.Year) >= 2009 &&
        Number(d.Year) <= 2011
    ));

    renderAveragePopulationBarChart({
        d3,
        container,
        rows,
        averageLabel: 'Male 2009–2011 average',
        sourceColor: '#60a5fa',
        averageColor: '#2563eb'
    });
}

export function function2({ d3, container }) {
    const rows = data_rows.filter((d) => (
        d.Gender === 'Female' &&
        Number(d.Year) >= 2018 &&
        Number(d.Year) <= 2020
    ));

    renderAveragePopulationBarChart({
        d3,
        container,
        rows,
        averageLabel: 'Female 2018–2020 average',
        sourceColor: '#fb7185',
        averageColor: '#e11d48'
    });
}

export function function3({ d3, container }) {
    const maleRows = data_rows.filter((d) => (
        d.Gender === 'Male' &&
        Number(d.Year) >= 2009 &&
        Number(d.Year) <= 2011
    ));

    const femaleRows = data_rows.filter((d) => (
        d.Gender === 'Female' &&
        Number(d.Year) >= 2018 &&
        Number(d.Year) <= 2020
    ));

    const maleAverage = d3.mean(maleRows, (d) => Number(d.Population)) ?? 0;
    const femaleAverage = d3.mean(femaleRows, (d) => Number(d.Population)) ?? 0;

    const comparisonRows = [
        { Year: 'Male average', Population: maleAverage },
        { Year: 'Female average', Population: femaleAverage }
    ];

    renderAveragePopulationBarChart({
        d3,
        container,
        rows: comparisonRows,
        averageLabel: null,
        sourceColor: '#2563eb',
        averageColor: '#e11d48'
    });
}
