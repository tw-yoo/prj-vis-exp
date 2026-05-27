import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Race: 'White', 'Discussion Frequency': 'Almost all of the time', Percentage: 10 },
    { Race: 'White', 'Discussion Frequency': 'Most of the time', Percentage: 32 },
    { Race: 'White', 'Discussion Frequency': 'Sometimes', Percentage: 48 },
    { Race: 'White', 'Discussion Frequency': 'Hardly ever/Never', Percentage: 10 },
    { Race: 'Hispanic', 'Discussion Frequency': 'Almost all of the time', Percentage: 19 },
    { Race: 'Hispanic', 'Discussion Frequency': 'Most of the time', Percentage: 27 },
    { Race: 'Hispanic', 'Discussion Frequency': 'Sometimes', Percentage: 39 },
    { Race: 'Hispanic', 'Discussion Frequency': 'Hardly ever/Never', Percentage: 15 },
    { Race: 'Black', 'Discussion Frequency': 'Almost all of the time', Percentage: 26 },
    { Race: 'Black', 'Discussion Frequency': 'Most of the time', Percentage: 27 },
    { Race: 'Black', 'Discussion Frequency': 'Sometimes', Percentage: 38 },
    { Race: 'Black', 'Discussion Frequency': 'Hardly ever/Never', Percentage: 9 }
];

