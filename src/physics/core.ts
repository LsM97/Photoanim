// ─── Water Physics Core ──────────────────────────────────────────────
// Pure, deterministic functions for simulating a photo being lifted
// from a liquid bath. Absolutely zero side effects — every function
// takes immutable inputs and returns new values.
// ─────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────

export interface PhysicsParams {
  /** Photo width in meters (longer edge, typical 4×6" ≈ 0.152 m) */
  photoWidth: number;
  /** Photo height in meters (shorter edge) */
  photoHeight: number;
  /** Photo thickness in meters (~0.00025 m for photo paper) */
  photoThickness: number;
  /** Density of the liquid in kg/m³ (water ≈ 1000) */
  liquidDensity: number;
  /** Surface tension in N/m (water ≈ 0.073 at 20°C) */
  surfaceTension: number;
  /** Dynamic viscosity in Pa·s (water ≈ 0.001) */
  viscosity: number;
  /** Gravitational acceleration in m/s² */
  gravity: number;
  /** Contact angle in radians — how the liquid wets the photo (0 = perfect wetting) */
  contactAngle: number;
}

export const DEFAULT_PARAMS: PhysicsParams = {
  photoWidth: 0.152,        // 6 inches
  photoHeight: 0.102,       // 4 inches  
  photoThickness: 0.00025,
  liquidDensity: 1000,
  surfaceTension: 0.073,
  viscosity: 0.001,
  gravity: 9.81,
  contactAngle: 0.35,       // ~20° — photo paper is moderately hydrophilic
};

/** Normalised scroll progress: 0 = fully submerged, 1 = fully emerged */
export type ScrollProgress = number;

/** Fraction from 0 to 1 */
export type Fraction = number;

/** Immersion state of the photo */
export interface ImmersionState {
  /** How much of the photo height is below the water surface (m) */
  immersionDepth: number;
  /** Normalised: 0 = bottom at surface, 1 = fully submerged */
  immersionFraction: Fraction;
}

export interface DripInfo {
  /** Unique id */
  id: number;
  /** X position along the bottom edge (0 = left, 1 = right) */
  position: Fraction;
  /** Current mass of the forming droplet in kg */
  mass: number;
  /** Time in seconds since drip started forming */
  formationTime: number;
  /** Whether the droplet has detached and is falling */
  detached: boolean;
  /** Fall progress 0..1 (0 = just detached, 1 = hit water surface) */
  fallProgress: number;
  /** Radius in meters (derived from mass) */
  radius: number;
}

export interface MeniscusProfile {
  /** Maximum height the meniscus climbs above the waterline (m) */
  maxHeight: number;
  /** Profile samples along the width, each is height above waterline */
  samples: { x: Fraction; height: number }[];
}

export interface PhysicsOutput {
  /** Buoyancy force in Newtons */
  buoyancyForce: number;
  /** Volume of liquid displaced in m³ */
  displacedVolume: number;
  /** Meniscus profile along the photo edges */
  meniscus: MeniscusProfile;
  /** Active drips (forming and falling) */
  drips: DripInfo[];
  /** Fraction of the emerged portion that is still wet (0-1) */
  wetCoverage: Fraction;
  /** How much the emerged surface has dried (0 = wet, 1 = bone dry) */
  dryingProgress: Fraction;
  /** Average thickness of water sheeting on emerged surface (m) */
  sheetingThickness: number;
  /** Flow rate of runoff sheeting in m³/s per meter of width */
  sheetingFlowRate: number;
  /** Deformation of the water surface near the photo (m, positive = up) */
  surfaceDeformation: number;
}

export interface SimulationState {
  params: PhysicsParams;
  scrollProgress: ScrollProgress;
  time: number;
  /** Previously detached drips for continuity (preserve fall progress) */
  previousDrips: DripInfo[];
  /** Time the photo started emerging (for drying calculations) */
  emergenceStartTime: number;
}

// ── Core Functions ───────────────────────────────────────────────────

/**
 * Calculate the immersion state from scroll progress.
 * 
 * scrollProgress = 0 → photo bottom just touching surface → immersionDepth = 0
 * scrollProgress = 0.5 → photo half emerged → immersionDepth = photoHeight * 0.5
 * scrollProgress = 1 → photo fully emerged → immersionDepth = 0
 * 
 * Monotonic: immersionDepth strictly decreases as scrollProgress increases.
 */
export function calcImmersion(
  scrollProgress: ScrollProgress,
  params: PhysicsParams,
): ImmersionState {
  const p = clamp(scrollProgress, 0, 1);
  const immersionFraction = 1 - p;
  return {
    immersionDepth: immersionFraction * params.photoHeight,
    immersionFraction,
  };
}

