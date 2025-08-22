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
   */
  constructor(field, target) {
    this.field = field;
    this.target = target;
  }
}

export class FilterSpec {
  /**
   * @param {string} field - Field to filter on
   * @param {string} operator - One of '==','!=','>','>=','<','<=','in','not-in','contains','startsWith','endsWith'
   * @param {*} value - Value or array of values for the op
   */
  constructor(field, operator, value) {
    this.field = field;
    this.operator = operator;
    this.value = value;
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
   */
  constructor(field) {
    this.field = field;
  }
}

export class FindExtremumSpec {
  /**
   * Find top/bottom-k categories or series by a measure
   * @param {string} field
   * @param {'max'|'min'} [which='max']
   * @param {string} [aggregate='sum']
   */
  constructor(field, which = 'max') {
    this.field = field;
    this.which = which;
  }
}

export class SortSpec {
  /**
   * Sort categories or series by label or by a measure
   * @param {string} field
   * @param {'asc'|'desc'} [order='asc']
   */
  constructor(field, order = 'asc') {
    this.field = field;
    this.order = order;
  }
}

export class CountSpec {
  /**
   * @param {string} [field] - when counting distinct at row level
   * @param {'row'|'category'|'series'} level
   */
  constructor(level = 'row', field = undefined) {
      this.field = field;
      this.level = level;
  }
}

export class SumSpec {
  /**
   * @param {string} field
   */
  constructor(field) {
    this.field = field;
  }
}

export class AverageSpec {
  /**
   * @param {string} field
   */
  constructor(field) {
    this.field = field;
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
      this.field = field;
      this.from = from;
      this.n = n;
  }
}

export class SelectOneSpec {
  /**
   * @param {string} field
   * @param {string} target
   */
  constructor(field, target) {
    this.field = field;
    this.target = target;
  }
}

export class SelectMultipleSpec {
  /**
   * @param {string} field
   * @param {Object} targetList
   */
  constructor(field, targetList) {
      this.field = field;
      this.targetList = targetList;
  }
}
