// HTML for each outpost screen. These are pure functions of the game state,
// so the look of a screen can be changed without touching game logic.

import { SHIPS } from "../data/ships.js";
import { ITEM_IDS, canSell, isItem, isModule, itemName, itemValue, itemVol } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE } from "../data/weapons.js";
import { shopDef } from "../data/shops.js";
import { MODULE_GROUPS, slotsFor, APPEARANCE_SLOTS } from "../data/outfitting.js";
import { MODULES } from "../data/modules.js";
import { storedFor, fittedAt, isBayGroup } from "../sim/fitting.js";
import {
  STATION, capacityOf, freeOf, itemsAt, loadOf, stockOf, valueOf,
} from "../sim/inventory.js";
import { hullOf } from "../sim/hull.js";
import { state } from "../state/state.js";
import { SLOT_COUNT, readSlot } from "../state/storage.js";
import { holdLoad, storedUnits, storageCap, repairCost, shopList } from "../sim/economy.js";
import {
  describe,
  activeMissions,
  canCollectMissionReward,
  isMissionComplete,
  missionProgress,
} from "../sim/contracts.js";
import { placeAt, DEFAULT_PLACE, nextPocket } from "../data/places.js";
import { term, terms } from "../data/terms.js";
import { stationAt } from "../sim/places.js";
import { missionLogHtml } from "./missionlog.js";

export const TABS = [
  ["m", "Contracts"],
  ["l", "Mission log"],
  ["h", "Hangar"],
  ["o", "Outfitting"],
  ["i", "Inventory"],
  ["p", "Shop"],
  ["b", "Base"],
  ["s", "Saves"],
];

// Which function draws which tab. To add a tab: add it to TABS above, write a
// function that returns HTML, and list it here under the same key.
const SCREENS = {
  m: contractsHtml,
  l: missionLogHtml,
  h: hangarHtml,
  o: outfittingHtml,
  i: inventoryHtml,
  p: shopHtml,
  b: baseHtml,
  s: savesHtml,
};

export function introHtml() {
  return (
    `<h1>Tallow Reach</h1><div class="sub">A quiet, dangerous ${term("flyable")}. Mine it, defend it, build on it.</div>` +
    `<p>You fly out of ${stationAt(DEFAULT_PLACE).n}, your own station. Take contracts, cut ore from the asteroid field, fight off raiders, loot the wrecks, and bring it all home. If your ship is destroyed you lose it and its cargo, and must buy it again.</p>` +
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
    `M opens the starmap: right-click a system to set a destination, then press J while flying for each next warp. You can also choose individual pockets to warp to. The map pauses single-player flight; M or Esc closes it. ` +
    `The drive takes about two seconds: it releases the throttle and eases your turn back to neutral, so you coast while it winds up, and weapons are offline until it settles. ` +
    `P or Esc pauses, and the pause menu has the sound switch. ` +
    `Hold left Alt and move the mouse to orbit your ship, scroll to zoom.</p>` +
    `<button class="go" data-a="intro">Enter game</button>`
  );
}

export function outpostHtml(ui) {
  const S = state.profile;
  let h = `<h1>${(stationAt(state.place) || stationAt(DEFAULT_PLACE)).n}</h1><div class="sub">${S.cr} cr. Contracts done ${S.done}. Kills ${S.kills}.</div><nav>${TABS.map(
    ([k, n]) => `<button data-a="tab" data-b="${k}" class="${ui.tab === k ? "on" : ""}">${n}</button>`
  ).join("")}</nav>`;
  if (ui.toast) h += `<div class="ok">${ui.toast}</div>`;

  const render = SCREENS[ui.tab];
  if (render) h += render(ui);

  const own = S.ships.includes(S.ship);
  h += `<button class="go" data-a="go" ${own ? "" : "disabled"}>${own ? "Launch" : "Buy a ship in the Hangar to launch"}</button>`;
  return h;
}

