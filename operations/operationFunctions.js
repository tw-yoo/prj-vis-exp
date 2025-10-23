import {DatumValue, BoolValue, IntervalValue} from "../object/valueType.js";

// Resolve a selection key/object for `last`: if an ID match exists in `data`, use { id: key }, otherwise fall back to { target: key }.

function _resolveLastQuery(data, keyOrObj, isLast) {
  if (keyOrObj && typeof keyOrObj === 'object') return keyOrObj;
  const k = String(keyOrObj);
  if (isLast && Array.isArray(data) && data.some(d => String(d?.id) === k)) {
    return { id: k };
  }
  return { target: k };
}

// Build a query for one side (A/B): resolve ID for `last`, and attach group label if provided
function _buildQueryFor(data, targetKey, groupKey, isLast) {
  const q = _resolveLastQuery(data, targetKey, isLast);
  if (q && typeof q === 'object' && !('id' in q) && groupKey != null) {
    q.group = groupKey;
  }
  return q;
}

export function retrieveValue(data, op, isLast = false) {
    if (!Array.isArray(data)) return [];
    if (!op || typeof op !== 'object') return [];

    // Drop nullish keys to avoid over-filtering like { group: null }
    const clean = Object.fromEntries(
        Object.entries(op).filter(([k, v]) => v !== null && v !== undefined)
    );

    // If this is the `last` stage and the spec refers to an id (e.g., "ops_0"),
    // prefer id over target for matching.
    if (isLast && typeof clean.target === 'string') {
        const t = String(clean.target);
        if (Array.isArray(data) && data.some(d => String(d?.id) === t)) {
            clean.id = t;
            delete clean.target;
        }
    }

    const reservedKeys = new Set(['op', 'field']);
    const filterKeys = Object.keys(clean).filter(key => !reservedKeys.has(key));
    if (filterKeys.length === 0) return [];

    return data.filter(item => {
        if (!item) return false;
        return filterKeys.every(key => {
            if (item[key] === undefined) return false;
            return String(item[key]) === String(clean[key]);
        });
    });
}

export function filter(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data)) return [];
    if (!op || !op.field || !op.operator) return data.slice();

    const { field, operator, value } = op;
    const asArray = (v) => Array.isArray(v) ? v : [v];
    const numericOps = new Set(['>', '>=', '<', '<=']);

    return data.filter(item => {
        if (!item) return false;

        // --- 여기가 핵심 수정 부분 ---
        // op.field와 DatumValue의 실제 속성(target, group, value)을 연결합니다.
        let fieldToCheck = field;
        if (item.measure && field.toLowerCase() === item.measure.toLowerCase()) {
            fieldToCheck = 'value';
        } else if (item.category && field.toLowerCase() === item.category.toLowerCase()) {
            fieldToCheck = 'target';
        } else if (xField && field.toLowerCase() === xField.toLowerCase()) {
            fieldToCheck = 'group';
        }

        // 변환된 fieldToCheck으로 item에 해당 속성이 있는지 확인합니다.
        if (item[fieldToCheck] === undefined) return false;

        const itemValue = item[fieldToCheck];
        // --- 수정 끝 ---

        if (operator === 'in' || operator === 'not-in') {
            const valueSet = new Set(asArray(value).map(String));
            const isPresent = valueSet.has(String(itemValue));
            return operator === 'in' ? isPresent : !isPresent;
        }

        if (operator === 'contains') {
            const needles = asArray(value).map(v => String(v).toLowerCase());
            const haystack = String(itemValue).toLowerCase();
            return needles.some(n => haystack.includes(n));
        }

        if (numericOps.has(operator)) {
            const numItemValue = +itemValue;
            const numValue = +value;
            if (isNaN(numItemValue) || isNaN(numValue)) return false;

            switch (operator) {
                case '>':  return numItemValue >  numValue;
                case '>=': return numItemValue >= numValue;
                case '<':  return numItemValue <  numValue;
                case '<=': return numItemValue <= numValue;
                default: return false;
            }
        }

        if (operator === '==' || operator === 'eq') {
            return String(itemValue) === String(value);
        }
        if (operator === '!=') {
            return String(itemValue) !== String(value);
        }

        return true;
    });
}

export function findExtremum(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;

    const which = (op?.which === 'min') ? 'min' : 'max';
    const sample = data[0] || {};
    const measureName = sample.measure || 'value';

    // Predicate for optional group restriction
    const inGroup = (d) => (op?.group == null) ? true : (d && d.group === op.group);

    // Numeric accessor with fallbacks
    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    // Build candidate pool with valid numeric values (respecting group)
    let best = null;
    let bestVal = (which === 'min') ? Infinity : -Infinity;

    for (const d of data) {
        if (!inGroup(d)) continue;
        const v = getNumeric(d);
        if (!Number.isFinite(v)) continue;
        if ((which === 'min' && v < bestVal) || (which === 'max' && v > bestVal)) {
            bestVal = v;
            best = d;
        }
    }

    return best || null;
}

