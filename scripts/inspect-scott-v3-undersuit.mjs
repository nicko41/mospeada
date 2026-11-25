import fs from 'node:fs'
import {undersuitFixture} from './scott-v3-undersuit-fixture.mjs'
import {writeRidingScene} from './scott-v2-riding-fixture.mjs'
const directory='artifacts/scott-v3/undersuit';fs.mkdirSync(directory,{recursive:true})
const f=await undersuitFixture();f.scott=f.native;f.skins=f.visual.skins
try{for(const [name,aim]of [['ride',null],['extended',[-15,12,3]]]){
 f.pose(aim);f.rig.root.visible=false
 for(const enabled of [false,true]){
  f.visual.undersuit.setEnabled(enabled);f.extraMeshes=enabled?f.visual.undersuit.meshes:[]
  writeRidingScene(f,`${directory}/${name}-${enabled?'after':'before'}-inspection.glb`)
 }
}}finally{f.dispose()}
