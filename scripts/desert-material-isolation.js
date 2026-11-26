// Local diagnostic only. Imported explicitly through Vite, never by the game.
import {canyonEarthMaterial} from '../src/world/forest/forestCanyonMaterials.js'
import {cloneRenderMaterial} from '../src/loading/cloneMaterial.js'

export function isolateDesert({scene,world,runtime,effect,vfx,weatherStore}){
  effect.restore()
  const originals=new Map(),temporary=new Map(),visibility=new Map()
  world.traverse(mesh=>{const data=mesh.material?.userData;if(mesh.isMesh&&data?.desertBlend&&(!data.desertSurface||data.desertSurface.preserveFlatFloor))originals.set(mesh,mesh.material)})
  const layers=[runtime.weathering?.layer,runtime.weathering?.scottLayer,runtime.randWeathering?.layer].filter(Boolean)
  const callbacks=layers.map(layer=>[layer,layer.update])
  const switches=layers.flatMap(layer=>[layer.uniforms.uSoilEnabled,layer.bodyEnabled].filter(Boolean).map(u=>[u,u.value]))
  const enabled=weatherStore.snapshot().enabled
  const roots=[vfx?.vfx.root,runtime.combatVFX?.surfaceMarks?.mesh].filter(Boolean)
  for(const root of roots)visibility.set(root,root.visible)
  const originalMaterials=new Set(originals.values())
  const textureInfo=t=>({uuid:t.uuid,source:t.source.uuid,width:t.image?.width,height:t.image?.height,
    url:t.image?.currentSrc||t.image?.src||null,renderTarget:!!t.isRenderTargetTexture,
    wrapS:t.wrapS,wrapT:t.wrapT,colorSpace:t.colorSpace,channel:t.channel})
  const audit=[...originalMaterials].map(m=>{
    const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'void main() {\n#include <map_fragment>\n}',uniforms:{}}
    const compile=effect.sources.get(m)?.compile||m.onBeforeCompile
    compile.call(m,shader,effect.renderer)
    return {name:m.name,uuid:m.uuid,settings:m.userData.desertBlend.settings,
      uniforms:Object.keys(shader.uniforms),textures:Object.entries(shader.uniforms).filter(([,u])=>u.value?.isTexture).map(([key,u])=>({key,...textureInfo(u.value)})),
      map: textureInfo(m.map),otherMaps:['alphaMap','aoMap','normalMap','roughnessMap','metalnessMap','bumpMap','displacementMap'].filter(k=>m[k]),
      soilReferences:layers.flatMap(layer=>layer.records||[]).filter(r=>originals.has(r.mesh)||[r.source,r.coated,...(r.owned||[]),...[...(r.variants?.values()||[])]].includes(m)).length}
  })
  function dynamicsOff(off){
    weatherStore.set({enabled:off?false:enabled})
    for(const [layer,update]of callbacks){
      layer.update=off?()=>{}:update
      if(off){layer.uniforms.uSoilEnabled.value=0;if(layer.bodyEnabled)layer.bodyEnabled.value=0}
    }
    for(const [root,visible]of visibility)root.visible=off?false:visible
    if(!off)for(const [u,value]of switches)u.value=value
  }
  function material(source,mode){
    const key=source.uuid+'/'+mode;if(temporary.has(key))return temporary.get(key)
    let m
    if(mode==='base-detail'||mode==='base-sand'){
      m=canyonEarthMaterial(mode==='base-detail'?source.map:source.userData.desertBlend.uniforms.uDesertSand.value)
      m.color.copy(source.color);m.name='DIAGNOSTIC / '+mode
    }else{
      m=cloneRenderMaterial(source)
      const compile=effect.sources.get(source)?.compile||source.onBeforeCompile
      m.onBeforeCompile=(shader,renderer)=>{
        compile.call(source,shader,renderer)
        const before=shader.fragmentShader
        if(mode==='no-pebbles')shader.fragmentShader=before.replace('desertPebble(pebbleUv)','0.0')
        else if(mode==='blend-only')shader.fragmentShader=before.replace(/\/\/ A restrained central trail[\s\S]*?diffuseColor\*=desertPaint;/,'diffuseColor*=desertPaint;')
        if(shader.fragmentShader===before)throw Error('Diagnostic did not match desert shader: '+mode)
      }
      const key=source.customProgramCacheKey();m.customProgramCacheKey=()=>key+'/diagnostic/'+mode
      m.name='DIAGNOSTIC / '+mode
    }
    temporary.set(key,m);return m
  }
  function set(mode){
    effect.restore();dynamicsOff(mode!=='original')
    for(const [mesh,source]of originals)mesh.material=mode==='original'||mode==='dynamics-off'?source:material(source,mode)
    return {mode,meshes:originals.size,dynamicsDisabled:mode!=='original'}
  }
  function restore(){
    set('original')
    // Force the restored updater once on the next normal frame; loads survive.
    for(const m of temporary.values())m.dispose()
  }
  return {audit,set,restore,originals,temporary}
}
