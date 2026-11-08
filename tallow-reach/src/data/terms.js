// Player-facing generic nouns for the universe. Proper names (Meridian System,
// Meridian Station, Kestrel Hollow) live in data/places.js. Change a word here
// once and every screen/hint that uses the helper follows.
export const TERMS = {
  mapNode: "system",   // a node on the 2D starmap; groups pockets
  flyable: "pocket",   // an area of space the ship can fly in
  planet: "planet",
  station: "station",
};

/** Lower-case generic word, e.g. term("flyable") -> "pocket". */
export const term = key => TERMS[key] || key;

/** Capitalised generic word, e.g. Term("mapNode") -> "System". */
export const Term = key => {
  const word = term(key);
  return word.charAt(0).toUpperCase() + word.slice(1);
};

/** Plural generic word, e.g. terms("flyable") -> "pockets". */
export const terms = key => term(key) + "s";