function contractsHtml() {
  const active = activeMissions();
  const activeHtml = active.length
    ? `<h2>Active missions</h2>` + active.map((m, i) => {
        const ready = isMissionComplete(m) && canCollectMissionReward(m),
          progress = m.type === "hunt" ? missionProgress(m) : null,
          detail = `${progress ? `Progress ${progress.done}/${progress.total}. ` : ""}Reward ${m.rewards?.credits ?? m.r ?? 0} cr.`;
        return `<div class="row"><div>${describe(m)}<small>${detail}</small></div>${
          ready
            ? `<button data-a="done" data-b="${i}">Collect reward</button>`
            : `<button data-a="drop" data-b="${i}">Abandon</button>`
        }</div>`;
      }).join("")
    : `<p>No active missions.</p>`;
  return (
    activeHtml +
    `<h2>Contract board</h2>` +
    state.worldState.board
      .map(
        (c, i) =>
          `<div class="row"><div>${describe(c)}<small>Threat ${c.tier} of 3. Reward ${c.r} cr.</small></div><button data-a="acc" data-b="${i}">Accept</button></div>`
      )
      .join("") +
    `<div class="row"><small>Contracts reshuffle every time you refresh.</small><button data-a="ref">Refresh</button></div>`
  );
}

function hangarHtml() {
  const S = state.profile,
    W = state.worldState;

  return (
    `<h2>Hangar</h2><div class="sub">Repairs and missile restock live in the Outfitting tab now.</div>` +
    Object.keys(SHIPS)
      .map(id => {
        const s = SHIPS[id],
          owned = S.ships.includes(id),
          hp = hullOf((S.loadout || {})[id]);
        const action = owned
          ? S.ship === id
            ? `<span class="ok">In use</span>`
            : `<button data-a="sel" data-b="${id}">Fly</button>`
          : `<button data-a="buy" data-b="${id}" ${
              S.cr < s.price || S.ships.length >= W.base.hangar + 1 ? "disabled" : ""
            }>Buy ${s.price} cr</button>`;
        return `<div class="row"><div>${s.n}<small>${s.d} Hull HP ${hp}, hold ${s.cargo} m³.</small></div>${action}</div>`;
      })
      .join("")
  );
}

// The bays fitted to the ship being flown, group id -> module ids per bay.
const baysOf = () => (state.profile.loadout || {})[state.profile.ship] || {};

/**
 * The stat line on a fitted module's bay: "10 MJ/s", "100 MJ", "150 m/s",
 * "10 Shield HP", "1 dmg, 3/s", "0.25 m³/s", or nothing.
 */
function moduleStat(m) {
  if (m.mjps) return `${m.mjps} MJ/s`;
  if (m.mj) return `${m.mj} MJ`;
  if (m.spd) return `${m.spd} m/s`;
  if (m.sh) return `${m.sh} Shield HP`;
  if (m.hp) return `${m.hp} Hull HP`;
  if (m.period) return `${+(1 / m.period).toFixed(2)} m³/s`;
  if (m.dmg && m.cd) return `${m.dmg} dmg, ${m.cap} cap, ${m.cd} s reload`;
  if (m.dmg) return `${m.dmg} dmg${(m.barrels || 1) > 1 ? ` x${m.barrels}` : ""}, ${m.rate}/s`;
  return "";
}

/** How many groups sit in the left column; the rest go to the right. */
const leftRail = list => list.slice(0, Math.ceil(list.length / 2));

/** Is this the bay whose picker is open? */
const isBayOpen = (g, i) =>
  !!(state.ui.fit && state.ui.fit.kind === "module" && state.ui.fit.g === g && state.ui.fit.i === i);

