import {DynamicDrawUsage,InstancedBufferAttribute} from 'three'

// Only runtime copies receive the death attributes/material. Original GLB
// geometry, maps and the approved surviving-hit appearance stay unchanged.
export function createScoutDeathGeometry(source,capacity){
  const geometry=source.clone(),values=new Float32Array(capacity*2)
  for(let i=0;i<capacity;i++)values[i*2+1]=1
  geometry.setAttribute('aScoutDeath',new InstancedBufferAttribute(values,2).setUsage(DynamicDrawUsage))
  return geometry
}
export function createScoutDeathMaterial(source){
  const material=source.clone(),compile=source.onBeforeCompile,key=source.customProgramCacheKey()
  material.name='Scout runtime / internal rupture'
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer)
    shader.vertexShader='attribute vec2 aScoutDeath;varying vec2 vScoutDeath;varying vec3 vScoutSurface;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvScoutDeath=aScoutDeath;vScoutSurface=position;')
    shader.fragmentShader='varying vec2 vScoutDeath;varying vec3 vScoutSurface;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      if(vScoutDeath.y<.999){
        vec3 cell=floor(vScoutSurface*115.0);
        float breakup=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
        if(breakup>vScoutDeath.y)discard;
        diffuseColor.rgb*=mix(.12,1.0,vScoutDeath.y);
      }
      totalEmissiveRadiance+=vec3(1.0,.86,.38)*vScoutDeath.x;
    `)
  }
  material.customProgramCacheKey=()=>`${key}|scout-internal-rupture-v1`
  return material
}
