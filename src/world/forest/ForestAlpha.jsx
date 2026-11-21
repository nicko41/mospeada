import { useLayoutEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { registerColliders } from '../../player/collisionWorld.js'
import { FOREST_CRASH, crashLocal } from './forestCrashConfig.js'
import { alphaCrashColliders, alphaCrashPlacement, alphaDamageMaterial } from './forestAlpha.js'
import { forestSurfaceHeight } from './forestLayout.js'
import { BatchedMesh, Color, Matrix4, Object3D } from 'three'
import { crashWorld } from './forestCrashDressing.js'
import { crashTrackCenter } from './forestCrashSite.js'

export const preloadForestAlpha=()=>useGLTF.preload(FOREST_CRASH.model)

function impactDebris(assets) {
  const rock=assets.find(a=>a.name==='Pebble_Square_3').parts[0]
  return [rock].map(part=>{
    const count=16,batch=new BatchedMesh(count,part.geometry.attributes.position.count,part.geometry.index.count,part.material)
    const id=batch.addGeometry(part.geometry),obj=new Object3D(),m=new Matrix4()
    for(let i=0;i<count;i++){
      const angle=i*2.39996,along=1+i*1.9,p=crashWorld(crashTrackCenter(along)+(i%2?1:-1)*(2.6+(i%3)*.17),along),{x,z}=p
      obj.position.set(x,forestSurfaceHeight(x,z)+.025,z);obj.rotation.set(.12*Math.sin(i),angle,.1*Math.cos(i))
      obj.scale.set(.24+(i%3)*.07,.21,.28+(i%4)*.05);obj.updateMatrix()
      const instance=batch.addInstance(id);batch.setMatrixAt(instance,m.multiplyMatrices(obj.matrix,part.transform));batch.setColorAt(instance,new Color('#8d8270'))
    }
    batch.name='Forest_crash_displaced_stones';batch.userData.forest=true;batch.sortObjects=false;batch.computeBoundingBox();batch.computeBoundingSphere()
    return batch
  })
}

export default function ForestAlpha({assets}) {
  const loaded=useGLTF(FOREST_CRASH.model)
  const instance=useMemo(()=>{
    const model=loaded.scene.clone(true),placement=alphaCrashPlacement(model),materials=[]
    model.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=alphaDamageMaterial(mesh.material,placement.scale*FOREST_CRASH.previousLength/FOREST_CRASH.length);materials.push(mesh.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Alpha_crashed_fuselage';mesh.userData.alphaWreck=true})
    model.matrix.copy(placement.sourceMatrix);model.matrixAutoUpdate=false
    return {model,placement,colliders:alphaCrashColliders(placement),debris:impactDebris(assets),materials}
  },[loaded,assets])
  useLayoutEffect(()=>{
    const unregister=registerColliders(instance.colliders)
    if(import.meta.env.DEV)window.__FOREST_ALPHA__={...instance,source:loaded.scene,config:FOREST_CRASH,crashLocal}
    return()=>{unregister();if(import.meta.env.DEV)delete window.__FOREST_ALPHA__}
  },[instance,loaded])
  return <>
    <group name="Forest_crashed_Alpha_Fighter" matrix={instance.placement.matrix} matrixAutoUpdate={false} dispose={null}>
      <primitive object={instance.model}/>
    </group>
    {instance.debris.map(mesh=><primitive key={mesh.name} object={mesh} dispose={null}/>)}
  </>
}
