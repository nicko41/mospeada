import { Matrix4, Ray, Vector3 } from 'three'

const surfaces = new Set(), geometryGrids = new WeakMap()
const point = new Vector3(), world = new Vector3()
const CELL = 4

const shotInverse=new Matrix4(),shotRay=new Ray(),shotEnd=new Vector3(),shotHit=new Vector3()
const shotA=new Vector3(),shotB=new Vector3(),shotC=new Vector3(),shotWorld=new Vector3(),shotVisited=new Set()
// Shots traverse only the existing contact-grid cells crossed by the ray.
// No full terrain mesh scans, new acceleration structures or geometry copies.
export function raycastRideSurfaces(raycaster) {
  let nearest = null
  for (const mesh of surfaces) {
    if (mesh.userData.rideSurfaceActive === false) continue
    mesh.updateWorldMatrix(true, false)
    shotInverse.copy(mesh.matrixWorld).invert();shotRay.copy(raycaster.ray).applyMatrix4(shotInverse)
    const bounds=mesh.geometry.boundingBox
    if(bounds&&!shotRay.intersectsBox(bounds))continue
    raycaster.ray.at(raycaster.far,shotEnd).applyMatrix4(shotInverse)
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
        shotWorld.copy(shotHit).applyMatrix4(mesh.matrixWorld)
        const distance=shotWorld.distanceTo(raycaster.ray.origin)
        if(distance>=raycaster.near&&distance<=raycaster.far&&(!nearest||distance<nearest.distance))nearest={distance,point:shotWorld.clone(),object:mesh}
      }
      if(x===ex&&z===ez)break
      if(tx<tz){x+=sx;tx+=dx}else{z+=sz;tz+=dz}
    }
  }
  return nearest
}

function gridFor(geometry) {
  let grid = geometryGrids.get(geometry)
  if (grid) return grid
  grid = new Map()
  const cellSize=geometry.userData.rideGridCell||CELL
  grid.cellSize=cellSize
  if(geometry.userData.rideMutableHeight)grid.mutable=[]
  const p = geometry.attributes.position, index = geometry.index
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
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
    if (mesh.isMesh && mesh.userData.rideSurface) { surfaces.add(mesh); gridFor(mesh.geometry); owned.push(mesh) }
  })
  return () => owned.forEach(mesh => surfaces.delete(mesh))
}

// Barycentric height of the actual rendered triangles, including asphalt crowns,
// dirt road, embankment and recycled highway chunks. No invented terrain noise.
export function sampleRideHeight(x, z, contact) {
  let highest = -Infinity
  if (contact) {contact.surface = null;contact.biome=null;contact.earthWeight=0}
  for (const mesh of surfaces) {
    if(mesh.userData.rideSurfaceActive===false)continue
    mesh.updateWorldMatrix(true, false)
    point.set(x, 0, z); mesh.worldToLocal(point)
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
      const height = mesh.localToWorld(world).y
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
