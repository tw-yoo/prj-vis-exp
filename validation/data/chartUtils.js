/**
 * Auto-rotate x-axis tick labels to prevent overlap.
 * Ported from src/rendering/common/axisTickLabelRotation.ts +
 * src/rendering/common/wrapAxisTickLabels.ts
 *
 * Call immediately after the x-axis group is appended to the DOM:
 *   autoRotateXAxisLabels(g.select('.x-axis'));
 *
 * @param {d3.Selection} xAxisSelection - d3 selection of the x-axis <g>
 */
export function autoRotateXAxisLabels(xAxisSelection) {
    const labelNodes = xAxisSelection.selectAll('text').nodes()
        .filter(n => (n.textContent ?? '').trim().length > 0);

    if (labelNodes.length <= 1) return;

    // R9 (round 3): bias toward -45° for crowded x-axes (≥ 8 ticks). Reviewer
    // complained that auto-pick was leaving e3_q6 and e6_q4 at 0° because the
    // overlap was small but the labels still looked cramped.
    const isCrowded = labelNodes.length >= 8;
    const CANDIDATE_ANGLES = isCrowded
        ? [-45, -25, -35, -60, -75, -90, 0]
        : [0, -25, -35, -45, -60, -75, -90];
    const OVERLAP_TOLERANCE_PX = 1;

    // ── Snapshot original state ──────────────────────────────────────────────
    labelNodes.forEach(label => {
        if (label.dataset._origTransform == null) {
            label.dataset._origTransform = label.getAttribute('transform') ?? '';
            label.dataset._origAnchor   = label.getAttribute('text-anchor') ?? 'middle';
            label.dataset._origDy       = label.getAttribute('dy') ?? '';
        }
    });

    function resetLabels() {
        labelNodes.forEach(label => {
            const t = label.dataset._origTransform;
            if (t) label.setAttribute('transform', t);
            else    label.removeAttribute('transform');
            label.setAttribute('text-anchor', label.dataset._origAnchor ?? 'middle');
            const dy = label.dataset._origDy;
            if (dy) label.setAttribute('dy', dy);
            else    label.removeAttribute('dy');
        });
    }

    // ── Rotate all labels to a given angle ───────────────────────────────────
    function applyAngle(angleDeg) {
        resetLabels();
        if (angleDeg === 0) return;

        labelNodes.forEach(label => {
            let refY = 0;
            try {
                const bbox = label.getBBox();
                if (bbox && Number.isFinite(bbox.y) && Number.isFinite(bbox.height)) {
                    refY = bbox.y + bbox.height / 2;
                }
            } catch (_) {
                refY = parseFloat(label.getAttribute('y') ?? '0') || 0;
            }
            const base = label.dataset._origTransform ?? '';
            const rotate = `rotate(${angleDeg},0,${refY})`;
            label.setAttribute('transform', [base, rotate].filter(Boolean).join(' '));
            label.setAttribute('text-anchor', 'end');
        });
    }

    // ── Measure total x-overlap across adjacent labels ───────────────────────
    function calcOverlap() {
        const rects = labelNodes
            .map(l => l.getBoundingClientRect())
            .filter(r => Number.isFinite(r.left) && Number.isFinite(r.right) && r.width > 0)
            .sort((a, b) => (a.left + a.right) / 2 - (b.left + b.right) / 2);

        let total = 0;
        for (let i = 0; i < rects.length - 1; i++) {
            const overlapX = rects[i].right - rects[i + 1].left;
            const overlapY =
                Math.min(rects[i].bottom, rects[i + 1].bottom) -
                Math.max(rects[i].top,    rects[i + 1].top);
            if (overlapX > 0 && overlapY > 1) total += overlapX;
        }
        return total;
    }

    // ── Try each candidate angle, pick best ──────────────────────────────────
    let bestAngle = 0;
    let bestOverlap = Infinity;

    for (const angle of CANDIDATE_ANGLES) {
        applyAngle(angle);
        const overlap = calcOverlap();
        if (overlap < bestOverlap) {
            bestOverlap = overlap;
            bestAngle   = angle;
        }
        if (bestOverlap <= OVERLAP_TOLERANCE_PX) break;
    }

    applyAngle(bestAngle);
}

