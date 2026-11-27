# Lessons archive: L37–L41 (multiplayer custody & menu navigation)

Moved out of [docs/LESSONS.md](../LESSONS.md) verbatim on 2026-11-27 to keep it under its size limit.
Read them when a task touches multiplayer suitcase custody (`checkIn`/`bringPilotHomeAtMenu`), away-card routing, or post-join modal visibility.

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
