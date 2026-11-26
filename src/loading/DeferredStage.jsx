import {Suspense,createContext,useContext,useLayoutEffect,useRef,useSyncExternalStore} from 'react'
import {useThree} from '@react-three/fiber'
import {stageStreaming} from './stageStreaming.js'
import {animeState} from '../rendering/animeState.js'
const PreparationRoots=createContext(null)
export function useStagePreparationRoot(object){
 const roots=useContext(PreparationRoots)
 useLayoutEffect(()=>{if(!roots)return;roots.add(object);object.userData.stagePrepared=false;return()=>roots.delete(object)},[roots,object])
}
function PreparedPart({id,children}){
 const root=useRef(),external=useRef(new Set()),{scene}=useThree()
 useLayoutEffect(()=>{
  let cancelled=false
  const run=async()=>{
   const effect=scene.userData.animeRenderer
   if(!effect)throw Error('Missing stage renderer')
   root.current.userData.preparationRoots=external.current
   await effect.prepareStage(root.current,id)
   if(cancelled)return
   for(const object of external.current)object.userData.stagePrepared=true
   root.current.traverse(object=>{if(object.userData.streamingPrepared===false)object.userData.streamingPrepared=true})
   root.current.visible=true;stageStreaming.partReady(id,root.current.uuid)
  }
  run().catch(error=>{if(!cancelled){stageStreaming.fail(id,error);console.error('Stage preparation',id,error)}})
  return()=>{cancelled=true}
 },[id,scene])
 return <PreparationRoots.Provider value={external.current}><group ref={root} visible={false} name={'Prepared_'+id}>{children}</group></PreparationRoots.Provider>
}
export function DeferredStage({id,children}){
 useSyncExternalStore(stageStreaming.subscribe,stageStreaming.snapshot)
 const render=useSyncExternalStore(animeState.subscribe,animeState.snapshot)
 const phase=stageStreaming.states[id].phase
 const previous={stage4:'stage3',scouts:'stage3',horizon:'stage4',rand:'stage3'}[id]
 const allowed=(id==='stage2'?render.ready:render.openingReady)&&(!previous||stageStreaming.prepared(previous))
 return allowed&&['mounting','prepared','ready'].includes(phase)?<Suspense fallback={null}><PreparedPart id={id}>{children}</PreparedPart></Suspense>:null
}
