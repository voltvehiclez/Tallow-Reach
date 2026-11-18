# Reticle picking and recovery availability

## Reticle hits and recovery availability (2026-11-16)

- F chose a large background rock over a small foreground rock: angular-size scoring is not
  visible surface picking, and a ship-forward ray is not the rendered camera ray. Pick nearest
  visible mesh depth from the camera first for every lockable kind; only then use angular assistance.
  Render picking follows child transforms and visibility, ignores faint effects, and sends only
  a validated target reference to simulation. Headless callers retain collision-soup/proxy fallback.
  Regression: `tests/reticle-hit.test.mjs` overlaps unequal rocks and checks an irregular-mesh miss.
- A rich pilot could lose the only ship and receive no loaner. Credits do not constitute a usable
  hull. Recovery reuses surviving ownership, otherwise grants a complete stock Wasp at the chosen
  home. Test both no-hull and surviving-hull paths at generated stations in `home-station.test.mjs`.

`tests/target-picking.test.mjs` covers every kind, station holes, moving children and faint auras.
