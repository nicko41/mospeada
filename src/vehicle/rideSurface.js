import { Matrix3, Matrix4, Ray, Vector3 } from 'three'

const surfaces = new Set(), barriers = new Set(), geometryGrids = new WeakMap()
const point = new Vector3(), world = new Vector3()
const heightInverse=new Matrix4()
const CELL = 4
const translationOnly=e=>e[0]===1&&e[5]===1&&e[10]===1&&e[1]===0&&e[2]===0&&e[4]===0&&e[6]===0&&e[8]===0&&e[9]===0

const shotInverse=new Matrix4(),shotRay=new Ray(),shotEnd=new Vector3(),shotHit=new Vector3()
const shotA=new Vector3(),shotB=new Vector3(),shotC=new Vector3(),shotWorld=new Vector3(),shotVisited=new Set()
const shotNormal=new Vector3(),shotEdge=new Vector3(),shotNormalMatrix=new Matrix3()
// Shots traverse only the existing contact-grid cells crossed by the ray.
// No full terrain mesh scans, new acceleration structures or geometry copies.
export function raycastRideSurfaces(raycaster) {
  return raycastRegistered(raycaster,surfaces)
}
export function raycastRideBarriers(raycaster){return raycastRegistered(raycaster,barriers)}
function raycastRegistered(raycaster,collection){
  let nearest = null
  for (const mesh of collection) {
    if (mesh.userData.rideSurfaceActive === false) continue
    mesh.updateWorldMatrix(true, false)
    const e=mesh.matrixWorld.elements,translated=translationOnly(e)
    raycaster.ray.at(raycaster.far,shotEnd)
    if(translated){shotRay.copy(raycaster.ray);shotRay.origin.x-=e[12];shotRay.origin.y-=e[13];shotRay.origin.z-=e[14];shotEnd.x-=e[12];shotEnd.y-=e[13];shotEnd.z-=e[14]}
    else{shotInverse.copy(mesh.matrixWorld).invert();shotRay.copy(raycaster.ray).applyMatrix4(shotInverse);shotEnd.applyMatrix4(shotInverse)}
    const bounds=mesh.geometry.boundingBox
    // Enemy bolts sweep short segments. An infinite ray hitting a later tile
    // must not make that tile traverse its triangle grid on every live bolt.
    if(bounds&&!bounds.containsPoint(shotRay.origin)&&(!shotRay.intersectBox(bounds,shotHit)||shotHit.distanceToSquared(shotRay.origin)>shotEnd.distanceToSquared(shotRay.origin)+1e-8))continue
    const grid=gridFor(mesh.geometry),size=grid.cellSize,o=shotRay.origin,d=shotRay.direction
    let x=Math.floor(o.x/size),z=Math.floor(o.z/size)
    const ex=Math.floor(shotEnd.x/size),ez=Math.floor(shotEnd.z/size),sx=Math.sign(d.x),sz=Math.sign(d.z)
    const dx=sx?size/Math.abs(d.x):Infinity,dz=sz?size/Math.abs(d.z):Infinity
    let tx=sx?((x+(sx>0?1:0))*size-o.x)/d.x:Infinity,tz=sz?((z+(sz>0?1:0))*size-o.z)/d.z:Infinity
    const steps=Math.abs(ex-x)+Math.abs(ez-z)+3
    shotVisited.clear()
    for(let i=0;i<steps;i++){
      for(const t of grid.get(`${x},${z}`)||[]){
        if(shotVisited.has(t))continue;shotVisited.add(t)
        if(!shotRay.intersectTriangle(shotA.fromArray(t[0]),shotB.fromArray(t[1]),shotC.fromArray(t[2]),false,shotHit))continue
        if(translated)shotWorld.set(shotHit.x+e[12],shotHit.y+e[13],shotHit.z+e[14]);else shotWorld.copy(shotHit).applyMatrix4(mesh.matrixWorld)
        const distance=shotWorld.distanceTo(raycaster.ray.origin)
        if(distance>=raycaster.near&&distance<=raycaster.far&&(!nearest||distance<nearest.distance)){
          shotNormal.subVectors(shotB,shotA).cross(shotEdge.subVectors(shotC,shotA)).applyNormalMatrix(shotNormalMatrix.getNormalMatrix(mesh.matrixWorld));if(shotNormal.dot(raycaster.ray.direction)>0)shotNormal.negate()
          nearest={distance,point:shotWorld.clone(),normal:shotNormal.clone(),object:mesh}
        }
      }
      if(x===ex&&z===ez)break
      if(tx<tz){x+=sx;tx+=dx}else{z+=sz;tz+=dz}
    }
  }
  return nearest
}

