# HANDOFF archive: playtest history to 2026-11-19

Moved out of `docs/HANDOFF.md` verbatim on 2026-11-20 to keep the snapshot under its
size limit. Nothing here is current guidance; it records what was already delivered.

- **Playtests passed (2026-11-18):** Roadmap Slices 1–3 merged to `main` (PR #43, save **v24**: moving-collider speed, live mission counts, 10-min contract timers, compact Shop + `Mining beams` + cursor Buy popup, per-station ships & Sell, ship bonuses, `My Assets`, Minecraft-style slots, and `0 MJ` power fix).

- **Station UI, direct fitting & reverse-speed (PR #44 merged to `main`; Services polish pending, save v24):** compact controls-only `Controls`; square `#inv-held-ghost` with clean drop removal (L28), uncropped `.inv-item` text, no held banner/dimming, and ship-hold `Stack all` top-left compaction; clickable top-right Home icon with `.home-tip` hover card; Hangar ships + `Fly` in Inventory; shared `#station-left` (`ui/left-panel.js`) for `Outfitting` (no subtitle, taller `#shipview`), `Shop`, and `Missions` (right accepts `Story missions` + `Contract board`; left `Mission log` expands inline on `Details` with no duplication); click-pick/swap, drag-drop, right-click `Equip`/`Unequip`, and module `Show info` everywhere; compact `68px` full-width `Services` below modules (no browser tooltips, 2×4 single-line boxes stepping to 3/2 on narrow panes, scrollable for 9+ services); `My Assets` prefix `Search`, ship cargo, and `Set destination`; signed reverse `m/s`.

- **Previous batches (PRs #37, #39, #42):** NPC flight AI (`data/enemy-ai.js`), surface F picking, compact mission log, stationary outfitting preview, home recovery, framed Shield/Hull + Power/Boost, ten-slot hotbar, paid-ignition throttle, cannon lead, true speed, unified marker colours and `N` pocket list.
