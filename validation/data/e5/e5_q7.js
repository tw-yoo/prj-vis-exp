import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2010, Sector: 'Agriculture', Share_of_Total_Employment: 0.1422 },
    { Year: 2010, Sector: 'Industry', Share_of_Total_Employment: 0.2774 },
    { Year: 2010, Sector: 'Services', Share_of_Total_Employment: 0.5804 },
    { Year: 2011, Sector: 'Agriculture', Share_of_Total_Employment: 0.1362 },
    { Year: 2011, Sector: 'Industry', Share_of_Total_Employment: 0.2909 },
    { Year: 2011, Sector: 'Services', Share_of_Total_Employment: 0.594 },
    { Year: 2012, Sector: 'Agriculture', Share_of_Total_Employment: 0.127 },
    { Year: 2012, Sector: 'Industry', Share_of_Total_Employment: 0.2857 },
    { Year: 2012, Sector: 'Services', Share_of_Total_Employment: 0.5873 },
    { Year: 2013, Sector: 'Agriculture', Share_of_Total_Employment: 0.1299 },
    { Year: 2013, Sector: 'Industry', Share_of_Total_Employment: 0.2836 },
    { Year: 2013, Sector: 'Services', Share_of_Total_Employment: 0.5865 },
    { Year: 2014, Sector: 'Agriculture', Share_of_Total_Employment: 0.1223 },
    { Year: 2014, Sector: 'Industry', Share_of_Total_Employment: 0.2802 },
    { Year: 2014, Sector: 'Services', Share_of_Total_Employment: 0.5975 },
    { Year: 2015, Sector: 'Agriculture', Share_of_Total_Employment: 0.1247 },
    { Year: 2015, Sector: 'Industry', Share_of_Total_Employment: 0.2752 },
    { Year: 2015, Sector: 'Services', Share_of_Total_Employment: 0.6001 },
    { Year: 2016, Sector: 'Agriculture', Share_of_Total_Employment: 0.1137 },
    { Year: 2016, Sector: 'Industry', Share_of_Total_Employment: 0.2749 },
    { Year: 2016, Sector: 'Services', Share_of_Total_Employment: 0.6114 },
    { Year: 2017, Sector: 'Agriculture', Share_of_Total_Employment: 0.1099 },
    { Year: 2017, Sector: 'Industry', Share_of_Total_Employment: 0.274 },
    { Year: 2017, Sector: 'Services', Share_of_Total_Employment: 0.6161 },
    { Year: 2018, Sector: 'Agriculture', Share_of_Total_Employment: 0.1067 },
    { Year: 2018, Sector: 'Industry', Share_of_Total_Employment: 0.2715 },
    { Year: 2018, Sector: 'Services', Share_of_Total_Employment: 0.6218 },
    { Year: 2019, Sector: 'Agriculture', Share_of_Total_Employment: 0.1036 },
    { Year: 2019, Sector: 'Industry', Share_of_Total_Employment: 0.27 },
    { Year: 2019, Sector: 'Services', Share_of_Total_Employment: 0.6264 },
    { Year: 2020, Sector: 'Agriculture', Share_of_Total_Employment: 0.1009 },
    { Year: 2020, Sector: 'Industry', Share_of_Total_Employment: 0.2683 },
    { Year: 2020, Sector: 'Services', Share_of_Total_Employment: 0.6308 }
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

function renderServicesComparisonChart({ d3, container, showDifference = false }) {
    const csvValues = [
        { label: 'Services 2010', value: 0.5804 },
        { label: 'Services 2020', value: 0.6308 },
    ];
    const csvDifference = 0.0504;

    injectStackedChartStyles();
    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 92, bottom: 56, left: 64 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const xScale = d3.scaleBand()
        .domain(csvValues.map((d) => d.label))
        .range([0, plotW])
        .padding(0.35);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(csvValues, (d) => d.value) ?? 1])
        .nice()
        .range([plotH, 0]);

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(csvValues)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.label))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', '#4f46e5')
        .attr('data-target', (d) => d.label)
        .attr('data-value', (d) => String(d.value))
        .attr('data-x-value', (d) => d.label)
        .attr('data-y-value', (d) => String(d.value));

    g.selectAll('text.e5-q7-value-label')
        .data(csvValues)
        .join('text')
        .attr('class', 'e5-q7-value-label')
        .attr('x', (d) => (xScale(d.label) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => yScale(d.value) - 8)
        .attr('text-anchor', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text((d) => d.value.toFixed(4));

    if (!showDifference) return;

    const markerId = 'e5-q7-arrow-marker';
    const defs = svg.append('defs');
    defs.append('marker')
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

    const values = csvValues.map((d) => d.value);
    values.forEach((value) => {
        const y = yScale(value);
        g.append('line')
            .attr('class', 'e5-q7-difference-line')
            .attr('x1', 0)
            .attr('x2', plotW)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5 4');
    });

    const arrowX = plotW + 36;
    const [lowValue, highValue] = values.slice().sort((a, b) => a - b);
    const lowY = yScale(lowValue);
    const highY = yScale(highValue);

    g.append('line')
        .attr('class', 'e5-q7-difference-arrow')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', highY)
        .attr('y2', lowY)
        .attr('stroke', '#dc2626')
        .attr('stroke-width', 2)
        .attr('marker-start', `url(#${markerId})`)
        .attr('marker-end', `url(#${markerId})`);

    g.append('text')
        .attr('class', 'e5-q7-difference-label')
        .attr('x', arrowX + 10)
        .attr('y', (highY + lowY) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#dc2626')
        .text(csvDifference.toFixed(4));
}

export function function1({ d3, container }) {
    renderServicesComparisonChart({ d3, container });
}

export function function2({ d3, container }) {
    renderServicesComparisonChart({ d3, container, showDifference: true });
}

export function function3({ d3, container }) {}
