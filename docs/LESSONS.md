# LESSONS: classes of bug earlier chats hit, so you do not repeat them

*Last checked: 2026-11-24.*

Read this before changing anything. Each entry is a **class** of bug (not a single instance): what the owner
saw, the general cause, the rule that prevents it, and the test that enforces it. A rule backed by a failing
test is stronger than a rule in a doc, so when you fix a bug, make a test fail first.

**When the owner reports a bug:** reproduce it as a test, fix the root cause for the whole class, add or extend
the test, then add or update an entry here (copy the template at the bottom). If it is a repeat of a lesson
below, say so in that entry and strengthen the test, because a repeat means the test was too narrow.

Mission lessons are first because missions are where most bugs have come from. The full rules are in
[MISSION_RULES.md](MISSION_RULES.md).

---

## Missions

<!-- L1–L10 were moved verbatim to [archive/LESSONS_1-5.md](archive/LESSONS_1-5.md) to keep
     this file under its size limit. -->

### L11. Confusing or spoiling player-facing text
- **Seen:** `Progress 0/2` counted dialogue lines, not mission progress; an objective revealed an ambush before it
  happened.
- **Rule:** the HUD and Mission log show only the authored `objective` (which hints at the next action without
  revealing what has not happened yet). Never show internal counters, step numbers or trigger names.
- **Enforced by:** the linter (every step needs an `objective`); `tests/step13c-ui.test.mjs`.

### L15. A mission claimed to be accomplished before its items were handed in, then stuck when they were lost
- **Seen:** after the Border Signal's last in-space line the HUD said the mission was done and to return for the reward; dying
  then lost the beacon, the reward could never be collected, and the mission sat there forever. Contracts announced "Mission
  complete" before their crates were handed in, and called themselves missions rather than contracts.
- **Rule:** finishing the steps is `missionObjectivesDone`, never "accomplished". An item-bearing mission is paid only by
  `completeMission`, which consumes the hand-in first; until then its guidance shows `handIn.objective` and how much is still
  owed. A lost mission-only hand-in (the hold destroyed with the ship, or no copy anywhere) fails the mission with a message
  instead of waiting forever. Wording follows the mission's `kind`: a contract says "Contract ...". Never read
  `mission.completed` by hand; use `missionObjectivesDone`.
- **Enforced by:** the linter (`handIn.objective` required; no completion words in guidance; a contract may not say mission),
  `tests/mission-death.test.mjs` (death after the last step, and a hand-in that exists nowhere), the
  `last step does not accomplish it` invariant in `tests/mission-invariants.test.mjs`, `tests/step13-missions.test.mjs` and
  `tests/step13c-ui.test.mjs`.

---

## Everything else

### L12. A new way to change state skipped the normal refresh
- **Seen (step 10):** after loading a save the sound was dead, the start screen reappeared on docking, and
  Load/Import/Reset did not redraw the screen.
- **Rule:** state changes go through the one path that also does the refresh (events, `loadGame`-style
  functions). A new route that sets state directly must emit what the listeners expect.
- **Enforced by:** `tests/step10-fixes.test.mjs` and the baseline playtest.

### L13. Anything that accumulates per frame must be multiplied by the time step
- **Seen:** the ship blurred and warp roll differed on a 240 Hz display.
- **Rule:** use `dt`; render between ticks by interpolation. See `architecture/simulation-and-rendering.md`.
- **Enforced by:** `tests/sim-step.test.mjs` (the fixed-step tests).

### L14. `matrixWorld` is last frame's transform
- **Rule:** after moving an object, update its matrix before reading `matrixWorld` for a gun or camera position.
  See `architecture/simulation-and-rendering.md`.
- **Enforced by:** NOT YET: add a test if this bites again (it cannot be checked headlessly today, only by eye).

