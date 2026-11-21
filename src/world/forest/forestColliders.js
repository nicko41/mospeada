import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import { boxCollider, cylinderCollider } from '../../player/collisionWorld.js'
import { forestLayout, forestSurfaceHeight } from './forestLayout.js'
import { isCrashTree } from './forestCrashSite.js'

export function createForestColliders(assets) {
  const colliders = [], transform = new Matrix4(), yaw = new Quaternion(), scale = new Vector3(), position = new Vector3(), up = new Vector3(0, 1, 0)
  for (const asset of assets) for (const p of forestLayout[asset.name]) {
    if(isCrashTree(p))continue // Replaced by the stump and fallen trunk colliders.
    const floor = forestSurfaceHeight(p.x, p.z)
    if (asset.kind === 'tree') {
      colliders.push(cylinderCollider(p.x, p.z, asset.trunkRadius * p.scale, floor - .1, floor + asset.bounds.max.y * p.scale * .78))
    } else if (asset.kind === 'rock') {
      const bury = .13 * (asset.bounds.max.y - asset.bounds.min.y) * p.scale
      position.set(p.x, floor - asset.bounds.min.y * p.scale - bury, p.z)
      transform.compose(position, yaw.setFromAxisAngle(up, p.yaw), scale.setScalar(p.scale))
      colliders.push(boxCollider(new Box3().copy(asset.bounds).applyMatrix4(transform), { walkable: false }))
    }
  }
  return colliders
}
