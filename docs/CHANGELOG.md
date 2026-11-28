# Changelog

Newest first. Every AI session adds a short entry when it changes the project, so the
next assistant (which has no memory of earlier chats) can see what happened and why.

Entry format: date, a one-line title, then what changed, which files, and anything
the next person must know (save version, rebuild needed, known issues).

**How this file stays a useful size**

- This file holds the newest entries in full, then the **Older entries** index at the bottom:
  one line for every entry that has been moved to [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).
  Read the entries here and the index; open the archive only when the index shows something
  relevant to the task (the archive has the full text, nothing was shortened).
- **Rule:** this file holds **at most 10 full entries**. When adding an entry leaves more than 10, move the
  oldest ones to the top of the archive (word for word, newest first) so exactly 10 remain, and add one index
  line for each entry moved, at the top of the index. Do this in the same change that adds the new entry.
  `tests/docs.test.mjs` fails if there are more than 10, or if the index and the archive disagree.
- Never delete an entry. History is only ever moved.

## 2026-11-27: Guest-vs-local feature parity — F/N/missile locks, route jump, rifts/instances/caches, wormholes, galaxy/shops & destination sync (build `2026-11-27h`)

**Code change; rebuild needed; build `2026-11-27h`.** Save version unchanged (**29**); additive optional fields on `entities` (`rifts`, `gates`, `caches`), `visit` (`openCacheId`, `galaxy`, `shops`, `wormholes`, `connections`, `instance`), and `ACT_OPS` (`"lock"`, `"rift"`, `"cacheClose"`).

Closed every gameplay parity gap between visiting guests and local/host pilots:

1. **Targeting, N-list & missile parity (`src/sim/{targeting,missile,weapons,guest-actions}.js`, `src/main.js`):** Guest `KeyF` / `KeyN` selections forward `{ op: "lock", kind, id }` to the host so host-side missiles (`updateMissiles`) follow guest target locks, and `otherPilotsThere`/`targetHealth`/`updateMissileFlight` treat live host/guest pilots identically while blocking missile locks on docked pilots.
2. **Rifts, dynamic instances, shared `CACHE` trades, wormholes & uncharted links (`src/sim/{instances,wormholes,uncharted,inventory,guest-actions,world,places}.js`, `src/net/{protocol,session}.js`, `src/render/entitystream.js`, `src/ui/{cache,cargo,hud}.js`, `src/main.js`):** Synced `rifts`/`gates`/`caches` via `mp-entities`, `visit.instance` (`syncGuestInstance` with multi-pilot `entries`, isolated exit/death extraction, cache `slots` + `tradeOpen`, and live HUD countdown interpolation), wormhole occupancy guards (`pocketOccupied`), and `uncharted` `pocketsById` expiry cleanup. Fixed two `guest-actions.js` bugs caught by integration testing (`cache?.stock` vs `cache?.loot` string, and `invMove` measuring moved quantity instead of string `moveItem > 0`). Routed guest `KeyR`, cache close/use/discard, and cargo consumable confirmation (`pendingUse`) over `act`/`visit`, and gated `"instance-cache-open"`/`"docked"`/`"rift-left"` events by `payload?.player`.
3. **Galaxy, shops, starmap destination & travel notices (`src/sim/{galaxy-session,navigation,sectors,session}.js`, `src/state/destination.js`, `src/ui/starmap.js`, `src/main.js`):** Synced host `galaxy` (`seed`/`knowledge`), `shops`, `wormholes`, and `connections` cleanly across `visit` (bucketing `visitPrintOf` lifetimes so idle countdowns do not spam `visit` packets) with full home stash/restore on leaving; deferred dynamic instance `pendingNetPlace` transitions until `syncGuestInstance` registers the place; routed `KeyJ` (`jumpRoute` `warpFn`) and `"travel-denied"` notices to guests; guarded `setDestination` against overwriting the home save while away; and emitted `"place-changed"` on guest transitions so `starmap` clears reached destinations automatically.

**Tests:** Added `tests/multiplayer-parity.test.mjs` (**6** suites including a two-VM real-`src/main.js` end-to-end test); **Playtest confirmed (2026-11-28):** owner passed Slice 8c + full guest parity (`2026-11-27h`), guide moved to `testing/passed/TESTING-16-SLICE8C.md`, ticked in `docs/ROADMAP.md`; **Docs:** Updated `docs/HANDOFF.md`, `docs/LESSONS.md` (`L58`; archived `L46`–`L47`), and `docs/architecture/multiplayer.md`.

## 2026-11-27: Fix paused-tab 1 Hz host throttling & 24 Hz cannon bolt snapping (build `2026-11-27g`)

**Code change; rebuild needed; build `2026-11-27g`.** Save version unchanged (**29**); wire schema and `SHIP_STREAM` (`24 Hz` / `100 ms`) unchanged.

Fixed two follow-up issues from the `2026-11-27f` multiplayer playtest:

1. **Paused background host 1 Hz stall (`src/main.js`).** Opening the Pause menu calls `setAudioSuspended(true)` on the main game `AudioContext`, while `hostAudioCtx` previously wrote all-zero silence through `gain = 0`. Without active non-zero audio, Chromium dropped the tab's audible exemption and throttled background timers to `1 Hz` whenever the host switched tabs with Pause open. `startHostAudioKeepalive()` now generates a sub-audible `12 Hz` (`0.002` / `-57 dBFS`) sine carrier in both `AudioWorkletNode` and `ScriptProcessorNode` (ramped `0 -> 1` over `50 ms`, resumed automatically on `visibilitychange`/gesture), keeping background host tabs unthrottled while paused or muted on both `https://` and `file://`.
2. **Cannon shot 24 Hz stepping & stream lockstep (`src/main.js`, `src/net/session.js`).** Cannon bolts (`900 m/s` + up to `300 m/s` ship speed) move `44–65 m` per `42 ms` snapshot, tripping `entityStream`'s `snapM: 50` teleport cutoff every frame and preventing interpolation. Raised `entityStream` `snapM` to `300` (and `guestSelfStream` `snapM` to `80`), and piggybacked `startEntityStream()` onto `shipTick` (`entityTick = -1`) so ship poses and spawned projectiles emit from the same `24 Hz` host tick.

**Tests:** Added fast cannon-bolt interpolation test in `tests/multiplayer-8c-fixes.test.mjs` and sub-audible keepalive / `snapM: 300` assertions in `tests/multiplayer-playtest-20261127.test.mjs`; `npm test` **1170/1170**, build **3671 KB**. **Docs:** Archived `2026-11-25` Playtest 24 entry, added `L57` in `docs/LESSONS.md`, and updated `docs/HANDOFF.md` and `docs/architecture/multiplayer.md`.

## 2026-11-27: Pre-8d 240 Hz guest jitter & turn smoothing (build `2026-11-27f`)

**Code change; rebuild needed; build `2026-11-27f`.** Save version unchanged (**29**); wire schema and `SHIP_STREAM` (`24 Hz` / `100 ms`) unchanged.

