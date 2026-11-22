import {Group,Mesh,Matrix4,Vector3} from 'three'
import {FOREST_STAGE4 as S,stage4Anchor,stage4ForestHeight,stage4DesertHeight,stage4Path,stage4Edge,stage4EarthWeight,smooth4} from './forestStage4Config.js'
import {createStage4Terrain,patchStage4Connector} from './forestStage4Terrain.js'
import {ForestBatch} from './ForestBatch.js'
import {foliageData,stage3World} from './forestStage3World.js'
import {worldFoliageSector} from './forestFoliageWorldRendering.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {forestRandom} from './forestLayout.js'
import {forestLodRange} from './forestLod.js'
import {registerRideSurfaces,refreshRideSurfaceGeometry,sampleRideHeight} from '../../vehicle/rideSurface.js'
import {registerColliders,cylinderCollider} from '../../player/collisionWorld.js'
import {DESERT_CLIMAX} from './forestClimaxConfig.js'
import {DesertClimaxPlain} from './DesertClimaxPlain.js'
import {createForestSideLayout,createSideBoundaryLibrary,createSideBoundaryColliders,forestPerimeterExtent,ForestSideBoundaryBand} from './forestSideBoundaries.js'

function boundaryWidth(z,side,anchor=null){const t=smooth4(0,260,-z),at=(anchor?.z||0)+z,extent=forestPerimeterExtent(at,side,256)*(1-t)+forestPerimeterExtent(at,side,S.halfWidth)*t;return extent-side*(stage4Path(z,anchor)+(1-t)*(anchor?.x||0))}

