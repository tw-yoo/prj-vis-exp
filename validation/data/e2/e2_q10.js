import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2007, Country: 'US', Favorable_View_Percentage: 44 },
    { Year: 2007, Country: 'Germany', Favorable_View_Percentage: 34 },
    { Year: 2009, Country: 'US', Favorable_View_Percentage: 43 },
    { Year: 2009, Country: 'Germany', Favorable_View_Percentage: 42 },
    { Year: 2010, Country: 'US', Favorable_View_Percentage: 49 },
    { Year: 2010, Country: 'Germany', Favorable_View_Percentage: 50 },
    { Year: 2011, Country: 'US', Favorable_View_Percentage: 49 },
    { Year: 2011, Country: 'Germany', Favorable_View_Percentage: 47 },
    { Year: 2012, Country: 'US', Favorable_View_Percentage: 37 },
    { Year: 2012, Country: 'Germany', Favorable_View_Percentage: 33 },
    { Year: 2013, Country: 'US', Favorable_View_Percentage: 37 },
    { Year: 2013, Country: 'Germany', Favorable_View_Percentage: 32 },
    { Year: 2014, Country: 'US', Favorable_View_Percentage: 19 },
    { Year: 2014, Country: 'Germany', Favorable_View_Percentage: 19 },
    { Year: 2015, Country: 'US', Favorable_View_Percentage: 22 },
    { Year: 2015, Country: 'Germany', Favorable_View_Percentage: 27 },
    { Year: 2017, Country: 'US', Favorable_View_Percentage: 29 },
    { Year: 2017, Country: 'Germany', Favorable_View_Percentage: 27 },
    { Year: 2018, Country: 'US', Favorable_View_Percentage: 21 },
    { Year: 2018, Country: 'Germany', Favorable_View_Percentage: 35 }
];

// Workbench multiple-line color palette (resolveColorPalette fallback)
const MULTI_LINE_PALETTE = ['#60a5fa', '#fb7185', '#f59e0b', '#10b981', '#c084fc', '#f472b6', '#22d3ee', '#a3e635', '#f97316'];

function resolveSeriesColor(seriesDomain, series) {
    const index = seriesDomain.indexOf(series);
    return MULTI_LINE_PALETTE[index >= 0 ? index % MULTI_LINE_PALETTE.length : 0];
}

