# Refactor plan: getting the code ready for the big game

> **Who reads what.** The **owner** (who does not code) follows "How to run a step". The **AI**
> (any model) follows "Rules for the AI" and the step it was given. Status of each step is tracked
> in [ROADMAP.md](ROADMAP.md). The destination is [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md);
> the game being built is [VISION.md](VISION.md).

A refactor step **changes how the code is organised, not how the game plays.** After each step the
game should look and feel identical, only now it can grow. That is what makes it safe to do with
an AI: you can prove nothing broke.

There are **15 steps in 4 milestones**. Do them **in order**, one step (sometimes one slice of a step)
per chat.

| Milestone | After steps | What it unlocks |
| --- | --- | --- |
| **A. Content-ready** | 1 to 5 | New enemies, items, loot, modules, ships and shop stock are **data-only** additions. You can start adding content here. |
| **B. Multiplayer-shaped** | 6 to 9 | The game logic runs without a screen, entities are plain data, there is a list of players, the save is split. Co-op becomes possible later. |
| **C. World-ready** | 10 to 12 | Sectors are data, a generated 100+ sector starmap, encounters and sector memory. The open world can scale. |
| **D. Story-ready** | 13 to 15 | A mission framework, wormhole instances and the campaign scaffolding. |

Multiplayer itself is **step 16**, planned with the owner on 2026-11-21 (the plan and its eight slices are at the bottom).
**Step 17 — dedicated servers — was added at the owner's request on 2026-11-22** (the plan is at the bottom); it
follows step 16 in the build order.

---

## How to run a step (for the owner)

**Once, before step 1**
1. Run `npm test` and play [testing/TESTING-BASELINE.md](../testing/TESTING-BASELINE.md) once. If anything is
   already broken, tell the AI at the start of step 1 (it is also worth fixing first).
2. Make a backup: zip the whole project folder and name it with today's date.
   Even better: put the folder in git (GitHub Desktop makes this point-and-click) so every step is one
   commit you can undo. Not required, but it is the best safety net there is.

**For every step**
1. Open a **new chat** with any AI. Attach the latest project zip. (If the AI cannot read zips,
   paste the files it asks for, starting with the docs listed in the starter prompt.)
2. Paste the **starter prompt** from [AI_PROMPTS.md](AI_PROMPTS.md), then the **step prompt**:

   ```
   Do refactor step <N> ("<title>") from docs/REFACTOR_PLAN.md.
   First read docs/VISION.md, docs/TARGET_ARCHITECTURE.md, docs/ROADMAP.md and the step itself.
   This is a refactor: the game must play exactly the same afterwards.
   Plan first, in plain language: what changes, whether to split it into slices that can each be
   played, and which of my open questions in VISION.md you need answered. Then wait for my OK.
   ```
3. Read the AI's plan. If it is too big, say **"split it into smaller slices"**: that is always
   allowed and usually wise. Answer its questions. Reply "go".
4. The AI gives you files. Copy them into your project, replacing the files with the same path.
5. Run `npm run build` and `npm test`. Then play [testing/TESTING-BASELINE.md](../testing/TESTING-BASELINE.md)
   **and** the step's own checks (the AI writes them for you). Also load an **old save** to check
   old saves still work.
6. **If it all passes:** zip the project as the new baseline (dated). Ask the AI: *"Rewrite
   docs/HANDOFF.md and tick the step in docs/ROADMAP.md"* if it has not already. Done.
7. **If something fails:** send the AI the exact error or what you saw, in the same chat. If two
   rounds do not fix it, **restore your backup** and start the step again in a fresh chat, telling
   it what went wrong last time. Never carry on to the next step on top of a broken one.

**Switching AIs between steps is fine.** The docs are the memory. Just always attach the *latest*
zip and never have two chats editing the project at once.

**Good to know**
- Some steps are big. Steps 6, 7 and 8 are the heaviest: expect several chats each. That is normal.
- You never need to understand the code. You need to run the two commands and click through the
  checklist.
