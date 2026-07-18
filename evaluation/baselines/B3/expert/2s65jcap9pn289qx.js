import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2010, Gender: 'Male', Population_Million_Inhabitants: 687.48 },
    { Year: 2010, Gender: 'Female', Population_Million_Inhabitants: 653.43 },
    { Year: 2011, Gender: 'Male', Population_Million_Inhabitants: 690.68 },
    { Year: 2011, Gender: 'Female', Population_Million_Inhabitants: 656.67 },
    { Year: 2012, Gender: 'Male', Population_Million_Inhabitants: 693.95 },
    { Year: 2012, Gender: 'Female', Population_Million_Inhabitants: 660.09 },
    { Year: 2013, Gender: 'Male', Population_Million_Inhabitants: 697.28 },
    { Year: 2013, Gender: 'Female', Population_Million_Inhabitants: 663.44 },
    { Year: 2014, Gender: 'Male', Population_Million_Inhabitants: 700.79 },
    { Year: 2014, Gender: 'Female', Population_Million_Inhabitants: 667.03 },
    { Year: 2015, Gender: 'Male', Population_Million_Inhabitants: 704.14 },
    { Year: 2015, Gender: 'Female', Population_Million_Inhabitants: 670.48 },
    { Year: 2016, Gender: 'Male', Population_Million_Inhabitants: 708.15 },
    { Year: 2016, Gender: 'Female', Population_Million_Inhabitants: 674.56 },
    { Year: 2017, Gender: 'Male', Population_Million_Inhabitants: 711.37 },
    { Year: 2017, Gender: 'Female', Population_Million_Inhabitants: 678.71 },
    { Year: 2018, Gender: 'Male', Population_Million_Inhabitants: 713.51 },
    { Year: 2018, Gender: 'Female', Population_Million_Inhabitants: 681.87 },
    { Year: 2019, Gender: 'Male', Population_Million_Inhabitants: 715.27 },
    { Year: 2019, Gender: 'Female', Population_Million_Inhabitants: 684.78 },
    { Year: 2020, Gender: 'Male', Population_Million_Inhabitants: 723.34 },
    { Year: 2020, Gender: 'Female', Population_Million_Inhabitants: 688.44 }
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
    const yField = 'Population_Million_Inhabitants';
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

function ensurePopulationArrowMarker({ d3, svg }) {
    const markerId = 'e6-q10-difference-arrow';
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
    return markerId;
}

function getPopulationDifferenceRows() {
    const csvYears = [2015, 2016, 2017, 2018, 2019, 2020];
    return csvYears.map((year) => {
        const female = Number(data_rows.find((d) => d.Year === year && d.Gender === 'Female')?.Population_Million_Inhabitants ?? 0);
        const male = Number(data_rows.find((d) => d.Year === year && d.Gender === 'Male')?.Population_Million_Inhabitants ?? 0);
        // Per reviewer: difference should be POSITIVE (absolute value), so the
        // bar chart in function2 goes upward and the per-year labels show
        // magnitude rather than sign. The original (female - male) is always
        // negative for this dataset (males > females), which is unintuitive.
        return {
            year: String(year),
            female,
            male,
            difference: Math.abs(male - female),
        };
    });
}

// Ours step 0: "Take the recent years as 2015 through 2020." — emphasize the
// six target-year points (full opacity/larger radius) and dim the rest.
export function function1({ d3, container }) {
    const differenceRows = getPopulationDifferenceRows();
    const targetYears = new Set(differenceRows.map((d) => d.year));

    d3.select(container).selectAll('circle[data-target]')
        .attr('opacity', (p) => (targetYears.has(String(p.target)) ? 1 : 0.28))
        .attr('r', (p) => (targetYears.has(String(p.target)) ? 5 : 4));
}

// Ours step 1: "Subtract the women's value from the men's value for each
// year." — draw the per-year Female↔Male double-arrow connector and its
// difference-value label for each of the six target years.
export function function3({ d3, container }) {
    const differenceRows = getPopulationDifferenceRows();
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const markerId = ensurePopulationArrowMarker({ d3, svg });

    g.selectAll('.e6-q10-function1').remove();

    differenceRows.forEach((row) => {
        const circles = d3.select(container).selectAll(`circle[data-target="${row.year}"]`).nodes();
        const femaleCircle = circles.find((node) => d3.select(node).datum().series === 'Female');
        const maleCircle = circles.find((node) => d3.select(node).datum().series === 'Male');
        if (!femaleCircle || !maleCircle) return;

        const female = d3.select(femaleCircle);
        const male = d3.select(maleCircle);
        const x = Number(female.attr('cx'));
        const femaleY = Number(female.attr('cy'));
        const maleY = Number(male.attr('cy'));

        g.append('line')
            .attr('class', 'e6-q10-function1')
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', femaleY)
            .attr('y2', maleY)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', 2)
            .attr('marker-start', `url(#${markerId})`)
            .attr('marker-end', `url(#${markerId})`);

        g.append('text')
            .attr('class', 'e6-q10-function1')
            .attr('x', x + 5)
            .attr('y', (femaleY + maleY) / 2)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 10)
            .attr('font-weight', 700)
            .attr('fill', '#dc2626')
            .text(row.difference.toFixed(2));
    });
}

export function function2({ d3, container }) {
    const differenceRows = getPopulationDifferenceRows();
    // Per reviewer: differences are now absolute (positive), so sum is positive.
    const sumOfDifferences = differenceRows.reduce((s, d) => s + d.difference, 0);
    const csvSumLabel = `The sum of differences is ${sumOfDifferences.toFixed(2)} million inhabitants`;
    const width = 640;
    const height = 360;
    // Reserve extra top margin (was 32) so the sum label sits ABOVE the bars
    // instead of overlapping them.
    const margin = { top: 56, right: 32, bottom: 54, left: 72 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    injectMultiLineStyles();

    container.classList.add('validation-multi-line-host');

    const xScale = d3.scaleBand()
        .domain(differenceRows.map((d) => d.year))
        .range([0, plotW])
        .padding(0.25);
    // Differences are positive now → y domain [0, max].
    const maxY = d3.max(differenceRows, (d) => d.difference) ?? 0;
    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);
    const zeroY = yScale(0);

    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}`, instant: true });
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${zeroY})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    g.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -plotH / 2)
        .attr('y', -52)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', '#111827')
        .text('Difference (Male - Female, million inhabitants)');

    // Bars: positive differences → from baseline (zeroY) UP to yScale(value).
    g.selectAll('rect.main-bar')
        .data(differenceRows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.year))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.difference))
        .attr('height', (d) => zeroY - yScale(d.difference))
        .attr('fill', '#dc2626')
        .attr('opacity', 1)
        .attr('data-target', (d) => d.year)
        .attr('data-value', (d) => String(d.difference));

    // Per-bar value labels: ABOVE each bar (y = yScale(value) - 6).
    g.selectAll('text.e6-q10-diff-label')
        .data(differenceRows)
        .join('text')
        .attr('class', 'e6-q10-diff-label')
        .attr('x', (d) => (xScale(d.year) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => yScale(d.difference) - 6)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text((d) => d.difference.toFixed(2));

    // Sum label: ABOVE the plot (negative y inside g translated by margin.top)
    // so it sits in the reserved top-margin area and doesn't overlap bars.
    g.append('text')
        .attr('class', 'e6-q10-sum-label')
        .attr('x', plotW / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .attr('font-size', 13)
        .attr('font-weight', 800)
        .attr('fill', '#111827')
        .text(csvSumLabel);
}
