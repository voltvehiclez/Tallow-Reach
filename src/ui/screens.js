import { canSetHomeStation, homeStationPlace } from "../sim/session.js";
// HTML for each outpost screen. These are pure functions of the game state,
// so the look of a screen can be changed without touching game logic.

import { shipDef, shipLabel, shipTypeOf } from "../data/ships.js";
import { isModule, itemCat, itemName, itemUse, itemVol } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE } from "../data/weapons.js";
import { shopDef } from "../data/shops.js";
import { MODULE_GROUPS, slotsFor, APPEARANCE_SLOTS } from "../data/outfitting.js";
import { MODULES } from "../data/modules.js";
import { storedFor, fittedAt, isBayGroup } from "../sim/fitting.js";
import { CACHE, STATION, capacityOf, loadOf, slotsAt } from "../sim/inventory.js";
import { cacheTradeRecord, cacheUnits } from "../sim/instances.js";
import { state } from "../state/state.js";
import { SLOT_COUNT, readSlot } from "../state/storage.js";
import {
  storedUnits, storageCap, repairCost, hangarCap, listPlayerAssets, localShips, shipBaseStats, shopCatalogue,
} from "../sim/economy.js";
import {
  describe,
  boardAt,
  boardRefreshRemaining,
  formatBoardCooldown,
} from "../sim/contracts.js";
import { DEFAULT_PLACE } from "../data/places.js";
import { term } from "../data/terms.js";
import { stationAt } from "../sim/places.js";
import { missionLogHtml } from "./missionlog.js";
import { LEFT_TOGGLE_KEYS, activeLeftPanel, activeRightTab } from "./left-panel.js";

const esc = text => String(text ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Station menu buttons:
// - Missions, Inventory, Base, Saves switch the right-hand station panel
//   (Missions also opens the Contract board in the left window).
// - Outfitting and Shop toggle the shared mutually exclusive left-side window.
export const TABS = [
  ["l", "Missions"],
  ["i", "Inventory"],
  ["o", "Outfitting"],
  ["p", "Shop"],
  ["b", "Base"],
  ["s", "Saves"],
];

// Right-hand station panel screens.
const SCREENS = {
  l: missionLogHtml,
  i: inventoryHtml,
  b: baseHtml,
  s: savesHtml,
};

// Left-hand reusable station window screens.
const LEFT_SCREENS = {
  m: contractsHtml,
  o: outfittingHtml,
  p: shopHtml,
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
    `Keys 1–5 select primary bays; 6–0 select secondary bays, matching Outfitting order. ` +
    `Missiles lock on when a hostile stays inside the dashed ring for about a second. ` +
    `Right click then fires a homing missile, or a dumbfire missile if you have no lock. ` +
    `The mining beam and missiles are sold in the Shop. ` +
    `F locks whatever is nearest your crosshair, such as hostiles, rocks, crates or the station, and F again releases it. ` +
    `G docks when you are within 300 m of the station and slower than 70 m/s. ` +
    `R enters a wormhole when you are close to one, and R again leaves an instance through the way you came in — never by contact, and a sealed way out says why. ` +
    `M opens the starmap: right-click a system to set a destination, then press J while flying for each next warp. You can also choose individual pockets to warp to. The world keeps running while the map is open; M or Esc closes it. ` +
    `The drive takes about two seconds: it releases the throttle and eases your turn back to neutral, so you coast while it winds up, and weapons are offline until it settles. ` +
    `N toggles a pocket object list with filters and sorting; click a row to lock it. Mouse steering and firing are released while browsing; keyboard flight continues. ` +
    `I shows the hold of the ship you are flying while you are in space; dock to move cargo. ` +
    `P or Esc pauses, and the pause menu has the sound switch. ` +
    `Press Left Alt to toggle orbit view, move the mouse to orbit your ship, scroll to zoom. Press Left Alt again to return to flight view.</p>` +
    `<div class="main-menu-actions">` +
    `<button class="go" data-a="campaign" disabled>Campaign</button>` +
    `<button class="go" data-a="intro">Open World</button>` +
    `</div>`
  );
}

