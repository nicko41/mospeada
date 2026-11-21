import { BatchedMesh, BufferGeometry, Color, Float32BufferAttribute, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Object3D, DoubleSide } from 'three'
import { forestSurfaceHeight } from './forestLayout.js'
import { FOLIAGE_CATALOG } from './foliageCatalog.js'
import { FOLIAGE_PILOT } from './forestFoliageConfig.js'
import { FOREST_DISTANCE_MARGIN,withForestLod } from './forestLod.js'
import {forestInteractionField,plantBendGLSL} from './forestInteraction.js'

export function foliageCardGeometry(entry,reactive=false){
  const width=entry.width/entry.height,[anchorX,anchorY]=entry.anchor,[u0,v0,u1,v1]=entry.uv
  const positions=[],normals=[],uv=[],indices=[],bend=[],segments=reactive?2:1
  for(let side=0;side<2;side++){
    const start=positions.length/3
    if(!reactive){
      for(const [x,y,u,v]of [[-anchorX*width,anchorY-1,u0,v0],[(1-anchorX)*width,anchorY-1,u1,v0],[(1-anchorX)*width,anchorY,u1,v1],[-anchorX*width,anchorY,u0,v1]]){positions.push(side?0:x,y,side?x:0);normals.push(0,1,0);uv.push(u,v)}
      indices.push(start,start+1,start+2,start,start+2,start+3);continue
    }
    for(let row=0;row<=segments;row++)for(const right of [false,true]){
      const t=row/segments,x=((right?1:0)-anchorX)*width,y=anchorY-1+t
      positions.push(side?0:x,y,side?x:0);normals.push(0,1,0);uv.push(right?u1:u0,v0+(v1-v0)*t);bend.push(anchorY,entry.category==='arbustos'?.28:1)
    }
    for(let row=0;row<segments;row++){const a=start+row*2;indices.push(a,a+1,a+3,a,a+3,a+2)}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));if(reactive)geometry.setAttribute('aFoliageBend',new Float32BufferAttribute(bend,2));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry
}

