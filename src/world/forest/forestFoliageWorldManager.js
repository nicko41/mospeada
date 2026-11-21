import { AmbientLight, Frustum, Group, Matrix4, Scene, Sphere, Vector3, Vector4, WebGLRenderTarget } from 'three'
import { FOLIAGE_WORLD } from './forestFoliageWorldConfig.js'
import { worldFoliageSector } from './forestFoliageWorldRendering.js'

export function sectorDistance(sector,x,z){const b=sector.bounds,dx=Math.max(sector.x+b[0]-x,0,x-sector.x-b[3]),dz=Math.max(sector.z+b[2]-z,0,z-sector.z-b[5]);return Math.hypot(dx,dz)}
const now=()=>performance.now()
export class ForestFoliageWorldManager extends Group{
  constructor(world,materials,renderer,camera){
    super();this.name='Forest_world_illustrated_foliage';this.world=world;this.materials=materials;this.renderer=renderer;this.resident=new Map();this.queue=[];this.anchor=new Vector3(Infinity,0,Infinity);this.profile=FOLIAGE_WORLD.defaultProfile;this.enabled=true;this.prepared=0;this.evicted=0;this.latePrepares=0;this.camera=new Vector3();this.generations=1
    this.warmScene=new Scene();this.warmScene.add(new AmbientLight(0xffffff,1));this.warmTarget=new WebGLRenderTarget(8,8,{depthBuffer:false});this.events=[]
    this.liveCamera=camera;this.warmCalls=0;this.warmTriangles=0;this.preparationMs=0
    const start=now(),initial={x:0,z:0}
    for(const data of world.sectors.filter(s=>sectorDistance(s,initial.x,initial.z)<FOLIAGE_WORLD.initialRadius))this.prepare(data,renderer,camera)
    this.initialPreparationMs=now()-start;this.refresh(initial,false);this.updateVisibility({position:new Vector3(0,2,0)})
  }
  warm(sector,camera){
    const r=this.renderer,objects=[sector.near,sector.far,sector.shadows].filter(Boolean),old={target:r.getRenderTarget(),viewport:r.getViewport(new Vector4()),scissor:r.getScissor(new Vector4()),test:r.getScissorTest(),autoClear:r.autoClear,xr:r.xr.enabled}
    try{
      for(const mesh of objects){this.warmScene.add(mesh);mesh.visible=true;mesh.frustumCulled=false;if(mesh.isBatchedMesh)mesh.perObjectFrustumCulled=false}
      r.xr.enabled=false;r.autoClear=true;r.setRenderTarget(this.warmTarget);r.clear();r.render(this.warmScene,camera);this.warmCalls+=r.info.render.calls;this.warmTriangles+=r.info.render.triangles
    }finally{
      for(const mesh of objects){mesh.removeFromParent();mesh.frustumCulled=true;if(mesh.isBatchedMesh)mesh.perObjectFrustumCulled=true;this.add(mesh)}
      r.setRenderTarget(old.target);r.setViewport(old.viewport);r.setScissor(old.scissor);r.setScissorTest(old.test);r.autoClear=old.autoClear;r.xr.enabled=old.xr
    }
  }
  prepare(data,renderer,camera){
    if(this.resident.has(data.id))return
    const start=now(),sector=worldFoliageSector(data,this.materials);this.resident.set(data.id,sector)
    // Camera supplied by the component, even at startup. No gameplay camera is
    // moved; the tiny private target uploads buffers before a sector is seen.
    const view=camera||this.liveCamera
    if(view)this.warm(sector,view);else for(const mesh of [sector.near,sector.far,sector.shadows].filter(Boolean))this.add(mesh)
    this.prepared++;this.events.push({type:'prepare',id:data.id,ms:now()-start});if(this.events.length>240)this.events.shift()
  }
  release(sector){
    for(const mesh of [sector.near,sector.far,sector.shadows].filter(Boolean)){
      mesh.removeFromParent()
      if(mesh.isInstancedMesh){for(const key of ['position','normal','uv'])mesh.geometry.deleteAttribute(key);mesh.geometry.index=null;mesh.geometry.dispose();mesh.dispose()}
      else mesh.dispose()
    }
    this.resident.delete(sector.data.id);this.evicted++
  }
  refresh(actor,teleport){
    this.anchor.set(actor.x,0,actor.z)
    for(const sector of this.resident.values())if(sectorDistance(sector.data,actor.x,actor.z)>FOLIAGE_WORLD.evictRadius)this.release(sector)
    this.queue=this.world.sectors.filter(s=>!this.resident.has(s.id)&&sectorDistance(s,actor.x,actor.z)<FOLIAGE_WORLD.residentRadius).sort((a,b)=>sectorDistance(a,actor.x,actor.z)-sectorDistance(b,actor.x,actor.z))
    if(teleport){while(this.queue.length&&sectorDistance(this.queue[0],actor.x,actor.z)<FOLIAGE_WORLD.maxDistance+16)this.prepare(this.queue.shift(),this.renderer,this.liveCamera)}
  }
  update(actor,camera,delta){
    this.liveCamera=camera;this.warmCalls=0;this.warmTriangles=0
    const moved=Math.hypot(actor.x-this.anchor.x,actor.z-this.anchor.z)
    if(moved>FOLIAGE_WORLD.translationStep)this.refresh(actor,moved>100)
    const start=now();let prepared=0
    while(this.queue.length&&prepared<FOLIAGE_WORLD.maxSectorsPerFrame&&now()-start<FOLIAGE_WORLD.preparationBudgetMs){const s=this.queue.shift();if(sectorDistance(s,actor.x,actor.z)<FOLIAGE_WORLD.maxDistance+8)this.latePrepares++;this.prepare(s,this.renderer,camera);prepared++}
    this.preparationMs=now()-start
    const target=FOLIAGE_WORLD.profiles[this.profile];this.materials.density.value+=(target-this.materials.density.value)*(1-Math.exp(-Math.min(delta,.1)*7))
    this.visible=this.enabled;this.updateVisibility(camera)
  }
  updateVisibility(camera){
    this.camera.copy(camera.position)
    for(const sector of this.resident.values()){
      const distance=sectorDistance(sector.data,camera.position.x,camera.position.z)
      sector.near.visible=distance<FOLIAGE_WORLD.nearFadeEnd+2;sector.far.visible=distance<FOLIAGE_WORLD.maxDistance+2
      if(sector.shadows){sector.shadows.visible=distance<FOLIAGE_WORLD.contactDistance+2;if(sector.shadows.visible)sector.shadows.updateDistance(camera)}
    }
  }
  gpuMemoryBytes(){let bytes=2048*2048*4*4/3;for(const s of this.resident.values())bytes+=s.gpuBytes+(s.shadows?s.shadows.geometry.attributes.position.array.byteLength+s.shadows.geometry.index.array.byteLength:0);return bytes}
  visibleGroups(camera){
    const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)),sphere=new Sphere(),density=this.materials.density.value
    const focal=1/(2*Math.tan(camera.fov*Math.PI/360))
    let groups=0,crossed=0,billboards=0,coverageArea=0,tested=0
    for(const sector of this.resident.values()){
      if(!sector.far.visible&&!sector.near.visible||!frustum.intersectsBox(sector.worldBox))continue
      const s=sector.data
      for(let i=0;i<s.count;i++){
        if(s.fades[i*4+2]>density+.018)continue
        const x=s.x+s.matrices[i*16+12],z=s.z+s.matrices[i*16+14],h=s.matrices[i*16+5],d=Math.hypot(x-camera.position.x,z-camera.position.z);tested++
        if(d>=s.fades[i*4+1])continue
        sphere.center.set(x,s.matrices[i*16+13]+h*.5,z);sphere.radius=h*Math.max(1,s.forms[i*4])*.65
        if(!frustum.intersectsSphere(sphere))continue
        groups++;if(d<FOLIAGE_WORLD.nearFadeEnd)crossed++;if(d>FOLIAGE_WORLD.nearFadeStart)billboards++
        coverageArea+=h*h*s.forms[i*4]/Math.max(1,d*d)*focal*focal*(d<22?2:1)
      }
    }
    return{groups,crossed,billboards,tested,projectedScreenArea:coverageArea/camera.aspect,residentSectors:this.resident.size,pendingSectors:this.queue.length,worldGroups:this.world.total,preparedSectors:this.prepared,latePrepares:this.latePrepares,gpuMB:this.gpuMemoryBytes()/1048576}
  }
  dispose(){for(const s of [...this.resident.values()])this.release(s);this.warmTarget.dispose();for(const m of [this.materials.near,this.materials.far,this.materials.contact])m.dispose()}
}
