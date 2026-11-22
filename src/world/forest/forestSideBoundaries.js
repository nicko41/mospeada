import {Group,Matrix4,Vector3} from 'three'
import {FOREST_ASSETS} from './forestConfig.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {forestRandom,forestSurfaceHeight} from './forestLayout.js'
import {forestPathX} from './forestSurface.js'
import {ForestBatch} from './ForestBatch.js'
import {ForestSpriteBatch,foliageCardMaterial} from './forestFoliageLibrary.js'
import {cylinderCollider} from '../../player/collisionWorld.js'

export const FOREST_SIDE_BANDS=Object.freeze({step:3,treeStep:4.8,depths:[8,14,21,29,38],distance:175})
// 768 m repeats with the recycled Plano 3; adjacent tiles share the same edge.
export function forestPerimeterExtent(z,side,halfWidth=256){const k=Math.PI*2/768,large=halfWidth>500;return halfWidth-(large?95:70)+(large?28:12)*Math.sin(z*k*2+side*.7)+(large?15:6)*Math.sin(z*k*5-side*1.3)}
export const forestSideWidth=(z,side)=>forestPerimeterExtent(z,side)

export function createForestSideLayout({minZ,maxZ,pathAt,heightAt,widthAt=forestSideWidth,allowed=()=>true,seed=19831122,trees=FOREST_ASSETS.filter(a=>a.kind==='tree')}={}){
 const random=forestRandom(seed),between=(a,b)=>a+(b-a)*random(),byName=Object.fromEntries(trees.map(a=>[a.name,[]])),sprites=[],thickets=[],trunks=[]
 const shrubs=FOLIAGE_CATALOG.entries.filter(e=>e.category==='arbustos'&&!e.id.includes('flores')),ferns=FOLIAGE_CATALOG.entries.filter(e=>e.category==='helechos')
 const tag=(p,side)=>{p.side=side;p.offset=p.x-pathAt(p.z)-side*widthAt(p.z,side);p.ground=heightAt(p.x,p.z);return p}
 const valid=(x,z,r=0)=>z>=minZ&&z<=maxZ&&Math.abs(x-pathAt(z))>10+r&&allowed(x,z,r)&&Number.isFinite(heightAt(x,z))
 const spacing=(z,side,step)=>{const edge=at=>pathAt(at)+side*widthAt(at,side),slope=edge(z+.5)-edge(z-.5);return step/Math.max(1,Math.hypot(1,slope))}
 function plant(x,z,height,side,fern=false,dark=false){
  if(!valid(x,z))return
  const entries=fern?ferns:shrubs,e=entries[Math.floor(random()*entries.length)]
  const p=tag({x,z,height,scale:height,yaw:between(0,Math.PI*2),mirror:random()<.5,tint:dark?between(.5,.7):between(.82,1),sprite:e.id,kind:'foliageCard'},side)
  p.y=p.ground-.025;sprites.push(p)
 }
 for(const side of[-1,1]){
  for(let row=0;row<2;row++)for(let station=Math.ceil(minZ/FOREST_SIDE_BANDS.step)*FOREST_SIDE_BANDS.step;station<=maxZ;station+=spacing(station,side,FOREST_SIDE_BANDS.step)){
   const z=station+(row*1.5+between(-.18,.18))*spacing(station,side,1),x=pathAt(z)+side*(widthAt(z,side)+row*4.8+between(-.25,.25))
   if(!valid(x,z,2.3))continue
   const height=between(2.1,3.15),p=tag({x,z,radius:between(2.25,2.5),height:height*.78,layer:row},side);thickets.push(p)
   // Interleaved clumps vary in height, depth, silhouette and orientation.
   // Collision footprints sit inside the visible mass, not in an empty hedge.
   plant(x,z,height,side)
   for(let j=0;j<2;j++)plant(x+between(-1.25,1.25),z+between(-1,1),height*between(.8,1.1),side)
   if(row===0)plant(x-side*between(1.3,2),z+between(-.9,.9),between(.85,1.35),side,true)
  }
  for(let row=0;row<FOREST_SIDE_BANDS.depths.length;row++)for(let station=Math.ceil(minZ/FOREST_SIDE_BANDS.treeStep)*FOREST_SIDE_BANDS.treeStep;station<=maxZ;station+=spacing(station,side,FOREST_SIDE_BANDS.treeStep)){
   const z=station+(row*.83+between(-1.1,1.1))*spacing(station,side,1),depth=FOREST_SIDE_BANDS.depths[row]+between(-1.6,1.6),x=pathAt(z)+side*(widthAt(z,side)+depth)
   if(!valid(x,z,1))continue
   const asset=trees[Math.floor(random()*trees.length)],scale=between(2.25,3.5),p=tag({x,z,scale,yaw:between(0,Math.PI*2),tint:between(.72,.95),kind:'tree',name:asset.name,trunkRadius:(asset.trunkRadius||.26)*scale,height:asset.bounds?(asset.bounds.max.y-asset.bounds.min.y)*scale*.75:24,solid:row<3,layer:row},side)
   byName[asset.name].push(p);trunks.push(p)
   // A second, darker understory fills the spaces under the branches.
   if(row%2===0)plant(x,z,between(2.8,4),side,false,true)
  }
 }
 return {byName,sprites,thickets,trunks,minZ,maxZ}
}