export function outpostHtml(ui = state.ui) {
  const S = state.profile;
  const activeTab = activeRightTab(ui);
  const openLeft = activeLeftPanel(ui);
  const navHtml = TABS.map(([k, n]) => {
    if (LEFT_TOGGLE_KEYS.has(k)) {
      const open = openLeft === k;
      return (
        `<button type="button" data-a="leftTab" data-b="${k}" class="${open ? "on" : ""}" ` +
        `aria-pressed="${open}">${n}</button>`
      );
    }
    return `<button type="button" data-a="tab" data-b="${k}" class="${activeTab === k ? "on" : ""}">${n}</button>`;
  }).join("");
  let h = `<h1>${(stationAt(state.place) || stationAt(DEFAULT_PLACE)).n}</h1><div class="sub">${S.cr} cr. Contracts done ${S.done}. Kills ${S.kills}.</div><nav>${navHtml}</nav>`;

  const isHome = homeStationPlace(S) === state.place;
  h += `<div class="home-station"><button data-a="home" ${isHome || !canSetHomeStation(state.place) ? "disabled" : ""}>${isHome ? "Home station" : "Set Home Station"}</button><small>Recover here after death.</small></div>`;
  const draw = SCREENS[activeTab];
  if (draw) h += draw(ui);

  const local = localShips(S, state.worldState);
  const own = local.includes(S.ship);
  h += `<button class="go" data-a="go" ${own ? "" : "disabled"}>${own ? "Launch" : "Buy a ship in the Shop to launch"}</button>`;
  return h;
}

/** Pure HTML content for the reusable left-side station window (`"o" | "p" | "m"`). */
export function leftPanelHtml(ui = state.ui) {
  const view = activeLeftPanel(ui);
  const draw = view && LEFT_SCREENS[view];
  return draw ? draw(ui) : "";
}

