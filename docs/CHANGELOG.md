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

## 2026-11-25: Step 16 slice 8a — the second hull, and the snapshots under it

**Code change; rebuild needed; build `2026-11-25a`.** Save version unchanged (**29**) — nothing new
is saved: a ship snapshot is runtime only and is thrown away with the session.

The owner asked for *"one world, two ships visible"*. Slice 7 made the visitor a name on the map;
this slice draws it. Two halves, and the first one needs no wire at all:

- **The host sees its visiting pilot.** `render/views.js` draws every **non-local record in
  `state.players`** as a hull (`updateOtherPilotViews`, `otherPilotViewCount`), interpolated with the
  same `renderPlayerPose` the local ship uses, so a visitor appears the moment it arrives. A docked
  visitor is drawn **parked at the launch point its arrival put it on** — a visitor cannot fly in
  this world until 8b, and a hull hidden until then would be no hull at all. Only pilots in the
  **pocket being drawn** get a mesh; a dead pilot draws nothing.
- **The wire underneath it** (host → guest, one direction): a new `ships` message kind in
  `net/protocol.js`, carrying `SHIP_FIELDS` for every pilot — id, name, hull, place, position,
  rotation, velocity, throttle, docked, dead, hull fraction. `src/data/multiplayer.js` gains
  `SHIP_FIELDS`, `HOST_PILOT_ID` and **`SHIP_STREAM`**: `hz: 24` (**the owner's 20–30 Hz band; this
  is a NEW value — `NET.snapshotSec` stays the 2 s *profile/suitcase* sync and means something
  else**), `delayMs: 100`, `samples: 6`, `staleMs: 1500`, `snapM: 50`. The message is cleaned on the
  way out **and** in like every other kind, and capped at `LIMITS.ships` (24) pilots per packet;
  `session.js` sends several packets rather than dropping pilots, because there is no player cap.
- **The guest draws it and simulates nothing.** `net/session.js` emits `mp-ships` (minus the guest's
  own entry, which its own screen already draws); **`render/shipstream.js`** (new) keeps the last few
  snapshots per pilot and gives the renderer a pose **100 ms in the past**, interpolated between the
  two snapshots that straddle that moment, **held — never extrapolated** — past the newest, and drawn
  as a step when the jump is over `snapM` or the pilot changed pocket. A pilot unheard for `staleMs`
  is dropped, so a friend who left, a host that stopped sending and a dead channel all empty the sky.
- **`net/ships.js`** (new) is the host's side of the picture: `shipEntry`/`shipEntries` turn live
  records into exactly `SHIP_FIELDS`, as plain arrays and numbers. `session.js` never reads the
  simulation: it asks on the bus (`mp-ships-request`) and `main.js` answers, the same seam the
  suitcase uses. `net/` stays out of `sim/`, and `sim/` still never imports `net/`.

**What a guest will not see yet, and should not be reported:** its own screen still shows its own
galaxy (8c), so a friend's hull appears only if both are in the same pocket; a friend's hull does not
move (controls are 8b); there is no name over a hull and a friend cannot be locked or shot at.

Files: `src/data/multiplayer.js`, `src/net/ships.js` (new), `src/net/protocol.js`,
`src/net/session.js`, `src/render/shipstream.js` (new), `src/render/views.js`, `src/main.js`,
`src/util/events.js`, plus the READMEs of `data/`, `net/` and `render/`. Docs: `HANDOFF.md`,
`ROADMAP.md`, `architecture/multiplayer.md` (three sections moved word for word to
`docs/archive/` to stay under its size limit), `testing/TESTING-16-SLICE8A.md` (new) and
`testing/README.md`. Tests: **`tests/multiplayer-slice8a.test.mjs`** (19 new: the field list, the
protocol cap, the two sessions, interpolation/hold/stale, and the hulls drawn on both sides), and the
pinned `KINDS` list in `tests/multiplayer-connection.test.mjs` now names `ships`.

## 2026-11-24: A visiting pilot's place is fixed at arrival (asked and recorded)

**Docs only; no rebuild needed.** Save version unchanged (29). Build stays `2026-11-24h`.

The owner asked whether the visiting pilot's name on the map should follow the friend when it moves
pockets or systems. It cannot yet, and that is expected:

- in the host's world the visitor is a **docked record created at arrival** (`sim/multiplayer.js`
  `arriveGuest`, `place = bundle.homeStation`), and nothing writes its `place` afterwards;
