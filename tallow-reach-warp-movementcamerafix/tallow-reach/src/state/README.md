# src/state: runtime state and saves

| File | What it does |
|---|---|
| `state.js` | The single runtime `state` object (player, world lists, flight, ui, hud). Also `msg()` and `say()` for on-screen text. |
| `profile.js` | The saved game: `newProfile()`, `sanitizeProfile()`, `SAVE_VERSION`. Everything that is saved goes through here. |
| `storage.js` | Autosave, three save slots and text save codes. Storage keys must not change. |

Rules:
- Changing saved data means: default in `newProfile`, validation in `sanitizeProfile`, bump `SAVE_VERSION`, a "Version history" line, and a test. See `docs/ARCHITECTURE.md`.
- `sanitizeProfile` names the base modules and weapon flags explicitly. A new one needs a line there.
