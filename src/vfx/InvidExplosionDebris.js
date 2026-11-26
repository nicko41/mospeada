import {AdditiveBlending,Color,DynamicDrawUsage,Group,InstancedMesh,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Vector3} from 'three'
import {InvidSmokeRibbons} from './InvidSmokeRibbons.js'

// Values are copied to instance.settings, editable independently of gameplay.
// Pool sizes reserve storage at construction; other tuning affects new bursts.
export const INVID_EXPLOSION_DEBRIS=Object.freeze({
 enabled:true,poolBursts:4,reserveFragments:32,reserveTrails:8,reserveSamples:24,randomSeed:0x49f12ab,
 fragmentMin:12,fragmentMax:20,trailFragmentMin:2,trailFragmentMax:4,
 speedMin:25,speedMax:45,drag:2.4,gravity:12,spawnRadius:.55,
 fragmentLifeMin:.4,fragmentLifeMax:.8,fragmentSizeMin:.18,fragmentSizeMax:.4,
 heroLifeMin:.6,heroLifeMax:1.2,heroSize:1.65,
 brightnessMin:3,brightnessMax:5,stretchSeconds:.045,maxStretch:1.65,
 trailLifeMin:1.5,trailLifeMax:2.5,trailSamples:24,trailEmissionTime:1.2,
 smokeSizeMin:.6,smokeSizeMax:.85,smokeGrowth:2.5,smokeOpacity:.48,
 smokeRise:.3,smokeTurbulence:.075,smokeColor:'#49413b',maxDistance:220,
})
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),axis=new Vector3(0,0,1)
const particle=samples=>({direction:new Vector3(),color:new Color(),speed:0,life:0,size:0,brightness:0,smokeLife:0,seed:0,trailCount:0,trailDuration:0,trailPoints:new Float32Array(samples*3),trailTimes:new Float32Array(samples)})
function visualRandom(seed){let state=seed||1;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}

export class InvidExplosionDebris{
 constructor({sparkMap,settings={},random=null}={}){
  this.settings={...INVID_EXPLOSION_DEBRIS,...settings};this.random=random||visualRandom(this.settings.randomSeed)
  const c=this.settings;this.capacity={bursts:c.poolBursts,fragments:c.reserveFragments,trails:c.reserveTrails,samples:c.reserveSamples}
  this.root=new Group();this.root.name='Invid_secondary_ejecta_and_suspended_smoke';this.root.userData.prewarmVFX=true
  this.hotGeometry=new PlaneGeometry()
  this.hotMaterial=new MeshBasicMaterial({name:'Invid shared incandescent fragments',map:sparkMap,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,fog:true,blending:AdditiveBlending,alphaTest:.015})
  this.hot=this.mesh(this.hotGeometry,this.hotMaterial,c.poolBursts*(c.reserveFragments+c.reserveTrails),'Invid_radial_hot_fragments')
  this.ribbons=new InvidSmokeRibbons(this.capacity);this.smoke=this.ribbons.mesh;this.smokeMaterial=this.ribbons.material;this.root.add(this.smoke)
  this.sampleTrailPosition=(r,p,t,out)=>this.position(r,p,t,out)
  this.records=Array.from({length:c.poolBursts},()=>({age:Infinity,life:0,hotLife:0,pending:false,origin:new Vector3(),edge:new Color(),smokeColor:new Color(),particles:Array.from({length:c.reserveFragments+c.reserveTrails},()=>particle(c.reserveSamples)),fragments:0,trails:0,samples:0}))
  this.object=new Object3D();this.point=new Vector3();this.velocity=new Vector3();this.right=new Vector3();this.up=new Vector3();this.rotation=new Quaternion();this.spin=new Quaternion();this.tint=new Color();this.core=new Color();this.warm=new Color()
  this.stats={bursts:0,dropped:0,recycledTails:0,activeBursts:0,fragments:0,smoke:0,smokeSegments:0}
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
  r.fragments=count(c.fragmentMin,c.fragmentMax,k.fragments);r.trails=count(c.trailFragmentMin,c.trailFragmentMax,k.trails);r.samples=Math.floor(clamp(c.trailSamples,2,k.samples));r.emissionTime=c.trailEmissionTime
  r.stretch=c.stretchSeconds;r.maxStretch=c.maxStretch;r.smokeGrowth=c.smokeGrowth;r.smokeOpacity=c.smokeOpacity;r.smokeRise=c.smokeRise;r.smokeTurbulence=c.smokeTurbulence
  this.core.set(palette.core||'#fff2bf');this.warm.set(palette.color||'#ffc254');r.edge.set(palette.edge||'#ed5024');r.smokeColor.set(c.smokeColor)
  const total=r.fragments+r.trails,phase=random()*Math.PI*2
  for(let i=0;i<total;i++){
   const trailing=i>=r.fragments,groupIndex=trailing?i-r.fragments:i,groupCount=trailing?r.trails:r.fragments
   const p=r.particles[trailing?k.fragments+groupIndex:i]
   const y=trailing?.8-groupIndex/Math.max(1,groupCount-1):1-2*(groupIndex+.5)/Math.max(1,groupCount)
   const angle=phase+i*2.3999632297+range(-.18,.18),radius=Math.sqrt(1-y*y)
   p.direction.set(Math.cos(angle)*radius,y,Math.sin(angle)*radius);p.speed=range(c.speedMin,c.speedMax);p.life=trailing?range(c.heroLifeMin,c.heroLifeMax):range(c.fragmentLifeMin,c.fragmentLifeMax);p.size=range(c.fragmentSizeMin,c.fragmentSizeMax)*r.scale*(trailing?c.heroSize:1);p.brightness=range(c.brightnessMin,c.brightnessMax);p.color.copy(this.core).lerp(this.warm,random()*.8);p.seed=range(0,1000)
   p.smokeLife=range(c.trailLifeMin,c.trailLifeMax);p.smokeSize=range(c.smokeSizeMin,c.smokeSizeMax)*r.scale
   p.trailCount=0;p.trailDuration=Math.min(r.emissionTime,p.life)
   r.hotLife=Math.max(r.hotLife,p.life);r.life=Math.max(r.life,trailing?p.smokeLife+p.trailDuration:p.life)
  }
  this.stats.bursts++;return true
 }
 position(r,p,t,out){const distance=r.radius+p.speed*(1-Math.exp(-r.drag*t))/r.drag;out.copy(r.origin).addScaledVector(p.direction,distance);out.y-=.5*r.gravity*t*t;return out}
 update(dt,camera){
  this.hot.count=0;this.ribbons.begin(camera);this.stats.activeBursts=0
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
    if(trail&&age<p.smokeLife+p.trailDuration)this.ribbons.append(r,p,age,this.sampleTrailPosition)
   }
  }
  if(this.hot.count){this.hot.instanceMatrix.needsUpdate=true;this.hot.instanceColor.needsUpdate=true}
  this.ribbons.end()
  this.stats.fragments=this.hot.count;this.stats.smoke=this.ribbons.count;this.stats.smokeSegments=this.ribbons.segments
 }
 clear(resetStats=false){for(const r of this.records){r.age=Infinity;r.pending=false}this.hot.count=0;this.ribbons.clear();this.stats.activeBursts=this.stats.fragments=this.stats.smoke=this.stats.smokeSegments=0;if(resetStats)this.stats.bursts=this.stats.dropped=this.stats.recycledTails=0}
 dispose(){this.root.removeFromParent();this.hot.dispose();this.ribbons.dispose();this.hotGeometry.dispose();this.hotMaterial.dispose()}
}
