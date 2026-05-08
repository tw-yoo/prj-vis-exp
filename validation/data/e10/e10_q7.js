import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Royal_Figure: 'Meghan, Duchess of Sussex', Perception: 'Overly critical', Share_of_Respondents: 0.5 },
    { Royal_Figure: 'Meghan, Duchess of Sussex', Perception: 'Don\'t know', Share_of_Respondents: 0.17 },
    { Royal_Figure: 'Meghan, Duchess of Sussex', Perception: 'Fair and balanced', Share_of_Respondents: 0.25 },
    { Royal_Figure: 'Meghan, Duchess of Sussex', Perception: 'Overly favourable', Share_of_Respondents: 0.09 },
    { Royal_Figure: 'Prince Harry', Perception: 'Overly critical', Share_of_Respondents: 0.44 },
    { Royal_Figure: 'Prince Harry', Perception: 'Don\'t know', Share_of_Respondents: 0.17 },
    { Royal_Figure: 'Prince Harry', Perception: 'Fair and balanced', Share_of_Respondents: 0.3 },
    { Royal_Figure: 'Prince Harry', Perception: 'Overly favourable', Share_of_Respondents: 0.09 },
    { Royal_Figure: 'Prince Andrew', Perception: 'Overly critical', Share_of_Respondents: 0.17 },
    { Royal_Figure: 'Prince Andrew', Perception: 'Don\'t know', Share_of_Respondents: 0.26 },
    { Royal_Figure: 'Prince Andrew', Perception: 'Fair and balanced', Share_of_Respondents: 0.39 },
    { Royal_Figure: 'Prince Andrew', Perception: 'Overly favourable', Share_of_Respondents: 0.18 },
    { Royal_Figure: 'Prince Philip', Perception: 'Overly critical', Share_of_Respondents: 0.08 },
    { Royal_Figure: 'Prince Philip', Perception: 'Don\'t know', Share_of_Respondents: 0.17 },
    { Royal_Figure: 'Prince Philip', Perception: 'Fair and balanced', Share_of_Respondents: 0.55 },
    { Royal_Figure: 'Prince Philip', Perception: 'Overly favourable', Share_of_Respondents: 0.2 },
    { Royal_Figure: 'Prince William', Perception: 'Overly critical', Share_of_Respondents: 0.07 },
    { Royal_Figure: 'Prince William', Perception: 'Don\'t know', Share_of_Respondents: 0.15 },
    { Royal_Figure: 'Prince William', Perception: 'Fair and balanced', Share_of_Respondents: 0.51 },
    { Royal_Figure: 'Prince William', Perception: 'Overly favourable', Share_of_Respondents: 0.27 },
    { Royal_Figure: 'Catherine, Duchess of Cambridge', Perception: 'Overly critical', Share_of_Respondents: 0.05 },
    { Royal_Figure: 'Catherine, Duchess of Cambridge', Perception: 'Don\'t know', Share_of_Respondents: 0.21 },
    { Royal_Figure: 'Catherine, Duchess of Cambridge', Perception: 'Fair and balanced', Share_of_Respondents: 0.44 },
    { Royal_Figure: 'Catherine, Duchess of Cambridge', Perception: 'Overly favourable', Share_of_Respondents: 0.29 },
    { Royal_Figure: 'Queen Elizabeth II', Perception: 'Overly critical', Share_of_Respondents: 0.04 },
    { Royal_Figure: 'Queen Elizabeth II', Perception: 'Don\'t know', Share_of_Respondents: 0.15 },
    { Royal_Figure: 'Queen Elizabeth II', Perception: 'Fair and balanced', Share_of_Respondents: 0.55 },
    { Royal_Figure: 'Queen Elizabeth II', Perception: 'Overly favourable', Share_of_Respondents: 0.26 }
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

function renderRoyalStackedBarChart({ d3, container, rows, xDomain, seriesDomain }) {
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 72, left: 56 };
    const legendOffsetX = 24;
    const legendReserve = 220;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const colorScale = d3.scaleOrdinal().domain(seriesDomain).range(WORKBENCH_PALETTE);
    const segments = [];

    xDomain.forEach((figure) => {
        let y0 = 0;
        seriesDomain.forEach((perception) => {
            const value = rows
                .filter((row) => String(row.Royal_Figure) === figure && String(row.Perception) === perception)
                .reduce((sum, row) => sum + Number(row.Share_of_Respondents), 0);
            const y1 = y0 + value;
            segments.push({ figure, perception, value, y0, y1 });
            y0 = y1;
        });
    });

    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.24);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(segments, (d) => d.y1) ?? 0])
        .nice()
        .range([plotH, 0]);

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
        .attr('x', (d) => xScale(d.figure))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.y1))
        .attr('height', (d) => yScale(d.y0) - yScale(d.y1))
        .attr('fill', (d) => colorScale(d.perception))
        .attr('data-target', (d) => d.figure)
        .attr('data-series', (d) => d.perception)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.figure)
        .attr('data-y-value', (d) => String(d.value))
        .attr('data-group-value', (d) => d.perception);

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    seriesDomain.forEach((series, index) => {
        const y = index * 24 + 8;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', colorScale(series));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 11).text(series);
    });
}

function renderPerceptionTotalBarChart({ d3, container, rows, seriesDomain }) {
    const totals = seriesDomain.map((perception) => ({
        perception,
        value: rows
            .filter((row) => String(row.Perception) === perception)
            .reduce((sum, row) => sum + Number(row.Share_of_Respondents), 0)
    })).sort((a, b) => b.value - a.value);
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 72, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scaleBand().domain(totals.map((d) => d.perception)).range([0, plotW]).padding(0.22);
    const yScale = d3.scaleLinear().domain([0, d3.max(totals, (d) => d.value) ?? 0]).nice().range([plotH, 0]);

    container.innerHTML = '';
    container.classList.add('validation-chart-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    g.selectAll('rect.main-bar')
        .data(totals)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.perception))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', '#4f46e5')
        .attr('data-target', (d) => d.perception)
        .attr('data-value', (d) => d.value)
        .attr('data-x-value', (d) => d.perception)
        .attr('data-y-value', (d) => String(d.value));

    g.selectAll('text.validation-total-label')
        .data(totals)
        .join('text')
        .attr('class', 'validation-total-label')
        .attr('x', (d) => (xScale(d.perception) ?? 0) + xScale.bandwidth() / 2)
        .attr('y', (d) => yScale(d.value) - 8)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text((d) => d.value.toFixed(2));
}

export function function1({ d3, container }) {
    const selectedFigures = ['Meghan, Duchess of Sussex', 'Catherine, Duchess of Cambridge', 'Queen Elizabeth II'];
    const selectedRows = data_rows.filter((row) => selectedFigures.includes(String(row.Royal_Figure)));
    const seriesDomain = Array.from(new Set(data_rows.map((row) => String(row.Perception))));

    renderRoyalStackedBarChart({
        d3,
        container,
        rows: selectedRows,
        xDomain: selectedFigures,
        seriesDomain
    });
}

export function function2({ d3, container }) {
    const selectedFigures = ['Meghan, Duchess of Sussex', 'Catherine, Duchess of Cambridge', 'Queen Elizabeth II'];
    const selectedRows = data_rows.filter((row) => selectedFigures.includes(String(row.Royal_Figure)));
    const seriesDomain = Array.from(new Set(data_rows.map((row) => String(row.Perception))));

    renderPerceptionTotalBarChart({ d3, container, rows: selectedRows, seriesDomain });
}

export function function3({ d3, container }) {}
