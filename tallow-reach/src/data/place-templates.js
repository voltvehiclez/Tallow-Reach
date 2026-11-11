// Reusable pocket templates. A generated pocket keeps its old `def: "empty"`
// compatibility marker, but also carries a `template` id; places.js resolves that
// id here. This keeps generated geography compact while letting every pocket use
// different data-defined scenery and encounters.
//
// `tiers` is deliberately a table rather than code: the highest listed tier not
// above a place's tier supplies the encounter ids. Add an encounter to a tier,
// or add a new template, without changing the spawner.

import { ENCOUNTERS, encounterDef } from "./encounters.js";

export const PLACE_TEMPLATES = {
  frontier: {
    n: "Frontier pocket",
    d: "A rough frontier pocket with ore and pirate traffic.",
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Frontier asteroid field",
        pos: [1200, 100, -900],
        radius: 520,
        height: 190,
        count: 28,
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 18, rMax: 66, orePerR: 1.6 },
        salvage: { spread: [500, 120, 500] },
      },
      {
        kind: "planet",
        id: "planet",
        pos: [-4800, -1200, -8200],
        radius: 1900,
        atmosphere: 2020,
        col: 0x394851,
        atmoCol: 0x527d8a,
        spin: 0.002,
      },
    ],
    tiers: {
      1: ["hostile_patrol", "resource_cache"],
      2: ["hostile_patrol", "derelict"],
      3: ["hostile_patrol", "derelict", "resource_cache"],
    },
    encounterPositions: [[750, 20, -500], [500, -30, 650], [1050, 80, -850]],
  },

  trade_lane: {
    n: "Trade lane",
    d: "A busy trade pocket. A friendly counter is open near the rocks.",
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Trade-lane asteroid field",
        pos: [1050, -80, -700],
        radius: 430,
        height: 160,
        count: 22,
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 16, rMax: 58, orePerR: 1.5 },
        salvage: { spread: [450, 100, 450] },
      },
      {
        kind: "planet",
        id: "planet",
        pos: [5200, 600, -7300],
        radius: 1500,
        atmosphere: 1600,
        col: 0x4d3f54,
        atmoCol: 0x896b9a,
        spin: 0.0025,
      },
    ],
    tiers: {
      1: ["friendly_trader", "resource_cache"],
      2: ["friendly_trader", "hostile_patrol"],
      3: ["friendly_trader", "hostile_patrol", "derelict"],
    },
    encounterPositions: [[0, 0, 0], [650, 40, -450], [900, -60, 700]],
  },

  salvage_yard: {
    n: "Salvage yard",
    d: "A quiet graveyard of old ships and useful scrap.",
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Salvage-yard rocks",
        pos: [-900, 120, -1150],
        radius: 610,
        height: 220,
        count: 34,
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 20, rMax: 74, orePerR: 1.7 },
        salvage: { spread: [550, 130, 550] },
      },
    ],
    tiers: {
      1: ["derelict", "resource_cache"],
      2: ["derelict", "hostile_patrol", "resource_cache"],
      3: ["derelict", "hostile_patrol", "resource_cache"],
    },
    encounterPositions: [[-350, 40, -500], [-700, -20, 450], [250, 80, -850]],
  },
};

export const PLACE_TEMPLATE_IDS = Object.keys(PLACE_TEMPLATES);
export const DEFAULT_PLACE_TEMPLATE = PLACE_TEMPLATE_IDS[0];

export const isPlaceTemplate = id => Object.prototype.hasOwnProperty.call(PLACE_TEMPLATES, id);
export const templateAt = id => PLACE_TEMPLATES[id] || PLACE_TEMPLATES[DEFAULT_PLACE_TEMPLATE];

/** Stable, order-independent id hash for assigning generated pockets. */
function hashId(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return hash >>> 0;
}

/** Pick a template from data, not from a special case in the generator. */
export function templateForPlace(placeId, role = "") {
  const offset = role === "gate" ? 1 : role === "hub" ? 0 : 2;
  return PLACE_TEMPLATE_IDS[(hashId(`${role}:${placeId}`) + offset) % PLACE_TEMPLATE_IDS.length];
}

/** Pull the encounter ids for a template's tier. */
export function encounterIdsFor(templateId, tier = 1) {
  const template = templateAt(templateId);
  const levels = Object.keys(template.tiers || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let chosen = levels[0];
  for (const level of levels) if (level <= Math.max(1, tier)) chosen = level;
  return [...(template.tiers?.[chosen] || [])];
}

/**
 * Turn a template plus its tier-selected encounter ids into ordinary place
 * features. The sim consumes these just like Meridian's authored features.
 */
export function templateFeatures(templateId, place = {}) {
  const template = templateAt(templateId);
  const features = JSON.parse(JSON.stringify(template.features || []));
  const ids = encounterIdsFor(templateId, place.tier || 1);
  const positions = template.encounterPositions || [];
  ids.forEach((encounterId, index) => {
    const encounter = encounterDef(encounterId);
    const pos = positions[index] ? [...positions[index]] : [0, 0, 0];
    const featureId = `${encounterId}-${index}`;
    if (encounter.kind === "friendlyTrader") {
      const station = encounter.station || {};
      const launch = station.launch || { pos: [0, 0, 220], face: "field" };
      features.push({
        kind: "station",
        id: featureId,
        n: encounter.n,
        pos,
        keepout: station.keepout,
        dockRange: station.dockRange,
        dockSpeed: station.dockSpeed,
        launch: {
          ...launch,
          pos: [pos[0] + launch.pos[0], pos[1] + launch.pos[1], pos[2] + launch.pos[2]],
        },
        shop: encounter.shop,
        encounter: encounterId,
      });
      return;
    }
    if (encounter.kind === "hostilePatrol") {
      features.push({
        kind: "spawner",
        id: featureId,
        encounter: encounterId,
        pos,
        anchor: "field",
        interval: [...encounter.interval],
        chance: encounter.chance,
        maxWanderers: encounter.maxActive,
        count: [...encounter.count],
        once: encounter.once === true,
        respawnSec: encounter.respawnSec,
      });
      return;
    }
    features.push({
      kind: "encounter",
      id: featureId,
      encounter: encounterId,
      pos,
    });
  });
  return { ...template, features };
}

/** A small validation helper used by the content tests and future tools. */
export function templateEncounterIds(templateId) {
  return [...new Set(Object.values(templateAt(templateId).tiers || {}).flat())];
}

// Keep the imported table visibly part of this module's data contract. This also
// gives tooling a cheap way to assert that a template never names a missing id.
export const knownEncounterIds = () => Object.keys(ENCOUNTERS);
