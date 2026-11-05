# Changelog

Newest first. Every AI session adds a short entry when it changes the project, so the
next assistant (which has no memory of earlier chats) can see what happened and why.

Entry format: date, a one-line title, then what changed, which files, and anything
the next person must know (save version, rebuild needed, known issues).

---

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
