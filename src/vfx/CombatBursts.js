import {AdditiveBlending,Color,DataTexture,DynamicDrawUsage,Group,IcosahedronGeometry,InstancedBufferAttribute,InstancedMesh,LinearFilter,MeshBasicMaterial,Object3D,PointLight,Quaternion,RingGeometry,SphereGeometry,Vector3} from 'three'
import {COMBAT_VFX_LIMITS as LIMITS,createCombatVFXPresets} from './combatVFXPresets.js'
import {setCombatFlashLights,releaseCombatFlashLights} from './combatFlashLighting.js'
import {EXPLOSION_ATLAS,INVID_GROUND_ATLAS,INVID_BLOOD_ATLAS,explosionFrame,explosionFrameRect} from './explosionAtlas.js'
import {INVID_BLOOD} from './invidBloodConfig.js'

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x))
const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)}
const axis=new Vector3(0,0,1),up=new Vector3(0,1,0),white=new Color('#ffffff')
function softRuptureHalo(){
  const size=64,data=new Uint8Array(size*size*4)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,a=Math.atan2(v,u),edge=.88+.045*Math.sin(a*5)+.035*Math.cos(a*7),fade=Math.max(0,1-Math.hypot(u,v)/edge),i=(y*size+x)*4
    data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(fade*fade*255)
  }
  const texture=new DataTexture(data,size,size);texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture
}

function softSmokeBall(){
  // A softly shaded, lobed particle instead of the hard impact silhouette.
  // Its dome lighting supplies volume without extra scene lights or shaders.
  const size=64,data=new Uint8Array(size*size*4)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,angle=Math.atan2(v,u)
    const edge=.86+.065*Math.sin(angle*5+.7)+.035*Math.cos(angle*7-.4),radius=Math.hypot(u,v)/edge
    const dome=Math.sqrt(Math.max(0,1-radius*radius)),shade=clamp(.46+dome*.48+(-u+v)*.09)
    const fade=clamp((1-radius)/.22),alpha=fade*fade*(3-2*fade),i=(y*size+x)*4
    data[i]=data[i+1]=data[i+2]=Math.round(shade*255);data[i+3]=Math.round(alpha*255)
  }
  const texture=new DataTexture(data,size,size);texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture
}