Eliminated guest-side 240 Hz stutter, packet-jitter surging, and high-speed turning shake before Slice 8d prediction:

1. **Snapshot buffer depth & sub-ms clock alignment (`src/main.js`, `src/net/session.js`).** Raised `guestSelfStream` (`35 ms` -> `SHIP_STREAM.delayMs` `100 ms`) and `entityStream` (`50 ms` -> `SHIP_STREAM.delayMs` `100 ms`) past `2.4x` the 24 Hz send interval so high-refresh frames never run dry into 24 Hz hold-frames, and aligned `onShips`, `onEntities`, `mp-refresh-visit`, and `drawFrame` onto `hrNow` (`performance.timeOrigin + performance.now()` / `rAF` timestamp, `Date.now()` fallback in headless VMs) to avoid `Date.now()` ms quantization beats.
2. **Arrival-jitter pacing (`src/render/{shipstream,entitystream}.js`, `src/main.js`).** Added opt-in `paceMs: 1000 / SHIP_STREAM.hz` (`~41.67 ms`) cadence dejittering on `shipStream`, `guestSelfStream`, and `entityStream` so uneven WebRTC arrival gaps stay near steady 24 Hz spacing (with `-0.25` step-rounding bias so `+25 ms` late packets do not miscount steps, plus `rawAt + 8` cap and fast pass-through on immediate dock/launch packets).
3. **Tangent-preserving turn curves & visual polish (`src/render/shipstream.js`, `src/main.js`).** Added tangent-checked Cubic Hermite position blending (`interpPos`) across curved high-speed turns (falling back to linear lerp on zero-velocity or mismatched stubs), smoothly interpolated `warpFx`, `warpFlash`, and `shake`, and damped guest `gP.bs` boost FOV/glow per frame (`dt * 8`) instead of stepping on snapshots.

**Tests:** Added `paceMs` + Cubic Hermite curve test in `tests/multiplayer-weapons.test.mjs`, `entityStream` `paceMs` test in `tests/multiplayer-8c-fixes.test.mjs`, and stream/boost/hunt coverage in `tests/multiplayer-playtest-20261127.test.mjs`; `npm test` **1170/1170**, build **3670 KB**. **Docs:** Updated `docs/HANDOFF.md` and `docs/architecture/multiplayer.md`.

## 2026-11-27: Fix host keepalive, guest Launch/HUD/beam/rock parity, pocket collisions, and view/cubemap bugs (build `2026-11-27e`)

**Code change; rebuild needed; build `2026-11-27e`.** Save version unchanged (**29**). Wire adds five optional/cleaned fields to `SHIP_FIELDS` (`beamT`, `pwr`, `pwrDraw`, `enFrac`, `hint`) and optional `rocks` diff packets (`LIMITS.rocks = 256`) on `entities`.

Fixed four post-playtest bug clusters found on `2026-11-27d`:

1. **Views & WebGL console errors (`src/render/{views,cubemap}.js`, `src/data/multiplayer.js`, `src/net/transport.js`).** Keyed `views.js` `drawn` map by `${kind}:${id}` instead of `${group}:${id}` (eliminating rock/bullet/crate numeric ID collisions that turned Ferrite rocks into firing bolts), guarded `orientFace` `texture.needsUpdate = true` on `texture.image`, pruned dead/noisy relays to 10 curated `RELAYS.relayUrls`, and set `relayConfig.warnOnRelayFailure = false`.
2. **Host background keepalive (`src/main.js`, `src/net/session.js`).** Added `data:` Worker fallback after `blob:` Worker errors (`file://` `SecurityError`) and a gesture-unlocked, zero-gain WebAudio `AudioWorkletNode` / `ScriptProcessorNode` heartbeat (paused/stopped cleanly when not hosting), plus tightened `host-keepalive-tick` throttle to `Math.round(1000 / SHIP_STREAM.hz) - 4`.
3. **Guest Launch/power/warp parity & remote-pocket collision (`src/main.js`, `src/sim/player.js`).** Skipped stale pre-transition `applySelfShip` `docked` frames during `dockStreamCaughtUp === false` (with 1.5 s safety guard) so launching guests never freeze or snap to `[0,0,0]`, preserved non-docked `power`/`en` across `applyVisitSnapshot` `refillPower`, stored `P.warp.from` for guest Warp arrival notices alongside Launch notices, and switched `flight()` collisions in `src/sim/player.js` from `state.world` to `placeWorld(P.place || state.place)`.
4. **Mining beam, HUD bars/prompts, and rock sync (`src/data/multiplayer.js`, `src/net/{ships,protocol,session}.js`, `src/state/state.js`, `src/sim/{step,weapons,combat,sectors,places,world}.js`, `src/render/{shipstream,entitystream}.js`, `src/ui/hud.js`, `src/main.js`).** Synced `beamT`/`pwr`/`pwrDraw`/`enFrac`/`hint` with interpolation, routed non-local transient hints via `sayForPlayer` (expired in `step.js`), matched `hud.js` `#bm` against `primarySlotIndex(S.pw, P)`, diffed/throttled `rocks` in `mp-entities`, synced in-place scaling/depletion via `syncPocketRocks` (guarded `loadPlace` against double-spawn), and updated `clearNetEntities` to purge `_net` rocks and reset `container.loaded = false`.

**Tests:** Updated `tests/{skybox,views,multiplayer-weapons,multiplayer-playtest-20261127}.test.mjs` with unit and two-VM real `src/main.js` integration coverage. **Docs:** Updated `docs/HANDOFF.md`, `docs/LESSONS.md` (`L55`–`L56`, archived `L35`–`L36`), and `docs/architecture/multiplayer.md`.

## 2026-11-27: Fix guest `G` docking and undocked relog HUD/reticle (build `2026-11-27d`)

**Code change; rebuild needed; build `2026-11-27d`.** Save version unchanged (**29**); no save or wire schema changes.

Fixed two live-playtest integration bugs found in `2026-11-27c`:

