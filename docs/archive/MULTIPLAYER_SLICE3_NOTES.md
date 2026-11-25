# Slice 3 build notes, moved out of docs/architecture/multiplayer.md

The file-by-file list of what step 16 slice 3 built, moved here word for word on 2026-11-25 when
the area doc grew past its size limit. The live list (every file, as it is now) is in
`src/net/README.md`.

### What slice 3 built (2026-11-21)

| File | The one job |
|---|---|
| `net/transport.js` | the wrapper: `createChannel` → `join/send/broadcast/leave/peers/state`; `trystero` is named here and nowhere else (lazily, through a loader a test can replace); every failure becomes `lost` + a sentence |
| `net/session.js` | one session: `hostWorld`, `joinWorld`, the paste codes, the handshake through `custody.handshake`, the guest list, the recent chat, `mp-state` on the bus |
| `net/protocol.js` | seven message kinds, each cleaned and length-capped on the way out **and** in |
| `net/paste.js` | the broker-free fallback: a `TRJOIN:` offer code and an answer code, browser WebRTC only |
| `net/join-link.js` | `?join=<worldId>#<token>`, and reading one out of a pasted sentence |
| `net/settings.js` | the username (`tr_mp`), capped and cleaned; a number is refused rather than shown |
| `net/boot.js` | a `?join=` link in the address bar: asks first, used once, speaks through `mp-notice` |
| `ui/multiplayer.js` | the multiplayer screen (name, host, join, codes) and the chat box; every control is a `data-mp` action, and no connection state of its own |

