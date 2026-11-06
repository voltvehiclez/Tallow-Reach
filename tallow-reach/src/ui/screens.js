// HTML for each outpost screen. These are pure functions of the game state,
// so the look of a screen can be changed without touching game logic.

import { SHIPS } from "../data/ships.js";
import { ITEM, KEYS } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE, SHOP_WEAPONS } from "../data/weapons.js";
import { MODULE_GROUPS, slotsFor, APPEARANCE_SLOTS } from "../data/outfitting.js";
import { MODULES } from "../data/modules.js";
import { storedFor, fittedAt, isBayGroup } from "../sim/fitting.js";
import { state } from "../state/state.js";
import { SLOT_COUNT, readSlot } from "../state/storage.js";
import { holdLoad, storedUnits, storageCap, valueOf, repairCost } from "../sim/economy.js";
import { describe } from "../sim/contracts.js";

export const TABS = [
  ["m", "Contracts"],
  ["h", "Hangar"],
  ["o", "Outfitting"],
  ["p", "Shop"],
  ["b", "Base"],
  ["s", "Saves"],
];

// Which function draws which tab. To add a tab: add it to TABS above, write a
// function that returns HTML, and list it here under the same key.
const SCREENS = {
  m: contractsHtml,
  h: hangarHtml,
  o: outfittingHtml,
  p: shopHtml,
  b: baseHtml,
  s: savesHtml,
};

export function introHtml() {
  return (
    `<h1>Tallow Reach</h1><div class="sub">A quiet, dangerous sector. Mine it, defend it, build on it.</div>` +
    `<p>You fly out of Meridian Outpost, your own station. Take contracts, cut ore from the asteroid field, fight off raiders, loot the wrecks, and bring it all home. If your ship is destroyed you lose it and its cargo, and must buy it again.</p>` +
    `<h2>Controls</h2>` +
    `<p>Mouse steers (distance from centre sets turn rate). ` +
    `W/S throttle, A/D strafe, Space and C move up and down, Q/E roll, Shift boost, X all stop. ` +
    `The main drive is much the strongest thruster: going forward is fast, while strafing, moving up and down and reversing are slow. ` +
    `Left click fires your primary weapon and right click your secondary. ` +
    `Keys 1 and 2 switch the primary between cannons and the mining beam. ` +
    `Missiles lock on when a hostile stays inside the dashed ring for about a second. ` +
    `Right click then fires a homing missile, or a dumbfire missile if you have no lock. ` +
    `The mining beam and missiles are sold in the Shop. ` +
    `F locks whatever is nearest your crosshair, such as hostiles, rocks, crates or the station, and F again releases it. ` +
    `G docks when you are within 300 m of the station and slower than 70 m/s. ` +
    `M warps to the next sector on the chart: from Tallow Reach that is empty Kestrel Hollow, and M again brings you back. ` +
    `The drive takes about two seconds: it releases the throttle and eases your turn back to neutral, so you coast while it winds up, and weapons are offline until it settles. ` +
    `P or Esc pauses, and the pause menu has the sound switch. ` +
    `Hold left Alt and move the mouse to orbit your ship, scroll to zoom.</p>` +
    `<button class="go" data-a="intro">Enter the hangar</button>`
  );
}

export function outpostHtml(ui) {
  const S = state.profile;
  let h = `<h1>Meridian Outpost</h1><div class="sub">${S.cr} cr. Contracts done ${S.done}. Kills ${S.kills}.</div><nav>${TABS.map(
    ([k, n]) => `<button data-a="tab" data-b="${k}" class="${ui.tab === k ? "on" : ""}">${n}</button>`
  ).join("")}</nav>`;
  if (ui.toast) h += `<div class="ok">${ui.toast}</div>`;

  const render = SCREENS[ui.tab];
  if (render) h += render(ui);

  const own = S.ships.includes(S.ship);
  h += `<button class="go" data-a="go" ${own ? "" : "disabled"}>${own ? "Launch" : "Buy a ship in the Hangar to launch"}</button>`;
  return h;
}

