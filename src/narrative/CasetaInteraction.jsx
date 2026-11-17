import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getWalkableHeightAt } from '../player/getWalkableHeight'
import { getCasetaScene, setCasetaFocus } from './casetaScene'

export default function CasetaInteraction() {
  const { camera } = useThree()
  const direction = useMemo(() => new THREE.Vector3(), [])
  const toward = useMemo(() => new THREE.Vector3(), [])
  const baseY = useMemo(() => getWalkableHeightAt(28, -105), [])
  const letter = useMemo(() => new THREE.Vector3(27.07, baseY + 0.8, -105.3), [baseY])
  const phone = useMemo(() => new THREE.Vector3(29.28, baseY + 1.25, -105.32), [baseY])

  useFrame(() => {
    const state = getCasetaScene()
    if (state.letterOpen || state.phoneTestInProgress) {
      setCasetaFocus(null)
      return
    }
    camera.getWorldDirection(direction)
    let focus = null
    let bestAim = 0.93
    for (const [name, target, available] of [
      ['letter', letter, state.highwayAnomalySeen],
      ['phone', phone, !state.letterRead || (state.phoneRinging && !state.phoneAnswered)],
    ]) {
      if (!available) continue
      toward.subVectors(target, camera.position)
      if (toward.length() > 2.5) continue
      const aim = direction.dot(toward.normalize())
      if (aim > bestAim) {
        bestAim = aim
        focus = name
      }
    }
    setCasetaFocus(focus)
  })

  return null
}
