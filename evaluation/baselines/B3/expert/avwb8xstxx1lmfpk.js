import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { "Month 'Year": 'May \'20', 'Consumer Price Index (100 = 1982-1984)': 256.39 },
    { "Month 'Year": 'Jun \'20', 'Consumer Price Index (100 = 1982-1984)': 257.8 },
    { "Month 'Year": 'Jul \'20', 'Consumer Price Index (100 = 1982-1984)': 259.1 },
    { "Month 'Year": 'Aug \'20', 'Consumer Price Index (100 = 1982-1984)': 259.92 },
    { "Month 'Year": 'Sep \'20', 'Consumer Price Index (100 = 1982-1984)': 260.28 },
    { "Month 'Year": 'Oct \'20', 'Consumer Price Index (100 = 1982-1984)': 260.39 },
    { "Month 'Year": 'Nov \'20', 'Consumer Price Index (100 = 1982-1984)': 260.23 },
    { "Month 'Year": 'Dec \'20', 'Consumer Price Index (100 = 1982-1984)': 260.47 },
    { "Month 'Year": 'Jan \'21', 'Consumer Price Index (100 = 1982-1984)': 261.58 },
    { "Month 'Year": 'Feb \'21', 'Consumer Price Index (100 = 1982-1984)': 263.01 },
    { "Month 'Year": 'Mar \'21', 'Consumer Price Index (100 = 1982-1984)': 264.88 },
    { "Month 'Year": 'Apr \'21', 'Consumer Price Index (100 = 1982-1984)': 267.05 },
    { "Month 'Year": 'May \'21', 'Consumer Price Index (100 = 1982-1984)': 269.2 }
];

