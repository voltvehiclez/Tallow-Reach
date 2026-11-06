// The guns fitted in the primary weapon bays, and the launchers in the
// secondary bay.
//
// A gun is a module in the `primary` group (data/modules.js). A hull has two
// primary bays; putting the same gun in either one works the same way, and both
// fire together on left click, each with its own cooldown. The bay only decides
// which barrel the shot comes out of. The mining beam is a primary module too
// (beam_basic, `period` instead of `dmg`), one beam acting at a time; gunsOf
// only picks up modules with `dmg`, beamsOf the ones with `period`.
// missilesOf does the same for the `secondary` group (missile_basic): the
// missiles are the only secondary module so far, so any secondary module with
// `dmg` is a launcher.
//
// Kept out of sim/weapons.js so that sim/economy.js and sim/fitting.js can
// refresh the list without importing the shooting code.

import { MODULES } from "../data/modules.js";
import { state } from "../state/state.js";

/**
 * A short, human-readable name for a list of fitted primary modules, using the
 * modules' own names: "Basic cannons" for one, "Basic cannons x2" when the same
 * module fills both bays, "Basic cannons + Basic mining beam" for a mixed pair.
 * Pure, so the HUD and the equip toast stay identical. Pass gunsOf/beamsOf output.
 */
export function moduleListName(mods) {
  const byId = new Map();
  for (const m of mods || []) {
    if (!m || !m.id) continue;
    if (!byId.has(m.id)) byId.set(m.id, { n: m.n || m.id, count: 0 });
    byId.get(m.id).count++;
  }
  return [...byId.values()].map(({ n, count }) => (count > 1 ? `${n} x${count}` : n)).join(" + ");
}

/**
 * The guns fitted in the primary bays, in bay order. Only primary modules with a
 * `dmg` count as guns (the mining beam has `period` instead — see beamsOf). Pure,
 * so it can be
 * tested without a game.
 *
 *   i        bay index (0 or 1), used for the barrel the shot comes from
 *   id       module id, so the panel can name it
 *   dmg      damage a shot, before the hull's dmg multiplier
 *   rate     shots a second, per barrel
 *   speed    bullet speed
 *   draw     MJ/s the gun asks for while the trigger is held
 *   barrels  linked barrels fired side by side on every shot (default 1)
 */
export function gunsOf(loadout) {
  const guns = [];
  ((loadout && loadout.primary) || []).forEach((id, i) => {
    const m = MODULES[id];
    if (!m || m.g !== "primary" || !m.dmg) return;
    guns.push({
      i,
      id,
      n: m.n,
      dmg: m.dmg,
      rate: m.rate || 1,
      speed: m.bspd || 900,
      draw: m.draw || 0,
      barrels: m.barrels || 1,
    });
  });
  return guns;
}

/**
 * The mining beams fitted in the primary bays, in bay order. A beam is a
 * primary module with a `period` instead of a `dmg` (no beam module means beams
 * is empty and key 2 is an empty weapon slot). Pure, so it can be tested
 * without a game. If two beams are fitted, the game uses the first one only.
 *
 *   i       bay index
 *   id      module id, so the panel can name it
 *   n       name, for the HUD
 *   period  seconds of continuous contact per ore, before the hull's mine multiplier
 *   range   metres the beam reaches
 *   draw    MJ/s while it is cutting
 */
export function beamsOf(loadout) {
  const beams = [];
  ((loadout && loadout.primary) || []).forEach((id, i) => {
    const m = MODULES[id];
    if (!m || m.g !== "primary" || !m.period) return;
    beams.push({
      i,
      id,
      n: m.n,
      period: m.period,
      range: m.range || 340,
      draw: m.draw || 0,
    });
  });
  return beams;
}

/**
 * The missile launchers fitted in the secondary bays, in bay order. A launcher
 * is a secondary module with a `dmg` (the missile's damage); the stock and the
 * reload come off the same module. Pure, so it can be tested without a game.
 * If two launchers are fitted, the game uses the first one only.
 *
 *   i       bay index
 *   id      module id, so the panel can name it
 *   n       name, for the shop and the HUD
 *   dmg     damage a missile does on impact
 *   cap     missiles the launcher carries
 *   cd      seconds between launches
 */
export function missilesOf(loadout) {
  const launchers = [];
  ((loadout && loadout.secondary) || []).forEach((id, i) => {
    const m = MODULES[id];
    if (!m || m.g !== "secondary" || !m.dmg) return;
    launchers.push({
      i,
      id,
      n: m.n,
      dmg: m.dmg,
      cap: m.cap || 1,
      cd: m.cd || 1,
    });
  });
  return launchers;
}

/**
 * Rebuild state.guns, state.beams and state.missiles from the save. Call after a
 * fit change, a ship change, a save load or a dock, the way the drive and the
 * shields are refreshed. Also clears any mining progress toward the next ore.
 */
export function refreshGuns() {
  const S = state.profile;
  const loadout = (S.loadout || {})[S.ship];
  state.guns = gunsOf(loadout);
  state.beams = beamsOf(loadout);
  state.missiles = missilesOf(loadout);
  state.flight.gunCd = state.guns.map(() => 0);
  state.flight.beamT = 0;
}