/**
 * Calculate buoyancy force via Archimedes' principle.
 * F = ρ × g × V_displaced
 * 
 * V_displaced = photoWidth × photoThickness × immersionDepth
 * (The submerged portion displaces water equal to its volume.)
 * 
 * As the photo rises, immersed depth decreases linearly → buoyancy decreases linearly.
 * F_b = 0 when fully emerged (immersionDepth = 0).
 */
export function calcBuoyancy(
  immersion: ImmersionState,
  params: PhysicsParams,
): number {
  const vDisplaced = params.photoWidth * params.photoThickness * immersion.immersionDepth;
  const force = params.liquidDensity * params.gravity * vDisplaced;
  return Math.max(0, force);
}

/**
 * Calculate displaced liquid volume.
 */
export function calcDisplacedVolume(
  immersion: ImmersionState,
  params: PhysicsParams,
): number {
  return params.photoWidth * params.photoThickness * immersion.immersionDepth;
}

/**
 * Calculate maximum meniscus height — how high the water climbs up the
 * photo surface due to capillary action / surface tension.
 * 
 * Uses the simplified capillary rise equation:
 *   h = (2 × γ × cos(θ)) / (ρ × g × r)
 * 
 * where r is the effective radius of curvature. For a flat plate, we
 * approximate r from the plate thickness and the immersion state.
 * 
 * The meniscus height decreases as immersion decreases (photo emerges):
 * less water contact means weaker capillary action.
 * 
 * Monotonically decreasing with scrollProgress, bounded by [0, h_max].
 */
export function calcMeniscusHeight(
  immersion: ImmersionState,
  params: PhysicsParams,
): number {
  if (immersion.immersionDepth <= 0) return 0;
  
  const cosTheta = Math.cos(params.contactAngle);
  // Effective radius: thin plate with water on both sides
  const effectiveRadius = params.photoThickness / 2;
  
  // Capillary rise formula with guard against division by zero
  const hMax = (2 * params.surfaceTension * cosTheta) /
    (params.liquidDensity * params.gravity * Math.max(effectiveRadius, 1e-6));
  
  // Meniscus scales with immersion — weaker when barely touching
  const immersionFactor = smoothstep(immersion.immersionFraction, 0.05, 0.3);
  
  return hMax * immersionFactor;
}

/**
 * Generate a meniscus profile along the width of the photo.
 * The water clings higher at the edges (due to the corner effect) and
 * dips slightly in the middle.
 * 
 * Returns sampled heights at positions across the photo width.
 */
export function calcMeniscusProfile(
  immersion: ImmersionState,
  params: PhysicsParams,
  samples: number = 20,
): MeniscusProfile {
  const maxH = calcMeniscusHeight(immersion, params);
  
  const profileSamples: { x: Fraction; height: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const x = i / (samples - 1); // 0 to 1 across width
    // Edge enhancement: meniscus is higher near the edges (corners)
    // 4*(x-0.5)² = 0 at center, 1 at edges
    const edgeFactor = 1 + 0.3 * (4 * (x - 0.5) * (x - 0.5));
    // Slight random-like variation from the parabolic edge enhancement
    const height = maxH * edgeFactor;
    profileSamples.push({ x, height });
  }
  
  return { maxHeight: maxH, samples: profileSamples };
}

/**
 * Calculate which drips are forming/falling.
 * 
 * Drip formation model:
 * - Water accumulates at the bottom edge from sheeting runoff
 * - A new drip starts forming at a random position when enough water accumulates
 * - Drip mass increases linearly with time (constant accumulation rate)
 * - When mass × gravity > surface tension holding force, the drip detaches
 * - After detachment, the drip falls with constant acceleration
 * 
 * Returns updated drips array (pure function: new array, original unchanged).
 */