export function createOpeningSideLayout(trees){
 // Rounded outer perimeter of the 800 m opening, rather than road shoulders.
 const ring=createForestSideLayout({minZ:0,maxZ:Math.PI*330,pathAt:()=>0,heightAt:()=>0,widthAt:()=>34,seed:19831123,trees})
 const map=p=>{const t=p.z/330,angle=p.side*t,wave=9*Math.sin(angle*3)+5*Math.cos(angle*7),depth=Math.abs(p.x)-34+wave,nx=p.side*Math.sin(t)/326,nz=Math.cos(t)/305,n=Math.hypot(nx,nz);p.x=p.side*326*Math.sin(t)+nx/n*depth;p.z=15+305*Math.cos(t)+nz/n*depth;p.ground=forestSurfaceHeight(p.x,p.z);if(p.kind==='foliageCard')p.y=p.ground-.025;p.keep=!(p.z< -220&&Math.abs(p.x)<205)&&Math.abs(p.x)<390&&p.z<390&&p.z>=-400}
 for(const p of[...ring.sprites,...ring.thickets,...ring.trunks])map(p)
 const arms=createForestSideLayout({minZ:-400,maxZ:-185,pathAt:()=>0,heightAt:forestSurfaceHeight,widthAt:(z,side)=>{const t=Math.max(0,Math.min(1,(-z-200)/110));return 210*(1-t)+forestPerimeterExtent(z,side)*t},seed:19831124,trees})
 return{minZ:-400,maxZ:390,perimeter:true,byName:Object.fromEntries(Object.entries(ring.byName).map(([name,p])=>[name,[...p.filter(p=>p.keep),...arms.byName[name]]])),sprites:[...ring.sprites.filter(p=>p.keep),...arms.sprites],thickets:[...ring.thickets.filter(p=>p.keep),...arms.thickets],trunks:[...ring.trunks.filter(p=>p.keep),...arms.trunks]}
}

export function createSideBoundaryColliders(layout,offset=new Vector3()){
 const colliders=[]
 for(const p of layout.thickets)colliders.push({...cylinderCollider(p.x+offset.x,p.z+offset.z,p.radius,p.ground+offset.y-.15,p.ground+offset.y+p.height),environment:true,source:'forest-side-thicket'})
 for(const p of layout.trunks)if(p.solid)colliders.push({...cylinderCollider(p.x+offset.x,p.z+offset.z,p.trunkRadius,p.ground+offset.y-.15,p.ground+offset.y+p.height),environment:true,source:'forest-side-trunk'})
 return colliders
}

