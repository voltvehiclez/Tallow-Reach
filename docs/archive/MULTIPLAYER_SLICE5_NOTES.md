# Slice 5 notes: crashes and reconnects, and the away card (moved out of `architecture/multiplayer.md`)

Slice 5 is playtest-confirmed, and these notes are history rather than a description of live work.
They are kept **word for word**; the rules they state are still in force and are enforced by the tests
named in `tests/multiplayer-slice5.test.mjs`. Moved 2026-11-25 to keep
`docs/architecture/multiplayer.md` under its 30 KB limit. The one thing that changed after this text
was written is playtest 23's fix to the guest record's hash — read the section
*"Playtest 23"* in the live file for that.

## Slice 5: crashes and reconnects (built 2026-11-24a, reworked 2026-11-24b)

Four rules, and one hole closed:

- **A lost host is a lost room** (owner, 2026-11-24: *"returned to the main menu with a prompt saying
  something like lost connection to host … Like Minecraft."*). Stated once by the session
  (`markHostLost`, `mp-host-left`), for a departing peer **and** for silence (`checkHostAlive`:
  nothing from the host for `NET.lastSeenSec` while a `ping` waits for its `pong`); then
  `ui/multiplayer.js` stops the session **quietly** (no one left to say `bye` to) **before** the
  menu shows **"Lost connection to host"** (`state.ui.lostHost`) with **one** door, *Main menu*. It
  asks no question about a save (L40) and touches none.
- **Rejoining keeps the version the server has** (owner: *"when reconnecting to the server after a
  disconnect your pilot's last version is already on the server"*). A rejoin is an ordinary join: the
  hello re-admits the pilot (a `left` record is proof of nothing), the guest re-sends its copy, and
  `compare` lets the newer win. **The secret is put back on the way out:** the copy a guest keeps is
  the host's copy and a host keeps no token, so `sendCarryMessage` fills it from `away.token` —
  without that, a rejoin in a fresh session was refused as "that link has already been used".
- **The copy is kept current.** `writeBack` had no caller until this slice: `syncGuests` asks `sim/` for
  each visitor's live profile every `NET.snapshotSec`, raises `rev` on a real change (`NET.revStepMs`
  floor) and re-sends an unchanged copy every `NET.suitcaseRepeatSec` — without it a guest came home
  from the copy it arrived with.
- **`compare` decides, never arrival order** (`onCarry`): a host loading an older save loses to a newer
  suitcase; a stale `carry` does not roll the world backwards (the record stands and its copy is sent
  back); a **`left` record hands over its own save**, because a pilot home since is the newest truth
  about itself. A *dropped connection* is not that case (the hello re-admits first). A tie takes the arriving
  copy.
- **The chat box takes itself away** (owner, playtest 20: *"it doesnt go away … unless the user has
  pinned the chat"*; 12 s since 21, and your own sent line counts). A line — anybody's — shows it for
  `CHAT.autoHideSec`; **Pin** keeps it, and so does an open field. `chatKeepsOpen({ pin, typing,
  saidAt, now })` is the whole rule; only the timer is untested (L45). **Glancing, typing and pinned
  are three boxes**: a glance is the chat alone, across the full width — the players column and the
  **Pin** button exist only while the field is open (`body:not(.mp-chat-open) #mp-chat-pin`, playtest
  22), which is also how a pinned box is unpinned (Enter brings the button back). The column is 54 px
  with no indent, names ellipsize at 12 px, and past `CHAT.whoRows` (10) it adds `+N more`. The button
  keeps the word **Pin**, its state in its colours (L32, L46).
- **A departure is said, and a pilot lives in one window.** New kind **`bye`** (a guest session
  stopping, and `pagehide`/`beforeunload`): the host writes the final copy back, marks the record
  `left` and takes the ship out. A hello for the same `guestId` from a different live peer is a
  **takeover**: the older window is told (`refuse` reason `replaced`), stops **quietly** (no `bye`),
  and the record is not marked `left`. `ping`/`pong` ride the keepalive, writing `lastSeen`.

## The away card (owner, playtests 18 and 20) — moved 2026-11-25, word for word

**Away means this world is paused, and the card says so** (owner, playtests 18 and 20 — playtest 20
replaced the "only if newer" gate):

- The **main menu is always the main menu** (playtest 18): leaving a friend's world lands somewhere
  ordinary, never on a save question.
- The title's **Open World** press lands on the card. A player already in a visit reaches the world
  from the multiplayer screen instead, and gets the **stand-in** (playtest 21): today that is this
  browser's own galaxy holding the pilot's latest copy, said in a notice when it opens, because the
  wire carries no world state until slices 7-8. The stand-in is a look, not progress — the travelling
  half is in the suitcase, and `captureActiveModeSave` folds no live facts into a save that is away.
- The card *"Your pilot is in Ada's world"* appears **only** on an **Open World** press, and it
  appears **every time** while the pilot is away: the press is a custody decision either way.
- **Nothing is compared** (owner, playtest 20: *"even small things like pilot position can
  change"*): **Bring pilot home always installs the copy that world holds.** A `newerCopyAway` /
  `isNewerCopy` pair used to weigh credits and cargo first, and it is deleted — the travelling half
  is a photograph, not a rival, and `shipPlaces` or hull damage move with no number changing.
- The card has **two** buttons — **Bring pilot home** and **Main menu**. **Rejoin was removed**
  (playtest 18): rejoining is *main menu → Join Multiplayer World*, one path that explains itself.