/**
 * R14 (round 5): In-place SVG rebuild for chart-mode-switch helpers.
 *
 * Previous pattern was `container.innerHTML = ''` + append fresh <svg>.
 * That destroyed the existing SVG, which caused the user-reported
 * "all bars disappear and reappear" flash because:
 *   - the DOM node was destroyed (browser repaint of nothing)
 *   - a new SVG was created and added to DOM (second repaint with new content)
 *   - the freezeOverlay didn't cover the moment of transition cleanly
 *
 * Instead, this helper:
 *   - reuses the existing <svg> element (the DOM node stays in place — no
 *     destroy/recreate of the SVG box itself)
 *   - fades out all current children (`opacity 0`) and removes them after
 *   - calls `build(svg)` so the caller appends new layout into the SAME svg
 *   - the new content starts at opacity 0 and fades in after a small delay,
 *     creating a smooth crossfade between layouts
 *
 * Two calling styles are supported:
 *
 * 1. **Direct (preferred for the common case)**: no `build` callback. The
 *    helper sets the existing <svg>'s own `opacity` to 0 and schedules a
 *    delayed fade-back-in. Caller appends new content directly to the svg
 *    after the call — children inherit the svg's transient transparency, so
 *    the visible result is: existing children fade out (200 ms) + svg fades
 *    back to opacity 1 (300 ms after a 220 ms delay), revealing new content.
 *    There is a brief (~200 ms) blank window between the two phases.
 *
 *        const svg = rebuildSvgInPlace({ d3, container, viewBox: '0 0 640 360' });
 *        const g = svg.append('g')...;
 *        // ... build content ...
 *
 * 2. **Callback (preferred when fine-grained control over fade-in is needed)**:
 *    pass `build: (svg) => {...}`. Each direct top-level <g> appended by build
 *    starts at opacity 0 and is transitioned to opacity 1, producing a smooth
 *    crossfade with no blank window. (defs are skipped.)
 *
 * @param {object} args
 * @param {object} args.d3 - d3 module (the live one with transitions)
 * @param {HTMLElement} args.container - chart container element
 * @param {string} args.viewBox - the new viewBox string to apply (e.g. "0 0 640 360")
 * @param {(svg: d3.Selection) => any} [args.build] - optional callback. See above.
 * @param {number} [args.fadeOutMs=200] - how long the existing content fades out.
 * @param {number} [args.fadeInDelayMs=220] - delay before new content starts fading in.
 * @param {number} [args.fadeInMs=300] - how long the new content fades in.
 * @returns {d3.Selection} the svg selection (so the caller can chain `.append(...)`).
 */
export function rebuildSvgInPlace({
    d3,
    container,
    viewBox,
    build,
    fadeOutMs = 200,
    fadeInDelayMs = 220,
    fadeInMs = 300,
    instant = false,
}) {
    let svg = d3.select(container).select('svg');
    if (svg.empty()) {
        svg = d3.select(container).append('svg')
            .attr('viewBox', viewBox)
            .style('overflow', 'visible');
    } else if (viewBox) {
        svg.attr('viewBox', viewBox);
    }

    // Instant mode (used by E5–E10 helpers): no fade animation. The freeze-
    // overlay in viewer.js already masks the rebuild step, so any visible
    // "disappear and reappear" between freeze-overlay removal and the new
    // chart appearing would come from the fade timeline below. Skipping it
    // makes the swap atomic within a single JS task — the browser paints the
    // new chart directly with no blank/faded frame. E2–E4 keep the default
    // (instant=false) and continue to crossfade as before.
    if (instant) {
        const existingChildren = Array.from(svg.node()?.children ?? []);
        if (typeof build === 'function') {
            // Callback API: build first so a new top-level <g> exists, then
            // remove the old children. SVG is never visually empty.
            build(svg);
            existingChildren.forEach((child) => child.remove());
            return svg;
        }
        // Direct API: caller will append after we return. Remove old now —
        // the synchronous append that follows lands before the next paint.
        existingChildren.forEach((child) => child.remove());
        return svg;
    }

    // Snapshot the existing top-level children (about to be replaced).
    const existingChildren = Array.from(svg.node()?.children ?? []);
    // Mark them so the auto-fade-in step (callback API) can tell new children apart.
    existingChildren.forEach((child) => child.setAttribute('data-fading-out', '1'));

    // Fade out + remove every existing top-level child of the svg.
    existingChildren.forEach((child) => {
        d3.select(child)
            .interrupt()
            .transition()
            .duration(fadeOutMs)
            .attr('opacity', 0)
            .on('end', function () { this.remove(); });
    });

    if (typeof build === 'function') {
        // Callback API: build into svg, then auto-fade-in each new top-level child.
        build(svg);
        const newChildren = Array.from(svg.node()?.children ?? []).filter((c) => !c.hasAttribute('data-fading-out'));
        newChildren.forEach((child) => {
            if (child.tagName && child.tagName.toLowerCase() === 'defs') return;
            d3.select(child)
                .attr('opacity', 0)
                .transition()
                .delay(fadeInDelayMs)
                .duration(fadeInMs)
                .attr('opacity', 1);
        });
        return svg;
    }

    // Direct API: make the svg itself transparent and schedule a fade-back-in.
    // Any children the caller appends synchronously after this call inherit the
    // svg's transient opacity, so they're invisible until the svg fades in.
    svg.interrupt()
        .attr('opacity', 0)
        .transition()
        .delay(fadeInDelayMs)
        .duration(fadeInMs)
        .attr('opacity', 1);

    return svg;
}
