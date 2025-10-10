export function getFilteredData(op, data) {
    if (!Array.isArray(data) || data.length === 0) return [];

    const field    = op?.field || 'target';
    const operator = String(op?.operator || '==');
    const value    = op?.value;
    const value2   = op?.value2 ?? (Array.isArray(value) && value.length > 1 ? value[1] : null);
    const group    = op?.group ?? null;

    // ---- accessor: 필드 선택 ----
    const accessor = (dv) => {
        const f = field;
        if (f === 'target' || f === 'x' || f === 'category' || f === dv.category) return dv.target;
        if (f === 'value'  || f === 'y' || f === 'measure'  || f === dv.measure)  return dv.value;
        if (f === 'group'  || f === 'series') return dv.group;
        if (f === 'id') return dv.id;
        return dv.target; // fallback to x/target
    };

    // ---- 스코프(그룹) 제한 ----
    const scope = group == null ? data : data.filter(dv => String(dv.group) === String(group));
    if (scope.length === 0) return [];

    // ---- 유틸 ----
    const isFiniteNum = (v) => Number.isFinite(Number(v));
    const toStr = (v) => (v == null ? '' : String(v));
    const parseTemporal = (v) => {
        if (v instanceof Date) return Number.isNaN(+v) ? null : v;
        const d = new Date(v);
        return Number.isNaN(+d) ? null : d; // "Jan 1 2000", "2000-01-01" 등 지원
    };

    // 이 필드가 temporal 인지 추정 (대부분이 Date 파싱 가능하면 temporal로 간주)
    const temporalHits = scope.reduce((acc, dv) => acc + (parseTemporal(accessor(dv)) ? 1 : 0), 0);
    const isTemporalField = temporalHits >= Math.max(1, Math.floor(scope.length * 0.6)); // 60% 이상 파싱되면 temporal

    // ---- 비범위 연산자 (in/not-in/contains/== 등) ----
    const opLC = operator.toLowerCase();

    if (opLC === 'in' || opLC === 'not-in') {
        const arr = Array.isArray(value) ? value : [value];
        if (isTemporalField) {
            const set = new Set(arr.map(v => {
                const d = parseTemporal(v); return d ? +d : null;
            }).filter(v => v !== null));
            return scope.filter(dv => {
                const d = parseTemporal(accessor(dv));
                const has = d ? set.has(+d) : false;
                return (opLC === 'in') ? has : !has;
            });
        } else if (scope.every(dv => isFiniteNum(accessor(dv))) && arr.every(isFiniteNum)) {
            const set = new Set(arr.map(Number));
            return scope.filter(dv => (opLC === 'in') ? set.has(Number(accessor(dv))) : !set.has(Number(accessor(dv))));
        } else {
            const set = new Set(arr.map(toStr));
            return scope.filter(dv => (opLC === 'in') ? set.has(toStr(accessor(dv))) : !set.has(toStr(accessor(dv))));
        }
    }

    if (opLC === 'contains' || opLC === 'startswith' || opLC === 'endswith') {
        // 텍스트 연산자는 temporal이어도 문자열로 처리
        const rhs = toStr(value).toLowerCase();
        return scope.filter(dv => {
            const s = toStr(accessor(dv)).toLowerCase();
            if (opLC === 'contains')   return s.includes(rhs);
            if (opLC === 'startswith') return s.startsWith(rhs);
            return s.endsWith(rhs);
        });
    }

    if (opLC === '==' || opLC === '!=') {
        if (isTemporalField) {
            const dvVal = (dv) => { const d = parseTemporal(accessor(dv)); return d ? +d : NaN; };
            const rhs = parseTemporal(value);
            if (!rhs) return []; // 비교 불가
            const tRhs = +rhs;
            return scope.filter(dv => {
                const tLhs = dvVal(dv);
                const eq = Number.isFinite(tLhs) && tLhs === tRhs;
                return (opLC === '==') ? eq : !eq;
            });
        } else if (scope.every(dv => isFiniteNum(accessor(dv))) && isFiniteNum(value)) {
            const rhs = Number(value);
            return scope.filter(dv => (opLC === '==') ? Number(accessor(dv)) === rhs
                : Number(accessor(dv)) !== rhs);
        } else {
            const rhs = toStr(value);
            return scope.filter(dv => (opLC === '==') ? toStr(accessor(dv)) === rhs
                : toStr(accessor(dv)) !== rhs);
        }
    }

    // ---- 범위 연산자 (>, >=, <, <=, between, betweenExclusive) ----
    const isRangeOp = ['>','>=','<','<=','between','betweenexclusive'].includes(opLC);
    if (!isRangeOp) return [];

    // temporal 우선: Date → timestamp 로 비교 (정렬 가정 → 이진 탐색)
    if (isTemporalField) {
        const ts = scope.map(dv => {
            const d = parseTemporal(accessor(dv));
            return d ? +d : NaN;
        });
        // 정렬되어 있다고 가정하지만, 혹시 모를 NaN 제거/무시
        const pairs = scope.map((dv, i) => ({ dv, t: ts[i] }))
            .filter(p => Number.isFinite(p.t))
            .sort((a,b) => a.t - b.t);
        const tokens = pairs.map(p => p.t);

        const lowerBound = (arr, x) => { // first i with arr[i] >= x
            let lo=0, hi=arr.length;
            while (lo<hi) { const mid=(lo+hi)>>1; if (arr[mid] < x) lo=mid+1; else hi=mid; }
            return lo;
        };
        const upperBound = (arr, x) => { // first i with arr[i] > x
            let lo=0, hi=arr.length;
            while (lo<hi) { const mid=(lo+hi)>>1; if (arr[mid] <= x) lo=mid+1; else hi=mid; }
            return lo;
        };
        const sliceByIdx = (s,e) => pairs.slice(Math.max(0,s), Math.min(e, pairs.length)).map(p => p.dv);

        const tA = parseTemporal(value);   if (!tA) return [];
        const tB = value2 != null ? parseTemporal(value2) : null;

        switch (opLC) {
            case '>':  return sliceByIdx(upperBound(tokens, +tA), pairs.length);
            case '>=': return sliceByIdx(lowerBound(tokens, +tA), pairs.length);
            case '<':  return sliceByIdx(0, lowerBound(tokens, +tA));
            case '<=': return sliceByIdx(0, upperBound(tokens, +tA));
            case 'between':
            case 'betweenexclusive': {
                if (!tB) return [];
                let lo = +tA, hi = +tB; if (lo > hi) [lo,hi] = [hi,lo];
                const inclusive = (opLC === 'between');
                const start = inclusive ? lowerBound(tokens, lo) : upperBound(tokens, lo);
                const end   = inclusive ? upperBound(tokens, hi) : lowerBound(tokens, hi);
                if (start >= end) return [];
                return sliceByIdx(start, end);
            }
        }
    }

    // 숫자 비교 가능하면 숫자로
    const allFieldNumeric = scope.every(dv => isFiniteNum(accessor(dv)));
    const specValueNumeric  = isFiniteNum(value);
    const specValue2Numeric = value2 == null ? true : isFiniteNum(value2);

    if (allFieldNumeric && specValueNumeric && (opLC.startsWith('between') ? specValue2Numeric : true)) {
        const lhs = (dv) => Number(accessor(dv));
        const a = Number(value);
        const b = (value2 == null ? a : Number(value2));
        switch (opLC) {
            case '>':  return scope.filter(dv => lhs(dv) >  a);
            case '>=': return scope.filter(dv => lhs(dv) >= a);
            case '<':  return scope.filter(dv => lhs(dv) <  a);
            case '<=': return scope.filter(dv => lhs(dv) <= a);
            case 'between':
            case 'betweenexclusive': {
                let lo=a, hi=b; if (lo>hi) [lo,hi]=[hi,lo];
                const inclusive = (opLC === 'between');
                return scope.filter(dv => {
                    const x = lhs(dv);
                    return inclusive ? (x >= lo && x <= hi) : (x > lo && x < hi);
                });
            }
        }
    }

    // 마지막 폴백: 문자열 인덱스 기반 (정렬 가정)
    const tokens = scope.map(dv => toStr(accessor(dv)));
    const firstIdx = (tok) => tokens.indexOf(toStr(tok));
    const lastIdx  = (tok) => tokens.lastIndexOf(toStr(tok));
    const idxAFirst = firstIdx(value);
    const idxALast  = lastIdx(value);

    switch (opLC) {
        case '>':  return (idxALast  === -1) ? [] : scope.slice(idxALast + 1);
        case '>=': return (idxAFirst === -1) ? [] : scope.slice(idxAFirst);
        case '<':  return (idxAFirst === -1) ? [] : scope.slice(0, idxAFirst);
        case '<=': return (idxALast  === -1) ? [] : scope.slice(0, idxALast + 1);
        case 'between':
        case 'betweenexclusive': {
            if (value2 == null) return [];
            let aFirst = firstIdx(value);
            let aLast  = lastIdx(value);
            let bFirst = firstIdx(value2);
            let bLast  = lastIdx(value2);
            if (aFirst === -1 || bFirst === -1) return [];
            let start = Math.min(aFirst, bFirst);
            let endInclusive = Math.max(aLast, bLast);
            if (opLC === 'betweenexclusive') {
                start = Math.min(aLast, bLast) + 1;
                endInclusive = Math.max(aFirst, bFirst) - 1;
            }
            if (start > endInclusive) return [];
            return scope.slice(start, endInclusive + 1);
        }
        default: return [];
    }
}

