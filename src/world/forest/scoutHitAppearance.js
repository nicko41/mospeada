import {DynamicDrawUsage,InstancedBufferAttribute,Vector4} from 'three'

export const SCOUT_SCORCH_SLOTS=4
export function scoutHitUniforms(capacity){return {uScoutHitPoint:{value:Array.from({length:capacity*SCOUT_SCORCH_SLOTS},()=>new Vector4(0,0,0,0))},uScoutHitNormal:{value:Array.from({length:capacity*SCOUT_SCORCH_SLOTS},()=>new Vector4(0,0,1,0))}}}
export function scoutHitGeometry(geometry,capacity){geometry.setAttribute('aScoutHitId',new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage));return geometry}
export function patchScoutHitMaterial(material,uniforms,capacity){
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey()
 material.onBeforeCompile=(shader,renderer)=>{
  compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms)
  shader.vertexShader='attribute float aScoutHitId;varying float vScoutHitId;varying vec3 vScoutHitNormal;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvScoutHitId=aScoutHitId;vScoutHitNormal=normal;')
  shader.fragmentShader=`varying float vScoutHitId;varying vec3 vScoutHitNormal;uniform vec4 uScoutHitPoint[${capacity*SCOUT_SCORCH_SLOTS}],uScoutHitNormal[${capacity*SCOUT_SCORCH_SLOTS}];\n`+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    for(int mark=0;mark<${SCOUT_SCORCH_SLOTS};mark++){
      int slot=int(vScoutHitId)*${SCOUT_SCORCH_SLOTS}+mark;
      float radius=uScoutHitPoint[slot].w;
      if(radius>.00001){
        vec3 delta=vScoutSurface-uScoutHitPoint[slot].xyz;
        vec3 hitNormal=uScoutHitNormal[slot].xyz;
        float depth=dot(delta,hitNormal);
        float distanceToHit=length(delta-hitNormal*depth);
        float facing=smoothstep(.05,.65,dot(normalize(vScoutHitNormal),hitNormal));
        float surface=(1.0-smoothstep(radius*.18,radius*.5,abs(depth)))*facing;
        float edge=radius*(.92+.08*sin(delta.x*370.0+sin(delta.y*280.0)));
        float scorch=(1.0-smoothstep(edge*.25,edge,distanceToHit))*surface;
        diffuseColor.rgb*=mix(1.0,.13,scorch);
        float heatRadius=radius*4.6;
        float heat=(1.0-smoothstep(heatRadius*.08,heatRadius,distanceToHit))*(1.0-smoothstep(radius*.5,heatRadius*.65,abs(depth)))*facing*uScoutHitNormal[slot].w;
        vec3 heatColor=mix(vec3(1.0,.055,.018),vec3(1.0,.88,.32),smoothstep(0.0,heatRadius*.48,distanceToHit));
        float hotCenter=1.0-smoothstep(heatRadius*.03,heatRadius*.24,distanceToHit);
        diffuseColor.rgb*=1.0-hotCenter*min(.92,heat*.92);
        totalEmissiveRadiance+=heatColor*heat*mix(2.2,3.6,1.0-hotCenter);
      }
    }
  `)
 }
 material.customProgramCacheKey=()=>key+`/scout-local-gallant-hits-v2/${capacity}`
 return material
}
