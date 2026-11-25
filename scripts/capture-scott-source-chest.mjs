import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ridingFixture,writeRidingScene,measureRiding} from './scott-v2-riding-fixture.mjs'
import {ScottSourceChest} from '../src/vehicle/ScottSourceChest.js'
const dir='artifacts/scott-source-chest',f=await ridingFixture(),bytes=fs.readFileSync('public/models/mospeada/scott-original-rigid-chest.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60);f.rig.root.visible=false;writeRidingScene(f,dir+'/before-riding.glb');const bones=[...f.bones].map(([n,b])=>[n,b.matrixWorld.toArray()]),before=measureRiding(f)
const chest=new ScottSourceChest(f.instance,asset);chest.attach();f.extraMeshes=[chest.mesh];writeRidingScene(f,dir+'/after-riding.glb');fs.writeFileSync(dir+'/poses.json',JSON.stringify({before,after:measureRiding(f),bonesBefore:bones,bonesAfter:[...f.bones].map(([n,b])=>[n,b.matrixWorld.toArray()])},null,2)+'\n');console.log('Captured original donor chest as a rigid component; pose untouched')
