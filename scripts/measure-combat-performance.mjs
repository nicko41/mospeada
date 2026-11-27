import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Raycaster,Vector3} from 'three'
import {raycastRideSurfaces} from '../src/vehicle/rideSurface.js'
import {createScoutView} from '../src/world/forest/invidScoutAsset.js'
import {GallantLockShots} from '../src/vehicle/GallantLockShots.js'
import {scoutSurfaceStats} from '../src/world/forest/scoutSurfaceQuery.js'
import {stage2PhysicsFixture} from './forest-stage2-physics.mjs'

const dir='artifacts/combat-performance';fs.mkdirSync(dir,{recursive:true});fs.mkdirSync('.local',{recursive:true})
const baselineRef=process.argv[2]||'1ad127e'
async function original(file,label){const output=path.resolve('.local/combat-baseline-'+label+'.mjs');fs.writeFileSync(output,execFileSync('git',['show',baselineRef+':'+file]));return import(pathToFileURL(output).href)}
const [oldShots,oldGround]=await Promise.all([original('src/vehicle/GallantLockShots.js','shots'),original('src/vehicle/rideSurface.js','ground')])
const stats=a=>{const b=a.slice().sort((x,y)=>x-y);return{medianMs:b[Math.floor(b.length*.5)],p95Ms:b[Math.floor(b.length*.95)],maxMs:b.at(-1)}}
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const bytes=fs.readFileSync('public/models/mospeada/invid-scout-rigged.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),''),start=performance.now(),view=createScoutView(asset.scene,0,asset.animations),buildMs=performance.now()-start
view.root.visible=true;view.root.position.set(0,0,-20)
const target={view,position:new Vector3(0,0,-20),radius:2.3,height:5.2},from=new Vector3(0,2.6,0),a=new Vector3(),b=new Vector3(),before=[],after=[],triangles=[]
for(const[pose,time]of[['Hover',.37],['Claw_R',.4]]){
 view.motion.mixer.stopAllAction();view.motion.mixer.clipAction(asset.animations.find(c=>c.name===pose)).play();view.motion.mixer.setTime(time);view.motion.sync();view.levels[0].computeBoundingBox();view.levels[0].computeBoundingSphere()
 const baseline=new oldShots.GallantLockShots(()=>.5),optimized=new GallantLockShots(()=>.5)
 for(let i=0;i<16;i++){let start=performance.now();baseline.point(target,from,a);before.push(performance.now()-start);start=performance.now();optimized.point(target,from,b);after.push(performance.now()-start);assert.ok(a.distanceTo(b)<1e-8);triangles.push(scoutSurfaceStats(view.levels[0]).triangles)}
}
view.motion.dispose()
const f=await stage2PhysicsFixture(),remove=oldGround.registerRideSurfaces(f.scene),oldTimes=[],newTimes=[],oldSweepTimes=[],newSweepTimes=[];let oldSum,newSum
try{
 for(let trial=0;trial<4;trial++){
  for(const[label,sample,times]of[['old',oldGround.sampleRideHeight,oldTimes],['new',f.sample,newTimes]]){
   let sum=0;const start=performance.now();for(let i=0;i<10000;i++)sum+=sample(Math.sin(i*.1)*10,-655+Math.cos(i*.1)*30);const ms=performance.now()-start;if(trial)times.push(ms);if(label==='old')oldSum=sum;else newSum=sum
  }
  assert.ok(Math.abs(oldSum-newSum)<1e-7)
 }
 const rays=Array.from({length:1000},(_,i)=>{const x=Math.sin(i*.17)*10,z=-655+Math.cos(i*.13)*30;return{origin:new Vector3(x,f.sample(x,z)+.1+Math.abs(Math.sin(i*.1))*2,z),direction:new Vector3(Math.sin(i*.13)*.3,-.3,Math.cos(i*.19)*.4).normalize()}}),query=new Raycaster();query.near=.001;query.far=70/60
 for(const ray of rays){query.ray.copy(ray);const expected=oldGround.raycastRideSurfaces(query),actual=raycastRideSurfaces(query);assert.equal(!!actual,!!expected);if(actual)assert.ok(actual.point.distanceTo(expected.point)<1e-7)}
 for(let trial=0;trial<4;trial++)for(const[cast,times]of[[oldGround.raycastRideSurfaces,oldSweepTimes],[raycastRideSurfaces,newSweepTimes]]){const start=performance.now();for(let i=0;i<10000;i++){query.ray.copy(rays[i%rays.length]);cast(query)}if(trial)times.push(performance.now()-start)}
}finally{remove();f.dispose()}
const report={scope:'CPU measurements on identical animated meshes and terrain probes; these are not whole-game FPS',baselineRef,queries:before.length,scoutTriangles:view.levels[0].geometry.index.count/3,oneTimeBuildMs:buildMs,shots:{before:stats(before),after:stats(after),meanTrianglesTested:triangles.reduce((a,b)=>a+b,0)/triangles.length,identicalAimPoints:true},projectileSweeps:{queriesPerTrial:10000,before:stats(oldSweepTimes),after:stats(newSweepTimes),identicalContacts:true},terrain:{queriesPerTrial:10000,before:stats(oldTimes),after:stats(newTimes),identicalHeights:true}}
fs.writeFileSync(dir+'/cpu-comparison.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
