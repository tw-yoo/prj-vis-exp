let ensureAxisClearanceFn = null;
async function ensureAxisLabels(chartId) {
    if (!ensureAxisClearanceFn) {
        try {
            const mod = await import("../util/util.js");
            ensureAxisClearanceFn = mod.ensureXAxisLabelClearance;
        } catch (err) {
            console.warn("runOpsSequence: unable to load axis clearance helper", err);
            return;
        }
    }
    if (typeof ensureAxisClearanceFn === "function") {
        try {
            ensureAxisClearanceFn(chartId, { attempts: 3, minGap: 12, maxShift: 140 });
        } catch (err) {
            console.warn("runOpsSequence: ensureXAxisLabelClearance failed", err);
        }
    }
}

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

  const stacks = Array.from(parent.querySelectorAll(`:scope > .chart-ui-stack[data-owner="${chartId}"]`));
  stacks.slice(1).forEach(node => {
    try { node.remove(); } catch (_) {}
  });
  let stack = stacks[0];
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'chart-ui-stack';
    stack.setAttribute('data-owner', chartId);
    if (host.nextSibling) parent.insertBefore(stack, host.nextSibling); else parent.appendChild(stack);
  }

  const textBlocks = Array.from(stack.querySelectorAll(':scope > .ops-explain-block'));
  textBlocks.slice(1).forEach(node => {
    try { node.remove(); } catch (_) {}
  });
  let text = textBlocks[0];
  if (!text) {
    text = document.createElement('div');
    text.className = 'ops-explain-block';
    stack.appendChild(text);
  }
  const navNodes = Array.from(stack.querySelectorAll(':scope > .nav-overlay'));
  navNodes.slice(1).forEach(node => {
    try { node.remove(); } catch (_) {}
  });
  let nav = navNodes[0];
  if (!nav) {
    nav = document.querySelector(`.nav-overlay[data-owner="${chartId}"]`) || null;
  }
  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'nav-overlay';
    nav.setAttribute('data-owner', chartId);
    stack.appendChild(nav);
  } else {
    if (!nav.dataset.owner) nav.setAttribute('data-owner', chartId);
    if (nav.dataset.mount !== 'footer' && nav.parentElement !== stack) {
      stack.appendChild(nav);
    }
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

  // Cache tokens so we can reuse them when the active step changes.
  try {
    text.dataset.tokens = JSON.stringify(tokens ?? []);
  } catch (_) {
    text.dataset.tokens = '[]';
  }

  const shouldShow = Array.isArray(tokens) && tokens.length > 0 && Number.isInteger(activeIndex) && activeIndex >= 0;
  const clampedIdx = shouldShow
    ? Math.max(0, Math.min(tokens.length - 1, activeIndex))
    : -1;
  const activeText = shouldShow ? String(tokens[clampedIdx] ?? '') : '';

  text.innerHTML = '';
  const container = document.createElement('div');
  const span = document.createElement('span');
  span.className = 'ops-token';
  span.textContent = activeText;
  span.style.color = '#111';
  span.style.fontWeight = '700';
  span.style.visibility = activeText ? 'visible' : 'hidden';
  container.appendChild(span);
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
        const block = stack.querySelector('.ops-explain-block');
        if (!block) return;

        let tokens = [];
        try {
            tokens = JSON.parse(block.dataset.tokens || '[]');
        } catch (_) {
            tokens = [];
        }

        const tokenEl = block.querySelector('.ops-token');
        if (!tokenEl) return;

        const shouldShow = Array.isArray(tokens) && tokens.length > 0 && Number.isInteger(activeIndex) && activeIndex >= 0;
        if (!shouldShow) {
            tokenEl.textContent = '';
            tokenEl.style.visibility = 'hidden';
            return;
        }

        const clampedIdx = Math.max(0, Math.min(tokens.length - 1, activeIndex));
        tokenEl.textContent = String(tokens[clampedIdx] ?? '');
        tokenEl.style.color = '#111';
        tokenEl.style.fontWeight = '700';
        tokenEl.style.textAlign = 'center';
        tokenEl.style.visibility = tokenEl.textContent ? 'visible' : 'hidden';
    } catch (_) {}
}