export class ForestStage4World extends Group{
  constructor(assets,materials,distant){
    super();this.name='Forest_Plano_4_Desert_Descent';this.visible=false;this.bound=false;this.anchor=null;this.materials=materials;this.tiles=[];this.batches=[];this.surfaces=[];this.colliderData=[];this.terrain=createStage4Terrain();this.removeColliders=null;this.checkpoint=null
    this.pending=null;this.patchedBatches=new Set();this.patchedGrass=new Set();this.preparationPeakMs=0
    for(const [kind,list,material]of [['forest',this.terrain.forest,materials.ground],['desert',this.terrain.desert,materials.desert]])for(const geometry of list){
      const mesh=new Mesh(geometry,material);mesh.name='Plano_4_'+kind+'_terrain';mesh.receiveShadow=true;mesh.userData={forest:true,rideSurface:true,rideSurfaceActive:false,rideSurfaceType:'dirt',rideSurfaceBiome:kind==='desert'?'desert':'forest',rideSurfaceEarthWeight:(x,z)=>kind==='desert'?1:stage4EarthWeight(x-this.position.x,z-this.position.z,this.anchor)};this.add(mesh);this.surfaces.push(mesh)
    }
    const cliff=new Mesh(this.terrain.cliff,materials.cliff);cliff.name='Plano_4_natural_descent_face';cliff.userData.forest=true;this.add(cliff)
    const trees=assets.filter(a=>a.kind==='tree'),sprites=FOLIAGE_CATALOG.entries.filter(e=>['pasto','hierbas','helechos','arbustos'].includes(e.category))
    for(let phase=0;phase<7;phase++){
      const group=new Group(),origin=-phase*96,random=forestRandom(S.seed+phase*137),between=(a,b)=>a+(b-a)*random(),height=(x,z)=>stage4ForestHeight(x,origin+z),layout=new Map(trees.map(a=>[a.name,[]])),anchors=[],batches=[]
      for(let attempt=0;attempt<6500&&anchors.length<300;attempt++){
        const x=anchors.length<165?between(-240,240):between(-1000,1000),z=between(-95,-1),d=-origin-z,path=stage4Path(origin+z)
        if(d>stage4Edge(x)-36||Math.abs(x-path)<(d<96?18:9)||random()<smooth4(500,605,d)*.9||anchors.some(p=>(p.x-x)**2+(p.z-z)**2<18))continue
        const asset=trees[Math.floor(random()*trees.length)],p={x,z,scale:between(...(asset.scale||[2.1,3.2])),yaw:between(0,Math.PI*2),tint:between(.93,1.04),kind:'tree',name:asset.name};anchors.push(p);layout.get(asset.name).push(p)
        this.colliderData.push({x,z:origin+z,radius:(asset.trunkRadius||.26)*p.scale,height:(asset.bounds.max.y-asset.bounds.min.y)*p.scale*.7,forest:true})
      }
      for(const a of trees){const placements=layout.get(a.name);if(!placements.length)continue
        for(const [far,parts]of [[false,[...a.parts,...(a.midParts||[])]],[true,distant.get(a.name).parts]])for(const part of parts){const b=new ForestBatch(part,placements,a.bounds,'tree',far?340:forestLodRange('tree').max,far?forestLodRange('tree',true).start:0,height);b.userData.stage4Offset=origin;group.add(b);batches.push(b)}
      }
      const plants=[]
      for(let i=0;i<4000;i++){
        const a=anchors[Math.floor(random()*anchors.length)],x=i%3||!a?between(-90,90):a.x+between(-2,2),z=i%3||!a?between(-95,-1):Math.max(-95,Math.min(-1,a.z+between(-2,2))),d=-origin-z
        if(d>stage4Edge(x)-2||Math.abs(x-stage4Path(origin+z))<(d<96?10:1.7)||random()<smooth4(535,625,d)*.97)continue
        const e=sprites[Math.floor(random()*sprites.length)];plants.push({x,z,scale:between(...e.heightRange),sprite:e.id,yaw:between(0,Math.PI*2),mirror:random()<.5,tint:between(.95,1.03)})
      }
      const grass=worldFoliageSector(foliageData(plants,height,'stage4-'+phase,[-1024,-20,-96,1024,35,0]),materials.foliage);group.add(grass.near,grass.far);group.position.z=origin;this.add(group);this.tiles.push({group,origin,batches,grass,plants});this.batches.push(...batches)
    }
    const rocks=assets.filter(a=>a.kind==='rock'),random=forestRandom(S.seed+999),layouts=new Map(rocks.map(a=>[a.name,[]]))
    for(let i=0;i<240&&rocks.length;i++){
      const x=(random()-.5)*2100,z=-660-random()*1500;if(Math.abs(x)<35&&z> -940)continue
      const a=rocks[Math.floor(random()*rocks.length)],p={x,z,scale:.25+random()*.65,yaw:random()*Math.PI*2,tint:.92+random()*.15,kind:'rock'};layouts.get(a.name).push(p);this.colliderData.push({x,z,radius:p.scale*.7,height:p.scale,forest:false})
    }
    for(const a of rocks)for(const part of a.parts){const b=new ForestBatch({...part,material:materials.rocks.get(a.name+part.material.uuid)||part.material},layouts.get(a.name),a.bounds,'rock',125,0,stage4DesertHeight);this.add(b);this.batches.push(b)}
    this.sideLibrary=createSideBoundaryLibrary(assets,materials.foliage.near.map)
    const sideLayout=createForestSideLayout({minZ:-600,maxZ:0,pathAt:stage4Path,heightAt:stage4ForestHeight,widthAt:boundaryWidth,trees:this.sideLibrary.trees,seed:S.seed+1122,allowed:(x,z,r)=>-z<stage4Edge(x)-12-r})
    this.sideBoundary=new ForestSideBoundaryBand(sideLayout,this.sideLibrary,stage4ForestHeight);this.add(this.sideBoundary)
  }
  register(){this.removeSurfaces=registerRideSurfaces(this);return()=>{this.removeSurfaces?.();this.removeSurfaces=null;this.removeColliders?.();this.removeColliders=null}}
  requestClimax(){if(!this.climaxPlain)this.climaxPlain=new DesertClimaxPlain(this);return this.climaxPlain}
  updateClimax(scottDistance,randDistance){this.climaxPlain?.update(scottDistance,randDistance)}
  prepareClimaxRetry(metrics){
    const distance=DESERT_CLIMAX.start+30;this.requestClimax();this.updateClimax(distance,distance+55)
    const start=this.startAt(distance)
    for(const z of [metrics.frontZ,metrics.rearZ])if(!Number.isFinite(sampleRideHeight(start.x+Math.sin(start.yaw)*z,start.z+Math.cos(start.yaw)*z)))return null
    return start
  }
  *bindingSteps(anchor){
    if(this.bound)return
    this.anchor={...anchor};this.position.set(anchor.x,anchor.y,anchor.z);this.materials.origin.copy(this.position)
    for(const geometry of this.terrain.forest)if(patchStage4Connector(geometry,anchor)){refreshRideSurfaceGeometry(geometry);yield}
    const matrix=new Matrix4()
    for(const tile of this.tiles){
      if(tile.origin< -96)continue
      for(const batch of tile.batches){for(let i=0;i<batch.placements.length;i++){const p=batch.placements[i],z=tile.origin+p.z;if(z<=-96)continue;batch.getMatrixAt(i,matrix);matrix.elements[13]+=stage4ForestHeight(p.x,z,anchor)-stage4ForestHeight(p.x,z);batch.setMatrixAt(i,matrix)}batch.computeBoundingBox();batch.computeBoundingSphere();this.patchedBatches.add(batch);yield}
      const data=tile.grass.data
      for(let i=0;i<tile.plants.length;i++){const p=tile.plants[i],z=tile.origin+p.z;if(z>-96)data.matrices[i*16+13]+=stage4ForestHeight(p.x,z,anchor)-stage4ForestHeight(p.x,z)}
      tile.grass.near.instanceMatrix.needsUpdate=true
      this.patchedGrass.add(tile);yield
    }
    yield* this.sideBoundary.repositionSteps(z=>stage4Path(z,anchor),(x,z)=>stage4ForestHeight(x,z,anchor),(z,side)=>boundaryWidth(z,side,anchor))
    this.bound=true;this.visible=true;this.surfaces.forEach(m=>m.userData.rideSurfaceActive=true);this.updateMatrixWorld(true)
    this.removeColliders=registerColliders([...this.colliderData.map(p=>{const y=anchor.y+(p.forest?stage4ForestHeight(p.x,p.z,anchor):stage4DesertHeight(p.x,p.z));return cylinderCollider(p.x+anchor.x,p.z+anchor.z,p.radius,y-.15,y+p.height)}),...createSideBoundaryColliders(this.sideBoundary.layout,this.position)])
    stage3World.get()?.setEnd(anchor.z)
    this.checkpoint=this.startAt(100)
  }
  bind(anchor){for(const step of this.bindingSteps(anchor))void step}
  prepare(encounter,state){
    if(!this.bound&&!this.pending&&encounter?.phase==='exiting')this.pending=this.bindingSteps(stage4Anchor(state.z))
    if(this.pending){const start=performance.now();do{if(this.pending.next().done){this.pending=null;break}}while(performance.now()-start<3);this.preparationPeakMs=Math.max(this.preparationPeakMs,performance.now()-start)}
    if(this.bound&&this.distance(state.z)>550)this.checkpoint=this.startAt(this.climaxPlain&&this.distance(state.z)>DESERT_CLIMAX.start?DESERT_CLIMAX.start+30:550)
  }
  reset(){
    this.climaxPlain?.dispose();this.climaxPlain=null
    this.removeColliders?.();this.removeColliders=null;this.surfaces.forEach(m=>m.userData.rideSurfaceActive=false);this.bound=false;this.visible=false
    this.pending=null
    // Restore the source templates before a later encounter chooses its exit.
    if(this.anchor){
      for(const geometry of this.terrain.forest)if(patchStage4Connector(geometry,null))refreshRideSurfaceGeometry(geometry)
      const matrix=new Matrix4()
      for(const tile of this.tiles)if(tile.origin>=-96){for(const batch of tile.batches){if(!this.patchedBatches.has(batch))continue;for(let i=0;i<batch.placements.length;i++){const p=batch.placements[i],z=tile.origin+p.z;if(z<=-96)continue;batch.getMatrixAt(i,matrix);matrix.elements[13]-=stage4ForestHeight(p.x,z,this.anchor)-stage4ForestHeight(p.x,z);batch.setMatrixAt(i,matrix)}batch.computeBoundingBox();batch.computeBoundingSphere()}
        if(this.patchedGrass.has(tile)){for(let i=0;i<tile.plants.length;i++){const p=tile.plants[i],z=tile.origin+p.z;if(z>-96)tile.grass.data.matrices[i*16+13]-=stage4ForestHeight(p.x,z,this.anchor)-stage4ForestHeight(p.x,z)}tile.grass.near.instanceMatrix.needsUpdate=true}}
    }
    for(const step of this.sideBoundary.repositionSteps(stage4Path,stage4ForestHeight,boundaryWidth))void step
    this.patchedBatches.clear();this.patchedGrass.clear();this.anchor=null;this.checkpoint=null;stage3World.get()?.setEnd(null)
  }
  distance(z){return this.bound?this.position.z-z:-Infinity}
  contains(x,z){return this.bound&&z<=this.position.z+.1&&(this.climaxPlain||z>=this.position.z-2400)&&Math.abs(x-this.position.x)<=(this.climaxPlain?DESERT_CLIMAX.halfWidth:2400)}
  airEnabled(s,phase='idle'){return phase==='idle'&&this.contains(s.x,s.z)}
  startAt(d){const z=-d,x=stage4Path(z,this.anchor),yaw=Math.atan2(stage4Path(z-2,this.anchor)-stage4Path(z+2,this.anchor),-4);return {x:x+this.position.x,z:z+this.position.z,yaw,label:d>=DESERT_CLIMAX.start?'Nivel 01 · Plano 5 · Llanura Invid':'Nivel 01 · Plano 4 · Descenso',stage4:true,climax:d>=DESERT_CLIMAX.start}}
  needsRecovery(s){return this.bound&&(s.height<this.position.y-85||!Number.isFinite(s.height))}
  update(camera){if(!this.bound)return;for(const b of this.batches)b.updateDistance(camera,this.position.z+(b.userData.stage4Offset||0),this.position.x);this.sideBoundary.update(camera);for(const tile of this.tiles){const z=camera.position.z-this.position.z-tile.origin,d=Math.max(z,0,-96-z);tile.grass.near.visible=d<30;tile.grass.far.visible=d<114}}
  dispose(){this.climaxPlain?.dispose();this.removeSurfaces?.();this.removeColliders?.();for(const g of [...this.terrain.forest,...this.terrain.desert,this.terrain.cliff])g.dispose();this.batches.forEach(b=>b.dispose());this.sideBoundary.dispose();this.sideLibrary.dispose();for(const tile of this.tiles)for(const m of [tile.grass.near,tile.grass.far]){for(const key of ['position','normal','uv'])m.geometry.deleteAttribute(key);m.geometry.index=null;m.geometry.dispose();m.dispose()}}
}