- You can add content between steps once Milestone A is done (see ROADMAP.md).

---

## Rules for the AI (every refactor step)

1. **Read first:** VISION, TARGET_ARCHITECTURE, ROADMAP, this step, then the files it touches.
2. **Behaviour must not change.** The standing ground rules still apply ([HANDOFF.md](HANDOFF.md)):
   `FLIGHT` and `CAMERA` are settled, hulls identical apart from the hold, etc. The only exceptions
   are changes this step explicitly lists.
3. **The owner has approved the restructuring in this plan.** The old rule "keep the existing
   structure" is read as: *keep the folders and conventions; make the changes listed in the step.*
   Do not rename, move or reformat anything the step does not need.
4. **Plan first, then wait for the owner's OK.** Say plainly what will change. If the step is big,
   propose slices that can each be built, tested and played on their own, and do **one slice**.
5. **Ask, don't guess, on design questions.** If the step touches an open question in VISION.md
   and the owner has not decided it, use the *default* there, say so, and record it.
6. **Prove it with tests.** Keep all existing tests green; add tests for what you build. Where a
   step lists a "layer test" or content test, it is required. If you cannot run the tests or the
   build (no network is common), say so plainly and tell the owner exactly what to run.
7. **Saves:** change the save only where the step says so. Bump `SAVE_VERSION`, write a migration,
   and add a test that loads an old-shaped save. Never change storage keys.
8. **Update the docs in the same change:** `CHANGELOG.md` entry, `ARCHITECTURE.md` (rewrite the
   rule that changed, do not append a second one), `TARGET_ARCHITECTURE.md` (delete the closed debt
   row), folder `README.md`s, `HOW_TO_ADD.md` (recipes that changed), `ROADMAP.md` (tick the step),
   a `TESTING-*.md` for anything the owner will click, and `HANDOFF.md` if the chat is ending.
9. **Deliver complete files** with full paths (or a zip), never fragments, and end with the
   build/test reminder and plain-language test steps.
10. **No new npm dependencies** (until step 16 says otherwise).

---

# Completed steps (1 to 11)

Steps 1 to 11 (Milestones A, B and the first half of C) are finished. Their goal, questions, tasks and results are in
[archive/REFACTOR_PLAN_STEPS_1-11.md](archive/REFACTOR_PLAN_STEPS_1-11.md); their status is in [ROADMAP.md](ROADMAP.md).

# Completed steps (12 to 15)

Steps 12 to 15 — the rest of Milestone C and all of Milestone D — are finished and ticked in
[ROADMAP.md](ROADMAP.md). Their goal, questions, tasks and results are in
[archive/REFACTOR_PLAN_STEPS_12-15.md](archive/REFACTOR_PLAN_STEPS_12-15.md); this file keeps only the
steps still to build (16 and 17).

---

# Step 16: Multiplayer (host-run co-op)