1. **Guest `G` docking (`src/main.js`).** Imported missing `cancelGuestHeld` from `./sim/multiplayer.js` (previously throwing `ReferenceError` inside `mp-guest-dock`'s `try/catch` and sending an empty notice back to the guest), and added `console.error` + guarded `reportCrash` logging in `mp-guest-dock`, `mp-guest-warp`, `applyVisitSnapshot`, and `restoreGuestHome` so no net-side failure fails silently.
2. **Undocked guest relog HUD and reticle (`src/ui/menu.js`, `src/ui/hud.js`, `src/util/events.js`, `src/main.js`).** `enterGameMode("open")` now emits `"open-world-entered"` after clearing `state.ui.intro`, and `ui/hud.js` attaches `syncWorldHud` to `"open-world-entered"` and `"mp-refresh-visit"` (clearing route/weapon-slot caches and calling `setReticle(Boolean(state.player && !state.player.docked))`). Also fixed `mp-refresh-visit` in `src/main.js` to pass `latestSelf[0]` instead of the `Pose[]` array to `applySelfShip`.

**Tests:** Extended `tests/multiplayer-playtest-20261127.test.mjs` with an esbuild whole-bundle undeclared-call guard (`src/main.js`) and a two-VM real `src/main.js` end-to-end playtest covering `KeyG` docking (`cancelGuestHeld` + `docked` + HUD/panel sync), contract accept/progress/hand-in, abrupt disconnect, and undocked relog HUD/reticle recovery. **Docs:** Updated `docs/HANDOFF.md`, `docs/LESSONS.md` (`L54`; moved `L42`–`L44` to `docs/archive/MULTIPLAYER_SLICE4_5_LESSONS.md`), `docs/architecture/multiplayer.md`, and `src/ui/README.md`.

## 2026-11-27: Post-8c live playtest fixes (build `2026-11-27c`) — guest HUD speed, docking, per-host `visitState` persistence, and UI resume guard

**Code change; rebuild needed; build `2026-11-27c` (`npm run build` 3660 KB).** Save version unchanged (**29**; additive `visitState` field on `world.guests[guestId]` listed in `GUEST_FIELDS`).

Fixed four bugs caught in live two-browser playtesting after `2026-11-27b`:

1. **Guest HUD speed matches live velocity (`src/sim/flight-instruments.js`, `src/main.js`).** Exported `syncSpeedFromVelocity(player, warping)` and invoked it inside `applySelfShip` (zeroing velocity/throttle when docked) so guest `P.measuredSpeed` and `P.forwardSpeed` track forward/reverse flight, boost, and warp instead of staying stuck at `0 m/s`.
2. **Reliable guest docking over both Trystero and paste-code links (`src/net/session.js`, `src/sim/session.js`, `src/main.js`).** Removed the 250 ms `withinDockGrace` timer that reverted guest docking on stale `ships` snapshots; `applySelfShip` and `applyVisitSnapshot` now synchronize `docked` deterministically via `lastVisitDockState` and `dockStreamCaughtUp`. Added `resolveGuestEntry(peerId)` and `hostPeerId || null` targeting so paste-code sessions (`peerId === null`) deliver `controls`/`warp`/`dock`/`act`, and exported `dockFailureReason` + `"docking-denied"` push feedback when pressing dock above `DOCK_MAX_SPEED` (broadcasting `ships` immediately on `dockTransition`).
3. **Per-host-world guest progress persists across relogs without custody leak (`src/data/multiplayer.js`, `src/state/{profile,state}.js`, `src/net/{custody,multiplayer,session}.js`, `src/sim/{guest-actions,multiplayer,session}.js`, `src/main.js`).** Added `cleanVisitState`/`buildGuestVisitState` on `world.guests[guestId].visitState`, restored cleanly by `hostProfile(bundle, visitState)` + `arriveGuest()` + `applyResumePlacement()`. `syncGuests` / `saveGuestVisitState` / `captureActiveModeSave` quietly persist host-scoped missions, flags, counters, `homeStation`, pocket, flight `resume` pose/shield/boost, boards, drops, and `stationSlots` without bumping suitcase `rev`, while `forgetPeer` (`sendWire: false`), `stop()`, and `mp-host-flush` flush before disconnect/save and `saveKit.write` commits to `saveAutosave` (gating 30 Hz `markGuestSeen` with `{ persist: false }`). Also fixed `onCarry` to stamp `lastSent` so unchanged guests avoid an immediate redundant `rev` bump.
4. **Menu resume guard (`src/ui/menu.js`).** `enterGameMode("open")` preserves `state.away` visits via `mp-refresh-home` / `mp-refresh-visit` instead of running `resumeFromSave()`, stopping docked home coordinates from clobbering airborne guest visits.

**Tests:** Updated `tests/multiplayer-custody.test.mjs` (`GUEST_FIELDS` `"visitState"`) and added `tests/multiplayer-playtest-20261127.test.mjs` (**5** suites); `npm test` **1160/1160** passing. **Docs:** Updated `docs/architecture/multiplayer.md` (archived Playtest 23/24 notes to `docs/archive/MULTIPLAYER_PLAYTEST_23_24_NOTES.md`), `docs/HANDOFF.md`, and `docs/LESSONS.md` (`L52`–`L53`).

## 2026-11-27: Guest ship, station, inventory/fitting, and mission sync + owner isolation (build `2026-11-27b`)

**Code change; rebuild needed; build `2026-11-27b`.** Save version unchanged (**29**). Wire adds two allowlisted/capped kinds (`act` guest→host and `visit` host→guest) plus optional mission/owner metadata on `entities` (`enemies`/`crates`).

Implemented full host-authoritative state synchronization for visiting guests while preserving host/guest mission, inventory, and save-custody isolation:

1. **Authoritative guest world & 36 `ACT_OPS` actions (`src/sim/guest-actions.js`, `src/sim/multiplayer.js`):** Each guest gets an isolated `P.guestWorld` (`stationStores`, `stationSlots`, `boards`, `base`, `missionState`) seeded with arrived lockers and preserved unknown items. `runGuestAction` executes `pw`/`sw` weapon selection, inventory/cursor-hold drag-drop (`guestHeld`), outfitting bay equip/swap/unequip, shop/hangar/shipyard (`buyShip` directly via `economy.js`), contracts, and story dialogue/choices strictly on `(P, P.profile, P.guestWorld)`. `guestProfileSnapshot`/`guestLockerSnapshot` fold live cursor holds non-destructively during suitcase write-backs.
2. **Wire protocol & session loop (`src/net/protocol.js`, `src/net/session.js`, `src/data/multiplayer.js`):** Added `act` / `visit` cleaning & limits (`cleanAct`, `cleanHeld`, `cleanVisit`), peer-verified `onAct`, dirty-checked `pushVisit`/`pushVisitIfDirty`, module-level `mp-guest-visit-push` forwarding, and `requestGuestAction`. Preserved `state.guestHome` in `saveKit.read`/`install` and guarded `saveCurrentGame()` (`src/state/state.js`) to return `null` while `state.away` is set.
3. **Mission/HUD owner isolation (`src/sim/{missions,combat,contracts,ai,economy,fitting,places,session,step}.js`, `src/state/profile.js`, `src/ui/mission-hud.js`, `src/render/entitystream.js`):** Stamped non-host `mission.owner`, isolated mission spawns/kills/drops per owner while leaving ambient kills shared, filtered HUD objective highlights by `viewerOwner`, and carried `missionId`/`encounter`/`missionOwner` across `entities` sync.
4. **Guest client UI & anti-bounce wiring (`src/main.js`, `src/ui/{menu,inventory-ui,cargo,missionlog,multiplayer}.js`):** Registered `installMultiplayerShips` before `setupMenu` so `applyVisitSnapshot` runs before UI redraws; added `stashGuestHome` rejoin/replay on `mp-enter-world`, `withinShipGrace` (`300 ms`), `withinDockGrace` (`250 ms`), and `latestSlotReqId` anti-bounce; routed docked/cargo/inventory/dialogue/weapon-slot interactions to `requestGuestAction`; and updated entering-world notice/hint copy.

**Tests:** Added `tests/multiplayer-guest-sync.test.mjs` (**5** suites) and updated `tests/multiplayer-connection.test.mjs` and `tests/multiplayer-playtest16.test.mjs`.

## 2026-11-27: Slice 8c playtest fixes (build `2026-11-27a`) — pause-menu toggle, docked stability, clean return home, and smooth guest enemies/SFX

**Code change; rebuild needed; build `2026-11-27a` (`npm run build` 3625 KB).** Save version unchanged (**29**); no saved field or wire format changes.

Fixed four bugs reported in owner playtesting of Slice 8c (`2026-11-26b`):

1. **Multiplayer toggle from the Pause menu works properly.** `setupMultiplayer()` (`src/ui/multiplayer.js`) and `src/main.js` now sync `state.multiplayer` inside their `mp-state` listener whenever multiplayer starts or stops, instead of leaving it `false` until returning to the main menu.
2. **Docked guests stay docked cleanly and the camera snaps on dock/launch.** Removed auto-launch on non-zero guest input in `src/sim/multiplayer.js` (`applyGuestControls` ignores inputs while `P.docked`, so guests launch only on explicit Launch / `dock` requests); guarded `sendControls()` (`src/net/session.js`) against `intro`, `campaignEnd`, `paused`, and `docked`; reset `localInput` on `"docked"` only for the local pilot (`src/core/input.js`); cleared controls when opening pause or chat (`src/main.js`); cleared velocity/boost/controls in `dock()` (`src/sim/session.js`); and snapped `shipStream` + `applySelfShip` camera/pose immediately when `docked`, `dead`, or `place` changes (`src/render/shipstream.js`, `src/main.js`).
3. **Leaving a multiplayer world leaves zero leftover remote state.** Added `clearNetEntities()` / `purgeNonNetEntities()` in `src/sim/world.js` (walking `container.entities` on every pocket in `state.places`), wired cleanup + `clearControls()` into `restoreGuestHome()` (`src/main.js`), `comeHome()`, `enterGameMode()`, `ACTIONS.comehome()`, and `afterSaveChange()` (`src/ui/menu.js`), and saved/restored `docked` across guest home stash/restore.
4. **Guest remote hostiles/bullets interpolate smoothly, hostile shots stay red, and pocket SFX match single-player.** Added `src/render/entitystream.js` (`createEntityStream`, `syncPocketEntities`, `hasNetEntities`, `collectGuestPocketSfx`) for 100 ms buffered interpolation across `enemies`, `bullets`, `missiles`, `crates`, and `fx`, and purged stale local non-`_net` NPCs when syncing the host pocket; updated `src/render/views.js` to skip 60 Hz `prevPoses` interpolation for `_net` entities and `state.away` local pilots; restored `BULLET_COLOURS.hostile` fallback on non-player shots (`src/main.js`); and passed `count: 30` on `explosion` SFX plus first-packet baseline handling (`efires`, `hearRange`, docked silence).

**Tests:** `tests/multiplayer-8c-fixes.test.mjs` (new, **9** tests covering Bugs 1–4) and updated `tests/multiplayer-controls.test.mjs`; `npm test` **1150/1150**. **Docs:** archived L37–L41 to `docs/archive/MULTIPLAYER_SLICE4_5_LESSONS.md`, added L48–L51 in `docs/LESSONS.md`, updated `src/{sim,render}/README.md`, `testing/TESTING-16-SLICE8C.md`, `HANDOFF.md`.

## 2026-11-26: Slice 8c follow-up (build `2026-11-26b`) — a visitor recovers like a pilot, and the pocket's shots reach the guest

**Code change; rebuild needed; build `2026-11-26b` (`npm run build` 3611 KB).** Save version unchanged (**29**); the wire gains no new message kinds — the previously dead `entities` message is now actually sent, per pocket, and crates gained `quat` in its cleaning.

Slice 8c shipped `2026-11-26a` with pieces that were written down but never wired, plus one snapshot rate that had drifted. The owner's six playtest reports (2026-11-26) exposed all of it; this pass fixes each one. The suite was red first (11 failures), all now green (**1132/1132**), plus (2026-11-27) the owner's fundamental rule is applied to **all weapon effects — there is no slice 8e**: the guest's own mining beam, lock ring/cone, cannon/missile/lock/hit/ore/boost sounds and pocket explosions all ride the wire exactly as they are decided single-player:

1. **The guest's view is drawn from the same buffer as before, but the wire now carries everything the screen needs to feel local** — and the remaining roughness (turn-lag on 165–240 Hz) is named honestly as slice **8d** (client-side prediction), not hand-waved. **`SHIP_STREAM` had drifted** from the contract (24 Hz / 100 ms / 6 samples / 1500 ms / 50 m) to 30/50/8 — restored. **Boost and camera shake now ride the wire** (`SHIP_FIELDS.boost`/`shake`): the guest's own boost shakes its camera (the amplitude decays on the simulation clock per pilot, `sim/player.js` flight) and every hull's flame lengthens on boost — the previous AI's primitives shipped already decayed only for the local pilot.
2. **Weapons effects are visible to the guest.** The host has always simulated the visitor's guns; what was broken was delivery — the `entities` wire (bullets, missiles, crates, fx) was dead code that sent `place: ""` with empty lists and applied them to a junk pocket. Now the host answers `mp-entities-request` with one `entities` message **per pocket a visitor occupies** (24 Hz, plus the hidden-tab keepalive), the guest keeps per-id records in the pocket's own lists (`_net` markers, dropped when a snapshot stops naming them, interpolated by the same `updatePose` path), and applies them only to the pocket it is in. **2026-11-27 (fundamental rule):** the guest's own **mining beam** is the host's record verbatim on the wire — `SHIP_FIELDS.beamOn`/`beamStart`/`beamEnd`/`mineFrac` (plus `cone`/`lockT`/`lockLocked`/`lockTarget` for the lock ring, which were missing entirely) are applied to the guest's own `state.flight` before render, so the beam draws, the beam bar fills, the hum ramps and the lock ring animates exactly as single-player. **Sound parity:** the sim keeps monotonic event counters on the pilot record (`shots`/`missiles`/`locks`/`ore`/`hits`/`boosts`, u16 on the wire); the guest's own screen re-plays the matching local sfx the moment a counter advances (a lost packet collapses two shots into one sound, never a backlog). The pocket `entities` message gained `booms` (count &gt; 10, the local `explosion` gate) so every screen in the pocket rumbles for a kill or a missile's detonation. Everything here is replay of **host-confirmed** events — the guest never hears a shot the host refused to fire; what it cannot have yet is click-to-flash immediacy (that is 8d prediction, not this build). **Enemies now reach the guest (owner, 2026-11-27):** the pocket `entities` message gained `enemies` (id, def, friendly, boost, pos, quat, v, hp, mx — nothing else; nine fields, capped at the same 32); the guest syncs them into the pocket's `W.enemies` with `_net` markers, so the same view pipeline draws and locks them, F-lock/N-list/lead pip work untouched, and the host's bullet-vs-pilot rules (which already hurt a visiting hull through the same `hurt`) make them shoot exactly as hard as they do single-player. The own screen re-emits `hurt` when the `hits` counter advances, so the HUD flash works too. The host remains the only writer of every wound and every kill; the guest simulates nothing.
3. **A tabbed-out host no longer freezes the encounter.** The wall-time catch-up stepping in `main.js` was gated behind a check that skipped it exactly when the page was alive-but-quiet, and the ship/entity broadcasts only rode the page's (throttled) setInterval. Now the host-tick is dt-driven with a 5 s clamp, designed to be idempotent, and `host-keepalive-tick` (which broadcasts ships and entities from that path) fires on every host tick; rAF-alive still owns the sim while visible (no double-step). The worker fallback chain is unchanged. **Verify on two machines** — this is the one fix that cannot be proven in a unit test.
4. **Docking works for a guest, in both directions.** The host's `mp-guest-dock` handler now treats one press as a dock↔launch toggle (`tryDock` / `launch` for the visitor), the guest's **Launch** button asks the host rather than calling `launch()` locally (the local call teleported the ship to the launch point), and the guest's screen follows the snapshot flip by emitting `docked`/`launched` locally — so the station card opens with the guest's own suitcase (its ship, its fit, its hold) and the reticle, panels and mission fan-out behave as they do single-player.
5. **Death recovers docked, like any pilot, at the home station.** `die()` in `sim/session.js` now takes `(P, profile)`; a non-local record recovers in the world that holds it (the host's): cargo lost, `RECOVERY_FEE` (capped by cash) charged, fallback to the home hangar or a lent Wasp, and the record wakes **docked at the station's own position** — never at the undock point/launch, as the previous round did. No `place-entered` reaches the host's screen, the death pocket is not `clearTransient`ed (it would wipe the host's pocket), and the explosion is drawn in the pocket the ship stood in. `mp-guest-destroyed` is now **`mp-guest-recovered`**; `events.js`, the module READMEs and the test that pinned the old dead-end describe the built behavior.
6. **Docked hulls are inside the station and are not drawn — on every screen** (owner, 2026-11-26). The skip in `render/views.js` is restored, worded to the owner's ruling; slice-8a's views tests now fly their visitor and pin the rule. The previous entry in this file wrongly claimed the opposite — corrected there and in `render/README.md`, `TESTING-16-SLICE8A.md`, and `HANDOFF`.

Also: the `player-dead` fan-out (mission rules) can no longer be broken by a recovery throw; a profile-less/ship-less record is news, not a hull, and is announced as such.

Not yet playtested: everything in this entry is `2026-11-26b`. The owner still needs to run [testing/TESTING-16-SLICE8C.md](../testing/TESTING-16-SLICE8C.md) on both machines, including a guest death and a docked relaunch.

## 2026-11-26: Slice 8c — the host's world on the guest's screen

**Code change; rebuild needed; build `2026-11-26a`.** Save version unchanged (**29**); no saved field, no wire snapshot format change beyond two new guest→host kinds (`warp`, `dock`).

The guest still ran its own world in 8b — its own sim stepped its own scenery while the host's snapshots were only views. 8c makes the guest's screen the host's world, per [REFACTOR_PLAN.md](REFACTOR_PLAN.md) slice 8c and the owner's four decisions of 2026-11-26:

- **Guest can warp and dock freely** (not follow the host). A guest Warp or Dock press sends a `warp`/`dock` request (`net/protocol.js` new kinds, `net/session.js` `requestWarp`/`requestDock`, host re-checks `travelQuote`/`tryDock` via `mp-guest-warp`/`mp-guest-dock` in `main.js`). Host warp never drags the guest; rift/instance only affects who is in it.
- **State and scenery follow the host's pocket via the snapshot.** Guest's own-ship entry (`HOST-pilot-filter` removed for self) arrives as `mp-self-ship` and is applied to `localPlayer` (`pos`/`quat`/`v`/`thr`/`docked`/`dead`/`place`, hull/shield fractions back to HP) with a `snap` on place change; `state.place` and scenery (`enterPlace` → `place-entered` → `showPlace`) follow the guest's own authoritative place, not the host's. Own galaxy stays loaded but is **not stepped** — `sim/step.js` early-return when `state.away` (`isGuest()`), so single-player is identical.
- **HUD is the guest's ship**, not the host's. Pilot record driven by snapshots; per the owner's choice A, `state.guestHome` (runtime only, never saved) stashes `place`/`worldPlace` on `mp-away-changed` and restores on Go home / host-lost / session end (`showPlace`, clear stream). `SAVE_VERSION` stays **29** (no reload persistence; reload while away is a fresh start and Bring pilot home still works).
- **Wire:** two new kinds `warp { to }` and `dock {}` (cleaned, capped `LIMITS.id`), one new emit `mp-self-ship` plus the existing `mp-ships` stream (100 ms delay, 24 Hz). Layers kept: `net/` may import `sim/` never reverse, `net/` never imports `core/`, `sim/` never imports `net/`, only `transport.js` names Trystero.
- **Docs & guide:** new [testing/TESTING-16-SLICE8C.md](../testing/TESTING-16-SLICE8C.md) linked from [testing/README.md](../testing/README.md) (cut on host warp, free warp/dock, Go home, what you still won't see — enemies/bullets still host-only). Updated module READMEs and [ARCHITECTURE.md](ARCHITECTURE.md).
- **Tests:** `tests/docs.test.mjs` still green (HANDOFF 16-KB, ROADMAP 35-KB limits); `tests/multiplayer-connection.test.mjs` updated for the two new kinds; `npm test` green; `npm run build` 3604 KB.

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-25: Playtest 25 — one pointer at a time, and a lead pip for anything you can lock
- 2026-11-25: Playtest 24 — a repaired pilot comes back repaired, the visitor's hull stops blurring, and the chat can be copied
- 2026-11-25: Step 16 slice 8b — the guest's controls reach its ship
- 2026-11-25: Step 16 slice 8a PLAYTEST-CONFIRMED
- 2026-11-25: Playtest 23 follow-up — the Ship filter shows every ship, the guest included
- 2026-11-25: Playtest 23, second round — the browser that was locked out, and a friend's hull that was only a picture
- 2026-11-25: Playtest 23 — a friend can be selected, and a pilot can always come back
- 2026-11-25: Step 16 slice 8a — the second hull, and the snapshots under it
- 2026-11-24: Trading: both confirms clear, and offers come from the hold or the station
- 2026-11-24: Slice 7 playtest passed
- 2026-11-24: Slice 7 fix — the visitor is named on the galaxy chart, and the panel row leads
- 2026-11-24: A visiting pilot's place is fixed at arrival (asked and recorded)
- 2026-11-24: Slice 6's trading design, from the owner
- 2026-11-24: Slice 4 playtest passed
- 2026-11-24: Step 16 slice 8 — the owner's client-prediction brief, recorded
- 2026-11-24: Step 16 slice 7 — the visiting pilot is on the map
- 2026-11-24: Playtest 22 — two friends on one link, and no player cap
- 2026-11-24: Playtest 21 — the chat box, four small things
- 2026-11-24: Playtest 21 — Bring my pilot puts you in the world, and the world says which one
- 2026-11-24: Playtest 20 (second round) — the latest pilot always comes home
- 2026-11-24: Playtest 20 — the chat goes away, and Open World always asks about the pilot
- 2026-11-24: Step 16 slice 5 — a lost host, the copy kept current, and one window per pilot
- 2026-11-23: One refusal, one place, and a placeholder that says what it wants
- 2026-11-23: The away card is a question about custody, not the title screen
- 2026-11-23: The switch says why, and the away card is a proper card
- 2026-11-23: The multiplayer switch could not be pressed by a visitor
- 2026-11-23: The join box holds the choice — and the card gets a door
- 2026-11-23: Joining entered the world and left the pilot behind
- 2026-11-23: The away card was a trap — Bring pilot home never worked
- 2026-11-23: Test Ship faced sideways — the model brings its own rotation
- 2026-11-23: Where a joining pilot lands, and where it comes home to
- 2026-11-23: Playtest 14 — leaving a world, the title's away card, and a new Test Ship
- 2026-11-22: HANDOFF's size limit raised 14 KB -> 16 KB
- 2026-11-22: Step 16 slice 4 — the pilot crosses the wire, and comes home
- 2026-11-22: Step 16 is eight slices — the owner agreed the plan
- 2026-11-22: Slice 3 confirmed by the owner; "one world, two ships visible" planned as slices 7 and 8
- 2026-11-22: Step 17's open questions answered — Minecraft-style servers, anyone hosts, optional Supabase auth
- 2026-11-22: Playtest 13 of slice 3 — a relay server that cannot be left unsaved
- 2026-11-22: The multiplayer screen, refined — labels inside boxes, no redundant rows
- 2026-11-22: The multiplayer screen is trimmed to a simple box

- 2026-11-22: Step 17 revised — slices 17a–17d, and the server's open questions

- 2026-11-22: The game would not start — a missing template helper, a gate on the wrong action, and the tests that caught them

- 2026-11-22: Refactor step 17 added to the plan — dedicated servers

- 2026-11-22: Playtest 12 of slice 3 — a relay server the player actually has (ExpressTURN)

- 2026-11-22: Playtest 11 of slice 3 — the free relay servers are dead, and a guest can finally see why

- 2026-11-22: Playtest 10 of slice 3 — the free relay servers are the suspect, so test them and allow your own

- 2026-11-22: Playtest 7 of slice 3 — the relay route taken off its pedestal, and no multiplayer in the campaign

- 2026-11-22: Playtest 9 of slice 3 — a code that can cross networks (the 4G case)

- 2026-11-22: Playtest 8 of slice 3 — the codes connected, and opening your own world now leaves a visit

- 2026-11-22: Multiplayer UI & session fixes (connection gate, progress bar, host/guest leave)

- 2026-11-22: The game carries its own relay — one-link join works across networks

- 2026-11-22: Playtest 6 of slice 3 — the *five random relays* were the problem, and Esc

- 2026-11-21: Roll cut by 25% (sickening at full speed)

- 2026-11-21: Mission destinations glow on the starmap; ambushers stay "Unmarked" until they attack

- 2026-11-21: NPCs bank to turn; Dane barrel-rolls the chase course

- 2026-11-21: Roll easing, cross-pocket waypoints removed, beacon named, panel-wide outfitting drops

- 2026-11-21: Roll rate restored (easing kept); click-to-place works anywhere on the Outfitting panel

- 2026-11-21: Step 16 slice 1 — the pilot's suitcase (custody, no networking)

- 2026-11-21: Step 16 slice 2 — save v29: the `away` marker, `world.guests`, and the two suitcase keys

- 2026-11-21: Step 16 slice 3 planned — one-link join, and the library question put to the owner

- 2026-11-21: Step 16 — Trystero chosen for the connection (owner decision)

- 2026-11-21: Playtest 5 of slice 3 — the report that says which failure it is

- 2026-11-21: Playtest 4 of slice 3 — the path between two machines, and a relay for when it fails

- 2026-11-21: Playtest 3 of slice 3 — a hello that is answered, a click that is not eaten

- 2026-11-21: Playtest 2 of slice 3 — one door each, names with stars, a chat that stays open

- 2026-11-21: Step 16 slice 3 repaired — the multiplayer screen, the join path and the hello

- 2026-11-21: Step 16 slice 3 — the connection: one link, the wrapper, chat and the player list

- 2026-11-21: One flight model for every ship, slower turns, First Sortie and navigation polish (save v28)

- 2026-11-20: Playtest round 4: missiles taught, ambush standoff, objective highlights everywhere

- 2026-11-20: Playtest round 3: Dane's guns, the hold bar, the dialogue in one doc

- 2026-11-20: Playtest round 2: objectives back top-right, run form-up, quieter menu

- 2026-11-20: Playtest fixes: friendly fire, one-second lessons, chapter boxes, ambush reveal

- 2026-11-20: Campaign slices: acts, boundaries, dialogue pacing, failure/bonus framework, Dane, First Sortie

- 2026-11-19: Step 15 — campaign scaffolding, dual-mode saves and the Dane Korr tutorial

- 2026-11-19: One HUD label per nearby belt group

- 2026-11-19: Shared natural wormhole environments

- 2026-11-19: Larger, more common black holes in wormhole systems

- 2026-11-19: Multiple wormhole routes and grey system skies

- 2026-11-19: Start with 30 wormhole systems

- 2026-11-19: Step 14d — persistent wormhole systems

- 2026-11-19: Uncharted Space HUD label and 14d exit decision

- 2026-11-18: Station UI rework, reusable left window, Inventory ship list and My Assets destination

- 2026-11-18: Roadmap slice 3 — My Assets, Minecraft-style inventory slots, Mining beams subgroup and 0 MJ power fix

- 2026-11-18: Roadmap slice 2 — compact Shop, Hangar stored-ship list & context menu, Ship details/bonuses and unblurred cargo overlays

- 2026-11-18: Roadmap slice 1 — true moving-collider speed, live Mission log item counts and 10-minute per-station contract timers

- 2026-11-18: Nebula fill 0.175, unified label/lock colours and N-tab lock-square icons

- 2026-11-18: Ore asteroids use natural shaded surface colours with no self-glow

- 2026-11-18: Fix N panel closing, selected-row outline, row separators and HUD transparency

- 2026-11-16: Compact selectable pocket list and aligned lower HUD

- 2026-11-16: Repair N action, stabilise lead and align status bottoms

- 2026-11-16: Batch slice 2 — navigation, lead and actual speed

- 2026-11-16: Missile icon and lower interaction prompts

- 2026-11-16: Remove duplicate weapon-selection messages

- 2026-11-16: Signed throttle and final HUD alignment tweaks

- 2026-11-16: Framed status columns and integrated throttle/speed

- 2026-11-16: Square weapon boxes and slot-height divider

- 2026-11-16: Monochrome weapon strip and top-left location

- 2026-11-16: Compact weapon strip between the HUD columns

- 2026-11-16: Paid boost ignition and ten-slot weapon hotbar

- 2026-11-16: HUD pool units

- 2026-11-16: Tight HUD readings, pool percentages and throttle fill

- 2026-11-16: Mirrored vertical HUD pairs

- 2026-11-16: Feature batch 2 slice 1 — compact flight meters and toggle camera

- 2026-11-16: Nebula fill intensity increased 25%

- 2026-11-16: Subtle sky-tinted ambient fill trial

- 2026-11-16: Exact F picking for all objects; stationary outfitting preview

- 2026-11-16: Part 2 restored, precise asteroid selection and recovery/UI follow-ups

- 2026-11-16: Feature batch Part 1 — targeting and missile UI (items 4–7)

- 2026-11-16: Individual fighter pilots and per-enemy AI personalities

- 2026-11-16: Wider 4 km belts, restored Meridian, quieter planets and circular sky markers

- 2026-11-16: Flatter, lighter belts with naturally thinning edges

- 2026-11-16: C-shaped belts, central arrivals and non-intersecting asteroids

- 2026-11-16: Denser pockets, close warp-ins and massive asteroids

- 2026-11-16: The generated universe rework — vast EVE-like pockets, seeded planets, dedicated belts, four station classes

- 2026-11-21: Yaw is the slow axis, roll the fast one — per-ship axis tuning

- 2026-11-16: The edge-compression lens is removed

- 2026-11-16: The frame edges are gently stretched — the edge-compression lens (owner's panel 2)

- 2026-11-16: The system sky passed its playtest

- 2026-11-16: System space — AUs, a true 3D position for every pocket, and a sky that shows the system you're in

- 2026-11-15: Hitting the station hurts again — solid means collision damage, by default

- 2026-11-15: Big moving parts are solid, and a wormhole pocket is really there after a reload

- 2026-11-15: Every weapon stops on a collider — shots no longer pass through the station

- 2026-11-15: The skies are cube maps — six 2048 faces each, no distortion and no seams

- 2026-11-15: Every sky is a generated skybox now — normal space, rifts and wormholes, and the starfield is gone

- 2026-11-15: Kept for later — a black-and-teal sky, installed but worn by no place yet

- 2026-11-15: The Test Ship — a 1-credit hull with 100× Hull HP and 10× damage, flown with the owner's GLB

- 2026-11-14: Three owner-reported bugs — the Alt camera locks to the hull, one primary fires at a time, no tags over the menu

- 2026-11-14: The rift wears real space too — the deep rift its own sky

- 2026-11-15: A skybox generator, so every new instance can have a dark, realistic 4K sky

- 2026-11-14: Models and collision are real models now — drop-in `.glb` files, hulls flush with the drawing

- 2026-11-14: Two owner bugs, part two — the Sell/Discard confirm sits with the cursor, and hunt contracts clear the area they were taken in

- 2026-11-14: Real space inside a simple wormhole — the pocket wears the system's sky

- 2026-11-14: Slice 14c built — simple wormholes spawn themselves, and save v21

- 2026-11-14: The sky loses its lines, and opening a loot card leaves the ship still

- 2026-11-14: Rift revisions after the playtest — the cache is a trade, every run is 20 minutes, and the sky has no stars

- 2026-11-14: Step 14 owner playtest — four bugs, four fixes (the run you quit is the run you come back to)

- 2026-11-14: Enemies are solid — rams damage both ships, rocks kill hostiles, and one falsy detour is fixed

- 2026-11-14: Step 14a feedback built — a rift you can see, lock and open — and slice 14b, a run that survives a quit

- 2026-11-14: Step 14a built — a rift you carry, an instance you fly into, and a cache that stays locked

- 2026-11-14: Step 14 groundwork — instance templates as data, and the owner's wormhole model recorded

- 2026-11-14: VISION records the owner's step 14 rift decisions; open question 5 is closed

- 2026-11-14: The owner confirmed the pending mission playtests; nothing is waiting now

- 2026-11-13: A recovery contract recovers its own crates, and the space is left clean

- 2026-11-13: Contract guidance says where the cargo goes, not how much is aboard

- 2026-11-13: Notices hang just below the flight message line

- 2026-11-13: Right-click Discard everywhere — how many, then "are you sure?"

- 2026-11-13: Press I in space to read the ship's inventory, and the chart no longer stops the clock

- 2026-11-13: Your missions follow you; only the offers and the hand-in stay at a station

- 2026-11-13: No message line that moves the menu, and no "filed at another station" note

- 2026-11-13: A story mission is offered at one station, and only there

- 2026-11-13: Missions belong to the station that filed them, and the docked panel redraws itself

- 2026-11-13: Overlays everywhere in the open world, a quiet exit to the menu, and a cinematic title view

- 2026-11-13: Every mission and contract is handed in at one named station

- 2026-11-13: Dying hands you a complete spare Wasp that can be fitted again

- 2026-11-13: A mission is accomplished by its hand-in, not by its last step; contract wording and colours

- 2026-11-13: Dying no longer fails missions by default; "Mission failed" notice in the HUD

- 2026-11-13: Docs consistency pass for multi-AI handoffs, changelog capped at 10 entries

- 2026-11-13: Docs restructure, LESSONS.md, docs check test, duplicate-mission guard

- 2026-11-13: Step 13d: mission rules, linter, templates and invariant tests

- 2026-11-10: Name the Border Signal object and consume story hand-ins

- 2026-11-10: Make Border Signal's beacon a persistent physical drop

- 2026-11-10: Make Border Signal handoffs resource-safe

- 2026-11-10: Clean up abandoned mission content and gate dialogue

- 2026-11-10: Remove unexplained mission progress counters

- 2026-11-10: Keep mission objectives spoiler-safe

- 2026-11-10: Show player-facing mission objectives in the flight HUD

- 2026-11-10: Stabilize story mission completion and scripted hand-offs

- 2026-11-10: Add pause exit and split the main menu actions

- 2026-11-10: Advance Border Signal after its mission wave

- 2026-11-10: Build Step 13c mission screens

- 2026-11-10: Require mining ore hand-in before contract payout

- 2026-11-10: Restore Destroy contract progress readout

- 2026-11-10: Start Step 13b story mission runtime

- 2026-11-10: Simplify exact pocket route titles

- 2026-11-10: Require salvage delivery before paying recover contracts

- 2026-11-10: Show every active mission in the flight HUD

- 2026-11-10: Start Step 13 mission framework with data-driven contracts

- 2026-11-10: Simplify map markers and current-location labels

- 2026-11-10: Refine destination marker rings and icon scale

- 2026-11-10: Mark destination completion and remove HUD route scrolling

- 2026-11-10: Add route markers and instant galaxy selection

- 2026-11-10: Clarify pocket menus, labels and exact route destinations

- 2026-11-10: Make local route lines solid and pocket menus right-click-only

- 2026-11-10: Preserve real double-click navigation on starmap dots

- 2026-11-10: Vary station names and clarify routed gate navigation

- 2026-11-10: Refine system-map exits and separate generated station pockets

- 2026-11-10: Give every dockable station local persistent inventory

- 2026-11-10: Build Step 12 encounter templates and persistent place memory

- 2026-11-08: Wrap destination names and show local route hops

- 2026-11-08: Remember route destinations across relogs

- 2026-11-08: Remove destination diamond

- 2026-11-08: Mark the route destination and simplify the starmap list

- 2026-11-08: Add route arrows to the flight HUD

- 2026-11-08: Simplify the flight route to system names

- 2026-11-08: Set exact pocket destinations

- 2026-11-08: Clearer, sparser starmap and adaptive route list

- 2026-11-08: Straight starmap lines with attached endpoints

- 2026-11-08: Show the active route in flight

- 2026-11-08: Group route pockets by system and mark the current area

- 2026-11-08: Compact flight route with journey progress

- 2026-11-08: Step 11B starmap UI follow-up — zoomed system maps, right-click warp, compact overview (owner playtest pending)

- 2026-11-08: Plot system destinations and jump the route with J

- 2026-11-08: Remember starmap view across closing and travel

- 2026-11-08: Align newly fired cannon visuals with the interpolated hull

- 2026-11-08: Tame galaxy chart drag speed

- 2026-11-08: Step 11B starmap refinements — permanent core labels, zoom-scaled pan/cores, clickable gate neighbours (owner playtest pending)

- 2026-11-08: Step 11B system-map follow-up — free local warp and named central bodies (owner playtest pending)

- 2026-11-08: Step 11B — clickable starmap, direct-hop travel and save v16 (owner playtest pending)

- 2026-11-08: Step 11A owner playtest passed — full project backup

- 2026-11-08: Step 11A owner playtest guide and live browser preview

- 2026-11-08: Step 11A — organic starmap web, one-peer gates and editable travel rules

- 2026-11-08: Autosave every 30 seconds instead of 15

- 2026-11-08: Come back where you logged out — save v15

- 2026-11-08: Step 10 complete and ticked — owner playtest passed

- 2026-11-08: Step 10 playtest fixes — sound, start screen and loading a save

- 2026-11-08: Step 10 built — place definitions (systems and pockets), save v14

- 2026-11-08: Fix high-refresh (240 Hz) ship blur via between-tick render interpolation

- 2026-11-08: Step 9 complete and ticked — Milestone B reached

- 2026-11-08: Step 8 ticked; step 9 split saves (v13) and per-pilot rules — playtest pending

- 2026-11-08: Step 8c owner playtest passed

- 2026-11-08: Step 8c scoped implementation complete — playtest pending

- 2026-11-08: Step 8c in progress — explicit flight, shields and damage

- 2026-11-08: Step 8c started — player-specific transforms and launches

- 2026-11-08: Step 8b complete and ticked

- 2026-11-08: Step 8a ticked; step 8b player records and controls

- 2026-11-08: Step 8 slices documented

- 2026-11-08: Step 8a — fixed simulation tick (playtest pending)

- 2026-11-08: Step 7d complete and ticked

- 2026-11-08: Step 7d — entity view registry cleanup

- 2026-11-08: Step 7c and step 7 complete and ticked

- 2026-11-08: Refactor step 7c — hull view and render-free simulation

- 2026-11-08: Step 7b complete and closed (docs only, no code change)

- 2026-11-08: Refactor step 7b — bullets, missiles, crates and particles become data

- 2026-11-08: Step 7a ticked (docs only, no code change)

- 2026-11-08: Refactor step 7a — a hostile becomes data; the mesh becomes a view

- 2026-11-08: Step 6 ticked in full (docs only, no code change)

- 2026-11-08: Refactor step 6b — the sim stops reading the keyboard (step 6 done)

- 2026-11-08: Refactor step 6a — the sim stops playing sounds itself

- 2026-11-07: Recorded what is and is not per-shop about shops (docs only)

- 2026-11-07: Spare modules can be sold (60% of the shop price)

- 2026-11-07: Shop fix — the cannons are listed once, as "Basic cannons"

- 2026-11-07: Refactor step 5 — shops and prices from data (plus a visible Shop change)

- 2026-11-07: Refactor step 4 — the item catalogue and one inventory per place (save v12)

- 2026-11-07: Refactor step 3 — loot tables (drops and ore mix are data)

- 2026-11-07: Refactor step 2 — seeded randomness everywhere

- 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)

- 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)

- 2026-11-07: Inventory Sell quantity uses a game-styled popover

- 2026-11-07: Inventory Sell asks how many units to sell

- 2026-11-07: Inventory grids use five narrower, shorter slots per row

- 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text

- 2026-11-07: Station and ship item grids scroll independently after three rows

- 2026-11-07: Right-click inventory menu can sell a cargo stack

- 2026-11-07: Inventory tile text restored to the more readable size

- 2026-11-07: Inventory item tiles tightened to reduce empty space

- 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click

- 2026-11-07: Inventory contents displayed as a compact grid

- 2026-11-07: Lateral, vertical and reverse thrust increased to 60%

- 2026-11-07: Boost works from any throttle and press snaps throttle to full forward

- 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)

