import { BatchedMesh,Box3,BufferGeometry,Color,Float32BufferAttribute,Group,Matrix4,Mesh,MeshLambertMaterial,Object3D,Quaternion,Vector3 } from 'three'
import { boxCollider,cylinderCollider } from '../../player/collisionWorld.js'
import { CRASH_TREE,CRASH_BROKEN_BASES,crashTrackCenter,crashTrackWidth } from './forestCrashSite.js'
import { FOREST_CRASH } from './forestCrashConfig.js'
import { forestSurfaceHeight } from './forestLayout.js'
import { FOLIAGE_CATALOG } from './foliageCatalog.js'
import { foliageCardGeometry,foliageCardMaterial } from './forestFoliageLibrary.js'

export function crashWorld(x,z){const c=Math.cos(FOREST_CRASH.yaw),s=Math.sin(FOREST_CRASH.yaw);return{x:FOREST_CRASH.x+c*x+s*z,z:FOREST_CRASH.z-s*x+c*z}}

function brokenStump(t=CRASH_TREE){
  const vertices=[],uv=[],colours=[],indices=[],n=14,ground=forestSurfaceHeight(t.x,t.z),wood=new Color(),radius=t===CRASH_TREE ? .67 : .43
  const ring=[]
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2,r=radius*(1+.1*Math.sin(i*2.7)),dx=Math.cos(a)*r,dz=Math.sin(a)*r,top=t.stumpHeight+.18*Math.sin(i*2.3)+.08*Math.cos(i*1.1)
    ring.push({dx,dz,top})
    vertices.push(dx*1.22,forestSurfaceHeight(t.x+dx*1.22,t.z+dz*1.22)-ground-.06,dz*1.22,dx,top,dz)
    uv.push(i/n,0,i/n,1);wood.set('#263c30').toArray(colours,i*6);wood.set('#4d5940').toArray(colours,i*6+3)
  }
  for(let i=0;i<n;i++){const a=i*2,b=((i+1)%n)*2;indices.push(a,b,a+1,b,b+1,a+1)}
  // Separate cap vertices retain a rough, pale broken interior against bark.
  const first=vertices.length/3;vertices.push(0,t.stumpHeight-.13,0);uv.push(.5,.5);new Color('#69664b').toArray(colours,first*3)
  for(let i=0;i<n;i++){const p=ring[i];vertices.push(p.dx,p.top,p.dz);uv.push(p.dx/radius*.5+.5,p.dz/radius*.5+.5);new Color(i%3?'#898064':'#ada080').toArray(colours,(first+1+i)*3)}
  for(let i=0;i<n;i++)indices.push(first,first+1+(i+1)%n,first+1+i)
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setAttribute('color',new Float32BufferAttribute(colours,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere()
  const material=new MeshLambertMaterial({vertexColors:true}),mesh=new Mesh(g,material);mesh.position.set(t.x,ground,t.z);mesh.name='Forest_crash_broken_stump';mesh.castShadow=mesh.receiveShadow=true;mesh.userData.forest=true
  return mesh
}

export function createCrashTree(asset){
  // Left across the supplied approach view, with the crown ahead of the broken
  // base and clear of the aircraft. Not "left" relative to a movable camera.
  const t=CRASH_TREE,ground=forestSurfaceHeight(t.x,t.z),group=new Group(),up=new Vector3(0,1,0),direction=new Vector3(...t.fallDirection).normalize(),cut=asset.bounds.min.y+t.stumpHeight/t.scale,owned=[]
  // Keep the struck stump in place; the displaced fallen section now occupies
  // the middle of the scrape instead of stretching past the aircraft's nose.
  const fallenScale=t.fallenScale,x=t.x+t.fallOffset[0],z=t.z+t.fallOffset[1],start=new Vector3(x,forestSurfaceHeight(x,z)+.38,z)
  const fallenLength=(asset.bounds.max.y-cut)*fallenScale
  for(let d=1;d<fallenLength*.65;d+=.75)start.y=Math.max(start.y,forestSurfaceHeight(x+direction.x*d,z+direction.z*d)+.16-direction.y*d)
  const matrix=new Matrix4().makeTranslation(start.x,start.y,start.z)
    .multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(up,direction)))
    .multiply(new Matrix4().makeRotationY(t.yaw)).scale(new Vector3(fallenScale,fallenScale,fallenScale)).multiply(new Matrix4().makeTranslation(0,-cut,0))
  for(const part of asset.parts){
    const g=part.geometry.clone(),p=g.attributes.position,kept=[]
    for(let i=0;i<g.index.count;i+=3){const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];if(ids.some(id=>p.getY(id)>=cut-.025))kept.push(...ids)}
    g.setIndex(kept);g.computeBoundingBox();g.computeBoundingSphere();owned.push(g)
    const mesh=new Mesh(g,part.material);mesh.matrix.copy(matrix).multiply(part.transform);mesh.matrixAutoUpdate=false;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.forest=true;mesh.name='Forest_crash_fallen_tree_'+part.material.name;group.add(mesh)
  }
  const stump=brokenStump();group.add(stump);owned.push(stump.geometry)
  const colliders=[cylinderCollider(t.x,t.z,.73,ground-.1,ground+t.stumpHeight+.2)]
  for(const other of CRASH_BROKEN_BASES){
    const broken=brokenStump(other);group.add(broken);owned.push(broken.geometry);const floor=forestSurfaceHeight(other.x,other.z)
    colliders.push(cylinderCollider(other.x,other.z,.45,floor-.1,floor+other.stumpHeight+.12))
  }
  // Segmented low primitive boxes follow the fallen trunk, rather than keeping
  // the original invisible 30 m standing-tree collider or using triangle physics.
  const length=(asset.bounds.max.y-cut)*fallenScale*.79
  for(let i=0;i<12;i++){
    const distance=(i+.5)*length/12,point=start.clone().addScaledVector(direction,distance),r=.48*(1-i/16),box=new Box3().setFromCenterAndSize(point,new Vector3(Math.abs(direction.x)*length/12+r*2,r*2,Math.abs(direction.z)*length/12+r*2))
    colliders.push(boxCollider(box,{walkable:false,environment:true,source:'forest-crash-tree'}))
  }
  group.name='Forest_crash_tree_felled_left';group.userData.forest=true
  return{group,colliders,owned,material:stump.material,extraMaterials:group.children.filter(m=>m.name==='Forest_crash_broken_stump'&&m!==stump).map(m=>m.material),direction,start,fallenLength}
}