// Workbench default category color palette (DEFAULT_CATEGORY_COLORS)
const WORKBENCH_PALETTE = ['#4f46e5', '#14b8a6', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9', '#16a34a', '#f59e0b'];

function injectStackedChartStyles() {
    if (document.getElementById('validation-stacked-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-stacked-chart-styles';
    style.textContent = `
        .validation-stacked-chart-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-stacked-chart-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-stacked-chart-host .x-axis line,
        .validation-stacked-chart-host .x-axis path,
        .validation-stacked-chart-host .y-axis line,
        .validation-stacked-chart-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-stacked-chart-host .x-axis text,
        .validation-stacked-chart-host .y-axis text,
        .validation-stacked-chart-host .x-axis-label,
        .validation-stacked-chart-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-stacked-chart-host .main-bar {
            cursor: pointer;
        }
        .validation-stacked-chart-host .color-legend text {
            fill: #000000;
            font-family: sans-serif;
        }
        .validation-stacked-chart-tooltip {
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
        .validation-stacked-chart-tooltip[hidden] { display: none; }
        .validation-stacked-chart-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-stacked-chart-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-stacked-chart-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

const E2_Q7_X_FIELD = 'Race';
const E2_Q7_SERIES_FIELD = 'Discussion Frequency';
const E2_Q7_Y_FIELD = 'Percentage';

function buildE2Q7Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E2_Q7_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E2_Q7_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E2_Q7_X_FIELD]) === cat && String(d[E2_Q7_SERIES_FIELD]) === ser)?.[E2_Q7_Y_FIELD] ?? 0,
            );
            const y1 = y0 + value;
            segments.push({ target: cat, series: ser, value, y0, y1 });
            y0 = y1;
        });
    });
    return { xDomain, seriesDomain, segments };
}

export function renderValidationStackedBarChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    injectStackedChartStyles();

    const { xDomain, seriesDomain, segments } = buildE2Q7Segments();
    const seriesLabels = Object.fromEntries(seriesDomain.map((s) => [s, s]));
    const getSeriesColor = (key) => {
        const index = seriesDomain.indexOf(String(key));
        return WORKBENCH_PALETTE[index >= 0 ? index % WORKBENCH_PALETTE.length : 0];
    };

    // Canvas / layout constants matching e10 stacked validation charts
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xScale = d3.scaleBand()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.2);

    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);

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

    // Stacked bars — class "main-bar" matches Workbench
    g.selectAll('rect.main-bar')
        .data(segments)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (s) => xScale(s.target))
        .attr('width', xScale.bandwidth())
        .attr('y', (s) => yScale(Math.max(s.y0, s.y1)))
        .attr('height', (s) => Math.abs(yScale(s.y0) - yScale(s.y1)))
        .attr('fill', (s) => getSeriesColor(s.series))
        .attr('opacity', 1)
        // Workbench data attributes
        .attr('data-target', (s) => s.target)
        .attr('data-value', (s) => s.value)
        .attr('data-series', (s) => s.series)
        .attr('data-x-value', (s) => s.target)
        .attr('data-y-value', (s) => String(s.value))
        .attr('data-group-value', (s) => s.series);

    // Color legend
    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${legendX},${margin.top})`);

    const legendRowH = 22;

    seriesDomain.forEach((key, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 8;

        legend.append('circle')
            .attr('class', 'validation-legend-swatch')
            .attr('data-series', key)
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', getSeriesColor(key))
            .attr('opacity', 0.85);

        legend.append('text')
            .attr('class', 'validation-legend-label')
            .attr('data-series', key)
            .attr('x', 20)
            .attr('y', cy)
            .attr('font-size', 11)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('fill', '#000000')
            .text(seriesLabels[key]);
    });

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-stacked-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">year</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">series</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">value</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, s) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#stk-tt-x').textContent = s.target;
            tooltip.querySelector('#stk-tt-s').textContent = seriesLabels[s.series] ?? s.series;
            tooltip.querySelector('#stk-tt-y').textContent = String(s.value);
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

function getRaceDiscussionRows() {
    const selectedRaces = ['White', 'Black'];
    const selectedFrequencies = ['Almost all of the time', 'Most of the time'];
    return data_rows.filter((d) => (
        selectedRaces.includes(String(d.Race)) &&
        selectedFrequencies.includes(String(d['Discussion Frequency']))
    ));
}

const E2_Q7_FOCUS_FREQS = new Set(['Almost all of the time', 'Most of the time']);

function getE2Q7FocusTotals() {
    const races = ['White', 'Black'];
    return races.map((race) => {
        const total = data_rows
            .filter((d) => d.Race === race && E2_Q7_FOCUS_FREQS.has(String(d['Discussion Frequency'])))
            .reduce((s, d) => s + Number(d.Percentage), 0);
        return { race, total };
    });
}

function renderRaceDiscussionStackedChart({ d3, container }) {
    // Smooth-transition implementation: subset BOTH x-axis (3 races → 2 races:
    // White, Black) AND series (4 frequencies → 2 focus frequencies). Bars
    // matching the new `race|frequency` key smoothly UPDATE their y0/y1 in the
    // new yScale; exiting bars (Hispanic; Sometimes; Hardly ever/Never) fade
    // out. The legend also smoothly transitions from right-vertical layout to
    // top-horizontal layout — surviving items move to their new positions,
    // exiting items fade out.
    const races = ['White', 'Black'];
    const frequencies = ['Almost all of the time', 'Most of the time'];
    // Per reviewer (round-2 row 3 / system-wide R7): each frequency must keep
    // the color the BASE render assigned to it. Look up indices in the FULL
    // seriesDomain (all 4 frequencies from data_rows).
    const fullSeriesDomain = Array.from(new Set(data_rows.map((d) => String(d['Discussion Frequency']))));
    const baseColor = (frequency) => {
        const i = fullSeriesDomain.indexOf(String(frequency));
        return WORKBENCH_PALETTE[i >= 0 ? i % WORKBENCH_PALETTE.length : 0];
    };

    const width = 640;
    const height = 360;
    // Per reviewer: legend goes ABOVE the chart (horizontal layout); top margin
    // reserved for legend row, right margin shrunk because no side legend.
    const margin = { top: 64, right: 32, bottom: 56, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Build new segments (only White/Black × Almost all + Most of the time)
    const segments = [];
    races.forEach((race) => {
        let y0 = 0;
        frequencies.forEach((frequency) => {
            const value = data_rows.find((d) => d.Race === race && d['Discussion Frequency'] === frequency)?.Percentage ?? 0;
            const y1 = y0 + Number(value);
            segments.push({ target: race, series: frequency, value: Number(value), y0, y1 });
            y0 = y1;
        });
    });

    const totals = races.map((race) => ({
        race,
        total: d3.sum(segments.filter((d) => d.target === race), (d) => d.value),
    }));
    const xScale = d3.scaleBand().domain(races).range([0, plotW]).padding(0.34);
    const yScale = d3.scaleLinear().domain([0, d3.max(totals, (d) => d.total) ?? 0]).nice().range([plotH, 0]);

    container.classList.add('validation-stacked-chart-host');

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    // Locate the plot g (handle base + previous-round modeswitch wrapper).
    let g = svg.select('g.validation-modeswitch-e2q7');
    g = g.empty() ? svg.select('g') : g.select('g');
    if (g.empty()) return;

    const duration = 700;

    // Smoothly transition axes.
    g.select('.y-axis').transition().duration(duration).call(d3.axisLeft(yScale).ticks(5));
    g.select('.x-axis').transition().duration(duration).call(d3.axisBottom(xScale));

    const newX = (d) => xScale(d.target) ?? 0;
    const newW = () => xScale.bandwidth();
    const newY = (d) => yScale(d.y1);
    const newH = (d) => Math.max(0, yScale(d.y0) - yScale(d.y1));

    // D3 join with `race|frequency` key — bars existing on both sides smoothly
    // UPDATE; bars only on one side ENTER (fade in) or EXIT (fade out).
    const keyFn = function (d) {
        if (d && d.target != null) return `${d.target}|${d.series}`;
        return `${this.getAttribute('data-target')}|${this.getAttribute('data-series')}`;
    };

    g.selectAll('rect.main-bar')
        .data(segments, keyFn)
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

    // Smooth-update the legend: move from right (vertical) to top (horizontal).
    // Surviving items (Almost all of the time, Most of the time) reposition;
    // exiting items (Sometimes, Hardly ever/Never) fade out.
    const legendItemSpacing = 180;
    const legendY = margin.top - 26;
    const legendStartX = margin.left;
    let legend = svg.select('g.color-legend');
    if (legend.empty()) {
        legend = svg.append('g')
            .attr('class', 'color-legend')
            .attr('transform', `translate(${legendStartX},${legendY})`);
    } else {
        // Transition the legend container to its new (top) position.
        legend.transition().duration(duration).attr('transform', `translate(${legendStartX},${legendY})`);
    }

    const seenFrequencies = new Set();
    legend.selectAll('text').nodes().forEach((textEl) => {
        const frequency = textEl.textContent;
        seenFrequencies.add(frequency);
        const circleEl = textEl.previousElementSibling;
        if (frequencies.includes(frequency)) {
            const newIndex = frequencies.indexOf(frequency);
            const newCx = newIndex * legendItemSpacing + 6;
            const newTextX = newIndex * legendItemSpacing + 18;
            d3.select(textEl).transition().duration(duration)
                .attr('x', newTextX)
                .attr('y', 6)
                .attr('opacity', 1);
            if (circleEl) {
                d3.select(circleEl).transition().duration(duration)
                    .attr('cx', newCx)
                    .attr('cy', 6)
                    .attr('opacity', 1);
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
    frequencies.forEach((frequency, index) => {
        if (seenFrequencies.has(frequency)) return;
        const x = index * legendItemSpacing;
        legend.append('circle')
            .attr('cx', x + 6)
            .attr('cy', 6)
            .attr('r', 5)
            .attr('fill', baseColor(frequency))
            .attr('opacity', 0)
            .transition()
            .duration(duration)
            .attr('opacity', 1);
        legend.append('text')
            .attr('x', x + 18)
            .attr('y', 6)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 11)
            .attr('fill', '#111827')
            .attr('opacity', 0)
            .text(frequency)
            .transition()
            .duration(duration)
            .attr('opacity', 1);
    });
}

export function function1({ d3, container }) {
    renderRaceDiscussionStackedChart({ d3, container });
}

export function function2({ d3, container }) {
    // Per reviewer (review_e2.csv row 11): annotation-only — no rebuild, no grow animation.
    // Add the two total-tick dashed lines + bidirectional Δ arrow on top of f1's existing bars.
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    // Round 5 fix: after rebuildSvgInPlace, the structure is
    //   svg > g.validation-modeswitch-e2q7 > g[transform="translate(margin)"]
    // We must drill into the INNER plot g so annotations share the bars'
    // coordinate system (bar.x/y attributes are relative to the inner plot g).
    const modeWrapper = svg.select('g.validation-modeswitch-e2q7');
    const g = modeWrapper.empty() ? svg.select('g') : modeWrapper.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-total-line, .validation-difference-arrow, .validation-difference-label').remove();
    svg.select('defs#e2-q7-defs').remove();

    // Reconstruct the geometry from existing bar attributes so we don't recompute scales differently.
    // Keep these in sync with renderRaceDiscussionStackedChart (function1) — legend was
    // moved ABOVE the chart, so right margin shrank from 92 to 32 and top from 32 to 64.
    const width = 640;
    const margin = { top: 64, right: 32, bottom: 56, left: 56 };
    const plotW = width - margin.left - margin.right;

    const totals = getE2Q7FocusTotals();
    // Find each race's total y by summing existing bar heights for that race.
    const totalY = {};
    ['White', 'Black'].forEach((race) => {
        const bars = g.selectAll('.main-bar').filter(function () { return this.getAttribute('data-target') === race; });
        const tops = bars.nodes().map((node) => Number(node.getAttribute('y')));
        totalY[race] = tops.length ? Math.min(...tops) : 0;
    });
    const xByRace = {};
    ['White', 'Black'].forEach((race) => {
        const bar = g.selectAll('.main-bar').filter(function () { return this.getAttribute('data-target') === race; }).node();
        if (bar) {
            xByRace[race] = Number(bar.getAttribute('x')) + Number(bar.getAttribute('width'));
        }
    });

    const defs = svg.append('defs').attr('id', 'e2-q7-defs');
    defs.append('marker')
        .attr('id', 'e2-q7-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    ['White', 'Black'].forEach((race) => {
        g.append('line')
            .attr('class', 'validation-total-line')
            .attr('data-race', race)
            .attr('x1', xByRace[race])
            .attr('x2', xByRace[race])
            .attr('y1', totalY[race])
            .attr('y2', totalY[race])
            .attr('stroke', '#111827')
            .attr('stroke-width', 1.6)
            .attr('stroke-dasharray', '5 4')
            .transition()
            .duration(650)
            .attr('x2', plotW);
    });

    const arrowX = plotW + 26;
    g.append('line')
        .attr('class', 'validation-difference-arrow')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', totalY.White)
        .attr('y2', totalY.White)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q7-arrow)')
        .attr('marker-end', 'url(#e2-q7-arrow)')
        .transition()
        .duration(650)
        .attr('y2', totalY.Black);

    g.append('text')
        .attr('class', 'validation-difference-label')
        .attr('x', arrowX + 8)
        .attr('y', (totalY.White + totalY.Black) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(Math.abs((totals.find((t) => t.race === 'Black')?.total ?? 0) - (totals.find((t) => t.race === 'White')?.total ?? 0)).toString())
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function3({ d3, container }) {}
