// Visual tuning shared by the sky renderer and deterministic asteroid placement.
export const PLANET_VIEW = { radius: 0.4394, distance: 0.85, elevation: 0 };
export const BELT_VARIATION = {
  tipDensity: 0.002,
  taperPower: 4,
  innerRipple: 120,
  widthRipple: 0.14,
  strayChance: 0.035,
  strayMin: 250,
  strayMax: 800,
};

// Scale shell thickness above the surface, not the planet radius itself.
export const ATMOSPHERE_THICKNESS = 1 / 3;
export const atmosphereRadius = (radius, outer) => radius + Math.max(0, outer - radius) * ATMOSPHERE_THICKNESS;
