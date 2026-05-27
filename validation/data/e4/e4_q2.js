import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Season: '2008/09', Revenue_Type: 'Matchday', Revenue_Million_Euros: 46.3 },
    { Season: '2008/09', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 52.6 },
    { Season: '2008/09', Revenue_Type: 'Commercial', Revenue_Million_Euros: 33.8 },
    { Season: '2009/10', Revenue_Type: 'Matchday', Revenue_Million_Euros: 44.9 },
    { Season: '2009/10', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 62.9 },
    { Season: '2009/10', Revenue_Type: 'Commercial', Revenue_Million_Euros: 38.5 },
    { Season: '2010/11', Revenue_Type: 'Matchday', Revenue_Million_Euros: 47.9 },
    { Season: '2010/11', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 92 },
    { Season: '2010/11', Revenue_Type: 'Commercial', Revenue_Million_Euros: 41.1 },
    { Season: '2011/12', Revenue_Type: 'Matchday', Revenue_Million_Euros: 50.8 },
    { Season: '2011/12', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 76.1 },
    { Season: '2011/12', Revenue_Type: 'Commercial', Revenue_Million_Euros: 51.3 },
    { Season: '2012/13', Revenue_Type: 'Matchday', Revenue_Million_Euros: 46.9 },
    { Season: '2012/13', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 72.7 },
    { Season: '2012/13', Revenue_Type: 'Commercial', Revenue_Million_Euros: 52.4 },
    { Season: '2013/14', Revenue_Type: 'Matchday', Revenue_Million_Euros: 52.5 },
    { Season: '2013/14', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 113.3 },
    { Season: '2013/14', Revenue_Type: 'Commercial', Revenue_Million_Euros: 50 },
    { Season: '2014/15', Revenue_Type: 'Matchday', Revenue_Million_Euros: 54.2 },
    { Season: '2014/15', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 125.2 },
    { Season: '2014/15', Revenue_Type: 'Commercial', Revenue_Million_Euros: 78.1 },
    { Season: '2015/16', Revenue_Type: 'Matchday', Revenue_Million_Euros: 54.6 },
    { Season: '2015/16', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 147.6 },
    { Season: '2015/16', Revenue_Type: 'Commercial', Revenue_Million_Euros: 77.5 },
    { Season: '2016/17', Revenue_Type: 'Matchday', Revenue_Million_Euros: 52.7 },
    { Season: '2016/17', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 219 },
    { Season: '2016/17', Revenue_Type: 'Commercial', Revenue_Million_Euros: 83.9 },
    { Season: '2017/18', Revenue_Type: 'Matchday', Revenue_Million_Euros: 85.2 },
    { Season: '2017/18', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 226.6 },
    { Season: '2017/18', Revenue_Type: 'Commercial', Revenue_Million_Euros: 116.5 },
    { Season: '2018/19', Revenue_Type: 'Matchday', Revenue_Million_Euros: 92.5 },
    { Season: '2018/19', Revenue_Type: 'Broadcasting', Revenue_Million_Euros: 276.7 },
    { Season: '2018/19', Revenue_Type: 'Commercial', Revenue_Million_Euros: 151.9 }
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

const E4_Q2_X_FIELD = 'Season';
const E4_Q2_SERIES_FIELD = 'Revenue_Type';
const E4_Q2_Y_FIELD = 'Revenue_Million_Euros';

function buildE4Q2Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E4_Q2_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E4_Q2_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E4_Q2_X_FIELD]) === cat && String(d[E4_Q2_SERIES_FIELD]) === ser)?.[E4_Q2_Y_FIELD] ?? 0,
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

    const { xDomain, seriesDomain, segments } = buildE4Q2Segments();
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

function getE4Q2Geometry(d3) {
    const { xDomain, seriesDomain, segments } = buildE4Q2Segments();
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const maxY = d3.max(segments, (s) => s.y1) ?? 0;
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);
    return { xDomain, seriesDomain, segments, plotW, plotH, xScale, yScale };
}

const E4_Q2_FOCUS = new Set(['Matchday', 'Commercial']);

