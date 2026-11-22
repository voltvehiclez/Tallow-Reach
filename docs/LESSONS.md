# LESSONS: classes of bug earlier chats hit, so you do not repeat them

*Last checked: 2026-11-21.*

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

### L17. A recorded-state fixture only proves what changed if you diff it
- **Seen:** fixing the spare Wasp changed the recorded 8b lifecycle fixture, which failed as a long unreadable deep-equal.
- **Rule:** when behaviour changes on purpose, re-record the fixture and diff old against new. Accept it only if every difference
  sits inside the behaviour you meant to change — here snapshots from the death onwards changed and every earlier one was
  identical, which is the evidence the fix did nothing else. Say so in a comment beside the fixture's test. A blanket re-record
  that "makes the test pass" would hide real regressions.
- **Enforced by:** the comment above the fixture assertion in `tests/single-player-combat-8b.test.mjs`.

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

### L20. A frame that throws stops the picture but not the loop, so a one-line bug plays as a dead game
- **Seen (owner, step 14 playtest):** "the game crashes … a few seconds after you've destroyed the last guardian" —
  a frozen screen, no message, and the only word about it a line in the browser console nobody was looking at.
- **Cause:** `main.js` asks for the next frame *before* it does the frame's work, so an exception inside a frame leaves
  the loop alive and the last good image on the glass: the game is running and looks dead. The pasted error was from a
  stale build, but the shape of the failure is the lesson — anything that can throw in front of the player takes the
  whole game down with it, silently.
- **Rule:** work that can throw in front of the player is caught where it happens, **said on screen in a sentence with
  the error's own first line** (`ui/crash.js`, `reportCrash`), and the picture is drawn anyway. A repeat is counted, not
  listed (a per-frame error would bury the sentence in a second); the card lists a few distinct problems and says how
  many it left out. The net listens only to what the browser reports as uncaught plus the frame loop's own catch — no
  `sim/` module may call it and no game rule may depend on it, and a test that expects an error still gets it thrown.
- **Enforced by:** `tests/crash.test.mjs` — the card's sentence and where it came from, repeat counting, the four-line
  cap with its "and N more" line, dismissal, and that a broken `document` cannot itself become the crash — plus the
  `frame`/`drawFrame` split in `main.js`.

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

### L33. A control that only exists in the state it creates, and a switch drawn from a wish

- **Seen (owner, step 16 slice 3):** "There is no option to paste a link", "no way to get a link to
  copy", "it says *Make a fresh offer first*" — and a chat box that kept the typed line and said nothing.
- **Cause:** the guest's paste box was drawn only for a guest session, which only that box could make,
  so joining had no entrance; the host switch was drawn from the stored setting, so it read On while
  `hostWorld` had refused; that refusal went into an element the state never rendered; and the offer
  code was wiped by the redraw after making it. Every one is a reader and a writer that never met
  (L19) inside one screen.
- **Rule:** every control must work in the state it is drawn in, a control's words describe the live
  object and not the wish (L32), a refusal goes to an element that is always on screen, a value the
  player must copy lives in the model rather than the DOM, and a one-shot message is latched only
  once it has actually left.
- **Enforced by:** `tests/multiplayer-ui.test.mjs` (no name ⇒ no switch and no Join; a failed host
  snaps Off with its sentence on screen; the offer survives a redraw; Connect exists only with an
  offer; chat says why a line was not sent) and `tests/multiplayer-paste-join.test.mjs` (the hello
  over the code wire arrives once and is admitted).

### L34. A control that cannot take the cursor is a control that does not work

- **Seen (owner, playtest 2 of slice 3):** "only the host can chat — the guest can view the messages
  but can't open chat to type a word"; and "pausing when multiplayer is open still pauses the game,
  both guest and host".
- **Cause:** the chat box hid its own input unless that input already had the cursor, and a `[hidden]`
  field cannot be given the cursor — so the field never came back and the keys went to the ship. The
  same file also asked the DOM ("does the input have focus?") the question its own state should have
  answered. And `state.multiplayer = !v && isOn()` set the "the world keeps running" flag to false at
  the exact moment the pause card opened, which is the one moment it was there for.
- **Rule:** whether a thing is open is the model's business, not the DOM's — a `hidden` element cannot
  be focused, clicked or typed into, so unhide it *before* asking for the cursor; and a flag that means
  "this is happening" must never be derived from the UI that is asking about it.
- **Enforced by:** `tests/multiplayer-ui.test.mjs` (`chatVisibility`, the order inside `openChat`, and the
  sim gate with `state.paused` and `state.multiplayer` both set) and `tests/multiplayer-session.test.mjs`
  (the old `!v &&` is asserted gone).

### L35. "Sent" is not "heard", and one machine is not two

- **Seen:** playtests 3 and 4, second machine: the guest joined "but I am the only one there" every
  time, and the first press of **Join** did nothing.