/** Contract board rendered inside the left window when Missions is active. */
export function contractsHtml() {
  const offers = boardAt(state.place);
  const wait = boardRefreshRemaining(state.place);
  const cooling = wait > 0;
  const waitText = formatBoardCooldown(wait);
  const offersHtml = offers.length
    ? offers.map(
        (c, i) =>
          `<div class="row"><div>${describe(c)}<small>Threat ${c.tier} of 3. Reward ${c.r} cr.</small></div><button data-a="acc" data-b="${i}">Accept</button></div>`
      ).join("")
    : `<p>No contracts available at this station right now.${cooling ? ` Wait ${waitText} to refresh, or visit another station.` : " Press Refresh for new contracts."}</p>`;
  const refreshNote = cooling
    ? `Next refresh available in ${waitText} of play time.`
    : `This station's board can be refreshed now.`;
  const refreshLabel = cooling ? `Refresh (${waitText})` : "Refresh";
  return (
    `<h2>Contract board</h2>` +
    offersHtml +
    `<div class="row"><small>${refreshNote}</small><button data-a="ref" ${cooling ? "disabled" : ""}>${refreshLabel}</button></div>`
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

/**
 * Pure right-click Ship details card, shared by Outfitting and the Shop:
 * unmodified baseline stats (Hull HP, Cargo space) and unique ship bonuses.
 */
export function shipDetailsHtml(shipId) {
  const stats = shipBaseStats(shipId);
  if (!stats) return "";
  const bonusRows = stats.bonuses.length
    ? stats.bonuses.map(line => `<li>${esc(line)}</li>`).join("")
    : `<li class="none">None</li>`;
  return (
    `<div class="inv-sell-head"><strong>${esc(stats.name)}</strong>` +
    `<div class="inv-sell-actions"><button type="button" data-a="shipInfoClose">Close</button></div></div>` +
    `<div class="ship-info-sub">Base stats (unfitted)</div>` +
    `<dl class="ship-info-stats">` +
    `<div><dt>Hull HP</dt><dd>${stats.hullHp} HP</dd></div>` +
    `<div><dt>Cargo space</dt><dd>${stats.cargo} m³</dd></div>` +
    `</dl>` +
    `<div class="ship-info-sub">Ship bonuses</div>` +
    `<ul class="ship-info-bonuses">${bonusRows}</ul>`
  );
}

/**
 * Pure "Buy amount" popup body for a compact Shop row. Because every row's Buy
 * button sits on the right side of the Shop panel, the popup extends leftward
 * and places its own Buy button on the right so it lands directly under the cursor.
 */
export function shopBuyHtml(row, maxBuy, amount = 1) {
  const safeMax = Math.max(1, Math.floor(+maxBuy) || 1);
  const qty = Math.min(safeMax, Math.max(1, Math.floor(+amount) || 1));
  const dest = row.kind === "ship" ? " &middot; Hangar" : "";
  return (
    `<div class="inv-sell-head"><strong>Buy ${esc(row.n)}</strong>` +
    `<div class="inv-sell-actions"><button type="button" data-a="shopBuyCancel">Cancel</button><button type="button" data-a="shopBuyConfirm">Buy</button></div></div>` +
    `<label>Buy amount <span>(1–${safeMax})</span><input class="inv-sell-amount" type="number" min="1" max="${safeMax}" step="1" value="${qty}"></label>` +
    `<div class="shop-buy-total">Total: <strong data-buy-total>${qty * row.price} cr</strong>${dest}</div>` +
    `<div class="inv-sell-error" aria-live="polite"></div>`
  );
}

/** Pure confirmation popup body for selling a stored ship from the Hangar. */
export function shipSellConfirmHtml(check) {
  const unpackNote = check.unpackVol > 0
    ? ` Cargo and fitted upgrades (${check.unpackVol} m³) will move to station storage.`
    : "";
  return (
    `<div class="inv-sell-head"><strong>Sell ${esc(check.label)} for ${check.price} cr?</strong>` +
    `<div class="inv-sell-actions"><button type="button" data-a="shipSellConfirm">Sell</button><button type="button" data-a="shipSellCancel">Cancel</button></div></div>` +
    `<p class="inv-discard-note">This permanently sells the ship.${esc(unpackNote)}</p>`
  );
}

/**
 * Compact stored-ship list shown at the top of the docked Inventory tab (above
 * Station hold and the ship's hold). Single left-clicking a row does not equip;
 * use the small Fly button, double-click the row, or right-click for Show info,
 * Fly ship, or Sell.
 */
export function hangarHtml() {
  const S = state.profile;
  const owned = localShips(S, state.worldState);
  const cap = hangarCap(state.worldState);
  const body = owned.length
    ? `<ul class="hangar-ships" aria-label="Ships stored at this station">` +
      owned
        .map(id => {
          const active = id === S.ship;
          const hpPct = Math.round((S.hp[id] ?? 1) * 100);
          const t = shipTypeOf(id);
          const label = shipLabel(id, owned);
          return (
            `<li class="hangar-ship-row${active ? " selected" : ""}" data-hangar-ship="${esc(id)}" data-ship-type="${t}" ` +
            `${active ? 'aria-current="true" ' : ""}` +
            `title="${esc(label)} — ${active ? "active ship" : "press Fly or double-click to fly"}. Right-click for options.">` +
            `<span class="hangar-ship-name">${esc(label)}</span>` +
            `<span class="hangar-ship-meta">` +
            `<small>${active ? "Active" : "Stored"}${hpPct < 100 ? ` &middot; ${hpPct}%` : ""}</small>` +
            `<button type="button" class="hangar-fly-btn" data-a="hangarFly" data-b="${esc(id)}" ` +
            `${active ? 'disabled title="Already flying this ship."' : `aria-label="Fly ${esc(label)}"`}>Fly</button>` +
            `</span>` +
            `</li>`
          );
        })
        .join("") +
      `</ul>`
    : `<div class="hangar-empty">No ships stored here. Buy a ship in the Shop.</div>`;
  return (
    `<section class="inv-col inv-ships">` +
    `<header><h3>Ships</h3><span class="mod-count">${owned.length} / ${cap} berths</span></header>` +
    body +
    `</section>`
  );
}

/** Outfitting screen rendered inside the reusable left-side station window. */
export function outfittingHtml() {
  const S = state.profile;
  const owned = localShips(S, state.worldState);
  if (!owned.length || !shipDef(S.ship)) {
    return (
      `<h2>Outfitting</h2>` +
      `<div class="sub">No ship is stored at this station. Buy a ship in the Shop to store it here.</div>`
    );
  }
  const ship = shipDef(S.ship);
  const shipType = shipTypeOf(S.ship);
  const label = shipLabel(S.ship, owned);
  const left = leftRail(MODULE_GROUPS),
    right = MODULE_GROUPS.slice(left.length);

  // Services for the hull in the viewer (the selected ship): paid repair of its
  // plating and paid restock of its missiles.
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
    `<div class="sub">Fit modules from station storage and paint your ship. Right-click the ship for details.</div>` +
    `<div class="outfit">` +
    `<div class="outfit-rail">${left.map(groupHtml).join("")}</div>` +
    `<div class="outfit-mid">` +
    `<div class="outfit-view">` +
    // ui/outfitting.js mounts the 3D ship into #shipview after this HTML is drawn.
    `<div class="outfit-stage" id="shipview" data-ship-type="${shipType}" data-ship-id="${esc(S.ship)}">` +
    `<div class="outfit-title">${esc(label)}<small>${esc(ship.d)}</small></div>` +
    `<div class="outfit-tip">Drag to rotate &middot; scroll to zoom &middot; double click to reset &middot; right-click for details</div>` +
    `</div>` +
    `</div>` +
    services +
    `</div>` +
    `<div class="outfit-rail">${right.map(groupHtml).join("")}${appearanceHtml()}</div>` +
    `</div>`
  );
}

function baseHtml() {
  const S = state.profile, W = state.worldState;
  let h = `<h2>Base modules</h2><div class="sub">Station storage ${storedUnits()}/${storageCap()} m³. Refinery bonus +${Math.round(REFINERY_BONUS_PER_LEVEL * 100 * W.base.refinery)}%.</div>`;

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

function shopItemsHtml(shopId, items, depth = 1) {
  if (!items.length) {
    return `<ul class="shop-items shop-depth-${depth}"><li class="shop-empty">None in stock</li></ul>`;
  }
  const S = state.profile;
  const rows = items
    .map(s => {
      const soldOut = s.left !== null && s.left < 1;
      const disabled = S.cr < s.price || !s.room || soldOut || s.maxBuy < 1;
      const notes = [];
      if (soldOut) notes.push("sold out");
      else if (s.left !== null) notes.push(`${s.left} left`);
      if (!s.room) notes.push(s.kind === "ship" ? "hangar full" : "no space");
      else if (s.owned) notes.push(s.kind === "ship" ? `${s.owned} here` : `own ${s.owned}`);
      const tip = s.kind === "ship"
        ? `${s.n}: ${s.d} Stored in Hangar. Right-click for ship details.`
        : `${s.n}: ${s.d} Takes ${s.vol} m³.`;
      const buyReason = soldOut
        ? "Sold out."
        : !s.room
          ? (s.kind === "ship" ? "Hangar full at this station — upgrade Hangar berth in Base." : "No room in station storage.")
          : S.cr < s.price
            ? `Need ${s.price} cr.`
            : `Choose how many ${s.n} to buy.`;
      return (
        `<li class="shop-item"${s.kind === "ship" ? ` data-ship-type="${esc(s.id)}"` : ""} title="${esc(tip)}">` +
        `<span class="shop-item-name">${esc(s.n)}${notes.length ? ` <small>${esc(notes.join(" · "))}</small>` : ""}</span>` +
        `<span class="shop-item-right">` +
        `<span class="shop-price">${s.price} cr</span>` +
        `<button type="button" class="shop-buy" data-a="wb" data-b="${esc(shopId)}:${s.kind}:${esc(s.id)}" ${disabled ? "disabled" : ""} title="${esc(buyReason)}">Buy</button>` +
        `</span></li>`
      );
    })
    .join("");
  return `<ul class="shop-items shop-depth-${depth}">${rows}</ul>`;
}

function shopNodeHtml(shopId, node, key, open, depth = 0) {
  const isOpen = !!open[key];
  let inner = "";
  if (isOpen) {
    if (node.subgroups && node.subgroups.length) {
      inner =
        `<ul class="shop-subgroups shop-sub-depth-${depth + 1}">` +
        node.subgroups.map(sub => shopNodeHtml(shopId, sub, `${key}:${sub.k}`, open, depth + 1)).join("") +
        `</ul>`;
      if (node.items && node.items.length) {
        inner += shopItemsHtml(shopId, node.items, depth + 1);
      }
    } else {
      inner = shopItemsHtml(shopId, node.items || [], depth + 1);
    }
  }
  const nodeCls = depth === 0 ? "shop-group" : "shop-subgroup";
  const toggleCls = depth === 0
    ? "shop-toggle"
    : `shop-toggle shop-sub-toggle shop-toggle-depth-${depth}`;
  return (
    `<li class="shop-node ${nodeCls}${isOpen ? " open" : ""}">` +
    `<button type="button" class="${toggleCls}" data-a="shopGroup" data-b="${esc(key)}" aria-expanded="${isOpen}">` +
    `<span class="shop-label"><span class="shop-caret" aria-hidden="true">${isOpen ? "&#9662;" : "&#9656;"}</span>${esc(node.n)}</span>` +
    `<small class="shop-count">${node.count}</small>` +
    `</button>` +
    inner +
    `</li>`
  );
}

/** Station Shop screen rendered inside the reusable left-side station window. */
export function shopHtml(ui = state.ui) {
  const shopId = (stationAt(state.place) || stationAt(DEFAULT_PLACE)).shop;
  const def = shopDef(shopId);
  const open = (ui && ui.shopOpen) || {};
  const groups = shopCatalogue(shopId);
  const tree = groups.map(g => shopNodeHtml(shopId, g, g.k, open, 0)).join("");

  return (
    `<h2>${esc(def.n)}</h2><div class="sub">${esc(def.d)}</div>` +
    `<ul class="shop-tree" aria-label="Shop catalogue">${tree}</ul>`
  );
}

/** The ship whose hold the Inventory tab shows: one parked in this station's hangar. */
export function viewedShip(ui = state.ui) {
  const S = state.profile;
  const local = localShips(S, state.worldState);
  if (local.includes(ui.invShip)) return ui.invShip;
  if (local.includes(S.ship)) return S.ship;
  return local[0] || S.ship;
}

/**
 * One ore or module tile in the inventory grid, with its existing move actions.
 *
 * `action` is the panel's own move action (`mv` for the station's Inventory tab, `cmv` for the rift
 * cache trade) and `destWord` what a click's destination is called in the tile's own words, so the
 * same tile serves a station, a hold and a canister without any of them knowing about each other.
 */
function invRow({
  name, sub, kind, id, count, dir, vol, move = true, place = "", slot = 0,
  destWord = dir === "s" ? "ship" : "station",
}) {
  const label = kind === "c" ? (itemUse(id) ? "USE" : "ORE") : "MOD";
  const shiftHint = move ? ` Shift-click to move stack to ${destWord}.` : "";
  const inner =
    `<span class="inv-item-top"><span class="inv-kind">${label}</span><span class="inv-n">&times;${count}</span></span>` +
    `<span class="inv-item-name">${esc(name)}</span><span class="inv-item-meta">${vol} m³ each</span>`;
  return (
    `<button type="button" class="inv-item" data-a="invSlot" data-where="${esc(place)}" data-slot="${slot}" ` +
    `data-kind="${kind}" data-id="${esc(id)}" data-dir="${esc(dir)}" data-count="${count}" ` +
    `title="${esc(name)}: ${esc(sub)}. Click to pick up, drop or swap.${shiftHint} Right-click for options (or to place 1 while holding)." ` +
    `aria-label="${esc(name)}, quantity ${count}, slot ${slot + 1}.">${inner}</button>`
  );
}

/** One inventory panel: a heading with m³ in use + Stack all, then an interactive slot grid. */
function invColumn(where, title, dir, {
  move = true, profile = state.profile, slots = 25, cols = 5,
  destWord = null, headControls = "",
} = {}) {
  const used = loadOf(where, profile),
    cap = capacityOf(where, profile);
  const held = state.ui.invHeld;
  const holding = Boolean(held && held.n > 0);
  const slotList = slotsAt(where, profile);
  let filledCount = 0;
  for (const s of slotList) if (s) filledCount++;

  // Keep the fixed minimum grid (5×5 station, 7×5 flight, 5×7 cache), and grow
  // by full rows when custom placements exceed it or when holding a stack over
  // a completely packed grid so an empty drop slot is always reachable.
  let totalSlots = Math.max(slots, Math.ceil(slotList.length / cols) * cols);
  if (holding && filledCount >= totalSlots) totalSlots += cols;

  const rows = [];
  for (let i = 0; i < totalSlots; i++) {
    const entry = slotList[i] || null;
    if (entry) {
      const { id, n } = entry;
      const part = isModule(id);
      const word = part ? "Module" : itemCat(id) === "consumable" ? "Consumable" : "Ore";
      rows.push(
        invRow({
          name: itemName(id),
          sub: `${word}, ${itemVol(id)} m³ each`,
          kind: part ? "m" : "c",
          id,
          count: n,
          dir,
          vol: itemVol(id),
          move,
          place: where,
          slot: i,
          ...(destWord ? { destWord } : {}),
        })
      );
    } else {
      const isOrigin = holding && held.where === where && held.slot === i;
      rows.push(
        `<button type="button" class="inv-empty-slot${isOrigin ? " is-origin" : ""}" ` +
        `data-a="invSlot" data-where="${esc(where)}" data-slot="${i}" aria-label="Empty slot ${i + 1}"></button>`
      );
    }
  }
  // A container with no volume of its own (a rift's canister) says how much is in it and stops there.
  const room = Number.isFinite(cap) ? `${used} / ${cap} m³` : `${used} m³`;
  const canStack = filledCount > 0 || (holding && held.where === where);
  return (
    `<section class="inv-col">` +
    `<header><span class="inv-col-title"><h3>${esc(title)}</h3>${headControls}</span>` +
    `<span class="inv-col-tools"><span class="mod-count">${room}</span>` +
    `<button type="button" class="inv-stack-btn" data-a="stackAll" data-where="${esc(where)}"${canStack ? "" : " disabled"} ` +
    `title="Combine split stacks and compact empty slots">Stack all</button></span></header>` +
    `<div class="inv-grid${holding ? " is-holding" : ""}">${rows.join("")}</div>` +
    `</section>`
  );
}

/** Sub-tab strip shared by docked Station Inventory and in-flight Ship Inventory `I`. */
function invSubtabsHtml(action, firstKey, firstLabel, activeKey) {
  const isFirst = activeKey !== "assets";
  return (
    `<div class="inv-subtabs" role="tablist">` +
    `<button type="button" role="tab" data-a="${action}" data-b="${firstKey}" aria-selected="${isFirst}">${firstLabel}</button>` +
    `<button type="button" role="tab" data-a="${action}" data-b="assets" aria-selected="${!isFirst}">My Assets</button>` +
    `</div>`
  );
}

/**
 * Compact N-menu-style `My Assets` view listing every station where the pilot
 * has stored items or ships in the hangar. Clicking a station expands its ships
 * and station-hold items in single-line rows.
 */
export function assetsHtml(profile = state.profile, world = state.worldState, opts = {}) {
  const docked = opts.docked ?? Boolean(state.player?.docked);
  const openMap = opts.openMap || state.ui.assetsOpen || {};
  const stations = listPlayerAssets(profile, world, { docked, place: opts.place });
  if (!stations.length) {
    return (
      `<div class="sub">Stations where you have ships in the hangar or items in station storage.</div>` +
      `<div class="assets-empty">No ships or items stored at any station.</div>`
    );
  }
  const destPocket = state.ui.destination && typeof state.ui.destination === "object"
    ? state.ui.destination.pocketId
    : null;
  const blocks = stations.map(st => {
    const isOpen = !!openMap[st.placeId];
    const isDest = Boolean(destPocket && destPocket === st.placeId);
    const parts = [];
    if (st.ships.length) parts.push(`${st.ships.length} ${st.ships.length === 1 ? "ship" : "ships"}`);
    if (st.items.length) parts.push(`${st.itemUnits} ${st.itemUnits === 1 ? "item" : "items"} (${st.itemVol} m³)`);
    const sysTag = st.system && st.system !== st.name ? st.system : "";
    const metaTag = [sysTag, st.here ? "Docked" : "", isDest ? "Destination" : ""].filter(Boolean).join(" · ");

    let detail = "";
    if (isOpen) {
      const lines = [];
      for (const s of st.ships) {
        const holdNote = s.cargoUnits > 0 ? ` · ${s.cargoUsed}/${s.cargoCap} m³ cargo` : "";
        const dmgNote = s.hpPct < 100 ? ` · ${s.hpPct}% hull` : "";
        const right = s.active ? "Active ship" : "Hangar ship";
        lines.push(
          `<li class="assets-line assets-ship" data-ship-type="${esc(s.type)}" title="${esc(s.name)} — ${esc(s.role)}. Right-click for ship info.">` +
          `<span class="pocket-label"><span class="pocket-icon${s.active ? " asset-active" : ""}" aria-hidden="true"></span>` +
          `<span class="pocket-name">${esc(s.name)} <small>${esc(s.role)}${holdNote}${dmgNote}</small></span></span>` +
          `<span class="assets-qty">${right}</span></li>`
        );
      }
      for (const it of st.items) {
        lines.push(
          `<li class="assets-line assets-item" data-asset-item="${esc(it.id)}" title="${esc(it.name)} (${esc(it.catLabel)}) — ${it.vol} m³ total.">` +
          `<span class="pocket-label"><span class="pocket-icon i" aria-hidden="true"></span>` +
          `<span class="pocket-name">${esc(it.name)} <small>${esc(it.catLabel)}</small></span></span>` +
          `<span class="assets-qty">&times;${it.n} <small>${it.vol} m³</small></span></li>`
        );
      }
      detail = `<ul class="assets-rows">${lines.join("")}</ul>`;
    }

    return (
      `<div class="assets-station${isOpen ? " is-open" : ""}${isDest ? " is-destination" : ""}">` +
      `<button type="button" class="assets-toggle" data-a="assetStation" data-b="${esc(st.placeId)}" ` +
      `data-asset-station="${esc(st.placeId)}" aria-expanded="${isOpen}" ` +
      `title="${esc(st.name)} — click to expand, right-click to set destination.">` +
      `<span class="assets-left"><span class="shop-caret" aria-hidden="true">${isOpen ? "&#9662;" : "&#9656;"}</span>` +
      `<span class="assets-name">${esc(st.name)}</span>` +
      `${metaTag ? `<small class="assets-sys">${esc(metaTag)}</small>` : ""}</span>` +
      `<span class="assets-count">${esc(parts.join(" · "))}</span>` +
      `</button>${detail}</div>`
    );
  });

  return (
    `<div class="assets-list">${blocks.join("")}</div>`
  );
}

function inventoryHtml(ui) {
  const view = ui?.invView === "assets" ? "assets" : "inv";
  const subtabs = invSubtabsHtml("invView", "inv", "Storage & Hold", view);
  if (view === "assets") {
    return `<h2>Inventory</h2>${subtabs}${assetsHtml(state.profile, state.worldState, { docked: true, openMap: ui?.assetsOpen })}`;
  }

  const S = state.profile;
  const local = localShips(S, state.worldState);
  const id = viewedShip(ui),
    ship = local.length ? shipDef(id) : null,
    label = shipLabel(id, local);

  const holdArrows = local.length > 1
    ? `<span class="inv-hold-nav">` +
      `<button type="button" class="inv-hold-arrow" data-a="invPrev" aria-label="Previous ship hold" title="Inspect previous ship hold">&#8249;</button>` +
      `<button type="button" class="inv-hold-arrow" data-a="invNext" aria-label="Next ship hold" title="Inspect next ship hold">&#8250;</button>` +
      `</span>`
    : "";

  const shipSection = ship
    ? invColumn(id, `${label} hold`, "t", { headControls: holdArrows })
    : "";

  return (
    `<h2>Inventory</h2>` +
    subtabs +
    hangarHtml() +
    invColumn(STATION, "Station", "s") +
    shipSection
  );
}

/**
 * The ship's own inventory in flight (press I in space): interactive slots for
 * sorting, splitting and stacking cargo in the active ship's hold, plus the
 * `My Assets` sub-tab showing stored ships and items across every station.
 */
export function cargoHtml(profile = state.profile) {
  const id = profile.ship, ship = shipDef(id);
  const view = state.ui.cargoView === "assets" ? "assets" : "hold";
  const subtabs = invSubtabsHtml("cargoView", "hold", "Ship hold", view);
  if (view === "assets") {
    return `<h2>Ship inventory</h2>${subtabs}${assetsHtml(profile, state.worldState, { docked: false, openMap: state.ui.assetsOpen })}`;
  }
  return (
    `<h2>Ship inventory</h2>${subtabs}` +
    invColumn(id, `${ship.n} hold`, "t", { move: false, profile, slots: 35, cols: 7 })
  );
}

/**
 * A rift's canister, traded with in flight (press R beside it). The ship's hold
 * on the left and the canister on the right, sharing the same slot interactions:
 * left-click picks up/places/merges/swaps, right-click while holding places 1,
 * Shift-click transfers a whole stack, and right-click offers Take amount.
 */
export function cacheHtml(profile = state.profile) {
  const record = cacheTradeRecord();
  const cache = record?.cache;
  if (!cache) return "";
  const id = profile.ship, hull = shipDef(id), left = cacheUnits(cache);
  return (
    `<h2>${esc(cache.n)}</h2>` +
    `<div class="sub">${left ? `${left} inside.` : "The canister is empty."}</div>` +
    `<div class="cache-cols">` +
    invColumn(id, `${hull.n} hold`, "stow", { move: true, profile, slots: 35, cols: 5, destWord: "canister" }) +
    invColumn(CACHE, cache.n, "take", { move: true, profile, slots: 35, cols: 5, destWord: "hold" }) +
    `</div>`
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
