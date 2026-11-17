import * as THREE from 'three'

// Distant visual hint only: it yields to the existing real spots at close range.
export function createRoadGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uFogDensity: { value: 0.038 },
      uHaze: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      varying float vDistance;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 view = viewMatrix * world;
        vDepth = max(0.0, -view.z);
        vDistance = length(world.xz - cameraPosition.xz);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uFogDensity;
      uniform float uHaze;
      varying vec2 vUv;
      varying float vDepth;
      varying float vDistance;
      void main() {
        float radius = length((vUv - 0.5) * 2.0);
        float footprint = pow(1.0 - smoothstep(0.0, 1.0, radius), 2.0);
        float nearFade = smoothstep(24.0, 40.0, vDistance);
        float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        float residual = 0.18 * uHaze * exp(-0.008 * vDepth);
        gl_FragColor = vec4(vec3(0.88, 0.77, 0.57),
          uOpacity * footprint * nearFade * max(fog, residual));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
}