function injectMultiLineStyles() {
    if (document.getElementById('validation-multi-line-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-multi-line-styles';
    style.textContent = `
        .validation-multi-line-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-multi-line-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-multi-line-host .x-axis line,
        .validation-multi-line-host .x-axis path,
        .validation-multi-line-host .y-axis line,
        .validation-multi-line-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-multi-line-host .x-axis text,
        .validation-multi-line-host .y-axis text,
        .validation-multi-line-host .x-axis-label,
        .validation-multi-line-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-multi-line-host .color-legend text {
            fill: #000000;
            font-family: sans-serif;
        }
        .validation-multi-line-tooltip {
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
        .validation-multi-line-tooltip[hidden] { display: none; }
        .validation-multi-line-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-multi-line-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-multi-line-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationMultipleLineChart({ container }) {
    const xField = 'Year';
    const seriesField = 'Country';
    const yField = 'Favorable_View_Percentage';
    const xDomain = Array.from(new Set(data_rows.map((d) => String(d[xField]))));
    const seriesDomain = Array.from(new Set(data_rows.map((d) => String(d[seriesField]))));

    injectMultiLineStyles();

    const data = data_rows;

    // Build RenderPoint objects: { target, series, yValue, xDisplayLabel }
    const allPoints = [];
    xDomain.forEach((x) => {
        seriesDomain.forEach((ser) => {
            const row = data.find((d) => String(d[xField]) === x && String(d[seriesField]) === ser);
            if (!row) return;
            const yValue = Number(row[yField]);
            if (!Number.isFinite(yValue)) return;
            allPoints.push({ target: x, series: ser, yValue, xDisplayLabel: x });
        });
    });

    // Group by series for line rendering
    const seriesGroups = seriesDomain.map((ser) => ({
        series: ser,
        points: allPoints.filter((p) => p.series === ser),
    }));

    const yValues = allPoints.map((p) => p.yValue);
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;

    // Canvas / layout matching Workbench (with legend)
    // legendReserve = legendWidth(136) + legendOffsetX(64) = 200
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;

    // Workbench style defaults for multi-line
    const lineStrokeWidth = 2;
    const pointRadius = 4;

    // X: scalePoint for nominal values, padding=0.5 (Workbench default)
    const xScale = d3.scalePoint()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.5);

    // Y: no forced zero (Workbench default for line charts)
    const domainMin = minY === maxY ? minY - 1 : minY;
    const domainMax = minY === maxY ? maxY + 1 : maxY;
    const yScale = d3.scaleLinear()
        .domain([domainMin, domainMax])
        .nice()
        .range([plotH, 0]);

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-multi-line-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        // Store margin for function1/2 coordinate offset calculation
        .attr('data-m-left', margin.left)
        .attr('data-m-top', margin.top)
        .style('overflow', 'visible');

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Y axis (6 ticks — matches Workbench)
    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(6));

    // X axis
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(g.select('.x-axis'));

    // Line generator (operates on RenderPoint[])
    const lineGen = d3.line()
        .x((p) => xScale(p.target))
        .y((p) => yScale(p.yValue));

    // Render each series: path + points group
    seriesGroups.forEach((sg) => {
        const stroke = resolveSeriesColor(seriesDomain, sg.series);

        // Line path — datum bound as { series, points } for function1 access
        g.append('path')
            .datum(sg)
            .attr('fill', 'none')
            .attr('stroke', stroke)
            .attr('stroke-width', lineStrokeWidth)
            .attr('d', (d) => lineGen(d.points))
            .attr('data-series', sg.series);

        // Points group — individual RenderPoint objects bound per circle
        g.selectAll(`circle[data-series="${sg.series}"]`)
            .data(sg.points)
            .join('circle')
            .attr('cx', (p) => xScale(p.target))
            .attr('cy', (p) => yScale(p.yValue))
            .attr('r', pointRadius)
            .attr('fill', stroke)
            .attr('opacity', 0.85)
            // Workbench data attributes
            .attr('data-target', (p) => p.target)
            .attr('data-series', (p) => p.series)
            .attr('data-value', (p) => String(p.yValue))
            .attr('data-x-value', (p) => p.xDisplayLabel)
            .attr('data-y-value', (p) => String(p.yValue))
            .attr('data-group-value', (p) => p.series);
    });

    // Color legend — matches Workbench renderColorLegend (circles, not rects)
    // legendLabel=20, rowGap=10 → row height = 30; circle cy = rowY + 10
    const legendX = margin.left + plotW + legendOffsetX;
    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${legendX},${margin.top})`);

    const legendRowH = 30;

    seriesDomain.forEach((ser, i) => {
        const rowY = i * legendRowH;
        const cy = rowY + 10;

        legend.append('circle')
            .attr('cx', 8)
            .attr('cy', cy)
            .attr('r', 5)
            .attr('fill', resolveSeriesColor(seriesDomain, ser))
            .attr('opacity', 0.85);

        legend.append('text')
            .attr('x', 20)
            .attr('y', cy)
            .attr('font-size', 20) // CHART_TEXT_SIZE.legendLabel
            .attr('dominant-baseline', 'middle')
            .text(ser);
    });

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-multi-line-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${xField}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-x"></span>
        </div>
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${seriesField}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-s"></span>
        </div>
        <div class="validation-multi-line-tooltip__row">
            <span class="validation-multi-line-tooltip__label">${yField}</span>
            <span class="validation-multi-line-tooltip__value" id="ml-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('circle[data-target]')
        .on('mouseover', function (event, p) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#ml-tt-x').textContent = p.xDisplayLabel;
            tooltip.querySelector('#ml-tt-s').textContent = p.series;
            tooltip.querySelector('#ml-tt-y').textContent = String(p.yValue);
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

function getFocusedCountryRows() {
    return data_rows.filter((d) => Number(d.Year) >= 2010 && Number(d.Year) <= 2015);
}

function getCountryTargets() {
    const rows = getFocusedCountryRows();
    const germanyRows = rows.filter((d) => d.Country === 'Germany');
    const usRows = rows.filter((d) => d.Country === 'US');
    const germanyMax = germanyRows.reduce((best, row) => (
        Number(row.Favorable_View_Percentage) > Number(best.Favorable_View_Percentage) ? row : best
    ), germanyRows[0]);
    const usMin = usRows.reduce((best, row) => (
        Number(row.Favorable_View_Percentage) < Number(best.Favorable_View_Percentage) ? row : best
    ), usRows[0]);
    return { germanyMax, usMin };
}

function renderFocusedCountryLineChart({ d3, container }) {
    const rows = getFocusedCountryRows();
    const years = Array.from(new Set(rows.map((d) => String(d.Year))));
    const countries = Array.from(new Set(rows.map((d) => String(d.Country))));
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendOffsetX = 64;
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const xScale = d3.scalePoint().domain(years).range([0, plotW]).padding(0.5);
    const yScale = d3.scaleLinear()
        .domain([d3.min(rows, (d) => Number(d.Favorable_View_Percentage)) ?? 0, d3.max(rows, (d) => Number(d.Favorable_View_Percentage)) ?? 1])
        .nice()
        .range([plotH, 0]);
    const line = d3.line().x((d) => xScale(String(d.Year)) ?? 0).y((d) => yScale(Number(d.Favorable_View_Percentage)));

    container.innerHTML = '';
    container.classList.add('validation-multi-line-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(6));
    const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    countries.forEach((country) => {
        const countryRows = rows.filter((d) => d.Country === country);
        const path = g.append('path')
            .datum({ country, points: countryRows })
            .attr('fill', 'none')
            .attr('stroke', resolveSeriesColor(countries, country))
            .attr('stroke-width', 2)
            .attr('data-series', country)
            .attr('d', (d) => line(d.points));
        const length = path.node()?.getTotalLength?.() ?? 0;
        path.attr('stroke-dasharray', `${length} ${length}`)
            .attr('stroke-dashoffset', length)
            .transition()
            .duration(700)
            .attr('stroke-dashoffset', 0);

        g.selectAll(`circle[data-series="${country}"]`)
            .data(countryRows)
            .join('circle')
            .attr('cx', (d) => xScale(String(d.Year)) ?? 0)
            .attr('cy', (d) => yScale(Number(d.Favorable_View_Percentage)))
            .attr('r', 0)
            .attr('fill', resolveSeriesColor(countries, country))
            .attr('opacity', 0.85)
            .attr('data-target', (d) => String(d.Year))
            .attr('data-series', country)
            .attr('data-value', (d) => String(d.Favorable_View_Percentage))
            .transition()
            .duration(550)
            .attr('r', 4);
    });

    const legend = svg.append('g')
        .attr('class', 'color-legend')
        .attr('transform', `translate(${margin.left + plotW + legendOffsetX},${margin.top})`);
    countries.forEach((country, index) => {
        const y = index * 30 + 10;
        legend.append('circle').attr('cx', 8).attr('cy', y).attr('r', 5).attr('fill', resolveSeriesColor(countries, country));
        legend.append('text').attr('x', 20).attr('y', y).attr('dominant-baseline', 'middle').attr('font-size', 14).text(country);
    });
}

function highlightCountryPoint(d3, container, country, year) {
    d3.select(container).selectAll('circle[data-target]')
        .transition()
        .duration(600)
        .attr('r', function () {
            return this.getAttribute('data-series') === country && this.getAttribute('data-target') === String(year) ? 8 : 3.5;
        })
        .attr('fill', function () {
            return this.getAttribute('data-series') === country && this.getAttribute('data-target') === String(year) ? '#ef4444' : d3.select(this).attr('fill');
        })
        .attr('opacity', function () {
            return this.getAttribute('data-series') === country && this.getAttribute('data-target') === String(year) ? 1 : 0.25;
        });

    d3.select(container).selectAll('.color-legend text')
        .transition()
        .duration(600)
        .attr('font-weight', function () {
            return d3.select(this).text() === country ? 800 : 400;
        });
}

export function function1({ d3, container }) {
    renderFocusedCountryLineChart({ d3, container });
}

export function function2({ d3, container }) {
    const { germanyMax } = getCountryTargets();
    highlightCountryPoint(d3, container, 'Germany', germanyMax.Year);
}

export function function3({ d3, container }) {
    const { usMin } = getCountryTargets();
    highlightCountryPoint(d3, container, 'US', usMin.Year);
}

export function function4({ d3, container }) {
    const { germanyMax, usMin } = getCountryTargets();
    const rows = getFocusedCountryRows();
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 16, bottom: 48, left: 56 };
    const legendReserve = 200;
    const plotW = width - margin.left - margin.right - legendReserve;
    const plotH = height - margin.top - margin.bottom;
    const yScale = d3.scaleLinear()
        .domain([d3.min(rows, (d) => Number(d.Favorable_View_Percentage)) ?? 0, d3.max(rows, (d) => Number(d.Favorable_View_Percentage)) ?? 1])
        .nice()
        .range([plotH, 0]);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-country-diff').remove();
    svg.select('defs#e2-q10-defs').remove();
    const defs = svg.append('defs').attr('id', 'e2-q10-defs');
    defs.append('marker')
        .attr('id', 'e2-q10-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    [germanyMax, usMin].forEach((row) => {
        const value = Number(row.Favorable_View_Percentage);
        const y = yScale(value);
        g.append('line')
            .attr('class', 'validation-country-diff')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', '#111827')
            .attr('stroke-width', 1.8)
            .attr('stroke-dasharray', '5 4')
            .transition()
            .duration(650)
            .attr('x2', plotW);
        g.append('text')
            .attr('class', 'validation-country-diff')
            .attr('x', plotW + 6)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .attr('opacity', 0)
            .text(String(value))
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });

    const y1 = yScale(Number(germanyMax.Favorable_View_Percentage));
    const y2 = yScale(Number(usMin.Favorable_View_Percentage));
    const arrowX = plotW + 46;
    g.append('line')
        .attr('class', 'validation-country-diff')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', y1)
        .attr('y2', y1)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q10-arrow)')
        .attr('marker-end', 'url(#e2-q10-arrow)')
        .transition()
        .duration(650)
        .attr('y2', y2);
    g.append('text')
        .attr('class', 'validation-country-diff')
        .attr('x', arrowX + 8)
        .attr('y', (y1 + y2) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(String(Number(germanyMax.Favorable_View_Percentage) - Number(usMin.Favorable_View_Percentage)))
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