**Status:** planned 2026-11-21 with the owner, one slice per chat. Slices **1–3 built**
(2026-11-21) and **playtest-confirmed by the owner 2026-11-22**; **slice 4** (`2026-11-23a`),
**playtest-confirmed 2026-11-24**, and **slice 5** (`2026-11-24f`) built; **slice 7** (`2026-11-24h`)
built and playtest-confirmed 2026-11-24; **slice 8a** playtest-confirmed 2026-11-25
(`2026-11-25d`); **slice 8b** (`e`) playtest-confirmed, its three reports fixed in `f` (a repaired
pilot arrives repaired; a visitor's hull interpolates; chat text is selectable).
**Build order changed by the owner 2026-11-24: 7, then 8, then 6 (trading last). The numbers
are names, not a schedule** (renumbering would falsify the archive and every guide).
**Multiplayer is open world only** — the campaign stays single player (owner, 2026-11-21).

**Slices 7 and 8 were added on 2026-11-22 and AGREED by the owner the same day** ("Also draw the
guest's ship", *"one world, two ships visible"*; the owner reviewed the eight and said *"that looks
good"*). They are the two halves of the plan's own multiplayer model — **the host's simulation and
the guest's screen** — and they were split apart because each is a feature nobody can test on its
own:

- **Slice 7 makes a second pilot exist in the host's world** (its record, its flight, damage,
  docking and Go home, and a flat **map blip** so the owner can *see* the second pilot is really
  there). Still two screens, two worlds.
- **Slice 8 makes the guest's screen the host's world** (snapshots of other pilots, controls
  going the other way, the host's scenery and pocket drawn by the guest). After it, two players
  fly the same sky and see each other's ships.
- **8b is a refactor with a decision attached.** Sending *controls* (principle 7, "input is a
  command") needs a new state written only by `core/input.js`; mirroring the local screen's input
  into remote players' `controls` is cheaper and wrong, and is named here so nobody takes it by
  accident.

**The owner's decision on dependencies (2026-11-21):** WebRTC is approved for the connection, kept
behind **one thin wrapper file** (`src/net/transport.js`). No other dependency is added. The owner
then chose **Trystero `0.27.0`** (MIT, pinned) for a **one-link** join, with the copy-paste offer
codes kept as the fallback for a network that will not reach a relay — see "The library decision"
below. The wrapper never leaks out of `src/net/`: `sim/` and `ui/` talk to it through events.

## What it is

Two players at most to start (the shape allows more): **one host** runs the world, and **one guest**
joins it through a link. The host's browser is the only writer of the truth; the guest sends what it
is asking its ship to do and draws what the host sends back.

- The host's ship stays in the host's own save, live, as today.
- The guest brings **its own pilot** (credits, ships, fits, holds, hull damage, missiles, selected
  weapons, station lockers) in a **suitcase**, and takes it home again through it.
- **Items are moved, never copied.** World-owned things never travel: station levels, built
  stations, the contract board, the galaxy, world changes. Missions, flags and stats stay in the
  home save; the host's world never runs a guest's missions.
- A pilot **lives in exactly one world at a time**: while `save.away` is set, the home pilot is
  frozen (it cannot be flown at home), and the one copy lives in the host's world and in the
  suitcase.
- Guard rails against accidents (a crash, a double join, an old backup), **not** against cheating
  (the vision's pillar 5).

## The shape, from the owner's plan

`save.away = { worldId, hostName, guestId, token, epoch, rev, suitcase }`, or `null`.

| Where | What it holds |
| --- | --- |
| home save, `away` | the marker: whose world the pilot is in, the secret token for that host, the ordering `epoch`/`rev`, and the suitcase (the pilot as the host last wrote it) |
| host save, `world.guests[guestId]` | `{ name, tokenHash, epoch, rev, bundle, lastSeen }` — the host's copy of each visiting pilot |
| its own key, `away:<worldId>` | the suitcase on its own, so two tabs never overwrite each other |

Ordering is always **`(epoch, rev)`**, higher wins, **never merged**. A guest's "Go home" raises
`epoch`; the host raises `rev` on every change to a visiting pilot. `compare(a, b)` is the one
function that decides, and the choice screen shows both summaries (`credits`, `ship count`).

## The transport, in plain language

**Owner's design (2026-11-21, binding for slice 3):** the guest joins by pasting **one link**. The
host opens Pause > **Open Multiplayer** and gets a join link; the guest pastes it under **Join
Multiplayer World** and is in. No second paste, no answer code in the normal case.

Browsers cannot accept a connection on their own, so the two browsers have to find each other
through something. That makes one small dependency unavoidable, which is exactly the allowance the
owner's rules make for "one small networking library for the connection, hidden behind a thin
wrapper file" (`src/net/transport.js` only: nothing else in the game may name it).

**Decided: Trystero** (`trystero@0.27.0`, MIT, the Nostr build) — the owner chose it on
2026-11-21. See "The library decision" below for the numbers it was chosen on. Copy-paste
offer/answer codes stay as the **fallback** for when the broker is unreachable: the wrapper offers
both, and the pause card says which one it is using.

How a join works with a broker, in the owner's one-link shape:

1. The host presses **Open Multiplayer > Create link**. The wrapper joins a room whose name is a
   hash of the world's id, and the link is `?join=<worldId>#<token>` — the secret rides after the
   `#`, which browsers never send to a server and never log.
2. The guest opens that link (or pastes it under **Join Multiplayer World**). The wrapper joins the
   same room, the broker introduces the two browsers, and they connect directly.
3. The handshake (slice 5's job, already written in `custody.js`) checks version, world id and
   token. A guest who is turned away learns why in one sentence.
4. The broker only ever carries the introduction. The game's traffic is peer to peer and encrypted
   by WebRTC itself, and nothing about a pilot is written to the broker.

The fallback keeps the old two-paste flow for a broker that is down: the host makes an **offer
code**, the guest pastes it and gets an **answer code**, the guest sends that back and the host
pastes it. It is one paste more, and it is the honest trade-off for a self-contained build.

## The library decision (settled 2026-11-21: Trystero)

The owner's rule is "no new npm dependencies except one small networking library, behind a thin
wrapper; ask first". Here is the question with the facts it should be answered on. **Measured
2026-11-21** against this project's own build, not from a blog post.

| | **Trystero** 0.27.0 (Nostr build) | **PeerJS** 1.5.5 |
| --- | --- | --- |
| Licence | MIT | MIT |
| npm packages added | **4** (`trystero`, `@trystero-p2p/nostr`, `@trystero-p2p/core`, `@noble/secp256k1`) — no wrapping of other libs | 6 (`peerjs`, `webrtc-adapter`, `@msgpack/msgpack`, `peerjs-js-binarypack`, `eventemitter3`) |
| Added to the single-file build (minified, esbuild, the game's own bundler) | **+151 KB** | **+86 KB** |
| Install size | 906 KB | 4.2 MB |
| Broker | **free public relays, no account, no keys** (Nostr relays, ten defaults, overridable list) | **PeerJS's public cloud** is free but has no uptime promise, and the project itself says to run your own server for anything real |
| Guest experience | **one link** — the owner's design | needs a peer id the guest types or a link carrying it; the host still needs a public server for signalling |
| Works from `file://`? | no signalling without a socket, but no server of ours either way | same |
| Risk if the free service disappears | edit one list of relay URLs in `src/net/transport.js` | point at a different public PeerJS server, or none exists |

**Why:** it needs no server of ours and no account; its build is its own code plus one small
secp256k1, so what we audit is what ships; and joining a room by name is the one-link shape the
owner asked for.

**The honest cost:** +151 KB, i.e. the build goes from 3,256 KB to about **3,407 KB** — roughly
4.6% bigger, in a single HTML file. PeerJS would be +86 KB (about 2.6%) but needs a single free
server with no promise, and does not give the one-link flow for free.

**First test on two browsers decides which path is the default** (a free relay can be slow or down
on any evening); the paste-code fallback exists for that.

**The owner chose Trystero on 2026-11-21.** So slice 3 adds `trystero` as the project's one
dependency allowance — **pinned to `0.27.0`**, the exact version measured above, and upgraded only
deliberately (a floating `^` would let a relay or API change arrive unannounced) — imported by
**`src/net/transport.js` and nothing else**; the paste-code path
needs no library and is built as well, because it is the one that must work when the broker does
not. Two things the owner should expect from the first test: the build grows by about 151 KB
(3,256 → ~3,407 KB), and a free relay can be slow or down on any given evening — the fallback
exists for exactly that, and the pause card says which path is in use.

## Slices (one per chat, each ends with `npm run build` and `npm test`)

1. **Custody, no networking.** `src/net/custody.js` plus its data list
   (`data/multiplayer.js`) and tests: `checkOut`, `checkIn`, `relocate`, `compare`. Proves the rules
   of travel on plain objects before a byte moves. **Built 2026-11-21.**
2. **Save v29.** `save.away` (beside the profile, `null` at home), `world.guests`, the migration
   (old saves load with `away: null`), `guestId`/`worldId`, the temp-key-then-swap write with the
   previous version kept, and the `away:<worldId>` key. **Built 2026-11-21:** `src/net/multiplayer.js` owns the field
   changes, `cleanAway`/`cleanGuests` in `state/profile.js` validate them, and `state/storage.js`
   does the swap-and-keep-the-previous write.
3. **The connection, a link, chat and the player list.** `src/net/transport.js` (the only file that
   may name a connection library) and the offer/answer flow. Pause > **Open Multiplayer** with the
   on/off switch and the join-link row; **Enter** opens chat with the connected-player list; the
   world does not pause while multiplayer is on.
4. **Join, "Bring my pilot", sync, "Go home".** The version/`worldId`/token handshake with a clear
   refusal for a version mismatch; the guest arrives docked at its active ship's station (flight
   positions never travel); the host raises `rev` and snapshots about two seconds later; reconnects
   take the higher `(epoch, rev)`; "Go home" works from the suitcase with the host offline.
5. **Crashes and reconnects.** `compare` decides when two copies disagree (a host loading an older
   save loses to a newer suitcase); a lost host returns the player to the **main menu** with
   "Lost connection to host", and rejoining keeps the copy the server has; a final copy on tab
   close (`bye`); one session per `guestId`, a newer connection kicks the older.
   **Built 2026-11-24a.**
6. **Trading** (**built LAST** — order 7, 8, 6). A **Trade** station tab beside Base/Saves
   lists the pilots docked here; another's **Trade** opens a two-half window on both screens
   (items, ships, credits), two confirms, and the host swaps at once only if the receiving station
   storage and hangar have room — else nothing moves.
   Design: [architecture/trading.md](architecture/trading.md).
7. **The visiting pilot is on the map.** Slice 4 had already made the visitor a real, docked record
   (`sim/multiplayer.js` via `mp-guest-arrived`), so what was left was visibility: `ui/starmap.js`
   `pilotBlips` reads `state.players` and draws the name under its system on the galaxy chart and
   under its pocket on the system map, and names **every** visitor with its system at the top of the
   side panel. **Built 2026-11-24.** The hull in space is slice 8. **Tests:**
   `tests/multiplayer-slice7.test.mjs`.
8. **One world, two screens — the ship on the glass.**
   - **8a — snapshots out (built 2026-11-25, `2026-11-25a`, awaiting playtest).** A `ships` message
     kind (`SHIP_FIELDS` in `data/multiplayer.js`; capped and cleaned like every other kind) sent at
     the ship-snapshot rate (20–30 Hz, owner 2026-11-24; a NEW value, `SHIP_STREAM` —
     `NET.snapshotSec` is the 2 s *profile* sync) for every pilot, so a guest's `render/views.js`
     draws them with interpolation. Remote ships are **views only** — no sim state, nothing writable.
   - **8b — controls in (built `e`, playtest-confirmed; fixes `f`).** A `controls` message kind carrying
     the control record plus `aim`, cleaned on arrival and length-capped, written into that peer's
     player record by its peer id (principle 7: input is a command, not a key). **The numbered
     decision:** `core/input.js` writes `state.controls` today and `sim/` may not import `core/`, so
     8b adds `state.localInput`, filled by `core/input.js` and read by the session — one new state,
     one new writer, recorded because it touches a rule.
   - **8c — the host's world on the guest's screen.** `state.place` and the scenery follow the host's
     pocket, the guest's sim skips world systems it does not own, and its pilot record is the one the
     snapshots drive; the guest's own galaxy stays loaded but not stepped.
   - **8d — the guest predicts its own ship (owner, 2026-11-24). ~~8e~~ — dropped (owner, 2026-11-27):** weapon effects ride the wire as
     host-confirmed events — the guest looks and hears single-player (see `docs/CHANGELOG.md`). Tick-tagged inputs, an `ack`
     carrying the whole predicted state, rewind-and-replay of unconfirmed inputs, a ~100 ms error
     blend and a snap only after a warp or respawn. Remotes are **interpolated, never predicted**,
     ~100 ms behind 20–30 Hz snapshots; damage, kills, loot, mining, inventory, docking and warp
     stay host-confirmed. The dry run `flight()` needs, the per-guest aim direction and lag
     compensation (deferred to playtests) are
     [architecture/client-prediction.md](architecture/client-prediction.md).

## Rules each slice must keep

- Content is data: the **list of fields that travel** is `data/multiplayer.js`, and the timings
  (snapshot interval, `lastSeen` window) are there too.
- Saves stay backward-compatible; `SAVE_VERSION` goes up only where its slice says so, with a
  migration and an old-save test.
- Systems talk through the event bus. Nothing in `sim/` or `ui/` imports `net/transport.js`;
  `render/` and `ui/` learn about remote pilots from events and from `state.players`, which already
  holds every pilot.
- A hosted world never pauses (pause is single player only), and the campaign is never hosted.

---

# Step 17: Dedicated servers

**Goal.** A world can be hosted by a **dedicated server** — a machine with no screen that runs the simulation
and streams it to everyone — so one port-forwarded server can host a single world for a **target of 50
players; the measured number goes in `src/data/multiplayer.js`**. Today a hosted world needs the host's
browser to stay open; step 17 makes the world survive without a human host and scale past two players.

**Prerequisites.** Step 16 must be fully done first, including the rules for other players that
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) still lists as step-16 work: **respawn and death for
non-local players** and **player presentation and input**. A server is a host with no screen, so it inherits
every rule a browser host already has, and none of them can be missing when the server arrives.

**What it is, in plain language.** Step 16 made one browser the authority (host-run co-op, peer to peer, one
link to join). A dedicated server is the same authority with no screen: it runs the **pure** sim (principle 2 —
the sim already runs in unit tests with no browser), holds the world, and every client sends its controls to it
and draws what it sends back. Two shapes must keep working side by side:

- **Peer to peer (step 16, unchanged):** two friends, one host browser. The default for a small group; nothing
  about it changes.
- **Server-run (step 17):** the server is the host. Everyone talks to the server and the server talks to
  everyone — a **star**, not a mesh — which is what makes a large group possible. The client is thin: controls
  in, snapshots out, exactly the shape step 16's plan already describes.

**The owner's answers (2026-11-22) — the questions are closed:**

1. **Where the server runs, and how browsers reach it: Minecraft-style port forwarding.** The server is a
   Node process listening on a TCP port; **anyone can run it** — on their own machine, on a rented server, or
   on a big host — and players reach it at the host's forwarded address (`host:port`), exactly the way
   Minecraft works. No domain name and no certificate are needed to start with: the game page opens a plain
   `ws://` connection to the forwarded port. **The dependency question stays open for approval**: Node has no
   built-in WebSocket server, so 17b needs either a small WebSocket-server library or a hand-written server —
   that is the one server-side dependency to approve under the standing rules. **17b is no longer blocked**:
   the route is picked, and the transport is a WebSocket listener on a forwarded port.
2. **Who joins: anyone — with an optional, modular auth.** A dedicated server may require auth or stay open.
   The auth is **modular** so it can be swapped later: the first implementation is **Supabase** (the owner's
   free plan covers 50,000 monthly users), behind a small auth interface the server uses, so a bigger or
   premium provider can replace it without touching the game. The step-16 suitcase model is unchanged: a
   player's stuff still lives in their own save — auth only answers *who is connecting*, and it is optional
   per server.
3. **Who may host: anyone.** Anyone who runs the build can start a server. The guard rails (17d admin) stay
   against accidents, not cheating (vision pillar 5).

**Do.**

- **The server is a build of the same project with no screen:** `sim/` + `state/` + `net/` only — no `ui/`, no
  `render/`, no `core/input.js` — running the fixed-step loop headless (`sim/step.js` already runs without a
  browser). The world it runs is an ordinary open-world save, and the suitcase rules of step 16 apply to every
  client exactly as they do to a guest today.
- **The transport wrapper gains a server role** in `src/net/transport.js` — still the only file that names a
  connection library — with the same `createChannel` vocabulary (`join/send/broadcast/leave/peers/state`), the
  server accepting connections instead of joining a broker room. `net/session.js` runs the same session against
  either role. **Nothing in `sim/` or `ui/` learns which shape it is talking to**: they speak the event bus and
  `state.players` either way.
- **Capacity is measured, not promised.** The target is 50 players; the number that ships is the one a load
  test measures, and the measured capacity numbers (max players, snapshot rate, the `lastSeen` window) live in
  `src/data/multiplayer.js` — the same tuning home step 16 uses. The real limits are the server's **upload
  bandwidth and CPU**, not a constant in code: as a rough illustration, 50 players × 20 updates per second ×
  a few KB each is tens of megabits per second of upload, which a home connection may not have and a VPS plan
  may cap.
- **The join link names a place.** `?join=<worldId>#<token>` gains the server's address: a dedicated server has
  no broker to introduce browsers, so the address itself is the meeting place. The owner's one-link shape stays
  intact.
- **Chat, the player list, presence and the handshake are unchanged** — they already run over the same session
  vocabulary.

**Slices** (one per chat, each testable on its own; build in this order):

- **17a — the headless server.** A Node entry that boots the sim on the fixed step, loads a world save, runs it
  with no screen, and answers a health question. Proves principle 2 end to end: the same world state a browser
  runs, run by a machine. Ships with a **one-command start script** (and a stop), so the owner can start and
  stop the server without editing code.
- **17b — the server's transport.** The server side of `transport.js`/`session.js`: clients connect,
  `custody.handshake` runs unchanged, the server keeps the guest list and chat. One client on a LAN first.
  **The route is the owner's answer above**: a WebSocket listener on a forwarded port, reached as
  `host:port` (Minecraft-style) — no domain or certificate to start with.
- **17c — snapshots and controls.** The server snapshots the world to every client on the step-16 timings and
  takes each client's controls as its input (principle 7: input is a command). Slice 4's sync rules are reused;
  a guest already draws what the host sends. **Each client receives only the entities near it (interest
  filtering)** — sending the whole world to 50 clients is what would kill the server, not the snapshot rate.
  **Immediately after 17c, the scripted headless load test runs** (a scripted batch of clients against the
  headless server), and **the capacity numbers are decided from it**: that measured number is what goes into
  `src/data/multiplayer.js`.
- **17d — scale, the public address, auth and server admin.** Port forwarding and the public address (the
  owner's route: Minecraft-style `host:port`), reconnects, the stall/relay diagnostics adapted to the
  server, the target re-measured against the real address, **the optional auth** (the modular adapter,
  Supabase first), and **basic server admin**: kick, ban, scheduled autosave, backups and a clean shutdown.

**Done when.** A server started on the owner's machine with the **one-command script**, reached over the
owner's chosen route, holds the **measured** number of simulated clients in the load test built right after
17c; a real browser joins that server with one link and flies next to a second browser; the peer-to-peer path
still works exactly as it does today; the owner can start and stop the server with the script, the short guide
in `testing/` and the server README, **without editing code**; `npm test` is green.

**Save.** No change unless a field is needed; if one is, bump `SAVE_VERSION` with a migration and an old-save
test. The world a server runs is a world save — the same shape a host browser runs today.

**Docs to update when this is built:** [VISION.md](VISION.md) (move "dedicated servers, accounts" out of
"Not planned" — the owner's answers are recorded in this section), [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md)
(rewrite the multiplayer model for the server shape), and the **dependency rule** in
[HANDOFF.md](HANDOFF.md) and this file (the scope of the one networking library, and whatever the owner
approves for the server's transport).

---

## If a step goes wrong
- Restore your backup. Start the step again in a new chat; paste what failed.
- If the AI says a step is too big, accept the slices. A tiny step that works beats a huge one that doesn't.
- If an AI proposes changing this plan, it must say why and update this file, ROADMAP.md and
  TARGET_ARCHITECTURE.md itself, with your OK.
