import {Matrix4,Vector3} from 'three'

export const BIKE_DEFEAT=Object.freeze({coastSeconds:1.15,fallDelay:.55,fallSeconds:1.05,gravity:18})
const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}

// Scott keeps his own world origin. Only the abandoned vehicle coasts forward.
export class BikeDefeatMotion{
  constructor(rig,runtime){
    Object.assign(this,{rig,runtime,started:false,active:false,settled:false,age:0,contact:false})
    this.point=new Vector3();this.matrix=new Matrix4();this.probes=null
  }
  reset(){this.started=this.active=this.settled=this.contact=false;this.age=0}
  advance(dt,sample,canMove=()=>true){
    const s=this.runtime.state
    if(!this.started){
      this.started=true
      this.active=s.riderMode==='mounted'&&!this.runtime.armorController?.active&&(!this.runtime.transformEntry||this.runtime.transformEntry.phase==='idle')
      this.age=0;this.distance=0;this.height=s.height;this.vy=Math.min(0,s.verticalVelocity||0);this.pitch=s.pitch;this.lean=s.lean;this.bank=s.bank;this.wheelie=s.wheelieAngle
      this.speed=Math.max(2.4,Math.min(6,Math.abs(s.speed)*.35));this.blocked=false
      this.crash=this.runtime.canyonCrash;this.originX=s.x;this.originZ=s.z
    }
    if(!this.active){s.speed=0;return}
    dt=Math.max(0,Math.min(.1,dt));this.age+=dt
    if(this.settled){s.speed=0;return}
    if(this.crash){
      const drift=1-Math.exp(-this.age*2),n=this.crash.normal
      s.x=this.originX+n.x*drift;s.z=this.originZ+n.z*drift;s.speed=0
      this.vy-=BIKE_DEFEAT.gravity*dt;this.height+=this.vy*dt;s.height=this.height
      this.crash.constrainBike?.(s)
      s.pitch=this.pitch*(1-smooth(this.age/.4))+.6*smooth(this.age/1.2)
      s.lean=s.bank=s.wheelieAngle=s.steer=s.yawRate=s.slip=s.idleBlend=s.airBoostBlend=0
      return
    }
    const u=Math.min(1,this.age/BIKE_DEFEAT.coastSeconds),distance=this.speed*BIKE_DEFEAT.coastSeconds*(u-u*u/2),travel=distance-this.distance
    const x=s.x+Math.sin(s.yaw)*travel,z=s.z+Math.cos(s.yaw)*travel
    if(!this.blocked&&canMove(x,z,s.yaw)&&Number.isFinite(sample(x,z))){
      s.x=x;s.z=z;s.distance+=travel;s.frontSpin+=travel/this.rig.metrics.frontRadius;s.rearSpin+=travel/this.rig.metrics.rearRadius
    }else this.blocked=true
    this.distance=distance;s.speed=this.blocked?0:this.speed*(1-u)
    const level=1-smooth(this.age/.45)
    s.pitch=this.pitch*level;s.lean=this.lean*level;s.bank=this.bank*level;s.wheelieAngle=this.wheelie*level
    s.steer=s.yawRate=s.slip=s.idleBlend=s.airBoostBlend=0
    this.vy-=BIKE_DEFEAT.gravity*dt;this.height+=this.vy*dt;s.height=this.height
  }
  prepareProbes(){
    const {rig,point,matrix}=this
    rig.body.updateWorldMatrix(true,true)
    const inverse=rig.body.matrixWorld.clone().invert()
    // Exact surface vertices supporting each part throughout the roll. This
    // avoids grounding against empty corners of a mesh's bounding box.
    this.probes=rig.surfaces.map(mesh=>{
      matrix.copy(inverse).multiply(mesh.matrixWorld)
      const position=mesh.geometry.attributes.position,ids=new Set()
      for(let step=0;step<=20;step++){
        const angle=step*Math.PI/40,c=Math.cos(angle),s=Math.sin(angle)
        let min=Infinity,id=0
        for(let i=0;i<position.count;i++){
          point.fromBufferAttribute(position,i).applyMatrix4(matrix)
          const y=point.x*s+point.y*c
          if(y<min){min=y;id=i}
        }
        ids.add(id)
      }
      return{mesh,points:[...ids].map(id=>new Vector3().fromBufferAttribute(position,id))}
    })
  }
  apply(sample){
    if(!this.active)return
    if(this.crash)sample=this.crash.floorAt
    if(!this.probes)this.prepareProbes()
    const {rig}=this
    // +Z is forward and -X is the rider's right in the imported Cyclone.
    rig.body.rotation.z+=Math.PI/2*smooth((this.age-BIKE_DEFEAT.fallDelay)/BIKE_DEFEAT.fallSeconds)
    rig.root.updateMatrixWorld(true)
    if(this.settled)return
    let lift=-Infinity
    for(const {mesh,points} of this.probes){
      if(!mesh.visible)continue
      for(const p of points){
        this.point.copy(p).applyMatrix4(mesh.matrixWorld)
        const ground=sample(this.point.x,this.point.z)
        if(Number.isFinite(ground))lift=Math.max(lift,ground+.012-this.point.y)
      }
    }
    this.contact=lift>=-1e-4
    if(lift>0){rig.root.position.y+=lift;this.height+=lift;this.runtime.state.height=this.height;this.vy=0;rig.root.updateMatrixWorld(true)}
    this.settled=this.age>=BIKE_DEFEAT.fallDelay+BIKE_DEFEAT.fallSeconds&&this.contact
  }
}
