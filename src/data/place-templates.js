// Reusable pocket templates. A generated pocket keeps its old `def: "empty"`
// compatibility marker, but also carries a `template` id; places.js resolves that
// id here. This keeps generated geography compact while letting every pocket use
// different data-defined scenery and encounters.
//
// `tiers` is deliberately a table rather than code: the highest listed tier not
// above a place's tier supplies the encounter ids. Add an encounter to a tier,
// or add a new template, without changing the spawner.

import { ENCOUNTERS, encounterDef } from "./encounters.js";
import { makeRng } from "../util/rng.js";
import { stationClassForId } from "./stations.js";

export const PLACE_TEMPLATES = {
  frontier: {
    n: "Frontier pocket",
    d: "A rough frontier pocket with a broad ore belt and sparse pirate traffic.",
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Frontier belt",
        pos: [1800, 200, -1500],
        radius: 850,
        height: 280,
        count: 90,
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 18, rMax: 82, orePerR: 1.6 },
        salvage: { spread: [820, 220, 820] },
      },
    ],
    tiers: {
      1: ["hostile_patrol"],
      2: ["hostile_patrol"],
      3: ["hostile_patrol", "hostile_patrol"],
    },
    encounterPositions: [[750, 20, -500], [500, -30, 650], [1050, 80, -850]],
  },

  trade_lane: {
    n: "Trade lane",
    d: "A busy trade pocket. A friendly counter sits out at the far side of a wide lane.",
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Trade-lane asteroid field",
        pos: [1900, -160, -1600],
        radius: 650,
        height: 220,
        count: 45,
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 16, rMax: 58, orePerR: 1.5 },
        salvage: { spread: [650, 150, 650] },
      },
    ],
    tiers: {
      1: ["friendly_trader"],
      2: ["friendly_trader", "hostile_patrol"],
      3: ["friendly_trader", "hostile_patrol"],
    },
    encounterPositions: [[0, 0, 0], [650, 40, -450], [900, -60, 700]],
  },

  salvage_yard: {
    n: "Outpost pocket",
    d: "A quiet outpost pocket with wide lanes and few rocks.",
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Outpost rocks",
        pos: [-1500, 180, -1900],
        radius: 550,
        height: 200,
        count: 30,
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 18, rMax: 68, orePerR: 1.6 },
        salvage: { spread: [650, 150, 650] },
      },
    ],
    tiers: {
      1: [],
      2: ["hostile_patrol"],
      3: ["hostile_patrol"],
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

function polarPoint(rng, min = 1200, max = 3500, height = 600) {
  const angle = rng() * Math.PI * 2;
  const distance = min + rng() * (max - min);
  return [
    Math.round(Math.cos(angle) * distance),
    Math.round((rng() - 0.5) * height),
    Math.round(Math.sin(angle) * distance),
  ];
}

const seededRng = (place, salt) => makeRng(hashId(`${place?.template || "test"}:${place?.id || "template"}:${salt}`));

/** Deterministic per-pocket variation for static template features. A place id always
 * resolves to the same scenery, but two pockets of one template no longer share one
 * belt, station or patrol position. */
const twinField = (feature, rng) => {
  const pos = polarPoint(rng, 1800, 4500, 700);
  const fixed = Math.hypot(pos[0] - feature.pos[0], pos[1] - feature.pos[1], pos[2] - feature.pos[2]) > feature.radius + 1000
    ? pos
    : [-pos[0], pos[1], -pos[2]];
  return {
    ...feature,
    id: `${feature.id || "field"}-b`,
    n: `${feature.n || "Field"} pocket`,
    pos: fixed,
    count: Math.max(3, Math.round(feature.count * (0.35 + rng() * 0.3))),
    radius: Math.max(500, Math.round(feature.radius * (0.38 + rng() * 0.3))),
    height: Math.max(180, Math.round(feature.height * (0.5 + rng() * 0.4))),
  };
};

function varyTemplateFeatures(templateId, place, features) {
  return features.flatMap((feature) => {
    if (feature.kind !== "asteroidField") return [feature];
    const rng = seededRng(place, `field:${feature.id || "field"}`);
    feature.pos = polarPoint(rng, 1800, 4500, 700);
    if (templateId === "frontier") {
      feature.count = 65 + Math.floor(rng() * 55);   // Dense local mining, not a stamp
      feature.radius = Math.round(700 + rng() * 300); // 0.7–1 km
      feature.height = Math.round(220 + rng() * 130);
      feature.rock = { ...(feature.rock || {}), rMax: Math.round(76 + rng() * 34), giantChance: 0.02, giantMin: 180, giantMax: 280 };
      if (rng() < 0.3) return [feature, twinField(feature, rng)];   // some frontiers run two separated fields
      const direction = Math.atan2(feature.pos[2], feature.pos[0]);
      return [feature, ...Array.from({ length: 3 }, (_, i) => ({
        ...feature, id: `${feature.id}-extension-${i + 1}`,
        n: `${feature.n} outer ${i + 1}`,
        pos: [feature.pos[0] + Math.cos(direction) * (i + 1) * feature.radius * 1.6,
          feature.pos[1], feature.pos[2] + Math.sin(direction) * (i + 1) * feature.radius * 1.6],
      }))];
    }
    if (templateId === "trade_lane") {
      if (rng() < 0.2) return [];                    // some trade lanes are clean lanes
      feature.count = 30 + Math.floor(rng() * 30);    // 30–59
      feature.radius = Math.round(500 + rng() * 250);
      feature.height = Math.round(180 + rng() * 100);
      if (rng() < 0.12) return [feature, twinField(feature, rng)];
      return [feature];
    }
    // Outposts are deliberately not all useful mining pockets: many are quiet.
    if (rng() < 0.45) return [];
    feature.count = 20 + Math.floor(rng() * 25);      // 20–44
    feature.radius = Math.round(400 + rng() * 250);
    feature.height = Math.round(150 + rng() * 100);
    if (rng() < 0.15) return [feature, twinField(feature, rng)];
    return [feature];
  });
}

/**
 * Turn a template plus its tier-selected encounter ids into ordinary place
 * features. The sim consumes these just like Meridian's authored features.
 */
export function templateFeatures(templateId, place = {}) {
  const template = templateAt(templateId);
  const features = varyTemplateFeatures(templateId, place, JSON.parse(JSON.stringify(template.features || [])));
  const explicitFeatures = [
    ...(Array.isArray(place.features) ? place.features : []),
    ...(Array.isArray(place.extraFeatures) ? place.extraFeatures : []),
  ].map(feature => JSON.parse(JSON.stringify(feature)));
  // Generated gate pockets keep their gate role and scenery, but a trader is
  // detached into a station pocket by the galaxy generator. `allowStation` or
  // `stationPlacement: "gate"` is an explicit author opt-in for future
  // co-location; explicit feature records are also always retained below.
  const suppressTemplateStations = place.role === "gate" &&
    place.allowStation !== true && place.stationPlacement !== "gate";
  const ids = encounterIdsFor(templateId, place.tier || 1);
  const fieldRadius = Number(features.find(f => f.kind === "asteroidField")?.radius) || 0;
  const positions = template.encounterPositions || [];
  ids.forEach((encounterId, index) => {
    const encounter = encounterDef(encounterId);
    const pos = positions[index]
      ? polarPoint(seededRng(place, `encounter-fallback:${index}`), 300, 1000, 250)
      : polarPoint(seededRng(place, `encounter:${index}`), 700 + index * 300, 2200, 450);
    const featureId = `${encounterId}-${index}`;
    const stationClass = stationClassForId(place?.id || `${templateId}:${featureId}`);
    if (encounter.kind === "friendlyTrader") {
      if (suppressTemplateStations) return;
      const station = encounter.station || {};
      const launch = station.launch || { pos: [0, 0, 220], face: "field" };
      features.push({
        kind: "station",
        id: featureId,
        n: place.stationName || encounter.n,
        pos,
        dockRange: station.dockRange,
        dockSpeed: station.dockSpeed,
        style: stationClass,
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
        nearRadius: Math.round((fieldRadius || 2500) + 1500),
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
  features.push(...explicitFeatures);
  return { ...template, features };
}

/** A small validation helper used by the content tests and future tools. */
export function templateEncounterIds(templateId) {
  return [...new Set(Object.values(templateAt(templateId).tiers || {}).flat())];
}

// Keep the imported table visibly part of this module's data contract. This also
// gives tooling a cheap way to assert that a template never names a missing id.
export const knownEncounterIds = () => Object.keys(ENCOUNTERS);
