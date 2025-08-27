/****
 * Common selector shapes used across operations
 * - category: primary nominal/ordinal key (e.g., bar x-axis label)
 * - series: secondary nominal key (e.g., grouped/stacked bar groups, multi-line series)
 * - x: x-axis value (for line charts or horizontal bars)
 * - y: y-axis value (for vertical bars)
 * - index: row index or ordinal position when keys are insufficient
 */

export class RetrieveValueSpec {
  /**
   * @param {string} field - Quantitative field to read (e.g., 'value')
   * @param {string} target - { category?, series?, x?, y?, index? }
   * @param group
   */
  constructor(field, target, group = null) {
    this.field = field;
    this.target = target;
    this.group = group;
  }
}

export class FilterSpec {
  /**
   * @param {string} field - Field to filter on
   * @param {string} operator - One of '==','!=','>','>=','<','<=','in','not-in','contains','startsWith','endsWith'
   * @param {*} value - Value or array of values for the op
   * @param value2
   * @param group
   */
  constructor(field, operator, value, value2 = null, group = null) {
    this.field = field;
    this.operator = operator;
    this.value = value;
    this.value2 = value2;
    this.group = group;
  }
}

export class CompareSpec {
  /**
   * @param {string} field - Quantitative field to compare
   * @param {string} targetA - { category?, series?, x?, y?, index? }
   * @param {string} targetB - { category?, series?, x?, y?, index? }
   * @param {string} [mode='larger'] - 'larger' | 'smaller' | 'equal' | 'notEqual'
   * @param {string} [aggregate='sum'] - Aggregation to apply before compare: 'sum'|'avg'|'min'|'max'
   */
  constructor(field, targetA, targetB, mode = 'larger', aggregate = 'sum') {
    this.field = field;
    this.targetA = targetA;
    this.targetB = targetB;
    this.mode = mode;
    this.aggregate = aggregate;
  }
}

export class CompareBoolSpec {
  /**
   * Boolean comparison (e.g., is A > B?)
   * @param {string} field
   * @param {string} targetA
   * @param {string} targetB
   * @param operator
   */
  constructor(field, targetA, targetB, operator) {
    this.field = field;
    this.targetA = targetA;
    this.targetB = targetB;
    this.operator = operator;
  }
}

export class DetermineRangeSpec {
  /**
   * Determine [min, max] of a field after optional filters
   * @param {string} field - Field to compute range for (e.g., measure on y)
   * @param group
   */
  constructor(field, group = null) {
    this.field = field;
    this.group = group;
  }
}

export class FindExtremumSpec {
  /**
   * Find extremum (min/max) under various scopes.
   * Backward compatible signature:
   *   new FindExtremumSpec(field, which = 'max', group = null, options = {})
   *
   * @param {string} field               - Measure name (e.g., 'value' or y-field)
   * @param {'max'|'min'} [which='max']  - Which extremum to find
   * @param {string|null} [group=null]   - Legacy: subgroup key (kept for compatibility)
   */
  constructor(field, which = 'max', group = null) {
    this.field = field;
    this.which = which;

    // legacy param retained
    this.group = group;
  }
}

export class SortSpec {
  /**
   * Sort categories or series by label or by a measure
   * @param {string} field
   * @param {'asc'|'desc'} [order='asc']
   * @param group
   */
  constructor(field, order = 'asc', group = null) {
    this.field = field;
    this.order = order;
    this.group = group;
  }
}

export class CountSpec {
  /**
   */
  constructor() {}
}

export class SumSpec {
  /**
   * @param {string} field
   * @param group
   */
  constructor(field, group = null) {
    this.field = field;
    this.group = group;
  }
}

export class AverageSpec {
  /**
   * @param {string} field
   * @param group
   */
  constructor(field, group = null) {
    this.field = field;
    this.group = group;
  }
}

export class DiffSpec {
  /**
   * @param {string} field
   * @param {string} targetA
   * @param {string} targetB
   */
  constructor(field, targetA, targetB) {
    this.field = field;
    this.targetA = targetA;
    this.targetB = targetB;
  }
}

export class NthSpec {
  /**
   * @param {string} [field]
   * @param {string} [from]
   * @param {number} n
   */
  constructor(field, n, from= 'left' ) {
      this.from = from;
      this.n = n;
  }
}
