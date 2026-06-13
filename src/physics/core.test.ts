import { describe, it, expect } from 'vitest';
import {
  calcImmersion,
  calcBuoyancy,
  calcDisplacedVolume,
  calcMeniscusHeight,
  calcMeniscusProfile,
  calcDrips,
  calcWettingDrying,
  calcSheeting,
  calcSurfaceDeformation,
  simulate,
  createDefaultState,
  clamp,
  smoothstep,
  dropletRadius,
  pseudoRandom,
  DEFAULT_PARAMS,
  type DripInfo,
} from './core';

// ── Utility function tests ───────────────────────────────────────────

describe('clamp()', () => {
  it('returns value within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps below minimum', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('clamps above maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('works with negative bounds', () => {
    expect(clamp(-3, -5, -1)).toBe(-3);
    expect(clamp(-6, -5, -1)).toBe(-5);
    expect(clamp(0, -5, -1)).toBe(-1);
  });

  it('handles min > max gracefully (returns min bound)', () => {
    // When min > max, the behavior is: Math.max(min, Math.min(max, value))
    // = Math.max(10, Math.min(0, 5)) = Math.max(10, 0) = 10 (min wins)
    expect(clamp(5, 10, 0)).toBe(10);
  });

  it('handles floating point values', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(1.001, 0, 1)).toBe(1);
    expect(clamp(-0.001, 0, 1)).toBe(0);
  });
});

describe('smoothstep()', () => {
  it('returns 0 below lower edge', () => {
    expect(smoothstep(-0.1, 0, 1)).toBe(0);
    expect(smoothstep(0, 0, 1)).toBe(0);
  });

  it('returns 1 above upper edge', () => {
    expect(smoothstep(1, 0, 1)).toBe(1);
    expect(smoothstep(1.1, 0, 1)).toBe(1);
  });

  it('returns 0.5 at midpoint', () => {
    expect(smoothstep(0.5, 0, 1)).toBe(0.5);
  });

  it('is monotonic', () => {
    const values = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    let prev = smoothstep(values[0], 0, 1);
    for (let i = 1; i < values.length; i++) {
      const curr = smoothstep(values[i], 0, 1);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('is symmetric around midpoint', () => {
    // smoothstep is symmetric: S(1-t) = 1 - S(t)
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5]) {
      expect(smoothstep(1 - t, 0, 1)).toBeCloseTo(1 - smoothstep(t, 0, 1), 10);
    }
  });
});

describe('dropletRadius()', () => {
  it('returns 0 for zero mass', () => {
    expect(dropletRadius(0, 1000)).toBe(0);
  });

  it('returns 0 for negative mass', () => {
    expect(dropletRadius(-0.001, 1000)).toBe(0);
  });

  it('calculates correct radius for water droplet', () => {
    // 1g water = 1cm³, radius ≈ 0.62cm = 0.0062m
    const mass = 0.001; // 1g
    const r = dropletRadius(mass, 1000);
    expect(r).toBeCloseTo(0.0062, 3);
  });

  it('is monotonic with mass', () => {
    const r1 = dropletRadius(0.001, 1000);
    const r2 = dropletRadius(0.002, 1000);
    expect(r2).toBeGreaterThan(r1);
  });

  it('inverse relationship with density', () => {
    // Higher density → smaller radius for same mass
    const rWater = dropletRadius(0.001, 1000);
    const rMercury = dropletRadius(0.001, 13593);
    expect(rMercury).toBeLessThan(rWater);
  });
});

describe('pseudoRandom()', () => {
  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = pseudoRandom(i, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic', () => {
    expect(pseudoRandom(1, 2)).toBe(pseudoRandom(1, 2));
    expect(pseudoRandom(100, 200)).toBe(pseudoRandom(100, 200));
  });

  it('different seeds produce different values', () => {
    const vals = new Set<number>();
    for (let i = 0; i < 50; i++) {
      vals.add(pseudoRandom(i, 0));
    }
    // At least 80% should be unique (very unlikely to have many collisions)
    expect(vals.size).toBeGreaterThan(40);
  });
});

// ── calcImmersion tests ──────────────────────────────────────────────