export function shrinkSvgViewBox(svgSelection, padding = 4) {
    if (!svgSelection || typeof svgSelection.node !== 'function') return;
    const node = svgSelection.node();
    if (!node || typeof node.getBBox !== 'function') return;
    try {
        const bbox = node.getBBox();
        if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) {
            return;
        }
        const pad = Math.max(0, padding);
        const minX = bbox.x - pad;
        const minY = bbox.y - pad;
        const width = bbox.width + pad * 2;
        const height = bbox.height + pad * 2;
        svgSelection.attr('viewBox', `${minX} ${minY} ${width} ${height}`);
    } catch (err) {
        console.warn('shrinkSvgViewBox failed', err);
    }
}

function findNearestPaneElement(host) {
  if (!host || !(host instanceof HTMLElement)) return null;
  const pane = host.closest('.pane');
  if (pane) return pane;
  const paneBody = host.closest('.pane-body');
  if (paneBody && paneBody.parentElement) return paneBody.parentElement;
  const splitPane = host.closest('.split-container > div');
  return splitPane || null;
}

function ensurePaneFooter(paneEl) {
  if (!paneEl) return null;
  if (paneEl.classList.contains('left') && !paneEl.classList.contains('pane')) {
    return null;
  }
  let footer = paneEl.querySelector(':scope > .pane-footer');
  if (footer) return footer;
  footer = document.createElement('div');
  footer.className = 'pane-footer';
  const body = paneEl.querySelector(':scope > .pane-body');
  if (body) {
    const next = body.nextSibling;
    if (next) {
      paneEl.insertBefore(footer, next);
    } else {
      paneEl.appendChild(footer);
    }
  } else {
    paneEl.appendChild(footer);
  }
  return footer;
}

export function attachOpNavigator(chartId, options = {}) {
  const { x = 15, y = 15, mount = 'stack' } = options || {};
  const { host, stack, nav } = ensureUiStack(chartId);
  if (!host || !stack || !nav) {
    console.error('attachOpNavigator: host/stack/nav not found for chartId:', chartId);
    return { overlay: null, prevButton: null, nextButton: null, stepIndicator: null };
  }
  nav.setAttribute('data-owner', chartId);

  let resolvedMount = mount;
  if ((mount === 'stack' || mount == null) && nav.dataset.mount === 'footer') {
    resolvedMount = 'auto';
  }
  if (resolvedMount === 'auto' || resolvedMount === 'footer') {
    const pane = findNearestPaneElement(host);
    const footer = ensurePaneFooter(pane);
    if (footer) {
      if (nav.parentElement !== footer) footer.appendChild(nav);
      resolvedMount = 'footer';
    } else if (resolvedMount === 'auto') {
      resolvedMount = 'stack';
    } else {
      console.warn(`attachOpNavigator: footer mount requested but pane footer not found for chartId ${chartId}`);
    }
  }

  if (resolvedMount === 'stack') {
    if (nav.parentElement !== stack) stack.appendChild(nav);
  }

  nav.dataset.mount = resolvedMount;
  nav.style.pointerEvents = 'auto';
  nav.style.display = 'flex';
  nav.style.alignItems = 'center';
  nav.style.gap = '10px';
  nav.style.padding = '5px 8px';
  nav.style.background = 'rgba(255,255,255,0.95)';
  nav.style.border = '1px solid #ccc';
  nav.style.borderRadius = '6px';
  nav.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
  nav.style.margin = resolvedMount === 'footer' ? '0 auto' : '';
  nav.style.position = resolvedMount === 'footer' ? 'static' : '';
  nav.style.left = '';
  nav.style.right = '';
  nav.style.bottom = '';
  nav.style.top = '';
  nav.style.transform = '';

  let prevBtn = nav.querySelector(':scope > .nav-btn.prev');
  let nextBtn = nav.querySelector(':scope > .nav-btn.next');
  let stepText = nav.querySelector(':scope > .nav-step-text');
  
  if (!prevBtn) {
    prevBtn = document.createElement('button');
    prevBtn.className = 'nav-btn prev';
    prevBtn.textContent = 'Prev';
    nav.appendChild(prevBtn);
  }
  
  // stepText 요소는 유지하되 숨김 처리
  if (!stepText) {
    stepText = document.createElement('div');
    stepText.className = 'nav-step-text';
    stepText.style.fontSize = '14px';
    stepText.style.fontWeight = 'bold';
    stepText.style.minWidth = '48px';
    stepText.style.textAlign = 'center';
    stepText.style.display = 'none';  // 숨김 처리
    nav.appendChild(stepText);
  } else {
    stepText.style.display = 'none';  // 기존 요소도 숨김 처리
  }
  
  if (!nextBtn) {
    nextBtn = document.createElement('button');
    nextBtn.className = 'nav-btn next';
    nextBtn.textContent = 'Next';
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
    // busy 상태에서도 버튼 활성화 (애니메이션 중에도 클릭 가능)
    btn.style.pointerEvents = 'auto';  // 'none' 제거
    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';  // busy 상태 제거
    btn.style.opacity = btn.disabled ? '0.5' : '1';  // busy 상태 제거
  });
}

