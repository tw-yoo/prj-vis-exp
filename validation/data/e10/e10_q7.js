import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Country: 'United States', 'Car Type': 'Gasoline or diesel (ICE)', 'Share of respondents': 74 },
    { Country: 'United States', 'Car Type': 'Hybrid electric (HEV)', 'Share of respondents': 16 },
    { Country: 'United States', 'Car Type': 'Battery electric (BEV)', 'Share of respondents': 5 },
    { Country: 'United States', 'Car Type': 'Other', 'Share of respondents': 5 },
    { Country: 'India', 'Car Type': 'Gasoline or diesel (ICE)', 'Share of respondents': 68 },
    { Country: 'India', 'Car Type': 'Hybrid electric (HEV)', 'Share of respondents': 24 },
    { Country: 'India', 'Car Type': 'Battery electric (BEV)', 'Share of respondents': 4 },
    { Country: 'India', 'Car Type': 'Other', 'Share of respondents': 4 },
    { Country: 'Germany', 'Car Type': 'Gasoline or diesel (ICE)', 'Share of respondents': 59 },
    { Country: 'Germany', 'Car Type': 'Hybrid electric (HEV)', 'Share of respondents': 25 },
    { Country: 'Germany', 'Car Type': 'Battery electric (BEV)', 'Share of respondents': 7 },
    { Country: 'Germany', 'Car Type': 'Other', 'Share of respondents': 9 },
    { Country: 'China', 'Car Type': 'Gasoline or diesel (ICE)', 'Share of respondents': 55 },
    { Country: 'China', 'Car Type': 'Hybrid electric (HEV)', 'Share of respondents': 29 },
    { Country: 'China', 'Car Type': 'Battery electric (BEV)', 'Share of respondents': 11 },
    { Country: 'China', 'Car Type': 'Other', 'Share of respondents': 5 },
    { Country: 'Japan', 'Car Type': 'Gasoline or diesel (ICE)', 'Share of respondents': 45 },
    { Country: 'Japan', 'Car Type': 'Hybrid electric (HEV)', 'Share of respondents': 45 },
    { Country: 'Japan', 'Car Type': 'Battery electric (BEV)', 'Share of respondents': 7 },
    { Country: 'Japan', 'Car Type': 'Other', 'Share of respondents': 3 },
    { Country: 'South Korea', 'Car Type': 'Gasoline or diesel (ICE)', 'Share of respondents': 43 },
    { Country: 'South Korea', 'Car Type': 'Hybrid electric (HEV)', 'Share of respondents': 35 },
    { Country: 'South Korea', 'Car Type': 'Battery electric (BEV)', 'Share of respondents': 11 },
    { Country: 'South Korea', 'Car Type': 'Other', 'Share of respondents': 11 }
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
    const xField = 'Country';
    const seriesField = 'Car Type';
    const yField = 'Share of respondents';

    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[xField]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[seriesField]))));

    const getSeriesColor = (ser) => {
        const index = seriesDomain.indexOf(ser);
        return WORKBENCH_PALETTE[index >= 0 ? index % WORKBENCH_PALETTE.length : 0];
    };

    injectStackedChartStyles();

    // Convert long format → wide format for d3.stack
    const wideData = xDomain.map((cat) => {
        const row = { [xField]: cat };
        seriesDomain.forEach((ser) => {
            const match = data_rows.find((d) => String(d[xField]) === cat && String(d[seriesField]) === ser);
            row[ser] = match ? Number(match[yField]) : 0;
        });
        return row;
    });

    const stackedData = d3.stack().keys(seriesDomain)(wideData);

    // Flatten to { target, series, value, y0, y1 }
    const segments = [];
    stackedData.forEach((layer) => {
        layer.forEach((d) => {
            segments.push({
                target: d.data[xField],
                series: layer.key,
                value: d.data[layer.key],
                y0: d[0],
                y1: d[1],
            });
        });
    });

    const maxY = d3.max(segments, (s) => s.y1) ?? 0;

    // Canvas / layout constants matching Workbench defaults
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

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

    seriesDomain.forEach((ser, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 8;

        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', getSeriesColor(ser))
            .attr('opacity', 0.85);

        legend.append('text')
            .attr('x', 20)
            .attr('y', cy)
            .attr('font-size', 11)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('fill', '#000000')
            .text(ser);
    });

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-stacked-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${xField}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${seriesField}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${yField}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, s) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#stk-tt-x').textContent = s.target;
            tooltip.querySelector('#stk-tt-s').textContent = s.series;
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

function renderIceSimpleBarChart({ d3, container, rows, averageLabel = null }) {
    const xField = 'Country';
    const yField = 'Share of respondents';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    d3.select(container).selectAll('.validation-stacked-chart-tooltip').remove();

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    const margin = { top: 32, right: 32, bottom: 64, left: 56 };
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
        : rows.map((d) => ({
            label: String(d[xField]),
            value: Number(d[yField]),
            type: d.type ?? 'source'
        }));

    const xScale = d3.scaleBand()
        .domain(chartRows.map((d) => d.label))
        .range([0, plotW])
        .padding(0.28);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(chartRows, (d) => d.value) ?? 0])
        .nice()
        .range([plotH, 0]);
    svg.selectAll('*').remove();

    const g = svg.append('g')
        .attr('class', 'validation-simple-ice-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(5));

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
        .attr('y', -42)
        .attr('text-anchor', 'middle')
        .text(yField);

    g.selectAll('rect.main-bar')
        .data(chartRows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.label))
        .attr('width', xScale.bandwidth())
        .attr('y', plotH)
        .attr('height', 0)
        .attr('fill', (d) => d.type === 'average' ? '#1d4ed8' : '#60a5fa')
        .attr('data-target', (d) => d.label)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.label)
        .attr('data-y-value', (d) => String(d.value))
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value));
}

function getIceRows(countries) {
    const countrySet = new Set(countries);
    return data_rows.filter((d) => (
        countrySet.has(String(d.Country)) &&
        String(d['Car Type']) === 'Gasoline or diesel (ICE)'
    ));
}

export function function1({ d3, container }) {
    const restCountries = ['United States', 'India', 'China', 'Japan', 'South Korea'];

    renderIceSimpleBarChart({
        d3,
        container,
        rows: getIceRows(restCountries),
        averageLabel: 'Average'
    });
}

export function function2({ d3, container }) {
    const germanyRow = getIceRows(['Germany'])[0];
    const averageRow = {
        Country: 'Average',
        'Share of respondents': 57,
        type: 'average'
    };

    renderIceSimpleBarChart({
        d3,
        container,
        rows: [
            {
                Country: 'Germany',
                'Share of respondents': Number(germanyRow?.['Share of respondents'] ?? 59),
                type: 'source'
            },
            averageRow
        ],
        averageLabel: null
    });
}