function injectSimpleLineStyles() {
    if (document.getElementById('validation-simple-line-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-simple-line-styles';
    style.textContent = `
        .validation-simple-line-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-simple-line-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-simple-line-host .x-axis line,
        .validation-simple-line-host .x-axis path,
        .validation-simple-line-host .y-axis line,
        .validation-simple-line-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-simple-line-host .x-axis text,
        .validation-simple-line-host .y-axis text,
        .validation-simple-line-host .x-axis-label,
        .validation-simple-line-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-simple-line-tooltip {
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
        .validation-simple-line-tooltip[hidden] { display: none; }
        .validation-simple-line-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-simple-line-tooltip__label { color: #6b7280; font-size: 12px; }
        .validation-simple-line-tooltip__value { color: #111827; font-size: 13px; font-weight: 600; text-align: right; }
    `;
    document.head.appendChild(style);
}

export function renderValidationSimpleLineChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    const xField = "Month 'Year";
    const yField = 'Consumer Price Index (100 = 1982-1984)';

    injectSimpleLineStyles();

    const data = data_rows;

    // Derive domain from data (preserves insertion order)
    const xDomain = Array.from(new Set(data.map((d) => String(d[xField]))));
    const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite);
    const minY = d3.min(yValues) ?? 0;
    const maxY = d3.max(yValues) ?? 1;

    // Build RenderPoint objects matching Workbench's shape { target, yValue, xDisplayLabel }
    const points = xDomain.map((label) => {
        const row = data.find((d) => String(d[xField]) === label);
        return {
            target: label,
            xDisplayLabel: label,
            yValue: Number(row?.[yField] ?? 0),
        };
    }).filter((p) => Number.isFinite(p.yValue));

    // Canvas / layout constants matching Workbench defaults
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // X: scalePoint for nominal values (Workbench default for nominal x)
    const xScale = d3.scalePoint()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.5);

    // Y: linear, no forced zero (Workbench default for line charts)
    const domainMin = minY === maxY ? minY - 1 : minY;
    const domainMax = minY === maxY ? maxY + 1 : maxY;
    const yScale = d3.scaleLinear()
        .domain([domainMin, domainMax])
        .nice()
        .range([plotH, 0]);

    // Workbench line style defaults
    const lineStroke = '#4f46e5';
    const lineStrokeWidth = 2;
    const pointRadius = 4;

    // Clear and prepare container
    container.innerHTML = '';
    container.classList.add('validation-simple-line-host');

    const svg = d3.select(container)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        // Store margin as data attributes (same as Workbench) for function1/2 offset calc
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

    // Line path — class="main-line" for function1/2 selection
    const lineGenerator = d3.line()
        .x((p) => xScale(p.target))
        .y((p) => yScale(p.yValue));

    g.append('path')
        .datum(points)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', lineStroke)
        .attr('stroke-width', lineStrokeWidth)
        .attr('opacity', 1)
        .attr('d', lineGenerator);

    // Point circles — no class (Workbench style); use data-target for selection
    g.selectAll('circle[data-target]')
        .data(points)
        .join('circle')
        .attr('cx', (p) => xScale(p.target))
        .attr('cy', (p) => yScale(p.yValue))
        .attr('r', pointRadius)
        .attr('fill', lineStroke)
        .attr('opacity', 0.85)
        // Workbench data attributes
        .attr('data-target', (p) => p.target)
        .attr('data-value', (p) => String(p.yValue))
        .attr('data-x-value', (p) => p.xDisplayLabel)
        .attr('data-y-value', (p) => String(p.yValue));

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-simple-line-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${xField}</span>
            <span class="validation-simple-line-tooltip__value" id="ln-tt-x"></span>
        </div>
        <div class="validation-simple-line-tooltip__row">
            <span class="validation-simple-line-tooltip__label">${yField}</span>
            <span class="validation-simple-line-tooltip__value" id="ln-tt-y"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('circle[data-target]')
        .on('mouseover', function (event, p) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#ln-tt-x').textContent = p.xDisplayLabel;
            tooltip.querySelector('#ln-tt-y').textContent = String(p.yValue);
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

function getCpiChartMetrics(d3, container) {
    const xField = "Month 'Year";
    const yField = 'Consumer Price Index (100 = 1982-1984)';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = data_rows.map((d) => String(d[xField]));
    const yValues = data_rows.map((d) => Number(d[yField])).filter(Number.isFinite);
    const yScale = d3.scaleLinear()
        .domain([d3.min(yValues) ?? 0, d3.max(yValues) ?? 1])
        .nice()
        .range([plotH, 0]);
    const xScale = d3.scalePoint()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.5);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const average = d3.mean(yValues) ?? 0;
    const rowsByYear = {
        2020: data_rows.filter((d) => String(d[xField]).endsWith("'20")),
        2021: data_rows.filter((d) => String(d[xField]).endsWith("'21"))
    };
    const yearAverages = Object.fromEntries(Object.entries(rowsByYear).map(([year, rows]) => [
        year,
        d3.mean(rows, (d) => Number(d[yField])) ?? 0
    ]));

    return { xField, yField, margin, plotW, plotH, xScale, yScale, svg, g, average, rowsByYear, yearAverages };
}

function addCpiAverageLine(d3, container) {
    const { g, plotW, yScale, average } = getCpiChartMetrics(d3, container);
    if (g.empty()) return;
    const y = yScale(average);

    g.selectAll('.validation-cpi-average-line').remove();
    g.append('line')
        .attr('class', 'validation-cpi-average-line')
        .attr('x1', 0)
        .attr('x2', plotW)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4');
    g.append('text')
        .attr('class', 'validation-cpi-average-line')
        .attr('x', plotW + 6)
        .attr('y', y)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text(`avg ${average.toFixed(2)}`);
}

