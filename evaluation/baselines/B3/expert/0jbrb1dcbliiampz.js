import { autoRotateXAxisLabels } from '../chartUtils.js';

export const data_rows = [
    { Year: 2011, 'Investments in Billion Euros': 37 },
    { Year: 2012, 'Investments in Billion Euros': 27.6 },
    { Year: 2013, 'Investments in Billion Euros': 15.3 },
    { Year: 2014, 'Investments in Billion Euros': 37.5 },
    { Year: 2015, 'Investments in Billion Euros': 48 },
    { Year: 2016, 'Investments in Billion Euros': 58.6 },
    { Year: 2017, 'Investments in Billion Euros': 36.6 },
    { Year: 2018, 'Investments in Billion Euros': 86.8 }
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
    console.log(
        `[e2_q1 debug] renderValidationSimpleBarChart CALLED  (t=${Math.round(performance.now())}ms)`,
        'existing svg:', !!container.querySelector('svg'),
        'existing bar count:', container.querySelectorAll('rect.main-bar').length,
    );
    // R1 idempotent-renderer guard (round 2). If the container already has any
    // SVG (drawn by an earlier call, a helper, or a function2 layout switch),
    // preserve it — don't redraw. Switching to a different chart wipes the
    // container via loadChart's resetChartContainer, so this guard only triggers
    // for the same chart's repeated render calls (step clicks).
    if (container.querySelector('svg')) {
        console.log('[e2_q1 debug]   → R1 guard: SVG exists, returning no-op');
        return;
    }
    console.log('[e2_q1 debug]   → no SVG, building fresh');
    injectChartStyles();

    const data = data_rows;
    const xField = 'Year';
    const yField = 'Investments in Billion Euros';

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
    // CRITICAL: explicit opacity='1' is REQUIRED. Without it, getAttribute('opacity')
    // returns null, and D3's `.transition().attr('opacity', X)` interpolates from
    // `+null = 0` → X — i.e. every bar would fade in from INVISIBLE on the first
    // step click. That's the "전체 차트가 사라졌다 다시 나타남" flash the user reported.
    // CSS-default opacity=1 makes the bar VISIBLE, but D3 transitions read the
    // ATTRIBUTE, not the computed style, so the attribute must be set explicitly.
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

    console.log(`[e2_q1 debug]   → base render COMPLETE, bar count=${container.querySelectorAll('rect.main-bar').length}`);

    // Install a MutationObserver to flag any future destruction of these bars.
    // The observer fires once for whatever mutation occurs and then disconnects
    // after a 5-second window so we don't pollute later steps.
    try {
        const svgNode = container.querySelector('svg');
        if (svgNode && !window.__e2q1ObserverInstalled) {
            window.__e2q1ObserverInstalled = true;
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((m) => {
                    const removed = Array.from(m.removedNodes || []);
                    const removedBars = removed.filter((n) => n.nodeType === 1 && (n.classList?.contains('main-bar') || n.querySelectorAll?.('rect.main-bar').length > 0));
                    if (removedBars.length > 0) {
                        console.warn('[e2_q1 debug] !! MutationObserver: bars/SVG REMOVED',
                            'count:', removedBars.length,
                            'target:', m.target?.tagName,
                            'parent classes:', m.target?.className,
                            'at t=' + Math.round(performance.now()) + 'ms',
                        );
                        removedBars.forEach((n) => {
                            if (n.classList?.contains('main-bar')) {
                                console.warn('  removed bar:', n.getAttribute('data-target'), 'fill:', n.getAttribute('fill'));
                            } else {
                                console.warn('  removed container:', n.tagName, 'with', n.querySelectorAll?.('rect.main-bar').length, 'bars');
                            }
                        });
                    }
                });
            });
            observer.observe(container, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                window.__e2q1ObserverInstalled = false;
                console.log('[e2_q1 debug] MutationObserver disconnected after 5s window');
            }, 5000);
            console.log('[e2_q1 debug]   → MutationObserver installed (5s window)');
        }
    } catch (e) {
        console.error('[e2_q1 debug] failed to install MutationObserver:', e);
    }
}

