import { Box3, BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Sphere, Vector3 } from 'three'
import { foliageCardMaterial,foliageContactShadows } from './forestFoliageLibrary.js'
import { FOLIAGE_WORLD } from './forestFoliageWorldConfig.js'
import {forestInteractionField,plantBendGLSL} from './forestInteraction.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'

const templates=new Map()
function template(lod){
  if(templates.has(lod))return templates.get(lod)
  const positions=[],normals=[],uv=[],index=[]
  const segments=lod==='near'?2:1
  for(let side=0;side<(lod==='near'?2:1);side++){const first=positions.length/3;for(let row=0;row<=segments;row++)for(const x of [-.5,.5]){positions.push(side?0:x,row/segments,side?x:0);normals.push(0,1,0);uv.push(x+.5,row/segments)}for(let row=0;row<segments;row++){const a=first+row*2;index.push(a,a+1,a+3,a,a+3,a+2)}}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(index);templates.set(lod,geometry);return geometry
}
export function worldFoliageMaterial(atlas,lod,density){
  const material=foliageCardMaterial(atlas,false),previous=material.onBeforeCompile
  material.name=`Forest / shared foliage ${lod}`
  material.onBeforeCompile=(shader,renderer)=>{
    previous(shader,renderer);shader.uniforms.uFoliageDensity=density;Object.assign(shader.uniforms,forestInteractionField().uniforms)
    shader.vertexShader=plantBendGLSL+`attribute vec4 aFoliageRect,aFoliageForm,aFoliageFade;uniform float uFoliageDensity;varying vec3 vFoliageCoverage;\n`+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`
      #include <uv_vertex>
      vMapUv=mix(aFoliageRect.xy,aFoliageRect.zw,vec2(aFoliageForm.w>.5?1.0-uv.x:uv.x,uv.y));
    `)
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vec3 foliageRoot=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
      float foliageDistance=length(foliageRoot.xz-cameraPosition.xz);
      vFoliageCoverage=vec3(smoothstep(${FOLIAGE_WORLD.nearFadeStart.toFixed(1)},${FOLIAGE_WORLD.nearFadeEnd.toFixed(1)},foliageDistance),smoothstep(aFoliageFade.x,aFoliageFade.y,foliageDistance),smoothstep(aFoliageFade.z-.018,aFoliageFade.z+.018,uFoliageDensity));
      float foliageX=(position.x+.5-aFoliageForm.y)*aFoliageForm.x;
      ${lod==='near'?`transformed=abs(position.z)>.1?vec3(0.0,position.y+aFoliageForm.z-1.0,(position.z+.5-aFoliageForm.y)*aFoliageForm.x):vec3(foliageX,position.y+aFoliageForm.z-1.0,0.0);`:`
      vec2 foliageView=cameraPosition.xz-foliageRoot.xz;
      vec2 foliageLocal=vec2(dot(foliageView,instanceMatrix[0].xz),dot(foliageView,instanceMatrix[2].xz));
      vec3 foliageRight=normalize(vec3(foliageLocal.y,0.0,-foliageLocal.x)+vec3(.00001,0.0,.00001));
      transformed=foliageRight*foliageX+vec3(0.0,position.y+aFoliageForm.z-1.0,0.0);`}
      bool foliageShrub=${FOLIAGE_CATALOG.entries.map((e,i)=>e.category==='arbustos'?`abs(aFoliageFade.w-${i.toFixed(1)})<.25`:null).filter(Boolean).join('||')};
      bendForestPlant(transformed,modelMatrix*instanceMatrix,aFoliageForm.z,foliageShrub?.28:1.0);
    `)
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      #include <project_vertex>
      if(vFoliageCoverage.y>=1.0||vFoliageCoverage.z<=0.0||${lod==='near'?'vFoliageCoverage.x>=1.0':'vFoliageCoverage.x<=0.0'})gl_Position=vec4(2.0,2.0,2.0,1.0);
    `)
    shader.fragmentShader='varying vec3 vFoliageCoverage;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
      #include <clipping_planes_fragment>
      float foliageDither=fract(gl_FragCoord.x*.754877666+gl_FragCoord.y*.569840296);
      if(${lod==='near'?'foliageDither<vFoliageCoverage.x':'foliageDither>=vFoliageCoverage.x'}||foliageDither<vFoliageCoverage.y||foliageDither>vFoliageCoverage.z)discard;
    `)
  }
  material.customProgramCacheKey=()=>`world-foliage-bend-v3/${lod}`
  return material
}

export function worldFoliageSector(data,materials){
  const attributes={aFoliageRect:new InstancedBufferAttribute(data.rects,4),aFoliageForm:new InstancedBufferAttribute(data.forms,4),aFoliageFade:new InstancedBufferAttribute(data.fades,4)}
  const matrices=new InstancedBufferAttribute(data.matrices,16),colours=new InstancedBufferAttribute(data.colours,3)
  const box=new Box3(new Vector3(...data.bounds.slice(0,3)),new Vector3(...data.bounds.slice(3)));let maxHeight=0;for(let i=0;i<data.count;i++)maxHeight=Math.max(maxHeight,data.matrices[i*16+5]);box.expandByScalar(maxHeight);const sphere=box.getBoundingSphere(new Sphere())
  const meshes={}
  for(const lod of ['near','far']){
    const base=template(lod),geometry=new BufferGeometry();geometry.index=base.index;for(const [name,a]of Object.entries(base.attributes))geometry.setAttribute(name,a);for(const [name,a]of Object.entries(attributes))geometry.setAttribute(name,a)
    const mesh=new InstancedMesh(geometry,materials[lod],0);mesh.count=data.count;mesh.instanceMatrix=matrices;mesh.instanceColor=colours;mesh.position.set(data.x,0,data.z);mesh.boundingBox=box.clone();mesh.boundingSphere=sphere.clone();mesh.name=`Forest_world_foliage_${lod}_${data.id}`;mesh.userData={forest:true,foliageSector:data.id,foliageLod:lod};mesh.castShadow=false;mesh.receiveShadow=true;mesh.renderOrder=1;meshes[lod]=mesh
  }
  // Same immutable buffers are used by both levels. Only 2 geometry templates,
  // 2 materials and 1 atlas serve the entire forest; no per-plant draw calls.
  const shadows=data.contacts.length?foliageContactShadows(data.contacts,'foliageContact',materials.contact):null
  if(shadows){shadows.distance=FOLIAGE_WORLD.contactDistance;shadows.name=`Forest_world_foliage_contact_${data.id}`;shadows.renderOrder=2}
  return{data,...meshes,shadows,worldBox:box.clone().translate(new Vector3(data.x,0,data.z)),gpuBytes:data.matrices.byteLength+data.colours.byteLength+data.rects.byteLength+data.forms.byteLength+data.fades.byteLength}
}
