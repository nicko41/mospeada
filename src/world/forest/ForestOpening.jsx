import {useLayoutEffect,useRef,useSyncExternalStore,useEffect} from 'react'
import {useThree} from '@react-three/fiber'
import {Box3,Vector3} from 'three'
import {desktopInput} from '../../player/touchInput.js'
import {setCameraFov} from '../../vehicle/cameraFraming.js'
import {forestSurfaceHeight} from './forestLayout.js'
import {FOREST_CRASH} from './forestCrashConfig.js'
import {forestOpeningState as store} from './forestOpeningState.js'
import {ForestOpeningShot,FOREST_OPENING} from './forestOpeningShot.js'
import musicUrl from '../../../assets/sound/01-intro-Robotech-Roy-Fokker-s-Theme.mp3'
import lifelineUrl from '../../../assets/sound/02-Robotech-Lifeline.mp3'
import cycloneUrl from '../../../assets/sound/03-Robotech-Cyclone.mp3'
import victoryUrl from '../../../assets/sound/04-Robotech-Mission-Accomplished.mp3'
import {ForestMusic} from './ForestMusic.js'
import {stage4World} from './forestStage4Config.js'
import './forestOpening.css'

class OpeningController{
  constructor(runtime,camera,scene){
    Object.assign(this,{runtime,camera,scene});this.active=store.snapshot().phase!=='done';this.holding=false;this.phase='loading';this.elapsed=0;this.suspended=document.hidden;this.disposed=false
    this.music=new ForestMusic({intro:musicUrl,lifeline:lifelineUrl,cyclone:cycloneUrl,victory:victoryUrl},{volume:FOREST_OPENING.volume});this.audio=this.music.tracks.intro
    this.music.suspend(document.hidden)
    this.unlockMusic=()=>this.music.unlock()
    this.musicVisibility=()=>this.music.suspend(document.hidden||!this.active&&runtime.paused)
    window.addEventListener('pointerdown',this.unlockMusic);window.addEventListener('keydown',this.unlockMusic)
    document.addEventListener('visibilitychange',this.musicVisibility)
    if(!this.active){this.music.startLifeline().catch(()=>{});return}
    this.audio.addEventListener('error',()=>{this.audioFailed=true;if(this.phase==='starting'||this.phase==='blocked')this.begin()})
    this.key=event=>{
      if(!this.active||event.ctrlKey||event.metaKey||event.code==='Tab'||event.code==='F5')return
      event.preventDefault();event.stopImmediatePropagation()
      if(event.type!=='keydown'||event.repeat)return
      if(this.phase==='blocked'&&(event.code==='Enter'||event.code==='Space'))this.play()
      else if(event.code==='Escape'||event.code==='Space')this.finish()
    }
    this.visibility=()=>{
      this.suspended=document.hidden
    }
    window.addEventListener('keydown',this.key,true);window.addEventListener('keyup',this.key,true)
    document.addEventListener('visibilitychange',this.visibility)
  }
  prepare(){
    if(this.shot||!this.runtime.state||!this.runtime.cameraController)return
    const {runtime,camera,scene}=this,orbit=runtime.orbit
    this.previous={enabled:orbit.enabled,damping:orbit.enableDamping,paused:runtime.paused}
    orbit.enableDamping=false;orbit.update();orbit.enabled=false
    const wreck=scene.getObjectByName('Forest_crashed_Alpha_Fighter'),alpha= wreck?new Box3().setFromObject(wreck).getCenter(new Vector3()):new Vector3(FOREST_CRASH.x,1,FOREST_CRASH.z)
    this.shot=new ForestOpeningShot(runtime.state,alpha,camera.position,orbit.target,camera.fov)
    this.holding=true;runtime.keys={};runtime.input={};runtime.boostQueued=false
  }
  startupViews(){
    if(!this.active||!this.runtime.state)return []
    const wreck=this.scene.getObjectByName('Forest_crashed_Alpha_Fighter'),alpha=wreck?new Box3().setFromObject(wreck).getCenter(new Vector3()):new Vector3(FOREST_CRASH.x,1,FOREST_CRASH.z)
    const shot=new ForestOpeningShot(this.runtime.state,alpha,this.camera.position,this.runtime.orbit.target,this.camera.fov)
    return [0,1.5,3,4.5,6,7.5,9,10.5,12,13].map(time=>{
      const frame=shot.sample(time),view=this.camera.clone();view.position.copy(frame.position)
      const floor=forestSurfaceHeight(view.position.x,view.position.z);if(Number.isFinite(floor))view.position.y=Math.max(view.position.y,floor+1)
      view.lookAt(frame.target);setCameraFov(view,frame.fov);view.updateMatrixWorld(true);return view
    })
  }
  begin(){if(this.disposed||!this.active)return;this.phase='lead';this.elapsed=0;this.musicStart=this.audio.currentTime;store.set('lead')}
  play(){
    if(this.disposed||!this.active||this.phase==='starting'||this.phase==='lead'||this.phase==='playing')return
    this.prepare();if(!this.shot)return
    if(this.audioFailed){this.music.startLifeline().catch(()=>{});this.begin();return}
    this.phase='starting'
    this.music.startIntro().then(()=>{if(!this.disposed&&this.active)this.begin()}).catch(error=>{
      if(this.disposed||!this.active)return
      if(error.name==='NotAllowedError'){this.phase='blocked';store.set('blocked')}
      else{this.audioFailed=true;this.begin()}
    })
  }
  update(delta){
    this.music.update(delta,{paused:document.hidden||!this.active&&this.runtime.paused,state:this.runtime.state,world:stage4World.get()})
    if(!this.active)return false
    if(this.phase==='loading'&&desktopInput.ready)this.play()
    if(!this.shot)return false
    const dt=Math.min(Math.max(delta,0),.1)
    if(!this.suspended){
      if(this.phase==='lead'){
        this.elapsed+=dt
        const lead=this.audioFailed?this.elapsed:this.audio.currentTime-this.musicStart
        if(lead>=FOREST_OPENING.musicLead){this.phase='playing';this.elapsed=0;store.set('playing')}
      }else if(this.phase==='playing')this.elapsed+=dt
    }
    const frame=this.shot.sample(this.phase==='playing'?this.elapsed:0)
    this.camera.position.copy(frame.position)
    const floor=forestSurfaceHeight(frame.position.x,frame.position.z)
    if(Number.isFinite(floor))this.camera.position.y=Math.max(this.camera.position.y,floor+1)
    this.camera.lookAt(frame.target);setCameraFov(this.camera,frame.fov)
    store.opacity(this.phase==='playing'?frame.opacity:1)
    if(frame.complete){this.finish();return false}
    return true
  }
  restore(){
    if(!this.previous)return
    const {runtime,camera,shot,previous}=this,orbit=runtime.orbit
    camera.position.copy(shot.endPosition);orbit.target.copy(shot.endTarget);setCameraFov(camera,shot.endFov)
    orbit.enableDamping=false;orbit.update();orbit.enableDamping=previous.damping;orbit.enabled=previous.enabled
    runtime.cameraController.anchor.copy(runtime.cameraController.center(runtime.state))
    runtime.cameraController.lastInput=runtime.cameraController.time
    runtime.paused=previous.paused||document.hidden;runtime.keys={};runtime.input={};runtime.boostQueued=false
    this.previous=null
  }
  finish(){
    if(!this.active)return
    if(!this.music.started)this.music.startIntro().catch(()=>{})
    this.prepare();this.restore();this.active=false;this.holding=false;this.phase='done';store.opacity(0);store.set('done')
  }
  dispose(){
    this.disposed=true;this.restore();this.active=false;this.holding=false
    if(this.key){window.removeEventListener('keydown',this.key,true);window.removeEventListener('keyup',this.key,true);document.removeEventListener('visibilitychange',this.visibility)}
    window.removeEventListener('pointerdown',this.unlockMusic);window.removeEventListener('keydown',this.unlockMusic);document.removeEventListener('visibilitychange',this.musicVisibility)
    this.music.dispose()
  }
}

export default function ForestOpening({runtime}){
  const {camera,scene}=useThree()
  useLayoutEffect(()=>{
    const controller=new OpeningController(runtime,camera,scene);runtime.opening=controller;store.bind(controller)
    if(import.meta.env.DEV)window.__FOREST_OPENING__=controller
    return()=>{controller.dispose();if(runtime.opening===controller)delete runtime.opening;store.bind(null);if(import.meta.env.DEV)delete window.__FOREST_OPENING__}
  },[runtime,camera,scene])
  return null
}

export function ForestOpeningOverlay(){
  const state=useSyncExternalStore(store.subscribe,store.snapshot),start=useRef()
  useEffect(()=>{if(state.phase==='blocked')start.current?.focus()},[state.phase])
  if(state.phase==='done')return null
  return <div className="forest-opening" aria-label="Introducción al bosque">
    <div className="forest-opening-veil" ref={store.bindVeil}/>
    {state.phase==='blocked'&&<button className="forest-opening-start" ref={start} onClick={()=>store.start()}>Entrar al bosque</button>}
    {state.phase!=='loading'&&<button className="forest-opening-skip" onClick={()=>store.skip()}>Omitir intro · Esc</button>}
  </div>
}