export function addChildDiv(parentId, newDivId, where = "append") {
    const parent = document.getElementById(parentId);
    if (!parent) {
        console.error(`Parent div with id="${parentId}" not found.`);
        return;
    }
    if (document.getElementById(newDivId)) {
        console.warn(`Div with id="${newDivId}" already exists.`);
        return;
    }
    const newDiv = document.createElement("div");
    newDiv.id = newDivId;

    if (where === "prepend" && typeof parent.prepend === "function") {
        parent.prepend(newDiv);
    } else {
        parent.appendChild(newDiv);
    }
}

export function clearDivChildren(divId) {
    const el = document.getElementById(divId);
    if (!el) {
        console.warn(`Div with id="${divId}" not found.`);
        return;
    }
    // 모든 자식 요소 제거
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}
// =============================
// Shared UI + Caption + Sequencing
// =============================

export function updateOpCaption(chartId, text, opts = {}) {
    try {
        if (!text) return;
        const svg = d3.select(`#${chartId}`).select("svg");
        if (svg.empty()) return;
        const mLeft = +svg.attr("data-m-left") || 0;
        const mTop  = +svg.attr("data-m-top")  || 40;
        const plotW = +svg.attr("data-plot-w") || 300;
        const plotH = +svg.attr("data-plot-h") || 300;

        const align    = opts.align || 'center';
        const offsetY  = (typeof opts.offset === 'number' ? opts.offset : 40);
        const fontSize = (opts.fontSize || 16);
        const x = align === 'start' ? (mLeft + 10)
              : align === 'end'   ? (mLeft + plotW - 10)
                                  : (mLeft + plotW / 2);
        const y = mTop + plotH + offsetY;

        svg.selectAll(".op-caption").remove();
        svg.append("text")
            .attr("class", "op-caption")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", align === 'start' ? 'start' : (align === 'end' ? 'end' : 'middle'))
            .style("font-size", `${fontSize}px`)
            .style("fill", "#444")
            .text(String(text));
    } catch (e) {
        console.warn("updateOpCaption failed", e);
    }

}

