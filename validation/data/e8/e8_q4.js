import { autoRotateXAxisLabels, rebuildSvgInPlace } from '../chartUtils.js';

export const data_rows = [
    { Year: 2008, 'Immigration rate per thousand inhabitants': 36.34 },
    { Year: 2009, 'Immigration rate per thousand inhabitants': 31.64 },
    { Year: 2010, 'Immigration rate per thousand inhabitants': 33.46 },
    { Year: 2011, 'Immigration rate per thousand inhabitants': 39.09 },
    { Year: 2012, 'Immigration rate per thousand inhabitants': 38.57 },
    { Year: 2013, 'Immigration rate per thousand inhabitants': 38.83 },
    { Year: 2014, 'Immigration rate per thousand inhabitants': 40.14 },
    { Year: 2015, 'Immigration rate per thousand inhabitants': 41.79 },
    { Year: 2016, 'Immigration rate per thousand inhabitants': 39.23 },
    { Year: 2017, 'Immigration rate per thousand inhabitants': 40.88 },
    { Year: 2018, 'Immigration rate per thousand inhabitants': 40.54 },
    { Year: 2019, 'Immigration rate per thousand inhabitants': 43.01 }
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
    const yField = 'Immigration rate per thousand inhabitants';

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

function renderAdjacentDifferenceChart({ d3, container, highlightMax = false }) {
    injectSimpleLineStyles();

    const csvMaxPair = '2008-2009';
    const csvMaxDifference = 4.70;
    const differences = data_rows.slice(0, -1).map((row, index) => {
        const next = data_rows[index + 1];
        const label = `${row.Year}-${next.Year}`;
        const value = Math.abs(Number(next['Immigration rate per thousand inhabitants']) - Number(row['Immigration rate per thousand inhabitants']));
        return {
            label,
            value: label === csvMaxPair ? csvMaxDifference : value,
        };
    });

    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 56, bottom: 68, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;


    container.classList.add('validation-simple-line-host');

    const xScale = d3.scaleBand()
        .domain(differences.map((d) => d.label))
        .range([0, plotW])
        .padding(0.22);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(differences, (d) => d.value) ?? 0])
        .nice()
        .range([plotH, 0]);

    const svg = rebuildSvgInPlace({ d3, container, viewBox: `0 0 ${width} ${height}` });
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(yScale).ticks(5));
    g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${plotH})`)
        .call(d3.axisBottom(xScale));
    autoRotateXAxisLabels(g.select('.x-axis'));

    g.selectAll('rect.main-bar')
        .data(differences)
        .join('rect')
        .attr('class', 'main-bar')
        .attr('x', (d) => xScale(d.label))
        .attr('width', xScale.bandwidth())
        .attr('y', (d) => yScale(d.value))
        .attr('height', (d) => plotH - yScale(d.value))
        .attr('fill', (d) => highlightMax && d.label === csvMaxPair ? '#dc2626' : '#94a3b8')
        .attr('opacity', (d) => !highlightMax || d.label === csvMaxPair ? 0.95 : 0.35)
        .attr('data-target', (d) => d.label)
        .attr('data-value', (d) => d.value);

    if (!highlightMax) return;

    const maxX = (xScale(csvMaxPair) ?? 0) + xScale.bandwidth() / 2;
    const maxY = yScale(csvMaxDifference);
    g.append('text')
        .attr('class', 'e8-q4-function2')
        .attr('x', maxX)
        .attr('y', maxY - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#dc2626')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .text('4.70');
}

export function function1({ d3, container }) {
    renderAdjacentDifferenceChart({ d3, container, highlightMax: false });
}

export function function2({ d3, container }) {
    // Per reviewer: do NOT rebuild the chart. Operate on function1's existing
    // bars — transition fill/opacity for the max bar vs others, then fade in
    // the "4.70" label above the max bar.
    const csvMaxPair = '2008-2009';
    const csvMaxDifference = 4.70;

    const svg = d3.select(container).select('svg');
    if (svg.empty()) return;
    const g = svg.select('g');
    if (g.empty()) return;

    // Re-clicks: clean prior label.
    g.selectAll('.e8-q4-function2').remove();

    // Smooth transition on existing bars: max → red, others → gray;
    // max stays bright, others dim.
    g.selectAll('rect.main-bar')
        .transition()
        .duration(600)
        .attr('fill', function () {
            return this.getAttribute('data-target') === csvMaxPair ? '#dc2626' : '#94a3b8';
        })
        .attr('opacity', function () {
            return this.getAttribute('data-target') === csvMaxPair ? 0.95 : 0.35;
        });

    // Locate the max bar in the DOM to place the "4.70" label above it
    // (uses the bar's actual x/width/y — no need to recompute scales).
    const maxBar = g.selectAll('rect.main-bar')
        .nodes()
        .find((node) => node.getAttribute('data-target') === csvMaxPair);
    if (!maxBar) return;
    const bx = Number(maxBar.getAttribute('x'));
    const bw = Number(maxBar.getAttribute('width'));
    const by = Number(maxBar.getAttribute('y'));

    g.append('text')
        .attr('class', 'e8-q4-function2')
        .attr('x', bx + bw / 2)
        .attr('y', by - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#dc2626')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('opacity', 0)
        .text(csvMaxDifference.toFixed(2))
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function3({ d3, container }) {}