export function createSideBoundaryLibrary(assets,atlas){
 const materials=new Map(),trees=assets.filter(a=>a.kind==='tree').map(asset=>({...asset,parts:asset.parts.filter(p=>p.canopyRole!=='canopy'&&!p.animeCanopyTint&&!/Leaves/i.test(p.material.name)).map(part=>{
  let material=materials.get(part.material)
  if(!material){
   const source=part.material,compile=source.onBeforeCompile,key=source.customProgramCacheKey();material=source.clone();material.name='Forest / deep boundary wood';material.userData={...source.userData,forest:true}
   material.onBeforeCompile=(shader,renderer)=>{compile.call(source,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight*=vec3(.5,.61,.54);\n#include <opaque_fragment>')}
   material.customProgramCacheKey=()=>key+'/deep-boundary-wood-v1';materials.set(source,material)
  }
  return {...part,canopyRole:null,material}
 })}))
 const shrubs=foliageCardMaterial(atlas,false,true);shrubs.name='Forest / staggered boundary thickets'
 return {trees,shrubs,dispose(){shrubs.dispose();for(const m of materials.values())m.dispose()}}
}

export class ForestSideBoundaryBand extends Group{
 constructor(layout,library,heightAt){
  super();this.name='Forest_staggered_side_boundary';this.userData.forest=true;this.layout=layout;this.batches=[];this.camera={position:new Vector3()};this.origin=new Vector3();this.matrix=new Matrix4()
  this.plants=new ForestSpriteBatch(layout.sprites,library.shrubs,heightAt);this.plants.name='Forest_side_staggered_shrubs';this.plants.distance=145;this.add(this.plants)
  for(const asset of library.trees){const placements=layout.byName[asset.name]||[];if(!placements.length)continue
   for(const part of asset.parts){
    const batch=new ForestBatch(part,placements,asset.bounds,'tree',FOREST_SIDE_BANDS.distance,0,heightAt);batch.name='Forest_side_dark_trunks_'+asset.name;batch.userData.forest=true;batch.receiveShadow=true
    batch.userData.sideOffsets=new Float64Array(placements.length*2)
    for(let i=0;i<placements.length;i++){batch.getMatrixAt(i,this.matrix);batch.userData.sideOffsets[i*2]=this.matrix.elements[12]-placements[i].x;batch.userData.sideOffsets[i*2+1]=this.matrix.elements[13]-placements[i].ground}
    this.batches.push(batch);this.add(batch)
   }
  }
 }
 update(camera){
  this.getWorldPosition(this.origin);this.camera.position.copy(camera.position).sub(this.origin);this.plants.updateDistance(this.camera)
  for(const batch of this.batches)batch.updateDistance(this.camera)
 }
 *repositionSteps(pathAt,heightAt,widthAt=forestSideWidth){
  const move=p=>{p.x=pathAt(p.z)+p.side*widthAt(p.z,p.side)+p.offset;p.ground=heightAt(p.x,p.z)}
  for(const p of this.layout.sprites){move(p);p.y=p.ground-.025}
  for(let i=0;i<this.layout.sprites.length;i++){const p=this.layout.sprites[i];this.plants.getMatrixAt(i,this.matrix);this.matrix.elements[12]=p.x;this.matrix.elements[13]=p.y;this.plants.setMatrixAt(i,this.matrix)}
  this.plants.computeBoundingBox();this.plants.computeBoundingSphere();this.plants.cellX=Infinity;yield
  for(const p of this.layout.trunks)move(p)
  for(const p of this.layout.thickets)move(p)
  for(const batch of this.batches){for(let i=0;i<batch.placements.length;i++){const p=batch.placements[i];batch.getMatrixAt(i,this.matrix);this.matrix.elements[12]=p.x+batch.userData.sideOffsets[i*2];this.matrix.elements[13]=p.ground+batch.userData.sideOffsets[i*2+1];batch.setMatrixAt(i,this.matrix)}batch.computeBoundingBox();batch.computeBoundingSphere();batch.cellX=Infinity;yield}
 }
 dispose(){this.plants.dispose();for(const batch of this.batches)batch.dispose()}
}
