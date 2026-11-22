import {DataTexture,DoubleSide,DynamicDrawUsage,Group,InstancedBufferAttribute,InstancedMesh,LinearFilter,MeshBasicMaterial,Object3D,PlaneGeometry,Vector3} from 'three'
import {SCOUT_WIDTH,SCOUT_DEPTH} from '../world/forest/invidScoutAsset.js'

export const SCOUT_SHADOW_LIMITS=Object.freeze({scouts:35,refreshes:8,queries:48,distance:175})
const clamp=n=>Math.max(0,Math.min(1,n))
function footprintTexture(){
 const size=96,data=new Uint8Array(size*size*4),lobes=[[0,.12,.38,.52],[-.49,.04,.34,.45],[.49,.04,.34,.45],[-.23,-.46,.24,.36],[.23,-.46,.24,.36]]
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1;let alpha=0
  for(const[cx,cy,rx,ry]of lobes){const d=Math.hypot((u-cx)/rx,(v-cy)/ry),t=clamp((1.16-d)/.42);alpha=Math.max(alpha,t*t*(3-2*t))}
  const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(alpha*.9*255)
 }
 const texture=new DataTexture(data,size,size);texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture
}

// One soft, Scout-shaped ground projection per enemy. Cached corner heights
// follow the actual terrain without another shadow map or a wider Scott map.
export class ScoutGroundShadows{
 constructor({sampleGround=()=>-Infinity}={}){
  this.sampleGround=sampleGround;this.root=new Group();this.root.name='Scout_ground_shadow_pool';this.root.userData.prewarmVFX=true;this.systems=[]
  this.map=footprintTexture();this.geometry=new PlaneGeometry(1,1,4,4).rotateX(-Math.PI/2)
  this.geometry.setAttribute('aScoutShadowHeights',new InstancedBufferAttribute(new Float32Array(SCOUT_SHADOW_LIMITS.scouts*4),4).setUsage(DynamicDrawUsage))
  this.geometry.setAttribute('aScoutShadowCenter',new InstancedBufferAttribute(new Float32Array(SCOUT_SHADOW_LIMITS.scouts*2),2).setUsage(DynamicDrawUsage))
  this.material=new MeshBasicMaterial({map:this.map,color:'#11130e',transparent:true,depthTest:true,depthWrite:false,side:DoubleSide,fog:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute vec4 aScoutShadowHeights;attribute vec2 aScoutShadowCenter;varying float vScoutShadowOpacity;\n'+shader.vertexShader
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float terrainHeight=mix(mix(aScoutShadowHeights.x,aScoutShadowHeights.y,uv.x),mix(aScoutShadowHeights.z,aScoutShadowHeights.w,uv.x),uv.y);
    float middle=(aScoutShadowHeights.x+aScoutShadowHeights.y+aScoutShadowHeights.z+aScoutShadowHeights.w)*.25;
    transformed.y=terrainHeight+(aScoutShadowCenter.x-middle)*(1.0-abs(uv.x*2.0-1.0))*(1.0-abs(uv.y*2.0-1.0))+.035;
    vScoutShadowOpacity=aScoutShadowCenter.y;`)
   shader.fragmentShader='varying float vScoutShadowOpacity;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vScoutShadowOpacity;\n#include <alphatest_fragment>')
  }
  this.material.customProgramCacheKey=()=> 'scout-terrain-following-ground-shadow-v1'
  this.mesh=new InstancedMesh(this.geometry,this.material,SCOUT_SHADOW_LIMITS.scouts);this.mesh.name='Scout_soft_ground_shadows';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.renderOrder=2;this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);this.root.add(this.mesh)
  this.records=new WeakMap();this.clock=0;this.frame=0;this.state=null;this.object=new Object3D();this.direction=new Vector3(25,-35,-20).normalize();this.lightPoint=new Vector3();this.targetPoint=new Vector3();this.sun=null
  this.stats={shadows:0,groundQueries:0,refreshed:0}
 }
 refresh(scout,record){
  const x=scout.position.x,z=scout.position.z,floor=this.sampleGround(x,z);this.stats.groundQueries++
  record.at=this.clock;record.sourceX=x;record.sourceY=scout.position.y;record.sourceZ=z;record.yaw=scout.yaw||0;record.valid=false
  if(!Number.isFinite(floor))return
  record.height=Math.max(0,scout.position.y-floor);if(record.height>60)return
  const travel=(record.height+(scout.height||5.2)*.42)/Math.max(.35,-this.direction.y)
  record.x=x+this.direction.x*travel;record.z=z+this.direction.z*travel;record.width=SCOUT_WIDTH*.98+record.height*.065;record.length=SCOUT_DEPTH*1.15+record.height*.09
  record.center=this.sampleGround(record.x,record.z);this.stats.groundQueries++
  const c=Math.cos(record.yaw),s=Math.sin(record.yaw)
  for(let i=0;i<4;i++){const dx=(i%2?.5:-.5)*record.width,dz=(i<2?.5:-.5)*record.length;record.heights[i]=this.sampleGround(record.x+c*dx+s*dz,record.z-s*dx+c*dz);this.stats.groundQueries++}
  record.valid=Number.isFinite(record.center)&&record.heights.every(Number.isFinite)
 }
 update(dt,patrol,camera,day,state,scene){
  if(this.state!==state){this.clear();this.state=state}
  this.clock+=Math.max(0,Math.min(.1,dt));this.stats.groundQueries=this.stats.refreshed=0;this.mesh.count=0
  if(!this.sun?.parent)this.sun=scene?.getObjectByName('Character_sun_shadow')
  if(this.sun){this.sun.getWorldPosition(this.lightPoint);this.sun.target.getWorldPosition(this.targetPoint);this.direction.subVectors(this.targetPoint,this.lightPoint).normalize()}
  const scouts=patrol?.scouts||[],start=(this.frame++*SCOUT_SHADOW_LIMITS.refreshes)%Math.max(1,scouts.length)
  for(let n=0;n<scouts.length;n++){
   const scout=scouts[(start+n)%scouts.length];if(scout.dead||!scout.view?.root.visible||camera.position.distanceToSquared(scout.position)>SCOUT_SHADOW_LIMITS.distance**2)continue
   let r=this.records.get(scout);if(!r){r={valid:false,at:-Infinity,sourceX:Infinity,sourceY:Infinity,sourceZ:Infinity,yaw:0,heights:new Float32Array(4)};this.records.set(scout,r)}
   const moved=Math.hypot(scout.position.x-r.sourceX,scout.position.y-r.sourceY,scout.position.z-r.sourceZ)>1.1
   if((this.clock-r.at>.12||moved)&&this.stats.refreshed<SCOUT_SHADOW_LIMITS.refreshes){this.refresh(scout,r);this.stats.refreshed++}
   if(!r.valid||this.mesh.count>=SCOUT_SHADOW_LIMITS.scouts)continue
   const opacity=.52*clamp(1-r.height/65)**.8*clamp((SCOUT_SHADOW_LIMITS.distance-camera.position.distanceTo(scout.position))/35)*clamp(day)
   if(opacity<.015)continue
   const i=this.mesh.count++;this.object.position.set(r.x,0,r.z);this.object.rotation.set(0,r.yaw,0);this.object.scale.set(r.width,1,r.length);this.object.updateMatrix();this.mesh.setMatrixAt(i,this.object.matrix)
   this.geometry.attributes.aScoutShadowHeights.setXYZW(i,...r.heights);this.geometry.attributes.aScoutShadowCenter.setXY(i,r.center,opacity)
  }
  this.stats.shadows=this.mesh.count
  if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;this.geometry.attributes.aScoutShadowHeights.needsUpdate=true;this.geometry.attributes.aScoutShadowCenter.needsUpdate=true}
 }
 clear(){this.records=new WeakMap();this.mesh.count=0;this.stats.shadows=0}
 dispose(){this.root.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();this.map.dispose()}
}
