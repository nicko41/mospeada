import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { FrontBattloidTransform } from './FrontBattloidTransform.js'
import { frontTransformState as store } from './frontTransformState.js'
import { FrontTransformEntry } from './FrontTransformEntry.js'
import { RearBattloidTransform } from './RearBattloidTransform.js'
import { GuardBattloidTransform } from './GuardBattloidTransform.js'
import { WheelBattloidTransform } from './WheelBattloidTransform.js'
import { SuspensionHideTransform } from './SuspensionHideTransform.js'
import { TransformationFrame } from './TransformationFrame.js'
import { wheelArmorState } from './wheelArmorState.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export default function FrontTransformation({ rig, runtime }) {
  const data = useRef(null), effect = useRef(null),rear=useRef(null),guards=useRef(null),wheels=useRef(null),suspension=useRef(null),frame=useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    // The renderer can prepare derived Armor meshes before the first T.
    // Resolve after their construction, never by playing the transformation.
    let prepared
    const preparation = new Promise(resolve => { prepared = resolve })
    rig.root.userData.armorPreparation = preparation
    runtime.finishArmorPreparation = prepared
    store.reset(); store.set({ready:false,error:''})
    const read=url=>fetch(url,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('No se pudo cargar la configuración Battloid');return r.json()})
    Promise.all([read('/transformations/cyclone-front-battloid.json'),read('/transformations/cyclone-rear-battloid.json'),read('/transformations/cyclone-guard-battloid.json'),read('/transformations/cyclone-wheel-battloid.json'),read('/transformations/cyclone-suspension-hide.json')])
      .then(async([front,rear,guards,wheels,suspension])=>({front,rear,guards,wheels,suspension,geometry:(await new GLTFLoader().loadAsync(rear.geometryUrl)).scene}))
      .then(value=>{if(!controller.signal.aborted)data.current=value})
      .catch(error=>{prepared();if(error.name!=='AbortError')store.set({error:error.message})})
    const down = e => {
      if(e.code!=='KeyT'||e.repeat||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return
      e.preventDefault();store.request()
    }
    window.addEventListener('keydown',down)
    return()=>{prepared();if(rig.root.userData.armorPreparation===preparation)delete rig.root.userData.armorPreparation;delete runtime.finishArmorPreparation;controller.abort();window.removeEventListener('keydown',down);frame.current?.dispose();frame.current=null;suspension.current?.dispose();suspension.current=null;wheels.current?.dispose();wheels.current=null;guards.current?.dispose();guards.current=null;rear.current?.dispose();rear.current=null;effect.current?.restore();runtime.transformEntry?.reset();store.bindEntry(null);effect.current=null;data.current=null;delete runtime.frontTransformation;delete runtime.rearTransformation;delete runtime.guardTransformation;delete runtime.wheelTransformation;delete runtime.suspensionTransformation;delete runtime.transformationFrame;delete runtime.transformEntry;store.set({ready:false});if(import.meta.env.DEV)delete window.__FRONT_BATTLOID__}
  },[rig,runtime])
  // Restore before the unmodified vehicle articulation/suspension step.
  useFrame(()=>{frame.current?.restore();suspension.current?.restore();wheels.current?.restore();guards.current?.restore();rear.current?.restore();effect.current?.restore()},-2.1)
  // Scott has finished posing at -1. Follow his chest position using the
  // reference model's axes, without inheriting the animated spine rotation.
  useFrame((_,delta)=>{
    if(!effect.current&&data.current&&runtime.scottInstance){
      try{
        frame.current=new TransformationFrame(rig)
        effect.current=new FrontBattloidTransform(rig,runtime.scottInstance,data.current.front)
        rear.current=new RearBattloidTransform(rig,effect.current,data.current.rear,data.current.geometry)
        guards.current=new GuardBattloidTransform(rig,runtime.scottInstance,data.current.guards)
        wheels.current=new WheelBattloidTransform(rig,effect.current,rear.current,data.current.wheels)
        suspension.current=new SuspensionHideTransform(rig,effect.current,guards.current,data.current.suspension)
        runtime.frontTransformation=effect.current
        runtime.rearTransformation=rear.current
        runtime.guardTransformation=guards.current
        runtime.wheelTransformation=wheels.current
        runtime.suspensionTransformation=suspension.current
        runtime.transformationFrame=frame.current
        runtime.transformEntry=new FrontTransformEntry(store,runtime);store.bindEntry(runtime.transformEntry)
        store.set({ready:true,surfaces:effect.current.parts.length+rear.current.parts.length+guards.current.parts.length+wheels.current.parts.length,warnings:data.current.front.issues})
        if(import.meta.env.DEV)window.__FRONT_BATTLOID__={effect:effect.current,rear:rear.current,guards:guards.current,wheels:wheels.current,suspension:suspension.current,frame:frame.current,wheelSettings:wheelArmorState,data:data.current.front,store,entry:runtime.transformEntry}
        runtime.finishArmorPreparation?.()
      }catch(error){runtime.finishArmorPreparation?.();store.set({error:error.message});data.current=null}
    }
    if(!effect.current)return
    if(!runtime.paused)store.advance(Math.min(delta,.25),runtime.transformEntry?.assemblyDuration)
    // Scott has already received actorOffset at -1. Move Motorcycle's source
    // frame by that same world offset once, before posing every component.
    frame.current.apply(runtime.transformEntry?.actorOffset)
    const choreography=runtime.transformEntry?.choreography
    const mechanical=choreography?.mechanicalProgress??store.snapshot().progress
    const assembly=runtime.transformEntry?.returnFlight?mechanical:store.snapshot().progress
    effect.current.apply(assembly,choreography)
    rear.current?.apply(mechanical,choreography)
    guards.current?.apply(assembly,choreography)
    wheels.current?.apply(mechanical,wheelArmorState.snapshot())
    suspension.current?.apply(assembly)
  },-.75)
  return null
}
