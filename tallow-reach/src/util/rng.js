// All gameplay randomness goes through random(). By default it is Math.random,
// but calling setSeed() makes runs reproducible, which is the basis for
// seeded sectors and daily challenges later on.

let source = Math.random;

/** Switch to a deterministic generator (mulberry32). Pass null to go back to Math.random. */
export function setSeed(seed) {
  if (seed == null) {
    source = Math.random;
    return;
  }
  let a = seed >>> 0;
  source = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const random = () => source();
