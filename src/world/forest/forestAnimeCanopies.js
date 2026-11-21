import {BufferGeometry,DoubleSide,Float32BufferAttribute,LinearFilter,Matrix3,Matrix4,MeshBasicMaterial,SRGBColorSpace,Vector2,Vector3} from 'three'
import {createTreeCanopyTest} from './treeCanopyTest.js'
import {forestAtlasDay} from './forestImpostors.js'
import {withForestLod} from './forestLod.js'
import {FOREST_CANOPY_VARIANTS} from './forestCanopyVariants.js'
import {patchCanopyTone} from './forestCanopyTone.js'

function sharedMaterial(atlas,sheet){
 atlas.colorSpace=SRGBColorSpace;atlas.minFilter=atlas.magFilter=LinearFilter;atlas.generateMipmaps=false;atlas.needsUpdate=true
 const material=new MeshBasicMaterial({map:atlas,side:DoubleSide,alphaTest:.55,transparent:false,depthWrite:true,fog:true,toneMapped:false})
 material.name=`Forest / Leaves anime atlas ${sheet+1}`;material.userData.forest=true;material.userData.animeCanopy=true
 material.onBeforeCompile=shader=>{patchCanopyTone(shader);shader.uniforms.uCanopyDay=forestAtlasDay;shader.fragmentShader='uniform float uCanopyDay;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight*=mix(.32,1.0,uCanopyDay);\n#include <opaque_fragment>')}
 material.customProgramCacheKey=()=> 'forest-anime-canopy-moss-v4'
 return withForestLod(material,'tree')
}
function highDetail(full){
 // Same 48 packets, sprite UVs and poses. Keep the original curve endpoints
 // and midpoints, reducing only its tessellation (16 to 8 triangles per card).
 const geometry=new BufferGeometry(),attributes={position:[],normal:[],uv:[]},indices=[],cards=full.attributes.position.count/15
 for(let card=0;card<cards;card++){
  for(const row of [0,1,2])for(const col of [0,2,4])for(const [name,out]of Object.entries(attributes)){const a=full.attributes[name],index=card*15+row*5+col;for(let c=0;c<a.itemSize;c++)out.push(a.array[index*a.itemSize+c])}
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){const a=card*9+row*3+col,b=a+3;indices.push(a,b,a+1,b,b+1,a+1)}
 }
 for(const [name,values]of Object.entries(attributes))geometry.setAttribute(name,new Float32BufferAttribute(values,name==='uv'?2:3))
 geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.forestRecipeKey=full.userData.forestRecipeKey+'/high';return geometry
}
function mergePacket(batch,fit){
 const source=batch.geometry,p=source.attributes.position,n=source.attributes.normal,uv=source.attributes.uv,rects=source.attributes.aCanopyUV,positions=[],normals=[],coords=[],indices=[],matrix=new Matrix4(),normal=new Matrix3(),point=new Vector3(),direction=new Vector3(),tex=new Vector2()
 for(let i=0;i<batch.count;i++){
  batch.getMatrixAt(i,matrix);matrix.premultiply(fit);normal.getNormalMatrix(matrix)
  const offset=positions.length/3
  for(let v=0;v<p.count;v++){
   point.fromBufferAttribute(p,v).applyMatrix4(matrix);positions.push(point.x,point.y,point.z)
   direction.fromBufferAttribute(n,v).applyMatrix3(normal).normalize();normals.push(direction.x,direction.y,direction.z)
   tex.fromBufferAttribute(uv,v);coords.push(rects.getX(i)+tex.x*rects.getZ(i),rects.getY(i)+tex.y*rects.getW(i))
  }
  for(let j=0;j<source.index.count;j++)indices.push(offset+source.index.getX(j))
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new Float32BufferAttribute(coords,2));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry
}

// Four existing species × five prepared crown recipes. Every region consumes
// the same parts through ForestBatch; no per-tree materials, managers or cards.
export function createAnimeForestAssets(originalAssets,atlases){
 const materials=atlases.map(sharedMaterial),geometries=[]
 const assets=originalAssets.map(asset=>{
  if(asset.kind!=='tree')return asset
  const variants=[[],[]]
  for(let variant=0;variant<FOREST_CANOPY_VARIANTS;variant++){
   const recipe=createTreeCanopyTest(asset,{x:0,z:0,scale:1,yaw:0,tint:1},atlases,()=>0,variant)
   recipe.canopy.updateMatrix()
   recipe.batches.forEach((batch,sheet)=>{const geometry=mergePacket(batch,recipe.canopy.matrix);geometry.userData.forestRecipeKey=`anime-canopy-v1/${asset.name}/${sheet}/${variant}`;geometries.push(geometry);variants[sheet].push(geometry)})
   recipe.dispose()
  }
  const wood=asset.parts.filter(p=>!/Leaves/.test(p.material.name)).map(p=>({...p,canopyRole:'wood'})),canopy=variants.map((v,sheet)=>{const highVariants=v.map(g=>{const high=highDetail(g);geometries.push(high);return high});return {geometry:v[0],variants:v,highVariants,material:materials[sheet],transform:new Matrix4(),preserveIllustration:true,animeCanopyTint:true,canopyRole:'canopy'}})
  return {...asset,parts:[...wood,...canopy],originalParts:asset.parts,canopyVariants:FOREST_CANOPY_VARIANTS}
 })
 return {assets,materials,geometries,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