export function determineRange(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;

    const sample = data[0] || {};
    const categoryName = sample.category || 'target';
    const measureName  = sample.measure  || 'value';

    const inGroup = (d) => (op?.group == null) ? true : (d && d.group === op.group);

    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    if (op?.group != null) {
        // Range within a single subgroup across categories
        const vals = data.filter(inGroup).map(getNumeric).filter(Number.isFinite);
        if (vals.length === 0) return null;
        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);
        return new IntervalValue(String(op.group), minV, maxV);
    }

    // Range over stack totals (sum across subgroups per category)
    const sums = new Map();
    for (const d of data) {
        const key = String(d?.target ?? d?.[categoryName] ?? '');
        const v = getNumeric(d);
        if (!Number.isFinite(v)) continue;
        sums.set(key, (sums.get(key) || 0) + v);
    }
    if (sums.size === 0) return null;

    let minV = Infinity, maxV = -Infinity;
    for (const v of sums.values()) {
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
    }
    return new IntervalValue('Stack Totals', minV, maxV);
}

export function compare(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return [];

    const sample = data[0] || {};
    const categoryName = sample.category || 'target';
    const measureName  = sample.measure  || 'value';

    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const qA = _buildQueryFor(data, op.targetA, op.group, isLast);
    const qB = _buildQueryFor(data, op.targetB, op.group, isLast);
    let A = retrieveValue(data, qA);
    let B = retrieveValue(data, qB);

    // Fallback: if either side is empty, attempt matching by inferred category key
    if (!Array.isArray(A) || A.length === 0 || !Array.isArray(B) || B.length === 0) {
        const inGroup = (d) => (op?.group == null) ? true : (d && String(d.group) === String(op.group));
        const getCat = (d) => {
            if (!d) return undefined;
            if (d.target !== undefined) return d.target; // canonical
            if (typeof d.category === 'string' && d[d.category] !== undefined) return d[d.category];
            if (xField && d[xField] !== undefined) return d[xField];
            if (yField && d[yField] !== undefined) return d[yField];
            return undefined;
        };
        const pick = (k) => data.filter(d => inGroup(d) && String(getCat(d)) === String(k));
        if (!Array.isArray(A) || A.length === 0) A = pick(op.targetA);
        if (!Array.isArray(B) || B.length === 0) B = pick(op.targetB);
    }

    if (!Array.isArray(A) || A.length === 0 || !Array.isArray(B) || B.length === 0) {
        console.warn('compare: one or both targets not found', { op, qA, qB });
        return [];
    }

    const aggregate = (items) => {
        const vals = items.map(getNumeric).filter(Number.isFinite);
        if (vals.length === 0) return NaN;
        switch (op?.aggregate) {
            case 'min': return Math.min(...vals);
            case 'max': return Math.max(...vals);
            case 'avg': return vals.reduce((a,b)=>a+b,0) / vals.length;
            default: return vals.reduce((a,b)=>a+b,0);
        }
    };

    const aVal = aggregate(A);
    const bVal = aggregate(B);
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return [];

    let mode = 'max';
    if (op?.which === 'min' || op?.which === 'max') {
        mode = op.which;
    } else if (op?.operator === '<' || op?.operator === '<=') {
        mode = 'min';
    } else if (op?.operator === '>' || op?.operator === '>=') {
        mode = 'max';
    }

    if (aVal === bVal) return [];
    const winnerIsA = (mode === 'max') ? (aVal > bVal) : (aVal < bVal);

    return winnerIsA ? A[0] : B[0];
}


