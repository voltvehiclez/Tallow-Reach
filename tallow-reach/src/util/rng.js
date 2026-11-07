// All gameplay randomness goes through random().
//
// By default it is Math.random, so unseeded play is exactly as it always was.
// setSeed(n) swaps in a deterministic generator (mulberry32) for the whole game,
// which is what makes "same seed, same run" possible. makeRng(n) hands out an
// *independent* generator, so generating a sector or an instance never depends on
// how many dice combat rolled earlier.
//
// Rule: nothing in src/sim/ or src/data/ may call Math.random() itself.
// `tests/rng.test.mjs` fails if it does.

/**
 * An independent deterministic generator (mulberry32).
 * Same seed, same sequence, every run and every machine.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// null means "use Math.random", which is read on every call so a test (or the
// browser) can stand in its own sequence without re-importing this module.
let source = null;

/** Make the whole game reproducible: `setSeed(n)` for a seed, `setSeed(null)` to go back. */
export function setSeed(seed) {
  source = seed == null ? null : makeRng(seed);
}

/** The shared random source, in [0, 1). Every gameplay roll goes through this. */
export const random = () => (source ? source() : Math.random());
