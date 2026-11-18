// Presentation only: compact HUD columns fill upward, safely within their tracks.
export function meterHeight(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return '0%';
  return `${Math.max(0, Math.min(1, value / max)) * 100}%`;
}
