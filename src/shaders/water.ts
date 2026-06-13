export const WATER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  
  uniform float uTime;
  uniform float uMeniscusHeight;
  uniform float uSurfaceDeformation;
  uniform float uPhotoPosition; // x position of photo center
  
  // Simplex-like noise for water ripples
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  
  void main() {
    vUv = uv;
    vec3 pos = position;
    
    // Animated water ripples
    float ripple1 = sin(pos.x * 12.0 + uTime * 1.3) * cos(pos.y * 10.0 - uTime * 0.9) * 0.015;
    float ripple2 = sin(pos.x * 18.0 - uTime * 1.7) * sin(pos.y * 15.0 + uTime * 1.1) * 0.01;
    float ripple3 = noise(vec2(pos.x * 8.0 + uTime * 0.5, pos.y * 8.0 - uTime * 0.4)) * 0.012;
    
    pos.z += ripple1 + ripple2 + ripple3;
    
    // Meniscus deformation: water climbs up near the photo
    // Create a depression/rise based on proximity to the photo
    float distToPhoto = abs(pos.x - uPhotoPosition);
    float meniscusRadius = 0.12; // width of meniscus influence
    float meniscusFalloff = smoothstep(meniscusRadius, 0.0, distToPhoto);
    pos.z += uMeniscusHeight * meniscusFalloff * 0.5;
    
    // Surface deformation (wake/dimple from displacement)
    float surfaceDip = uSurfaceDeformation * exp(-distToPhoto * 8.0) * 0.3;
    pos.z -= surfaceDip;
    
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    vPosition = pos;
    vNormal = normalize(mat3(modelMatrix) * normal);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const WATER_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uWaterColor;
  uniform vec3 uDeepColor;
  uniform float uWetCoverage;
  uniform vec3 uCameraPosition;
  
  void main() {
    // Fresnel effect: edges are more reflective/opaque
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 3.0);
    
    // Water color depth effect
    float depthFactor = 0.3 + 0.7 * fresnel;
    vec3 waterCol = mix(uWaterColor, uDeepColor, depthFactor);
    
    // Caustic-like light patterns
    float caustic = sin(vPosition.x * 30.0 + uTime * 2.0) * cos(vPosition.y * 25.0 + uTime * 1.5);
    caustic += sin(vPosition.y * 20.0 - uTime * 1.8) * cos(vPosition.x * 22.0 + uTime * 2.2);
    caustic = caustic * 0.15 + 0.85;
    
    vec3 finalColor = waterCol * caustic;
    
    // Opacity based on wet coverage and fresnel
    float alpha = uOpacity * (0.4 + 0.6 * fresnel);
    
    // Reduce opacity where photo is dry (patch of clarity)
    alpha *= 0.7 + 0.3 * uWetCoverage;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;
