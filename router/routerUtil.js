/** Returns null / validation errors if any (stub) */
export function validateAtomicOpsSpec(opsSpec) {
    return null;
}

/** Detect if user prefers reduced motion (accessibility) */
export function prefersReducedMotion() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/** Find nearest ancestor scrollable/root container */
export function findScrollRoot(el) {
    const isScrollContainer = (node) => {
        if (!node || node === window || node === document) return false;
        const style = getComputedStyle(node);
        const oy = style.overflowY;
        const ox = style.overflowX;
        return ['auto','scroll','overlay'].includes(oy) || ['auto','scroll','overlay'].includes(ox);
    };
    let node = el;
    while (node && node !== document.body) {
        if (isScrollContainer(node)) return node;
        node = node.parentElement;
    }
    return null;
}

/**
 * Create scrollytelling layout under a given host element or host id.
 * Returns:
 *   hostEl: the host container element
 *   rootEl: the scroll root (scroll container where steps are observed)
 *   graphicEl: the div where your chart (SVG etc) should render
 *   graphicId: id of that graphicEl
 *   stepsEl: container for step text elements
 */
export function createScrollyLayout(hostOrId, { stickyTop = 12 } = {}) {
    const host = typeof hostOrId === 'string' ? document.getElementById(hostOrId) : hostOrId;
    if (!host) throw new Error('createScrollyLayout: host not found');
    // 비우기
    while (host.firstChild) {
        host.removeChild(host.firstChild);
    }
    host.classList.add('scrolly');

    // sticky graphic wrapper
    const graphicWrap = document.createElement('div');
    graphicWrap.className = 'scrolly-graphic';
    graphicWrap.style.top = `${stickyTop}px`;

    const graphicEl = document.createElement('div');
    const graphicId = `${host.id}-graphic`;
    graphicEl.id = graphicId;
    graphicEl.className = 'chart-canvas';
    graphicWrap.appendChild(graphicEl);

    // steps container
    const stepsEl = document.createElement('div');
    stepsEl.className = 'scrolly-steps';
    stepsEl.id = `${host.id}-steps`;

    host.appendChild(graphicWrap);
    host.appendChild(stepsEl);

    const rootEl = findScrollRoot(host);
    return { hostEl: host, rootEl: rootEl, graphicEl, graphicId, stepsEl };
}

/**
 * Observe step sections and trigger callback when a step enters view.
 * onEnter receives (opKey, stepElement, stepIndex)
 */
export function observeSteps({ rootEl = null, stepsEl, onEnter, threshold = 0.6 }) {
    const steps = Array.from(stepsEl.querySelectorAll('.step'));
    if (!steps.length) return { disconnect() {} };

    let lastIdx = -1;
    const io = new IntersectionObserver(entries => {
        const visible = entries
            .filter(e => e.isIntersecting)
            .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;

        const idx = steps.indexOf(visible.target);
        if (idx === lastIdx) return;

        steps.forEach(s => s.classList.remove('is-active'));
        visible.target.classList.add('is-active');
        lastIdx = idx;

        const opKey = visible.target.dataset.op;
        onEnter(opKey, visible.target, idx);
    }, { root: rootEl || null, threshold });

    steps.forEach(s => io.observe(s));
    return { disconnect() { io.disconnect(); } };
}