import test from 'node:test'
import assert from 'node:assert/strict'
import {DoubleSide,Group,Mesh,MeshBasicMaterial,PlaneGeometry,Vector3} from 'three'
import {registerRideSurfaces,sampleRideHeight} from './rideSurface.js'

test('height probes match the original world/local calculation after translations, rotation, scale and movement',()=>{
 const geometry=new PlaneGeometry(12,12,8,8).rotateX(-Math.PI/2),positions=geometry.attributes.position
 for(let i=0;i<positions.count;i++)positions.setY(i,Math.sin(positions.getX(i))*.4+Math.cos(positions.getZ(i))*.2)
 geometry.computeBoundingBox();const mesh=new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide})),parent=new Group();parent.add(mesh);mesh.userData.rideSurface=true
 const remove=registerRideSurfaces(parent),p=new Vector3(),world=new Vector3(),ix=geometry.index
 function reference(x,z){
  parent.updateMatrixWorld(true);p.set(x,0,z);mesh.worldToLocal(p);let highest=-Infinity
  for(let i=0;i<ix.count;i+=3){const a=ix.getX(i),b=ix.getX(i+1),c=ix.getX(i+2),ax=positions.getX(a),az=positions.getZ(a),bx=positions.getX(b),bz=positions.getZ(b),cx=positions.getX(c),cz=positions.getZ(c),d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),u=((bz-cz)*(p.x-cx)+(cx-bx)*(p.z-cz))/d,v=((cz-az)*(p.x-cx)+(ax-cx)*(p.z-cz))/d;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)highest=Math.max(highest,mesh.localToWorld(world.set(p.x,u*positions.getY(a)+v*positions.getY(b)+(1-u-v)*positions.getY(c),p.z)).y)}return highest
 }
 try{
  for(const mode of[0,1,2,3]){
   parent.position.set(mode*2,mode*.7,-mode*3);parent.rotation.y=mode>=2?.4:0;mesh.scale.setScalar(mode===3?1.3:1)
   for(let i=0;i<80;i++){const x=parent.position.x+Math.sin(i*1.7)*8,z=parent.position.z+Math.cos(i*2.3)*8,expected=reference(x,z),actual=sampleRideHeight(x,z);if(Number.isFinite(expected))assert.ok(Math.abs(expected-actual)<1e-7);else assert.equal(actual,expected)}
  }
 }finally{remove();geometry.dispose();mesh.material.dispose()}
})
