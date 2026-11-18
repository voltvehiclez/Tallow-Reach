// Very faint, omnidirectional nebula fill. No exposure, sunlight or material changes.
import { SKYBOXES } from './skyboxes.js';

export const NEBULA_FILL = {
  intensity: 0.125,       // 0 disables the extra fill; keep small to preserve dark space
  tint: null,            // null = current skybox's generated nebula tint; or 0xrrggbb
  tintStrength: 0.4,      // mix with neutral white so shadows do not become saturated cyan
  // Optional per-sky overrides, independent of the generator-maintained skybox registry.
  // normal_space: { tint: 0x83cbd4, intensity: 0.08, tintStrength: 0.4 }
  skies: {},
};

const color = value => Number.isInteger(value) && value >= 0 && value <= 0xffffff;
const bounded = (value, fallback, max = 1) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(max, value)) : fallback;

/** Pure resolution: per-place sky.ambient > per-sky override > defaults > generated tint. */
export function nebulaFillFor(sky, settings = NEBULA_FILL) {
  const definition = sky?.kind === 'cube' ? SKYBOXES[sky.skybox] : null;
  if (!definition) return { color: 0xffffff, intensity: 0 };
  const config = { ...settings, ...settings.skies?.[sky.skybox], ...sky.ambient };
  const tint = color(config.tint) ? config.tint : definition.tint;
  const strength = bounded(config.tintStrength, NEBULA_FILL.tintStrength);
  const channel = shift => Math.round(255 + (((tint >> shift) & 255) - 255) * strength);
  return {
    color: (channel(16) << 16) | (channel(8) << 8) | channel(0),
    intensity: bounded(config.intensity, NEBULA_FILL.intensity),
  };
}