- no controls or position are sent yet (8a/8b), and the guest's own screen is its own galaxy (8c), so
  a guest's travel never reaches the host.

`world-and-map.md` and `testing/TESTING-16-SLICE7.md` now say so. After slice 8 the blip follows by
itself: it reads the record's `place` on every repaint, and a moving pilot emits `place-changed`.

## 2026-11-24: Slice 7 playtest passed

**No code change; no rebuild needed.** Save version unchanged (29). The build stays `2026-11-24h` —
the galaxy-chart fix is what made it work.

The owner: *"Works."* Slice 7 — a visiting pilot named on the **galaxy chart**, under its **pocket**
on the system map, and in a **Visiting pilots** row at the top of the panel — is
**PLAYTEST-CONFIRMED** in [ROADMAP.md](ROADMAP.md), [HANDOFF.md](HANDOFF.md),
[REFACTOR_PLAN.md](REFACTOR_PLAN.md) and [architecture/multiplayer.md](architecture/multiplayer.md).

Step 16 now stands at slices **1–5 and 7 confirmed**. **Slice 8** (host-authoritative snapshots, the
guest's own-ship prediction, the second screen) is next; slice 6 (trading, design in
[architecture/trading.md](architecture/trading.md)) is last.

## 2026-11-24: Slice 7 fix — the visitor is named on the galaxy chart, and the panel row leads

**Code change; rebuild needed; build `2026-11-24h`.** Save version unchanged (29); no new wire message.

The owner's report: *"Slice 7 doesnt seem to have worked. See no viewing of a player in map as the
host."* The record and the drawing were right — the map's panel row updated the moment a pilot
arrived — but the feature was where nobody looks: the map opens on the **galaxy** chart, where slice 7
drew nothing, and the panel row sat *under* the pocket list, below the fold.

- **The galaxy chart draws the visitor now.** `galaxyMarkup` takes `systemPilots`; a system with a
  visiting pilot is named even at labels-off and carries an amber `· Acey` row under its name, so
  "where is my friend?" is answered on the view the map opens on.
- **The Visiting pilots row leads the panel** — under the heading, above *Current pocket*, with an
  amber rule, instead of after the pocket rows and route details.
- **Two tests added** (`tests/multiplayer-slice7.test.mjs`, now 10): the galaxy row renders from the
  one visitor list, and the panel row is placed before the pocket list in the renderer.
- **The guide says why a map can be empty** (`testing/TESTING-16-SLICE7.md`): no pilot crosses unless
  the guest presses **Bring my pilot**, the guest lands at *its own* home station, and both windows
  must be build `2026-11-24h`.

`ui/starmap.js`, `src/styles.css`, `src/data/multiplayer.js` (BUILD), `tests/multiplayer-slice7.test.mjs`,
the slice-7 guide, `world-and-map.md`, `architecture/multiplayer.md`, `src/ui/README.md`.

## 2026-11-24: Trading: both confirms clear, and offers come from the hold or the station

**Docs only; no rebuild needed.** Save version unchanged (29). No code moved.

Two owner answers settle the details [architecture/trading.md](architecture/trading.md) had left open:

- **Any edit clears both confirms** (owner, 2026-11-24) — not only the editor's. That is the only
  rule that stops a pilot changing its offer after the other side has agreed; credits follow the
  same rule.
- **A trade half takes any items in station as well as the ship's hold.** Each offered stack
  remembers which container it came from, and a cancelled offer goes back there. Receiving is
  unchanged: the station for the host, the lockers of the visiting record for a guest, so goods
  come home.

## 2026-11-24: Slice 6's trading design, from the owner

**Docs only; no rebuild needed.** Save version unchanged (29). Trading is still **last** (7 → 8 → 6).

The owner described the trade system in two rounds of answers. It is recorded in
[architecture/trading.md](architecture/trading.md) and summarised in slice 6 of
[REFACTOR_PLAN.md](REFACTOR_PLAN.md) and [architecture/multiplayer.md](architecture/multiplayer.md).

- **Where:** a new **Trade** station tab beside Base/Saves lists the pilots docked at this station —
  your own row included, with no button on it. Another pilot's **Trade** opens the window in the
  left-hand panel **on both screens at once**. Close button top right; **undocking cancels**;
  stations only.
- **Halves:** theirs left, yours right, inventory-style grids — items and **ships** (a ship carries
  its fit and cargo; **the ship you are piloting cannot be offered**), plus an **Add credits** button.
