export { 
  simulate, 
  calcImmersion,
  calcBuoyancy,
  calcDisplacedVolume,
  calcMeniscusHeight,
  calcMeniscusProfile,
  calcDrips,
  calcWettingDrying,
  calcSheeting,
  calcSurfaceDeformation,
  createDefaultState,
  clamp,
  smoothstep,
  dropletRadius,
  pseudoRandom,
  DEFAULT_PARAMS,
} from './core';

export type {
  PhysicsParams,
  PhysicsOutput,
  SimulationState,
  ScrollProgress,
  ImmersionState,
  DripInfo,
  MeniscusProfile,
  Fraction,
} from './core';
