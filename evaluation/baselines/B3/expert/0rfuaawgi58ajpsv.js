import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, Region: 'North America', 'Media rights revenue in billion US dollars': 8.61 },
    { Year: 2009, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 9.95 },
    { Year: 2009, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 3.53 },
    { Year: 2009, Region: 'Latin America', 'Media rights revenue in billion US dollars': 0.99 },
    { Year: 2010, Region: 'North America', 'Media rights revenue in billion US dollars': 9.74 },
    { Year: 2010, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 12.37 },
    { Year: 2010, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 3.93 },
    { Year: 2010, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.17 },
    { Year: 2011, Region: 'North America', 'Media rights revenue in billion US dollars': 9.3 },
    { Year: 2011, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 10.68 },
    { Year: 2011, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 3.73 },
    { Year: 2011, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.14 },
    { Year: 2012, Region: 'North America', 'Media rights revenue in billion US dollars': 10.66 },
    { Year: 2012, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 13.46 },
    { Year: 2012, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 4.06 },
    { Year: 2012, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.21 },
    { Year: 2013, Region: 'North America', 'Media rights revenue in billion US dollars': 9.58 },
    { Year: 2013, Region: 'Europe, Middle East and Africa', 'Media rights revenue in billion US dollars': 11.85 },
    { Year: 2013, Region: 'Asia Pacific', 'Media rights revenue in billion US dollars': 4.01 },
    { Year: 2013, Region: 'Latin America', 'Media rights revenue in billion US dollars': 1.27 }
];

// Workbench default category color palette (DEFAULT_CATEGORY_COLORS)
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];

function resolveSeriesColor(seriesDomain, key) {
    const index = seriesDomain.indexOf(String(key));
    return WORKBENCH_PALETTE[index >= 0 ? index % WORKBENCH_PALETTE.length : 0];
}

