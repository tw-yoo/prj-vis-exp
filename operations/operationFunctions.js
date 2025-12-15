import {DatumValue, BoolValue, IntervalValue} from "../object/valueType.js";
import { getRuntimeResultsById } from "./runtimeResultStore.js";
import {
  roundNumeric,
  toTrimmedString,
  formatFieldLabel,
  formatGroupSuffix,
  formatTargetLabel,
  formatResultName
} from "./common/dataOpsCore.js";

// Resolve a selection key/object for `last`: if an ID match exists in `data`, use { id: key }, otherwise fall back to { target: key }.

function _resolveLastQuery(data, keyOrObj, isLast) {
  if (keyOrObj && typeof keyOrObj === 'object') return keyOrObj;
  const k = String(keyOrObj);
  if (isLast && Array.isArray(data)) {
    for (const datum of data) {
      if (!datum) continue;
      if (datum.id != null && String(datum.id) === k) {
        return { id: String(datum.id) };
      }
      if (datum.lookupId != null && String(datum.lookupId) === k) {
        return { id: String(datum.lookupId) };
      }
    }

    const runtimeMatches = getRuntimeResultsById(k);
    if (runtimeMatches.length > 0) {
      const candidate = runtimeMatches[runtimeMatches.length - 1];
      const query = {};
      if (candidate?.id != null) {
        query.id = String(candidate.id);
      } else if (candidate?.lookupId != null) {
        query.id = String(candidate.lookupId);
      } else if (candidate?.target != null) {
        query.target = String(candidate.target);
      }
      if (candidate?.group != null) {
        query.group = candidate.group;
      }
      if (Object.keys(query).length > 0) {
        return query;
      }
    }
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

function parseComparableValue(raw) {
  if (raw instanceof Date) {
    const ts = +raw;
    if (!Number.isNaN(ts)) return ts;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  const str = String(raw ?? "").trim();
  if (str === "") return null;
  const date = new Date(str);
  if (!Number.isNaN(+date)) return +date;
  const num = Number(str);
  if (Number.isFinite(num)) return num;
  return str;
}

function compareComparableValues(a, b) {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return -1;
  if (bNull) return 1;
  if (typeof a === "number" && typeof b === "number") {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  const aStr = String(a);
  const bStr = String(b);
  if (aStr < bStr) return -1;
  if (aStr > bStr) return 1;
  return 0;
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

    const matchesCriteria = (item) => {
        if (!item) return false;
        return filterKeys.every(key => {
            const expected = clean[key];
            if (expected === undefined) return true;
            const expectedStr = String(expected);

            if (item[key] !== undefined && String(item[key]) === expectedStr) return true;

            if (key === 'target') {
                if (item.id != null && String(item.id) === expectedStr) return true;
                if (item.lookupId != null && String(item.lookupId) === expectedStr) return true;
            }
            if (key === 'id') {
                if (item.id != null && String(item.id) === expectedStr) return true;
                if (item.lookupId != null && String(item.lookupId) === expectedStr) return true;
                if (item.target != null && String(item.target) === expectedStr) return true;
            }
            if (key === 'lookupId') {
                if (item.lookupId != null && String(item.lookupId) === expectedStr) return true;
                if (item.id != null && String(item.id) === expectedStr) return true;
            }

            return false;
        });
    };

    const matchesData = data.filter(matchesCriteria);

    if (matchesData.length > 0) return matchesData;

    const candidateKeys = new Set();
    if (clean.id != null) candidateKeys.add(clean.id);
    if (clean.target != null) candidateKeys.add(clean.target);
    if (op?.id != null) candidateKeys.add(op.id);
    if (op?.target != null) candidateKeys.add(op.target);

    for (const candidate of candidateKeys) {
        const runtimeMatches = getRuntimeResultsById(candidate).filter(matchesCriteria);
        if (runtimeMatches.length > 0) return runtimeMatches;
    }

    return [];
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
        return new IntervalValue(String(op.group), roundNumeric(minV), roundNumeric(maxV));
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
    return new IntervalValue('Stack Totals', roundNumeric(minV), roundNumeric(maxV));
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

    const fieldLabel = op?.field || measureName;
    const name = formatResultName('Sum', fieldLabel, { group: op?.group });
    return {
        category: categoryName,
        measure: measureName,
        target: 'Sum',
        group: op?.group ?? null,
        value: roundNumeric(total),
        name
    };
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

    const fieldLabel = op?.field || measureName;
    const name = formatResultName('Average', fieldLabel, { group: op?.group });
    return {
        category: categoryName,
        measure: measureName,
        target: 'Average',
        group: op?.group ?? null,
        value: roundNumeric(total / count),
        name
    };
}

export function diff(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return [];

    const sample = data[0] || {};
    const measureName = sample.measure || 'value';
    const categoryName = sample.category || 'target';

    const toArray = (value) => Array.isArray(value) ? value : [value];

    // A/B 셀렉터 정규화: 문자열/숫자/객체({category,series} 또는 {target,group} 또는 {facet,key})
    const normalizeSelector = (targetValue, fallbackGroup) => {
        if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
            const normalized = {};
            if (targetValue.id != null) normalized.id = String(targetValue.id);

            const group =
                targetValue.series ?? targetValue.group ?? targetValue.key ?? fallbackGroup ?? op?.group ?? null;
            if (group != null) normalized.group = String(group);

            if (!normalized.id) {
                const target =
                    targetValue.category ??
                    targetValue.target ??
                    targetValue.facet ??
                    targetValue.value ??
                    targetValue.label ??
                    String(targetValue);
                if (target != null) normalized.target = String(target);
            }
            return normalized;
        }
        return _buildQueryFor(data, targetValue, fallbackGroup ?? op?.group, isLast);
    };

    const sanitize = (q) => Object.fromEntries(
        Object.entries(q || {}).filter(([key, value]) => value !== null && value !== undefined)
    );

    const pickWith = (key, groupLabel) => {
        if (key == null) return [];
        const keyStr = String(key);
        const inGroup = (datum) => (groupLabel == null)
            ? true
            : (datum && String(datum.group) === String(groupLabel));

        const getCategoryCandidate = (datum) => {
            if (!datum) return undefined;
            if (datum.target !== undefined) return datum.target;
            if (typeof datum.category === 'string' && datum[datum.category] !== undefined) return datum[datum.category];
            if (datum.facet !== undefined) return datum.facet;
            if (xField && datum[xField] !== undefined) return datum[xField];
            if (yField && datum[yField] !== undefined) return datum[yField];
            return undefined;
        };

        return data.filter((datum) => {
            if (!inGroup(datum)) return false;
            const categoryCandidate = getCategoryCandidate(datum);
            if (categoryCandidate != null && String(categoryCandidate) === keyStr) return true;
            if (datum?.id != null && String(datum.id) === keyStr) return true;
            if (datum?.lookupId != null && String(datum.lookupId) === keyStr) return true;
            return false;
        });
    };

    const fallbackLookup = (key, groupLabel) => {
        if (key == null) return [];
        const keyStr = String(key);
        return data.filter((datum) => {
            if (!datum) return false;
            if (groupLabel != null && String(datum.group ?? "") !== String(groupLabel)) return false;
            if (datum.id != null && String(datum.id) === keyStr) return true;
            if (datum.target != null && String(datum.target) === keyStr) return true;
            if (datum.lookupId != null && String(datum.lookupId) === keyStr) return true;
            return false;
        });
    };

    const collectMatches = (rawTargets, fallbackGroup) => {
        const matches = [];
        toArray(rawTargets).forEach((rawTarget) => {
            const selector = normalizeSelector(rawTarget, fallbackGroup);
            const query = sanitize(selector);

            let items = retrieveValue(data, query, isLast);
            if (!Array.isArray(items) || items.length === 0) {
                const targetKey = query?.target ?? rawTarget;
                const groupKey = query?.group ?? fallbackGroup ?? null;
                items = pickWith(targetKey, groupKey);
            }

            if (!Array.isArray(items) || items.length === 0) {
                const candidateKeys = [
                    query?.id,
                    query?.target,
                    rawTarget
                ].filter((value) => value != null);

                for (const candidateKey of candidateKeys) {
                    const fallback = fallbackLookup(candidateKey, query?.group ?? fallbackGroup ?? null);
                    if (fallback.length > 0) {
                        items = fallback;
                        break;
                    }
                }
            }

            if (!Array.isArray(items) || items.length === 0) {
                const runtimeKey =
                    selector?.id ??
                    selector?.target ??
                    (rawTarget != null ? String(rawTarget) : null);
                if (runtimeKey != null) {
                    const runtimeMatches = getRuntimeResultsById(runtimeKey);
                    if (runtimeMatches.length > 0) {
                        const targetGroup = selector?.group ?? fallbackGroup ?? null;
                        const filtered = runtimeMatches.filter((datum) => {
                            if (targetGroup == null) return true;
                            return String(datum.group ?? "") === String(targetGroup);
                        });
                        if (filtered.length > 0) {
                            items = filtered;
                        }
                    }
                }
            }

            if (Array.isArray(items) && items.length > 0) {
                matches.push(...items);
            }
        });
        return matches;
    };

    const groupA = op?.groupA ?? op?.group ?? null;
    const groupB = op?.groupB ?? op?.group ?? null;
    const A = collectMatches(op.targetA, groupA);
    const B = collectMatches(op.targetB, groupB);

    if (!A.length || !B.length) {
        console.warn("diff: one or both targets not found", {
            op,
            targetA: op.targetA,
            targetB: op.targetB
        });
        return [];
    }

    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const aggregateValues = (items) => {
        const vals = items.map(getNumeric).filter(Number.isFinite);
        if (!vals.length) return NaN;
        switch (op?.aggregate) {
            case "min": return Math.min(...vals);
            case "max": return Math.max(...vals);
            case "avg": return vals.reduce((a,b)=>a+b,0)/vals.length;
            default: return vals.reduce((a,b)=>a+b,0);
        }
    };

    const aVal = aggregateValues(A);
    const bVal = aggregateValues(B);
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return [];

    const aggregateMode = typeof op?.aggregate === 'string'
        ? op.aggregate.toLowerCase()
        : null;
    const isPercentOfTotal = aggregateMode === 'percentage_of_total' || aggregateMode === 'percent_of_total';

    const mode = String(op?.mode ?? 'difference').toLowerCase();
    let resultValue;
    let targetLabel = 'Diff';

    if (isPercentOfTotal) {
        if (bVal === 0) {
            console.warn("diff (percentage_of_total): denominator is zero", { op });
            return [];
        }
        resultValue = (aVal / bVal) * 100;
        targetLabel = op?.targetName ?? 'PercentOfTotal';
    } else if (mode === 'ratio') {
        if (bVal === 0) {
            console.warn("diff (ratio): denominator is zero", { op });
            return [];
        }
        let ratio = aVal / bVal;
        const defaultScale = op?.percent ? 100 : 1;
        const scale = Number.isFinite(op?.scale) ? op.scale : defaultScale;
        if (Number.isFinite(scale)) ratio *= scale;
        resultValue = ratio;
        targetLabel = op?.targetName ?? (op?.percent ? 'PercentOfTotal' : 'Ratio');
    } else {
        resultValue = aVal - bVal;
    }

    const precision = Number.isFinite(Number(op?.precision)) ? Math.max(0, Number(op.precision)) : null;
    if (precision !== null) {
        resultValue = Number(resultValue.toFixed(precision));
    }

    const labelA = formatTargetLabel(op.targetA);
    const labelB = formatTargetLabel(op.targetB);
    const detail = [labelA, labelB].filter(Boolean).join(' vs ');
    const resultGroup =
        (op?.group !== undefined && op.group !== null)
            ? op.group
            : (groupA !== null && groupA !== undefined)
                ? groupA
                : (groupB !== null && groupB !== undefined)
                    ? groupB
                    : (A[0]?.group ?? B[0]?.group ?? null);
    const name = formatResultName('Diff', op?.field || measureName, { group: resultGroup, detail });
    return {
        category: sample.category || categoryName || 'target',
        measure: measureName,
        target: targetLabel,
        group: resultGroup ?? null,
        value: roundNumeric(resultValue),
        name
    };
}

export function lagDiff(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length < 2) return [];
    const {
        field,
        orderField,
        order = 'asc',
        group,
        absolute = false
    } = op || {};

    const filtered = (group == null)
        ? data.slice()
        : data.filter(d => d && String(d.group) === String(group));
    if (filtered.length < 2) return [];

    const sample = filtered[0] || {};
    const measureName = field || sample.measure || 'value';
    const categoryName = orderField || sample.category || 'target';

    const getOrderRaw = (datum) => {
        if (!datum) return null;
        if (orderField && datum[orderField] !== undefined) return datum[orderField];
        if (datum.target !== undefined) return datum.target;
        if (categoryName && datum[categoryName] !== undefined) return datum[categoryName];
        if (datum.id != null) return datum.id;
        return null;
    };

    const decorated = filtered.map((datum) => ({
        datum,
        orderValue: parseComparableValue(getOrderRaw(datum))
    }));

    const direction = order === 'desc' ? -1 : 1;
    decorated.sort((a, b) => direction * compareComparableValues(a.orderValue, b.orderValue));

    const diffs = [];
    for (let i = 1; i < decorated.length; i++) {
        const curr = decorated[i].datum;
        const prev = decorated[i - 1].datum;
        if (!curr || !prev) continue;
        const currVal = Number(curr?.[measureName] ?? curr?.value);
        const prevVal = Number(prev?.[measureName] ?? prev?.value);
        if (!Number.isFinite(currVal) || !Number.isFinite(prevVal)) continue;
        const diffValue = absolute ? Math.abs(currVal - prevVal) : (currVal - prevVal);

        const labelPrev = formatTargetLabel(prev.target ?? prev[categoryName]);
        const labelCurr = formatTargetLabel(curr.target ?? curr[categoryName]);
        const transitionLabel = labelPrev && labelCurr ? `${labelPrev} → ${labelCurr}` : (labelCurr || `Step ${i}`);

        const diffDatum = {
            category: categoryName,
            measure: measureName,
            target: curr.target ?? curr[categoryName],
            group: curr.group ?? null,
            value: roundNumeric(diffValue),
            id: curr.id ? `${curr.id}_lagdiff` : undefined,
            prevTarget: prev.target ?? prev[categoryName]
        };
        diffDatum.name = transitionLabel;
        diffs.push(diffDatum);
    }
    return diffs;
}

export function nth(data, op) {
    if (!Array.isArray(data) || data.length === 0) return [];

    const from = String(op?.from || 'left').toLowerCase();
    const rawRanks = Array.isArray(op?.n) ? op.n : [op?.n ?? 1];

    const normalizedRanks = rawRanks
        .map((value, orderIdx) => {
            const num = Number(value);
            if (!Number.isFinite(num) || num <= 0) return null;
            return { num, orderIdx };
        })
        .filter(Boolean);

    if (normalizedRanks.length === 0) {
        normalizedRanks.push({ num: 1, orderIdx: 0 });
    }

    if (op.groupBy) {
        const groupKey = op.groupBy;
        const groupsInOrder = [...new Set(data.map(d => d[groupKey]))];
        const total = groupsInOrder.length;
        const selectedGroups = [];

        for (const entry of normalizedRanks) {
            const idx = from === 'right'
                ? (total - entry.num)
                : (entry.num - 1);
            if (idx < 0 || idx >= total) continue;
            const groupValue = groupsInOrder[idx];
            if (groupValue === undefined) continue;
            selectedGroups.push({ value: groupValue, orderIdx: entry.orderIdx });
        }

        if (!selectedGroups.length) return [];

        selectedGroups.sort((a, b) => a.orderIdx - b.orderIdx);
        const orderedGroups = selectedGroups.map(sg => String(sg.value));

        const orderedResults = [];
        for (const groupLabel of orderedGroups) {
            const matches = data.filter(d => String(d[groupKey]) === groupLabel);
            orderedResults.push(...matches);
        }
        return orderedResults;
    }

    const total = data.length;
    const picks = [];

    for (const entry of normalizedRanks) {
        const idx = from === 'right'
            ? (total - entry.num)
            : (entry.num - 1);
        if (idx < 0 || idx >= total) continue;
        const datum = data[idx];
        if (!datum) continue;
        picks.push({ datum, orderIdx: entry.orderIdx });
    }

    if (!picks.length) return [];
    picks.sort((a, b) => a.orderIdx - b.orderIdx);
    return picks.map(p => p.datum);
}

export function count(data, op, xField, yField, isLast = false) {
    const size = Array.isArray(data) ? data.length : 0;

    const sample = (Array.isArray(data) && data.length > 0) ? data[0] : {};
    const categoryName = sample?.category || 'target';
    const measureName  = sample?.measure  || 'value';

    const fieldLabel = op?.field || categoryName;
    const name = formatResultName('Count', fieldLabel, { group: op?.group });
    const datum = new DatumValue(
        categoryName,
        measureName,
        'Count',
        op?.group ?? null,
        roundNumeric(size),
        null
    );
    datum.name = name;
    return datum;
}
