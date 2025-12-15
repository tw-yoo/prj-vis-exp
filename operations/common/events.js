/**
 * Shared event/async helpers for operation flows.
 */

export const delay = (ms) => new Promise(res => setTimeout(res, ms));

export function signalOpDone(chartId, opName) {
  try {
    document.dispatchEvent(
      new CustomEvent("ops:animation-complete", {
        detail: { chartId, op: opName }
      })
    );
  } catch (_) { /* noop */ }
}

export function emitOpDone(svg, chartId, opName, detail = {}) {
  try {
    const ev = new CustomEvent("viz:op:done", {
      detail: { chartId, op: opName, ...detail },
      bubbles: true,
      composed: true,
      cancelable: false
    });
    const node = svg && typeof svg.node === "function" ? svg.node() : null;
    (node || document).dispatchEvent(ev);
  } catch (_) { /* noop */ }
}