function contractsHtml(ui) {
  const m = state.profile.mission;
  if (m) {
    return `<h2>Active contract</h2><div class="row"><div>${describe(m)}<small>Progress ${m.p}/${m.n}. Reward ${m.r} cr.</small></div>${
      m.p >= m.n ? `<button data-a="done">Collect reward</button>` : `<button data-a="drop">Abandon</button>`
    }</div>`;
  }
  return (
    `<h2>Contract board</h2>` +
    ui.board
      .map(
        (c, i) =>
          `<div class="row"><div>${describe(c)}<small>Threat ${c.tier} of 3. Reward ${c.r} cr.</small></div><button data-a="acc" data-b="${i}">Accept</button></div>`
      )
      .join("") +
    `<div class="row"><small>Contracts reshuffle every time you refresh.</small><button data-a="ref">Refresh</button></div>`
  );
}

function hangarHtml() {
  const S = state.profile;
  const repairs =
    `<h2>Hull repairs</h2>` +
    S.ships
      .map(id => {
        const c = repairCost(id),
          pct = Math.round((S.hp[id] ?? 1) * 100);
        return `<div class="row"><div>${SHIPS[id].n}<small>Hull ${pct}%. Costs more the more damaged it is.</small></div><button data-a="rp" data-b="${id}" ${
          c <= 0 || S.cr < c ? "disabled" : ""
        }>${c <= 0 ? "Intact" : "Repair " + c + " cr"}</button></div>`;
      })
      .join("") +
    `<h2>Ships</h2>`;

  return (
    `<h2>Hangar</h2><div class="sub">Berths ${S.ships.length}/${S.base.hangar + 1}</div>` +
    repairs +
    Object.keys(SHIPS)
      .map(id => {
        const s = SHIPS[id],
          owned = S.ships.includes(id);
        const action = owned
          ? S.ship === id
            ? `<span class="ok">In use</span>`
            : `<button data-a="sel" data-b="${id}">Fly</button>`
          : `<button data-a="buy" data-b="${id}" ${
              S.cr < s.price || S.ships.length >= S.base.hangar + 1 ? "disabled" : ""
            }>Buy ${s.price} cr</button>`;
        return `<div class="row"><div>${s.n}<small>${s.d} Hull ${s.hull}, shield ${s.sh}, hold ${s.cargo}.</small></div>${action}</div>`;
      })
      .join("")
  );
}

// The bays fitted to the ship being flown, group id -> module ids per bay.
const baysOf = () => (state.profile.loadout || {})[state.profile.ship] || {};

/** The stat line on a fitted module's bay: "10 MJ/s", "100 MJ", or nothing. */
function moduleStat(m) {
  if (m.mjps) return `${m.mjps} MJ/s`;
  if (m.mj) return `${m.mj} MJ`;
  if (m.spd) return `${m.spd} m/s`;
  return "";
}

/** How many groups sit in the left column; the rest go to the right. */
const leftRail = list => list.slice(0, Math.ceil(list.length / 2));

/** Is this the bay whose picker is open? */
const isBayOpen = (g, i) => !!(state.ui.fit && state.ui.fit.g === g && state.ui.fit.i === i);

/**
 * One bay. Every bay is a button: clicking it opens the picker under the card
 * (or closes it again if it was already open).
 */
function bayHtml(group, i, id) {
  const m = MODULES[id];
  const open = isBayOpen(group.k, i);
  const attrs =
    `data-a="slot" data-b="${group.k}:${i}" aria-expanded="${open}"`;
  if (!m) {
    return (
      `<button class="mod-bay empty${open ? " on" : ""}" ${attrs} ` +
      `aria-label="${group.n} bay ${i + 1}: empty, click to fit a module">` +
      `<span class="bay-no">Bay ${i + 1}</span><span class="bay-empty">Empty</span></button>`
    );
  }
  return (
    `<button class="mod-bay fitted${open ? " on" : ""}" ${attrs} data-module="${id}" ` +
    `aria-label="${group.n} bay ${i + 1}: ${m.n}, click to change">` +
    `<span class="bay-no">Bay ${i + 1}</span>` +
    `<span class="bay-val">${m.n}</span>` +
    `<span class="bay-stat">${moduleStat(m)}</span>` +
    `</button>`
  );
}

/**
 * The picker under a card: every stored part that fits this group, as squares,
 * plus Unequip when the bay is holding something. This is the whole fitting UI.
 */
