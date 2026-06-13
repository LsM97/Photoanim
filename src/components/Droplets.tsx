import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DripInfo } from '../physics';

interface DropletsProps {
  drips: DripInfo[];
}

function Droplet({ drip, photoY }: { drip: DripInfo; photoY: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    if (!meshRef.current) return;
    
    if (drip.detached) {
      // Falling droplet: moves down from the photo bottom edge
      const fallDistance = drip.fallProgress * 0.8;
      meshRef.current.position.y = photoY - 0.34 - fallDistance;
      meshRef.current.visible = true;
    } else {
      // Forming droplet: hangs at the bottom edge
      meshRef.current.position.y = photoY - 0.34;
      const scale = Math.min(drip.mass * 500, 1.2);
      meshRef.current.scale.setScalar(0.3 + scale * 0.7);
      meshRef.current.visible = true;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[drip.radius * 80, 8, 8]} />
      <meshPhysicalMaterial
        color="#88ccff"
        roughness={0.1}
        metalness={0}
        transparent
        opacity={0.85}
        clearcoat={0.3}
      />
    </mesh>
  );
}

export function Droplets({ drips }: DropletsProps) {
  // Photo bottom Y position - will be driven by the scroll in the parent
  // For now, we compute a fixed reference; the actual Y is passed per droplet
  const defaultPhotoY = 0;
  
  if (!drips || drips.length === 0) return null;

  return (
    <group>
      {drips.map((drip) => (
        <Droplet key={drip.id} drip={drip} photoY={defaultPhotoY} />
      ))}
    </group>
  );
}