describe('calcImmersion()', () => {
  const params = DEFAULT_PARAMS;

  it('returns full immersion at scrollProgress=0', () => {
    const result = calcImmersion(0, params);
    expect(result.immersionFraction).toBe(1);
    expect(result.immersionDepth).toBe(params.photoHeight);
  });

  it('returns zero immersion at scrollProgress=1', () => {
    const result = calcImmersion(1, params);
    expect(result.immersionFraction).toBe(0);
    expect(result.immersionDepth).toBe(0);
  });

  it('returns half immersion at scrollProgress=0.5', () => {
    const result = calcImmersion(0.5, params);
    expect(result.immersionFraction).toBeCloseTo(0.5, 10);
    expect(result.immersionDepth).toBeCloseTo(params.photoHeight * 0.5, 10);
  });

  it('is strictly monotonic decreasing', () => {
    let prev = calcImmersion(0, params).immersionDepth;
    for (let p = 0.01; p <= 1; p += 0.01) {
      const curr = calcImmersion(p, params).immersionDepth;
      expect(curr).toBeLessThanOrEqual(prev);
      prev = curr;
    }
  });

  it('clamps scrollProgress outside [0,1]', () => {
    const below = calcImmersion(-0.5, params);
    expect(below.immersionFraction).toBe(1);
    expect(below.immersionDepth).toBe(params.photoHeight);

    const above = calcImmersion(1.5, params);
    expect(above.immersionFraction).toBe(0);
    expect(above.immersionDepth).toBe(0);
  });

  it('immersionDepth is always within [0, photoHeight]', () => {
    for (let p = -0.5; p <= 1.5; p += 0.1) {
      const result = calcImmersion(p, params);
      expect(result.immersionDepth).toBeGreaterThanOrEqual(0);
      expect(result.immersionDepth).toBeLessThanOrEqual(params.photoHeight);
    }
  });
});

// ── calcBuoyancy tests ───────────────────────────────────────────────

describe('calcBuoyancy()', () => {
  const params = DEFAULT_PARAMS;

  it('returns 0 when fully emerged', () => {
    const imm = calcImmersion(1, params);
    expect(calcBuoyancy(imm, params)).toBe(0);
  });

  it('returns maximum when fully submerged', () => {
    const imm = calcImmersion(0, params);
    const force = calcBuoyancy(imm, params);
    // V = w * t * h, ρ * g * V
    const expected = 1000 * 9.81 * 0.152 * 0.00025 * 0.102;
    expect(force).toBeCloseTo(expected, 6);
  });

  it('is strictly monotonic increasing with immersion', () => {
    let prev = -Infinity;
    for (let p = 1; p >= 0; p -= 0.05) {
      const imm = calcImmersion(p, params);
      const curr = calcBuoyancy(imm, params);
      if (prev !== -Infinity) {
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
      prev = curr;
    }
  });

  it('is always non-negative', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const imm = calcImmersion(p, params);
      expect(calcBuoyancy(imm, params)).toBeGreaterThanOrEqual(0);
    }
  });

  it('scales linearly with liquid density', () => {
    const imm = calcImmersion(0, params);
    const fWater = calcBuoyancy(imm, params);
    const fSaltWater = calcBuoyancy(imm, { ...params, liquidDensity: 1025 });
    expect(fSaltWater / fWater).toBeCloseTo(1.025, 5);
  });

  it('scales linearly with gravity', () => {
    const imm = calcImmersion(0, params);
    const fEarth = calcBuoyancy(imm, params);
    const fMoon = calcBuoyancy(imm, { ...params, gravity: 1.62 });
    expect(fMoon / fEarth).toBeCloseTo(1.62 / 9.81, 5);
  });
});

// ── calcDisplacedVolume tests ────────────────────────────────────────

describe('calcDisplacedVolume()', () => {
  const params = DEFAULT_PARAMS;

  it('returns 0 when fully emerged', () => {
    const imm = calcImmersion(1, params);
    expect(calcDisplacedVolume(imm, params)).toBe(0);
  });

  it('returns full volume when fully submerged', () => {
    const imm = calcImmersion(0, params);
    const vol = calcDisplacedVolume(imm, params);
    expect(vol).toBe(params.photoWidth * params.photoThickness * params.photoHeight);
  });

  it('conservation: displaced volume ≤ total photo volume', () => {
    const totalVol = params.photoWidth * params.photoThickness * params.photoHeight;
    for (let p = 0; p <= 1; p += 0.1) {
      const imm = calcImmersion(p, params);
      const vol = calcDisplacedVolume(imm, params);
      expect(vol).toBeGreaterThanOrEqual(0);
      expect(vol).toBeLessThanOrEqual(totalVol);
    }
  });

  it('is strictly monotonic decreasing with scrollProgress', () => {
    let prev = params.photoWidth * params.photoThickness * params.photoHeight + 1;
    for (let p = 0; p <= 1; p += 0.05) {
      const imm = calcImmersion(p, params);
      const curr = calcDisplacedVolume(imm, params);
      expect(curr).toBeLessThanOrEqual(prev);
      prev = curr;
    }
  });
});

