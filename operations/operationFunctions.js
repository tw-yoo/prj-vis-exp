import {DatumValue, BoolValue} from "../object/valueType.js";

export function retrieveValue(data, op, isLast = false) {
    if (!Array.isArray(data)) return [];

    const targetsArr = Array.isArray(op?.target) ? op.target : [op?.target];
    const targetSet = new Set((targetsArr || []).map(v => String(v)));

    const hasField = typeof op?.field === 'string' && op.field.length > 0;

    return data.filter(item => {
        if (!item) return false;
        const id = item.id != null ? String(item.id) : '';
        const label = item.target != null ? String(item.target) : '';
        const fieldOk = hasField ? (item.category === op.field || Object.prototype.hasOwnProperty.call(item, op.field)) : true;
        return isLast ? targetSet.has(id) && fieldOk : targetSet.has(label) && fieldOk;
    });
}

export function filter(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data)) return [];

    const sample = data[0] || {};
    const categoryName = sample.category || 'target';
    const measureName  = sample.measure  || 'value';

    const field = (op && typeof op.field === 'string' && op.field.length)
        ? op.field
        : 'target';

    const isLabelField = (
        field === 'target' || field === 'label' || field === categoryName
    );
    const isMeasureField = (
        field === 'value' || field === measureName
    );

    const getLabel = (d) => (d && d.target != null) ? String(d.target) : '';
    const getNumeric = (d) => {
        if (!d) return NaN;
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const asArray = (v) => Array.isArray(v) ? v : [v];
    const numericOps   = new Set(['>', '>=', '<', '<=']);
    const equalityOps  = new Set(['==', 'eq', '!=']);

    const opVal = op?.value;

    // Membership operators over label (default) or numeric if field is a measure
    if (op?.operator === 'in' || op?.operator === 'not-in') {
        const vals = asArray(opVal);
        if (isMeasureField) {
            const set = new Set(vals.map(v => +v));
            return data.filter(d => {
                const dv = getNumeric(d);
                return op.operator === 'in' ? set.has(dv) : !set.has(dv);
            });
        } else {
            const set = new Set(vals.map(v => String(v)));
            return data.filter(d => {
                const lbl = getLabel(d);
                return op.operator === 'in' ? set.has(lbl) : !set.has(lbl);
            });
        }
    }

    // Substring match (case-insensitive) on label by default; numeric coerced to string when field is measure
    if (op?.operator === 'contains') {
        const needles = asArray(opVal).map(v => String(v).toLowerCase());
        return data.filter(d => {
            const hay = (isMeasureField ? String(getNumeric(d)) : getLabel(d)).toLowerCase();
            return needles.some(n => hay.includes(n));
        });
    }

    // Numeric comparisons target the measure; ignore if NaN
    if (numericOps.has(op?.operator)) {
        const key = Number(opVal);
        return data.filter(d => {
            const v = getNumeric(d);
            switch (op.operator) {
                case '>':  return v >  key;
                case '>=': return v >= key;
                case '<':  return v <  key;
                case '<=': return v <= key;
                default:   return true;
            }
        });
    }

    // Equality / inequality on label or measure depending on field
    if (equalityOps.has(op?.operator)) {
        if (isMeasureField) {
            const key = Number(opVal);
            return data.filter(d => (op.operator === '!=') ? (getNumeric(d) !== key) : (getNumeric(d) === key));
        } else {
            const key = String(opVal);
            return data.filter(d => (op.operator === '!=') ? (getLabel(d) !== key) : (getLabel(d) === key));
        }
    }

    // Unknown operator ⇒ pass-through
    return data.slice();
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

    const pickBy = (d, sel) =>
        isLast ? (String(d.id) === String(sel)) : (String(d.target) === String(sel));

    const A = data.filter(d => pickBy(d, op.targetA));
    const B = data.filter(d => pickBy(d, op.targetB));
    if (!A.length || !B.length) return null;

    const aggregate = (items) => {
        const vals = items.map(getNumeric).filter(Number.isFinite);
        if (vals.length === 0) return NaN;
        switch (op?.aggregate) {
            case 'min': return Math.min(...vals);
            case 'max': return Math.max(...vals);
            case 'avg':
            case 'average': return vals.reduce((a,b)=>a+b,0) / vals.length;
            case 'sum':
            default: return vals.reduce((a,b)=>a+b,0);
        }
    };

    const aVal = aggregate(A);
    const bVal = aggregate(B);
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return null;

    // Determine comparison mode
    let mode = 'max';
    if (op?.which === 'min' || op?.which === 'max') {
        mode = op.which;
    } else if (op?.operator === '<' || op?.operator === '<=') {
        mode = 'min';
    } else if (op?.operator === '>' || op?.operator === '>=') {
        mode = 'max';
    } else if (op?.operator === '==' || op?.operator === 'eq') {
        if (aVal === bVal) return null; // equality → no winner
        mode = 'max';
    }

    if (aVal === bVal) return null; // tie → null
    const winnerIsA = (mode === 'max') ? (aVal > bVal) : (aVal < bVal);

    return new DatumValue(
        categoryName,
        measureName,
        winnerIsA ? String(op.targetA) : String(op.targetB),
        null,
        winnerIsA ? aVal : bVal,
        null
    );
}