const E2_Q1_FOCUS_YEARS = new Set(['2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018']);
const E2_Q1_ABOVE_THRESHOLD_YEARS = new Set(['2011', '2012', '2014']);
const E2_Q1_BELOW_THRESHOLD_YEARS = new Set(['2013']);
const E2_Q1_BASE_FILL = '#69b3a2';
const E2_Q1_ABOVE_FILL = '#2563eb';   // blue (reviewer e2_feedback row 1)
const E2_Q1_BELOW_FILL = '#f97316';   // orange (reviewer e2_feedback row 2)

function getE2Q1Geometry(d3) {
    const yField = 'Investments in Billion Euros';
    const width = 640;
    const height = 360;
    const margin = { top: 32, right: 24, bottom: 48, left: 56 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const yValues = data_rows.map((d) => Number(d[yField])).filter(Number.isFinite);
    const yScale = d3.scaleLinear()
        .domain([Math.min(0, ...yValues), Math.max(0, ...yValues)])
        .nice()
        .range([plotH, 0]);
    return { yField, plotW, plotH, yScale };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG: trace the lifecycle of function1 to find the "all bars disappear and
// reappear" flash. Logs at every stage what the DOM/bars look like.
// ─────────────────────────────────────────────────────────────────────────────
function _e2q1DebugSnapshotBars(label, container) {
    const svg = container.querySelector('svg');
    const containerRect = container.getBoundingClientRect?.() ?? null;
    const svgRect = svg?.getBoundingClientRect?.() ?? null;
    const bars = svg ? Array.from(svg.querySelectorAll('rect.main-bar')) : [];
    const overlay = document.querySelector('.validation-chart-freeze-overlay');
    const overlayRect = overlay?.getBoundingClientRect?.() ?? null;
    console.groupCollapsed(`[e2_q1 debug] ${label}  (t=${Math.round(performance.now())}ms)`);
    console.log('container exists:', !!container, 'rect:', containerRect);
    console.log('svg exists:', !!svg, 'viewBox:', svg?.getAttribute('viewBox'), 'opacity:', svg?.getAttribute('opacity'), 'rect:', svgRect);
    console.log('overlay exists:', !!overlay, 'rect:', overlayRect, 'innerHTML.length:', overlay?.innerHTML?.length);
    console.log('bar count:', bars.length);
    if (bars.length > 0) {
        const summary = bars.slice(0, 8).map((b) => ({
            year: b.getAttribute('data-target'),
            x: b.getAttribute('x'),
            y: b.getAttribute('y'),
            width: b.getAttribute('width'),
            height: b.getAttribute('height'),
            fill: b.getAttribute('fill'),
            opacity: b.getAttribute('opacity'),
            inDOM: !!b.parentNode,
            visible: b.getBoundingClientRect?.()?.width > 0,
        }));
        console.table(summary);
    }
    // Also probe parent <g> opacity / display
    const mainG = svg?.querySelector('g');
    if (mainG) {
        console.log('parent <g>:', {
            opacity: mainG.getAttribute('opacity'),
            display: mainG.getAttribute('display'),
            transform: mainG.getAttribute('transform'),
            'computed display': window.getComputedStyle(mainG).display,
            'computed visibility': window.getComputedStyle(mainG).visibility,
            'computed opacity': window.getComputedStyle(mainG).opacity,
        });
    }
    console.groupEnd();
}

export function function1({ d3, container }) {
    _e2q1DebugSnapshotBars('A. function1 ENTRY', container);

    // Per reviewer (review_e2.csv row 1): function2의 구간 highlight + bar recolor를
    // function1에서 가장 먼저 실행해야 함. So f1 now does highlight + recolor + threshold.
    const referenceValue = 22;
    const { plotW, plotH, yScale } = getE2Q1Geometry(d3);
    const y = yScale(referenceValue);
    const g = d3.select(container).select('svg > g');
    if (g.empty()) {
        console.warn('[e2_q1 debug] B. function1 EARLY RETURN — no <svg><g>');
        return;
    }
    _e2q1DebugSnapshotBars('B. function1 after locating <g>', container);

    g.selectAll('.validation-focus-2011-2014, .validation-threshold-22').remove();

    // 1) Focus highlight rect over 2011–2014 (behind bars).
    const focusBars = g.selectAll('.main-bar')
        .filter((d) => E2_Q1_FOCUS_YEARS.has(String(d.Year)));
    const xValues = focusBars.nodes().map((node) => Number(node.getAttribute('x')));
    const widths = focusBars.nodes().map((node) => Number(node.getAttribute('width')));
    if (xValues.length > 0) {
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues.map((x, index) => x + widths[index]));
        g.insert('rect', ':first-child')
            .attr('class', 'validation-focus-2011-2014')
            .attr('x', minX - 8)
            .attr('y', 0)
            .attr('width', maxX - minX + 16)
            .attr('height', plotH)
            .attr('fill', '#dbeafe')
            .attr('opacity', 0)
            .transition()
            .duration(600)
            .attr('opacity', 0.55);
    }

    // 2) Recolor bars in-place (no rebuild). Per reviewer (e2_feedback round-4 row 1):
    //    above-threshold bars (2011/2012/2014) turn BLUE here. 2013 stays at base color
    //    (becomes orange only in function2). Non-focus years (2015-2018) keep base color
    //    and dim. R5 is explicitly overridden here per reviewer feedback.
    _e2q1DebugSnapshotBars('C. before bar recolor transition', container);
    const barSel = g.selectAll('.main-bar');
    console.log('[e2_q1 debug] bar selection size:', barSel.size(), 'nodes:', barSel.nodes());
    barSel
        .transition('e2q1-bar-recolor')
        .duration(600)
        .on('start', function (d) {
            // Logs the FIRST bar's transition start.
            if (this === barSel.nodes()[0]) {
                console.log('[e2_q1 debug] D. transition START on first bar', {
                    year: this.getAttribute('data-target'),
                    fillNow: this.getAttribute('fill'),
                    opacityNow: this.getAttribute('opacity'),
                });
            }
        })
        .attr('fill', (d) => E2_Q1_ABOVE_THRESHOLD_YEARS.has(String(d.Year)) ? E2_Q1_ABOVE_FILL : E2_Q1_BASE_FILL)
        .attr('opacity', (d) => E2_Q1_FOCUS_YEARS.has(String(d.Year)) ? 1 : 0.35)
        .on('end', function (d) {
            if (this === barSel.nodes()[barSel.size() - 1]) {
                _e2q1DebugSnapshotBars('E. last bar transition END', container);
            }
        });

    // Mid-transition probe at ~half duration to confirm bars are interpolating, not gone.
    setTimeout(() => _e2q1DebugSnapshotBars('M. mid-transition probe (300ms after schedule)', container), 300);

    // 3) Threshold line at y = 22.
    g.append('line')
        .attr('class', 'validation-threshold-22')
        .attr('x1', 0)
        .attr('x2', 0)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', '#111827')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 4')
        .transition()
        .duration(650)
        .attr('x2', plotW);

    g.append('text')
        .attr('class', 'validation-threshold-22')
        .attr('x', plotW + 6)
        .attr('y', y)
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#111827')
        .attr('opacity', 0)
        .text('22')
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function2({ d3, container }) {
    // Per reviewer (e2_feedback round-4 row 2): recolor 2013 to ORANGE (below
    // threshold). Remove the ✕ mark entirely. Keep above-threshold bars BLUE
    // (carried from function1). Non-focus years stay base/dimmed.
    const { plotW } = getE2Q1Geometry(d3);
    const g = d3.select(container).select('svg > g');
    if (g.empty()) return;

    g.selectAll('.validation-q1-summary, .validation-q1-2013-x').remove();

    // Apply final color scheme to every bar (cumulative with function1's blue):
    //   above threshold → BLUE,  below threshold → ORANGE,  non-focus → BASE+dim.
    g.selectAll('.main-bar')
        .transition()
        .duration(600)
        .attr('fill', (d) => {
            const year = String(d.Year);
            if (E2_Q1_ABOVE_THRESHOLD_YEARS.has(year)) return E2_Q1_ABOVE_FILL;
            if (E2_Q1_BELOW_THRESHOLD_YEARS.has(year)) return E2_Q1_BELOW_FILL;
            return E2_Q1_BASE_FILL;
        })
        .attr('opacity', (d) => E2_Q1_FOCUS_YEARS.has(String(d.Year)) ? 1 : 0.35);

    g.append('text')
        .attr('class', 'validation-q1-summary')
        .attr('x', plotW - 4)
        .attr('y', 12)
        .attr('text-anchor', 'end')
        .attr('font-family', 'sans-serif')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#2563eb')
        .attr('opacity', 0)
        .text('7 years > 22')
        .transition()
        .duration(650)
        .attr('opacity', 1);
}

export function function3({ d3, container }) {}
