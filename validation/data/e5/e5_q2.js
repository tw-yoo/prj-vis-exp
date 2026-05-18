import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Country: 'Czechia', Factor: 'China – exports', Decrease_in_GDP_Percentage: 0.011 },
    { Country: 'Czechia', Factor: 'China – supply chain', Decrease_in_GDP_Percentage: 0.036 },
    { Country: 'Czechia', Factor: 'Germany – exports', Decrease_in_GDP_Percentage: 0.003 },
    { Country: 'Czechia', Factor: 'Italy – exports', Decrease_in_GDP_Percentage: 0.064 },
    { Country: 'Czechia', Factor: 'Total', Decrease_in_GDP_Percentage: 0.064 },
    { Country: 'Hungary', Factor: 'China – exports', Decrease_in_GDP_Percentage: 0.015 },
    { Country: 'Hungary', Factor: 'China – supply chain', Decrease_in_GDP_Percentage: 0.031 },
    { Country: 'Hungary', Factor: 'Germany – exports', Decrease_in_GDP_Percentage: 0.004 },
    { Country: 'Hungary', Factor: 'Italy – exports', Decrease_in_GDP_Percentage: 0.069 },
    { Country: 'Hungary', Factor: 'Total', Decrease_in_GDP_Percentage: 0.069 },
    { Country: 'Romania', Factor: 'China – exports', Decrease_in_GDP_Percentage: 0.004 },
    { Country: 'Romania', Factor: 'China – supply chain', Decrease_in_GDP_Percentage: 0.015 },
    { Country: 'Romania', Factor: 'Germany – exports', Decrease_in_GDP_Percentage: 0.002 },
    { Country: 'Romania', Factor: 'Italy – exports', Decrease_in_GDP_Percentage: 0.038 },
    { Country: 'Romania', Factor: 'Total', Decrease_in_GDP_Percentage: 0.038 },
    { Country: 'Poland', Factor: 'China – exports', Decrease_in_GDP_Percentage: 0.004 },
    { Country: 'Poland', Factor: 'China – supply chain', Decrease_in_GDP_Percentage: 0.023 },
    { Country: 'Poland', Factor: 'Germany – exports', Decrease_in_GDP_Percentage: 0.001 },
    { Country: 'Poland', Factor: 'Italy – exports', Decrease_in_GDP_Percentage: 0.038 },
    { Country: 'Poland', Factor: 'Total', Decrease_in_GDP_Percentage: 0.033 }
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

function renderEuropeanFactorStackedChart({ d3, container, highlightCountry = null }) {
    const selectedFactors = ['Germany – exports', 'Italy – exports'];
    const csvTotals = {
        Czechia: 0.067,
        Hungary: 0.073,
        Romania: 0.040,
        Poland: 0.039
    };
    const countries = Object.keys(csvTotals);
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 56, left: 56 };
    const legendOffsetX = 32;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const color = d3.scaleOrdinal().domain(selectedFactors).range(['#4f46e5', '#14b8a6']);
    const segments = [];

    countries.forEach((country) => {
        let y0 = 0;
        selectedFactors.forEach((factor, index) => {
            const rawValue = Number(data_rows.find((d) => d.Country === country && d.Factor === factor)?.Decrease_in_GDP_Percentage ?? 0);
            const actualTotal = selectedFactors.reduce((sum, f) => {
                return sum + Number(data_rows.find((d) => d.Country === country && d.Factor === f)?.Decrease_in_GDP_Percentage ?? 0);
            }, 0);
            const csvTotal = csvTotals[country];
            const value = index === selectedFactors.length - 1
                ? Math.max(0, csvTotal - y0)
                : rawValue * (csvTotal / Math.max(actualTotal, 1e-9));
            const y1 = y0 + value;
            segments.push({ country, factor, value, y0, y1, total: csvTotal });
            y0 = y1;
        });
    });

    const xScale = d3.scaleBand().domain(countries).range([0, plotW]).padding(0.24);
    const yScale = d3.scaleLinear().domain([0, d3.max(countries, (country) => csvTotals[country]) ?? 0]).nice().range([plotH, 0]);

    container.innerHTML = '';
    container.classList.add('validation-stacked-chart-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    g.selectAll('rect.main-bar')
        .data(segments)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.country))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.y1))
        .attr('height', (d) => yScale(d.y0) - yScale(d.y1))
        .attr('fill', (d) => color(d.factor))
        .attr('opacity', (d) => !highlightCountry || d.country === highlightCountry ? 1 : 0.22)
        .attr('stroke', (d) => d.country === highlightCountry ? '#111827' : 'none')
        .attr('stroke-width', (d) => d.country === highlightCountry ? 1.5 : 0)
        .attr('data-target', (d) => d.country)
        .attr('data-series', (d) => d.factor)
        .attr('data-value', (d) => d.value);

    g.selectAll('text.e5-q2-total-label')
        .data(countries.map((country) => ({ country, total: csvTotals[country] })))
        .join('text')
        .attr('class', 'e5-q2-total-label')
        .attr('x', (d) => (xScale(d.country) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => yScale(d.total) - 8)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .attr('fill', (d) => d.country === highlightCountry ? '#ef4444' : '#111827')
        .attr('opacity', (d) => !highlightCountry || d.country === highlightCountry ? 1 : 0.28)
        .text((d) => d.total.toFixed(3));

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    selectedFactors.forEach((factor, index) => {
        const y = index * 26 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', color(factor));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 12).text(factor);
    });
}

export function function1({ d3, container }) {
    renderEuropeanFactorStackedChart({ d3, container });
}

export function function2({ d3, container }) {
    renderEuropeanFactorStackedChart({ d3, container, highlightCountry: 'Hungary' });
}

export function function3({ d3, container }) {}