export function updateNavigatorStates(ctrl, currentStep, totalSteps, displayTotalOps = null) {
  if (!ctrl || !ctrl.prevButton || !ctrl.nextButton || !ctrl.stepIndicator) return;
  const prevBtn = ctrl.prevButton;
  const nextBtn = ctrl.nextButton;
  const stepEl = ctrl.stepIndicator;

  // stepEl은 항상 숨김 처리
  stepEl.style.display = 'none';

  // 첫 번째 스텝 (0)
  if (currentStep === 0) {
    prevBtn.style.display = 'none';
    nextBtn.textContent = 'Start';
    nextBtn.disabled = false;
    nextBtn.style.opacity = '1';
    nextBtn.style.cursor = 'pointer';
    nextBtn.style.pointerEvents = 'auto';
  }
  // 마지막 스텝
  else if (currentStep >= totalSteps - 1) {
    prevBtn.style.display = 'inline-flex';
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = false;
    prevBtn.style.opacity = '1';
    prevBtn.style.cursor = 'pointer';
    prevBtn.style.pointerEvents = 'auto';
    
    nextBtn.textContent = 'End';
    nextBtn.disabled = true;
    nextBtn.style.opacity = '0.5';
    nextBtn.style.cursor = 'not-allowed';
    nextBtn.style.pointerEvents = 'none';
  }
  // 중간 스텝들
  else {
    prevBtn.style.display = 'inline-flex';
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = false;
    prevBtn.style.opacity = '1';
    prevBtn.style.cursor = 'pointer';
    prevBtn.style.pointerEvents = 'auto';
    
    nextBtn.textContent = 'Next';
    nextBtn.disabled = false;
    nextBtn.style.opacity = '1';
    nextBtn.style.cursor = 'pointer';
    nextBtn.style.pointerEvents = 'auto';
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
    preOpsDelayMs = 400,
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
    const fallbackLayout = {
        navX: initialNavOpts?.x ?? 15,
        navY: initialNavOpts?.y ?? 15,
        captionYOffset: 40
    };
    let lastLayout = null;

    const getLayout = () => {
        const svgNode = d3.select(`#${chartId}`).select("svg").node();
        if (!svgNode) {
            return lastLayout || fallbackLayout;
        }

        const numAttr = (name, fallback = 0) => {
            const raw = svgNode.getAttribute(name);
            const value = Number(raw);
            return Number.isFinite(value) ? value : fallback;
        };

        const mLeft = numAttr("data-m-left");
        const mTop  = numAttr("data-m-top");
        const plotW = numAttr("data-plot-w");
        const plotH = numAttr("data-plot-h");
        const captionYOffset = fallbackLayout.captionYOffset;
        const navWidth = 170;

        const computedNavX = mLeft + (plotW / 2) - (navWidth / 2);
        const computedNavY = mTop + plotH + captionYOffset + 20;

        const layout = {
            navX: Number.isFinite(computedNavX) ? computedNavX : fallbackLayout.navX,
            navY: Number.isFinite(computedNavY) ? computedNavY : fallbackLayout.navY,
            captionYOffset
        };
        lastLayout = layout;
        return layout;
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
        const upcomingKey = (i > 0) ? opKeys[i - 1] : null;
        const upcomingIsLast = upcomingKey != null ? !!isLastKey(upcomingKey) : false;
        const direction = fromDirection;
        const forceInitialReset = (i === 0 && direction === 'backward');

        // Always fully reset the chart to the initial render state
        if (typeof onReset === 'function') {
            await onReset({
                stepIndex: i,
                opKey: upcomingKey,
                isLast: upcomingIsLast,
                direction,
                forceInitialReset,
            });
        }

        // After reset, the SVG DOM is replaced; re-attach navigator and handlers
        const { navX: nx, navY: ny } = getLayout();

        // Attach navigator first
        ctrl = await attachOpNavigator(chartId, { x: nx, y: ny });
        await bindNavHandlers();
        await setNavBusyState(ctrl, true);
        // Immediately update navigator state for the new step BEFORE any ops run
        await updateNavigatorStates(ctrl, i, totalSteps, opsCount);

        // Overlay logic (now only one call, no position shifting)
        const tokens = buildOpsExplainTokens(opKeys, textSpec || {});
        const activeIdx = (i > 0) ? (i - 1) : -1;
        await attachOrUpdateOpsExplainOverlay(chartId, tokens, activeIdx, { fontSize: 20 });

        let result = null;
        if (i > 0) {
            const opKey = opKeys[i - 1];
            const opsList = opsSpec[opKey] || []; // 여기 opsList에 있는 애들이 순차적으로 수행되어야 함.
            const isLast = !!isLastKey(opKey);

            if (!isLast && preOpsDelayMs > 0 && opsList.length > 0) {
                await delay(preOpsDelayMs);
            }

            if (typeof onRunOpsList === 'function') {
                try {
                    result = await onRunOpsList(opsList, isLast, upcomingKey);
                } finally {
                    await setNavBusyState(ctrl, false);
                }
            } else {
                await setNavBusyState(ctrl, false);
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
            const host = await document.getElementById(chartId);
            let overlay = host ? host.querySelector(':scope > .nav-overlay') : null;
            if (!overlay) {
                const { navX: nx2, navY: ny2 } = getLayout();
                ctrl = await attachOpNavigator(chartId, { x: nx2, y: ny2 });
                await bindNavHandlers();
            }
            await updateNavigatorStates(ctrl, i, totalSteps, opsCount);
            await setNavBusyState(ctrl, false);
        } catch (e) {
            console.warn('runOpsSequence: failed to ensure navigator after ops', e);
            await setNavBusyState(ctrl, false);
        }
        // Re-attach/raise ops-explain overlay after potential SVG re-render (e.g., last op)
        try {
            await attachOrUpdateOpsExplainOverlay(chartId, tokens, activeIdx, { fontSize: 20 });
        } catch (e) {
            console.warn('runOpsSequence: failed to reattach ops-explain overlay after ops', e);
        }

        await ensureAxisLabels(chartId);

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

    await bindNavHandlers();

    // Start at 0/N (render-only)
    await runStep(0, 'forward');
}
export function getPrimarySvgElement(chartId) {
    const host = document.getElementById(chartId);
    if (!host) return null;
    return host.querySelector(':scope > .chart-canvas > svg')
        || host.querySelector(':scope > svg')
        || host.querySelector('svg');
}
