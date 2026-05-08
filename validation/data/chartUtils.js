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

    const CANDIDATE_ANGLES = [0, -25, -35, -45, -60, -75, -90];
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
