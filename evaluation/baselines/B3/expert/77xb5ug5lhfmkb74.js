import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2011, Region: 'Germany', Number_of_Employees: 9846 },
    { Year: 2011, Region: 'Great Britain', Number_of_Employees: 18201 },
    { Year: 2011, Region: 'Spain', Number_of_Employees: 9892 },
    { Year: 2011, Region: 'Rest of Europe', Number_of_Employees: 21037 },
    { Year: 2011, Region: 'North and Sourth America', Number_of_Employees: 8149 },
    { Year: 2011, Region: 'Other regions', Number_of_Employees: 7082 },
    { Year: 2012, Region: 'Germany', Number_of_Employees: 9882 },
    { Year: 2012, Region: 'Great Britain', Number_of_Employees: 17318 },
    { Year: 2012, Region: 'Spain', Number_of_Employees: 9226 },
    { Year: 2012, Region: 'Rest of Europe', Number_of_Employees: 21310 },
    { Year: 2012, Region: 'North and Sourth America', Number_of_Employees: 8199 },
    { Year: 2012, Region: 'Other regions', Number_of_Employees: 7877 },
    { Year: 2013, Region: 'Germany', Number_of_Employees: 10157 },
    { Year: 2013, Region: 'Great Britain', Number_of_Employees: 17156 },
    { Year: 2013, Region: 'Spain', Number_of_Employees: 9395 },
    { Year: 2013, Region: 'Rest of Europe', Number_of_Employees: 20516 },
    { Year: 2013, Region: 'North and Sourth America', Number_of_Employees: 8361 },
    { Year: 2013, Region: 'Other regions', Number_of_Employees: 8860 },
    { Year: 2014, Region: 'Germany', Number_of_Employees: 9914 },
    { Year: 2014, Region: 'Great Britain', Number_of_Employees: 15972 },
    { Year: 2014, Region: 'Spain', Number_of_Employees: 10556 },
    { Year: 2014, Region: 'Rest of Europe', Number_of_Employees: 20391 },
    { Year: 2014, Region: 'North and Sourth America', Number_of_Employees: 8563 },
    { Year: 2014, Region: 'Other regions', Number_of_Employees: 11201 },
    { Year: 2015, Region: 'Germany', Number_of_Employees: 10047 },
    { Year: 2015, Region: 'Great Britain', Number_of_Employees: 13036 },
    { Year: 2015, Region: 'Spain', Number_of_Employees: 9115 },
    { Year: 2015, Region: 'Rest of Europe', Number_of_Employees: 19301 },
    { Year: 2015, Region: 'North and Sourth America', Number_of_Employees: 3428 },
    { Year: 2015, Region: 'Other regions', Number_of_Employees: 7922 },
    { Year: 2016, Region: 'Germany', Number_of_Employees: 10132 },
    { Year: 2016, Region: 'Great Britain', Number_of_Employees: 13409 },
    { Year: 2016, Region: 'Spain', Number_of_Employees: 8967 },
    { Year: 2016, Region: 'Rest of Europe', Number_of_Employees: 19933 },
    { Year: 2016, Region: 'North and Sourth America', Number_of_Employees: 3768 },
    { Year: 2016, Region: 'Other regions', Number_of_Employees: 7032 },
    { Year: 2017, Region: 'Germany', Number_of_Employees: 10274 },
    { Year: 2017, Region: 'Great Britain', Number_of_Employees: 13354 },
    { Year: 2017, Region: 'Spain', Number_of_Employees: 9607 },
    { Year: 2017, Region: 'Rest of Europe', Number_of_Employees: 20911 },
    { Year: 2017, Region: 'North and Sourth America', Number_of_Employees: 4535 },
    { Year: 2017, Region: 'Other regions', Number_of_Employees: 7896 },
    { Year: 2018, Region: 'Germany', Number_of_Employees: 10345 },
    { Year: 2018, Region: 'Great Britain', Number_of_Employees: 11770 },
    { Year: 2018, Region: 'Spain', Number_of_Employees: 9952 },
    { Year: 2018, Region: 'Rest of Europe', Number_of_Employees: 22594 },
    { Year: 2018, Region: 'North and Sourth America', Number_of_Employees: 5005 },
    { Year: 2018, Region: 'Other regions', Number_of_Employees: 9880 },
    { Year: 2019, Region: 'Germany', Number_of_Employees: 10419 },
    { Year: 2019, Region: 'Great Britain', Number_of_Employees: 11511 },
    { Year: 2019, Region: 'Spain', Number_of_Employees: 9399 },
    { Year: 2019, Region: 'Rest of Europe', Number_of_Employees: 16144 },
    { Year: 2019, Region: 'North and Sourth America', Number_of_Employees: 5371 },
    { Year: 2019, Region: 'Other regions', Number_of_Employees: 18629 },
    { Year: 2020, Region: 'Germany', Number_of_Employees: 8841 },
    { Year: 2020, Region: 'Great Britain', Number_of_Employees: 10478 },
    { Year: 2020, Region: 'Spain', Number_of_Employees: 5564 },
    { Year: 2020, Region: 'Rest of Europe', Number_of_Employees: 12028 },
    { Year: 2020, Region: 'North and Sourth America', Number_of_Employees: 3080 },
    { Year: 2020, Region: 'Other regions', Number_of_Employees: 8339 }
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

