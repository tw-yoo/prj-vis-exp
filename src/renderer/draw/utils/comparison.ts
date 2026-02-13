import { DrawComparisonAliasGroups, DrawComparisonOperators, type DrawComparisonOperator, type DrawComparisonToken } from '../types'

type ComparisonOperatorGroup = DrawComparisonOperator

function matchesComparison(op: DrawComparisonToken | undefined, group: ComparisonOperatorGroup) {
  if (!op) return false
  const list = DrawComparisonAliasGroups[group] as readonly DrawComparisonToken[]
  return list.includes(op)
}

export function normalizeComparisonCondition(op: DrawComparisonToken | undefined): DrawComparisonOperator {
  if (matchesComparison(op, DrawComparisonOperators.Greater)) return DrawComparisonOperators.Greater
  if (matchesComparison(op, DrawComparisonOperators.GreaterEqual)) return DrawComparisonOperators.GreaterEqual
  if (matchesComparison(op, DrawComparisonOperators.Less)) return DrawComparisonOperators.Less
  if (matchesComparison(op, DrawComparisonOperators.LessEqual)) return DrawComparisonOperators.LessEqual
  return DrawComparisonOperators.GreaterEqual
}
