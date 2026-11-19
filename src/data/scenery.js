// Visual tuning shared by the sky renderer and deterministic asteroid placement.
export const PLANET_VIEW = { radius: 0.4394, distance: 0.85, elevation: 0 };
// HUD only: nearby dense field edges read as one continuous mining belt.
export const BELT_LABEL_GAP_METRES = 1000;
export const BELT_VARIATION = {
  tipDensity: 0.002,
  taperPower: 4,
  innerRipple: 120,
  widthRipple: 0.14,
  strayChance: 0.16,
  strayMin: 0,
  strayMax: 1200,
  heightScale: 1.25,
  verticalFadeStart: 0.9,
};

// Scale shell thickness above the surface, not the planet radius itself.
export const ATMOSPHERE_THICKNESS = 1 / 3;
export const atmosphereRadius = (radius, outer) => radius + Math.max(0, outer - radius) * ATMOSPHERE_THICKNESS;

export const FIELD_DIFFUSION = { widthScale: 2.5, wingDensity: 0.3 };

/** Shared resolution for authored/generated features; never mutates source data. */
export function sceneryFeatures(place, features) {
  return features.map(original => {
    const f = { ...original, ...(place.featureOverrides?.[original.id] || {}) };
    if (f.kind !== 'asteroidField' || f.layout === 'arc' || f.coreRadius ||
        place.kind === 'instance' || place.role === 'belt' || place.id === 'reach' || !place.parent) return f;
    const scale = FIELD_DIFFUSION.widthScale, extension = scale - 1;
    // Integral of the old quadratic core plus a quadratic outward tail.
    const coreMass = f.radialFalloff ? 0.65 : 1;
    const wingMass = 2 * FIELD_DIFFUSION.wingDensity * (extension / 3 + extension ** 2 / 12);
    return { ...f, coreRadius: f.radius, radius: f.radius * scale,
      count: Math.round(f.count * (coreMass + wingMass) / coreMass), diffuseEdges: true };
  });
}
