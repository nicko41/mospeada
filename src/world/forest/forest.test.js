import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Box3, Group, Mesh, MeshLambertMaterial, Vector3 } from 'three'
import { createForestTerrain } from './forestTerrainGeometry.js'
import { createForestLayout, forestBranchZ, forestLayout, forestPathX, forestSurfaceHeight } from './forestLayout.js'
import { FOREST, FOREST_ASSETS, FOREST_HERO_TREES } from './forestConfig.js'
import { createForestColliders } from './forestColliders.js'
import { overlapsFootprint, queryColliders, registerColliders } from '../../player/collisionWorld.js'
import { registerRideSurfaces, sampleRideHeight } from '../../vehicle/rideSurface.js'
import { createBikeState, advanceBike } from '../../vehicle/bikePhysics.js'
import { advanceArmor, createArmorState } from '../../vehicle/armorPhysics.js'
import { resolveEnvironment } from '../environmentConfig.js'
import { materialProfile } from '../../rendering/AnimeRenderer.js'
import { patchAnimeShader } from '../../rendering/animeShaders.js'
import { animeProgramKey } from '../../rendering/renderPreparation.js'
import { ShaderLib } from 'three'
import {CRASH_TREE_EXCLUSIONS,isCrashTree} from './forestCrashSite.js'

// Measure original files independently of the generated audit artifact.
const assets = FOREST_ASSETS.map(definition => {
  const data = JSON.parse(fs.readFileSync(`public/models/glTF/${definition.name}.gltf`))
  const bounds = new Box3()
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) {
    const p = data.accessors[primitive.attributes.POSITION]
    bounds.union(new Box3(new Vector3(...p.min), new Vector3(...p.max)))
  }
  return { ...definition, bounds }
})
const geometry = createForestTerrain(), scene = new Group(), ground = new Mesh(geometry, new MeshLambertMaterial())
ground.userData.rideSurface = true; ground.userData.rideSurfaceType = 'dirt'; scene.add(ground)
const metrics = { frontZ: .78, rearZ: -.78, frontY: .375, rearY: .375, frontRadius: .375, rearRadius: .375, wheelbase: 1.56 }

test('forest distribution repeats exactly, changes with seed and protects the clearing', () => {
  assert.deepEqual(createForestLayout(), forestLayout)
  assert.notDeepEqual(createForestLayout(37).CommonTree_3, forestLayout.CommonTree_3)
  assert.equal(FOREST_ASSETS.filter(a=>a.kind==='tree').reduce((n,a)=>n+forestLayout[a.name].length,0),FOREST.trees-CRASH_TREE_EXCLUSIONS.length)
  for (const asset of FOREST_ASSETS.filter(a=>a.kind==='tree'||a.kind==='rock')) {
    for (const p of forestLayout[asset.name]) assert.ok(Math.hypot(p.x, p.z) > FOREST.clearingRadius)
  }
})

test('tall hero silhouettes and clustered forest layers preserve the smaller playable clearing', () => {
  const trees=FOREST_ASSETS.filter(a=>a.kind==='tree').flatMap(a=>forestLayout[a.name].map(p=>({...p,height:assets.find(b=>b.name===a.name).bounds.getSize(new Vector3()).y*p.scale})))
  const hero=trees.filter(p=>p.layer==='hero')
  assert.equal(hero.length,FOREST_HERO_TREES.filter(p=>!isCrashTree(p)).length)
  assert.ok(hero.filter(p=>p.height>30).length>=4)
  assert.ok(trees.reduce((n,p)=>n+p.height,0)/trees.length>20)
  assert.ok(trees.filter(p=>p.layer==='outer').length>=3000)
  assert.ok(Object.values(forestLayout).flat().some(p=>p.layer==='clearing-edge'&&Math.hypot(p.x,p.z)<13))
})

test('prop grounding agrees with the real rendered triangle sampler across the entire terrain', () => {
  const dispose = registerRideSurfaces(scene)
  try {
    for (let i=0;i<800;i++) {
      const x = Math.sin(i*13.47)*398, z = Math.cos(i*7.91)*398
      assert.ok(Math.abs(sampleRideHeight(x,z)-forestSurfaceHeight(x,z))<2e-6)
    }
    assert.equal(sampleRideHeight(401,0),-Infinity)
  } finally { dispose() }
})

test('tree trunks and rocks block movement, small vegetation stays passable, both trails stay open', () => {
  const colliders = createForestColliders(assets), dispose = registerColliders(colliders), nearby = []
  try {
    assert.equal(colliders.length, FOREST.trees+FOREST.rocks-CRASH_TREE_EXCLUSIONS.length)
    const canMove = (x,z) => {
      queryColliders(x-1,z-1,x+1,z+1,nearby)
      return !nearby.some(c=>overlapsFootprint(c,x,z,.6))
    }
    assert.ok(canMove(0,0))
    for(let z=-360;z<=360;z+=2) assert.ok(canMove(forestPathX(z),z),`Blocked path at ${z}`)
    for(let x=-360;x<=360;x+=2) assert.ok(canMove(x,forestBranchZ(x)),`Blocked branch at ${x}`)
    for(const c of colliders.slice(0,20)) assert.equal(canMove(c.x,c.z),false)
  } finally { dispose() }
})

test('Cyclone and Armor traverse the forest using the existing physics on rendered ground', () => {
  const dispose = registerRideSurfaces(scene)
  try {
    const bike = createBikeState({x:0,z:0,yaw:Math.PI},metrics,sampleRideHeight)
    for(let i=0;i<150;i++) advanceBike(bike,{throttle:1},1/120,metrics,sampleRideHeight)
    assert.ok(bike.z < -7 && bike.speed > 10 && Number.isFinite(bike.height))
    const a = createArmorState({x:0,z:0,height:0,yaw:Math.PI,speed:0});a.mode='ARMOR_GROUND'
    for(let i=0;i<240;i++) advanceArmor(a,{forward:1,yaw:Math.PI},1/120,sampleRideHeight)
    assert.ok(a.z < -4 && a.grounded && Number.isFinite(a.y))
    assert.ok(Math.abs(a.y-sampleRideHeight(a.x,a.z))<.06)
  } finally { dispose() }
})

test('forest is the default, highway bookmarks and explicit environment selection are preserved', () => {
  assert.equal(resolveEnvironment(''),'forest')
  assert.equal(resolveEnvironment('?start=jump'),'highway')
  assert.equal(resolveEnvironment('?start=forest'),'forest')
  assert.equal(resolveEnvironment('?environment=highway'),'highway')
  assert.equal(resolveEnvironment('?environment=forest&start=jump'),'forest')
})

test('forest materials keep soft lighting and no outline mask while the hero retains its Anime treatment', () => {
  const profile = materialProfile(ground,ground.material)
  ground.userData.forest = true
  const natural = materialProfile(ground,ground.material)
  assert.equal(natural.natural,true);assert.equal(natural.mask,0)
  assert.ok(!patchAnimeShader(ShaderLib.lambert.fragmentShader,natural).includes('vec3 animeAlbedo'))
  assert.notEqual(animeProgramKey(profile),animeProgramKey(natural))
  const hero = new Mesh(geometry,ground.material), bike = new Group();bike.name='Cyclone_riding_vehicle';bike.add(hero)
  const heroProfile = materialProfile(hero,hero.material)
  assert.equal(heroProfile.hero,1);assert.equal(heroProfile.mask,1);assert.equal(heroProfile.natural,false)
  assert.ok(patchAnimeShader(ShaderLib.lambert.fragmentShader,heroProfile).includes('vec3 animeAlbedo'))
})
