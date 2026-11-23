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

---

## 2026-11-23: Where a joining pilot lands, and where it comes home to

The owner asked how arrival and return choose a place, and what happens when a station exists in one
world and not the other. Answering it found **two holes** on the return path.

- **Arriving** (already right): a guest lands **docked at its own active ship's station** if the host's
  galaxy has that pocket, otherwise at **Meridian**. Flight positions never travel.
- **Coming home** (was wrong): a stack bought at a station **only the friend's world has** came home
  filed under that station's key in a galaxy with no such station — counted, saved and **unreachable for
  ever**; and a stack that waited at the friend's Meridian came home to Meridian instead of its **own**
  station, even though its `origin` was still recorded. `checkIn` now asks the home world's station index,
  prefers `origin`, and sends anything it cannot place to Meridian with its origin kept.
- Hulls already followed the right rule (`shipPlaces` asks the world; `shipsAt` remembers); only the
  station half was wrong.

**Files:** `src/net/custody.js` (`checkIn` via `stationsOfWorld`), `tests/multiplayer-carry.test.mjs`
(+2). **Tests: 1013** (was 1011). **Save format unchanged (v29).** LESSONS L37.

## 2026-11-23: Playtest 14 — leaving a world, the title's away card, and a new Test Ship

Four reports from the owner's playtest. Three were bugs; one was a model swap.

- **Leaving a world was invisible, and locked the pilot out.** A departing guest stayed in the host's
  players list, the chat said nothing, and its ship stayed. Worse, its record kept the OLD token hash —
  so the next join was a *returning* guest, refused for a token it no longer had. `forgetPeer(peerId)` is
  now the one rule: remove the row, say *"Bo left."*, drop the ship (`mp-guest-left`), republish presence,
  and mark the record `left`, which a fresh link re-admits. Separately, `upsertGuest` let a
  `welcome`/`presence` list (no peer id) **erase** a known one, so that guest could never be matched to
  the peer that left.
- **"Bring my pilot" appeared, then the world entered itself.** The join worked and `state.away` was set,
  but `afterJoined` entered the world anyway — flying a frozen pilot whose cargo was elsewhere. It stops
  and says so now.
- **The away card's buttons did nothing, and trapped the player.** From the title there is no loaded
  open-world save, so unpacking got a save with no profile; and `comeHome` opened with
  `if (!leaveVisit()) return false`, which from the title returns before anything is unpacked. Now
  `bringPilotHomeAtMenu()` unpacks the **stored** mode save, Rejoin rebuilds the link from the marker and
  really joins, and the card explains both buttons.
- **Test Ship draws the owner's `testship-v1.glb`** — drop-in (same generator, extensions, footprint),
  centred on y, stray `Page camera` node gone. `compressed-model` re-recorded per LESSONS L17.

**Also:** `world.guests[id].left` is an **additive** save field, so **no version bump** (v29 stays).
**Files:** `src/net/{session,custody,multiplayer}.js`, `src/{data/multiplayer,state/profile}.js`,
`src/ui/{menu,multiplayer,screens}.js`, `src/assets/models/ship.testship.glb`, and new
`tests/multiplayer-playtest14.test.mjs`. **Tests: 1013** (was 1004); each fix was verified by reverting
it. **Build id: `2026-11-23b`.**

## 2026-11-22: Step 16 slice 4 — the pilot crosses the wire, and comes home

The first slice where something of the player's actually travels. **"Bring my pilot"** packs the
pilot into a suitcase, the host receives it as a real docked ship, writes a newer copy back about
two seconds after anything changes, and **"Bring pilot home"** puts it back — with the host offline.

- **Joining is not travelling** (a deliberate decision, not an oversight): the plan quotes
  ""Bring my pilot"" as an action, so pressing **Join** only looks around a friend's world. A pilot
  is frozen at home only when the player asks for it.
- **Two new wire kinds.** `carry` (guest -> host) and `suitcase` (host -> guest, and the newer copy
  back), both `{ guestId, name, epoch, rev, bundle }`, capped at `NET.suitcaseMaxBytes` = 256 KB of
  JSON and **refused in words, never truncated**. `epoch`/`rev` travel *beside* the bundle so
  `compare()` never has to trust the contents. `cleanCarry` validates size and shape but **never
  strips content ids** (LESSONS L16): cargo the build does not know about still travels.
- **The host never holds the guest's secret** — only a `tokenHash` — and never trusts the bundle:
  it goes through `relocate()`, so a locker whose station this galaxy lacks waits at Meridian and
  remembers where it came from.
- **The frozen pilot's record is never captured from the runtime.** `captureActiveModeSave` now
  hands an away pilot's record through untouched, so an autosave or a mode cycle cannot fold live
  cargo into a record the suitcase already owns.
