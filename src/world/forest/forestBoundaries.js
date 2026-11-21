import {Group,Matrix4,Mesh,Quaternion,Vector3} from 'three'
import {cylinderCollider} from '../../player/collisionWorld.js'
import {FOREST_ASSETS} from './forestConfig.js'
import {forestLayout,forestRandom,forestSurfaceHeight} from './forestLayout.js'
import {CRASH_PATCH} from './forestCrashSite.js'
import {forestRouteDistance} from './forestSurface.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'

// World-space edges of the existing opening. Leave the crash patch and Scott's
// route to the main trail inside this opening; do not enlarge the terrain.
export const FOREST_BOUNDARY_CHAINS=Object.freeze([
  {id:'left',points:[[-50,58],[-53,24],[-53,-3],[-50,-28],[-37,-32],[-27,-46],[-29,-64],[-35,-91]]},
  {id:'right',points:[[30,58],[29,21],[25,-5],[9,-26],[3,-48],[1,-67],[-5,-91]]},
  {id:'rear',points:[[-50,58],[-28,61],[-10,58],[9,60],[30,58]]},
])
export const FOREST_BOUNDARY_LOGS=Object.freeze([
  {id:'right-branch',x:-4.5,z:-66.5,length:9.5,dx:.42,dz:.91,radius:.48},
  {id:'rear',x:4,z:52.7,length:11,dx:.96,dz:-.28,radius:.55},
])
const protectedPatch=(x,z,r=0)=>x>CRASH_PATCH.minX-r&&x<CRASH_PATCH.maxX+r&&z>CRASH_PATCH.minZ-r&&z<CRASH_PATCH.maxZ+r

export function createForestBoundaryLayout(){
  const random=forestRandom(19830983),between=(a,b)=>a+(b-a)*random(),byName=Object.fromEntries(FOREST_ASSETS.map(a=>[a.name,[]])),sprites=[],thickets=[]
  const trees=Object.values(forestLayout).flat().filter(p=>p.kind==='tree'),rocks=FOREST_ASSETS.filter(a=>a.kind==='rock'),definitions=FOREST_ASSETS.filter(a=>a.kind==='tree')
  const choices=Object.fromEntries(['arbustos','helechos','pasto'].map(category=>[category,FOLIAGE_CATALOG.entries.filter(e=>e.category===category&&!e.id.includes('flores')&&(!e.id.startsWith('pasto-bajo')||category!=='pasto'))]))
  for(const chain of FOREST_BOUNDARY_CHAINS)for(let segment=1;segment<chain.points.length;segment++){
    const [ax,az]=chain.points[segment-1],[bx,bz]=chain.points[segment],length=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/length,nz=(bx-ax)/length,count=Math.ceil(length/2.1)
    for(let i=0;i<count;i++){
      const t=(i+.25+random()*.5)/count,wave=Math.sin(i*.57+segment)*1.7+Math.sin(i*1.7+segment)*.8,x=ax+(bx-ax)*t+nx*wave,z=az+(bz-az)*t+nz*wave
      if(protectedPatch(x,z,4)||forestRouteDistance(x,z)<8.8)continue
      const ground=forestSurfaceHeight(x,z),radius=between(1.35,1.6),clumpHeight=1.3+.9*(.5+.5*Math.sin(i*.51+segment*2))
      thickets.push({x,z,radius,ground,height:Math.min(1.4,clumpHeight*.8),id:chain.id})
      // Two interlocking, staggered layers with fern/grass on the soft edge.
      // Collider footprints stay inside the visible dense shrub groups.
      for(let j=0;j<6;j++){
        const category=j<3?'arbustos':j<5?'helechos':'pasto',entries=choices[category],entry=entries[Math.floor(random()*entries.length)]
        const along=j?between(-1.3,1.3):0,across=j?between(-2.4,2.4):0,height=j<3?clumpHeight+between(-.2,.2):between(.65,1.25)
        sprites.push({x:x+(bx-ax)/length*along+nx*across,z:z+(bz-az)/length*along+nz*across,scale:height,height,yaw:between(0,Math.PI*2),mirror:random()<.5,tint:between(.93,1.02),sprite:entry.id,kind:'foliageCard'})
      }
      if(i%2===0){
        const tx=x+nx*between(-2.5,2.5),tz=z+nz*between(-2.5,2.5),asset=definitions[Math.floor(random()*definitions.length)],scale=between(2.2,2.9),trunkRadius=asset.trunkRadius*scale
        if(!protectedPatch(tx,tz,3)&&forestRouteDistance(tx,tz)>8.8&&trees.every(p=>Math.hypot(tx-p.x,tz-p.z)>trunkRadius+(p.trunkRadius||.8)+.9)){
          const p={x:tx,z:tz,scale,yaw:between(0,Math.PI*2),tint:between(.9,1.04),trunkRadius,kind:'tree',name:asset.name,layer:'boundary'}
          byName[asset.name].push(p);trees.push(p)
        }
      }
      if(i%17===7){const asset=rocks[Math.floor(random()*rocks.length)];byName[asset.name].push({x:x+nx*2,z:z+nz*2,scale:between(.55,.85),yaw:between(0,Math.PI*2),tint:between(.9,1.04),kind:'rock',name:asset.name})}
    }
  }
  return {byName,sprites,thickets}
}
export const forestBoundaryLayout=createForestBoundaryLayout()

