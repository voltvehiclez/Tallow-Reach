# Playtest builds

Packaged builds handed to the owner, so a build can be downloaded as one `.zip` instead of a
single file that has to be renamed. Each one holds:

- `game/tallow-reach.html` — the build itself, unzip and double-click;
- `HOW-TO-TEST.txt` — what changed in that build and what to look for;
- `testing/TESTING-16-MULTIPLAYER.md` — the full step 16 guide of that moment.

The build id inside the game (`Connection details` > **Build**) must match the file name on both
machines. These are copies, not sources: rebuild with `npm run build` and add a new zip only when
the owner needs one. Old zips may be deleted once their playtest is done; the changelog keeps the
history.
