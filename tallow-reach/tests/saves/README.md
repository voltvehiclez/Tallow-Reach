# Save fixtures

- `v11-real.json`, `v12-real.json`, `v13-real.json` are owner-exported old saves kept byte-for-byte
  as migration oracles. Do not rewrite them when the save version changes.
- `v15-pre11b.json` is a **regression fixture**, not a new owner export. It was produced by the
  pre-11B (`SAVE_VERSION = 15`) sanitizer from the real v13 character plus a v15 flying resume in
  `hollow`. Step 11B tests load it to prove v15 → v16 migration preserves the character, cargo,
  station world and exact resume spot. The matching import code is section C of
  `../../TEST-OLD-CODES.txt`.

Current saves are v16. The world's `galaxy` field stores only `{ seed, knowledge }`; generated
systems/pockets/links are rebuilt by `src/sim/galaxy-session.js` and are never fixtures here.