- **The title screen becomes a card** while the pilot is away — *"Your pilot is in Ada's world"* +
  **Rejoin** / **Bring pilot home** — driven by `mp-away-changed`. Open World refuses to start with
  a frozen pilot rather than flying one.

**Two real bugs found and fixed on the way (both were shipped by slice 1):**

1. **`custody.hostProfile` wiped every guest's hold.** It sanitized a bundle profile with no `v`,
   which the sanitizer reads as a pre-v12 save whose holds were `{ cargo, modules }` — so a visitor
   would arrive with its ship and credits and **an empty hold**. It now stamps `v` first, exactly as
   `applyTravellingProfile` always has. Regression test in `multiplayer-custody.test.mjs`.
2. **Coming home duplicated every station locker.** `checkOut` empties the home stations, but the
   session's narrow `save.write` only stored the guest list and world id — the emptying never
   reached the game. The suitcase then carried cargo the live save still held, and `checkIn` added
   it on top: **4 ferrite became 8.** A guest's own save is now installed through a new
   `saveKit.install` (the host's narrow `write` is untouched), and a test asserts both the fix and
   the failure it prevents (LESSONS L15).

**Files:** `src/data/multiplayer.js` (`suitcaseMaxBytes`, `suitcaseRepeatSec`, `BUILD = "2026-11-23a"`),
`src/net/{custody,protocol,session}.js`, **new** `src/sim/multiplayer.js`, `src/util/events.js`,
`src/state/{state,profile}.js`, `src/main.js`, `src/ui/{screens,menu,multiplayer}.js`,
`src/sim/README.md`. **New tests:** `multiplayer-carry`, `multiplayer-visitors`,
`multiplayer-bring-pilot` (28 new).

**A stronger third fix, found while proving the tests bite.** Reverting each fix and re-running showed two of the new tests
passed anyway — they asserted only what the narrow seam happened to carry. The guest kit in the session test now models the
real narrow `write`, and every guest-side store (packing *and* taking a newer suitcase from the host) goes through one
`storePilot` rule. Undoing any of the three fixes now fails a test.

**Tests: 1004, all green** (was 976). **Save format unchanged (v29).** **Build id: `2026-11-23a`.**
**Not done yet, by design:** the guest's own screen showing the host's world (slice 8), crashes and
reconnects (slice 5), and drawing a visiting ship on the host's screen — the pilot is real, docked
and simulated, but `render/views.js` still draws one hull. That is slice 7/8. Playtest guide:
`testing/TESTING-16-SLICE4.md`.

## 2026-11-22: HANDOFF's size limit raised 14 KB -> 16 KB

**Docs/test only; no code, no build, no save change.** `HANDOFF.md` is rewritten (not appended) at
the end of every chat, and it had reached 7 bytes under its cap — leaving the next chat no room to
record a change without deleting a fact first.

- **`tests/docs.test.mjs`:** `"docs/HANDOFF.md": 14 * KB` -> `16 * KB`. This is the only place the
  limit lives, so the change is one visible number. `HANDOFF.md`'s separate **150-line** guard is
  unchanged, so the file cannot grow by sprawl — only by a slightly fuller sentence.
- Nothing else in the docs changed, and no text was removed to make room.
## 2026-11-22: Step 16 is eight slices — the owner agreed the plan

**Docs only; no code, no build, no save change.** The owner reviewed the eight slices of step 16 and
approved them ("that looks good"), so slices 7–8 are no longer a proposal:

- **The plan is eight slices, not six.** Slices 1–6 are unchanged (4 is still the next build);
  7–8 are the owner's *"one world, two ships visible"*. `REFACTOR_PLAN.md` says **agreed**, and the
  two places that still said "six slices" (`REFACTOR_PLAN.md`'s summary line,
  `architecture/multiplayer.md`'s header, and the index row in `ARCHITECTURE.md`) now say eight.
- **The order is still 4 → 5 → 6 → 7 → 8.** Slices 7–8 come *after* trading, not next: they are
  the last debt in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) (*death and recovery*, *player
  presentation and input*), and nothing in them works until the suitcase (slice 4) carries a pilot.
- **ROADMAP's step-17 cell stops repeating "slice 4 is next"** — that belongs to step 16's cell,
  which is the one place step status is kept.

**Files:** `docs/REFACTOR_PLAN.md`, `docs/ROADMAP.md`, `docs/architecture/multiplayer.md`,
`docs/ARCHITECTURE.md`, `docs/HANDOFF.md`.

**No save change (v29), no build change.** Slice 4 is the next build.

## 2026-11-22: Slice 3 confirmed by the owner; "one world, two ships visible" planned as slices 7 and 8

**Docs only; no code, no build.** The owner played the current build (`2026-11-22j`) and said it
passed, so slice 3's reworks are confirmed and ROADMAP says so. Then they asked for the thing the
plan always called the last debt: **"Also draw the guest's ship"** — *one world, two ships visible*.
*(Slices 7–8 were **proposed** in this entry and agreed by the owner the next day — see the entry
above.)*

That is bigger than the plan's slice 4, so the plan now says exactly how big. Three decisions are
recorded, and the next chat should not reopen them:

- **Slice 4 is unchanged** (the suitcase: bring my pilot, sync, Go home). While a pilot is away its
  own screen is a **card** — *"Your pilot is in Ada's world"* with **Rejoin** and **Bring pilot
  home** — not its frozen pilot still flying its own sky, which reads as a bug.
- **Slice 7 — a second pilot exists in the host's world.** The suitcase becomes a record in
  `state.players` through `custody.hostProfile` + `configurePlayer` (the host's `sim/step.js`
  already flies every active record), docked at the guest's own station because flight positions
  never travel. The returned suitcase is written from the profile the host actually holds. A flat
  **map marker** shows the other pilot, so it is visibly real before a camera exists for it.
- **Slice 8 — one world on two screens** (8a snapshots out, 8b controls in, 8c the guest's screen
  follows the host's pocket). **8b is a numbered change to the input rule**, not a side effect:
  `state.localInput` is filled by `core/input.js` and read by the session, because `sim/` may not
  import `core/`. Mirroring the local screen's input into remote players' `controls` is cheaper and
  wrong — it would make a second pilot that answers to somebody else's stick.

**Files:** `docs/REFACTOR_PLAN.md` (step 16's status and slices 7–8), `docs/ROADMAP.md` (step 16's
cell: slice 3 confirmed, eight slices), `docs/architecture/multiplayer.md` (what the two slices are
and why they are separate), `docs/HANDOFF.md` (the snapshot, rewritten to fit its size limit).

**No save change (v29), no build change.** Slice 4 is still the next build.
## 2026-11-22: Step 17's open questions answered — Minecraft-style servers, anyone hosts, optional Supabase auth

**Docs only; no code, no build.** The owner answered the three step-17 questions, and every doc
that carried them is updated to the answers:

- **Where the server runs / how browsers reach it:** Minecraft-style **port forwarding** — anyone
  runs the server (own machine, rented, big host), players reach it at `host:port`, no domain or
  certificate to start. **17b's blocker is closed**: the transport is a WebSocket listener on a
  forwarded port. The one dependency still to approve is the WebSocket-server library (Node has no
  built-in WebSocket server).
- **Who joins:** anyone. A server may require **optional, modular auth** — **Supabase** first (free
  plan, 50,000 monthly users), behind a small interface so a future provider can be swapped without
  touching the game. The suitcase model is unchanged; auth only answers who is connecting.
- **Who may host:** anyone.

**Files:** `docs/REFACTOR_PLAN.md` (the questions block rewritten as the owner's answers; 17b
unblocked; 17d gains auth), `docs/ROADMAP.md`, `docs/TARGET_ARCHITECTURE.md`,
`docs/architecture/multiplayer.md`, `docs/HANDOFF.md`, `docs/VISION.md` ("dedicated servers" and
"accounts" moved out of "Not planned", the decision recorded in the multiplayer section).

**No save or build change.** Step 16 slice 4 (ships visible in multiplayer) is still the next build.

## 2026-11-22: Playtest 13 of slice 3 — a relay server that cannot be left unsaved

Playtest 12 typed ExpressTURN's three values, made a code, and the host's own Connection details
still said **`In use: none (the free public servers only)`** with `Code paths: 1 local, 1 public,
0 relay`. The server had never been saved, so the offer carried nothing but local and public
addresses — nothing to do with ExpressTURN answering or not. Three fixes, in the order they bite:

- **The screen lied about itself.** `screenModel()` had two `relay:` keys: the player's saved
  server, then the transport's *relay mode* flag, which overwrote it. Every reader of
  `model.relay` (`In use:`, Copy relay settings) saw a boolean. The flag is now `relayMode`;
  `relay` is the server, as every caller already assumed.
- **Typing is saving.** A complete relay entry is saved 600 ms after the last keystroke in any
  of the three boxes, with *"Relay server saved…"* on screen. The new `relayFromFields()` in
  `net/turn.js` is the one parser for the boxes (whole pasted block, bare `host:port`, a comma
  list, a `TRTURN:` line; typed username/credential win over the pasted ones). If an offer code
  already exists it is **remade** immediately, because a code carries the servers that existed
  when it was made — "saved" without a new code is still a code with `0 relay` paths.
- **The guest sees the facts on the codes wire.** A session joined by codes has no data channel,
  so `snapshot().diag` is null and the laptop's panel drew no Connection details at all.
  `screenModel()` now builds a synthetic diag from the wire's own state plus the code's paths
  (`codesOnly`): Signalling, Code paths, clock. "Browsers in the room" and the direct-link rows
  are suppressed there, since a code carries neither.
- **The In-use line owns the failure:** a saved relay with `codePaths.relay === 0` adds
  *"— but the last code had no relay path, so that server did not answer. Press Test relay
  servers."* A duplicate `role` key in the same object was also removed (build warning).

**Files:** `src/net/turn.js` (`relayFromFields`), `src/ui/multiplayer.js` (`screenModel`,
`relayServerHtml`, `queueRelaySave`, `save-relay`/`clear-relay`), `tests/multiplayer-ui.test.mjs`
(3 new), `src/data/multiplayer.js` (`BUILD = "2026-11-22i"`).

**Tests: 974, all green** (was 971). **Save format unchanged (v29).** **Build id: `2026-11-22i`.**
Still unproven: whether ExpressTURN's free tier relays a packet at all — the next playtest's
*Test relay servers* line decides that, and the panel now shows it on both machines either way.

## 2026-11-22: The multiplayer screen, refined — labels inside boxes, no redundant rows

**Code change; rebuild needed.** Follow-up trims to the screen from the same day, all at the
owner's request:

- **The username box is one box**: the "Username:" label moved *inside* it, so it reads
  `Username: Aceface` instead of a label above a bare field (`src/ui/screens.js`,
  `src/styles.css`).
- **Copy world id moved into More details** (it was beside Copy link), and **the
  "Your world is open. Copy the link and send it to your friend." popup is gone** — the link
  box says it by itself (`src/ui/multiplayer.js`).
- **The teal status row is removed from the screen** — "Multiplayer is off." / "Hosting.
  Waiting for your friend to join…" repeated on both doors (pause and menu) without saying
  anything the switch and the link box do not (`src/ui/multiplayer.js`, `src/styles.css`).
- **The chat box**: the typing font now matches the lines above it (no more monospace input),
  and the **Players column stays compact when the box is open** (about its collapsed width),
  so the Pin button sits right next to the "Players" heading and the lines get the space
  (`src/styles.css`).

**Files:** `src/ui/multiplayer.js`, `src/ui/screens.js`, `src/styles.css`; tests updated
(`tests/multiplayer-ui.test.mjs`).

**Save format unchanged (v29).** Rebuild needed. **Build id: `2026-11-22g`.**

## 2026-11-22: The multiplayer screen is trimmed to a simple box

**Code change; rebuild needed.** At the owner's request the multiplayer UI is cut down to what
a player needs to *do* something, with the rest behind one toggle:

- **The main menu's username box gets a "Username:" label**, and the box is set in the same
  type as the Campaign / Open World buttons (`src/ui/screens.js`, `src/styles.css`).
- **The chat window** loses its **Expand** button (names ellipsize to `name…` now, always);
  the column is renamed **"Current players" → "Players"**; and the lines box is about **double**
  its previous height (`src/ui/multiplayer.js`, `src/styles.css`).
- **The pause card's multiplayer row is one button** — the "Hosting, waiting for your friend"
  state row is gone (the screen's status line says it), the button's neighbour switch reads
  **"Multiplayer: On/Off"**, and the switch is drawn like the pause card's **sound switch with
  a knob** (the `.sw` styles are no longer scoped to `#pz`).
- **One "More details" toggle** (right of Copy link when hosting, below the join box from the
  menu) reveals the offer/answer codes, the relay server and the connection report above the
  Close button. The hosting hint row and the **Players list** row are removed — the chat column
  already says who is here. "Copy world id" stays where it is: it is wired and used.
- **The relay boxes open pre-filled with the built-in ExpressTURN** (address, username,
  credential) via a new `builtinRelayFields()` in `src/net/turn.js`, so a player never retypes
  three values the game ships with.
- **The "Send the offer code…" message popup clears itself after a few seconds** (errors stay).

**Files:** `src/ui/multiplayer.js`, `src/ui/pause.js`, `src/ui/screens.js`, `src/net/turn.js`,
`src/styles.css`, `src/ui/README.md`; tests updated (`tests/multiplayer-ui.test.mjs`,
`tests/ui-overlays.test.mjs`, `tests/navigation.test.mjs`).

**Save format unchanged (v29).** Rebuild needed. **Build id: `2026-11-22f`.**

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