export function createCrushedFoliage(atlas){
  const count=28,material=foliageCardMaterial(atlas),batch=new BatchedMesh(count,count*8,count*6,material),tint=new Color()
  const entries=FOLIAGE_CATALOG.entries.filter(e=>e.category==='pasto'||e.category==='helechos')
  for(let i=0;i<count;i++){
    const z=4+i*.95,cross=(i%2?1:-1)*(crashTrackWidth(z)+.35+(i%3)*.16),world=crashWorld(crashTrackCenter(z)+cross,z),entry=entries[i%entries.length],height=.4+(i%5)*.07,g=foliageCardGeometry(entry),obj=new Object3D()
    g.setIndex([0,1,2,0,2,3]);obj.rotation.set(-Math.PI/2,0,FOREST_CRASH.yaw+.25*Math.sin(i*2));obj.scale.setScalar(height);obj.updateMatrix()
    const p=g.attributes.position,v=new Vector3(),ground=forestSurfaceHeight(world.x,world.z)
    for(let j=0;j<p.count;j++){v.fromBufferAttribute(p,j).applyMatrix4(obj.matrix);const x=world.x+v.x,z=world.z+v.z;p.setXYZ(j,v.x,forestSurfaceHeight(x,z)-ground+.022,v.z)}
    g.computeVertexNormals();const id=batch.addInstance(batch.addGeometry(g));batch.setMatrixAt(id,new Matrix4().makeTranslation(world.x,ground,world.z));batch.setColorAt(id,tint.setScalar(.8+(i%4)*.045));g.dispose()
  }
  batch.name='Forest_crash_crushed_anime_plants';batch.userData.forest=true;batch.sortObjects=false;batch.computeBoundingBox();batch.computeBoundingSphere();batch.receiveShadow=true
  return{batch,material}
}