// =============================
// Ops Explain Overlay helpers
// =============================

function buildOpsExplainTokens(opKeys, textSpec = {}) {
    if (!Array.isArray(opKeys)) return [];
    return opKeys.map(k => {
        if (textSpec && typeof textSpec === 'object') {
            if (textSpec[k] != null) return String(textSpec[k]);
            if (textSpec.text && textSpec.text[k] != null) return String(textSpec.text[k]);
        }
        return `(${k})`;
    });
}

function attachOrUpdateOpsExplainOverlay(chartId, tokens, activeIndex = -1, opts = {}) {
    const host = document.getElementById(chartId);
    if (!host) return { el: null, height: 0, top: undefined };
    const svg = host.querySelector('svg');
    if (!svg || !svg.getBoundingClientRect) return { el: null, height: 0, top: undefined };

    const hostStyle = window.getComputedStyle(host);
    if (hostStyle.position === 'static' || !hostStyle.position) host.style.position = 'relative';

    let overlay = host.querySelector(':scope > .ops-explain-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'ops-explain-overlay';
        host.appendChild(overlay);
    }

    const svgRect = svg.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const centerLeft = (svgRect.left - hostRect.left) + (svgRect.width / 2);
    overlay.style.position = 'absolute';
    overlay.style.pointerEvents = 'none';
    overlay.style.left = `${centerLeft}px`;
    overlay.style.transform = 'translate(-50%, 0)';
    overlay.style.textAlign = 'center';
    overlay.style.lineHeight = '1.35';
    overlay.style.fontSize = (opts.fontSize ? `${opts.fontSize}px` : '20px'); // default 20px
    overlay.style.maxWidth = `${Math.max(1, Math.round(svgRect.width * 0.8))}px`; // 80% of chart width
    overlay.style.whiteSpace = 'normal';
    overlay.style.wordBreak = 'break-word';
    overlay.style.margin = '0';
    overlay.style.padding = '0';

    // Build content
    overlay.innerHTML = '';
    const container = document.createElement('div');
    tokens.forEach((tok, idx) => {
        const span = document.createElement('span');
        span.className = 'ops-token';
        span.textContent = String(tok);
        span.style.color = (activeIndex === idx ? '#111' : '#aaa');
        span.style.fontWeight = (activeIndex === idx ? '700' : '400');
        span.style.marginRight = '6px';
        container.appendChild(span);
    });
    overlay.appendChild(container);

    // Now measure overlay height to compute top position
    const h = overlay.getBoundingClientRect ? (overlay.getBoundingClientRect().height || 0) : 0;
    // Compute top position with clamping: always above navigator, never overlapping
    const chartBottom = (svgRect.bottom - hostRect.top);
    const gapTop = (typeof opts.gapTop === 'number') ? opts.gapTop : ((typeof opts.gap === 'number') ? opts.gap : 8);
    const gapBottom = (typeof opts.gapBottom === 'number') ? opts.gapBottom : ((typeof opts.gap === 'number') ? opts.gap : 8);
    const bias = (typeof opts.positionBias === 'number') ? Math.min(1, Math.max(0, opts.positionBias)) : 0.25; // 0=stick to chart, 0.5=center
    let topPx;
    if (typeof opts.navTopPx === 'number') {
        const space = Math.max(0, opts.navTopPx - chartBottom);
        const minTop = chartBottom + gapTop;            // keep a small gap from chart
        const maxTop = opts.navTopPx - h - gapBottom;   // keep a small gap from nav
        if (maxTop <= minTop) {
            topPx = minTop; // not enough room; nav will be pushed down by caller if needed
        } else {
            const free = Math.max(0, (space - h) - (gapTop + gapBottom));
            topPx = minTop + free * bias;               // bias towards chart (compact)
            topPx = Math.min(Math.max(minTop, topPx), maxTop);
        }
    } else {
        // Fallback: just below the chart with a gap
        topPx = chartBottom + gapTop;
    }
    overlay.style.top = `${topPx}px`;
    return { el: overlay, height: h, top: topPx };
}

