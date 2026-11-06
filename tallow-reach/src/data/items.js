// Cargo types. `v` is the base sell value in credits per unit.
export const ITEM = {
  ferrite: { n: "Ferrite", v: 10 },
  cobalt: { n: "Cobalt", v: 24 },
  voidite: { n: "Voidite", v: 60 },
  salv: { n: "Salvage", v: 70 },
  core: { n: "Reactor core", v: 350 },
};

export const KEYS = Object.keys(ITEM);

export const emptyCargo = () => Object.fromEntries(KEYS.map(k => [k, 0]));

// Every cargo unit takes 1 m³ of space, in a ship's hold and in the station's
// storage alike. Modules carry their own volume (`vol` in data/modules.js).
export const ITEM_VOL = 1;
