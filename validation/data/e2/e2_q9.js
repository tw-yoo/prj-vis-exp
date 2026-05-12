import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2000, Percentage_of_Population: 0.088 },
    { Year: 2001, Percentage_of_Population: 0.086 },
    { Year: 2002, Percentage_of_Population: 0.105 },
    { Year: 2003, Percentage_of_Population: 0.109 },
    { Year: 2004, Percentage_of_Population: 0.109 },
    { Year: 2005, Percentage_of_Population: 0.102 },
    { Year: 2006, Percentage_of_Population: 0.106 },
    { Year: 2007, Percentage_of_Population: 0.097 },
    { Year: 2008, Percentage_of_Population: 0.096 },
    { Year: 2009, Percentage_of_Population: 0.115 },
    { Year: 2010, Percentage_of_Population: 0.132 },
    { Year: 2011, Percentage_of_Population: 0.135 },
    { Year: 2012, Percentage_of_Population: 0.128 },
    { Year: 2013, Percentage_of_Population: 0.127 },
    { Year: 2014, Percentage_of_Population: 0.117 },
    { Year: 2015, Percentage_of_Population: 0.113 },
    { Year: 2016, Percentage_of_Population: 0.102 },
    { Year: 2017, Percentage_of_Population: 0.097 },
    { Year: 2018, Percentage_of_Population: 0.09 },
    { Year: 2019, Percentage_of_Population: 0.089 }
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
    const xField = 'Year';
    const yField = 'Percentage_of_Population';

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

function getFocusedPopulationRows() {
    return data_rows.filter((d) => Number(d.Year) >= 2000 && Number(d.Year) <= 2008);
}

function getPopulationTargets() {
    const rows = getFocusedPopulationRows();
    const smallest = rows.reduce((best, row) => (
        Number(row.Percentage_of_Population) < Number(best.Percentage_of_Population) ? row : best
    ), rows[0]);
    const distinctValues = Array.from(new Set(rows.map((d) => Number(d.Percentage_of_Population)))).sort((a, b) => b - a);
    const secondLargestValue = distinctValues[1];
    const secondLargest = rows.find((d) => Number(d.Percentage_of_Population) === secondLargestValue);
    return { smallest, secondLargest };
}

function renderFocusedPopulationLine({ d3, container }) {
    const rows = getFocusedPopulationRows();
    const xField = 'Year';
    const yField = 'Percentage_of_Population';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 80, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xDomain = rows.map((d) => String(d[xField]));
    const yValues = rows.map((d) => Number(d[yField]));
    const xScale = d3.scalePoint().domain(xDomain).range([0, plotW]).padding(0.5);
    const yScale = d3.scaleLinear().domain([d3.min(yValues) ?? 0, d3.max(yValues) ?? 1]).nice().range([plotH, 0]);
    const line = d3.line().x((d) => xScale(String(d[xField])) ?? 0).y((d) => yScale(Number(d[yField])));

    container.innerHTML = '';
    container.classList.add('validation-simple-line-host');

    const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('data-m-left', margin.left).attr('data-m-top', margin.top).style('overflow', 'visible');
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(6));
    const xAxis = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${plotH})`).call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(xAxis);

    const path = g.append('path')
        .datum(rows)
        .attr('class', 'main-line')
        .attr('fill', 'none')
        .attr('stroke', '#4f46e5')
        .attr('stroke-width', 2)
        .attr('d', line);
    const length = path.node()?.getTotalLength?.() ?? 0;
    path.attr('stroke-dasharray', `${length} ${length}`)
        .attr('stroke-dashoffset', length)
        .transition()
        .duration(700)
        .attr('stroke-dashoffset', 0);

    g.selectAll('circle[data-target]')
        .data(rows)
        .join('circle')
        .attr('cx', (d) => xScale(String(d[xField])) ?? 0)
        .attr('cy', (d) => yScale(Number(d[yField])))
        .attr('r', 0)
        .attr('fill', '#4f46e5')
        .attr('opacity', 0.85)
        .attr('data-target', (d) => String(d[xField]))
        .attr('data-value', (d) => String(d[yField]))
        .attr('data-x-value', (d) => String(d[xField]))
        .attr('data-y-value', (d) => String(d[yField]))
        .transition()
        .duration(550)
        .attr('r', 4);
}

function highlightPopulationPoint(d3, container, year) {
    d3.select(container).selectAll('circle[data-target]')
        .transition()
        .duration(600)
        .attr('r', function () {
            return this.getAttribute('data-target') === String(year) ? 8 : 3.5;
        })
        .attr('fill', function () {
            return this.getAttribute('data-target') === String(year) ? '#ef4444' : '#bfdbfe';
        })
        .attr('opacity', function () {
            return this.getAttribute('data-target') === String(year) ? 1 : 0.35;
        });
}

export function function1({ d3, container }) {
    renderFocusedPopulationLine({ d3, container });
}

export function function2({ d3, container }) {
    highlightPopulationPoint(d3, container, getPopulationTargets().smallest.Year);
}

export function function3({ d3, container }) {
    highlightPopulationPoint(d3, container, getPopulationTargets().secondLargest.Year);
}

export function function4({ d3, container }) {
    const { smallest, secondLargest } = getPopulationTargets();
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 80, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const rows = getFocusedPopulationRows();
    const yValues = rows.map((d) => Number(d.Percentage_of_Population));
    const yScale = d3.scaleLinear().domain([d3.min(yValues) ?? 0, d3.max(yValues) ?? 1]).nice().range([plotH, 0]);
    const g = d3.select(container).select('svg > g');
    const svg = d3.select(container).select('svg');
    if (g.empty()) return;

    g.selectAll('.validation-population-diff').remove();
    svg.select('defs#e2-q9-defs').remove();
    const defs = svg.append('defs').attr('id', 'e2-q9-defs');
    defs.append('marker')
        .attr('id', 'e2-q9-arrow')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 5)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#ef4444');

    [smallest, secondLargest].forEach((row) => {
        const value = Number(row.Percentage_of_Population);
        const y = yScale(value);
        g.append('line')
            .attr('class', 'validation-population-diff')
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
            .attr('class', 'validation-population-diff')
            .attr('x', plotW + 6)
            .attr('y', y)
            .attr('dominant-baseline', 'middle')
            .attr('font-size', 12)
            .attr('font-weight', 700)
            .attr('fill', '#111827')
            .attr('opacity', 0)
            .text(value.toFixed(3))
            .transition()
            .duration(650)
            .attr('opacity', 1);
    });

    const y1 = yScale(Number(smallest.Percentage_of_Population));
    const y2 = yScale(Number(secondLargest.Percentage_of_Population));
    const arrowX = plotW + 46;
    g.append('line')
        .attr('class', 'validation-population-diff')
        .attr('x1', arrowX)
        .attr('x2', arrowX)
        .attr('y1', y1)
        .attr('y2', y1)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 2)
        .attr('marker-start', 'url(#e2-q9-arrow)')
        .attr('marker-end', 'url(#e2-q9-arrow)')
        .transition()
        .duration(650)
        .attr('y2', y2);
    g.append('text')
        .attr('class', 'validation-population-diff')
        .attr('x', arrowX + 8)
        .attr('y', (y1 + y2) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#ef4444')
        .attr('opacity', 0)
        .text(Math.abs(Number(secondLargest.Percentage_of_Population) - Number(smallest.Percentage_of_Population)).toFixed(3))
        .transition()
        .duration(650)
        .attr('opacity', 1);
}