// All geometry, material and frame attributes are allocated once. Animated
// sheets share one draw per surface type, with independent UVs for each death.
export class CombatBursts {
  constructor(texture,plane,atlases={},bloodRandom=Math.random){
    this.root=new Group();this.root.name='Combat_anime_impact_pool';this.presets=createCombatVFXPresets()
    this.records=Array.from({length:LIMITS.bursts},(_,i)=>({explosionSlot:i<LIMITS.explosions,age:Infinity,life:0,position:new Vector3(),normal:new Vector3(0,1,0),anchor:null,joint:0,bindPoint:new Vector3(),bindNormal:new Vector3(),core:new Color(),color:new Color(),edge:new Color(),residual:new Color(),smokeColor:new Color()}))
    this.fragmentGeometry=new IcosahedronGeometry(1,0);this.ringGeometry=new RingGeometry(.94,1,40);this.proceduralTexture=texture;this.atlases=atlases
    this.fire=this.mesh(plane,texture,LIMITS.bursts*9,'Combat_short_internal_bursts')
    this.rings=this.mesh(this.ringGeometry,null,LIMITS.bursts,'Combat_hit_pulses')
    this.groundSprites=this.mesh(plane,atlases.ground||texture,LIMITS.explosions,'Invid_ground_rupture_sheet',true)
    this.airSprites=this.mesh(plane,atlases.air||texture,LIMITS.explosions,'Invid_air_rupture_sheet',true)
    this.terrainSprites=this.mesh(plane,atlases.terrain||texture,LIMITS.bursts-LIMITS.explosions,'Invid_terrain_dust_sheet',true)
    this.hitSprites=this.mesh(plane,atlases.terrain||atlases.air||texture,LIMITS.bursts-LIMITS.explosions,'Gallant_attached_rouge_impact_sheet',true)
    this.surfaceSprites=this.mesh(plane,atlases.terrain||texture,LIMITS.bursts-LIMITS.explosions,'Gallant_yellow_surface_impact_sheet',true,true)
    this.bloodRandom=bloodRandom;this.bloodSequence=0
    this.bloodRecords=Array.from({length:INVID_BLOOD.deathSlots+INVID_BLOOD.hitSlots},(_,i)=>({deathSlot:i<INVID_BLOOD.deathSlots,age:Infinity,life:0,position:new Vector3(),normal:new Vector3(),bindPoint:new Vector3(),bindNormal:new Vector3(),anchor:null,joint:0,variant:0,size:0,seed:0,frame:0}))
    this.bloodSprites=[0,1].map(i=>this.mesh(plane,atlases.blood?.[i]||texture,this.bloodRecords.length,'Invid_viscous_blood_0'+(i+1),true))
    for(const mesh of this.bloodSprites){
      mesh.renderOrder=11;mesh.material.alphaTest=.045
      const compile=mesh.material.onBeforeCompile,key=mesh.material.customProgramCacheKey()
      mesh.material.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.a=smoothstep(.015,.45,diffuseColor.a);')}
      mesh.material.customProgramCacheKey=()=>key+'/dense-invid-fluid-v1'
    }
    this.smoke=this.mesh(plane,texture,LIMITS.bursts*LIMITS.smokePerBurst,'Combat_low_warm_dust')
    this.fragments=this.mesh(this.fragmentGeometry,null,LIMITS.bursts*LIMITS.fragmentsPerBurst,'Combat_geometric_fragments')
    this.coreGeometry=new SphereGeometry(1,12,8);this.haloTexture=softRuptureHalo();this.smokeBallTexture=softSmokeBall()
    this.hitGlows=this.mesh(plane,this.haloTexture,LIMITS.bursts-LIMITS.explosions,'Gallant_local_growing_yellow_glow')
    this.hitGlows.material.blending=AdditiveBlending;this.hitGlows.material.fog=false;this.hitGlows.renderOrder=8;this.hitSprites.renderOrder=this.surfaceSprites.renderOrder=9
    this.hotCore=this.mesh(this.coreGeometry,null,LIMITS.explosions*3,'Invid_hot_volumetric_core')
    this.halos=this.mesh(plane,this.haloTexture,LIMITS.explosions*2,'Invid_soft_additive_halo')
    this.residualSmoke=this.mesh(plane,this.smokeBallTexture,LIMITS.explosions*5,'Invid_residual_smoke')
    this.hotCore.material.blending=this.halos.material.blending=AdditiveBlending
    this.halos.material.depthTest=true
    this.hotCore.material.fog=this.halos.material.fog=false
    // Keep the smoke behind the authored flames until the sheet dissipates.
    this.hotCore.renderOrder=8;this.halos.renderOrder=5;this.residualSmoke.renderOrder=5
    this.meshes=[this.fire,this.rings,this.groundSprites,this.airSprites,this.terrainSprites,this.hitSprites,this.surfaceSprites,...this.bloodSprites,this.hitGlows,this.smoke,this.fragments,this.hotCore,this.halos,this.residualSmoke]
    this.lightingRoot=new Group();this.lightingRoot.name='Invid_fixed_explosion_lights'
    this.deathLights=Array.from({length:LIMITS.lights},(_,i)=>{const light=new PointLight('#ffcb86',0,13,2);light.name='Invid_explosion_light_'+i;light.castShadow=false;this.lightingRoot.add(light);return light})
    this.lights=Array.from({length:LIMITS.lights},()=>({position:new Vector3(),color:new Color('#ffe2a0'),intensity:0,distance:6}))
    setCombatFlashLights(this.lights)
    this.object=new Object3D();this.cameraRotation=new Quaternion();this.rotation=new Quaternion();this.groundRotation=new Quaternion();this.point=new Vector3();this.center=new Vector3();this.direction=new Vector3()
    this.hotTint=new Color();this.smokeTint=new Color();this.darkSmoke=new Color('#23232a')
    this.sequence=0;this.stats={active:0,spawned:0,recycled:0,smoke:0,fragments:0,groundSprites:0,airSprites:0,terrainSprites:0,hotCores:0,halos:0,residualSmoke:0,blood:0,bloodSpawned:0}
  }
  mesh(geometry,map,count,name,atlas=false,tintAtlas=false){
    const owned=geometry.clone(),opacity=new InstancedBufferAttribute(new Float32Array(count),1).setUsage(DynamicDrawUsage)
    owned.setAttribute('aCombatOpacity',opacity)
    if(atlas)owned.setAttribute('aCombatFrame',new InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(DynamicDrawUsage))
    const material=new MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,fog:true,alphaTest:atlas?.08:.015})
    material.name=name
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float aCombatOpacity;varying float vCombatOpacity;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCombatOpacity=aCombatOpacity;')
      if(atlas){
        shader.vertexShader='attribute vec4 aCombatFrame;\n'+shader.vertexShader
        shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=aCombatFrame.xy+vMapUv*aCombatFrame.zw;')
      }
      shader.fragmentShader='varying float vCombatOpacity;\n'+shader.fragmentShader
      if(tintAtlas)shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=vec3(dot(diffuseColor.rgb,vec3(.299,.587,.114)));')
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vCombatOpacity;\n#include <alphatest_fragment>')
    }
    material.customProgramCacheKey=()=>`combat-pooled-alpha-v3/atlas:${atlas}/tint:${tintAtlas}`
    const mesh=new InstancedMesh(owned,material,count);mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=name.includes('dust')?7:6
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    for(let i=0;i<count;i++)mesh.setColorAt(i,white)
    this.root.add(mesh);return mesh
  }
  spawn(name,point,normal,scale=1,context={}){
    const preset=this.presets[name];if(!preset)return null
    const death=name==='invidExplosion';let record=null
    for(const r of this.records){if(r.explosionSlot!==death)continue;if(r.age>=r.life){record=r;break}if(!record||r.seed<record.seed)record=r}
    if(record.age<record.life)this.stats.recycled++
    record.anchor=null;record.position.copy(point);record.normal.copy(normal||axis).normalize();if(record.normal.lengthSq()<.1)record.normal.copy(axis)
    record.grounded=!!context.grounded;record.groundY=Number.isFinite(context.groundY)?context.groundY:point.y
    record.age=0;record.pendingFirstFrame=true;record.life=clamp(death&&!record.grounded?preset.airDuration||preset.duration:preset.duration,.08,death?.7:name==='invidClawImpact'?.6:name==='invidGroundImpact'?.45:.3)
    record.fireLife=record.life;record.ignition=death?preset.ignition:0
    if(death)record.life+=clamp(preset.smokeTail||0,0,.7)
    record.name=name;record.seed=++this.sequence;record.frame=0;record.mirror=noise(record.seed)>.5
    record.size=clamp(preset.size,.1,4)*clamp(scale,.25,1.25);record.intensity=clamp(preset.intensity,0,3)
    record.widthScale=preset.widthScale||1;record.heightScale=preset.heightScale||1
    record.expansion=clamp(preset.expansion,.2,2);record.smoke=clamp(Math.floor(preset.smoke),0,LIMITS.smokePerBurst);record.fragments=clamp(Math.floor(preset.fragments),0,LIMITS.fragmentsPerBurst)
    record.lightIntensity=clamp(preset.lightIntensity,0,death?100:24);record.lightDistance=clamp(preset.lightDistance,0,death?16:10)*scale;record.lightDuration=clamp(preset.lightDuration,0,death?.25:.18)
    for(const key of ['core','color','edge','residual','smokeColor'])record[key].set(preset[key])
    this.stats.spawned++;return record
  }
  attachHit(record,view,joint,point,normal){
    if(!record||!view)return
    record.anchor=view;record.joint=joint;record.bindPoint.copy(point);record.bindNormal.copy(normal)
  }
  spawnBlood(point,normal,scale=1,death=false,anchor=null,headWidth=null){
    if(!this.atlases.blood?.some(Boolean)||this.bloodRandom()>=(death?INVID_BLOOD.deathChance:INVID_BLOOD.hitChance))return null
    let r=null
    for(const entry of this.bloodRecords){if(entry.deathSlot!==death)continue;if(entry.age>=entry.life){r=entry;break}if(!r||entry.seed<r.seed)r=entry}
    r.variant=this.bloodRandom()<.5?0:1;if(!this.atlases.blood[r.variant])r.variant=1-r.variant
    r.age=0;r.pendingFirstFrame=true;r.life=death?INVID_BLOOD.deathDuration:INVID_BLOOD.hitDuration;r.seed=++this.bloodSequence;r.frame=0
    r.position.copy(point);r.normal.copy(normal||axis).normalize();r.anchor=null
    if(anchor){r.anchor=anchor.view;r.joint=anchor.joint;r.bindPoint.copy(anchor.point);r.bindNormal.copy(anchor.normal)}
    r.size=death&&headWidth?headWidth*(.96+noise(r.seed*7)*.03):(death?INVID_BLOOD.deathSize:INVID_BLOOD.hitSize)*clamp(scale,.25,1.25)*(.88+noise(r.seed*7)*.24);r.mirror=noise(r.seed*11)>.5;r.spin=(noise(r.seed*17)-.5)*.55
    this.stats.bloodSpawned++;return r
  }
  updateBlood(dt){
    for(const r of this.bloodRecords){
      if(r.age>=r.life)continue
      if(r.pendingFirstFrame)r.pendingFirstFrame=false;else r.age+=Math.max(0,dt)
      if(r.age>=r.life)continue
      if(r.anchor){
        const mesh=r.anchor.levels[0],joint=r.anchor.motion?.matrices[r.joint]
        mesh.updateWorldMatrix(true,false);r.position.copy(r.bindPoint);r.normal.copy(r.bindNormal)
        if(joint){r.position.applyMatrix4(joint);r.normal.transformDirection(joint)}
        r.position.applyMatrix4(mesh.matrixWorld);r.normal.transformDirection(mesh.matrixWorld)
      }
      const t=r.age/r.life,size=r.size*(.92+t*.08)
      r.frame=explosionFrame(t**.82,INVID_BLOOD_ATLAS)
      // Heavy short ejection, with a small downward sag rather than mist.
      this.point.copy(r.position).addScaledVector(r.normal,.10+r.age*(r.deathSlot?.3:.4));this.point.y-=(r.deathSlot?.45:.6)*r.age*r.age
      this.rotation.setFromAxisAngle(axis,r.spin).premultiply(this.cameraRotation)
      this.put(this.bloodSprites[r.variant],this.point,size,white,clamp((1-t)*5),this.rotation,size,1,r.frame,r.mirror,INVID_BLOOD_ATLAS)
    }
  }
  put(mesh,position,sx,color,alpha,rotation=this.cameraRotation,sy=sx,sz=sx,frame=null,mirror=false,atlas=EXPLOSION_ATLAS){
    const i=mesh.count++;this.object.position.copy(position);this.object.quaternion.copy(rotation);this.object.scale.set(sx,sy,sz);this.object.updateMatrix()
    mesh.setMatrixAt(i,this.object.matrix);mesh.setColorAt(i,color);mesh.geometry.attributes.aCombatOpacity.setX(i,clamp(alpha))
    if(frame!==null)mesh.geometry.attributes.aCombatFrame.setXYZW(i,...explosionFrameRect(frame,mirror,atlas))
  }
  update(dt,camera){
    camera.getWorldQuaternion(this.cameraRotation)
    for(const mesh of this.meshes)mesh.count=0
    for(const light of this.lights)light.intensity=0
    for(const light of this.deathLights)light.intensity=0
    let active=0,lightIndex=0,deathLightIndex=0
    for(const r of this.records){
      if(r.age>=r.life)continue
      // Hits arrive after the simulation tick. Do not charge the elapsed
      // frame to an effect that has not been drawn yet (especially at 10 FPS).
      if(r.pendingFirstFrame)r.pendingFirstFrame=false
      else r.age=Math.min(r.life,r.age+Math.max(0,dt))
      if(r.age>=r.life)continue
      active++;const death=r.name==='invidExplosion',t=death?clamp((r.age-r.ignition)/(r.fireLife-r.ignition)):r.age/r.life,terrain=r.name==='invidGroundImpact'||r.name==='invidClawImpact',groundEffect=death||terrain,power=r.intensity
      const localHit=r.name==='invidHit',surfaceHit=r.name==='gallantImpact'
      if(localHit&&r.anchor){
        const mesh=r.anchor.levels[0],joint=r.anchor.motion?.matrices[r.joint]
        mesh.updateWorldMatrix(true,false);r.position.copy(r.bindPoint);r.normal.copy(r.bindNormal)
        if(joint){r.position.applyMatrix4(joint);r.normal.transformDirection(joint)}
        r.position.applyMatrix4(mesh.matrixWorld);r.normal.transformDirection(mesh.matrixWorld)
      }
      this.center.copy(r.position).addScaledVector(r.normal,death?0:localHit||surfaceHit?.045+r.size*.03:.1+r.size*.08)
      if(terrain){
        r.frame=explosionFrame(t,INVID_GROUND_ATLAS)
        this.groundRotation.setFromAxisAngle(up,Math.atan2(camera.position.x-r.position.x,camera.position.z-r.position.z))
        const height=r.size*r.heightScale,width=r.size*r.widthScale
        this.point.copy(r.position);this.point.y=r.groundY+height*.5+.025
        if(this.atlases.terrain)this.put(this.terrainSprites,this.point,width,white,Math.min(1,(1-t)*5)*power,this.groundRotation,height,1,r.frame,r.mirror,INVID_GROUND_ATLAS)
      }else if(surfaceHit){
        r.frame=explosionFrame(t,INVID_GROUND_ATLAS)
        this.hotTint.copy(r.color).multiplyScalar(1.25)
        if(this.atlases.terrain)this.put(this.surfaceSprites,this.center,r.size,this.hotTint,Math.min(1,(1-t)*5)*power,this.cameraRotation,r.size,1,r.frame,r.mirror,INVID_GROUND_ATLAS)
        this.hotTint.copy(r.color).multiplyScalar(1.3)
        this.put(this.hitGlows,this.center,r.size*(.5+t*.7),this.hotTint,(1-t)**2*.28*power,this.cameraRotation,r.size*(.5+t*.7),1)
      }else if(localHit){
        const atlas=this.atlases.terrain?INVID_GROUND_ATLAS:EXPLOSION_ATLAS
        r.frame=explosionFrame(t,atlas)
        const height=r.size,width=height*(atlas.width/atlas.columns)/(atlas.height/atlas.rows)
        this.hotTint.copy(r.edge).multiplyScalar(1.35)
        if(this.atlases.terrain||this.atlases.air)this.put(this.hitSprites,this.center,width,this.hotTint,Math.min(1,(1-t)*5)*power,this.cameraRotation,height,1,r.frame,r.mirror,atlas)
        const growth=1-Math.exp(-t*6),glowSize=r.size*(.65+growth*2.2),fade=Math.min(1,.35+t*7)*(1-t)**1.2
        this.hotTint.copy(r.color).multiplyScalar(1.7)
        this.put(this.hitGlows,this.center,glowSize,this.hotTint,fade*.65*power,this.cameraRotation,glowSize,1)
      }else if(death){
        const type=r.grounded?'ground':'air',sheet=this.atlases[type]
        r.frame=explosionFrame(t)
        this.groundRotation.setFromAxisAngle(up,Math.atan2(camera.position.x-r.position.x,camera.position.z-r.position.z))
        const burning=r.age>=r.ignition&&r.age<r.fireLife
        if(sheet&&burning){
          // Twelve authored frames provide the rupture, stretch and dissipation;
          // this is not one static image made larger over its lifetime.
          const height=r.size*(r.grounded?1.12:1.22),width=height*(EXPLOSION_ATLAS.width/EXPLOSION_ATLAS.columns)/(EXPLOSION_ATLAS.height/EXPLOSION_ATLAS.rows)
          this.point.copy(r.position);this.point.y=r.grounded?r.groundY+height*.5+.035:r.position.y+height*.1
          this.hotTint.copy(white).multiplyScalar(1.25)
          this.put(r.grounded?this.groundSprites:this.airSprites,this.point,width,this.hotTint,Math.min(1,(1-t)*6)*power,r.grounded?this.groundRotation:this.cameraRotation,height,1,r.frame,r.mirror)
        }else if(!sheet&&burning){
          // Fallback: staggered narrow tongues, never a radial star or puff.
          for(let i=0;i<6;i++){
            const n=r.seed*19+i*7,age=clamp((t-noise(n)*.08)/.72),envelope=Math.sin(Math.PI*age),angle=(noise(n+1)-.5)*2.6
            if(envelope<=0)continue
            const length=r.size*(.55+noise(n+2))*envelope
            this.direction.set(Math.sin(angle),Math.cos(angle),0).applyQuaternion(this.cameraRotation)
            this.point.copy(this.center).addScaledVector(this.direction,length*.35)
            this.rotation.setFromAxisAngle(axis,-angle).premultiply(this.cameraRotation)
            this.put(this.fire,this.point,length*.18,i%2?r.edge:r.color,(1-age)*power,this.rotation,length,1)
          }
        }
        const heat=clamp(1-r.age/Math.min(.2,r.fireLife*.4)),rise=clamp((r.age-.02)/.10)
        if(heat>0){
          const pulse=.94+.06*Math.sin(r.age*65+r.seed),glow=heat*pulse
          // Two soft additive layers: broad warm spill and a tighter hot glow.
          // Both remain behind the unchanged animated explosion sheet.
          this.hotTint.copy(r.color).lerp(r.edge,.25).multiplyScalar(1.7)
          this.put(this.halos,this.center,r.size*(1.5+rise*.65),this.hotTint,glow*.55*power,this.cameraRotation,r.size*(1.2+rise*.5),1)
          this.hotTint.copy(r.core).multiplyScalar(2.1)
          this.put(this.halos,this.center,r.size*(.7+rise*.5),this.hotTint,glow*.55*power,this.cameraRotation,r.size*(.65+rise*.45),1)
          // Three unequal ellipsoids give the hot centre depth and an upward
          // tearing silhouette. No radial rays, stars or decorative rings.
          for(let i=0;i<3;i++){
            const n=r.seed*43+i*11,length=r.size*(.16+rise*(.23+noise(n)*.18))*heat
            this.point.copy(this.center);this.point.x+=(noise(n+1)-.5)*r.size*.22*rise;this.point.z+=(noise(n+2)-.5)*r.size*.22*rise;this.point.y+=rise*r.size*(noise(n+3)*.2-.03)
            this.object.rotation.set((noise(n+4)-.5)*.5,noise(n+5)*2,(noise(n+6)-.5)*.85);this.rotation.copy(this.object.quaternion)
            this.hotTint.copy(i===0?r.core:r.color).multiplyScalar(i===0?2.8:1.5)
            this.put(this.hotCore,this.point,length*(i===0?.5:.3),this.hotTint,heat*.85*power,this.rotation,length,length*.4)
          }
        }
        if(r.age>.11){
          const smokeAge=clamp((r.age-.11)/(r.life-.11))
          this.smokeTint.copy(r.smokeColor).lerp(this.darkSmoke,smokeAge*.7)
          for(let i=0;i<5;i++){
            const n=r.seed*29+i*5,width=r.size*(i===0?.55+smokeAge*.95:.32+smokeAge*(.65+noise(n)*.22)),spread=r.size*(.12+smokeAge*.65)
            this.point.copy(r.position);this.point.x+=(noise(n+1)-.5)*spread;this.point.z+=(noise(n+2)-.5)*spread;this.point.y+=r.size*(.08+smokeAge*(.35+noise(n+3)*.25))
            this.rotation.setFromAxisAngle(axis,noise(n+4)*Math.PI*2+smokeAge*(noise(n+5)-.5)*.5).premultiply(this.cameraRotation)
            this.put(this.residualSmoke,this.point,width,this.smokeTint,Math.sin(Math.PI*smokeAge)*(i===0?.34:.43)*power,this.rotation,width*(.92+noise(n+6)*.16),1)
          }
        }
      }else{
        // Preserve the approved hit presentation exactly. Death has its own
        // sprite branch above and never emits these hit pulses/remnants.
        const alpha=(1-t)*power,growth=1-Math.exp(-t*13),size=r.size*(.22+growth*r.expansion)
        this.put(this.fire,this.center,size,r.color,alpha)
        this.put(this.fire,this.center,size*.48*(1-t*.6),t<.25?r.core:r.color,alpha)
        if(t<.7){
          this.point.copy(this.center).addScaledVector(r.normal,.035);this.rotation.setFromUnitVectors(axis,r.normal)
          this.put(this.rings,this.point,r.size*(.22+growth*1.05*r.expansion),r.color,(1-t/.7)*.55*power,this.rotation)
        }
        for(let i=0;i<3;i++){
          const n=r.seed*13+i,angle=noise(n)*Math.PI*2,reach=r.size*(.2+t*.9),rise=(noise(n+3)-.3)*r.size*t
          this.direction.set(Math.cos(angle),Math.sin(angle),0).applyQuaternion(this.cameraRotation)
          this.point.copy(this.center).addScaledVector(this.direction,reach);this.point.y+=rise
          this.put(this.fire,this.point,r.size*.105*(1-t*.65),r.residual,(1-t)*power)
        }
      }
      for(let i=0;i<r.fragments&&(!death||r.age<r.fireLife);i++){
        const n=r.seed*37+i*7,age=Math.max(0,r.age-.025),a=noise(n)*Math.PI*2,v=r.size*(.8+noise(n+1)*1.3)
        if(r.age<.025)continue
        this.point.copy(r.position);this.point.x+=Math.cos(a)*v*age;this.point.z+=Math.sin(a)*v*age;this.point.y+=(1.2+noise(n+2)*2)*age-6*age*age
        this.object.rotation.set(age*(3+noise(n+3)*5),a+age*3,age*4);this.rotation.copy(this.object.quaternion)
        this.put(this.fragments,this.point,r.size*(.025+noise(n+4)*.025)*(1-t*.4),i%2?r.edge:r.smokeColor,(1-t)*power,this.rotation,r.size*.025,r.size*.05)
      }
      // Ground cards already contain smoke; low wide puffs add lateral weight
      // at real terrain height. Air bursts retain their floating sheet cloud.
      const dustCount=death?(r.grounded?r.smoke:0):r.smoke
      for(let i=0;i<dustCount;i++){
        const delay=groundEffect?.045:0;if(r.age<delay)continue
        const age=clamp((r.age-delay)/(r.life-delay)),n=r.seed*17+i*3,side=i%2?1:-1,reach=r.size*(.12+age*(.6+noise(n)*.4))
        this.direction.set(1,0,0).applyQuaternion(groundEffect?this.groundRotation:this.cameraRotation)
        this.point.copy(groundEffect?r.position:this.center).addScaledVector(this.direction,reach*side)
        const width=r.size*(groundEffect?.45+age*.7:.18+age*.25),height=width*(groundEffect?.23:.5)
        this.point.y=groundEffect?r.groundY+height*.5+.035:this.center.y+age*.12
        this.put(this.smoke,this.point,width,r.smokeColor,Math.sin(Math.PI*age)*(groundEffect?.5:.3)*power,groundEffect?this.groundRotation:this.cameraRotation,height,1)
      }
      if(death&&deathLightIndex<this.deathLights.length&&r.age<r.lightDuration){
        const light=this.deathLights[deathLightIndex++];light.position.copy(r.position);light.distance=r.lightDistance;light.intensity=r.lightIntensity*(1-r.age/r.lightDuration)**1.7*power
      }else if(!death&&lightIndex<this.lights.length&&r.age<r.lightDuration){
        const light=this.lights[lightIndex++];light.position.copy(r.position).addScaledVector(r.normal,death?.1:.15);light.color.copy(death?r.core:r.color);light.distance=r.lightDistance;light.intensity=r.lightIntensity*(1-r.age/r.lightDuration)**2*power
      }
    }
    // Mirror the same two PointLights into the existing fragment-light slots.
    // This makes their pulse visible on coarse Lambert terrain triangles too,
    // without adding lights, terrain geometry or another lighting pass.
    let deathSlot=0
    for(const source of this.deathLights)if(source.intensity>0){const light=this.lights[deathSlot++];light.position.copy(source.position);light.color.copy(source.color);light.distance=source.distance;light.intensity=source.intensity*.22}
    this.updateBlood(dt)
    for(const mesh of this.meshes)if(mesh.count){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.geometry.attributes.aCombatOpacity.needsUpdate=true;if(mesh.geometry.attributes.aCombatFrame)mesh.geometry.attributes.aCombatFrame.needsUpdate=true}
    Object.assign(this.stats,{active,smoke:this.smoke.count,fragments:this.fragments.count,groundSprites:this.groundSprites.count,airSprites:this.airSprites.count,terrainSprites:this.terrainSprites.count,hotCores:this.hotCore.count,halos:this.halos.count,residualSmoke:this.residualSmoke.count,blood:this.bloodSprites[0].count+this.bloodSprites[1].count})
  }
  clear(){this.records.forEach(r=>{r.age=Infinity;r.anchor=null});this.bloodRecords.forEach(r=>{r.age=Infinity;r.anchor=null});for(const mesh of this.meshes)mesh.count=0;for(const l of [...this.lights,...this.deathLights])l.intensity=0;this.stats.active=this.stats.smoke=this.stats.fragments=this.stats.groundSprites=this.stats.airSprites=this.stats.terrainSprites=this.stats.hotCores=this.stats.halos=this.stats.residualSmoke=this.stats.blood=0}
  dispose(){this.root.removeFromParent();this.lightingRoot.removeFromParent();releaseCombatFlashLights(this.lights);for(const mesh of this.meshes){mesh.dispose();mesh.geometry.dispose();mesh.material.dispose()}for(const l of this.deathLights)l.shadow.dispose();this.fragmentGeometry.dispose();this.ringGeometry.dispose();this.coreGeometry.dispose();this.haloTexture.dispose();this.smokeBallTexture.dispose()}
}