function addCpiDeviationDots(d3, container) {
    const { g, xScale, yScale, yearAverages } = getCpiChartMetrics(d3, container);
    if (g.empty()) return;

    const midX = ((xScale("Dec '20") ?? 0) + (xScale("Jan '21") ?? 0)) / 2;
    const dotRows = [
        { year: '2020', x: midX - 18, y: yScale(yearAverages['2020']), value: yearAverages['2020'] },
        { year: '2021', x: midX + 18, y: yScale(yearAverages['2021']), value: yearAverages['2021'] }
    ];

    g.selectAll('.validation-cpi-deviation-dot, .validation-cpi-deviation-label').remove();
    g.selectAll('circle.validation-cpi-deviation-dot')
        .data(dotRows)
        .join('circle')
        .attr('class', 'validation-cpi-deviation-dot')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', 6)
        .attr('fill', '#ef4444')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .attr('data-year', (d) => d.year)
        .attr('data-value', (d) => String(d.value));

    // Theme L (#41 round 3): explicit "Average 2020" / "Average 2021" labels
    // placed near each point so the eye can pair color to year. The 2020 label
    // points left, the 2021 label points right so they don't crowd the dots.
    dotRows.forEach((d) => {
        const anchor = d.year === '2020' ? 'end' : 'start';
        const offsetX = d.year === '2020' ? -10 : 10;
        g.append('text')
            .attr('class', 'validation-cpi-deviation-label')
            .attr('x', d.x + offsetX)
            .attr('y', d.y - 8)
            .attr('text-anchor', anchor)
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#dc2626')
            .text(`Average ${d.year} (${d.value.toFixed(2)})`);
    });
}

export function function1({ d3, container }) {
    const { g, plotH, xScale } = getCpiChartMetrics(d3, container);
    if (g.empty()) return;

    const decX = xScale("Dec '20") ?? 0;
    const janX = xScale("Jan '21") ?? 0;
    const midX = (decX + janX) / 2;
    const center2020 = d3.mean(["May '20", "Jun '20", "Jul '20", "Aug '20", "Sep '20", "Oct '20", "Nov '20", "Dec '20"], (d) => xScale(d) ?? 0) ?? decX / 2;
    const center2021 = d3.mean(["Jan '21", "Feb '21", "Mar '21", "Apr '21", "May '21"], (d) => xScale(d) ?? 0) ?? (janX + 40);

    g.selectAll('.validation-cpi-year-split').remove();
    g.append('line')
        .attr('class', 'validation-cpi-year-split')
        .attr('x1', midX)
        .attr('x2', midX)
        .attr('y1', 0)
        .attr('y2', plotH)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2);

    [
        { label: '2020', x: center2020 },
        { label: '2021', x: center2021 }
    ].forEach((d) => {
        g.append('text')
            .attr('class', 'validation-cpi-year-split')
            .attr('x', d.x)
            .attr('y', -12)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 13)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .text(d.label);
    });
}

export function function2({ d3, container }) {
    addCpiAverageLine(d3, container);
}

export function function3({ d3, container }) {
    addCpiDeviationDots(d3, container);
}

export function function4({ d3, container }) {
    const { g, plotW, yScale, average, yearAverages } = getCpiChartMetrics(d3, container);
    if (g.empty()) return;

    addCpiAverageLine(d3, container);
    addCpiDeviationDots(d3, container);

    const avgY = yScale(average);
    const dots = g.selectAll('circle.validation-cpi-deviation-dot').nodes().map((node) => ({
        year: node.getAttribute('data-year'),
        x: Number(node.getAttribute('cx')),
        y: Number(node.getAttribute('cy'))
    }));

    g.selectAll('.validation-cpi-deviation-arrow').remove();
    const defs = g.select(function () {
        return this.ownerSVGElement;
    }).select('defs').empty()
        ? d3.select(g.node().ownerSVGElement).append('defs')
        : d3.select(g.node().ownerSVGElement).select('defs');

    defs.selectAll('#validation-cpi-arrow-head').remove();
    defs.append('marker')
        .attr('id', 'validation-cpi-arrow-head')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    dots.forEach((dot) => {
        const deviation = Math.abs((yearAverages[dot.year] ?? average) - average);
        const labelX = Math.min(plotW - 8, dot.x + 28);
        const labelY = (dot.y + avgY) / 2;

        g.append('line')
            .attr('class', 'validation-cpi-deviation-arrow')
            .attr('x1', dot.x)
            .attr('x2', dot.x)
            .attr('y1', dot.y)
            .attr('y2', avgY)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .attr('marker-start', 'url(#validation-cpi-arrow-head)')
            .attr('marker-end', 'url(#validation-cpi-arrow-head)');
        g.append('text')
            .attr('class', 'validation-cpi-deviation-arrow')
            .attr('x', labelX)
            .attr('y', labelY)
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', '#ef4444')
            .text(deviation.toFixed(2));
    });
}
