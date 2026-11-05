// The sectors you can fly in. One is active at a time (state.sector) and the
// M key warps to the next one in SECTOR_IDS.
//
//   n      name, shown on the HUD and in the warp message
//   d      one-line description, shown in the warp message
//   sn     arrival point [x, y, z], where a warp drops you
//   st     has Meridian Outpost: you can dock there and it pushes ships away
//   fd     has the asteroid field (rocks, its HUD marker, pirates nearby)
//   foes   raiders may spawn here
//
// Keep the keys short, like the other data tables. Adding a sector: add an entry
// here and its id to SECTOR_IDS; see docs/HOW_TO_ADD.md recipe 14.

export const SECTORS = {
  reach: {
    n: "Tallow Reach",
    d: "Meridian Outpost and the asteroid field.",
    sn: [0, 0, 300],
    st: true,
    fd: true,
    foes: true,
  },
  hollow: {
    n: "Kestrel Hollow",
    d: "Empty space. Nothing out here yet.",
    sn: [0, 0, 300],
    st: false,
    fd: false,
    foes: false,
  },
};

/** The order M cycles through. */
export const SECTOR_IDS = ["reach", "hollow"];

/** Where the game starts. It must have `st: true`, because you dock there. */
export const DEFAULT_SECTOR = "reach";

// Warp timing, in seconds. A warp is a sequence: the drive charges, the sector
// switches in a white-out, then the drive settles and control comes back. You
// cannot steer or fire from the start of the charge until the settle ends.
export const WARP = {
  charge: 1.1,   // tunnel builds, drive rises, ship locked in place
  flash: 0.18,   // white-out; the sector changes at the start of this
  settle: 0.72,  // tunnel fades away, still locked until it ends
};

/** How long a whole warp takes: about two seconds. */
export const WARP_TIME = WARP.charge + WARP.flash + WARP.settle;

/** When the sector actually changes during a warp. */
export const WARP_SWITCH_AT = WARP.charge;

// How the ship lets go of its controls when a warp starts. The throttle is
// released at once, so the speed bleeds off exactly as it does when you press X
// rather than snapping to zero, and the steering eases back to neutral over
// `steer` seconds so a turn unwinds instead of stopping dead.
export const WARP_COAST = {
  steer: 0.6,
};

/** Steering input scale `t` seconds into a warp: 1 at the start, 0 once centred. */
export const warpSteerEase = t => Math.max(0, 1 - t / WARP_COAST.steer);

export const WARP_FLASH_RAMP = 0.08;  // white-out starts this long before the switch
export const WARP_FLASH_FADE = 0.3;   // and fades out over this long afterwards

/** White-out brightness `t` seconds into a warp: 0 -> 1 at the switch -> 0. */
export function warpFlashAt(t) {
  const start = WARP_SWITCH_AT - WARP_FLASH_RAMP;
  if (t < start) return 0;
  if (t < WARP_SWITCH_AT) return (t - start) / WARP_FLASH_RAMP;
  if (t < WARP_SWITCH_AT + WARP.flash) return 1;
  const k = (t - WARP_SWITCH_AT - WARP.flash) / WARP_FLASH_FADE;
  return Math.max(0, 1 - k);
}

/** Which part of a warp `t` seconds in is: "charge", "flash", "settle" or "done". */
export function warpPhaseAt(t) {
  if (t < WARP.charge) return "charge";
  if (t < WARP_SWITCH_AT + WARP.flash) return "flash";
  if (t < WARP_TIME) return "settle";
  return "done";
}

/** The table entry for `id`, falling back to the starting sector. */
export const sectorAt = id => SECTORS[id] || SECTORS[DEFAULT_SECTOR];

/** The sector the map goes to next after `id`. */
export function nextSector(id) {
  const i = SECTOR_IDS.indexOf(id);
  return SECTOR_IDS[(i + 1) % SECTOR_IDS.length];
}