export function calcDrips(
  immersion: ImmersionState,
  params: PhysicsParams,
  currentTime: number,
  previousDrips: DripInfo[],
  sheetingFlowRate: number,
): DripInfo[] {
  const drips: DripInfo[] = [];
  
  // Critical mass for detachment: when weight exceeds surface tension
  // F_surface = 2π × r_drip × γ, where r_drip is the neck radius
  // At detachment: m × g = 2π × r_neck × γ
  // r_neck ≈ (3V/(4π))^(1/3) × 0.5 (neck is thinner than droplet)
  // Solving for critical mass: m_crit = (2π × γ / g) × r_neck
  // Approximate: m_crit ≈ π × γ / g × (characteristic length)
  
  const rNeck = 0.001; // ~1mm neck radius
  const criticalMass = (2 * Math.PI * params.surfaceTension * rNeck) / params.gravity;
  
  // Drip formation rate depends on sheeting flow — more runoff = faster drips
  // Base rate: one new drip every ~1.5 seconds at full immersion
  const dripRate = sheetingFlowRate > 0 
    ? Math.max(0.5, 1.5 / Math.max(sheetingFlowRate / 1e-7, 0.1))
    : 3.0;
  
  // Process existing drips
  for (const prev of previousDrips) {
    if (prev.detached) {
      // Falling drip: accelerate fall
      const fallTime = currentTime - (prev.formationTime + prev.mass / criticalMass * dripRate);
      const fallDuration = 0.3; // approximate fall time
      const fallProgress = clamp(fallTime / fallDuration, 0, 1);
      
      if (fallProgress >= 1) {
        continue; // Drip has hit the water, remove it
      }
      
      drips.push({
        ...prev,
        fallProgress,
        radius: dropletRadius(prev.mass, params.liquidDensity),
      });
    } else {
      // Still forming: mass increases with time
      const age = currentTime - prev.formationTime;
      const newMass = sheetingFlowRate * params.photoWidth * age * 5 + prev.mass;
      
      if (newMass >= criticalMass) {
        // Detached!
        drips.push({
          ...prev,
          mass: criticalMass,
          detached: true,
          fallProgress: 0,
          radius: dropletRadius(criticalMass, params.liquidDensity),
        });
      } else {
        drips.push({
          ...prev,
          mass: newMass,
          radius: dropletRadius(newMass, params.liquidDensity),
        });
      }
    }
  }
  
  // Only form new drips if photo is partially in water
  if (immersion.immersionDepth > 0 && sheetingFlowRate > 0) {
    const timeSinceLastDrip = drips.length > 0
      ? currentTime - drips[drips.length - 1].formationTime
      : dripRate + 1;
    
    if (timeSinceLastDrip > dripRate) {
      const newDripId = drips.length > 0
        ? Math.max(...drips.map(d => d.id)) + 1
        : 1;
      
      // Position: somewhat random but deterministic from time
      const pos = pseudoRandom(newDripId, currentTime);
      
      drips.push({
        id: newDripId,
        position: clamp(pos, 0.1, 0.9),
        mass: 0.000001, // start tiny
        formationTime: currentTime,
        detached: false,
        fallProgress: 0,
        radius: dropletRadius(0.000001, params.liquidDensity),
      });
    }
  }
  
  return drips;
}

/**
 * Calculate wet/dry coverage on the emerged portion of the photo.
 * 
 * When the photo first emerges, the surface is fully wet.
 * Over time, water evaporates / runs off, and the surface dries.
 * Drying follows an exponential decay: coverage(t) = exp(-k × t)
 * 
 * The drying rate is proportional to: exposure time, temperature
 * (simplified to a constant), and height above water (higher = dries faster).
 * 
 * wetCoverage: 1 = fully wet, 0 = fully dry
 * dryingProgress: 0 = wet, 1 = dry (inverse, for convenience)
 */
export function calcWettingDrying(
  immersion: ImmersionState,
  params: PhysicsParams,
  time: number,
  emergenceStartTime: number,
): { wetCoverage: Fraction; dryingProgress: Fraction } {
  const emergedFraction = 1 - immersion.immersionFraction;
  
  if (emergedFraction <= 0) {
    // Fully submerged — everything is wet
    return { wetCoverage: 1, dryingProgress: 0 };
  }
  
  // Time since this portion started emerging
  const exposureTime = Math.max(0, time - emergenceStartTime);
  
  // Drying rate constant (higher = faster drying)
  // Depends on viscosity (more viscous = slower drying) and surface tension
  const dryingRate = 0.15 * (0.001 / Math.max(params.viscosity, 1e-6)) *
    (params.surfaceTension / 0.073);
  
  // Exponential drying
  const driedFraction = 1 - Math.exp(-dryingRate * exposureTime);
  
  // The emerged portion dries from the top down
  // Bottom parts (closer to water) stay wetter
  const dryingProgress = clamp(driedFraction * emergedFraction, 0, 1);
  const wetCoverage = 1 - dryingProgress * emergedFraction;
  
  return { wetCoverage: clamp(wetCoverage, 0, 1), dryingProgress };
}

