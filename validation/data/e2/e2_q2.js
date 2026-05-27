import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Period: 2014, Country: 'UK', Share_of_Import_Value: 0.084 },
    { Period: 2014, Country: 'US', Share_of_Import_Value: 0.15 },
    { Period: 2014, Country: 'France', Share_of_Import_Value: 0.368 },
    { Period: 2014, Country: 'South Korea', Share_of_Import_Value: 0.106 },
    { Period: 2014, Country: 'Japan', Share_of_Import_Value: 0.163 },
    { Period: 2015, Country: 'UK', Share_of_Import_Value: 0.061 },
    { Period: 2015, Country: 'US', Share_of_Import_Value: 0.111 },
    { Period: 2015, Country: 'France', Share_of_Import_Value: 0.285 },
    { Period: 2015, Country: 'South Korea', Share_of_Import_Value: 0.245 },
    { Period: 2015, Country: 'Japan', Share_of_Import_Value: 0.161 },
    { Period: 2016, Country: 'UK', Share_of_Import_Value: 0.068 },
    { Period: 2016, Country: 'US', Share_of_Import_Value: 0.099 },
    { Period: 2016, Country: 'France', Share_of_Import_Value: 0.251 },
    { Period: 2016, Country: 'South Korea', Share_of_Import_Value: 0.287 },
    { Period: 2016, Country: 'Japan', Share_of_Import_Value: 0.173 },
    { Period: 2017, Country: 'UK', Share_of_Import_Value: 0.05 },
    { Period: 2017, Country: 'US', Share_of_Import_Value: 0.098 },
    { Period: 2017, Country: 'France', Share_of_Import_Value: 0.21 },
    { Period: 2017, Country: 'South Korea', Share_of_Import_Value: 0.288 },
    { Period: 2017, Country: 'Japan', Share_of_Import_Value: 0.221 },
    { Period: 2018, Country: 'UK', Share_of_Import_Value: 0.047 },
    { Period: 2018, Country: 'US', Share_of_Import_Value: 0.093 },
    { Period: 2018, Country: 'France', Share_of_Import_Value: 0.177 },
    { Period: 2018, Country: 'South Korea', Share_of_Import_Value: 0.288 },
    { Period: 2018, Country: 'Japan', Share_of_Import_Value: 0.247 },
    { Period: 'Jan-Oct 2019', Country: 'UK', Share_of_Import_Value: 0.057 },
    { Period: 'Jan-Oct 2019', Country: 'US', Share_of_Import_Value: 0.097 },
    { Period: 'Jan-Oct 2019', Country: 'France', Share_of_Import_Value: 0.187 },
    { Period: 'Jan-Oct 2019', Country: 'South Korea', Share_of_Import_Value: 0.252 },
    { Period: 'Jan-Oct 2019', Country: 'Japan', Share_of_Import_Value: 0.255 }
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

const E2_Q2_X_FIELD = 'Period';
const E2_Q2_SERIES_FIELD = 'Country';
const E2_Q2_Y_FIELD = 'Share_of_Import_Value';

function buildE2Q2Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E2_Q2_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E2_Q2_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E2_Q2_X_FIELD]) === cat && String(d[E2_Q2_SERIES_FIELD]) === ser)?.[E2_Q2_Y_FIELD] ?? 0,
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

    const { xDomain, seriesDomain, segments } = buildE2Q2Segments();
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

