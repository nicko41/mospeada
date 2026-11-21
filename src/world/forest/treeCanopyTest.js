import {Box3,DoubleSide,Group,InstancedBufferAttribute,InstancedMesh,LinearFilter,Mesh,MeshBasicMaterial,Object3D,PlaneGeometry,SRGBColorSpace,Vector3} from 'three'
import {CANOPY_SPRITES} from './canopySpriteCatalog.js'
import {TREE_CANOPY_TEST} from './treeCanopyTestConfig.js'
import {forestBurial} from './forestPlacement.js'

const canopyNoise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)}
const clusterCache=new WeakMap()
function branchClusters(parts){
 const points=[]
 for(const part of parts){
  const p=part.geometry.attributes.position,used=part.geometry.index?new Set(part.geometry.index.array):null
  for(let i=0;i<p.count;i++)if(!used||used.has(i))points.push(new Vector3().fromBufferAttribute(p,i).applyMatrix4(part.transform))
 }
 const centers=[points.reduce((a,b)=>a.y>b.y?a:b).clone()]
 while(centers.length<TREE_CANOPY_TEST.clusters){let farthest=points[0],distance=-1;for(const p of points){const d=Math.min(...centers.map(c=>c.distanceToSquared(p)));if(d>distance){distance=d;farthest=p}}centers.push(farthest.clone())}
 for(let pass=0;pass<10;pass++){
  const sums=centers.map(()=>new Vector3()),counts=centers.map(()=>0)
  for(const p of points){let id=0,best=Infinity;for(let i=0;i<centers.length;i++){const d=p.distanceToSquared(centers[i]);if(d<best){id=i;best=d}}sums[id].add(p);counts[id]++}
  centers.forEach((c,i)=>{if(counts[i])c.copy(sums[i]).divideScalar(counts[i])})
 }
 return centers.sort((a,b)=>a.y-b.y)
}
function canopyMaterial(atlas,day){
 atlas.colorSpace=SRGBColorSpace;atlas.minFilter=atlas.magFilter=LinearFilter;atlas.generateMipmaps=false;atlas.needsUpdate=true
 const material=new MeshBasicMaterial({map:atlas,side:DoubleSide,alphaTest:TREE_CANOPY_TEST.alphaTest,transparent:false,depthWrite:true,fog:true,toneMapped:false})
 material.name='TEST / original illustrated canopy';material.userData.forest=true
 material.onBeforeCompile=shader=>{
  shader.uniforms.uCanopyDay=day
  shader.vertexShader='attribute vec4 aCanopyUV;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=aCanopyUV.xy+vMapUv*aCanopyUV.zw;')
  shader.fragmentShader='uniform float uCanopyDay;\n'+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight*=mix(.32,1.0,uCanopyDay);\n#include <opaque_fragment>')
 }
 material.customProgramCacheKey=()=> 'forest-canopy-static-illustration-v1'
 return material
}

