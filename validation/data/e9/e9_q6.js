import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2008, 'Sales volume in tonnes': 140398 },
    { Year: 2009, 'Sales volume in tonnes': 134122 },
    { Year: 2010, 'Sales volume in tonnes': 131826 },
    { Year: 2011, 'Sales volume in tonnes': 135453 },
    { Year: 2012, 'Sales volume in tonnes': 135185 },
    { Year: 2013, 'Sales volume in tonnes': 136447 },
    { Year: 2014, 'Sales volume in tonnes': 96766 },
    { Year: 2015, 'Sales volume in tonnes': 100248 },
    { Year: 2016, 'Sales volume in tonnes': 102164 },
    { Year: 2017, 'Sales volume in tonnes': 91743 },
    { Year: 2018, 'Sales volume in tonnes': 94668 },
    { Year: 2019, 'Sales volume in tonnes': 99927 }
];

function injectChartStyles() {
    if (document.getElementById('validation-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'validation-chart-styles';
    style.textContent = `
        .validation-chart-host {
            position: relative;
            background: #ffffff;
            color: #000000;
        }
        .validation-chart-host svg {
            display: block;
            overflow: visible;
            max-width: 100%;
            height: auto;
        }
        .validation-chart-host .x-axis line,
        .validation-chart-host .x-axis path,
        .validation-chart-host .y-axis line,
        .validation-chart-host .y-axis path {
            stroke: #000000;
            stroke-opacity: 1;
        }
        .validation-chart-host .x-axis text,
        .validation-chart-host .y-axis text,
        .validation-chart-host .x-axis-label,
        .validation-chart-host .y-axis-label {
            fill: #000000;
            fill-opacity: 1;
            font-size: 11px;
            font-family: sans-serif;
        }
        .validation-chart-host .main-bar {
            cursor: pointer;
        }
        .validation-chart-tooltip {
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
        .validation-chart-tooltip[hidden] {
            display: none;
        }
        .validation-chart-tooltip__row {
            display: grid;
            grid-template-columns: auto 1fr;
            column-gap: 10px;
            align-items: baseline;
        }
        .validation-chart-tooltip__label {
            color: #6b7280;
            font-size: 12px;
        }
        .validation-chart-tooltip__value {
            color: #111827;
            font-size: 13px;
            font-weight: 600;
            text-align: right;
        }
    `;
    document.head.appendChild(style);
}

export function renderValidationSimpleBarChart({ container }) {
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        return;
    }
    injectChartStyles();

    const data = data_rows;
    const xField = 'Year';
    const yField = 'Sales volume in tonnes';

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Clear previous content
    container.innerHTML = '';
    container.classList.add('validation-chart-host');

    const xDomain = data.map((d) => String(d[xField]));
    const yValues = data.map((d) => Number(d[yField])).filter(Number.isFinite);
    const maxY = Math.max(0, ...yValues);
    const minY = Math.min(0, ...yValues);

    const xScale = d3.scaleBand()
        .domain(xDomain)
        .range([0, plotW])
        .padding(0.2);

    const yScale = d3.scaleLinear()
        .domain([minY, maxY])
        .nice()
        .range([plotH, 0]);

    const zeroY = yScale(0);

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

    // Bars
    g.selectAll('rect.main-bar')
        .data(data)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(String(d[xField])))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => {
            const v = Number(d[yField]);
            return v >= 0 ? yScale(v) : zeroY;
        })
        .attr('height', (d) => Math.abs(yScale(Number(d[yField])) - zeroY))
        .attr('fill', '#69b3a2')
        .attr('opacity', 1)
        .attr('data-target', (d) => String(d[xField]))
        .attr('data-value', (d) => Number(d[yField]))
        .attr('data-x-value', (d) => String(d[xField]))
        .attr('data-y-value', (d) => String(Number(d[yField])));

    // Hover tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'validation-chart-tooltip';
    tooltip.setAttribute('hidden', '');
    tooltip.innerHTML = `
        <div class="validation-chart-tooltip__row">
            <span class="validation-chart-tooltip__label">label</span>
            <span class="validation-chart-tooltip__value" id="tt-x-val"></span>
        </div>
        <div class="validation-chart-tooltip__row">
            <span class="validation-chart-tooltip__label">value</span>
            <span class="validation-chart-tooltip__value" id="tt-y-val"></span>
        </div>
    `;
    container.appendChild(tooltip);

    g.selectAll('rect.main-bar')
        .on('mouseover', function (event, d) {
            tooltip.removeAttribute('hidden');
            tooltip.querySelector('#tt-x-val').textContent = String(d[xField]);
            tooltip.querySelector('#tt-y-val').textContent = String(Number(d[yField]));
        })
        .on('mousemove', function (event) {
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left + 12;
            const y = event.clientY - rect.top - 10;
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        })
        .on('mouseout', function () {
            tooltip.setAttribute('hidden', '');
        });
}

