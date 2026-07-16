/**
 * Formats a numeric operation result for display.
 * - Integers are shown without decimals.
 * - Floats are rounded to 2 decimal places (trailing zeros stripped via Number()).
 * - Non-finite values (Infinity, NaN) fall back to String().
 */
export function formatOperationValue(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  // Keep up to 4 decimals (stripping trailing zeros) rather than forcing 2:
  // 2-decimal rounding turned axis-aligned point labels like 0.106 into "0.11",
  // which no longer matched where the mark sat on the y-axis. The 4-decimal cap
  // still trims float noise (0.30000000004 → "0.3").
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
}

/**
 * Formats a signed numeric delta for display (e.g. lagDiff labels).
 * Positive values get a '+' prefix, negative values get '-', zero has no sign.
 */
export function formatSignedOperationValue(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const magnitude = formatOperationValue(Math.abs(value))
  if (value > 0) return `+${magnitude}`
  if (value < 0) return `-${magnitude}`
  return magnitude
}