function pickerHtml(group) {
  const i = state.ui.fit.i;
  const current = fittedAt(group.k, i);
  const stored = storedFor(group.k);

  const squares = stored.length
    ? `<div class="fit-squares">` +
      stored
        .map(id => {
          const m = MODULES[id];
          return (
            `<button class="fit-sq" data-a="fit" data-b="${id}" aria-label="Fit ${m.n}">` +
            `<span>${m.n}</span><small>${moduleStat(m)}</small></button>`
          );
        })
        .join("") +
      `</div>`
    : `<div class="fit-empty">No modules in storage.</div>`;

  return (
    `<div class="fit-picker">` +
    `<div class="fit-head"><span>${group.n} &middot; bay ${i + 1}</span>` +
    `<button class="fit-close" data-a="slot" data-b="${group.k}:${i}">Close</button></div>` +
    squares +
    (current
      ? `<button class="fit-unfit" data-a="unfit">Unequip ${MODULES[current].n} to storage</button>`
      : "") +
    `</div>`
  );
}

/** One module group: a heading, its bays, the picker if open, and what it decides. */
function groupHtml(group) {
  const slots = slotsFor(group, state.profile.ship),
    fitted = baysOf()[group.k] || [];
  let bays = "";
  for (let i = 0; i < slots; i++) bays += bayHtml(group, i, fitted[i]);
  const used = fitted.filter(Boolean).length;
  const open = state.ui.fit && state.ui.fit.g === group.k && isBayGroup(group.k);

  return (
    `<section class="mod${open ? " open" : ""}" data-group="${group.k}">` +
    `<header><h3>${group.n}</h3><span class="mod-count">${used} / ${slots}</span></header>` +
    `<div class="mod-bays">${bays}</div>` +
    (open ? pickerHtml(group) : "") +
    `<p>${group.d}</p>` +
    `</section>`
  );
}

// The paint card, always last in the right-hand column: it sits under the hull
// group, which is the last module group. Same card as a module group, so paints
// will look like modules once they can be bought and fitted.
function appearanceHtml() {
  const bays = APPEARANCE_SLOTS.map(
    a =>
      `<div class="mod-bay" data-paint="${a.k}" aria-label="${a.n} colour: empty">` +
      `<span class="bay-no">${a.n}</span><span class="bay-empty">Empty</span></div>`
  ).join("");

  return (
    `<section class="mod mod-appearance" data-appearance>` +
    `<header><h3>Appearance</h3><span class="mod-count">0 / ${APPEARANCE_SLOTS.length}</span></header>` +
    `<div class="mod-bays">${bays}</div>` +
    `<p>Paint for the main plates and the trim. The standard livery is used until a colour is fitted.</p>` +
    `</section>`
  );
}

function outfittingHtml() {
  const ship = SHIPS[state.profile.ship];
  const left = leftRail(MODULE_GROUPS),
    right = MODULE_GROUPS.slice(left.length);

  return (
    `<h2>Outfitting</h2>` +
    `<div class="sub">Your ship flies with the basic powerplant and power cell fitted. More modules and paints arrive in a later update.</div>` +
    `<div class="outfit">` +
    `<div class="outfit-rail">${left.map(groupHtml).join("")}</div>` +
    `<div class="outfit-view">` +
    // ui/outfitting.js mounts the 3D ship into #shipview after this HTML is drawn.
    `<div class="outfit-stage" id="shipview">` +
    `<div class="outfit-title">${ship.n}<small>${ship.d}</small></div>` +
    `<div class="outfit-tip">Drag to rotate &middot; scroll to zoom &middot; double click to reset</div>` +
    `</div>` +
    `</div>` +
    `<div class="outfit-rail">${right.map(groupHtml).join("")}${appearanceHtml()}</div>` +
    `</div>`
  );
}