function getE4Q2Gaps() {
    const years = Array.from(new Set(data_rows.map((d) => String(d[E4_Q2_X_FIELD]))));
    return years.map((year) => {
        const matchday = Number(data_rows.find((d) => String(d[E4_Q2_X_FIELD]) === year && d[E4_Q2_SERIES_FIELD] === 'Matchday')?.[E4_Q2_Y_FIELD] ?? 0);
        const commercial = Number(data_rows.find((d) => String(d[E4_Q2_X_FIELD]) === year && d[E4_Q2_SERIES_FIELD] === 'Commercial')?.[E4_Q2_Y_FIELD] ?? 0);
        return { year, matchday, commercial, gap: Math.abs(matchday - commercial) };
    });
}

export function function1({ d3, container }) {
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            return E4_Q2_FOCUS.has(this.getAttribute('data-series')) ? 1 : 0.18;
        });

    svg.selectAll('.validation-legend-swatch')
        .transition()
        .duration(600)
        .attr('opacity', function () {
            return E4_Q2_FOCUS.has(this.getAttribute('data-series')) ? 0.95 : 0.25;
        });
    svg.selectAll('.validation-legend-label')
        .transition()
        .duration(600)
        .attr('fill-opacity', function () {
            return E4_Q2_FOCUS.has(this.getAttribute('data-series')) ? 1 : 0.35;
        })
        .attr('font-weight', function () {
            return E4_Q2_FOCUS.has(this.getAttribute('data-series')) ? 700 : 400;
        });
}

export function function2({ d3, container }) {
    const { segments, xScale, yScale } = getE4Q2Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q2-gap-connector, .validation-q2-gap-label').remove();

    const gaps = getE4Q2Gaps();

    gaps.forEach(({ year, matchday, commercial, gap }) => {
        const matchSeg = segments.find((s) => s.target === year && s.series === 'Matchday');
        const commSeg = segments.find((s) => s.target === year && s.series === 'Commercial');
        if (!matchSeg || !commSeg) return;
        const cx = (xScale(year) ?? 0) + xScale.bandwidth() / 2;
        const yMatchTop = yScale(matchSeg.y1);
        const yCommTop = yScale(commSeg.y1);
        g.append('line')
            .attr('class', 'validation-q2-gap-connector')
            .attr('data-year', year)
            .attr('x1', cx)
            .attr('x2', cx)
            .attr('y1', yMatchTop)
            .attr('y2', yMatchTop)
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '3 3')
            .transition()
            .duration(600)
            .attr('y2', yCommTop);

        g.append('text')
            .attr('class', 'validation-q2-gap-label')
            .attr('data-year', year)
            .attr('x', cx)
            .attr('y', Math.min(yMatchTop, yCommTop) - 6)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#374151')
            .attr('opacity', 0)
            .text(`Δ${gap.toFixed(0)}`)
            .transition()
            .duration(600)
            .attr('opacity', 1);
    });
}

export function function3({ d3, container }) {
    const { plotH, plotW, xScale } = getE4Q2Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q2-max-rect, .validation-q2-summary').remove();

    const best = getE4Q2Gaps().reduce((b, row) => row.gap > b.gap ? row : b, { gap: -Infinity });

    g.insert('rect', ':first-child')
        .attr('class', 'validation-q2-max-rect')
        .attr('x', (xScale(best.year) ?? 0) - 6)
        .attr('y', 0)
        .attr('width', xScale.bandwidth() + 12)
        .attr('height', plotH)
        .attr('fill', '#fde68a')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.55);

    g.selectAll('.validation-q2-gap-connector')
        .filter(function () { return this.getAttribute('data-year') === best.year; })
        .transition()
        .duration(600)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', null);

    g.selectAll('.validation-q2-gap-label')
        .filter(function () { return this.getAttribute('data-year') === best.year; })
        .transition()
        .duration(600)
        .attr('fill', '#ef4444')
        .attr('font-size', 13);

    // Theme D (#12 round 3): move summary to top-center, above the chart.
    g.append('text')
        .attr('class', 'validation-q2-summary')
        .attr('x', plotW / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`biggest gap → ${best.year} (Δ ${best.gap.toFixed(1)} M€)`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}