- **Confirms:** one per half; with both confirmed the **host** swaps everything atomically and **only
  if the receiving station storage and hangar have room** — otherwise nothing moves at all.
- **Anti-scam:** an edit after a confirm clears the confirmation; the same rule covers credits. One
  detail is left open (whose confirm clears — the safe rule, **both**, is written as intended).
- **Custody:** a guest's received items must go into the lockers of its visiting record, not the
  host's station stores, or the goods would never come home (`net/custody.js` `checkOut`/`checkIn`).
- **Prerequisite:** a real docked presence — `net/session.js` still admits guests with
  `docked: false`; slice 6 begins by reporting where a pilot is docked.

## 2026-11-24: Slice 4 playtest passed

**No code change; no rebuild needed.** Save version unchanged (29).

The owner played `testing/TESTING-16-SLICE4.md` and said it passed (2026-11-24): **Bring my pilot**
sends the pilot, the two-second profile sync keeps the host's copy current, and **Bring pilot home**
takes it back. Slice 4 is now **PLAYTEST-CONFIRMED** in [ROADMAP.md](ROADMAP.md),
[HANDOFF.md](HANDOFF.md), [REFACTOR_PLAN.md](REFACTOR_PLAN.md) and
[architecture/multiplayer.md](architecture/multiplayer.md).

That leaves **slice 7 built, awaiting the owner's playtest** (`testing/TESTING-16-SLICE7.md`), then
slice 8 (snapshots, prediction, the second screen) and slice 6 (trading) last.

## 2026-11-24: Step 16 slice 8 — the owner's client-prediction brief, recorded

**Docs only; no rebuild needed.** Save version unchanged (29). No code moved in this change.

The owner wants a measured amount of **client prediction**: a guest predicts **its own ship**, and
everything remote is **interpolated, never predicted**. The brief is now
[architecture/client-prediction.md](architecture/client-prediction.md), linked from the plan (8a's
snapshot rate and a new 8d), [architecture/multiplayer.md](architecture/multiplayer.md),
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

- **Predict only the guest's own ship:** run `flight()` locally every 60 Hz tick on its own
  controls, tag inputs with a tick, take the host's `ack` (the whole predicted state plus the last
  tick), rewind and replay unconfirmed inputs. Rotation is not corrected unless it diverges;
  position and velocity error blend over ~100 ms; snap only after a warp or a respawn. The stick is
  a held position (−1…1), so inputs go unordered and unreliable with a little redundancy.
- **Never predicted:** damage, kills, loot, enemies, missiles, mining, inventory, docking and warp —
  shown only when the host confirms. Remotes are drawn ~100 ms in the past from 20–30 Hz snapshots,
  using the existing `simClock.alpha()` render interpolation.
- **Aim:** each guest sends its own aim direction; `sim/weapons.js` already falls back to
  `P.aimDirection` for a non-local record.
- **Lag compensation is deferred:** enemies are slow and the pilot's bullets are 900 m/s, so a
  ~150 ms view is ~5–19 m of error. Playtest first; only then 250 ms of host-side enemy history.
- **One claimed bug checked and not found:** the asteroid loop in `sim/player.js` uses `a`, and
  `hurt()` is called with no profile, so there is no shadowed `r` in this tree (2026-11-24). Nothing
  was renamed.
- **Order:** host-authoritative snapshots with interpolation, then own-ship prediction, then the
  cosmetic muzzle effects, then (only if playtests demand it) lag compensation.

## 2026-11-24: Step 16 slice 7 — the visiting pilot is on the map

**Code change; rebuild needed; build `2026-11-24g`.** Save version unchanged (29) — nothing new is
saved, so every older save loads exactly as before.

Slice 4 already made a guest a **real, docked, simulated record** in the host's world; there was no
way to *see* it. This slice is the seeing, while the hull in space waits for slice 8.

- **The visitor is a name under its pocket.** `src/ui/starmap.js` `pilotBlips` reads `state.players`
  (the record `sim/multiplayer.js` fills on arrival) and `systemMarkup` draws each visitor as an amber
  `sm-pilot-blip` row under the pocket it is standing in on the **system (pocket) map** — `· Acey`
  below `Meridian Station`. Two visitors at one station stack in a stable name order, and a pilot the
  chart cannot place (a rift, an unlisted pocket) is skipped rather than guessed.
- **The panel says it too, and says where.** `pilotPanelMarkup` adds a **Visiting pilots** row to the
  side panel — `Acey · Meridian Station (Meridian System)` — naming **every** visitor and the system
  it is in, whichever system is selected. That is deliberate: a visitor arrives at *its own* home
  station, which may be in another system, and a map with no blip must not look like a visit that
  never happened. The map and the panel read the one record; neither is a copy.
