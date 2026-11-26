import {createStage2Terrain} from '../world/forest/forestStage2Terrain.js'
import {createCanyonSides} from '../world/forest/forestCanyonSides.js'
import {createStage4Terrain} from '../world/forest/forestStage4Terrain.js'
import {packTree} from './geometryTransfer.js'
self.onmessage=({data:{id,kind}})=>{
 try{
  const start=performance.now(),value=kind==='stage2'?{terrain:createStage2Terrain(),sides:createCanyonSides()}:createStage4Terrain(),buffers=new Set(),result=packTree(value,buffers)
  self.postMessage({id,result,ms:performance.now()-start},[...buffers])
 }catch(error){self.postMessage({id,error:error.stack||error.message})}
}
