import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2000, 'Number of people in millions': 1.88 },
    { Year: 2001, 'Number of people in millions': 1.93 },
    { Year: 2002, 'Number of people in millions': 1.98 },
    { Year: 2003, 'Number of people in millions': 2.02 },
    { Year: 2004, 'Number of people in millions': 2.07 },
    { Year: 2005, 'Number of people in millions': 2.12 },
    { Year: 2006, 'Number of people in millions': 2.17 },
    { Year: 2007, 'Number of people in millions': 2.22 },
    { Year: 2008, 'Number of people in millions': 2.28 },
    { Year: 2009, 'Number of people in millions': 2.34 },
    { Year: 2010, 'Number of people in millions': 2.39 },
    { Year: 2011, 'Number of people in millions': 2.45 },
    { Year: 2012, 'Number of people in millions': 2.47 },
    { Year: 2013, 'Number of people in millions': 2.5 },
    { Year: 2014, 'Number of people in millions': 2.52 },
    { Year: 2015, 'Number of people in millions': 2.54 },
    { Year: 2016, 'Number of people in millions': 2.57 },
    { Year: 2017, 'Number of people in millions': 2.6 },
    { Year: 2018, 'Number of people in millions': 2.64 },
    { Year: 2019, 'Number of people in millions': 2.68 },
    { Year: 2020, 'Number of people in millions': 2.71 }
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
    const yField = 'Number of people in millions';

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

export function function1({ d3, container }) {
    const xField = 'Year';
    const yField = 'Number of people in millions';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    d3.select(container).selectAll('.validation-simple-line-tooltip').remove();

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    // R11 (round 3): reserve extra top margin for the summary title.
    // Round 6 fix: reserve right margin so the (2000/2020) legend sits OUTSIDE
    // the plot area, not overlapping the 2010 bar's right edge.
    const margin = { top: 48, right: 88, bottom: 56, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const minRow = data_rows.reduce((best, row) => (
        Number(row[yField]) < Number(best[yField]) ? row : best
    ), data_rows[0]);
    const maxRow = data_rows.reduce((best, row) => (
        Number(row[yField]) > Number(best[yField]) ? row : best
    ), data_rows[0]);
    const targetRow = data_rows.find((row) => Number(row[xField]) === 2010);

    const minValue = Number(minRow[yField]);
    const maxValue = Number(maxRow[yField]);
    const averageValue = (minValue + maxValue) / 2;
    const targetValue = Number(targetRow?.[yField] ?? 0);

    const firstSegment = minValue / 2;
    const secondSegment = maxValue / 2;

    const chartRows = [
        {
            label: `${minRow[xField]} & ${maxRow[xField]} average`,
            type: 'stacked-average',
            total: averageValue,
            segments: [
                {
                    label: String(minRow[xField]),
                    value: firstSegment,
                    color: '#93c5fd'
                },
                {
                    label: String(maxRow[xField]),
                    value: secondSegment,
                    color: '#1d4ed8'
                }
            ]
        },
        {
            label: String(targetRow?.[xField] ?? 2010),
            type: 'target',
            total: targetValue,
            segments: [
                {
                    label: String(targetRow?.[xField] ?? 2010),
                    value: targetValue,
                    color: '#9ca3af'
                }
            ]
        }
    ];

    const xScale = d3.scaleBand()
        .domain(chartRows.map((d) => d.label))
        .range([0, plotW])
        .padding(0.42);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(chartRows, (d) => d.total) ?? 0])
        .nice()
        .range([plotH, 0]);
    svg.selectAll('*').remove();

    const g = svg.append('g')
        .attr('class', 'validation-function1-average-bar-layer')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).ticks(6));

    const xAxis = g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));

    autoRotateXAxisLabels(xAxis);

    g.append('text')
        .attr('class', 'x-axis-label')
        .attr('x', plotW / 2)
        .attr('y', plotH + 46)
        .attr('text-anchor', 'middle')
        .text(xField);

    g.append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -plotH / 2)
        .attr('y', -42)
        .attr('text-anchor', 'middle')
        .text(yField);

    chartRows.forEach((bar) => {
        const x = xScale(bar.label);
        const barW = xScale.bandwidth();
        let runningValue = 0;

        g.selectAll(`rect.segment-${bar.type}`)
            .data(bar.segments.map((segment) => {
                const y0 = runningValue;
                const y1 = runningValue + segment.value;
                runningValue = y1;
                return { ...segment, barLabel: bar.label, y0, y1, total: bar.total };
            }))
            .join('rect')
            .attr('class', `main-bar segment-${bar.type}`)
            .attr('x', x)
            .attr('width', barW)
            .attr('fill', (d) => d.color)
            .attr('data-target', (d) => d.barLabel)
            .attr('data-value', (d) => d.total)
            .attr('data-x-value', (d) => d.barLabel)
            .attr('data-y-value', (d) => String(d.total))
            .attr('data-segment-label', (d) => d.label)
        .attr('y', (d) => yScale(d.y1))
            .attr('height', (d) => Math.max(0, yScale(d.y0) - yScale(d.y1)));
    });

    // Theme K (#36 round 3): legend explaining which color = 2000, which = 2020.
    const legendData = [
        { label: `${minRow[xField]}`, color: '#93c5fd' },
        { label: `${maxRow[xField]}`, color: '#1d4ed8' },
    ];
    // Place legend in the reserved right margin (plotW + 12), well clear of bars.
    const legendG = g.append('g')
        .attr('class', 'validation-q4-legend')
        .attr('transform', `translate(${plotW + 12}, 6)`);
    legendData.forEach((row, i) => {
        const ry = i * 18;
        legendG.append('rect')
            .attr('x', 0)
            .attr('y', ry)
            .attr('width', 12)
            .attr('height', 12)
            .attr('rx', 2)
            .attr('fill', row.color);
        legendG.append('text')
            .attr('x', 18)
            .attr('y', ry + 10)
            .attr('font-size', 11)
            .attr('font-family', 'sans-serif')
            .attr('fill', '#111827')
            .text(row.label);
    });

    // R11 (round 3): function1 draws the full comparison label too.
    g.append('text')
        .attr('class', 'validation-q4-summary')
        .attr('x', plotW / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .text(`Average ${averageValue.toFixed(3)} ${averageValue > targetValue ? '>' : '<'} 2010 (${targetValue.toFixed(2)})`);
}

// R11 (round 3): function2 / function3 re-apply function1's complete visual idempotently.
export function function2({ d3, container }) {
    function1({ d3, container });
}

export function function3({ d3, container }) {
    function1({ d3, container });
}
