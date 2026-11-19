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
import { CACHE, STATION, capacityOf, loadOf, slotsAt } from "../sim/inventory.js";
import { cacheTradeRecord, cacheUnits } from "../sim/instances.js";
import { state } from "../state/state.js";
import { SLOT_COUNT, readSlot } from "../state/storage.js";
import {
  storedUnits,
  storageCap,
  repairCost,
  hangarCap,
  filterPlayerAssets,
  listPlayerAssets,
  localShips,
  shipBaseStats,
  shopCatalogue,
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
import { missionLogHtml, storyOffersHtml } from "./missionlog.js";
import { LEFT_TOGGLE_KEYS, activeLeftPanel, activeRightTab } from "./left-panel.js";

const esc = text => String(text ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Station menu buttons:
// - Missions, Inventory, Base, Saves switch the right-hand station panel
//   (Missions accepts Story missions & Contracts on the right and opens the
//   Mission log in the left window).
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
  l: missionsHtml,
  i: inventoryHtml,
  b: baseHtml,
  s: savesHtml,
};

// Left-hand reusable station window screens.
const LEFT_SCREENS = {
  m: missionLogHtml,
  o: outfittingHtml,
  p: shopHtml,
};

const HOME_ICON_SVG =
  `<svg class="home-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">` +
  `<path d="M2 7.4L8 2.4l6 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="M3.6 6.6v6.8h3.1V9.8h2.6v3.6h3.1V6.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
  `</svg>`;

export function introHtml() {
  return (
    `<h1>Tallow Reach</h1><div class="sub">A quiet, dangerous ${term("flyable")}. Mine it, defend it, build on it.</div>` +
    `<p>You fly out of ${stationAt(DEFAULT_PLACE).n}, your own station. Take contracts, cut ore from the asteroid field, fight off raiders, loot the wrecks, and bring it all home. If your ship is destroyed you lose it and its cargo, and must buy it again.</p>` +
    `<h2>Controls</h2>` +
    `<dl class="controls-grid">` +
    `<div><dt>Mouse</dt><dd>Steer</dd></div>` +
    `<div><dt>W / S</dt><dd>Throttle / reverse</dd></div>` +
    `<div><dt>A / D</dt><dd>Strafe</dd></div>` +
    `<div><dt>Space / C</dt><dd>Up / down</dd></div>` +
    `<div><dt>Q / E</dt><dd>Roll</dd></div>` +
    `<div><dt>Shift / X</dt><dd>Boost / stop</dd></div>` +
    `<div><dt>LMB / RMB</dt><dd>Primary / secondary</dd></div>` +
    `<div><dt>1–5 / 6–0</dt><dd>Weapon bays</dd></div>` +
    `<div><dt>F</dt><dd>Target lock</dd></div>` +
    `<div><dt>G / R</dt><dd>Dock / wormhole</dd></div>` +
    `<div><dt>M / J</dt><dd>Starmap / jump</dd></div>` +
    `<div><dt>N / I</dt><dd>Objects / cargo</dd></div>` +
    `<div><dt>Left Alt</dt><dd>Orbit camera</dd></div>` +
    `<div><dt>P / Esc</dt><dd>Pause</dd></div>` +
    `</dl>` +
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
  const isHome = homeStationPlace(S) === state.place;
  const canHome = canSetHomeStation(state.place);
  const homeTip = isHome
    ? "Home station — recover here after death."
    : canHome
      ? "Set home station — recover here after death."
      : "Cannot set home station here.";
  const homeBtn =
    `<button type="button" class="home-icon-btn${isHome ? " is-home" : ""}" data-a="home" ` +
    `${isHome || !canHome ? "disabled " : ""}title="${esc(homeTip)}" aria-label="${esc(homeTip)}">` +
    `${HOME_ICON_SVG}</button>`;
  let h =
    `<div class="station-head"><h1>${(stationAt(state.place) || stationAt(DEFAULT_PLACE)).n}</h1>${homeBtn}</div>` +
    `<div class="sub">${S.cr} cr. Contracts done ${S.done}. Kills ${S.kills}.</div><nav>${navHtml}</nav>`;

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

/** Pure contract-offers block shown on the right-hand Missions tab. */
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

/** Right-hand Missions tab: accept story missions and contracts offered here. */
export function missionsHtml(profileOrUi = state.profile) {
  return storyOffersHtml(profileOrUi) + contractsHtml();
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

/** Is this the paint bay whose picker is open? */
const isPaintOpen = k =>
  !!(state.ui.fit && state.ui.fit.kind === "paint" && state.ui.fit.k === k);

/** Group of the module currently held on the cursor, if any. */
function heldModuleGroup() {
  const held = state.ui.invHeld;
  if (!held || !(held.n > 0) || !isModule(held.id)) return null;
  return MODULES[held.id]?.g || null;
}

/**
 * One Outfitting module bay. Modules are equipped directly from Inventory (via
 * drag-and-drop or right-click Equip) and dragged back to Inventory to unequip,
 * so clicking a bay does not open a separate "modules in storage" popup.
 */
function bayHtml(group, i, id) {
  const m = MODULES[id];
  const dropMatch = heldModuleGroup() === group.k;
  const attrs =
    `type="button" data-a="slot" data-b="${group.k}:${i}" data-fit-group="${esc(group.k)}" data-fit-bay="${i}"`;
  if (!m) {
    return (
      `<button class="mod-bay empty${dropMatch ? " is-drop-match" : ""}" ${attrs} ` +
      `title="${esc(group.n)} bay ${i + 1}: drag a matching module from Inventory or right-click one to equip." ` +
      `aria-label="${esc(group.n)} bay ${i + 1}: empty, drag a module from Inventory to equip">` +
      `<span class="bay-no">Bay ${i + 1}</span><span class="bay-empty">Empty</span></button>`
    );
  }
  return (
    `<button class="mod-bay fitted${dropMatch ? " is-drop-match" : ""}" ${attrs} data-module="${esc(id)}" ` +
    `title="${esc(m.n)} (${esc(moduleStat(m))}). Drag to Inventory or right-click to unequip." ` +
    `aria-label="${esc(group.n)} bay ${i + 1}: ${esc(m.n)}, drag to Inventory to unequip">` +
    `<span class="bay-no">Bay ${i + 1}</span>` +
    `<span class="bay-val">${esc(m.n)}</span>` +
    `<span class="bay-stat">${esc(moduleStat(m))}</span>` +
    `</button>`
  );
}

/** One module group: a heading, its drag/drop bays, and what it decides. */
function groupHtml(group) {
  const slots = slotsFor(group, state.profile.ship),
    fitted = baysOf()[group.k] || [];
  let bays = "";
  for (let i = 0; i < slots; i++) bays += bayHtml(group, i, fitted[i]);
  const used = fitted.filter(Boolean).length;

  return (
    `<section class="mod" data-group="${group.k}">` +
    `<header><h3>${group.n}</h3><span class="mod-count">${used} / ${slots}</span></header>` +
    `<div class="mod-bays">${bays}</div>` +
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

  // Services for the hull in the viewer (the selected ship): compact tiles inside
  // the fixed-size Services card (sits below modules; sized to hold 7+ services).
  const repCost = repairCost(S.ship),
    repPct = Math.round((S.hp[S.ship] ?? 1) * 100);
  let serviceBoxes =
    `<div class="service-box" title="Hull HP ${repPct}%. Costs more the more damaged it is.">` +
    `<span class="service-label">Hull repairs <small>${repPct}%</small></span>` +
    `<button data-a="rp" data-b="${S.ship}" ${repCost <= 0 || S.cr < repCost ? "disabled" : ""}>${
      repCost <= 0 ? "Intact" : "Repair " + repCost + " cr"
    }</button></div>`;
  const fittedLauncher = (state.missiles || [])[0];   // launcher fitted to the ship in the viewer
  if (fittedLauncher) {
    const cap = fittedLauncher.cap,
      canRestock = S.msl < cap && S.cr >= MISSILE.unitPrice,
      n = Math.min(cap - S.msl, Math.floor(S.cr / MISSILE.unitPrice));
    serviceBoxes +=
      `<div class="service-box" title="${S.msl} of ${cap} missiles loaded (${MISSILE.unitPrice} cr each).">` +
      `<span class="service-label">Missile restock <small>${S.msl}/${cap}</small></span>` +
      `<button data-a="wr" ${canRestock ? "" : "disabled"}>${
        S.msl >= cap ? "Full" : "Restock " + n * MISSILE.unitPrice + " cr"
      }</button></div>`;
  }
  const services =
    `<div class="outfit-service"><div class="outfit-service-title">Services</div>` +
    `<div class="service-grid">${serviceBoxes}</div></div>`;

  return (
    `<h2>Outfitting</h2>` +
    `<div class="sub">Drag modules between Inventory and bays, or right-click a module in Inventory to equip.</div>` +
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
    `</div>` +
    `<div class="outfit-rail">${right.map(groupHtml).join("")}${appearanceHtml()}</div>` +
    services +
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
  const modGroup = isModule(id) && MODULES[id] ? ` data-mod-group="${esc(MODULES[id].g)}"` : "";
  const shiftHint = move ? ` Shift-click to move stack to ${destWord}.` : "";
  const inner =
    `<span class="inv-item-top"><span class="inv-kind">${label}</span><span class="inv-n">&times;${count}</span></span>` +
    `<span class="inv-item-name">${esc(name)}</span><span class="inv-item-meta">${vol} m³ each</span>`;
  return (
    `<button type="button" class="inv-item" data-a="invSlot" data-where="${esc(place)}" data-slot="${slot}" ` +
    `data-kind="${kind}" data-id="${esc(id)}" data-dir="${esc(dir)}" data-count="${count}"${modGroup} ` +
    `title="${esc(name)}: ${esc(sub)}. Click or drag to move.${shiftHint} Right-click for options (or to place 1 while holding)." ` +
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
    `<section class="inv-col" data-inv-where="${esc(where)}">` +
    `<header><span class="inv-col-title"><h3>${esc(title)}</h3>${headControls}</span>` +
    `<span class="inv-col-tools"><span class="mod-count">${room}</span>` +
    `<button type="button" class="inv-stack-btn" data-a="stackAll" data-b="${esc(where)}" data-where="${esc(where)}"${canStack ? "" : " disabled"} ` +
    `title="Combine split stacks and move all items to top left">Stack all</button></span></header>` +
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

const SEARCH_ICON_SVG =
  `<svg class="assets-search-icon" viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" focusable="false">` +
  `<circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.35"/>` +
  `<path d="M9.2 9.2L12.4 12.4" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>` +
  `</svg>`;

/**
 * Pure station/ship/cargo/item list inside `My Assets` (re-rendered live when
 * typing in the search input so focus and caret stay untouched).
 */
export function assetsResultsHtml(profile = state.profile, world = state.worldState, opts = {}) {
  const docked = opts.docked ?? Boolean(state.player?.docked);
  const openMap = opts.openMap || state.ui.assetsOpen || {};
  const shipOpenMap = opts.shipOpenMap || state.ui.assetShipsOpen || {};
  const rawQuery = String(opts.query ?? state.ui.assetsQuery ?? "");
  const trimmed = rawQuery.trim();
  const allStations = listPlayerAssets(profile, world, { docked, place: opts.place });
  if (!allStations.length) {
    return `<div class="assets-empty">No ships or items stored at any station.</div>`;
  }
  const stations = trimmed ? filterPlayerAssets(allStations, trimmed) : allStations;
  if (!stations.length) {
    return `<div class="assets-empty">No assets starting with &ldquo;${esc(trimmed)}&rdquo;.</div>`;
  }
  const destPocket = state.ui.destination && typeof state.ui.destination === "object"
    ? state.ui.destination.pocketId
    : null;
  const blocks = stations.map(st => {
    const isOpen = Boolean(st.autoOpen || openMap[st.placeId]);
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
        const shipKey = `${st.placeId}::${s.id}`;
        const cargoList = Array.isArray(s.cargoItems) ? s.cargoItems : [];
        const shipOpen = Boolean(s.cargoMatched || shipOpenMap[shipKey]);
        const holdNote = ` · ${s.cargoUsed}/${s.cargoCap} m³ cargo`;
        const dmgNote = s.hpPct < 100 ? ` · ${s.hpPct}% hull` : "";
        const right = s.active ? "Active ship" : "Hangar ship";
        const cargoRows = shipOpen
          ? `<ul class="assets-ship-cargo">` +
            (cargoList.length
              ? cargoList
                  .map(
                    c =>
                      `<li class="assets-line assets-item assets-ship-item" data-asset-item="${esc(c.id)}" ` +
                      `data-asset-ship-cargo="${esc(s.id)}" title="${esc(c.name)} (${esc(c.catLabel)}) in ${esc(s.name)} — ${c.vol} m³ total.">` +
                      `<span class="pocket-label"><span class="pocket-icon i" aria-hidden="true"></span>` +
                      `<span class="pocket-name">${esc(c.name)} <small>${esc(c.catLabel)}</small></span></span>` +
                      `<span class="assets-qty">&times;${c.n} <small>${c.vol} m³</small></span></li>`
                  )
                  .join("")
              : `<li class="assets-line assets-cargo-empty"><small>Empty hold</small></li>`) +
            `</ul>`
          : "";
        lines.push(
          `<li class="assets-ship-entry${shipOpen ? " is-open" : ""}">` +
          `<button type="button" class="assets-line assets-ship assets-ship-toggle" ` +
          `data-a="assetShip" data-b="${esc(shipKey)}" data-ship-type="${esc(s.type)}" ` +
          `aria-expanded="${shipOpen}" ` +
          `title="${esc(s.name)} — ${esc(s.role)}. Click to inspect hold, right-click for ship info.">` +
          `<span class="pocket-label"><span class="shop-caret assets-ship-caret" aria-hidden="true">${shipOpen ? "&#9662;" : "&#9656;"}</span>` +
          `<span class="pocket-icon${s.active ? " asset-active" : ""}" aria-hidden="true"></span>` +
          `<span class="pocket-name">${esc(s.name)} <small>${esc(s.role)}${holdNote}${dmgNote}</small></span></span>` +
          `<span class="assets-qty">${right}</span></button>` +
          `${cargoRows}</li>`
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

  return `<div class="assets-list">${blocks.join("")}</div>`;
}

/**
 * Compact N-menu-style `My Assets` view listing every station where the pilot
 * has stored items or ships (with collapsible ship cargo holds and a live
 * prefix-search bar that filters ships, ship cargo, and station items).
 */
export function assetsHtml(profile = state.profile, world = state.worldState, opts = {}) {
  const rawQuery = String(opts.query ?? state.ui.assetsQuery ?? "");
  const searchOpen = Boolean(opts.searchOpen ?? state.ui.assetsSearchOpen ?? rawQuery.length > 0);
  const inputHtml = searchOpen
    ? `<input type="text" class="assets-search-input" data-asset-search value="${esc(rawQuery)}" ` +
      `placeholder="Search items or ships…" aria-label="Search assets" autocomplete="off" spellcheck="false">` +
      `<button type="button" class="assets-search-clear" data-a="assetSearchClear" ` +
      `${rawQuery ? "" : "hidden "}title="Clear search" aria-label="Clear search">&times;</button>`
    : "";
  const toolbar =
    `<div class="assets-toolbar">` +
    `<button type="button" class="assets-search-btn${searchOpen ? " on" : ""}" data-a="assetSearchToggle" ` +
    `aria-expanded="${searchOpen}" title="Search items, ships and ship holds">${SEARCH_ICON_SVG}<span>Search</span></button>` +
    inputHtml +
    `</div>`;
  return (
    toolbar +
    `<div class="assets-results" data-assets-results>${assetsResultsHtml(profile, world, opts)}</div>`
  );
}

function inventoryHtml(ui) {
  const view = ui?.invView === "assets" ? "assets" : "inv";
  const subtabs = invSubtabsHtml("invView", "inv", "Storage & Hold", view);
  if (view === "assets") {
    return (
      `<h2>Inventory</h2>${subtabs}` +
      assetsHtml(state.profile, state.worldState, {
        docked: true,
        openMap: ui?.assetsOpen,
        shipOpenMap: ui?.assetShipsOpen,
        query: ui?.assetsQuery,
        searchOpen: ui?.assetsSearchOpen,
      })
    );
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
