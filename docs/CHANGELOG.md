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

## 2026-11-25: Playtest 25 — one pointer at a time, and a lead pip for anything you can lock

**Code change; rebuild needed; build `2026-11-25i`.** Save version unchanged (**29**); nothing saved
and nothing on the wire changed.

The owner confirmed all three playtest-24 fixes ("1. Works. 2. Works. 3. Works.") and sent two new
reports from the same flight. Neither is a slice-8b feature; both are rules that were only ever
written down in one place.

- **1. "Pinning chat makes it so that when your orange circle cursor goes over the pinned chat your
  white windows cursor is visible."** Two pointers live on the same screen: the system cursor and the
  HUD's own orange circle (`#cur`). Only `canvas` hid the system one, so any element that took the
  mouse — the pinned chat box does, `pointer-events: auto` — put a white arrow inside the ring. The
  owner's rule is general: *"In the ship UI your orange circle cursor should always be prioritised if
  you are steering. So UIs [that] decouple the steering like chat, inventory etc it's ok there to show
  the white windows cursor."* So the answer is one body class, `pilot-pointer`, owned by the new
  `src/ui/pointer.js`: **is the stick live?** — in a ship, not docked, not the title screen, not
  paused, no surface holding the flight keys (chat, cargo, cache, chart, multiplayer screen, N list,
  an act's end card). `main.js` asks it once a frame (`syncPointer()`, one comparison, a `classList`
  write only when the answer changes) and `styles.css` finishes both halves: `body.pilot-pointer * {
  cursor: none !important }` and `body:not(.pilot-pointer) #cur { display: none }` — so a pilot never
  sees two pointers at once, in either direction. **Free camera (Left Alt) is not a decoupling** and
  keeps the ring, per the owner: *"i still want the orange cursor like now since we are still flying
  the ship just from a different view point."*
- **2. "Lead indicator is not visible when I select a guest as a host with f."** The ballistic pip
  was hard-wired to `lock.k === 'e'` — hostiles only — although playtest 23 made every pilot
  selectable, so a locked friend drew nothing. It now follows **whatever F has locked, as long as it
  is moving**: hostiles, visiting pilots on either machine, anything with a velocity. A pilot's lock
  reference had no velocity at all, so `render/views.js` now carries one (`ref.v`): the host's
  record's own interpolated `v`, or the `velocity` the host already sends in `SHIP_FIELDS` and
  `render/shipstream.js` already smooths. Two gates stay, both about the shot: a wreck is skipped
  (`hp <= 0`), and a target under `LEAD_MIN_SPEED` (0.5 m/s) has nothing to lead — a rock, a crate at
  rest, a station and a rift door keep the screen quiet. The **weapon** side is unchanged, at the
  owner's word (*"make the lead indicator currently only be for primary weapon, it's easier that way
  right now"*): the selected primary bay's gun leads; an empty bay or the hitscan mining beam does
  not, and the missile launcher is not consulted yet.
- **3. "When chat is open the white cursor is only visible over the chat box."** The canvas hides the
  system cursor for mouse-look flight, so a surface that took the stick only got the arrow back on its
  own elements — everywhere else it was still `none`. The rule now gives the cursor the **whole
  screen** on any decoupled surface (`body:not(.pilot-pointer) canvas { cursor: default }`, a type
  selector with no `!important`, so a canvas with its own cursor keeps it), which is exactly what the
  N list already did.
- **4. "Are you sure that is the new build?"** The owner tested the previous round on a bundle that
  contained neither fix, and nothing on the screen said which build was running. The chat box's empty
  line now reads *Press Enter to chat. **Build 2026-11-25h*** — the one place both players always look
  while flying. A screen without a build there is an old download or a cached page; hard-reload.
- **Docs.** New guide [TESTING-25-POINTER-AND-LEAD.md](../testing/TESTING-25-POINTER-AND-LEAD.md)
  (both reports, step by step). The rule itself is written into
  [docs/architecture/ui-and-screens.md](architecture/ui-and-screens.md) and the two module READMEs.
