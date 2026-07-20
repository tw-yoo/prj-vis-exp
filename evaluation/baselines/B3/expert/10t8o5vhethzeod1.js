import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2009, Sector: 'Agriculture', Share_of_GDP: 0.3132 },
    { Year: 2009, Sector: 'Industry', Share_of_GDP: 0.1507 },
    { Year: 2009, Sector: 'Services', Share_of_GDP: 0.4861 },
    { Year: 2010, Sector: 'Agriculture', Share_of_GDP: 0.3318 },
    { Year: 2010, Sector: 'Industry', Share_of_GDP: 0.142 },
    { Year: 2010, Sector: 'Services', Share_of_GDP: 0.464 },
    { Year: 2011, Sector: 'Agriculture', Share_of_GDP: 0.3498 },
    { Year: 2011, Sector: 'Industry', Share_of_GDP: 0.1411 },
    { Year: 2011, Sector: 'Services', Share_of_GDP: 0.4529 },
    { Year: 2012, Sector: 'Agriculture', Share_of_GDP: 0.3315 },
    { Year: 2012, Sector: 'Industry', Share_of_GDP: 0.141 },
    { Year: 2012, Sector: 'Services', Share_of_GDP: 0.4687 },
    { Year: 2013, Sector: 'Agriculture', Share_of_GDP: 0.3153 },
    { Year: 2013, Sector: 'Industry', Share_of_GDP: 0.1415 },
    { Year: 2013, Sector: 'Services', Share_of_GDP: 0.4755 },
    { Year: 2014, Sector: 'Agriculture', Share_of_GDP: 0.3027 },
    { Year: 2014, Sector: 'Industry', Share_of_GDP: 0.1383 },
    { Year: 2014, Sector: 'Services', Share_of_GDP: 0.4865 },
    { Year: 2015, Sector: 'Agriculture', Share_of_GDP: 0.2938 },
    { Year: 2015, Sector: 'Industry', Share_of_GDP: 0.1372 },
    { Year: 2015, Sector: 'Services', Share_of_GDP: 0.4946 },
    { Year: 2016, Sector: 'Agriculture', Share_of_GDP: 0.2915 },
    { Year: 2016, Sector: 'Industry', Share_of_GDP: 0.131 },
    { Year: 2016, Sector: 'Services', Share_of_GDP: 0.4996 },
    { Year: 2017, Sector: 'Agriculture', Share_of_GDP: 0.2708 },
    { Year: 2017, Sector: 'Industry', Share_of_GDP: 0.1324 },
    { Year: 2017, Sector: 'Services', Share_of_GDP: 0.5102 },
    { Year: 2018, Sector: 'Agriculture', Share_of_GDP: 0.2576 },
    { Year: 2018, Sector: 'Industry', Share_of_GDP: 0.1341 },
    { Year: 2018, Sector: 'Services', Share_of_GDP: 0.51 },
    { Year: 2019, Sector: 'Agriculture', Share_of_GDP: 0.2426 },
    { Year: 2019, Sector: 'Industry', Share_of_GDP: 0.133 },
    { Year: 2019, Sector: 'Services', Share_of_GDP: 0.5061 }
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

const E7_Q2_X_FIELD = 'Year';
const E7_Q2_SERIES_FIELD = 'Sector';
const E7_Q2_Y_FIELD = 'Share_of_GDP';

function buildE7_Q2Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E7_Q2_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E7_Q2_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E7_Q2_X_FIELD]) === cat && String(d[E7_Q2_SERIES_FIELD]) === ser)?.[E7_Q2_Y_FIELD] ?? 0,
            );
            const y1 = y0 + value;
            segments.push({ target: cat, series: ser, value, y0, y1 });
            y0 = y1;
        });
    });
    return { xDomain, seriesDomain, segments };
}

export function renderValidationStackedBarChart({ container }) {
    if (container.querySelector('svg')) { return; }
    injectStackedChartStyles();

    const { xDomain, seriesDomain, segments } = buildE7_Q2Segments();
    const seriesLabels = Object.fromEntries(seriesDomain.map((s) => [s, s]));
    const getSeriesColor = (key) => {
        const index = seriesDomain.indexOf(String(key));
        return WORKBENCH_PALETTE[index >= 0 ? index % WORKBENCH_PALETTE.length : 0];
    };

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([plotH, 0]);

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

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
        .attr('data-target', (s) => s.target)
        .attr('data-value', (s) => s.value)
        .attr('data-series', (s) => s.series)
        .attr('data-x-value', (s) => s.target)
        .attr('data-y-value', (s) => String(s.value))
        .attr('data-group-value', (s) => s.series);

    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${legendX},${margin.top})`);
    const legendRowH = 22;
    seriesDomain.forEach((key, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 8;
        legend.append('circle').attr('cx', 8).attr('cy', cy).attr('r', 5).attr('fill', getSeriesColor(key)).attr('opacity', 0.85);
        legend.append('text').attr('x', 20).attr('y', cy).attr('font-size', 11).attr('dominant-baseline', 'middle').attr('font-family', 'sans-serif').attr('fill', '#000000').text(seriesLabels[key]);
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-stacked-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E7_Q2_X_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E7_Q2_SERIES_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E7_Q2_Y_FIELD}</span>
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


export function function1({ d3, container }) {
    // Blur-in-place (E7 feedback): keep the stacked chart, axes and legend
    // intact; just dim the non-Agriculture segments so the chart still reads
    // as "the same chart, different annotation".
    d3.select(container).selectAll('rect.main-bar')
        .attr('opacity', (s) => (s.series === 'Agriculture' ? 1 : 0.18));
}

export function function2({ d3, container }) {
    function1({ d3, container });

    // FLAW: claims 2012 (0.3315) is agriculture's peak — it is the third tallest,
    // just under the true max 2011 (0.3498), so the mistake is plausible.
    const target = d3.select(container).selectAll('rect.main-bar')
        .filter((s) => s.series === 'Agriculture' && String(s.target) === '2012');
    const node = target.node();
    if (!node) return;

    target.attr('fill', '#dc2626').attr('opacity', 1);

    const g = d3.select(node.parentNode);
    g.selectAll('.e7-q2-function2').remove();

    const x = Number(node.getAttribute('x'));
    const w = Number(node.getAttribute('width'));
    const y = Number(node.getAttribute('y'));

    g.append('text')
        .attr('class', 'e7-q2-function2')
        .attr('x', x + w / 2)
        .attr('y', y - 8)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 800)
        .attr('fill', '#dc2626')
        .text(target.datum().value.toFixed(4));
}

export function function3({ d3, container }) {}
