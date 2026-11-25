import {Vector3} from 'three'
import {FOREST_STAGE3,stage3Height,stage3PathX} from './forestStage3Config.js'
import {stage4ForestHeight,stage4DesertHeight,stage4Path} from './forestStage4Config.js'

// Render future route templates under the entry loader. Do not bind the
// descent, recycle terrain, spawn enemies or advance encounter clocks.
export function forestFirstPassViews(scene,camera){
  const views=[],target=new Vector3()
  const add=(root,x,y,z,direction,far,updateVisibility)=>{
    const view=camera.clone();view.far=far;view.position.set(x,y+2.4,z)
    target.set(x,y+1.2,z+direction*35);view.lookAt(target);view.updateProjectionMatrix();view.updateMatrixWorld(true)
    views.push({camera:view,root,updateVisibility,label:root.name})
  }
  const drones=scene.getObjectByName('Forest_Plano_3_recycled_route')
  if(drones)for(let i=0;i<FOREST_STAGE3.chunks;i++){
    const z=FOREST_STAGE3.startZ-(i+.5)*FOREST_STAGE3.chunkLength,x=stage3PathX(z),y=stage3Height(x,z)
    for(const direction of [-1,1])add(drones,x,y,z,direction,700,view=>drones.update(view))
  }
  const descent=scene.getObjectByName('Forest_Plano_4_Desert_Descent')
  if(descent){
    for(const distance of [48,144,240,336,432,528,610,820,1280]){
      const z=-distance,x=stage4Path(z),y=distance<620?stage4ForestHeight(x,z):stage4DesertHeight(x,z)
      for(const direction of [-1,1])add(descent,x+descent.position.x,y+descent.position.y,z+descent.position.z,direction,distance<620?700:4000,view=>descent.prepareViewVisibility(view))
    }
  }
  return views
}
