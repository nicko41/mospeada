import { useSyncExternalStore } from 'react'
import { allColliders, colliderRevision, subscribeColliders } from './collisionWorld'
import { SHOW_COLLIDERS } from './movementConfig'

function Wireframes() {
  useSyncExternalStore(subscribeColliders, colliderRevision, colliderRevision)
  return <group>{allColliders().map((collider, index) => <mesh key={index}
    position={[(collider.minX + collider.maxX) / 2, (collider.minY + collider.maxY) / 2, (collider.minZ + collider.maxZ) / 2]}>
    {collider.type === 'cylinder'
      ? <cylinderGeometry args={[collider.radius, collider.radius, collider.maxY - collider.minY, 8]} />
      : <boxGeometry args={[collider.maxX - collider.minX, collider.maxY - collider.minY, collider.maxZ - collider.minZ]} />}
    <meshBasicMaterial color={collider.vaultable ? '#55ddaa' : '#ff9955'} wireframe depthWrite={false} />
  </mesh>)}</group>
}

export default function ColliderDebug() {
  return SHOW_COLLIDERS ? <Wireframes /> : null
}
