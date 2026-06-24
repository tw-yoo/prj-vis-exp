import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2013, Operating_Profit_Margin: 0.15 },
    { Year: 2014, Operating_Profit_Margin: 0.14 },
    { Year: 2015, Operating_Profit_Margin: 0.14 },
    { Year: 2016, Operating_Profit_Margin: 0.07 },
    { Year: 2017, Operating_Profit_Margin: 0.16 },
    { Year: 2018, Operating_Profit_Margin: 0.16 }
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
    const yField = 'Operating_Profit_Margin';

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

// E7 feedback: the lowest and second-lowest findings are split into two
// separate sentences/steps (see chart_map.json), so the annotation is split to
// match — function1 marks the lowest, function2 adds the second-lowest.
const E7_Q4_SECOND_YEARS = new Set(['2014', '2015']);

function ensureQ4Marker(svg, id, color) {
    svg.select(`#${id}`).remove();
    svg.append('defs')
        .append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
}

function drawQ4Pointer({ d3, container, g, markerId, color, year, label, dx, dy, cls }) {
    const c = d3.select(container).select(`circle[data-target="${year}"]`);
    const cx = Number(c.attr('cx'));
    const cy = Number(c.attr('cy'));

    g.append('line')
        .attr('class', cls)
        .attr('x1', cx + dx)
        .attr('x2', cx + Math.sign(dx) * 9)
        .attr('y1', cy + dy)
        .attr('y2', cy + Math.sign(dy) * 7)
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('marker-end', `url(#${markerId})`);

    g.append('text')
        .attr('class', cls)
        .attr('x', cx + dx + (dx > 0 ? 4 : -4))
        .attr('y', cy + dy - 4)
        .attr('text-anchor', dx > 0 ? 'start' : 'end')
        .attr('font-size', 12)
        .attr('font-weight', 800)
        .attr('fill', color)
        .text(label);
}

export function function1({ d3, container }) {
    // Step 1 — the lowest point (2016, 0.07).
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    g.selectAll('.e7-q4-function1, .e7-q4-function2').remove();

    ensureQ4Marker(svg, 'e7-q4-pointer-low', '#dc2626');
    d3.select(container).selectAll('circle[data-target]')
        .attr('opacity', (p) => (String(p.target) === '2016' ? 1 : 0.25))
        .attr('fill', (p) => (String(p.target) === '2016' ? '#dc2626' : '#4f46e5'))
        .attr('r', (p) => (String(p.target) === '2016' ? 6 : 4));
    drawQ4Pointer({ d3, container, g, markerId: 'e7-q4-pointer-low', color: '#dc2626', year: '2016', label: '2016: 0.07 (lowest)', dx: 58, dy: -58, cls: 'e7-q4-function1' });
}

export function function2({ d3, container }) {
    // Step 2 — keep the lowest, add the second-lowest points (tie: 2014 & 2015).
    function1({ d3, container });

    const svg = d3.select(container).select('svg');
    const g = svg.select('g');

    ensureQ4Marker(svg, 'e7-q4-pointer-second', '#f59e0b');
    d3.select(container).selectAll('circle[data-target]')
        .attr('opacity', (p) => (String(p.target) === '2016' || E7_Q4_SECOND_YEARS.has(String(p.target)) ? 1 : 0.2))
        .attr('fill', (p) => (String(p.target) === '2016' ? '#dc2626' : (E7_Q4_SECOND_YEARS.has(String(p.target)) ? '#f59e0b' : '#4f46e5')))
        .attr('r', (p) => (String(p.target) === '2016' ? 6 : (E7_Q4_SECOND_YEARS.has(String(p.target)) ? 5.5 : 4)));
    drawQ4Pointer({ d3, container, g, markerId: 'e7-q4-pointer-second', color: '#f59e0b', year: '2014', label: '2014: 0.14', dx: -54, dy: -54, cls: 'e7-q4-function2' });
    drawQ4Pointer({ d3, container, g, markerId: 'e7-q4-pointer-second', color: '#f59e0b', year: '2015', label: '2015: 0.14 (2nd lowest)', dx: 54, dy: 48, cls: 'e7-q4-function2' });
}

export function function3({ d3, container }) {}