- **Tests.** `tests/playtest25-fixes.test.mjs` (8): the pointer table (including free camera and each
  decoupling surface), the once-per-change DOM write, the two CSS rules, the frame loop's call, and
  the lead pip — a pilot's reference carries a velocity on the host's screen and on a guest's, and
  the instrument's gates (any lock, moving only, primary bay only). `npm test` **1131/1131**.

## 2026-11-25: Playtest 24 — a repaired pilot comes back repaired, the visitor's hull stops blurring, and the chat can be copied

**Code change; rebuild needed; build `2026-11-25f`.** Save version unchanged (**29**); one new field on
one existing wire message, and no saved field at all.

The owner's first flight of 8b reported three things. All of them are here, each with a test that fails
on the old code.

- **1. "Repair the pilot at home, bring it back, and it is still damaged"** — and the host said *"this
  world kept its own"*. The repair really was in the suitcase; the world simply refused it. The ordering
  pair (`epoch`, `rev`) cannot express "this copy came from home": a host raises `rev` on **every**
  write-back, while a fresh `checkOut` starts every trip at `epoch 0, rev 0` — so the copy carrying the
  repair is the one that looks older, and the damaged copy won. Slice 5's rule had been reading the
  guest's own `left` mark instead, which conflated two different situations: *the pilot went home*
  (believe the guest) and *the connection dropped* (believe this world — that rule is still pinned by
  its own test). So a `carry` now says which it is: **`fresh: true`** means *packed out of the pilot's
  own home save just now*, and only the guest can know it. `net/protocol.js` carries the flag;
  `net/session.js` sets it in `sendCarry` (a new `checkOut`) and never on a rejoin of a stored suitcase,
  and `onCarry` believes a fresh copy whatever the pair says. `left` is only about admission now.
- **2. "The guest's hull and name tag go blurry on the host's screen, worse the faster it flies, only
  while the host turns"** — the 2026-11-08 high-refresh sawtooth, back on the one record that fix never
  reached. `snap` means "draw this frame un-interpolated", and only `chaseView` ever cleared it — for the
  **local** hull. A visiting record keeps its `snap` from `launch()` for ever, so its hull was placed at
  the last 60 Hz tick under a 240 Hz camera. `render/views.js` `poseOfRecord` now consumes the flag
  after taking the pose, so the jump frame is still a jump and every frame after it interpolates like
  the rest of the sky.
