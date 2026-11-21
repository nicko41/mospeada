import test from 'node:test'
import assert from 'node:assert/strict'
import {FoliageInteractionField,FOREST_INTERACTION} from './forestInteraction.js'
import {foliageCardGeometry,foliageCardMaterial} from './forestFoliageLibrary.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {worldFoliageMaterial,worldFoliageSector} from './forestFoliageWorldRendering.js'
import {generateFoliageSector} from './forestFoliageDistribution.js'
import {Texture,ShaderLib} from 'three'

const source=(values={})=>({active:true,x:0,z:0,y:9,px:0,pz:0,py:9,dirX:1,dirZ:0,speed:1.7,radius:.7,strength:.45,fast:false,...values})
const amplitude=v=>Math.hypot(v.x,v.z)
test('local springs settle, recover with a small damped oscillation, and never affect distant plants',()=>{
  const f=new FoliageInteractionField(),s=source(),data=f.data,texture=f.texture
  try{
    for(let i=0;i<60;i++)f.update(1/60,[s],0,0)
    const held=f.sample(.25,.25);assert.ok(amplitude(held)>.05);assert.equal(amplitude(f.sample(4,4)),0)
    let minimum=0,max=0
    for(let i=0;i<180;i++){f.update(1/60,[],0,0);const v=f.sample(.25,.25),dot=v.x*held.x+v.z*held.z;minimum=Math.min(minimum,dot);max=Math.max(max,amplitude(v))}
    assert.ok(minimum<0,'Recovery crosses rest once with a small overshoot');assert.ok(max<amplitude(held)*1.1);assert.equal(f.count,0);assert.equal(amplitude(f.sample(.25,.25)),0);assert.equal(f.data,data);assert.equal(f.texture,texture)
  }finally{f.dispose()}
})
test('running bends sooner and farther than walking; swept boost contact has no gaps or unbounded work',()=>{
  const walk=new FoliageInteractionField(),run=new FoliageInteractionField(),bike=new FoliageInteractionField()
  try{
    for(let i=0;i<5;i++){walk.update(1/60,[source()],0,0);run.update(1/60,[source({radius:1,strength:.68,fast:true,speed:4.2})],0,0)}
    assert.ok(amplitude(run.sample(.25,.25))>amplitude(walk.sample(.25,.25)));assert.equal(amplitude(walk.sample(.8,0)),0);assert.ok(amplitude(run.sample(.8,0))>0)
    bike.update(1/30,[source({px:0,x:8,radius:1.4,strength:.86,speed:118,fast:true})],8,0)
    for(let x=1;x<8;x+=.5)assert.ok(amplitude(bike.sample(x,0))>.01,'Swept wheel/body influence covers high-speed travel')
    let peak=0
    for(let i=1;i<120;i++){const x=8+i*118/60;bike.update(1/60,[source({px:x-118/60,x,radius:1.4,strength:.86,speed:118,fast:true})],x,0);peak=Math.max(peak,bike.count);assert.ok(bike.stats.maxBend<=FOREST_INTERACTION.maxBend+.0001)}
    assert.ok(peak<2500);assert.ok(bike.data.every(Number.isFinite));bike.update(1/60,[],500,-500);assert.equal(bike.count,0,'Checkpoint teleport clears the old trail')
  }finally{walk.dispose();run.dispose();bike.dispose()}
})
test('reactive cards keep original UVs/alpha, add only vertical segments, and leave crash cards static',()=>{
  const entry=FOLIAGE_CATALOG.entries[0],old=foliageCardGeometry(entry),bent=foliageCardGeometry(entry,true),atlas=new Texture(),material=foliageCardMaterial(atlas,false,true),plain=foliageCardMaterial(atlas,false)
  try{assert.equal(old.attributes.position.count,8);assert.equal(bent.attributes.position.count,12);assert.equal(plain.userData.foliageInteraction,undefined);assert.ok(material.alphaTest>=.4&&!material.transparent);assert.equal(material.map,atlas);assert.equal(bent.attributes.position.getY(0),old.attributes.position.getY(0));assert.equal(bent.attributes.uv.getY(0),old.attributes.uv.getY(0));assert.equal(bent.attributes.uv.getY(4),old.attributes.uv.getY(3));const shader={uniforms:{},vertexShader:ShaderLib.lambert.vertexShader,fragmentShader:ShaderLib.lambert.fragmentShader};material.onBeforeCompile(shader);assert.ok(shader.vertexShader.includes('bendForestPlant(transformed'));assert.ok(shader.uniforms.uPlantBendMap)}finally{old.dispose();bent.dispose();material.dispose();plain.dispose();atlas.dispose()}
})
test('world LODs preserve shared instance buffers and conservative bounds while bending',()=>{
  const data=generateFoliageSector(12,12),atlas=new Texture(),density={value:.65},near=worldFoliageMaterial(atlas,'near',density),far=worldFoliageMaterial(atlas,'far',density),sector=worldFoliageSector({...data,contacts:[]},{near,far}),matrix=sector.near.instanceMatrix,colour=sector.near.instanceColor,f=new FoliageInteractionField()
  try{assert.equal(sector.near.geometry.attributes.position.count,12);assert.equal(sector.far.geometry.attributes.position.count,4);assert.equal(matrix,sector.far.instanceMatrix);assert.equal(colour,sector.far.instanceColor);assert.ok(sector.near.boundingBox.min.x<data.bounds[0]);const version=matrix.version;for(let i=0;i<60;i++)f.update(1/60,[source()],0,0);assert.equal(matrix.version,version)}finally{f.dispose();near.dispose();far.dispose();atlas.dispose();sector.near.geometry.dispose();sector.far.geometry.dispose()}
})