### L16. A hull id is not a ship
- **Seen (owner):** "If you die, you get a free wasp. Cant then equip equipment to the ship." The replacement Wasp had no bays in
  Outfitting and flew with no thrusters and no Hull HP.
- **Cause:** the lost hull's fleet records (`holds[id]`, `hp[id]`, `loadout[id]`) were deleted, and the replacement was added as
  an id only. Everything reads a ship *through* those records — `layoutFor` for its bays, `hullOf` for Hull HP, the fit for
  drive, shields and guns — so a hull without them is not half a ship, it is nothing. A save/reload hid the bug, because
  `cleanLoadouts` gives any hull without a saved fit the stock fit.
- **Rule:** a hull joins the fleet through `addShipRecords` (`state/profile.js`); nothing pushes to `profile.ships` without it, and
  a hull that becomes the flown ship goes through `ensureShipRecords` first. Never delete a ship's records without creating the
  ones its replacement needs, in the same step.
- **Enforced by:** `tests/ship-recovery.test.mjs`, and the post-death snapshots in `tests/single-player-combat-8b.test.mjs`
  (they record power, shields, hull, a gun bay and an empty hold for the replacement ship).

### L18. A rule about *where* something happens was left to the caller
- **Seen (owner):** "It doesn't seem like the game cares which location you hand in a mission in." Contracts and missions
  paid at whatever station the pilot happened to dock at, and the guidance named that station too.
- **Cause:** the reward step asked only "is the pilot docked?" — the *place* was never part of the mission record, so the
  runner, the HUD and both docked screens each invented their own idea of "the station". The data had the fact only in prose.
- **Rule:** a mission fact that decides an outcome is data on the mission, not a condition read from wherever the player is.
  The hand-in station is stored on the mission when it is taken (`handIn.station`, defaulting to the giving station), one
  runner function answers "which station" and "are we there", every screen asks it, and `completeMission` refuses anywhere
  else. Guidance names the station from that same field (`{station}`), never a second copy of the name.
- **Enforced by:** `tests/mission-handin-station.test.mjs` (a second station pocket proves the wrong counter pays nothing),
  the linter's `handIn.station` checks, and `docs/MISSION_RULES.md` rule 11.

### L19. A field was written on one object and read from another, so a feature silently never appeared
- **Seen (owner, step 14a playtest):** the rift sky was asked for and nothing in the game looked different — a rift
  still showed the ordinary starfield and the pocket's planet behind it.
- **Cause:** the sky was registered on the **place record** (`registerInstancePlace({ …, sky })`, read back with
  `placeAt(id)`) but the renderer looked for it on the **place definition** (`placeDef(id).sky`), which is built from
  features only. The lookup returned `undefined`, the `if` did nothing, and every test still passed: nothing in `sim/`
  or `data/` could see it, and no test asserted the field was where the reader reads it. A whole feature was missing
  and the only failure was a picture.
- **Rule:** when `render/` or `ui/` reads a field, name in a comment **which object carries it**, and add an assertion
  that reads the field back **the same way the reader does** — `placeAt(id).sky.kind`, not "the template has a sky".
  A visual or presentational feature that no test can see is a feature nobody has verified: the data being right is not
  the same as the reader finding it. Silence is the failure mode here, so prefer a test that would fail if the reader
  and the writer disagreed.
- **Enforced by:** `tests/step14-instances.test.mjs` — the reload test asserts `placeAt(record.id).sky.kind` is the
  template's declared kind (the reader's own path), and the template test asserts every template declares a `sky.kind`
  in `SKY_KINDS` and no `planet` feature.

---

