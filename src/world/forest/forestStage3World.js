import {Group,Mesh,BufferGeometry,Float32BufferAttribute,Vector3} from 'three'
import {FOREST_STAGE3 as S,stage3Height,stage3PathX,stage3EarthWeight} from './forestStage3Config.js'
import {forestRandom} from './forestLayout.js'
import {ForestBatch} from './ForestBatch.js'
import {worldFoliageSector} from './forestFoliageWorldRendering.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {forestLodRange} from './forestLod.js'
import {registerColliders,cylinderCollider} from '../../player/collisionWorld.js'
import {createForestSideLayout,createSideBoundaryLibrary,createSideBoundaryColliders,forestSideWidth,ForestSideBoundaryBand} from './forestSideBoundaries.js'

let current=null
export const stage3World={get:()=>current,set:world=>{current=world},clear:world=>{if(current===world)current=null}}
function terrain(phase){
  const p=[],uv=[],ix=[],cols=129,rows=49,origin=S.startZ-phase*S.chunkLength
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const x=-S.halfWidth+col*4,z=-row*2;p.push(x,stage3Height(x,origin+z),z);uv.push(x/4,z/4)}
  for(let row=0;row<rows-1;row++)for(let col=0;col<cols-1;col++){const a=row*cols+col,b=a+cols;ix.push(a,a+1,b,a+1,b+1,b)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g
}
// Same atlas attributes, crossed near cards and distant billboards as Planos
// 1/2. A tile shares two instanced draws, including on drivers without multidraw.
export function foliageData(plants,height,id,bounds=[-256,0,-96,256,30,0]){
  const count=plants.length,matrices=new Float32Array(count*16),colours=new Float32Array(count*3),rects=new Float32Array(count*4),forms=new Float32Array(count*4),fades=new Float32Array(count*4)
  for(let i=0;i<count;i++){
    const p=plants[i],index=FOLIAGE_CATALOG.entries.findIndex(e=>e.id===p.sprite),e=FOLIAGE_CATALOG.entries[index],c=Math.cos(p.yaw)*p.scale,s=Math.sin(p.yaw)*p.scale
    matrices.set([c,0,-s,0,0,p.scale,0,0,s,0,c,0,p.x,height(p.x,p.z)-.025,p.z,1],i*16)
    colours.set([p.tint,p.tint,p.tint],i*3);rects.set(e.uv,i*4);forms.set([e.width/e.height,p.mirror?1-e.anchor[0]:e.anchor[0],e.anchor[1],p.mirror?1:0],i*4);fades.set([65,108,0,index],i*4)
  }
  return {id,x:0,z:0,count,matrices,colours,rects,forms,fades,bounds,contacts:[]}
}
export class ForestStage3World extends Group{
  constructor(assets,ground,foliage,distant){
    super();this.name='Forest_Plano_3_recycled_route';this.tiles=[];this.owned=[];this.batches=[];this.recycles=0
    this.sideLibrary=createSideBoundaryLibrary(assets,foliage.near.map)
    const trees=assets.filter(a=>a.kind==='tree'),sprites=FOLIAGE_CATALOG.entries.filter(e=>['pasto','hierbas','helechos','arbustos'].includes(e.category))
    for(let phase=0;phase<S.chunks;phase++){
      const group=new Group(),origin=S.startZ-phase*S.chunkLength,height=(x,z)=>stage3Height(x,origin+z),random=forestRandom(S.seed+phase*191),between=(a,b)=>a+(b-a)*random(),layout=new Map(trees.map(a=>[a.name,[]])),anchors=[]
      for(let attempt=0;attempt<6000&&anchors.length<220;attempt++){
        const x=between(-250,250),z=between(-94,-2);if(Math.abs(x-stage3PathX(origin+z))<11||anchors.some(p=>(p.x-x)**2+(p.z-z)**2<15))continue
        const a=trees[Math.floor(random()*trees.length)],p={x,z,scale:between(2.1,3.25),yaw:between(0,Math.PI*2),tint:between(.91,1.04),kind:'tree',name:a.name};anchors.push(p);layout.get(a.name).push(p)
      }
      const geometry=terrain(phase),mesh=new Mesh(geometry,ground);mesh.name='Forest_Plano_3_ground_'+phase;mesh.receiveShadow=true;mesh.userData={forest:true,rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:'forest',rideSurfaceEarthWeight:stage3EarthWeight};group.add(mesh);this.owned.push(geometry)
      const batches=[]
      for(const asset of trees){const placements=layout.get(asset.name)
        for(const [far,parts]of [[false,[...asset.parts,...(asset.midParts||[])]],[true,distant.get(asset.name).parts]])for(const part of parts){const b=new ForestBatch(part,placements,asset.bounds,'tree',far?340:forestLodRange('tree').max,far?forestLodRange('tree',true).start:0,height);b.userData.forest=true;group.add(b);batches.push(b)}
      }
      const plants=[]
      for(let i=0;i<4000;i++){
        const a=anchors[Math.floor(random()*anchors.length)],x=i%3?between(-80,80):a.x+between(-2,2),z=i%3?between(-95,-1):Math.max(-95,Math.min(-1,a.z+between(-2,2)))
        if(Math.abs(x-stage3PathX(origin+z))<1.7||Math.abs(x)>254)continue
        const e=sprites[Math.floor(random()*sprites.length)];plants.push({x,z,scale:between(...e.heightRange),sprite:e.id,yaw:between(0,Math.PI*2),mirror:random()<.5,tint:between(.95,1.03)})
      }
      const grass=worldFoliageSector(foliageData(plants,height,phase),foliage);group.add(grass.near,grass.far)
      const colliders=anchors.map(p=>{const a=trees.find(a=>a.name===p.name),y=height(p.x,p.z);return cylinderCollider(p.x,p.z+origin,Math.max(.3,(a.bounds.max.x-a.bounds.min.x)*p.scale*.035),y-.15,y+(a.bounds.max.y-a.bounds.min.y)*p.scale*.7)})
      const sideLayout=createForestSideLayout({minZ:-96,maxZ:0,pathAt:z=>stage3PathX(origin+z),heightAt:height,widthAt:(z,side)=>forestSideWidth(origin+z,side)-side*stage3PathX(origin+z),trees:this.sideLibrary.trees,seed:S.seed+phase*191+122}),boundary=new ForestSideBoundaryBand(sideLayout,this.sideLibrary,height)
      group.add(boundary);colliders.push(...createSideBoundaryColliders(sideLayout,new Vector3(0,0,origin)))
      group.position.z=origin;this.add(group);this.tiles.push({group,batches,phase,index:phase,trees:anchors,mesh,colliders,grass,boundary,remove:null});this.batches.push(...batches)
    }
  }
  ensureAround(z){
    if(this.endZ!=null)z=Math.max(z,this.endZ+1)
    const index=Math.max(0,Math.floor((S.startZ-z)/S.chunkLength)),minimum=index-2
    for(const tile of this.tiles){const absolute=tile.phase+Math.max(0,Math.ceil((minimum-tile.phase)/S.chunks))*S.chunks;if(absolute!==tile.index){
      const offset=(tile.index-absolute)*S.chunkLength,registered=!!tile.remove;tile.remove?.();tile.remove=null
      for(const c of tile.colliders){c.z+=offset;c.minZ+=offset;c.maxZ+=offset}
      if(registered)tile.remove=registerColliders(tile.colliders)
      tile.index=absolute;tile.group.position.z=S.startZ-absolute*S.chunkLength;tile.group.updateMatrixWorld(true);this.recycles++
    }}
    this.syncEnd()
  }
  setEnd(z=null){this.endZ=z;this.syncEnd()}
  syncEnd(){for(const tile of this.tiles){const active=this.endZ==null||tile.group.position.z>this.endZ+.001;tile.group.visible=active;tile.mesh.userData.rideSurfaceActive=active;if(!active&&tile.remove){tile.remove();tile.remove=null}else if(active&&this.registered&&!tile.remove)tile.remove=registerColliders(tile.colliders)}}
  register(){this.registered=true;this.syncEnd();return()=>{this.registered=false;for(const tile of this.tiles){tile.remove?.();tile.remove=null}}}
  update(camera){for(const tile of this.tiles){for(const batch of tile.batches)batch.updateDistance(camera,tile.group.position.z);tile.boundary.update(camera);const z=camera.position.z-tile.group.position.z,d=Math.max(z,0,-96-z);tile.grass.near.visible=d<30;tile.grass.far.visible=d<114}}
  dispose(){this.owned.forEach(g=>g.dispose());this.batches.forEach(b=>b.dispose());for(const tile of this.tiles){tile.boundary.dispose();for(const mesh of [tile.grass.near,tile.grass.far]){for(const key of ['position','normal','uv'])mesh.geometry.deleteAttribute(key);mesh.geometry.index=null;mesh.geometry.dispose();mesh.dispose()}}this.sideLibrary.dispose()}
}
