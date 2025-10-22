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

// Ensure chart UI stack (for overlays and nav) exists for a given chartId
function ensureUiStack(chartId) {
  const host = document.getElementById(chartId);
  if (!host) return { host: null, stack: null, text: null, nav: null };
  const cs = window.getComputedStyle(host);
  if (cs.position === 'static' || !cs.position) host.style.position = 'relative';

  // Create or reuse a sibling stack right after the chart host
  const parent = host.parentNode;
  if (!parent) return { host, stack: null, text: null, nav: null };

  let stack = parent.querySelector(`:scope > .chart-ui-stack[data-owner="${chartId}"]`);
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'chart-ui-stack';
    stack.setAttribute('data-owner', chartId);
    if (host.nextSibling) parent.insertBefore(stack, host.nextSibling); else parent.appendChild(stack);
  }

  let text = stack.querySelector(':scope > .ops-explain-block');
  if (!text) {
    text = document.createElement('div');
    text.className = 'ops-explain-block';
    stack.appendChild(text);
  }
  let nav = stack.querySelector(':scope > .nav-overlay');
  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'nav-overlay';
    stack.appendChild(nav);
  }
  return { host, stack, text, nav };
}

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
  const { host, stack, text } = ensureUiStack(chartId);
  if (!host || !stack || !text) return { el: null, height: 0, top: undefined };

  text.style.textAlign = 'center';
  text.style.lineHeight = '1.35';
  text.style.fontSize = (opts.fontSize ? `${opts.fontSize}px` : '20px');
  text.style.margin = '0';
  text.style.padding = '0';
  text.style.maxWidth = '80%';
  text.style.wordBreak = 'break-word';

  // Build content
  text.innerHTML = '';
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
  text.appendChild(container);

  const h = text.getBoundingClientRect ? (text.getBoundingClientRect().height || 0) : 0;
  const topRel = text.getBoundingClientRect && host.getBoundingClientRect
      ? (text.getBoundingClientRect().top - host.getBoundingClientRect().top)
      : undefined;
  return { el: text, height: h, top: topRel };
}

function updateOpsExplainActive(chartId, activeIndex) {
    try {
        const host = document.getElementById(chartId);
        if (!host) return;
        const parent = host.parentNode;
        if (!parent) return;
        const stack = parent.querySelector(`:scope > .chart-ui-stack[data-owner="${chartId}"]`);
        if (!stack) return;
        const tokens = stack.querySelectorAll('.ops-explain-block .ops-token');
        tokens.forEach((el, idx) => {
            const active = (activeIndex === idx);
            el.style.color = active ? '#111' : '#aaa';
            el.style.fontWeight = active ? '700' : '400';
        });
    } catch (_) {}
}

export function attachOpNavigator(chartId, { x = 15, y = 15 } = {}) {
  const { host, stack, nav } = ensureUiStack(chartId);
  if (!host || !stack || !nav) {
    console.error('attachOpNavigator: host/stack/nav not found for chartId:', chartId);
    return { overlay: null, prevButton: null, nextButton: null, stepIndicator: null };
  }

  nav.style.position = '';
  nav.style.pointerEvents = 'auto';
  nav.style.display = 'flex';
  nav.style.alignItems = 'center';
  nav.style.gap = '10px';
  nav.style.padding = '5px 8px';
  nav.style.background = 'rgba(255,255,255,0.95)';
  nav.style.border = '1px solid #ccc';
  nav.style.borderRadius = '6px';
  nav.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';

  let prevBtn = nav.querySelector(':scope > .nav-btn.prev');
  let nextBtn = nav.querySelector(':scope > .nav-btn.next');
  let stepText = nav.querySelector(':scope > .nav-step-text');
  if (!prevBtn) {
    prevBtn = document.createElement('button');
    prevBtn.className = 'nav-btn prev';
    prevBtn.textContent = '← Prev';
    nav.appendChild(prevBtn);
  }
  if (!stepText) {
    stepText = document.createElement('div');
    stepText.className = 'nav-step-text';
    stepText.style.fontSize = '14px';
    stepText.style.fontWeight = 'bold';
    stepText.style.minWidth = '48px';
    stepText.style.textAlign = 'center';
    nav.appendChild(stepText);
  }
  if (!nextBtn) {
    nextBtn = document.createElement('button');
    nextBtn.className = 'nav-btn next';
    nextBtn.textContent = 'Next →';
    nav.appendChild(nextBtn);
  }

  return { overlay: nav, prevButton: prevBtn, nextButton: nextBtn, stepIndicator: stepText };
}

function repositionNavStepOverlay(chartId, ctrl) { return; }

function setNavBusyState(ctrl, busy) {
  if (!ctrl) return;
  const buttons = [ctrl.prevButton, ctrl.nextButton];
  buttons.forEach(btn => {
    if (!btn) return;
    btn.dataset.busy = busy ? '1' : '0';
    btn.style.pointerEvents = busy ? 'none' : 'auto';
    btn.style.cursor = busy ? 'progress' : (btn.disabled ? 'not-allowed' : 'pointer');
    btn.style.opacity = busy ? '0.5' : (btn.disabled ? '0.5' : '1');
  });
}


