// Current location text only; runtime instances do not belong to a normal system.
import { placeAt, systemOf } from '../data/places.js';
export function locationText(id) {
  const pocket = placeAt(id), system = systemOf(id);
  return { system: system ? placeAt(system).n : 'Outside known systems', pocket: pocket.n };
}