export function function1({ d3, container }) {
    const xField = 'Year';
    const yField = 'Sales volume in tonnes';

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;

    d3.select(container).selectAll('.validation-chart-tooltip').remove();

    const svgNode = svg.node();
    const viewBox = svgNode.getAttribute('viewBox') || '0 0 640 360';
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    const margin = { top: 32, right: 132, bottom: 56, left: 72 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const firstSixYears = [2008, 2009, 2010, 2011, 2012, 2013];
    const lastSixYears = [2014, 2015, 2016, 2017, 2018, 2019];

    const rowsByYear = new Map(data_rows.map((d) => [Number(d[xField]), d]));

    const firstSixRows = firstSixYears.map((year) => rowsByYear.get(year)).filter(Boolean);
    const lastSixRows = lastSixYears.map((year) => rowsByYear.get(year)).filter(Boolean);

    const makeSegments = (rows) => {
        let runningTotal = 0;
        return rows.map((row, index) => {
            const value = Number(row[yField]);
            const y0 = runningTotal;
            const y1 = runningTotal + value;
            runningTotal = y1;
            return {
                year: String(row[xField]),
                value,
                index,
                y0,
                y1
            };
        });
    };

    const chartRows = [
        {
            label: '2008–2013 total',
            total: 813431,
            segments: makeSegments(firstSixRows)
        },
        {
            label: '2014–2019 total',
            total: 598516,
            segments: makeSegments(lastSixRows)
        }
    ];

    chartRows.forEach((bar) => {
        let runningTotal = 0;
        bar.segments = bar.segments.map((segment) => {
            const y0 = runningTotal;
            const y1 = runningTotal + segment.value;
            runningTotal = y1;
            return { ...segment, y0, y1, barLabel: bar.label, total: bar.total };
        });
    });

    const colorScale = d3.scaleSequential()
        .domain([0, 5])
        .interpolator(d3.interpolateYlGnBu);

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
        .attr('class', 'validation-function1-stacked-period-layer')
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
        .attr('y', -56)
        .attr('text-anchor', 'middle')
        .text(yField);

    const barGroups = g.selectAll('g.period-bar')
        .data(chartRows)
        .join('g')
        .attr('class', 'period-bar')
        .attr('transform', (d) => `translate(${xScale(d.label)},0)`);

    barGroups.selectAll('rect.main-bar')
        .data((d) => d.segments)
        .join('rect')
        .attr('class', 'main-bar stacked-segment')
        .attr('x', 0)
        .attr('width', xScale.bandwidth())
        .attr('fill', (d) => colorScale(d.index))
        .attr('data-target', (d) => d.barLabel)
        .attr('data-value', (d) => d.total)
        .attr('data-x-value', (d) => d.barLabel)
        .attr('data-y-value', (d) => String(d.total))
        .attr('data-segment-year', (d) => d.year)
        .attr('data-segment-value', (d) => String(d.value))
        .attr('y', (d) => yScale(d.y1))
        .attr('height', (d) => Math.max(0, yScale(d.y0) - yScale(d.y1)));

    const legend = g.append('g')
        .attr('class', 'year-gradient-legend')
        .attr('transform', `translate(${plotW + 24},0)`);

    const legendItems = legend.selectAll('g.legend-item')
        .data(firstSixYears.map((year, index) => ({ year, index })))
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (_, i) => `translate(0,${i * 24})`)
        .style('opacity', 0);

    legendItems.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('rx', 2)
        .attr('fill', (d) => colorScale(d.index));

    legendItems.append('text')
        .attr('x', 18)
        .attr('y', 10)
        .attr('fill', '#000000')
        .attr('font-size', 10)
        .attr('font-family', 'sans-serif')
        .text((d, i) => `${firstSixYears[i]} / ${lastSixYears[i]}`);

    legendItems
        .style('opacity', 1);

    // R11 (round 3): function1 draws every visual chunk the explanation describes:
    // both per-bar totals AND the difference between them.
    chartRows.forEach((bar) => {
        const cx = (xScale(bar.label) ?? 0) + xScale.bandwidth() / 2;
        g.append('text')
            .attr('class', 'validation-q6-total-label')
            .attr('x', cx)
            .attr('y', yScale(bar.total) - 8)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 13)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .text(bar.total.toLocaleString());
    });

    const diff = Math.abs(chartRows[0].total - chartRows[1].total);
    g.append('text')
        .attr('class', 'validation-q6-summary')
        .attr('x', plotW / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#dc2626')
        .text(`Difference: ${diff.toLocaleString()} tonnes`);
}

// R11 (round 3): function2 / function3 re-apply function1's complete visual idempotently.
export function function2({ d3, container }) {
    function1({ d3, container });
}

export function function3({ d3, container }) {
    function1({ d3, container });
}