export function* prepareRideSurfaceGeometrySteps(geometry) {
  let grid = geometryGrids.get(geometry)
  if (grid) return grid
  grid = new Map()
  const cellSize=geometry.userData.rideGridCell||CELL
  grid.cellSize=cellSize
  if(geometry.userData.rideMutableHeight)grid.mutable=[]
  const p = geometry.attributes.position, index = geometry.index
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    if(i%768===0)yield
    const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j)
    const t = ids.map(id => [p.getX(id), p.getY(id), p.getZ(id)])
    grid.mutable?.push({triangle:t,ids})
    const minX = Math.floor(Math.min(...t.map(v => v[0])) / cellSize), maxX = Math.floor(Math.max(...t.map(v => v[0])) / cellSize)
    const minZ = Math.floor(Math.min(...t.map(v => v[2])) / cellSize), maxZ = Math.floor(Math.max(...t.map(v => v[2])) / cellSize)
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const key = `${x},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(t)
    }
  }
  geometryGrids.set(geometry, grid)
  return grid
}
function gridFor(geometry){const steps=prepareRideSurfaceGeometrySteps(geometry);let step;do{step=steps.next()}while(!step.done);return step.value}
// Opt-in height deformation retains cell membership and shared triangle arrays;
// the connector changes only Y, so no spatial grid is rebuilt at the handoff.
export function refreshRideSurfaceGeometry(geometry){
  const grid=geometryGrids.get(geometry)
  if(grid?.mutable){const p=geometry.attributes.position;for(const {triangle,ids}of grid.mutable)for(let j=0;j<3;j++)triangle[j][1]=p.getY(ids[j]);return}
  geometryGrids.delete(geometry);gridFor(geometry)
}

export function registerRideSurfaces(scene) {
  const owned = []
  scene.traverse(mesh => {
    if (mesh.isMesh && (mesh.userData.rideSurface||mesh.userData.rideBarrier)) { (mesh.userData.rideBarrier?barriers:surfaces).add(mesh); gridFor(mesh.geometry); owned.push(mesh) }
  })
  return () => owned.forEach(mesh => {surfaces.delete(mesh);barriers.delete(mesh)})
}

// Barycentric height of the actual rendered triangles, including asphalt crowns,
// dirt road, embankment and recycled highway chunks. No invented terrain noise.
export function sampleRideHeight(x, z, contact) {
  let highest = -Infinity
  if (contact) {contact.surface = null;contact.biome=null;contact.earthWeight=0}
  for (const mesh of surfaces) {
    if(mesh.userData.rideSurfaceActive===false)continue
    mesh.updateWorldMatrix(true, false)
    const e=mesh.matrixWorld.elements,translated=translationOnly(e)
    if(translated)point.set(x-e[12],-e[13],z-e[14])
    else point.set(x,0,z).applyMatrix4(heightInverse.copy(mesh.matrixWorld).invert())
    const bounds=mesh.geometry.boundingBox
    if(bounds&&(point.x<bounds.min.x-1e-6||point.x>bounds.max.x+1e-6||point.z<bounds.min.z-1e-6||point.z>bounds.max.z+1e-6))continue
    const grid=gridFor(mesh.geometry),cellSize=grid.cellSize
    const triangles = grid.get(`${Math.floor(point.x / cellSize)},${Math.floor(point.z / cellSize)}`)
    if (!triangles) continue
    for (const [a, b, c] of triangles) {
      const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
      if (Math.abs(denominator) < 1e-10) continue
      const u = ((b[2] - c[2]) * (point.x - c[0]) + (c[0] - b[0]) * (point.z - c[2])) / denominator
      const v = ((c[2] - a[2]) * (point.x - c[0]) + (a[0] - c[0]) * (point.z - c[2])) / denominator
      if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue
      world.set(point.x, u * a[1] + v * b[1] + (1 - u - v) * c[1], point.z)
      // The world matrix is already current above. Avoid updating every
      // ancestor again for every supporting triangle and foot probe.
      const height = translated?world.y+e[13]:world.applyMatrix4(mesh.matrixWorld).y
      if (height > highest) {
        highest = height
        if (contact) {
          contact.surface = mesh.userData.rideSurfaceType || 'dirt'
          contact.biome=mesh.userData.rideSurfaceBiome||null
          contact.earthWeight=mesh.userData.rideSurfaceEarthWeight?.(x,z)??(contact.surface==='dirt'?1:0)
        }
      }
    }
  }
  return highest
}