const E10_Q2_X_FIELD = 'Year';
const E10_Q2_SERIES_FIELD = 'Region';
const E10_Q2_Y_FIELD = 'Number_of_Employees';

function buildE10_Q2Segments() {
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[E10_Q2_X_FIELD]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[E10_Q2_SERIES_FIELD]))));
    const segments = [];
    xDomain.forEach((cat) => {
        let y0 = 0;
        seriesDomain.forEach((ser) => {
            const value = Number(
                data_rows.find((d) => String(d[E10_Q2_X_FIELD]) === cat && String(d[E10_Q2_SERIES_FIELD]) === ser)?.[E10_Q2_Y_FIELD] ?? 0,
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

    const { xDomain, seriesDomain, segments } = buildE10_Q2Segments();
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
            <span class="validation-stacked-chart-tooltip__label">${E10_Q2_X_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-x"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E10_Q2_SERIES_FIELD}</span>
            <span class="validation-stacked-chart-tooltip__value" id="stk-tt-s"></span>
        </div>
        <div class="validation-stacked-chart-tooltip__row">
            <span class="validation-stacked-chart-tooltip__label">${E10_Q2_Y_FIELD}</span>
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


function renderEmployeeStackedBarChart({ d3, container, rows, xDomain, seriesDomain, xLabel = 'Year' }) {
    const valueField = 'Number_of_Employees';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 56, left: 72 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const colorScale = d3.scaleOrdinal()
        .domain(seriesDomain)
        .range(WORKBENCH_PALETTE);
    const segmentRows = [];

    xDomain.forEach((target) => {
        let y0 = 0;
        seriesDomain.forEach((series) => {
            const value = rows
                .filter((row) => String(row.target) === String(target) && String(row.series) === String(series))
                .reduce((sum, row) => sum + Number(row[valueField]), 0);
            const y1 = y0 + value;
            segmentRows.push({ target: String(target), series: String(series), value, y0, y1 });
            y0 = y1;
        });
    });

    const maxY = d3.max(segmentRows, (d) => d.y1) ?? 0;
    const xScale = d3.scaleBand()
        .domain(xDomain.map(String))
        .range([0, plotW])
        .padding(0.24);
    const yScale = d3.scaleLinear()
        .domain([0, maxY])
        .nice()
        .range([plotH, 0]);

    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');
    const g = svg.append('g')
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
        .text(xLabel);

    g.selectAll('rect.main-bar')
        .data(segmentRows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.target))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.y1))
        .attr('height', (d) => Math.max(0, yScale(d.y0) - yScale(d.y1)))
        .attr('fill', (d) => colorScale(d.series))
        .attr('data-target', (d) => d.target)
        .attr('data-series', (d) => d.series)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.target)
        .attr('data-y-value', (d) => String(d.value))
        .attr('data-group-value', (d) => d.series);

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    seriesDomain.forEach((series, index) => {
        const y = index * 24 + 8;
        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', y)
            .attr('r', 5)
            .attr('fill', colorScale(series));
        legend.append('text')
            .attr('x', 20)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 11)
            .text(series);
    });
}

export function function1({ d3, container }) {
    const selectedYears = [2011, 2012, 2013, 2014];
    const selectedRegions = ['Germany', 'Great Britain', 'Spain', 'Rest of Europe'];
    const filteredRows = data_rows
        .filter((row) => selectedYears.includes(Number(row.Year)) && selectedRegions.includes(String(row.Region)))
        .map((row) => ({
            target: String(row.Year),
            series: String(row.Region),
            Number_of_Employees: Number(row.Number_of_Employees)
        }));

    renderEmployeeStackedBarChart({
        d3,
        container,
        rows: filteredRows,
        xDomain: selectedYears.map(String),
        seriesDomain: selectedRegions,
        xLabel: 'Year'
    });
}

export function function2({ d3, container }) {
    const selectedYears = [2011, 2012, 2013, 2014];
    const selectedRegions = ['Germany', 'Great Britain', 'Spain', 'Rest of Europe'];
    const yearlyTotals = selectedYears.map((year) => ({
        target: 'Europe before 2015',
        series: String(year),
        Number_of_Employees: data_rows
            .filter((row) => Number(row.Year) === year && selectedRegions.includes(String(row.Region)))
            .reduce((sum, row) => sum + Number(row.Number_of_Employees), 0)
    }));

    renderEmployeeStackedBarChart({
        d3,
        container,
        rows: yearlyTotals,
        xDomain: ['Europe before 2015'],
        seriesDomain: selectedYears.map(String),
        xLabel: 'Selected total'
    });
}

export function function3({ d3, container }) {}
