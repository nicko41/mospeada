import {AdditiveBlending,Color,DynamicDrawUsage,Group,InstancedBufferAttribute,InstancedMesh,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Vector3} from 'three'

// Values are copied to instance.settings, editable independently of gameplay.
// Pool sizes reserve storage at construction; other tuning affects new bursts.
export const INVID_EXPLOSION_DEBRIS=Object.freeze({
 enabled:true,poolBursts:4,reserveFragments:32,reserveTrails:8,reserveSamples:8,randomSeed:0x49f12ab,
 fragmentMin:12,fragmentMax:20,trailFragmentMin:4,trailFragmentMax:6,
 speedMin:15,speedMax:30,drag:4.5,gravity:8,spawnRadius:.55,
 fragmentLifeMin:.4,fragmentLifeMax:.8,fragmentSizeMin:.14,fragmentSizeMax:.32,
 brightnessMin:2.4,brightnessMax:4,stretchSeconds:.035,maxStretch:.95,
 trailLifeMin:.8,trailLifeMax:1.5,trailSamples:6,trailEmissionTime:.3,
 smokeSizeMin:.22,smokeSizeMax:.38,smokeGrowth:1.9,smokeOpacity:.25,
 smokeRise:.55,smokeInertia:.035,smokeColor:'#514943',maxDistance:220,
})
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)},axis=new Vector3(0,0,1)
const particle=()=>({direction:new Vector3(),color:new Color(),speed:0,life:0,size:0,brightness:0,smokeLife:0,seed:0})
function visualRandom(seed){let state=seed||1;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}

