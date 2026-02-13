export function makeId(prefix = 'id') {
  // crypto.randomUUID is supported in modern browsers; fall back for safety.
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return `${prefix}_${(crypto as any).randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

