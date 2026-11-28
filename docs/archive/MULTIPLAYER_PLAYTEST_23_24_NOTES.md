# Multiplayer Playtest 23 & 24 Notes (archived from `docs/architecture/multiplayer.md`)

Archived verbatim to keep `docs/architecture/multiplayer.md` under its 30 KB doc budget.

## Playtest 23: a friend is a ship like any other, and a pilot can always come back (built `2026-11-25b`, repaired `2026-11-25c`)

The owner's playtest of 8a reported two bugs. Both were fixed **inside slice 8a** — re-sent as
`2026-11-25b`, not renamed — with tests that fail on the old code.

**1. "Cannot select a friend's ship."** 8a drew the hull and stopped there, and a visiting pilot was
never a target: `sim/targeting.js` offered only hostiles, rocks, crates, rifts, gates, canisters and the
station, `LOCK_KIND_BY_ROW` had no entry for the N list's pilot row (a **name-only** lock, no health),
and `ui/hud.js` drew bars for `k === "e"` alone.

The fix is one lock kind and one published fact:

- **`k: "p"`** is another pilot. `render/views.js` publishes **`state.otherPilots`** — the mirror of every
  pilot it draws, one **stable reference per pilot updated in place** (F compares by identity) and the
  only place a friend exists on a guest's screen, which is why the renderer writes it and `sim/`/`ui/`
  only read it, never back into a pilot and never into a save.
- `sim/targeting.js` `otherPilotsThere(player)` is the list F offers (reticle first, then the same cone
  hostiles get), `lockName` is **the pilot's own name**, and `pruneLock` drops the lock the moment the
  hull stops being drawn. The N list's `Ship` row maps to `"p"` like any other row, and **a docked pilot
  is a row too** (`d`): only **dead** and **another pocket** keep one out, so the filter carries every
  ship. `ui/hud.js` gives a `"p"` lock **the same two bars as a hostile's**, and **`sim/pilot-stats.js`**
  owns the two fractions so the host's screen and the wire cannot disagree; `shield` is on `SHIP_FIELDS`.

**A pilot lock fires nothing:** `sim/weapons.js` feeds a missile only from `F.lock?.k === "e"`.

**2. "Stuck on 85% handshake — the link has already been used."** The link was never the problem:
`custody.guestRecord` hashed whatever token it was handed, and the host's **write-back**, the `left`
mark and the final copy on `bye` all edit a guest record **without** the guest's secret. Each edit
re-hashed `undefined` over the stored `tokenHash`, so the record kept the hash of *nothing* and every
later hello failed the handshake — for ever, and read as intermittent because a `left` record is
re-admitted without a token check.

The rule now, in one line: **an update that carries no secret never changes the secret's hash.**
`custody.recordTokenHash(token, tokenHash, salt)` prefers a real token, keeps the stored hash
otherwise, and only hashes "nothing" for a brand-new record (the old shape). `putGuest` passes
`tokenHash: previous?.tokenHash` through. A real token still replaces the hash — that is how a pilot is
renamed onto a new browser. Tests: `tests/multiplayer-rejoin.test.mjs` (all five fail on the old code).

### Second round (`2026-11-25c`): the record the repair could not reach, and a hull that was only a picture

- **A repair cannot fix what is already stored.** A record whose `tokenHash` was the hash of *nothing*
  refused its own pilot for ever. `custody.recordHoldsNoSecret` now lets `handshake` admit it and answer
  **`repaired: true`** (and `putGuest` write the real hash), because a record that cannot identify
  anybody **must not refuse anybody**. **A record that does hold a secret still refuses a wrong one**: a
  narrow repair, not a weaker handshake (the unchecked invitation is step 17).
- **A `carry` never rewrites an existing record's hash** — the hello proved the identity and `away.token`
  may be an older build's leftover. **A refusal ends the attempt**, with the host's words in the chat and
  the menu notice.
- **A pilot's hull is a body.** `sim/player.js`'s **`pilotHullRadius(P)`** (`SHIP_RADIUS` × the hull's
  `SHIPS[...].sc`) and a **pilot-vs-pilot pass** in `flight()`: ships separate, ricochet (0.4) and pay the
  same `impact > 25 → 0.015/m·s` a rock does, a **docked** visitor included (its tick is skipped, so it is
  one hit per pilot per tick). Bolts and warheads stop on it, shields first, skipping the shooter, a wreck
  and another pocket.
- **Destroyed is said out loud:** `mp-guest-destroyed` (`sim/multiplayer.js` → `ui/multiplayer.js`) is a
  chat line saying the ship is gone and the pilot safe in its suitcase; recovery is still step-16 debt,
  so the words promise nothing. Tests: `tests/multiplayer-damage.test.mjs` (13).

## Playtest 24 (`2026-11-25f`): three corrections to what 8b shipped

The owner's first flight of 8b passed (*"the ship moves, rolls, shoots"*) and reported three things.

- **A repaired pilot came back damaged.** The guest's copy was right; this world refused it. The stale
  check trusted `record.left`, which is set by **both** a pilot going home and a dropped connection (and
  a returning hello clears it). And the pair cannot express it: a host raises `rev` on every write-back
  while a fresh `checkOut` starts at `epoch 0, rev 0`, so the copy with the repair looks older. A `carry`
  now carries **`fresh: true`** — "packed out of the pilot's own home save just now" — which only the
  guest can say. `sendCarry` sets it, a rejoin of a stored suitcase does not, and `onCarry` believes a
  fresh copy whatever the pair says. **`left` is admission only now**; the dropped-connection rule (this
  world's copy wins) keeps its own test.
- **The visitor's hull blurred** on a high-refresh host while it flew and the camera turned — the
  2026-11-08 sawtooth, on the one record that fix never reached. `snap` means "this frame is a jump, do
  not interpolate", and only `chaseView` cleared it, for the **local** hull; a visitor kept the flag from
  `launch()` for ever and so was placed at the last 60 Hz tick under a 240 Hz camera.
  `render/views.js` `poseOfRecord` consumes it after taking the pose: the jump frame is still a jump, and
  every frame after it interpolates like the rest of the sky.
- **The chat closed when its text was selected.** The field's `blur` handler closed an empty box, and a
  press on the lines blurs the field. A press on the conversation now starts a selection
  (`pressKeepsChat`, no DOM in it), redraws are held back so a line arriving mid-drag cannot wipe it, and
  text is selectable **only in the box opened with Enter** — a glance and a pinned box stay readouts.

Tests: `tests/playtest24-fixes.test.mjs` (5). No save change: `SAVE_VERSION` stays 29. Guide:
`../../testing/TESTING-16-SLICE8B-FIXES.md`.