export function createBoundaryColliders(layout=forestBoundaryLayout){
  const colliders=[]
  for(const p of Object.values(layout.byName).flat()){
    const ground=forestSurfaceHeight(p.x,p.z),rock=p.kind==='rock'
    colliders.push({...cylinderCollider(p.x,p.z,rock?p.scale*.65:p.trunkRadius,ground-.2,ground+(rock?p.scale:18)),environment:true,source:'forest-boundary-'+p.kind})
  }
  for(const p of layout.thickets)colliders.push({...cylinderCollider(p.x,p.z,p.radius,p.ground-.15,p.ground+p.height),environment:true,source:'forest-boundary-thicket'})
  // Tight primitives follow each visible diagonal trunk instead of broad AABBs.
  for(const log of FOREST_BOUNDARY_LOGS)for(let d=.25;d<log.length;d+=.55){const x=log.x+log.dx*d,z=log.z+log.dz*d,ground=forestSurfaceHeight(x,z);colliders.push({...cylinderCollider(x,z,log.radius,ground-.1,ground+log.radius*1.8),environment:true,source:'forest-boundary-log'})}
  return colliders
}

export function createBoundaryLogs(asset){
  const group=new Group(),owned=[],up=new Vector3(0,1,0)
  for(const log of FOREST_BOUNDARY_LOGS){
    const direction=new Vector3(log.dx,0,log.dz).normalize(),scale=1.5,cut=asset.bounds.min.y,limit=cut+log.length/scale
    let floor=-Infinity
    for(let d=0;d<=log.length;d+=.5)floor=Math.max(floor,forestSurfaceHeight(log.x+direction.x*d,log.z+direction.z*d))
    const transform=new Matrix4().makeTranslation(log.x,floor+log.radius*.65,log.z).multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(up,direction))).scale(new Vector3(scale,scale,scale)).multiply(new Matrix4().makeTranslation(0,-cut,0))
    for(const part of asset.parts.filter(p=>/Bark/.test(p.material.name))){
      const g=part.geometry.clone(),p=g.attributes.position,indices=[]
      for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i),b=g.index.getX(i+1),c=g.index.getX(i+2);if((p.getY(a)+p.getY(b)+p.getY(c))/3<=limit)indices.push(a,b,c)}
      for(let i=0;i<p.count;i++)if(p.getY(i)>limit)p.setY(i,limit)
      g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();owned.push(g)
      const mesh=new Mesh(g,part.material);mesh.matrix.copy(transform).multiply(part.transform);mesh.matrixAutoUpdate=false;mesh.receiveShadow=true;mesh.userData.forest=true;mesh.name='Forest_boundary_fallen_trunk_'+log.id;group.add(mesh)
    }
  }
  group.name='Forest_boundary_fallen_trunks';group.userData.forest=true
  return {group,owned}
}