- **Cause:** (a) the hello was latched as sent when the send returned, and between two machines the
  channel opens after the room reports the peer, so it went nowhere, unrepeated; (b) the name field
  committed on `change`, a click blurs the field first, and that redraw replaced the button under the
  cursor before mouseup; (c) two tabs on one machine always connect — they share a process — so no
  network path between two *machines* looks like a working connection from inside.
- **Rule:** a message is done only when the other side answers (the reply is the latch); a
  `change`/`blur` handler must update in place, because replacing the DOM under the pointer eats the
  click; and **a same-machine test proves the logic, never the wire** — so put the wire's facts
  (sent/received, ICE state) on screen, and keep a second path (a relay) to try on both ends.
- **Enforced by:** `tests/multiplayer-ui.test.mjs` — the lost-hello retry, the no-redraw commit, the
  relay escalation, the Connection details block.

### L36. A default list that is shuffled by a seed is still a *guess* about the outside world

- **Seen (owner, playtest 5):** both machines reported the same build and the same world id, both
  `finding`, and **one browser in the room with zero messages sent** — for a whole evening, through
  three rounds of Reconnect.
- **Cause:** the transport had no relay list of its own, so the library shuffled its thirty public
  signalling relays with the app id as the seed and took five. The seed guarantees the *same five*
  on both machines (which is why the report looked contradictory: nothing differed), but it also
  guarantees nothing about those five being alive — this game's five included three obscure or dead
  servers. Both players subscribed to the same silence, so the introduction never happened and
  every later layer (ICE, TURN, the handshake, the retry) was being debugged for a problem three
  layers below it.
- **Rule:** never let a dependency *choose* which outside server you depend on — name it, and if the
  choice is a default list, treat "which entry" as part of your configuration. When a feature
  depends on reachability of something outside both machines, **measure that reachability and show
  it**: `Relays reachable: N of 5`, 0 meaning "no retry will ever help". And before blaming the
  path, read the counters — `sent 0 / received 0 / 1 in the room` means no peer, which means no
  path to blame.
- **Enforced by:** `tests/multiplayer-ui.test.mjs` section 11 — the pinned list and the transport
  passing it, the probe landing in the diagnostics, the "N of 5" row and its warning at 0.
- **Follow-up (playtest 8):** the same lesson one layer down. The codes worked on one wifi and failed
  on 4G, because a code is only as good as the **path kinds** it carries, and gathering was cut off
  before any relay candidate could arrive. A gathered code now reports `paths()` — host, srflx,
  relay — and the screen says "same network only" *before* the code is sent, not after it fails.

### L37. A health check that asks a different question than the feature does

- **Seen (owner, playtests 6 and 7):** the screen said `Relays reachable: 3 of 5` on both machines,
  which read as "the network is fine", and the two browsers still never met.
- **Cause:** the check opened a WebSocket and counted a handshake as health. The feature needs
  something else entirely: a relay that accepts *this game's* events. A relay can open a socket and
  then answer `blocked:`, `restricted:` or `auth-required:`, and the library quietly retires it — so
  the number was true, irrelevant, and reassuring, which is the worst kind. Beside it, the report's
  `Browsers in the room: 1` had already established that no peer existed, which a healthy relay count
  made look like a contradiction instead of a clue.
- **Rule:** a health check must exercise **the exact step the feature needs** (here: the library's own
  socket pool, `getRelaySockets()`, not a lookalike), and must be shown **next to** the outcome it is
  supposed to explain, so a mismatch is visible instead of plausible. And when a chain has a fallback
  that shares no dependency with the failing link, **promote the fallback before perfecting the
  diagnosis** — the codes needed no relay at all and were sitting behind a footnote for two rounds.
- **Enforced by:** `tests/multiplayer-ui.test.mjs` — the `Relays connected` row and its warning, the
  stalled-session screens (host and guest), and the code path's TURN fallback.

## Template (copy for a new entry)

```
### Ln. Short name of the class of bug
- **Seen:** what the owner saw, in their words.
- **Cause:** the general cause, not the one line of code.
- **Rule:** what must always be true.
- **Enforced by:** the test(s) or linter rule that fail if it breaks. If there is none yet, write
  "NOT YET: add a test" and add it in the same change.
```

### L30. Event counters and wrong-station reads misrepresented live mission inventory

- **Seen (owner, 2026-11-18):** Mission log item progress ignored pre-stored goods, stayed full after selling/discarding ore, and checked `state.place`'s store instead of the mission's hand-in station.
- **Rule:** item-requiring missions report live inventory counts (`missionItemRequirements`), scoping hand-ins to `missionHandInStation` plus the active ship hold and script `take-item` steps to their target container.
- **Enforced by:** `tests/slice1-speed-missions-contracts.test.mjs` (mine, deliver, recovery, cargo hand-over, story collect, parallel items and cross-station reads).

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

[More lessons](archive/reticle-and-recovery-lessons.md) — L21–L29, moved to keep this file under its size limit.
