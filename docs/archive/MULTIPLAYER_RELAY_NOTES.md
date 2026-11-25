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

