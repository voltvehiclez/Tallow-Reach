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

## Boost input is not successful ignition

A Shift press set full throttle before spool-up/MJ debit, allowing free throttle jumps.
Move the snap into the successful ignition transaction, after payment. Tests in
`boost-ignition.test.mjs` cover taps, spool-up, dry power/fuel and held-key throttle control.

## Signed controls are not resource pools

The generic 0–100% resource clamp hid reverse throttle. Use a separate signed
presentation helper: preserve the sign in text, use absolute magnitude for width,
and choose the fill origin/pattern from direction. Regression covers -100%, -50%,
zero, +50%, +100%, clamping and invalid values in flight-ui-slice1.test.mjs.

## Displacement is not engine velocity

Moving colliders can push position without adding velocity. Speed instruments must measure a single flight-step displacement after collision resolution. Do not measure between render frames across warp/load/teleport boundaries. tests/flight-slice2.test.mjs covers zero-velocity scenery pushes and travel discontinuities.

## Exercise the action boundary and share render time

N failed with emit undefined because a new main action used an unimported bus helper. Enumeration tests did not exercise the handler. flight-slice2 now executes the real handler body with main’s imported event bindings, including playing/repeat guards. Close-range lead jitter came from projecting fixed-step poses against an interpolated camera; interpolate muzzle pose, target position and velocities at the same render alpha instead of smoothing screen coordinates after projection. render-interp tests verify continuous interpolation and teleport reset.
