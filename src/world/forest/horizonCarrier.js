import {Box3,BufferGeometry,Euler,Float32BufferAttribute,Group,LOD,Matrix4,Mesh,Vector3} from 'three'
import {stage4DesertHeight} from './forestStage4Config.js'

export const HORIZON_CARRIER=Object.freeze({
 model:'/delivery/horizon-t.glb',
 x:1050,depth:4700,length:920,burial:55,
 pitch:-.025,yaw:-.52,roll:.085,farLod:2400,
 drifts:Object.freeze([
  {x:-270,z:180,rx:210,rz:175,height:16},
  {x:245,z:-150,rx:185,rz:220,height:12},
  {x:-100,z:-340,rx:210,rz:165,height:14},
 ]),
})

export function horizonCarrierPlacement(model){
 const c=HORIZON_CARRIER,source=new Box3().setFromObject(model),center=source.getCenter(new Vector3()),size=source.getSize(new Vector3()),scale=c.length/size.z
 const matrix=new Matrix4().makeRotationFromEuler(new Euler(c.pitch,c.yaw,c.roll,'YXZ')).scale(new Vector3(scale,scale,scale)).multiply(new Matrix4().makeTranslation(-center.x,-center.y,-center.z))
 const relative=source.clone().applyMatrix4(matrix),ground=stage4DesertHeight(c.x,-c.depth)
 matrix.elements[12]+=c.x;matrix.elements[13]+=ground-relative.min.y-c.burial;matrix.elements[14]-=c.depth
 const bounds=source.clone().applyMatrix4(matrix)
 return{matrix,bounds,ground,scale,size:bounds.getSize(new Vector3()),sourceSize:size}
}

export function horizonDesertMaterial(source,ground){
 const material=source.clone();material.name='Horizon-T / abandoned desert hull'
 material.roughness=Math.max(.92,source.roughness);material.metalness=Math.min(.16,source.metalness);material.normalScale?.multiplyScalar(.55)
 material.userData.animeSurfaceShine=.15
 material.onBeforeCompile=shader=>{
  shader.uniforms.uCarrierGround=ground
  shader.vertexShader='varying vec3 vCarrierWorld;\nvarying float vCarrierUp;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vCarrierWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
   vCarrierUp=clamp(normalize(mat3(modelMatrix)*objectNormal).y,0.0,1.0);`)
  shader.fragmentShader=`uniform float uCarrierGround;
   varying vec3 vCarrierWorld;varying float vCarrierUp;
   float carrierHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float carrierNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(carrierHash(i),carrierHash(i+vec2(1,0)),f.x),mix(carrierHash(i+vec2(0,1)),carrierHash(i+vec2(1)),f.x),f.y);}
  `+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 carrierPoint=vCarrierWorld;
   float carrierBroad=carrierNoise(carrierPoint.xz*vec2(.024,.017));
   float carrierStreaks=carrierNoise(vec2(carrierPoint.x*.12+carrierPoint.y*.03,carrierPoint.z*.008));
   float carrierFine=carrierNoise(carrierPoint.xz*.19+carrierPoint.y*.06);
   float carrierHeight=carrierPoint.y-uCarrierGround;
   float carrierLower=1.0-smoothstep(18.0,118.0,carrierHeight+(carrierBroad-.5)*25.0);
   float carrierSand=clamp(carrierLower*(.68+.28*carrierStreaks)+vCarrierUp*(.18+.28*carrierBroad),0.0,.97);
   float carrierLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(carrierLuma)*vec3(1.08,1.0,.84),.40+.22*vCarrierUp);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.31,.21),(.13+.23*carrierBroad)*vCarrierUp);
   float carrierScars=smoothstep(.42,.74,carrierBroad)*(1.0-vCarrierUp*.45);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.075,.055,.033),carrierScars*.62);
   float carrierErosion=smoothstep(.68,.87,carrierFine)*(.2+.55*(1.0-vCarrierUp));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.19,.17,.125),carrierErosion*.36);
   vec3 carrierSandColor=mix(vec3(.25,.17,.09),vec3(.49,.34,.19),carrierStreaks);
   diffuseColor.rgb=mix(diffuseColor.rgb,carrierSandColor,carrierSand);
  `)
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.87+carrierSand*.12);')
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=1.0-carrierSand*.94;')
 }
 material.customProgramCacheKey=()=> 'horizon-desert-static-sand-sun-erosion-v2'
 return material
}

function sandDrift(drift,material){
 const c=HORIZON_CARRIER,positions=[],uv=[],indices=[],nx=20,nz=16
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const u=i/nx*2-1,v=j/nz*2-1,x=c.x+drift.x+u*drift.rx,z=-c.depth+drift.z+v*drift.rz,r2=u*u+v*v
  const mound=Math.max(0,1-r2)**2*drift.height*(1+.08*Math.sin(u*5+v*3))
  positions.push(x,stage4DesertHeight(x,z)+mound-.12,z);uv.push(x/12,-z/6)
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1)}
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere()
 const mesh=new Mesh(geometry,material);mesh.name='HorizonT_windblown_sand_bank';mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.userData.forest=true;return mesh
}

export function createHorizonCarrier(scene,desertMaterial){
 const near=scene.getObjectByName('HorizonT_LOD0'),far=scene.getObjectByName('HorizonT_LOD1')
 if(!near?.isMesh||!far?.isMesh)throw Error('Horizon-T landmark requires its two static LOD meshes')
 const root=new Group();root.name='Desert_abandoned_Horizon_T';root.visible=false;root.userData.horizonLandmark=true
 const placement=horizonCarrierPlacement(near),ground={value:placement.ground},material=horizonDesertMaterial(near.material,ground),lod=new LOD()
 lod.name='HorizonT_static_distance_LOD';lod.autoUpdate=false;lod.matrix.copy(placement.matrix);lod.matrixAutoUpdate=false
 for(const[source,distance]of [[near,0],[far,HORIZON_CARRIER.farLod]]){
  const mesh=source.clone();mesh.material=material;mesh.castShadow=false;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.userData.horizonLandmark=true
  // Set dressing only: never registered as collision, ride surface or target.
  mesh.raycast=()=>{};lod.addLevel(mesh,distance,.12)
 }
 const drifts=HORIZON_CARRIER.drifts.map(d=>sandDrift(d,desertMaterial));root.add(lod,...drifts)
 return{root,lod,placement,material,ground,dispose(){root.removeFromParent();material.dispose();for(const d of drifts)d.geometry.dispose()}}
}
