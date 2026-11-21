import { BatchedMesh, Color, Matrix4, Object3D } from 'three'
import { forestSurfaceHeight } from './forestLayout.js'
import { FOREST_DISTANCE_MARGIN } from './forestLod.js'
import { forestBurial, forestInstanceTint } from './forestPlacement.js'
import {isCrashTree} from './forestCrashSite.js'

// Three's indirect batch keeps every transform/color resident in immutable GPU
// textures. The native onBeforeRender culls individual instances with the FINAL
// camera and rewrites only draw IDs, never the matrices, geometry or materials.
export class ForestBatch extends BatchedMesh {
  constructor(part, placements, bounds, kind, distance, minimum = 0,heightAt=forestSurfaceHeight) {
    if(kind==='tree')placements=placements.filter(p=>!isCrashTree(p))
    super(placements.length, part.geometry.attributes.position.count, part.geometry.index?.count || 0, part.material)
    const geometryId = this.addGeometry(part.geometry)
    this.perObjectFrustumCulled = true
    this.sortObjects = false
    this.distance = distance; this.minimum = minimum
    this.placements = placements
    this.cellX = this.cellZ = Infinity
    const object = new Object3D(), matrix = new Matrix4(), color = new Color()
    for (const p of placements) {
      const id = this.addInstance(geometryId)
      const burial = forestBurial(kind,bounds,p.scale)
      object.position.set(p.x, heightAt(p.x, p.z) - bounds.min.y * p.scale - burial, p.z)
      object.rotation.set(0, p.yaw, 0); object.scale.setScalar(p.scale); object.updateMatrix()
      this.setMatrixAt(id, matrix.multiplyMatrices(object.matrix, part.transform))
      this.setColorAt(id, forestInstanceTint(color,kind,p.tint))
    }
    // Include all resident transforms, including ones outside the current view.
    // These bounds never shrink to the previous frame's visible subset.
    this.computeBoundingBox(); this.computeBoundingSphere()
  }

  updateDistance(camera) {
    const cx = Math.floor(camera.position.x / 4), cz = Math.floor(camera.position.z / 4)
    if (cx === this.cellX && cz === this.cellZ) return
    this.cellX = cx; this.cellZ = cz
    const x = cx * 4 + 2, z = cz * 4 + 2
    for (let id = 0; id < this.placements.length; id++) {
      const p = this.placements[id], distance2 = (p.x - x) ** 2 + (p.z - z) ** 2
      this.setVisibleAt(id, distance2 < (this.distance+FOREST_DISTANCE_MARGIN) ** 2 && distance2 >= Math.max(0,this.minimum-FOREST_DISTANCE_MARGIN) ** 2)
    }
  }
}