function renderCountryComparisonChart({ d3, container, mode = 'stacked', highlightPeriod = null }) {
    // Smooth-transition implementation: instead of wiping the SVG and rebuilding
    // (the old rebuildSvgInPlace approach), we operate on the EXISTING bars from
    // the previous render (base or function1) and use D3's enter/update/exit
    // join with a stable key (`period|country`). Bars that remain across the
    // transition are kept in place and smoothly resize/reposition. Bars that
    // exit fade out; new bars fade in. Axes also transition.
    const selectedCountries = ['France', 'South Korea'];
    const periods = Array.from(new Set(data_rows.map((d) => String(d.Period))));
    const yField = 'Share_of_Import_Value';

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 56, left: 56 };
    const legendOffsetX = 48;
    const legendReserve = 180;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    const fullSeriesDomain = Array.from(new Set(data_rows.map((d) => String(d.Country))));
    const color = (country) => {
        const i = fullSeriesDomain.indexOf(String(country));
        return WORKBENCH_PALETTE[i >= 0 ? i % WORKBENCH_PALETTE.length : 0];
    };

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    // Locate the plot g (the one with translate). Handles both base structure
    // (`svg > g[transform]`) and any leftover modeswitch wrapper from previous
    // round's rebuildSvgInPlace runs (`svg > g.validation-modeswitch-e2q2 > g`).
    let g = svg.select('g.validation-modeswitch-e2q2');
    g = g.empty() ? svg.select('g') : g.select('g');
    if (g.empty()) return;

    container.classList.add('validation-stacked-chart-host');

    // Compute new bar segments (target/series/value/y0/y1) and y-scale max.
    const segments = [];
    if (mode === 'stacked') {
        periods.forEach((period) => {
            let y0 = 0;
            selectedCountries.forEach((country) => {
                const value = Number(
                    data_rows.find((d) => String(d.Period) === period && String(d.Country) === country)?.[yField] ?? 0,
                );
                const y1 = y0 + value;
                segments.push({ target: period, series: country, value, y0, y1 });
                y0 = y1;
            });
        });
    } else {
        // grouped — y0/y1 are unused but kept for shape parity.
        periods.forEach((period) => {
            selectedCountries.forEach((country) => {
                const value = Number(
                    data_rows.find((d) => String(d.Period) === period && String(d.Country) === country)?.[yField] ?? 0,
                );
                segments.push({ target: period, series: country, value, y0: 0, y1: value });
            });
        });
    }
    const maxY = mode === 'stacked'
        ? (d3.max(periods, (p) => d3.sum(segments.filter((s) => s.target === p), (s) => s.value)) ?? 0)
        : (d3.max(segments, (s) => s.value) ?? 0);

    const xScale = d3.scaleBand().domain(periods).range([0, plotW]).padding(0.22);
    const innerScale = mode === 'grouped'
        ? d3.scaleBand().domain(selectedCountries).range([0, xScale.bandwidth()]).padding(0.1)
        : null;
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);

    const duration = 700;

    // Smoothly transition axes.
    g.select('.y-axis').transition().duration(duration).call(d3.axisLeft(yScale).ticks(5));
    g.select('.x-axis').transition().duration(duration).call(d3.axisBottom(xScale));

    // Bar position/size functions per mode.
    const newX = (d) => mode === 'stacked'
        ? (xScale(d.target) ?? 0)
        : (xScale(d.target) ?? 0) + (innerScale(d.series) ?? 0);
    const newW = () => mode === 'stacked' ? xScale.bandwidth() : innerScale.bandwidth();
    const newY = (d) => mode === 'stacked' ? yScale(d.y1) : yScale(d.value);
    const newH = (d) => mode === 'stacked'
        ? Math.max(0, yScale(d.y0) - yScale(d.y1))
        : Math.max(0, plotH - yScale(d.value));

    // D3 join with `period|country` key so bars that exist on both sides
    // smoothly UPDATE; bars only on one side ENTER (fade in) or EXIT (fade out).
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
                .attr('fill', (d) => color(d.series))
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
                    .attr('fill', (d) => color(d.series))
                    .attr('opacity', 1)
                ),
            (exit) => exit
                .call((sel) => sel.transition().duration(Math.round(duration * 0.7))
                    .attr('opacity', 0)
                    .remove()
                ),
        );

    // Highlight period stroke (function3 path; usually no-op here).
    if (highlightPeriod) {
        g.selectAll('rect.main-bar')
            .filter(function () { return this.getAttribute('data-target') === highlightPeriod; })
            .transition()
            .duration(duration)
            .attr('stroke', '#111827')
            .attr('stroke-width', 2);
    }

    // Smooth-update the legend: keep matching country rows, fade out the rest.
    // Legend lives at the svg root (sibling of the plot g) — base render put it
    // there as `svg > g.color-legend`.
    let legend = svg.select('g.color-legend');
    if (legend.empty()) {
        legend = svg.append('g')
            .attr('class', 'color-legend')
            .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    }
    const legendRowH = 26;
    const seenCountries = new Set();
    // Existing entries: each <text> is a country label, paired with the
    // <circle> right before it. Identify by text content.
    legend.selectAll('text').nodes().forEach((textEl) => {
        const country = textEl.textContent;
        seenCountries.add(country);
        const circleEl = textEl.previousElementSibling;
        if (selectedCountries.includes(country)) {
            const newIndex = selectedCountries.indexOf(country);
            const newCy = newIndex * legendRowH + 10;
            d3.select(textEl).transition().duration(duration).attr('y', newCy).attr('opacity', 1);
            if (circleEl) {
                d3.select(circleEl).transition().duration(duration).attr('cy', newCy).attr('opacity', 0.85);
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
    // Add entries for selectedCountries not already in the legend.
    selectedCountries.forEach((country, index) => {
        if (seenCountries.has(country)) return;
        const y = index * legendRowH + 10;
        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', y)
            .attr('r', 5)
            .attr('fill', color(country))
            .attr('opacity', 0)
            .transition()
            .duration(duration)
            .attr('opacity', 0.85);
        legend.append('text')
            .attr('x', 20)
            .attr('y', y)
            .attr('font-size', 11)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('fill', '#000000')
            .attr('opacity', 0)
            .text(country)
            .transition()
            .duration(duration)
            .attr('opacity', 1);
    });
}

export function function1({ d3, container }) {
    renderCountryComparisonChart({ d3, container, mode: 'stacked' });
}

export function function2({ d3, container }) {
    renderCountryComparisonChart({ d3, container, mode: 'grouped' });
}

export function function3({ d3, container }) {
    // Per reviewer (review_e2.csv row 3): "차트가 새로 생기는 애니메이션은 전혀 필요하지 않음.
    // 그냥 해당 구간에만 하이라이트를 하면 됨" — overlay only, no rebuild.
    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    // Round 5 fix: after rebuildSvgInPlace refactor, the SVG structure is
    //   svg > g.validation-modeswitch-e2q2 > g[transform="translate(margin)"]
    // Before, it was just `svg > g[translate]`. We must drill into the INNER
    // plot g so the highlight rect we insert shares the bars' coordinate
    // system (which is translated by margin.left/top). Picking `svg.select('g')`
    // alone returns the modeswitch wrapper (no transform), placing the rect at
    // SVG x=0 — shifting the highlight left by margin.left from the bars.
    const modeWrapper = svg.select('g.validation-modeswitch-e2q2');
    const g = modeWrapper.empty() ? svg.select('g') : modeWrapper.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-country-highlight').remove();

    // Find the 2018 bars in the current grouped chart (drawn by f2) to compute the highlight x-band.
    const targetBars = g.selectAll('.main-bar')
        .filter(function () { return this.getAttribute('data-target') === '2018'; });
    if (targetBars.empty()) return;

    const xValues = targetBars.nodes().map((node) => Number(node.getAttribute('x')));
    const widths = targetBars.nodes().map((node) => Number(node.getAttribute('width')));
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues.map((x, idx) => x + widths[idx]));
    const yAxisPath = g.select('.y-axis path.domain').node();
    let plotH = 272;
    if (yAxisPath) {
        const d = yAxisPath.getAttribute('d') ?? '';
        const m = /M-6,(\d+(?:\.\d+)?)/.exec(d);
        if (m) plotH = Number(m[1]);
    }

    g.insert('rect', ':first-child')
        .attr('class', 'validation-country-highlight')
        .attr('x', minX - 8)
        .attr('y', 0)
        .attr('width', maxX - minX + 16)
        .attr('height', plotH)
        .attr('fill', '#fde68a')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.55);

    // Outline the 2018 bars to draw attention.
    targetBars
        .transition()
        .duration(600)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2);
}