function updateOpsExplainActive(chartId, activeIndex) {
    try {
        const host = document.getElementById(chartId);
        if (!host) return;
        const tokens = host.querySelectorAll(':scope > .ops-explain-overlay .ops-token');
        tokens.forEach((el, idx) => {
            const active = (activeIndex === idx);
            el.style.color = active ? '#111' : '#aaa';
            el.style.fontWeight = active ? '700' : '400';
        });
    } catch (_) {}
}

export function attachOpNavigator(chartId, { x = 15, y = 15 } = {}) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) {
        console.error("attachOpNavigator: SVG not found for chartId:", chartId);
        return { group: null, prevButton: null, nextButton: null, stepIndicator: null, htmlStepIndicator: null };
    }
    svg.select(".nav-controls-group").remove();

    const navGroup = svg.append("g")
        .attr("class", "nav-controls-group")
        .attr("transform", `translate(${x}, ${y})`)
        .style("pointer-events", "all");

    navGroup.append("rect")
        .attr("class", "nav-bg")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", 170)
        .attr("height", 35)
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1);

    // 이전 버튼 생성
    const prevButton = navGroup.append("g")
        .attr("class", "nav-btn prev-btn")
        .attr("transform", "translate(5, 5)")
        .style("cursor", "pointer");

    prevButton.append("rect")
        .attr("width", 50)
        .attr("height", 25)
        .attr("rx", 3)
        .attr("fill", "#6c757d")
        .attr("stroke", "#5a6268")
        .attr("stroke-width", 1);

    prevButton.append("text")
        .attr("x", 25)
        .attr("y", 17)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .style("pointer-events", "none")
        .text("← Prev");

    // 다음 버튼
    const nextButton = navGroup.append("g")
        .attr("class", "nav-btn next-btn")
        .attr("transform", "translate(115, 5)")
        .style("cursor", "pointer");

    nextButton.append("rect")
        .attr("width", 50)
        .attr("height", 25)
        .attr("rx", 3)
        .attr("fill", "#007bff")
        .attr("stroke", "#0056b3")
        .attr("stroke-width", 1);

    nextButton.append("text")
        .attr("x", 25)
        .attr("y", 17)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .style("pointer-events", "none")
        .text("Next →");

    // 스텝 인디케이터 (SVG, 숨김)
    const stepIndicator = navGroup.append("text")
        .attr("class", "step-indicator")
        .attr("x", 85)
        .attr("y", 22)
        .attr("text-anchor", "middle")
        .attr("fill", "black")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .style("pointer-events", "none")
        .style("opacity", 0);

    // Persistent HTML overlay for step indicator
    let htmlStepIndicator = null;
    try {
        const host = document.getElementById(chartId);
        if (host) {
            // Ensure host container is position: relative
            const hostStyle = window.getComputedStyle(host);
            if (hostStyle.position === "static" || !hostStyle.position) {
                host.style.position = "relative";
            }
            // Find or create nav-overlay
            let overlay = host.querySelector(".nav-overlay");
            if (!overlay) {
                overlay = document.createElement("div");
                overlay.className = "nav-overlay";
                host.appendChild(overlay);
            }
            overlay.style.position = "absolute";
            overlay.style.pointerEvents = "none";
            // Compute overlay position based on actual rendered nav group bounds
            const hostRect = host.getBoundingClientRect();
            const groupNode = navGroup.node();
            let groupRect = null;
            try { groupRect = groupNode.getBoundingClientRect(); } catch (_) { groupRect = null; }
            if (groupRect) {
                const centerLeft = (groupRect.left - hostRect.left) + (groupRect.width / 2);
                const centerTop  = (groupRect.top  - hostRect.top ) + (groupRect.height / 2);
                overlay.style.left = `${centerLeft}px`;
                overlay.style.top  = `${centerTop}px`;
                overlay.style.transform = 'translate(-50%, -50%)';
            } else {
                overlay.style.left = `${x}px`;
                overlay.style.top  = `${y}px`;
                overlay.style.transform = 'translate(85px, 18px)'; // fallback approximates group center
            }
            // Find or create nav-step-text inside overlay
            let stepText = overlay.querySelector(".nav-step-text");
            if (!stepText) {
                stepText = document.createElement("div");
                stepText.className = "nav-step-text";
                overlay.appendChild(stepText);
            }
            stepText.style.fontSize = '16px';
            stepText.style.fontWeight = 'bold';
            stepText.style.textAlign = 'center';
            stepText.style.whiteSpace = 'nowrap';
            htmlStepIndicator = stepText;
        }
    } catch (e) {
        // Fail gracefully
        htmlStepIndicator = null;
    }

    return { group: navGroup, prevButton, nextButton, stepIndicator, htmlStepIndicator };
}

