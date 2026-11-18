// Presentation only: compact HUD columns fill upward, safely within their tracks.
export function meterHeight(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return '0%';
  return `${Math.max(0, Math.min(1, value / max)) * 100}%`;
}

/** Integer percentages under the current value, with the same bounds as the fill. */
export const meterPercent = (value, max) => `${Math.round(parseFloat(meterHeight(value, max)))}%`;
export function meterValue(value, max, unit = '') {
  const current = Number.isFinite(value) && Number.isFinite(max) && max > 0
    ? Math.max(0, Math.min(max, value)) : 0;
  return `${Math.round(current)}${unit}`;
}

/** Throttle is signed, unlike resource pools: reverse fills from the opposite edge. */
export function throttleDisplay(value) {
  const throttle = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return { width: `${Math.abs(throttle) * 100}%`, label: `Throttle ${Math.round(throttle * 100)}%`, reverse: throttle < 0 };
}
