import {unpackTree} from './geometryTransfer.js'
import {prepareRideSurfaceGeometrySteps} from '../vehicle/rideSurface.js'
import {workQueue} from './workQueue.js'
let worker,sequence=0
const pending=new Map(),records=new Map()
let stage4Contacts
export function prepareStage4Terrain(){
 return stage4Contacts ||=prepareTerrain('stage4').then(async terrain=>{
  for(const geometry of [...terrain.forest,...terrain.desert])await workQueue.drain(prepareRideSurfaceGeometrySteps(geometry),'stage4 contact grid')
  return terrain
 })
}
export function prepareTerrain(kind){
 if(records.has(kind))return records.get(kind)
 worker||=new Worker(new URL('./terrainWorker.js',import.meta.url),{type:'module'})
 worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);if(data.error)task.reject(Error(data.error));else{const result=unpackTree(data.result);if(task.kind==='stage2'&&result.sides)result.sides.dispose=()=>{for(const t of result.sides.tiles)for(const g of [...t.tops,t.cliffs,t.bed,t.river])g.dispose()};task.resolve(result)}if(!pending.size){worker.terminate();worker=null}}
 worker.onerror=error=>{for(const task of pending.values())task.reject(Error(error.message));pending.clear()}
 const promise=new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject,kind});worker.postMessage({id,kind})});promise.catch(()=>{});records.set(kind,promise);return promise
}