function injectGroupedChartStyles() {
    if (document.getElementById('validation-grouped-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-grouped-chart-styles';
    style.textContent = `
        .validation-grouped-chart-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-grouped-chart-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-grouped-chart-host .x-axis line,
        .validation-grouped-chart-host .x-axis path,
        .validation-grouped-chart-host .y-axis line,
        .validation-grouped-chart-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-grouped-chart-host .x-axis text,
        .validation-grouped-chart-host .y-axis text,
        .validation-grouped-chart-host .x-axis-label,
        .validation-grouped-chart-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-grouped-chart-host .main-bar {
            cursor: pointer;
        }
        .validation-grouped-chart-host .color-legend text {
            fill: #000000;
            font-family: sans-serif;
        }
        .validation-grouped-chart-tooltip {
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
        .validation-grouped-chart-tooltip[hidden] { display: none; }
        .validation-grouped-chart-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-grouped-chart-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-grouped-chart-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationGroupedBarChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    const xField = 'Year';
    const seriesField = 'Region';
    const yField = 'Media rights revenue in billion US dollars';

    injectGroupedChartStyles();

    const data = data_rows;

    // Derive domains from data — no hardcoded variable names
    const xDomain = Array.from(new Set(data.map((d) => String(d[xField]))));
    const seriesDomain = Array.from(new Set(data.map((d) => String(d[seriesField]))));

    // Aggregate rows into GroupedBarPoint objects matching Workbench's data model:
    // { category, series, value, rows }
    const aggregated = [];
    xDomain.forEach((cat) => {
        seriesDomain.forEach((ser) => {
            const rows = data.filter((d) => String(d[xField]) === cat && String(d[seriesField]) === ser);
            if (!rows.length) return;
            const value = rows.reduce((sum, d) => sum + Number(d[yField]), 0);
            aggregated.push({ category: cat, series: ser, value, rows });
        });
    });

    const maxY = Math.max(0, ...aggregated.map((d) => d.value));

    // Canvas / layout constants matching Workbench defaults (with legend)
    // legendReserve = legendWidth(136) + legendOffsetX(64) = 200
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    // Outer scale (categories), inner scale (series) — same padding as Workbench
    const xScale = d3.scaleBand()
        .domain(xDomain)
        .range([0, plotW])
        .paddingInner(0.18)
        .paddingOuter(0.08);

    const innerScale = d3.scaleBand()
        .domain(seriesDomain)
        .range([0, Math.max(xScale.bandwidth(), 1)])
        .padding(0.08);

    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);

    const zeroY = yScale(0);

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-grouped-chart-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Y axis
    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    // X axis
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    // Grouped bars — class "main-bar" matches Workbench
    g.selectAll('rect.main-bar')
        .data(aggregated)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (datum) => (xScale(datum.category) ?? 0) + (innerScale(datum.series) ?? 0))
        .attr('width', innerScale.bandwidth())
        .attr('y', (datum) => (datum.value >= 0 ? yScale(datum.value) : zeroY))
        .attr('height', (datum) => Math.abs(yScale(datum.value) - zeroY))
        .attr('fill', (datum) => resolveSeriesColor(seriesDomain, datum.series))
        .attr('opacity', 1)
        // Workbench data attributes
        .attr('data-target', (datum) => String(datum.category))
        .attr('data-value', (datum) => datum.value)
        .attr('data-series', (datum) => String(datum.series))
        .attr('data-x-value', (datum) => String(datum.category))
        .attr('data-y-value', (datum) => String(datum.value))
        .attr('data-group-value', (datum) => String(datum.series));

    // Color legend — matches Workbench renderColorLegend (circles, not rects)
    // legendLabel=20, rowGap=10 → each row height = 30; circle cy = rowY + 10
    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${legendX},${margin.top})`);

    const legendRowH = 30; // legendLabel(20) + rowGap(10)

    seriesDomain.forEach((ser, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 10; // legendLabel / 2

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
    tooltip.className = 'validation-grouped-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${xField}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-x"></span>
        </div>
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${seriesField}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-s"></span>
        </div>
        <div class="validation-grouped-chart-tooltip__row">
            <span class="validation-grouped-chart-tooltip__label">${yField}</span>
            <span class="validation-grouped-chart-tooltip__value" id="grp-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, datum) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#grp-tt-x').textContent = String(datum.category);
            tooltip.querySelector('#grp-tt-s').textContent = String(datum.series);
            tooltip.querySelector('#grp-tt-y').textContent = String(datum.value);
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

function getRegionRows() {
    const selectedRegions = ['North America', 'Latin America'];
    return data_rows.filter((d) => selectedRegions.includes(String(d.Region)));
}

function renderSelectedRegionGroupedChart({ d3, container, rows }) {
    // Smooth-transition implementation: instead of wiping the SVG and rebuilding,
    // operate on the EXISTING bars from the base render. D3's enter/update/exit
    // join with a stable key (`year|region`) keeps surviving bars in place and
    // smoothly resizes/repositions them. Exiting bars (the 2 non-selected
    // regions: Europe..., Asia Pacific) fade out. Axes also transition.
    const selectedRegions = ['North America', 'Latin America'];
    const xDomain = Array.from(new Set(rows.map((d) => String(d.Year))));
    const seriesDomain = Array.from(new Set(rows.map((d) => String(d.Region))));
    // Per reviewer (round-2 row 3): each region must keep the color the BASE render assigned to it.
    // Look up indices in the FULL seriesDomain (all 4 regions from data_rows).
    const fullSeriesDomain = Array.from(new Set(data_rows.map((d) => String(d.Region))));
    const baseColor = (region) => resolveSeriesColor(fullSeriesDomain, region);
    const yField = 'Media rights revenue in billion US dollars';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 56, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).paddingInner(0.18).paddingOuter(0.08);
    const innerScale = d3.scaleBand().domain(seriesDomain).range([0, xScale.bandwidth()]).padding(0.08);
    const yScale = d3.scaleLinear().domain([0, d3.max(rows, (d) => Number(d[yField])) ?? 0]).nice().range([plotH, 0]);

    container.classList.add('validation-grouped-chart-host');

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    // Locate the plot g — handle both base structure (`svg > g[translate]`) and
    // any leftover modeswitch wrapper from a previous round's rebuildSvgInPlace
    // run (`svg > g.validation-modeswitch-e2q3a > g`).
    let g = svg.select('g.validation-modeswitch-e2q3a');
    g = g.empty() ? svg.select('g') : g.select('g');
    if (g.empty()) return;

    const duration = 700;

    // Smoothly transition axes. The x-axis transform must follow plotH because
    // this helper uses margin.bottom=56 (plotH=272) while the base render uses
    // margin.bottom=48 (plotH=280); without the transform update the x-axis
    // stays at the original plotH while the bars settle at the new (smaller)
    // plotH, opening a gap between bar bottoms and the x-axis line.
    g.select('.y-axis').transition().duration(duration).call(d3.axisLeft(yScale).ticks(5));
    g.select('.x-axis').transition().duration(duration)
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    // Build the new data set (only selected regions)
    const newData = rows.map((d) => ({
        target: String(d.Year),
        series: String(d.Region),
        value: Number(d[yField]),
    }));

    const newX = (d) => (xScale(d.target) ?? 0) + (innerScale(d.series) ?? 0);
    const newW = () => innerScale.bandwidth();
    const newY = (d) => yScale(d.value);
    const newH = (d) => Math.max(0, plotH - yScale(d.value));

    // D3 join with `year|region` key so bars that exist on both sides smoothly
    // UPDATE; bars only on one side ENTER (fade in) or EXIT (fade out).
    const keyFn = function (d) {
        if (d && d.target != null) return `${d.target}|${d.series}`;
        return `${this.getAttribute('data-target')}|${this.getAttribute('data-series')}`;
    };

    g.selectAll('rect.main-bar')
        .data(newData, keyFn)
        .join(
            (enter) => enter.append('rect')
                .attr('class', 'main-bar')
                .attr('x', newX)
                .attr('width', newW)
                .attr('y', newY)
                .attr('height', newH)
                .attr('fill', (d) => baseColor(d.series))
                .attr('opacity', 0)
                .attr('data-target', (d) => d.target)
                .attr('data-series', (d) => d.series)
                .attr('data-value', (d) => d.value)
                .call((sel) => sel.transition().duration(duration).attr('opacity', 1)),
            (update) => update
                .call((sel) => sel.transition().duration(duration)
                    .attr('x', newX)
                    .attr('width', newW)
                    .attr('y', newY)
                    .attr('height', newH)
                    .attr('fill', (d) => baseColor(d.series))
                    .attr('opacity', 1)
                ),
            (exit) => exit
                .call((sel) => sel.transition().duration(Math.round(duration * 0.7))
                    .attr('opacity', 0)
                    .remove()
                ),
        );

    // Smooth-update the legend: keep matching region rows, fade out the rest.
    // Legend lives at the svg root level (sibling of plot g).
    let legend = svg.select('g.color-legend');
    if (legend.empty()) {
        legend = svg.append('g')
            .attr('class', 'color-legend')
            .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    }
    const legendRowH = 30;
    const seenRegions = new Set();
    legend.selectAll('text').nodes().forEach((textEl) => {
        const region = textEl.textContent;
        seenRegions.add(region);
        const circleEl = textEl.previousElementSibling;
        if (selectedRegions.includes(region)) {
            const newIndex = selectedRegions.indexOf(region);
            const newY = newIndex * legendRowH + 10;
            d3.select(textEl).transition().duration(duration).attr('y', newY).attr('opacity', 1);
            if (circleEl) {
                d3.select(circleEl).transition().duration(duration).attr('cy', newY).attr('opacity', 1);
            }
        } else {
            d3.select(textEl).transition().duration(Math.round(duration * 0.7))
                .attr('opacity', 0)
                .on('end', function () { this.remove(); });
            if (circleEl) {
                d3.select(circleEl).transition().duration(Math.round(duration * 0.7))
                    .attr('opacity', 0)
                    .on('end', function () { this.remove(); });
            }
        }
    });
    selectedRegions.forEach((region, index) => {
        if (seenRegions.has(region)) return;
        const y = index * legendRowH + 10;
        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', y)
            .attr('r', 5)
            .attr('fill', baseColor(region))
            .attr('opacity', 0)
            .transition()
            .duration(duration)
            .attr('opacity', 1);
        legend.append('text')
            .attr('x', 20)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 14)
            .attr('opacity', 0)
            .text(region)
            .transition()
            .duration(duration)
            .attr('opacity', 1);
    });
}

function renderRegionAverageComparison({ d3, container }) {
    // Left–right (side-by-side) dual panels per reviewer (review_e2.csv row 4).
    const rows = getRegionRows();
    const regions = ['North America', 'Latin America'];
    // Per reviewer (round-2 row 3): preserve base palette colors.
    const fullSeriesDomain = Array.from(new Set(data_rows.map((d) => String(d.Region))));
    const baseColor = (region) => resolveSeriesColor(fullSeriesDomain, region);
    const years = Array.from(new Set(rows.map((d) => String(d.Year))));
    const yField = 'Media rights revenue in billion US dollars';
    const averages = regions.map((region) => ({
        region,
        average: d3.mean(rows.filter((d) => d.Region === region), (d) => Number(d[yField])) ?? 0
    }));
    const width = 720;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 56, left: 56 };
    const panelGap = 96; // room between the two panels for the Δ arrow
    const plotH = height - margin.top - margin.bottom;
    const innerWidth = width - margin.left - margin.right - panelGap;
    const panelW = innerWidth / 2;
    const xScale = d3.scaleBand().domain(years).range([0, panelW]).padding(0.18);
    const yScale = d3.scaleLinear().domain([0, d3.max(rows, (d) => Number(d[yField])) ?? 0]).nice().range([plotH, 0]);

    container.classList.add('validation-grouped-chart-host');

    rebuildSvgInPlace({
        d3,
        container,
        viewBox: `0 0 ${width} ${height}`,
        build: (svg) => buildRegionAverageComparison({ d3, svg, regions, rows, baseColor, averages, yField, margin, panelW, panelGap, plotH, xScale, yScale, width }),
    });
}

function buildRegionAverageComparison({ d3, svg, regions, rows, baseColor, averages, yField, margin, panelW, panelGap, plotH, xScale, yScale, width }) {
    const root = svg.append('g')
        .attr('class', 'validation-modeswitch-e2q3b')
        .attr('opacity', 0);

    // Animation sequence per reviewer (e2_feedback round-4 row 3):
    //   Stage 1 (0–400ms):  show two panels (bars fade in)
    //   Stage 2 (500–1100): both average lines draw simultaneously
    //   Stage 3 (1200–):    difference vertical arrow connects them
    const PANEL_BARS_DURATION = 400;
    const AVG_LINE_DELAY = 500;
    const AVG_LINE_DURATION = 600;
    const DIFF_ARROW_DELAY = AVG_LINE_DELAY + AVG_LINE_DURATION + 100;
    const DIFF_ARROW_DURATION = 700;

    regions.forEach((region, panelIndex) => {
        const panelX = margin.left + panelIndex * (panelW + panelGap);
        const g = root.append('g').attr('transform', `translate(${panelX},${margin.top})`);
        const regionRows = rows.filter((d) => d.Region === region);
        const average = averages.find((d) => d.region === region)?.average ?? 0;

        g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
        const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
        autoRotateXAxisLabels(xAxis);
        g.append('text')
            .attr('x', 0)
            .attr('y', -10)
            .attr('font-family', 'sans-serif')
            .attr('font-size', 13)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .text(region);

        // Stage 1: bars fade in.
        g.selectAll('rect.main-bar')
            .data(regionRows)
            .join('rect')
            .attr('class', 'main-bar')
            .attr('x', (d) => xScale(String(d.Year)))
            .attr('width', xScale.bandwidth())
            .attr('y', (d) => yScale(Number(d[yField])))
            .attr('height', (d) => plotH - yScale(Number(d[yField])))
            .attr('fill', baseColor(region))
            .attr('data-target', (d) => String(d.Year))
            .attr('data-series', region)
            .attr('data-value', (d) => Number(d[yField]))
            .attr('opacity', 0)
            .transition()
            .duration(PANEL_BARS_DURATION)
            .attr('opacity', 1);

        // Stage 2: average lines (both panels start simultaneously via shared delay).
        g.append('line')
            .attr('class', 'validation-average-line')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', yScale(average))
            .attr('y2', yScale(average))
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5 4')
            .attr('opacity', 0)
            .transition()
            .delay(AVG_LINE_DELAY)
            .duration(0)
            .attr('opacity', 1)
            .transition()
            .duration(AVG_LINE_DURATION)
            .attr('x2', panelW);
        g.append('text')
            .attr('x', panelW - 4)
            .attr('y', yScale(average) - 6)
            .attr('text-anchor', 'end')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', '#ef4444')
            .attr('opacity', 0)
            .text(`avg ${average.toFixed(2)}`)
            .transition()
            .delay(AVG_LINE_DELAY + AVG_LINE_DURATION - 200)
            .duration(300)
            .attr('opacity', 1);
    });

    // Per reviewer (round-2 row 4): the Δ arrow must be VERTICAL — connecting the
    // two panels' avg-line y-positions directly (panels share yScale so the y
    // distance equals the average difference visually).
    const defs = svg.append('defs');
    defs.append('marker')
        .attr('id', 'e2-q3-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    const xLeftEnd = margin.left + panelW;
    const xRightStart = margin.left + panelW + panelGap;
    const xArrow = (xLeftEnd + xRightStart) / 2;
    const yNA = margin.top + yScale(averages[0].average);
    const yLA = margin.top + yScale(averages[1].average);

    // Stage 3: dashed horizontal connectors + vertical Δ arrow + label
    // (all delayed until after average lines have drawn — sequential reveal).
    root.append('line')
        .attr('x1', xLeftEnd)
        .attr('x2', xLeftEnd)
        .attr('y1', yNA)
        .attr('y2', yNA)
        .attr('stroke', '#ef4444')
        .attr('stroke-dasharray', '3 3')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0)
        .transition()
        .delay(DIFF_ARROW_DELAY)
        .duration(0)
        .attr('opacity', 1)
        .transition()
        .duration(DIFF_ARROW_DURATION * 0.4)
        .attr('x2', xArrow);
    root.append('line')
        .attr('x1', xRightStart)
        .attr('x2', xRightStart)
        .attr('y1', yLA)
        .attr('y2', yLA)
        .attr('stroke', '#ef4444')
        .attr('stroke-dasharray', '3 3')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0)
        .transition()
        .delay(DIFF_ARROW_DELAY)
        .duration(0)
        .attr('opacity', 1)
        .transition()
        .duration(DIFF_ARROW_DURATION * 0.4)
        .attr('x2', xArrow);

    // The Δ vertical arrow — draws AFTER the connectors land.
    root.append('line')
        .attr('x1', xArrow)
        .attr('x2', xArrow)
        .attr('y1', yNA)
        .attr('y2', yNA)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q3-arrow)')
        .attr('marker-end', 'url(#e2-q3-arrow)')
        .attr('opacity', 0)
        .transition()
        .delay(DIFF_ARROW_DELAY + DIFF_ARROW_DURATION * 0.4)
        .duration(0)
        .attr('opacity', 1)
        .transition()
        .duration(DIFF_ARROW_DURATION * 0.6)
        .attr('y2', yLA);

    root.append('text')
        .attr('x', xArrow + 8)
        .attr('y', (yNA + yLA) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`Δ ${(averages[0].average - averages[1].average).toFixed(2)}`)
        .transition()
        .delay(DIFF_ARROW_DELAY + DIFF_ARROW_DURATION - 200)
        .duration(400)
        .attr('opacity', 1);

    return root;
}

export function function1({ d3, container }) {
    renderSelectedRegionGroupedChart({ d3, container, rows: getRegionRows() });
}

export function function2({ d3, container }) {
    renderRegionAverageComparison({ d3, container });
}

export function function3({ d3, container }) {}
