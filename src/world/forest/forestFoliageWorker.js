import {generateFoliageWorld} from './forestFoliageDistribution.js'
import {generateStage2FoliageWorld,STAGE2_FOLIAGE_KEY} from './forestStage2Foliage.js'
self.onmessage=({data})=>{
  try{const generate=data.key===STAGE2_FOLIAGE_KEY?generateStage2FoliageWorld:generateFoliageWorld,world=generate(value=>self.postMessage({progress:value})),transfer=[];for(const s of world.sectors)for(const key of ['matrices','colours','rects','forms','fades'])transfer.push(s[key].buffer);self.postMessage({world},transfer)}
  catch(error){self.postMessage({error:error.message})}
}
