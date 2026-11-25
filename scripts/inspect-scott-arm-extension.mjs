import fs from 'node:fs'
import crypto from 'node:crypto'
import {Vector3,Quaternion} from 'three'
import {ridingFixture} from './scott-v2-riding-fixture.mjs'
const out='artifacts/scott-v2-arm-extension';fs.mkdirSync(out,{recursive:true})
const protectedPaths=['src/vehicle/scottV2RidingConfig.js','src/vehicle/ScottV2RidingPose.js','src/vehicle/scottGameplay.js','public/models/mospeada/scott-bernard-gear-v2-animated.glb','public/models/mospeada/scott-bernard-animated-original.glb','public/animations/scott-cyclone-actions.json']
const hashes=Object.fromEntries(protectedPaths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))
const f=await ridingFixture({fit:false}),bones=f.bones,point=n=>bones.get('mixamorig'+n).getWorldPosition(new Vector3()),samples=[]
const spine=f.reference.asset.scene.getObjectByName('mixamorigSpine2'),referenceQ=spine.getWorldQuaternion(new Quaternion())
for(const clip of f.scott.asset.animations){
 f.instance.mixer.stopAllAction();const action=f.instance.mixer.clipAction(clip).reset().play(),frames=[]
 for(let frame=0;frame<=240;frame++){
  action.time=Math.min(clip.duration-1e-6,clip.duration*frame/240);f.instance.mixer.update(0);f.wrapper.updateMatrixWorld(true)
  const arms={};for(const side of['Left','Right']){const shoulder=point(side+'Arm'),elbow=point(side+'ForeArm'),hand=point(side+'Hand');arms[side]={flexDegrees:180-shoulder.clone().sub(elbow).angleTo(hand.clone().sub(elbow))*180/Math.PI,shoulder:shoulder.toArray(),elbow:elbow.toArray(),hand:hand.toArray()}}
  const up=new Vector3(0,1,0).applyQuaternion(bones.get('mixamorigSpine2').getWorldQuaternion(new Quaternion()).multiply(referenceQ.clone().invert()))
  frames.push({time:action.time,fraction:frame/240,arms,maxFlex:Math.max(...Object.values(arms).map(a=>a.flexDegrees)),chestVertical:up.y,hip:point('Hips').toArray()})
 }
 const bothDown=frames.filter(p=>Object.values(p.arms).every(a=>a.shoulder[1]-a.hand[1]>.12)&&Math.abs(p.arms.Left.hand[1]-p.arms.Right.hand[1])<.12)
 const ranked=[...bothDown].sort((a,b)=>a.maxFlex-b.maxFlex)
 samples.push({name:clip.name,duration:clip.duration,frames,extension:ranked[0]||[...frames].sort((a,b)=>a.maxFlex-b.maxFlex)[0]})
}
fs.writeFileSync(out+'/inspection.json',JSON.stringify({hashes,clips:samples},null,2)+'\n')
console.log(JSON.stringify(samples.map(({name,duration,extension})=>({name,duration,...extension})),null,2))
