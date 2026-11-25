import {Group,Quaternion,Vector3} from 'three'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {foliageCardMaterial,ForestSpriteBatch} from './forestFoliageLibrary.js'
import {forestRandom} from './forestLayout.js'
import {stage2LipZ,stage2PathX,FOREST_STAGE2 as S} from './forestStage2Config.js'
import {stage2SurfaceHeight} from './forestStage2Terrain.js'
import {canyonSideHeight} from './forestCanyonSides.js'
import {createTreeBasePlants} from './forestTreeBasePlants.js'

const species=FOLIAGE_CATALOG.entries.filter(e=>['pasto-alto-01','pasto-alto-02','pasto-ancho-01','pasto-espigas-01','helecho-01','hojas-anchas-02','roseta-02'].includes(e.id))
const surface=(x,z)=>Math.abs(x)<S.halfWidth?stage2SurfaceHeight(x,z):canyonSideHeight(x,z)

// Extract the exact shared upper edge, including every lateral module.
export function canyonRimPolyline(geometries,back){
  const points=[]
  for(const g of geometries){const p=g.attributes.position,columns=p.count/(2*((g.userData.canyonRows??30)+1)),offset=back?p.count/2:0
    for(let i=0;i<columns;i++)points.push({x:p.getX(offset+i),y:p.getY(offset+i),z:p.getZ(offset+i)})
  }
  points.sort((a,b)=>a.x-b.x)
  const unique=points.filter((p,i)=>!i||p.x!==points[i-1].x);let length=0
  for(let i=0;i<unique.length;i++){if(i)length+=Math.hypot(unique[i].x-unique[i-1].x,unique[i].z-unique[i-1].z);unique[i].distance=length}
  return {points:unique,length}
}
function rimPoint(line,distance,back){
  const points=line.points;let lo=0,hi=points.length-1
  while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid].distance<distance)lo=mid;else hi=mid}
  const a=points[lo],b=points[hi],t=Math.max(0,Math.min(1,(distance-a.distance)/(b.distance-a.distance))),dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz),side=back?-1:1
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,outX:dz/n*side,outZ:-dx/n*side}
}
function wallLedges(geometry,random,add,back){
  const p=geometry.attributes.position,index=geometry.index
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),x=(p.getX(a)+p.getX(b)+p.getX(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3,y=(p.getY(a)+p.getY(b)+p.getY(c))/3
    if((z<(stage2LipZ(x)+stage2LipZ(x,true))*.5)!==back)continue
    const depth=canyonSideHeight(x,stage2LipZ(x,back))-y
    if(depth<.35||depth>2.6||random()>.13)continue
    const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a),vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a)
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx
    if(Math.abs(ny)/Math.hypot(nx,ny,nz)<.28)continue
    add({x,z,y:y-.025,scale:.25+random()*.16,yaw:random()*Math.PI*2,tiltX:(back?1:-1)*(.3+random()*.55),ledge:true})
  }
}
export function createCanyonFoliage(atlas,terrain,sides){
  const random=forestRandom(19830928),placements=[],buckets=new Map(),group=new Group(),batches=[],lines=[],geometries=[terrain.cliffs,...sides.tiles.map(t=>t.cliffs)]
  const axis=new Vector3(),up=new Vector3(0,1,0),tilt=new Quaternion(),yaw=new Quaternion()
  const add=p=>{const entry=species[Math.floor(random()*species.length)];p.sprite=entry.id;p.mirror=random()<.5;p.tint=1;placements.push(p);const key=Math.floor(p.x/64);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p)}
  for(const back of [false,true]){
    const line=canyonRimPolyline(geometries,back);lines.push(line)
    let nextGap=7+random()*7
    for(let distance=.25;distance<line.length-.25;){
      // Short gaps interrupt overlapping groups. Keep coverage at the launch
      // lane too: low upright tufts and outward leaves have no colliders.
      if(distance>nextGap){distance+=.45+random()*.55;nextGap=distance+8+random()*9;continue}
      const point=rimPoint(line,distance,back),lane=Math.abs(point.x-stage2PathX(point.z))<3.4,count=random()<.28?3:2
      for(let n=0;n<count;n++){
        const d=Math.max(0,Math.min(line.length,distance+(random()-.5)*.22)),edge=rimPoint(line,d,back),inward=.018+random()*.055,x=edge.x-edge.outX*inward,z=edge.z-edge.outZ*inward,ground=surface(x,z),hanging=n===1
        const angle=hanging?1.35+random()*.65:.08+random()*.48
        tilt.setFromAxisAngle(axis.set(edge.outZ,0,-edge.outX),angle);yaw.setFromAxisAngle(up,random()*Math.PI*2);tilt.multiply(yaw)
        add({x,z,y:(Number.isFinite(ground)?ground:edge.y)-.022,scale:hanging?.48+random()*.28:lane?.23+random()*.15:.42+random()*.3,quaternion:tilt.toArray(),ledge:false,hanging,back,rimDistance:d,inset:inward})
      }
      distance+=.43+random()*.22
    }
    for(const geometry of geometries)wallLedges(geometry,random,add,back)
  }
  for(const p of createTreeBasePlants(Object.values(sides.byName).flat(),{seed:19830929})){p.y=surface(p.x,p.z)-.025;placements.push(p);const key=Math.floor(p.x/64);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p)}
  const material=foliageCardMaterial(atlas,true,true,{start:0,end:0,fade:155,max:205})
  for(const [key,items]of buckets){const batch=new ForestSpriteBatch(items,material,surface);batch.distance=205;batch.name='Forest_canyon_rim_foliage_'+key;group.add(batch);batches.push(batch)}
  group.name='Forest_canyon_organic_rim';group.userData.forest=true
  return {group,batches,placements,lines,update(camera){for(const batch of batches){batch.visible=batch.boundingBox.distanceToPoint(camera.position)<209;if(batch.visible)batch.updateDistance(camera)}},dispose(){batches.forEach(b=>b.dispose());material.dispose()}}
}
