import { DatumValue, BoolValue, IntervalValue } from "../../../object/valueType.js";

// ---------- 헬퍼(Helper) 함수들 ----------

const fmtISO = d3.timeFormat("%Y-%m-%d");

/**
 * 입력값을 Date 객체로 파싱합니다.
 * @param {*} v - 파싱할 값
 * @returns {Date|null} 파싱된 Date 객체 또는 실패 시 null
 */
function parseDate(v) {
    if (v instanceof Date) return v;
    const d = new Date(v);
    if (!isNaN(+d)) return d;
    // "YYYY" 형식의 문자열을 해당 연도의 1월 1일로 파싱
    if (typeof v === "string" && /^\d{4}$/.test(v)) return new Date(+v, 0, 1);
    return null;
}

/**
 * 두 값이 같은 날짜를 가리키는지 혹은 같은 값인지 비교합니다.
 * Date 객체와 "YYYY-MM-DD" 형식의 문자열을 모두 처리할 수 있습니다.
 * @param {*} val1 - 첫 번째 값
 * @param {*} val2 - 두 번째 값
 * @returns {boolean} 동일 여부
 */
function isSameDateOrValue(val1, val2) {
    const d1 = parseDate(val1);
    const d2 = parseDate(val2);
    if (d1 && d2) {
        return fmtISO(d1) === fmtISO(d2);
    }
    return String(val1) === String(val2);
}

/**
 * 특정 카테고리(날짜)와 시리즈에 해당하는 단일 데이터 포인트를 찾습니다.
 * @param {Array<object>} data - 전체 데이터
 * @param {object} targetSpec - 찾을 대상의 명세 { category, series }
 * @returns {object|null} 찾은 데이터 또는 null
 */
function findDatum(data, targetSpec) {
    if (!targetSpec || !targetSpec.category || !targetSpec.series) return null;
    const { category, series } = targetSpec;
    return data.find(d => isSameDateOrValue(d.target, category) && d.group === series);
}


// ---------- 라인 차트 전용 오퍼레이션 함수들 ----------

/**
 * 특정 x축 값(target)에 해당하는 모든 시리즈의 데이터를 찾습니다.
 * @param {Array<object>} data - 전체 데이터
 * @param {object} op - { target: '찾을 값' }
 * @returns {Array<object>} 검색된 데이터 배열
 */
export function retrieveValue(data, op) {
    if (!Array.isArray(data) || !op || op.target === undefined) return [];
    return data.filter(d => isSameDateOrValue(d.target, op.target));
}

/**
 * 데이터를 필터링합니다. 날짜(target) 필드의 'between' 연산을 특별 처리합니다.
 */
export function filter(data, op, xField, yField, colorField) {
    if (!Array.isArray(data) || !op || !op.field || !op.operator) return data.slice();
    
    const { field, operator, value } = op;
    let internalField = field;
    if (field === xField) internalField = 'target';
    if (field === yField) internalField = 'value';
    if (field === colorField) internalField = 'group';

    // 날짜 필드에 대한 'between' 연산자 처리
    if (internalField === 'target' && operator === 'between' && Array.isArray(value)) {
        const [startDate, endDate] = value.map(d => parseDate(d));
        if (startDate && endDate) {
            return data.filter(d => {
                const itemDate = parseDate(d.target);
                return itemDate && itemDate >= startDate && itemDate <= endDate;
            });
        }
        return [];
    }

    const asArray = (v) => Array.isArray(v) ? v : [v];
    return data.filter(item => {
        const itemValue = item[internalField];
        if (itemValue === undefined) return false;
        
        switch (operator) {
            case 'in':
            case 'not-in':
                const valueSet = new Set(asArray(value).map(String));
                const isPresent = valueSet.has(String(itemValue));
                return operator === 'in' ? isPresent : !isPresent;
            case 'contains':
                return asArray(value).some(v => String(itemValue).toLowerCase().includes(String(v).toLowerCase()));
            case '>': return +itemValue > +value;
            case '>=': return +itemValue >= +value;
            case '<': return +itemValue < +value;
            case '<=': return +itemValue <= +value;
            case '==':
            case 'eq': return String(itemValue) === String(value);
            case '!=': return String(itemValue) !== String(value);
            default: return false;
        }
    });
}

/**
 * 데이터셋에서 최소 또는 최대값을 가진 모든 데이터 포인트를 찾습니다.
 */
