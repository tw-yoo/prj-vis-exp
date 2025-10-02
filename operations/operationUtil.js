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

export function attachOpNavigator(chartId, { x = 15, y = 15 } = {}) {
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) {
        console.error("attachOpNavigator: SVG not found for chartId:", chartId);
        return { group: null, prevButton: null, nextButton: null, stepIndicator: null };
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
        .attr("width", 170) // 🔥 수정: 너비 증가
        .attr("height", 35)
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1);
        
    // 🔥 추가: 이전 버튼 생성
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

    // 🔥 수정: 다음 버튼 위치 조정
    const nextButton = navGroup.append("g")
        .attr("class", "nav-btn next-btn")
        .attr("transform", "translate(115, 5)") // X 위치 변경
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

    // 🔥 수정: 스텝 인디케이터 위치 조정
    const stepIndicator = navGroup.append("text")
        .attr("class", "step-indicator")
        .attr("x", 85) // X 위치 변경
        .attr("y", 22)
        .attr("text-anchor", "middle")
        .attr("fill", "black")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .style("pointer-events", "none");

    return { group: navGroup, prevButton, nextButton, stepIndicator };
}


export function updateNavigatorStates(ctrl, currentStep, totalSteps) {
    if (!ctrl || !ctrl.prevButton || !ctrl.nextButton || !ctrl.stepIndicator) return;
    const { prevButton, nextButton, stepIndicator } = ctrl;

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
    stepIndicator.text(`${currentStep + 1}/${totalSteps}`);
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
    const svg = d3.select(`#${chartId}`).select("svg");
    if (svg.empty()) {
        console.error("runOpsSequence: SVG not found. Please render the chart first.");
        return;
    }
    const keys = Object.keys(opsSpec || {});
    if (keys.length === 0) return;
    
    const mLeft = +svg.attr("data-m-left") || 0;
    const mTop  = +svg.attr("data-m-top")  || 0;
    const plotW = +svg.attr("data-plot-w") || 0;
    const plotH = +svg.attr("data-plot-h") || 0;

    const captionYOffset = 40;
    const navWidth = 170;
    const navX = mLeft + (plotW / 2) - (navWidth / 2);
    const navY = mTop + plotH + captionYOffset + 20;

    let ctrl = attachOpNavigator(chartId, { x: navX, y: navY });

    if (!ctrl.nextButton || !ctrl.prevButton || !ctrl.stepIndicator) {
        console.error("runOpsSequence: failed to attach navigator");
        return;
    }

    let currentStep = 0;
    const totalSteps = keys.length;
    let isRunning = false;
    
    // 🔥 추가: 각 단계의 결과를 저장하는 캐시
    const stepResultsCache = {};

    async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    const runStep = async (i, fromDirection = 'forward') => {
        const opKey = keys[i];
        const opsList = opsSpec[opKey] || [];
        const isLast = !!isLastKey(opKey);
        const prevKey = i > 0 ? keys[i - 1] : null;
        const wasLastStep = prevKey && isLastKey(prevKey);

        // 🔥 수정: last 단계에서 돌아올 때만 차트 리셋
        if (wasLastStep && fromDirection === 'backward') {
            console.log('Resetting chart after last step...');
            
            // renderSimpleLineChart 동적 import 및 호출
            try {
                const module = await import('./chart/simpleLine/simpleLineRenderer.js');
                const { renderSimpleLineChart } = module;
                await renderSimpleLineChart(chartId, vlSpec);
                
                // 네비게이터 다시 부착
                ctrl = attachOpNavigator(chartId, { x: navX, y: navY });
                
                // 이벤트 핸들러 다시 등록
                ctrl.nextButton.on('click.nav', nextHandler);
                ctrl.prevButton.on('click.nav', prevHandler);
            } catch (error) {
                console.error('Failed to reset chart:', error);
            }
        }

        if (typeof onReset === 'function') await onReset();

        let result = null;
        
        // 🔥 추가: 캐시된 결과가 있고, backward 방향이면 캐시 사용
        if (fromDirection === 'backward' && stepResultsCache[opKey]) {
            console.log(`Using cached result for step: ${opKey}`);
            result = stepResultsCache[opKey];
            
            // 캐시된 결과로 onCache 재실행 (dataCache 복원)
            if (!isLast && typeof onCache === 'function') {
                try { onCache(opKey, result); } catch (e) { console.warn('Failed to restore cache', e); }
            }
        } else {
            // 새로 실행
            if (typeof onRunOpsList === 'function') {
                result = await onRunOpsList(opsList, isLast);
            }

            // 🔥 추가: 결과를 stepResultsCache에 저장
            stepResultsCache[opKey] = result;

            if (!isLast && typeof onCache === 'function') {
                try { onCache(opKey, result); } catch (e) { console.warn('runOpsSequence:onCache failed', e); }
            }
        }

        const captionText = (textSpec && (textSpec[opKey] || textSpec.ops)) ? (textSpec[opKey] || textSpec.ops) : null;
        if (captionText) updateOpCaption(chartId, captionText, { align: 'center', offset: captionYOffset, fontSize: 16 });

        updateNavigatorStates(ctrl, i, totalSteps);
        if (delayMs > 0) await delay(delayMs);
        return result;
    };

    const nextHandler = async function() {
        if (isRunning || currentStep >= totalSteps - 1) return;
        
        isRunning = true;
        
        try {
            currentStep += 1;
            await runStep(currentStep, 'forward');
        } catch (e) {
            console.error("Error during next step execution:", e);
            currentStep -= 1;
        } finally {
            isRunning = false;
        }
    };

    const prevHandler = async function() {
        if (isRunning || currentStep <= 0) return;

        isRunning = true;
        
        try {
            currentStep -= 1;
            await runStep(currentStep, 'backward'); // 🔥 backward 표시
        } catch (e) {
            console.error("Error during prev step execution:", e);
            currentStep += 1;
        } finally {
            isRunning = false;
        }
    };

    ctrl.nextButton.on('click.nav', nextHandler);
    ctrl.prevButton.on('click.nav', prevHandler);

    await runStep(0, 'forward');
}