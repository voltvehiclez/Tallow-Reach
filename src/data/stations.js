// The four station silhouettes the generator can build. These are data, not
// meshes: render/models.js chooses the geometry from `style`, and future GLBs
// can be registered as station.<style>.glb without changing names or gameplay.

export const STATION_CLASSES = {
  commerce: {
    n: "Commerce freeport",
    style: "commerce",
    styles: ["Freeport", "Exchange", "Trading Hub", "Harbor", "Market", "Rest"],
    col: 0x4a545c,
    accent: 0x4a545c,
    lights: 0xd9a45a,
    silhouette: "ring",
  },
  industrial: {
    n: "Industrial spire",
    style: "industrial",
    styles: ["Depot", "Foundry", "Yard", "Refinery", "Works"],
    col: 0x46515b,
    accent: 0x8a6f45,
    lights: 0xff9b45,
    silhouette: "spire",
  },
  military: {
    n: "Military citadel",
    style: "military",
    styles: ["Citadel", "Watch", "Citadel", "Bastion", "Gatehouse"],
    col: 0x333a42,
    accent: 0x5f6f7c,
    lights: 0xff5c4a,
    silhouette: "citadel",
  },
  mining: {
    n: "Mining outpost",
    style: "mining",
    styles: ["Outpost", "Harvest", "Prospect", "Claim", "Landing"],
    col: 0x50483e,
    accent: 0xb0793d,
    lights: 0xffc46b,
    silhouette: "platform",
  },
};

export const STATION_CLASS_IDS = Object.keys(STATION_CLASSES);

export function stationClassForId(id) {
  let h = 0x811c9dc5;
  const text = String(id);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return STATION_CLASS_IDS[(h >>> 0) % STATION_CLASS_IDS.length];
}

export const stationClass = id => STATION_CLASSES[id] || STATION_CLASSES[STATION_CLASS_IDS[0]];
export const stationStylesForClass = id => stationClass(id).styles;
