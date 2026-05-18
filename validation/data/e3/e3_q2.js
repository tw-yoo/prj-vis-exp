import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2016, Country_Region: 'China', Revenue_Million_USD: 1471.18 },
    { Year: 2016, Country_Region: 'Malaysia', Revenue_Million_USD: 302.95 },
    { Year: 2016, Country_Region: 'Philippines', Revenue_Million_USD: 211.6 },
    { Year: 2016, Country_Region: 'Thailand', Revenue_Million_USD: 189.3 },
    { Year: 2016, Country_Region: 'United States', Revenue_Million_USD: 60.12 },
    { Year: 2016, Country_Region: 'Japan', Revenue_Million_USD: 0 },
    { Year: 2016, Country_Region: 'Others', Revenue_Million_USD: 367.34 },
    { Year: 2017, Country_Region: 'China', Revenue_Million_USD: 1224.03 },
    { Year: 2017, Country_Region: 'Malaysia', Revenue_Million_USD: 286.27 },
    { Year: 2017, Country_Region: 'Philippines', Revenue_Million_USD: 283.35 },
    { Year: 2017, Country_Region: 'Thailand', Revenue_Million_USD: 113.78 },
    { Year: 2017, Country_Region: 'United States', Revenue_Million_USD: 51.42 },
    { Year: 2017, Country_Region: 'Japan', Revenue_Million_USD: 0 },
    { Year: 2017, Country_Region: 'Others', Revenue_Million_USD: 342.15 },
    { Year: 2018, Country_Region: 'China', Revenue_Million_USD: 1205.2 },
    { Year: 2018, Country_Region: 'Malaysia', Revenue_Million_USD: 388.47 },
    { Year: 2018, Country_Region: 'Philippines', Revenue_Million_USD: 270.1 },
    { Year: 2018, Country_Region: 'Thailand', Revenue_Million_USD: 157.86 },
    { Year: 2018, Country_Region: 'United States', Revenue_Million_USD: 42.56 },
    { Year: 2018, Country_Region: 'Japan', Revenue_Million_USD: 0 },
    { Year: 2018, Country_Region: 'Others', Revenue_Million_USD: 365.18 },
    { Year: 2019, Country_Region: 'China', Revenue_Million_USD: 1189.93 },
    { Year: 2019, Country_Region: 'Malaysia', Revenue_Million_USD: 372.82 },
    { Year: 2019, Country_Region: 'Philippines', Revenue_Million_USD: 235.92 },
    { Year: 2019, Country_Region: 'Thailand', Revenue_Million_USD: 165.92 },
    { Year: 2019, Country_Region: 'United States', Revenue_Million_USD: 251.91 },
    { Year: 2019, Country_Region: 'Japan', Revenue_Million_USD: 162.77 },
    { Year: 2019, Country_Region: 'Others', Revenue_Million_USD: 486.53 },
    { Year: 2020, Country_Region: 'China', Revenue_Million_USD: 1071.03 },
    { Year: 2020, Country_Region: 'Malaysia', Revenue_Million_USD: 226.36 },
    { Year: 2020, Country_Region: 'Philippines', Revenue_Million_USD: 221.57 },
    { Year: 2020, Country_Region: 'Thailand', Revenue_Million_USD: 230.22 },
    { Year: 2020, Country_Region: 'United States', Revenue_Million_USD: 258.83 },
    { Year: 2020, Country_Region: 'Japan', Revenue_Million_USD: 162.4 },
    { Year: 2020, Country_Region: 'Others', Revenue_Million_USD: 528.77 },
    { Year: 2021, Country_Region: 'China', Revenue_Million_USD: 1268.82 },
    { Year: 2021, Country_Region: 'Malaysia', Revenue_Million_USD: 254.05 },
    { Year: 2021, Country_Region: 'Philippines', Revenue_Million_USD: 166.73 },
    { Year: 2021, Country_Region: 'Thailand', Revenue_Million_USD: 251.41 },
    { Year: 2021, Country_Region: 'United States', Revenue_Million_USD: 321.45 },
    { Year: 2021, Country_Region: 'Japan', Revenue_Million_USD: 142.55 },
    { Year: 2021, Country_Region: 'Others', Revenue_Million_USD: 563.88 }
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

export function renderValidationStackedBarChart({ container }) {
    const seriesKeys = ['desktop', 'mobile', 'tablet'];
    const seriesLabels = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' };
    const getSeriesColor = (key) => {
        const index = seriesKeys.indexOf(key);
        return WORKBENCH_PALETTE[index] ?? WORKBENCH_PALETTE[0];
    };

    injectStackedChartStyles();

    const data = data_rows;

    // Canvas / layout constants matching e10 stacked validation charts
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    // Build stacked segments using d3.stack (same logic as Workbench buildStackedSegments)
    const stackedData = d3.stack().keys(seriesKeys)(data);

    // Flatten to StackedSegment objects matching Workbench's data model:
    // { target, series, value, y0, y1 }
    const segments = [];
    stackedData.forEach((layer) => {
        layer.forEach((d) => {
            segments.push({
                target: d.data.year,
                series: layer.key,
                value: d.data[layer.key],
                y0: d[0],
                y1: d[1],
            });
        });
    });

    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const xDomain = data.map((d) => d.year);

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

    const legendRowH = 24;

    seriesKeys.forEach((key, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 8;

        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', getSeriesColor(key))
            .attr('opacity', 0.85);

        legend.append('text')
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

export function function1({ d3, container }) {}

export function function2({ d3, container }) {}

export function function3({ d3, container }) {}