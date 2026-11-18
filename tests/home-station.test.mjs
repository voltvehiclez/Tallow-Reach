import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, resetPlaces, currentSave } from '../src/state/state.js';
import { newProfile, newWorld, sanitizeProfile, addShipRecords } from '../src/state/profile.js';
import { encodeSave, decodeSave } from '../src/state/storage.js';
import { setPlaceCatalog, placeDef, registerInstancePlace, unregisterInstancePlace, registerWormholePlace, unregisterWormholePlace } from '../src/data/places.js';
import { generateGalaxy } from '../src/sim/galaxy.js';
import { createPlayer } from '../src/sim/player.js';
import { configurePlayer, setHomeStation, homeStationPlace, canSetHomeStation, die } from '../src/sim/session.js';
import { enterPlace } from '../src/sim/places.js';
function fresh() {
  resetPlaces(); state.players.length = 0; state.localPlayerIndex = 0;
  state.profile = newProfile(); state.worldState = newWorld(); state.galaxy = generateGalaxy();
  setPlaceCatalog(state.galaxy); state.warp = null; state.ui.intro = false; state.place = 'reach';
  const player = configurePlayer(createPlayer(), state.profile); player.docked = true;
  const station = Object.values(state.galaxy.pockets).find(p => p.id !== 'reach' && placeDef(p.id).features.some(f => f.kind === 'station'));
  return { player, station };
}
test('Home persists through export/import; older saves default to Meridian; flying cannot change it', () => {
  const { player, station } = fresh();
  const legacy = structuredClone(state.profile); delete legacy.homeStation;
  assert.equal(sanitizeProfile(legacy).homeStation, 'reach');
  assert.equal(sanitizeProfile({...legacy,homeStation:{bad:true}}).homeStation,'reach');
  enterPlace(station.id, player); assert.match(setHomeStation(), /Home station set/);
  assert.equal(decodeSave(encodeSave(currentSave())).profile.homeStation,station.id);
  player.docked=false; enterPlace('reach',player);
  assert.match(setHomeStation(),/Dock at/); assert.equal(state.profile.homeStation,station.id);
});
test('Rich pilot with no surviving hull gets a fitted Wasp at a generated home station', () => {
  const {player,station}=fresh(); state.profile.cr=100000;
  enterPlace(station.id,player); setHomeStation(); enterPlace('hollow',player); player.docked=false;
  die();
  assert.equal(state.place,station.id); assert.equal(player.place,station.id); assert.equal(player.docked,true);
  assert.deepEqual(state.profile.ships,['wasp']); assert.ok(state.profile.loadout.wasp);
  assert.ok(state.profile.holds.wasp); assert.equal(state.worldState.place,station.id);
});
test('An existing surviving hull is reused, not supplemented with a free Wasp', () => {
  const {player,station}=fresh(); state.profile.ships.push('prospector'); addShipRecords(state.profile,'prospector');
  enterPlace(station.id,player); setHomeStation(); enterPlace('hollow',player); player.docked=false; die();
  assert.deepEqual(state.profile.ships,['prospector']); assert.equal(state.profile.ship,'prospector');
  assert.equal(player.place,station.id);
});
test('Missing, empty and temporary homes fall back to Meridian safely', () => {
  const {player}=fresh(); const features=[{kind:'station',id:'temporary',pos:[0,0,0]}];
  registerInstancePlace({id:'home-test-instance',kind:'instance',features});
  registerWormholePlace({id:'home-test-wormhole',kind:'pocket',features});
  try {
    for (const id of ['missing-station','hollow','home-test-instance','home-test-wormhole']) {
      assert.equal(canSetHomeStation(id),false); state.profile.homeStation=id; assert.equal(homeStationPlace(),'reach');
    }
    state.profile.homeStation='missing'; enterPlace('hollow',player); player.docked=false; die();
    assert.equal(player.place,'reach'); assert.equal(state.profile.homeStation,'reach');
  } finally { unregisterInstancePlace('home-test-instance'); unregisterWormholePlace('home-test-wormhole'); }
});
