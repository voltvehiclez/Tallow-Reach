// Current location text only; runtime instances do not belong to a normal system.
import { placeAt, systemOf } from '../data/places.js';
export function locationText(id) {
  const pocket = placeAt(id), system = systemOf(id);
  return { system: system && pocket.kind !== 'instance' ? placeAt(system).n : 'Uncharted Space', pocket: pocket.n };
}
