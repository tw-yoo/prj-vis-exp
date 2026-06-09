import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 1970, 'In millions': 9.6 },
    { Year: 1980, 'In millions': 14.5 },
    { Year: 1990, 'In millions': 22.6 },
    { Year: 2000, 'In millions': 35.7 },
    { Year: 2010, 'In millions': 50.7 },
    { Year: 2019, 'In millions': 60.6 }
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
    const xField = 'Year';
    const yField = 'In millions';

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

function getPopulationChangeRows() {
    return data_rows.slice(1).map((row, index) => ({
        fromYear: data_rows[index].Year,
        toYear: row.Year,
        fromValue: Number(data_rows[index]['In millions']),
        toValue: Number(row['In millions']),
        diff: Number(row['In millions']) - Number(data_rows[index]['In millions'])
    }));
}

export function function1({ d3, container }) {
    const xField = 'Year';
    const yField = 'In millions';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = data_rows.map((d) => String(d[xField]));
    const yValues = data_rows.map((d) => Number(d[yField]));
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const yScale = d3.scaleLinear().domain([d3.min(yValues) ?? 0, d3.max(yValues) ?? 1]).nice().range([plotH, 0]);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-change-arrow, .validation-change-label').remove();
    svg.select('defs#e2-q4-defs').remove();
    const defs = svg.append('defs').attr('id', 'e2-q4-defs');
    defs.append('marker')
        .attr('id', 'e2-q4-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    getPopulationChangeRows().forEach((change) => {
        const x = xScale(String(change.toYear)) ?? 0;
        const y0 = yScale(change.fromValue);
        const y1 = yScale(change.toValue);
        g.append('line')
            .attr('class', 'validation-change-arrow')
            .attr('data-segment', `${change.fromYear}-${change.toYear}`)
            .attr('x1', x)
            .attr('x2', x)
            .attr('y1', y0)
            .attr('y2', y0)
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#e2-q4-arrow)')
            .transition()
            .duration(650)
            .attr('y2', y1);

        // Per reviewer (review_e2.csv row 5): "각 화살표 옆에 증가량 숫자가 있어야 함."
        g.append('text')
            .attr('class', 'validation-change-label')
            .attr('data-segment', `${change.fromYear}-${change.toYear}`)
            .attr('x', x + 6)
            .attr('y', (y0 + y1) / 2)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 11)
            .attr('font-weight', 700)
            .attr('fill', '#ef4444')
            .attr('opacity', 0)
            .text(`+${change.diff.toFixed(1)}`)
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });
}

export function function2({ d3, container }) {
    // Per reviewer (review_e2.csv row 6): dual-panel layout — keep f1's line chart on TOP,
    // add a bar chart of year-to-year deltas BELOW. Both panels highlight the 2000-2010 band.
    const rows = getPopulationChangeRows();
    const maxRow = rows.reduce((best, row) => row.toValue > best.toValue ? row : best, rows[0]);
    const xField = 'Year';
    const yField = 'In millions';
    const lineMargin = { top: 32, right: 24, bottom: 48, left: 56 };
    const linePlotW = 640 - lineMargin.left - lineMargin.right;
    const linePlotH = 360 - lineMargin.top - lineMargin.bottom;

    const xDomain = data_rows.map((d) => String(d[xField]));
    const yValues = data_rows.map((d) => Number(d[yField]));
    const xScaleLine = d3.scalePoint().domain(xDomain).range([0, linePlotW]).padding(0.5);

    const svg = d3.select(container).select('svg');
    const topG = svg.select('g'); // the existing line chart group at translate(56, 32)
    if (svg.empty() || topG.empty()) return;

    svg.selectAll('.validation-q4-highlight-2000-2010, .validation-q4-delta-panel, .validation-q4-line-highlight').remove();

    // 1) Expand viewBox to make room for the bar panel below.
    const newWidth = 640;
    const newHeight = 720;
    const panelGap = 32;
    svg.attr('viewBox', `0 0 ${newWidth} ${newHeight}`);

    // 2) Add highlight rect on the top (line) panel spanning 2000 → 2010 on the x-axis.
    const xFrom = xScaleLine(String(maxRow.fromYear)) ?? 0;
    const xTo = xScaleLine(String(maxRow.toYear)) ?? 0;
    topG.insert('rect', ':first-child')
        .attr('class', 'validation-q4-line-highlight')
        .attr('x', xFrom)
        .attr('y', 0)
        .attr('width', Math.max(0, xTo - xFrom))
        .attr('height', linePlotH)
        .attr('fill', '#fde68a')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.45);

    // 3) Add the delta bar panel below the line chart.
    const barPanelTop = lineMargin.top + linePlotH + panelGap;
    const barMargin = { left: lineMargin.left, right: lineMargin.right, top: 32, bottom: 64 };
    const barPlotW = newWidth - barMargin.left - barMargin.right;
    const barPlotH = newHeight - barPanelTop - barMargin.top - barMargin.bottom;

    const xScaleBar = d3.scaleBand()
        .domain(rows.map((d) => `${d.fromYear}-${d.toYear}`))
        .range([0, barPlotW])
        .padding(0.24);
    const yScaleBar = d3.scaleLinear()
        .domain([0, d3.max(rows, (d) => d.diff) ?? 0])
        .nice()
        .range([barPlotH, 0]);

    const barG = svg.append('g')
        .attr('class', 'validation-q4-delta-panel')
        .attr('transform', `translate(${barMargin.left},${barPanelTop + barMargin.top})`);

    // Panel label
    barG.append('text')
        .attr('x', 0)
        .attr('y', -10)
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .text('Year-over-year change');

    // Axes
    barG.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScaleBar).ticks(5));
    const xAxis = barG.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${barPlotH})`).call(d3.axisBottom(xScaleBar));
    autoRotateXAxisLabels(xAxis);

    // Highlight rect for 2000-2010 BEHIND bars
    barG.insert('rect', ':first-child')
        .attr('class', 'validation-q4-highlight-2000-2010')
        .attr('x', (xScaleBar(`${maxRow.fromYear}-${maxRow.toYear}`) ?? 0) - 8)
        .attr('y', 0)
        .attr('width', xScaleBar.bandwidth() + 16)
        .attr('height', barPlotH)
        .attr('fill', '#fde68a')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.55);

    // Bars enter at final position with opacity fade — NO grow-from-zero.
    barG.selectAll('rect.main-bar')
        .data(rows)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScaleBar(`${d.fromYear}-${d.toYear}`))
        .attr('width', xScaleBar.bandwidth())
        .attr('y', (d) => yScaleBar(d.diff))
        .attr('height', (d) => barPlotH - yScaleBar(d.diff))
        .attr('fill', (d) => d === maxRow ? '#ef4444' : '#4f46e5')
        .attr('data-target', (d) => `${d.fromYear}-${d.toYear}`)
        .attr('data-value', (d) => d.diff)
        .attr('opacity', 0)
        .transition()
        .duration(250)
        .attr('opacity', 1);

    // Label the max delta value above its bar.
    const maxX = (xScaleBar(`${maxRow.fromYear}-${maxRow.toYear}`) ?? 0) + xScaleBar.bandwidth() / 2;
    const maxY = yScaleBar(maxRow.diff);
    barG.append('text')
        .attr('class', 'validation-q4-max-label')
        .attr('x', maxX)
        .attr('y', maxY - 6)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`${maxRow.toYear}: ${maxRow.toValue.toFixed(1)}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function3({ d3, container }) {}
