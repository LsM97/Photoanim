import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { simulate, createDefaultState } from '../physics';
import type { SimulationState, PhysicsOutput } from '../physics';
import { PhotoPlane } from './PhotoPlane';
import { WaterSurface } from './WaterSurface';
import { Droplets } from './Droplets';

interface SceneProps {
  scrollProgress: number;
  scrollVelocity: number;
  textureUrl: string;
  reducedMotion: boolean;
}

export function Scene({ scrollProgress, scrollVelocity, textureUrl, reducedMotion }: SceneProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const stateRef = useRef<SimulationState>(createDefaultState());
  const physicsRef = useRef<PhysicsOutput | null>(null);
  const timeRef = useRef(0);

  // Update simulation each frame
  useFrame((_, delta) => {
    timeRef.current += delta;
    const vel = reducedMotion ? 0 : scrollVelocity;
    
    stateRef.current.scrollProgress = scrollProgress;
    stateRef.current.time = timeRef.current;
    
    // Track emergence start
    if (scrollProgress > 0.01 && stateRef.current.emergenceStartTime === 0) {
      stateRef.current.emergenceStartTime = timeRef.current;
    }
    if (scrollProgress <= 0.01) {
      stateRef.current.emergenceStartTime = 0;
    }
    
    const output = simulate(stateRef.current, vel);
    physicsRef.current = output;
    stateRef.current.previousDrips = output.drips;
  });

  // Wait for first physics frame
  const physics = physicsRef.current;

  return (
    <group ref={groupRef}>
      {/* Ambient lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[2, 4, 2]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-1, 2, -1]} intensity={0.3} color="#8899cc" />
      
      {/* Water surface with GPU shader */}
      <WaterSurface physics={physics || {
        buoyancyForce: 0,
        displacedVolume: 0,
        meniscus: { maxHeight: 0, samples: [] },
        drips: [],
        wetCoverage: 1,
        dryingProgress: 0,
        sheetingThickness: 0,
        sheetingFlowRate: 0,
        surfaceDeformation: 0,
      }} />
      
      {/* Photo plane */}
      {physics && (
        <PhotoPlane
          textureUrl={textureUrl}
          scrollProgress={reducedMotion ? 0 : scrollProgress}
          physics={physics}
          emergenceTime={timeRef.current}
        />
      )}
      
      {/* Droplets */}
      <Droplets drips={physics?.drips || []} />
      
      {/* Subtle environment reflection for water realism */}
      <Environment preset="night" />
    </group>
  );
}