export function compareBool(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return new BoolValue('', false);

    let A, B;

    // isLast가 true일 경우, data는 dataCache의 모든 DatumValue를 담고 있음
    // targetA와 targetB는 "ops_0", "ops2_0" 같은 ID 문자열임
    if (isLast) {
        A = data.filter(d => d && String(d.id) === String(op.targetA));
        B = data.filter(d => d && String(d.id) === String(op.targetB));
    } else {
        // 기존 로직 (isLast가 아닐 때)
        const qA = _buildQueryFor(data, op.targetA, op.group, isLast);
        const qB = _buildQueryFor(data, op.targetB, op.group, isLast);
        const sanitize = (q) => Object.fromEntries(Object.entries(q).filter(([k, v]) => v !== null && v !== undefined));
        A = retrieveValue(data, sanitize(qA));
        B = retrieveValue(data, sanitize(qB));
    }
    
    // 폴백 로직: ID로 못찾았거나 isLast가 아닐 때, 카테고리/그룹으로 다시 시도
    if (!A || A.length === 0 || !B || B.length === 0) {
        const inGroup = (d) => (op?.group == null) ? true : (d && String(d.group) === String(op.group));
        const getCat = (d) => {
            if (!d) return undefined;
            if (d.target !== undefined) return d.target;
            if (typeof d.category === 'string' && d[d.category] !== undefined) return d[d.category];
            if (xField && d[xField] !== undefined) return d[xField];
            if (yField && d[yField] !== undefined) return d[yField];
            return undefined;
        };
        const pick = (k) => data.filter(d => inGroup(d) && String(getCat(d)) === String(k));
        if (!A || A.length === 0) A = pick(op.targetA);
        if (!B || B.length === 0) B = pick(op.targetB);
    }


    if (!Array.isArray(A) || A.length === 0 || !Array.isArray(B) || B.length === 0) {
        console.warn('compareBool: one or both targets not found', { op, targetA_query: op.targetA, targetB_query: op.targetB });
        return new BoolValue('', false);
    }

    const sample = data[0] || {};
    const measureName  = sample.measure  || 'value';
    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const aggregate = (items) => {
        const vals = items.map(getNumeric).filter(Number.isFinite);
        if (vals.length === 0) return NaN;
        switch (op?.aggregate) {
            case 'min': return Math.min(...vals);
            case 'max': return Math.max(...vals);
            case 'avg': return vals.reduce((a,b)=>a+b,0) / vals.length;
            default: return vals.reduce((a,b)=>a+b,0);
        }
    };

    const aVal = aggregate(A);
    const bVal = aggregate(B);
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return new BoolValue('', false);

    const opSymbol = op?.operator || '>';
    let result;
    switch (opSymbol) {
        case '>':  result = aVal >  bVal; break;
        case '>=': result = aVal >= bVal; break;
        case '<':  result = aVal <  bVal; break;
        case '<=': result = aVal <= bVal; break;
        case '==': result = aVal === bVal; break;
        case '!=': result = aVal !== bVal; break;
        default:   result = aVal > bVal;
    }
    return new BoolValue('', result);
}

export function sort(data, op, xField, yField) {
    if (!Array.isArray(data)) return [];

    const field = op.field || 'target';
    const orderAsc = (op.order || 'asc') === 'asc';
    const arr = [...data];

    const getCategory = (d) => String(d?.target ?? d?.category ?? '');
    const getMeasure = (d) => {
        if (d == null) return NaN;
        const n = +d.value;
        return Number.isNaN(n) ? NaN : n;
    };

    if (op.aggregate === 'sum' && (field === yField || field === 'value')) {
        const groupSums = new Map();
        for (const d of data) {
            const key = getCategory(d);
            const value = getMeasure(d);
            if (!Number.isNaN(value)) {
                groupSums.set(key, (groupSums.get(key) || 0) + value);
            }
        }
        arr.sort((a, b) => {
            const sumA = groupSums.get(getCategory(a)) || 0;
            const sumB = groupSums.get(getCategory(b)) || 0;
            return orderAsc ? sumA - sumB : sumB - sumA;
        });
    } else {
        arr.sort((a, b) => {
            const isNumericSort = field === yField || field === 'value';
            const valA = isNumericSort ? getMeasure(a) : getCategory(a);
            const valB = isNumericSort ? getMeasure(b) : getCategory(b);

            if (typeof valA === 'number' && typeof valB === 'number') {
                if (!Number.isFinite(valA) && !Number.isFinite(valB)) return 0;
                if (!Number.isFinite(valA)) return 1;
                if (!Number.isFinite(valB)) return -1;
                return orderAsc ? valA - valB : valB - valA;
            } else {
                const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true });
                return orderAsc ? cmp : -cmp;
            }
        });
    }
    return arr;
}

export function sum(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const sample = data[0] || {};
    const categoryName = sample.category || 'target';
    const measureName  = sample.measure  || 'value';

    const inGroup = (d) => (op?.group == null) ? true : (d && d.group === op.group);

    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    let total = 0;
    for (const d of data) {
        if (!inGroup(d)) continue;
        const v = getNumeric(d);
        if (Number.isFinite(v)) total += v;
    }

    return { category: categoryName, measure: measureName, target: 'Sum', group: op?.group ?? null, value: total };
}

export function average(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const sample = data[0] || {};
    const categoryName = sample.category || 'target';
    const measureName  = sample.measure  || 'value';

    const inGroup = (d) => (op?.group == null) ? true : (d && d.group === op.group);

    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    let total = 0, count = 0;
    for (const d of data) {
        if (!inGroup(d)) continue;
        const v = getNumeric(d);
        if (Number.isFinite(v)) { total += v; count++; }
    }
    if (count === 0) return null;

    return { category: categoryName, measure: measureName, target: 'Average', group: op?.group ?? null, value: total / count };
}

