// operations/line/opsSpecFactory.js
// 라인 차트 전용 "스펙 팩토리" — 어떤 데이터/필드명에도 유연하게 동작

// --- 내부 유틸 ---
function getFields(chartId) {
  const svg = document.querySelector(`#${chartId} svg`);
  return {
    x:  svg?.getAttribute('data-x-field')     || 'date',
    y:  svg?.getAttribute('data-y-field')     || 'value',
    c:  svg?.getAttribute('data-color-field') || 'series'
  };
}
function toISO(v) {
  const d = new Date(v);
  return isNaN(+d) ? null : d.toISOString().slice(0,10); // YYYY-MM-DD
}
function normKey(v) {
  const iso = toISO(v);
  return iso ?? String(v);
}
/** changeToSimple 자동 프리펜드 (seriesKey가 있을 때만) */
function withChange(seriesKey, ops, prepend = true) {
  if (prepend && seriesKey != null) {
    return { ops: [{ op: 'changeToSimple', seriesKey }, ...ops] };
  }
  return { ops };
}

// ---------- 멀티/심플 공용 팩토리 ----------

// 값 조회
export function specRetrieveValue(chartId, seriesKey, key, { prepend = true } = {}) {
  const k = normKey(key);
  return withChange(seriesKey, [{ op: 'retrieveValue', key: k }], prepend);
}

// 구간 필터 (x필드를 SVG에서 자동 인식)
export function specFilterRange(chartId, seriesKey, from, to, { prepend = true } = {}) {
  const { x } = getFields(chartId);
  const f = toISO(from) ?? from;
  const t = toISO(to)   ?? to;
  return withChange(seriesKey, [{ op: 'filter', field: x, from: f, to: t }], prepend);
}

// 극값 찾기 (min/max)
export function specFindExtremum(chartId, seriesKey, type = 'max', { field, prepend = true } = {}) {
  const { y } = getFields(chartId);
  return withChange(seriesKey, [{ op: 'findExtremum', type, field: field || y }], prepend);
}

// 값 범위(Min~Max)
export function specDetermineRange(chartId, seriesKey, { field, prepend = true } = {}) {
  const { y } = getFields(chartId);
  return withChange(seriesKey, [{ op: 'determineRange', field: field || y }], prepend);
}

// 두 키 비교
export function specCompare(chartId, seriesKey, leftKey, rightKey, { field, prepend = true } = {}) {
  const { y } = getFields(chartId);
  return withChange(seriesKey, [{
    op: 'compare',
    field: field || y,
    left:  normKey(leftKey),
    right: normKey(rightKey)
  }], prepend);
}

// 정렬 (y값 기준)
export function specSort(chartId, seriesKey, order = 'descending', { field, prepend = true } = {}) {
  const { y } = getFields(chartId);
  return withChange(seriesKey, [{ op: 'sort', field: field || y, order }], prepend);
}

// 체인 (원하는 오퍼레이션들을 자유롭게 이어 붙이기)
export function specChain(chartId, seriesKey, ops, { prepend = true } = {}) {
  const { x, y } = getFields(chartId);
  const patched = ops.map(o => {
    const c = { ...o };
    const type = c.op?.toLowerCase();
    if (type === 'filter') {
      c.field = x;
      c.from  = toISO(c.from) ?? c.from;
      c.to    = toISO(c.to)   ?? c.to;
    }
    if (type === 'compare') {
      c.field = c.field || y;
      c.left  = normKey(c.left);
      c.right = normKey(c.right);
    }
    if (type === 'findextremum' || type === 'determinerange') {
      c.field = c.field || y;
    }
    return c;
  });
  return withChange(seriesKey, patched, prepend);
}

// ---------- (옵션) 심플라인 전용 얇은 래퍼 ----------
// 심플라인은 changeToSimple이 필요 없으므로 prepend:false 고정
export const SimpleSpec = {
  retrieveValue: (chartId, key) => specRetrieveValue(chartId, null, key, { prepend:false }),
  filterRange:   (chartId, from, to) => specFilterRange(chartId, null, from, to, { prepend:false }),
  findExtremum:  (chartId, type='max', opt={}) => specFindExtremum(chartId, null, type, { ...opt, prepend:false }),
  determineRange:(chartId, opt={}) => specDetermineRange(chartId, null, { ...opt, prepend:false }),
  compare:       (chartId, left, right, opt={}) => specCompare(chartId, null, left, right, { ...opt, prepend:false }),
  sort:          (chartId, order='descending', opt={}) => specSort(chartId, null, order, { ...opt, prepend:false }),
  chain:         (chartId, ops) => specChain(chartId, null, ops, { prepend:false })
};