export function findExtremum(data, op) {
    if (!Array.isArray(data) || data.length === 0) return [];
    const which = op?.which || 'max';
    const values = data.map(d => d.value).filter(Number.isFinite);
    if (values.length === 0) return [];
    const extremumValue = which === 'min' ? Math.min(...values) : Math.max(...values);
    return data.filter(d => d.value === extremumValue);
}

/**
 * 데이터의 전체 값 범위(최소, 최대)와 해당 데이터를 찾습니다.
 */
export function determineRange(data, op, yField) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const values = data.map(d => d.value).filter(v => Number.isFinite(v));
    if (values.length === 0) return null;
    
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const minDatums = data.filter(d => d.value === minV);
    const maxDatums = data.filter(d => d.value === maxV);
    
    // 시각화 함수에서 사용할 수 있도록 상세 정보를 포함하여 반환
    return { minV, maxV, minDatums, maxDatums, interval: new IntervalValue(yField, minV, maxV) };
}

/**
 * 두 특정 데이터 포인트를 비교하여 Boolean 결과를 반환합니다.
 */
export function compareBool(data, op) {
    const datumA = findDatum(data, op.targetA);
    const datumB = findDatum(data, op.targetB);
    if (!datumA || !datumB) return new BoolValue("Points not found", false);
    
    const aVal = datumA.value;
    const bVal = datumB.value;
    if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) return new BoolValue("Invalid values", false);
    
    switch (op?.operator || '>') {
        case '>':  return new BoolValue(`${aVal} > ${bVal}`, aVal >  bVal);
        case '>=': return new BoolValue(`${aVal} >= ${bVal}`, aVal >= bVal);
        case '<':  return new BoolValue(`${aVal} < ${bVal}`, aVal <  bVal);
        case '<=': return new BoolValue(`${aVal} <= ${bVal}`, aVal <= bVal);
        case '==': return new BoolValue(`${aVal} == ${bVal}`, aVal === bVal);
        case '!=': return new BoolValue(`${aVal} != ${bVal}`, aVal !== bVal);
        default:   return new BoolValue(`${aVal} > ${bVal}`, aVal > bVal);
    }
}

/**
 * 두 특정 데이터 포인트의 값 차이를 계산합니다.
 */
export function diff(data, op, yField) {
    const datumA = findDatum(data, op.targetA);
    const datumB = findDatum(data, op.targetB);
    if (!datumA || !datumB) return null;
    const diffVal = Math.abs(datumA.value - datumB.value);
    return new DatumValue(null, yField, `Diff`, null, diffVal, null);
}

/**
 * 전체 데이터의 합계를 계산합니다.
 */
export function sum(data, op, yField) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const total = data.reduce((sum, d) => Number.isFinite(d.value) ? sum + d.value : sum, 0);
    return new DatumValue(null, yField, 'Sum', null, total, null);
}

/**
 * 전체 데이터의 평균을 계산합니다.
 */
export function average(data, op, yField) {
    if (!Array.isArray(data) || data.length === 0) return null;
    let total = 0;
    let count = 0;
    data.forEach(d => {
        if (Number.isFinite(d.value)) {
            total += d.value;
            count++;
        }
    });
    if (count === 0) return null;
    return new DatumValue(null, yField, 'Average', null, total / count, null);
}

/**
 * x축 순서에 따라 n번째에 위치한 데이터를 찾습니다.
 */
export function nth(data, op) {
    if (!Array.isArray(data) || data.length === 0) return [];

    const uniqueCategories = [...new Set(data.map(d => d.target))];
    uniqueCategories.sort((a, b) => {
        const d1 = parseDate(a);
        const d2 = parseDate(b);
        if (d1 && d2) return d1 - d2;
        return String(a).localeCompare(String(b), undefined, { numeric: true });
    });

    let n = Number(op?.n ?? 1);
    const from = String(op?.from || 'left').toLowerCase();
    const total = uniqueCategories.length;
    if (!Number.isFinite(n) || n <= 0 || n > total) return [];

    const sequence = from === 'right' ? uniqueCategories.slice().reverse() : uniqueCategories;
    const pickedCategory = sequence[n - 1];

    return data.filter(d => isSameDateOrValue(d.target, pickedCategory));
}

/**
 * 데이터의 총 개수를 계산합니다.
 */
export function count(data, op, yField) {
    const size = Array.isArray(data) ? data.length : 0;
    return new DatumValue(null, yField, 'Count', null, size, null);
}