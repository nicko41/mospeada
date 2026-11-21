import { FOREST } from './forestConfig.js'
import { FOLIAGE_PILOT } from './forestFoliageConfig.js'
import { FOLIAGE_WORLD } from './forestFoliageWorldConfig.js'

export const FOREST_DISTANCE_MARGIN=3 // Half diagonal of a 4 m update cell, rounded up.
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

// Complementary screen-door coverage in the overlap. No transparent sorting,
// per-frame matrices or camera-driven React updates. Both levels stay resident.
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
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
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
  material.customProgramCacheKey=()=>key+`/smooth-lod-v1/${kind}/${far}${customRange?'/'+Object.values(range).join(','):''}`
  return material
}