function baseHtml() {
  const S = state.profile,
    ship = SHIPS[S.ship];
  const load = holdLoad(),
    used = storedUnits(),
    cap = storageCap();

  let h =
    `<h2>Cargo and storage</h2><div class="sub">Hold ${load}/${ship.cargo}. Storage ${used}/${cap}. Refinery bonus +${Math.round(
      REFINERY_BONUS_PER_LEVEL * 100 * S.base.refinery
    )}%.</div>` +
    KEYS.map(
      k =>
        `<div class="row"><div>${ITEM[k].n}<small>${S.cargo[k]} in hold, ${S.store[k]} stored, ${ITEM[k].v} cr each</small></div></div>`
    ).join("") +
    `<div class="row"><button data-a="dep">Store hold</button><button data-a="wd">Load stored</button><button data-a="sellh" ${
      load ? "" : "disabled"
    }>Sell hold ${valueOf(S.cargo)} cr</button><button data-a="sells" ${
      used ? "" : "disabled"
    }>Sell stored ${valueOf(S.store)} cr</button></div><h2>Base modules</h2>`;

  h += Object.keys(BASE_MODULES)
    .map(k => {
      const mdef = BASE_MODULES[k],
        level = S.base[k],
        cost = mdef.cost(level),
        maxed = level >= mdef.max;
      return `<div class="row"><div>${mdef.n} level ${level}<small>${mdef.d}</small></div><button data-a="up" data-b="${k}" ${
        maxed || S.cr < cost ? "disabled" : ""
      }>${maxed ? "Maxed" : "Build " + cost + " cr"}</button></div>`;
    })
    .join("");
  return h;
}

function shopHtml() {
  const S = state.profile;
  let h =
    `<h2>Weapons shop</h2><div class="sub">Left click fires your primary weapon (keys 1 and 2 switch). Right click fires your secondary weapon.</div>` +
    `<div class="row"><div>Autocannons<small>Primary. Standard issue.</small></div><span class="ok">Owned</span></div>`;

  h += Object.keys(SHOP_WEAPONS)
    .map(k => {
      const w = SHOP_WEAPONS[k];
      return `<div class="row"><div>${w.n}<small>${w.d}</small></div>${
        S.wp[k] ? `<span class="ok">Owned</span>` : `<button data-a="wb" data-b="${k}" ${S.cr < w.price ? "disabled" : ""}>Buy ${w.price} cr</button>`
      }</div>`;
    })
    .join("");

  if (S.wp.msl) {
    const canRestock = S.msl < MISSILE.cap && S.cr >= MISSILE.unitPrice;
    const n = Math.min(MISSILE.cap - S.msl, Math.floor(S.cr / MISSILE.unitPrice));
    h += `<div class="row"><div>Missile stock<small>${S.msl} of ${MISSILE.cap} loaded. ${MISSILE.unitPrice} cr each.</small></div><button data-a="wr" ${
      canRestock ? "" : "disabled"
    }>Restock ${n * MISSILE.unitPrice} cr</button></div>`;
  }
  return h;
}

function savesHtml(ui) {
  const S = state.profile;
  const slotRows = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const n = i + 1,
      s = readSlot(n);
    return `<div class="row"><div>Slot ${n}<small>${
      s ? `${s.cr} cr, ${s.ships.length} ships, ${s.done} contracts` : "Empty"
    }</small></div><div><button data-a="sv" data-b="${n}">Save</button> <button data-a="ld" data-b="${n}" ${
      s ? "" : "disabled"
    }>Load</button> <button data-a="dl" data-b="${n}" ${s ? "" : "disabled"}>Delete</button></div></div>`;
  }).join("");

  const resetRow = ui.confirmReset
    ? `<div class="row"><div>Wipe credits, ships, base and contracts? Save slots are kept.</div><div><button data-a="rs2">Yes, reset</button> <button data-a="rs0">Cancel</button></div></div>`
    : `<div class="row"><div>Start again from scratch<small>Resets the current game, not your save slots.</small></div><button data-a="rs1">Reset</button></div>`;

  return (
    `<h2>Save slots</h2><div class="sub">Your game also autosaves in this browser whenever you dock or change something here.</div>` +
    slotRows +
    `<h2>Reset progress</h2>` +
    resetRow +
    `<h2>Export and import</h2>` +
    `<div class="sub">Export gives you a text code for your whole game. Paste a code below and press Import to load it. Importing replaces your current game.</div>` +
    `<textarea id="xt" rows="4" spellcheck="false" placeholder="Paste a save code here">${ui.xcode}</textarea>` +
    `<div class="row"><button data-a="xp">Export</button><button data-a="im">Import</button></div>`
  );
}
