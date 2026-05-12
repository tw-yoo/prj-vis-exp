import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Platform: 'YouTube', Gender: 'Male', 'Share of respondents': 0.95 },
    { Platform: 'YouTube', Gender: 'Female', 'Share of respondents': 0.92 },
    { Platform: 'Facebook', Gender: 'Male', 'Share of respondents': 0.7 },
    { Platform: 'Facebook', Gender: 'Female', 'Share of respondents': 0.78 },
    { Platform: 'Instagram', Gender: 'Male', 'Share of respondents': 0.69 },
    { Platform: 'Instagram', Gender: 'Female', 'Share of respondents': 0.79 },
    { Platform: 'Snapchat', Gender: 'Male', 'Share of respondents': 0.53 },
    { Platform: 'Snapchat', Gender: 'Female', 'Share of respondents': 0.64 },
    { Platform: 'Twitter', Gender: 'Male', 'Share of respondents': 0.5 },
    { Platform: 'Twitter', Gender: 'Female', 'Share of respondents': 0.42 },
    { Platform: 'Twitch', Gender: 'Male', 'Share of respondents': 0.43 },
    { Platform: 'Twitch', Gender: 'Female', 'Share of respondents': 0.12 },
    { Platform: 'TikTok', Gender: 'Male', 'Share of respondents': 0.21 },
    { Platform: 'TikTok', Gender: 'Female', 'Share of respondents': 0.23 }
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
    const xField = 'Platform';
    const seriesField = 'Gender';
    const yField = 'Share of respondents';

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

function getPlatformGenderPairs() {
    const platforms = Array.from(new Set(data_rows.map((d) => String(d.Platform))));
    return platforms.map((platform) => {
        const male = Number(data_rows.find((d) => d.Platform === platform && d.Gender === 'Male')?.['Share of respondents'] ?? 0);
        const female = Number(data_rows.find((d) => d.Platform === platform && d.Gender === 'Female')?.['Share of respondents'] ?? 0);
        return { platform, male, female };
    });
}

function highlightPlatformGroups(d3, container, selectedPlatforms) {
    const selected = new Set(selectedPlatforms);
    d3.select(container).selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('opacity', (d) => selected.has(String(d.category ?? d.Platform)) ? 1 : 0.22)
        .attr('fill', function (d) {
            if (selected.has(String(d.category ?? d.Platform))) return d3.select(this).attr('fill');
            return '#d1d5db';
        });

    d3.select(container).selectAll('.x-axis text')
        .transition()
        .duration(600)
        .attr('font-weight', function () {
            return selected.has(d3.select(this).text()) ? 800 : 400;
        })
        .attr('fill', function () {
            return selected.has(d3.select(this).text()) ? '#111827' : '#9ca3af';
        });
}

function renderPlatformAverageComparison({ d3, container, showDifference = false }) {
    const pairs = getPlatformGenderPairs();
    const g1 = pairs.filter((d) => d.male > d.female);
    const g2 = pairs.filter((d) => d.female > d.male);
    const g1Average = d3.mean(g1, (d) => d.male) ?? 0;
    const g2Average = d3.mean(g2, (d) => d.female) ?? 0;
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 76, bottom: 72, left: 56 };
    const panelGap = 44;
    const plotW = width - margin.left - margin.right;
    const panelW = (plotW - panelGap) / 2;
    const plotH = height - margin.top - margin.bottom;
    const yScale = d3.scaleLinear()
        .domain([0, d3.max([...g1.map((d) => d.male), ...g2.map((d) => d.female)]) ?? 0])
        .nice()
        .range([plotH, 0]);

    container.innerHTML = '';
    container.classList.add('validation-grouped-chart-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');

    [
        { label: 'G1 Male', rows: g1.map((d) => ({ platform: d.platform, value: d.male })), x: margin.left, average: g1Average, color: '#4f46e5' },
        { label: 'G2 Female', rows: g2.map((d) => ({ platform: d.platform, value: d.female })), x: margin.left + panelW + panelGap, average: g2Average, color: '#e11d48' }
    ].forEach((panel) => {
        const g = svg.append('g').attr('transform', `translate(${panel.x},${margin.top})`);
        const xScale = d3.scaleBand().domain(panel.rows.map((d) => d.platform)).range([0, panelW]).padding(0.2);

        g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
        const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
        autoRotateXAxisLabels(xAxis);
        g.append('text').attr('x', 0).attr('y', -10).attr('font-size', 13).attr('font-weight', 700).text(panel.label);

        g.selectAll('rect.main-bar')
            .data(panel.rows)
            .join('rect')
            .attr('class', 'main-bar')
            .attr('x', (d) => xScale(d.platform))
            .attr('width', xScale.bandwidth())
            .attr('y', plotH)
            .attr('height', 0)
            .attr('fill', panel.color)
            .transition()
            .duration(700)
            .attr('y', (d) => yScale(d.value))
            .attr('height', (d) => plotH - yScale(d.value));

        const avgY = yScale(panel.average);
        g.append('line')
            .attr('class', 'validation-average-line')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', avgY)
            .attr('y2', avgY)
            .attr('stroke', '#111827')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5 4')
            .transition()
            .duration(650)
            .attr('x2', panelW);
        g.append('text')
            .attr('x', panelW + 6)
            .attr('y', avgY)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .attr('opacity', 0)
            .text(panel.average.toFixed(3))
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });

    if (!showDifference) return;

    svg.select('defs#e2-q8-defs').remove();
    const defs = svg.append('defs').attr('id', 'e2-q8-defs');
    defs.append('marker')
        .attr('id', 'e2-q8-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    const arrowX = width - margin.right + 28;
    const y1 = margin.top + yScale(g1Average);
    const y2 = margin.top + yScale(g2Average);
    svg.append('line')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', y1)
        .attr('y2', y1)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q8-arrow)')
        .attr('marker-end', 'url(#e2-q8-arrow)')
        .transition()
        .duration(650)
        .attr('y2', y2);
    svg.append('text')
        .attr('x', arrowX + 8)
        .attr('y', (y1 + y2) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(Math.abs(g1Average - g2Average).toFixed(4))
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function1({ d3, container }) {
    highlightPlatformGroups(d3, container, ['YouTube', 'Twitter', 'Twitch']);
}

export function function2({ d3, container }) {
    highlightPlatformGroups(d3, container, ['Facebook', 'Instagram', 'Snapchat', 'TikTok']);
}

export function function3({ d3, container }) {
    renderPlatformAverageComparison({ d3, container, showDifference: false });
}

export function function4({ d3, container }) {
    renderPlatformAverageComparison({ d3, container, showDifference: true });
}
