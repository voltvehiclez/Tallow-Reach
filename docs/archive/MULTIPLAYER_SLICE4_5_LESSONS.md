# Lessons archive: L37–L44 (multiplayer custody, rejoin & menu navigation)

Moved out of [docs/LESSONS.md](../LESSONS.md) verbatim on 2026-11-27 to keep it under its size limit.
Read them when a task touches multiplayer suitcase custody (`checkIn`/`bringPilotHomeAtMenu`), away-card routing, or post-join modal visibility.

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
  that leaves the flag alone.
- **Playtest 20 corrected the second half of this, twice over** (owner: *"logging into the guests
  own open world does not give a prompt to bring their pilot home"*, then *"Doesnt matter if
  nothing has changed, game should always try to use the latest pilot version since even small
  things like pilot position can change."*). The evidence a press needs is not that two copies
  differ — that is a question the player cannot see — but that the player is about to do something
  the state forbids: **while the pilot is away, Open World always asks, and its answer always
  takes the copy that world holds.** A comparison that decides whether to *offer* the one act that
  brings the pilot back is a comparison deciding nothing: the comparison is gone (`isNewerCopy`,
  `newerCopyAway` deleted), and `shipPlaces`/hull damage move with no number changing.
- **Playtest 21 finished the shape: a rule that closes a door must leave a room to stand in.** A3's
  guard soon stopped *every* way into the open world, so a player who had just sent their pilot sat
  on the join screen with nothing to press — the right rule, enforced one screen too far. When the
  honest answer is "this is not built yet", build a **named stand-in** and say what it is in one
  sentence (a notice when the world opens), rather than locking the door and explaining the lock.
- **Enforced by:** `tests/multiplayer-playtest16.test.mjs` — the card is drawn only when
  `ui.awayCard` was raised by the press; Open World asks unconditionally while away and compares
  nothing; "coming home takes the copy that world holds — a tie is not a reason to skip it"; and
  "the visit opens the stand-in world and says it is not your friend's".

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
  a screen that mounted late ask again. If a successful action and a required question happen in the order, the question belongs to
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
