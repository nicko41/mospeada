export const CINEMATIC_TYPES=Object.freeze(['blast','nearMiss','explosion','debris','ground','shockwave'])
export const CINEMATIC_NAMES=Object.freeze({blast:'Invid Blast periférico',nearMiss:'Near Miss',explosion:'Explosion Flash',debris:'Flying Debris',ground:'Ground Impact',shockwave:'Shockwave'})
const family=(patch)=>Object.freeze({enabled:true,intensity:1,duration:.2,minDistance:1,maxDistance:20,opacity:.24,size:.35,particles:0,particleDuration:0,particleSize:0,particleOpacity:0,blurAmount:0,distortionAmount:0,cooldown:.08,cap:2,directionality:1,...patch})
const families=Object.freeze({
 blast:family({duration:.18,maxDistance:18,opacity:.26,size:.38}),
 nearMiss:family({duration:.13,minDistance:.12,maxDistance:2.6,opacity:.34,size:.16,blurAmount:1.5,cooldown:.09}),
 explosion:family({duration:.18,minDistance:2,maxDistance:38,opacity:.22,size:.55,cooldown:.1,particles:18,particleDuration:.75,particleSize:.16,particleOpacity:.75}),
 debris:family({duration:.48,maxDistance:20,opacity:.34,size:.055,particles:8,cooldown:.11}),
 ground:family({duration:.36,maxDistance:14,opacity:.26,size:.075,particles:10,blurAmount:.4,cooldown:.1}),
 shockwave:family({duration:.18,minDistance:2,maxDistance:28,opacity:.24,size:1,distortionAmount:.8,cooldown:.14}),
})
const limits={intensity:[0,2],duration:[.06,.9],minDistance:[0,8],maxDistance:[1,80],opacity:[0,.7],size:[.01,1.5],particles:[0,24],particleDuration:[.06,.9],particleSize:[0,.45],particleOpacity:[0,1],blurAmount:[0,4],distortionAmount:[0,2],cooldown:[.025,1],cap:[1,3],directionality:[0,1]}
const globalLimits={intensity:[0,1.8],accumulationCap:[.1,.7],maxConcurrent:[1,8],maxParticles:[0,96],directionality:[0,1],exposureAmount:[0,.12],chromaticAmount:[0,.35],groundShakeIntensity:[0,.025]}
const base={enabled:true,preset:'Normal',intensity:1,accumulationCap:.5,maxConcurrent:8,maxParticles:64,directionality:1,blurEnabled:true,exposureEnabled:true,exposureAmount:.06,chromaticEnabled:false,chromaticAmount:.15,groundShakeEnabled:true,groundShakeIntensity:.012,families}
export const CINEMATIC_PRESETS=Object.freeze(['Off','Subtle','Normal','Intense'])
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x))
export function cinematicPreset(name='Normal'){
 const factor=name==='Subtle'?.6:name==='Intense'?1.35:1
 return {...base,enabled:name!=='Off',preset:name,intensity:factor,accumulationCap:name==='Subtle'?.32:name==='Intense'?.6:.5,maxParticles:name==='Subtle'?40:name==='Intense'?80:64,families:Object.fromEntries(CINEMATIC_TYPES.map(k=>[k,{...families[k]}]))}
}
let value=cinematicPreset(),listeners=new Set()
export const cinematicCombatState={
 defaults:cinematicPreset(),snapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 set(patch){
  const next={...value,preset:'Custom'}
  for(const k of ['enabled','blurEnabled','exposureEnabled','chromaticEnabled','groundShakeEnabled'])if(typeof patch[k]==='boolean')next[k]=patch[k]
  for(const [k,[a,b]]of Object.entries(globalLimits))if(Number.isFinite(patch[k]))next[k]=clamp(['maxConcurrent','maxParticles'].includes(k)?Math.round(patch[k]):patch[k],a,b)
  value=next;listeners.forEach(fn=>fn())
 },
 setFamily(kind,patch){
  if(!CINEMATIC_TYPES.includes(kind))return
  const next={...value.families[kind]}
  if(typeof patch.enabled==='boolean')next.enabled=patch.enabled
  for(const [k,[a,b]]of Object.entries(limits))if(Number.isFinite(patch[k]))next[k]=clamp(['particles','cap'].includes(k)?Math.round(patch[k]):patch[k],a,b)
  next.minDistance=Math.min(next.minDistance,next.maxDistance-.05)
  value={...value,preset:'Custom',families:{...value.families,[kind]:next}};listeners.forEach(fn=>fn())
 },
 preset(name){if(CINEMATIC_PRESETS.includes(name)){value=cinematicPreset(name);listeners.forEach(fn=>fn())}},
 reset(){this.preset('Normal')},
}
