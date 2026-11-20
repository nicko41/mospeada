import {Box3,Color,MeshBasicMaterial,PlaneGeometry,Quaternion,Vector3} from 'three'
import {Bezier,ColorOverLife,ColorRange,ConeEmitter,ConstantValue,Gradient,IntervalValue,ParticleSystem,PiecewiseBezier,RenderMode,SizeOverLife,Vector3 as QVec3,Vector4 as QVec4} from 'three.quarks'
import {createSmokeAtlas} from './smokeAtlas.js'

const rgba=(hex,a)=>{const c=new Color(hex);return new QVec4(c.r,c.g,c.b,a)}

// Independent world-space burst from the transformed rear1. Ordinary engine
// smoke, the bike turbine, terrain VFX and their settings are not modified.
export class ArmorBoost{
  constructor(){
    this.geometry=new PlaneGeometry(1,1);this.atlas=createSmokeAtlas()
    this.material=new MeshBasicMaterial({map:this.atlas,transparent:true,depthWrite:false})
    this.position=new Vector3();this.previous=new Vector3();this.direction=new Vector3();this.liftDirection=new Vector3();this.rotation=new Quaternion();this.axis=new Vector3(0,0,1)
    this.records=[];this.systems=[];this.emitted=0;this.level=0;this.initialized=false
    for(const core of[true,false]){
      const rate=new ConstantValue(0),owner=this
      const system=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,
        shape:new ConeEmitter({radius:core?.035:.07,angle:core?.08:.24}),
        startLife:new IntervalValue(core?.12:.28,core?.22:.55),startSpeed:new IntervalValue(core?16:9,core?23:15),
        startSize:new IntervalValue(core?.1:.2,core?.18:.38),startRotation:new IntervalValue(-Math.PI,Math.PI),startTileIndex:new IntervalValue(0,4),
        startColor:new ColorRange(rgba(core?'#e1f6ff':'#bedbeb',.7),rgba('#ffffff',.9)),
        emissionOverTime:rate,emissionOverDistance:new ConstantValue(0),emissionBursts:[],
        material:this.material,instancingGeometry:this.geometry,renderMode:core?RenderMode.StretchedBillBoard:RenderMode.BillBoard,
        rendererEmitterSettings:core?{speedFactor:.12,lengthFactor:.5}:{},uTileCount:2,vTileCount:2,renderOrder:5,
        behaviors:[new SizeOverLife(new PiecewiseBezier([[new Bezier(.6,core?1.4:2,core?2:4,core?2.5:6),0]])),
          new ColorOverLife(new Gradient([[new QVec3(1,1,1),0],[new QVec3(.65,.8,.94),1]],[[0,0],[1,.06],[.65,.3],[0,1]])),
          {type:'MOSPEADA_ArmorBoostBirth',initialize(){owner.emitted++},update(){},frameUpdate(){},reset(){}}],
      })
      system.emitter.name=core?'Quarks_armor_rear1_core':'Quarks_armor_rear1_plume'
      this.records.push({system,rate,core});this.systems.push(system)
    }
    this.liftRecords=[0,1].map(index=>{
      const rate=new ConstantValue(0),system=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,
        shape:new ConeEmitter({radius:.045,angle:.16}),startLife:new IntervalValue(.12,.24),startSpeed:new IntervalValue(5,9),startSize:new IntervalValue(.10,.20),startTileIndex:new IntervalValue(0,4),startColor:new ColorRange(rgba('#bcefff',.55),rgba('#edfaff',.8)),
        emissionOverTime:rate,emissionOverDistance:new ConstantValue(0),emissionBursts:[],material:this.material,instancingGeometry:this.geometry,renderMode:RenderMode.StretchedBillBoard,rendererEmitterSettings:{speedFactor:.08,lengthFactor:.35},uTileCount:2,vTileCount:2,renderOrder:5,
        behaviors:[new SizeOverLife(new PiecewiseBezier([[new Bezier(.5,1.1,1.9,2.5),0]])),new ColorOverLife(new Gradient([[new QVec3(.6,.85,1),0],[new QVec3(1,1,1),1]],[[0,0],[.8,.10],[.45,.5],[0,1]]))]})
      system.emitter.name='Quarks_armor_wheel_lift_'+index;this.systems.push(system)
      return{system,rate,position:new Vector3(),previous:new Vector3(),rotation:new Quaternion(),box:new Box3(),level:0,initialized:false}
    })
  }
  prepare(dt,entry,rear,distance,enabled=true,armor=null,wheels=null){
    this.previous.copy(this.position)
    const socket=rear?.boostSocket(this.position,this.direction)
    const a=armor?.active?armor.state:null
    if(socket&&entry?.upwardBoost)this.direction.set(0,-1,0)
    else if(socket&&a)this.direction.set(-Math.sin(a.yaw),-.08,-Math.cos(a.yaw)).normalize()
    this.level=enabled&&socket?(a?a.boostBlend*Math.max(0,a.thrustForward||0):entry?.armorBoostLevel||0):0
    this.gain=distance>85?0:distance>35?.4:1
    this.duration=dt;this.elapsed=0
    if(socket)this.rotation.setFromUnitVectors(this.axis,this.direction)
    if(!this.initialized||this.previous.distanceToSquared(this.position)>225)this.previous.copy(this.position)
    this.initialized=!!socket
    this.liftRecords.forEach((r,index)=>{
      r.previous.copy(r.position)
      const group=wheels?.groups[index],mesh=group?.parts.find(p=>/Tire_Rubber/.test(p.mesh.userData.sourcePiece))?.mesh
      const maneuver=a?a.boostBlend*Math.max(Math.abs(a.thrustSide||0),-(a.thrustForward||0)):0
      r.level=enabled&&a&&mesh?(a.lift+maneuver*1.4)*(1+(index?1:-1)*Math.max(-.3,Math.min(.3,a.sideAcceleration*.012))):0
      if(mesh){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();r.box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);r.box.getCenter(r.position);r.position.y=r.box.min.y+.025}
      if(!r.initialized||r.previous.distanceToSquared(r.position)>225)r.previous.copy(r.position)
      r.initialized=!!mesh
      this.liftDirection.set(a?-a.ax*.012-(a.thrustX||0)*maneuver:0,-1,a?-a.az*.012-(a.thrustZ||0)*maneuver:0).normalize();r.rotation.setFromUnitVectors(this.axis,this.liftDirection)
    })
  }
  beforeStep(dt){
    this.elapsed+=dt;const t=this.duration>0?Math.min(1,this.elapsed/this.duration):1
    for(const r of this.records){
      const ps=r.system,remaining=Math.max(0,(r.core?120:180)-ps.particleNum)
      ps.emitter.position.lerpVectors(this.previous,this.position,t);ps.emitter.quaternion.copy(this.rotation);ps.emitter.updateWorldMatrix(true,false)
      r.rate.value=dt>0?Math.min((r.core?520:680)*this.level*this.gain,remaining/dt):0
      if(this.level<=0)ps.emissionState.waitEmiting=0
    }
    for(const r of this.liftRecords){
      const ps=r.system,remaining=Math.max(0,70-ps.particleNum)
      ps.emitter.position.lerpVectors(r.previous,r.position,t);ps.emitter.quaternion.copy(r.rotation);ps.emitter.updateWorldMatrix(true,false)
      r.rate.value=dt>0?Math.min(180*r.level*this.gain,remaining/dt):0
      if(r.level<=0)ps.emissionState.waitEmiting=0
    }
  }
  dispose(){this.material.dispose();this.atlas.dispose();this.geometry.dispose()}
}