export function foliageCardMaterial(atlas,withDistanceFade=true,reactive=false,lodRange=null){
  const material=new MeshLambertMaterial({map:atlas,side:DoubleSide,alphaTest:FOLIAGE_PILOT.alphaTest,transparent:false,depthWrite:true,fog:true})
  material.name='Forest / original illustrated foliage cards';material.userData.forest=true
  // These are painted leaf groups, not two differently lit sides of a board.
  // Keep the authored up-facing normals on both sides of the crossed cards.
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal*=faceDirection;\n#endif')}
  material.customProgramCacheKey=()=> 'foliage-illustration-up-normal-v2'
  if(reactive){
    material.userData.foliageInteraction=true;const previous=material.onBeforeCompile
    material.onBeforeCompile=shader=>{previous(shader);Object.assign(shader.uniforms,forestInteractionField().uniforms);shader.vertexShader=plantBendGLSL+'attribute vec2 aFoliageBend;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      mat4 plantWorld=modelMatrix;
      #ifdef USE_BATCHING
        plantWorld=plantWorld*batchingMatrix;
      #endif
      bendForestPlant(transformed,plantWorld,aFoliageBend.x,aFoliageBend.y);
    `)}
    material.customProgramCacheKey=()=> 'foliage-illustration-up-normal-bend-v4'
  }
  return withDistanceFade?withForestLod(material,'foliageCard',false,lodRange):material
}

export class ForestSpriteBatch extends BatchedMesh {
  constructor(placements,material,heightAt=forestSurfaceHeight){
    const reactive=!!material.userData.foliageInteraction
    super(placements.length,FOLIAGE_CATALOG.entries.length*(reactive?12:8),FOLIAGE_CATALOG.entries.length*(reactive?24:12),material)
    const ids=new Map()
    for(const entry of FOLIAGE_CATALOG.entries){const g=foliageCardGeometry(entry,reactive);if(reactive){g.boundingBox.expandByScalar(1);g.boundingSphere.radius+=1}ids.set(entry.id,this.addGeometry(g));g.dispose()}
    const object=new Object3D(),color=new Color()
    for(const p of placements){const id=this.addInstance(ids.get(p.sprite));object.position.set(p.x,p.y??heightAt(p.x,p.z)-.025,p.z);if(p.quaternion)object.quaternion.fromArray(p.quaternion);else object.rotation.set(p.tiltX||0,p.yaw,p.tiltZ||0);object.scale.set(p.scale*(p.mirror?-1:1),p.scale,p.scale);object.updateMatrix();this.setMatrixAt(id,object.matrix);this.setColorAt(id,color.setScalar(p.tint))}
    this.placements=placements;this.distance=FOLIAGE_PILOT.distance;this.minimum=0;this.cellX=this.cellZ=Infinity
    this.name='Forest_illustrated_foliage_pilot';this.userData={forest:true,forestKind:'foliageCard'};this.sortObjects=false;this.perObjectFrustumCulled=true;this.computeBoundingBox();this.computeBoundingSphere()
  }
  updateDistance(camera){
    const cx=Math.floor(camera.position.x/4),cz=Math.floor(camera.position.z/4);if(cx===this.cellX&&cz===this.cellZ)return;this.cellX=cx;this.cellZ=cz
    for(let id=0;id<this.placements.length;id++){const p=this.placements[id];this.setVisibleAt(id,Math.hypot(p.x-(cx*4+2),p.z-(cz*4+2))<this.distance+FOREST_DISTANCE_MARGIN)}
  }
}

export function foliageContactMaterial(kind='foliageCard'){
  const material=new MeshBasicMaterial({color:'#1d382b',transparent:true,opacity:.14,depthWrite:false,fog:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})
  material.name='Forest / subtle foliage contact';material.userData.forest=true
  material.onBeforeCompile=shader=>{shader.vertexShader='varying vec2 vFoliageContact;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFoliageContact=uv;');shader.fragmentShader='varying vec2 vFoliageContact;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\ndiffuseColor.a*=1.0-smoothstep(.1,.5,length(vFoliageContact-.5));')}
  material.customProgramCacheKey=()=> 'foliage-soft-contact-v1';withForestLod(material,kind)
  return material
}
export function foliageContactShadows(placements,kind='foliageCard',sharedMaterial=null){
  const material=sharedMaterial||foliageContactMaterial(kind)
  const batch=new BatchedMesh(placements.length,placements.length*9,placements.length*24,material),matrix=new Matrix4()
  for(const p of placements){const entry=FOLIAGE_CATALOG.entries.find(e=>e.id===p.sprite),radius=Math.min(.72,p.height*entry.width/entry.height*.32),ground=forestSurfaceHeight(p.x,p.z),positions=[],uv=[],indices=[]
    for(let y=0;y<3;y++)for(let x=0;x<3;x++){const dx=(x-1)*radius,dz=(y-1)*radius;positions.push(dx,forestSurfaceHeight(p.x+dx,p.z+dz)-ground,dz);uv.push(x/2,y/2)}
    for(let y=0;y<2;y++)for(let x=0;x<2;x++){const a=y*3+x;indices.push(a,a+3,a+1,a+1,a+3,a+4)}
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices)
    const id=batch.addInstance(batch.addGeometry(g));batch.setMatrixAt(id,matrix.makeTranslation(p.x,ground+.012,p.z));g.dispose()
  }
  batch.name='Forest_foliage_contact_shadows';batch.userData={forest:true};batch.placements=placements;batch.distance=FOLIAGE_PILOT.distance;batch.minimum=0;batch.cellX=batch.cellZ=Infinity;batch.updateDistance=ForestSpriteBatch.prototype.updateDistance;batch.sortObjects=false;batch.computeBoundingBox();batch.computeBoundingSphere();return batch
}
