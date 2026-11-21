import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { ForestBatch } from './ForestBatch.js'

export default function ForestInstances({ part, placements, bounds, kind, distance, minimum = 0, name,heightAt }) {
  const batch = useMemo(() => new ForestBatch(part, placements, bounds, kind, distance, minimum,heightAt),
    [part, placements, bounds, kind, distance, minimum,heightAt])
  // Camera controllers run at priority 0. Distance/LOD follows their final pose;
  // native per-instance frustum culling then runs inside render (priority 1).
  useFrame(({ camera }) => batch.updateDistance(camera), .5)
  return <primitive object={batch} name={name} dispose={null}
    userData={{ forest: true, forestKind: kind, forestCapacity: placements.length }} />
}
