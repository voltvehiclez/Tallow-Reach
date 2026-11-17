// Seeded planet classes for the generated universe. Pockets are still data:
// a generated planet pocket carries an ordinary `planet` record with these
// numbers, and render/ consumes it for the low-orbit backdrop and the AU sky.
// Textures start procedural; a future data table can point at hand-authored maps.

import { makeRng } from "../util/rng.js";

export const AU_METRES = 149_597_870_700;

export const PLANET_CLASSES = {
  rocky: {
    n: "Rocky world",
    radiusM: [120_000, 260_000],
    col: 0x9a7b52,
    dark: 0x4a3a2c,
    atmoCol: 0x8fb3c7,
    atmoOpacity: 0.16,
    emissive: 0x000000,
    spin: [0.0015, 0.0045],
    rockCount: [10, 26],
    rockRadius: [18, 78],
    ore: "rocky_rock",
  },
  ice: {
    n: "Ice world",
    radiusM: [150_000, 330_000],
    col: 0x8fb7c9,
    dark: 0x31505f,
    atmoCol: 0xb9e8ff,
    atmoOpacity: 0.22,
    emissive: 0x000000,
    spin: [0.0012, 0.004],
    rockCount: [7, 22],
    rockRadius: [16, 70],
    ore: "ice_rock",
  },
  gas: {
    n: "Gas giant",
    radiusM: [430_000, 1_000_000],
    col: 0xb9875a,
    dark: 0x46301f,
    atmoCol: 0xd8b178,
    atmoOpacity: 0.3,
    emissive: 0x000000,
    spin: [0.004, 0.010],
    rockCount: [4, 14],
    rockRadius: [16, 58],
    ore: "ice_rock",
  },
  volcanic: {
    n: "Volcanic world",
    radiusM: [110_000, 240_000],
    col: 0x3b302b,
    dark: 0x100c0a,
    atmoCol: 0xff6f32,
    atmoOpacity: 0.18,
    emissive: 0x2d0900,
    spin: [0.0015, 0.005],
    rockCount: [12, 30],
    rockRadius: [16, 82],
    ore: "volcanic_rock",
  },
};

export const PLANET_CLASS_IDS = Object.keys(PLANET_CLASSES);
export const DEFAULT_PLANET_CLASS = PLANET_CLASS_IDS[0];
export const planetClass = id => PLANET_CLASSES[id] || PLANET_CLASSES[DEFAULT_PLANET_CLASS];

const between = (rng, [a, b]) => a + rng() * (b - a);

/** Build one planet record from its stable seed. Deterministic; no gameplay RNG. */
export function makePlanet(id, coreName, letter, systemId, seed) {
  const rng = makeRng((seed ^ hashString(`planet:${systemId}:${id}`)) >>> 0);
  const classId = PLANET_CLASS_IDS[Math.floor(rng() * PLANET_CLASS_IDS.length)];
  const cls = PLANET_CLASSES[classId];
  const radiusM = Math.round(between(rng, cls.radiusM));
  return {
    id: letter,
    classId,
    n: `${coreName}-${letter}`,
    radiusM,
    atmosphere: Math.round(radiusM * (classId === "gas" ? 1.22 : 1.14)),
    col: cls.col,
    dark: cls.dark,
    atmoCol: cls.atmoCol,
    atmoOpacity: cls.atmoOpacity,
    emissive: cls.emissive,
    spin: Number(between(rng, cls.spin).toFixed(5)),
    seed: Math.floor(rng() * 0xffffffff) >>> 0,
    // Direction used for the fixed low-orbit backdrop in this pocket and for the
    // planet's fixed place in the AU sky elsewhere. Unit-ish and horizontal-ish.
    approach: normalise([Math.cos(rng() * Math.PI * 2), (rng() - 0.5) * 0.55, Math.sin(rng() * Math.PI * 2)]),
    orbit: {
      angle: rng() * Math.PI * 2,
      band: rng(),
    },
    rockCount: Math.round(between(rng, cls.rockCount)),
    ore: cls.ore,
  };
}

function hashString(value) {
  let h = 0x811c9dc5;
  const text = String(value);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function normalise(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return v.map(n => Number((n / len).toFixed(4)));
}
