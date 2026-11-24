// A tiny publish/subscribe bus. Systems talk through events instead of
// importing each other, so new features can react to gameplay without
// touching the code that produced the event.
//
// Events in use:
//   action        { name, repeat, key?, to? }
//                                    key/bind pressed (see core/input.js); the
//                                    starmap's travel action carries `to`
//   freecam       boolean            free camera enabled / disabled (Left Alt toggle)
//   look          { dx, dy }         mouse movement while orbiting
//   wheel         deltaY             mouse wheel
//   hurt          { shielded, player } player took damage
//   player-dead   { player, lost }   hull reached zero; `lost` is the hold at that moment, { itemId: count } (non-local recovery not yet implemented)
//   docked                           player docked at the outpost
//   launched                         player left the outpost
//   died          text               ship destroyed (after docking)
//   dying         { player }         the hull reached zero and `die()` is about to take the ship, its
//                                    hold and the recovery fee. Anything that must happen while the
//                                    pilot is still where they died listens here: an instance
//                                    despawns at once and puts them back where they entered (step 14)
//   mined         { item, player }   one unit of ore added to the acting pilot's hold
//   pickup        { item, player, place, encounter, encounterType }
//                                    crate picked up; encounter fields are null for ordinary loot
//   encounter-cleared { place, id, encounter }
//                                    final crate/patrol member was cleared and a cooldown began
//   encounter-spawned { place, id, encounter }
//                                    a static encounter rebuilt its crate content
//   place-memory-ready { placeId, kind, id, forced }
//                                    a rock/encounter cooldown expired or was overridden
//   respawn-place  { placeId, kind, id }
//                                    story/event hook to clear one place-memory cooldown
//   sfx           { name, ...rest }  a game sound the sim wants played; `name` is a key of
//                                    SFX in core/audio.js (the sim never calls the speakers
//                                    itself). Extra fields are that sound's arguments, e.g.
//                                    { name: "explosion", count } or { name: "warp-charge", dur }
//   enemy-killed  { def, faction, id, player, place, encounter }
//   enemy-rammed  { e, dmg, at, byPlayer, placeId }   (collision damage; byPlayer null = the environment did it)
//                                    a hostile was destroyed; encounter is null for ordinary enemies
//   entity-spawned { id, kind }     any other entity entered the world: a bullet, missile,
//                                    crate, particle or rock (render/views.js builds its mesh).
//                                    Hostiles keep `enemy-spawned` below, from step 7a.
//   entity-removed { id, kind }     that entity left the world: it hit, expired, was picked
//                                    up, or the field was cleared (the view deletes its mesh)
//   enemy-spawned { id, def, pos }   a hostile entered the world (render/views.js builds its mesh)
//   enemy-removed { id }             a hostile left the world: killed, out of range, or the field
//                                    was cleared (render/views.js removes its mesh)
//   place-entered { id, player }    scenery should show this pocket (also on docking reset)
//   place-changed { from, to, player }
//                                    the pocket changed, mid-warp (see sim/sectors.js)
//   warp-start    { from, to, player }
//                                    a warp began: ship locked, drive charging
//   warp-end      { from, to, player }
//                                    warp over (arrived, or cancelled by docking)
//   travel-denied { player, from, to, reason }
//                                    sim/sectors.js refused a proposed hop; the
//                                    starmap shows the reason without closing
//   rift-opened   { id, place, template, seed }
//                                    a rift door appeared in a pocket (step 14)
//   rift-entered  { id, template, origin }
//                                    a pilot went in: the instance exists and its clock is running
//   rift-left     { id, origin }      a pilot came out through the instance's own exit
//   instance-closed { id, origin, reason }
//                                    an instance was destroyed for good; reason is "left",
//                                    "expiry", "death", "refused" or "reset"
//   instance-expired { id, kind, origin }
//                                    its lifetime ran out; `kind` is the declared `onExpire.kind`
//                                    ("kill" or "collapse"), whose handler then ran
//   instance-warning { id, left }     `RIFT.warnSec` seconds of lifetime are left
//   instance-objective-done { id, kind }
//                                    the instance's objective was completed
//   instance-cache-open { id, loot, n, left, profile }
//                                    the pilot opened the run's canister with R: a trade, offered by
//                                    ui/cache.js, not a transfer. `n` is the canister's own name and
//                                    `left` how many units are inside it at that moment
//   instance-cache-moved { id, item, n, dir }
//                                    one click in that trade moved `n` of `item`; `dir` is "take"
//                                    (canister to hold) or "stow" (the other way)
//   instance-cache-empty { id, loot }
//                                    a take left nothing inside, so the canister was dropped from
//                                    the world; something stowed back into it brings it back
//   instance-cache-closed { id, left }
//                                    the trade was put away, with `left` units still inside
//   instance-restored { id, template, left }
//                                    a saved run was rebuilt around the pilot on load (slice 14b)
//   instances-forgotten { ids }       a load dropped the runs of the save it replaced, so their
//                                    places no longer exist (main.js frees their scenery)
//   wormhole-collapsed { id, parent, template }
//                                    a simple wormhole's clock ended (slice 14c): the door in
//                                    normal space faded. The pocket lingers only while the pilot is
//                                    in it (or in its run, or warping towards it); otherwise it was
//                                    taken off the map in the same breath. A replacement pops up
//                                    somewhere else in the universe either way.
//   wormhole-gone { id, parent }     a simple wormhole pocket was removed from the map for good —
//                                    it faded while nobody was in it, or the pilot warped off a
//                                    faded one (main.js frees its scenery)
//   delivered     { item?, target?, place?, player }
//                                    a mission delivery objective reached its target
//   mission-tick  { dt, player }     one unpaused simulation tick for survive/wait objectives
//   mission-trigger { trigger, mission?, place?, player }
//                                    a story trigger woke a wait step (mission waves emit wave-clear automatically);
//                                    a supplied mission id scopes the trigger to that mission
//   mission-dialogue-next { player } advance the current dialogue line
//   mission-dialogue-choice { choice, player }
//                                    select a current dialogue choice
//   mission-script { mission, action, player, place }
//                                    a story script asks a sim adapter to perform an action
//   mission-sector-state { mission, place, state, player }
//                                    a script changed remembered state for one place
//   mission-item-given / mission-item-taken { mission, item, count, target, player }
//                                    a script changed a ship or station inventory
//   mission-warp { mission, from, to, player }
//                                    a script moved a pilot to another pocket
//   mission-accepted { mission, player }
//                                    a contract or story mission entered a pilot's active list
//   mission-progress  { mission, event, payload, player }
//                                    the data-driven runner advanced an objective
//   mission-objectives-done { mission, player }
//                                    every step is finished, but the mission is NOT accomplished:
//                                    items still owed are handed in, and the reward claimed, at a station
//   mission-failed { mission, title, reason, action, message, player }   `message` is always filled; the HUD shows it
//                                    a configured death, departure or timeout outcome ran
//   mission-rewarded { mission, reward, player }
//                                    the pilot handed in any owed items and took the reward
//   mission-abandoned { mission, player }
//                                    the pilot removed an active mission
//   mission-inventory-changed { profile, player }
//                                    a station inventory action may unblock a pending mission item script
//   mission-ui-refresh {}
//                                    a non-mission screen transition changed dialogue visibility
//   main-menu {}
//                                    the pause menu returned the local screen to the title menu
//   mp-state      snapshot          the multiplayer session changed (host/guest, peers, chat)
//   mp-chat-arrived { from, text, at }  a line from somebody else
//   mp-notice     text             `net/` asks for a sentence on screen (it may not import ui/)
//   mp-host-left  { reason, hostName }
//                                    slice 5: the connection to the host is gone (its browser
//                                    closed, or nothing has come back from it). `ui/` stops the
//                                    session, returns the player to the main menu and raises
//                                    "Lost connection to host"; the pilot's save is untouched
//   mp-join-request { link }       a ?join= link in the address bar wants a yes/no
//   mp-enter-world {}              a join from the title worked: enter the open world
//   mp-guest-arrive { guestId, name, profile, place }
//                                    slice 4: a guest's suitcase has arrived; sim/multiplayer.js
//                                    turns it into a docked player record
//   mp-guest-arrived { player, guestId, name, place }
//                                    that record now exists and the host's sim flies it
//   mp-guest-left { guestId, name }  it went home (or was dropped); the record is gone
//   mp-suitcase   { bundle, rev }   the host's newer copy of this pilot arrived (guest side);
//                                    the save half stores it with net/multiplayer.js `syncAway`
//   mp-away-changed { away }        where this pilot is changed: null at home, a marker away
//                                    (a screen redraw; the title card reads it)

const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}

export function emit(name, payload) {
  const list = handlers.get(name);
  if (list) for (const fn of list) fn(payload);
}
