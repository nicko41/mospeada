import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { lightningState } from './Lightning'
import { timeOfDayState } from './TimeOfDay'
import { highwayFogState } from './sectors/highwayFogState'
import { weatherState } from './weatherState.js'

const vertexShader = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uLightning;
uniform float uDay;
uniform float uHighwayHaze;
uniform float uClear;
uniform float uIllustratedClear;
uniform float uCoverage;
uniform vec3 uBackdrop;
varying vec3 vDirection;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), local.x), local.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < 5; octave++) {
    value += noise(point) * amplitude;
    point = point * 2.03 + vec2(8.7, 3.1);
    amplitude *= 0.48;
  }
  return value;
}

void main() {
  vec3 direction = normalize(vDirection);
  vec2 cloudUv = direction.xz / max(direction.y + 0.38, 0.18);
  float clouds = uClear < 0.5 ? fbm(cloudUv * 1.35 + vec2(uTime * 0.004, -uTime * 0.002)) : 0.0;
  clouds = smoothstep(0.3, 0.88, clouds);

  float horizon = pow(1.0 - max(direction.y, 0.0), 2.4);
  vec3 base = mix(vec3(0.005, 0.007, 0.009), vec3(0.011, 0.015, 0.016), horizon);
  vec3 cloudColor = mix(vec3(0.01, 0.014, 0.015), vec3(0.026, 0.032, 0.034), clouds);

  vec3 moonDirection = normalize(vec3(-0.35, 0.78, -0.52));
  float moonGlow = pow(max(dot(direction, moonDirection), 0.0), 5.0);
  moonGlow *= 0.35 + clouds * 0.65;
  vec3 color = mix(base, cloudColor, clouds * 0.78);
  color += vec3(0.052, 0.062, 0.066) * moonGlow * 0.3;
  color = mix(color, vec3(0.003, 0.005, 0.007),
    uHighwayHaze * pow(1.0 - max(direction.y, 0.0), 1.7));
  vec3 dayBase = mix(vec3(0.14, 0.17, 0.18), vec3(0.23, 0.27, 0.28), horizon);
  vec3 dayCloud = mix(vec3(0.16, 0.19, 0.20), vec3(0.25, 0.29, 0.30), clouds);
  vec3 overcastDay = mix(dayBase, dayCloud, clouds * 0.78);
  color = mix(color, overcastDay, uDay);
  vec3 clearDay = mix(vec3(0.16, 0.38, 0.67), vec3(0.40, 0.65, 0.86), horizon);
  vec3 illustratedBlue = mix(vec3(0.075, 0.31, 0.65), vec3(0.32, 0.61, 0.86), horizon);
  clearDay = mix(clearDay, illustratedBlue, uIllustratedClear);
  float cloudBody = uClear > 0.5 ? fbm(cloudUv * 0.7 + vec2(uTime * 0.002, -uTime * 0.001)) : 0.0;
  float whiteClouds = smoothstep(mix(0.52, 0.54, uIllustratedClear), mix(0.65, 0.59, uIllustratedClear), cloudBody) * smoothstep(0.0, 0.08, direction.y);
  vec3 cloudWhite = mix(vec3(0.72, 0.81, 0.90), vec3(1.0), smoothstep(0.53, 0.72, cloudBody));
  cloudWhite = mix(cloudWhite, mix(vec3(0.79, 0.87, 0.96), vec3(1.0), smoothstep(0.55, 0.64, cloudBody)), uIllustratedClear);
  clearDay = mix(clearDay, cloudWhite, whiteClouds);
  float sunAlignment = max(dot(direction, normalize(vec3(-25.0, 35.0, 20.0))), 0.0);
  clearDay += vec3(0.32, 0.23, 0.10) * pow(sunAlignment, 128.0);
  clearDay = mix(clearDay, vec3(1.0, 0.94, 0.78), smoothstep(0.9990, 0.9996, sunAlignment));
  color = mix(color, mix(base, clearDay, uDay), uClear);
  color += mix(vec3(0.3, 0.36, 0.4), vec3(0.19, 0.22, 0.24), uDay)
    * uLightning * (0.3 + clouds * 0.7);
  gl_FragColor = vec4(mix(uBackdrop, color, uCoverage), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export default function OvercastSky({clearSky=false,coverage=null,priority=0}) {
  const mesh = useRef()
  const { camera,scene } = useThree()
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: !clearSky,
    uniforms: { uTime: { value: 0 }, uLightning: { value: 0 }, uDay: { value: 0 }, uHighwayHaze: { value: 0 }, uClear: { value: 0 },uIllustratedClear:{value:clearSky?1:0},uCoverage:{value:1},uBackdrop:{value:new THREE.Color()} },
  }), [clearSky])

  useFrame((state) => {
    mesh.current.visible=!coverage||coverage.value>.001
    mesh.current.position.copy(camera.position)
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uLightning.value = clearSky?0:lightningState.flash
    material.uniforms.uDay.value = timeOfDayState.value
    material.uniforms.uClear.value = clearSky?1:weatherState.clear
    material.uniforms.uHighwayHaze.value = clearSky?0:highwayFogState.darkness * (1 - timeOfDayState.value)
    material.uniforms.uCoverage.value=coverage?.value??1
    if(scene.background?.isColor)material.uniforms.uBackdrop.value.copy(scene.background)
  },priority)

  return (
    <mesh ref={mesh} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[170, 48, 24]} />
    </mesh>
  )
}