- **3. "Opening chat with Enter should let me select and copy the text; selecting closes the box"** —
  the field's `blur` handler closed an empty box, and a press on the lines blurs the field. Now a press
  on the conversation starts a selection and keeps the box (and holds the redraws back, so a line that
  arrives mid-drag cannot wipe the selection); a press on the field or **Pin** is typing; a press
  anywhere else ends the selection and closes an empty, unpinned box exactly as before. Text is
  selectable **only in the box opened with Enter** — `styles.css` gives the lines `user-select: none`
  and turns it on under `body.mp-chat-open`, which is the owner's own line: not a glance, not a pinned
  readout. Escape still closes it while a selection is up (the field no longer has the cursor, so the
  box's own key handler would not see it).

**Tests:** `tests/playtest24-fixes.test.mjs` (new, **5**): the repair surviving the round trip end to end
(two real sessions, the host's own write-back, `bringPilotHome`, a repair, a rejoin — and the host's chat
saying the pilot *arrived* rather than *kept its own*), the fresh flag reaching the wire with its pair at
zero, a visitor's hull interpolating between ticks, a docked visitor untouched, and the chat press rule
plus the stylesheet rule. `tests/multiplayer-slice5.test.mjs`'s "came home and came back" case now sends
`fresh: true` — the same claim, said out loud. `npm test` **1122/1122**, build **3599 KB**.

**What the owner must do:** hard-reload on **both** machines, check **Connection details** reads
**`2026-11-25f`**, then follow `testing/TESTING-16-SLICE8B-FIXES.md`.

## 2026-11-25: Step 16 slice 8b — the guest's controls reach its ship

**Code change; rebuild needed; build `2026-11-25e`.** Save version unchanged (**29**); one new wire
kind, one new state, no saved field.

Slice 8a made a friend **visible**. This makes the friend **flyable**: the guest says what it is
asking its ship to do, the host writes it into that visitor's own control record, and the host's sim —
already the only writer of the truth — decides what it means.

- **`controls` (`net/protocol.js`)** — a new kind carrying the control record plus the pilot's aim:
  `{ steer{x,y}, roll, thrust, strafe, lift, stop, brake, boost, fire, sec, aim[x,y,z] }`
  (`CONTROL_FIELDS` in `data/multiplayer.js`). Rebuilt field by field on send **and** read: every axis
  clamped to -1..1, every held control only a real `true`, `aim` through the vec3 cleaner. A message
  never names a pilot — **the peer is the identity** — so no guest can drive another's ship.
- **`state.localInput` — the numbered decision, as planned.** `core/input.js` writes the local control
  record today and `sim/` may not import `core/`; so 8b adds **one new state, one new writer**:
  `state.localInput`, mirrored at the end of `syncControls()`, which the session reads. It is a copy,
  not a reference, so a session can never write back into the pilot's own controls.
- **The guest's clock** (`CONTROLS.hz` **30**, data) sends that asking 30 times a second — faster than
  the 24 Hz snapshot stream on purpose, so a snapshot is never what a control waits behind. Nothing is
  sent until a `welcome` is heard, and nothing at all once the session stops.
- **`sim/multiplayer.js` `applyGuestControls(guestId, input)`** writes the asking into that visitor's
  own `controls` (where `core/input.js` writes the local pilot's) and its `aimDirection` (its own
  looking direction, so a guest's shot goes where the **guest** looks, not along the host's nose).
  **A docked visitor launches the first time it asks to fly** — it has no other hull in this world —
  through the same `launch()` the local pilot uses, so it leaves fully charged from the station's
  launch point. An asking of nothing leaves a docked visitor parked.
- **A silent guest does not fly on** (`ageGuestControls`, called each tick): after `CONTROLS.staleMs`
  (**400 ms**, data) the record is asked for nothing, so a closed tab, a backgrounded window or a lost
  channel cannot leave a hull holding its throttle into a rock. It stays launched; it coasts.
- **Wiring:** `net/session.js` resolves the **peer** to a guest id and hands `{ guestId, input }` to
  the bus (`mp-guest-controls`); `main.js` — the only place allowed to touch both — calls the sim.
  A controls message from a peer that was never welcomed, or for a record that has gone, is dropped.

**Not in 8b, by the plan:** prediction, acks and rewind (**8d**), cosmetic muzzle (**8e**), and the
guest's screen following the host's pocket (**8c**) — a guest still sees its **own** galaxy, so this
slice is watched from the **host's** screen. **A launched visitor cannot dock again yet** (docking is
host-confirmed and a guest has no way to ask); it flies until it goes home.

**Tests:** `tests/multiplayer-controls.test.mjs` (new, **11**): the kind and its fields, every axis
clamped and every held control honest, `state.localInput` mirrored but never shared, the asking landing
in the record and the hull actually flying under `stepSim`, an asking of nothing not launching, unknown
and dead visitors driving nothing, aim normalised, silence neutralising after `staleMs`, the peer — not
the message — deciding whose ship it is, and the guest's own send being cleaned and stopping with the
session. `tests/multiplayer-connection.test.mjs`'s exhaustive `KINDS` list gained `controls`.
`npm test` **1117/1117** (248 s), build **3598 KB** (`game/tallow-reach.html`, build string `2026-11-25e`).

**What the owner must do:** hard-reload with Ctrl+Shift+R on **both** machines, check **Connection
details** reads **`2026-11-25e`**, then follow `testing/TESTING-16-SLICE8B.md` — bring the pilot in,
and watch the **host's** screen while the guest presses W: the friend's hull launches and flies.

## 2026-11-25: Step 16 slice 8a PLAYTEST-CONFIRMED

**No code change; no rebuild needed — the build the owner passed is `2026-11-25d`.** Save version
**29**, unchanged.

*"Play test 8a passed."* That closes slice 8a, and with it the whole of step 16's **"one world, two
ships"** half: host-authoritative ship snapshots at 24 Hz, a guest drawing every other pilot as a
**view** (100 ms behind, interpolated, never guessed), the host drawing its visiting record with no
wire at all, and the guest outside its own hull.

