import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HIGHWAY_CLEARANCE, HIGHWAY_Z } from './sectors/highwayProfile'

export const RURAL_POLES = Array.from({ length: 13 }, (_, index) => ({
  x: -7.5,
  z: 10 - index * 14,
  leanX: Math.sin(index * 2.17 + 0.4) * 0.095,
  leanZ: Math.sin(index * 1.73 + 1.8) * 0.09,
})).filter((pole) => Math.abs(pole.z - HIGHWAY_Z) >= HIGHWAY_CLEARANCE)

const CONNECTED_POLES = RURAL_POLES.filter((pole) => pole.z > HIGHWAY_Z + HIGHWAY_CLEARANCE)
const CONDUCTOR_OFFSETS = [-0.68, -0.28, 0.28, 0.68]
const ATTACH_HEIGHT = 5.79
const CABLE_RADIUS = 0.013
const RADIAL_SEGMENTS = 5
const SPAN_SAMPLES = 28

function attachmentAt(pole, offset) {
  const point = new THREE.Vector3(offset, ATTACH_HEIGHT, 0)
    .applyEuler(new THREE.Euler(pole.leanX, 0, pole.leanZ))
  point.x += pole.x
  point.z += pole.z
  return point
}

function buildCableGeometry() {
  const positions = []
  const progress = []
  const phases = []
  const tails = []
  const indices = []

  function addCable(sampleCount, phase, isTail, centerAt) {
    const firstVertex = positions.length / 3
    for (let step = 0; step <= sampleCount; step += 1) {
      const t = step / sampleCount
      const center = centerAt(t)
      for (let radial = 0; radial < RADIAL_SEGMENTS; radial += 1) {
        const angle = radial * Math.PI * 2 / RADIAL_SEGMENTS
        positions.push(
          center.x + Math.cos(angle) * CABLE_RADIUS,
          center.y + Math.sin(angle) * CABLE_RADIUS,
          center.z,
        )
        progress.push(t)
        phases.push(phase)
        tails.push(isTail ? 1 : 0)
      }
    }
    for (let step = 0; step < sampleCount; step += 1) {
      for (let radial = 0; radial < RADIAL_SEGMENTS; radial += 1) {
        const nextRadial = (radial + 1) % RADIAL_SEGMENTS
        const a = firstVertex + step * RADIAL_SEGMENTS + radial
        const b = firstVertex + step * RADIAL_SEGMENTS + nextRadial
        const c = a + RADIAL_SEGMENTS
        const d = b + RADIAL_SEGMENTS
        indices.push(a, c, b, b, c, d)
      }
    }
  }

  for (let span = 0; span < CONNECTED_POLES.length - 1; span += 1) {
    const start = CONNECTED_POLES[span]
    const end = CONNECTED_POLES[span + 1]
    const sag = 0.31 + (span % 3) * 0.045
    CONDUCTOR_OFFSETS.forEach((offset, conductor) => {
      const from = attachmentAt(start, offset)
      const to = attachmentAt(end, offset)
      addCable(SPAN_SAMPLES, span * 1.37 + conductor * 0.53, false, (t) => ({
        x: THREE.MathUtils.lerp(from.x, to.x, t),
        y: THREE.MathUtils.lerp(from.y, to.y, t) - sag * 4 * t * (1 - t),
        z: THREE.MathUtils.lerp(from.z, to.z, t),
      }))
    })
  }

  const last = CONNECTED_POLES[CONNECTED_POLES.length - 1]
  CONDUCTOR_OFFSETS.forEach((offset, conductor) => {
    const anchor = attachmentAt(last, offset)
    addCable(8, 6.1 + conductor * 0.53, true, (t) => ({
      x: anchor.x,
      y: anchor.y - 0.56 * t,
      z: anchor.z - 0.33 * t,
    }))
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progress, 1))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
  geometry.setAttribute('aTail', new THREE.Float32BufferAttribute(tails, 1))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

const vertexShader = /* glsl */ `
attribute float aProgress;
attribute float aPhase;
attribute float aTail;
uniform float uTime;
varying float vDepth;
void main() {
  vec3 shifted = position;
  float fixedEnds = sin(aProgress * 3.14159265);
  float flex = mix(fixedEnds, sin(aProgress * 1.57079633) * 0.36, aTail);
  float gust = max(0.0, sin(uTime * 0.38) * 0.58 + sin(uTime * 0.14 + 1.8) * 0.42);
  shifted.x += flex * (sin(uTime * 1.35 + aPhase) * 0.095
    + sin(uTime * 0.52 + aPhase * 1.6) * gust * 0.06);
  shifted.y += flex * sin(uTime * 1.48 + aPhase + 0.8) * 0.035;
  vec4 viewPosition = modelViewMatrix * vec4(shifted, 1.0);
  vDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uFogColor;
varying float vDepth;
void main() {
  float fog = 1.0 - exp(-0.045 * 0.045 * vDepth * vDepth);
  gl_FragColor = vec4(mix(vec3(0.002, 0.0025, 0.003), uFogColor, fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export default function RuralPowerLines() {
  const { scene } = useThree()
  const geometry = useMemo(buildCableGeometry, [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color('#0b0e0f') },
    },
  }), [])
  const last = CONNECTED_POLES[CONNECTED_POLES.length - 1]

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    if (scene.fog) material.uniforms.uFogColor.value.copy(scene.fog.color)
  })

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
      <group position={[last.x, 0, last.z]} rotation={[last.leanX, 0, last.leanZ]}>
        {CONDUCTOR_OFFSETS.map((offset) => (
          <mesh key={offset} position={[offset, ATTACH_HEIGHT - 0.12, 0]}>
            <cylinderGeometry args={[0.045, 0.055, 0.24, 7]} />
            <meshBasicMaterial color="#101313" />
          </mesh>
        ))}
      </group>
    </>
  )
}
