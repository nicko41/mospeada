import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { vehicleState } from '../player/vehicleState'

const HEADLIGHT_INTENSITY = 180
const HEADLIGHT_RANGE = 32
const SIDES = [-1, 1]

export default function CarHeadlights() {
  const lights = useRef([])
  const lenses = useRef()
  const targets = useMemo(() => SIDES.map(side => {
    const target = new THREE.Object3D()
    target.position.set(side * 1.25, 0.2, 25)
    return target
  }), [])
  useFrame(() => {
    const on = vehicleState.active
    if (lenses.current) lenses.current.visible = on
    for (const light of lights.current) if (light) light.intensity = on ? HEADLIGHT_INTENSITY : 0
  }, -0.8)
  return <>
    {targets.map((target, index) => <group key={index}>
      <primitive object={target} />
      <spotLight ref={light => { lights.current[index] = light }}
        position={[SIDES[index] * 0.87, 1.2, 3.27]} target={target}
        color="#fff0d6" intensity={0} distance={HEADLIGHT_RANGE}
        angle={0.35} penumbra={0.65} decay={2} castShadow={false} />
    </group>)}
    <group ref={lenses} visible={false}>
      {SIDES.map(side => <mesh key={side} position={[side * 0.87, 1.2, 3.205]}>
        <planeGeometry args={[0.36, 0.2]} />
        <meshBasicMaterial color="#fff0d6" toneMapped={false} fog />
      </mesh>)}
    </group>
  </>
}
