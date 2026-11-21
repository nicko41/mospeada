import {BatchedMesh,CatmullRomCurve3,Color,Group,Matrix4,Mesh,MeshLambertMaterial,Object3D,TubeGeometry,Vector3} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {canyonFloor,canyonWallPoint,riverObstacles,riverSection} from './forestCanyon.js'
import {stage2Layout} from './forestStage2Layout.js'
import {stage2LipZ,stage2PathX} from './forestStage2Config.js'
import {forestMaterialPalette} from './forestPalette.js'

export function createCanyonDressing(assets,heightAt){
  const group=new Group(),owned=[],materials=[],batches=[],placements=[]
  for(const back of [false,true])for(let i=0;i<27;i++){const x=-228+i*17.5+Math.sin(i*7.1)*5,t=.24+.57*(.5+.5*Math.sin(i*3.7)),p=canyonWallPoint(x,t,back,heightAt);p.z-=(back?1:-1)*.5;placements.push({p,scale:1.5+(i%4)*.45,yaw:i*2.37,tilt:Math.sin(i)*.45})}
  for(let i=0;i<24;i++){const x=-235+i*20,r=riverSection(x),z=r.z+(i%2?1:-1)*(r.halfWidth+1.5+Math.sin(i)*2.5);placements.push({p:new Vector3(x,canyonFloor(x,z)-.2,z),scale:.9+(i%3)*.38,yaw:i*2.3,tilt:0})}
  for(const r of riverObstacles)placements.push({p:new Vector3(r.x,r.y-r.radius*.6,r.z),scale:r.radius*1.3,yaw:r.x*.73,tilt:.2})
  const rocks=assets.filter(a=>a.kind==='rock'),object=new Object3D(),matrix=new Matrix4(),tint=new Color()
  for(const [n,asset]of rocks.entries())for(const part of asset.parts){
    const selected=placements.filter((_,i)=>i%rocks.length===n),material=part.material.clone();material.onBeforeCompile=part.material.forestSourceCompile;material.customProgramCacheKey=()=>part.material.forestSourceKey+'/canyon-embedded';materials.push(material)
    const batch=new BatchedMesh(selected.length,part.geometry.attributes.position.count,part.geometry.index.count,material),id=batch.addGeometry(part.geometry)
    for(const [i,p]of selected.entries()){const instance=batch.addInstance(id);object.position.copy(p.p);object.position.y-=asset.bounds.min.y*p.scale;object.rotation.set(p.tilt,p.yaw,Math.sin(i)*.17);object.scale.set(p.scale*(.8+(i%3)*.13),p.scale,p.scale);object.updateMatrix();batch.setMatrixAt(instance,matrix.multiplyMatrices(object.matrix,part.transform));batch.setColorAt(instance,tint.setScalar(.9+(i%4)*.035))}
    batch.sortObjects=false;batch.perObjectFrustumCulled=true;batch.computeBoundingBox();batch.computeBoundingSphere();batch.name='Forest_canyon_embedded_rocks_'+asset.name;batch.userData.forest=true;group.add(batch);batches.push(batch)
  }
  const roots=[]
  for(const back of [false,true]){
    const trees=stage2Layout.trees.filter(p=>Math.abs(p.z-stage2LipZ(p.x,back))<14&&Math.abs(p.x-stage2PathX(-800))>12).sort((a,b)=>a.x-b.x)
    const selected=trees.filter((_,i)=>i%Math.max(1,Math.ceil(trees.length/8))===0).slice(0,8)
    for(const [i,tree]of selected.entries())for(let branch=0;branch<3;branch++){
      const p=canyonWallPoint(tree.x+(branch-1)*.5,0,back,heightAt),direction=back?1:-1,dx=Math.sin(i*2.1+branch)*1.5,length=2.4+(i%3)*.65+branch*.3
      const curve=new CatmullRomCurve3([p.clone().add(new Vector3(0,-.03,0)),p.clone().add(new Vector3(dx*.3,-.8,direction*.65)),p.clone().add(new Vector3(dx,-length*.65,direction*1.2)),p.clone().add(new Vector3(dx*1.2,-length,direction*.6))])
      roots.push(new TubeGeometry(curve,7,.09+(branch===1?.07:0),5,false))
    }
  }
  if(roots.length){const geometry=mergeGeometries(roots),material=new MeshLambertMaterial({color:forestMaterialPalette('tree',true).mid,fog:true,name:'Forest canyon / exposed roots',userData:{forest:true}}),mesh=new Mesh(geometry,material);roots.forEach(g=>g.dispose());mesh.name='Forest_canyon_exposed_roots';mesh.userData.forest=true;group.add(mesh);owned.push(geometry);materials.push(material)}
  group.name='Forest_canyon_geological_dressing';group.userData.forest=true
  return {group,placements,dispose(){batches.forEach(b=>b.dispose());owned.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
