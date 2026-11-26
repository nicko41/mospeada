import { useMemo } from 'react'
import { useFrame,useThree } from '@react-three/fiber'
import { ForestBatch } from './ForestBatch.js'
import {usePreparedResource,prepareResource} from '../../loading/preparedResources.js'
import {workQueue} from '../../loading/workQueue.js'

export default function ForestInstances(props){return props.deferred?<DeferredInstances {...props}/>:<ImmediateInstances {...props}/>}
const batchKey=props=>'batch:'+props.name+':'+props.part.geometry.uuid
const createBatch=({part,placements,bounds,kind,distance,minimum=0,heightAt})=>workQueue.submit(()=>new ForestBatch(part,placements,bounds,kind,distance,minimum,heightAt),'stage2 batch')
export const prepareForestInstances=(gl,props)=>prepareResource(gl,batchKey(props),()=>createBatch(props))
function DeferredInstances({part,placements,bounds,kind,distance,minimum=0,name,heightAt}){
 const {gl}=useThree()
 const props={part,placements,bounds,kind,distance,minimum,name,heightAt},batch=usePreparedResource(gl,batchKey(props),()=>createBatch(props))
 return <BatchInstance batch={batch} name={name} kind={kind} placements={placements}/>
}
function ImmediateInstances({ part, placements, bounds, kind, distance, minimum = 0, name,heightAt }) {
  const batch = useMemo(() => new ForestBatch(part, placements, bounds, kind, distance, minimum,heightAt),
    [part, placements, bounds, kind, distance, minimum,heightAt])
  return <BatchInstance batch={batch} name={name} kind={kind} placements={placements}/>
}
function BatchInstance({batch,name,kind,placements}){
  // Camera controllers run at priority 0. Distance/LOD follows their final pose;
  // native per-instance frustum culling then runs inside render (priority 1).
  useFrame(({ camera }) => batch.updateDistance(camera), .5)
  return <primitive object={batch} name={name} dispose={null}
    userData={{ forest: true, forestKind: kind, forestCapacity: placements.length }} />
}
