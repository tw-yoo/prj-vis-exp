import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2008, 'Number of victims': 488 },
    { Year: 2009, 'Number of victims': 454 },
    { Year: 2010, 'Number of victims': 491 },
    { Year: 2011, 'Number of victims': 437 },
    { Year: 2012, 'Number of victims': 474 },
    { Year: 2013, 'Number of victims': 419 },
    { Year: 2014, 'Number of victims': 355 },
    { Year: 2015, 'Number of victims': 313 },
    { Year: 2016, 'Number of victims': 264 },
    { Year: 2017, 'Number of victims': 306 },
    { Year: 2018, 'Number of victims': 302 },
    { Year: 2019, 'Number of victims': 294 },
    { Year: 2020, 'Number of victims': 25 }
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
    const yField = 'Number of victims';

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

function getE4Q6Geometry(d3) {
    const xField = 'Year';
    const yField = 'Number of victims';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = data_rows.map((d) => String(d[xField]));
    const yValues = data_rows.map((d) => Number(d[yField])).filter(Number.isFinite);
    const xScale = d3.scaleBand().domain(xDomain).range([0, plotW]).padding(0.2);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...yValues), Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    return { xField, yField, plotW, plotH, xScale, yScale };
}

function getE4Q6RangeStats() {
    const yField = 'Number of victims';
    const inRange = data_rows.filter((d) => Number(d.Year) >= 2010 && Number(d.Year) <= 2019);
    const max = inRange.reduce((b, r) => Number(r[yField]) > b.value ? { year: String(r.Year), value: Number(r[yField]) } : b, { value: -Infinity });
    const min = inRange.reduce((b, r) => Number(r[yField]) < b.value ? { year: String(r.Year), value: Number(r[yField]) } : b, { value: Infinity });
    return { max, min, diff: max.value - min.value };
}

function ensureE4Q6ArrowMarker(svg) {
    if (!svg.select('defs#e4-q6-defs').empty()) return;
    const defs = svg.append('defs').attr('id', 'e4-q6-defs');
    ['e4-q6-arrow-start', 'e4-q6-arrow-end'].forEach((id, idx) => {
        defs.append('marker')
            .attr('id', id)
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 5)
            .attr('refY', 5)
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('orient', idx === 0 ? 'auto-start-reverse' : 'auto')
            .append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .attr('fill', '#ef4444');
    });
}

export function function1({ d3, container }) {
    const { plotH, xScale } = getE4Q6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q6-focus-band').remove();

    const x2010 = xScale('2010') ?? 0;
    const x2019End = (xScale('2019') ?? 0) + xScale.bandwidth();

    g.insert('rect', ':first-child')
        .attr('class', 'validation-q6-focus-band')
        .attr('x', x2010 - 6)
        .attr('y', 0)
        .attr('width', (x2019End + 6) - (x2010 - 6))
        .attr('height', plotH)
        .attr('fill', '#dbeafe')
        .attr('opacity', 0)
        .transition()
        .duration(600)
        .attr('opacity', 0.45);

    g.selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('opacity', function (d) {
            const yr = Number(d.Year);
            return yr >= 2010 && yr <= 2019 ? 1 : 0.35;
        });
}

export function function2({ d3, container }) {
    const { xField, yField, xScale, yScale } = getE4Q6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q6-extreme-label').remove();

    const { max, min } = getE4Q6RangeStats();

    g.selectAll('.main-bar')
        ;

    [{ ...max, label: 'max' }, { ...min, label: 'min' }].forEach(({ year, value, label }) => {
        const cx = (xScale(year) ?? 0) + xScale.bandwidth() / 2;
        const yTop = yScale(value);
        g.append('text')
            .attr('class', 'validation-q6-extreme-label')
            .attr('x', cx)
            .attr('y', yTop - 8)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'sans-serif')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', label === 'max' ? '#2563eb' : '#ef4444')
            .attr('opacity', 0)
            .text(`${label} ${value}`)
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });
}

export function function3({ d3, container }) {
    const { plotW, yScale } = getE4Q6Geometry(d3);
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    if (g.empty()) return;

    g.selectAll('.validation-q6-diff-arrow, .validation-q6-diff-label').remove();
    ensureE4Q6ArrowMarker(svg);

    const { max, min, diff } = getE4Q6RangeStats();
    const yTop = yScale(max.value);
    const yBot = yScale(min.value);
    const arrowX = plotW - 22;

    g.append('line')
        .attr('class', 'validation-q6-diff-arrow')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', yBot)
        .attr('y2', yBot)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e4-q6-arrow-start)')
        .attr('marker-end', 'url(#e4-q6-arrow-end)')
        .transition()
        .duration(650)
        .attr('y2', yTop);

    g.append('text')
        .attr('class', 'validation-q6-diff-label')
        .attr('x', arrowX - 8)
        .attr('y', (yTop + yBot) / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(`Δ ${diff}`)
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
