# Step 17 in short, moved out of docs/architecture/multiplayer.md

Moved here word for word on 2026-11-25, when the area doc was over its size limit. The step is
unbuilt; its plan and its open questions live in step 17 of `docs/REFACTOR_PLAN.md`.

## Step 17: dedicated servers (planned 2026-11-22, not built)

The owner added **step 17**: a **dedicated server** hosts a world — step 16's host with no screen (a
headless build of the same project), stepping the fixed loop, holding the world and streaming snapshots
and controls in a **star** topology, so one port-forwarded server (`host:port`, Minecraft-style) can hold
a world for a measured number of players (the number goes in `src/data/multiplayer.js`). Peer-to-peer
stays the two-friend default; `src/net/transport.js` (still the only file naming a connection library)
gains a server role and the link gains the server's address. The one open dependency question is the
WebSocket-server library 17b needs (Node has no built-in one). Four slices — **17a** headless server,
**17b** server transport, **17c** snapshots and controls, **17d** scale, public address, auth, admin —
are **step 17 of [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md)**.

