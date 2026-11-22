# Changelog archive

## 2026-11-21: Playtest 5 of slice 3 — the report that says which failure it is

**The owner's clue that narrowed everything:** the guest was told *"Nobody is hosting the world in
that link yet"*, which that sentence only says when **the room has no other browser in it**. So the
two machines were never in the same room — this is not the network path, not the handshake, and not
the relay. Something is wrong before the first message.

- **Connection details now answers it in one look** (`diagFacts`/`diagReport`): **Build** (two
  machines showing different strings are not running the same file), **World id** (both must match),
  signalling state and its sentence, **Browsers in the room** (this browser included), the direct
  link's own state, relay on/off, and **sent vs received**.
  - 1 browser in the room on both machines → they are in *different rooms*: a different world id, or
    one of them is not hosting. Check the two World ids.
  - 2 in the room, sent climbing, received 0 → the room is right and the path is not (the relay
    handles that).
  - Different **Build** strings → the machines are running different files.
- **Copy details** puts all of it on the clipboard as one block, so a player who does not read code
  can send it back.
- **The host's half is named too:** "A browser is in the room but has not identified itself" when a
  peer is there and nobody was admitted; "No other browser is in this room" when there is nobody.
- **A room that dies quietly is reopened.** A backgrounded tab, a slept laptop or a dropped relay
  leaves the transport in `lost` and it never recovers by itself; the session's watchdog
  (`startKeepalive`) reopens it at most once every ten seconds, with the relay setting it was using.
- **The "nobody there" sentence** now names the two World ids to compare instead of guessing at the
  host's switch.

**Files:** `src/data/multiplayer.js` (`BUILD`), `src/net/session.js` (watchdog, sentence),
`src/ui/multiplayer.js` (`diagFacts`, `diagReport`, the block, `copy-diag`), `src/styles.css`.

**Tests: 949, all green** (was 946). Four new: the room count and build in the block, the paste-ready
report (both roles), the host's two warnings, and the watchdog's rule.

**Save format unchanged (v29).** Rebuild needed (`npm run build`). **Build id: `2026-11-22b`** — both
machines must show it.

## 2026-11-21: Playtest 4 of slice 3 — the path between two machines, and a relay for when it fails

**What the owner saw.** The laptop takes the host's link (a `file://` page on the PC), joins, and
says "you are the only one there" — every time. Two tabs on one machine were fine all along.

**Why two tabs always worked and two machines never could.** The room is found on both sides, and
both sides believe they are connected: the signalling relay introduced them. What never happens is
the *data* connection — the two browsers must find a network path to each other, and a home network
usually offers none: the router will not send a packet back to itself (no hairpin NAT), so the only
remaining candidates are the two machines' local addresses, which Chrome hides behind `*.local` mDNS
names — and a firewall or a router that drops multicast throws those away. Two tabs on one machine
never notice, because they share a process. Nothing in the handshake, the retry or the protocol was
ever wrong: there was no wire to send it down.

- **A relay, after the direct attempt fails.** `ICE.turn` in `data/multiplayer.js` (the free Open
  Relay project, HTTPS/TCP fallbacks included) is passed to the library as `turnConfig` — but only
  after `NET.helloWaitSec` of a direct attempt: 12 seconds with a browser in the room and no hello
  admitted. **Both ends escalate**, because a relayed path needs a relay candidate from each side; the
  host arms its own timer when it sees a peer. The screen says *"The direct connection did not open.
  Trying a relay server — this can take a few seconds."*
- **A Reconnect button**, which does the same thing on demand.
- **Connection details on the screen**, because "you are the only one there" is not a diagnosis:
  signalling state, the direct link's own `connectionState`/ICE state, relay on/off, and
  **messages sent vs received**. Sent climbing while received stays 0 is the signature of this whole
  class of failure, and it is a line a player can read out.
- The transport grew `restart({ useTurn })` and `diagnostics()`; the session grew `reconnect()`,
  `escalateToRelay()`, a host-side timer, and `snapshot().diag` / `snapshot().relay`.

**Files:** `src/data/multiplayer.js` (`ICE.turn`), `src/net/transport.js`, `src/net/session.js`,
`src/ui/multiplayer.js`, `src/styles.css`.

**Tests: 946, all green** (was 942). Four new in `tests/multiplayer-ui.test.mjs`: the details block,
its absence with no session, the Reconnect action, and the relay escalation driven from **both**
ends by a relay that drops every hello (the fake relay now records each join's config).

**Save format unchanged (v29).** Rebuild needed (`npm run build`).

## 2026-11-21: Playtest 3 of slice 3 — a hello that is answered, a click that is not eaten

The owner joined from a second machine. It nearly worked, which is the interesting part.

**What the owner saw.** "I can join via 2 browser tabs, but on my separate laptop I cannot join the
host on my PC properly: it opens an open world with a chat box but says I am the only one there."
"The first Join click did nothing and showed the hint; the second put me in a world." "As the guest
I cannot see the host in the player list, only my own name — but I can see the host's messages."
Plus: taller chat box, and "Who is here" → "Current players".

**Two bugs, one cause each.**

1. **A hello that was "sent" and never heard.** The guest said hello once per peer and latched it as
   done when the send call returned. Two tabs on one machine open their data channel almost
   immediately, so that looked right; two *machines* open it seconds after the room says the peer is
   there, and a hello sent into a channel that is not open yet is gone — quietly. The guest sat in a
   world of its own, the host's chat arriving (one broadcast per line) and its name never in the
   list. Now the guest repeats its hello every `NET.helloRetrySec` (2) until a `welcome` lands, the
   reply is the latch, each round clears the per-peer latch, and the host logs "joined" once per
   guest however many hellos arrive. After `NET.helloWaitSec` (12) with no answer the player is told
   — with a different sentence for "nobody is in the room" than for "your friend is there but
   nothing is getting through" — instead of sitting there looking connected.
2. **The first Join click was eaten.** The name field committed on `change`, and clicking a button
   blurs the field first: the commit redrew `#mp-card-inner` between mousedown and mouseup, so the
   button under the cursor was replaced and no click event fired. A fresh browser always has a
   pending name commit, which is why only the laptop showed it. The commit now updates in place
   (`refreshLiveness`, which also carries `#mp-msg`); nothing in that path replaces the card.
3. **The guest's player list was missing the host.** `guests` only ever holds guests, so a guest
   built its column from "me" plus its own row as the host listed it. The session now keeps the
   host's name from `welcome` (`snapshot().hostName`), and both the chat column and the screen's
   list are built by `chatWhoRows` — you, the host, then everyone else, never twice.

- **Chat box:** `#mp-chat-lines` max height 132 → **264 px** (the owner asked for double), and the
  column heading is **Current players** in both the box and the screen.
- **A TURN knob, not a change of behaviour.** `RELAYS.rtcConfig` in `data/multiplayer.js` (null by
  default) is passed to the library as its `RTCConfiguration`, for two networks that cannot reach
  each other directly. Nothing changes unless somebody fills it in.
- **Not built, on purpose:** still no remote ship. Slice 4.

**Files:** `src/net/session.js`, `src/net/transport.js`, `src/ui/multiplayer.js`,
`src/styles.css`, `src/data/multiplayer.js` (`helloRetrySec`, `helloWaitSec`, `rtcConfig`).

**Tests: 942, all green** (was 937). Five new in `tests/multiplayer-ui.test.mjs`: the guest's column
after a welcome, the lost-hello retry (a relay that drops the first hello), the commit-without-redraw
rule, the doubled height and the "Current players" heading. The fake relay gained a
`dropFirst` switch for it.

**Save format unchanged (v29).** Rebuild needed (`npm run build`).

## 2026-11-21: Playtest 2 of slice 3 — one door each, names with stars, a chat that stays open

The owner's second playtest, in five reports. Two were bugs, one was a rule about the build, and
two were new rules the slice should always have had.

**What the owner saw.** "I can see who joined in the chat — add a compact player list to the right
of the chat box." "Make it so you can only join from the main menu, and only open multiplayer from
the pause menu when in your actual world." "Pausing the game when multiplayer is open still pauses
the game, both guest and host." "If a guest joins as the same username, rename them with an
asterisk." "Only the host can chat — the guest can view messages but cannot open the chat to type a
word. Let me chat even when nobody has joined, so I can scroll up through the history."

- **Pausing still paused.** `ui/pause.js` set `state.multiplayer = !v && isOn()`, so the "a hosted
  world never pauses" flag went **false** at the one moment it existed for — while the card was
  open. It is now `isOn()`, for host and guest alike, and the card releases every held control key
  on the way in, so an online world keeps stepping (and does not fly itself) behind the card.
- **The guest could not type.** The chat box hid its own `<input>` unless that input already had the
  cursor, and a `[hidden]` field cannot be given the cursor: the field never came back and the keys
  went to the ship. The box now owns an explicit open/closed flag (`chatVisibility`), unhides the
  field before focusing it, and draws its own log.
- **Chat with nobody there.** A line no one can hear is still shown on this screen (in the box's own
  40-line log, which is what "scroll up" means) and the note says who can see it; the two refusals
  ("only you so far" and "could not be reached") are separate sentences.
- **The player list is a column.** `#mp-chat-who` is now an `<aside>` beside the lines with one
  15-pixel row per pilot ("Who is here", you first, never twice), so the chat box no longer spends a
  line on names.
- **One door each.** The title menu's screen is the **join** block only; the pause card's screen is
  the **host** block only (`screenModel().surface`, set by `openMultiplayer({ from })`, refused a
  second time inside `act()`). A guest mid-flight still gets the answer code and Leave from the
  pause card, because that is the only screen they can reach. Quitting to the title now closes the
  room: hosting is something you do while flying your own world.
- **Duplicate names get stars** (owner's rule): the host hands out the first free variant — `Acey`,
  then `Acey*`, then `Acey**` (`uniqueName` in `net/session.js`) — stores it, lists it and greets the
  guest with "You are Acey* here — the host already has a Acey." Chat is attributed to the name the
  host handed out, not the one that was typed. The stars are trimmed off the base so a renamed name
  still fits `NET.nameMax`. `welcome` carries `youName` for it.
- **Not built, on purpose:** you cannot see the other pilot's ship. Drawing a remote ship, and
  moving a pilot between worlds, is **slice 4** — slice 3 deliberately moves nothing a player owns.

**Files:** `src/ui/multiplayer.js`, `src/ui/pause.js`, `src/ui/menu.js`, `src/net/session.js`,
`src/net/protocol.js`, `src/data/multiplayer.js` (`CHAT.historyLines`), `src/styles.css`.

**Tests: 937, all green** (was 931). Seven new in `tests/multiplayer-ui.test.mjs`: the name rule on
its own and through the real handshake, `chatVisibility`, a chat line with nobody there, the player
column, the two doors, and the sim gate with `state.paused` **and** `state.multiplayer` both set.
`tests/multiplayer-session.test.mjs`'s old assertion that the card sets `!v && isOn()` is replaced by
the fixed rule.

**Save format unchanged (v29).** Rebuild needed (`npm run build`).

## 2026-11-21: Step 16 slice 3 repaired — the multiplayer screen, the join path and the hello

The owner's first slice-3 playtest, and everything it turned up. Three reports, five root causes,
all of the same shape: **a control that only works in a state the screen never lets you reach, or
whose words described something the connection was not doing.**

**What the owner saw.** "There is no button in the main menu to join a world / no option to paste a
link." "In the pause menu, when you turn multiplayer on, I see no way to get a link to copy." "I
cannot seem to connect to another client in a browser tab; it says *Make a fresh offer first*."
"Chat does not send with Enter; the text just sits in the box."

**The causes, in order of how much they cost:**

1. **The join box only existed after you had already joined.** `ui/multiplayer.js` drew the paste
   box only for a session that was already a guest, and the only way to make one was that box; the
   switch — the only control actually on screen — always started a *host* session. The playtest
   guide's own guest steps (turn the switch on, then paste) led to the host panel, whose only box was
   the answer-code box at the bottom. That box, with no offer behind it, is where **"Make a fresh
   offer first"** came from.
2. **The host's hello never left.** `sayHello` set its "greeted" latch *before* sending and sent
   immediately after `join()`, when the other pilot is not in the room yet. The hello was dropped,
   never retried, and chat (which broadcasts per line) still worked — so the guest's screen said
   connected and the host's list stayed empty.
3. **Hosting without a username said nothing.** The switch was drawn from the stored setting, not
   from the session: it flipped to On, `hostWorld` refused with "Set a username first.", and that
   sentence was written into `#mp-code-out` — an element that does not exist in that state.
4. **The offer code deleted itself.** Making a code ended in a full redraw, so the code the host had
   just been told to send vanished from the screen.
5. **The code fallback could not be started by a guest.** Accepting a code needed a guest session,
   and only a join link made one — so the path built for "the link did not work" needed the link to
   work first. A code also carried no world id, so the host's own handshake would have refused the
   guest it invited. (And the code path said "connected" before its data channel opened, so the
   first hello over it failed too.)

**The fix.**

- **One multiplayer screen** (`#mp-screen`, built in `ui/multiplayer.js`), opened from the title
  menu's new **Join Multiplayer World** button and from the pause card's **Open Multiplayer** button.
  It is one surface because two would drift (LESSONS L19): *Your name*, *Host your world* (the
  switch, the link, Copy, the codes) and *Join a friend's world* (the paste box, always there when
  nothing of yours is running) are three blocks on one card, and the card scrolls so nothing can be
  cut off.
- **No username, no switch.** The switch is `disabled` until a name is typed, the action refuses as
  well, and the sentence says what to do. The switch is drawn from the **session**, so a failed host
  snaps it back to Off with the reason in `#mp-msg` — an element that is always in the card.
- **Every control is a `data-mp` action**, handled by one listener on the screen's root, so a redraw
  can never leave a button wired to nothing. The offer code lives in the screen's model
  (`panelView.offer`), not in the DOM, so it survives redraws.
- **The hello is per peer and retried**: `sayHello(peerId)` only latches once a message actually
  left, it is re-sent when `onPeer` reports a pilot, and it goes over the paste wire too.
- **The code fallback works alone**: `codesAcceptFrom` builds the guest session from the code, codes
  now carry the host's `worldId` (`CODE_VERSION` 1 → 2, version 1 still read), and "connected" on
  that path means "the data channel is open".
- **Chat says why**: a line that cannot be sent is kept and the box prints the reason
  ("Not sent — no other pilot is connected yet."), instead of Enter doing nothing.

**Files:** `src/ui/multiplayer.js` (rewritten), `src/ui/screens.js`, `src/ui/menu.js`,
`src/ui/overlays.js`, `src/ui/pause.js`, `src/core/input.js`, `src/state/state.js`,
`src/styles.css`, `src/net/session.js`, `src/net/paste.js`, `src/net/transport.js` (a test-only
library loader), `src/net/boot.js`.

**Tests: 930, all green** (was 909). New `tests/multiplayer-ui.test.mjs` (18: the model, every
button, the chat sentences, two sessions over a fake relay with the *real* transport and handshake)
and `tests/multiplayer-paste-join.test.mjs` (3: a code carry the world id, a guest with no link
joining by code end to end, a non-code refused). `tests/multiplayer-session.test.mjs` gained a
`connect` switch so the host's own checks are read without the guest's automatic hello colouring
them.

**Save format unchanged (v29).** Rebuild needed (`npm run build`). Slice 4 still owns the pilot
crossing worlds; nothing of a player's travels here.

## 2026-11-21: Step 16 slice 3 — the connection: one link, the wrapper, chat and the player list

Multiplayer can open a world, hand out a link and talk. **It still moves no pilot** — the suitcase
is slice 4 — so this slice is honest to try: it can fail to connect, and it cannot cost anybody a
ship.

- **One dependency, one file.** `trystero@0.27.0` (MIT, pinned exactly) is imported lazily by
  `src/net/transport.js` and by nowhere else; the layers test enforces it. Single-file build:
  **3,256 → 3,508 KB**. `RELAYS.relayUrls` in `data/multiplayer.js` overrides the free relays.
- **`src/net/transport.js`** — `createChannel({role, worldId, onState, onData, onPeer})` with
  `join/send/broadcast/leave/peers/state/room`; states `idle · finding · connected · lost · closed`,
  every failure a printable sentence and nothing thrown. A room is `tallowreach.p2p:<worldId>`.
- **`src/net/session.js`** — one session per browser: `hostWorld` (mints the world id once, returns
  the link), `joinWorld`, the paste-code fallback, the handshake through `custody.handshake`, the
  guest list, the recent chat, and `mp-state` on the event bus. A host's token lives in a WeakMap
  with its session; the save keeps only the hash (`putGuest`, slice 2).
- **`src/net/join-link.js`** — `?join=<worldId>#<token>`: the secret after the `#`, so no server and
  no referrer sees it. Reads a link out of a whole pasted sentence; refuses half a link with a
  sentence naming the missing part. `src/net/boot.js` takes a `?join=` link at boot after asking
  (a stray link costs one Cancel), and speaks through `mp-notice` rather than importing `ui/`.
- **`src/net/paste.js`** — the broker-free fallback: one non-trickling `RTCPeerConnection` offer as a
  `TRJOIN:` code and one answer back. The browser's own WebRTC, no library, so it works when the
  relays do not.
- **`src/net/protocol.js`** — seven kinds (`hello`, `welcome`, `refuse`, `chat`, `presence`, `ping`,
  `pong`), each cleaned to its own fields and limits on the way out **and** in.
- **UI** — Pause > **Open Multiplayer**: the switch, the username, the join link with Copy, and a box
  to paste a link or a code. **Chat bottom left**: `Enter` opens, `Enter` sends, `Escape` closes; it is
  an `<input>`, so `core/input.js` already keeps typing out of the flight controls. It shows the
  connected players, and old lines fade.
- **A hosted world never pauses.** `sim/step.js` now reads `state.multiplayer` (set by `ui/pause.js`),
  so the card is a settings panel while hosting. The campaign still pauses, and multiplayer stays
  **open world only**.
- Tests: `tests/multiplayer-connection.test.mjs` (14) and `tests/multiplayer-session.test.mjs` (13 —
  two real sessions on an in-memory wire: the handshake, a wrong secret, chat attribution and caps, a
  clean stop). Suite **909/909**. Two bugs they found: a pasted sentence's trailing words became the
  secret, and a numeric `name` in storage became the name `"42"`.
- Documented in `src/net/README.md`, `src/ui/README.md`, `docs/ARCHITECTURE.md` and
  `docs/architecture/multiplayer.md`.

**Next: slice 4** — "Bring my pilot": `checkOut`/`relocate` through the join, the guest docked in the
host's world, snapshot sync, "Go home". **Known limits:** no remote ship is drawn yet
(`render/views.js` draws the local pilot only), and the player list is names only.

## 2026-11-21: One flight model for every ship, slower turns, First Sortie and navigation polish (save v28)

The batch the owner asked for after playtest round 4 of step 15, in slices.

- **Every ship flies the same flight model.** New `src/sim/flight-model.js` (`stepFlight`) holds the
  player's exact maths — local Y/X/Z quaternion turns with the stick deadzone, `FLIGHT` fractions,
  throttle/brake rates, velocity easing 0.9 (2.4 boosting) and boost adding its own speed again.
  `sim/player.js` keeps power, boost fuel/ignition, warnings and collision around it and is
  byte-identical against a golden copy of the old maths (`tests/flight-model.test.mjs` (a), plus the
  8b fixtures: the player's own pose never moved). New `src/sim/npc-pilot.js` turns the AI's desired
  velocity + aim point into the same stick/throttle/strafe/lift/boost (proportional, clamped), and
  `sim/enemy-flight.js` (fighter, escort, course, observe, prowl, guard) no longer moves `pos`/`quat`/`v`
  or calls `turnEnemy` for movement. The AI decisions are unchanged; `spdFar`/`spdNear`/`spdOrbit` remain
  "how fast it wants to go", capped by its flight stats. NPC drives are unlimited today; `boostAllowed`
  is the one hook a later power system needs.
- **NPC stats are their own numbers.** Every type in `src/data/enemies.js` carries its own copied
  `flight` block at the stock Wasp's values (speed 150, turn 1.2, strafe/lift/reverse 0.6, ease 0.9,
  boostEase 2.4, boostSpeed 150 — from `thruster_basic` + `FLIGHT`), with `FLIGHT.defaultStats` as the
  fallback and `flight.fromShip` as a one-time copy with per-field overrides. Tune ONE type by editing
  only its `flight` block. The old per-type movement numbers they replace: raider turn 1.4 / 125 / 25 / 45,
  captain_korr 1.9 / 210 / 85 / 18, practice_drone 0.9 / 80 / 18 / 25, smuggler 1.5 / 120 / 24 / 44,
  freighter 0.9 / 55 / 16 / 18, hiveguardian 1.9 / 145 / 38 / 58, riftguardian 1.8 / 140 / 34 / 55,
  deepguardian 2 / 155 / 40 / 62 (turn / spdFar / spdNear / spdOrbit). Expect fights to fly differently:
  everything now accelerates, brakes and turns like a Wasp — Dane brakes over seconds (reset-brake test
  widened for exactly that) and boosts past 150 m/s on the fast course legs.
- **All ships turn a third longer:** `FLIGHT.turn` 0.7 → 0.525 (one data number; player and NPC alike).
- **First Sortie:** Flight School is now **Korr Flight Academy** everywhere (ids unchanged, saves safe);
  Dane's "I will keep one busy…" line is gone; the act ends on a new **`dock` objective**
  (`dock-at-academy`) — his report is a radio call in space, the card shows when the pilot docks there.
  Framework first: a generic `dock` step kind (settled only by the `docked` event at its own pocket,
  linter-required `place`, mission-driver support). **Objective glow means "needed now":** briefing
  dialogue no longer lights the wave it spawned, and Dane glows only on the chase step — not during
  control lessons, drills or the ambush.
- **Reset actually resets.** It wiped only the current mode's half; it now wipes both modes
  (`resetAllSave`, staying in the mode pressed from). New LESSONS L32 and `tests/reset-save.test.mjs`.
- **Navigation:** the N panel header is Pocket objects – Filters – Close · N, the Distance sort sits at
  the far right over the distances, and seven **filter preset** boxes live between them (empty = ＋ saves
  the current filters, selecting a preset while editing filters updates it, right-click renames or resets
  it). Presets are saved with the save (**v28**, additive, old saves load empty). The N filters now also
  govern floating HUD labels (an F-lock still draws its label; rocks still never label). Belt label
  grouping is more generous (`BELT_LABEL_GAP_METRES` 1000 → 3000, chaining; no asteroid moved), and
  marker labels split name/distance into spans with a fixed-width tabular distance, so a label no longer
  resizes and shakes as the range ticks over.
- **Outfitting:** dropping a module anywhere in the left Outfitting box fits its left-most bay of the
  right group (a specific bay still wins).
- **Earth-like planet:** new `earth` class (greenish-grey) in `data/planets.js` with its own procedural
  map; it is in the generator pool — existing generated planets may re-roll their class — and the
  main-menu backdrop world is one.
- The two 8b fixture recordings were re-recorded and diffed (LESSONS L17): the combat run's player pose
  is unchanged; only enemy flight and its downstream differ.

Files: `src/sim/{flight-model,npc-pilot,player,enemy-flight,missions}.js`, `src/data/{ships,enemies,
enemy-ai,scenery,planets,missions/index,missions/validate,campaign/m01,campaign/galaxy,factions,places,shops}.js`,
`src/ui/{hud,pocket-list,mission-hud,menu}.js`, `src/render/{planetmaps,menuview}.js`, `src/state/{profile,state}.js`,
`src/{index.html,styles.css}`, tests (new `tests/{flight-model,reset-save,filter-presets}.test.mjs`),
docs. Save **v28** (additive: `profile.pocketFilterPresets`; old saves load with seven empty slots).
Rebuild `game/tallow-reach.html`; `npm test` — see the delivery note for the count.

## 2026-11-20: Playtest round 4: missiles taught, ambush standoff, objective highlights everywhere

The owner's fourth pass over the campaign build, plus universal mission markers.

- **Resuming an act from the title no longer loses the flight HUD.** Leaving an act with Esc → *Exit to main
  menu* left `state.ui.intro` / `state.ui.campaign` set, so `resumeFromSave` fired `launched` at a HUD that
  refused to unhide. `sim/campaign-act.js` `startCampaignAct` and `ui/menu.js` `enterGameMode` now clear both
  flags *before* the save is applied, a mode switch resets places and syncs `state.place`, and the resume emits
  `campaign-act-entered`, which drops the cached weapon-slot markup and re-syncs the reticle. The campaign screen
  only opens the station panel when the pilot really is docked.
- **The starter Wasp leaves the school with Basic Missiles fitted and full.** `state/profile.js`
  `newCampaignProfile()` (used by `newCampaignSave` and `separateCampaignPilot`), and `grantFixedShip(..., {
  campaign: true })` for an act that assigns the hull, fit `missile_basic` in secondary slot 1 and stock
  `MODULES.missile_basic.cap` missiles; `acceptMission` refreshes the live ship's guns and missile stock.
- **The gunnery pass is two waves.** `data/campaign/m01.js`: `spawn-drones` → `drone-brief` → `drone-drill`
  (primary weapons, keys 1–5 + LMB) then `spawn-missile-drones` → `missile-brief` → `missile-drill`
  (secondary weapons, lock tone + right click). `sim/missions.js` `killObjectivesIn` now looks past a
  `dialogue` step to the `kill` step that follows it, so a wave spawned before its briefing is still re-armed
  on reload. `sim/campaign-flight.js` tops the missile rack back up if the pilot empties it with nothing in
  flight during the missile steps.
- **The ambush is a standoff, not a carousel.** `sim/enemy-flight.js` `flyProwl` gives both raiders one shared
  approach corridor (`sim/ai.js` seeds `prowlDir`), brakes them to a halt side-by-side ~150 m from Dane and
  `flyObserve` brakes Dane to a halt facing them, so both sides stare at each other through the dialogue.
- **Universal mission objective markers.** `ui/mission-hud.js` adds `missionTitleColor` (amber for acts and
  story missions, ice for contracts, `titleColor`/`color` override), `activeObjectiveSteps`,
  `objectObjectiveColor(object, kind, ctx)` and `missionWaypoints(ctx)`. `ui/hud.js` glows the matching floating
  marker (`.mk.obj`) for every active objective target — hand-in/offered stations, friendly actors to follow,
  hostile kill/wave-clear targets including wave-clear encounters, crates owed or persistent mission drops,
  asteroid fields and rocks to mine — even beyond the old 900 m crate radius, and draws mission waypoints
  (`.mk.waypoint`) for a destination pocket, an authored `waypoint`/`pos`, a chase course start, or a
  reach/survive/wait signal. `ui/pocket-list.js` `pocketRowsHtml(rows, isSelected, objectiveFor)` marks the same
  rows in the `N` list (`li.objective`, `.pocket-icon.obj`) with the mission's colour. The marker pool rose from
  18 to 28 so waypoints cannot push the ordinary labels out.
- Act 1's dialogue doc and playtest guide record the two-wave pass; the guide's step numbers continue.

Files: `src/{data/campaign/m01.js,sim/{ai,campaign-act,campaign-flight,enemy-flight,missions},state/profile.js,
ui/{hud,menu,mission-hud,pocket-list},styles.css`, tests, docs. No save change (stays **27**). Rebuild
`game/tallow-reach.html`; `npm test` **814 pass / 0 fail**.

## 2026-11-20: Playtest round 3: Dane's guns, the hold bar, the dialogue in one doc

The owner's third pass over the campaign build, plus four follow-up polish items.

- **Dane does not shoot the training drones, and the ambushers warp in to circle first.** `sim/ai.js`
  requires `def.engages === "hostiles"` **and** `e.role === "guard"` before a story ship fires. In First
  Sortie, `spawn-ambush` now runs as `ambush-warning` starts (`warpIn: true, role: "prowl"`): the two
  attackers streak in out of warp and circle around Dane and the pilot (`flyProwl` in `sim/enemy-flight.js`)
  without firing while Dane stays on `observe` and holds his fire. When `ambush-taunt` finishes and
  `defeat-ambush` begins, Dane switches to `guard` and opens fire, and the attackers switch out of `prowl`
  into their aggressive AI (`flyFighter`). Shooting either attacker mid-dialogue (`hitHostile`) breaks the
  parley early and turns the wave aggressive at once.
- **Live distance counter stays after the 500 m bonus is lost, and a failed run slows before returning.**
  `ui/mission-hud.js` `chaseLinesHtml` now keeps `Distance to Dane: now NNN m` under the 1 km rule even after
  the 500 m bonus fails. When the pilot falls more than 1 km behind during the run, Dane no longer whips a
  sudden 180: he brakes to a stop along his heading (`reset-brake` in `sim/enemy-flight.js`), says *"You need
  to keep closer to pass. Let's do it again — follow me back to the start."* (`reset-talk` in
  `sim/campaign-flight.js`, rendered on `#dialogue-panel`), and only turns back to the start once the line finishes.
- **Shorter control prompts.** Each control call in `m01.js` is now one concise line so the pilot spends
  the lesson flying instead of waiting on radio lines; the steering line keeps *"the Wasp is quicker than
  anything you flew at the school."*
- **Weapon slots are keyboard-only (`1`–`5`, `6`–`0`) and top-middle alerts dismiss with R.** Turning down
  with the mouse in flight no longer clicks `#weapon-slots` (`pointer-events: none`, click listener removed
  from `ui/hud.js`), and `#mission-alert` says *Press R to dismiss* and closes on `KeyR`.
- **His rounds were still red for a real reason.** `fire()` → `addEntity` emits `entity-spawned`
  synchronously, and the bullet mesh is built from that record, so assigning `shot.colour` after
  `fire()` returned changed nothing. `sim/combat.js` `fire()` takes a trailing `extra` object and
  assigns it *before* `addEntity`; `sim/ai.js` passes `{ colour: BULLET_COLOURS.cannon }` (orange).
  No new colour abstraction.
- **"The sortie is over" is gone.** `m01.fails.message` is now just "Your Wasp was destroyed."; both
  the MISSION FAILED card and the small alert popup read that one string.
- **The hold bar works again.** The objective's generic sub-line rule (`#tr .hud-mission small`:
  `display: block; white-space: nowrap`) out-rank the old bar's selectors, so the grid never applied
  and the track had no width. The bar's markup moved to a pure, testable `ui/mission-hud.js`
  (`holdBarHtml`, `chaseLinesHtml`, `campaignDetailHtml`) with selectors that win, a grid layout
  (label over track+percent) and an explicit `width: 100%` track. `tests/campaign-fixes.test.mjs`
  now asserts the percentage, the 1 km / 500 m lines and the gathering rule.
- **All First Sortie dialogue in one document:** `docs/FIRST-SORTIE-DIALOGUE.md` — briefing, every
  control call and its objective/hold label, the run's orders and both reset lines, the gunnery pass,
  the ambush, the final report, the failure sentence and the card buttons, with the file to edit for
  each.

Tests 801/801, build 3232 KB. Nothing merged: the owner tests the zip first.

Older entries moved here from [CHANGELOG.md](CHANGELOG.md), word for word, newest first.
You do not need to read this file for every task. `CHANGELOG.md` has a one-line index of everything
in here: open this file only when the index shows an entry that matters to what you are changing
(why a rule exists, how a save version was migrated, what a past fix was).

## 2026-11-20: Playtest round 2: objectives back top-right, run form-up, quieter menu

The owner's second pass over the campaign build. Eight corrections.

- **Dane's fire is just cannon fire.** No "ally colour": a round is drawn in the colour of the module that
  fired it. `BULLET_COLOURS.cannon` (`data/weapons.js`, orange) is stamped on his shots in `sim/ai.js`, and the
  renderer colours a bullet by that field (else the pilot's own orange, else hostile red). Damage is still 0.
- **The title is quiet.** The low drone was created at gain 0.08 and nothing lowers it on a screen that never
  runs `updateAudio()`, so it hummed under the campaign menu; it now starts at 0 and only the flight loop raises it.
- **Smaller chapter boxes, redacted future content.** `.campaign-boxes` is a fixed three-column grid (~1/3
  smaller: three chapters fit where two did). Unwritten chapters and acts show no names at all: a blurred
  placeholder reads "Coming soon" with a number, and opening a locked chapter says "This chapter is not
  written yet."
- **Objectives are back in the top right**, in the same block as contracts and story missions; the top-left
  campaign tracker is gone. Under a campaign objective the HUD adds: the control hold bar (percentage) while a
  lesson runs, the run's rule ("Stay within 1 km of Dane for the whole course to pass."), and the still-live
  bonus ("Bonus: within 500 m · now 312 m").
- **Q and E were swapped** in the roll lesson: `MISSION_CONTROLS` read `roll-left` as negative while `KeyQ`
  produces +1, so Q completed E's objective. The signs now match the input record.
- **The run waits for a form-up.** The chase step is `gather: 300`: Dane flies to the fixed start, waits, and
  only starts the ten-kilometre course when the pilot is within 300 m (the course's own gate, now per step).
  His call says "come to my wing — close, within 300 m", the first leg is a slow 95 m/s warm-up, and the
  500 m bonus is not judged while he is waiting (no `mission-near` until the course runs).
- **Clicking Back on the campaign screen no longer blanks the title.** The action had already drawn the title,
  and the panel click handler's tail then hid `#panel` because the pilot was still in space; a title screen now
  keeps the panel regardless of where the pilot is.

Files: `src/data/{weapons,places}.js`, `src/data/campaign/m01.js`, `src/data/flight-courses.js`,
`src/data/missions/rules.js`, `src/sim/{ai,combat,enemy-flight,campaign-flight}.js`, `src/render/views.js`,
`src/core/audio.js`, `src/ui/{campaign,menu,hud}.js`, `src/state/state.js`, `src/index.html`, `src/styles.css`,
tests, docs. No save change (stays **27**). Rebuild `game/tallow-reach.html`; `npm test` **800 pass / 0 fail**.

## 2026-11-20: Playtest fixes: friendly fire, one-second lessons, chapter boxes, ambush reveal

Eight fixes from the owner's first playthrough of the campaign build.

- **Dane's guns are orange.** Wingman rounds carry `ally: true` (set in `sim/ai.js`) and
  `friendlyShot()` (`sim/combat.js`) decides the colour, so only hostile fire is red. His
  damage is still zero.
- **Control lessons are one second, with a bar.** `learn()` in `m01.js` holds for `1`
  (`control` steps default to one second now). `sim/campaign-flight.js` publishes the live
  hold as `state.ui.controlHold` (fraction + percent), and the HUD draws it as a percentage
  bar under the act's objective in the top-left tracker; a full bar is a learned control.
- **Order: W then Ctrl (brake).** `MISSION_CONTROLS.brake` (`flag: "brake"`) is taught
  second, with two short lines ("a pilot who cannot stop is not flying"), then S, mouse,
  strafe, lift, roll, boost.
- **The bonus is a 500 m run bonus.** The optional `stay-with-korr` now reads
  `metres: 500`, `during: "chase"`, and shows as a live chip in the top-right HUD
  (`missionBonusStatus` in `sim/missions.js` + `state.ui.followDistance`). Over 500 m turns
  it red; the run's own 1 km reset is unchanged and separate.
- **Ferrite scenery along the course.** Eight `chase-rocks-*` scatter fields line the
  `m01-range` chase (146 rocks, sizes 10–72 m, some giants). `coreRadius` equal to `radius`
  opts them out of the pocket's diffuse-wing scaling, and each cluster sits ~950 m off the
  flown line (≥ 300 m of clear air), so the run reads as a canyon without putting rock in
  Dane's lap.
- **The ambush strangers reveal themselves.** Dane only says the hulls are not school drones
  and that he does not recognise them; a new `ambush-taunt` line from "Unmarked pilot" makes
  the threat, and no objective or line says "raider" any more ("Defeat both attackers.").
- **Blank menu after Act 1 fixed.** The end card is a full-screen overlay; leaving the act
  by any route other than its own button (pause → Exit to main menu) now hides it on
  `main-menu`, and the pause exit clears the campaign screen flags.
- **Chapter boxes instead of headings.** The campaign screen moved to the big left window:
  one large box per chapter (locked future chapters included), a chapter opens into its act
  boxes, and planned acts render locked ("Planned · not written yet"). `chapters.js` gained
  chapters 2–4 and five planned acts in chapter 1; only acts with a `mission` enter
  `CAMPAIGN_ACTS`, so planned boxes can never be started or saved.

Files: `src/data/campaign/{chapters,m01}.js`, `src/data/places.js`, `src/data/missions/rules.js`,
`src/sim/{ai,combat,campaign-flight,missions}.js`, `src/render/views.js`, `src/ui/{campaign,menu,hud,pause}.js`,
`src/state/state.js`, `src/styles.css`, `src/index.html`, `tests/campaign-fixes.test.mjs`, campaign tests.
No save change (stays **27**). Rebuild `game/tallow-reach.html` and run `npm test` (**799 pass / 0 fail**).

## 2026-11-20: Campaign slices: acts, boundaries, dialogue pacing, failure/bonus framework, Dane, First Sortie

The campaign is now a campaign: the title's Campaign screen lists chapters → acts, clicking an act starts it
(fresh act world, campaign-only pilot), finishing it shows a MISSION ACCOMPLISHED card and returns to the menu,
and a failed critical objective stops the world on a MISSION FAILED card with "Start from the beginning" (and
"Start from last checkpoint" where a step sets `checkpoint: true`; First Sortie has none).

Act boundaries: warping out needs `allowTravel` ("You do not have permission to leave this pocket."), docking is
refused while a destroy objective is live, undocking is blocked while a station dialogue is unfinished, and a
dock no longer clears the act. Dialogue advances itself on a text-scaled clock (`1.5 s + 1 s per 12 characters`);
station Continue is still clickable, space lines have no button.

Framework (data-driven, opt-in): `optional` bonus objectives (`stay-within`, `missionBonus`, saved
`optionalProgress`), `control` steps (hold a control for `hold` seconds; `MISSION_CONTROLS`), `chase` steps
(follow a ship along a `FLIGHT_COURSES` course; `maxGap` behind says `resetLine` and resets only that objective —
never the act), natural resets (`mission-reset`), and story actors (`actor` + `actorRole` lead/observe/guard).

Dane Korr: Wasp hull colour with the blue boost glow, selectable with F, fires at raiders for 0 damage, flies his
own course (no longer anchored to the player), and is re-created from his authored `spawn-ship` if he vanishes.

First Sortie: station briefing → launch → ten controls learned by doing them (W, S, mouse, A, D, Space, C, Q, E,
Shift) → ten-kilometre chase → drone pass with Dane watching → raider ambush with Dane covering you, plus a
350 m optional bonus through the lesson and a believable ambush line.

Files: `src/data/campaign/` (`chapters.js`, `m01.js`), `src/data/flight-courses.js`, `src/data/missions/rules.js`,
`src/data/missions/validate.js`, `src/sim/campaign.js`, `campaign-act.js`, `campaign-flight.js`, `flight-course.js`,
`missions.js`, `ai.js`, `enemy-flight.js`, `targeting.js`, `session.js`, `sectors.js`, `src/ui/campaign.js`,
`missionlog.js`, `screens.js`, `menu.js`, `src/state/profile.js`, `src/state/state.js`, `src/render/views.js`,
`src/data/enemies.js`, `src/data/enemy-ai.js`, `src/data/shops.js`, `src/styles.css`, tests.
Save **v27** (per-mode pilot; the campaign no longer shares the open world's ships or credits). Docs:
[architecture/campaign-acts.md](architecture/campaign-acts.md). Rebuild the game and run `npm test`.

2026-11-19: Campaign tutorial waves re-arm after a pocket reload

A quit made mid-sortie could strand the pilot behind an unfinishable kill objective: enemy waves are runtime
objects and a save never carries them, so the interrupted spawn step would not fire again on reload. Spawn script
actions may now opt in with `respawn: true`; on pocket entry and on undock the runner compares the kill objective
still owed (current step, counters as saved, parallel-aware) with the `mission:<id>`-tagged enemies still alive in
the pocket and emits only the deficit — living members keep their health and are never duplicated, nothing happens
while docked, dead, warping or loading, and a full wave never re-spawns. All three practice-drone/raider waves in
`src/data/campaign/m01.js` are tagged. `sanitizeSave` now keeps the `respawn` action key so the flag survives a
save round trip (no `SAVE_VERSION` change; it stays **26**). New test boots a mid-M01 campaign save through
`currentRootSave()` → `prepareGalaxySave` → `resumeFromSave`, re-arms the missing drone, finishes the objective and
the mission, and asserts exactly one completion is recorded. Files: `src/sim/missions.js`, `src/state/profile.js`,
`src/data/campaign/m01.js`, `tests/campaign.test.mjs`, `testing/TESTING-15-CAMPAIGN.md`,
`docs/{MISSION_RULES,recipes/11-story-and-scripted-missions}.md`. `game/tallow-reach.html` rebuilt;
`npm test` **782 pass / 0 fail**. ROADMAP step 15 still unticked (owner playtest pending).

## 2026-11-19: Step 15 — campaign scaffolding, dual-mode saves and the Dane Korr tutorial

The campaign is now its own saved mode and its own fixed-seed seven-system galaxy (seed `240515`,
Auric Reach at its heart, pockets like `auric_flight_school`), sharing the browser pilot's fleet,
credits, cargo and loadout but none of the open world's place, missions, flags or progress. Save
**v26** stores a `{v, mode, open, campaign}` envelope; legacy nested saves migrate on read and
write back as roots, and `prepareGalaxySave`/`applySave`/`resetCurrentModeSave` keep the inactive
half in sync. `data/campaign/` holds the galaxy, `m01-first-sortie` (Dane Korr, fixed Wasp grant,
tutorial flight academy ending in a pirate ambush) and the `index.js` order; accepting a campaign
story mission grants and selects its fixed hull (after the already-active check, so a duplicate
accept cannot re-select it), completion notes `profile.campaign.completed` and emits
`campaign-mission-completed` before the reward. The campaign menu and offer flow are wired; the
finish transition is deliberately **nothing yet** (no free-agent flip, no unlock, no reward); replay
rewards stay framework-only. Practice drones are no longer `friendly` (they are shootable targets);
Captain Korr stays `friendly`+`invulnerable`. Export/import codes carry the record they are given
(the game exports the dual-mode root), while browser autosave/slots normalise to the root; slot
summaries show the active mode. Storage migration tests and `tests/campaign.test.mjs` cover the
envelope, mode switching, shared pilot, fixed-ship grant and a full M01 play-through.
**Not ticked in ROADMAP: owner playtest pending.** Files: `src/state/{profile,state,storage}.js`,
`src/sim/{campaign,galaxy-session,missions,ai,weapons,missile,targeting}.js`, `src/data/{enemies,campaign/*}.js`,
`src/ui/{menu,screens,missionlog}.js`, `tests/campaign.test.mjs`, migration-test updates.
`game/tallow-reach.html` rebuilt; `npm test` **781 pass / 0 fail**.

## 2026-11-19: One HUD label per nearby belt group

Nearby asteroid fields now share the first field’s floating label, including chained outer sections. Distant fields keep separate markers. No changes to scenery, targeting, counts or saves.

## 2026-11-19: Shared natural wormhole environments

Simple sites and named wormhole systems use one environment definition: 80% black holes, double black-hole radius, grey sky and neutral ambient fill. Rifts and entrance pockets retain their own environment. No save change.

## 2026-11-19: Larger, more common black holes in wormhole systems

S-systems roll 80% black holes and render them at twice the usual physical radius. Regular systems, rifts and simple wormholes keep their existing cores. Derived from the world seed; no save migration.

## 2026-11-19: Multiple wormhole routes and grey system skies

Off-chart systems support up to four live paired doors, balancing S-to-S routes with regular-space exits. All S-system pockets now use the grey wormhole cube and neutral ambient fill. Existing v25 clocks and original endpoints are preserved; extra routes derive from the saved seed and generation.

## 2026-11-19: Start with 30 wormhole systems

Raised `WORMHOLE_SYSTEMS.count` from 5 to 30. Existing v25 saves keep their first five connections; the additional systems start on load. Simple wormhole population unchanged.

## 2026-11-19: Step 14d — persistent wormhole systems

Five named off-chart systems with seeded cores, warpable pockets and paired 20-minute connections. M switches between the local and regular charts; renewal creates two fresh endpoints without stranding the pilot. Save v25 migrates older worlds. Playtest pending: `testing/TESTING-14D.md`.

## 2026-11-19: Uncharted Space HUD label and 14d exit decision

Rift and simple-wormhole interiors show Uncharted Space above the pocket name. The 14d plan records that a replacement exit connects to a fresh wormhole in a random regular-space location. Named wormhole systems are planned as S0001 etc.; isolated instances now gain a visible seeded core and matching lighting using normal star/black-hole odds. No save change.

## 2026-11-18: Station UI rework, reusable left window, Inventory ship list and My Assets destination

Merged PR #43 (Slices 1–3, save v24) to `main`, then implemented the 11-item station UI
and inventory polish batch: fixed the lingering empty `#inv-held-ghost` box when placing
held items (`clearHeldGhost` removes the node and `.inv-held-ghost[hidden]` overrides
`display: flex`; L28) and removed the redundant `"Holding … Put back"` bar across all
inventories; stopped dimming inventory tiles when the destination hold is full; removed
the Inventory intro paragraph and merged the compact stored-ship list into Inventory
above Station and ship holds with a small `Fly` button to the right of `Active`/`Stored`
(removing the `Hangar` nav tab and Outfitting's ship-switcher arrow box); added a
reusable `#station-left` window (`src/ui/left-panel.js`, fixed container, dimensions,
positioning and animations) shared by mutually exclusive toggleable `Outfitting` (scaled
3-column layout with no top subtitle and a taller `#shipview`) and `Shop` plus
`Missions` (right accepts `Story missions` — keeping its heading with `"No more story
missions available."` when none remain — and `Contract board`; left opens the
in-progress `Mission log` whose `Details` toggle enlarges the same card inline without
duplicating text; `Contracts` button removed) beside a fixed-width `#panel` with an
always-clickable minimalist top-right home-station icon button and game-themed `.home-tip`
hover card, plus a condensed controls-only main-menu `Controls` grid; kept the cursor
`#inv-held-ghost` 1:1 square matching inventory slots, scaled `.inv-item` text so names
fit uncropped, and fixed ship-hold `Stack all` compacting items to top-left; added
Inventory-style single-click pick/place/swap and drag-and-drop between Outfitting and
Inventory, right-click `Equip` (active ship, even with Outfitting closed), right-click
`Unequip` + comprehensive module `Show info` (`moduleInfoData`, `moduleDetailsHtml` —
outputs, range, speeds, DPS, hull modifiers, MJ usage, magazine, lock/flight stats,
fitting & prices) across Outfitting, all inventories, Shop, My Assets, flight `I` and
Rift Cache `R`, removed `"Modules in storage"` slot picker, and placed a compact
`68px` full-width `Services` card below modules (no browser tooltips, 2 rows × 4
single-line `.service-box` tiles with tight `0 2px 0 5px` padding and `11px`/`10px`
text stepping cleanly to wider 3/2-column boxes on narrower windows so full service
names never truncate, scrolling vertically for 9+ future services; PR #44 + follow-up);
added `My Assets` prefix `Search`, collapsible ship cargo holds included in search, and station
right-click `Set destination` / `Clear destination`; and made HUD `displayedSpeed` read
negative `m/s` when reversing. Files: `src/{index.html,styles.css,main.js}`,
`src/core/input.js`, `src/state/state.js`, `src/sim/{economy,fitting,flight-instruments,inventory,places,player}.js`,
`src/ui/{left-panel,screens,menu,outfitting,missionlog,inventory-ui,cargo,cache,pause,README}.js/.md`,
`tests/{station-ui-batch,part2-ui}.test.mjs`. Save **v24** unchanged;
`game/tallow-reach.html` rebuilt; owner playtest pending.





















## 2026-11-18: Roadmap slice 3 — My Assets, Minecraft-style inventory slots, Mining beams subgroup and 0 MJ power fix

Slice 2 playtest passed. Fixed the `0 MJ` power bug across every MJ consumer (`hasPower`
now requires `p.stored > 0` with no bare-powerplant fallback; unequipped or emptied power
cells disable thrusters, strafe, lift, turning, boost, shields, cannons and mining beam
while reporting `Using 0 of Y MJ/s`; L31). Added a dedicated collapsible `Mining beams`
sub-category under `Shop → Modules → Primary weapons` alongside `Cannons` and `Missiles`.
Implemented Slice 3: added the `My Assets` sub-tab (`listPlayerAssets`, `assetsHtml`) in
both docked Station Inventory and in-flight Ship Inventory (`I`), listing every station
where the pilot has stored items or hangar ships and expanding compact N-menu-style
1-line rows on click; and upgraded all inventory UIs (docked Station & Ship hold,
in-flight `I` Ship hold, and in-flight `R` Rift Cache) to Minecraft-style slot
manipulation (`ui/inventory-ui.js`, `slotsAt`, `pickupSlot`, `placeHeldStack`,
`takeFromSlot`, `shiftMoveSlot`, `stackAll`, `returnHeldStack`) — left-click picks up a
stack to place, merge or swap into any slot, right-click while holding places 1 item,
right-click on a stack offers `Take amount` (plus slot-aware `Sell`/`Discard` and `Use`),
Shift+left-click moves the whole stack across open inventories, `Stack all` consolidates
split stacks and empty gaps on every inventory header, and Esc/close/save restores any
held stack without item loss. Bumped `SAVE_VERSION = 24` (`profile.holdSlots`,
`world.stationSlots`) with clean migration from v1–v23. Files:
`src/data/shops.js`, `src/state/{profile,state}.js`,
`src/sim/{power,player,shield,weapons,inventory,economy,session,instances}.js`,
`src/ui/{inventory-ui,screens,menu,cargo,cache}.js`, `src/{main.js,styles.css}`,
`tests/{slice3-assets-inventory-power,slice2-shop-ships,content,shield,inventory,inventory-discard,ui-cargo,ui-cache}.test.mjs`.
Rebuild generated; owner Slice 3 playtest pending.

## 2026-11-18: Roadmap slice 2 — compact Shop, Hangar stored-ship list & context menu, Ship details/bonuses and unblurred cargo overlays

Slice 1 playtest passed; includes owner's Slice 2 follow-ups. Rebuilt the Shop tab into a
compact single-line collapsible tree (`SHOP_GROUPS`: `Ships`, `Modules` with 1-line
subgroups matching every `MODULE_GROUPS` group plus `Cannons` and `Missiles` sub-groups
under `Primary weapons`, `Consumables`, `Ores`, `Loot`) with a right-side `Buy` button
opening a bounded `Buy amount` popover (`shopBuyHtml` / `shopMaxBuy`) anchored so the
popup's right-aligned `Buy` button lands directly over the cursor (`placePopoverButtonOverCursor`,
flipping at the bottom edge); `Ores`, `Loot` and primary `Missiles` show none in stock
at Meridian today and populate automatically for future items/weapons. Ships are bought in
Shop (never in Inventory) and stored per station in the restored **Hangar** tab's compact
one-line `.hangar-ships` list (removed from Outfitting): single left-click never auto-
equips, double-click flies the ship, and right-click offers `Show info`, `Fly ship`, and
`Sell` (`canSellShip` / `sellShip` at 60% resale via `shipSellValue`, moving cargo and
non-stock fitted upgrades into station storage and refusing when active or short on
storage space). Supports duplicate hulls (`wasp#2`, `prospector#2`) across stations via `profile.shipPlaces` in `SAVE_VERSION = 23` (clean v1–v22 migration), keeps
each station's `world.base.hangar + 1` berth cap, and lends a local Wasp on death without
moving remote ships. Updated hull bonuses (Wasp none, Prospector `2×` mining speed with
Wasp Hull HP, Bulwark `1.5×` damage on all weapons, Test Ship unchanged) with right-click
`Ship details` (`shipBaseStats` / `shipDetailsHtml`) in Shop, Outfitting and Hangar.
Removed background blur from flight inventory (`#cargo`), rift cache (`#cache`) and
shared `.cargo-overlay` for all future cargo transfers. Files:
`src/data/{ships,outfitting,mounts,shops}.js`, `src/state/{profile,state}.js`,
`src/sim/{hull,inventory,fitting,combat,weapons,missile,pilot,session,economy}.js`,
`src/render/{models,shipviewer,views}.js`,
`src/ui/{hud,notice,outfitting,cargo,cache,screens,menu}.js`, `src/main.js`,
`src/styles.css`, `tests/slice2-shop-ships.test.mjs`. Build regenerated; owner playtest
pending before Slice 3.

## 2026-11-18: Roadmap slice 1 — true moving-collider speed, live Mission log item counts and 10-minute per-station contract timers

Moving scenery (`stepScenery` in `src/render/scene.js`) now advances per 60 Hz sim tick
inside `simClock`'s `beforeStep` (with `updateScenery(alpha)` interpolating drawn angles
and moving the sky after the camera), scaled movers compute true world-metre push-out
(`src/sim/colliders.js`), and sub-0.5 m/s pushes never round to `0 m/s` (`displayedSpeed`
in `src/sim/flight-instruments.js`), so being pushed by Meridian's turning arms or any
station mover always shows true speed across all refresh rates. Station Mission log and
active mission rows now report exact live available inventory counts for mining, deliver,
recovery, cargo hand-over and reached story item objectives (`missionItemRequirements` in
`src/sim/missions.js`, scoped to the mission's hand-in station plus active ship hold),
and allow immediate hand-in when a mine/deliver load is already stocked. Contract boards
now remove only the accepted offer, keep empty boards empty, and enforce an independent
10-minute (`CONTRACT_REFRESH_SECONDS = 600`) unpaused play-time cooldown per station
saved in `world.boardTimers` (`SAVE_VERSION = 22` in `src/state/profile.js`, backward-
compatible with all v1–v21 saves). Files: `src/main.js`, `src/render/scene.js`,
`src/sim/{colliders,flight-instruments,player,places,session,missions,contracts,step}.js`,
`src/data/{contracts,missions/contracts}.js`, `src/state/profile.js`,
`src/ui/{hud,missionlog,screens,menu}.js`, `tests/slice1-speed-missions-contracts.test.mjs`.
Build regenerated; owner playtest pending before Slice 2.

## 2026-11-18: Nebula fill 0.175, unified label/lock colours and N-tab lock-square icons

Raised default `NEBULA_FILL.intensity` from `0.125` to `0.175` in `src/data/lighting.js`
(tint, softness, overrides and sunlight unchanged). Unified floating world labels (`.mk`),
target lock labels/boxes (`.mk.lock`, `.mk.lk`) and new `N`-tab left hollow-square row
icons (`.pocket-icon`, 9×9px inside unchanged 16px rows) behind a single helper
(`markerStyle` / `lockMarkerStyle` in `src/ui/target-display.js`) and one shared CSS
variable (`--marker-color`). Friendly stations (including Meridian Station), friendly
ships, rifts, gates and caches stay blue when locked instead of turning brown; hostiles
are red; asteroids, fields and crates are amber-brown; future objects with a new
`markerTone` or `markerColor` inherit across labels, lock boxes and the `N` tab without
duplicate code. Files: `src/data/lighting.js`, `src/ui/target-display.js`,
`src/ui/pocket-list.js`, `src/ui/hud.js`, `src/sim/targeting.js`, `src/styles.css`,
`tests/nebula-lighting.test.mjs`, `tests/target-display.test.mjs`,
`tests/pocket-list.test.mjs`, docs. Save v21 unchanged; build regenerated.

## 2026-11-18: Ore asteroids use natural shaded surface colours with no self-glow

Removed the hardcoded emissive self-glow (`rockGlow` in `src/render/views.js`) that kept
the shadow side of Cobalt and Voidite asteroids artificially bright. Every `cat: "ore"`
entry in `src/data/items.js` now defines its own base surface `col` (read through
`rockColor(id)`, defaulting to `DEFAULT_ROCK_COLOR` `0x4a4540`): Ferrite `0x4a4540`
(unchanged brown), Cobalt `0x2e5585` (blue), Voidite `0x543888` (purple) and Lumenite
`0x625636` (golden-amber). All asteroids share the exact same non-emissive PBR shading,
so dark sides drop naturally into shadow like Ferrite. Enforced by `tests/views.test.mjs`
and `tests/content.test.mjs`; updated recipe 2 and folder READMEs. Save v21 unchanged;
build regenerated; owner playtest pending.

## 2026-11-18: Fix N panel closing, selected-row outline, row separators and HUD transparency

Fixed `#pocket-objects` staying visible on N, Close and Escape: `#hud > #pocket-objects`
(`display: flex`, two IDs) outranked `#pocket-objects[hidden]` (`display: none`), and
focused filter checkboxes swallowed `KeyN` in `core/input.js`. Added `#hud > #pocket-objects[hidden]`
and explicit `[hidden]` rules, exempted checkboxes from the typing-field guard, unified
navigation state on `state.ui.navigation`, reset hover/filter-menu/focus on close, and
ordered modal Escape dismissal before navigation in `main.js`. Added faint inset grey
row separators that keep rows strictly 16px tall (35+ at 720p), and a full-row 1px
white inset outline (`isPocketRowLocked` + `pocketRowsHtml` + immediate hover-safe sync)
for the locked target across all target kinds and derived feature copies. Matched slight
surface transparency (`--hud-surface`, alpha 0.72) across the N panel, weapon slots and
grey status boxes while keeping coloured meter fills solid; gave `#throttle-track` slight
transparency (`--hud-throttle-bg`) preserving its `#141b20` base, blue fills and labels.
Files: `src/styles.css`, `src/index.html`, `src/ui/hud.js`, `src/ui/pocket-list.js`,
`src/sim/targeting.js`, `src/core/input.js`, `src/state/state.js`, `src/main.js`,
`tests/pocket-list.test.mjs`, docs and `testing/TESTING-BATCH2.md`. Save v21 unchanged;
build regenerated; owner playtest pending.

## 2026-11-16: Compact selectable pocket list and aligned lower HUD

Pocket list now has 16px single-line rows (35+ at 720p), opaque top-right placement,
category checkbox filters saved safely between sessions, and reversible Name/Type/
Distance sorting. It hides mission objectives while open. Clicking a live row toggles
its F-compatible lock; extra object classes get generic tracked locks. Derived spatial
features match stable kind/id because place definitions return copies. Mouse steering,
orbit and firing are released while browsing; keyboard flight continues. N/Esc/Close
restore normal control. Hover/focus holds row order for safe clicks. Bank headings
align with grey-frame tops, and throttle spacing matches the 6px lateral gap. Tests
cover filters/storage, sorting, selection/pruning, controls and geometry. Save v21;
build regenerated. Owner playtest pending; batch slices 3–5 still pending.

## 2026-11-16: Repair N action, stabilise lead and align status bottoms

Fixed missing emit import in main's N handler; reproduced the reported ReferenceError
with a test executing that action against its actual imported event helpers. Lead
prediction now shares interpolated player/muzzle, target position and velocities
with the rendered camera; avoids raw 60Hz pose jumps at close range while turning.
Added interpolation/teleport regression coverage. Lowered status groups only: grey
frame bottoms align with throttle at 24px, with their X positions and geometry unchanged.
Throttle shifts 28px right to share the weapon strip centre; its size/height stay fixed.
Save v21; build regenerated; owner repeat playtest pending.

## 2026-11-16: Batch slice 2 — navigation, lead and actual speed

Moved the complete lower HUD down 18px without changing internal spacing; missile
icon faces up. N toggles a read-only, live pocket-object list: spatial features and
runtime entities, all distances, future detection-policy hook. Cannon lead uses
locked-enemy velocity, inherited shooter velocity, selected muzzle and bullet speed;
no marker for beams, empty bays, unreachable or offscreen intercepts. Shared bullet
lifetime caps prediction. Speed measures each flight step including collision pushes,
not teleport/warp displacement; place entry resets it. Added regression tests and
owner checklist. Save v21; slices 3–5 pending. Build regenerated; playtest pending.

## 2026-11-16: Missile icon and lower interaction prompts

Replaced the windowed rocket glyph with a simple diagonal finned missile outline,
using the supplied reference. Shared interaction prompts (dock, lock acquisition,
wormholes and other contextual actions) now appear white, bottom-anchored above the
weapon strip. Mining progress follows them down. Removed the heading inset and
tracking so PRIMARY/SECONDARY align with the grey name edges. Added markup/layout
guards. Explicitly centre all status tracks, labels and readouts on their frames
without changing 28px widths, text sizes or frame positions. Save v21 unchanged;
build regenerated. Owner visual check pending.

## 2026-11-16: Remove duplicate weapon-selection messages

Removed centre-screen equipped/empty messages from both bank selectors; the slot HUD
already names each selected module. Other gameplay messages remain unchanged. Inset
PRIMARY/SECONDARY headings 2px toward the middle without moving the grey weapon names.
Added regression assertions; save v21 unchanged; build regenerated. Visual check pending.

## 2026-11-16: Signed throttle and final HUD alignment tweaks

Weapon names move up 2px without moving PRIMARY/SECONDARY. Throttle/speed box moves
up 18px. Fixed reverse throttle disappearing behind a resource-pool clamp: a dedicated
signed helper preserves negative text, uses magnitude for fill length, and reverses
fill origin. Reverse uses the same blue hue in diagonal stripes, forward stays solid.
All four stat columns now share 28px width, with centred labels/readings. Power usage
centres beneath the combined Power/Boost pair. Power MJ readout matches the blue meter;
usage text retains its muted grey. Added signed/boundary and layout tests.
Save v21 unchanged; build regenerated; owner visual playtest pending.

## 2026-11-16: Framed status columns and integrated throttle/speed

Reduced weapon-name reserved height to one line and heading/name gaps to 1px so
labels sit closer to slot boxes. Added square grey frames to the status columns.
Retained existing label-edge positions; tracks now match their labels' intrinsic
widths, centred underneath, retaining the 8px inter-track gap. Current/percentage
readouts centre on their columns. Speed now sits inside the wider throttle rectangle
beside the throttle label. No speed-physics changes (pushed-speed fix remains pending
in slice 2). Layout tests updated; save v21; build regenerated; visual playtest pending.

## 2026-11-16: Square weapon boxes and slot-height divider

Widened the strip to 480px so all ten boxes are 44×44px at desktop width; narrower
windows scale width/height together. Shifted meter pairs outward equally while
preserving appearance and internal spacing. Replaced the full-bank separator with
a divider the same height as the slot row. PRIMARY/SECONDARY headings are white;
weapon names stay grey. Added square-geometry assertions. Save v21; build regenerated.

## 2026-11-16: Monochrome weapon strip and top-left location

Lowered weapon strip 20px toward throttle; square boxes, white active borders, dark
grey inactive backgrounds, muted grey labels/icons and a vertical divider. Each bank
now names its selected module below PRIMARY/SECONDARY, with ammo only for ammo-using
weapons (including zero remaining). Removed duplicate ammo badges on boxes. Top-left
shows bold white system and regular white pocket, no icon; route remains underneath.
Instances say Outside known systems rather than claiming Meridian. Removed bottom-left
controls reminder and obsolete narrow-window hint offsets; main-menu help stays.
Added location/markup tests. Save v21; build regenerated. Owner visual playtest pending.

## 2026-11-16: Compact weapon strip between the HUD columns

Shrank the ten-slot strip from 580px to 340px wide and boxes from 62px to 44px tall,
with smaller icons and tighter gaps. Moved it down into the Hull/Power gap. Both
meter pairs move 50px outward, preserving track size, appearance and pair spacing.
Strip and pairs share the same centre and responsive vertical offset; responsive
widths leave 30px from each strip edge to the neighbouring inner column centre.
Layout regression tests updated. Save v21; build regenerated; visual playtest pending.

## 2026-11-16: Paid boost ignition and ten-slot weapon hotbar

Reproduced free full-throttle jumps on Shift taps/dry ignition in failing tests. Throttle
now snaps only after boost spool-up succeeds and the flat MJ cost is deducted. Held boost
does not continually pin throttle. Existing continuous draw timing is unchanged.

Added ten boxed weapon slots above the throttle: primary 1–5, secondary 6–0, exact
Outfitting bay order, independent cyan/orange selections. Each weapon family has a shared
SVG icon (module.weaponFamily), fitted markers and missile ammo count. Clicks select but
do not fire. Empty/unsupported slots remain empty and never fall back. Removed redundant
top-right selected-weapon line. Secondary fire resolves the selected bay; switching clears
acquisition but keeps reload/ammo. No extra bays added to ships. Optional v21 sw defaults
to first secondary; pw accepts 1–5, preserving legacy beam/cannon migration.

Tests cover paid ignition, ten bindings, both fire banks, empty slots, reload preservation,
pilot isolation, save defaults, family icons and UI. Build regenerated; owner playtest
pending in `testing/TESTING-BATCH2.md`. Other slices remain pending; no merge yet.

## 2026-11-16: HUD pool units

Shield and Hull current values now include HP (e.g. 10 HP); Boost includes U for
fuel units (e.g. 10 U). Power remains MJ. Labels, percentages, spacing and gameplay
are unchanged. Updated HUD tests; save v21; build regenerated.

## 2026-11-16: Tight HUD readings, pool percentages and throttle fill

Moved label and number edges closer so their gap matches the 8px column gap. All
four pools show current values only (Power retains MJ), with percentage underneath.
Power usage sits inside the Power column below its readings. Throttle text now sits
inside a horizontal bar, empty at 0 and full at 100%; speed stays separate below.
Raised the columns slightly to fit the extra readout lines. Absent pools show 0/0%.
Updated formatting/layout regression tests. Save v21; build regenerated. Visual
playtest pending; remaining batch slices unchanged.

## 2026-11-16: Mirrored vertical HUD pairs

Owner's slice-1 layout follow-up: shortened flight labels to Hull/Shield. Hull takes the
previous inner-left column's X position; Shield moves just outside it. Power becomes a
matching vertical meter at the old Boost X position; Boost moves just outside Power.
Both pairs use an 8px gap, with labels/numbers fanning out to avoid overlap. Final order:
Shield / Hull — open centre — Power / Boost. Numeric MJ and MJ/s readings remain; narrow
windows lift both pairs together. Updated HUD/layout tests. Save v21 unchanged; build
regenerated. Owner visual playtest pending; other batch slices remain pending.

## 2026-11-16: Feature batch 2 slice 1 — compact flight meters and toggle camera

Implemented items 1 and 12 only. Hull/Shield now fill upward in small columns left
of the existing horizontal MJ bar; Boost is a column on the right. Numeric readings
remain, with absent/invalid pools safely empty. Route retains its top-left location.
Left Alt toggles free camera once per non-repeat press; release no longer disables it.
Existing modal/blur/dock/warp reset paths remain; pause now exits orbit too. Updated
help text and tests. Save v21 unchanged. Build regenerated; owner visual playtest pending.
Full batch plan and per-slice checklist: `testing/TESTING-BATCH2.md`. Other items pending.

## 2026-11-16: Nebula fill intensity increased 25%

Owner approved the ambient lighting and requested a 25% increase. Default intensity
is now 0.125 (was 0.10). Tint, softness, overrides and other lights are unchanged.
Updated the default regression assertion and recipe 24. Save v21; build regenerated.

## 2026-11-16: Subtle sky-tinted ambient fill trial

Added one flight-scene AmbientLight at intensity 0.10, using active skybox generated
nebula-tint metadata softened 60% toward white. Normal space has a restrained cyan fill;
grey skies switch tint on arrival. No runtime pixel sampling, exposure changes, sunlight
changes or material edits. Existing hemisphere and title/outfitting lighting stay unchanged.
`data/lighting.js` supports global, sky-id and per-place sky.ambient tint/intensity overrides;
null tint restores automatic colour, zero intensity disables the extra fill. Recipe 24
explains tuning. Missing sky disables fill. Tests cover defaults, overrides, transition
wiring and invalid settings. Save v21; build regenerated. Owner darkness/colour playtest pending.

## 2026-11-16: Exact F picking for all objects; stationary outfitting preview

Owner approved mission log and preview angle. Kept yaw/pitch unchanged and removed automatic
preview rotation entirely (manual drag/zoom/reset remain). F now raycasts visible rendered mesh
surfaces for every lockable kind: enemies, rocks, crates, stations, rifts/wormholes, exits and
caches. Tagged model roots include GLB children and live animated station parts. Faint auras
and invisible meshes do not intercept the ray. Sim receives only a plain target reference,
checks live candidates, then preserves same-target unlock and no-hit angular assistance.
Headless callers retain the existing sim intersection fallback. Regression tests cover every
kind, overlapping bodies, station holes, child transforms, hidden geometry and preview stability.
Save v21 unchanged; build regenerated. Follow-up owner playtest pending; PR #39 remains unmerged.

## 2026-11-16: Part 2 restored, precise asteroid selection and recovery/UI follow-ups

Continuation starts at main after PR #38; previous unpushed Part 2 was absent, so restored
approved shape-preserving map/HUD icons, mechanical undock, modules-only Base and persistent
Home Station. Optional backward-compatible v21 homeStation defaults to Meridian and validates
against the restored galaxy; temporary/invalid homes fall back safely. No version bump per owner.

Reproduced F selecting a large background rock and credits suppressing the only-ship loaner in
failing tests. F now ranks actual asteroid surface hits along the rendered camera ray before
angular assistance (other target kinds keep sphere proxies). Mission cards use compact grid
spacing, one-line next guidance and a small native Details control containing untruncated
information. Outfitting/reset starts front/top/left isometric. Death with no surviving hull now
always lends a fitted Wasp regardless of credits; a surviving hull is reused, not duplicated.
Ship ownership remains global: no new per-station ship-storage system was invented.

Regression tests cover overlap/mesh misses, generated home recovery, old saves/export-import,
invalid/temporary homes, rich pilots, existing hulls, icons, preview pose and Details. Build
regenerated; owner visual/audio playtest pending. See `testing/TESTING-PART2.md`. No merge yet.

## 2026-11-16: Feature batch Part 1 — targeting and missile UI (items 4–7)

Nine requested features split into parts. Implemented ONLY items 4–7 here:
F switches directly to a different crosshair candidate; same candidate or empty
space releases the lock. Station identity comparisons use place/feature ids.
Removed target-acquired notification and the redundant Locked label. Selected
hostile names have compact blue shield / white hull percentage-fill bars above;
current enemies have no shields, so the shield bar is empty, not fabricated.
Missile brackets now travel from 106 to 34 px radius (was 58 to 34), with a small
progress bar and percentage below. Valid F-selected enemies override the nearest
crosshair candidate, preserving acquisition when another enemy crosses. Cone,
range, free-camera, no-launcher and warp rules remain unchanged.

Files: `sim/{targeting,weapons}.js`, `ui/hud.js`, `data/weapons.js`, `index.html`,
styles, weapon/instance tests, generated HTML and handoff. Also fixed an unrelated
flaky headless AI test: seed it and assert manoeuvring range, not the old uniform
orbit's 300 m endpoint. No NPC behaviour changed. **Save v21.** Build passes;
**677/677 tests pass**. Owner visual playtest pending; checklist `testing/TESTING-TARGETING.md`.

**Still pending:** 1 map/route icons, 2 compact mission log, 3 mechanical undock
sound, 8 Base-tab cleanup, 9 persistent home-station selection/death respawn.
Do not claim these are implemented. Home-station persistence needs save review.

Part 1 visual follow-up: target bars now fill the label width from the left,
with a right-aligned percentage on each row. Offscreen/behind-camera/clipped
selected targets retain the edge-pinned name/health label but no small target
square; on-screen targets retain both. `ui/target-display.js` provides tested
pure markup/visibility helpers; `hud.js`, CSS, UI README and regression tests
updated. No gameplay/save change. Build passes; **679/679 tests pass**; preview pending.

Owner revision: removed the missile-lock progress bar and percentage, including
numeric acquisition hint. The expanded corner geometry, easing, colours, flash,
lock timing and F-target priority are unchanged. NPC health bars/percentages stay.
Files: `ui/hud.js`, `data/weapons.js`, `sim/weapons.js`, weapon tests, playtest guide,
generated HTML and handoff. Save v21; build passes; **679/679 tests pass**.

## 2026-11-16: Individual fighter pilots and per-enemy AI personalities

Owner requested smarter, more varied NPC flight without a difficulty/stat increase:
stop synchronized paths/merged ships, strafe, dodge, seek firing positions and avoid
obstacles; Guardians should be more aggressive than newbie raiders.

- `data/enemy-ai.js`: baseline movement profile plus explicit raider, smuggler,
  freighter, hive/rift/deep guardian profiles. New enemies fall back to standard;
  `aiProfile` selects a profile and `aiTuning` overrides individual settings.
- `sim/enemy-flight.js`: per-pilot independent seeded brain, approach/attack/strafe/
  breakaway decisions, different hands/phases/ranges/timers, vertical movement,
  delayed probabilistic projectile dodges with cooldowns. Guardians favour close
  attack runs; freighters are conservative. Brain state is transient (save v21).
- Predictive rock/ship/player separation plus hull-width station collider probes.
  Existing collision resolution remains the safety net; avoidance is not a promise
  of collision-free flight in every crowded or concave environment.
- Fire only with a clear scenery/rock/friendly lane. Existing damage, fire cadence,
  hull stats and aim-cone gate retained. No target-velocity lead; angular shot spread
  replaces the old centimetre-scale offset that was effectively perfect at range.
- Combat lifecycle oracle re-recorded intentionally: paths, projectiles, locks and
  combat damage differ, while player position/orientation/velocity and final profile
  match the prior recording. Mining, missile use and death recovery assertions kept.

Files: `data/{enemies,enemy-ai}.js`, `sim/{ai,enemy-flight}.js`, new flight tests,
combat fixture/test, folder READMEs, handoff/lessons, generated HTML and playtest
checklist `testing/TESTING-NPC-AI.md`. **Save v21**, no new dependency. Build and
full suite pass (**668/668 tests**). Difficulty feel and crowded-belt performance need owner
playtest; NOT claimed balanced from headless tests alone. No merge without approval.

Scenery follow-up after owner approved AI: Meridian **Station pocket only** now
rotates its C opening toward the sun's derived map direction, and lowers its field
centre by 50 m. Other Meridian pockets are not excluded from the ordinary-field
changes. Shared feature resolution applies a per-pocket override without mutating
the authored catalog. C belts increase outer stray slots from 3.5% to 16%, with a
continuous outward tail (no artificial gap). Symmetric smooth vertical falloff
extends asteroid-centre height to 1.25×, sparse at both edges, not a hard slab.
Other station/non-belt pocket fields widen 2.5× horizontally, preserving original
core density weights and height. Counts include the integrated sparse quadratic
outer wings; outer contours vary gently. Authored rift instances are unchanged.
Files: `data/{scenery,places,place-templates}.js`, `sim/{asteroids,galaxy}.js`,
density tests and rift/UI fixture positions (clear-space tests moved outside the
rotated belt), generated HTML and handoff. Save v21; build passes and **671/671
tests pass**. Visual preview pending.

Meridian arrival follow-up: authored system-space Y is now exactly -0.049 AU
(X/Z unchanged). The station pocket declares a 1000 m sunward arrival: generation
uses the true 3D direction from its AU position to the sun and faces the station.
The populated arc remains behind the station, opposite the opening: belt → station
→ warp-in → sun. Other arrivals unchanged. Files: `data/places.js`, `sim/galaxy.js`,
density/arrival tests, generated HTML and handoff. Save v21. Build passes;
**672/672 tests pass**. Owner visual preview pending.

## 2026-11-16: Wider 4 km belts, restored Meridian, quieter planets and circular sky markers

Owner requested wider belts with the nearest surface ~4 km from central arrival,
unchanged height and similar density. Meridian arc: inner 4 km, width 2 km,
938 rocks, height ±280 m. Dedicated arcs: inner 4 km, width 2.75 km, height
±420 m; counts scale by annular area. Taper and non-overlap packing remain.

Meridian explicitly selects its original pre-rework 90 m ring/four-spoke model.
Commerce rings use original grey/amber colours with uniform lights; top cap base
now touches the core top (y=90), rather than clipping through it. Industrial
refineries lose the detached bottom slab. Planets use solid class colours with
lighting/atmosphere, no low-resolution procedural surface maps (generator retained
unused for future work). Local planets shrink from ~105° to ~36° angular diameter
and sit below the horizontal arrival view. Distant planet bodies remain coloured
spheres. Pocket/belt PointsMaterial markers discard corners in their shaders so
they are circular, not square. Menu still has its planet and generated sky.

Files: `src/data/{places,stations}.js`, `src/sim/galaxy.js`,
`src/render/{models,systemsky}.js`, render README, pocket-density and new visual
regression tests, generated HTML, handoff and lessons. **Save stays v21**.
`npm run build` passes; **658/658 tests pass**. Owner preview pending;
larger belts have more rocks, so check performance as well as appearance.

Follow-up: owner requested planets 30% bigger and back in line with the main POI,
plus less-perfect belt contours and occasional strays. Local planet radius now
0.338 of sky depth (was 0.26), elevation zero, aligned with the POI/arrival heading.
Planet arrivals face the local field's horizontal direction when present. Belt
contours have seeded multi-wave inner/width variation; inner shifts only outward
so the ~4 km clearance stays safe. ~3.5% of slots become outer strays, 250–800 m
beyond the local band, still at the same height and with non-overlap spacing.
Tapered tips, rock counts and stable slot planning remain. Tuning lives in new
`src/data/scenery.js`; changes also touch `sim/asteroids.js`, `sim/galaxy.js`,
`render/systemsky.js`, density/visual tests and generated HTML. Save v21;
`npm run build` passes; **659/659 tests pass**. Updated visual/performance preview still pending.

Second preview follow-up: owner approved planet elevation but wanted another 30%
size increase and a much more visible belt-tip falloff. Planet sky radius is now
0.4394 (was 0.338), with distance/elevation/POI alignment unchanged. Arc density
now follows a full-length sine-squared falloff from the populated middle to a
1% weight at each tip, instead of a short end taper with a 12% floor. Actual
packed-rock tests require the outermost two 10% sectors combined to contain less
than one fifth of the equal-width central sector. Counts, height, clearance,
irregular contours, strays and collision spacing stay unchanged. Files:
`data/scenery.js`, `sim/asteroids.js`, density/visual tests, generated HTML and
handoff. Save v21; `npm run build` passes; **659/659 tests pass**. Owner preview pending.

Third preview follow-up: owner requested half overall belt density, stronger
thinning from the C middle, and atmosphere shells one third as thick. Meridian
now has 469 rocks; dedicated belt count scaling halved from 0.56 to 0.28 (same
footprint/height). Arc weighting is sine-to-the-fourth with a 0.2% tip floor,
rather than sine-squared with a 1% floor. Strays and non-overlap rules remain.
Atmospheres scale the shell's excess radius by 1/3, never the surface radius;
applied to system-sky planets, authored/menu planets, GLB atmosphere fallback,
and distant-planet halo extent. Surface size, elevation and colours unchanged.
Files: `data/{places,scenery}.js`, `sim/galaxy.js`, `render/{models,systemsky}.js`,
density/visual tests, generated HTML and handoff. Save v21. `npm run build` passes;
**660/660 tests pass**. Owner preview pending.

Marker follow-up: arc-field HUD labels now sit halfway through the band at the
angular midpoint of the populated C (opposite its opening), using the seeded
contour at that angle. The field origin and central warp arrival do not move.
Ordinary field markers remain at their centres. Files: `sim/asteroids.js`,
`ui/hud.js`, `tests/pocket-density.test.mjs`, generated HTML and handoff.
Save v21; build green; **661/661 tests pass**. Owner preview pending.

## 2026-11-16: Flatter, lighter belts with naturally thinning edges

Owner approved the C arcs, then requested 30% less height, confirmed 20% LESS
density, and gradual thinning toward both tips. Meridian's centre-height range
is now ±280 m (was ±400); dedicated belts ±420 m (was ±600). Counts scale by
0.7 × 0.8 = 0.56 so reducing height does not inadvertently INCREASE volume
density: Meridian has 420 rocks; generated belts 392–532. Arc-tip density uses
a smoothstep taper over the outer quarter of each end, down to 12% placement
weight at the tips; the broad middle remains populated. The ~2 km clear centre,
non-overlap bounds, giant sizes and stable slot planning remain unchanged.

Ordinary template fields (including secondary/extended fields) and planet fields
are 25% wider, with quadratic radial falloff from weight 1 at the centre to 0.3
at the edge. Counts stay similar: the larger footprint offsets the falloff,
keeping central density approximately as before. Smaller-field heights unchanged.
Both stable and ad-hoc spawns apply the same density profiles.

Files: `src/data/{places,place-templates}.js`, `src/sim/{asteroids,galaxy}.js`,
`tests/pocket-density.test.mjs`, generated HTML and handoff. **Save stays v21**.
`npm run build` green; **655/655 tests pass**, including profile symmetry,
actual arc-tip thinning, field widening, spacing and arrival-clearance tests.
Updated taper visuals still need owner preview.

## 2026-11-16: C-shaped belts, central arrivals and non-intersecting asteroids

Owner: make belts a tightly packed big C, arrive in the middle with the nearest
asteroid about 2 km away; Meridian should feel surrounded rather than one blob.
Meridian now has a 270-degree, 750-rock arc around [0, 0, 600], surrounding the
station while keeping a clear approach opening. Dedicated belts have 700–950
rocks in seeded-orientation 270-degree arcs. Arrivals are the arc centre, facing
the populated side. Inner clearance is measured to conservative rock surfaces,
not centres; tests check the nearest surface is 2.0–2.2 km away.

Largest-first deterministic packing uses bounds of the actual built-in lumpy
geometry and nonuniform scale, with 20 m extra spacing. All stable slots across
all fields are reserved, including mined slots, so reload/respawn order cannot
shift neighbours. A bounded layout cache avoids rebuilding each slot. Overfull
custom fields omit unplaceable slots after finite retries, never force overlap.
Giants remain, at lower frequency to leave room for dense smaller rocks. These
bounds cover built-in shapes; custom GLB overrides need separate bounds review.
Rift clearance now respects the C opening rather than treating it as a solid ball;
secondary-field cooldown respawns resolve the correct field. Meridian's launch
heading is preserved using an explicit field focus.

Files: `src/data/{places,place-templates}.js`, `src/sim/{galaxy,asteroids,places,instances}.js`,
`tests/pocket-density.test.mjs`, generated HTML and handoff. **Save stays v21**.
`npm run build` green; **653/653 tests pass**. Owner visual/performance preview
still required. Existing field slot cooldowns remain keyed by field id and slot.

## 2026-11-16: Denser pockets, close warp-ins and massive asteroids

Owner preview: overall good, but pockets were too spread out and rocks too small.
Restored Meridian's original 70-rock field at [1800, 200, -1500], radius 700 m;
five connected 90-rock sections extend it ~6.4 km outward (520 rocks total).
Dedicated belts now chain 5–7 dense sections, each 750–1000 m radius and roughly
65–120 rocks. Frontiers regain dense local fields with outward extensions or a
second field; trade/outpost/planet fields and encounter positions move closer.
Stations arrive at roughly 650–1200 m plus small jitter; fields arrive 500–800 m
outside their first section. Seeded facing and planet approaches remain intact.
Rare low-poly giants mix with normal rocks: radii 180–400 m in frontier fields,
180–360 m in Meridian extensions, 200–500 m in dedicated belts. Independent
size RNG preserves ordinary stable slots; existing shapes/collision are reused.

Files: `src/data/{places,place-templates}.js`, `src/sim/{galaxy,asteroids}.js`,
`tests/pocket-density.test.mjs`, loader test and combat fixture (only original
launch quaternions restored), generated HTML and handoff. **Save stays v21.**
`npm run build` passes; **652/652 tests pass**. Visual density and frame-rate
still need owner preview.

## 2026-11-16: The generated universe rework — vast EVE-like pockets, seeded planets, dedicated belts, four station classes

Owner: "Let's do a real variety pass on the generated universe … asteroid belts should be their own dedicated pockets …
makes 100–1000 km planets … 1–4 seeded planets per system … four station classes … EVE-like scale …" **Save version
unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet — built low-poly first for
owner preview; heavy shader/texture polish waits for that preview.

- **Pockets are vast and EVE-like, and every pocket is different.** Frontier/trade-lane/outpost templates were
  rescaled to kilometres-wide spreads (a frontier belt can be 6.8–14.4 km radius; trade lanes and outposts vary or
  lose their field entirely) with seeded per-pocket variation (`varyTemplateFeatures` in `data/place-templates.js`):
  position, radius, rock count, two-separated-fields rolls, and encounter positions rolled per pocket. Meridian is
  vast too (the home field sits ~16 km out at radius 3.6 km); it keeps only a small home-field convenience.
- **Ambient static loot is gone.** Generated pockets no longer declare derelict/resource-cache raw-crate features;
  kill drops, hostile drops, mission drops, recovery contracts and authored mission crates are untouched. Existing
  save placeMemory migrates untouched (v21).
- **Dedicated belt pockets.** 1–3 per system, named `<System> - Asteroid belt N`, each its own **`role: "belt"`** pocket
  on its own map annulus (`beltRadius`/`beltSpread`), 34–182 rocks with a seeded lean/rich roll, fields 7.8–18.3 km
  radius, with tier-scaled one-shot hostile patrols (chance/wanderers/count scale with the system's advisory tier).
  Internal hub↔belt links keep them warpable (and reachable in a `links`-policy system); map icon is three ochre dots.
- **Seeded planets.** 1–4 per system (all systems, black holes included), named `<Core proper name>-b`…`-e` after the
  core proper name (never `-a`). Four classes — rocky, ice, gas giant, volcanic — with per-class radius (~110–1000 km),
  palette, atmosphere, spin, orbit-rock counts and rock ore tables (`data/planets.js`, `data/loot.js`). Each planet is a
  warpable low-orbit pocket with some orbit-rock fields; it renders as a true-angular-size body elsewhere in the system
  (`systemsky.js`, AU-based) and as a dominating sky backdrop inside its own pocket (procedural maps in
  `render/planetmaps.js`, Lambert day/night shading, additive atmosphere shell). Positions are fixed — no orbits, no
  artificial boundary anywhere. Planets also get internal hub↔planet links and a ring+disc map icon.
- **Stations: four classes with real silhouettes.** `commerce` (spun ring), `industrial` (foundry tower stack),
  `military` (octagonal citadel), `mining` (excavation platform with drill arm), chosen by place id hash; generated
  station names are class-weighted (`data/stations.js`). Built-ins today; `station.<class>.glb` (then `station.glb`)
  overrides later — drop-in, no code changes.
- **Warp-in is fixed, seeded and unique per pocket:** generally 3–8 km from the pocket's main POI on a line facing it
  (belts/planets face their field/approach direction; station pockets face their station; empty pockets face the
  star/black hole). Computed once at resolve time (`finalizeArrivals` in `sim/galaxy.js`), carried on the place record
  (`enter.pos`/`enter.face`); `sim/sectors.js` applies the face on arrival.
- **The menu wears the normal-space generated skybox** (in addition to its station/planet composition; the planet is a
  fixed in-scene class world now — planets are pockets, not scenery). **The title keeps its planet backdrop** (owner).
- **Map:** belt/planet annuli and icons; `minZoom` semantics unchanged (1 = system fit; zooming out from fit exits to
  the galaxy). **Save stays v21.** **649/649 tests pass** (the 8b fixture was re-recorded: launch heading follows the
  moved home field; several tests were updated to the vast world; the static-encounter machinery is now tested with an
  ad-hoc authored record since generated pockets no longer emit one).

Files: `src/data/planets.js` (new), `src/data/stations.js` (new), `src/render/planetmaps.js` (new), `src/data/place-templates.js`,
`src/data/places.js`, `src/data/galaxy.js`, `src/data/loot.js`, `src/sim/galaxy.js`, `src/sim/sectors.js`, `src/render/systemsky.js`,
`src/render/models.js`, `src/render/menuview.js`, `src/ui/starmap.js`, `src/styles.css`,
`tests/fixtures/step8b-combat-lifecycle.json`, `tests/single-player-combat-8b.test.mjs`, `tests/content.test.mjs`,
`tests/step11b-starmap.test.mjs`, `tests/step12-places.test.mjs`, `tests/step14-instances.test.mjs`,
`src/data/README.md`, `src/render/README.md`, `game/tallow-reach.html`.

Known follow-ups: true-scale AU flight is a later decision (planets are warp-gated today; the sky's AU math is
distance-correct); 3 km-wide fields will need the frame budget/graphics-settings pass before texture work; station/planet
GLB drops; playtest not done yet (owner 2026-11-16 build).

---

## 2026-11-21: Yaw is the slow axis, roll the fast one — per-ship axis tuning

At the owner's request, to promote crossing flight paths: every ship (player
and NPC, through the shared model) now turns with **yaw at 40%** of its old
rate (`FLIGHT.yawFactor` 1.6 → 0.64; mouse side-to-side is the slowest axis),
**pitch unchanged** (1.2), and **roll at 250%** (`FLIGHT.rollFactor` 1.5 →
3.75, Q/E). Thrust, strafe, lift and reverse untouched. NPCs command yaw and
pitch through `npc-pilot.js`, so their steering obeys the same rates; their
pilot still commands no roll (banking is a separate later tweak).

The axes are now tweakable per ship: flight stats gain `yaw`, `pitch`, `roll`
(multipliers on one axis each) and `turnAll` (one multiplier on all three —
`turnAll: 2` turns twice as fast on every axis), defaulting to 1 in
`FLIGHT.defaultStats`. An NPC type sets them in its `flight` block in
`data/enemies.js` (all eight types now spell the fields out at 1); a flyable
hull sets an optional `flight` block in `SHIPS` (`data/ships.js`), which
`player.js` passes to the model and `flightStatsForShip` copies. Test (i) in
`tests/flight-model.test.mjs` pins the ratios and both override levels; the
render-interpolation smoothness floor and the campaign-fixes raider aim
window were retimed for the slower yaw. Both 8b fixtures were re-recorded and
diffed (LESSONS L17): only steering and enemy-flight downstream differ.

Files: `src/sim/flight-model.js`, `src/sim/player.js`, `src/data/ships.js`,
`src/data/enemies.js`, tests, docs. No save change.
Rebuild `game/tallow-reach.html`; `npm test`.

## 2026-11-16: The edge-compression lens is removed

Owner: "oh remove the lense thing i wont use it in the future" — after saying the current view looks good. The experiment is deleted, not merely disabled: `src/render/remap.js`, `src/render/remapmath.js` and `tests/remap.test.mjs` are gone; `main.js` renders the flight/pause paths with `renderer.render(scene, camera)` directly; `render/camera.js` widens FOV on boost/warp unconditionally again; the HUD lock ring and marker project through the stock projection only; the `src/render/README.md` lens rows are gone. The current look is the stock horizontal-85° + aspect-derived vertical camera. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). ROADMAP stays unticked until a formal playtest tick.

Files: `src/render/remap.js` (removed), `src/render/remapmath.js` (removed), `tests/remap.test.mjs` (removed), `src/main.js`, `src/render/camera.js`, `src/render/README.md`, `src/data/camera.js`, `src/ui/hud.js`, `docs/HANDOFF.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`. **649/649 pass** (9 remap tests deleted with the code); build green.


---

## 2026-11-16: The frame edges are gently stretched — the edge-compression lens (owner's panel 2)

Owner, after rejecting narrow FOV: bodies and sky points read as ovals at the frame's edge because rectilinear projection magnifies the periphery (about 2.2x at our edge; EVE measures about 1.45x there; StarMade on 16:9 measures about 1.18x). This implements the full-frame re-map both AIs proposed, with the numbers checked and the implementation fixed where the preview's claims didn't hold — including a centre-stretch on windows not in 16:9 and a source-coverage bug that clamped the frame rim (the blurry border and too-tall edge planets). **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). With `REMAP.on = false`, the stock pipeline renders byte-for-byte. Owner rejected the look during playtest (too distorted); this branch now builds with `REMAP.on = false` so the stock pipeline renders. The lens code remains in the tree behind the knob; ROADMAP stays unticked.

- **One pass fixes world and sky together.** The flight scene renders into a wider rectilinear render target and a full-screen shader re-draws it through a blend of the rectilinear and stereographic projections, `G(a) = (1−s)·tan a + s·2·tan(a/2)` per axis shared by shader and HUD via `src/render/remapmath.js` (no three.js), with per-axis normalisers (`axisNorms`) so the centre maps at the same scale on both axes on any window shape. The frame's edge lands exactly at `REMAP.edge`; the skybox is scene geometry under this pass, so the nebula is corrected by the same amount — no sky/world drift, no repainting, no art changes.
- **Honest geometry of the knob.** Keeping today's on-axis zoom exactly while widening the frame is impossible for this curve family, so the centre zoom dips by a fixed factor instead: `strength`/`edge` in `src/data/camera.js` choose it (default `0.75` / `38°`: zoom −1.6%, oval factor 1.06 @20°, 1.20 @35°, 1.24 at the edge — EVE measures 1.21; vfov 76°; ~1.3x pixels). `0.6`/`46.5°` is the wide "panel 2" look (zoom −25%, oval factor 1.26 @35°, vfov 93°, ~2.3x pixels); `0.9`/`41°` is balanced (zoom −8%, oval factor ~1.20 at the edge, vfov 82°, ~1.6x pixels). A body dead-centre is drawn with exact horizontal/vertical pixel parity in a square or portrait window as well as 16:9. The curve is separable, not a conformal 2-D projection: at the left/right rim a small body reads wider than tall; at the top/bottom rim it still reads taller than wide (same sign as rectilinear, smaller magnitude).
- **Why not the cubic the preview implied:** the first version compressed too hard — mid-frame circles flipped to taller-than-wide (oval factor 0.79). The blend is the stable shape; `tests/remap.test.mjs` pins the centre parity at every aspect, the monotonicity, the round trip, and the per-axis coverage guarantee.
- **Stock-camera horizontal-85° test (owner request).** The horizontal FOV is now fixed at `BASE_HFOV = 85` (`data/camera.js`); the vertical FOV is derived from the window aspect (`verticalFovForAspect`, ≈54.54° on 16:9 — essentially the 55° trial with an explicit horizontal target). Chase distances were pulled back for 16:9 by tan(35°)/tan(27.268°) ≈ 1.358 (`CAMERA`: idle 14.9, flat-out 23.1, reverse 14.3) so the ship keeps the same on-screen size. On non-16:9 windows the vertical FOV changes while the camera distance stays static, so framing differences are expected. Boost/warp widening keys off `verticalFovForAspect(camera.aspect)`. Not playtested; judge by reload.
- **Coverage, not clamp.** The first build checked `G(alpha)` in the coverage test instead of `tan(alpha)`, so the outermost pixels sampled clamped edge texels — the blurry frame border and the horizontally-squashed edge planets (which then read too tall). `sourceHalfTanB()` now solves the inverse projection on both axes and the test checks `tan(alpha)`; the shader still clamps only as a last-ditch guard.
- **Cost and fallbacks.** MSAA where WebGL2 + pixel ratio 1; otherwise the supersampled source carries edges. Render targets recreate on resize. `REMAP.on = false` restores the stock pipeline byte-for-byte (plain render, old HUD maths, old +4/+16 warp FOV widening). The crash fallback still renders plainly; title screen, docking orbit, pause frame (shared pass), Outfitting viewer and the starmap are unaffected. Boost/warp FOV widening is disabled in lens mode — the warp streaks and flash carry the speed feel instead (the lens cannot widen past its source coverage).
- **HUD stays aligned.** `mark()` and `coneRadiusPx()` in `src/ui/hud.js` project through the same curve when the lens is on (off-screen marker pinning unchanged); `tests/remap.test.mjs` covers the curve, the centre parity, the per-axis coverage guarantee for any aspect, and the small-angle limit of the lock ring.

Files: `src/render/remapmath.js` (new), `src/render/remap.js` (new), `src/data/camera.js` (`REMAP`, `BASE_HFOV`, `verticalFovForAspect`, `CAMERA` distances), `src/render/camera.js`, `src/render/scene.js`, `src/main.js`, `src/ui/hud.js`, `src/render/README.md`, `tests/remap.test.mjs` (new, 9 tests), `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`. **658/658 pass**; build green.

---

## 2026-11-16: The system sky passed its playtest

Owner: "good, play test so far passed" (2026-11-16) — the system-space work from the previous entry is confirmed:
star/black hole visible and correctly placed, dots, per-pocket lighting, per-system sizes. Docs-only status change; no
code moved. HANDOFF and the ROADMAP current position and log line now say the playtest passed; 14c remains ticked. Save
version unchanged (**v21**); `npm run build` and `npm test` re-run green.

---

## 2026-11-16: System space — AUs, a true 3D position for every pocket, and a sky that shows the system you're in

Owner: "All pockets in a system should have a type of 3d position in x, y, z. This is to prepare the game for a
potential feature in the future if i make warping within a system more dynamic by putting you in a so called 'warp
space' … Another reason is so that the skybox will now have another layer that is dependant on the 3d position of the
pocket and celestials." Owner's playtests of everything pending (14c, cube-map skies, collision damage, Test Ship,
both bug rounds) **passed**; 14c is ticked in ROADMAP. **Save version unchanged (v21)**; rebuild needed (`npm run
build`, then `npm test`). NOT playtested yet.

- **Pockets have 3D AU positions, derived — never saved.** `systemSpatialLayout(world, systemId)` in `sim/galaxy.js`
  lifts the same deterministic layout the 2D pocket map uses into AUs (1 AU = 150 million km): map `x` → AU `x`, map
  `y` → AU `z`, and a tiny seeded height per pocket inside `±heightAmplitudeAu` (1.2 AU) so bodies don't ride one
  line; an authored `mapHeight` wins the roll (the owner's future manual-height path). The map stays 2D and unchanged;
  no save shape changes. Runtime-registered wormhole pockets are included via their authored `mapPos`, like their
  siblings. Snapshot: systems are measured in AUs — flying inside a pocket never meaningfully moves it in the system.
- **Systems have their own size, and it's dynamic.** Each system rolls a stable seeded multiplier in [0.6, 1.6]
  (`systemScale`, hashed from seed + system id) on `auPerMapUnit` (0.05) — that is the one fixed conversion; some
  systems come out compact, some vast, and each keeps its own. A system's outer boundary (`radiusAu`) is simply its
  farthest pocket from the core, so adding a farther pocket makes the system bigger by itself. No field is stored.
- **The sky has a system layer now (`render/systemsky.js`).** Every ordinary pocket of a system — including a spawned
  simple wormhole's pocket — hangs the system's star/black hole in its true direction and every sibling pocket as a
  barely-visible dot. The body renders as a real 3D sphere at the sky's depth with an additive halo: it cannot be
  flown to (the sky follows the camera), and its apparent size is its set AU size over the flying pocket's distance
  (`star.radiusAu` 0.16 / `blackHole.radiusAu` 0.1) — closer pocket → bigger body, compact system → bigger sun.
  Black hole: dimmer, slight orange tint; stars are one look, with room for shades later. Instances (rifts, the far
  side of a wormhole) are in no system and keep their own skies, unchanged.
- **The light always comes from the body you can see.** `showPlace` re-aims the one DirectionalLight per pocket from
  the star/black hole direction; black hole light is dimmer (1.35 vs 2.1) and orange-tinted. Instances get the old
  default back; hemisphere light unchanged.
- **Tests:** new `tests/system-spatial.test.mjs` (9) pins the derivation (heights inside the band, map↔3D lift, scale
  bounds and stability, boundary growth, origin-centred body, star/blackHole core, runtime wormhole inject, tuning
  validation). **649/649 pass**; build 3008 KB.
- **Not done, deliberately:** the warp-space flight itself (step TBD), star shades, authored per-system scale
  override, per-pocket authored heights beyond the `mapHeight` hook, lighting from a raised body on the 2D map
  (map stays 2D).

Files: `src/data/galaxy.js`, `src/sim/galaxy.js`, `src/render/systemsky.js` (new), `src/render/scene.js`, `tests/system-spatial.test.mjs` (new), `src/render/README.md`, `src/sim/README.md`, `src/data/README.md`, `testing/TESTING-SYSTEM-SKY.md` (new), `docs/architecture/world-and-map.md`, `docs/architecture/simulation-and-rendering.md`, `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

---

## 2026-11-15: Hitting the station hurts again — solid means collision damage, by default

Owner: "Collision damage is gone from the meridian station. Everything that is solid should apply collision damage
unless otherwise specific. Asteroids still apply collision damage correctly."

Exactly right, and it was one default. A rock's collider carries `damage: 1` (hardcoded in `collideRockAt`), so rocks
always hurt. Scenery went the other way: `colliderFromObject` took `damage = 0`, `scene.js` passed
`f.collideDmg ?? 0`, and `player.js` gated on `hit.damage > 0` then multiplied by the factor — so a factor of 0
zeroed the damage and the condition skipped it. Every station, planet and cave had been a free bounce since the
model-fitted collision work, and **no test checked it either way**, which is why it survived three sessions.

**No save change (v21).** `npm test` **640/640**, `npm run build` 3002 KB.

- **The rule is now the owner's rule: solid means `damage: 1`, the same factor a rock uses.** Fly into Meridian above
  25 m/s and it costs `speed * 0.015 * damage` — shields first, exactly the rock rate, measured. The 25 m/s threshold
  is unchanged (drifting into a station is still free).
- **Opt-outs are data, not defaults.** `collideDmg: 0` makes a surface solid but harmless (a bounce), `collideDmg: 2`
  makes one hurt twice as much, `collide: false` still means no collider at all. Default `1` in both
  `colliderFromObject` and `scene.js`.
- **Hostiles obey the same rule.** `ai.js` used to bounce raiders off scenery for free while a rock hurt them; scenery
  now damages them through the same `enemy-rammed` event with `byPlayer: null`, so it is an environmental kill that
  credits no pilot and settles every kill objective the same way a rock kill does. The rock path's 25 m/s gate is
  kept for both.
- **A test-prop lesson, not a game bug:** a *single flat triangle* is a bad stand-in for a wall — a 4.8 m hull can
  straddle a zero-thickness plane between two ticks and register nothing. Real scenery is closed geometry and every
  Meridian part is thick enough (thinnest 2 m, so a 4.8 m hull overlaps it from 3.8 m away). The new hostile test
  builds a closed slab.
- **Files:** `src/render/collideModel.js`, `src/render/scene.js`, `src/sim/player.js`, `src/sim/ai.js`, docs.
- **Tests:** new `tests/collision-damage.test.mjs` (6) — the bake defaults to 1 for still parts and movers, flying
  into the station costs hull, the cost is the rock rate scaled by the factor, `collideDmg: 0` bounces for free,
  slow contact is still free, and a rock and a station cost the same for the same approach. `tests/enemy-collision.test.mjs`
  gains one (scenery damages a hostile, `collideDmg: 0` does not). Two of these were checked to FAIL with the old
  default restored.
- **Not playtested.** Headless only; the owner's own flight is the visual check.

Files: `src/render/collideModel.js`, `src/render/scene.js`, `src/sim/player.js`, `src/sim/ai.js`,
`tests/collision-damage.test.mjs` (new), `tests/enemy-collision.test.mjs`, `docs/GLB_MODELS.md`, `docs/HANDOFF.md`,
`docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

## 2026-11-15: Big moving parts are solid, and a wormhole pocket is really there after a reload

Two owner bug reports, both fixed at the level they live at rather than at the symptom.

Owner, on collision: "Meridian station arms that connect to the ring have no collision box. I think its good if
collision boxes are more accurate to the model by default. Obviously dont go completely crazy with collision box
accuracy if it causes performance issues." And then the rule that set the design: **"the way you integrate this needs
to be foundational so that big moving parts on structures have collision boxes by default. Very tiny details its ok
if they dont have collision box, try to make collision boxes as accurate as possible by default while having a
reasonable performance consideration."**

**No save change (v21).** `npm test` **633/633**, `npm run build` 3002 KB.

- **Why the arms had no collider.** They were tagged `noclip.spin`, and not by mistake: a collider is a *bake*, a
  bake is a snapshot, and a snapshot of a turning part is wrong the moment it turns. Meridian's arms are 180 m long
  at 0.1 rad/s, so a still hitbox is **144 m** away from the drawn arm inside a minute. Baking several copies
  through the turn is the other wrong answer: fat between copies, and N× the triangles forever.
- **The foundation: live colliders for moving parts.** A part named `spin` now bakes its soup **once in its own
  space** and carries `mover = { pos, quat, scale, object }`; `render/scene.js` refreshes that from the part's world
  matrix each frame (`refreshMover`), and `sim/colliders.js` carries the query into the part's space instead of
  carrying triangles out — the same trick asteroid soups already used. Exact at every angle, no re-bake, no extra
  triangles; a frame's cost for a mover is one `decompose()`. Both `collideSphereAt` (ships) and `segmentColliderHit`
  (weapons) understand movers, so the arms are solid to the hull **and** to every weapon, per the rule shipped earlier
  today. Small decoration (the twelve warning lights) stays `noclip` — the owner's exception.
- **A real bug fell out of this: `closestPointTriangle` was wrong for most hits.** Its face-interior branch was
  guarded by a triple product that is **identically zero**, so every query landing inside a triangle reported
  *vertex A* as the closest point. Penetration was then measured from a far corner and the push-out normal pointed
  at it. That affected ship-vs-scenery and ship-vs-rock everywhere, not just the arms; a box's broad flat face is
  exactly where it showed. Fixed, with two tests that compare the push-out against the real analytic surface
  distance. Flight feel is unchanged (`SHIP_RADIUS` still 4) — hulls are simply pushed out along the right normal now.
- **The wormhole bug: the pocket was never loaded, so its rocks were never there.** Owner: "Going inside a simple
  wormhole and exiting the game in the wormhole… open game again and go through the exit wormhole and you get back
  to the simple wormhole pocket in normal space. This causes the debris around the wormhole in normal space
  invisible, wormhole is visible though. The debris are visible again when you warp out and back into the simple
  wormhole pocket." `loadPlace` only fills a place when the container is not loaded — and on a normal visit that
  runs. But a pilot who quit **inside** the run is put straight back into the run by the load, so the pocket they
  came through is never visited and nothing ever builds it. `leaveInstance` → `sendPilotsHome` then returned them
  to a pocket with no world behind it: the door is rebuilt from the place definition either way, so it was visible,
  while the asteroid field (which lives in the world) was empty and therefore invisible. **Fix:** `sendPilotsHome`
  loads the place it sends the pilot back to. Idempotent, so the ordinary path is unchanged.
- **Files:** `src/render/collideModel.js`, `src/render/scene.js`, `src/render/models.js`, `src/sim/colliders.js`,
  `src/sim/instances.js`, `docs/GLB_MODELS.md`, two new tests below.
- **Tests:** new `tests/moving-colliders.test.mjs` (11) — the hitbox is exactly on the arms at 24 spin phases and
  clear between them, the soup is never rebuilt, a full turn does not drift it, ships are pushed out along the
  part's own normal, the station's still parts keep their 840 triangles, the arms add 48 (not 48× samples), and the
  source guard that the arms are still named `spin`. New `tests/wormhole-reload-return.test.mjs` (3) — quit in the
  run, reload, exit, and the pocket's field matches a fresh visit exactly (it was 0 rocks before the fix).
- **Not playtested.** The owner's own flight is the only visual check; both fixes are headless-verified only.

Files: `src/render/collideModel.js`, `src/render/scene.js`, `src/render/models.js`, `src/sim/colliders.js`,
`src/sim/instances.js`, `tests/moving-colliders.test.mjs` (new), `tests/wormhole-reload-return.test.mjs` (new),
`docs/GLB_MODELS.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `docs/HANDOFF.md`, `docs/LESSONS.md`,
`game/tallow-reach.html`.

## 2026-11-15: Every weapon stops on a collider — shots no longer pass through the station

Owner: "collision boxes that are not no-clipable stop all types of weapons / projectiles in a logical way. So all
cannons, missiles etc should impact when hitting a collision box. I notice if I shoot meridian station with cannons it
goes through it. Not sure how it works with asteroids but make sure the hit boxes stop them so its realistic."
**No save change (v21).** `npm test` **619/619**, `npm run build` 2999 KB.

- **The bug:** `updateBullets` tested hostiles (a sphere), then rocks (a distance-to-centre circle), and **never looked at
  a place's colliders at all**. A station had nothing to hit, so every shot passed through it. Enemy fire had the same
  hole in reverse — and because bolts stopped on a rock's *bounding circle* rather than its mesh, a shot could also die
  on empty space beside a lumpy one.
- **The fix, in `sim/colliders.js`:** `sweepColliders` / `segmentColliderHit` / `segmentRockHit` walk the **segment a
  projectile covered that tick** (Möller–Trumbore, two-sided) across the place's colliders and the rock soups, and return
  the nearest hit with its fraction along the path. Sweeping rather than sampling the end point matters: a 900 m/s bolt
  covers 15 m a tick, so a station spoke or a small rock can sit entirely between two ticks. Unit checks: a thin sheet
  between two ticks is caught; the nearest of two colliders wins regardless of list order; a rock is transformed into
  model space rather than every vertex out.
- **Bolt rule, in order:** a hostile's hull, then the scenery and rocks, then the pilot's hull for a hostile's shot. The
  wall is checked for both sides, because a wall is a wall whoever fired. A shot that meets scenery dies **at the impact
  point** with a spark, and damages nothing — scenery has no hull points.
- **Missiles** sweep the same swath and burst on scenery and rocks instead of sailing through. **The mining beam** is
  blocked too: a station wall between the ship and the rock stops the cut, the beam is drawn to the wall, and `beamT`
  does not advance, so a rock cannot be mined through a station.
- **The owner's exact case is a test.** `tests/projectile-collision.test.mjs` builds Meridian Station's real geometry
  (ring, hub, base, dock box; the four `noclip.spin` spokes correctly excluded), and checks a bolt down the station's axis
  stops on the hub, one at the ring hits the ring, and shots 400 m clear or 200 m above fly on.
- **`noclip` and `collide: false` still let projectiles through**, which is what they are for: only clipping colliders
  stop a weapon. That is asserted, not assumed.
- **Balance effect, measured rather than assumed:** the Meridian belt is sparse — of 24 lines out from the station, one
  meets a rock within 4 km — so combat does not become a corridor. Enemy fire can now be blocked by a rock when the pilot
  takes cover behind one, which is the realism the owner asked for.
- **One golden fixture re-recorded** (`tests/fixtures/step8b-combat-lifecycle.json`) and the reason is written into the
  test file. Every player position, heading, velocity, power reading, cooldown, missile, ore count, credit and docked
  flag is byte-identical; what changed is that shots stop at the rock and the pilot keeps the shields the raider's fire
  used to take **by passing through that same rock** (10 instead of falling to 0), so hull stays 10 and saved hp is 1, not
  0.6. Its three narrative assertions (mined ore, a missile launched, died and docked) all still hold.

---

## 2026-11-15: The skies are cube maps — six 2048 faces each, no distortion and no seams

The owner: "the skyboxes look a bit distorted and also a little bit blurry since im using 4k monitor. Make the Skybox
generator be a box, ie 6 square faces forming a cube. So remove the equirectangular ones we have now. Generate new ones
that replace the current ones." He asked for at least 4096 per face, was shown the cost (4096 = 100.7 Mpx, ~1.7–2.8 MB,
384 MB of GPU memory, 10–13 min a sky), and **chose 2048** (`--face` is still one flag away). **No save change (v21).**
`npm test` **610/610**, `npm run build` 2997 KB (was 3016 KB — smaller, with six times the pixel density where it counts).

- **The tool writes cube maps now.** `tools/skybox/skybox.py` builds the soft layers **once on a sphere in direction
  space** (`SOFT_FACE_WIDTHS = 2.0` face widths, i.e. the same texel density the old panorama had, so the looks did not
  change), then cuts six faces out of it with a 2× supersampled box filter. Every layer is a function of the direction a
  pixel looks in, never of a face's x/y, so the faces agree at their edges by construction — no margins, no per-face
  special cases, one face in memory at a time (~3 GB). One exposure for all six faces; stars placed once in direction
  space and thinned by the dust; `finish_face` tone-maps and dithers each face.
- **The seam check is new and honest.** `cube_seam_error` walks all 24 edges: for an edge pixel of a face it computes
  the direction with `face_dirs` and samples the neighbouring face through `CUBE_NEIGHBOURS`. Measured on the three
  installed skies: **worst edge 0.66/255** (a smooth sky reads ~0 here, so this is a sharp test, not a rubber stamp).
  A smoke test at 1024 per face on a smooth field reads 1.81/0.43/0.22 at face 64/256/512 and trends to 0.
- **CLI:** `--face`/`--face-size` replaces `--size` (1024 for a smoke test, 2048 the default, 4096 on the owner's word,
  8192 the ceiling); a spec's `face` key replaces `size`. `make` takes about **4½ minutes** per sky at 2048.
- **Three skies regenerated from their existing recipes**, same ids and same looks, at 2048 per face:
  `normal_space` (258 KB), `rift_chaos` (470 KB), `wormhole_grey` (279 KB) — **~1 MB for the whole set**, and the built
  page got 19 KB *smaller*. Each install wrote six faces to `src/assets/skyboxes/<id>/`, the recipe, and the registry
  lines. `tests/skybox.test.mjs` now checks six square faces per sky, six imports, one array entry in cube order.
- **The game draws a box.** `SKIES.cube` in `render/scene.js` replaces `shattered`, `panorama` and `shroud`
  (all three are **gone**, with `SHATTERED_URLS` and the imports of the owner's panoramas): a `BoxGeometry` with six
  face materials, `BackSide`, unlit, no depth write, no mipmaps, one linear filter — the same treatment the panoramas
  had. The shell no longer spins: a star pattern turning under a fixed ship reads as the ship drifting.
- **`src/render/cubemap.js` is new, and it fixed a real bug.** `BoxGeometry` groups its faces in cube order but frames
  **+Y and -Y the other way up**, so the top and bottom faces would have arrived upside down. The new file holds
  `CUBE_FACES`, `CUBE_FACE_FLIP` and `orientFace`, and `tests/skybox.test.mjs` reads `FACE_AXES` out of the generator,
  rebuilds `BoxGeometry`'s frames with three.js, and proves each flip necessary and no flip redundant. (A single
  `CubeTexture` would have needed `envMap` and a shader hook in three r128; six plain textures is the same picture
  with nothing to go wrong.)
- **Vocabulary is one word.** `SKY_KINDS = ["cube"]`, `DEFAULT_SKY.kind = "cube"`, five templates say `kind: "cube"`.
  `data/skyboxes.js` lines carry `face` instead of `size`.
- **The owner's three panoramas are kept as history** (`src/assets/sky-*.webp`, unused, recorded in
  `src/assets/README.md`); nothing draws them any more and **do not delete them without his word**.
- Docs: recipe 24, `tools/skybox/README.md` (how the cube is made, the face-size rule, the never-hand-flip rule),
  `src/assets`, `src/data` and `src/render` READMEs, LESSONS L24.
- **Needs the owner's playtest:** the numbers say seamless and the preview sheets look like the approved skies, but no
  browser exists in the sandbox — only his 4K screen can confirm "sharp and undistorted".

---

## 2026-11-15: Every sky is a generated skybox now — normal space, rifts and wormholes, and the starfield is gone

The owner picked the skies and asked for three things in one go: normal space wears the sky we kept earlier, rifts get
a black-and-teal chaotic one, wormholes a dark grey one, and "remove the existing starfield. This is because our
previously generated skybox already has some stars baked in it. I might re-add star fields in the future but not now."
**No save change (v21).** `npm test` **604/604**, `npm run build` 3016 KB (was 2466 KB).

- **Three skies installed** with the tool (recipe 24), each `OK: dark, seamless and within budget`:
  `normal_space` (140 KB, preset `void`, seed 3 — the sky the owner kept on 2026-11-15, re-made under its final name),
  `rift_chaos` (239 KB, preset `maelstrom`, seed 23, turbulence 1.2, wisps 0.9, dust 1.0/0.85/1.5 — black space torn
  open by chaotic teal gas), `wormhole_grey` (173 KB, preset `ash`, seed 5, `very_dark`, saturation 0.7 — dark grey, no
  purple cast). Recipes in `tools/skybox/specs/`.
- **Normal space is a sky, not a template.** New `DEFAULT_SKY = { kind: "panorama", skybox: "normal_space", shards: 0,
  starfield: false }` in `data/places.js`; `render/scene.js` uses `placeAt(id).sky || DEFAULT_SKY`, so every ordinary
  pocket wears it and a place may still override it. **The starfield is off:** `STARFIELD = { enabled: false }` keeps the
  geometry and the per-frame follow, `showPlace` shows it only for a sky that says `starfield: true`, and
  `menuview.js` clones it only when the switch is on — nothing draws two sets of stars. Re-adding star fields later is
  that one flag plus a `starfield: true` on whichever sky wants them.
- **Rifts and wormholes re-skinned.** Both rift templates now wear `rift_chaos` (the deep rift keeps its 40 shards and its
  deeper damage; the owner asked for one rift look, so it no longer wears `variant: "deep"`), and all three `wh_*`
  simple-wormhole templates wear `wormhole_grey` instead of `shroud`.
- **`skyFor(def)`** in `scene.js` drops a sky nothing can draw — a `panorama` whose skybox id is not installed — so a
  typo costs a background and never the place (and `npm test` names it).
- **The tool gained `remove`** (`skybox.py remove <id>`): it deletes the image, the recipe and both registry lines, in
  that order, because `src/assets/skyboxes/` is the tool's folder. The duplicate `teal_black_test` was removed with it
  (the same picture as `normal_space`, and the build would have inlined the same sky twice).
- **Not restructured, deliberately.** The owner asked about file structure and then ruled it out: "skyboxes aren't part
  of refactor plan, also isn't 14d a part for wormhole systems" — correct on both counts, so nothing moved. The three
  owner panoramas in `src/assets/` stay where they are (no template names two of them; `sky-deeprift` only as
  `SKIES.shattered`'s fallback) and `src/assets/README.md` says so.
- **Tests:** `tests/skybox.test.mjs` now checks `DEFAULT_SKY` as well as every template (a skybox only normal space names
  would otherwise be unchecked) and adds "normal space wears a generated sky, and the drawn starfield is off", which reads
  `showPlace`'s own expression so writer and reader cannot drift apart (L19). `tests/step14c-wormholes.test.mjs` now
  expects the generated grey sky on the far side.
- Files: `src/assets/skyboxes/*.webp`, `tools/skybox/specs/*.json`, `tools/skybox/skybox.py`, `tools/skybox/README.md`,
  `src/data/skyboxes.js`, `src/render/skyboxes.js`, `src/data/places.js`, `src/data/instances.js`, `src/render/scene.js`,
  `src/render/menuview.js`, `tests/skybox.test.mjs`, `tests/step14c-wormholes.test.mjs`, the folder READMEs,
  `src/assets/README.md`, `game/tallow-reach.html`.

---


## 2026-11-15: Kept for later — a black-and-teal sky, installed but worn by no place yet

The owner asked to see the new skybox generator make a 4K sky: "black and teal highlights of nebula, few stars",
then picked the picture and said "keep it for later". **No save change. `npm run build` and `npm test` needed**
(the page grows by about 140 KB). **No place wears it**, so the game looks exactly as before.

- **Installed:** `teal_black_test` — "Teal Black (kept for later)", preset `void`, seed `3`, 4096×2048 WebP,
  **140 KB**, report `OK: dark, seamless and within budget` (mean brightness 0.040, seam 0.50/255, 4760 stars).
  Registered by the tool in `src/data/skyboxes.js` and `src/render/skyboxes.js` (the GENERATED lines only) and
  covered by `tests/skybox.test.mjs` like any other sky.
- **Recipe kept** at `tools/skybox/specs/teal_black_test.json`: `mood very_dark`, gas `#2cb4c2`/`#1f78a6`,
  `stars.density 0.14`, `stars.halos 0.5`, `nebula.amount 1.15`, `nebula.coverage 0.5`, `dust.amount 0.9`,
  `dust.coverage 0.45`, `dust.rim 1.35`. Re-make it exactly with
  `python3 tools/skybox/skybox.py make teal_black_test --spec tools/skybox/specs/teal_black_test.json --install`.
- **To use it later**, no re-render needed: put `sky: { kind: "panorama", skybox: "teal_black_test", shards: 0 }`
  on an instance template (`data/instances.js`, recipes 22 and 24). `shards` is how many broken rocks drift in
  front of it; 0 suits an empty-pocket look.
- The preview/test folder `skybox-out/` is scratch and intentionally not committed (recipe 24 rule).

---

## 2026-11-15: The Test Ship — a 1-credit hull with 100× Hull HP and 10× damage, flown with the owner's GLB

Owner: "make a new ship available in the Hangar that costs 1 credit. It is called 'Test Ship'. It has 100x hp of wasp, 10x multiplier to all damage output. Same slot layout as wasp. Same default slots come with it when you buy it already fitted. It will use this 3d model called heavyfighter.glb in my google drive." **Save version unchanged (v21)**; rebuild needed (`npm run build` — the page grows to ~19 MB — then `npm test`). NOT playtested yet.

- **The hull.** `SHIPS.testship` — "Test Ship", 1 cr, `cargo: 20` (the Wasp's hold), `dmg: 10`, `mine: 1`, `sc: 1`, `hpMul: 100`, `col: 0x8a6d3b`. Same slot layout as the Wasp (`SHIP_LAYOUTS.testship`; the content test's Wasp-layout assertion passes as-is) and the same hold. `DEFAULT_SHIP` stays `wasp`. It is the one deliberate exception to "every hull is the same ship apart from its hold" — the content test carves it out by name and pins its price/dmg/hpMul. The hangar lists it automatically (all screens read `SHIPS`); buying costs 1 cr, goes through `addShipRecords`, and delivers the same stock fit the Wasp gets — arriving **already fitted**, exactly as asked. Old saves backfill `loadout.testship` with the stock fit on load, like every known hull (the two save-fixture tests were updated to expect it; no fixture semantics changed).
- **100× Hull HP.** A new hull attribute, `hpMul`: `effectiveHullOf` multiplies whatever the fitted hull module grants (`hullOf` returns raw module HP) — `hull_basic` (10) → **1000 Hull HP** on the flying ship. `P.hullSpec`/`hullMax`/`hull` all reflect it; the Hangar stat line and repair costs use the same effective HP.
- **10× damage output.** `guns` already multiplied by the hull's `dmg` (`sim/weapons.js`); `launchMissile` now multiplies the fitted launcher's damage the same way, so **guns and missiles** hit ten times harder. The mining beam deals no damage, and collision/ram damage is physics, not output — deliberately not scaled.
- **Compressed model replacement:** owner supplied `heavyfighter-compressed.glb` (180,916 bytes, MD5 `983f20487d3b5840033a6d15d77b2896`), replacing the original at `src/assets/models/ship.testship.glb`. Same authored bounds and node axes; `modelYaw`, `modelLength`, centring and camera padding remain unchanged. Required Draco geometry uses the existing three.js glTF JS decoder, embedded with its Apache 2.0 license (no new npm dependency or external fetch). WebP textures are supported by GLTFLoader. The standalone page is now ~2.33 MB rather than ~19.2 MB. An offline decoder test reads the actual GLB and verifies decoded bounds against the original. Visual owner check still pending.
- **Immediate title screen:** start the render loop without waiting for GLBs; defer background model decoding until after a title paint opportunity. Open World waits on that same promise, disables repeat clicks and shows “Loading models…” if needed. Built-in title scenery is used while imports prepare; model failures retain the existing fallback. The embedded download size is unchanged. Scheduler regression coverage pins paint-before-load and gameplay readiness.
- **Camera playtest tuning:** Test Ship adds `cameraPadding: 1.2` to the automatic size-based framing: chase distance/height and orbit range are 20% farther out than before. Wasp and other hulls remain unchanged. Regression test pins the multiplier.
- **Universal third-person framing:** chase distance and height now scale by the actual fitted model bounding-diagonal ratio to the Wasp (all three dimensions count, including GLB import corrections). Wasp remains exactly 1× at every speed; free-orbit starting distance and zoom limits use the same ratio. Measurements are cached per template pair, not recomputed during thrust animation. No physics or FOV changes. Added regression coverage for smaller/larger/wider models.
- **Playtest correction:** the imported model faced right and was tiny. Optional per-hull visual import settings now rotate its +X nose to −Z, centre its bounds, and fit it to 14.8925 m length (115% of the Wasp). Flight scale, mounts and physics are unchanged; both flight and Outfitting use the same builder. Regression coverage checks direction, centring and relative size.
- **The model.** `heavyfighter.glb` from the owner's Google Drive (md5 `20fc5e2664c5665c13a547a6ff0d14f2`, 13,233,164 bytes) was fetched through the Drive connector (the `download_file` call stages binary files into the workspace) into `src/assets/models/ship.testship.glb`. `buildPlayerShip` draws it exactly like the built-ins (`ship.<class>` key; `.glb` replaces the built-in silhouette, `sc: 1`). **This is the first `.glb` ever committed to the repo** — the "no binary assets in the repo" convention for models is amended for this one owner-supplied file. `game/tallow-reach.html` is now ~19.2 MB (~17.6 MB of it is this model as a data URL); the built-in fallback still works if the file ever disappears (the Wasp silhouette in `col`).
- **Tests.** New `tests/test-ship.test.mjs` pins the acceptance criteria (price 1, hold parity, layout parity, stock fit on buy, 1000 Hull HP, effective-HP repair costs, 10× missile damage, `DEFAULT_SHIP` unchanged); `tests/content.test.mjs` carves out the exception by name; save-migration fixtures updated. **598/598 pass**; build green. New harbour smoke, in Node: buy at 1 cr → `ships` gains `testship`, `cr` 100 → 99, loadout equals `stockFor('testship')`, `hullMax` 1000, missile `dmg` 80 vs the Wasp's 8.

Files: `src/assets/decoders/` (decoder, license, README), `tests/compressed-model.test.mjs`, `src/render/gltf.js`, `src/render/menuview.js`, `src/ui/menu.js`, `src/ui/README.md`, `src/main.js`, `src/render/camera.js`, `src/render/models.js`, `src/render/README.md`, `tests/ship-model-fit.test.mjs`, `docs/LESSONS.md`, `src/assets/models/ship.testship.glb` (new), `src/data/ships.js`, `src/data/outfitting.js`, `src/data/mounts.js`, `src/sim/economy.js`, `src/ui/screens.js`, `src/sim/hull.js`, `src/sim/missile.js`, `src/render/model-manifest.js` (regenerated), `tests/test-ship.test.mjs` (new), `tests/content.test.mjs`, `tests/step9-save.test.mjs`, `tests/step11b-starmap.test.mjs`, `docs/GLB_MODELS.md`, `docs/recipes/01-a-new-ship.md`, `src/sim/README.md`, `src/data/README.md`, `docs/HANDOFF.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

---

---

## 2026-11-14: Three owner-reported bugs — the Alt camera locks to the hull, one primary fires at a time, no tags over the menu

Owner, on the step-14 round: three bugs. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet.

- **Bug 1 — the Alt free camera now locks its up vector to the ship.** With Alt held the mouse orbits and the wheel zooms (unchanged), but the view rolls with the hull: roll with E/Q and the ship holds still in frame while the world turns around it, instead of the old world-up lookAt that let the ship spin under a level camera. New `faceUp` in `util/math.js`; used by the free-cam branch of `chaseView` (`render/camera.js`). The non-Alt chase view is untouched. Alt-chords (`Alt+E` and friends) are now `preventDefault()`ed in `core/input.js` so the browser's own menu does not pop during the free camera (owner confirmed 2026-11-14; Chrome's reserved menu keys cannot be overruled).
- **Bug 2 — exactly one primary weapon fires, the selected one.** Keys **1 and 2 now select primary bay 1 and primary bay 2**; left click fires only the module in the selected bay (a gun from that bay, or the beam fitted there). A second fitted cannon stays silent until its slot is selected; an empty selected bay fires nothing. `profile.pw` stores the selection as `"1"`/`"2"` and migrates old saves in place: legacy `"cannon"`/`"beam"` map to the first bay of the flown ship holding that kind of module (falling back to the other kind, then bay one) — no version bump, v21 saves load cleanly. HUD shows the slot number next to the weapon (`1: Basic cannons`); the equip toast names the module of the slot pressed; `primarySlotIndex` in `sim/weapons.js` is the one place that folds legacy values. Guests get the same rule.
- **Bug round also swallows Alt-chords before the browser can act on them** (`core/input.js`): any `Alt+<letter>` keydown/keyup gets `preventDefault()`, so holding Alt to orbit in free cam no longer pops the browser's own menu in browsers that honour it (Firefox, Edge, Safari — and Chrome for chords it does not reserve; Chrome's own menu keys such as Alt+E/Alt+F on Windows are owned by the browser and cannot be overruled). Owner confirmed working 2026-11-14.
- **Bug 3 — no world-space tags over the main menu.** The markers live outside `#hud` (`#mk`), so the menu's `main-menu` event hid the HUD but left the last drawn set — "Trade lane asteroid field", hostiles, crates — floating on the title screen. `setReticle` now hides/shows the marker container together with the HUD (docking and the pause-equivalent paths hide them too; `drawMarkers` redraws on the next flight frame).
- **Tests:** new `tests/primary-slots.test.mjs` (selection, empty bay, legacy migration); `content.test.mjs` source guards updated to the slot model; `player-weapons`, `headless-fight`, `step9-local-only`, `step9-save`, `single-player-combat-8b`, `profile`, `content` updated to the new `pw` values. **575/575 pass**; build green.

Files: `src/util/math.js`, `src/render/camera.js`, `src/ui/hud.js`, `src/core/input.js`, `src/main.js`, `src/sim/weapons.js`, `src/sim/guns.js` (comments), `src/state/profile.js`, `src/state/state.js`, `src/index.html`, `tests/primary-slots.test.mjs` (new), `tests/content.test.mjs`, `tests/player-weapons.test.mjs`, `tests/profile.test.mjs`, `tests/single-player-combat-8b.test.mjs`, `tests/step9-local-only.test.mjs`, `tests/step9-save.test.mjs`, `tests/headless-fight.test.mjs`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

---

## 2026-11-14: The rift wears real space too — the deep rift its own sky

Owner, after the wormhole sky landed and a first pass at the rift one: "Sorry, here is an image for rift, here is an image for deeprift." Two owner-provided panoramas (2880×1440 equirect WebPs), shipped **byte-for-byte**: `rift.webp` (232 KB, a teal maelstrom) and `deeprift.webp` (69 KB, near-black with one sable cluster). **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested — ROADMAP stays unticked.

- **`SKIES.shattered` is no longer painted.** It wraps the owner's rift panorama around the inside of the same sphere, seen from the back, one linear filter, no mips — every star where the owner put it. The broken rock still drifts inside it (owner, round three: "shattered asteroids in the background skybox"), lit with a breath of the nebula's teal.
- **The deep rift is its own image, not a dimmer copy.** `data/instances.js` picks it with `sky.variant: "deep"` on `deep_rift` (shards 40); the ordinary `guardian_rift` wears the rift sky at full presence (shards 30, no `variant`). `sky.variant` is the only colour-adjacent key a template carries besides `kind` and `shards` — no palette, no multiplier, nothing to tune.
- **`col`, `glow`, `veil` are gone from the rift templates** — they fed the painter, and no template needs them any more. `render/sky.js` is now **unused at runtime**: it survives only for `tests/sky.test.mjs`; deleting both is the owner's call.
- **Tests:** `tests/step14-instances.test.mjs` pins the rift sky's shape — declared kind, integer `shards`, the deep rift (and only the deep rift) declares `variant: "deep"`, and nothing else. 571/571 pass overall; the build inlines both panoramas as data URLs.
- **Docs:** `src/render/README.md`, `src/assets/README.md`, `testing/TESTING-14-RIFTS.md`, `docs/HANDOFF.md`.

Files: `src/assets/sky-rift.webp` (new), `src/assets/sky-deeprift.webp` (new), `src/render/scene.js`, `src/data/instances.js`, `src/render/README.md`, `src/render/sky.js`, `src/assets/README.md`, `testing/TESTING-14-RIFTS.md`, `tests/step14-instances.test.mjs`, `docs/HANDOFF.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

When entries are moved out of `CHANGELOG.md`, paste them directly under this paragraph so the
newest stay first.

## 2026-11-15: A skybox generator, so every new instance can have a dark, realistic 4K sky

**No save change. `npm run build` and `npm test` needed.** No skybox is installed yet, so the game looks exactly as before.

- **`tools/skybox/skybox.py`** (Python, numpy + Pillow; not part of the game bundle) renders a 4096×2048 equirectangular
  WebP in about 40 s and ~400 KB: luminous nebula gas, a mist behind it, dark dust clouds in front (rim-lit where thin,
  ragged fractal edges), hot cores, an optional Milky Way band, and stars with a power-law brightness spread, blackbody
  colours and equal-area placement (stretched correctly for the projection; dust hides them). Every layer is a function of
  view direction, so there is no seam and no pole pinching. It bloom-filters, **auto-exposes to a mood** (`black`,
  `very_dark`, `dark` default, `dim`; the owner wants dark space), tone-maps, dithers, and prints a report that must say OK.
  `--install` refuses on any warning. Eight looks in `tools/skybox/presets.json`: void, maelstrom, ember, violet_veil, ash,
  milky_way, cobalt_cluster, emerald_mist. `--preview` writes a contact sheet with four 70-degree pilot's-eye views.
- **Game side:** new sky kind `panorama` (`sky: { kind: "panorama", skybox: "<id>", shards: 30 }`) in `data/instances.js`
  `SKY_KINDS`; `SKIES.panorama` in `render/scene.js` reuses `SKIES.shattered` (it now takes an optional `{ url, tint }`
  override, behaviour for the existing skies unchanged). New `src/data/skyboxes.js` (data) and `src/render/skyboxes.js`
  (image imports), both with `GENERATED` blocks the tool maintains. Verified in headless Chromium with the real scene code.
- **For AI assistants:** `tools/skybox/README.md` (workflow, "owner says -> run this" table, warnings), **recipe 24** (23 was
  taken by the GLB-model recipe), a line in `AGENTS.md` and `HANDOFF.md`. `tests/skybox.test.mjs` guards manifest, image (2:1,
  size, budget), import, recipe and the template's skybox name, and the presets file.
- Known: 4096 wide is about 0.09 degrees per pixel, so on a 4K monitor at the 70-degree camera the sky is magnified about 2.4
  times; `--size 8192` is the sharper option (about 3 GB RAM, bigger game file). Do not commit the tool's `skybox-out/` folder.

---

## 2026-11-14: Models and collision are real models now — drop-in `.glb` files, hulls flush with the drawing

Owner: every object in the game should accept a `.glb` when one exists (hardcoded model otherwise), and collision should sit flush with the actual 3D model for all objects — Meridian Station can no longer be one big ball: the rings and the inner cylinder must be reachable and touchable. Complex future objects (a big rock cave) are in scope. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet.

- **Drop-in `.glb` replacements, zero ceremony.** Put `<key>.glb` into `src/assets/models/` and rebuild; `build.mjs` regenerates `src/render/model-manifest.js` (data URLs inlined, no runtime path ever resolves) and the built-in model for that key is replaced — never duplicated. No `.glb` for a key, nothing changes, fallback is byte-identical to before. Preload failures only log `[models] ... using the built-in model`. The whole path (byte-extraction from the built page → `GLTFLoader` parse → collider bake) was smoke-tested with a generated `station.glb`: 20 triangles baked, collision detected deep penetration, correctly ignored a far-away probe. Keys: `ship.<class>`, `planet`, `station`, `enemy.<defId>`, `asteroid`, `bullet`, `missile`, `crate`, `fx`, `cache`, `anomaly`, `wormhole`, `beam` — see [GLB_MODELS.md](GLB_MODELS.md) for the authoring conventions (units, `spin`/`eng`/`noclip` node names, scale contracts, the unit-sphere planet rule).
- **Collision is now the drawn mesh, everywhere.** Rocks collide as their actual lumps (one soup per built-in shape — the mesh is built from the same floats; `asteroid.glb` replaces both), station/planet colliders are baked from the built model at build time (planet atmosphere shell and the ring's decorative spokes/lights are `noclip` — the ring itself, being rotationally symmetric, stays solid), missiles die against the rock's mesh, the hull stays a 4 m sphere, and the data's `keepout:` field is gone (the station has no invisible wall any more — the ring is the wall, and you can fly through the axis). Scenery rebuilds replace their own colliders (`feature#index` ids); `forgetPlace` clears them. `collide: false` / `collideDmg` on a feature are the only data opt-outs, `noclip` in the model the only mesh opt-out.
- **Tests:** `tests/two-player-sim.test.mjs` rock collision now builds a real rock record; the views tests serve the built-in fallback (headless registers no `.glb`); the FX fade test disposes GLB-clamped materials once each. Docs added: [GLB_MODELS.md](GLB_MODELS.md), recipe 23; src folder READMEs list the new files. **578/578 pass**; build green. Rider: enemy-vs-world collision is still absent (as before) — see the doc's known limits.

Files: `src/assets/models/` (new, empty), `src/render/gltf.js`, `src/render/collideModel.js`, `src/render/model-manifest.js`, `src/render/models.js`, `src/render/views.js`, `src/render/scene.js`, `src/render/menuview.js`, `src/sim/colliders.js`, `src/sim/player.js`, `src/sim/missile.js`, `src/data/places.js`, `src/data/encounters.js`, `src/data/place-templates.js`, `build.mjs`, `src/main.js`, `tests/headless.mjs`, `tests/views.test.mjs`, `tests/two-player-sim.test.mjs`, `tests/step12-places.test.mjs`, `docs/GLB_MODELS.md` (new), `docs/recipes/23-a-new-glb-model.md` (new), `docs/HOW_TO_ADD.md`, `docs/architecture/simulation-and-rendering.md`, `game/tallow-reach.html`.

---

## 2026-11-14: Two owner bugs, part two — the Sell/Discard confirm sits with the cursor, and hunt contracts clear the area they were taken in

Owner: "Right click sell & discard button – adjust placement of the sell /discard ui so that you barely have to move the mouse to the right to hit the sell/discard button." The first pass anchored the popover beside the cursor but left the Sell/Discard button in a footer row — far below the mouse; the owner came back with a picture: the confirm is ~120 px down. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet.

- **The popover's action row is in the popover's header, under the title.** `SELL BASIC POWER CELL` sits on its own line with the **Sell** / **Cancel** buttons in a row directly beneath it, on every resolution and zoom (`inv-sell-head` in `styles.css` is now a fixed column — the wrap decided differently per panel width; the owner approved the stacked layout), in every copy of the sell/discard popover — the station's (`ui/menu.js`), the flight card's and the rift cache's shared `discard.js`, both discard steps included. Long titles wrap with `overflow-wrap`, and the popover is 248 px wide. Both flows anchor vertically with one rule (`popoverAnchorFor`, clicked-entry centre − 44px); with the stacked header the confirm row lands right on the mouse's line. **Accepting a hunt no longer pays for anywhere in the universe.** The kill step carries the pocket the board was read at (`step.place`, enforced by `objectiveMatches`), so raiders elsewhere do not count; the objective sentence is rewritten at acceptance to say where to fight — `Destroy {remaining} {enemy} near the {field} ({place}).` ("near the Asteroid field (Meridian Station)." at home; "near the Trade-lane asteroid field (Galedrift Expanse)." in a generated trade lane; a field-less pocket says "in {pocket}."). The name comes from the same `asteroidField` feature the spawner reads. Hunts accepted before this change keep the old any-place rule; no save migration.
- **Tests:** new `tests/hunt-place.test.mjs` (Meridian field naming and gating, generated trade-lane naming, field-less fallback); `tests/step13-missions.test.mjs` scopes its hunt to the place the kill events carry. **578/578 pass**; build green.

Files: `src/ui/menu.js`, `src/ui/discard.js`, `src/styles.css`, `src/sim/missions.js`, `tests/hunt-place.test.mjs` (new), `tests/step13-missions.test.mjs`, `game/tallow-reach.html`.

---

## 2026-11-14: Real space inside a simple wormhole — the pocket wears the system's sky

Owner, looking at the 14c build: "Im not too happy with the skyboxes of both rifts and wormholes … they look almost like coloured fabric. I want them to look like genuine space / fantasy in high quality, Im using a 4k monitor." This round covers the **simple wormhole only**; the rift sky comes next. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet — ROADMAP 14c stays unticked.

- **The pocket is the system's own space, always** (owner, 2026-11-14: "since we are still in the same solar system. This should always be the case"). The spawned pocket no longer declares a `sky` at all (`sim/wormholes.js` `pocketRecord`, `WORMHOLE_POCKET`): `render/scene.js` shows the ordinary starfield, exactly like every sibling pocket. Map dot, formations, lock, clock — unchanged.
- **The far side is real space.** `SKIES.shroud` is no longer painted: it wraps the owner's reference panorama — a **dark-grey nebula with few stars** (2880×1440 equirect WebP, q90, ~168 KB) — around the inside of the same sphere, seen from the back, one linear filter, no mips, no painter in between. An equirect image is exactly what a sphere's UV unwrap is, so it hangs level with no seam math at all. The panorama rides inside the single-file build as a base64 data URL (`src/assets/sky-shroud.webp`; `build.mjs` gained an esbuild `.webp → dataurl` loader) — no external asset path ever resolves.
- **`shroud` carries no colour data any more**: the three site templates (`wh_smugglers`, `wh_mining`, `wh_hive`) are `{ kind: "shroud" }` and `WORMHOLE_POCKET` lost its palette. The painter (`render/sky.js`) and the `shattered` rift sky are untouched.
- **Docs/tests:** `tests/step14c-wormholes.test.mjs` gained "the pocket is the system's own space; only the far side is somewhere else" (14/14 there, **571/571** overall); `src/render/README.md`, `data/instances.js` comments and the playtest guide describe both skies. **Open:** the rift (`shattered`) sky still reads as coloured fabric to the owner — next round.

Files: `src/assets/sky-shroud.webp` (new), `build.mjs`, `src/render/scene.js`, `src/sim/wormholes.js`, `src/data/instances.js`, `src/render/README.md`, `testing/TESTING-14C-WORMHOLES.md`, `tests/step14c-wormholes.test.mjs`, docs (`CHANGELOG.md`, `CHANGELOG_ARCHIVE.md`), `game/tallow-reach.html`.

## 2026-11-14: Slice 14c built — simple wormholes spawn themselves, and save v21

Owner, 2026-11-14, spelling out the natural-wormhole model: a pocket spawns itself in normal space, its 20 minutes run
from the pocket's spawn, running out only collapses the way in, and the far side is always escapable through a
**Stable wormhole** with no clock. The build is **save v21** (v20 → v21 migration, unchanged storage keys, old-save test).
**Not playtested yet — ROADMAP 14c stays unticked and the slice is a draft until the owner passes it**
(`testing/TESTING-14C-WORMHOLES.md`). Rebuild needed (`npm run build`, then `npm test`).

- **How many, where.** A **standing population of 75** simple wormholes in the universe at all times, **never more than 3 per system** (`WORMHOLE_SPAWN`). A fresh universe (or a legacy fill from an old save) rolls each one's remaining clock at random between 0 and 20 minutes so the sky never cycles in sync; **every replacement that pops up after an expiry gets the full 20 minutes**. When one expires, a replacement spawns somewhere else. No spawn notice — the marker on the system's map is all the warning there is.
- **The pocket** is a registered place (like a rift instance, through `registerWormholePlace`): a skybox, interesting asteroid formations, and a centre **grey dark sphere** the pilot can lock — "Simple Wormhole", greyish radiance, colder than a rift (`views.js` `buildSimpleWormhole`; new `shroud` sky in `SKY_KINDS` with `SKIES.shroud` in `render/scene.js`). It hangs on that system's map at a fixed dot derived from its seed, warps like any other pocket, and carries **20 minutes from pocket spawn, saved in `world.wormholes`** (id, parent system, seed, template, remaining clock).
- **The far side** is a site from `WORMHOLE_SITE_POOL`: **wh_smugglers** (smugglers and a freighter hauling illegal goods — destroy them), **wh_mining** (a lumenite belt — a new `mine-ore` objective kind, `ore: "lumenite"`, need 4, no hostiles, no cache), **wh_hive** (a guardian hive — good loot, **no cache**). Each site is `reentrant`: leave at any time through the always-open **Stable wormhole** (no clock, never locked); come back until the 20 minutes are spent. Objective and rewards are one-time per wormhole (the run is saved; `mined` progress is captured in `world.instances`).
- **Expiry fires `collapse` only** — the entry fades in normal space, the Stable wormhole remains usable, and nothing `kill`-s, ever. A collapsed pocket lingers only while the pilot is in it or in its run; otherwise it despawns at once (proposed rule, not owner-approved yet). A replacement pops up elsewhere either way.
- **Data the slice adds:** items `lumenite` (ore, v150) and `contraband` (trade, v220, ordinary cargo — no legality system); enemies `smuggler` (its own hostile so hunt contracts never pay for it), `freighter` ("Smuggling Freighter") and `hiveguardian`; loot `wh_rock`, `smuggler`, `freighter`, `hiveguardian`; the `mine-ore` entry in `OBJECTIVE_KINDS`; `{groups: [...]}` for compatible wave declarations (backwards compatible with the single-`{enemy,count}` form); `waveGroups()` normaliser in `data/instances.js`.
- **Save v21.** `SAVE_VERSION = 21`; `world.instances` runs keep their `mined` progress; a new `cleanWormholes` keeps `world.wormholes` honest (id re-derivable from seed, parent must be a system of this galaxy, template must be a real re-enterable site, clock kept). A saved wormhole pocket rebuilds before validation the same way a saved run site does. **step 15 is v22.** Old-save tests cover the migration; `step14-instances.test.mjs` re-derives wormhole records and templates.
- **Open questions for the owner** (asked in the playtest guide / next round): equal-weight site pool; contraband as ordinary cargo; the countdown's visibility (starmap tooltip? HUD?); spawn-eligibility (home system? uncharted?); what happens to a collapsed pocket nobody sees; whether the door is lockable only for a lock, not a trigger.

Files: `src/data/instances.js`, `src/data/items.js`, `src/data/loot.js`, `src/data/enemies.js`, `src/data/places.js`, `src/state/state.js`, `src/state/profile.js`, `src/sim/wormholes.js` (new), `src/sim/instances.js`, `src/sim/session.js`, `src/sim/step.js`, `src/sim/galaxy-session.js`, `src/main.js`, `src/util/events.js`, `src/render/views.js`, `src/render/scene.js` and the folder READMEs, `tests/step14-instances.test.mjs`, `tests/step14c-wormholes.test.mjs` (new), `testing/TESTING-14C-WORMHOLES.md` (new), docs (`HANDOFF.md`, `ROADMAP.md`, `CHANGELOG.md`, `CHANGELOG_ARCHIVE.md`).

## 2026-11-14: The sky loses its lines, and opening a loot card leaves the ship still

Owner, on the round-two build: "Works well. 2 things." — the painted cracks and filaments in the rift sky read as
**odd lines** across an otherwise good sky ("important the skybox looks realistic/professional"), and opening a loot
cache left the ship flying: WASD still thrust and the mouse still turned it. **Save version unchanged (v20)**; rebuild
needed (`npm run build`, then `npm test`).

- **`render/sky.js` strokes nothing any more.** `skyWisps` and `skyCracks` are gone, and with them the templates'
  `cracks` palette colour (dropped from both templates in `data/instances.js` and from recipe 22's example). The
  generators are now `skyVeils`, `skyClouds`, a new `skyCores` (small bright knots — the hearts a real nebula piles its
  light into, so the sky keeps its structure with no line in it) and a new `skyGrain`: six thousand single pixels under
  four hundredths of alpha, an invisible dither that stops the dark gradients banding into contour lines on an 8-bit
  screen. The sky texture in `render/scene.js` also drops mipmaps, because a mip level that cannot wrap the seam is a
  line of its own. `tests/sky.test.mjs` (10) now asserts the painter makes zero strokes and starts no path at all.
- **A loot surface freezes the ship.** `core/input.js` funnels the three modal surfaces (chart, flight card, rift
  trade) through one `modalSurface()` — the trade had been missing from the hand-written gate, which was the whole bug
  — so thrust, strafe, lift, roll, boost, fire and the mouse steer all read zero while one is open; and a new
  `holdShip()` in `sim/pilot.js` kills the ship's carry and throttle the moment `ui/cache.js` or `ui/cargo.js` opens,
  because zeroed controls alone still coast. Closing hands back a ship at rest. `tests/ui-cache.test.mjs` grew a sixth
  test that holds W and pushes the mouse against an open trade and watches the ship not move one metre.
- **Docs:** TESTING-14 §2/§5/§5b, VISION, ROADMAP (14a/14b ticked on the owner's "works well"), HANDOFF, the
  render/data/core/ui/sim READMEs and recipe 22 all lose their fractures and gain the freeze.
- **Tests:** 557/0 (`tests/sky.test.mjs` 10, `tests/ui-cache.test.mjs` 6). Build 810 KB.

Files: `src/render/sky.js`, `src/render/scene.js`, `src/data/instances.js`, `src/core/input.js`, `src/sim/pilot.js`,
`src/ui/cache.js`, `src/ui/cargo.js`, `tests/sky.test.mjs`, `tests/ui-cache.test.mjs`, and the docs above.

## 2026-11-14: Rift revisions after the playtest — the cache is a trade, every run is 20 minutes, and the sky has no stars

The owner came back from the PR #20 build with the mid-rift logout fix **confirmed working** ("can now log out mid
rift and returns fine") and three more asks. All three are built. `npm test` → **556 tests, 0 fail**
(`tests/step14-instances.test.mjs` 23, new `tests/ui-cache.test.mjs` 5, `tests/sky.test.mjs` rewritten to 10).
**Save version unchanged (v20)**: a canister's stock is still saved inside `world.instances` in the stack list slice
14b defined — only its live shape changed, and `restoreInstance` reads the old shape straight back.

- **Twenty minutes is the default clock (ask 1: "rifts default time is 20 minutes unless specified").**
  `RIFT.defaultLifetimeSec` (1200) in `data/instances.js`; `createInstance` uses it whenever a template does not
  declare `lifetimeSec`, and a declared `lifetimeSec: 0` still means "no clock of its own". Both rift templates had
  their `lifetimeSec` removed, so **a Deep rift is 20 minutes too** — what makes it deep is its wave, its debris and
  its prize, not its time. The new step14 test "a run is 20 minutes unless its template says otherwise" pins the
  default, a declared clock and the 0 case.
- **The cache is a trade panel, not an auto-loot (ask 2: "your inventory ui + cache inventory ui … clicking and shift
  clicking moves items in between exactly like ship inv and station inv", ship on the left, cache off to the right).**
  `openCache` — which moved stacks into the hold one press at a time — is gone. In its place: `openCacheTrade`,
  `tradeCacheItem(dir, id, n)`, `closeCacheTrade` and `cacheTradeRecord` in `sim/instances.js`, and a new
  `src/ui/cache.js` modal: **R** beside an unlocked canister opens a card with the ship's hold on the left and the
  canister on the right (`.cache-cols` in `styles.css`), in exactly the station Inventory tab's tiles; a click moves
  one, Shift-click moves the whole stack, in **either direction**; right-click offers **Use / Stow all / Discard** in
  the hold and **Take all** on a canister tile. This works because a canister's stock became an ordinary
  `{ itemId: count }` stock map: `sim/inventory.js` grew a third container key, `CACHE`, resolved to the open run's
  canister (`stockOf`, an unbounded `capacityOf`, `nameOf`), so `moveItem`, `spaceFor` and `itemsAt` reach it
  unchanged — and the saved `[{ i, c }]` shape is converted in `captureInstances` and `restoreInstance`, so no save
  migration was needed. An emptied canister still drops out of the world (and comes back if something is stowed into
  it), a full hold loses nothing and says so as a notice, and a sealed canister refuses to trade at all. In
  `main.js`, **R** again, **Esc** and **P** put the trade away; flight input is released while it is open but the run
  — clock included — keeps running, like the flight inventory card.
- **The sky is darker and less orange, with no stars, a nebula and shattered asteroids (ask 3).** `render/sky.js`
  rewritten: `skyStars` is gone for good; the generators are now `skyVeils` (enormous faint washes spread over the
  *sphere* — the nebula's body), `skyClouds` (the band's light and its dust lanes, in two passes), `skyWisps` (blurred
  filaments inside the band) and `skyCracks`. Both palettes in `data/instances.js` are near-black bases with two cold
  lights (`glow` plus a new `veil`: violet/teal for an ordinary rift, indigo/magenta and dimmer for a deep one), and
  the only warm colour left in an ordinary rift's sky is the fracture hairline — a deep rift's fractures are pale
  violet. `render/scene.js` gives the drifting shards a cold rock material with a breath of the nebula's own light
  and spreads more of them (30 / 40, near and far) against the painted sky. `tests/sky.test.mjs` is rewritten (10
  tests): determinism, per-template palette, sphere-uniform veils, an explicit "nothing in the picture could be a
  star" check (no star generator exported, no fill smaller than a wash), and luminance/hue guards that pin every
  rift's sky dark and non-amber.
- Docs: the cache and clock paragraphs of `src/sim/README.md`, `src/data/README.md`, `src/render/README.md`,
  `docs/architecture/content-data.md`, `docs/recipes/22` and `docs/REFACTOR_PLAN.md` rewritten for the trade; a new
  owner-decision entry at the top of `docs/VISION.md`; `testing/TESTING-14-RIFTS.md` §5 is now the trade checklist,
  with a new §5b for the sky and a 20:00 clock check. **ROADMAP 14a/14b stay unticked**: they wait for the owner's
  playtest of this build.

## 2026-11-14: Step 14 owner playtest — four bugs, four fixes (the run you quit is the run you come back to)

The owner flew slices 14a + 14b and reported four bugs. All four are fixed. `npm test` → **546 tests,
0 fail** (new `tests/sky.test.mjs` 7, new `tests/crash.test.mjs` 8, `tests/step14-instances.test.mjs`
now 21); `npm run build` → 803 KB. **Save version unchanged (v20)**: nothing a save stores changed
shape, only what a run puts in the world and which place a save may name.

- **Quitting mid-rift came back as "That pocket no longer exists" (bug 2).** `prepareGalaxySave`
  (`src/sim/galaxy-session.js`) decided the save's place was a pocket that had been removed whenever
  the id was not among the galaxy's pockets — which is always true of a run's id — so it moved the
  save home, nulled `resume` and armed the recovery notice, out of the run the pilot was standing in.
  A run the save's own `world.instances` carries is now a place the save may name: `missingPocket`
  skips ids owned by a saved run, and the browser boot path (autosave → `prepareGalaxySave` →
  `applySave` → `resumeFromSave`) comes back inside the rift at the same spot with the same clock,
  exactly like logging out in space. Test 20 walks that boot path with a stand-in `localStorage` and
  fails without the fix.
- **The rift's hostiles were "Newbie Raiders" (bug 3).** The wave was four `raider`s with the
  template's 1.6 / 1.5 multiplier on them, so the target lock read the tutorial hostile's name and a
  raider hunt contract was paid by a rift run. They are two entries of their own now —
  `riftguardian` (16 Hull HP, 1.5 damage a shot, ember hull) and `deepguardian` (22 / 2, void violet)
  in `src/data/enemies.js`, faction `rift` in `src/data/factions.js`, with their own drop tables in
  `src/data/loot.js` — and both templates' `difficulty` is 1 / 1, because the numbers are authored on
  the hostile instead of inflated onto a borrowed one. The fight is numerically what the owner
  playtested; the lock reads **Rift Guardian**, and test 21 asserts four dead guardians do not move a
  raider contract.
- **The rift's sky read as triangles (bug 4).** `SKIES.shattered` was an inverted shell of flat panels
  with one shade each, which is exactly what it looks like. It is painted now: new `src/render/sky.js`
  paints one canvas — a near-black base in the template's own colour, a faint band of its glow with
  dust lanes through it, 3200 stars spread over the sphere with a few bright ones, and wandering
  forking fractures with a dark lip and a burning edge — and `scene.js` wraps it around the inside of
  an unlit sphere, so no facet of anything shows and the shards drifting inside are rock shapes, not
  tetrahedra. The generators are pure and take their roll function, so `tests/sky.test.mjs` checks the
  whole picture against a recording canvas, and one seed paints one sky exactly.
- **The crash the pilot could not see (bug 1).** The console line the owner pasted
  (`e.n.replace is not a function`) is in no build this repo has ever produced — every `.replace` in
  the game is wrapped in `String(... ?? "")` and the committed bundle has no member-expression
  `.replace` at all — so it came from a stale build (a tab left open across rebuilds, or an older
  zip). What the report exposed is the shape of the failure: a frame that throws leaves the loop
  running but stops drawing, so the last good picture freezes with a live game behind it. `main.js`
  now catches a broken frame, draws anyway and reports through new `src/ui/crash.js`, which puts the
  error's own first line on screen in a card; `installCrashNotice()` catches anything else the browser
  reports as uncaught (a listener, a timer, a promise). A repeat is counted, not listed, and the card
  says how much it left out. If anything still breaks, the pilot can now read what.

---

## 2026-11-14: Enemies are solid — rams damage both ships, rocks kill hostiles, and one falsy detour is fixed

Owner: hostile ships should collide the same way the pilot's does — anything that hits an enemy inflicts collision damage on it, and enemies hitting each other must bounce a bit so their AI recalibrates. **Save version unchanged (v21)**; rebuild needed (`npm run build`, then `npm test`). NOT playtested yet.

- **Impact energy is relative speed, at the moment of contact** — the same 25 m/s / 0.015 hull-per-m/s rule the pilot's rock hits use, applied to both ships of a collision (the owner's rule, applied uniformly; an earlier pass measured absolute own-speed and would have let a stationary victim escape — caught in review before it shipped). The pilot takes it through the shields (`hurt`); the hostile takes it via a new `enemy-rammed` event → `hitHostile(e, dmg, at, byPlayer, placeId)`, so a ram kill is the rammer's kill. `enemyHullRadius` scales the 4 m hull sphere by the def's `scale` (a raider ≈ 4.8 m).
- **Enemy-vs-world.** Rocks damage a hostile on contact (kill credited to nobody — `byPlayer: null` on `enemy-rammed`, and `killHostile`'s new no-credit path leaves `profile.kills` and the place memory alone; `advanceMissions` refuses to settle hunt contracts for `player === null` either). Static scenery bounces the ship without damage, exactly like the pilot (ring/hub/planets/wormholes — anything with a collider). The interaction is post-movement, after the AI has steered.
- **Enemy-vs-enemy.** Equal-mass hulls swap their normal velocity parts under restitution 0.4 (`reflectVelocity` is now exported from `sim/colliders.js`); no damage by design (ramming a rival is not a contract), and the existing chase lerp re-aims the AI next tick. Pairwise pass over a snapshot, corpses skipped.
- **Contracts care that the target died, not who managed it — all missions, all contracts** (owner, 2026-11-14: "all missions / contracts the default is that as long as a specific npc is destroyed, doesn't matter how, it advances the objective" — generalising the same-day hunt note). Every objective fed by `enemy-killed` — hunt contracts, kill steps in story missions, kill steps inside parallel objectives, and `wait` steps woken by a mission wave-clear (`mission-trigger`, mission-id-scoped) — settle however the hostile died: rock, another ship, the pilot. An ownerless kill (nobody to blame) advances those objectives for **every pilot holding them** — the local profile and any configured guest profiles on board (`advanceMissions` fans out over `state.players`; an ownerless `mission-trigger` naming its mission fans out the same way, and only the profile holding that mission id can match it); an attributed kill still goes to its owner only. Follow-on steps (flags, script / give-item) run against the owning profile (`advanceMission` / `advanceParallel` take the `profile`). Tests pin both ends: an environmental kill pays the co-pilot's hunt too, and a mission wave killed by the world (no killer) still wakes the story's wait step for the pilot holding it. The pocket the hunt was accepted in still gates it (`step.place`), never the killer; `mission-trigger` wave-clears are mission-scoped as before. An ownerless kill credits no pilot's `kills` stat, but pays the contract like any other.
- **Two reliability fixes along the way.** (i) The no-credit path is `byPlayer === undefined` vs `null` vs a record — `localPlayer()` is falsy in headless bundles, and the first version swallowed the local pilot's credit for it. **587/587 pass**; build green (1501 KB). A stress probe (3 raiders, 30 s, seeds fixed) shows no NaNs and no double-processing; enemies despawn intact when the pilot dies (existing `dock` → `die` → `clearTransient` path).

Files: `src/sim/combat.js`, `src/sim/missions.js`, `src/sim/ai.js`, `src/sim/enemy.js`, `src/sim/player.js`, `src/sim/colliders.js`, `src/util/events.js`, `src/sim/README.md`, `tests/enemy-collision.test.mjs` (new), `docs/GLB_MODELS.md`, `docs/architecture/simulation-and-rendering.md`, `docs/HANDOFF.md`, `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md`, `game/tallow-reach.html`.

## 2026-11-14: Step 14a feedback built — a rift you can see, lock and open — and slice 14b, a run that survives a quit

The owner playtested slice 14a and returned six items; all six are built, plus slice **14b**.
`npm test` → **529 tests, 0 fail** (`tests/step14-instances.test.mjs` is now 19); `npm run build` → 799 KB.
**Save version v20** (from v19): `world.instances` keeps the run a pilot is inside, so logging out mid-rift
comes back mid-rift. v19 and older saves have no runs and load unchanged.

- **The anomaly (items 1 and 5).** `render/views.js` grew one shared pair, `buildAnomaly` / `updateAnomaly`,
  and it draws **both** the door a pilot opens (`kind: "rift"`) and the way out inside (`kind: "gate"`):
  a dark spherical core, a bright eye, an additive aura and a flare at 1.5×, shimmering from
  `performance.now()` with a per-entity phase, plus sealed shells while it is locked. The way out is now an
  entity of its own — `placeWorld(id).gates`, `record.gate`, `record.exitPos` — always visible from arrival,
  F-lockable, and locked until the instance's own exit rules are met. Data: a template's
  `exit { n, pos, r, requires }` (the exit is a place in the world, not the point the pilot arrived at).
- **A sky of somewhere else (item 4).** `render/scene.js` exports a `SKIES` registry; `SKIES.shattered`
  builds an inverted icosahedron shell of dark panels with glowing fracture lines through them and shards
  drifting inside it, carried with the camera by `updateScenery`, and `showPlace` hides the ordinary
  starfield while a place has a sky of its own. A template declares `sky { kind, col, glow, cracks, shards }`
  and `SKY_KINDS` in `data/instances.js` is the vocabulary. **Both rift templates lost their `planet`
  feature**: a rift is not the space outside it, so nothing in one is copied from a pocket.
  `forgetPlace(id)` frees an instance's scenery and sky for good when its run ends, and `main.js`
  (`instance-closed`) now also calls `showPlace(state.place)` — leaving a rift used to leave the pilot
  looking at an empty scene with no stars.
- **F locks all three, and the HUD says what each is (item 2).** `sim/targeting.js` lock kinds grew `"r"`
  (rift door), `"g"` (way out, labelled `(sealed)` / `(open)`) and `"k"` (canister, `(locked)` / `(open)`),
  and `ui/hud.js` marks rifts, gates and canisters at all times — pinned to the edge of the screen when they
  are behind the pilot, with their distance — so the way in and the way out cannot be lost.
- **The prize is a canister you open with R (item 3).** `openCache(record, player, profile)` is exported from
  `sim/instances.js`: it moves the canister's stacks into the pilot's **own** hold one unit at a time, so a
  full hold takes what fits and is told how much is left (`Make room and press R again`). Every refusal is a
  sentence the pilot sees — still sealed (with the objective's own words), empty, no room — and a success says
  what came aboard. `completeObjective` now **unlocks** the canister instead of spilling crates, and
  `render/views.js` draws it as a canister (body, two caps, two bands, a lamp that is red while sealed and
  green once open). Data: `cache { n, loot, pos, r }` and `RIFT.cacheRange` (60 m).
- **Slice 14b: a run survives a quit (item 6).** `world.instances` (v20) keeps one entry per live run:
  template, seed, tier, remaining lifetime, `warned`, whether the objective is met, the canister's remaining
  stock and open flag, and the entry spot the pilot is put back at when they leave. `captureInstances()`
  (`state/state.js`) writes it from `currentSave()`; `captureResume()` no longer redirects a save made inside
  a run to the pocket; `enterPlace` now writes an instance id into `world.place` and `destroyInstance` writes
  the pocket back on the way out. `restoreInstances()` and `populateInstances()` (`sim/instances.js`) rebuild
  a saved run — record, place registration, then guardians, canister and gate — and are called from
  `resumeFromSave()`, with `restoreInstances()` also called at boot in `main.js` before `loadPlace`, because a
  place has to exist before anything can load it. `cleanInstanceRuns` (`state/profile.js`) drops any run whose
  id `instanceIdFor` would not produce, and a `world.place` that is then nowhere sends the pilot home.
  Deliberate and documented: the wave comes back at **full strength** (a save carries the run, not each
  guardian's damage), and an emptied canister stays empty, so reloading can never farm a prize twice.
- **Files.** `src/data/instances.js`, `src/state/{profile,state}.js`, `src/sim/{instances,places,session,targeting,world}.js`,
  `src/render/{scene,views}.js`, `src/ui/hud.js`, `src/main.js`, `tests/{step14-instances,layers,step9-save,step10-save,
  step11b-starmap,step12-places,step13-missions,step13c-ui,resume-spot,shops,station-inventory}.test.mjs`,
  `docs/{HANDOFF,ROADMAP}.md`, `docs/recipes/22-a-new-rift-or-instance.md`, `testing/TESTING-14-RIFTS.md`,
  the `src/*/README.md` files touched, and `docs/architecture/{world-and-map,content-data}.md`.
- **Next.** Slice **14c** simple wormholes (save v21: a pocket that spawns itself inside a charted system,
  20 minutes from spawn, `collapse` on expiry, re-enterable until its timer ends, objective and locked
  canister strictly one-time), then **14d** wormhole systems in uncharted space, then step 15 the campaign (v22).

## 2026-11-14: Step 14a built — a rift you carry, an instance you fly into, and a cache that stays locked

`npm test` → **523 tests, 0 fail** (14 new: 13 for the instance rules, one for the two new views);
`npm run build` → 789 KB. **Save version unchanged
(v19)**: in this slice an instance is session runtime, so a save made inside one comes back to the pocket it
was opened from and the spot the pilot entered at. Slice 14b saves the run itself.

- **NEW `src/sim/instances.js`** — the whole runtime. `rollRiftTemplate` (weighted, seeded),
  `createInstance`, `riftClearance`, `openRift` (a door at the ship), `enterRift` / `leaveInstance` /
  `riftAction` (**R** only, at close range, never by contact), `objectiveDone`, `exitDenial`,
  `instanceTimeLeft` / `instanceWarning` / `expireInstance` / `updateInstances` / `updateRifts`,
  `destroyInstance`, and the registries `OBJECTIVES`, `EXIT_REQUIREMENTS` and `EXPIRY_OUTCOMES`. Everything
  a template can say is looked up in a registry, and every registry **fails shut**: an unknown objective is
  never done, an unknown exit rule refuses with "The way out cannot be checked (…)", and an unknown expiry
  outcome still puts the pilot out of the place rather than trapping them in a dead one.
- **NEW `src/sim/consumables.js`** — `USE_ACTIONS`, `canUse`, `useItem`. A handler returns `{ text }` when it
  worked or a sentence when it did not; exactly **one** unit is consumed, and only on success. `spawn-rift` is
  the first action: it refuses while docked, inside an instance, or too close to anything, and passes the
  clearance sentence through word for word.
- **The locked cache** (LESSONS L6): it hangs in the instance from the moment the pilot arrives, as an entity
  of its own. When the objective is met it is replaced by ordinary crates that spill where it hung and are
  collected one at a time — nothing enters a hold by side effect, and one seed spills the same crates in the
  same places.
- **Seeded throughout**: `instanceIdFor(template, seed)` names the place, `streamRng(seed, 1)` lays out the
  wave and `streamRng(seed, 2)` the cache, so one seed is one instance — same rocks, same guardians, same
  reward — and an instance writes no `world.placeMemory` at all. `Math.random()` appears nowhere in `sim/`.
- **Harder than the map**: `sim/ai.js` multiplies a hostile's hp and damage by `instanceAt(place).difficulty`
  (1.6 / 1.5 for `guardian_rift`, 2.2 / 2 for `deep_rift`). The declared wave spawns with `encounter: null`,
  so it writes no place memory and cannot trip a mission's wave-clear trigger.
- **The clock**: `lifetimeSec` of unpaused simulation seconds from entry, `warnSec` 60 of warning, then the
  template's declared outcome. `kill` stamps `state.deathNotice` with the template's own sentence, despawns
  the run and its door, and lets the ordinary death rules finish (ship and whole hold gone, recovery fee,
  loaned Wasp, docked in the pocket it was opened from). `collapse` only fades the door and dooms the outer
  pocket (`doomOrigin`, which 14c reads): the instance stays open, its exit keeps working and nobody is ever
  forced out or killed by a wormhole's clock.
- **Dying inside a run**: `sim/session.js` `die()` now emits `dying` before it removes anything, and
  `sim/instances.js` listens — the run despawns at once and the pilot is put back at their entry spot, so the
  ordinary death rules apply unchanged whatever killed them.
- **Views, input, HUD, cards**: `render/views.js` draws the `rift` and `cache` kinds from their records with
  shared geometry and materials (eight entity kinds now); `core/input.js` binds `KeyR: "rift"` and `main.js`
  dispatches it only while playing and not warping; `ui/hud.js` `instanceHtml` shows the authored objective,
  the `mm:ss` countdown and the exit line (open, or the template's refusal); `ui/cargo.js` offers **Use**
  above **Discard** in flight; `ui/screens.js` labels a consumable's tile **USE** and words its line by
  category; `index.html` and the intro screen's controls list both mention **R**.
- **Content and shops**: `rift_basic` is back on Meridian's shelf at **10 cr**, described in the shop's own
  words (item `v: 6`, so selling follows the 60 % rule); `data/loot.js` gains `rift_rock`, `rift_cache` and
  `rift_cache_deep`.
- **NEW `tests/step14-instances.test.mjs`** (13 tests): every template is complete and every word it uses is
  in a registry; the weighted roll and its refusals; seeded determinism and the absence of a `placeMemory`
  trace; the four clearance margins; one use and one door per seed; **R** in and out at range with the sealed
  exit refusing in the template's words; the cache's spill; leaving returns the pilot to the exact entry spot
  with everything aboard; both expiry outcomes; a death by shot inside a run; fail-closed unknown rules;
  `destroyInstance` and `resetPlaces`. `tests/views.test.mjs` gains one more: a real door and a cache
  record each get exactly one mesh, drawn at the radius and the position their records declare, and both
  meshes go when `clearWorldObjects()` takes the records.
- **Fixed while testing**: `captureResume()` spread a `{ pos, quat }` of `Vector3`s into the resume point
  instead of arrays, which would have saved garbage for anybody inside an instance; and `expireInstance()`
  now emits `instance-expired` **before** the outcome runs, so a listener still sees the instance registered
  (a `kill` destroyed it first and the event had nothing left to look at). The way out also offers itself the
  way a door does: within `RIFT.exitRange` the prompt says "Press R to leave through …", or the refusal while
  it is sealed.
- **Docs**: NEW `testing/TESTING-14-RIFTS.md` (owner playtest, listed in `testing/README.md`), NEW
  `docs/recipes/22-a-new-rift-or-instance.md` (indexed in `docs/HOW_TO_ADD.md`), `docs/HANDOFF.md` rewritten,
  `docs/ROADMAP.md` step 14a status, `src/sim/README.md` and `src/data/README.md`.
- **Not in this slice**: saving a run (14b), simple wormholes and their self-spawning pockets (14c),
  uncharted wormhole systems (14d), and the campaign (15).

Files: `src/sim/instances.js` (new), `src/sim/consumables.js` (new), `src/sim/{session,places,world,ai,step}.js`,
`src/state/state.js`, `src/data/{instances,items,loot,shops}.js`, `src/render/views.js`, `src/core/input.js`,
`src/main.js`, `src/index.html`, `src/ui/{hud,cargo,screens}.js`, `src/util/events.js`,
`tests/step14-instances.test.mjs` (new), `tests/{layers,views,shops,content,enemies}.test.mjs`, `src/sim/README.md`,
`src/data/README.md`, `src/{render,core,ui}/README.md`, `docs/{HANDOFF,ROADMAP,HOW_TO_ADD,ARCHITECTURE,CHANGELOG}.md`,
`docs/architecture/{world-and-map,content-data,ui-and-screens}.md`,
`docs/recipes/22-a-new-rift-or-instance.md`, `testing/{TESTING-14-RIFTS,README}.md`.

---

## 2026-11-14: Step 14 groundwork — instance templates as data, and the owner's wormhole model recorded

No game behaviour changed yet: everything below is data, docs and empty runtime hooks that nothing reads. **Save
version unchanged (v19)**, but `src/` changed, so rebuild (`npm run build`) and re-run `npm test`.

- **Owner clarification (fourth round, 2026-11-14).** Natural wormholes come in two kinds that share one machinery. A
  **simple wormhole** is a pocket that spawns itself in normal space: warp to it like any pocket, the wormhole hangs
  there as an object, press **R** close to it and enter one instanced pocket isolated from the rest of space with an
  objective of its own. Its **20 minutes run from the moment the pocket spawns**, not from entry. Running out fades the
  wormhole object and dooms the outer pocket — it leaves the map when you warp off, then despawns. The way out inside is
  a **Stable wormhole** with no clock of its own: nobody is ever forced out or killed by it, and leaving after the
  collapse returns you to an empty pocket. A **wormhole system** (later slice, now **14d**) is entered the same way, but
  its far side is a system in uncharted space — off the existing starmap, **persistent and saved** like any other
  system, with dynamic wormhole pockets on the same timer (a new one spawns so you can always get out) and a map button
  to view normal space and come back. Rifts are unchanged: they still **kill** on expiry.
- `docs/VISION.md`: the step 14 decision rewritten for that model — the two wormhole kinds, the two clock anchors, and
  `collapse` replacing the third round's `eject` (nothing forces a pilot out of a wormhole, so there is nothing to
  eject from). Slices are now 14a rift, 14b saved run, 14c simple wormholes, 14d wormhole systems.
- `docs/REFACTOR_PLAN.md`: step 14's 14c bullet rewritten — it is no longer "data only", because a self-spawning
  pocket, its timer and its despawn are real machinery — and a 14d bullet added. `docs/TARGET_ARCHITECTURE.md` gains a
  **Wormhole** paragraph beside **Instance**. `docs/ROADMAP.md`: table rows 14c/14d, current position, log line.
- **NEW `src/data/instances.js`** — the whole template vocabulary, with no behaviour in it (a weighted roll is
  behaviour and belongs to `sim/instances.js`, the way `data/loot.js` is rolled by `sim/loot.js`): `RIFT`
  (`enterRange` 200, `exitRange` 220, `warnSec` 60, and `clearance` — 1000 m from a station, an asteroid field's
  edge or a planet's surface, 150 m from any single rock), `OBJECTIVE_KINDS`, `EXIT_REQUIREMENT_TYPES`,
  `EXPIRY_OUTCOME_TYPES` (`kill`, `collapse`), two instance templates (`guardian_rift`: tier 4, 1200 s,
  `{hp 1.6, dmg 1.5}`, four guardians, sealed exit, locked cache; `deep_rift`: tier 6, 1500 s, `{hp 2.2, dmg 2}`,
  six guardians, richer cache), `RIFTS.basic` as a weighted template pool, and `instanceIdFor(templateId, seed)` so
  one seed is always one instance.
- `src/data/places.js`: a runtime **instance place registry** — `registerInstancePlace`, `unregisterInstancePlace`,
  `clearInstancePlaces`, `isInstancePlace`. An instance resolves through the ordinary `placeAt`/`placeDef` path
  (its `features` come from its template) but stays out of `pocketsIn`, so it can never appear on a map, and
  `setPlaceCatalog` drops every instance when a world is installed. The merged catalog is built **lazily**: reading
  `PLACES` at import time is a reference error, and the first `npm test` after this change said so (51 files failed).
- `src/state/state.js`: `state.instances` (a Map, session runtime only in 14a), `instanceAt`, `insideInstance`,
  `clearInstances`; `resetPlaces` clears them; every place container gains `rifts` and `caches` entity lists; and
  `captureResume` records the spot a rift was entered from instead of a spot inside an instance that is not saved yet,
  so a save inside a rift returns the pilot to the pocket it was opened from. Slice 14b replaces that with the run.
- `src/data/items.js`: the first consumable — `rift_basic` (10 cr, `use: "spawn-rift"`, `rift: "basic"`) plus the
  `itemUse`/`itemRift` readers. `src/data/loot.js`: `rift_rock` (richer ore) and the two cache tables
  `rift_cache` / `rift_cache_deep`. `src/data/README.md`: the row for `instances.js` (`tests/docs.test.mjs`
  requires one).
- **Deliberately not added yet:** the `rift_basic` shop row. The **Use** action behind it (`sim/consumables.js`,
  `sim/instances.js`, the right-click menu entry, the **R** binding, the rift and cache views) is what slice 14a
  builds next, and an item you can buy but cannot use would be a silent failure.
- This entry **supersedes** the first 2026-11-14 entry above on three points: instances **are** saved (14b, v20),
  expiry outcomes are **per template**, and the natural-wormhole outcome is `collapse` — not the second round's
  `eject`, and not the first round's "instances are never saved".
- Next: slice **14a** — `sim/instances.js` (create/enter/leave/expire, the objective and exit registries, the locked
  cache), `sim/consumables.js` (`useItem` plus `USE_ACTIONS`), the rift and cache entities and their views, the
  **R** binding, the shop row, `tests/step14-instances.test.mjs` and `testing/TESTING-14-RIFTS.md`.

Files: `src/data/instances.js` (new), `src/data/places.js`, `src/data/items.js`, `src/data/loot.js`,
`src/data/README.md`, `src/state/state.js`, `docs/VISION.md`, `docs/REFACTOR_PLAN.md`,
`docs/TARGET_ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`.

---

## 2026-11-14: VISION records the owner's step 14 rift decisions; open question 5 is closed

Docs only: no code changed, no rebuild needed, **save version unchanged (v19)**. The owner answered step 14's blocking
question, so the decision is written down before any code exists — the docs are the memory across chats.

- `docs/VISION.md`: open question 5 deleted, and a **"2026-11-14 — Step 14: rifts, instances and how you may leave
  one"** decision added. A spawned wormhole is a **rift**; the first is a **Basic rift** at 10 cr, used by
  right-clicking it in the in-flight ship inventory, opening where the ship is and refused unless the ship is 1 km clear
  of a station, an asteroid field's edge or a planet's surface (150 m from a single rock). Natural wormholes are
  map-visible, warpable and time limited. Entering and leaving is a close-range **R** press, never contact. Whether an
  instance may be left is **data on the instance**: the Basic rift stays shut until its objective is done. A spawned
  rift is one use. Instances are never saved — a checkpoint on entry, no autosave inside, a save on the way out — so
  reloading mid-rift returns the pilot to the entry point with none of that run's loot.
- Its "Instanced places" bullet now names rifts and points at the decision.
- Next: build slice **14a** (the Basic rift) once the owner says go. Natural wormholes are slice **14b** and will need
  save **v20**, which makes step 15 (campaign) v21; the ROADMAP table will be renumbered in that change.

---

## 2026-11-14: The owner confirmed the pending mission playtests; nothing is waiting now

Docs only: no code changed, no rebuild needed, **save version unchanged (v19)**. The owner reported that the work built
on 2026-11-13 passed in the browser — station-scoped mission offers with the docked-panel redraw, the contract delivery
wording, recovery contracts spawning and counting their own crates — together with the death-and-missions playtest guide.

- `docs/ROADMAP.md`: "Current position" rewritten so it says no playtest is pending, a log line added for 2026-11-14,
  "Last checked" moved to 2026-11-14.
- `testing/TESTING-DEATH-AND-MISSIONS.md` moved to `testing/passed/`; both tables in `testing/README.md` updated.
- `docs/HANDOFF.md`: "Last checked" 2026-11-14, plus one line saying nothing is waiting on a playtest.
- This file: its oldest full entry moved word for word to `docs/CHANGELOG_ARCHIVE.md` with an index line, so exactly ten
  full entries remain here.
- Next: refactor step 14 (instanced places and wormholes). The owner has answered VISION open question 5 — spawnable
  wormholes are **rifts**, sold as a "Basic rift" for 10 cr, used by right-clicking it in the in-flight ship inventory,
  spawning where the ship is at least 1 km from any large structure; natural wormholes appear on pocket maps and are
  time-limited; a rift may declare criteria that must be met before it can be left. The step is planned before any code.

---

## 2026-11-13: A recovery contract recovers its own crates, and the space is left clean

Owner request: "recovery missions require you to recover all the crates the mission generates … lists progress of
recovery in the ship ui and mission log as 'x out of y crates recovered'. Those must then be specific to the specific
mission … you must recover each mission's own individual crates", and "to complete the mission you need the right
number of items and are consumed upon hand in … must clear the space of the mission specific in space crates."
**Save version unchanged (v19)** — `slot` is additive and older drop records stay slot-less; rebuild needed
(`npm run build`, then `npm test`).

- **Each crate belongs to one contract (`data/missions/contracts.js`).** The salvage step carries `owned: true`, so the
  runner counts a pickup for a contract only when the crate carries that mission's id (`objectiveMatches`,
  `missionPickupMatches`). Accepting "Recover 3" and "Recover 6" at once now needs all nine of their own crates: another
  contract's crates, and loose Salvage from a wreck, move nothing.
- **The field (`sim/session.js`).** `ensureSalvageCrates` runs on every launch and puts one persistent crate in the
  asteroid field for each crate a contract still needs. The crates are persistent and tagged, so a warp, a dock or a
  reload keeps them, and a crate already collected is never spawned again.
- **Several crates of one item (`sim/combat.js`).** A drop record used to be keyed by mission + item, which allowed only
  one crate per mission. Records now carry a `slot` (`nextMissionCrateSlot` hands out the next free one), and spawn,
  drift, pickup, save and restore all match on it. `state/profile.js` keeps `slot` in the saved world and dedupes by it.
- **Wording (`sim/missions.js`, `ui/hud.js`, `ui/missionlog.js`).** `missionRecoveryText` says "2 out of 3 crates
  recovered": the HUD shows it under the contract line while flying, and the docked card uses it in place of "Objective
  progress: 0 of 3". This supersedes the previous entry's salvage wording — the no-tally rule now covers **mine** only.
- **Hand-in is unchanged in kind, stricter in fact.** Objectives done (each crate recovered from space) plus `n` Salvage
  in the station or the hold; `consumeDelivery` takes them and pays. Any Salvage pays, because the recovered crates are
  ordinary cargo, and the items are consumed on the spot.
- **The space is left clean.** Handing in a contract (or abandoning it) already ran `clearMissionContents`; it now drops
  that mission's crates from every pocket and deletes their saved records, so nothing respawns when the pocket loads
  again. Tested with an extra crate still floating when the pilot hands in.
- **Tests:** new `tests/mission-recovery-crates.test.mjs` (spawn counts and slots, per-contract counting, hand-in
  consumption and cleanup, abandon cleanup, save round trip) and a per-contract counting test in
  `tests/step13-missions.test.mjs`; the guest-pickup test now spawns its own contract's crate. **509 tests / 0 failures.**
- **Docs:** `docs/MISSION_RULES.md` (recovery-contract paragraph, trimmed to stay inside its size cap), `src/sim/README.md`,
  `src/ui/README.md`, `testing/TESTING-BASELINE.md`.

---

---

## 2026-11-13: Contract guidance says where the cargo goes, not how much is aboard

Owner request: "Currently recover contracts and mine contracts update the mission subtext in top right of ship ui depending
on how many items you have picked up. Avoid this for recovery/delivery missions. It is simplest to have a mission title
'Recover x Derelict crates' and sub text 'deliver them to Meridian station' … progress numbers are not good … since
hypothetically you could have a lot of derelict crates in the station." **Save version unchanged (v19)**; rebuild needed
(`npm run build`, then `npm test`).

- **The two delivery contracts read as a delivery from the moment they are taken.** `mine` and `salvage` are flagged
  `delivery: true` in `data/missions/contracts.js`, and the runner (`missionNextText`) shows the hand-in sentence for them
  instead of the gather step's sentence, which counted what had been picked up so far. The HUD's top-right block now reads
  **Mine 12 Ferrite — Deliver the Ferrite to Meridian Station.** and **Recover 3 derelict crates — Deliver them to Meridian
  Station.**, steady while mining, while carrying, and after the load is stored.
- **No running tally on a delivery contract.** `handInNextText` no longer appends "You have 2 of 3." for them: the count
  only ever saw the ship's hold while the station store may already hold part of the load. The docked hand-in button still
  reports the exact shortfall, and hunt contracts keep their "0 of 4 defeated" line because kills cannot be banked.
- **Read from the data, not from the saved step**, so a contract accepted before this build shows the new sentence too;
  old saves keep the wording they were stamped with until they fall back to `handIn.objective`.
- **Tests:** `tests/step13-missions.test.mjs` and `tests/mission-handin-station.test.mjs` now assert the delivery sentence,
  that it carries no digits, and that it does not change when the hold fills up. 502 tests pass.

Files: `src/data/missions/contracts.js`, `src/sim/missions.js`, `tests/step13-missions.test.mjs`,
`tests/mission-handin-station.test.mjs`, `docs/MISSION_RULES.md`, `src/sim/README.md`, `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: Notices hang just below the flight message line

Owner request: "Make it so that all pop up notifications like the confirmation after you have discarded an items appear
by default in the top middle part of the screen in the top 25% of the screen", then: "Its too high up, it should be
positioned just below the UI element in ship UI where it says 'Empty weapon slot' etc. Make sure it doesnt overlap with
the Empty weapon / Warp: slot UI element though." **Save version unchanged (v19)**; rebuild needed (`npm run build`,
then `npm test`).

- **`#panel-notice` sits under the centred message line.** It is still fixed to the viewport (so it can never move the
  panel), still `role="status"`, 7 s or a click to dismiss, and still `left: 50%` + `translateX(-50%)`. `ui/notice.js`
  `placeNotice()` now measures `#msg` — the centred line at 14% of the screen that says **"Empty weapon slot"** when a
  weapon switch finds nothing fitted, or names the warp — on every notice, and puts the notice **12 px under its bottom
  edge**, so the two never touch and a wrapped warp message pushes the notice down with it.
- **Docked and on the title screen** the HUD is away, so the line measures nothing: the same band is derived from the
  viewport height (`0.14 × height + one 26 px line + 12`), and `styles.css` carries `top: 16%` as the pre-script default.
  A window resize re-measures while a notice is showing.
- **Correction to the first attempt:** it was anchored to `#tr`, the top-right HUD block that also prints "Empty weapon
  slot" as the fitted-weapon readout. That is not the element the owner meant — the notification they compare against is
  the centred `#msg` line — so the anchor moved. The "mission failed" alert in `missionlog.js` was not touched.
- **Tests:** `tests/ui-notices.test.mjs` asserts the rule is centred with the `16%` band and no `bottom`;
  `tests/ui-notice-position.test.mjs` drives `placeNotice()` itself — 164 px under a message line at 126 px with one line
  of text, 190 px when the message wraps to two, and the same 164 px from the viewport fallback when the line is hidden.
  502 tests pass.

Files: `src/ui/notice.js`, `src/styles.css`, `tests/ui-notices.test.mjs`, `tests/ui-notice-position.test.mjs`,
`src/ui/README.md`, `docs/architecture/ui-and-screens.md`, `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: Right-click Discard everywhere — how many, then "are you sure?"

Owner request: "Add a right click function to inventories called 'Discard'. This just trashes an item. This works in
both station and ship ui. So this will be the first thing you can do with items in space." Follow-up: "When clicking on
discard a pop up should come up asking how many you want to discard the same way when you right click and sell. Also
before discarding the final click should ask you 'are you sure you want to discard x?'" **Save version unchanged
(v19)**; rebuild needed (`npm run build`, then `npm test`).

- **One shared popover, two steps** (`ui/discard.js`, used by the station panel and the flight card). Step one is the
  sell box's own number field — **Discard Ferrite**, `Amount (1–7)`, defaulting to the whole stack — with **Discard**
  and **Cancel**. Step two is the question the owner asked for: **"Are you sure you want to discard 3 Ferrite?"** with
  "It cannot be recovered." and only then **Discard** / **Cancel**. Nothing leaves the hold until the second click;
  Enter commits the visible step, Esc closes the box, and a count outside 1–N is refused with the sell box's wording.
- **Station panel:** the tile menu still lists **Sell** then **Discard ×N**; Discard now opens the popover instead of
  trashing at once, and the commit trashes from that tile's own place, notices, saves, redraws and re-emits
  `mission-inventory-changed` so pending hand-offs retry.
- **Flight card:** the same popover from the hold's right-click menu, autosaving and redrawing the card on commit.
- **One rule, one function:** `data/items.js` `canDiscard(id)` refuses only mission items (a beacon or parcel cannot be
  found again), and `sim/inventory.js` `discardItem(where, id, n)` takes `n` (whole stack by default) and returns the
  pilot's message ("Discarded 2 Ferrite from the Wasp.").
- **Fixed after the owner's playtest:** (1) *"the are you sure tab doesnt appear in the ship ui"* — the popover's step
  one swapped its own `innerHTML`, which detached the clicked button, so the flight card's click handler saw a target
  outside the popover and closed the question it had just opened. `ui/discard.js` now stops propagation for clicks
  inside the popover (a test fails without that line). (2) *"mouse cursor is not visible when moving it outside a
  menu"* — the canvas hides the system pointer for mouse-look flight while the HUD draws its own reticle, so beside the
  station panel there was no pointer at all. `ui/hud.js` `setReticle()` hides the HUD and adds `body.no-reticle`
  together, and `styles.css` gives the canvas `cursor: default` in that state: docked and on the title screen the real
  pointer is back.
- **Tests:** `tests/inventory-discard.test.mjs` (whole and partial stacks in hold and station, the wording, the mission
  rule, both screens' tiles carrying `data-where`, both menus wired through the popover, the ask/question HTML), the
  DOM test in `tests/ui-cargo.test.mjs`, which walks the whole flight-card flow: right-click → menu → amount box (whole
  stack) → bad count refused → question surviving its own click → confirm trashes exactly that many → cancel keeps
  cargo → mission item greyed, and `tests/ui-cursor.test.mjs` for the pointer/hand-over. 501 tests pass.

Files: `src/ui/discard.js` (new), `src/data/items.js`, `src/sim/inventory.js`, `src/ui/screens.js`, `src/ui/menu.js`,
`src/ui/cargo.js`, `src/styles.css`, `tests/inventory-discard.test.mjs`, `tests/ui-cargo.test.mjs`, `src/ui/hud.js`, `tests/ui-cursor.test.mjs` (new), `src/ui/README.md`, `src/sim/README.md`,
`docs/architecture/ui-and-screens.md`, `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: Press I in space to read the ship's inventory, and the chart no longer stops the clock

Owner request: "can we add menu of the current ship's inventory if we click 'i' when in space? Same layout as the
inventory when in a station but it can be a bit wider." Follow-up in the same round: drop the card's sub-line, make it
**7 tiles across and 5 rows** tall at the same total width, and "make it so that the map and the inventory dont pause
the game". **Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **I in space opens the hold.** New `ui/cargo.js` owns a modal card outside the docked panel: `screens.js`
  `cargoHtml()` draws the same `inv-col`/`inv-grid`/`inv-item` tiles as the station Inventory tab, but only the hold of
  the ship being flown, in an **880 px** card instead of the station panel's 580 px. No sub-line, and **7 tiles a row by
  5 rows** (`slots: 35`, narrower boxes at the same tile height and total width). In flight there is nowhere to move
  cargo, so the tiles are labels (`inv-item-read`), with no move, sell or ship-switch controls.
- **The chart and the hold never stop the world.** `sim/step.js` `isSimulationPaused()` now counts **only** the pause
  card and the title screen, so time, physics and audio keep running behind either overlay in every mode (the chart
  used to pause a single-player flight and mute it). Both still release held flight input and block the
  dock/lock/weapon/jump hotkeys while open, and both close on docking.
- **It behaves like the chart otherwise.** **I** or **Esc** closes the hold, **P** closes it and opens the pause card,
  the Close button and a click outside work, and docking, the title screen or death close it. `canOpenCargo()` refuses
  while docked, dead, warping, paused, on the title screen or over the starmap.
- **Docked, I is the Inventory tab.** In a station the panel already shows the tabs, so `I` switches it to Inventory
  (`menu.js` `openStationTab`). The launch help text now mentions the key.
- **Tests:** new `tests/ui-cargo.test.mjs` (the same tile layout, capacity and 7×5 slot field, read-only in flight while
  the station tab keeps its move buttons, the open/refuse rule, and the world staying live); the chart's frame-gate test
  now asserts that neither overlay pauses and that the pause card and title screen still do. 492 tests pass.

Files: `src/ui/cargo.js` (new), `src/ui/screens.js`, `src/ui/menu.js`, `src/main.js`, `src/core/input.js`,
`src/ui/starmap.js`, `src/sim/step.js`, `src/state/state.js`, `src/styles.css`, `tests/ui-cargo.test.mjs`,
`tests/step11b-starmap.test.mjs`, `tests/inventory.test.mjs`, `src/ui/overlays.js`, `tests/ui-overlays.test.mjs`,
`src/ui/README.md`, `src/sim/README.md`,
`docs/architecture/ui-and-screens.md`, `docs/architecture/world-and-map.md`, `docs/architecture/feature-notes.md`,
`docs/VISION.md`, `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: Your missions follow you; only the offers and the hand-in stay at a station

Owner correction to the station-scoping round: "Active story missions are not visible if you dock into another station...
accepting border signal doesnt show anything in progress when im docked at galereach." Right: progress is the pilot's,
not the counter's. **Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **Every active mission is listed at every station.** `ui/missionlog.js` and the Contracts tab
  (`ui/screens.js`) no longer filter the active list by station: a job taken at Meridian shows at Galereach with its
  status, objective, progress bar and dialogue preview, and can be abandoned from anywhere. The `missionFiledAt` helper
  is gone — it existed only for that filter.
- **Only the hand-in is station-bound.** Elsewhere the card reads "Deliver to Meridian Station" and shows a disabled
  **Hand in at Meridian Station** button; at the mission's own station the same button is **Hand in cargo**. Public
  options are unchanged: the chest `completeMission` refusal, the cargo never leaving the hold, and the reward only at
  the station that takes it.
- **Station conversations stay at their station.** Now that a mission is listed everywhere, its counter dialogue must
  not be playable from the wrong counter. A `requiresDock` dialogue is live only while docked at the station that gives
  the mission out (`missionAtItsStation`): elsewhere the card is read-only and says "Return to Meridian Station to
  continue talking.", and `advanceDialogue` refuses the same click. In-field dialogue (the beacon hand-off) is unchanged.
- **Offers are still station-specific.** The story offer list (`missionOfferStation`) and per-station contract boards
  (`boardAt`) are untouched: Galereach still offers nothing to accept, and an accepted Border Signal is not offered a
  second time.
- **Tests:** `tests/mission-station-scoping.test.mjs` now pins the corrected rule — both jobs visible at both stations,
  hand-in live only at the right one, Abandon present everywhere, the real-seed check extended (accept the Border Signal
  at Meridian, dock at Galereach, and the log shows the mission there with no story offer), and a new test that the
  Meridian briefing cannot be played from another station.
  `tests/mission-handin-station.test.mjs` expects the mission listed at the wrong station with a disabled, station-named
  hand-in. 487 tests pass.

Files: `src/ui/missionlog.js`, `src/ui/screens.js`, `src/sim/missions.js`, `src/sim/contracts.js`,
`src/ui/README.md`, `testing/TESTING-BASELINE.md`,
`tests/mission-station-scoping.test.mjs`, `tests/mission-handin-station.test.mjs`, `docs/MISSION_RULES.md`,
`docs/architecture/ui-and-screens.md`, `src/ui/README.md`, `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: No message line that moves the menu, and no "filed at another station" note

Owner feedback on the docked screens: "if you are in another station it says 1 mission is filed at another station. fly
there to read it. You dont need to mention that just say 'No active missions here'", and "remove these types of UI
notifications... I dont like it when notifications cause the entire UI to shift". **Save version unchanged (v19)**;
rebuild needed (`npm run build`, then `npm test`).

- **The Mission log and Contracts tab no longer explain where the other work is.** A station with no missions simply
  reads "No active missions here."; the `N missions are filed at another station` line is gone from both screens
  (`ui/missionlog.js`, `ui/screens.js`). Filtering is unchanged — another station's missions still do not appear.
- **The panel never prints a message.** `outpostHtml` used to start with `<div class="ok">…</div>`, so every action that
  returned a string pushed the whole menu down: "Contract accepted. Launch when ready.", "Sold 12 items for 340 cr.",
  "Basic Power Plant moved to storage.". That element and `state.ui.toast` are gone.
- **Routine confirmations are silent; refusals and warnings are a fixed overlay.** New `ui/notice.js` owns the rule:
  `isRoutineReply()` lists the replies that only restate the redrawn panel (accepted, paid, sold, moved, fitted,
  restocked, repaired, bought-into-storage, saved/loaded/deleted slot, reset, imported), and `notify()` shows anything
  else — a refusal, a save/import failure, a galaxy-recovery warning — in a `#panel-notice` element fixed to the
  viewport (`role="status"`, click to dismiss, 7 s). An unrecognised message is shown, never swallowed. The "mission
  failed" alert is untouched.
- **No layout can shift:** `#panel-notice` is `position: fixed` outside the panel; the panel's markup has no message
  slot at all. A test asserts both.
- **Tests:** new `tests/ui-notices.test.mjs` (silent replies, visible refusals, the panel renders no message, the CSS is
  fixed). Existing tests that observed `state.ui.toast` now read `shownNotice()` from the same module
  (`tests/step10-fixes.test.mjs`, `tests/step11b-starmap.test.mjs`, `tests/navigation.test.mjs`); the mission-log tests
  assert the elsewhere note is gone. 487 tests pass.

Files: `src/ui/notice.js` (new), `src/ui/menu.js`, `src/ui/screens.js`, `src/ui/missionlog.js`, `src/ui/pause.js`,
`src/state/state.js`, `src/styles.css`, `tests/ui-notices.test.mjs`, `tests/step10-fixes.test.mjs`,
`tests/step11b-starmap.test.mjs`, `tests/navigation.test.mjs`, `tests/mission-station-scoping.test.mjs`,
`tests/mission-handin-station.test.mjs`.

---

## 2026-11-13: A story mission is offered at one station, and only there

Owner follow-up to the station-scoping round: "missions by default are specific to a station — Border Signal is only
available at Meridian; at Galereach the Mission log should have nothing to accept as a story mission."
**Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **The default is one station, and there is no "offered everywhere" form.** `missionOfferStation()` resolves the
  offering station as `offeredAt`, else the station the mission is handed in at, else the home station — so an
  authored mission without either field is still Meridian-only, never global. The Mission log lists a story offer
  only where that resolves to the station being read, and `ui/menu.js` refuses a `story` action anywhere else.
- **Fails closed instead of silently moving.** A mission whose `offeredAt` names an unknown id, or a pocket with no
  station, is offered **nowhere** (the linter already reports it as an error) rather than falling back to the home
  station. `sim/missions.js` gains `stationPocket(id)`, which requires a real station pocket, because `stationAt`
  alone accepts any unknown id — the place catalog falls back to Meridian for ids it does not know. `missionHandInStation`
  and the hand-in stamping use it too, so a corrupt `handIn.station` in an old save resolves from `origin` instead of
  filing the mission at a station that does not exist.
- **Verified at the real Galereach:** new regression in `tests/mission-station-scoping.test.mjs` builds the seed's
  galaxy (122 station pockets), docks at the station named Galereach, and asserts the Mission log has no Border Signal
  and no `data-a="story"` button there, while Meridian in the same galaxy still shows both. A second test pins the
  fail-closed rule. 484 tests pass.

Files: `src/sim/missions.js`, `tests/mission-station-scoping.test.mjs`, `docs/MISSION_RULES.md`,
`docs/architecture/ui-and-screens.md`, `src/data/README.md`.

---

## 2026-11-13: Missions belong to the station that filed them, and the docked panel redraws itself

Two owner-reported fixes. **Save version unchanged (v19)** — `world.boards` is an additive field with a
default; rebuild needed (`npm run build`, then `npm test`).

- **Station-specific missions and contracts:** a station's contract board used to be the world's one board,
  so a job read at Meridian could be accepted at Depot, and the Mission log listed every active mission no
  matter where it was taken. New `sim/contracts.js` `boardAt(placeId, world)` gives every station its own
  offers (`world.board` stays the home station's list so old saves keep theirs in place; other stations get
  `world.boards[placeId]`, generated on first look); `ensureBoard(world, placeId)` and
  `rerollBoard(world, placeId)` work per station, and `acceptContract(index, profile, world, placeId)`
  rerolls only the board it read. `acceptMission`/`instantiateMission` take the giving station explicitly,
  so a contract taken from Depot's board is stamped Depot even when the caller is not standing there.
- **The Mission log and Contracts tab are scoped to the current station:** both filter with
  `missionFiledAt(mission)` (filed where it is handed in), and a line below says how many missions are
  filed elsewhere ("1 mission is filed at another station. Fly there to read it."). Story missions are
  offered only where `missionOfferStation()` points: `data/missions/story.js` now says `offeredAt: "reach"`
  for the Border Signal, the linter rejects an `offeredAt` that is not a station, and `ui/menu.js` refuses a
  `story` action for a mission offered elsewhere.
- **Buttons address missions by id, not by list position:** the panels list a filtered selection, so a
  position would hit the wrong record once another station's missions exist. `data-b` now carries
  `mission.id` in `ui/screens.js` and `ui/missionlog.js`, and `ui/menu.js` passes it through unchanged.
- **The docked panel redraws when a mission changes:** the panel is HTML drawn when it is opened, so closing
  the Border Signal's final dialogue left the card offering **Abandon** while the beacon was already aboard.
  `ui/missionlog.js` now emits `mission-ui-refresh` after every mission event except the ones that already
  redraw the panel (mission-ui-refresh, main-menu, docked, launched); `ui/menu.js` listens and redraws the
  visible panel. Closing the last line now shows **Hand in cargo** straight away.
- **Save:** `newWorld()` gains `boards: {}`; `cleanWorld` keeps only pockets that exist and are not the home
  station, and only boards with at least one valid offer, so a save never grows from stations merely
  visited.
- **Tests:** new `tests/mission-station-scoping.test.mjs` (5 tests: per-station boards and rerolls, filing at
  the giving station, scoped log/tab with the elsewhere count, story offers only at their station, and the
  dialogue-close redraw). `tests/mission-handin-station.test.mjs` now expects the wrong station to hide the
  mission instead of disabling its button; `tests/step9-save.test.mjs` expects `boards`. 482 tests pass.

Files: `src/sim/missions.js`, `src/sim/contracts.js`, `src/sim/session.js`, `src/state/profile.js`,
`src/data/missions/story.js`, `src/data/missions/validate.js`, `src/ui/screens.js`, `src/ui/missionlog.js`,
`src/ui/menu.js`, `tests/mission-station-scoping.test.mjs`, `tests/mission-handin-station.test.mjs`,
`tests/step9-save.test.mjs`.

---

## 2026-11-13: Overlays everywhere in the open world, a quiet exit to the menu, and a cinematic title view

Four owner-reported UI fixes. **Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **Pause card order:** Resume is now the first control and **Exit to main menu** the last, with the sound
  switch between them. The markup lives in `ui/overlays.js` (`pauseOverlayHtml()`), so the order is one place.
- **Pause and starmap while docked:** both used to be refused unless the pilot was flying. New
  `ui/overlays.js` owns the rule (`canPause`, `canOpenStarmap`) and `main.js` plus `sim`-facing `openStarmap`
  ask it: only the title screen, the pause overlay itself, a dead pilot or a warp refuses. Plotting from the
  chart while docked works; the warp itself still needs a launch, and the chart now says "Docked: launch to
  warp." instead of offering a course that does nothing.
- **Quiet exit to the menu:** the simulation stops behind the title screen, so `updateAudio()` stopped
  driving the loops and the engine droned on. `core/audio.js` gains `fadeToSilence(seconds)` (a 1.8 s ramp on
  every looping voice — engine hiss and growl, roar, beam hum, drone, docked pad and its LFO — not a hard
  cut), called from a `main-menu` listener. Playing again ramps everything back up.
- **Cinematic title screen:** the menu used to show whatever the game camera last rendered (the pocket the
  pilot quit in). New `render/menuview.js` draws its own scene — the home station turning with its planet
  behind it — from `DEFAULT_PLACE` features only, on the path in `data/camera.js` (`MENU_CAMERA`,
  `menu-pose`-style `menuPose`, sway 110 s, distance 520) and independent of the saved world, so the
  background is the same every time. It also nudges the station left of centre on wide screens so the title
  panel does not cover it. `render/scene.js` now exports `stationModel`/`planetModel` so both scenes use one
  copy of the station geometry.
- **Tests:** new `tests/ui-overlays.test.mjs` (pause card order, both overlays allowed at a station and
  refused on the title screen/pause/warp/death, the title camera always framing the station with the planet
  behind it, and the fade being safe with no speakers).
- **Docs:** `docs/architecture/ui-and-screens.md` conventions, `src/ui`, `src/render` and `src/core` README
  rows, and steps 4–6 of `testing/TESTING-BASELINE.md`.

---

## 2026-11-13: Every mission and contract is handed in at one named station

Fixes "the game does not care which location you hand a mission in at." **Save version unchanged (v19)** — the field is
additive and older missions resolve it from `origin`; rebuild needed (`npm run build`, then `npm test`).

- **Why:** `completeMission` asked only that the pilot be docked, so any station paid any mission, and the guidance named
  whichever station the pilot happened to be at instead of the one that takes the hand-in.
- **The rule (data):** a mission is handed in at **one station** — the one that gave it out, unless its data names another
  with `handIn.station: "<pocket id>"` (a job that starts at one station and ends at another). `BORDER_SIGNAL_MISSION` now
  declares `handIn.station: "reach"` and says `"Return to {station} with the beacon."`.
- **The runner (`sim/missions.js`):** `acceptMission` stamps `handIn.station` on the mission when it is taken, so the station
  survives a save and cannot drift as the pilot travels. New `missionHandInStation`, `missionHandInStationName`,
  `atMissionHandInStation` and `canCompleteMissionHere`. `completeMission` refuses any other station ("Hand this in at
  Meridian Station."), takes nothing and pays nothing. Fallbacks so a mission can never become impossible: a mission saved
  before the field existed resolves its `origin`, an offer resolves the station the pilot is docked at, and a station that no
  longer exists falls back to the home station.
- **Guidance:** `{station}` is filled in with the mission's hand-in station, never "a station" or wherever the pilot is;
  a mission with nothing to hand over now says "Contract complete. Return to Meridian Station to collect the reward."
- **Screens (`ui/missionlog.js`, `ui/screens.js`):** away from the station the status reads "Deliver to <station>" and the
  hand-in button is disabled with the station named ("Hand in at Meridian Station"), next to Abandon; at the right station it
  reads "Ready to hand in" and "Hand in cargo" as before. Story offers say where they are handed in.
- **Save (`state/profile.js`):** `cleanMission` keeps `handIn` (objective and station) instead of dropping it, and Border
  Signal's authored station always wins. No `SAVE_VERSION` bump.
- **Linter (`data/missions/validate.js`):** `handIn.station` must be a pocket with a station feature; any other `handIn` key
  is flagged; a hand-in sentence that names neither `{station}` nor the station itself is a warning.
- **Tests:** new `tests/mission-handin-station.test.mjs` (a second station pocket proves the contract taken at Meridian cannot
  be paid at Depot Station and vice versa, a data-chosen station, the save round trip, and the linter). Two existing wording
  assertions updated.
- **Docs:** `MISSION_RULES.md` rule 11 and a "Where the hand-in happens" paragraph, recipes 03 and 11, mission principles,
  `src/sim/README.md`, and the playtest guide.

---

---

## 2026-11-13: Dying hands you a complete spare Wasp that can be fitted again

Fixes "if you die, you get a free wasp. Cant then equip equipment to the ship." **Save version unchanged (v19)**;
rebuild needed (`npm run build`, then `npm test`).

- **Why:** `die()` deleted the lost hull's fleet records and then added the replacement as a bare hull id. A ship's bays *are*
  `profile.loadout[ship]`, so the free Wasp had no bays at all: Outfitting had nothing to fit into, and drive, Hull HP and guns
  all read as empty. A save/reload rebuilt the fit (`cleanLoadouts`), which is why the bug only showed in a live session.
- **`state/profile.js`:** new `addShipRecords(profile, id)` (its own empty hold, full hull fraction, stock fit) and
  `ensureShipRecords(profile, id)` (fills in only what is missing). One definition of a complete ship, used by every route that
  adds or selects a hull, so a bought ship and a replacement can never differ in which records exist.
- **`sim/session.js` `die()`:** the lent Wasp and any fallback hull now go through those helpers before `setShip`. The death text
  is unchanged ("The station lent you a spare Wasp.") — it now simply is a fitted Wasp.
- **`sim/economy.js`:** `buyShip` uses `addShipRecords` (same behaviour, one definition); `selectShip` runs `ensureShipRecords`
  first, so a hull that a very old save left without a fit is repaired when the player picks it, not only on the next reload.
- **Tests:** new `tests/ship-recovery.test.mjs` (the lent ship can be equipped and flies with Hull HP, drive and guns; falling
  back to another owned ship keeps its cargo, fittings and damage; the helpers repair a hull missing its records).
  `tests/fixtures/step8b-combat-lifecycle.json` was re-recorded: every snapshot before the death in that run is identical, and
  the post-death snapshots now show a real ship (power, shields, hull, a gun bay, an empty hold) instead of a bare id.
- **Not changed:** mission state. Cargo and mission items still go with the lost ship, so a mission that owed a lost item still
  fails. The `testing/TESTING-DEATH-AND-MISSIONS.md` guide has a new "After a death" section for this.

---

## 2026-11-13: A mission is accomplished by its hand-in, not by its last step; contract wording and colours

Fixes the Border Signal stuck mission and the contract wording. **Save version unchanged (v19)**;
rebuild needed (`npm run build`, then `npm test`).

- **Why:** after the Border Signal's last in-space line the HUD said the mission was done and to return for the reward. Dying
  then lost the beacon, so the reward could never be collected and the mission stayed in the log forever. Contracts announced
  "Mission complete" before their crates were handed in, and called themselves missions.
- **`sim/missions.js`:** `isMissionComplete` is now `missionObjectivesDone` (the steps are finished; the mission is **not**
  accomplished), and the `mission-completed` event is `mission-objectives-done`. The item requirement is now public as
  `missionHandIn`. New `missionLostHandIn` fails (`lost-item`) a mission whose mission-only hand-in exists nowhere, so an
  impossible mission never waits forever. Guidance after the last step comes from `handInNextText`: it names the cargo and
  station and how much is still owed, and says "Contract complete"/"Mission complete" only when there is nothing to hand in.
  Failure messages are the reason only ("Your ship was destroyed."); the notice adds "Contract failed"/"Mission failed".
- **`player-dead`:** a mission whose objectives are done but whose mission-only item is still owed now fails too, with the
  item named. `failMission` grows an `afterObjectives` option so only this "gone for good" case can fail a finished mission;
  timeouts and sector changes still cannot. `abandonMission` uses the mission's own kind in its message.
- **Data:** contract templates now name the station (`{station}`) and declare `handIn.objective` ("Deliver {count} {item} to
  {station}."); Border Signal declares "Return to Meridian Station with the beacon."; the Ore run test mission declares its
  hand-in. Contract missions remember the station they were taken from (`origin`, already a saved field) so field pockets can
  name it. `templates.js` `mission()` accepts `handIn`.
- **`ui/hud.js`, `styles.css`:** contract mission names are light blue (`--ice`), story mission names stay amber.
- **`ui/missionlog.js`, `ui/screens.js`:** the status reads "Ready to hand in" / "Awaiting cargo" / "Complete" and the button
  says "Hand in cargo" when goods are owed; Abandon is always offered when a mission is not ready. The failure notice and the
  mission-log kind label use the mission's kind.
- **Linter (`data/missions/validate.js`):** an item-bearing mission without `handIn.objective` is an error; so is guidance
  that claims completion and any contract guidance that says "mission". Docs: `MISSION_RULES.md` (rules 9 and 10), `LESSONS.md`
  (L15), `ROADMAP.md` (steps 12 and 13 ticked, log), the guides moved to `testing/passed/`, and a rewritten
  `testing/TESTING-DEATH-AND-MISSIONS.md`. Tests: new death/wording/UI/lint regressions; 465/465 pass.

## 2026-11-13: Dying no longer fails missions by default; "Mission failed" notice in the HUD

Small gameplay change. **Save version unchanged (v19)**; rebuild needed (`npm run build`, then `npm test`).

- **Why:** death already costs the ship and its hold, so it should not also fail a mission unless the mission wants that.
- **`sim/missions.js`:** a mission now fails on death only if its data declares `fails.on: ["player-dead"]`, or the ship was carrying a
  mission-only item (category `mission`) the mission needs (new `missionOnlyItems(mission)`). The second case needs no declaration and
  says "Your ship was destroyed and the X it carried was lost." Every failure now carries a message (a default per reason when
  the rule has none) and the `mission-failed` event carries `title`.
- **`sim/player.js`:** `player-dead` now carries `lost`, the hold at the moment of death, so the result never depends on listener order.
- **Data:** The Border Signal no longer declares a death failure (it still fails if you die carrying the beacon); the Parcel run test
  mission lost its explicit rule (same behaviour, now derived); the Ambush run keeps its explicit one on purpose. Saved Border Signal
  missions pick up the new rule on load (their `fails` is re-read from the data).
- **`ui/missionlog.js`, `styles.css`:** a red "Mission failed: <mission>" notice with the reason sits over the flight HUD and the docked
  screen for 15 s or until clicked. Abandoning shows none.
- **Linter:** no longer requires a death rule for missions that use mission items (the framework handles it).
- **Tests:** new `tests/mission-death.test.mjs`; the die-at-every-step invariant, the lint, 13b and 13c tests updated. Docs:
  `MISSION_RULES.md`, `LESSONS.md` (L10), new guide `testing/TESTING-DEATH-AND-MISSIONS.md`.

## 2026-11-13: Docs consistency pass for multi-AI handoffs, changelog capped at 10 entries

Docs and one docs test only; **no game code changed, save version unchanged (v19)**, no rebuild needed.

- **Changelog rule simplified and enforced:** `CHANGELOG.md` holds **at most 10 full entries**; adding one that makes 11 moves the
  oldest to the archive (verbatim) with an index line. The old "more than 15, then trim to 10" wording is gone from `CHANGELOG.md`,
  `ARCHITECTURE.md`, `HOW_TO_ADD.md`, `AI_PROMPTS.md`, `AGENTS.md` and `HANDOFF.md`. This change moved the oldest entry
  ("Stabilize story mission completion and scripted hand-offs") to the archive.
- **`tests/docs.test.mjs`:** new checks that the changelog has at most 10 full entries, and that its "Older entries" index matches the
  archive's headings exactly (same titles, no duplicates).
- **Step status has one home (`ROADMAP.md`):** the duplicate status lines in `REFACTOR_PLAN.md` steps 12 and 13 and the step list in
  `HANDOFF.md` now point to the ROADMAP table; the ROADMAP "current position" paragraph no longer restates the table.
- **`HANDOFF.md`:** new "Before you end a chat" checklist (changelog, roadmap, handoff, Last checked, folder READMEs, build/test, zip).
- **Stale references removed:** `AI_PROMPTS.md` no longer says a root `CLAUDE.md` exists (only `AGENTS.md` does; the starter prompt
  covers tools that do not read it); a ROADMAP parking-lot line pointing at text that no longer exists in HANDOFF was removed.
- **Step 13 ticked in `ROADMAP.md`** (owner playtested the mission framework, 2026-11-13). Its four playtest guides moved to
  `testing/passed/` and `testing/README.md` was updated. Step 12 stays unticked: its playtest is not recorded.
- **REFACTOR_PLAN slimmed:** the long "Mission-safety enforcement plan" (the eight principles applied to missions) moved word for word to
  `docs/architecture/mission-principles.md`, listed in `ARCHITECTURE.md`; the plan keeps a link.
- **Stale facts removed from `docs/architecture/feature-notes.md`:** a "381/381 tests, 746 KB bundle" results note, a "Current package:
  tallow-reach-latest-build.zip" bullet (no such file is in the project) and playtest-pending sentences that duplicated ROADMAP. The
  original wording is kept in `docs/archive/HANDOFF_2026-11-10.md`. Do not put test counts or bundle sizes in the docs: they go stale.
- **File lists completed:** `src/data/README.md` (`camera.js` and every file in `missions/`), `src/state/README.md` (`controls.js`),
  `src/util/README.md` (`ids.js`), and the `ARCHITECTURE.md` file map (all current `sim/`, `ui/`, `data/` and `state/` files; it now
  says the folder READMEs are the authoritative list).

## 2026-11-13: Docs restructure, LESSONS.md, docs check test, duplicate-mission guard

Docs-only restructure so new AI chats read less and the project stays scalable, plus one small guard. **Save version
unchanged (v19)**; rebuild needed (one source change).

- **`docs/HANDOFF.md` rewritten short** (about 130 lines): start-here steps, a "read these docs for this task" table, current
  state, the owner's ground rules (all kept), a "keeping the game scalable" section, the bug-report procedure and the doc map.
  The old file is kept word for word in `docs/archive/HANDOFF_2026-11-10.md`; its long "Where things stand" section is now
  `docs/architecture/feature-notes.md`.
- **`docs/LESSONS.md` (new):** classes of bug earlier chats hit (repeated accept/abandon multiplying ships, full hold abandoning
  a mission, warp mid-dialogue failing it, items appearing in the hold, and more), each with cause, rule and the test that
  enforces it. Rule for every chat: when the owner reports a bug, add a failing test, fix the class, update LESSONS.
- **`docs/HOW_TO_ADD.md` split:** the 21 recipes are now one file each in `docs/recipes/` (numbers unchanged), with an index.
- **`docs/ARCHITECTURE.md` split:** conventions and known gaps moved word for word into `docs/architecture/` (content-data,
  ship-systems, simulation-and-rendering, ui-and-screens, world-and-map); the main file keeps the layers, universal conventions,
  events, state and saves. "Keeping the docs scalable" rewritten with the new rules (one home per fact, archive never delete).
- **Status in one place:** step status lives only in `docs/ROADMAP.md` (current-position prose rewritten; the old text is in
  `docs/archive/ROADMAP_STATUS_2026-11-10.md`). `docs/REFACTOR_PLAN.md` steps 1 to 11 moved to
  `docs/archive/REFACTOR_PLAN_STEPS_1-11.md`.
- **Playtest guides** moved from the project root to `testing/` (current ones on top, finished steps in `testing/passed/`,
  `TEST-OLD-CODES.txt` beside them) with `testing/README.md`. Older changelog entries name the guides without a folder.
- `README.md`, `AGENTS.md` and `docs/AI_PROMPTS.md` updated: read HANDOFF first and only the docs the task needs; the starter
  prompt, the bug-report wording and the "content is data" rule.
- **`tests/docs.test.mjs` (new):** fails if a doc grows past its size limit, a relative link breaks, an index misses a file,
  HANDOFF's save version differs from `SAVE_VERSION`, a "Last checked" line is missing, or a lesson lacks a rule or enforcement.
- **Source change: `acceptMission` (`sim/missions.js`) refuses to start a story mission that is already active.** Before, only
  the Mission log hid an active offer, so a second start would run the script twice and double every spawn. New tests in
  `tests/mission-invariants.test.mjs`: a story mission cannot be active twice; accepting and abandoning a mission over and over
  never multiplies its ships or crates.
- Changelog rotated per its own rule (more than 15 full entries): the oldest moved word for word to the archive with index lines.

## 2026-11-13: Step 13d: mission rules, linter, templates and invariant tests

Hardens the mission framework so illogical missions are caught when written, not found in play.
No gameplay behaviour changes for Border Signal; **save version unchanged (v19)**; rebuild needed.

- `docs/MISSION_RULES.md` (new): the realism rule, the eight rules and what enforces each, a checklist.
  Linked from `AGENTS.md`, `HANDOFF.md`, `HOW_TO_ADD.md` section 11 and `REFACTOR_PLAN.md` step 13.
- `src/data/missions/validate.js` (new) and `rules.js` (new, `minSpawnDistance` 600): a mission linter run
  over every authored mission by `tests/mission-lint.test.mjs`. Errors on: missing `next`, objective or
  situation; numeric step targets; unreachable steps, dead ends and loops; spawns too close or while
  docked; a collected mission item nothing drops; `take-item` with no source; a wave wait with no wave;
  the `deliver` step (nothing emits "delivered"); failure with no message; a mission-only item with no
  `player-dead` failure rule.
- Step targets now accept `"end"` (`sim/missions.js` `stepIndex`). Border Signal uses it instead of the
  bare `next: 11`, and its last step names `next: "end"`. Numeric targets still work for old saves.
- `src/data/missions/templates.js` (new): `briefing`, `radio`, `travelTo`, `loadCargo`, `handOver`,
  `ambush`, `mineOre`, `sequence`, `mission`. They fill in the situation rules and every `next`.
- `src/data/missions/test-missions.js` (new): Parcel run (cargo), Radio relay (radio only, a choice),
  Ore run (mine N), Ambush run (fail and replay). New item `parcel` in `data/items.js`. They are not
  offered to normal players; open the game with `?testmissions` and they appear under "Test missions" in
  the Mission log (`ui/missionlog.js`). `storyMission(id)` also finds them.
- `sim/missions.js`: a dock-side step that is blocked by a full hold now says "Dock at a station and make
  room in your hold" when the pilot is flying, instead of only "make room".
- `tests/mission-invariants.test.mjs` and `tests/mission-driver.mjs` (new): a scripted pilot plays every
  mission, normally, wandering, reloading at every step, with a full hold, destroyed at every step (then
  replaying), and two missions at once. Checks: never stuck; nothing silently failed or abandoned; items
  move only by real pickup, hand-over or hand-in; dialogue buttons never change the world; spawns are
  at a safe distance; a save and load keeps every authored field; replays start clean.
- `tests/step13b-missions.test.mjs`: the reachability test accepts the `"end"` target.
- `TESTING-13D-MISSION-RULES.md` (new): the owner playtest.
- Known gaps recorded in MISSION_RULES.md: `deliver` is unimplemented, feature-anchored spawns, silent
  timeouts, no escort objective.
- Tests: 437 pass. Needs the owner playtest before step 14.

---

## 2026-11-10: Name the Border Signal object and consume story hand-ins

- Added a dedicated `beacon` catalogue item named **Beacon**. Border Signal's authored defeat drop, collect objective, dialogue wording and objective now refer to that id; ordinary hostile `salv` loot remains unchanged.
- Mission reward hand-in detection now covers item-bearing `collect`, `deliver` and `mine` objectives, including story missions and nested parallel objectives. The exact required quantity is taken from the current station first and then the active ship hold before payout; missing stock leaves the completed mission active and unpaid.
- Existing Border Signal mission records that used `salv` are migrated to `beacon` where they describe the authored persistent drop. Save version remains **19**.
- Verification: `npm test` passes **381/381**, `npm run build` produces a **746 KB** bundle, the ZIP passes `unzip -t`, and the preview serves HTTP 200.

---

## 2026-11-10: Make Border Signal's beacon a persistent physical drop

- The Border Signal's authored Beacon now drops from the first patrol ship at that ship's defeat position instead of being silently granted by a mission script. Ordinary raider salvage loot remains additive, while the authored crate is mission-tagged and visually/physically collectible.
- The mission crate survives leaving Hollow, world clearing and v19 save/load, restores once at its saved position, remains present when the hold is full, and marks itself collected only after a successful non-docked pickup. Abandoning or rewarding the mission removes its saved marker and runtime content.
- Added headless coverage for physical pickup gating, defeat-position placement, full-hold retry, duplicate-free save/load restoration, collected-drop suppression, old-save fallback and cleanup. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Make Border Signal handoffs resource-safe

- A full cargo hold now pauses the beacon handoff with an actionable **Make room in your hold to continue.** instruction. Inventory changes and docking retry pending item scripts, but the beacon remains a Hollow retrieval: unloading at the station cannot complete a remote handoff; return and finish the arrival warp to collect it.
- Multi-action item scripts preflight their combined capacity and resources, so a blocked batch cannot partially transfer an earlier item and duplicate it on retry. Station-gated dialogue also refuses stale calls without a current docked pilot.
- Border Signal no longer auto-fails for leaving Kestrel Hollow or for an undisplayed timeout. Its only automatic failure is the clear, reported cause of ship destruction; explicit player abandonment remains the destructive choice.
- The station briefing now uses spoiler-safe investigation wording and leads to a travel objective. The mission activates its sector and spawns the distant, mission-tagged patrol only after the pilot enters Kestrel Hollow, never because a dialogue button was clicked.
- v19 save sanitization now restores new situation requirements, preserves nested parallel counters, and migrates older Border Signal saves by stable step id without reviving timeout/leave failure. Documented the enforcement plan and known limits for all eight architecture principles in `docs/REFACTOR_PLAN.md`. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Clean up abandoned mission content and gate dialogue

- Mission-spawned hostiles, their hostile shots and their loot now carry the mission identity. Abandoning a mission removes those records and their views without clearing ordinary patrols, derelicts or other place content.
- Authored station-contact dialogue becomes **Redock to continue talking.** when the pilot undocks, with Continue and choice controls blocked until docking again. In-field dialogue remains actionable during flight, including the Border Signal beacon handoff.
- Leaving a mission sector while a dialogue line is open no longer interprets the open panel as mission abandonment. This keeps a pending station conversation resumable after redocking and lets the beacon line survive a return warp before Close is clicked.
- Added regressions for scripted-wave cleanup, dialogue scope, save metadata and the warp-before-Close case. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Remove unexplained mission progress counters

- Removed the ambiguous `Progress 0/2` display from story missions. It was counting the two lines in the current dialogue, not overall mission completion, so dialogue-line counts and non-quantitative story-step bars are no longer shown in the Mission log.
- Quantitative contract missions retain a clearly labelled `Objective progress: 0 of N` count, and hunt progress in the flight HUD now says `0 of N defeated` instead of an unexplained fraction.
- Added UI regression coverage and updated the browser checklist. Save version remains **19**; rebuild the generated HTML and complete-project ZIP after this change.

---

---

## 2026-11-10: Keep mission objectives spoiler-safe

- Separated player-facing `objective` text from compatibility/internal `log` text. The HUD and Mission log now use only the data-defined objective, so a procedural trigger such as `wave-clear` cannot reveal a future encounter.
- The Border Signal now tells the player to **Investigate the signal in Kestrel Hollow** and later **Stay with the signal in Kestrel Hollow**, then uses discovery-oriented wording before the return home. Contract templates use data-defined objective placeholders without changing their known requirements.
- Objective text survives the existing v19 save sanitization, and fallback wording for missions without an authored objective no longer exposes internal triggers or step counts. Focused mission/UI tests pass **21/21**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Show player-facing mission objectives in the flight HUD

- Removed internal `Step X of Y` numbering from the Mission log. Active missions now present a clear player-facing status, progress and **Next** instruction instead of exposing the runner's implementation steps.
- The top-right flight HUD now lists every active mission as its title plus the current `missionNextText()` objective. Updated The Border Signal's data-defined text for the Hollow patrol, signal search, beacon retrieval and return to Meridian Station; mission persistence, dialogue, rewards and scripted beacon transfer remain unchanged.
- Added UI/content regressions for hidden step numbering and objective updates across the story flow. Save version remains **19**. Focused UI/content tests pass **61/61**, full `npm test` passes **371/371**, `npm run build` produces a **736 KB** bundle, and the complete-project ZIP is refreshed. Browser validation remains pending in `TESTING-13C-SCREENS.md`.

---

## 2026-11-10: Stabilize story mission completion and scripted hand-offs

- Fixed completed story missions being treated as failed on a later sector change, timeout or death. The Border Signal now remains active and claimable after the pilot returns from Kestrel Hollow, instead of disappearing and reappearing as a fresh **Start** offer.
- Mission-tagged trigger events are now scoped to their owning mission, and scripted item transfers no longer advance when the ship or station cannot take the full amount. Added regressions for the return-home flow, trigger isolation and a blocked beacon hand-off.
- Save version remains **19**. The mission-focused tests and full suite now pass **371/371**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Add pause exit and split the main menu actions

- The pause overlay now places **Exit to main menu** below **Resume**. It saves the current resume point, unpauses and emits the existing UI event path that restores the title screen and hides flight/dialogue overlays.
- The title screen now shows a disabled **Campaign** button followed by **Open World**. Open World deliberately uses the existing `intro` action, so the current open-world resume/deploy behavior is unchanged.
- Added headless menu and pause-navigation regressions, updated the Step 13c browser checklist, and kept save version **19** unchanged. Full `npm test` passes **368/368**; `npm run build` produces a **735 KB** bundle, and the complete-project ZIP is refreshed alongside it.

---

## 2026-11-10: Advance Border Signal after its mission wave

- Mission-spawned waves now emit the configured `wave-clear` trigger automatically when their last ship is destroyed. The runner also counts a reach objective when a later step begins in a place the pilot already occupies, so The Border Signal can proceed after the two Hollow raiders are defeated instead of waiting forever.
- Added regression coverage in `tests/step13b-missions.test.mjs` for the real mission-wave tag, automatic trigger and already-reached search place. Full `npm test` passes **366/366** and the rebuilt bundle is **735 KB**.

---

## 2026-11-10: Build Step 13c mission screens

- Added `src/ui/missionlog.js` with a data-driven Mission log tab for active missions, current step/progress and next-action guidance, plus a live dialogue panel with portrait slot, speaker, text, line controls and choices.
- Story missions can be started from the Mission log's data-defined story list. Dialogue advances through the shared runner and autosaves; the world keeps running unless a mission dialogue step explicitly sets `pause: true`.
- Added v19 round-trip coverage in `tests/step13c-ui.test.mjs`, the browser guide `TESTING-13C-SCREENS.md`, and rebuilt the generated game bundle. Save version remains **19** because the new presentation fields are optional within the existing mission shape.

---

## 2026-11-10: Require mining ore hand-in before contract payout

- Mining contracts now use the same station/ship hand-in path as delivery and Recover contracts. The mined ore must still be available when the reward is collected, then the exact amount is consumed before payout; missing ore keeps the completed mission unpaid and claimable.
- Added regression coverage for missing ore, mixed station/ship stock, payout and consumption.

---

## 2026-11-10: Restore Destroy contract progress readout

- Destroy contracts now show their live `done/total` progress again in both the in-flight Ship HUD and docked Contracts screen. Recover/item missions keep the concise title and reward presentation; inventory-gated reward collection is unchanged.

---

## 2026-11-10: Start Step 13b story mission runtime

- Extended the data-only mission vocabulary and runner with dialogue lines and choices, script actions (spawn wave/ship, sector state, inventory, sound and warp), trigger/timer/area waits, remembered flags with branches, parallel objectives and configured death/leave/timeout failures.
- Added `src/data/missions/story.js` with the ten-step `The Border Signal` worked example. Story progress, dialogue position, flags, timers and per-place script state survive v19 save/load; the future dialogue panel and mission-log tab remain 13c.
- Added headless reference/reachability/completion/failure coverage in `tests/step13b-missions.test.mjs`. Full `npm test` passes **361/361**; `npm run build` succeeds at **724 KB**.

---

## 2026-11-10: Simplify exact pocket route titles

- Starmap and ship HUD route headings now say `Route to Pocket` for exact pocket destinations instead of `Route to System (Pocket)`. Route rows, system destinations and all travel behavior remain unchanged.
- Updated route-display regression coverage and rebuilt the playable bundle after validation.

---

## 2026-11-10: Require salvage delivery before paying recover contracts

- Recover contracts now count only `salv` items from derelict crates. The Contract screen and flight HUD keep active mission rows concise by showing the mission title rather than an extra progress or crate-requirement line; **Collect reward** appears only when the current station/ship has enough items, otherwise the action remains **Abandon**.
- Claiming the reward requires the requested number in the current station or current ship hold; the items are consumed only when the hand-in succeeds, and an incomplete delivery leaves the mission claimable without paying. Existing saved salvage missions gain the explicit delivery item during v19 sanitization. Added headless coverage for missing stock, mixed station/ship stock, consumption and reward payout; the owner playtest checklist now covers the hand-in rule.

---

## 2026-11-10: Show every active mission in the flight HUD

- The top-right Ship HUD now renders every active mission with its individual progress, instead of only the first mission. Added compact styling for multiple mission rows and a regression in `tests/content.test.mjs`.
- The current mission framework, save format and contract behavior are unchanged. Rebuild with `npm run build`; the owner should refresh the playtest preview and check two or more accepted missions in flight.

---

## 2026-11-10: Start Step 13 mission framework with data-driven contracts

- Built Step 13a: `src/data/missions/` defines the mission vocabulary and contract templates, while `src/sim/missions.js` advances kill, mine, collect, reach, deliver and survive objectives from gameplay events. Mine, hunt and salvage contracts now run through the same one-step mission records, and several missions can be active at once without changing their wording, rewards or spawn behavior.
- Save version is **19**. `profile.missions` and `profile.flags` replace the old single active contract slot; v18 and older active contracts migrate, and the non-enumerable `profile.mission` view keeps old callers/exported character checks compatible. Dialogue/script steps and mission-log/dialogue screens remain for 13b/13c.
- Added `tests/step13-missions.test.mjs` and `TESTING-13-MISSIONS.md`. Full `npm test` passes **352/352**; `npm run build` succeeds with a **713 KB** bundle (the generated HTML is restored after validation).

---

## 2026-11-10: Simplify map markers and current-location labels

- Removed the extra orange start ring around the current galaxy system and current pocket, including station squares; current labels now add a second `(You are here)` line.
- Removed bottom starmap/pocket-map status warnings, including already-there and late travel-denied messages. Route rows in both the ship HUD and starmap now have a faint connecting line between their markers.
- Simplified destination markers to a very dark filled circle with an orange check and one dotted orange ring. Exact pocket route headings now use `Route to System (Pocket)`.
- Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Refine destination marker rings and icon scale

- Destination icons now use a small orange tick, two orange rings and a dotted outer orange ring, matching the supplied reference more closely in route rows and galaxy/system pocket SVG maps.
- Current/start and destination route icons are about 20% smaller; intermediate markers and route behavior are unchanged.
- Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Mark destination completion and remove HUD route scrolling

- Destination markers now include a bright tick inside the concentric amber target in both the HUD/starmap route rows and the galaxy/system pocket maps; the filled amber start marker is unchanged.
- The ship HUD renders the complete route without an inner scroll container or scroll-position restoration. Map route pagination remains unchanged.
- Added coverage for the SVG/CSS tick treatment and the non-scrolling HUD list. Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Add route markers and instant galaxy selection

- Shared HUD and starmap route rows now use a filled amber start marker, small blue intermediate markers and a concentric amber destination marker. The same roles are drawn on route systems and route pockets, preserving the existing solid/dotted route lines.
- Selecting a system with one click in the large galaxy chart is immediate; pocket/gate double-click protection remains in place.
- Added marker and immediate-selection regressions. Full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed browser preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and still needs the next live check.

---

## 2026-11-10: Clarify pocket menus, labels and exact route destinations

- Pocket-map context menus now open immediately to the right of the pointer with **Set destination** as the nearest action; existing legality checks, Warp actions, refusal notices and double-click navigation remain intact. Successful destinations in either map mode no longer add the generic bottom `Destination set. Press J for the next warp.` notice.
- `pocketLabelLayout` keeps pocket names off nearby dots and separates colliding names, drawing a connector when a name moves; the crowded Galedrift Fallowwatch label now sits to the right of its dot instead of reading as Sablewatch's.
- The shared HUD/starmap route rows append the destination pocket in a small parenthetical on the final system row only for `{ pocketId: ... }` destinations; system destinations remain system-only.
- Added menu, notice, label-layout and route-row regressions. Full `npm test` passes **347/347**; `npm run build` succeeds at **703 KB**. The refreshed browser copy is in `/tmp/tallow-reach-preview/game/tallow-reach.html`; owner live-browser confirmation is still pending.

---

## 2026-11-10: Make local route lines solid and pocket menus right-click-only

- Destination overlays on the large galaxy map are solid orange with directional arrows again. On a system pocket map, planned local pocket-to-pocket hops are solid orange; only the cross-system gate exit stubs remain orange dashed, including the incoming stub highlighted in reverse when viewing an intermediate system.
- Left-clicking a pocket or gate exit in a pocket map is now inert. Right-clicking still opens the existing Warp/Set destination menu, and double-clicking gate targets still opens the adjacent system map.
- Added exact Meridian → Galereach → Galedrift overlay coverage and left/right-click menu coverage. Step 11B passes **45/45**; full `npm test` passes **347/347** and `npm run build` succeeds at **701 KB**.

---

## 2026-11-10: Preserve real double-click navigation on starmap dots

- A first click on a galaxy system, gate exit dot or gate pocket no longer immediately replaces the SVG target with a popup. The short single-click delay lets the browser deliver the second click to the same node, so double-clicking Galereach or another adjacent gate now opens that system map; a single click still selects or opens its existing menu.
- Added a regression that sends real click details through both the Galereach system dot and a Meridian gate exit. Full `npm test` passes **346/346**; Step 11B passes **44/44**; `npm run build` succeeds at **701 KB**.

---

## 2026-11-10: Vary station names and clarify routed gate navigation

- Generated trader features and their station pockets now receive deterministic, varied names such as Outpost, Hideout, Trading Hub, Waystation, Exchange and Freeport. Names remain unique across the resolved catalog while authored station names stay intact.
- Double-clicking either a neighbouring-system label or the gate pocket itself now opens that adjacent system's pocket map, including rapid clicks during the zoom transition.
- Active destinations now draw orange dashed route overlays with small directional arrows on galaxy links, local pocket hops and the gate exit that leaves the current system. Added regression coverage for station-name uniqueness, gate-pocket navigation and directed route overlays.
- Full `npm test` passes **345/345**; `npm run build` succeeds at **700 KB**. Save version and route rules remain unchanged; the owner browser playtest is still pending.

---

## 2026-11-10: Refine system-map exits and separate generated station pockets

- System-map gate exit stubs and their remote endpoint dots now use the pocket blue instead of amber. Visited knowledge remains saved, but visited systems no longer receive a light-blue visual treatment. Double-clicking a neighbouring-system gate label while in a system map switches directly to that peer's map.
- Generated friendly traders selected by gate templates are removed from gate pockets and placed in deterministic `${gateId}-station` pockets with an internal hub link. Explicit station feature records, `allowStation: true` or `stationPlacement: "gate"` preserve deliberate future gate co-location. Station pockets render as square map icons.
- Added regression coverage for colors, visited presentation, direct remote-map navigation, square station icons, default station/gate separation, explicit co-location and old docked gate-station save migration. Save version remains **18**; `npm test` now passes **345/345** and `npm run build` succeeds at **698 KB**. Step 12 remains unticked pending the owner visual playtest.

---

## 2026-11-10: Give every dockable station local persistent inventory

- Station storage is now keyed by the stable `${placeId}:${featureId}` identity of the active dockable station. Inventory transfers, purchases, sales, fitting/unequipping, storage capacity, shop ownership/room presentation and station switching all resolve the active station stock; trader stations still use Meridian's `SHOPS` definitions and economy rules.
- `world.stationStores` is saved for every station, while the enumerable `world.store` remains a home-station compatibility alias. Existing v18 saves without `stationStores` migrate their old stock to the saved station where possible. Save version remains **18** so the reserved Step 13 v19 and Step 15 v20 slots stay intact; `tr1`, `tr_s1..tr_s3` and `TR1:` are unchanged.
- Added `tests/station-inventory.test.mjs` for cross-station isolation, shop/capacity/sell behavior, fitting context, export/reload and legacy migration. `npm test` passes **343/343** and `npm run build` succeeds at **696 KB**. Step 12 remains unticked pending owner confirmation.

---

## 2026-11-10: Build Step 12 encounter templates and persistent place memory

- Generated pockets now resolve three data templates with tier-selected `hostile_patrol`, `friendly_trader`, `derelict` and `resource_cache` encounters. They are filled on load; trader stations are dockable and reuse Meridian's existing `SHOPS` stock. Generic AI spawning keeps hunt-contract selection without a raider-only branch.
- Stable asteroid field slots, cleared static loot encounters and one-shot patrol groups use `world.placeMemory` with a 420-second simulation-time default. Pausing does not advance timers; `respawn-place` can force a future event-driven respawn. Save version is **18**, with v17-and-older migration defaults.
- Added `tests/step12-places.test.mjs`, expanded content-reference checks, `TESTING-12-PLACES.md`, and updated architecture/roadmap/handoff documentation. `npm test` **341/341**; `npm run build` succeeded (**694 KB**). Owner playtest is pending; Step 12 is not ticked yet.

---

## 2026-11-08: Wrap destination names and show local route hops

- Owner requested long starmap destination names wrap instead of truncating, and orange route lines
  between pockets on each relevant system map. The route heading and pocket rows can wrap; the panel
  remains non-scrolling and existing route pagination measures the available space. An arrowed orange
  segment represents each consecutive same-system pocket hop in the currently executable route,
  including free-warp and route-only systems. Cross-system hops do not invent internal lines. Overlay
  updates as routes change, disappears if unavailable/cleared, and does not intercept clicks.
- Updated starmap markup, styles, regression tests and playtest guide. Full **334/334**, build
  **686 KB (702,037 bytes)**. Save v17 and one-checked-warp-per-J rules unchanged; browser playtest pending.

---

## 2026-11-08: Remember route destinations across relogs

- Owner reported that destinations were lost on relog and requested an in-chat playtest. Save **v17**
  stores `world.destination` (system id or `{ pocketId }`, null if unset). Setting/clearing a target
  autosaves immediately; slot saves and export codes include it. The route itself is recalculated from
  the restored location, and J still performs exactly one checked warp. Arrival clears and autosaves it.
- `prepareGalaxySave` validates against the saved seed, drops invalid/removed targets and already-reached
  destinations, and migrates v16 and earlier with no destination; existing cargo/progress remain intact.
  Chart framing is still session-only. Added save/restore and actual map/J/arrival regression coverage.
- `npm test` **333/333**, build **685 KB (701,251 bytes)**; live preview provided, owner playtest pending.

---

## 2026-11-08: Remove destination diamond

- Owner requested removing the diamond from the destination system. Both route lists retain the
  amber bold destination styling, arrows and blue current-system styling; an accessible destination
  label remains. No navigation or save changes.
- Updated route markup, styles, tests and checklist. Targeted **44/44**, full **331/331**, build
  **684 KB (700,815 bytes)**. Browser playtest pending.

---

## 2026-11-08: Mark the route destination and simplify the starmap list

- Owner requested the final system stand out, and that starmap route rows show only systems and arrows
  like the flight HUD, without grey gate-to-gate pocket details. Both lists now highlight the destination
  in amber with a diamond; the current system stays blue, even when it is also the destination. The map
  still shows the exact pocket target in the heading, and its paging and highlighted graph remain intact.
  Neither list shows completed systems; unused session-only route-history tracking was removed.
- Updated route presentation, starmap, styles, tests and checklist. Targeted **44/44**, full **331/331**,
  build **685 KB (700,929 bytes)**. No travel or save changes; browser playtest pending.

---

## 2026-11-08: Add route arrows to the flight HUD

- Owner requested the starmap-style arrows beside the flight route's system names. Each remaining
  system now has an amber arrow; the current system name stays blue. The count and starmap are unchanged.
- Updated route markup, HUD style, tests and checklist. Targeted **44/44**, full **331/331**, build
  **686 KB (702,025 bytes)**. No save or travel changes; browser playtest pending.

---

## 2026-11-08: Simplify the flight route to system names

- Owner requested only remaining system names in flight, with the current system highlighted blue,
  no completed ticks, and “Route to … (N systems)” showing how many system entries remain beyond
  the current system. An exact pocket destination remains named in the heading. If routing is blocked,
  no count is guessed; the current system and no-route message remain visible. The detailed starmap,
  including its pocket names and completed-system history, is unchanged.
- Updated the shared route renderer and HUD, tests, and owner checklist. Targeted **44/44**,
  full **331/331**, build **685 KB (701,942 bytes)**; browser playtest pending. No save or travel changes.

---

## 2026-11-08: Set exact pocket destinations

- Pocket and gate-neighbour popups now offer **Set destination** below the Warp button or refusal note,
  including for a pocket that cannot be reached in one hop. The neighbour label selects its reciprocal
  gate pocket. Selecting the current pocket or an unreachable pocket reports why without replacing a route.
- Shared executable breadth-first search now also finds the fewest legal, cost-supported warp hops to
  an exact pocket. `J` still starts one checked hop and replans each time. Pocket destinations stay active
  on entry to their system and clear only when the exact pocket is reached. The route list names that final
  pocket; galaxy-system destinations and their arrival-gate behaviour remain unchanged.
- `src/sim/travel.js`, `src/sim/navigation.js`, `src/ui/starmap.js`, `src/state/state.js`, tests, playtest
  guide and architecture notes updated. Session-only destination remains outside save v16. Targeted tests
  **60/60**, full `npm test` **322/322**, build **677 KB (693,443 bytes)**; browser playtest pending.

---

## 2026-11-08: Clearer, sparser starmap and adaptive route list

- Owner asked for galaxy connections not to pass through unrelated system dots, route stops to use the
  available vertical space before paging, and outer systems to need at least 10 jumps. Owner explicitly
  chose to update existing saves too, safely relocating removed gate-pocket saves within the same system.
- `organic-web-v2` retains seeded system ids, names, positions and core rolls but builds a sparse radial-
  depth tree, default `extraChance: 0` and `depthRadiusFraction: 0.08`. Default seed: 121 systems,
  362 pockets, 361 links, 120 gate links; its outer 80%-radius systems need at least 10 gate crossings
  (11+ across 500 sampled seeds). Custom graph tuning/overrides may change this. The v1 generator is
  retained to identify prior generated gate IDs. `prepareGalaxySave` moves a removed old gate to an
  ordinary pocket in its same system, clears old coordinates and preserves profile/cargo; truly unknown
  pockets still recover home. Recovery notices name the destination; save schema remains v16.
- `src/ui/chart-lines.js` finds chart-only polylines around system dots, with an SVG dot mask for extreme
  overlaps. Highlighted routes use exactly the same paths; connections and travel rules remain data-driven.
  The right route list measures available space and shows all stops that fit; arrow pages only appear if
  needed, including after resize. The overview panel does not scroll.
- Added seeded distance/geometry and legacy-save recovery tests; updated map/playtest docs and removed
  tests' assumptions about old neighbours. Targeted 63/63, full `npm test` **325/325**; build **681 KB
  (696,881 bytes)**. No visual browser verification; owner playtest remains pending. No new dependencies.

---

## 2026-11-08: Straight starmap lines with attached endpoints

- Owner asked for straight lines without unrelated-dot intersections, and asked about light-blue systems.
  Light blue denotes a system marked visited in saved discovery knowledge; orange is the current system.
- Replaced bent lines and the blanket endpoint mask with a cached, chart-only layout that nudges unrelated
  dots away from straight gate segments. Paths and highlighted routes use the same single straight segment;
  connected endpoint dots are never globally masked. In unusually crowded or extreme-zoom layouts, an
  individual line masks only its unrelated obstructing dots. Chart positions never mutate simulation
  geography, graph, saves or authored positions; the layout is recalculated on graph/position changes,
  not when gates are merely closed or reopened. The pocket view and zoom centering use the same chart
  projection. All system identities and connections remain unchanged.
- `src/ui/chart-lines.js`, `src/ui/starmap.js`, starmap regression tests and documentation updated.
  Targeted **64/64**, `npm test` **326/326**, build **681 KB (697,419 bytes)**. No dependencies or save
  version changes; browser playtest remains pending.

---

## 2026-11-08: Show the active route in flight

- Owner requested the route destinations beneath the left boost bar. The flight HUD now shows the
  same remaining system stops and exact-pocket destination as the starmap, plus the J hint or no-route
  status. Long lists scroll independently; mouse wheel and clicks on the list do not control the ship.
  It hides when cleared or reached, updates immediately on place/destination changes and rechecks
  travel conditions twice a second. Route display does not change travel, progress or save data.
- Added shared `src/ui/route-display.js`, HUD markup/styles and `tests/hud-route.test.mjs`.
  Targeted **41/41**, full **328/328**, build **683 KB (699,351 bytes)**. Browser playtest pending.

---

## 2026-11-08: Group route pockets by system and mark the current area

- Owner clarified that routes should retain one row per system, with all internal pocket hops in
  order within that row. Both the flight HUD and starmap now show the current pocket marked “here”
  in its system row and also keep a current-area label visible above the list, including when paged
  or no route is available. Entering another system starts a new row; a later revisit starts another.
- The starmap measures wrapped system rows to paginate without hiding long pocket lists. The flight
  route keeps its current-area label visible while the system rows scroll. No travel rules or saves changed.
- Updated shared route presentation, HUD/starmap styles, regression tests and the owner checklist.
  Targeted **42/42**, full **329/329**, build **684 KB (700,547 bytes)**. Browser playtest pending.

---

## 2026-11-08: Compact flight route with journey progress

- Owner chose the compact system-list idea: in flight, show one row per system and its remaining
  departures, with pocket names only in the current system. The current pocket is marked “here”.
  Actually crossed systems are retained and checked off, including manual detours/revisits; the rest
  replans from the current pocket. Counts mean warp jumps departing that system (including its gate
  crossing), so a system destination may show zero. The current row scrolls into view on a hop.
- The starmap retains full pocket details and also shows checked-off systems. Journey history is
  session-only, reset when a destination is replaced, cleared, reached or a save is loaded. The
  navigation rules, one-hop J and saved data are unchanged; a blocked route shows its current area
  and no-route message until it becomes available again.
- Updated HUD, shared route display, transient state, starmap and regression tests. Targeted **43/43**,
  full **330/330**, build **686 KB (702,040 bytes)**. Browser playtest pending.

---

## 2026-11-08: Step 11B starmap UI follow-up — zoomed system maps, right-click warp, compact overview (owner playtest pending)

Owner reviewed the first 11B build ("the map looks ok") and asked for four chart changes. This is a
follow-up inside 11B, not a new numbered step; step 11 remains unticked until `TESTING-STARMAP.md` passes.

- Zooming into a selected system dot (wheel/+ past `map.systemEntryZoom`, or double-click) now opens a
  **system pocket map** with a short galaxy↔system viewBox transition. `sim/galaxy.js` gains
  `systemPocketLayout`: a deterministic, derived 2D layout (ordinary hub centred, other ordinary pockets
  ringed, gate pockets placed outward toward their peer system). Author `mapPos` overrides are validated
  and win; layout is never saved. `ui/starmap.js` draws internal pocket lines and dashed gate exit stubs
  labelled with the neighbouring system, respecting enabled links and the visibility policy.
- **Right-click a pocket** (or Enter/Space/Shift+F10 on a focused pocket dot) opens a small popup with a
  clickable **Warp to …** only when `travelQuote` says the direct hop is legal. It emits the same
  `action { name: "travel", to }`; `main.js`/`startWarp` still recheck link/cost/requirements and run the
  unchanged warp animation. Illegal/current pockets show a reason and no warp button. Esc closes the
  popup before the chart; the root handler stops propagation so the global contextmenu/fire gates stay intact.
- The right panel is now a compact overview: system name, **Current pocket**, and plain pocket-name rows.
  Removed the per-pocket tier/description/gate-peer/status cards and all panel warp buttons; no scrolling.
- Tuning lives in `src/data/galaxy.js` (`map.systemEntryZoom`, `map.transitionMs`, `map.context`,
  `systemMap` radii/padding/exit length/zoom). Updated `src/styles.css`, folder READMEs, HANDOFF/ROADMAP/
  VISION/REFACTOR_PLAN/ARCHITECTURE/TARGET_ARCHITECTURE/HOW_TO_ADD and root `TESTING-STARMAP.md` sections 2–3.
- Tests: updated the old map-UI assertion that expected panel warp buttons, and added layout/exit/visibility,
  transition, zoom-entry/exit and illegal-popup coverage. `tests/step11b-starmap.test.mjs` is now 25 tests.
- **Results:** `npm test` **304/304 pass** (both 8b oracles unchanged); `npm run build` succeeded
  (662 KB, 677,847 bytes). **Save v16 unchanged** — pocket layout is derived, not persisted; no migration,
  storage-key or `TR1:` change. No new dependencies. Automated headless DOM checks passed; owner visual
  browser playtest pending. Rebuild with `npm run build`; test with `npm test`.

## 2026-11-08: Plot system destinations and jump the route with J

- Right-click a visible galaxy system for **Set destination** and, only when the current pocket has an
  executable direct gate to that system, **Warp to**. Keyboard context-menu keys work too. A highlighted
  galaxy path and arrowed remaining system stops (including the destination arrival gate) appear below
  the pocket rows. Long routes use paging so the panel need not scroll; Clear removes the destination.
- `findRouteToSystem` does a breadth-first search over executable pocket hops, ending at whichever pocket
  reaches the target system in the fewest warps. It respects free/local link policy, enabled links,
  registered warp mode, requirements and unsupported costs. `J` in flight calls `jumpRoute`, recalculates
  the route and calls `startWarp` for **one** hop; local gate and crossing are separate presses. Warp
  animation and rechecks remain unchanged. No destination/route gives HUD feedback; arrival clears the
  destination. Unreachable destinations do not replace an existing one. No auto-chaining.
- Destination is session-only and resets on save replacement; save v16 and dependencies are unchanged.
  Changed `src/sim/travel.js`, new `src/sim/navigation.js`, map/input/main/state/styles/help, tests and
  root `TESTING-STARMAP.md`. `npm test` **320/320** and build **676 KB (692,538 bytes)**; browser
  playtest remains pending, and step 11 is still unticked.

---

## 2026-11-08: Remember starmap view across closing and travel

- Owner confirmed the cannon visual follow-up works. Map M-close/reopen now restores the last galaxy or
  system view, selection, zoom/pan and label setting; popup/notice/transition/drag do not persist.
  A local cross-system `place-changed` makes a remembered pocket view follow the destination system and
  resets its pocket framing, while galaxy mode remains galaxy mode. Local same-system hops preserve
  framing; other pilots do not alter local memory. Reopen also checks current location as a fallback.
  Hidden systems are not exposed. Save replacement resets memory; it is session-only, not in save v16.
- Changed `src/ui/starmap.js`, `src/state/state.js`, `tests/step11b-starmap.test.mjs`, root playtest
  guide and architecture/handoff notes. Headless tests cover both views, real local and gate warps,
  stale menus, cross-player isolation, fallback and save reset. `npm test` **316/316**, build **670 KB
  (686,176 bytes)**. Browser playtest pending; step 11 remains unticked.

---

## 2026-11-08: Align newly fired cannon visuals with the interpolated hull

- Owner reported cannon output visually offset when thrusting and turning. The local hull renders
  between ticks, while a new bullet was first rendered from the already-advanced simulation muzzle.
  The view now initializes its first previous pose at the corresponding previous hull-local muzzle,
  then interpolates to the real projectile position. Subsequent ticks use normal projectile interpolation;
  teleports and enemy shots are excluded. This is presentation only: ship velocity inheritance, firing,
  damage, collision and saves are unchanged. Inherited velocity can still cause drift after firing.
- Added moving/stationary, left/right, first/subsequent tick, teleport and enemy-shot headless checks in
  `tests/render-interp.test.mjs` and a browser check in root `TESTING-STARMAP.md`. `npm test` **314/314**;
  `npm run build` **669 KB (685,250 bytes)**. Visual browser verification remains pending.

---

## 2026-11-08: Tame galaxy chart drag speed

- Owner reported that tiny drags moved the map far too much at every zoom. Removed the old
  viewport-dependent inverse-square amplification: `galaxyPanDelta` now converts pointer movement
  to viewBox units once. `map.panSpeed` sets the maximum screen travel per pointer pixel (default 1);
  the multiplier rises smoothly from 0.5 at maximum zoom to 1 at minimum zoom. Thus zooming out still
  pans farther, but no default drag moves the chart farther on screen than the pointer. System-map
  panning, travel, saves and dependencies are unchanged.
- Updated the starmap regression test to check screen-space travel across zooms and different viewport
  shapes, and updated `TESTING-STARMAP.md` and current architecture/handoff notes. `npm test`: 312/312;
  `npm run build`: 669 KB (684,972 bytes). Owner visual playtest remains pending.

---

## 2026-11-08: Step 11B starmap refinements — permanent core labels, zoom-scaled pan/cores, clickable gate neighbours (owner playtest pending)

Owner requested six small chart changes after the free-local-warp/central-body delivery. This remains
inside step 11; the owner has not yet passed the updated root `TESTING-STARMAP.md`.

- **Tooltips/popups:** removed native `<title>` hover tooltips from pocket nodes and central bodies;
  galaxy system dots keep their title for hidden-label inspection. The blue/orange click popups remain.
- **Permanent core labels:** every star/black hole shows its proper name below the graphic with
  `(Star)` / `(Black hole)` on a second row; hover/focus still highlights the ring/glow but no longer
  gates the label. The core remains a non-warpable `role="img"` chart object.
- **Galaxy pan:** `map.panSpeed` anchors the previous max-zoom drag feel. `galaxyPanSpeed` /
  `galaxyPanDelta` make on-screen pan distance grow as `maxZoom / zoom` when zooming out, while
  system-map panning stays unchanged.
- **Gate-label clarity:** `pocketLabelPosition` puts gate pocket names inward, away from the orange
  exit stub and peer-system label; ordinary pockets keep outward radial labels. Peer labels sit beyond
  the stub cap with a tunable gap.
- **Zoom-scaled cores:** `systemMap.coreRadius` / `blackHoleRadius` are now map units, so the central
  graphic grows with system zoom. Pocket dots and label text remain screen-sized; label offset/line-height
  and gaps are tunable (`coreLabelOffset`, `coreLabelLineHeight`, `labelGap`).
- **Clickable gate neighbours:** exit stubs are focusable buttons. Clicking/right-clicking/keyboard-
  activating a neighbouring-system label opens the same popup and quotes `travelQuote` to the reciprocal
  gate pocket (`exitChoice`), never the remote system/core. Unreachable hops show **No direct route**;
  legal hops emit the unchanged named travel action so `main.js` / `startWarp` requote before warping.
- **Files:** `src/ui/starmap.js`, `src/styles.css`, `src/data/galaxy.js`, `src/sim/galaxy.js` validation,
  `tests/step11a-galaxy.test.mjs`, `tests/step11b-starmap.test.mjs`, root `TESTING-STARMAP.md`, README,
  HANDOFF/ROADMAP/VISION/REFACTOR_PLAN/ARCHITECTURE/TARGET_ARCHITECTURE/HOW_TO_ADD and data/UI READMEs.
- **Results:** `npm test` **312/312 pass** (11A 23, 11B 29; both 8b oracles unchanged); `npm run build`
  succeeded (**669 KB, 685,046 bytes**). **Save v16 unchanged:** no layout/pan/core presentation state enters
  saves; default geography remains **121 / 462 / 511** with 116 stars and 5 black holes. No new dependencies.
  Automated headless checks passed; owner visual browser playtest remains pending. Rebuild with
  `npm run build`; test with `npm test`.

---

## 2026-11-08: Step 11B system-map follow-up — free local warp and named central bodies (owner playtest pending)

Owner requested three changes after the zoom/right-click UI delivery. This remains inside step 11;
the owner has not yet passed the updated root `TESTING-STARMAP.md`.

- **Free open-world local travel:** `sim/travel.js` allows warp to any pocket in the same system by
  default, including a gate, without an internal link. `travelOptions`, `findRoute` and galaxy validation
  understand the policy. A system can opt into `intraSystem: "links"` (data override/future temporary
  instance) to require connected internal routes again. Cross-system travel still needs the exact enabled
  gate link and its mode/requirements. `startWarp` still requotes before the unchanged warp sequence.
- **System-chart clarity:** `ui/starmap.js` omits internal blue lines only in free-warp system maps;
  route-only systems still draw enabled internal links. The main galaxy's gate web is unchanged. Gate
  stubs still point to and name their exact peer system. The compact name-only right panel is untouched.
- **Central bodies:** `sim/galaxy.js` assigns a visual-only star/black hole per system using an independent
  FNV-1a + seeded roll (`systemMap.blackHoleChance: 0.05`). Author `core: { kind, n }` overrides win; names
  default to the system's proper name (Meridian System → Meridian). Pockets now orbit the empty centre:
  ordinary radius 140, gate radius 280, with authored `mapPos` still winning. The SVG core has distinct
  star/black-hole styling and a hover/focus name, but no pocket id, warp action or route endpoint.
- **Data/validation:** `data/galaxy.js` documents the policy/core recipes and adds core chance/radii/label
  tuning. Invalid policies, core kinds and tuning fail plainly. Core assignment consumes neither the
  generator nor gameplay RNG stream. Default ids, system positions, pockets and links are unchanged:
  **121 / 462 / 511**, with 116 stars and 5 black holes on the default seed.
- **Tests/docs:** re-scoped old local-link refusal/layout assertions to the explicit links opt-out rather
  than deleting them; added free-hop/gate isolation, policy connectivity, core chance/name/override,
  non-warpable markup/focus styling and unchanged galaxy-route coverage. `step11a-galaxy.test.mjs` now
  has 23 tests and `step11b-starmap.test.mjs` 27. Updated the root playtest guide, HANDOFF/ROADMAP/VISION/
  REFACTOR_PLAN/ARCHITECTURE/TARGET_ARCHITECTURE/HOW_TO_ADD and data/sim/UI READMEs.
- **Results:** `npm test` **310/310 pass**; `npm run build` succeeded (**666 KB, 682,414 bytes**).
  **Save v16 unchanged:** no generated geography, policies, cores or layout enter saves; old saves/codes
  and both 8b oracles still pass. No new dependencies. Automated headless checks passed; owner visual
  browser playtest remains pending. Rebuild with `npm run build`; test with `npm test`.

---

---

## 2026-11-08: Step 11B — clickable starmap, direct-hop travel and save v16 (owner playtest pending)

Owner-approved second slice of step 11. **M now opens the starmap** instead of warping immediately;
step 11 remains unticked until the owner passes `TESTING-STARMAP.md`.

- Added `src/ui/starmap.js` (visible system web, gate lines, current/visited/selected markers, inspect
  dropdown, zoom/pan/labels, selected system's full pocket list and travel quotes) and
  `src/sim/galaxy-session.js` (seed resolution, live place catalog installation, compact-save
  preparation and removed-pocket recovery). `src/data/places.js` lookups now read the live catalog;
  `src/main.js`, `src/core/input.js`, `src/ui/menu.js`, HUD/intro text and styles wire the chart.
- Travel buttons emit `action { name: "travel", to }`; `sim/sectors.js` requotes the direct link,
  costs and requirements before running the unchanged warp sequence. Refusals emit `travel-denied`
  and remain visible in the chart. Single-player chart pauses via `isSimulationPaused()` and releases
  flight input/free cam/dock-lock-weapon hotkeys/audio; `state.multiplayer` keeps a future hosted world running.
- **Save v16:** `world.galaxy` stores only `{ seed, knowledge }`, not generated geography. Boot, slots
  and import prepare the saved seed before validation; v15 and older migrate. A removed/unknown pocket
  returns the pilot to Meridian Station docked with the whole character/cargo intact and a recovery
  notice. Failed preparation restores the previous catalog. Storage keys and `TR1:` are unchanged.
- Added `tests/step11b-starmap.test.mjs` (21 tests) and `tests/saves/v15-pre11b.json` (pre-11B
  regression fixture, not a new owner export). Updated intentional v16/pause expectations in the
  existing save/resume/shop tests; legacy `nextPocket` tests remain as helper oracles. Added old-code
  section C to `TEST-OLD-CODES.txt`, root `TESTING-STARMAP.md`, and updated HANDOFF/ROADMAP/VISION/
  REFACTOR_PLAN/TARGET_ARCHITECTURE/ARCHITECTURE/HOW_TO_ADD and folder READMEs.
- **Results:** `npm test` **300/300 pass** (both 8b oracles unchanged); `npm run build` succeeded
  (650 KB, 665,730 bytes). Automated headless DOM/menu/input/audio checks passed; owner visual browser
  playtest pending. No new dependencies. Rebuild with `npm run build`; test with `npm test`.

---

## 2026-11-08: Step 11A owner playtest passed — full project backup

- The owner reported the `TESTING-11A.md` playtest passed; no bugs were reported. Recorded the pass
  in the guide, HANDOFF, ROADMAP and REFACTOR_PLAN. **Step 11 remains unticked:** only slice 11A is
  confirmed; 11B has not started. No source, gameplay or save-format change; saves remain v15.
- Delivered `tallow-reach-step11a-passed-backup.zip` outside the project folder: full source, tests,
  docs, package files, reference and the built HTML, excluding installed dependencies and Git internals.
  Browser-local saves are not in a project ZIP; use Saves -> Export for a separate `TR1:` progress backup.
- Latest recorded verification before this docs/backup change: build succeeded (625 KB), **279/279
  tests passed**. Moved the six oldest full entries below to the archive verbatim, leaving ten.

---

## 2026-11-08: Step 11A owner playtest guide and live browser preview

- Added `TESTING-11A.md` (project root, beside the other playtest guides): a numbered regression
  checklist for the 11A build. 11A is invisible by design, so the guide checks that nothing changed —
  M still warps directly (no map screen), Kestrel Hollow stays empty and is not a gate, saves stay v15,
  old codes A/B still import — plus flight, mining, combat, station business and console-error checks.
- Started the existing `node serve.mjs` preview server (port 8080) so the owner can play the built game
  in the browser. No source or gameplay change; `serve.mjs` is unchanged.
- Re-ran `npm ci` (sandbox had lost `node_modules`), `npm run build` (625 KB) and `npm test`:
  **279/279 pass**. Awaiting owner playtest results before starting step 11B.

---

## 2026-11-08: Step 11A — organic starmap web, one-peer gates and editable travel rules

Owner-approved first slice of step 11. The map is an organic 2D web, not a square grid; construction
must stay modular so moving a system, deleting a pocket, promoting a pocket to a gate, adding a route
or replacing the generator does not require rewriting map/UI/warp code.

- Added `src/data/galaxy.js` (seed, 121-system target, degree cap, organic layout, visibility policy,
  advisory distance tiers, empty travel cost/requirements, `GALAXY_OVERRIDES`, name parts),
  `src/sim/galaxy.js` (replaceable generator registry, resolved system/pocket/link records, author
  patches/tombstones, validation, visibility policies) and `src/sim/travel.js` (pure direct-hop
  quotes/options/route search with registered modes/requirements). `src/data/places.js` gains explicit
  `PLACE_LINKS` for the authored Meridian Station <-> Kestrel Hollow route.
- Each generated system has one ordinary empty pocket and one empty gate pocket per neighbouring
  system; every gate pocket has exactly one external gate peer. Meridian keeps `reach`/`hollow`
  unchanged and gains separate new gate pockets. Kestrel Hollow is not a gate.
- Added `tests/step11a-galaxy.test.mjs` (19 tests): determinism, independent RNG, organic scatter,
  dead ends/junctions, reachability, one-peer gates, move/delete/promote overrides, generator
  replacement, configurable visibility, tier guidance, tuning changes and free/closed travel.
- **No live gameplay or save change:** M still cycles the current system's pockets, save stays **v15**,
  and the new modules are not imported by `main.js`. Step 11B will wire the M starmap/pocket chooser and
  save v16. Updated VISION decisions, ROADMAP, REFACTOR_PLAN, TARGET_ARCHITECTURE, ARCHITECTURE,
  HOW_TO_ADD recipe 20 and the data/sim folder READMEs.
- **Results:** `npm ci` succeeded; `npm test` **279/279 pass** (260 baseline + 19 new; both 8b oracles
  unchanged); `npm run build` succeeded.

---

## 2026-11-08: Autosave every 30 seconds instead of 15

Owner request: halve how often the game writes a save, to keep write volume down.

- `AUTOSAVE_SECONDS` in `src/data/simulation.js` is now **30** (was 15). It is the only tuning number
  involved; `main.js` already reads it.
- Nothing else changes. Saving on tab hide/close, on dock, on warp arrival and on every menu click is
  untouched, so a normal quit still loses nothing — the interval only bounds what a **crash or
  force-quit** can lose, which is now up to 30 seconds of flying instead of 15.
- `docs/HANDOFF.md` and `TESTING-PLACES.md` step 4.8 updated to say 30 seconds. The dated v15 entries
  below still say 15 s because that was true when they were written.
- **Results:** `npm test` **260/260 pass**; `npm run build` succeeded.

---

---

## 2026-11-08: Come back where you logged out — save v15

Owner request: quitting while flying in the Meridian Station pocket docked you on the way back in.
`resumeFromSave` asked only "does this pocket have a station?", so any flight inside `reach` came back
docked. The owner chose **exact spot, with the arrival point kept as the fallback**, reasoning that
pockets may grow large and being sent back to the entry point every time would be tedious.

- **Save v15** adds `world.resume`: `null` while docked, otherwise `{ pos, quat, sh, en }` — the exact
  spot and heading plus shield and boost levels. `sanitizeWorld` rejects anything non-finite, the
  wrong shape, or beyond `PLACE_EXTENT` (`data/places.js`), and normalises a non-unit heading, so a
  damaged or hand-edited code can never place the ship somewhere impossible.
- `resumeFromSave` (`sim/session.js`) returns the pilot to that spot **stationary**, with shields and
  boost **as they left them** (the default taken where the owner did not choose — quitting is not a
  free repair). Fallbacks: no resume point (v14 and older) keeps the old dock-or-arrival behaviour; a
  rejected position falls back the same way; and a ship with no thrusters that would be stranded
  outside docking range is put back at the station instead.
- `captureResume()` in `state/state.js` is called by `currentSave()`, so **every** save path — autosave,
  slot and export code — records the live position rather than a stale one.
- The game now also saves when the tab is hidden or closed (`pagehide`, `visibilitychange`) and every
  `AUTOSAVE_SECONDS` (15, in `data/simulation.js`). Previously it only saved on dock, warp arrival and
  menu clicks, so "where you logged out" would not have held.
- New `tests/resume-spot.test.mjs` (13 tests): the reported bug, shield/boost persistence and clamping,
  docking clearing the spot, v14 fallback, eight kinds of damaged resume data, the no-thruster guard,
  export round-trip, live capture, and the resume point staying out of the portable profile.
- **Results:** `npm test` **260/260 pass** (both 8b oracles unchanged); `npm run build` succeeded.
  Docs, VISION decision log and folder READMEs updated; `TESTING-PLACES.md` section 4 rewritten.

---

## 2026-11-08: Step 10 complete and ticked — owner playtest passed

- The owner played `TESTING-PLACES.md`, found the three bugs listed in the entry below, and confirmed
  all three fixed ("Works"). **Step 10 is ticked** in `docs/ROADMAP.md`, `docs/REFACTOR_PLAN.md`,
  `docs/TARGET_ARCHITECTURE.md` and `docs/HANDOFF.md`.
- No code or save changes in this entry: save version stays **14**, `npm test` **247/247**,
  `npm run build` succeeded. Published as a GitHub release with `tallow-reach-step10.zip` attached
  (built HTML plus source, docs and the playtest guides) so it can be downloaded without building.
- Next: **step 11** — system map, pocket chooser and the 100+ system starmap (save v15). Ask VISION
  open questions 1 to 3 (travel rules, fog, difficulty) and what goes in Kestrel Hollow first.

---

## 2026-11-08: Step 10 playtest fixes — sound, start screen and loading a save

Three bugs the owner found playing step 10. All three were caused by step 10's resume-on-load work.

- **Load/Import/Reset did nothing visible (bug 3).** `afterSaveChange()` in `src/ui/menu.js` called
  `resetPlaces()` but the import was never added, so it threw a `ReferenceError` *after* `applySave`
  had already replaced the profile. The click handler aborted before its redraw, so the panel kept
  the old numbers; the next **Save** then wrote the already-loaded profile and redrew — exactly the
  owner's "load does nothing, then Save makes it appear" symptom. Fixed the import, split read/validate
  failure from post-load work in `ld`/`im` (a good code is no longer reported as invalid), and made
  both actions redraw. The click handler now only draws the panel when the pilot is docked, so
  loading an away save no longer leaves the station menu open over the flight HUD.
- **Docking showed the start screen (bug 2).** An away save hid the start panel but left
  `state.ui.intro = true`, so the next `render()` (on docking) drew the intro again. The start screen
  now owns the panel until it is dismissed: `docked`/`launched` handlers ignore events while
  `ui.intro` is set, and the button — renamed **"Enter the hangar" → "Enter game"** — clears the flag
  and calls `resumeFromSave()`, deploying the pilot where the save put them (docked at a station, or
  flying at that pocket's arrival point). Nothing simulates behind the start screen, and flight keys
  are inert until it is dismissed (`src/main.js`, `src/ui/hud.js`, `src/ui/screens.js`).
- **No sound after resuming out in space (bug 1).** `initAudio()` was only ever called by the start
  button, which an away save skipped, so the audio context never existed; the Esc sound switch had
  no master gain to change and could not fix it. `src/main.js` now starts/resumes audio on the first
  `pointerdown` or `keydown`; `initAudio()` also swallows a rejected `ctx.resume()`.
- New `tests/step10-fixes.test.mjs` (8 tests) drives the real `ui/menu.js` against a small DOM
  stand-in: load restores credits and redraws in the same click, an away slot resumes flying, import
  applies a good code and rejects a bad one without changing the game, reset works, docking never
  shows the start screen again, and sound starts on a gesture.
- **Results:** `npm test` **247/247 pass** (both 8b oracles unchanged); `npm run build` succeeded.
  Save version stays **14** — no save-shape change. `TESTING-PLACES.md` updated for the new button
  and start-screen flow. Six older entries moved verbatim to `docs/CHANGELOG_ARCHIVE.md`.



---

## 2026-11-08: Step 10 built — place definitions (systems and pockets), save v14

- Implemented the owner-approved systems/pockets model. `src/data/terms.js` holds the generic
  player-facing nouns (`mapNode: "system"`, `flyable: "pocket"`); `src/data/places.js` holds
  **Meridian System** and its pockets **Meridian Station** (`reach`, station + belt) and
  **Kestrel Hollow** (`hollow`, empty). Meridian is a station feature inside `reach`, not a child
  place. `PLACE_DEFS` carries the station, asteroid field, raider spawner and planet numbers that
  used to be hard-coded; `sim/places.js` is the generic loader and entities live in per-place
  containers (`state.places`, `placeWorld(id)`).
- Each pilot owns `place` and `warp`; `sim/step.js` runs shared systems once per occupied pocket.
  M cycles every pocket of the current system (a third data-only pocket is tested). One pilot
  warping does not move another pilot or clear a fight another active pilot is still having.
- Save **v14**: `world.place` replaces `world.sector`; v13 `sector` ids migrate where valid, older
  saves default to `reach`. Storage keys and `TR1:` codes unchanged. Loading a station save opens
  docked; loading an away save resumes flying at that pocket's arrival point with a launch-style
  refresh. Successful local warp arrival autosaves. In-game station label renamed
  **Meridian Outpost → Meridian Station**.
- Files: `src/data/{terms,places,sectors,shops,station}.js`, `src/sim/{places,world,asteroids,sectors,session,step,player,ai,enemy,combat,missile,effects,weapons,targeting}.js`, `src/state/{state,profile}.js`,
  `src/render/{scene,views,camera}.js`, `src/ui/{hud,screens,menu,warpflash}.js`, `src/main.js`,
  `src/index.html`, `src/util/events.js`; docs and folder READMEs aligned; new
  `tests/step10-places.test.mjs`, `tests/step10-save.test.mjs`, `tests/saves/v13-real.json`,
  `TESTING-PLACES.md` (rewritten as a numbered step-by-step) and `TEST-OLD-CODES.txt` (two real
  old-format `TR1:` codes — v12 flat and v13 split — so the old-save/old-code checks are playable
  without an old build; both verified to decode to v14 with the expected docked/flying resume).
- **Results:** `npm test` **239/239 pass** (both 8b single-player oracles unchanged);
  `npm run build` succeeded (`game/tallow-reach.html`, 623 KB). Slice checks: 10a 226/226,
  10b 226/226, 10c 239/239. **Owner playtest pending** (`TESTING-PLACES.md`). Next: step 11
  system map / pocket chooser.



---

## 2026-11-08: Fix high-refresh (240 Hz) ship blur via between-tick render interpolation

- **Root cause:** the pre-built `game/tallow-reach.html` in the merged 8c branch (`74a9ab5`) had
  never been rebuilt after step 7b, so opening it directly ran the old variable-`dt` loop at 240 Hz.
  Rebuilding `game/tallow-reach.html` in step 9 activated step 8a's 60 Hz `simClock`, where the
  ship mesh updated once every 4 frames (60 Hz) while `chaseView` eased the camera every frame
  (240 Hz), causing a ~2.4 px 60 Hz sawtooth jitter/blur on the ship model during side-to-side motion.
- **Fix:** `createSimClock` (`src/sim/step.js`) now exposes `alpha()` (`remainder / SIM_DT`) and
  optional `beforeStep`/`afterStep` hooks. `src/render/views.js` snapshots previous-tick poses in a
  `WeakMap` (keeping simulation records untouched) and interpolates entity meshes, the player hull,
  the mining beam origin, HUD markers (`src/ui/hud.js`) and `chaseView` (`src/render/camera.js`)
  across fractional frames, snapping immediately on teleports (`P.snap`). Also refreshed
  `renderer.setPixelRatio` on window resize (`src/main.js`).
- Added `tests/render-interp.test.mjs`; all **226 tests** pass (both 8b single-player oracles
  unchanged), and `game/tallow-reach.html` was rebuilt via `npm run build`. Save version remains **13**.
- **Owner playtest passed:** confirmed both the ship hull blur and the close-range locked-target
  name-tag blur (asteroids and raiders) are completely gone during combat and warping.



---

## 2026-11-08: Step 9 complete and ticked — Milestone B reached

- The owner reported the step 9 playtest passed. Ticked step 9 across `docs/ROADMAP.md`,
  `docs/REFACTOR_PLAN.md`, `docs/TARGET_ARCHITECTURE.md` and `docs/HANDOFF.md`; **Milestone B**
  (simulation-pure, fixed-step, player-aware, split-save core) is now complete.
- No gameplay or save changes in this entry (save version remains **13**, 225 tests green). Next is
  **Milestone C — step 10** (sector definitions and saving `world.sector`, save v14).



---

## 2026-11-08: Step 8 ticked; step 9 split saves (v13) and per-pilot rules — playtest pending

- Closed step 8 overall after the owner validated smooth 240 Hz play without tick interpolation
  (parking the two minor aim/respawn caveats in `docs/ROADMAP.md`), and aligned the local-only
  ownership table in `docs/TARGET_ARCHITECTURE.md` across steps 9, 10 and 16.
- Bumped `SAVE_VERSION` to **13** (`src/state/profile.js`, `src/state/storage.js`,
  `src/state/state.js`): saves split into `{ v: 13, profile, world }` (`state.profile` +
  `state.worldState`) with automatic migration from v1..v12 saves and `TR1:` codes, `sanitizeWorld`
  walking `BASE_MODULES` directly, and pure `portableProfile` / `mergeProfile` co-op helpers.
  Storage keys (`tr1`, `tr_s1`..`tr_s3`) and `TR1:` are unchanged.
- Closed all five step-9-owned local-only areas across `src/sim/{inventory,fitting,economy,contracts,session,player,weapons,combat,missile,ai,step}.js`
  and `src/ui/{hud,menu,screens}.js`: per-pilot holds, mining, crate pickup (even while local is
  docked), outfitting, purchases, missile persistence, contract progress/spawning, kill attribution,
  and per-pilot launch/dock without wiping another active pilot's fight.
- Added `tests/saves/v12-real.json`, `tests/step9-save.test.mjs` and `tests/step9-local-only.test.mjs`;
  all **225 tests** pass, and both 8b single-player oracle scripts match exactly. Rebuild required
  (`npm run build`); owner playtest pending (`TESTING-BASELINE.md` section M).



---

## 2026-11-08: Step 8c owner playtest passed

- The owner reports the 8c playtest works. Ticked 8c in the roadmap and refactor plan; no code
  or save data changed. Step 8 overall remains open pending frame-rate caveat validation.



---

## 2026-11-08: Step 8c scoped implementation complete — playtest pending

- Flight, drive, power, shield, hull, weapons, missiles and targeting use per-player runtime;
  shared world/projectile systems run once and enemies chase the nearest active player.
- Added two-player simulation, collision, targeting and weapon tests, plus a 12-second 8b
  single-player oracle and a second mining/combat/lifecycle oracle. All 216 tests pass; both 8b
  scripts match exactly. Build required;
  save version remains 12, no new dependency or multiplayer transport.
- Inventory, economy, docking, contracts, death/recovery and saves remain local-only as requested;
  the complete exceptions table is in `TARGET_ARCHITECTURE.md`, and step 9 must close every item.
  Owner playtest is pending (`TESTING-BASELINE.md` section L); full step 8 frame-rate caveats remain.



---

## 2026-11-08: Step 8c in progress — explicit flight, shields and damage

- `flight`, shield and power updates, and `hurt` accept a player or independently supplied
  runtime data. Non-local callers must supply their own resources. Hurt and death events name the
  affected player; local HUD/recovery ignore other players. Single-player defaults are unchanged.
- Added `tests/player-runtime.test.mjs` for independent motion, power, shields, profile damage and
  death routing. 206 tests pass; a 12-second single-player flight/weapon/warp probe matched the
  prior build. Save version remains 12.
- **8c remains incomplete:** the main loop, weapons, inventory, AI, lifecycle and other systems
  still assume one player. The owner does not want to playtest before 8c is complete.



---

## 2026-11-08: Step 8c started — player-specific transforms and launches

- `sim/pilot.js` transforms and mounts now accept an explicit player; projectile and missile
  launch can inherit that player's velocity. Existing callers default to the local player.
  Weapon and targeting calls pass their current player explicitly; gameplay and saves are unchanged.
- Added two-player transform and projectile launch tests (`tests/player-aim.test.mjs`); 202 tests
  pass. A scripted 12-second 8b-versus-current flight/weapon/warp probe was identical.
- **8c is incomplete**: simulation systems, power, damage, inventory, targeting, lifecycle and
  events still assume one player. No multiplayer sim is claimed. Frame-rate caveats remain.
  Save version stays 12; this work has not been playtested by the owner.



---

## 2026-11-08: Step 8b complete and ticked

- The owner reported the 8b playtest passed. Updated the handoff, roadmap and refactor plan;
  8c is next. No gameplay or save changes in this entry. The 8b build and 200 tests passed.



---

## 2026-11-08: Step 8a ticked; step 8b player records and controls

- The owner reported the 8a playtest passed, so 8a is ticked. The frame-rate caveats remain
  open; no separate 30/60/144 browser throttle result was reported.
- Added `state.players`, `localPlayer()`, `createPlayerRecord()` and independent per-player
  controls. Input and the screen follow the local player; `state.player` and `state.controls`
  temporarily alias that entry for existing systems until 8c. Guest gameplay is not implemented.
- Added `tests/players.test.mjs`: separate players, controls, input, replacement and local flight.
  200 tests pass. A scripted 12-second old-vs-new flight/weapon/warp probe was identical. Save
  remains version 12; 8b awaits playtest, and 8c is not started.

---

## 2026-11-08: Step 8 slices documented

- Expanded the approved 8a/8b/8c breakdown in `docs/REFACTOR_PLAN.md`, added separate status
  rows in `docs/ROADMAP.md`, and clarified the remaining work in `docs/HANDOFF.md`. 8a remains
  awaiting playtest; 8b and 8c have not started. No gameplay or save changes in this entry.

---

## 2026-11-08: Step 8a — fixed simulation tick (playtest pending)

- Added `src/sim/step.js` and `src/data/simulation.js`: gameplay runs at 60 ticks per second,
  while rendering remains per frame. The previous 0.05-second frame cap and pause semantics
  remain. HUD hints persist across display-only frames; cosmetic visuals and audio no longer
  consume the seeded gameplay random stream.
- `tests/sim-step.test.mjs` checks the real flight and seeded combat at 30/60/144 display rates,
  fixed-clock stalls, hints and the old loop. At 60 fps flight matches exactly; a 10-second test
  differs by 2.2932 units from old 30 fps and 1.3400 units from old 144 fps. 195 tests pass.
- Full game frame-rate independence is **not proved**: missile aim follows the rendered camera,
  asteroid respawn uses wall time, and rendering has no tick interpolation. Browser playtest is
  pending. 8b and 8c remain; save version stays 12. See `TESTING-BASELINE.md` section J.

---

## 2026-11-08: Step 7d complete and ticked

- The owner reported the registry cleanup playtest passed. Marked 7d complete in the handoff,
  roadmap and refactor plan; step 8 is next. No code or save changes in this entry.

---

## 2026-11-08: Step 7d — entity view registry cleanup

- Replaced view-kind switches and the separate enemy map with a registry and one active-view map.
  Each kind supplies its world list and build, update and removal handlers; enemy and other entity
  ids are namespaced because they use separate counters. Existing events and frame sweeps remain.
- Added fake-kind lifecycle, overlapping-id and particle cleanup tests; updated recipe 19 and the
  render README, and added `TESTING-BASELINE.md` section I. No gameplay or save changes; save version remains 12. 188 tests pass. Owner
  playtest pending; build and testing checklist are noted in the handoff and roadmap.

---

## 2026-11-08: Step 7c and step 7 complete and ticked

- The owner playtested step 7c and reported it passed. Marked step 7c and step 7 complete in
  `docs/ROADMAP.md`, `docs/REFACTOR_PLAN.md` and `docs/HANDOFF.md`; step 8 is next.
- No gameplay or save changes in this entry. The 7c build and all 185 tests passed previously.

---

## 2026-11-08: Refactor step 7c — hull view and render-free simulation

- Added `PlayerShipView` and shared named gun, missile and beam mounts in `src/data/mounts.js`;
  the sim transforms the same offsets without reading a mesh. Existing offsets are unchanged.
- Sector entry emits `sector-entered`, including docking resets; `main.js` updates scenery. The
  frame loop supplies the previous camera direction for missile lock. The sim imports no render
  files; the layer allow-list is empty. Save version remains 12.
- Added `tests/step7c.test.mjs` and a manual checklist in `TESTING-BASELINE.md` section H.
  `npm install`, `npm test` (185 passing) and `npm run build` succeeded. Owner playtest pending.
  Updated architecture, roadmap, handoff, and folder READMEs; generated HTML is not included.

---

## 2026-11-08: Step 7b complete and closed (docs only, no code change)

- **Why:** the owner asked for the slice to be ticked and closed, and raised nothing about it, so it
  is closed the way every other step has been. Nothing is in flight; **7c has not been started**.
  (The evidence it is right: the old-vs-new probe's 0 differences, 182 green tests, and
  `TESTING-BASELINE.md` section G, which is the manual check if anyone wants to re-run it.)
- **Also:** the commit was tagged **`step7b`**, so the owner can download the whole project as a zip
  straight from GitHub without any tool of mine being involved:
  `https://github.com/voltvehiclez/Tallow-Reach/archive/refs/tags/step7b.zip` (GitHub builds it on
  request; it contains the prebuilt `game/tallow-reach.html` and excludes `node_modules`). GitHub
  uploads are blocked from this sandbox's network, which is why a release asset could not be
  attached; the tag archive needs no upload. Step 7a was tagged `step7a-ticked` the same way.
- Files: `docs/ROADMAP.md` (status line, step-7 row, status log), `docs/HANDOFF.md` (next action),
  this changelog. No source changed, so no rebuild is needed for this entry — the zip and the build
  are the 7b build.

---

## 2026-11-08: Refactor step 7b — bullets, missiles, crates and particles become data

- **Why:** after 7a a hostile was plain data, but a bullet, a missile, a loot crate and an explosion
  spark were still three.js meshes living in `state.world`, moved and removed by the sim
  (`combat.js`, `effects.js`, `weapons.js`, `world.js`). The sim could not run without a scene, and a
  host could not send a guest a bullet. Step 7b removes that for every one of them.
- **Everything transient is a record now** (`src/sim/entity.js`, `src/util/ids.js`): a bullet is
  `{ id, kind: "bullet", pos, quat, v, own, dmg, l }`, a crate `{ id, kind: "crate", pos, quat, t,
  item, spin }`, a spark `{ id, kind: "fx", pos, v, l, t, col, size }` and a missile
  `{ id, kind: "missile", pos, quat, d, sp, t, l, dmg }` (`src/sim/missile.js` is new). `pos` and
  `quat` are three.js maths types, which the target architecture allows: **no `src/sim/` file holds
  a mesh, a material or the scene any more**.
- **`render/views.js` draws all of them.** It listens for the new `entity-spawned` / `entity-removed`
  events, builds one mesh per entity from its kind, copies `pos`/`quat` (and a rock's `scale`, a
  spark's fade) once a frame, and sweeps the lists so a mesh can never be left behind. The player's
  ship model lives here too, built from `profile.ship` and hidden while `player.docked`.
- **The player's ship is data.** `state.player.pos` / `quat` replace `state.player.m.position` /
  `.quaternion`; `src/sim/pilot.js` is the only way the sim reads them (`playerPos`, `playerFwd`,
  `playerLocal`, `facePlayer`). The turn is applied to the record in the same Y-then-X-then-Z order
  the model's `rotateY/X/Z` used.
- **Rocks are data a step early** (they were 7c) because the rules already read them: a rock carries
  `pos`, `quat`, `s0` (born size), `scale` (drawn size, which mining shrinks) and `shape` (which
  lumpy model), and `render/views.js` draws it into the sector group it belongs to.
- **The mining beam is a line of numbers:** the sim reports `state.flight.beamStart` / `beamEnd`
  while it cuts, and the view stretches a cylinder between them.
- **Two new sim files:** `src/sim/entity.js` (`addEntity` / `dropEntity` / `clearEntities`, and the
  only emitter of `entity-spawned` / `entity-removed`) and `src/sim/pilot.js`. `src/util/ids.js`
  hands out ids from a counter, so adding an entity never touches the seeded RNG.
- **Unchanged behaviour, proven.** An old-vs-new probe ran one seeded session through the previous
  commit and this tree (real three.js maths, a fake scene) and fingerprinted the pilot, power,
  every hostile, bullet, missile, crate, spark, rock, the lock and the hold after each stage:
  **flight, turning, boost, firing, hits, missiles, damage, lock-on, mining, loot, pickup and
  clearing all identical**. The only deliberate difference: a bolt's muzzle is now built from the
  ship's data instead of its `matrixWorld`, which three.js keeps a frame behind — so bolts no longer
  leave from where the guns were last frame (the documented stale-transform bug). With the probe
  refreshing `matrixWorld` first, both trees agree to the last digit.
- **Two bugs found and fixed while porting** (both would have changed play): mining must shrink the
  rock's *data* (`scale`), because collision reads it, not just its mesh; and a rock's random shape
  must be rolled *before* its position, in the same order as before, or a seed builds a different
  field. Both are now pinned by the probe and by tests.
- **`tests/layers.test.mjs`:** `asteroids.js`, `combat.js`, `effects.js`, `player.js` and `world.js`
  left the `render/` allow-list. Two files remain and the test now says why: `sectors.js`
  (`showSector` — scenery groups, step 10) and `weapons.js` (`camera.quaternion` for the lock cone,
  step 8). New rules: no sim file's *code* may mention `Mesh`/`Group`/`Geometry`/`Material`/
  `scene`/`matrixWorld`; a rock and the pilot's ship must be plain data; and `render/views.js` must
  know every entity kind.
- **New tests (182 in all):** `tests/headless-fight.test.mjs` (9) — the whole fight with no browser:
  a shot's record, a hit, a kill with loot crates, a crate picked up or expiring, a homing missile,
  mining a rock, clearing the world, and a check that the sim makes **no scene call at all**.
  `tests/views.test.mjs` grew five: a bullet's mesh appears and goes, crates/sparks/rocks are drawn,
  a missile is drawn from its record, the ship's model follows its record, and the beam's numbers.
- **Save:** unchanged, version stays **12**. **Files:** `src/sim/{entity,pilot,missile}.js` (new),
  `src/util/{ids}.js` (new), `src/sim/{combat,effects,weapons,player,asteroids,world,ai,targeting,sectors,session}.js`,
  `src/render/{views,camera,models}.js`, `src/ui/hud.js`, `src/main.js`, `src/state/state.js`,
  `src/util/{events,math}.js`, `tests/{headless-fight,views,layers,headless-sim}.test.mjs`,
  `src/sim/README.md`, `src/render/README.md`, `docs/{ARCHITECTURE,TARGET_ARCHITECTURE,ROADMAP,REFACTOR_PLAN,HOW_TO_ADD,HANDOFF}.md`,
  `TESTING-BASELINE.md` (new section G), this changelog and `CHANGELOG_ARCHIVE.md` (four oldest
  entries moved out, index lines added). Run `npm run build` and `npm test`.
- **`serve.mjs` (new, testing only):** `node serve.mjs` serves `game/tallow-reach.html` over HTTP
  with caching off, so the owner can play the current build in a browser without copying files.
  Nothing in `src/` imports it; the game is still built to one file by `npm run build`.
- **Next:** step 7c (the player hull's own view class and mount points), then step 8.

---

## 2026-11-08: Step 7a ticked (docs only, no code change)

- **Why:** the owner played the 7a build and reported that the raiders behave as usual and that
  they are cleared when the field is cleared on docking. That was the one thing the slice waited
  for, so 7a closes.
- **Also settled:** clearing raiders on docking is **not** a 7a change and not a bug. `dock()` has
  always called `clearTransient()` (pirates, bullets and missiles go; crates stay), and it does not
  count as a kill. Whether that should change is a gameplay decision, still open and not started.
- **State of the code, unchanged by this entry:** an enemy is a plain-data record
  (`src/sim/enemy.js`), `render/views.js` draws it, and no `src/sim/` file touches an enemy's mesh.
  165 tests green. Save version stays **12** (step 7 changes no saved data).
- **Files:** `docs/ROADMAP.md` (7a ticked, current position and log), `docs/HANDOFF.md` (next action
  is 7b), `docs/REFACTOR_PLAN.md` (slice 7a marked ticked), this changelog. No source changed, so no
  rebuild is needed: the zip and the tag are the 7a build.
- **Next:** step 7b, bullets, missiles, crates and particles as data with views.

---

## 2026-11-08: Refactor step 7a — a hostile becomes data; the mesh becomes a view

- **Why:** an enemy *was* a three.js mesh (`sim/ai.js` built one with `mkShip`, and every system that
  touched a hostile moved `e.m.position`). That is what stops the sim running on a host or in a test:
  the rules could not run without a scene. Step 7 removes that for every entity; 7a does hostiles.
- **A hostile is a record now** (`src/sim/enemy.js`):
  `{ id, kind: "enemy", def, n, f, loot, hp, mx, pos, quat, v, fire, o }`. `pos` and `quat` are
  three.js `Vector3`/`Quaternion` — maths types, which the target architecture allows — and no
  `sim/` file holds a mesh. `enemyPos`/`enemyFwd`/`turnEnemy`/`enemyDist`/`enemyVel` are the only
  ways to read its position and rotation, so the storage can change again in one file.
- **`render/views.js` draws them.** It listens for `enemy-spawned` and builds the mesh from the def
  (`mkShip(col, scale, true)`), copies `pos`/`quat` onto it once a frame, and removes it on
  `enemy-removed` — which fires when a hostile is killed, drifts out of `lostRange`, or the field is
  cleared by docking or a warp. A per-frame sweep reconciles the two lists so a mesh can never be
  left behind or missing.
- **Two files left the `render/` allow-list** in `tests/layers.test.mjs`: `ai.js` and `targeting.js`.
  `combat.js` and `world.js` still import render/ for crates and the spark field (7b/7c).
- **The station's position moved to the sim.** `STATION_POS` used to be exported from
  `render/scene.js`; targeting needs it (lock the outpost) and may not import render/, so it is in
  `sim/world.js` now and `ui/hud.js` reads it from there. It is still 0,0,0 — the outpost's mesh has
  not moved.
- **New tests (165 in all):** `tests/headless-sim.test.mjs` — the headless test step 7 asks for: one
  raider, 600 ticks, no browser, checking it approached, turned to face the pilot and fired; plus
  the kill, out-of-range and clear-the-field paths. `tests/views.test.mjs` — a mesh appears per
  hostile from its def's colour and size, follows its data every frame, and goes away with it. Two
  new layer tests: no `sim/` file may mention an enemy's mesh (`e.m`), and `render/views.js` is the
  only place that builds one. `tests/headless.mjs` gained `opts.keep`, so a test can load one
  `render/` file for real (that is how `views.js` is tested).
- **Equivalence proof:** an old-vs-new probe ran one scripted fight (spawn, chase, shoot, kill, drop
  loot, out-of-range removal, dock) through the previous commit and this tree, fingerprinting the
  player and every hostile each tick: **2545 of 2545 frames identical**. The one new thing is each
  enemy's `id`, which is what the view keys its mesh on.
- **Save:** unchanged, version stays **12**. **Files:** `src/sim/enemy.js` (new),
  `src/render/views.js` (new), `src/sim/{ai,combat,targeting,weapons,world}.js`, `src/util/math.js`
  (`fwdQ`/`faceQ`), `src/util/events.js` (two events), `src/render/scene.js` (STATION_POS moved out),
  `src/ui/hud.js`, `src/main.js`, `tests/{headless,layers,enemies,content}.test.mjs`,
  `tests/headless-sim.test.mjs` (new), `tests/views.test.mjs` (new), `src/sim/README.md`,
  `src/render/README.md`, `docs/{ARCHITECTURE,TARGET_ARCHITECTURE,HOW_TO_ADD,ROADMAP,HANDOFF}.md`,
  this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-08: Step 6 ticked in full (docs only, no code change)

- **Why:** the owner played the 6b build and reported **no problems with the controls**. That was
  the one thing 6b was waiting for, so step 6 closes.
- **What was signed off:** `TESTING-BASELINE.md` section A (flight feel) and section B (mining,
  guns, missiles). The lock ring resizing with the window was checked by the owner too.
- **State of the code, unchanged by this entry:** no `src/sim/` file imports `core/` (no sound, no
  keys, no mouse), the sim reads `state.controls`, and the lock ring is sized in `ui/hud.js`. 155
  tests green. Save version stays **12** (step 6 changed no saved data).
- **Files:** `docs/ROADMAP.md` (step 6 ticked, current position and log), `docs/HANDOFF.md` (next
  action is step 7; the layers-test row no longer says "input (until 6b)"), this changelog. No
  source changed, so no rebuild is required: the zip and the tag are the 6b build.
- **Next:** step 7, entities as data and meshes as views, in three playable slices.

---

## 2026-11-08: Refactor step 6b — the sim stops reading the keyboard (step 6 done)

- **Why:** with 6a the sim no longer played sound; it still read the keyboard and the mouse
  directly (`keys.KeyW`, `pointer.x` in `sim/player.js`, `sim/weapons.js` and `sim/sectors.js`), and
  `sim/weapons.js` even measured the missile lock ring in **screen pixels**. That is the thing that
  makes a second player impossible: a guest's controls arrive from the network, not from a keyboard.
- **New `state.controls`** (`src/state/controls.js`): one plain record per pilot —
  `steer {x,y}`, `roll`, `thrust`, `strafe`, `lift`, `stop`, `brake`, `boost`, `fire`, `sec`.
  `core/input.js` owns the key table (`HELD`) and rebuilds the record after every key or mouse
  change; the sim reads it and never sees a key code. **No `src/sim/` file imports `core/` any
  more**, which is what "step 6 done" means. The shape is the co-op contract: step 8 puts it on a
  per-player record, step 16 fills a guest's copy.
- **The missile lock ring moved to the screen.** The sim now reports the cone in **degrees**
  (`state.flight.coneAngle`), and `coneRadiusPx()` in `ui/hud.js` turns that into pixels with the
  camera's field of view and the window height. Checked against the old formula at 0, 1, 10, 20, 30
  and 45 degrees: identical to the last digit (20 deg on a 60-degree camera at 900 px is
  283.68672218631417 px, before and after). The sim no longer reads `innerHeight`.
- **Two small cleanups in passing**, both verified to change nothing: the stored
  `state.flight.gunsOn` flag is gone (it was only ever read inside `sim/weapons.js`, where it is now
  a local; a stale copy on a shared record would mislead co-op), and losing window focus now clears
  held keys as well as releasing the free camera, so a ship cannot keep thrusting while the player
  is in another window.
- **New tests (`tests/layers.test.mjs` is 14 now):** no `sim/` file may import `core/` at all, none
  may mention `keys`/`pointer`, `HELD` may only set fields the record has, the record's exact field
  list is pinned, each record owns its own `steer` object, and the ring's pixel maths is checked.
  `tests/content.test.mjs` gained the new source strings for the two guards it already had.
- **Proof it plays identically.** A probe drove one scripted session through the previous commit
  (setting `keys`/`pointer`) and this tree (setting `state.controls`), with real three.js maths and a
  per-frame fingerprint of position, rotation, velocity, throttle, boost tank, Shield HP, Hull HP,
  power draw, gun cooldowns, beam state, entity counts and warp state: **1010 of 1010 frames
  identical.** The session covered throttle, steer, roll, strafe, lift, brake, stop, boost ignition,
  six volleys, 6 seconds of mining, secondary fire and a warp with the stick easing out.
- **No save change** (`SAVE_VERSION` stays 12) and no gameplay, balance or UI change.
- **Tests:** 155 pass (was 150).
- Files: `src/state/controls.js` (new), `src/state/state.js`, `src/core/input.js`,
  `src/sim/player.js`, `src/sim/weapons.js`, `src/sim/sectors.js`, `src/ui/hud.js`,
  `src/ui/pause.js`, `src/main.js`, `tests/layers.test.mjs`, `tests/content.test.mjs`,
  `src/core/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md`
  (the debt row now names only `render/`), `docs/HOW_TO_ADD.md` (recipe 8 rewritten: one-off keys
  vs held controls), `docs/ROADMAP.md` (6a ticked, 6b logged), `TESTING-BASELINE.md`, this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-08: Refactor step 6a — the sim stops playing sounds itself

- **Why:** the biggest structural debt in `docs/TARGET_ARCHITECTURE.md` is `src/sim/` importing the
  screen, the speakers and the keyboard. Step 6 splits it in two, and this is the sound half (6a).
  Eleven places in `src/sim/` called the synthesiser directly (`tone()`, `nz()`, `oreGained()`,
  `warpCharge()`, `warpBurst()`), so no test could run the sim without a browser, and a co-op host
  could never decide which machine should hear a boom.
- **New event `sfx { name, ...rest }`.** The sim now says *what happened*; `core/audio.js` decides
  what that sounds like. `src/sim/{weapons,player,combat,ai,effects,sectors}.js` no longer import
  `core/audio.js` at all. Extra fields carry the moment's own numbers:
  `{ name: "explosion", count }` (still only rumbling above 10 particles) and
  `{ name: "warp-charge", dur }` (the warp's own charge length).
- **`SFX` table in `src/core/audio.js`** holds one entry per sound, and these eleven names are what
  the sim emits: `cannon`, `ore-gained`, `missile-lock`, `missile-fire`, `boost`, `hit`, `pickup`,
  `enemy-fire`, `explosion`, `warp-charge`, `warp-burst`. One listener, `on("sfx", playSfx)`, plays
  them. **Every waveform, frequency, duration and volume is copied unchanged** — this is a wiring
  change, not a sound change.
- **Deliberately not hung on existing gameplay events.** It would be tidier to play the ore chime
  from the `mined` event and the pickup pip from `pickup`, but the sim intends the chime to fire
  **once per ore the beam secures**, while the `mined` event fires once per ore that actually lands
  in the hold (`weapons.js`: `emit("sfx", { name: "ore-gained" })` sits above the `while` loop that
  emits `mined`). They are not the same moment, and a design that assumed they were would have
  quietly coupled a sound to a cargo rule. *(Correction, same day: an earlier draft of this entry
  justified the choice with "mining with a full hold chimes but emits no `mined`". The owner pointed
  out that the beam never cuts when the hold is full — `updatePrimary` says "Cargo hold full" and
  returns before the cutting branch — so that case does not arise. The separation is still right;
  the example was wrong.)* Each `sfx` sits at the exact old call site, so the sounds are 1:1 with
  before.
- **New `tests/layers.test.mjs` (9 tests):** imports are parsed statement by statement, so a
  side-effect import cannot swallow the next one. It fails if any `src/sim/` file imports
  `core/audio.js`, `core/input.js` (that line is deleted in 6b) or `ui/`, holds a shrinking
  allow-list of `sim/` files that may still import `render/` (step 7 empties it) and checks the
  allow-lists only name files that really do that import. It also checks both directions between
  the names the sim emits and `SFX`, and that playing a sound with no audio context never throws.
  All three deliberate breakages (re-importing audio, a typo'd name, a stale allow-list entry)
  were caught.
- **Proof it plays identically.** A probe bundled the previous commit and this tree, ran one
  scripted session through both with a recording Web Audio context (a fake `window.AudioContext`
  logging every node, envelope, start/stop and the delayed `setTimeout` chimes), and compared the
  result: **671 log lines identical**, the same 55 oscillators, 19 noise bursts and 11 delayed
  pips, covering all eleven sounds.
- **No save change** (`SAVE_VERSION` stays 12) and no gameplay, balance or UI change.
- **Tests:** 150 pass (was 141).
- Files: `src/util/events.js`, `src/core/audio.js`, `src/sim/weapons.js`, `src/sim/player.js`,
  `src/sim/combat.js`, `src/sim/ai.js`, `src/sim/effects.js`, `src/sim/sectors.js`,
  `tests/layers.test.mjs` (new), `TESTING-BASELINE.md` (a by-ear table), `src/core/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (the debt row now
  names only 6b/7), `docs/HOW_TO_ADD.md` (recipes 9 and 10 rewritten), `docs/ROADMAP.md` (steps 4
  and 5 ticked after the owner's playtest; step 6a logged), this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-07: Recorded what is and is not per-shop about shops (docs only)

- **Why:** the owner asked whether the game can hold more than one **independent** shop (for
  example a trader in Kestrel Hollow beside Meridian's). A probe answered it, and the answer is worth
  keeping so the next session does not re-derive or, worse, pre-empt it.
- **What holds up:** shops are independent as content — `SHOPS` entries with their own heading,
  rows, prices and `max` limits, addressed by `shopId`, with limited stock keyed per shop
  (`"shopId:itemId"`), so two shops never share a shelf.
- **What does not (yet):** the *destination*. Every purchase lands in the one place `STATION`
  (`profile.store`) and room is checked there, so a shop in another sector would deliver into — and
  be blocked by — Meridian's storage. The probe showed exactly that: independent prices and stock,
  both purchases in one `profile.store`, and a full station refusing the other shop's sale.
- **Owner's decision, recorded:** other stations will have **their own independent inventory**. The
  route is written into the new known gap in `docs/ARCHITECTURE.md`: named places in
  `sim/inventory.js`, their stock saved with the world (step 9), and the sector naming its station and
  shop (`OUTPOST_SHOP` becomes a sector field, step 10).
- **No code, no save change.** `SAVE_VERSION` stays 12; tests unaffected (141 still pass).
- Files: `docs/ARCHITECTURE.md` (known gap), this changelog.

---

## 2026-11-07: Spare modules can be sold (60% of the shop price)

- **Why:** the game treated a module as unsellable. `canSell(id)` is `itemValue(id) > 0` and a
  module's catalogue entry was only `{ cat: "module" }`, so every selling path skipped parts: the
  Inventory's right-click **Sell** was greyed out on a MOD tile ("Modules cannot be sold; only
  cargo has a sell value"), and the Base tab's **Sell hold / Sell stored** quietly sold only ore and
  salvage. A part you took off a hull was dead weight.
- **The owner's rule:** a spare module sells for **60% of its shop price**, never below 1 credit —
  the beam **540** (of 900), the missile pod **900** (of 1500), the six standard parts **1** each
  (60% of 1 would round to nothing, and then they could not be sold again). The values are data, in
  `ITEMS[<module>].v` in `src/data/items.js`, and a test fails if a shop price and its sell value
  stop agreeing (`Math.max(1, Math.floor(price * 0.6))`).
- **Changed:** `sim/economy.js` — `sellHold()` and `sellStored()` count and sell goods **and** spare
  parts, and return a message (`Sold 4 items for 1270 cr.`, or `Nothing in the hold can be sold.`);
  `sellInventoryItem()` no longer says "Only cargo can be sold."  `ui/menu.js` — right-click **Sell**
  is offered whenever the item has a value, the box is titled with the item's name
  (`SELL BASIC MINING BEAM`) instead of "Sell cargo", and the two Base buttons now report their
  result in the toast. `ui/screens.js` — the Base tab's sell buttons look at everything with a value
  (and say so), and the Inventory blurb mentions selling.
- **What is still not for sale:** a module **fitted in a bay** — it is in no stock, so no selling
  path can reach it, and a test pins that. Missiles loaded in a launcher are not cargo either.
- **No save change.** Sell values come from the catalogue, not the save; `SAVE_VERSION` stays 12.
- **Tests:** 141 pass (was 132). New `tests/selling.test.mjs` (9 tests): every sellable item is worth
  whole credits, a part sells at 60% of its shop price from a hold or the station, refusals change
  nothing, the refinery bonus applies to parts, whole-hold and whole-station sales take the parts,
  the "nothing to sell" messages, a fitted part is never sold, and source guards on the old
  "cargo only" rules. `tests/content.test.mjs` gained the price↔value rule.
- Files: `src/data/items.js`, `src/sim/economy.js`, `src/ui/screens.js`, `src/ui/menu.js`,
  `tests/selling.test.mjs` (new), `tests/content.test.mjs`, `TESTING-SELLING.md` (new),
  `src/data/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/HANDOFF.md`,
  `docs/HOW_TO_ADD.md` (recipes 2 and 16), this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Shop fix — the cannons are listed once, as "Basic cannons"

- **Why:** the Shop showed the cannons twice. The first line, **Autocannons — Primary. Standard
  issue. — Owned**, was typed into the old shop screen and came through step 5 as a `kit` list of
  "standard-issue" lines; step 5's own change then put **Basic cannons** in the stock at 1 cr. The
  game has only one cannon module (`cannon_basic`, "Basic cannons"), so one of the two lines was
  wrong — and "Autocannons" named a part that does not exist.
- **Changed:** `src/data/shops.js` loses its `kit` list, and `shopHtml()` in `src/ui/screens.js`
  no longer draws one. A stock row is now the **only** way a part appears on the shop screen, so
  the same part cannot be listed twice. The Shop's first two rows (the beam and the missiles) are
  unchanged, word for word.
- **Nothing else changes:** the same eight parts are for sale at the same prices (beam 900 cr,
  missile pod 1500 cr, the six standard parts 1 cr each), and buying, selling, saves and flight are
  untouched. Save version stays 12.
- **When more cannon types exist** they are new `MODULES` entries plus a shop row each (recipe 17):
  one row per cannon, no extra list.
- **Tests:** 131 pass. `tests/shops.test.mjs` now fails if a shop has a `kit` list or if any item
  appears in a shop's stock twice.
- Files: `src/data/shops.js`, `src/ui/screens.js`, `tests/shops.test.mjs`, `TESTING-SHOPS.md`,
  `src/data/README.md`, `docs/ARCHITECTURE.md`, `docs/HOW_TO_ADD.md` (recipe 4), `docs/ROADMAP.md`,
  this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 5 — shops and prices from data (plus a visible Shop change)

- **Why:** the Shop was hard-wired. `SHOP_WEAPONS` in `data/weapons.js` held two rows, `buyWeapon()`
  in `sim/economy.js` knew those two keys by name, and `shopHtml()` even had a third row
  ("Autocannons — Owned") typed into the markup. A second trader, or a station selling a spare
  powerplant, needed code in three files.
- **New:** `src/data/shops.js` — `SHOPS`: per shop, a heading (`n`), its line of explanation (`d`),
  `kit` (standard-issue parts, shown as "Owned", not sold) and `stock` (one row per item: `id`,
  `price`, how the row is worded `n`/`d`, and optionally `max`). Meridian is the first entry and
  sells what it sold before. One generic `buyItem(shopId, itemId, qty = 1)` in `sim/economy.js`
  replaces `buyWeapon`, plus `shopList(shopId)` (what the Shop tab draws) and `shopStock()`/
  `setShopStock()` (see stock below).
- **Visible change the owner asked for:** six rows added at **1 cr** each — `power_basic`,
  `cell_basic`, `thruster_basic`, `shield_basic`, `cannon_basic`, `hull_basic` — so a pilot who takes
  a standard part off a hull, or loses one with a ship, can always buy it back. The beam stays 900 cr
  and the missile pod 1500 cr. Those six rows are marked `own: false`, so they do not show
  "You own N" (that count includes the stock fit of hulls you have not bought).
- **Stock rules:** no `max` means the shop never runs out — every Meridian row today. A row with
  `max: 5` shows "N left", greys out at zero, and `buyItem()` refuses when it is gone. How much is
  left lives in **session state** (`state.shops`), never in the save, and starts again from `max`.
  `setShopStock(shopId, itemId, n)` is the one hook a restock timer, a restock event or a random roll
  will call later; nothing calls it today. Restocking is deliberately unfinished, not forgotten.
- **The 8 starter missiles moved to the item:** `missile_basic` has `ammo: 8` in `data/modules.js`
  (the save's clamp was already reading `MODULES.missile_basic.cap`), so a purchase tops the rack up
  to 8 and never takes missiles away. `SHOP_WEAPONS` is deleted.
- **Changed:** `sim/economy.js` (the generic purchase; a module is still bought into the station's
  inventory through `sim/inventory.js`, whose `buyItem` gained a quantity argument),
  `ui/screens.js` (`shopHtml()` draws from `shopList()`/`shopDef()`), `ui/menu.js` (the Buy button
  passes `shopId:itemId`), `state/state.js` (`shops: {}`), `data/weapons.js` (now only `MISSILE`).
- **Nothing else plays differently.** An old-vs-new probe ran the same 19-step session through the
  previous commit and this one (buy beam and missiles, move one to a hold, fit a beam in an empty
  bay, unequip a powerplant, store the hold, load, sell the hold, sell the station, repair, buy a
  ship, upgrade the base, restock missiles): **credits, every stock, every hold, every loadout, the
  base levels and every message were identical**, and the Contracts, Hangar, Outfitting, Inventory,
  Base and Saves tabs render byte-identical HTML. On the Shop tab the two old rows are unchanged,
  word for word and in the same order, with the Launch button still last; the only differences are
  the six new rows and the invisible `data-b` now naming shop and item.
- **Save version unchanged (12).** Nothing saved changed.
- **Tests:** 131 pass (was 121). New `tests/shops.test.mjs` (10 tests): every row is complete and
  names a real item, Meridian's prices and its "Autocannons" line, the beam/missile messages and
  missile top-up, refusals that change nothing, the six 1-credit parts and quantity purchases, what
  `shopList()` hands the screen, a temporary limited shop that sells out and is restocked through
  `setShopStock()`, stock never reaching the save, and source guards proving the tabs read `SHOPS`.
  The old `SHOP_WEAPONS` assertions moved out of `content.test.mjs` into it.
- Files: `src/data/shops.js` (new), `src/data/weapons.js`, `src/data/modules.js`, `src/sim/economy.js`,
  `src/sim/inventory.js`, `src/state/state.js`, `src/ui/screens.js`, `src/ui/menu.js`,
  `tests/shops.test.mjs` (new), `tests/content.test.mjs`, `tests/inventory.test.mjs`,
  `TESTING-SHOPS.md` (new), this changelog and the docs listed in the step. Run `npm run build` and
  `npm test`.

---

## 2026-11-07: Refactor step 4 — the item catalogue and one inventory per place (save v12)

- **Why:** the game knew five cargo types by name. `data/items.js` built a fixed object with a key
  per ore (`emptyCargo()`), the save named those keys by hand, spare modules were a separate list,
  and every system that touched cargo looped over the same `KEYS` array. A sixth item — a trade
  good, a second salvage type, ammo — meant editing the sim, the save and the screens.
- **New:** one catalogue, `ITEMS` in `src/data/items.js`, with a category (`ore`, `salvage`,
  `module`, `ammo`, `consumable`, `trade`), a sell value, a volume in m³ and a stack rule. Every
  module is an item entry too (`beam_basic: { cat: "module" }`) whose name, volume and stats stay in
  `data/modules.js`, so nothing is written twice. Code reads it through the helpers only
  (`itemName`, `itemVol`, `itemValue`, `canSell`, `itemStack`, `isModule`, `isItem`).
- **Save version 12.** A place (`profile.store`, `profile.holds[id]`) is one stock,
  `{ itemId: count }`, instead of goods in one object plus a `modules` list — and `profile.modules`
  is gone. Old saves convert on load: the old lists are poured in, zero counts are dropped, unknown
  ids and negative counts are still cleaned. `tests/saves/v11-real.json` is a genuine v11 save
  (written by the code before this step) and a test converts it.
- **Changed:** `sim/inventory.js` (`moveItem` replaces `moveCargo` and `moveModule`; new `addItem`,
  `takeItem`, `countOf`, `itemsAt`, `unitsOf`, `buyItem`, and `valueOf`, which moved here so it can
  be tested without the screen), `sim/fitting.js` (bays are fitted from the one stock),
  `sim/economy.js` (store, load and sell read the catalogue; selling or storing now touches only
  goods, so spare parts are never swept away), `sim/combat.js` and `sim/weapons.js` (a picked-up
  crate or a mined ore is `addItem(...)`), `ui/screens.js` and `ui/menu.js` (one tile list per place,
  the same ORE/MOD tiles, arrows and Sell box).
- **Nothing plays differently.** A throwaway probe ran the same 29-step session through the previous
  commit and this one, with the screen and the speakers stubbed: buying 3 beams and 2 missiles, a
  refused purchase, 11 cannons into a hold that only takes 10, ore across, fitting a beam, a bad bay,
  unequipping a powerplant, buying and switching ships, storing, loading, selling the hold, selling
  the station, selling part of a stack, and what the station is worth. **Credits, every stock, the
  m³ in use and every fitted bay were identical after every step**; the Inventory, Shop and Base tabs
  also render byte-identical HTML (10,332 characters). One wording change: buying an id that does
  not exist says "Unknown item." instead of "Unknown module." — no screen can reach it.
- **Tests:** 121 pass (was 118). `tests/inventory.test.mjs` now covers the v11 conversion, the
  registry (a test adds a temporary item and watches it be carried, moved, listed and sold), and a
  source guard: no file may read `profile.cargo`/`profile.modules` or import a fixed list of item
  keys again.

---

## 2026-11-07: Refactor step 3 — loot tables (drops and ore mix are data)

- **Why:** the two drop rules were written inside the game code — one or two salvage crates and a
  10% core in `sim/combat.js`, the ore mix in `sim/asteroids.js` — so a new drop, a second enemy's
  loot or a new rock type meant editing the sim. Now both are tables.
- **New:** `src/data/loot.js` (`LOOT_TABLES`, two kinds: `drops` — a line per drop with a chance `w`,
  a count range `c` and a scatter `j`; and `pick` — one weighted choice, for a rock's ore) and
  `src/sim/loot.js` (`rollLoot(id, rng)`, `pickLoot(id, rng)`, pure and tested). The raider table is
  today's rule exactly: `salv` 1–2 at 100%, `core` 1 at 10% dropped on the wreck; the asteroid table
  is ferrite 62 / cobalt 30 / voidite 8.
- **Changed:** `src/data/enemies.js` gains `loot: "raider"`; the enemy record carries it
  (`src/sim/ai.js`), `killHostile` rolls the table instead of hard-coding crates, `spawnAsteroid`
  takes its ore from the table, and a crate in the world now carries **which item it holds**
  (`{ m, t, item }`) instead of a `core` flag — `src/sim/targeting.js` reads that for its label, so
  the marker still says "crate" / "reactor core".
- **Nothing plays differently.** Checked against `main` before this step, both versions running on
  the same substituted `Math.random`: **50,000 rocks gave an identical ore sequence**, and 200,000
  kills each gave the same odds — one crate 49.80% vs 49.96%, two crates 50.20% vs 50.04%, a core
  10.02% vs 9.85%, and in both versions every core landed exactly on the wreck. One honest detail:
  the 50/50 crate count now maps a low die to *one* crate where the old code mapped it to *two*, so
  individual kills can swap 1↔2 crates while the odds are unchanged. Matching that would have meant
  writing the count range backwards in the data, which is worse than the invisible difference.
- **New:** `tests/loot.test.mjs` (9 tests, rolls each table 10,000 times and checks the odds,
  determinism, a 0% line never dropping, an unknown table giving nothing, and that adding a drop is
  a data edit) and `TESTING-LOOT.md`. `tests/content.test.mjs` now checks every loot table: real item
  ids, sane weights and ranges, every enemy's table exists, and the raider/asteroid numbers pinned.
- **Also:** `tests/rng.test.mjs` followed the crate change (`c.core` → `c.item`).
- **Saves:** none; still version 11, no migration.
- **Tests:** 118 pass (108 before).
- Files: `src/data/loot.js`, `src/sim/loot.js`, `src/data/enemies.js`, `src/sim/ai.js`,
  `src/sim/combat.js`, `src/sim/asteroids.js`, `src/sim/targeting.js`, `tests/loot.test.mjs`,
  `tests/content.test.mjs`, `tests/rng.test.mjs`, `TESTING-LOOT.md`, `src/data/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (closed debt removed),
  `docs/HOW_TO_ADD.md` (recipe 18 added), `docs/HANDOFF.md`, `docs/ROADMAP.md`, this changelog.
  Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 2 — seeded randomness everywhere

- **Why:** "same seed, same run" is the foundation for generated sectors, wormhole instances and
  co-op. Six rolls in the simulation still called `Math.random()` directly, so seeding never covered
  the whole game.
- **Changed:** `src/util/rng.js` now owns everything: `makeRng(seed)` is a new independent generator
  (same seed, same sequence, forever), `setSeed(n)` installs it for the whole game, `setSeed(null)`
  goes back to `Math.random`, and `random()` reads `Math.random` at call time when unseeded.
- **Changed:** the six direct rolls now go through `random()` — the raider's circling direction and
  the two wander-spawn dice (`src/sim/ai.js`), the 1-or-2 crates and the 10% core (`src/sim/combat.js`),
  and a rock's ore type (`src/sim/asteroids.js`). Same number of rolls, same order, same odds.
- **New:** `tests/rng.test.mjs` — fails and names the file and line if `Math.random` appears anywhere
  in `src/sim/` or `src/data/`; checks `makeRng` repeatability, range and independence from the shared
  stream; and runs the real spawn, loot and asteroid code headlessly to prove `setSeed(1)` twice gives
  the identical run.
- **Nothing plays differently.** The old code (commit `75498f8`) and the new code were run side by side
  with a substituted `Math.random`: 70 asteroid rocks (ore type, size, ore amount), 60 simulated
  seconds of raiders with the hunt spawner and every bullet, and 40 kills of loot rolls all came out
  identical.
- **Rule for next time:** never call `Math.random()` in `src/sim/` or `src/data/` — use `random()`, or
  `makeRng(seed)` when a thing must regenerate from its own seed. Written into `ARCHITECTURE.md`,
  `src/sim/README.md` and `src/util/README.md`.
- **Saves:** no change; still version 11, no migration.
- **Tests:** 108 pass (101 before).
- Files: `src/util/rng.js`, `src/sim/ai.js`, `src/sim/combat.js`, `src/sim/asteroids.js`,
  `tests/rng.test.mjs`, `src/util/README.md`, `src/sim/README.md`, `docs/ARCHITECTURE.md`,
  `docs/TARGET_ARCHITECTURE.md` (closed debt removed), `docs/HOW_TO_ADD.md` (recipe 12 rewritten),
  `docs/HANDOFF.md`, `docs/ROADMAP.md`, this changelog. Run `npm run build` and `npm test`.

---

## 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)

- **Why:** the Newbie Raider's numbers were written inside `sim/ai.js`, so a second enemy meant
  editing game code. Now an enemy is one entry in `src/data/enemies.js`, which is the first piece of
  Milestone A (content becomes data-only additions).
- **New:** `src/data/enemies.js` (`ENEMIES`, the `raider` entry with exactly today's numbers: name,
  plural name, 10 Hull HP, colour, scale, faction, `chase` behaviour, close/near/orbit speeds,
  circling distance, fire/lost/hear ranges, first-shot delay, shot gap, 1 damage, 520 m/s bolt, spawn
  distance; plus `DEFAULT_ENEMY` and `enemyDef()`), `src/data/factions.js` (`FACTIONS`: `pirates`),
  `tests/headless.mjs` (runs `src/sim/` code in a test with the screen and sound stubbed out — no new
  package, it uses the esbuild the build already needs), `tests/enemies.test.mjs`, `TESTING-ENEMIES.md`.
- **Changed:** `src/sim/ai.js` — `spawnPirate(p)` is now `spawnEnemy(id, pos)`; the model, record
  (`def`, `n`, `f`, `hp`, `mx`, fire timer) and the shot all read the def, and the behaviour comes
  from `AI_BEHAVIOURS` (one entry, `chase`). `src/sim/combat.js` emits
  `enemy-killed { def, faction }`; `src/util/events.js` lists it; `src/sim/contracts.js` counts only
  the enemy a hunt contract names; `src/data/contracts.js` stores that id (`e`) and builds the wording
  from the def's plural name, so it still reads "Destroy 3 pirate raiders".
- **Nothing plays differently.** The same numbers were copied, not retuned, and the old and new
  `sim/ai.js` were run side by side for 60 simulated seconds in three situations (a lone raider, the
  wandering spawner, a hunt contract): enemy positions, Hull HP, fire timers and every bullet's
  position and damage matched step for step. Hunt contracts still count raiders only. Contract text,
  rewards, the lock marker ("Newbie Raider 100%") and loot are unchanged.
- **Saves:** no change; save version still 11, no migration. A hunt contract saved by an older
  version has no enemy id, so it keeps its old wording and still counts any hostile.
- **Tests:** 101 pass (94 before; two `content.test.mjs` source-guards were replaced by real
  enemy-table checks, and six headless enemy tests are new).
- **Roadmap:** steps 0 and 1 ticked 2026-11-07 (the owner played this build; old save with a
  Prospector loaded unchanged).
- Files: `src/data/enemies.js`, `src/data/factions.js`, `src/sim/ai.js`, `src/sim/combat.js`,
  `src/sim/contracts.js`, `src/data/contracts.js`, `src/util/events.js`, `tests/headless.mjs`,
  `tests/enemies.test.mjs`, `tests/content.test.mjs`, `TESTING-ENEMIES.md`, `src/data/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (two closed debts
  removed), `docs/HOW_TO_ADD.md` (recipe 6 rewritten), `docs/HANDOFF.md`, this changelog.
  Run `npm run build` and `npm test`.

## 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)

- **Why:** the owner's plan is much bigger than the code's shape (100+ sector starmap, wormhole
  instances, a story campaign, host-run co-op) and several different AI assistants will work on it.
  The docs now say what the game is, where it is heading, in what order, and how to get there safely.
- **New:** `docs/VISION.md` (scope, design pillars, open design questions with defaults),
  `docs/TARGET_ARCHITECTURE.md` (eight principles, data model, save split, multiplayer model, a
  "Debt today" table with evidence), `docs/ROADMAP.md` (status of every step, content to add and when),
  `docs/REFACTOR_PLAN.md` (15 behaviour-preserving steps in 4 milestones, each with goal, work, "done
  when", save version and how the owner runs it), `TESTING-BASELINE.md` (a 10-minute whole-game
  click-through), root `AGENTS.md` and `CLAUDE.md` (pointers for tools that read them).
- **Changed:** `docs/HANDOFF.md` (big picture, reading order, "keep the structure" now means keep
  folders and conventions, restructure only through numbered steps), `docs/ARCHITECTURE.md` (reading
  order, the `sim/` imports `render/`+`core/` exception stated honestly), `docs/AI_PROMPTS.md`
  (model-agnostic starter prompt, refactor-step prompt, content prompt, using several AIs),
  `docs/HOW_TO_ADD.md` (note on which recipes change), `README.md` (links).
- **Housekeeping:** this file had 24 full entries (the limit is 15). The 15 oldest were moved
  word for word to `CHANGELOG_ARCHIVE.md` and indexed below; 10 plus this one remain.
- No source, data, test or save change; save version still 11. No rebuild needed.

## 2026-11-07: Inventory Sell quantity uses a game-styled popover

- Replaced the browser-owned quantity prompt with a small in-game box positioned beside the
  selected inventory tile. It contains the quantity field (prefilled with the stack size),
  inline validation, and Sell/Cancel buttons. No other inventory layout changed.
- Files: `src/ui/menu.js`, `src/styles.css`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory Sell asks how many units to sell

- Choosing Sell on a cargo stack now opens a quantity prompt, prefilled with the whole stack
  count. Enter any whole number from 1 to the stack size to sell that partial or full amount;
  cancelling leaves the stack unchanged. Existing prices and refinery bonus still apply.
- Files: `src/ui/menu.js`, `src/ui/screens.js`, `src/sim/economy.js`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids use five narrower, shorter slots per row

- Set both inventory grids to exactly five columns, with narrower tiles and a 68px tile/row
  height. The 25-slot minimum gives five rows by default; each additional item beyond 25
  naturally adds a row. The three-row scroll viewport and independent scrolling are retained.
- Files: `src/styles.css`, `tests/inventory.test.mjs`, this changelog. Save data unchanged.
  Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text

- Each hold now always renders a 5-by-5 slot field with a fixed three-row viewport, so empty
  slots preserve the inventory window size and scrolling can be tested even with fewer items.
  Station and ship grids scroll independently. Moving items clears/suppresses the "Moved ..."
  status message; other actions are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Station and ship item grids scroll independently after three rows

- Both inventory grids now show up to three full rows at once and scroll within their own
  window when they contain more. This keeps the station and selected ship hold independently
  browsable without changing the surrounding Inventory layout or other screens.
- Files: `src/styles.css`, `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Right-click inventory menu can sell a cargo stack

- Right-click an inventory tile to open an extensible context menu. Its first action is Sell,
  which sells that cargo type's whole stack from the station or selected ship hold using the
  existing item prices and refinery bonus. Modules show Sell disabled because they have no
  existing resale value. No inventory/save format changes.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/sim/economy.js`,
  `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tile text restored to the more readable size

- Raised item names from 11px to 12px and volume labels from 9px to 10px, restoring their
  previous readable sizes while keeping the more compact tile layout.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory item tiles tightened to reduce empty space

- Reduced each tile's minimum height, padding, typography and spacing, and fit more columns
  across the panel. No inventory behavior or data changed.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click

- Removed the two small move buttons from every tile. Clicking a tile moves one item;
  Shift-clicking it moves the whole stack. Tiles are slightly shorter to fit more items.
  The inventory data and capacity rules are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

---

## 2026-11-07: Inventory contents displayed as a compact grid

- Replaced the long per-item row list in both the station and ship inventories with compact,
  responsive item tiles showing category, quantity, volume and the existing move-one/move-all
  controls. Inventory data and movement actions are unchanged.
- Files: `src/ui/screens.js`, `src/styles.css`, `src/ui/README.md`, `tests/inventory.test.mjs`,
  this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Lateral, vertical and reverse thrust increased to 60%

- Doubled `FLIGHT.strafe`, `FLIGHT.lift` and `FLIGHT.reverse` from 0.3 to 0.6. Forward
  thrust and turn are unchanged. No save data change.
- Files: `src/data/ships.js`, `tests/content.test.mjs`, this changelog. Rebuild and test.

## 2026-11-07: Boost works from any throttle and press snaps throttle to full forward

- Boost no longer requires positive throttle; when active it adds forward acceleration only,
  so it never boosts the ship backward even if throttle is in reverse.
- A fresh Shift press sets throttle to +100% once. Holding boost does not lock the throttle,
  so the pilot can change it while boosting. Existing throttle-to-speed behavior is otherwise
  unchanged. Save version unchanged; no migration needed.
- Files: `src/sim/player.js`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)

- **Why:** the header and a few lines were out of date. It said the built file in the zip predated the
  inventory work (the zip has no built game; the user builds it themselves), gave a workspace path and a
  GitHub address nobody could confirm, and told the assistant to deliver a zip and open the built game
  with `present_file`.
- **Now it says:** save version 11 and 94 tests (counted from `tests/`), that the user builds on their own
  computer, that the inventory has not yet been checked in the real game, how to deliver (complete files,
  full paths, non-coder test steps), the archive rule for the changelog, that this file is rewritten and
  not appended to, and that big features (the planned storyline and missions) are planned first and built
  in small playable slices. The module table, the knobs table, the module pattern and the known gaps were
  checked against `data/modules.js`, `data/ships.js`, `data/sectors.js`, `data/weapons.js` and
  `data/station.js` and are unchanged.
- No code, data or save change. Save version unchanged (11). No rebuild needed.
- Files: `docs/HANDOFF.md`, this changelog.

## 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)

- **`docs/CHANGELOG.md` now keeps only the newest entries in full** (10 at the time of this change). Older
  entries were moved, word for word, into the new `docs/CHANGELOG_ARCHIVE.md`, so nothing was lost.
- **An "Older entries" index at the bottom of the changelog lists every archived entry in one line**
  (date and title), so a new session still knows everything that has been done without reading
  it all. Open the archive only when the index shows something relevant to the task.
- **A written rule for the future:** when the changelog holds more than 15 full entries, move the
  oldest ones to the archive until 10 remain, and add one index line for each one moved
  (see the top of this file and "Keeping the docs scalable" in `ARCHITECTURE.md`).
- Reading order, the checklist in `HOW_TO_ADD.md`, the starter prompt in `AI_PROMPTS.md`, `HANDOFF.md`
  and the READMEs now mention the archive and the index.
- No code, data or save change. Save version unchanged (11). No rebuild needed.
- Files: `docs/CHANGELOG.md`, `docs/CHANGELOG_ARCHIVE.md` (new), `docs/ARCHITECTURE.md`,
  `docs/HOW_TO_ADD.md`, `docs/AI_PROMPTS.md`, `docs/HANDOFF.md`, `README.md`.


## 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module

- **Why you could only buy one module:** the Shop hid the Buy button as soon as `ownsModule()` was
  true, so a second beam or launcher could never be bought. The shop now always offers Buy (and says
  `You own N`); the only limit is room.
- **New Inventory tab** (between Outfitting and Shop): the **station** on top (ore and modules, with
  `used / room m³`), then the hold of one ship below it, with arrows to step through every ship in the
  hangar (the arrows only change which hold you are looking at, not which ship you fly). Each row
  has `1` and `all` buttons that move that item between the station and the ship shown, limited by
  room at the destination.
- **Everything is in m³.** Ore is 1 m³ a unit (`ITEM_VOL`), each module has a `vol`
  (powerplant 3, cell 3, thrusters 4, shields 3, cannons 2, beam 2, hull 4, missiles 2 — tuning
  in `data/modules.js`). The station holds `250 x Storage bay level` m³; a hold is the hull's size
  (Wasp 20, Bulwark 30, Prospector 70). Ore and modules share the room. Fitted modules take none.
- **Purchases go to the station** (`buyModule`), as many as you like while there is room; a full
  station refuses the sale and charges nothing. **Outfitting fits from the station's modules**: the
  picker shows one square per kind with a count (`Basic cannons x3`). Taking a part off a ship (or
  swapping one) needs room in the station and says so if there is none.
- **Each ship now has its own hold** (`profile.holds[shipId] = { cargo, modules }`). Cargo stays in the
  ship it is in: switching ships no longer carries it along, so the old "Store your cargo first"
  refusal is gone. Mining and crate pickup fill the flown ship's hold, and the HUD `Hold x/y m³`
  now counts carried modules too. A destroyed ship takes its hold with it. The Base screen's
  Store hold / Load stored / Sell hold act on the ship being flown and only on ore.
- **Save version 11.** Saves from before 11 hand their single `cargo` to the ship they were
  flying; other ships start with an empty hold; the station's ore and modules are unchanged.
  Importing and loading old codes works (tests cover it).
- Behaviour you may notice: the missiles that come with the launcher (8) are only given when you
  carry fewer than 8; a second launcher does not top you up.
- New `sim/inventory.js` (pure, no 3D). Files: `data/items.js`, `data/modules.js`, `state/profile.js`,
  `state/state.js` (`ui.invShip`), `sim/inventory.js`, `sim/economy.js`, `sim/fitting.js`,
  `sim/session.js`, `sim/combat.js`, `sim/weapons.js`, `ui/screens.js`, `ui/menu.js`, `styles.css`,
  docs, READMEs, tests (new `tests/inventory.test.mjs`; the prototype-save test now expects the
  hold). **94 tests**, run against a stand-in for three.js because it could not be installed
  there — run `npm test` yourself. `npm run build` needed (not built in that session).


## 2026-11-06: Handoff note brought up to date (docs only)

- `docs/HANDOFF.md` was out of date: its header said save version 7, 64 tests and 581 KB while
  the body said version 10, and it left out the hull module, the missile launcher, the Services
  box and the ship switcher. The outer `HANDOFF.md` also still said 22 tests, 559 KB and that
  `ships.js` holds the Wasp's speed. Rewritten to match the code: save version 10, 81 tests
  (counted from `tests/`), a 587 KB build, all eight modules, current known gaps.
- No code, data or save change. No rebuild needed.
- Files: `docs/HANDOFF.md`, this changelog.


## 2026-11-06: Repairs and missile restock moved into Outfitting

- **The Hangar's "Hull repairs" list is gone.** Repairing now happens in
  Outfitting, in a **Services** box below the 3D viewer: one row, acting on the
  ship currently shown in the viewer — `Hull HP N%`, an `Intact`/`Repair N cr`
  button (same cost curve, same behaviour, same toast).
- **The Shop's "Missile stock" row is gone.** The **Missile restock** row sits
  in the same Services box: `N of cap loaded`, restocks up to the capacity of
  the launcher fitted to the ship in the viewer for 35 cr per missile. Hidden
  when no launcher is fitted.
- The Services box re-reads the selected ship on every render, so switching
  ships with the arrows updates the repair cost and the restock row.
- Save version unchanged (10). Tests: **81 passing** (1 new guard).
  `npm run build` needed.
- Files: `ui/screens.js`, `styles.css`, docs (ARCHITECTURE, TESTING-OUTFITTING), tests.


## 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone

- **Outfitting shows a switcher above the 3D viewer** (left/right arrows with
  the ship's name and `N of M in the hangar` in the middle). It cycles through
  the ships you own, wrap-around, the same selection the Hangar's Fly button
  makes — cargo is respected, so a ship that cannot hold what you carry is
  refused with the same message the Fly button shows. With one ship the arrows
  are disabled. The viewer re-fits the new hull on the next frame.
- **The Hangar's `Berths 2/3` line is removed**; the buy limit that fed it
  still applies and is still enforced on the Buy buttons.
- Tests: **80 passing** (1 new guard). Save version unchanged (10).
  `npm run build` needed.
- Files: `ui/screens.js`, `ui/menu.js`, `styles.css`, docs, tests.


## 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars

- **The Shield HP / Hull HP / Boost numbers are whole numbers now**
  (`${Math.round(...)}`), matching the bars' coarse granularity.
- **Each top-left label takes its bar's colour** — Shield HP in `--ice`,
  Hull HP in `--ink`, Boost in `--amber` — so the three blocks are
  distinguishable at a glance.
- Save version unchanged (10). `npm run build` needed.
- Files: `index.html`, `styles.css`, `ui/hud.js`.


## 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere

- **The shield and hull bars in the HUD show numbers like boost does**: bottom-left labels
  now read `Shield HP 7.2 / 10` and `Hull HP 10.0 / 10` style — each on one line with its
  reading beside it (the same flex-label treatment as the boost bar; both bars were plain
  labels before). A ship with no shield/hull module reads `none`, like boost with no tank.
- **"Shield HP" and "Hull HP" are the unit names everywhere**: the HUD labels, the bay stat
  lines in Outfitting (`10 Shield HP` / `10 Hull HP`), the shop and Hangar rows, the repairs
  screen, the module data and descriptions, and the user docs (TESTING-OUTFITTING, ARCHITECTURE,
  HOW_TO_ADD, HANDOFF, READMEs). Historical CHANGELOG entries are left as they were written.
- Tests: **79 passing** (1 new guard). Save version unchanged (10). `npm run build` needed.
- Files: `index.html`, `ui/hud.js`, `ui/screens.js`, `data/modules.js`, `data/outfitting.js`,
  `data/ships.js`, `sim/*.js` (comments), `state/*.js` (comments), docs, tests.


## 2026-11-06: Asteroid collision damage scaled to the 10-point hull

- Hull points are 10 now (the hull is a module), so a collision that used to take a tenth of
  the old 100-point bar was effectively removing the ship outright. Asteroid collisions
  (`speed * 0.15`, threshold 25 m/s, same as always) now deal `speed * 0.015` — the same
  proportion of the hull as before, 1/10th the damage. The speed threshold is unchanged.
- Files: `sim/player.js`. Save version unchanged (10). Tests: **78 passing**. `npm run build`
  needed.


## 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none

- **New hull module: `hull_basic` ("Basic hull")**, 10 hit points, standard issue in every
  hull bay (the bay existed but could hold nothing). Hit points work exactly like shield
  points — the fitted module decides how many the ship has (`sim/hull.js`, read from
  `MODULES[id].hp`), and **no hull module fitted means no hit points at all**: `P.hull` is 0
  and the first hit that reaches the hull emits `player-dead` — a one-shot kill, exactly the
  "fly without shields" rule. Shields, if fitted, still absorb their hits first.
- **Hit points no longer come from `SHIPS[].hull`** — the stat is gone from the data, from
  repairs (`economy.repairCost` now reads the fitted module's `hp`), from the Hangar row
  (`Hull 10` is the fitted amount) and from the tests; a hull with no module shows `Hull 0`.
- **Damage is never forgotten and never given for free.** The hull fraction lives in
  `profile.hp[ship]`, stamped on every hull hit in `hurt()` and on dock, so a fit change, a
  hangar visit or a ship switch keeps the damage taken — unfitting the hull at the outpost
  drops the ship to 0 points, and fitting it back restores the fraction (never a free repair;
  topping it up stays the paid Hangar repair). `refreshHull()` is called wherever
  `refreshShield()` is.
- **Save version 10.** Saves from before 10 get `hull_basic` fitted into their hull bays
  (like the thrusters, shields and cannons before it — the bay was unfillable); a v10 save
  where the player emptied the bay stays hull-less. Existing ships effectively go from
  100 HP to 10 HP, and saved `hp` fractions carry over, so a damaged ship is equally damaged.
- **Outfitting** shows `10 hull` under the bay name like other modules; `hit points` are not
  affected by the flat power bill, and `FLIGHT` is untouched.
- Files: `data/modules.js` (`hull_basic`, `STOCK_FIT.hull`), `data/ships.js` (stat removed),
  `sim/hull.js` (new), `sim/player.js` (`setShip`, placeholder, `hurt()` stamps the fraction),
  `sim/session.js`, `sim/economy.js`, `sim/fitting.js`, `ui/hud.js` (bar guard), `ui/screens.js`
  (stat line + Hangar row), `main.js`, `ui/menu.js`, `state/profile.js` (v10), tests
  (**78 passing**, 3 new), READMEs, docs. `npm run build` needed.


## 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate

- **The shop missile launcher is gone; Basic missiles (`missile_basic`) is a module now**,
  in the `secondary` group, bought for the same 1500 cr (the row reads *Owned* once bought,
  and buying still includes 8 missiles). Fit it in the Secondary weapons bay like any other
  module. It works exactly like the old launcher — right click, the dashed lock cone, MISSILE
  LOCK, homing, 7 s life — with three changes: **8 damage per missile** (was 80), a
  **12-missile capacity** (unchanged) and **4 seconds between launches** (was 0.9 s). The
  stock is still refilled at the Shop (35 cr per missile), and the restock row now appears
  when a launcher is fitted, capped by it.
- The missile's flight and lock-on mechanics moved conceptually into the launcher module;
  what stays in `data/weapons.js` is the missile itself plus the ammunition price
  (`MISSILE`) and the Shop rows (`SHOP_WEAPONS`). `sim/guns.js` gained `missilesOf()` and
  `refreshGuns()` now also sets `state.missiles`; a fired missile carries its module's damage,
  so a mid-flight fit change cannot alter what is already in the air.
- **Save version 9.** Saves from before 9 whose owner had bought the launcher get one
  `missile_basic` in storage instead (not auto-fitted; their carried missiles stay, clamped
  to 12). The whole `profile.wp` object left the save — ownership of both formerly flagged
  weapons is now the module's presence.
- **The Outfitting bay shows the beam's mining rate**: **0.25 m³/s** under `Basic mining beam`
  (one ore = 1 m³, one ore per 4 s of contact), the same stat line other modules get. The
  missiles bay shows `8 dmg, 12 cap, 4 s reload`.
- Files: `data/modules.js` (`missile_basic`), `data/weapons.js`, `state/profile.js` (v9),
  `sim/guns.js` (`missilesOf`), `state/state.js`, `sim/weapons.js`, `sim/economy.js`,
  `ui/screens.js` (stat lines, shop rows), `ui/hud.js`, READMEs, docs, tests (**75 passing**,
  3 new). `npm run build` needed.


## 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³

- **Wasp, Prospector and Bulwark now have identical stats.** Hull 100, gun damage ×1, mining
  rate ×1 (the Prospector's ×2.3 is gone — no more ≈1.7 s ores), model scale 1 and price
  600 cr on every hull. The only remaining difference is the hold, which is why the hold was
  kept: **Wasp 20 m³, Bulwark 30 m³, Prospector 70 m³**. One cargo unit = 1 m³.
  Colours and the per-hull add-on meshes (the Prospector's drill, the Bulwark's plates) are
  kept, so the hulls remain visually distinct. Ship-specific bonuses arrive later; a test
  pins the everything-but-the-hold identity.
- **Holds are shown in m³**: the HUD readout (`Hold 12/20 m³`), the Hangar rows and the
  Cargo and storage panel. 1 unit of cargo occupies 1 m³, for every item type.
- Save version unchanged (8) — no saved-data shape changed. Repair costs drop for owners
  of the big hulls (hull 100 across the board); `hp` fractions persist, so damage carries
  over correctly.
- Files: `data/ships.js`, `ui/hud.js`, `ui/screens.js`, READMEs/docs, tests (**72 passing**,
  1 new). `npm run build` needed.

---


## 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime

- **The beam progress bar is smaller, moved, and shows only while mining.** It now sits
  directly under the amber "… left in rock" hint (top 62%) — the text that already tells you
  what the rock holds — is 150 px wide with a 4 px bar and 11 px labels, and is visible only
  while the beam is actually cutting (`state.flight.beamOn`). It was bottom centre above the
  power block and visible whenever the beam slot was selected with a beam fitted.
- **A satisfying chime when an ore banks.** `oreGained()` in `core/audio.js` — a warm
  ascending D5–A5–D6 — plays the moment a beam cycle completes (progress hits 100%), on top of
  the existing hold-capacity rules.
- Files: `src/index.html` (`#bm` after `#pr`), `styles.css` (`#bm`), `ui/hud.js` (visibility
  condition), `core/audio.js` (`oreGained`), `sim/weapons.js` (calls it), READMEs, docs.
- Save version unchanged (8). Tests: **71 passing**. `npm run build` needed.


## 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI

- **The 2-second grace is gone.** The instant the beam stops cutting — ship off the rock,
  trigger released, mine out of reach, cargo full, or not enough power — the progress toward
  the next ore is lost straight away (`state.flight.beamT` → 0, one "Beam contact lost — the
  ore starts again" message). `state.flight.beamIdle` and the `BEAM_RESET` constant are gone,
  and a test guards the immediate reset. Dock/launch/fit/warp still clear the count.
- **New beam progress bar in the HUD.** Bottom centre, above the power readout: the fitted
  beam's name and the percentage on the right (`Basic mining beam … 37%`), filling toward the
  next ore. Shown only while the beam slot is selected and a beam is fitted.
- **The primary line and the equip toast take the modules' own names.** `moduleListName()` in
  `sim/guns.js` builds them — `Basic cannons` with one gun, `Basic cannons x2` with both bays
  (same module), `Basic mining beam` in the beam slot, `A + B` for a mixed pair — and the HUD
  and `setWeapon` share it, so they can never disagree. The hardcoded `Cannons` /
  `Mining beam` / `Cannons equipped` / `Mining beam equipped` strings are gone; the shop row
  for the beam now reads **Basic mining beam** (it buys exactly that module).
- Files: `ui/hud.js` (bar + primary line), `src/index.html` (`#bm`), `styles.css` (`#bm`
  block, mirrors `#pw`), `sim/guns.js` (`moduleListName`), `sim/weapons.js`, `state/state.js`,
  `sim/sectors.js`, `data/weapons.js`, READMEs, tests.
- Save version unchanged (8). Tests: **71 passing** (2 new). `npm run build` needed.


## 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact

- **Replaces the old mining beam outright.** Same Shop slot and price (900 cr), but buying it
  now drops a `beam_basic` module into storage (the row reads *Owned* once it is somewhere you
  own, fitted or in storage). The `wp.beam` flag is gone from the save.
- **Fits either primary bay**, like a gun — Outfitting, fit it in a bay. **Key 2** selects the
  beam slot; with no beam fitted the slot is the `Empty weapon slot` and left click does nothing.
- **One ore per 4 seconds of uninterrupted contact** with the rock (scaled by the hull's `mine`
  multiplier, so the Prospector cuts faster). The ore banks per completed 4-second cycle; the
  rock depletes one ore at a time and disappears when dry.
- **Two seconds off the rock and the count toward the next ore resets.** Contact is timed per
  frame (`state.flight.beamT` / `beamIdle`); taking off the target for more than 2 s discards
  the in-progress ore with the message "Beam contact lost — the ore starts again". A fit
  change, dock/launch, load or warp clears the count too.
- **2 MJ/s while cutting** — reported as `setDraw("beam", …)` with a new `state.power.use.beam`,
  gated by `hasPower()`, and drawn only while actually mining (not with the slot merely
  selected, not without a rock in reach) — the same rules the guns follow.
- **Save version 8.** Saves from before 8 whose `wp.beam` was set (players who had bought the
  beam) get one `beam_basic` in storage on load — **not auto-fitted**; fit it once and carry on.
  Re-importing an old code cannot double-grant. The `beam` flag is dropped from the save.
- Files: `data/modules.js` (`beam_basic`), `data/weapons.js` (beam leaves weapon data; the
  shop row gains a `module` field), `sim/guns.js` (`beamsOf`, refreshes `state.beams`),
  `sim/weapons.js` (beam rewrite), `sim/sectors.js` (warp clears the count),
  `sim/economy.js` (shop purchase → module storage), `sim/fitting.js` (`ownsModule`),
  `state/state.js` (`flight.beamT`/`beamIdle`, `beams`, `power.use.beam`), `ui/hud.js` (slot
  line), `ui/screens.js` (shop *Owned* check), `state/profile.js` (v8 + migration),
  plus docs and tests.
- Behaviour note: the beam and the guns can coexist in the two primary bays; key 1/2 decides
  which left click fires. If two beams are fitted, the first bay's beam is the one that cuts.
- Tests: **70 passing** (4 new). `npm run build` needed.
- Known limit: the beam has no dedicated progress bar; the mining hum tracks the rock's
  remaining ore as before, and an interrupted count is only visible via the reset message.


## 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too

- **One wording for every empty primary slot.** With every primary bay empty, the top-right
  HUD line now reads `Empty weapon slot` (it said `No guns` before), and pressing 1 toasts
  `Empty weapon slot` instead of `Cannons equipped`. The slot behaves the same as the empty
  beam slot: left click does nothing, and the HUD and toast agree with each other.
- Unchanged: `Cannons` / `Cannons x2` with guns fitted, `Mining beam` with the beam bought,
  and left click firing only in a filled slot.
- Files: `src/ui/hud.js` (the primary line), `src/sim/weapons.js` (`setWeapon` toast),
  `tests/content.test.mjs` (guard: the old wording is gone), `TESTING-OUTFITTING.md`.
- Save version unchanged (7). Tests: 66 passing. `npm run build` needed.


## 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"

- **Pressing 2 selects the beam slot even with no mining beam bought.** The centre-screen
  message says **"Empty weapon slot"** (instead of refusing the switch or naming a weapon
  you do not have), the top-right HUD line reads `Empty weapon slot`, and **left click does
  nothing** in that slot — the guns only answer in the cannon slot, the beam only with the
  beam bought. Key 1 switches back to the cannon slot at any time.
- **Cycling model**: 1 = cannon slot (whatever the primary bays are fitted with — already
  symmetric: with no guns fitted it shows `No guns` and left click does nothing), 2 = mining
  beam slot (`Mining beam` once bought, `Empty weapon slot` until then).
- **Buying the beam** flips the slot to the beam without any extra step; the selected slot is
  saved as before (`pw` stays "beam" in a save, same as always) — no save change (still v7).
- Files: `src/sim/weapons.js` (`setWeapon` cycles slots unconditionally), `src/ui/hud.js`
  (the primary line names the empty slot), `tests/content.test.mjs` (wording guard).
- Behaviour change from the two earlier today entries: pressing 2 with no beam is no longer
  silent — it equips the empty beam slot and switches the HUD line with it.
- Tests: 66 passing. `npm run build` needed.


## 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message

- **Switching to an unavailable primary weapon is now silent.** Pressing 2 with no mining
  beam bought simply does nothing and says nothing, instead of toasting "No mining beam
  installed. Buy one in the station shop." The `"Cannons equipped"` / `"Mining beam equipped"`
  confirmations and every other message are unchanged; the beam still cannot be equipped
  until it is bought.
- Files: `src/sim/weapons.js` (`setWeapon`).
- Save version unchanged (7). Tests: 65 passing. `npm run build` needed.


## 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)

- **Follow-up to the twin-linked cannons below**: the two bolts no longer straddle the gun's
  bay mount (both came from the same side of the nose). A multi-barrel gun now fires from the
  **fixed nose hardpoints at -1.8 m and +1.8 m**, one bolt per side — the pre-module cannon
  layout. `BARREL_SPACING` in `sim/weapons.js` is now 3.6 m; single barrels still fire from
  their bay mount (`-1.8 + 3.6 * i`).
- Positions are the same whichever primary bay the gun sits in. Two twin-linked guns fitted at
  once (impossible today — one `cannon_basic` exists and nothing sells parts yet) would each
  fire their own pair from the same hardpoints.
- Rate, power draw, damage and the `barrels` stat are unchanged. No save change (still v7).
- Files: `sim/weapons.js` (hardpoint rule + comment), `docs/ARCHITECTURE.md`.
- Tests: 65 passing. `npm run build` needed.


## 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)

- **`cannon_basic` links two barrels** (`barrels: 2` on the module): one trigger pull now puts
  **two bolts** downrange, side by side (0.9 m apart, `BARREL_SPACING` in `sim/weapons.js`),
  straddling the gun's own mount — the way the cannons fired before they became a module.
  One gun in the first primary bay is enough for the pair of bolts.
- **Same fire rate, per barrel**: 3 shots a second per barrel, on the gun's own `1 / rate`
  cooldown as before. **Same power draw**: 2 MJ/s a gun while the trigger is held, however
  many bolts come out (the `guns` share in `state.power.use` counts guns, not bolts).
- **Damage per bolt unchanged** at 1 (before the hull's `dmg` multiplier), so a pair is 2
  damage per shot per gun; a Newbie Raider (10 hull) drops in about two seconds of fire from
  the stock fit. No behaviour change when both primary bays are filled: each fitted gun fires
  its own linked pair (four bolts a volley).
- **Outfitting bay shows it**: the stat line for the cannon reads `1 dmg x2, 3/s`.
- Files: `data/modules.js` (`barrels` + `rate` noted per barrel), `sim/guns.js` (carries
  `barrels`, default 1), `sim/weapons.js` (one bolt per barrel, `BARREL_SPACING`),
  `ui/screens.js` (`moduleStat` shows x2), docs (`ARCHITECTURE.md`, `HOW_TO_ADD.md` recipe 16,
  folder READMEs) and tests updated.
- **Save version unchanged (7).** `barrels` is a module stat, not saved data.
- Tests: 65 passing (2 new guard assertions plus the fire-loop rule). `npm run build` needed.


## 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull

- **Basic cannons are now a module** (`cannon_basic`, group `primary`): **1 damage a shot, 3
  shots a second, 2 MJ/s while the trigger is held**, 900 m/s bolts. Every hull is delivered with
  one in the first primary bay; the second bay starts empty. The same gun works in **either**
  bay — the bay only decides which barrel the shot leaves from — and both bays firing means two
  guns on their own 1/3-second cooldowns, 4 MJ/s while the trigger is down.
- **Left click still fires the primary.** Keys 1 and 2 still switch between cannons and the
  mining beam; the fitted guns are what actually shoot. An empty pair of primary bays means left
  click does nothing and costs nothing.
- **Guns draw power like everything else.** They report `setDraw("guns", …)`, so the power
  readout climbs by 2 MJ/s a gun while firing and drops back when you let go; with no power left
  they stop firing rather than draining a dead cell.
- **The flight HUD's primary line counts the guns.** Top right it reads `Cannons`, `Cannons x2`
  when both bays are filled, or `No guns` when they are empty (and `Mining beam` after key 2).
- **Pirate raiders are now "Newbie Raiders"** and have **10 hull points, no shields** — three
  seconds of cannon fire from the stock Wasp. The target lock and the HUD read the name instead
  of "hostile NN%", so a lock now says `Locked Newbie Raider 100%`. The 70 + 25-per-tier hit
  points are gone: every raider is the same 10-point hull now.
- **Files:** `data/modules.js` (`cannon_basic`, `STOCK_FIT.primary`), `data/weapons.js`
  (`PRIMARY.cannon` removed — guns are modules), `sim/guns.js` (**new**: `gunsOf`, `refreshGuns`),
  `sim/weapons.js` (per-gun cooldowns and barrels, the 2 MJ/s draw, `hasPower` gate),
  `state/state.js` (`state.guns`, `flight.gunCd`, `flight.gunsOn`, `power.use.guns`),
  `sim/{fitting,session,economy,power}.js` and `ui/menu.js` refresh the guns wherever the drive
  and shields are refreshed, `sim/ai.js` (`RAIDER` constant), `sim/targeting.js` (`lockName`),
  `ui/screens.js` (`moduleStat` shows `1 dmg, 3/s`), `ui/hud.js` (the primary line counts the
  guns).
- **Save version 7.** Older saves gain a basic cannon in their first primary bay (empty bays
  stay empty if the save is already v7).
- Tests: 64 passing (4 new: the cannon figures, either-bay gunnery, the version-7 migration, the
  Newbie Raider). `npm run build` needed (581 KB).
- Verified headless: 3 bolts a second and 1 damage each, 2 MJ/s a gun (4 with two guns), guns
  stop at 5.0 s on a 10 MJ cell with one gun and 2.5 s with two, no power means no shots, no gun
  means no draw, and `spawnPirate` makes a 10 HP "Newbie Raider" with no shield pool.


## 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back

- **The boost bar is now a fuel tank measured in units.** Basic thrusters hold **10 units**,
  burn **2 a second** while boosting (about five seconds from full to the reserve) and refill at
  **1 a second** when you let go. Mechanically nothing changed: the ignition still costs a flat
  20 MJ, filling the tank is still free, and the boost still doubles the drive.
- **The numbers are on the module** (`bmax: 10`, `buse: 2`, `bfill: 1` on `thruster_basic`), so a
  future thruster can carry a bigger tank or a thirstier boost without touching code — the same
  pattern as speed, turn and the power draw.
- **The HUD shows it.** The Boost line, top left, now reads like `Boost 8.4 / 10` beside the bar,
  so you can see the exact fuel as well as roughly how full it is. With no thrusters fitted it
  reads `none`.
- The old invisible numbers (a 0–100 meter, 28 a second out and 10 a second back) are gone;
  `state.drive` carries the tank, `sim/drive.js` sizes it (`P.enMax`), and the outpost fills it on
  launch.
- Files: `data/modules.js`, `sim/drive.js` (`driveOf`, `refreshDrive`), `sim/player.js` (burn and
  refill from the drive, small reserve before the boost will light), `sim/session.js` (full tank
  on launch), `ui/hud.js`, `src/index.html`, `styles.css` (the Boost reading).
- Tests: one new (the tank figures on the module and in the drive) plus the drive-shape
  expectations → **60 passing**. No save change: still version 6. `npm run build` needed (580 KB).
- Verified headless: launch 10.0 / 10, boosting 8 → 6 → 4 → 2 a second, boost cut out at 4.78 s
  with 0.5 left, refill 0.5 → 5.5 over five seconds, and no boost under 0.5 units.


## 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there

- **Shields now draw a straight 2 MJ/s all the time** while a shield module is fitted — full,
  filling or under fire, it is the same bill. The 1/2 split is gone, so `chg` is off the module
  and `draw: 2` replaces it.
- **If the ship cannot supply that 2 MJ/s** (powerplant gone and cells flat), the shields stop
  holding themselves together: they **discharge at 1 point a second** (`drain: 1`) down to 0, and
  **stay at 0** until the ship can pay again. Then the normal rule applies — the 4 second lull,
  then 1 point a second back.
- HUD with the basic fit: **2 MJ/s** parked, **4** flying, **5** boosting, **4** while shields
  fill after a fight, **2** with the shields pulled out.
- Files: `data/modules.js` (`draw: 2`, `drain: 1`, `chg` removed), `sim/shield.js`
  (`shieldDraw(shield)` is now flat, `updateShield` discharges when `hasPower()` says no).
- Tests: the shield power tests were rewritten and a discharge test added → **59 passing**.
  No save change: still version 6. `npm run build` needed (579 KB).


## 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging

- **Basic shields draw 1 MJ/s whenever they are fitted and up**, and **2 MJ/s in total while they
  are actually recharging**. Full shields still cost their 1 MJ/s; the extra 1 only applies while
  points are going back in.
- **The power bill is now a sum.** `state.power` gained `use: { drive, shield }` and
  `sim/power.js` gained `setDraw(system, mjps)`: the thrusters and the shields each report their
  own figure once a frame, and `draw` (what the HUD shows and `hasPower()` checks) is the total.
  A third consumer later is one more name in `use` and one `setDraw()` call.
- **The numbers live on the module** (`draw: 1`, `chg: 1` on `shield_basic`), so a better shield
  can be thirstier without touching code, the way thrusters already work.
- **No power, no recharge**: if the ship cannot pay the bill (no powerplant and empty cells) the
  shields hold where they are instead of filling, exactly as the thrusters lose thrust. They
  still show their standing 1 MJ/s of demand, the same way the drive shows its 2.
- Files: `data/modules.js`, `sim/shield.js` (`shieldDraw`, `updateShield` charges the ship),
  `sim/power.js` (`setDraw`, `refreshPower` clears both shares), `sim/player.js` (drive share),
  `state/state.js` (`power.use`).
- With the basic fit the HUD now reads **1 MJ/s** parked, **3** flying, **4** boosting, and **4**
  while flying with shields filling.
- Tests: 2 new (`shieldDraw`, and the power bill following the shields) plus rescaled
  expectations → **58 passing**. No save change: still version 6. `npm run build` needed
  (579 KB).


## 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot

Everything shield-related is divided by ten, so the numbers are easy to read at a glance.

- **Basic shields: 10 points** (was 100) and **1 point a second** (was 10). The 4 second lull
  before recharging, and the rule that any hit restarts it, are unchanged.
- **Pirate cannons do 1 damage a shot** (was 10), in `sim/ai.js`, so a fight against basic
  shields still takes the same number of hits: ten to strip the shields, then the hull.
- The shield bar in flight therefore moves a tenth at a time; with a cell-like cap of 10 it
  refills from empty in about ten quiet seconds.
- Tests rescaled to match (shield rules, the module figures, the pirate damage guard) →
  **56 passing**. No save change: still version 6. `npm run build` needed (579 KB).


## 2026-11-06: Shields are a module now; pirate cannons do 10 a shot

- **New module: `shield_basic` ("Basic shields")**, fitted to every hull from the start and
  fittable in the shield bay that was already in the Outfitting layout. It holds **100 shield
  points**, recharges at **10 points a second**, and will not start recharging until the ship has
  gone **4 seconds without being hit**. Any hit inside that lull restarts the clock, so the
  recharge is off for as long as somebody is shooting at you.
- **Shields are no longer a hull stat.** `SHIPS` lost its `sh` field (and the Hangar row no
  longer quotes a shield figure); `sim/shield.js` turns the fitted module into `state.shield`
  (`cap`, `regen`, `delay`) and `P.shMax`. No shield module means no shields: every hit goes
  straight to the hull.
- **Pirate cannons now do 10 damage a shot** (was 7), in `sim/ai.js`. Against basic shields that
  is ten hits to strip them, then ten more for a Wasp's hull.
- **Save version 6.** Saves from v5 or older have an empty shield bay because the group did not
  exist then, so they are retrofitted with basic shields on load (same rule the thrusters got in
  v5). A v6 save where the player really took the shields out stays shieldless. `cleanLoadouts`
  now keeps a list of groups added after a save's version instead of one flag per group.
- Files: `data/modules.js` (`shield_basic`, `STOCK_FIT.shield`), new `sim/shield.js`
  (`shieldOf`, `refreshShield`, `updateShield`), `state/state.js` (`state.shield`),
  `state/profile.js` (v6 + retrofit), `sim/player.js` (no shield stats on the ship, recharge
  moved out of `flight()`), `main.js`, `sim/fitting.js`, `sim/session.js`, `sim/economy.js`,
  `ui/menu.js` (refresh on dock/fit/ship change/load), `ui/hud.js` (bar copes with no shields),
  `ui/screens.js` (`100 shields` in the bay, Hangar row without a shield figure), `sim/ai.js`.
- **Special shields later:** a module that recharges even under fire is one more field read by
  `updateShield()` (for example `live` for a reduced under-fire rate). Nothing outside
  `sim/shield.js` needs to change for that.
- Verified headless: ten 10-damage hits took 100 → 0 shields with the hull untouched, hit 11
  took 10 hull; with a hit at t=0 the shields sat still at 90 through 3.9 s and were full again
  by 5 s; with the bay empty a 10-damage hit cost exactly 10 hull.
- Tests: 3 new files' worth — shield rules (`tests/shield.test.mjs`, 6 tests), the module and
  stock fit, the v5 → v6 retrofit, the pirate damage figure, and equip/unequip moving `P.shMax`
  → **56 passing**. `npm run build` needed (579 KB).


## 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free

The boost now works like a car ignition: expensive to start, cheap to run, and filling the tank
costs nothing at all.

- **Ignition: 20 MJ in one gulp.** When the spool-up finishes and the shake fires, 20 MJ comes
  straight out of the cells (`ign: 20` on `thruster_basic`). With the basic 100 MJ cell that is a
  visible 100 → 80 drop in the bar, and the boost **will not light** unless the cells hold 20 MJ.
- **Burning the boost: 2 + 1 = 3 MJ/s.** The extra 1 MJ/s (`boost: 1`) is now charged only while
  the boost is actually firing, instead of while the meter was filling.
- **Filling the boost meter costs nothing.** The old +1 MJ/s charge draw is gone; the meter still
  fills itself at the same rate, free, at any throttle setting.
- Everything else stands: 2 MJ/s while the throttle is off centre, nothing at exactly zero, and a
  ship with no power has no thrust (the speed winds down).
- Files: `data/modules.js` (`boost` replaces `chg`, `ign: 20`), `sim/drive.js` (`driveOf` carries
  `boost`, `driveDraw(drive, throttle, boosting)`), `sim/player.js` (draw from the burning boost,
  ignition takes 20 MJ out of `stored` and needs that much there, meter refills free),
  `sim/power.js` (comments).
- Verified headless: idle = 0 MJ/s with the boost filling free; flying = 2; boosting = 3; the
  ignition frame dropped the cells 20.03 MJ; with 15 MJ in the cells, Shift did nothing at all.
- Tests: the existing power tests were updated to the new figures → **46 passing**. No save
  change: still version 5. `npm run build` needed (578 KB).


## 2026-11-06: Thrusters use power, and a dry cell winds the speed down

Basic thrusters now drink from the power cells. The numbers live on the module in
`data/modules.js` (`draw: 2`, `chg: 1`, `ign: 1`), so a better thruster can be thirstier.

- **2 MJ/s whenever the throttle is off centre** — 100%, 99%, 1%, -1%, -30%, -100% all count.
  Only a throttle of exactly zero (X, or hands off once it has been set to 0) draws nothing.
- **1 MJ/s more while the boost meter is filling.** The meter fills by itself whenever the ship
  has power to spare, so the readout often sits at 1 MJ/s when the ship is idle and at 3 MJ/s
  while flying and charging.
- **1 MJ flat, each time the boost lights.** Charged on the frame the boost engages, out of the
  cells' stored energy.
- **Out of power means no thrust, and the speed winds down.** `hasPower()` in `sim/power.js`
  answers whether the cells (or a plant that covers the demand) can pay; when they cannot, the
  drive's speed is treated as 0 and the usual drag model bleeds the speed away instead of
  stopping the ship dead. Boost is refused too. Turning still works, so a dry ship can aim.
- Files: `data/modules.js` (draw/chg/ign), `sim/drive.js` (`driveOf` carries them, new
  `driveDraw`), `sim/power.js` (new `hasPower`), `sim/player.js` (sets `state.power.draw`,
  gates thrust on power, charges and ignition costs), `ui/hud.js` unchanged (it already shows
  `Using X of Y MJ/s`).
- Verified headless: full throttle = 2 MJ/s, throttle 0 with a full boost = 0, idle charging =
  1, flying + charging = 3; ignition takes exactly 1 MJ plus the frame's 2 MJ/s; with no plant
  and 3 MJ left the ship went 52 → 33 → 21 → 14 → 9 → 5 → 2 m/s after the cells emptied.
- Tests: 3 new (`driveDraw` for every throttle setting, the power figures on the module,
  `hasPower`) → **46 passing**. No save change: still version 5. `npm run build` needed (578 KB).
- **Consequence to know about:** a plant-less ship that flies until the cells empty cannot fly
  home. That is the point of the rule; docking is only possible if you get back first.


## 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls

- Undocking with no thrusters and then pressing **anything that would move the ship** now shows
  the warning **"Equip thrusters to move"** in the centre of the screen. It covers W/S (thrust),
  A/D (strafe), Space/C (lift), Q/E (roll), Shift (boost) and the mouse, and it repeats every
  three seconds while a control is still held, so it reads as a reminder instead of flickering.
- Nothing else changed: the ship still cannot move, turn or boost, the throttle stays at 0, the
  launch message and the standing hint line ("No thrusters fitted: press G to dock and fit one.")
  still explain how to get back to the outpost.
- The warning lives in `sim/player.js` (`tryingToMove()`, `NO_DRIVE_WARN`, `state.player.noDriveT`)
  and is shown with the ordinary centre-screen message, so it never stacks up.
- Tests: a guard test keeps the exact wording and the "only when a control is pressed and there
  is no drive" rule in place → **43 passing**. No save change: still version 5.
  `npm run build` needed (578 KB).


## 2026-11-06: No thrusters means no movement, no turning and no boost

- **An empty thruster bay is now a dead ship.** `driveOf()` returns `{ spd: 0, turn: 0 }`
  instead of falling back to a speed the hull used to carry, so with no thrusters fitted the
  ship cannot thrust, strafe, lift, turn or boost. The throttle is held at 0, so the engines
  stay cold, the boost ramp never starts and the boost bar is never spent.
- **Hulls no longer have `spd`/`turn`** (`data/ships.js`). Speed and turn live only in the
  thruster module; `npm test` now fails if a hull grows a speed of its own again. When hulls
  should handle differently, that is a multiplier in `sim/drive.js`, not a base speed.
- **The player is told, and can get back:** `launch()` puts the ship 200 m from the outpost
  (inside the 300 m docking range, so an immobile ship can dock straight back), refreshes the
  drive, and shows *"No thrusters fitted: the ship cannot move. Press G to dock and fit one."*
  The HUD repeats *"No thrusters fitted: press G to dock and fit one."* while the ship cannot
  move, so the dead controls have a reason on screen.
- Files: `sim/drive.js` (no fallback, new `hasDrive`), `sim/player.js` (throttle and boost
  gated on the drive), `sim/session.js` (launch distance, message, `refreshDrive()`),
  `ui/hud.js` (prompt), `data/ships.js` (no `spd`/`turn`), `tests/content.test.mjs`,
  `tests/fitting.test.mjs`.
- Verified headless: 10 s holding every control (W S A D Space C Shift, mouse hard over) moves
  an empty-bay ship **0 m and turns it 0°**, on all three hulls; with the basic thrusters
  nothing changed (150 m/s flat out, 295 m/s boost, same turn rate).
- Tests: **42 passing**. No save change: still version 5. `npm run build` needed (578 KB).


## 2026-11-06: Paint bays are clickable, and show an empty colour store

- **The two Appearance bays are buttons like module bays.** Clicking one opens the picker
  rectangle under the card, with a Close button and the message **"No colours in storage."**
  Clicking the open bay again, or Close, shuts it, and the open bay gets the pale blue edge.
- **One picker at a time across the whole screen**: opening a module bay closes an open paint
  picker and the other way round.
- **No paint data and no save change.** Colours will be stored and fitted the same way
  modules are, and this picker becomes that list of colours when they arrive; until then the
  empty message is the whole content.
- The click rule moved into a new `src/ui/picker.js` (`toggleModulePicker`,
  `togglePaintPicker`) so it is a pure function that can be tested without a browser.
  `ui/menu.js` `slot`/`paint` call it, and `fit`/`unfit` now check that the open picker is
  really a module bay. `state.ui.fit` gained a `kind` field ("module" or "paint").
- Tests: 3 new in `tests/picker.test.mjs` (the toggle, one-at-a-time, and paints and modules
  sharing the picker). `npm test` now runs 40.
  `game/tallow-reach.html` needs `npm run build` (577 KB).


## 2026-11-06: Fix: the Appearance bays lost their boxes

- The two paint bays on the **Appearance** card are plain divs, while module bays are now
  buttons. When the bays became clickable, the box styling (border, background, padding,
  grid) was written on `button.mod-bay`, so the paint bays no longer matched any rule and
  collapsed into bare inline text reading **"PRIMARYEmpty"**.
- The box is back on the bare `.mod-bay` class, which every bay uses whatever its tag;
  `button.mod-bay` now only carries the button reset (font, colour, cursor). The Appearance
  card is two dashed boxes side by side again, "Primary / Empty" and "Secondary / Empty",
  the same size as the Primary weapons bays.
- Tests: 1 new guard (now 37) that reads `src/styles.css` and fails if the box properties
  ever move onto the button selector again. No save or gameplay change.
  `game/tallow-reach.html` needs `npm run build` (577 KB).


## 2026-11-06: Basic thrusters, and every hull flies like the Wasp

- **The thruster bay has a module now**: `thruster_basic` in `src/data/modules.js`, "Basic
  thrusters", top speed **150 m/s** and turn **1.2** — the Wasp's old hull figures, copied
  exactly, so a Wasp with them fitted flies precisely as it did before modules existed.
  Boost is still 2x, strafe/lift/reverse are still the `FLIGHT` fractions.
- **Speed and turn now come from the thrusters, not the hull.** New `src/sim/drive.js` turns
  the fitted thruster into `state.drive = { spd, turn }`; `sim/player.js` and
  `render/camera.js` read that and nothing else. Measured in a headless flight probe:
  Wasp, Prospector and Bulwark all reach **150 m/s**, **295 m/s** on boost and turn at
  **69 deg/s** — identical, as asked. Hull differences are a later job and belong in
  `driveOf` as multipliers.
- **A hull with no thrusters fitted falls back to its own `spd`/`turn`** from `data/ships.js`
  (measured: Bulwark 90 m/s, 40 deg/s). That is deliberate: without it, a player who unequips
  the drive and launches would be stranded in space with no way back to the outpost.
- The Outfitting card shows `Basic thrusters` / `150 m/s` and the count `1 / 1`.
- **Save: `SAVE_VERSION` 4 -> 5.** The saved shape is unchanged; the version marks the point
  from which thrusters exist. A save made before 5 has its empty thruster bay filled with the
  stock drive on load (that bay was never a choice), while a save at 5 keeps a bay you chose
  to empty empty.
- Tests: 2 new and 1 extended (every hull flies like the old Wasp on stock thrusters; the
  hull fallback; the thruster module's fields; unequip/refit moving `state.drive`).
  `npm test` now runs 36. `game/tallow-reach.html` needs `npm run build` (576 KB).


## 2026-11-06: Click a bay to fit a module, or unequip one into storage

- **Every module bay is a button.** All eight bays across the seven groups can be clicked.
  Clicking one opens a **picker rectangle under that card**; clicking the same bay again, or
  **Close**, shuts it. Only one picker is open at a time.
- **The picker holds squares, one per stored part that fits that group**, each with the
  part's name and number (`Basic powerplant` / `10 MJ/s`). With nothing stored it reads
  **"No modules in storage."** exactly as asked, and that is what a new game shows.
- **Unequip**: a filled bay gets a button at the bottom of its picker, "Unequip Basic
  powerplant to storage". The part leaves the bay, lands in the new module store
  (`profile.modules`) and appears in the picker as a square, ready to go back in. Fitting
  into a full bay swaps, sending the part it replaced to storage.
- **Fitting is instant and updates the ship at once**: every fit/unequip refreshes the power
  budget, so taking the powerplant off turns 10 MJ/s into 0 MJ/s before you launch. Docked,
  the cells refill as usual.
- **Nothing can be bought yet**, so the only way to get a part into storage is to take it off
  a hull. That is deliberate: the shop is the next step.
- Save: **`SAVE_VERSION` 3 -> 4**, adding `profile.modules` (a list of module ids). Older
  saves load with an empty store and their fitted parts untouched; unknown ids are dropped
  and a corrupted value empties the store rather than failing the load.
- Files: new `src/sim/fitting.js` (`fitModule`, `unequip`, `storedFor`, `fittedAt`);
  `ui/screens.js` (bay buttons and the picker), `ui/menu.js` (`slot`, `fit`, `unfit`
  actions), `state/state.js` (`ui.fit`), `styles.css`, `state/profile.js`.
- Tests: 6 new in `tests/fitting.test.mjs` (new game, unequip, re-fit, the refusals, the
  swap, and the old-save migration). `npm test` now runs 34.
  `game/tallow-reach.html` needs `npm run build` (576 KB).


## 2026-11-06: Basic powerplant and power cell, with a power bar in flight

- **Modules exist.** `src/data/modules.js` holds the first two: **Basic powerplant** (10 MJ/s)
  and **Basic power cell** (100 MJ). Every hull is delivered with both fitted.
- **Per-hull bay layouts.** Bay counts moved out of `MODULE_GROUPS` into `SHIP_LAYOUTS`
  (`src/data/outfitting.js`), one entry per hull. All three are a straight copy of the Wasp's
  today (1 powerplant, 1 cell, 1 thruster, 1 shield, 2 primary, 1 secondary, 1 hull), so a big
  hull can be given a different arrangement later by editing its own line. `slotsFor()` and
  `layoutFor()` are the only readers; a test fails if a hull is missing a group's count.
- **The Outfitting screen shows what is fitted.** Fitted bays are now solid, with the part's
  name and its headline number (`Basic powerplant / 10 MJ/s`), and the group count reads
  `1 / 1`. Empty bays still read `Empty`.
- **Power in flight.** New `src/sim/power.js` turns the fitted modules into
  `state.power = { gen, cap, stored, draw }` (10 MJ/s, 100 MJ, 100 MJ, 0 MJ/s at the start) and
  charges the cells every frame. Bottom centre, above the throttle line, the HUD now shows a
  **Power cell** bar with `100 / 100 MJ` and `Using 0 of 10 MJ/s`. It reads `No power cell` if a
  hull has none fitted. Cells are full when you launch and topped up by the outpost on dock.
- **Nothing draws power yet.** `draw` is 0, so the bar sits full; the first system that needs
  energy (shields, the mining beam) only has to add to `state.power.draw` and the cells start
  moving. That is the one line to remember.
- **Save change: `SAVE_VERSION` 2 -> 3**, adding `profile.loadout`: per hull, per group, one
  entry per bay (`null` for empty). Old saves and new hulls get the stock fit
  (`STOCK_FIT` in `data/modules.js`); a bay the player really emptied stays empty, unknown
  module ids and bays beyond a hull's layout are dropped. A ship bought in the Hangar comes
  with the stock fit; a destroyed ship's loadout is deleted with it.
- Tests: 4 new (module data and its group, every hull's layout, a new game's 10 MJ/s into
  100 MJ, the old-save migration and dropped modules, and the charge/overflow/empty maths).
  `npm test` now runs 28. `game/tallow-reach.html` needs `npm run build` (572 KB).


## 2026-11-06: Powerplant talks in MJ/s, not MW

- The Powerplant card now reads **"Energy the ship makes every second, in MJ/s."** instead of
  "Power the ship produces, in MW." The Power cells card reads **"Energy the ship can hold,
  in MJ."** Both cards now describe energy in the same units, one "per second in", one
  "stored", which is easier to read than a megawatt with nothing to compare it to.
- **This is wording only.** 1 MJ/s is exactly 1 MW, so any module numbers written later mean
  the same figure in either unit and nothing needs rebalancing.
- One file changed: `src/data/outfitting.js` (`MODULE_GROUPS`). No gameplay, save, layout or
  visual change. Tests unchanged at 24. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-06: Appearance card under the Hull bay

- **New card at the bottom of the right-hand column: Appearance**, directly under the Hull
  group. It holds **two paint bays, Primary and Secondary**, both reading `Empty` with a
  `0 / 2` count, and a line saying the standard livery is used until a colour is fitted.
- It is layout only. **No paint exists, nothing can be bought or fitted, and no gameplay,
  save field or `SAVE_VERSION` changed.** Paints will be bought, stored and fitted the same
  way modules are; the card is drawn by the same code as the module cards, so they will
  look identical when that arrives.
- The bays come from the new `APPEARANCE_SLOTS` in `src/data/outfitting.js` (`k` id, `n`
  name). Add an entry and one more paint bay appears; the card always sits last, under the
  hull group, so adding module groups does not move it.
- `ui/screens.js`: `appearanceHtml()`, appended last in the right rail. The screen's intro
  line now says modules and paints arrive in a later update.
- Tests: 1 new (the two paint slots have unique ids and names, primary before secondary).
  `npm test` now runs 24. `game/tallow-reach.html` needs `npm run build` (569 KB).


## 2026-11-06: Outfitting screen with a 3D ship viewer

- **New tab: Outfitting**, between Hangar and Shop. On this tab the outpost panel opens
  up to the middle of the screen (`#panel.wide`, up to 1180 px), so the ship has room.
- **The ship sits in the middle of the screen** in its own 3D window, drawn by a second
  renderer (`src/render/shipviewer.js`) on a transparent canvas over a dark gradient.
  It turns slowly on a display ring; drag to spin it, scroll to zoom, double click to reset.
  The idle turn pauses for 3 s whenever you take hold of it, and is off altogether if the
  system asks for reduced motion. Ships are normalised to the
  same bounding sphere, so no hull is clipped and none looks tiny.
- **Module groups surround it**, four down the left and three down the right, in the same
  card for every group: name, `filled / bays` count, one bay box per slot (all read
  "Empty"), and a line saying what the group decides. The layout is driven entirely by
  the new `src/data/outfitting.js`, so adding a group there is enough (recipe 15).
- **Bays today:** powerplant 1, power cells 1, thrusters 1, shields 1, primary weapons 2,
  secondary weapons 1, hull 1. Nothing is fitted and **no module exists in the game yet**;
  no gameplay number, save field or balance was touched, and `SAVE_VERSION` is unchanged.
- `ui/outfitting.js` mounts the viewer into `#shipview` after every panel redraw (the panel
  rebuilds its HTML, which throws the canvas out but does not destroy it) and draws one
  frame from the main loop through `updateOutfitting(dt)`. It does nothing unless you are
  docked on that tab.
- The ship window needs WebGL; if the browser refuses a second context the panel says so
  instead of showing an empty box.
- Tests: 1 new (`MODULE_GROUPS`: unique ids, a name and description each, whole-number bay
  counts, `slotsFor` agrees, and the intended 2 primary bays / 1 everywhere else).
  `npm test` now runs 23. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: The chase camera stops running away at speed

- **The view no longer backs off as you accelerate.** It used to trail further the faster you
  went: 16.8 units behind the ship at 37% throttle, 26.9 at full throttle, and **43 at full
  boost**, which read as the camera flying backwards.
- The trail is now a fixed, bounded line in speed (`CAMERA` in the new `src/data/camera.js`):
  **11.0** standing still, **17** at full forward speed (throttle 1 plus boost) and **10.5** at
  maximum reverse. Everything between is linear in speed, and the two ends are hard limits, so
  no speed can push the view past 17 or pull it closer than 10.5. Measured in game: idle 11.0,
  100% throttle 13.9, full boost 17.0, full reverse 10.5.
- Both limits are per hull (`spd * 2` forward, `spd * FLIGHT.reverse` backwards), so the slower
  ships reach the same numbers at their own top speed instead of trailing less forever.
- **Two real bugs behind the old behaviour**, both fixed in `render/camera.js`:
  1. The chase point was built with `localToWorld()`, which reads `matrixWorld` — a matrix only
     refreshed when the scene is drawn, i.e. last frame's transform. The offset therefore
     included one frame of the ship's travel, growing with speed. It is now built from the
     ship's position and quaternion directly.
  2. The camera eased its position in world space toward that point, so the ship's own travel
     counted as camera error and the steady-state gap was `speed / 10`. The camera now rides
     along with the ship's per-frame movement (`_delta`) and eases only the offset, so speed
     cannot drag it back at all. Turning still swings the view (about 5 degrees of trailing at
     full stick), and a jump to a new sector is ignored so the arrival still snaps cleanly.
- Tests: 1 new (`cameraTrail` is bounded, monotonic, and hits 11 / 17 / 10.5 at idle / top /
  reverse). `npm test` now runs 22.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters

- **Turning:** every hull now turns at 70% of its old rate (`FLIGHT.turn = 0.7`). Each ship's own
  `turn` stat still sets the character of the hull, so a Wasp is still twice as nimble as a Hauler;
  the 0.7 is applied on top. Measured in game (Wasp, stick held hard over): 66 deg/s, against
  99 deg/s before, a ~30% reduction.
- **Forward thrust is unchanged.** `spd` is still the top speed of the main drive and Shift still
  doubles it.
- **Sideways, vertical and reverse thrusters are now a fraction of the forward drive:** strafe
  (A/D) 30%, lift (Space/C) 30%, reverse (S below zero throttle) 30%. Measured strafe settles at
  45 m/s on the Wasp (0.3 x its 150 m/s forward speed) and boost still peaks at 2x forward (292 m/s
  observed). The point is that a ship is fastest going forward; its manoeuvring thrusters are not.
- The fractions live in one new table, `FLIGHT` in `src/data/ships.js` (`turn`, `strafe`, `lift`,
  `reverse`). `sim/player.js` reads it, so this is now the single place to retune the feel of
  every ship at once. The old hard-coded `0.45` strafe and `0.4` lift are gone.
- Tests: 1 new (the `FLIGHT` fractions are per-ship fractions of `spd`, and `turn` is a 0..1
  multiplier). `npm test` now runs 21.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it

- Pressing M no longer slams the ship to a halt or snaps its turn off.
- **Speed:** the throttle is released (exactly as pressing X does) and the existing drag model
  bleeds the speed off, so you coast down. Measured from 102 m/s: 94, 82, 75, 66, 60, 55, 48,
  44, 38 m/s across the charge. `startWarp()` no longer zeroes `P.v`; only the arrival does,
  under the white-out, where it cannot be seen.
- **Turning:** the stick position (mouse x/y and Q/E roll) is captured when the drive engages
  and eased back to neutral over the new `WARP_COAST.steer` (0.6 s) in `data/sectors.js`, via
  the pure helper `warpSteerEase(t)`. A held turn keeps turning for a moment and winds down.
  Strafe, lift, boost and throttle input are ignored for the whole sequence.
- `sim/player.js` no longer returns early during a warp. It runs the whole flight model with
  the inputs released, so momentum, drag, asteroid collisions and shield recharge all behave
  normally while the drive is engaged. Weapons are still cut, in `sim/weapons.js`.
- Removed the `P.snap` camera lock added with the roll fix: with the roll gone it only caused
  a small jump on the frame M was pressed. The camera simply keeps tracking the ship, which is
  now easing its turn out.
- Tests: 1 new (`warpSteerEase` is 1 at the start, about half way through, 0 after, and the
  ease finishes before the sector changes). `npm test` now runs 20.
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Fix: no rotation when warping

- Pressing M no longer turns or tilts the view. `render/camera.js` no longer rolls the
  camera during a warp; the FOV widening stays.
- Why it happened: the roll was added as a **fixed 0.05 radians per frame** instead of
  per second. That is a hidden frame-rate dependency — at 30 fps it was a slight 6 degree
  lean, but on a 144 Hz or 240 Hz display the same code compounded into a huge rotation over
  the two-second warp, which is what the player saw ("the ship rotates right and it warps
  when it is about 180 degrees").
- `sim/sectors.js` also sets `P.snap = true` when a warp starts, so the chase camera locks
  onto the ship's heading on that frame instead of continuing to catch up. Nothing swivels
  when the drive engages.
- Measured after the fix: the ship's apparent roll across a whole warp changes by less than
  0.5 degrees (it was 6 degrees at 30 fps before, and much more at high refresh rates).
- Save format: unchanged. `game/tallow-reach.html` needs `npm run build`.


## 2026-11-05: Warp animation, warp sound, and a two-second warp

- A warp is no longer instant. It is a sequence of about two seconds, tuned by the new
  `WARP` block in `data/sectors.js`: `charge` 1.1 s (drive spins up), `flash` 0.18 s
  (white-out, and the sector changes at the start of it), `settle` 0.72 s (drive winds
  down). `WARP_TIME`, `WARP_SWITCH_AT`, `warpPhaseAt(t)` and `warpFlashAt(t)` are exported
  so the visuals and the tests read the same numbers.
- **Control is locked for the whole sequence.** `sim/player.js` pins the ship (throttle and
  drift zeroed) and `sim/weapons.js` skips cannons, the beam, lock-on and missile launches;
  missiles already in flight keep going. Docking is refused mid-warp (`main.js`). Control
  comes back on the frame the sequence ends.
- `state.warp` holds the sequence while it runs: `{ from, to, t, fx, flash, switched }`.
  `fx` runs 0 -> 1 -> 0 over the whole warp and drives the visuals; `flash` peaks at 1 at
  the moment the sector changes. Both are recomputed from the clock every frame, so the
  picture cannot drift from the simulation.
- Look: `render/warpfx.js` draws 130 additive line streaks hanging off the camera, which
  close on the ship faster and stretch as the drive builds. `ui/warpflash.js` adds two
  full-screen gradients (a tunnel vignette that follows `fx`, and the white-out that follows
  `flash`). `render/camera.js` widens the FOV by up to 16 degrees and rolls slightly during
  the warp. No post-processing and no new dependencies.
- Sound: `warpCharge(dur)` in `core/audio.js` (rising whine, air rushing past, sub-bass
  swell) and `warpBurst()` at arrival (noise slam, thump, shimmer). Both are procedural, like
  everything else.
- New events: `warp-start { from, to }` and `warp-end { from, to }`, listed at the top of
  `util/events.js`. `sector-changed` now fires mid-warp, at the white-out.
- A warp is cancelled by docking (`sim/session.js`), which covers dying mid-warp: you never
  end up half-way between sectors.
- Performance note for the next session: the first version of the overlay (a masked
  `repeating-conic-gradient` behind a CSS mask) halved the frame rate, 32 -> 13 fps in a
  software renderer. It was replaced with the 3D streaks plus two plain gradients, which
  measures 32 -> 26 fps. Keep the overlay to plain gradients.
- Tests: 2 new (`warpPhaseAt` order and length, `warpFlashAt` shape). `npm test` now runs 19.
- Save format: unchanged (`SAVE_VERSION` stays 2). Warp state is runtime only.
- `game/tallow-reach.html` is unchanged; run `npm run build` to regenerate it.


## 2026-11-05: Second sector, warp on M

- There are now two sectors. **Tallow Reach** is the old one (outpost, planet, asteroid
  field). **Kestrel Hollow** is new and deliberately empty: you arrive in open space with
  nothing in it, and none of Tallow Reach's scenery, markers or rocks can be seen from it.
- **M warps** to the next sector on the chart and back again (an action, so it goes through
  `core/input.js` -> `main.js` like the other keys). It only works while flying: not docked,
  not paused. A warp clears hostiles, shots, crates and particles, drops you at the sector's
  arrival point at rest, and snaps the camera.
- New `src/data/sectors.js`: the sector table (`n`, `d`, `sn` arrival point, and the flags
  `st` outpost / `fd` field / `foes` raiders), `SECTOR_IDS` (the warp order) and
  `DEFAULT_SECTOR`. Tuning and new sectors go here.
- New `src/sim/sectors.js`: `enterSector(id)` and `warpToNext()`.
- `render/scene.js` now gives each sector its own `THREE.Group`, made on first use, with
  `sectorGroup(id)` and `showSector(id)`. The outpost, planet and atmosphere are built into
  the starting sector's group, so hiding a sector is a visibility toggle. The starfield is
  the backdrop of every sector, so it stays.
- `sim/world.js` keeps a parked rock list per sector, so `state.world.asteroids` always
  holds the current sector's rocks and every system can keep reading it directly. Mining,
  collisions, lock-on, bullets and missiles therefore find no rocks in Kestrel Hollow, and
  the field comes back exactly as you left it (same rocks, same mined-out ones).
  Also new: `clearWorldObjects()` (clears crates and particles too, used by the warp).
- Everywhere that assumed the outpost sits at the origin now checks the sector flags:
  the keep-out bubble (`sim/player.js`), docking (`sim/session.js`, which also returns you
  to the starting sector), station lock-on (`sim/targeting.js`), the pirate spawner
  (`sim/ai.js`) and the HUD markers and dock hint (`ui/hud.js`).
- The HUD's top-right readout now starts with the sector name.
- New event `sector-changed { from, to }`, listed at the top of `util/events.js`.
- Docs: how-to recipe 14 (a new sector) added; folder READMEs updated.
- Save format: **unchanged** (`SAVE_VERSION` stays 2). `state.sector` is runtime only, so you
  always launch in Tallow Reach and a reload puts you back there. No migration needed.
- `game/tallow-reach.html` is unchanged; run `npm run build` to regenerate it.


## 2026-11-05: Project tidy for growth (no gameplay change)

- Contract types are now defined in one place. `data/contracts.js` has `CONTRACT_TYPES`,
  `CONTRACT` generators and a new `DESCRIBE` table. The offer board (`sim/contracts.js`), the
  saved-game loader (`state/profile.js`) and the contract wording now read from it. Before, the
  number `3` and the type list were repeated in three files, so adding a fourth type would
  have failed silently. Output was checked identical to the old code across 3,000 seeded boards.
- `ui/screens.js`: outpost tabs are drawn through a `SCREENS` table instead of an if-chain.
  Two very long text lines were split into readable pieces. The HTML produced is identical.
- `styles.css` reformatted to one declaration per line with labelled sections. Verified equivalent
  to the old file after minifying.
- New: `docs/HOW_TO_ADD.md` (recipes), a `README.md` in each `src/` folder, "File map",
  "Conventions" and "Known gaps" sections in `docs/ARCHITECTURE.md`, this changelog.
- New tests: `tests/content.test.mjs` checks every ship, item, weapon, base module and contract type.
- `package.json`: `npm test` now runs `node --test` (the old `node --test tests/` form fails on newer Node versions).
- Save format: unchanged (`SAVE_VERSION` stays 2).
- `game/tallow-reach.html` was updated by hand-patching, because the build tools were not
  available in that session. It plays identically to a fresh build. Run `npm run build`
  once to regenerate it cleanly.


## 2026-11-05: Pause menu and mute

- The M key no longer mutes. `KeyM` was removed from `BINDINGS` in `core/input.js` and the
  `mute` case from `main.js`.
- The pause menu (`ui/pause.js`) now has four rows: big PAUSED, "P or Esc to resume", a
  Sound on/off switch (it calls `toggleMute()` in `core/audio.js`), and the Resume button.
  Styles are under "Pause overlay" in `styles.css`.
- Help texts that mentioned the M key were updated (`index.html`, `ui/screens.js`).
- Save format: unchanged. Mute state is not saved, so sound starts on every time.


## 0.2.0: Baseline

- Modular source split out of the original single-file prototype (`reference/original-tallow-reach.html`).