// Helper: reposition nav-overlay to center on nav group
function repositionNavStepOverlay(chartId, ctrl) {
    try {
        const host = document.getElementById(chartId);
        if (!host || !ctrl || !ctrl.group) return;
        const overlay = host.querySelector(':scope > .nav-overlay');
        if (!overlay) return;
        const hostRect = host.getBoundingClientRect ? host.getBoundingClientRect() : null;
        const node = ctrl.group.node ? ctrl.group.node() : null;
        if (!hostRect || !node || !node.getBoundingClientRect) return;
        const groupRect = node.getBoundingClientRect();
        const centerLeft = (groupRect.left - hostRect.left) + (groupRect.width / 2);
        const centerTop  = (groupRect.top  - hostRect.top ) + (groupRect.height / 2);
        overlay.style.left = `${centerLeft}px`;
        overlay.style.top  = `${centerTop}px`;
        overlay.style.transform = 'translate(-50%, -50%)';
    } catch (e) {
        console.warn('repositionNavStepOverlay failed', e);
    }
}


export function updateNavigatorStates(ctrl, currentStep, totalSteps, displayTotalOps = null) {
    if (!ctrl || !ctrl.prevButton || !ctrl.nextButton || !ctrl.stepIndicator) return;
    const { prevButton, nextButton, stepIndicator, htmlStepIndicator } = ctrl;

    // 이전 버튼 상태 업데이트
    if (currentStep === 0) {
        prevButton.select("rect").attr("fill", "#6c757d").attr("opacity", 0.5);
        prevButton.style("cursor", "not-allowed");
    } else {
        prevButton.select("rect").attr("fill", "#007bff").attr("opacity", 1);
        prevButton.style("cursor", "pointer");
    }

    // 다음 버튼 상태 업데이트
    if (currentStep >= totalSteps - 1) {
        nextButton.select("rect").attr("fill", "#6c757d").attr("opacity", 0.5);
        nextButton.select("text").text("Done");
        nextButton.style("cursor", "not-allowed");
    } else {
        nextButton.select("rect").attr("fill", "#007bff").attr("opacity", 1);
        nextButton.select("text").text("Next →");
        nextButton.style("cursor", "pointer");
    }

    // 스텝 인디케이터 업데이트
    const denom = (displayTotalOps != null) ? displayTotalOps : totalSteps;
    // zero-based display when displayTotalOps is provided (e.g., 0/N .. N/N)
    const numerator = (displayTotalOps != null) ? currentStep : (currentStep + 1);
    stepIndicator.text(`${numerator}/${denom}`);
    // HTML persistent overlay update
    if (htmlStepIndicator) {
        htmlStepIndicator.textContent = `${numerator}/${denom}`;
    }
}