- **Content is data:** the row height is `GALAXY.systemMap.pilotBlipGap` in `src/data/galaxy.js`; the
  look is three rules in `src/styles.css`. `BUILD` is `2026-11-24g`.
- **Tests:** `tests/multiplayer-slice7.test.mjs` (9 tests): the blip is the visitor's own place and
  name, the host's pilot is never a blip, the system map's own markup carries it, a visitor in another
  system is not on this chart but is still named in the panel, two visitors stack, going home removes
  the row, an arriving or leaving pilot repaints an open map, and the blip is styled.
- **The order of the remaining work changed** (owner, 2026-11-24): trading moves to **last**, because
  it needs both players to see the same station. The slices keep their **names**, not a schedule:
  **7 (this) → 8 → 6 (trading)**. `REFACTOR_PLAN.md`, `ROADMAP.md`, `HANDOFF.md` and
  `architecture/multiplayer.md` say so; renumbering was rejected because the archive is word-for-word
  and dozens of guides and UI strings say "slice 7".

**Still not there, by design:** no hull is drawn in space (slice 8), and a guest's screen does not show
the host's world (8), so a guest sees no blip of its own — it is the only pilot in the world its screen
draws. Playtest guide: [../testing/TESTING-16-SLICE7.md](../testing/TESTING-16-SLICE7.md).

## 2026-11-24: Playtest 22 — two friends on one link, and no player cap

**Code change; rebuild needed; build `2026-11-24f`.** Save version unchanged (29) — the new value lives in
the browser's own settings, not in a save.

The owner, with two browsers open: *"When a second guest player joins, first guest is kicked out and this
error message comes on if first guest tries to join again with 'That link has already been used, or it was
copied wrongly'."* Plus a list of small things about the chat's right-hand column, which playtest 21 had
already started.

- **The kick-out was identity, not capacity.** A join link carries **one** secret per world
  (`?join=<worldId>#<token>`), and the guest was using that secret **as its own**: `guestId` was
  `guest-<first 8 characters of the link token>`, and its hello carried the same token. Two friends on one
  link therefore arrived as the *same pilot*, and the host's one-window-per-pilot rule (correct, and kept)
  retired the first to make room — rewriting the record's token hash, which is why the retired browser was
  then told the link "has already been used". Its session was gone, so no welcome, so no chat: the second
  half of the report.
- **A guest is now its own browser.** `src/net/settings.js` keeps `pilotToken` beside the name in `tr_mp`
  (made once with `makeToken`, never shown, never in a save); `src/net/session.js` exposes it as
  `guestToken()`/`pilotToken()`, and both doors in (`joinWorld` from a link, `acceptCode` from a paste code)
  send it as the guest's identity. The invitation now only says *where* a pilot may go. LESSONS **L47**.
- **There is no player cap.** `NET.maxGuests` 4 → 100, documented for what it is: a valve against a runaway
  room, not a rule of the game. The limit is the host's machine and connection (owner: *"i want unlimited
  players"*). The players column stops at `CHAT.whoRows` (10) names and adds `+N more`, so a busy world
  cannot grow the HUD.
- **One-time note for an existing world:** a guest record written by `2026-11-24d` or earlier is keyed by the
  old link-derived id. That browser now arrives as a *new* guest, and the old record simply stays unused (a
  record is never deleted). Nothing breaks; the pilot's own copy is what it flies with.
- **The chat's right-hand column is quieter** (owner, playtest 22): **Pin shows only while the box is open
  for typing** — so an auto-opened chat, and a pinned box nobody is typing in, draw the lines and nothing
  else (`body:not(.mp-chat-open) #mp-chat-pin`, replacing playtest 21's narrower rule). The column is
  narrower (54 px, no 9 px indent), the gap between it and the lines came down 10 px → 6 px, and the names
  keep their 12 px and ellipsize. The word is still **Pin**, in the two colours playtest 21 gave it (L46).
  The twelve-second clock from `2026-11-24e` is unchanged, and your own sent line still counts.

Run `npm run build` and `npm test` (1045 tests). Playtest guide:
[../testing/TESTING-22-CHAT.md](../testing/TESTING-22-CHAT.md), quick version
[../testing/QUICK-22-CHAT.md](../testing/QUICK-22-CHAT.md).

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
