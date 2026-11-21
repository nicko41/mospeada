import { FOREST, FOREST_ASSETS, FOREST_HERO_TREES } from './forestConfig.js'
import { crashVegetationClearance } from './forestCrashConfig.js'
import { CRASH_PATCH,crashSiteSample,crashFoundationWeight,inCrashPatch,isCrashTree } from './forestCrashSite.js'
import {CRASH_RELOCATION} from './crashRelocation.js'
import {forestPathX,forestBranchZ} from './forestSurface.js'
export {forestPathX,forestBranchZ} from './forestSurface.js'

const clamp = (x, min, max) => Math.max(min, Math.min(max, x))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export function forestRandom(seed) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
}
export function forestPathDistance(x, z) {
  // Historical terrain/seed ledger: changing this would move the approved
  // ground and crash foundation. Live paint/foliage use forestRouteDistance.
  return Math.min(Math.abs(x - forestPathX(z)), Math.abs(z - forestBranchZ(x)))
}
export function forestOpenness(x, z) {
  const clearing = 1 - smooth(FOREST.clearingRadius - 4, FOREST.clearingRadius + 6, Math.hypot(x, z * .86))
  const trail = 1 - smooth(FOREST.pathHalfWidth - 1, FOREST.pathHalfWidth + 2.4, forestPathDistance(x, z))
  return Math.max(clearing, trail)
}
export function forestHeight(x, z) {
  const undulation = Math.sin(x * .022 + .3) * Math.cos(z * .017) * 1.7
    + Math.sin(z * .047 + x * .011) * .45 + Math.sin(x * .075 - z * .039) * .17
  const distant = smooth(90, 320, Math.hypot(x, z)) * (2.5 + 2.4 * Math.sin(x * .009 + z * .006))
  const clear = smooth(7, 27, Math.hypot(x, z))
  return undulation * clear * (1 - forestOpenness(x, z) * .48) + distant - .12
}

// Height on the same diagonal and grid used by PlaneGeometry: props never float
// above an analytic curve while the wheels stand on its triangulated version.
export function forestBaseSurfaceHeight(x, z) {
  const half = FOREST.size / 2, step = FOREST.size / FOREST.segments
  if (Math.abs(x) > half || Math.abs(z) > half) return -Infinity
  const ix = Math.min(FOREST.segments - 1, Math.floor((x + half) / step))
  const iz = Math.min(FOREST.segments - 1, Math.floor((z + half) / step))
  const x0 = ix * step - half, z0 = iz * step - half
  const u = (x - x0) / step, v = (z - z0) / step
  const a = forestHeight(x0, z0), b = forestHeight(x0, z0 + step)
  const c = forestHeight(x0 + step, z0), d = forestHeight(x0 + step, z0 + step)
  return u + v <= 1 ? a + (c - a) * u + (b - a) * v : d + (b - d) * (1 - u) + (c - d) * (1 - v)
}

export const forestCrashReferenceBaseHeight=(x,z)=>forestBaseSurfaceHeight(x-CRASH_RELOCATION.x,z-CRASH_RELOCATION.z)+CRASH_RELOCATION.y
export function crashVertexHeight(x,z){const sample=crashSiteSample(x,z),base=forestBaseSurfaceHeight(x,z),weight=crashFoundationWeight(x,z,sample);return base+(forestCrashReferenceBaseHeight(x,z)-base)*weight+sample.height}
export function forestSurfaceHeight(x,z){
  if(!inCrashPatch(x,z))return forestBaseSurfaceHeight(x,z)
  const {minX,minZ,maxX,maxZ,step}=CRASH_PATCH
  const x0=Math.min(maxX-step,minX+Math.floor((x-minX)/step)*step),z0=Math.min(maxZ-step,minZ+Math.floor((z-minZ)/step)*step)
  const u=(x-x0)/step,v=(z-z0)/step,a=crashVertexHeight(x0,z0),b=crashVertexHeight(x0,z0+step),c=crashVertexHeight(x0+step,z0),d=crashVertexHeight(x0+step,z0+step)
  return u+v<=1?a+(c-a)*u+(b-a)*v:d+(b-d)*(1-u)+(c-d)*(1-v)
}

