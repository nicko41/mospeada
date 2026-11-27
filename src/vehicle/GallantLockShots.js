import {Raycaster,Vector3} from 'three'
import {intersectScoutSurface} from '../world/forest/scoutSurfaceQuery.js'

// Alternate upper body, sides and legs. Jitter stays inside the logical body;
// the surface probe rejects holes between limbs before choosing the shot ray.
const sectors=[[-.5,.72],[.5,.48],[-.35,.32],[.35,.85],[0,.6],[.5,.72],[-.5,.48],[.35,.32]]
export class GallantLockShots{
  constructor(random=Math.random){this.random=random;this.target=null;this.sector=0;this.side=new Vector3();this.direction=new Vector3();this.query=new Raycaster();this.contacts=[]}
  point(target,from,out){
    out.copy(target.position);if(!target.height){return out}
    if(this.target!==target){this.target=target;this.sector=Math.floor(this.random()*sectors.length)%sectors.length}
    this.direction.subVectors(target.position,from);this.direction.y=0
    this.side.set(this.direction.z,0,-this.direction.x).normalize()
    const mesh=target.view?.levels?.[target.view.lod||0]
    if(mesh)target.view.root.updateWorldMatrix(true,true)
    for(let attempt=0;attempt<4;attempt++){
      const [horizontal,height]=sectors[this.sector++%sectors.length]
      out.copy(target.position).addScaledVector(this.side,(horizontal+(this.random()-.5)*.12)*target.radius)
      out.y+=target.height*(height+(this.random()-.5)*.04)
      if(!mesh)return out
      this.query.ray.set(from,this.direction.subVectors(out,from).normalize());this.query.near=0;this.query.far=from.distanceTo(out)+target.height+target.radius
      this.contacts.length=0;intersectScoutSurface(target.view,this.query,this.contacts)
      if(this.contacts.length)return out
    }
    // Missing/edge-on visual geometry keeps the original reliable centre aim.
    return out.copy(target.position).addScaledVector(this.direction.set(0,1,0),target.height*.55)
  }
}
