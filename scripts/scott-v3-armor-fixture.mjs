import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Vector3} from 'three'
import {ridingFixture} from './scott-v2-riding-fixture.mjs'
import {readGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'
import {ArmorController} from '../src/vehicle/ArmorController.js'
import {ArmorArticulation} from '../src/vehicle/ArmorArticulation.js'
import {FrontBattloidTransform} from '../src/vehicle/FrontBattloidTransform.js'
import {RearBattloidTransform} from '../src/vehicle/RearBattloidTransform.js'
import {GuardBattloidTransform} from '../src/vehicle/GuardBattloidTransform.js'
import {WheelBattloidTransform} from '../src/vehicle/WheelBattloidTransform.js'
import {SuspensionHideTransform} from '../src/vehicle/SuspensionHideTransform.js'

const json=p=>JSON.parse(fs.readFileSync(p))
const load=async p=>{const g=readGlb(p),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'');return{g,asset}}
export async function v3ArmorFixture(){
 const f=await ridingFixture(),[native,parts]=await Promise.all([load('public/models/mospeada/scott-gear-v3-animated.glb'),load('public/transformations/cyclone-rear-pieces.glb')]),i=f.instance,r=f.runtime
 const visual=new ScottV3Visual(i,native.asset.scene)
 i.modelComparison={variant:'v3',v3:visual};r.scottData=f.authored.data
 const entry=r.transformEntry={phase:'complete',poseBlend:1,returnFlight:false,assemblyProgress:1,actorOffset:new Vector3(),actorPose:{arms:1,legs:1,leftToeDown:1,rightToeDown:1}}
 const front=r.frontTransformation=new FrontBattloidTransform(f.rig,i,json('public/transformations/cyclone-front-battloid.json'))
 const rear=r.rearTransformation=new RearBattloidTransform(f.rig,front,json('public/transformations/cyclone-rear-battloid.json'),parts.asset.scene)
 const guards=r.guardTransformation=new GuardBattloidTransform(f.rig,i,json('public/transformations/cyclone-guard-battloid.json'))
 const wheels=r.wheelTransformation=new WheelBattloidTransform(f.rig,front,rear,json('public/transformations/cyclone-wheel-battloid.json'))
 const suspension=r.suspensionTransformation=new SuspensionHideTransform(f.rig,front,guards,json('public/transformations/cyclone-suspension-hide.json'))
 const canonical=(progress=1)=>{f.step();front.apply(progress);rear.apply(progress);guards.apply(progress);wheels.apply(progress);suspension.apply(progress)}
 canonical();const controller=r.armorController=new ArmorController(r,f.rig,()=>0,()=>true);controller.activate();canonical()
 const articulation=i.armorArticulation=new ArmorArticulation(r)
 const tick=()=>{
  visual.restoreAttachments();articulation.restore();suspension.restore();guards.restore();wheels.restore();rear.restore();front.restore();canonical();articulation.prepare(controller)
  i.armorLocomotion.apply(controller,1/60,false);f.wrapper.updateMatrixWorld(true);articulation.apply(controller,entry,1/60)
  if(i.modelComparison.variant==='v3'){visual.apply(r);visual.fitArmor(r)}
 }
 tick();return{...f,native,visual,entry,front,rear,guards,wheels,suspension,controller,articulation,tick}
}
