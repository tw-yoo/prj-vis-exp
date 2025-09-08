import {DatumValue, BoolValue} from "../object/valueType.js";

export function retrieveValue(data, op) {
    if (!Array.isArray(data)) return [];

    const reservedKeys = new Set(['op', 'field']);
    const filterKeys = Object.keys(op).filter(key => !reservedKeys.has(key));

    if (filterKeys.length === 0) {
        return [];
    }

    return data.filter(item => {
        if (!item) return false;

        return filterKeys.every(key => {
            if (item[key] === undefined) return false;
            return String(item[key]) === String(op[key]);
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
        if (!item || item[field] === undefined) return false;
        
        const itemValue = item[field];

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

export function determineRange(data, op, xField, yField, isLast = false) {}

export function compare(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;

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

    const A = retrieveValue(data, typeof op.targetA === 'object' ? op.targetA : { target: op.targetA });
    const B = retrieveValue(data, typeof op.targetB === 'object' ? op.targetB : { target: op.targetB });

    if (!A.length || !B.length) return null;

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
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return null;

    let mode = 'max';
    if (op?.which === 'min' || op?.which === 'max') {
        mode = op.which;
    } else if (op?.operator === '<' || op?.operator === '<=') {
        mode = 'min';
    } else if (op?.operator === '>' || op?.operator === '>=') {
        mode = 'max';
    }

    if (aVal === bVal) return null;
    const winnerIsA = (mode === 'max') ? (aVal > bVal) : (aVal < bVal);

    return winnerIsA ? A[0] : B[0];
}

export function compareBool(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const A = retrieveValue(data, typeof op.targetA === 'object' ? op.targetA : { target: op.targetA });
    const B = retrieveValue(data, typeof op.targetB === 'object' ? op.targetB : { target: op.targetB });

    if (!A.length || !B.length) return null;
    
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
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return null;

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
    return new BoolValue("", result);
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
    if (!Array.isArray(data) || data.length === 0) return null;

    const A = retrieveValue(data, typeof op.targetA === 'object' ? op.targetA : { target: op.targetA });
    const B = retrieveValue(data, typeof op.targetB === 'object' ? op.targetB : { target: op.targetB });

    if (!A.length || !B.length) return null;

    const sample = data[0] || {};
    const measureName  = sample.measure  || 'value';
    const getNumeric = (d) => (d && d.value !== undefined) ? +d.value : NaN;

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
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return null;

    const diffVal = aVal - bVal;
    const categoryName = sample.category || 'target';
    
    return { category: categoryName, measure: measureName, target: `Diff`, group: null, value: diffVal };
}

export function nth(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;
    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    if (!Number.isFinite(n) || n <= 0) n = 1;

    const total = data.length;
    const idx = from === 'right' ? (total - n) : (n - 1);
    if (idx < 0 || idx >= total) return null;
    return data[idx] || null;
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