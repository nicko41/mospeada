import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { phoneLightState } from '../player/PhoneLight'
import { timeOfDayState } from './TimeOfDay'
import { HIGHWAY_CLEARANCE, HIGHWAY_Z, highwayLiftAt } from './sectors/highwayProfile'
import { roadCenterAt, terrainHeight } from './terrain'
import { createGrassModelGeometry } from './grassModelGeometry'

const CLUMP_COUNT = 11000

function createPRNG(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const vegetationVertexShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorldPosition;
varying float vViewDepth;
varying float vDistance;

void main() {
  vUv = uv;
  vColor = instanceColor;
  vec3 transformed = position;
  vec3 clumpOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float clumpHeight = length(instanceMatrix[1].xyz);
  float phase = dot(floor(clumpOrigin.xz * 0.55), vec2(1.73, 2.41));
  float localPhase = dot(clumpOrigin.xz, vec2(0.31, 0.23));
  float slowSway = sin(uTime * 1.42 + phase + localPhase) * 0.23;
  float secondarySway = sin(uTime * 0.69 + phase * 1.37) * 0.1;
  float gust = smoothstep(0.25, 0.9, sin(uTime * 0.48 + phase * 0.21) * 0.5 + 0.5);
  float bend = (slowSway + secondarySway + gust * 0.13)
    * mix(0.72, 1.22, clamp(clumpHeight / 1.4, 0.0, 1.0));
  float tipWeight = uv.y * uv.y;
  vec2 windDirection = normalize(vec2(0.86, 0.5) + vec2(sin(phase), cos(phase)) * 0.18);
  transformed.x += windDirection.x * bend * tipWeight;
  transformed.z += windDirection.y * bend * tipWeight;

  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vec4 viewPosition = viewMatrix * worldPosition;
  vWorldPosition = worldPosition.xyz;
  vViewDepth = -viewPosition.z;
  vDistance = distance(cameraPosition, clumpOrigin);
  gl_Position = projectionMatrix * viewPosition;
}
`

const vegetationFragmentShader = /* glsl */ `
uniform vec3 uPhonePosition;
uniform vec3 uPhoneDirection;
uniform float uPhoneEnabled;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDay;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorldPosition;
varying float vViewDepth;
varying float vDistance;

void main() {
  float visibility = 1.0 - smoothstep(20.0, 43.0, vDistance);
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  if (dither > visibility) discard;
  vec3 baseColor = mix(vColor * 0.55, vColor, smoothstep(0.05, 0.8, vUv.y));
  vec3 phoneVector = vWorldPosition - uPhonePosition;
  float phoneDistance = length(phoneVector);
  vec3 phoneRay = phoneVector / max(phoneDistance, 0.001);
  float cone = smoothstep(0.73, 0.95, dot(phoneRay, normalize(uPhoneDirection)));
  float range = pow(clamp(1.0 - phoneDistance / 30.0, 0.0, 1.0), 2.0);
  float phoneLight = cone * range * uPhoneEnabled;
  vec3 color = baseColor * (mix(0.09, 0.66, uDay) + phoneLight * mix(0.21, 0.08, uDay));

  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
  vec3 fieldTint = mix(vec3(0.006, 0.008, 0.006), vec3(0.031, 0.041, 0.032), uDay);
  vec3 grassFogColor = fieldTint;
  color = mix(color, grassFogColor, min(fogFactor * 0.92, 0.9));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export default function RoadsideVegetation() {
  const mesh = useRef()
  const grass = useGLTF('/models/grass02.glb')
  const geometry = useMemo(() => createGrassModelGeometry(grass.scene, 1), [grass.scene])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vegetationVertexShader,
    fragmentShader: vegetationFragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPhonePosition: { value: new THREE.Vector3() },
      uPhoneDirection: { value: new THREE.Vector3(0, 0, -1) },
      uPhoneEnabled: { value: 1 },
      uFogColor: { value: new THREE.Color('#0b0e0f') },
      uFogDensity: { value: 0.068 },
      uDay: { value: 0 },
    },
  }), [])

  useLayoutEffect(() => {
    const random = createPRNG(721904)
    const transform = new THREE.Object3D()
    const colors = [
      new THREE.Color('#625f45'),
      new THREE.Color('#596044'),
      new THREE.Color('#696148'),
      new THREE.Color('#505842'),
      new THREE.Color('#71664b'),
    ]
    let placed = 0

    while (placed < CLUMP_COUNT) {
      const z = 46 - random() * 225
      const center = roadCenterAt(z)
      const roadside = random() < 0.14
      const side = random() < 0.5 ? -1 : 1
      const x = roadside
        ? center + side * (2.85 + Math.pow(random(), 1.45) * 10.2)
        : center + side * (10 + random() * 110)
      const roadDistance = Math.abs(x - center)
      const edgeWave = Math.sin(z * 0.28 + side * 1.8) * 0.53
        + Math.sin(z * 0.67 - side * 0.9) * 0.25
        + Math.sin(z * 0.071 + side * 2.1) * 0.22
      const edgeClearance = Math.max(2.85, 3.65 + edgeWave + (random() - 0.5) * 0.3)
      const edgeGrowth = THREE.MathUtils.smoothstep(roadDistance, edgeClearance, edgeClearance + 7)
      const patch = Math.sin(x * 0.14 + Math.sin(z * 0.085) * 1.8) * 0.6
        + Math.sin(x * 0.049 - z * 0.073) * 0.4

      if (
        roadDistance < edgeClearance
        || (Math.abs(x - 28) < 2.45 && Math.abs(z + 105) < 2.1)
        || Math.abs(z - HIGHWAY_Z) < HIGHWAY_CLEARANCE + 2
        || (!roadside && (patch < -0.42 || random() > 0.68 + patch * 0.16))
        || (roadside && random() > 0.46 + edgeGrowth * 0.42)
      ) continue

      const height = THREE.MathUtils.lerp(
        0.28 + random() * 0.27,
        0.78 + random() * 0.73,
        edgeGrowth,
      )
      const width = THREE.MathUtils.lerp(0.52 + random() * 0.35, 0.78 + random() * 0.8, edgeGrowth)
      transform.position.set(x, terrainHeight(x, z) + highwayLiftAt(x, z) - 0.018, z)
      transform.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.12)
      transform.scale.set(width, height, width)
      transform.updateMatrix()
      mesh.current.setMatrixAt(placed, transform.matrix)
      mesh.current.setColorAt(placed, colors[Math.floor(random() * colors.length)])
      placed += 1
    }

    mesh.current.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.instanceColor.needsUpdate = true
  }, [])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uPhonePosition.value.copy(phoneLightState.position)
    material.uniforms.uPhoneDirection.value.copy(phoneLightState.direction)
    material.uniforms.uPhoneEnabled.value = phoneLightState.enabled ? 1 : 0
    material.uniforms.uDay.value = timeOfDayState.value
    material.uniforms.uFogColor.value.copy(state.scene.fog.color)
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, CLUMP_COUNT]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  )
}
