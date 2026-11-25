import { BELT_LABEL_GAP_METRES } from '../data/scenery.js';

// Connected components of the field footprints, not screen-space clusters: turning the
// camera cannot split a belt. Use dense cores rather than the sparse fringe of outliers.
export function beltLabelGroups(fields) {
  const remaining = new Set(fields), groups = [];
  const radius = f => f.coreRadius ?? f.radius ?? 0;
  for (const main of fields) {
    if (!remaining.delete(main)) continue;
    const members = [main];
    for (const a of members) for (const b of remaining) {
      const horizontal = Math.hypot(a.pos[0]-b.pos[0], a.pos[2]-b.pos[2]);
      const gapXZ = Math.max(0, horizontal-radius(a)-radius(b));
      const gapY = Math.max(0, Math.abs(a.pos[1]-b.pos[1])-(a.height ?? 0)-(b.height ?? 0));
      if (Math.hypot(gapXZ,gapY) > BELT_LABEL_GAP_METRES) continue;
      remaining.delete(b); members.push(b);
    }
    groups.push({main, members}); // first authored field is the stable label/anchor
  }
  return groups;
}

// Pure display helpers shared by the HUD and headless regression tests.
export function targetOnScreen(cameraZ, projected) {
  return cameraZ < 0 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1
    && projected.z >= -1 && projected.z <= 1;
}

export function targetHealthMarkup(health) {
  const percent = value => Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0;
  const shield = percent(health.shield), hull = percent(health.hull);
  const row = (kind, value) => `<span class="target-health-row"><span class="target-track target-${kind}"><i style="width:${value}%"></i></span><span class="target-percent">${value}%</span></span>`;
  return `<span class="target-health" aria-label="Shield ${shield}%, hull ${hull}%">${row('shield', shield)}${row('hull', hull)}</span>`;
}

const SAFE_TONE = /^[a-z][a-z0-9-]*$/;
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|var\(--[a-z0-9-]+\))$/;

/**
 * Single source of truth for object marker colour across floating HUD labels
 * (`.mk`), active target locks (`.mk.lock`, `.mk.lk`) and `N`-tab hollow-square
 * icons (`.pocket-icon`). Default `""` uses `--amber`; `"h"` uses `--red`;
 * `"i"` uses friendly/navigation `--ice` blue. Future objects can either add one
 * line here or declare `markerTone` / `markerColor` on their data record.
 */
export const MARKER_TONE_BY_KIND = Object.freeze({
  Hostile: 'h',
  enemy: 'h',
  e: 'h',
  station: 'i',
  s: 'i',
  Ship: 'i',
  // Another pilot (playtest 23): friendly ice, the same tone its N-list row and label wear.
  Pilot: 'i',
  p: 'i',
  Rift: 'i',
  rift: 'i',
  r: 'i',
  Gate: 'i',
  gate: 'i',
  g: 'i',
  Cache: 'i',
  cache: 'i',
  k: 'i',
});

const SHOT_KINDS = new Set(['Projectile', 'bullet', 'Missile', 'missile']);

export function markerStyle(kind, object = null) {
  // A prowling ship is incognito: neutral grey, whatever it really is.
  if (object?.role === 'prowl') return { tone: 'u', color: '' };
  let tone = '';
  if (typeof object?.markerTone === 'string' && (object.markerTone === '' || SAFE_TONE.test(object.markerTone))) {
    tone = object.markerTone;
  } else if (object?.friendly === true) {
    tone = 'i';
  } else if (object?.hostile === true || (SHOT_KINDS.has(kind) && object?.own === false)) {
    tone = 'h';
  } else {
    tone = MARKER_TONE_BY_KIND[kind] || '';
  }
  const raw = typeof object?.markerColor === 'string' ? object.markerColor.trim() : '';
  const color = SAFE_COLOR.test(raw) ? raw : '';
  return { tone, color };
}

export function lockMarkerStyle(lock, resolveStation = null) {
  if (!lock) return { tone: '', color: '' };
  if (lock.k === 's') {
    const station = typeof resolveStation === 'function' ? resolveStation(lock.o) : null;
    return markerStyle('station', station);
  }
  if (lock.k === 'n') {
    return markerStyle(lock.o?.rowKind || lock.o?.source?.kind || '', lock.o?.source || null);
  }
  return markerStyle(lock.k, lock.o);
}

export function markerClasses(...parts) {
  return parts.filter(Boolean).join(' ');
}
