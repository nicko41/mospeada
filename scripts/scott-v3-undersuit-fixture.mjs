import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Vector3} from 'three'
import {readGlb} from './glb-data.mjs'
import {ridingFixture} from './scott-v2-riding-fixture.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'
import {MountedGallantPose} from '../src/vehicle/MountedGallantPose.js'
import {MarsGallant} from '../src/vehicle/MarsGallant.js'

async function load(path){const g=readGlb(path),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'');return{g,asset}}
export async function undersuitFixture(){
 const f=await ridingFixture(),native=await load('public/models/mospeada/scott-gear-v3-animated.glb'),gun=await load('public/models/mospeada/mars-gallant.glb')
 const visual=new ScottV3Visual(f.instance,native.asset.scene),weapon=new MarsGallant(gun.asset.scene)
 f.runtime.scottData=f.authored.data;f.instance.modelComparison={variant:'v3',v3:visual}
 f.step(60);const shooter=f.instance.shooterPose=new MountedGallantPose(f.instance,()=>.9)
 const pose=(aim,twoHanded=false)=>{
  f.runtime.gallant={aiming:!!aim};shooter.aimHeld=false;shooter.random=()=>twoHanded?0:1
  for(let i=0;i<60;i++){
   f.step();shooter.applyMounted(aim?new Vector3(...aim):new Vector3(0,2,15),!!aim,1/60,weapon)
  }
  visual.apply(f.runtime);weapon.present(f.instance,!!aim,aim?new Vector3(...aim):null)
  f.wrapper.updateWorldMatrix(true,true);visual.skins[0].mesh.skeleton.update()
 }
 pose(null)
 return{...f,native,visual,weapon,pose,dispose(){weapon.dispose();visual.dispose()}}
}