export class InvidExplosionDebris{
 constructor({sparkMap,smokeMap,settings={},random=null}={}){
  this.settings={...INVID_EXPLOSION_DEBRIS,...settings};this.random=random||visualRandom(this.settings.randomSeed)
  const c=this.settings;this.capacity={bursts:c.poolBursts,fragments:c.reserveFragments,trails:c.reserveTrails,samples:c.reserveSamples}
  this.root=new Group();this.root.name='Invid_secondary_ejecta_and_short_smoke';this.root.userData.prewarmVFX=true
  this.hotGeometry=new PlaneGeometry();this.smokeGeometry=new PlaneGeometry()
  this.hotMaterial=new MeshBasicMaterial({name:'Invid shared incandescent fragments',map:sparkMap,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,fog:true,blending:AdditiveBlending,alphaTest:.015})
  this.smokeMaterial=new MeshBasicMaterial({name:'Invid shared lightweight smoke trails',map:smokeMap,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,fog:true,alphaTest:.008})
  this.hot=this.mesh(this.hotGeometry,this.hotMaterial,c.poolBursts*(c.reserveFragments+c.reserveTrails),'Invid_radial_hot_fragments')
  this.smoke=this.mesh(this.smokeGeometry,this.smokeMaterial,c.poolBursts*c.reserveTrails*c.reserveSamples,'Invid_short_fragment_smoke')
  this.smokeAlpha=new InstancedBufferAttribute(new Float32Array(this.smoke.instanceMatrix.count),1).setUsage(DynamicDrawUsage);this.smokeGeometry.setAttribute('aDebrisOpacity',this.smokeAlpha)
  this.smokeMaterial.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float aDebrisOpacity;varying float vDebrisOpacity;\n'+shader.vertexShader
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDebrisOpacity=aDebrisOpacity;')
   shader.fragmentShader='varying float vDebrisOpacity;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vDebrisOpacity;\n#include <alphatest_fragment>')
  }
  this.smokeMaterial.customProgramCacheKey=()=> 'invid-secondary-short-smoke-v1'
  this.records=Array.from({length:c.poolBursts},()=>({age:Infinity,life:0,hotLife:0,pending:false,origin:new Vector3(),edge:new Color(),smokeColor:new Color(),particles:Array.from({length:c.reserveFragments+c.reserveTrails},particle),fragments:0,trails:0,samples:0}))
  this.object=new Object3D();this.point=new Vector3();this.velocity=new Vector3();this.right=new Vector3();this.up=new Vector3();this.rotation=new Quaternion();this.spin=new Quaternion();this.tint=new Color();this.core=new Color();this.warm=new Color()
  this.stats={bursts:0,dropped:0,recycledTails:0,activeBursts:0,fragments:0,smoke:0}
 }
 mesh(geometry,material,capacity,name){
  const m=new InstancedMesh(geometry,material,capacity);m.name=name;m.count=0;m.frustumCulled=false;m.castShadow=false;m.receiveShadow=false;m.renderOrder=name.includes('smoke')?7:9;m.instanceMatrix.setUsage(DynamicDrawUsage)
  for(let i=0;i<capacity;i++)m.setColorAt(i,new Color())
  m.instanceColor.setUsage(DynamicDrawUsage);this.root.add(m);return m
 }
 burst(origin,scale=1,palette={}){
  const c=this.settings;if(!c.enabled)return false
  let record=this.records.find(r=>r.age>=r.life)
  if(!record){const old=this.records.reduce((a,b)=>a.age>b.age?a:b);if(old.age>=old.hotLife){record=old;this.stats.recycledTails++}}
  if(!record){this.stats.dropped++;return false}
  const r=record,random=this.random,range=(a,b)=>a+(b-a)*random(),count=(a,b,cap)=>Math.floor(clamp(Math.floor(range(a,b+1)),0,cap)),k=this.capacity
  r.age=0;r.life=0;r.hotLife=0;r.pending=true;r.origin.copy(origin);r.scale=clamp(scale,.55,1.3);r.drag=Math.max(.001,c.drag);r.gravity=c.gravity;r.radius=c.spawnRadius*r.scale
  r.fragments=count(c.fragmentMin,c.fragmentMax,k.fragments);r.trails=count(c.trailFragmentMin,c.trailFragmentMax,k.trails);r.samples=Math.floor(clamp(c.trailSamples,1,k.samples));r.emissionTime=c.trailEmissionTime
  r.stretch=c.stretchSeconds;r.maxStretch=c.maxStretch;r.smokeGrowth=c.smokeGrowth;r.smokeOpacity=c.smokeOpacity;r.smokeRise=c.smokeRise;r.smokeInertia=c.smokeInertia
  this.core.set(palette.core||'#fff2bf');this.warm.set(palette.color||'#ffc254');r.edge.set(palette.edge||'#ed5024');r.smokeColor.set(c.smokeColor)
  const total=r.fragments+r.trails,phase=random()*Math.PI*2
  for(let i=0;i<total;i++){
   const trailing=i>=r.fragments,groupIndex=trailing?i-r.fragments:i,groupCount=trailing?r.trails:r.fragments
   const p=r.particles[trailing?k.fragments+groupIndex:i],y=1-2*(groupIndex+.5)/Math.max(1,groupCount),angle=phase+i*2.3999632297+range(-.18,.18),radius=Math.sqrt(1-y*y)
   p.direction.set(Math.cos(angle)*radius,y,Math.sin(angle)*radius);p.speed=range(c.speedMin,c.speedMax);p.life=range(c.fragmentLifeMin,c.fragmentLifeMax);p.size=range(c.fragmentSizeMin,c.fragmentSizeMax)*r.scale;p.brightness=range(c.brightnessMin,c.brightnessMax);p.color.copy(this.core).lerp(this.warm,random()*.8);p.seed=range(0,1000)
   p.smokeLife=range(c.trailLifeMin,c.trailLifeMax);p.smokeSize=range(c.smokeSizeMin,c.smokeSizeMax)*r.scale
   r.hotLife=Math.max(r.hotLife,p.life);r.life=Math.max(r.life,i<r.fragments?p.life:p.smokeLife)
  }
  this.stats.bursts++;return true
 }
 position(r,p,t,out){const distance=r.radius+p.speed*(1-Math.exp(-r.drag*t))/r.drag;out.copy(r.origin).addScaledVector(p.direction,distance);out.y-=.5*r.gravity*t*t;return out}
 update(dt,camera){
  this.hot.count=this.smoke.count=0;this.stats.activeBursts=0
  camera.getWorldQuaternion(this.rotation);this.right.set(1,0,0).applyQuaternion(this.rotation);this.up.set(0,1,0).applyQuaternion(this.rotation)
  for(const r of this.records){
   if(r.age>=r.life)continue
   if(r.pending)r.pending=false;else r.age+=Math.max(0,dt)
   if(r.age>=r.life)continue
   this.stats.activeBursts++
   if(!this.settings.enabled||camera.position.distanceToSquared(r.origin)>this.settings.maxDistance**2)continue
   for(let i=0;i<r.fragments+r.trails;i++){
    const trail=i>=r.fragments,p=r.particles[trail?this.capacity.fragments+i-r.fragments:i],age=r.age
    if(age<p.life){
     this.position(r,p,age,this.point);this.velocity.copy(p.direction).multiplyScalar(p.speed*Math.exp(-r.drag*age));this.velocity.y-=r.gravity*age
     this.spin.setFromAxisAngle(axis,Math.atan2(this.velocity.dot(this.up),this.velocity.dot(this.right))).premultiply(this.rotation)
     const t=age/p.life,fade=(1-t)**1.5,size=p.size*(1-.3*t),length=size+Math.min(r.maxStretch,this.velocity.length()*r.stretch)
     this.object.position.copy(this.point);this.object.quaternion.copy(this.spin);this.object.scale.set(length,size*.65,1);this.object.updateMatrix()
     const index=this.hot.count++;this.hot.setMatrixAt(index,this.object.matrix);this.hot.setColorAt(index,this.tint.copy(p.color).lerp(r.edge,t*t*.65).multiplyScalar(p.brightness*fade))
    }
    if(!trail||age>=p.smokeLife)continue
    const emission=Math.min(r.emissionTime,p.life*.7)
    for(let j=0;j<r.samples;j++){
     const born=r.samples===1?0:emission*j/(r.samples-1),a=age-born;if(a<0)continue
     const life=p.smokeLife-born,t=clamp(a/life),fade=clamp(a/.055)*(1-t)**1.6*r.smokeOpacity
     if(fade<.004)continue
     this.position(r,p,born,this.point);this.point.addScaledVector(p.direction,p.speed*Math.exp(-r.drag*born)*r.smokeInertia*a);this.point.y+=r.smokeRise*a
     const size=p.smokeSize*(1+r.smokeGrowth*t)*(.88+noise(p.seed+j*7)*.24)
     this.spin.setFromAxisAngle(axis,noise(p.seed+j*3)*Math.PI*2).premultiply(this.rotation)
     this.object.position.copy(this.point);this.object.quaternion.copy(this.spin);this.object.scale.setScalar(size);this.object.updateMatrix()
     const index=this.smoke.count++;this.smoke.setMatrixAt(index,this.object.matrix);this.smoke.setColorAt(index,r.smokeColor);this.smokeAlpha.setX(index,fade)
    }
   }
  }
  for(const m of [this.hot,this.smoke])if(m.count){m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true}
  if(this.smoke.count)this.smokeAlpha.needsUpdate=true
  this.stats.fragments=this.hot.count;this.stats.smoke=this.smoke.count
 }
 clear(resetStats=false){for(const r of this.records){r.age=Infinity;r.pending=false}this.hot.count=this.smoke.count=0;this.stats.activeBursts=this.stats.fragments=this.stats.smoke=0;if(resetStats)this.stats.bursts=this.stats.dropped=this.stats.recycledTails=0}
 dispose(){this.root.removeFromParent();this.hot.dispose();this.smoke.dispose();this.hotGeometry.dispose();this.smokeGeometry.dispose();this.hotMaterial.dispose();this.smokeMaterial.dispose()}
}
