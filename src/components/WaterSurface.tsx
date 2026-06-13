import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WATER_VERTEX, WATER_FRAGMENT } from '../shaders/water';
import type { PhysicsOutput } from '../physics';

interface WaterSurfaceProps {
  physics: PhysicsOutput;
}

export function WaterSurface({ physics }: WaterSurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const { camera } = useThree();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOpacity: { value: 0.75 },
    uWaterColor: { value: new THREE.Color('#1a5276') },
    uDeepColor: { value: new THREE.Color('#0a1628') },
    uMeniscusHeight: { value: 0 },
    uSurfaceDeformation: { value: 0 },
    uPhotoPosition: { value: 0 },
    uWetCoverage: { value: 1 },
    uCameraPosition: { value: new THREE.Vector3() },
  }), []);

  useFrame((_, delta) => {
    if (!materialRef.current) return;
    const u = materialRef.current.uniforms;
    u.uTime.value += delta;
    u.uMeniscusHeight.value = physics.meniscus.maxHeight;
    u.uSurfaceDeformation.value = physics.surfaceDeformation;
    u.uWetCoverage.value = physics.wetCoverage;
    u.uCameraPosition.value.copy(camera.position);
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, -0.25, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[3.5, 3.5, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={WATER_VERTEX}
        fragmentShader={WATER_FRAGMENT}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