/** Is this the paint bay whose picker is open? */
const isPaintOpen = k =>
  !!(state.ui.fit && state.ui.fit.kind === "paint" && state.ui.fit.k === k);

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

  // One square per kind of part, with how many the station holds ("x3").
  const kinds = [];
  for (const id of stored) {
    const hit = kinds.find(k => k.id === id);
    if (hit) hit.n++;
    else kinds.push({ id, n: 1 });
  }
  const squares = kinds.length
    ? `<div class="fit-squares">` +
      kinds
        .map(({ id, n }) => {
          const m = MODULES[id];
          return (
            `<button class="fit-sq" data-a="fit" data-b="${id}" aria-label="Fit ${m.n}${n > 1 ? ", " + n + " in storage" : ""}">` +
            `<span>${m.n}${n > 1 ? ` &times;${n}` : ""}</span><small>${moduleStat(m)}</small></button>`
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
// group, which is the last module group. Its bays are buttons exactly like module
// bays and open the same kind of picker; nothing can be stored in it yet, so the
// picker always reads empty until paints exist.
function paintPickerHtml(slot) {
  return (
    `<div class="fit-picker">` +
    `<div class="fit-head"><span>Appearance &middot; ${slot.n}</span>` +
    `<button class="fit-close" data-a="paint" data-b="${slot.k}">Close</button></div>` +
    // Stored paints will be listed here as squares, the way modules are.
    `<div class="fit-empty">No colours in storage.</div>` +
    `</div>`
  );
}

function appearanceHtml() {
  const bays = APPEARANCE_SLOTS.map(a => {
    const open = isPaintOpen(a.k);
    return (
      `<button class="mod-bay${open ? " on" : ""}" data-a="paint" data-b="${a.k}" ` +
      `aria-expanded="${open}" aria-label="${a.n} colour: empty, click to choose a colour">` +
      `<span class="bay-no">${a.n}</span><span class="bay-empty">Empty</span></button>`
    );
  }).join("");

  const open = APPEARANCE_SLOTS.find(a => isPaintOpen(a.k));

  return (
    `<section class="mod mod-appearance${open ? " open" : ""}" data-appearance>` +
    `<header><h3>Appearance</h3><span class="mod-count">0 / ${APPEARANCE_SLOTS.length}</span></header>` +
    `<div class="mod-bays">${bays}</div>` +
    (open ? paintPickerHtml(open) : "") +
    `<p>Paint for the main plates and the trim. The standard livery is used until a colour is fitted.</p>` +
    `</section>`
  );
}

function outfittingHtml() {
  const S = state.profile;
  const ship = SHIPS[S.ship];
  const owned = S.ships;
  const idx = Math.max(0, owned.indexOf(S.ship));
  const many = owned.length > 1 ? "" : "disabled";
  const left = leftRail(MODULE_GROUPS),
    right = MODULE_GROUPS.slice(left.length);

  // Services for the hull in the viewer (the selected ship): paid repair of its
  // plating and paid restock of its missiles. Moved out of the Hangar and the Shop.
  const repCost = repairCost(S.ship),
    repPct = Math.round((S.hp[S.ship] ?? 1) * 100);
  let serviceRows =
    `<div class="row"><div>Hull repairs<small>Hull HP ${repPct}%. Costs more the more damaged it is.</small></div>` +
    `<button data-a="rp" data-b="${S.ship}" ${repCost <= 0 || S.cr < repCost ? "disabled" : ""}>${
      repCost <= 0 ? "Intact" : "Repair " + repCost + " cr"
    }</button></div>`;
  const fittedLauncher = (state.missiles || [])[0];   // launcher fitted to the ship in the viewer
  if (fittedLauncher) {
    const cap = fittedLauncher.cap,
      canRestock = S.msl < cap && S.cr >= MISSILE.unitPrice,
      n = Math.min(cap - S.msl, Math.floor(S.cr / MISSILE.unitPrice));
    serviceRows +=
      `<div class="row"><div>Missile restock<small>${S.msl} of ${cap} loaded. ${MISSILE.unitPrice} cr each.</small></div>` +
      `<button data-a="wr" ${canRestock ? "" : "disabled"}>${
        S.msl >= cap ? "Full" : "Restock " + n * MISSILE.unitPrice + " cr"
      }</button></div>`;
  }
  const services =
    `<div class="outfit-service"><div class="outfit-service-title">Services</div>` + serviceRows + `</div>`;

  return (
    `<h2>Outfitting</h2>` +
    `<div class="sub">Your ship flies with the basic powerplant and power cell fitted. More modules and paints arrive in a later update.</div>` +
    `<div class="outfit">` +
    `<div class="outfit-rail">${left.map(groupHtml).join("")}</div>` +
    `<div class="outfit-mid">` +
    // Cycle through the ships in the hangar; the arrows carry the same action as the Hangar's Fly button.
    `<div class="ship-switch">` +
    `<button class="ship-arrow" data-a="shipPrev" ${many} aria-label="Previous ship">&#8249;</button>` +
    `<div class="ship-switch-mid"><div class="ship-switch-name">${ship.n}</div><div class="ship-switch-count">${idx + 1} of ${owned.length} in the hangar</div></div>` +
    `<button class="ship-arrow" data-a="shipNext" ${many} aria-label="Next ship">&#8250;</button>` +
    `</div>` +
    `<div class="outfit-view">` +
    // ui/outfitting.js mounts the 3D ship into #shipview after this HTML is drawn.
    `<div class="outfit-stage" id="shipview">` +
    `<div class="outfit-title">${ship.n}<small>${ship.d}</small></div>` +
    `<div class="outfit-tip">Drag to rotate &middot; scroll to zoom &middot; double click to reset</div>` +
    `</div>` +
    `</div>` +
    services +
    `</div>` +
    `<div class="outfit-rail">${right.map(groupHtml).join("")}${appearanceHtml()}</div>` +
    `</div>`
  );
}

function baseHtml() {
  const S = state.profile,
    W = state.worldState,
    ship = SHIPS[S.ship],
    cargo = stockOf(S.ship),
    station = stockOf(STATION);
  const load = holdLoad(),
    used = storedUnits(),
    cap = storageCap();
  // Sell buttons cover everything with a sell value: ore, salvage and spare
  // modules alike. A part fitted in a bay is in no place, so it is not for sale.
  const sellable = stock => Object.keys(stock || {}).filter(id => isItem(id) && canSell(id)).length;
  const sellHeld = sellable(cargo),
    sellStored = sellable(station);

  let h =
    `<h2>Cargo and storage</h2><div class="sub">Hold ${load}/${ship.cargo} m³. ${(stationAt(state.place) || stationAt(DEFAULT_PLACE)).n} storage ${used}/${cap} m³. Refinery bonus +${Math.round(
      REFINERY_BONUS_PER_LEVEL * 100 * W.base.refinery
    )}%.</div>` +
    ITEM_IDS.filter(id => !isModule(id))
      .map(
        id =>
          `<div class="row"><div>${itemName(id)}<small>${cargo[id] || 0} in hold, ${station[id] || 0} stored, ${itemValue(id)} cr each</small></div></div>`
      )
      .join("") +
    `<div class="row"><button data-a="dep">Store hold</button><button data-a="wd">Load stored</button><button data-a="sellh" ${
      sellHeld ? "" : "disabled"
    }>Sell hold ${valueOf(cargo)} cr</button><button data-a="sells" ${
      sellStored ? "" : "disabled"
    }>Sell stored ${valueOf(station)} cr</button></div>` +
    `<div class="sub">Selling takes ore, salvage and spare modules from the current station or hold, and leaves parts fitted on a ship alone.</div><h2>Base modules</h2>`;

  h += Object.keys(BASE_MODULES)
    .map(k => {
      const mdef = BASE_MODULES[k],
        level = W.base[k],
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
  // The shop is data (data/shops.js) and sim/economy.js's shopList() turns it
  // into these rows; the screen only decides how a row looks.
  const shopId = (stationAt(state.place) || stationAt(DEFAULT_PLACE)).shop;
  const def = shopDef(shopId);
  // One row per part: everything the shop offers comes from `stock`, so a part
  // is never listed twice (a part the ship already flies with is simply on sale).
  let h = `<h2>${def.n}</h2><div class="sub">${def.d}</div>`;

  h += shopList(shopId)
    .map(s => {
      // A limited row shows what is left and greys out when it is gone; an
      // unlimited row (every row today) shows nothing extra.
      const soldOut = s.left !== null && s.left < 1;
      return `<div class="row"><div>${s.n}<small>${s.d} Takes ${s.vol} m³.${s.owned ? ` You own ${s.owned}.` : ""}${
        soldOut ? " Sold out." : s.left !== null ? ` ${s.left} left.` : ""
      }${s.room ? "" : " No room in the station's storage."}</small></div>` +
        `<button data-a="wb" data-b="${shopId}:${s.id}" ${S.cr < s.price || !s.room || soldOut ? "disabled" : ""}>Buy ${s.price} cr</button></div>`;
    })
    .join("");
  return h;
}

/** The ship whose hold the Inventory tab shows: the one picked with its arrows, else the one being flown. */
export function viewedShip(ui = state.ui) {
  const S = state.profile;
  return S.ships.includes(ui.invShip) ? ui.invShip : S.ship;
}

/** One ore or module tile in the inventory grid, with its existing move actions. */
function invRow({ name, sub, kind, id, count, dir, free, vol }) {
  const where = dir === "s" ? "ship" : "station";
  const room = Math.floor(free / (vol || 1));
  const noRoom = room > 0 ? "false" : "true";
  return (
    `<button class="inv-item" data-a="mv" data-b="${kind}:${id}:${dir}:1" data-kind="${kind}" data-id="${id}" data-dir="${dir}" data-count="${count}" aria-disabled="${noRoom}" ` +
    `title="${name}: ${sub}. Click to move one; Shift-click to move the whole stack." ` +
    `aria-label="${name}, quantity ${count}. Click to move one to the ${where}; Shift-click to move the whole stack.">` +
    `<span class="inv-item-top"><span class="inv-kind">${kind === "c" ? "ORE" : "MOD"}</span><span class="inv-n">&times;${count}</span></span>` +
    `<span class="inv-item-name">${name}</span><span class="inv-item-meta">${vol} m³ each</span>` +
    `</button>`
  );
}

/** One inventory panel: a heading with the m³ in use, then a grid of contents. */
function invColumn(where, title, dir) {
  const dest = where === STATION ? viewedShip() : STATION;   // where the buttons send things
  const used = loadOf(where),
    cap = capacityOf(where),
    destFree = freeOf(dest);
  const rows = [];
  // One list for the whole place: goods in catalogue order, then spare modules
  // in the order they arrived. The kind is what the tile shows (ORE / MOD) and
  // what the move and sell actions read; the catalogue decides which is which.
  for (const { id, n } of itemsAt(where)) {
    const part = isModule(id);
    rows.push(
      invRow({
        name: itemName(id),
        sub: `${part ? "Module" : "Ore"}, ${itemVol(id)} m³ each`,
        kind: part ? "m" : "c",
        id,
        count: n,
        dir,
        free: destFree,
        vol: itemVol(id),
      })
    );
  }
  // Keep a 5-by-5 slot field even when this hold contains fewer items. The
  // three-row viewport therefore stays the same size and remains scrollable.
  while (rows.length < 25) rows.push(`<div class="inv-empty-slot" aria-hidden="true"></div>`);
  return (
    `<section class="inv-col"><header><h3>${title}</h3><span class="mod-count">${used} / ${cap} m³</span></header>` +
    `<div class="inv-grid">${rows.join("")}</div>` +
    `</section>`
  );
}

function inventoryHtml(ui) {
  const S = state.profile;
  const id = viewedShip(ui),
    ship = SHIPS[id],
    idx = Math.max(0, S.ships.indexOf(id)),
    many = S.ships.length > 1 ? "" : "disabled";

  return (
    `<h2>Inventory</h2><div class="sub">Click an item to move one; Shift-click to move its whole stack. Right-click an item to sell it — ore, salvage and spare modules alike. Everything you buy is kept in the station. ` +
    `Outfitting fits modules from the station. Fitted modules take no space. Each ship has its own hold, and a lost ship takes its hold with it.</div>` +
    invColumn(STATION, "Station", "s") +
    `<div class="ship-switch inv-switch">` +
    `<button class="ship-arrow" data-a="invPrev" ${many} aria-label="Previous ship">&#8249;</button>` +
    `<div class="ship-switch-mid"><div class="ship-switch-name">${ship.n}${id === S.ship ? " (flying)" : ""}</div>` +
    `<div class="ship-switch-count">${idx + 1} of ${S.ships.length} in the hangar</div></div>` +
    `<button class="ship-arrow" data-a="invNext" ${many} aria-label="Next ship">&#8250;</button>` +
    `</div>` +
    invColumn(id, `${ship.n} hold`, "t")
  );
}

function slotSummary(raw) {
  if (!raw || typeof raw !== "object") return null;
  const p = raw.profile && typeof raw.profile === "object" ? raw.profile : raw;
  if (!Array.isArray(p.ships)) return null;
  return `${Math.max(0, Math.floor(+p.cr || 0))} cr, ${p.ships.length} ships, ${Math.max(0, Math.floor(+p.done || 0))} contracts`;
}

function savesHtml(ui) {
  const slotRows = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const n = i + 1,
      s = readSlot(n),
      summary = slotSummary(s);
    return `<div class="row"><div>Slot ${n}<small>${
      summary || "Empty"
    }</small></div><div><button data-a="sv" data-b="${n}">Save</button> <button data-a="ld" data-b="${n}" ${
      summary ? "" : "disabled"
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
