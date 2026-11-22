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

## 2026-11-22: Multiplayer UI & session fixes (connection gate, progress bar, host/guest leave)

- **Connection gate & progress UI (`src/net/session.js`, `src/ui/multiplayer.js`):** `joinWorld()` now waits for the host's `welcome` handshake (`waitForWelcome`) before entering the open world, so a guest never spawns unconnected or needs to press Reconnect in Pause → Multiplayer. While connecting, the UI displays a live percentage progress bar and status label (`Joining relays…` → `Looking for host…` → `Found host, connecting…` → `Handshaking with host…` → `Connected!`).
- **Host leaving kicks guests (`src/net/session.js`, `src/ui/multiplayer.js`):** when the host leaves, connected guests are stopped, returned to the main menu (`mp-host-left`), and shown `"The host closed the game."`.
- **Leaving updates player list (`src/net/session.js`):** when a guest leaves, the host removes them from `guests` and broadcasts updated presence.

## 2026-11-22: The game carries its own relay — one-link join works across networks

**The owner's report first, because it settles the whole slice:** *"i have successfully sent a message
over 4g, and i only used a link."* The one-link join he asked for in playtest 5 works on two different
networks, with no offer/answer codes. What made it work was one relay server actually being saved
(playtest 13) — nothing else in the pipeline was broken.

So the relay is no longer something a player has to find:

- **`ICE.turn` is now the game's own ExpressTURN free-tier account** — its two free doors,
  `turn:` 3478 UDP and `turn:` 3478 `?transport=tcp` — replacing the three public families (Open Relay,
  freestun, AnyFirewall) that measured **dead** from the owner's PC in playtest 11. A fresh install
  can cross networks with nothing typed. The TLS door on 5349 is a **paid** plan's, so it is not
  listed: a door that cannot answer is worse than a shorter list. `ICE.turnName` gives the screens one name to quote
  ("ExpressTURN (free tier, built into the game)") so the words cannot drift from the list.
- **A player's own server is still first.** `turnServers()` = theirs, then the built-in;
  `builtinRelays()`/`builtinRelayName()` export the built-in for screens and tests, and `asIceServer()`
  keeps our `name` label out of the `RTCIceServer` the browser sees.
- **The panel says what is in use without being asked**: *"In use: ExpressTURN (free tier, built into
  the game) — nothing to set up (3 addresses)"*, the three boxes are described as an override, and the
  button is now **Use the built-in relay**. A code with `0 relay` paths blames *whichever* server was
  in force — the built-in one too.
- Same change in the code path: `paste.js` builds its ICE list from `ICE.turn` (label stripped), so the
  copy/paste codes carry the same relay.

**Files:** `src/data/multiplayer.js` (`ICE.turn`, `ICE.turnName`), `src/net/turn.js`
(`builtinRelays`, `builtinRelayName`, `asIceServer`), `src/net/paste.js`, `src/ui/multiplayer.js`,
`src/net/settings.js` + `src/net/README.md` + `docs/architecture/multiplayer.md` (words), tests.

**Tests: 976, all green** (was 974). Two new: the built-in relay has a TCP door and a plain 3478 door and
always a login; and the panel says the built-in relay is in use, quotes a player's own instead, and
blames it when a code has no relay path. **Save v29. Build id: `2026-11-22j`.**