// One opt-in tree only. Both variants reuse the exact existing bark geometry;
// cards are curved, fixed in 3D and allocated once, never camera billboards.
export function createTreeCanopyTest(asset,placement,atlases,heightAt,variant=0){
 const noise=n=>canopyNoise(n+variant*137.11)
 const root=new Group();root.name='Forest_single_tree_canopy_AB_test'
 const original=new Group(),experimental=new Group(),canopy=new Group();original.name='A_original_tree';experimental.name='B_anime_tree';canopy.name='Static_3D_branch_leaf_groups';experimental.add(canopy);root.add(original,experimental)
 const leaves=asset.parts.filter(p=>/Leaves/.test(p.material.name)),wood=asset.parts.filter(p=>!leaves.includes(p)),leafBounds=new Box3()
 const probe=new Vector3()
 for(const part of leaves){const geometry=part.geometry,p=geometry.attributes.position,index=geometry.index;for(let i=0;i<(index?.count||p.count);i++)leafBounds.expandByPoint(probe.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(part.transform))}
 const materials=new Map(),owned=[],day={value:1}
 function sourceMaterial(source){
  if(!materials.has(source)){const copy=source.clone();copy.onBeforeCompile=source.onBeforeCompile;copy.customProgramCacheKey=source.customProgramCacheKey;copy.color.multiplyScalar(placement.tint??1);materials.set(source,copy);owned.push(copy)}return materials.get(source)
 }
 function addPart(parent,part){const mesh=new Mesh(part.geometry,sourceMaterial(part.material));mesh.name=part.material.name;mesh.matrix.copy(part.transform);mesh.matrixAutoUpdate=false;mesh.userData.forest=true;parent.add(mesh);return mesh}
 for(const part of asset.parts)addPart(original,part)
 const bark=wood.map(part=>addPart(experimental,part)),anchors=clusterCache.get(asset)||branchClusters(leaves),cards=[]
 clusterCache.set(asset,anchors)
 for(const [i,c] of anchors.entries()){
  const yaw=Math.atan2(c.x,c.z)+.25+(noise(i+1)-.5)*1.1
  for(let j=0;j<2;j++)cards.push({sheet:0,sprite:(i*5+j*7+variant*3)%16,position:c.clone().add(new Vector3((noise(i*11+j)-.5)*.35,j?-.12:.1,(noise(i*13+j)-.5)*.35)),yaw:yaw+j*1.19,pitch:j?(.35+noise(i*17+j)*.75)*(i%2?1:-1):(noise(i*17+j)-.5)*.5,roll:(noise(i*7+j)-.5)*.42,height:(j?1.04:1.42)+noise(i*3+j)*.25})
  const radial=new Vector3(c.x,0,c.z).normalize().multiplyScalar(.22)
  cards.push({sheet:1,sprite:(i*7+3+variant*5)%16,position:c.clone().add(radial).add(new Vector3(0,-.3,0)),yaw:yaw-.55,pitch:(noise(i+37)-.5)*.8,roll:(noise(i+51)-.5)*.7,height:.72+noise(i+19)*.3})
 }
 // Oblique layers under and over branch packets preserve depth looking up or
 // down through the canopy, with windows between the unequal clusters.
 for(let i=0;i<anchors.length;i++)cards.push({sheet:1,sprite:[0,6,10,13,15][(i+variant)%5],position:anchors[i].clone().add(new Vector3(.1,-.15,.1)),yaw:noise(i+61)*Math.PI*2,pitch:.8+noise(i+72)*.65,roll:(noise(i+81)-.5)*.6,height:1.04+noise(i+44)*.25})
 const base=new PlaneGeometry(1,1,4,2),p=base.attributes.position
 for(let i=0;i<p.count;i++)p.setZ(i,.28*(1-(p.getX(i)*2)**2)+.12*(1-(p.getY(i)*2)**2)+.025*Math.sin(p.getY(i)*5))
 base.computeVertexNormals();const batches=[],object=new Object3D()
 for(let sheet=0;sheet<2;sheet++){
  const entries=cards.filter(c=>c.sheet===sheet),geometry=base.clone(),uv=new InstancedBufferAttribute(new Float32Array(entries.length*4),4),material=canopyMaterial(atlases[sheet],day)
  geometry.setAttribute('aCanopyUV',uv)
  const batch=new InstancedMesh(geometry,material,entries.length);batch.name=`Anime_canopy_atlas_${sheet+1}`;batch.userData.forest=true
  for(const [i,c] of entries.entries()){
   const sprite=CANOPY_SPRITES.sheets[sheet].entries[c.sprite];object.position.copy(c.position);object.rotation.set(c.pitch,c.yaw,c.roll,'YXZ');object.scale.set(c.height*sprite.aspect,c.height,c.height);object.updateMatrix();batch.setMatrixAt(i,object.matrix);uv.setXYZW(i,...sprite.uv)
  }
  batch.computeBoundingBox();batch.computeBoundingSphere();canopy.add(batch);batches.push(batch);owned.push(material)
 }
 base.dispose()
 const cardBounds=new Box3().setFromObject(canopy),before=cardBounds.getSize(new Vector3()),target=leafBounds.getSize(new Vector3())
 canopy.scale.copy(target.divide(before));canopy.position.copy(leafBounds.min).sub(cardBounds.min.multiply(canopy.scale));canopy.updateMatrixWorld(true)
 const place=(group,x,z)=>{group.position.set(x,heightAt(x,z)-asset.bounds.min.y*placement.scale-forestBurial('tree',asset.bounds,placement.scale),z);group.rotation.set(0,placement.yaw,0);group.scale.setScalar(placement.scale)}
 place(experimental,placement.x,placement.z)
 const setMode=mode=>{original.visible=mode!=='anime';experimental.visible=mode!=='original';place(original,placement.x+(mode==='compare'?TREE_CANOPY_TEST.referenceOffset[0]:0),placement.z+(mode==='compare'?TREE_CANOPY_TEST.referenceOffset[1]:0));root.updateMatrixWorld(true)}
 setMode('compare')
 return {root,original,experimental,canopy,bark,batches,anchors,cards,day,placement,leafBounds,fitScale:canopy.scale.clone(),setMode,stats:{cards:cards.length,atlasDraws:2,cardTriangles:batches.reduce((n,b)=>n+b.count*b.geometry.index.count/3,0)},dispose(){root.removeFromParent();for(const b of batches){b.dispose();b.geometry.dispose()}for(const m of owned)m.dispose()}}
}