/**
 * Calculate sheeting water properties — water running down the emerged
 * photo surface in a thin film.
 * 
 * Sheeting thickness decreases with height above the waterline:
 * thicker at the bottom (more water source), thinner at the top.
 * 
 * Flow rate depends on: film thickness, gravity, viscosity
 * (thin-film gravity-driven flow)
 * 
 * Returns thickness (m) and flow rate (m³/s per meter of width).
 */
export function calcSheeting(
  immersion: ImmersionState,
  params: PhysicsParams,
): { thickness: number; flowRate: number } {
  if (immersion.immersionDepth <= 0) {
    return { thickness: 0, flowRate: 0 };
  }
  
  // Maximum film thickness at the waterline
  // Scales with surface tension and inverse viscosity
  const maxThickness = 0.0003 * // 0.3mm max film
    (params.surfaceTension / 0.073) *
    (0.001 / Math.max(params.viscosity, 1e-6));
  
  // Thickness decays with immersion fraction (more emerged = thinner overall)
  const avgThickness = maxThickness * Math.sqrt(immersion.immersionFraction);
  
  // Flow rate: gravity-driven thin film
  // Q = (ρ × g × h³) / (3 × η)   per unit width
  const flowRate = (params.liquidDensity * params.gravity * avgThickness ** 3) /
    (3 * Math.max(params.viscosity, 1e-6));
  
  return { thickness: avgThickness, flowRate };
}

/**
 * Calculate water surface deformation near the photo.
 * The water surface rises slightly where it meets the photo (meniscus)
 * and may dip slightly due to displacement wake as the photo moves.
 * 
 * Positive value = water surface rises above equilibrium.
 */
export function calcSurfaceDeformation(
  immersion: ImmersionState,
  params: PhysicsParams,
  scrollVelocity: number, // rate of change of scrollProgress per second
): number {
  // Static deformation from meniscus
  const staticDeformation = calcMeniscusHeight(immersion, params) * 0.5;
  
  // Dynamic deformation from motion (wake effect)
  // Moving the photo creates a small surface wave
  // Only relevant when velocity is non-zero
  const dynamicDeformation = params.photoThickness * 
    Math.abs(scrollVelocity) * 10 * 
    immersion.immersionFraction;
  
  return staticDeformation + dynamicDeformation;
}

/**
 * Calculate the complete physics state for a given simulation state.
 * This is the main entry point — call it once per frame with current state,
 * get back all physics outputs.
 */
export function simulate(
  state: SimulationState,
  scrollVelocity: number = 0,
): PhysicsOutput {
  const { params, scrollProgress, time, previousDrips, emergenceStartTime } = state;
  
  const immersion = calcImmersion(scrollProgress, params);
  const buoyancyForce = calcBuoyancy(immersion, params);
  const displacedVolume = calcDisplacedVolume(immersion, params);
  const meniscus = calcMeniscusProfile(immersion, params, 30);
  const sheeting = calcSheeting(immersion, params);
  const wetDry = calcWettingDrying(immersion, params, time, emergenceStartTime);
  const drips = calcDrips(immersion, params, time, previousDrips, sheeting.flowRate);
  const surfaceDeformation = calcSurfaceDeformation(immersion, params, scrollVelocity);
  
  return {
    buoyancyForce,
    displacedVolume,
    meniscus,
    drips,
    wetCoverage: wetDry.wetCoverage,
    dryingProgress: wetDry.dryingProgress,
    sheetingThickness: sheeting.thickness,
    sheetingFlowRate: sheeting.flowRate,
    surfaceDeformation,
  };
}

// ── Utility Functions ────────────────────────────────────────────────

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Smooth Hermite interpolation between 0 and 1 over [edge0, edge1] */
export function smoothstep(
  value: number,
  edge0: number,
  edge1: number,
): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Calculate droplet radius from mass and density (assuming spherical) */
export function dropletRadius(mass: number, density: number): number {
  if (mass <= 0) return 0;
  const volume = mass / density;
  return Math.cbrt((3 * volume) / (4 * Math.PI));
}

/**
 * Deterministic pseudo-random number in [0, 1) from seed values.
 * Uses a simple hash for reproducibility across runs.
 */
export function pseudoRandom(seedA: number, seedB: number): number {
  let h = (seedA * 374761393 + seedB * 668265263 + 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Create a default simulation state.
 */
export function createDefaultState(
  overrides: Partial<SimulationState> = {},
): SimulationState {
  return {
    params: { ...DEFAULT_PARAMS },
    scrollProgress: 0,
    time: 0,
    previousDrips: [],
    emergenceStartTime: 0,
    ...overrides,
  };
}