export function diff(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return [];

    // A/B 셀렉터 정규화: 문자열/숫자/객체({category,series} 또는 {target,group} 또는 {facet,key})
    const normalizeSelector = (t) => {
        if (t && typeof t === 'object') {
            const normalized = {};
            if (t.id != null) normalized.id = String(t.id);

            const group = (t.series != null)
                ? t.series
                : (t.group != null)
                    ? t.group
                    : (t.key != null)
                        ? t.key
                        : (op?.group ?? null);

            if (group != null) normalized.group = String(group);

            if (!normalized.id) {
                const target = (t.category != null)
                    ? t.category
                    : (t.target != null)
                        ? t.target
                        : (t.facet != null)
                            ? t.facet
                            : String(t);
                normalized.target = String(target);
            }
            return normalized;
        }
        return _buildQueryFor(data, t, op?.group, isLast);
    };

    const qA = normalizeSelector(op.targetA);
    const qB = normalizeSelector(op.targetB);

    const sanitize = (q) => Object.fromEntries(Object.entries(q).filter(([k,v]) => v !== null && v !== undefined));
    const qA2 = sanitize(qA);
    const qB2 = sanitize(qB);

    let A = retrieveValue(data, qA2, isLast);
    let B = retrieveValue(data, qB2, isLast);

    const pickWith = (k, g) => {
        const inGroup = (d) => (g == null) ? true : (d && String(d.group) === String(g));
        const getCat = (d) => {
            if (!d) return undefined;
            if (d.target !== undefined) return d.target;
            if (typeof d.category === 'string' && d[d.category] !== undefined) return d[d.category];
            if (d.facet !== undefined) return d.facet;
            if (xField && d[xField] !== undefined) return d[xField];
            if (yField && d[yField] !== undefined) return d[yField];
            return undefined;
        };
        const keyStr = String(k);
        return data.filter(d => inGroup(d) && (
            String(getCat(d)) === keyStr || (d?.id != null && String(d.id) === keyStr)
        ));
    };

    if (!A || A.length === 0) A = pickWith(qA2?.target ?? op.targetA, qA2?.group ?? op?.group ?? null);
    if (!B || B.length === 0) B = pickWith(qB2?.target ?? op.targetB, qB2?.group ?? op?.group ?? null);

    if (!A.length || !B.length) {
        console.warn("diff: one or both targets not found", { op, qA: qA2, qB: qB2 });
        return [];
    }

    const sample = data[0] || {};
    const measureName = sample.measure || 'value';
    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const aggregate = (items) => {
        const vals = items.map(getNumeric).filter(Number.isFinite);
        if (!vals.length) return NaN;
        switch (op?.aggregate) {
            case "min": return Math.min(...vals);
            case "max": return Math.max(...vals);
            case "avg": return vals.reduce((a,b)=>a+b,0)/vals.length;
            default: return vals.reduce((a,b)=>a+b,0);
        }
    };

    const aVal = aggregate(A);
    const bVal = aggregate(B);
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return [];

    const diffVal = aVal - bVal;
    return {
        category: sample.category || 'target',
        measure: measureName,
        target: 'Diff',
        group: (qA2?.group ?? qB2?.group ?? op?.group ?? null),
        value: diffVal
    };
}

export function nth(data, op) {
    if (!Array.isArray(data) || data.length === 0) return [];

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    if (!Number.isFinite(n) || n <= 0) n = 1;

    if (op.groupBy) {
        const groupKey = op.groupBy;
        const groupsInOrder = [...new Set(data.map(d => d[groupKey]))];

        const total = groupsInOrder.length;
        const idx = from === 'right' ? (total - n) : (n - 1);
        if (idx < 0 || idx >= total) return [];

        const pickedGroup = groupsInOrder[idx];
        return data.filter(d => String(d[groupKey]) === String(pickedGroup));
    } else {
        const total = data.length;
        const idx = from === 'right' ? (total - n) : (n - 1);
        if (idx < 0 || idx >= total) return [];

        const item = data[idx];
        return item ? [item] : [];
    }
}

export function count(data, op, xField, yField, isLast = false) {
    const size = Array.isArray(data) ? data.length : 0;

    const sample = (Array.isArray(data) && data.length > 0) ? data[0] : {};
    const categoryName = sample?.category || 'target';
    const measureName  = sample?.measure  || 'value';

    return new DatumValue(
        categoryName,
        measureName,
        'Count',
        op?.group ?? null,
        size,
        null
    );
}
