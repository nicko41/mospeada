import fs from 'node:fs'
import {AnimationMixer,Vector3} from 'three'
import {ridingFixture,writeRidingScene,measureRiding} from './scott-v2-riding-fixture.mjs'
import {ScottRidingChest} from '../src/vehicle/ScottRidingChest.js'
const dir='artifacts/scott-air-chest',f=await ridingFixture(),raw=await ridingFixture({fit:false}),clip=raw.scott.asset.animations.find(c=>c.name==='air_squat'),action=raw.instance.mixer.clipAction(clip).reset().play();fs.mkdirSync(dir,{recursive:true})
Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60);f.rig.root.visible=false;writeRidingScene(f,dir+'/before-riding.glb');const before=measureRiding(f),matrices=[...f.bones].map(([n,b])=>[n,b.matrixWorld.toArray()])
const chest=new ScottRidingChest(f.instance);chest.apply(f.runtime);f.extraMeshes=[chest.mesh];writeRidingScene(f,dir+'/after-riding.glb')
action.time=.6688890198866526;raw.instance.mixer.update(0);raw.wrapper.scale.setScalar(raw.authored.data.actorScale);raw.wrapper.updateMatrixWorld(true);const target=f.bones.get('mixamorigSpine2').getWorldPosition(new Vector3()),current=raw.bones.get('mixamorigSpine2').getWorldPosition(new Vector3());raw.wrapper.position.y+=target.y-current.y;raw.wrapper.updateMatrixWorld(true);raw.rig.root.visible=false;writeRidingScene(raw,dir+'/source-air.glb')
fs.writeFileSync(dir+'/poses.json',JSON.stringify({before,after:measureRiding(f),chest:chest.reference,matricesBefore:matrices,matricesAfter:[...f.bones].map(([n,b])=>[n,b.matrixWorld.toArray()])},null,2)+'\n');console.log('Captured original, restored Air Squat chest and exact reference frame')
