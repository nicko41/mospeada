import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import { timeOfDayState } from './TimeOfDay'
import { highwayFogState } from './sectors/highwayFogState'
import { highwayLightState } from './sectors/highwayLightState'

const PATCH_COUNT = 8
const vertexShader = /* glsl */ `
attribute vec2 mist;
varying vec2 vUv;
varying vec2 vMist;
varying float vDepth;
void main() {
  vUv = uv;
  vMist = mist;
  vec4 viewPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}
`
const fragmentShader = /* glsl */ `
uniform float uDay;
uniform float uDensity;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec2 vMist;
varying float vDepth;
void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float softEdge = 1.0 - smoothstep(0.12, 1.0, length(centered));
  // Low-contrast cloud texture, without per-pixel noise octaves or texture uploads.
  float cloud = 0.91 + sin(vUv.x * 8.0 + vUv.y * 3.0) * sin(vUv.y * 7.0 - vUv.x * 2.0) * 0.09;
  float transmission = exp(-uDensity * uDensity * vDepth * vDepth);
  float alpha = 0.065 * softEdge * cloud * vMist.x * smoothstep(4.0, 10.0, vDepth);
  vec3 mistColor = mix(vec3(0.024, 0.030, 0.032), vec3(0.27, 0.30, 0.31), uDay);
  mistColor += vec3(0.028, 0.024, 0.017) * vMist.y;
  gl_FragColor = vec4(mix(uFogColor, mistColor, transmission), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export default function GroundMist() {
  const mesh = useRef()
  const transform = useMemo(() => new THREE.Object3D(), [])
  const forward = useMemo(() => new THREE.Vector3(0, 0, -1), [])
  const cards = useMemo(() => Array.from({ length: PATCH_COUNT }, (_, index) => ({
    x: 0, z: 0, age: 0, initialized: false,
    depth: 11 + index * 3.6,
    lateral: Math.sin(index * 2.39 + 0.7) * 11,
  })), [])
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1)
    plane.setAttribute('mist', new THREE.InstancedBufferAttribute(new Float32Array(PATCH_COUNT * 2), 2)
      .setUsage(THREE.DynamicDrawUsage))
    return plane
  }, [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    depthTest: true, side: THREE.DoubleSide,
    uniforms: {
      uDay: { value: 0 }, uDensity: { value: 0.068 },
      uFogColor: { value: new THREE.Color('#0b0e0f') },
    },
  }), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  useFrame(({ camera, scene }, delta) => {
    camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1)
    forward.normalize()
    const step = Math.min(delta, 0.1)
    for (let index = 0; index < PATCH_COUNT; index += 1) {
      const card = cards[index]
      const dx = card.x - camera.position.x
      const dz = card.z - camera.position.z
      const depth = dx * forward.x + dz * forward.z
      const lateral = dx * -forward.z + dz * forward.x
      if (!card.initialized || depth < 3 || depth > 44 || Math.abs(lateral) > 23) {
        card.x = camera.position.x + forward.x * card.depth - forward.z * card.lateral
        card.z = camera.position.z + forward.z * card.depth + forward.x * card.lateral
        card.age = 0
        card.initialized = true
        // World anchored cards: camera turns only recycle those outside the nearby zone.
        card.yaw = Math.atan2(-forward.x, -forward.z)
      }
      card.age += step
      card.x += step * (index % 2 ? 0.025 : -0.018)
      const horizontal = index % 3 === 0
      const groundY = getWalkableHeightAt(card.x, card.z)
      transform.position.set(card.x, groundY + (horizontal ? 0.48 + index * 0.15 : 1.1), card.z)
      transform.rotation.set(horizontal ? -Math.PI / 2 + 0.045 : 0.06, card.yaw, 0, 'YXZ')
      transform.scale.set(8 + index % 3 * 1.4, horizontal ? 5 : 1.5, 1)
      transform.updateMatrix()
      mesh.current.setMatrixAt(index, transform.matrix)
      let illumination = 0
      for (const light of highwayLightState) {
        const distanceSq = (card.x - light.x) ** 2 + (card.z - light.z) ** 2
        illumination = Math.max(illumination, light.strength * Math.max(0, 1 - distanceSq / 81))
      }
      const distance = Math.hypot(card.x - camera.position.x, card.z - camera.position.z)
      const fade = THREE.MathUtils.smoothstep(card.age, 0, 2.5)
        * (1 - THREE.MathUtils.smoothstep(distance, 34, 44))
        * (1 - highwayFogState.absorption)
      geometry.attributes.mist.setXY(index, fade, illumination)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    geometry.attributes.mist.needsUpdate = true
    material.uniforms.uDay.value = timeOfDayState.value
    material.uniforms.uDensity.value = scene.fog?.density ?? 0.068
    if (scene.fog) material.uniforms.uFogColor.value.copy(scene.fog.color)
  })

  return <instancedMesh ref={mesh} args={[geometry, material, PATCH_COUNT]}
    renderOrder={5} frustumCulled={false} />
}