export function updateNavigatorStates(ctrl, currentStep, totalSteps, displayTotalOps = null) {
  if (!ctrl || !ctrl.prevButton || !ctrl.nextButton || !ctrl.stepIndicator) return;
  const prevBtn = ctrl.prevButton;
  const nextBtn = ctrl.nextButton;
  const stepEl  = ctrl.stepIndicator;

  // Prev state
  const isAtStart = (currentStep === 0);
  const prevBusy = prevBtn.dataset.busy === '1';
  prevBtn.disabled = isAtStart;
  prevBtn.style.opacity = (isAtStart || prevBusy) ? '0.5' : '1';
  prevBtn.style.cursor  = prevBusy ? 'progress' : (isAtStart ? 'not-allowed' : 'pointer');
  prevBtn.style.pointerEvents = (isAtStart || prevBusy) ? 'none' : 'auto';

  // Next state
  const isAtLast  = (currentStep >= totalSteps - 1);
  const nextBusy = nextBtn.dataset.busy === '1';
  nextBtn.disabled = isAtLast;
  nextBtn.textContent = isAtLast ? 'Done' : 'Next →';
  nextBtn.style.opacity = (isAtLast || nextBusy) ? '0.5' : '1';
  nextBtn.style.cursor  = nextBusy ? 'progress' : (isAtLast ? 'not-allowed' : 'pointer');
  nextBtn.style.pointerEvents = (isAtLast || nextBusy) ? 'none' : 'auto';

  // Step indicator
  const denom = (displayTotalOps != null) ? displayTotalOps : totalSteps;
  const numerator = (displayTotalOps != null) ? currentStep : (currentStep + 1);
  stepEl.textContent = `${numerator}/${denom}`;
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
    function bindNavHandlers() {
        const overlayEl = ctrl && ctrl.overlay;
        if (!overlayEl) return;
        const nextBtn = ctrl.nextButton;
        const prevBtn = ctrl.prevButton;
        if (nextBtn && !nextBtn.dataset.bound) {
            nextBtn.addEventListener('click', nextHandler);
            nextBtn.dataset.bound = '1';
        }
        if (prevBtn && !prevBtn.dataset.bound) {
            prevBtn.addEventListener('click', prevHandler);
            prevBtn.dataset.bound = '1';
        }
        overlayEl.dataset.bound = '1';
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

        // Attach navigator first
        ctrl = attachOpNavigator(chartId, { x: nx, y: ny });
        bindNavHandlers();
        setNavBusyState(ctrl, true);
        // Immediately update navigator state for the new step BEFORE any ops run
        updateNavigatorStates(ctrl, i, totalSteps, opsCount);

        // Overlay logic (now only one call, no position shifting)
        const tokens = buildOpsExplainTokens(opKeys, textSpec || {});
        const activeIdx = (i > 0) ? (i - 1) : -1;
        attachOrUpdateOpsExplainOverlay(chartId, tokens, activeIdx, { fontSize: 20 });

        let result = null;
        if (i > 0) {
            const opKey = opKeys[i - 1];
            const opsList = opsSpec[opKey] || [];
            const isLast = !!isLastKey(opKey);

            if (typeof onRunOpsList === 'function') {
                try {
                    result = await onRunOpsList(opsList, isLast);
                } finally {
                    setNavBusyState(ctrl, false);
                }
            } else {
                setNavBusyState(ctrl, false);
            }

            if (!isLast && typeof onCache === 'function') {
                try { onCache(opKey, result); } catch (e) { console.warn('runOpsSequence:onCache failed', e); }
            }
            // (Removed updateOpCaption for opKey step)
        } else {
            // step 0: optional global caption (e.g., intro)
            // (Removed updateOpCaption for step 0)
        }

        // --- Ensure navigator persists if onRunOpsList replaced the SVG ---
        try {
            const host = document.getElementById(chartId);
            let overlay = host ? host.querySelector(':scope > .nav-overlay') : null;
            if (!overlay) {
                const { navX: nx2, navY: ny2 } = getLayout();
                ctrl = attachOpNavigator(chartId, { x: nx2, y: ny2 });
                bindNavHandlers();
            }
            updateNavigatorStates(ctrl, i, totalSteps, opsCount);
            setNavBusyState(ctrl, false);
        } catch (e) {
            console.warn('runOpsSequence: failed to ensure navigator after ops', e);
            setNavBusyState(ctrl, false);
        }
        // Re-attach/raise ops-explain overlay after potential SVG re-render (e.g., last op)
        try {
            attachOrUpdateOpsExplainOverlay(chartId, tokens, activeIdx, { fontSize: 20 });
        } catch (e) {
            console.warn('runOpsSequence: failed to reattach ops-explain overlay after ops', e);
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
        setNavBusyState(ctrl, true);
        try {
            await runStep(currentStep, 'forward');
        } catch (e) {
            console.error("Error during next step execution:", e);
            currentStep -= 1;
        } finally {
            isRunning = false;
            setNavBusyState(ctrl, false);
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
        setNavBusyState(ctrl, true);
        try {
            await runStep(currentStep, 'backward');
        } catch (e) {
            console.error("Error during prev step execution:", e);
            currentStep += 1;
        } finally {
            isRunning = false;
            setNavBusyState(ctrl, false);
        }
    }

    bindNavHandlers();

    // Start at 0/N (render-only)
    await runStep(0, 'forward');
}
