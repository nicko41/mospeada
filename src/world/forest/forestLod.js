import { FOREST } from './forestConfig.js'
import { FOLIAGE_PILOT } from './forestFoliageConfig.js'
import { FOLIAGE_WORLD } from './forestFoliageWorldConfig.js'

export const FOREST_DISTANCE_MARGIN=3 // Half diagonal of a 4 m update cell, rounded up.
// Only used by read-only profiling scripts, without a production UI control.
export const canopyLodTest={mode:'auto'}
// Switch whole trees, not individual pixels of two different silhouettes. The
// stable per-tree threshold spreads changes across the old transition ring;
// hysteresis keeps bark, leaves and impostor on the same level while moving.
export function forestTreeLevel(placement,distance,previous=-1){
  const phase=Math.sin(placement.x*12.9898+placement.z*78.233)*43758.5453
  const rank=phase-Math.floor(phase),legacy=canopyLodTest.mode==='legacy',hysteresis=legacy?2:FOREST.treeLodHysteresis,start=legacy?68:FOREST.treeDetailFadeStart,end=legacy?82:FOREST.treeDetailDistance
  const threshold=start+hysteresis+rank*(end-start-2*hysteresis)
  if(previous<0)return distance>=threshold?1:0
  return previous===0?(distance>threshold+hysteresis?1:0):(distance<threshold-hysteresis?0:1)
}
export function forestWoodLevel(placement,distance,previous=-1){
 const phase=Math.sin(placement.x*12.9898+placement.z*78.233)*43758.5453,rank=phase-Math.floor(phase),threshold=70+rank*10
 if(previous<0)return distance>=threshold?1:0
 return previous===0?(distance>threshold+2?1:0):(distance<threshold-2?0:1)
}
export function forestCanopyDetailLevel(placement,distance,previous=-1){
 if(canopyLodTest.mode==='full'||canopyLodTest.mode==='legacy')return 0
 const phase=Math.sin(placement.x*12.9898+placement.z*78.233)*43758.5453,rank=phase-Math.floor(phase),hysteresis=8
 const threshold=FOREST.canopyFullDetailStart+hysteresis+rank*(FOREST.canopyFullDetailDistance-FOREST.canopyFullDetailStart-2*hysteresis)
 if(previous<0)return distance>=threshold?1:0
 return previous===0?(distance>threshold+hysteresis?1:0):(distance<threshold-hysteresis?0:1)
}
export function forestLodRange(kind,far=false) {
  if(kind==='foliageContact')return{start:0,end:0,fade:FOLIAGE_WORLD.contactFadeStart,max:FOLIAGE_WORLD.contactDistance}
  if(kind==='foliageCard')return{start:0,end:0,fade:FOLIAGE_PILOT.fadeStart,max:FOLIAGE_PILOT.distance}
  if(kind==='tree')return far?{start:FOREST.treeDetailFadeStart,end:FOREST.treeDetailDistance,fade:FOREST.treeFadeStart,max:FOREST.treeDistance}:{start:0,end:0,fade:FOREST.treeDetailFadeStart,max:FOREST.treeDetailDistance}
  if(kind==='shrub')return far?{start:FOREST.shrubDetailFadeStart,end:FOREST.shrubDistance,fade:FOREST.shrubFarFadeStart,max:FOREST.shrubFarDistance}:{start:0,end:0,fade:FOREST.shrubDetailFadeStart,max:FOREST.shrubDistance}
  const max=kind==='rock'?FOREST.propDistance:FOREST.grassDistance
  return {start:0,end:0,fade:max-9,max}
}
export function forestLodCoverage(distance,range) {
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
  return (range.end?smooth(range.start,range.end,distance):1)*(1-smooth(range.fade,range.max,distance))
}

// Small understory keeps its existing coverage fade. Trees use full silhouettes
// selected by ForestBatch; the distant limit blends into fog without punching
// permanent screen-door holes into trunks and crowns.
export function withForestLod(material,kind,far=false,customRange=null) {
  const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey.bind(material),key=cacheKey()
  const range=customRange||forestLodRange(kind,far)
  material.forestSourceCompile=previous;material.forestSourceKey=key
  material.userData.forestLod=range
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer)
    shader.vertexShader='varying float vForestLodDistance;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      mat4 forestLodWorld=modelMatrix;
      #ifdef USE_BATCHING
        forestLodWorld=forestLodWorld*batchingMatrix;
      #endif
      vForestLodDistance=length((forestLodWorld*vec4(0.0,0.0,0.0,1.0)).xz-cameraPosition.xz);
    `)
    shader.fragmentShader='varying float vForestLodDistance;\n'+shader.fragmentShader
    if(kind==='tree'){
      if(far)shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`
        #include <fog_fragment>
        #ifdef USE_FOG
          gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,smoothstep(${range.fade.toFixed(1)},${range.max.toFixed(1)},vForestLodDistance));
        #endif
      `)
    }else shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
      #include <clipping_planes_fragment>
      // Only transition rings need the pixel test. Most vegetation takes the
      // full-coverage branch; rejected pixels skip textures and lighting.
      if(vForestLodDistance>${range.fade.toFixed(1)}${far?`||vForestLodDistance<${range.end.toFixed(1)}`:''}){
        float forestDither=fract(gl_FragCoord.x*.754877666+gl_FragCoord.y*.569840296);
        ${far?`if(forestDither>=smoothstep(${range.start.toFixed(1)},${range.end.toFixed(1)},vForestLodDistance))discard;`:''}
        if(forestDither<smoothstep(${range.fade.toFixed(1)},${range.max.toFixed(1)},vForestLodDistance))discard;
      }
    `)
  }
  material.customProgramCacheKey=()=>key+`/solid-tree-lod-v2/${kind}/${far}${customRange?'/'+Object.values(range).join(','):''}`
  return material
}