### L23. When a complaint is about *where* something shows, ask what root hides it — and a "fires together" rule is a selection missing, not a speed problem
- **Seen (owner):** world-space name tags ("Trade lane asteroid field") floating over the main menu; every fitted gun firing on one click; the free-cam ship turning under a level camera.
- **Cause:** the markers were created under `#mk`, a sibling of `#hud`, so every path that hid the HUD (`setReticle`) left them behind — a visibility root that did not cover everything it owned; and the fire loop walked *all* fitted guns because nothing modelled "which primary is selected" — the missing concept, not a cooldown or power bug, made twin cannons fire as one. The camera's lookAt carried its own world-up, ignoring the ship's roll.
- **Rule:** UI hidden together is hidden together: if a surface can show world-space overlays, the one switch that hides the HUD hides the overlays too. And when only one of N fitted modules should act, the game must store which one — an "active slot" is data and a key, not a special case in the fire loop. An orientation aid that has its own up vector must document whose up it uses (the world's, or the ship's — here the ship's, for the free camera).
- **Enforced by:** `tests/primary-slots.test.mjs` (only the selected bay fires, empty bay fires nothing, legacy `pw` migrates to the bay holding that kind of module) and the extended assertions in `tests/ui-cursor.test.mjs`'s siblings (markers ride in `setReticle`, so the `main-menu`, `docked` and boot paths cannot leave tags behind).

---

### L24. An objective about a "place" with no place on the record pays for anywhere
- **Seen (owner):** a hunt contract could be completed by killing any pirate raider anywhere in the universe, and the objective gave no hint where the job actually was.
- **Cause:** the kill step carried the enemy and nothing else, so `objectiveMatches` had no place to refuse against — an "area" job became a galaxy-wide job. The acceptance pocket is the anchor the game already had; it simply was not stamped onto the objective.
- **Rule:** any objective whose meaning is "here" stamps `step.place` (or its sector equivalent) at acceptance, the runner refuses events from any other place, and the player-facing sentence names the area from the same data the spawner uses (the field feature's own name) — never a vague "somewhere out there". And a popover that belongs to a right-click puts its action buttons in the popover's header, directly under the title on their own line: the footer-line confirm sits a popover-height below a displaced cursor, which is the whole "barely move the mouse" complaint (a second owner bug, 2026-11-14).
- **Enforced by:** `tests/hunt-place.test.mjs`; popover contract in `ui/menu.js` and `ui/discard.js` (`.inv-sell-head`).

---

### L33. A partial save handed to the sanitizer without its version comes back empty
- **Seen:** step 16 slice 4 — a visiting pilot arrived with its ship, fits and credits, and an empty hold. Slice 1's tests missed it: they round-tripped a bundle through `checkIn`, which never builds a *guest's* profile.
- **Cause:** `custody.hostProfile` sanitized `bundle.profile` as-is. `v` is a HOME field, so a bundle's profile half has none — and `sanitizeProfile` reads a missing version as pre-v12, when holds were `{ cargo, modules }`. `cleanHolds` looked for `holds[id].cargo`, found nothing, returned `{}`. `applyTravellingProfile` had stamped `v` for exactly this since slice 1; `hostProfile` did not.
- **Rule:** any partial profile handed to `sanitizeProfile`/`sanitizeSave` is stamped with the current `v` first, because every cleaning rule is version-dependent. A bundle carries what a pilot owns, never the save's version: restore it at the boundary.
- **Enforced by:** the `hostProfile keeps a visitor's cargo` test in `tests/multiplayer-custody.test.mjs` (hold, fleet, fit and `profile.v`).

### L34. A frozen record the save path does not know about gets stamped over
- **Seen:** step 16 slice 4 — coming home doubled every station locker (4 ferrite became 8).
- **Cause:** two halves of one rule. `checkOut` empties the home stations (a stack cannot sit in two galaxies), but the session reaches the game through a deliberately narrow `saveKit.write` that stores only `world.guests` and `world.worldId`. The emptied stations never reached the live save, the suitcase also carried that cargo, and `checkIn` added it on top. And `captureActiveModeSave` would fold the live runtime into a pilot meant to be frozen.
- **Rule:** when a record is frozen, BOTH halves must respect it — the copy on the wire and the copy the game keeps. A guest installing its own whole save uses its own seam (`saveKit.install`), never the host's narrow one; `captureActiveModeSave` hands an away pilot's record through untouched. Check anything that moves items at the seam the game actually stores through, not on plain objects.
- **Enforced by:** four tests, chosen so **undoing any one fix fails one of them** — a test that passes with the fix reverted is not enforcement. `multiplayer-carry` (the round trip, the doubling failure mode, the frozen world not re-stamped) and `multiplayer-bring-pilot` (the real session seam: packing leaves the live stations empty, a suitcase from the host actually reaches the save).

### L35. A connection that ends is an event the host must act on
- **Seen:** owner, playtest 14 — "When my laptop leaves it still says that laptop is logged in in the players list and there is no notification in chat that it left." Its ship stayed too, and the pilot could not get back in.
- **Cause:** three omissions on one path. The host removed the row but never wrote the record, so `world.guests[id]` kept the OLD token hash and the next hello was a "returning guest" refused for a token it no longer had. No chat line and no `mp-guest-left` were emitted. And `upsertGuest` let a `welcome`/`presence` list (no peer id) overwrite a known peer id with nothing, after which that guest could never be matched to the peer that left.
- **Rule:** a departed peer is handled in ONE place (`forgetPeer`), and it touches every copy of the fact: the live row, the chat, `mp-guest-left`, presence, and the stored record. A record whose pilot has gone is a suitcase, not an identity — mark it (`left`); a fresh link re-admits it. Never overwrite a known correlation id with a missing one.
- **Enforced by:** `tests/multiplayer-playtest14.test.mjs` (leaving is removed/announced/ship gone; a returning pilot gets in with a new token).

### L36. A guard that returns `false` reads as "nothing happened" to every caller
- **Seen:** owner, playtest 14 — "clicking the bring pilot home doesnt do anything... Im stuck in the menu."
- **Cause:** `comeHome()` opened with `if (!leaveVisit()) return false;`. From the title there is no session to leave, so it returned before unpacking anything, and the caller showed nothing. The same shape hid the second half: unpacking used the ACTIVE save, which on the title is not the open world's, so even a caller that got that far had no profile to unpack into.
- **Rule:** a function that can do nothing says why — never a bare `false` into a UI that reads it as "no change". And a screen working on a record that is STORED rather than loaded says which save it means (`bringPilotHomeAtMenu({ mode })`) instead of assuming the active one describes it.
- **Enforced by:** `tests/multiplayer-playtest14.test.mjs` (coming home from the title unpacks the stored mode save) and the `multiplayer-ui` assertion that `leaveVisit()` is no longer a precondition.

### L45. A panel raised by an event has to leave on its own
- **Seen (owner, playtest 20):** *"Chat when a message is said then the chat is visible. However it
  doesnt go away. Should go away after maybe 6-7 seconds unless the user has pinned the chat."*
  The box was drawn for the whole session, so a line that arrived while nobody was looking stayed
  over the glass until the player opened a menu.
- **Cause:** visibility was a property of the *session* (`a session is on and no panel owns the
  screen`), not of the *news*. Nothing owned the end of the event, so there was no clock to run
  and nothing to stop.
- **Rule:** anything that appears **because something happened** needs three things written with
  it: a clock that takes it away, a switch the player owns to keep it (here **Pin**, with its own
  word on the button), and one reason it may stay while the player is mid-action (a half-written
  line). Make the decision a pure function of `{pin, typing, saidAt, now}` so the timer is the
  only untested part.
- **Enforced by:** `tests/multiplayer-ui.test.mjs` — "playtest 20: the chat shows a line and takes
  itself away, unless it is pinned": hidden before anything is said, up inside `CHAT.autoHideSec`,
  gone after it, pinned and typing keep it, a panel or the title does not.

### L44. A secret one side strips has to be put back by the other
- **Seen (slice 5, found by the reconnect test):** rejoining in a **fresh session** — what a closed tab
  or a lost connection leaves — was refused as *"that link has already been used"*. The copy a guest
  keeps is the copy the **host** sent back, and a host never keeps a token (`guestRecord` deletes it),
  so the guest had nothing left to prove itself with. Every live-session test passed, because a
  session still holds the copy it packed.
- **Rule:** when one side deliberately does not store a value (a secret, a hash, a session token),
  every later send takes it from the field that survives (`away.token`), never from the copy it was
  removed from. And a rejoin is not a variant of a live session: test it with a **new** session,
  because that is the only shape a restart has.
- **Enforced by:** `tests/multiplayer-slice5.test.mjs` — "rejoining after a loss keeps the version the
  server already has", which starts a second guest session against the same host.

### L43. A rule with no caller is not a feature
- **Seen (slice 5, found by writing the test that should have passed):** the host was to write a
  visiting pilot's suitcase back every couple of seconds. `writeBack` and its trigger existed and the
  docs described both — but the loop was never written, so a guest came home with the copy it
  arrived with.
- **Cause:** each piece was tested on its own and passed; nothing tested the **seam** — that something
  calls the piece on a clock, in a live session. A function nothing calls passes every test it has,
  because the tests call it themselves.
- **Rule:** when a slice promises a loop ("kept current", "every N seconds"), the test runs two
  sessions and asserts the other side's copy changed **without the test calling the function**, and
  the docs name the caller. Before claiming a loop is built, grep its callers: if only tests call it,
  it is not built.
- **Enforced by:** `tests/multiplayer-slice5.test.mjs` — "the host writes what a visiting pilot
  became, not only what it arrived with", which drives `syncGuests` from the session's own clock.

### L42. A screen that replaces the menu must earn it, every time, by evidence
- **Seen (owner, playtest 18):** leaving a host's world put the laptop on *"Your pilot is in hostpc's
  world"*, and that card's own **Main menu** button re-raised it on the next draw.
- **Cause:** the condition was *the away marker exists*, true for the whole visit, so the card was the
  title screen for as long as the visit lasted; nothing compared the copies. A flag describing *what
  happened* (the pilot left) was used as if it described *a problem* (a newer copy is waiting).
- **Rule:** a screen that takes the menu's place is raised by a **press** and justified by **evidence at
  that press**, not by a state that persists. When a flag means "an event happened", ask what the
  player can *do* right now; if the answer is "only sometimes", it needs a companion test and a door
  that leaves the flag alone. And a comparison needs a defined answer for a **tie** — decide it
  deliberately (here: a tie is NOT newer) and write the reason down.
- **Playtest 20 corrected the second half of this** (owner: *"logging into the guests own open
  world does not give a prompt to bring their pilot home. It should to confirm its updating to
  the local open world to latest version of their pilot."*). The evidence a press needs is not
  that two copies differ — that is a question the player cannot see — but that the player is
  about to do something the state forbids: **while the pilot is away, Open World always asks**,
  and the comparison only labels the card. Evidence gates the *screen*; it must not be so narrow
  that the screen the player asked for never arrives. **And a refusal at one door is not a refusal**
  (playtest 20, A3): while the away marker is set, *two* doors reached the pilot's own galaxy, so it
  was not paused at all. Put the guard where every door ends (`enterGameMode("open")`), not beside
  the press that happened to be reported.
- **Enforced by:** `tests/multiplayer-playtest16.test.mjs` — the card is drawn only when
  `ui.awayCard` was raised by the press; Open World asks unconditionally while away and passes
  `newerCopyAway()` to the card as a label; a tie, a missing pair, damage and lockers are all NOT
  newer; and "a pilot that is away cannot fly its own world — one guard, every door".

### L41. A control that is disabled whenever it would be useful is not a control
- **Seen (owner, playtest 17):** *"Multiplayer on/off button doesnt work so i cant test the build properly."* The owner could not test
  multiplayer at all: the switch was greyed out and read Off.
- **Cause:** two conditions, each sensible alone: the switch was drawn from `hosting` only, so a
  **visitor** saw Off, and it was `disabled` whenever visiting. Worse, the pause card draws the
  **host** block while Leave lives in the **join** block, so a guest saw a dead switch and no exit.
- **Rule:** a control is disabled only when pressing it could not possibly do anything, and **every
  state a screen can be in leaves the player a way out from that screen**. If a state exists where
  the control reads a value the player cannot change, make it work there or do not draw it. When
  two screens offer the same exit, draw it on both: "the other screen has a button" is not a way
  out of the screen you are on.
- **Enforced by:** `tests/multiplayer-playtest16.test.mjs` — a visitor's switch is On, pressable and
  leaves the visit; the Leave button is drawn beside it.

### L40. A button that borrows another button's action inherits its refusals
- **Seen (owner, playtest 17):** the away card's **Bring pilot home** answered *"your pilot is in your friends world, bring it home
  from the card first"* — a sentence written for a *different* button, telling him to press the button he had just pressed. In the
  same report: the card had no way back to the main menu at all, so he was stuck on it.
- **Cause:** `comehome()` was `ACTIONS.intro()` — the Open World action — on the reasoning that "a
  pilot at home is a pilot at home". The previous round made `intro()` **refuse** whenever a pilot
  is away, which was right for Open World and turned the card's own button into a refusal arguing
  with itself. The card also replaced the whole title screen with nothing but save decisions.
- **Rule:** an action says what the *player pressed*, not which other action it resembles — two
  buttons that reach the same place today are still two, and coupling them makes every future
  refusal on one a lie on the other. And every screen that replaces the whole menu needs one
  control that makes **no** decision about the save (a way back): "cancel" must always exist.
- **Enforced by:** `tests/multiplayer-playtest16.test.mjs` — `comehome` must call `bringPilotHomeAtMenu` and must not call
  `ACTIONS.intro()`; the card must render a Main menu button whose action touches neither the suitcase nor the visit. Reverting the
  routing fails two tests (in this file and `playtest15`).

### L39. A screen that closes itself cannot ask the question it exists to ask
- **Seen (owner, playtest 16):** "I join a multiplayer world, it joins without letting me click the bring my pilot prompt it
  just joins." The owner played a whole session with no pilot in it, and clicking the button fast enough to beat the join put them on
  the away card instead.
- **Cause:** the only **Bring my pilot** button lived on the **join screen**, and a successful join **closes that screen and enters
  the world** (`afterJoined` → `mp-enter-world`). The control was destroyed by the event it was supposed to follow, so it was never
  on screen at the moment it was needed — and the one time it was clicked, it won a race and the world-entering code then saw an away
  pilot and bailed out to the card.
- **Rule:** a prompt that must appear **after** an action cannot live on the surface that action closes. Ask *the surface the player
  is now looking at* — and derive "should this be showing?" from session state on the bus (`mp-bring-prompt`), never latch it, and let
  a screen that mounted late ask again. If a successful action and a required question happen in that order, the question belongs to
  the next screen.
- **Enforced by:** `tests/multiplayer-playtest16.test.mjs` — a real two-session join asserts the prompt appears on join and goes once
  the pilot crosses; the wiring tests assert the card is its own element, is asked for by `net/` over the bus, and that `afterJoined`
  still enters the world. Reverting the derivation fails three of the six.

### L38. A save seam has two shapes, and guessing the wrong one looks like a broken save
- **Seen (owner, playtest 15):** the away card became a trap. *"Bring pilot home"* always answered
  *"Your pilot's save could not be read, so it cannot come home yet"*, and it still removed the
  laptop's row from the host's players list while leaving it on the card.
- **Cause:** `saveKit.read()` returns a **MODE** save (`{ profile, world, away }`); `bringPilotHomeAtMenu`
  was written against the dual-mode **ENVELOPE** and read `root[mode]`, which is `undefined` on a mode
  save — so it refused before it looked at the suitcase, and the blame landed on the player's data.
  Two things made it worse: `joinWorld` refused *every* join while an away marker existed, including a
  rejoin to the world the pilot was standing in; and `comeHome` left the visit *before* opening the
  suitcase, so a refusal cost the connection as well.
- **Rule:** a seam that can hand you one of two shapes must **say which one it is** in one place and
  accept both (`isModeSave`), and write back the shape it was given. A refusal refuses only the thing
  it objects to — a guard against "visiting another world" is not a guard against the world you are
  visiting. And do the work that can fail **before** the step that destroys state.
- **Enforced by:** `tests/multiplayer-playtest15.test.mjs` — a mode save comes home with its locker, an
  envelope still works, an unreadable save refuses, a real rejoin connects with the pilot away, a
  different world is refused; and `tests/multiplayer-ui.test.mjs` asserts `bringPilotHomeAtMenu` runs
  before `leaveVisit`.

### L37. A key that names a place must be checked against the place that will read it
- **Seen (owner, playtest 14):** a stack bought at a station only the host's world has came home filed
  under that station's key, in a galaxy with no such station: counted, saved, unreachable for ever. A
  stack that had waited at the host's Meridian came home to Meridian instead of its own station,
  though its `origin` was still in the record.
- **Cause:** `checkIn` filed a locker at `locker.station` without asking the HOME world whether it has
  that station, and passed `relocate` no index — so it fell back to "does `world.stationStores` have
  that key", the wrong question for a station that has never held anything. `relocate` had the right
  rule all along (`origin` first); the home path never asked it.
- **Rule:** every function that FILES something by place asks the world that will read the key, not
  the world it came from — and asks with the world's station index (`stationsOfWorld`), not with
  whatever happens to be in its stores. Coming home prefers `origin`, so a stack that waited
  elsewhere returns to its own station.
- **Enforced by:** "cargo bought at a station only the host's world has comes home safely" and "a stack
  that waited at the host's Meridian comes home to its OWN station" in
  `tests/multiplayer-carry.test.mjs`; reverting the fix fails both.

### L32. A reset that only wipes the mode you are standing in reads as "reset does not work"
- **Seen (owner, 2026-11-21):** "Resetting save does not reset fully. Credits arent changed to 600. You own a test ship."
- **Cause:** Reset wiped only the *current* mode's half of the dual-mode save, while its words promise "Wipe credits, ships, base and contracts" — the other mode's pilot survived intact.
- **Rule:** a control's words are its contract: Reset wipes **both** halves (`resetAllSave` in `state/state.js`, staying in the mode pressed from); label any per-mode wipe as one.
- **Enforced by:** `tests/reset-save.test.mjs` (both halves dirtied; after a campaign reset both read 600 cr, one Wasp).

### L31. Direct-from-plant fallback and pre-check `setDraw` let a `0 MJ` ship fly and show phantom MJ/s

- **Seen (owner, 2026-11-18):** unequipping the power cell left the tank at `0 MJ`, yet the ship still flew and showed `Using X of Y MJ/s`.
- **Cause:** `hasPower` fell back to `p.gen >= mjps` when `p.stored === 0`, `player.js`/`shield.js` called `setDraw` before checking power, and wall-blocked mining beams bypassed `hasPower`.
- **Rule:** every system with `draw > 0` requires `p.stored > 0` (`hasPower`) and records `setDraw(..., 0)` whenever unpowered.
- **Enforced by:** `tests/slice3-assets-inventory-power.test.mjs`, `tests/content.test.mjs`, `tests/shield.test.mjs`.

[More lessons](archive/reticle-and-recovery-lessons.md) — L17, L20 and L21–L29, moved verbatim to
keep this file under its size limit.