**The one risk, stated plainly:** that login is in a public repository, so anyone can use the owner's
free-tier allowance (ExpressTURN's free plan: 1000 GB a month, TCP and UDP on 3478) and the owner
could exhaust it by accident. If the built-in relay stops
answering, the fix is the one entry in `src/data/multiplayer.js` — regenerate in the ExpressTURN
dashboard, paste the new three strings, `npm test`, `npm run build`. Nothing else knows the address.

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

## 2026-11-22: Playtest 12 of slice 3 — a relay server the player actually has (ExpressTURN)

The owner found a free TURN provider (ExpressTURN) and pasted its block, which exposed two things
the relay fields could not do with a real provider's text:

- **ExpressTURN prints the address with no `turn:` in front** (`free.expressturn.com:3478`), and the
  parser refused it. A bare `host:port` is now read as `turn:host:port` — in `cleanUrl` too, so it
  works in the address box whether or not it came through the paste path.
- **A provider prints several doors** (UDP 3478, TCP 3478, TLS 5349) and a phone on 4G may only be
  allowed the TCP or TLS one. Comma-separated addresses are all kept, and the hint says so.
- A credential ending in `=` (ExpressTURN's do) survives the paste and the `TRTURN:` round trip.

**Files:** `src/net/turn.js` (`cleanUrl`, `parseRelayText`), `src/ui/multiplayer.js` (the hint),
`src/data/multiplayer.js` (`BUILD = "2026-11-22h"`).

**Tests: 971, all green** (was 970). One new: ExpressTURN's own block, and the three doors of one
server. **Save format unchanged (v29).** **Build id: `2026-11-22h`.**

## 2026-11-22: Playtest 11 of slice 3 — the free relay servers are dead, and a guest can finally see why

**The owner's two facts end the relay-server question:**

- `Relays reachable: 3 of 5`, `Relays connected: 10` — the **signalling** relays are fine, and have
  been all along. "Your network blocks the relays" was wrong.
- **Test relay servers** answered *"None of the 3 relay servers answered from this machine, so co-op
  cannot cross networks"*, and the code says `Code paths: 1 local, 1 public, 0 relay`. So the free
  public TURN servers (Open Relay, freestun, AnyFirewall) are **dead** — that, and nothing else, is
  why a laptop on 4G cannot join a PC on ethernet. No amount of code makes a dead server forward a
  packet; a player needs a relay they control.

- **A guest now has Connection details.** The join surface had no diagnosis block at all, so a guest
  could only ever say "I am alone" — no build, no room count, no code paths, no relay fields
  (owner's report). `screenHtml` puts the details (and the relay block) on the join surface.
- **One paste sets a relay server.** `parseRelayText()` reads whatever a provider prints — the
  `turn:…` block with `username:`/`credential:` lines, JSON from a dashboard, or a `TRTURN:` line —
  and fills all three fields; **Copy relay settings** makes that line, so the second machine is one
  paste instead of six. `Save relay` says to press **Start again**, because a code carries the
  servers that existed when it was made.

**Files:** `src/ui/multiplayer.js` (join-surface details, relay paste/copy, save message),
`src/net/turn.js` (`parseRelayText`, `packRelay`), `src/data/multiplayer.js`
(`BUILD = "2026-11-22g"`).

**Tests: 970, all green** (was 968). Two new: the guest's screen, and the provider block / JSON /
packed round trip.

**Save format unchanged (v29).** Rebuild needed. **Build id: `2026-11-22g`.** The next step is not
code: a free TURN credential (Metered's free tier) entered once on each machine.

## 2026-11-22: Playtest 10 of slice 3 — the free relay servers are the suspect, so test them and allow your own

**The owner's block rewrote the theory again:** `Relays connected: 10`. The signalling relays are
open — ten sockets — and there is still nobody in the room. So "the network blocks the relays" is
wrong, and the code path's 4G failure is the thing to fix. A code can only cross two different
networks if it carries a **relay (TURN) candidate**, and the free public TURN servers (Open Relay,
freestun, AnyFirewall) are exactly the kind of thing that stops working quietly.

- **A relay test, in the game.** `net/turn.js` `checkTurnServers()` opens a connection with
  `iceTransportPolicy: "relay"` against each configured server: a `typ relay` candidate means the
  server authenticated us and will forward packets, and nothing means it is down, the login is
  wrong, or the network blocks it. **Test relay servers** in Connection details prints
  *"2 of 3 relay servers answered"* or *"None of the 3 … answered from this machine, so co-op cannot
  cross networks"*. That sentence is a diagnosis, not a mood.
- **Your own relay server.** `settings.relay` (`tr_mp`) holds an address, a username and a
  credential, and Connection details has the three fields, **Save relay**, **Test relay servers** and
  **Use the free ones**. `turnServers()` tries the player's own first; `iceServers()` feeds both the
  code path and the library path. A provider's free tier (Metered, Twilio, Cloudflare) is a relay
  that actually works, and now it is a setting rather than a code change.
- **No more "Relays reachable: 0 of 0".** The probe is only printed when it ran; the library's own
  socket count is printed whenever the room exists, and it is asked as soon as a session starts.
- **The details carry the two facts that explain a silent room:** `Code paths: N local, N public,
  N relay` and **this machine's clock**. A nostr relay filters by time, so two machines whose clocks
  disagree can sit in one room and never see each other — a failure that looks exactly like a
  blocked network.
- **A failed code says which failure it was:** with no relay path, *"this code has no relay path, so
  it only works between machines on the same network. Press Test relay servers…"*; with one,
  *"could not find a path to each other, even through a relay server"*.

**Files:** new `src/net/turn.js`; `src/net/settings.js` (`relay`), `src/net/paste.js` (live ICE config,
failure wording), `src/net/transport.js` (`turnServers`, clock, honest relay rows),
`src/net/session.js` (`testTurn`, `saveRelay`, probe on start), `src/ui/multiplayer.js` (relay block,
`Code paths`, clock), `src/data/multiplayer.js` (`BUILD = "2026-11-22f"`).

**Tests: 968, all green** (was 965). Four new: the player's own relay (and the half-filled one being
refused), the relay test's counting, the details' clock and code paths (and never "0 of 0"), plus the
settings shape change in the existing tests.

**Save format unchanged (v29).** Rebuild needed. **Build id: `2026-11-22f`.**

## 2026-11-22: Playtest 9 of slice 3 — a code that can cross networks (the 4G case)

**The owner's report.** The offer/answer codes connect a laptop and a PC on the same wifi, and
fail when the laptop is on **4G**. That is not a bug in the exchange: two machines behind different
NATs share no address they can both reach, and a mobile carrier never gives one. The only thing
that saves it is a **relay (TURN) candidate** in the code.

- **Why the code had none.** Gathering was cut off after **4 s**, and relay candidates are the slow
  ones (they come from a server, and on a phone they arrive over TCP/TLS 443 because UDP is often
  blocked). `ICE.gatherMs` is now **8 s** and `net/paste.js` waits that long.
- **More than one TURN family, all with a TCP/443 door.** `ICE.turn` lists the free Open Relay
  entry, freestun.net and AnyFirewall, each with a `?transport=tcp` or `turns:` variant: port 443 is
  what a mobile network allows, and a free server can be down.
- **The code says what it can reach, before it is sent.** `paste.js` counts the candidates it
  gathered by kind (`paths()`/`hasRelayPath()`) and the screen prints, above the code: *"This code
  carries a relay path, so it works between different networks (a phone on 4G included)"* or *"no
  relay path — only local addresses… only works between machines on the same network"*. The session
  says the same thing once, in the message line, when the code is made (`noteCodePaths`).
- So a code that cannot cross networks now says so instead of silently failing, and the relay
  servers it needs are the ones a phone can actually reach.

**Files:** `src/data/multiplayer.js` (`ICE.gatherMs`, `ICE.stun`, three TURN entries,
`BUILD = "2026-11-22e"`), `src/net/paste.js` (candidate counting, gather window, `paths`),
`src/net/session.js` (`noteCodePaths`, `snapshot().codePaths`), `src/ui/multiplayer.js`
(`codePathsHtml` above the offer code).

**Tests: 965, all green** (was 961). Four new: candidate kinds counted from a fake peer connection
(local-only vs relay), the TURN list's TCP/443/TLS doors and the gather window, the two sentences in
the codes block, and the session's own note.

**Save format unchanged (v29).** Rebuild needed. **Build id: `2026-11-22e`.**

## 2026-11-22: Playtest 8 of slice 3 — the codes connected, and opening your own world now leaves a visit

**The owner's report that changed the picture: the offer/answer codes worked.** So the two
machines *can* reach each other; the only broken link in the chain is the relay introduction. That
narrows the one-link work to the rendezvous itself (see the next entry when it lands) and makes the
code path a proven floor rather than a theory.

- **Opening your own world ends a visit** (owner, playtest 7). Visiting is a *connection*, and it
  used to survive the trip to the main menu: "Open World" put a guest back into their friend's
  session, still hailing a world they had walked away from. `session.leaveVisit()` leaves only a
  **guest** — a host's own world is the same room before and after the menu, so nothing is
  disconnected for them — and `ui/menu.js` runs it in the title's **Open World** (`comeHome`), before
  the world loads.
- **The pilot comes home through the suitcase**, not by having its marker deleted: if the save
  carries `state.away.suitcase`, `comeHome` runs `custody.checkIn(currentRootSave(), suitcase)` — the
  same rule slice 4 uses, so this path cannot drift from it. Until slice 4 writes a suitcase the
  local save is already the latest copy, so the marker is cleared and nothing else changes.
- The session also records that it is on **`isVisiting()`**, which the screen and the next slice both
  need.

**Files:** `src/net/session.js` (`shouldLeaveVisit`, `leaveVisit`, `isVisiting`, `focusForTest`),
`src/ui/menu.js` (`comeHome`, wired into the Open World action).

**Tests: 961, all green** (was 959). Two new: leaving a visit (guest leaves, host does not, the world
id comes back) and the title wiring, including that a fresh join never counts as leaving.

**Save format unchanged (v29).** Build id still `2026-11-22d`.

## 2026-11-22: Playtest 7 of slice 3 — the relay route taken off its pedestal, and no multiplayer in the campaign

**What the owner saw.** Playtest 6's blocks: both machines on `2026-11-22c`, the **same** world id,
**3 of 5 relays reachable** on each, and still one browser in each room with nothing sent. So the
pinning did not fix it, and the number that matters ("does anything reach the other machine?") is
not the one we were printing.

- **The library's own view of the relays is now on screen: `Relays connected: N`.** A relay can open
  a plain WebSocket and still refuse *this game's* events (`blocked:`, `restricted:`,
  `auth-required:`) — the library retires it on the spot, silently, and then two players have no way
  to meet even though every relay "answers". `transport.js` reads `getRelaySockets()` from the joined
  room and reports how many sockets it kept, so **`reachable: 5 of 5, connected: 0`** is now a
  sentence the screen can say (and does, with the code path offered beside it).
- **More than one family of relays.** The pinned list keeps the popular relays *and* four of the
  library's own curated ones: a relay that is alive but will not carry this protocol is worse than a
  dead one, because it counts as reachable.
- **The code path stops being a footnote.** When nobody has appeared after `NET.helloWaitSec` the
  session marks itself **stalled** (`net/session.js`, `armStallTimer`), the host's screen says
  *"Nobody has appeared in your room… use the codes"*, and **the offer code is made by itself** (once
  per screen opening, `autoOfferWhenStalled`). A stalled **guest** gets the paste box on the pause
  card — before, a guest who never got in was treated as "already in a friend's world" and had
  nothing to do at all.
- **The code path can use a TURN server.** `net/paste.js` now adds `ICE.turn` beside its public STUN,
  always: a player who resorted to codes has already been told the easy way failed, and a home
  router with no hairpin NAT is the usual reason the remaining question (a path) has no answer.
- **No multiplayer in the campaign's pause card** (owner's request). `multiplayerAvailable(mode)`,
  applied in `ui/pause.js`; a live session keeps the row so it can still be switched off.

**Files:** `src/data/multiplayer.js` (relay families, `BUILD = "2026-11-22d"`), `src/net/transport.js`
(library sockets in the diagnostics), `src/net/paste.js` (TURN), `src/net/session.js` (stall timer),
`src/ui/multiplayer.js` (`Relays connected`, the stall warning, auto-offer, `multiplayerAvailable`),
`src/ui/pause.js` (the campaign's card).

**Tests: 959, all green** (was 953). Six new: the library's socket count and its warning, the
campaign's pause card, TURN in the code path, the wider relay list, the stalled host/guest screens,
and the stall timer's rule.

**Save format unchanged (v29).** Rebuild needed. **Build id: `2026-11-22d`**.

## 2026-11-22: Playtest 6 of slice 3 — the *five random relays* were the problem, and Esc

**The owner's two copied blocks settled it.** Both machines: Build `2026-11-22b`, World id
`w-o8fHGjrzXzyrGxSE`, Signalling `finding`, **Browsers in the room: 1**, **sent 0 / received 0**.
Same build, same room id, nobody in either room. That is not the network path and not the
handshake — the two browsers were never *introduced* to each other, so no ICE, no TURN and no
`hello` could matter. (TURN only helps once a peer exists.)

**Why the introduction failed.** The library picks its signalling relays like this:
`shuffle(30 public relays, seed = appId).slice(0, 5)`. The seed makes it the same five on every
machine, which is why this looked impossible — but it also means *this game got five particular
relays*, and for `appId = tallowreach.p2p` they were
`relay.primal.net`, `nostr.chaima.info`, `nostr-pub.wellorder.net`, `nostrelay.circum.space`,
`relay.dwadziesciajeden.pl` — three of them obscure or dead. Both players were subscribing to the
same dead rooms.

- **`RELAYS.relayUrls` is no longer empty.** It names the long-running public relays
  (`relay.damus.io`, `nos.lol`, `relay.nostr.band`, `relay.primal.net`, `nostr.mom`,
  `nostr-pub.wellorder.net`); the transport already passed them as `relayConfig.urls`, so the
  library uses those instead of its shuffle.
- **Relay health on the screen.** `transport.checkRelays()` opens a WebSocket to each relay in use
  and returns `{ total, open }`; the session republishes it and Connection details shows
  **Relays reachable: N of 5**. **0 of 5** means the player's network blocks the servers that do
  the introduction, which no amount of Reconnect can fix — and the block now says so in words and
  points at the code path. It is asked when the screen opens and again on **Reconnect** (cached 20 s).
- **The code path is named the same way everywhere.** The button is now **No relay? Copy/paste
  codes**, and the "nobody else is in that room yet" sentence points at it. That path needs no
  relay at all: two codes go through a chat window.
- **Esc closes the multiplayer screen** (owner's small bug). `src/main.js`'s pause key now asks
  `isMultiplayerScreenOpen()` **first** and calls `closeMultiplayer()`; one press puts the screen
  away and leaves the pause card (or the title) underneath, exactly like its Close button.

**Files:** `src/data/multiplayer.js` (`relayUrls`, `BUILD = "2026-11-22c"`), `src/net/transport.js`
(probe + `setRelayProbe`, `checkRelays` in diagnostics), `src/net/session.js` (pass-through, the
sentence), `src/ui/multiplayer.js` (relay row, blocking warning, button label, Esc-facing helpers
already exported), `src/main.js` (Esc), `src/net/paste.js` + `testing/TESTING-16-MULTIPLAYER.md`
(wording).

**Tests: 953, all green** (was 949). Four new: the pinned relays and that the transport passes them;
relay health is measured and lands in the diagnostics; the details block says "N of 5" in words and
warns only at 0; Esc closes the screen before the pause chain. The file also stubs the probe off
globally — no test may open a real WebSocket.

**Save format unchanged (v29).** Rebuild needed. **Build id: `2026-11-22c`** — both machines must
show it. New: if the two browsers still do not meet, the Connection details screen answers *why*
(0 of 5 relays vs 5 of 5), and the code path works with no relay at all.

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

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
- 2026-11-21: Yaw is the slow axis, roll the fast one — per-ship axis tuning
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
- 2026-11-15: A skybox generator, so every new instance can have a dark, realistic 4K sky
- 2026-11-15: The Test Ship — a 1-credit hull with 100× Hull HP and 10× damage, flown with the owner's GLB
- 2026-11-14: Models and collision are real models now — drop-in `.glb` files, hulls flush with the drawing
- 2026-11-14: Two owner bugs, part two — the Sell/Discard confirm sits with the cursor, and hunt contracts clear the area they were taken in
- 2026-11-14: Three owner-reported bugs — the Alt camera locks to the hull, one primary fires at a time, no tags over the menu
- 2026-11-14: The rift wears real space too — the deep rift its own sky
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
- 2026-11-08: Plot system destinations and jump the route with J
- 2026-11-08: Remember starmap view across closing and travel
- 2026-11-08: Align newly fired cannon visuals with the interpolated hull
- 2026-11-08: Tame galaxy chart drag speed
- 2026-11-08: Step 11B starmap refinements — permanent core labels, zoom-scaled pan/cores, clickable gate neighbours (owner playtest pending)
- 2026-11-08: Step 11B system-map follow-up — free local warp and named central bodies (owner playtest pending)
- 2026-11-08: Step 11B starmap UI follow-up — zoomed system maps, right-click warp, compact overview (owner playtest pending)
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
- 2026-11-08: Step 8 ticked; step 9 split saves (v13) and per-pilot rules — playtest pending
- 2026-11-08: Step 8c owner playtest passed
- 2026-11-08: Step 8c scoped implementation complete — playtest pending
- 2026-11-08: Step 8c in progress — explicit flight, shields and damage
- 2026-11-08: Step 8c started — player-specific transforms and launches
- 2026-11-08: Step 8b complete and ticked
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
