import { BatchedMesh, Color, Matrix4, Object3D } from 'three'
import { forestSurfaceHeight } from './forestLayout.js'
import { FOREST_DISTANCE_MARGIN,forestTreeLevel,forestWoodLevel,forestCanopyDetailLevel,canopyLodTest } from './forestLod.js'
import { forestBurial, forestInstanceTint } from './forestPlacement.js'
import {isCrashTree} from './forestCrashSite.js'
import {forestCanopyVariant} from './forestCanopyVariants.js'
import {canopyInstanceTint} from './forestCanopyTone.js'

// Three's indirect batch keeps every transform/color resident in immutable GPU
// textures. The native onBeforeRender culls individual instances with the FINAL
// camera and rewrites only draw IDs, never the matrices, geometry or materials.
export class ForestBatch extends BatchedMesh {
  constructor(part, placements, bounds, kind, distance, minimum = 0,heightAt=forestSurfaceHeight) {
    if(kind==='tree')placements=placements.filter(p=>!isCrashTree(p))
    const variants=part.variants||[part.geometry],resident=[...variants,...(part.highVariants||[])]
    super(placements.length, resident.reduce((n,g)=>n+g.attributes.position.count,0), resident.reduce((n,g)=>n+(g.index?.count||0),0), part.material)
    const geometryIds=resident.map(g=>this.addGeometry(g))
    this.geometryVariants=variants.length
    this.canopyLodControl=canopyLodTest
    this.canopyRole=part.canopyRole
    this.woodLevels=part.canopyRole==='wood'||part.canopyRole==='woodMid'?new Int8Array(placements.length).fill(-1):null
    this.canopyDetailLevels=part.highVariants?new Int8Array(placements.length).fill(-1):null
    this.canopyGeometryIds=part.highVariants?geometryIds:null
    this.perObjectFrustumCulled = true
    this.sortObjects = false
    this.distance = distance; this.minimum = minimum
    this.placements = placements
    this.treeLevels=kind==='tree'?new Int8Array(placements.length).fill(-1):null
    this.cellX = this.cellZ = Infinity
    const object = new Object3D(), matrix = new Matrix4(), color = new Color()
    for (const p of placements) {
      const id = this.addInstance(geometryIds[forestCanopyVariant(p,variants.length)])
      const burial = forestBurial(kind,bounds,p.scale)
      object.position.set(p.x, heightAt(p.x, p.z) - bounds.min.y * p.scale - burial, p.z)
      object.rotation.set(0, p.yaw, 0); object.scale.setScalar(p.scale); object.updateMatrix()
      this.setMatrixAt(id, matrix.multiplyMatrices(object.matrix, part.transform))
      this.setColorAt(id, part.animeCanopyTint?canopyInstanceTint(color,p):part.preserveIllustration?color.setScalar(1):forestInstanceTint(color,kind,p.tint))
    }
    // Include all resident transforms, including ones outside the current view.
    // These bounds never shrink to the previous frame's visible subset.
    this.computeBoundingBox(); this.computeBoundingSphere()
  }

  updateDistance(camera,offsetZ=0,offsetX=0) {
    const cx = Math.floor((camera.position.x-offsetX) / 4), cz = Math.floor((camera.position.z-offsetZ) / 4)
    if (cx === this.cellX && cz === this.cellZ) return
    this.cellX = cx; this.cellZ = cz
    const x = cx * 4 + 2, z = cz * 4 + 2
    for (let id = 0; id < this.placements.length; id++) {
      const p = this.placements[id], distance2 = (p.x - x) ** 2 + (p.z - z) ** 2
      if(this.treeLevels){
        const distance=Math.sqrt(distance2),level=forestTreeLevel(p,distance,this.treeLevels[id]);this.treeLevels[id]=level
        if(this.canopyDetailLevels){const detail=forestCanopyDetailLevel(p,distance,this.canopyDetailLevels[id]);if(detail!==this.canopyDetailLevels[id]){this.canopyDetailLevels[id]=detail;this.setGeometryIdAt(id,this.canopyGeometryIds[forestCanopyVariant(p,this.geometryVariants)+detail*this.geometryVariants])}}
        let visible=level===(this.minimum>0?1:0)
        if(this.woodLevels){const wood=forestWoodLevel(p,distance,this.woodLevels[id]);this.woodLevels[id]=wood;visible=this.canopyRole==='wood'?wood===0:wood===1&&level===0}
        this.setVisibleAt(id,visible&&distance2<(this.distance+FOREST_DISTANCE_MARGIN)**2)
      }else this.setVisibleAt(id, distance2 < (this.distance+FOREST_DISTANCE_MARGIN) ** 2 && distance2 >= Math.max(0,this.minimum-FOREST_DISTANCE_MARGIN) ** 2)
    }
  }
}