What the passing round actually covers, because three fixes went in after the first playtest of it:

- a friend's hull is **selectable** — **F** on the hull, or the **N** list's **Ship** filter, which
  now carries **every** ship (NPC and player, docked included) — wearing **the pilot's own name** and
  showing **hull/shield bars** like any other ship;
- **leaving and rejoining the same link works**, including from a browser an older build had locked
  out (the record that holds no secret cannot refuse anybody, and the host repairs it);
- a visiting hull is **solid and takes damage** — collision, bolts, warheads, shields first — and its
  destruction is said in words on both screens.

Known and deliberate, carried into the remaining slices: a visitor **cannot fly** in the host's world
(controls are **8b**), its screen does not follow the host's pocket (**8c**), and a destroyed visitor
does not **respawn** (step 16's *death and recovery* debt). No save change anywhere in 8a.

Merged to `main`. Next: **8b** (a guest's controls reach the host), then 8c, then **6** (trading —
last, by the owner's order 2026-11-24). Guide: [../testing/TESTING-16-SLICE8A.md](../testing/TESTING-16-SLICE8A.md).

## 2026-11-25: Playtest 23 follow-up — the Ship filter shows every ship, the guest included

**Code change; rebuild needed; build `2026-11-25d`.** Save version unchanged (**29**); no save field,
no wire change, one row rule.

The owner, after `2026-11-25c` worked: *"Make it so that the filter in N tab for Ships shows ALL ships.
Both player ships and ALL npc ships. Right now cant see the guest in the N tab."*

**What was wrong.** The N (navigation) list already put every hostile under its **Ship** filter
(`ui/pocket-list.js`: `pocketType('Hostile') === 'Ship'`), so all NPC ships were there. The **pilot**
row was the one that went missing: `sim/flight-instruments.js` `pocketObjects` skipped a **docked**
pilot, on the old reasoning that a hull inside a station is not out in the pocket. But a visitor
**cannot fly at all yet** (controls are 8b), so it is docked for its entire visit — the row was never
drawn, on either screen. That is exactly the friend the owner could not find; the same rule hid the
**host's** own hull from a guest's list while the host sat at a station.

**The fix, in one line of rule:** a pilot's row is skipped only when it is **dead** or in **another
pocket**. Docked or flying, it is a ship in this sky — its hull is drawn parked at the launch point its
arrival put it on and, since `2026-11-25c`, it is solid and takes damage. So the **Ship** filter is now
one place where every ship appears: every NPC ship, every other player's ship, and (on a guest) the
host's ship. The row carries the pilot's own name and locks as a pilot (`k: "p"`), so its hull/shield
bars come with it, and a second click releases it, exactly like any other row.

**Tests:** `tests/multiplayer-pilot-lock.test.mjs` grew three (now **14**): a docked and a flying pilot
are both `Ship` rows and both survive the Ship-only filter with the pilot's name on them; a dead pilot
and one in another pocket are not rows; and a **parked** visitor's row takes the same pilot lock a
flying one does (`tests/multiplayer-damage.test.mjs` and the rest unchanged). The old
"a docked friend is not a list row" test was **replaced**, not deleted quietly — it encoded the rule
that hid the friend.

`npm test` **1106/1106**, build 3596 KB. CTRL+SHIFT+R, then check **Connection details** reads
`2026-11-25d`. Retest: `testing/TESTING-16-SLICE8A.md` **Part 8**.

## 2026-11-25: Playtest 23, second round — the browser that was locked out, and a friend's hull that was only a picture

**Code change; rebuild needed; build `2026-11-25c`.** Save version unchanged (**29**): one repair
rewrites a record's hash in a save that already exists, but no record gains a field.

The owner retested `2026-11-25b` and sent two reports.

1. **One browser still could not join.** *"That link has already been used, or it was copied
   wrongly"*, for ever, on the browser he had used before — while a **new** browser joined the same
   link and the same build fine, and *"bring my pilot"* did not help. The first round fixed the code
   that damaged a record, but **it could not repair a record it had already damaged**: an edit without
   a secret had hashed *nothing* over the pilot's hash, so the host's save held the hash of no secret
   at all, and every later join for that record failed the token check — its own pilot included.
   Three changes, all in the join:
   - `custody.js` — **`recordHoldsNoSecret(record, guestId)`**: a record whose hash is the hash of
     the empty string cannot identify anybody, so it must never refuse anybody. `handshake` admits
     such a record and returns **`repaired: true`**; a record that *does* hold a secret still refuses
     a wrong one (this is the narrow repair, not a weaker handshake — the unchecked invitation is
     step 17's job). The host's own log says *"…'s saved link had been damaged by an older build. It
     has been repaired"*, once, and `onHello`'s `putGuest` writes the real hash on the way in, so the
     next join is an ordinary one.
   - `session.js` — **a `carry` never rewrites the secret of a record that already exists.** The
     hello is the only place an identity is proven and it has already been answered when a carry
     arrives; the token a carry carries is `away.token` first, i.e. whatever an older build left in
     the suitcase. Only a first contact takes a hash from a bundle.
   - `session.js` — **a refusal ends the attempt instead of looping.** A guest used to sit in
     "joining" for ever and could only press Join again and read the same sentence ("stuck in a
     loop", his words). Now the session stops quietly, the host's own words go to the chat log and the
     menu notice, and Join is a clean second attempt.
2. **A visiting hull was not collidable and took no damage.** *"The guest ship that spawns in is not
   clippable and doesnt take damage. Every ship should by default take damage and be collidable in
   tallow reach unless otherwise specified."* Slice 8a drew the visitor and simulated it, but nothing
   treated it as a **body**: the local pilot's bolts and warheads only ever tested `W.enemies`, and
   the collision pass only ran for `state.players` against rocks, scenery and hostiles. Now a visiting
   hull is a hull:
   - `sim/player.js` — **`pilotHullRadius(P)`** (`SHIP_RADIUS` scaled by `SHIPS[...].sc`, the number
     the screen draws it with) and a **pilot-vs-pilot collision pass** in `flight()`: the two ships
     separate, ricochet (restitution 0.4) and pay the same `impact > 25 → 0.015/m·s` damage a rock or
     a hostile ram charges. A **parked** visitor is included — its hull is drawn at the arrival launch
     point, so it is hit-able there — and pays in this pass because `step.js` skips a docked record's
     own tick; a flying visitor pays in its own. One collision, one hit, per pilot per tick.
   - `sim/combat.js` — the pilot's **bolts** stop on another pilot's hull (`< 6 m`) and damage it
     shields-first, exactly as on a hostile; the shooter's own hull, a dead wreck and a pilot in
     another pocket are skipped.
   - `sim/missile.js` — the pilot's **warheads** burst on another pilot's hull instead of sailing
     through it (`< 6 m + hull radius`), with the same three exceptions.
   - `sim/multiplayer.js` + `ui/multiplayer.js` — a visitor's hull reaching zero is **said out loud**:
     `mp-guest-destroyed { guestId, name }` becomes the chat line *"…'s ship was destroyed in this
     world. Its pilot is safe in its suitcase — go home to fly it again."* `hurt` already marked a
     non-local record `dead`, `SHIP_FIELDS.dead` already stopped the far screen drawing it, and the
     host's `views.js` already skipped it — the missing piece was the sentence. **Recovery is still
     not built** (step 16 debt), so the words promise nothing the code cannot keep.

**Tests:** `tests/multiplayer-damage.test.mjs` (new, **13**): the hash of nothing recognised (and a
real hash not), a damaged record admitted and repaired end-to-end through two real sessions, a good
hash never overwritten by a stale carry, a genuine mismatch still refused with the attempt ended in
words, hulls separated and both sides paying, a slow nudge hurting nobody, pockets kept apart, bolts
shields-then-hull and not through their owner, warheads bursting on a friend's hull, and a visitor
destroyed with both screens told. `npm test` **1104/1104**.

**What the owner must do:** hard-reload with Ctrl+Shift+R, then open **Connection → Connection
details** and check the build line reads **`2026-11-25c`**. On the old browser, use the **same link**
again — it should now join without the host issuing anything new. Then spawn a friend and try to fly
through it, shoot it, and put a warhead in it: both hulls should knock apart and both should take
damage. `testing/TESTING-16-SLICE8A.md` Part 7 is this retest.

## 2026-11-25: Playtest 23 — a friend can be selected, and a pilot can always come back

**Code change; rebuild needed; build `2026-11-25b`.** Save version unchanged (**29**): the fixes
change what an edit does to an existing record, never the record's shape.

Two reports from the owner's playtest of slice 8a, with the same root of the trouble — *state that
was drawn or stored but never asked about again*:

1. **A visiting pilot could not be selected.** *"cannot select a friends ship"*. Slice 8a drew the
   hull and stopped there: F only ever offered hostiles, rocks, crates, rifts, gates, canisters and
   the station; the N list turned a pilot row into a **name-only** lock (kind `"n"`), and the HUD drew
   hull/shield bars for `k === "e"` alone. A visitor is not a hostile and, on a guest, not even a
   record — so the fix is a new lock kind, **`"p"`**, and one new fact the screen publishes:
   **`state.otherPilots`**, the mirror of every pilot `render/views.js` is drawing (`{ k: "p", id,
   name, ship, place, pos, quat, hull, shield, dead, docked }`). The mirror is the only place a friend
   exists on a guest's screen (slice 8a forbids a record), and it is what makes one fix cover both
   screens. `sim/targeting.js` offers those pilots to F (reticle first, then the same cone as a
   hostile), `lockName` returns **the pilot's own name**, `pruneLock` drops the lock when the hull
   stops being drawn, the N list lists it under its **Ship** filter as a real row, and the HUD gives
   its lock **the same two bars as any ship**. `sim/pilot-stats.js` (new) owns the two fractions, so
   the host's own screen and the wire cannot disagree about a friend's bars — and `SHIP_FIELDS` gains
   **`shield`** (a 0..1 fraction, clamped like `hull`) for exactly that reason: the owner asked for
   "hull/shield stats like any other ship", and a bar that is always 0% because the number never
   travelled is a decoration. An unlocked friend also wears its name in the sky now.
2. **A pilot could not come back after leaving.** *"Stuck on 85% handshake … 'The link has already
   been used, or it was copied wrongly.'"* The link was fine: `custody.guestRecord` hashed whatever
   token it was handed, and the host's **write-back** (the two-second check, and the `left` mark a
   departure writes) edits a record **without** the guest's secret — so a record that had been
   written back once held the hash of **nothing** instead of the hash of the pilot's token, and every
   later hello failed the handshake with that sentence, for ever. It looked intermittent because a
   record marked `left` is re-admitted without a token check while a dropped-connection record is
   not. Fix: **an update that carries no secret never changes the secret's hash**
   (`custody.recordTokenHash`, `putGuest` passes the stored hash through). Nothing else about the
   handshake changed, and a real token still replaces the hash (that is how a pilot is renamed onto a
   new browser).

Files: `src/data/multiplayer.js` (`SHIP_FIELDS` + `shield`), `src/sim/pilot-stats.js` (new),
`src/sim/targeting.js`, `src/sim/flight-instruments.js`, `src/state/state.js` (`otherPilots`),
`src/render/views.js`, `src/render/shipstream.js`, `src/net/ships.js`, `src/net/protocol.js`,
`src/net/custody.js`, `src/net/multiplayer.js`, `src/ui/hud.js`, `src/ui/target-display.js`, plus the
READMEs of `sim/`, `net/`, `render/`, `data/` and `state/`. Tests: **`tests/multiplayer-pilot-lock.test.mjs`**
(12 new: the two fractions, F on a friend, the cone, prune, the N row, the host's and the guest's
mirror, the shield field, and the HUD's gate) and **`tests/multiplayer-rejoin.test.mjs`** (5 new,
written as the class rather than the case; all 5 fail on the old code).

**What the owner should look for:** F on a friend's hull gives that pilot's name and two bars; the N
list shows the friend as a Ship row with its name; and leaving and rejoining the same link works
every time, including "Bring my pilot" afterwards.

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

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