export async function runOpsSequence({
    chartId,
    vlSpec,
    opsSpec,
    textSpec = {},
    onReset,
    onRunOpsList,
    onCache,
    isLastKey = (k) => k === 'last',
    delayMs = 0,
    navOpts: initialNavOpts = { x: 15, y: 15 },
}) {
    const host = d3.select(`#${chartId}`);
    const svgInitial = host.select("svg");
    if (svgInitial.empty()) {
        console.error("runOpsSequence: SVG not found. Please render the chart first.");
        return;
    }

    // Ops and steps: introduce a zero-th step (render-only)
    const opKeys = Object.keys(opsSpec || {});
    const opsCount = opKeys.length;          // denominator in 0/opsCount .. opsCount/opsCount
    const totalSteps = opsCount + 1;         // 0..opsCount inclusive
    if (totalSteps === 1) return;            // nothing to do

    // Pull layout hints from the current svg (recomputed after each reset)
    const getLayout = () => {
        const svg = d3.select(`#${chartId}`).select("svg");
        const mLeft = +svg.attr("data-m-left") || 0;
        const mTop  = +svg.attr("data-m-top")  || 0;
        const plotW = +svg.attr("data-plot-w") || 0;
        const plotH = +svg.attr("data-plot-h") || 0;
        const captionYOffset = 40;
        const navWidth = 170;
        const navX = mLeft + (plotW / 2) - (navWidth / 2);
        const navY = mTop + plotH + captionYOffset + 20;
        return { navX, navY, captionYOffset };
    };

    const { navX, navY, captionYOffset } = getLayout();

    // Attach navigator once; we will reattach after each reset as DOM is re-rendered
    let ctrl = attachOpNavigator(chartId, { x: navX, y: navY });
    if (!ctrl.nextButton || !ctrl.prevButton || !ctrl.stepIndicator) {
        console.error("runOpsSequence: failed to attach navigator");
        return;
    }

    let currentStep = 0; // 0-based; 0 means render-only
    let isRunning = false;

    async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    async function runStep(i, fromDirection = 'forward') {
        // Always fully reset the chart to the initial render state
        if (typeof onReset === 'function') {
            await onReset();
        }

        // After reset, the SVG DOM is replaced; re-attach navigator and handlers
        const { navX: nx, navY: ny } = getLayout();

        // Attach navigator first (NO extra shift)
        ctrl = attachOpNavigator(chartId, { x: nx, y: ny });
        ctrl.nextButton.on('click.nav', nextHandler);
        ctrl.prevButton.on('click.nav', prevHandler);
        // Immediately update navigator state for the new step BEFORE any ops run
        updateNavigatorStates(ctrl, i, totalSteps, opsCount);
        repositionNavStepOverlay(chartId, ctrl);

        // --- Overlay & Navigator placement logic ---
        // Compute navTopPx from nav group bounding rect
        const navRect0 = ctrl.group && ctrl.group.node ? ctrl.group.node().getBoundingClientRect() : null;
        let navTopPx0 = navRect0 ? navRect0.top : undefined;
        const tokens = buildOpsExplainTokens(opKeys, textSpec || {});
        const activeIdx = (i > 0) ? (i - 1) : -1;
        const gapTopPx = 4;      // tighter gap to chart
        const gapBottomPx = 8;   // keep good spacing to buttons
        const bias = 0.12;       // stronger pull toward chart

        // Pass 1: place overlay using current nav top, measure placement
        const pass1 = attachOrUpdateOpsExplainOverlay(chartId, tokens, activeIdx, { fontSize: 20, navTopPx: navTopPx0, gapTop: gapTopPx, gapBottom: gapBottomPx, positionBias: bias });

        // If there isn't enough vertical space between chart bottom and nav top to fit overlay + gaps, push nav down
        if (typeof navTopPx0 === 'number' && pass1 && typeof pass1.top === 'number') {
            const overlayBottom = pass1.top + (pass1.height || 0);
            const needed = (overlayBottom + gapBottomPx) - navTopPx0;
            if (needed > 0) {
                // push navigator down by the shortfall
                ctrl.group.attr('transform', `translate(${nx}, ${ny + Math.ceil(needed)})`);
                // recompute nav top and re-place overlay centered in the new space
                const navRect1 = ctrl.group && ctrl.group.node ? ctrl.group.node().getBoundingClientRect() : null;
                const navTopPx1 = navRect1 ? navRect1.top : undefined;
                attachOrUpdateOpsExplainOverlay(chartId, tokens, activeIdx, { fontSize: 20, navTopPx: navTopPx1, gapTop: gapTopPx, gapBottom: gapBottomPx, positionBias: bias });
                repositionNavStepOverlay(chartId, ctrl);
            }
        }

        let result = null;
        if (i > 0) {
            const opKey = opKeys[i - 1];
            const opsList = opsSpec[opKey] || [];
            const isLast = !!isLastKey(opKey);

            if (typeof onRunOpsList === 'function') {
                result = await onRunOpsList(opsList, isLast);
            }

            if (!isLast && typeof onCache === 'function') {
                try { onCache(opKey, result); } catch (e) { console.warn('runOpsSequence:onCache failed', e); }
            }
            // (Removed updateOpCaption for opKey step)
        } else {
            // step 0: optional global caption (e.g., intro)
            // (Removed updateOpCaption for step 0)
        }

        // (No updateNavigatorStates here; already updated above)
        if (delayMs > 0) await delay(delayMs);
        return result;
    }

    async function nextHandler() {
        if (isRunning || currentStep >= totalSteps - 1) return;
        // Instant text update before asynchronous reset
        const target = currentStep + 1;
        // Synchronous highlight update (optimistic)
        updateOpsExplainActive(chartId, (target > 0) ? (target - 1) : -1);
        updateNavigatorStates(ctrl, target, totalSteps, opsCount);
        currentStep = target;
        isRunning = true;
        try {
            await runStep(currentStep, 'forward');
        } catch (e) {
            console.error("Error during next step execution:", e);
            currentStep -= 1;
        } finally {
            isRunning = false;
        }
    }

    async function prevHandler() {
        if (isRunning || currentStep <= 0) return;
        // Instant text update before asynchronous reset
        const target = currentStep - 1;
        // Synchronous highlight update (optimistic)
        updateOpsExplainActive(chartId, (target > 0) ? (target - 1) : -1);
        updateNavigatorStates(ctrl, target, totalSteps, opsCount);
        currentStep = target;
        isRunning = true;
        try {
            await runStep(currentStep, 'backward');
        } catch (e) {
            console.error("Error during prev step execution:", e);
            currentStep += 1;
        } finally {
            isRunning = false;
        }
    }

    ctrl.nextButton.on('click.nav', nextHandler);
    ctrl.prevButton.on('click.nav', prevHandler);

    // Start at 0/N (render-only)
    await runStep(0, 'forward');
}