import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {ForestMusic,FOREST_MUSIC,reachedDesertDrop} from './ForestMusic.js'
import {stage4Edge} from './forestStage4Config.js'

class FakeAudio{
 constructor(url){this.src=url;this.currentTime=0;this.paused=true;this.ended=false;this.readyState=4;this.plays=0;this.listeners=new Map()}
 load(){}
 addEventListener(name,fn){this.listeners.set(name,fn)}
 removeAttribute(name){if(name==='src')this.src=''}
 pause(){this.paused=true}
 play(){this.plays++;if(this.denied)return Promise.reject(Object.assign(Error('blocked'),{name:'NotAllowedError'}));this.paused=false;return Promise.resolve()}
}
const fixture=()=>new ForestMusic({intro:'intro',lifeline:'lifeline',cyclone:'cyclone',victory:'mission-accomplished'},{createAudio:url=>new FakeAudio(url)})
const settled=async music=>Promise.all([...music.pending.values()].map(p=>p.catch(()=>{})))
const world={bound:true,position:{x:40,y:12,z:-1000},contains:(x,z)=>Math.abs(x-40)<2400&&z<=-1000&&z>=-3400,distance:z=>-1000-z}
const state=(distance,{x=40,airborne=true,height=15}={})=>({x,z:world.position.z-distance,height,airborne})

test('the existing intro crossfades into Lifeline from media seconds 29 to 33, including after the cinematic ends',async()=>{
 const music=fixture();await music.startIntro()
 for(const [time,intro,lifeline]of [[20,1,0],[29,1,0],[30,.75,.25],[31,.5,.5],[32,.25,.75],[33,0,1],[45,0,1]]){
  music.tracks.intro.currentTime=time;music.update(.016);await settled(music)
  assert.ok(Math.abs(music.tracks.intro.volume-FOREST_MUSIC.volume*intro)<1e-10)
  assert.ok(Math.abs(music.tracks.lifeline.volume-FOREST_MUSIC.volume*lifeline)<1e-10)
  if(time<33)assert.equal(music.tracks.intro.paused,false)
 }
 assert.equal(music.tracks.intro.paused,true);assert.equal(music.tracks.lifeline.paused,false)
 assert.equal(music.tracks.intro.plays,1);assert.equal(music.tracks.lifeline.plays,1)
 assert.equal(music.tracks.intro.loop,false);assert.equal(music.tracks.lifeline.loop,true);assert.equal(music.tracks.cyclone.loop,true)
 music.dispose()
})

test('Cyclone begins at the actual cliff edge while airborne, overrides an unfinished intro and never restarts on desert retries',async()=>{
 const music=fixture();await music.startIntro();music.tracks.intro.currentTime=31;music.update(.05);await settled(music)
 for(const distance of [150,322,550,619]){music.update(.05,{state:state(distance),world});assert.notEqual(music.phase,'cyclone')}
 music.update(.05,{state:state(620),world});await settled(music)
 assert.equal(music.phase,'cyclone');assert.equal(music.tracks.cyclone.plays,1)
 for(let i=0;i<20;i++)music.update(.05,{state:state(650),world})
 assert.equal(music.tracks.cyclone.volume,FOREST_MUSIC.volume);assert.equal(music.tracks.intro.paused,true);assert.equal(music.tracks.lifeline.paused,true)
 const time=music.tracks.cyclone.currentTime=8
 for(let i=0;i<10;i++)music.update(.05,{state:state(550,{airborne:false}),world})
 music.update(.05,{state:state(620),world});await settled(music)
 assert.equal(music.tracks.cyclone.plays,1);assert.equal(music.tracks.cyclone.currentTime,time)
 music.dispose()
})

test('the drop cue follows the curved world-space cliff, excludes forest jumps and handles a checkpoint already below it',()=>{
 assert.equal(reachedDesertDrop(state(620),{...world,bound:false}),false)
 assert.equal(reachedDesertDrop(state(610),world),false)
 const x=600,edge=stage4Edge(x-world.position.x)
 assert.equal(reachedDesertDrop(state(edge-.1,{x}),world),false)
 assert.equal(reachedDesertDrop(state(edge+.1,{x}),world),true)
 assert.equal(reachedDesertDrop(state(700,{airborne:false,height:world.position.y-28}),world),true)
 assert.equal(reachedDesertDrop(state(700,{airborne:false,height:world.position.y+5}),world),false)
})

test('pausing freezes all music and fade progression; blocked playback retries on a gesture and disposal releases every source',async()=>{
 const music=fixture();music.tracks.intro.denied=true
 await assert.rejects(music.startIntro(),{name:'NotAllowedError'})
 for(let i=0;i<20;i++)music.update(.05)
 assert.equal(music.tracks.intro.plays,1,'Do not retry blocked playback every frame')
 music.tracks.intro.denied=false;music.unlock();await settled(music);assert.equal(music.tracks.intro.paused,false)
 music.tracks.intro.currentTime=30;music.update(.05);await settled(music)
 const volumes=Object.values(music.tracks).map(a=>a.volume)
 for(let i=0;i<20;i++)music.update(.1,{paused:true,state:state(650),world})
 assert.deepEqual(Object.values(music.tracks).map(a=>a.volume),volumes);assert.ok(Object.values(music.tracks).every(a=>a.paused))
 assert.equal(music.phase,'intro','Do not trigger a gameplay cue while paused')
 music.update(.05);await settled(music);assert.equal(music.tracks.lifeline.paused,false)
 music.dispose();assert.ok(Object.values(music.tracks).every(a=>a.paused&&a.src===''))
})

test('Mission Accomplished replaces combat once, keeps its media position and only fades when requested after black',async()=>{
 const music=fixture();await music.startLifeline();music.enterDesert();await settled(music)
 await music.startVictory();const audio=music.tracks.victory
 assert.equal(music.phase,'victory');assert.equal(audio.paused,false);assert.equal(audio.loop,false);assert.equal(audio.volume,music.volume)
 assert.ok(['intro','lifeline','cyclone'].every(key=>music.tracks[key].paused&&music.tracks[key].volume===0))
 audio.currentTime=7;await music.startVictory()
 for(let i=0;i<100;i++)music.update(.1,{state:state(650),world})
 assert.equal(audio.plays,1);assert.equal(audio.currentTime,7);assert.equal(audio.volume,music.volume)
 music.setVictoryGain(.5);music.update(.1,{state:state(650),world});assert.equal(audio.volume,music.volume*.5)
 music.update(.1,{paused:true});assert.equal(audio.paused,true)
 music.update(.1);await settled(music);assert.equal(audio.currentTime,7);assert.equal(audio.volume,music.volume*.5)
 music.setVictoryGain(0);music.finishVictory()
 for(let i=0;i<30;i++)music.update(.1,{state:state(650),world})
 assert.equal(audio.volume,0);assert.equal(audio.paused,true);assert.equal(music.phase,'complete');assert.equal(music.needed.size,0)
 music.cancelVictory();await settled(music);assert.equal(music.phase,'lifeline');assert.equal(audio.paused,true);assert.equal(music.tracks.lifeline.paused,false)
 music.dispose()
})

test('the requested soundtrack files are present and nonempty',()=>{
 for(const name of ['02-Robotech-Lifeline.mp3','03-Robotech-Cyclone.mp3','04-Robotech-Mission-Accomplished.mp3'])assert.ok(fs.statSync(new URL('../../../assets/sound/'+name,import.meta.url)).size>1000)
})