export function createForestLayout(seed = FOREST.seed,sourceLedger=false) {
  const random = forestRandom(seed), between = (a, b) => a + (b - a) * random()
  const byName = Object.fromEntries(FOREST_ASSETS.map(asset => [asset.name, []]))
  const trees = [], buckets = new Map(), cellSize = 12
  const add = (asset, x, z, extra = {}) => {
    const scale = extra.scale ?? between(...asset.scale), yaw = extra.yaw ?? between(0, Math.PI * 2)
    const placement = { x, z, scale, yaw, tint: between(.84, 1.08), kind: asset.kind, name: asset.name, ...extra }
    byName[asset.name].push(placement)
    return placement
  }
  const treeDefinitions = FOREST_ASSETS.filter(a => a.kind === 'tree')
  const placeTree = (asset, x, z, extra = {}) => {
    const scale = extra.scale ?? between(...asset.scale), radius = asset.trunkRadius * scale
    const spacing = between(2.8, 7.5)
    if (Math.abs(x) > 384 || Math.abs(z) > 384 || forestOpenness(x,z) > .08) return false
    // Reserve the actual enlarged trunk footprint, with room for the Cyclone
    // and its existing camera, along both connected routes and the spawn.
    if (forestPathDistance(x,z) < FOREST.pathHalfWidth + radius + 1.3
      || Math.hypot(x,z) < FOREST.clearingRadius + radius + 2) return false
    const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize)
    let overlaps = false
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const p of buckets.get(`${cx + i},${cz + j}`) || []) {
        if (Math.hypot(x-p.x,z-p.z) < Math.max(radius+p.trunkRadius+.6,(spacing+p.spacing)*.5)) overlaps = true
      }
    }
    if (overlaps) return false
    const p = add(asset, x, z, { ...extra, scale, trunkRadius: radius, spacing }); trees.push(p)
    const key = `${cx},${cz}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(p)
    return true
  }
  for (const hero of FOREST_HERO_TREES) {
    const asset = treeDefinitions.find(a=>a.name===hero.name)
    if (!placeTree(asset,hero.x,hero.z,{...hero,layer:'hero'})) throw Error('Hero tree blocks the forest route: '+hero.name)
  }
  // Distinct stands and gaps, with most new trees in the middle/outer layers.
  // Randomly oriented elliptical groves never become rings or planting rows.
  for (const band of FOREST.groveBands) {
    const centers = []
    while (centers.length < band.groves) {
      const x=between(-375,375),z=between(-375,375),r=Math.hypot(x,z)
      if(r<band.radius[0]||r>band.radius[1])continue
      centers.push({x,z,radius:between(...band.spread),stretch:between(.5,1.3),yaw:between(0,Math.PI*2)})
    }
    const target=trees.length+(band.layer==='foreground'?band.count-FOREST_HERO_TREES.length:band.count)
    for(let attempt=0;trees.length<target&&attempt<band.count*160;attempt++) {
      const grove=centers[Math.floor(random()*centers.length)],angle=between(0,Math.PI*2),r=Math.sqrt(random())*grove.radius
      const dx=Math.cos(angle)*r,dz=Math.sin(angle)*r*grove.stretch
      const x=grove.x+Math.cos(grove.yaw)*dx-Math.sin(grove.yaw)*dz,z=grove.z+Math.sin(grove.yaw)*dx+Math.cos(grove.yaw)*dz
      if(Math.hypot(x,z)<band.radius[0]||Math.hypot(x,z)>band.radius[1])continue
      const pick=random(),asset=treeDefinitions[pick<.46?0:pick<.81?1:pick<.88?2:3]
      placeTree(asset,x,z,{layer:band.layer})
    }
    // Unusual seeds can saturate their first few groves. Complete the band
    // with ungridded gaps/young stands, without relaxing route/root clearance.
    for(let attempt=0;trees.length<target&&attempt<band.count*400;attempt++) {
      const extent=Math.min(384,band.radius[1]),x=between(-extent,extent),z=between(-extent,extent),r=Math.hypot(x,z)
      if(r<band.radius[0]||r>band.radius[1])continue
      const pick=random(),asset=treeDefinitions[pick<.46?0:pick<.81?1:pick<.88?2:3]
      placeTree(asset,x,z,{layer:band.layer})
    }
    if(trees.length<target)throw Error('Forest grove capacity insufficient: '+band.layer)
  }
  const foreground = trees.filter(p=>Math.hypot(p.x,p.z)<105)
  const populate = (kind, count, extent, clustered) => {
    const choices = FOREST_ASSETS.filter(asset => asset.kind === kind)
    for (let n = 0, attempts = 0; n < count && attempts < count * 16; attempts++) {
      let x, z
      if (clustered && random() < .75) {
        const pool = random() < .12 ? foreground : trees
        const anchor = pool[Math.floor(random() * pool.length)]
        x = anchor.x + between(-7, 7); z = anchor.z + between(-7, 7)
      } else {
        const patchExtent = random() < .2 ? 105 : extent
        x = between(-patchExtent, patchExtent); z = between(-patchExtent, patchExtent)
      }
      if (Math.abs(x) > extent || Math.abs(z) > extent) continue
      const open = forestOpenness(x, z)
      if (kind === 'rock' || kind === 'shrub') { if (open > .12) continue }
      else if (Math.hypot(x,z)<4 || open > .85 && random() > .1) continue
      // Grouped patches separated by bare ground; low grass stays low enough for combat.
      if (kind === 'grass' && Math.sin(x * .13 + Math.sin(z * .18)) + Math.cos(z * .16) < -.3) continue
      add(choices[Math.floor(random() * choices.length)], x, z); n++
    }
  }
  populate('shrub', FOREST.shrubs, 370, true)
  populate('grass', FOREST.grass, 370, true)
  populate('plant', FOREST.plants, 370, true)
  populate('rock', FOREST.rocks, 370, true)
  populate('pebble', FOREST.pebbles, 370, false)
  const patch=FOREST.clearingPatches
  const lowGrass=FOREST_ASSETS.filter(a=>a.kind==='grass'),lowPlants=FOREST_ASSETS.filter(a=>a.kind==='plant')
  for(let n=0,attempt=0;n<patch.count&&attempt<patch.count*100;attempt++) {
    const angle=between(0,Math.PI*2),r=between(...patch.radius),x=Math.cos(angle)*r,z=Math.sin(angle)*r
    if(forestPathDistance(x,z)<FOREST.pathHalfWidth+1)continue
    const spread=between(.9,2.2)
    for(const [choices,count] of [[lowGrass,patch.grass],[lowPlants,patch.plants]])for(let i=0;i<count;i++) {
      const yaw=between(0,Math.PI*2),radius=Math.sqrt(random())*spread,px=x+Math.cos(yaw)*radius,pz=z+Math.sin(yaw)*radius
      if(forestPathDistance(px,pz)<FOREST.pathHalfWidth+.5||Math.hypot(px,pz)<5)continue
      add(choices[Math.floor(random()*choices.length)],px,pz,{layer:'clearing-edge'})
    }
    n++
  }
  // Local dressing only: keep the seeded forest and routes, clear the wreck's
  // footprint and short drag scar instead of regenerating the whole level.
  if(!sourceLedger)for(const name of Object.keys(byName))byName[name]=byName[name].filter(p=>!crashVegetationClearance(p.x,p.z,p.kind==='tree'?p.trunkRadius:0))
  if(!sourceLedger)for(const name of Object.keys(byName))byName[name]=byName[name].filter(p=>!isCrashTree(p)&&(!['grass','shrub','plant'].includes(p.kind)||!crashSiteSample(p.x,p.z).destroyed))
  return byName
}

// The ledger preserves procedural random/anchor decisions outside the crash.
// All normal rendering and colliders consume only the persistently filtered set.
export const forestSourceLayout=createForestLayout(FOREST.seed,true)
export const forestLayout=Object.fromEntries(Object.entries(forestSourceLayout).map(([name,p])=>[name,p.filter(v=>!crashVegetationClearance(v.x,v.z,v.kind==='tree'?v.trunkRadius:0)&&!isCrashTree(v)&&(!['grass','shrub','plant'].includes(v.kind)||!crashSiteSample(v.x,v.z).destroyed))]))
