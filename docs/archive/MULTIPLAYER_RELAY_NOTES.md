# Relay diagnosis notes, moved out of docs/architecture/multiplayer.md

Moved here word for word on 2026-11-25, when the area doc was over its size limit. Still true,
still the first thing to read when two machines cannot meet.

**Reachable is not usable.** Playtest 6 showed `Relays reachable: 3 of 5` on both machines and still one
browser in each room: a relay can accept a WebSocket and then refuse the game's events (`blocked:`,
`restricted:`, `auth-required:`), and the library **retires** it silently. The count that matters is
its own, `getRelaySockets()`, printed as **`Relays connected: N`** — which is why the pinned list keeps
more than one family of servers: a live relay that will not carry this protocol is worse than a dead
one, because it inflates a number.

Whatever the relays do, **the copy/paste codes work without them** — two players swap two codes and the
browsers connect directly. After `NET.helloWaitSec` with nobody in the room the session marks itself
**stalled** (`armStallTimer`), the host's screen auto-creates the offer (`autoOfferWhenStalled`, once
per screen opening), a stalled guest gets the paste box on the pause card, and `net/paste.js` always
offers `ICE.turn` beside its STUN — a player reaching for codes has already learned the easy route
failed, so the only question left is whether a path exists at all.

**The relays are pinned, and their health is on screen.** This is the one failure that looks
impossible from inside the game: same build, same world id, both `finding`, **one browser in each
room and zero messages sent** — the introduction itself never happened, so the path, the relay and
the handshake are all irrelevant (playtest 5). The library picks *five of thirty* public signalling
relays by `shuffle(defaults, strToNum(appId)).slice(0, 5)`; the app id makes it the same five on every
machine, which makes the failure look like a contradiction — but this game's five were three obscure
or dead servers, so both players subscribed to the same silence. `RELAYS.relayUrls` in
`data/multiplayer.js` therefore **names the relays** (six long-running ones; the library uses the
first five) and `transport.checkRelays()` opens a WebSocket to each and counts the answers, shown as
**Relays reachable: N of 5** (asked when the screen opens, on Reconnect, cached 20 s). **0 of 5**
means the player's network blocks them and no retry can help — the block says so and points at the
copy/paste code path, which needs no relay at all. Tests must never probe: `setRelayProbe(null)`.

---

Moved here word for word on 2026-11-25 (second move from the same file, the size limit again).

**Two machines need a path; one machine never does.** The signalling relay introduces the two
browsers and both sides then believe they are connected — but the *data* connection needs a network
path, and a home network often has none: no hairpin NAT, and the local addresses Chrome hides behind
`*.local` mDNS names get dropped by a firewall or a multicast-hostile router. Two tabs on one machine
share a process, so the failure is invisible there (LESSONS L35). The answer is `ICE.turn`
(`data/multiplayer.js` — the game's own **ExpressTURN free-tier** account since 2026-11-22, after the
three public relays it used to list were measured dead from the owner's PC) handed to the library as
`turnConfig`, used
**only after** `NET.helloWaitSec` of a direct attempt with a browser in the room and no hello
admitted — and **by both ends**, because a relayed path needs a relay candidate from each side: the
guest escalates from its hello timer, the host from its own ("a browser is here, nobody was
welcomed"). `transport.restart({ useTurn })` is a fresh join; the screen's **Reconnect** asks for the
same thing. A room that dies on its own (a backgrounded tab, a slept laptop, a dropped relay) stays
`lost` for ever, so `session.startKeepalive()` reopens it at most once every ten seconds.

**A code is a list of paths, and only some of them cross a network.** The codes proved that two
machines can connect without any broker — and then failed the moment one of them was on **4G**
(playtest 8). Nothing was wrong with the exchange: a laptop on a carrier network and a PC at home
sit behind different NATs with no address they both reach, so the only path that works is a
**relay (TURN) candidate**, and a code only gets one if gathering is still running when the server
answers. Hence `ICE.gatherMs` (8 s, not 4) and one TURN server in `ICE.turn` with **two doors** — 3478 over
UDP and 3478 over TCP — because a phone that blocks UDP can still open the TCP one. (ExpressTURN's
free plan is those two; the TLS door is a paid plan's, and listing a door that cannot answer is worse
than a shorter list.)
Measured: the owner's laptop on 4G joined a hosted link with no codes at all (2026-11-22), the first
time anything but same-wifi worked. `paste.js` counts the candidates by
kind (`paths()`, `hasRelayPath()`) and the screen says which kind of code the player is holding —
`relay: 0` means "same network only", before it is sent rather than after it fails.
