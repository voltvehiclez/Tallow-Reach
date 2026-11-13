// Warp timing and curves. The places themselves (systems and pockets) live in
// data/places.js; this file keeps the name sectors.js because the warp sequence
// was historically called a sector warp. No geography or place ids live here.

// A warp is a sequence: the drive charges, the place switches in a white-out,
// then the drive settles and control comes back. You cannot steer or fire from
// the start of the charge until the settle ends.
export const WARP = {
  charge: 1.1,
  flash: 0.18,
  settle: 0.72,
};

export const WARP_TIME = WARP.charge + WARP.flash + WARP.settle;
export const WARP_SWITCH_AT = WARP.charge;

export const WARP_COAST = { steer: 0.6 };
export const warpSteerEase = t => Math.max(0, 1 - t / WARP_COAST.steer);

export const WARP_FLASH_RAMP = 0.08;
export const WARP_FLASH_FADE = 0.3;

export function warpFlashAt(t) {
  const start = WARP_SWITCH_AT - WARP_FLASH_RAMP;
  if (t < start) return 0;
  if (t < WARP_SWITCH_AT) return (t - start) / WARP_FLASH_RAMP;
  if (t < WARP_SWITCH_AT + WARP.flash) return 1;
  const k = (t - WARP_SWITCH_AT - WARP.flash) / WARP_FLASH_FADE;
  return Math.max(0, 1 - k);
}

export function warpPhaseAt(t) {
  if (t < WARP.charge) return "charge";
  if (t < WARP_SWITCH_AT + WARP.flash) return "flash";
  if (t < WARP_TIME) return "settle";
  return "done";
}