- 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)

- 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module

- 2026-11-06: Handoff note brought up to date (docs only)

- 2026-11-06: Repairs and missile restock moved into Outfitting

- 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone

- 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars

- 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere

- 2026-11-06: Asteroid collision damage scaled to the 10-point hull

- 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none

- 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate

- 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³

- 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime

- 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI

- 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact

- 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too

- 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"

- 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message

- 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)

- 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)

- 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull

- 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back

- 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there

- 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging

- 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot

- 2026-11-06: Shields are a module now; pirate cannons do 10 a shot

- 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free

- 2026-11-06: Thrusters use power, and a dry cell winds the speed down

- 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls

- 2026-11-06: No thrusters means no movement, no turning and no boost

- 2026-11-06: Paint bays are clickable, and show an empty colour store

- 2026-11-06: Fix: the Appearance bays lost their boxes

- 2026-11-06: Basic thrusters, and every hull flies like the Wasp

- 2026-11-06: Click a bay to fit a module, or unequip one into storage

- 2026-11-06: Basic powerplant and power cell, with a power bar in flight

- 2026-11-06: Powerplant talks in MJ/s, not MW

- 2026-11-06: Appearance card under the Hull bay

- 2026-11-06: Outfitting screen with a 3D ship viewer

- 2026-11-05: The chase camera stops running away at speed

- 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters

- 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it

- 2026-11-05: Fix: no rotation when warping

- 2026-11-05: Warp animation, warp sound, and a two-second warp

- 2026-11-05: Second sector, warp on M

- 2026-11-05: Project tidy for growth (no gameplay change)

- 2026-11-05: Pause menu and mute

- 0.2.0: Baseline
