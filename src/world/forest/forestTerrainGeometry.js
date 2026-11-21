import { Color, Float32BufferAttribute, PlaneGeometry } from 'three'
import { FOREST } from './forestConfig.js'
import { forestHeight, forestOpenness } from './forestLayout.js'
import { crashVertexHeight } from './forestLayout.js'
import { CRASH_PATCH,inCrashPatch } from './forestCrashSite.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export function createForestTerrain() {
  const geometry = new PlaneGeometry(FOREST.size, FOREST.size, FOREST.segments, FOREST.segments)
  geometry.rotateX(-Math.PI / 2)
  const p = geometry.attributes.position, colors = new Float32Array(p.count * 3)
  const ground = new Color(FOREST.palette.ground), path = new Color(FOREST.palette.path), shade = new Color('#315e63'), color = new Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), open = forestOpenness(x, z)
    p.setY(i, forestHeight(x, z))
    const patch = Math.sin(x * .12 + Math.sin(z * .09) * 2) * Math.cos(z * .16 + Math.sin(x * .1))
    color.copy(ground).lerp(shade, (1 - open) * (.28 + patch * .22)).lerp(path, open * .84)
    color.multiplyScalar(1 + Math.sin(x * .7 + z * .4) * .022)
    color.toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  const indices=[]
  for(let i=0;i<geometry.index.count;i+=3){const a=geometry.index.getX(i),b=geometry.index.getX(i+1),c=geometry.index.getX(i+2);if(!inCrashPatch((p.getX(a)+p.getX(b)+p.getX(c))/3,(p.getZ(a)+p.getZ(b)+p.getZ(c))/3))indices.push(a,b,c)}
  geometry.setIndex(indices)
  const patch=new PlaneGeometry(CRASH_PATCH.maxX-CRASH_PATCH.minX,CRASH_PATCH.maxZ-CRASH_PATCH.minZ,(CRASH_PATCH.maxX-CRASH_PATCH.minX)/CRASH_PATCH.step,(CRASH_PATCH.maxZ-CRASH_PATCH.minZ)/CRASH_PATCH.step)
  patch.rotateX(-Math.PI/2);patch.translate((CRASH_PATCH.maxX+CRASH_PATCH.minX)/2,0,(CRASH_PATCH.maxZ+CRASH_PATCH.minZ)/2)
  const positions=patch.attributes.position,uv=patch.attributes.uv
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,crashVertexHeight(x,z));uv.setXY(i,(x+FOREST.size/2)/FOREST.size,1-(z+FOREST.size/2)/FOREST.size)}
  patch.setAttribute('color',new Float32BufferAttribute(new Float32Array(positions.count*3).fill(1),3))
  const merged=mergeGeometries([geometry,patch]);geometry.dispose();patch.dispose()
  merged.computeVertexNormals();merged.computeBoundingBox();merged.computeBoundingSphere()
  return merged
}