export function compareBool(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data) || data.length === 0) return null;

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

    const pickBy = (d, sel) =>
        isLast ? (String(d.id) === String(sel)) : (String(d.target) === String(sel));

    const A = data.filter(d => pickBy(d, op.targetA));
    const B = data.filter(d => pickBy(d, op.targetB));
    if (!A.length || !B.length) return null;

    const aggregate = (items) => {
        const vals = items.map(getNumeric).filter(Number.isFinite);
        if (vals.length === 0) return NaN;
        switch (op?.aggregate) {
            case 'min': return Math.min(...vals);
            case 'max': return Math.max(...vals);
            case 'avg':
            case 'average': return vals.reduce((a,b)=>a+b,0) / vals.length;
            case 'sum':
            default: return vals.reduce((a,b)=>a+b,0);
        }
    };

    const aVal = aggregate(A);
    const bVal = aggregate(B);
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return null;

    const opSymbol = op?.operator || '>';
    let result;
    switch (opSymbol) {
        case '>':   result = aVal >  bVal; break;
        case '>=':  result = aVal >= bVal; break;
        case '<':   result = aVal <  bVal; break;
        case '<=':  result = aVal <= bVal; break;
        case '==':
        case 'eq':  result = aVal === bVal; break;
        case '!=':  result = aVal !== bVal; break;
        default:    result = aVal > bVal;
    }

    return new BoolValue("", result);
}

export function sort(data, op, xField, yField, isLast = false) {
    if (!Array.isArray(data)) return [];

    const sample = data[0] || {};
    const categoryName = sample.category || 'target';
    const measureName  = sample.measure  || 'value';

    const field = (op && typeof op.field === 'string' && op.field.length)
        ? op.field
        : 'target';

    const orderAsc = (op?.order ?? 'asc') === 'asc';

    const isLabelField = (
        field === 'target' || field === 'label' || field === categoryName || field === xField || field === yField
    );

    const getLabel = (d) => {
        if (d && d.target != null) return String(d.target);
        if (categoryName && d && d[categoryName] !== undefined) return String(d[categoryName]);
        if (xField && d && d[xField] !== undefined) return String(d[xField]);
        if (yField && d && d[yField] !== undefined) return String(d[yField]);
        return '';
    };

    const getNumeric = (d) => {
        if (!d) return NaN;
        if (op?.field && d[op.field] !== undefined) return +d[op.field];
        if (d.value !== undefined) return +d.value;
        if (measureName && d[measureName] !== undefined) return +d[measureName];
        if (yField && d[yField] !== undefined) return +d[yField];
        if (xField && d[xField] !== undefined) return +d[xField];
        return NaN;
    };

    const arr = data.slice();
    arr.sort((a, b) => {
        if (isLabelField) {
            const sa = getLabel(a);
            const sb = getLabel(b);
            const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
            return orderAsc ? cmp : -cmp;
        } else {
            const va = getNumeric(a);
            const vb = getNumeric(b);
            if (!Number.isFinite(va) && !Number.isFinite(vb)) return 0;
            if (!Number.isFinite(va)) return 1;
            if (!Number.isFinite(vb)) return -1;
            const cmp = va - vb;
            return orderAsc ? cmp : -cmp;
        }
    });
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

    const pickBy = (d, sel) => isLast ? (String(d.id) === String(sel)) : (String(d.target) === String(sel));

    const A = data.filter(d => pickBy(d, op.targetA));
    const B = data.filter(d => pickBy(d, op.targetB));
    if (!A.length || !B.length) return null;

    const aggregate = (items) => {
        const vals = items.map(getNumeric).filter(Number.isFinite);
        if (vals.length === 0) return NaN;
        switch (op?.aggregate) {
            case 'min': return Math.min(...vals);
            case 'max': return Math.max(...vals);
            case 'avg':
            case 'average': return vals.reduce((a,b)=>a+b,0) / vals.length;
            case 'sum':
            default: return vals.reduce((a,b)=>a+b,0);
        }
    };

    const aVal = aggregate(A);
    const bVal = aggregate(B);
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return null;

    const diffVal = aVal - bVal;
    return { category: categoryName, measure: measureName, target: `Diff(${op.targetA}, ${op.targetB})`, group: null, value: diffVal };
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