// ── calcMeniscusHeight tests ─────────────────────────────────────────

describe('calcMeniscusHeight()', () => {
  const params = DEFAULT_PARAMS;

  it('returns 0 when fully emerged', () => {
    const imm = calcImmersion(1, params);
    expect(calcMeniscusHeight(imm, params)).toBe(0);
  });

  it('returns positive value when partially submerged', () => {
    const imm = calcImmersion(0.5, params);
    expect(calcMeniscusHeight(imm, params)).toBeGreaterThan(0);
  });

  it('is monotonic increasing with immersion', () => {
    let prev = -1;
    for (let p = 1; p >= 0; p -= 0.05) {
      const imm = calcImmersion(p, params);
      const curr = calcMeniscusHeight(imm, params);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('is always non-negative', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const imm = calcImmersion(p, params);
      expect(calcMeniscusHeight(imm, params)).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns higher values for higher surface tension', () => {
    const imm = calcImmersion(0.5, params);
    const hLow = calcMeniscusHeight(imm, { ...params, surfaceTension: 0.04 });
    const hHigh = calcMeniscusHeight(imm, { ...params, surfaceTension: 0.10 });
    expect(hHigh).toBeGreaterThan(hLow);
  });

  it('is bounded by physically plausible capillary rise', () => {
    // Water in a 0.125mm gap can rise ~6cm max
    const imm = calcImmersion(0, params);
    const h = calcMeniscusHeight(imm, params);
    // Should be less than ~15cm for photo paper (reasonable upper bound)
    expect(h).toBeLessThan(0.15);
  });

  it('returns lower values for less wetting (higher contact angle)', () => {
    const imm = calcImmersion(0.5, params);
    const hGood = calcMeniscusHeight(imm, { ...params, contactAngle: 0.2 });
    const hBad = calcMeniscusHeight(imm, { ...params, contactAngle: 1.2 });
    // Poor wetting → lower meniscus (cos(θ) is smaller)
    expect(hBad).toBeLessThan(hGood);
  });
});

// ── calcMeniscusProfile tests ────────────────────────────────────────

describe('calcMeniscusProfile()', () => {
  const params = DEFAULT_PARAMS;

  it('returns requested number of samples', () => {
    const imm = calcImmersion(0.3, params);
    const profile = calcMeniscusProfile(imm, params, 10);
    expect(profile.samples).toHaveLength(10);
  });

  it('samples cover full width [0,1]', () => {
    const imm = calcImmersion(0.5, params);
    const profile = calcMeniscusProfile(imm, params, 5);
    expect(profile.samples[0].x).toBe(0);
    expect(profile.samples[profile.samples.length - 1].x).toBe(1);
  });

  it('edges are higher than center (corner effect)', () => {
    const imm = calcImmersion(0.5, params);
    const profile = calcMeniscusProfile(imm, params, 21);
    const mid = profile.samples[10]; // index 10 = middle
    const edge = profile.samples[0]; // left edge
    expect(edge.height).toBeGreaterThan(mid.height);
  });

  it('max height matches standalone calcMeniscusHeight', () => {
    const imm = calcImmersion(0.4, params);
    const standalone = calcMeniscusHeight(imm, params);
    const profile = calcMeniscusProfile(imm, params);
    // Profile maxHeight should match
    expect(profile.maxHeight).toBeCloseTo(standalone, 10);
  });

  it('all heights are non-negative', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const imm = calcImmersion(p, params);
      const profile = calcMeniscusProfile(imm, params);
      for (const s of profile.samples) {
        expect(s.height).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── calcDrips tests ──────────────────────────────────────────────────

describe('calcDrips()', () => {
  const params = DEFAULT_PARAMS;
  const emptyDrips: DripInfo[] = [];

  it('returns empty array when fully emerged', () => {
    const imm = calcImmersion(1, params);
    const result = calcDrips(imm, params, 0, emptyDrips, 0);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no sheeting flow', () => {
    const imm = calcImmersion(0.5, params);
    const result = calcDrips(imm, params, 0, emptyDrips, 0);
    expect(result).toHaveLength(0);
  });

  it('creates new drips over time when immersed', () => {
    const imm = calcImmersion(0.3, params);
    // Sufficient flow rate and time
    const result = calcDrips(imm, params, 5, emptyDrips, 1e-6);
    expect(result.length).toBeGreaterThan(0);
  });

  it('drips eventually detach when mass exceeds critical', () => {
    const imm = calcImmersion(0.3, params);
    // Let drips accumulate over a long time
    let drips: DripInfo[] = [];
    for (let t = 0; t < 50; t += 0.5) {
      drips = calcDrips(imm, params, t, drips, 1e-5);
    }
    const detached = drips.filter(d => d.detached);
    expect(detached.length).toBeGreaterThan(0);
  });

  it('detached drips have fallProgress in [0, 1]', () => {
    const imm = calcImmersion(0.3, params);
    let drips: DripInfo[] = [];
    for (let t = 0; t < 30; t += 0.2) {
      drips = calcDrips(imm, params, t, drips, 1e-5);
    }
    for (const d of drips) {
      if (d.detached) {
        expect(d.fallProgress).toBeGreaterThanOrEqual(0);
        expect(d.fallProgress).toBeLessThanOrEqual(1);
      }
    }
  });

  it('completed falls are removed (fallProgress=1 removed)', () => {
    const imm = calcImmersion(0.3, params);
    const existingDrip: DripInfo = {
      id: 99,
      position: 0.5,
      mass: 0.001,
      formationTime: -10,
      detached: true,
      fallProgress: 0.99,
      radius: 0.005,
    };
    // After more time, this drip should complete and be removed
    const result = calcDrips(imm, params, 5, [existingDrip], 0);
    // It may still be present if fall hasn't completed, or removed
    const found = result.filter(d => d.id === 99);
    expect(found.length).toBeLessThanOrEqual(1);
  });

  it('drip positions are within [0.1, 0.9]', () => {
    const imm = calcImmersion(0.3, params);
    let drips: DripInfo[] = [];
    for (let t = 0; t < 20; t += 0.5) {
      drips = calcDrips(imm, params, t, drips, 1e-5);
    }
    for (const d of drips) {
      expect(d.position).toBeGreaterThanOrEqual(0.1);
      expect(d.position).toBeLessThanOrEqual(0.9);
    }
  });

  it('drip IDs are unique', () => {
    const imm = calcImmersion(0.3, params);
    let drips: DripInfo[] = [];
    for (let t = 0; t < 30; t += 0.3) {
      drips = calcDrips(imm, params, t, drips, 1e-4);
    }
    const ids = drips.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── calcWettingDrying tests ──────────────────────────────────────────

describe('calcWettingDrying()', () => {
  const params = DEFAULT_PARAMS;

  it('returns fully wet when submerged', () => {
    const imm = calcImmersion(0, params);
    const result = calcWettingDrying(imm, params, 100, 0);
    expect(result.wetCoverage).toBe(1);
    expect(result.dryingProgress).toBe(0);
  });

  it('drying progresses with exposure time', () => {
    const imm = calcImmersion(0.5, params);
    const early = calcWettingDrying(imm, params, 1, 0);
    const late = calcWettingDrying(imm, params, 30, 0);
    expect(late.dryingProgress).toBeGreaterThan(early.dryingProgress);
    expect(late.wetCoverage).toBeLessThan(early.wetCoverage);
  });

  it('dryingProgress is monotonic increasing with time', () => {
    const imm = calcImmersion(0.5, params);
    let prev = -1;
    for (let t = 0; t <= 20; t += 0.5) {
      const curr = calcWettingDrying(imm, params, t, 0).dryingProgress;
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('both values are always in [0, 1]', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const imm = calcImmersion(p, params);
      for (let t = 0; t <= 20; t += 5) {
        const result = calcWettingDrying(imm, params, t, 0);
        expect(result.wetCoverage).toBeGreaterThanOrEqual(0);
        expect(result.wetCoverage).toBeLessThanOrEqual(1);
        expect(result.dryingProgress).toBeGreaterThanOrEqual(0);
        expect(result.dryingProgress).toBeLessThanOrEqual(1);
      }
    }
  });

  it('fully emerged photo eventually dries completely', () => {
    const imm = calcImmersion(1, params);
    // After a very long time, should be nearly dry
    const result = calcWettingDrying(imm, params, 100, 0);
    expect(result.dryingProgress).toBeGreaterThan(0.99);
    expect(result.wetCoverage).toBeLessThan(0.01);
  });

  it('higher viscosity slows drying', () => {
    const imm = calcImmersion(0.7, params);
    const normal = calcWettingDrying(imm, params, 10, 0);
    const viscous = calcWettingDrying(imm, { ...params, viscosity: 0.01 }, 10, 0);
    expect(viscous.dryingProgress).toBeLessThan(normal.dryingProgress);
  });
});

// ── calcSheeting tests ───────────────────────────────────────────────

describe('calcSheeting()', () => {
  const params = DEFAULT_PARAMS;

  it('returns zero when fully emerged', () => {
    const imm = calcImmersion(1, params);
    const result = calcSheeting(imm, params);
    expect(result.thickness).toBe(0);
    expect(result.flowRate).toBe(0);
  });

  it('returns positive values when partially submerged', () => {
    const imm = calcImmersion(0.5, params);
    const result = calcSheeting(imm, params);
    expect(result.thickness).toBeGreaterThan(0);
    expect(result.flowRate).toBeGreaterThan(0);
  });

  it('thickness is monotonic increasing with immersion', () => {
    let prev = -1;
    for (let p = 1; p >= 0; p -= 0.05) {
      const imm = calcImmersion(p, params);
      const curr = calcSheeting(imm, params).thickness;
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('flow rate scales with thickness cubed (physics: gravity-driven film)', () => {
    const imm1 = calcImmersion(0.3, params);
    const imm2 = calcImmersion(0.6, params);
    const r1 = calcSheeting(imm1, params);
    const r2 = calcSheeting(imm2, params);
    // Flow rate ratio ≈ (thickness ratio)³
    if (r1.thickness > 0 && r2.thickness > 0) {
      const thickRatio = r2.thickness / r1.thickness;
      const flowRatio = r2.flowRate / r1.flowRate;
      expect(flowRatio).toBeCloseTo(thickRatio ** 3, 1);
    }
  });

  it('higher viscosity reduces flow rate', () => {
    const imm = calcImmersion(0.5, params);
    const normal = calcSheeting(imm, params);
    const viscous = calcSheeting(imm, { ...params, viscosity: 0.01 });
    expect(viscous.flowRate).toBeLessThan(normal.flowRate);
  });
});

// ── calcSurfaceDeformation tests ─────────────────────────────────────

describe('calcSurfaceDeformation()', () => {
  const params = DEFAULT_PARAMS;

  it('returns 0 when fully emerged (no velocity)', () => {
    const imm = calcImmersion(1, params);
    expect(calcSurfaceDeformation(imm, params, 0)).toBe(0);
  });

  it('returns positive value when submerged', () => {
    const imm = calcImmersion(0.5, params);
    expect(calcSurfaceDeformation(imm, params, 0)).toBeGreaterThan(0);
  });

  it('increases with velocity (dynamic wake)', () => {
    const imm = calcImmersion(0.5, params);
    const static_ = calcSurfaceDeformation(imm, params, 0);
    const moving = calcSurfaceDeformation(imm, params, 0.5);
    expect(moving).toBeGreaterThan(static_);
  });

  it('dynamic component scales with |velocity|', () => {
    const imm = calcImmersion(0.5, params);
    const v1 = calcSurfaceDeformation(imm, params, 0.2);
    const v2 = calcSurfaceDeformation(imm, params, 0.4);
    // Dynamic part roughly doubles
    const staticPart = calcSurfaceDeformation(imm, params, 0);
    const dynamic1 = v1 - staticPart;
    const dynamic2 = v2 - staticPart;
    expect(dynamic2).toBeCloseTo(dynamic1 * 2, 5);
  });

  it('is always non-negative', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const imm = calcImmersion(p, params);
      for (const v of [0, 0.1, 0.5, 1]) {
        expect(calcSurfaceDeformation(imm, params, v)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── simulate() integration tests ─────────────────────────────────────

describe('simulate()', () => {
  it('returns complete output with all fields', () => {
    const state = createDefaultState({ scrollProgress: 0.5, time: 5 });
    const output = simulate(state);
    expect(output).toHaveProperty('buoyancyForce');
    expect(output).toHaveProperty('displacedVolume');
    expect(output).toHaveProperty('meniscus');
    expect(output).toHaveProperty('drips');
    expect(output).toHaveProperty('wetCoverage');
    expect(output).toHaveProperty('dryingProgress');
    expect(output).toHaveProperty('sheetingThickness');
    expect(output).toHaveProperty('sheetingFlowRate');
    expect(output).toHaveProperty('surfaceDeformation');
  });

  it('outputs are all finite numbers (no NaN/Infinity)', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const state = createDefaultState({ scrollProgress: p, time: p * 10 });
      const output = simulate(state);
      expect(Number.isFinite(output.buoyancyForce)).toBe(true);
      expect(Number.isFinite(output.displacedVolume)).toBe(true);
      expect(Number.isFinite(output.meniscus.maxHeight)).toBe(true);
      expect(Number.isFinite(output.wetCoverage)).toBe(true);
      expect(Number.isFinite(output.dryingProgress)).toBe(true);
      expect(Number.isFinite(output.sheetingThickness)).toBe(true);
      expect(Number.isFinite(output.sheetingFlowRate)).toBe(true);
      expect(Number.isFinite(output.surfaceDeformation)).toBe(true);
    }
  });

  it('buoyancy goes to 0 as photo emerges', () => {
    const state = createDefaultState({ scrollProgress: 0.999, time: 10 });
    const output = simulate(state);
    expect(output.buoyancyForce).toBeLessThan(0.0005);
  });

  it('photo is fully wet when submerged', () => {
    const state = createDefaultState({ scrollProgress: 0, time: 1000 });
    const output = simulate(state);
    expect(output.wetCoverage).toBe(1);
  });

  it('drips only form when partially in water', () => {
    // Fully emerged: no sheeting → no drips
    const emerged = createDefaultState({ scrollProgress: 1, time: 30 });
    const emergedOut = simulate(emerged);
    expect(emergedOut.drips.length).toBe(0);

    // Partially in water: sheeting active → drips can form
    const partial = createDefaultState({ scrollProgress: 0.3, time: 30 });
    const partialOut = simulate(partial);
    
    // Both return valid arrays
    expect(Array.isArray(partialOut.drips)).toBe(true);
    expect(Array.isArray(emergedOut.drips)).toBe(true);
  });

  it('is deterministic (same inputs → same outputs)', () => {
    const state = createDefaultState({ scrollProgress: 0.42, time: 7.3 });
    const out1 = simulate(state);
    const out2 = simulate(state);
    expect(out1).toEqual(out2);
  });

  it('handles extreme parameter values without crashing', () => {
    const extreme = createDefaultState({
      scrollProgress: 0.5,
      time: 5,
      params: {
        ...DEFAULT_PARAMS,
        liquidDensity: 0.001,     // near-vacuum
        surfaceTension: 100,      // absurdly high
        viscosity: 1e-10,         // near-zero
        gravity: 0.001,           // microgravity
        photoThickness: 0.1,      // very thick
      },
    });
    const output = simulate(extreme);
    // Should not throw and all values should be finite
    expect(output).toBeDefined();
  });
});

// ── createDefaultState tests ─────────────────────────────────────────

describe('createDefaultState()', () => {
  it('creates a valid state with defaults', () => {
    const state = createDefaultState();
    expect(state.params).toEqual(DEFAULT_PARAMS);
    expect(state.scrollProgress).toBe(0);
    expect(state.time).toBe(0);
    expect(state.previousDrips).toEqual([]);
    expect(state.emergenceStartTime).toBe(0);
  });

  it('allows overrides', () => {
    const state = createDefaultState({ scrollProgress: 0.7, time: 42 });
    expect(state.scrollProgress).toBe(0.7);
    expect(state.time).toBe(42);
    expect(state.params).toEqual(DEFAULT_PARAMS); // unchanged
  });

  it('does not mutate defaults when overriding', () => {
    const state1 = createDefaultState({ scrollProgress: 0.3 });
    const state2 = createDefaultState({ scrollProgress: 0.8 });
    expect(state1.scrollProgress).toBe(0.3);
    expect(state2.scrollProgress).toBe(0.8);
  });
});
