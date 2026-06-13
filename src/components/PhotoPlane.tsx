import { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import type { PhysicsOutput } from '../physics';

interface PhotoPlaneProps {
  textureUrl: string;
  scrollProgress: number;
  physics: PhysicsOutput;
  emergenceTime: number;
}

export function PhotoPlane({ textureUrl, scrollProgress, physics, emergenceTime }: PhotoPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  
  // Load the photo texture, fall back to a checker pattern
  const defaultTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, 256, 192);
    ctx.fillRect(256, 192, 256, 192);
    ctx.fillStyle = '#e94560';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('PHOTO', 180, 200);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const [loadedTexture] = useLoader(THREE.TextureLoader as any, [textureUrl]) as any[];
  
  const photoTex = loadedTexture || defaultTexture;
  if (photoTex !== defaultTexture) {
    photoTex.colorSpace = THREE.SRGBColorSpace;
  }

  // Custom shader for wet-to-dry transition on the photo surface
  const uniforms = useMemo(() => ({
    uTexture: { value: photoTex },
    uWetCoverage: { value: 1.0 },
    uDryingProgress: { value: 0.0 },
    uTime: { value: 0 },
    uSheetingThickness: { value: 0 },
  }), [photoTex]);

  useFrame((_, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value += delta;
    materialRef.current.uniforms.uWetCoverage.value = physics.wetCoverage;
    materialRef.current.uniforms.uDryingProgress.value = physics.dryingProgress;
    materialRef.current.uniforms.uSheetingThickness.value = physics.sheetingThickness;
  });

  // Photo rises from y = -1.5 (below water) to y = 1.0 (above)
  const photoHeight = 1.8;
  const yPosition = -1.5 + scrollProgress * photoHeight;
  
  // Slight tilt as it emerges (simulates handling)
  const tiltX = scrollProgress * 0.15;
  
  // Subtle bobbing when partially submerged (buoyancy wobble)
  const buoyWobble = physics.buoyancyForce > 0.0001
    ? Math.sin(emergenceTime * 2.5) * 0.01 * (1 - scrollProgress)
    : 0;

  return (
    <mesh
      ref={meshRef}
      position={[0, yPosition + buoyWobble, 0]}
      rotation={[tiltX, 0, 0]}
    >
      <planeGeometry args={[0.9, 0.68]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={PHOTO_VERTEX}
        fragmentShader={PHOTO_FRAGMENT}
        transparent
      />
    </mesh>
  );
}

const PHOTO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PHOTO_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  uniform sampler2D uTexture;
  uniform float uWetCoverage;
  uniform float uDryingProgress;
  uniform float uTime;
  uniform float uSheetingThickness;
  
  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Drying gradient: top dries faster (UV.y goes from 0 at bottom to 1 at top)
    float heightDryFactor = smoothstep(0.0, 1.0, vUv.y);
    float localDry = uDryingProgress * (0.7 + 0.3 * heightDryFactor);
    float localWet = 1.0 - localDry;
    
    // Wet surface: darkens slightly, adds specular sheen
    vec3 wetColor = texColor.rgb * 0.75 + vec3(0.05, 0.08, 0.15);
    
    // Sheeting water film: thin bright streaks
    float sheetNoise = sin(vUv.y * 40.0 - uTime * 3.0) * cos(vUv.x * 25.0 + uTime * 2.0);
    float sheetPattern = smoothstep(0.7, 1.0, sheetNoise) * 0.15 * uSheetingThickness * 1000.0;
    wetColor += sheetPattern * vec3(0.6, 0.7, 0.9);
    
    // Blend between wet and dry
    vec3 finalColor = mix(wetColor, texColor.rgb, localDry);
    
    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;
