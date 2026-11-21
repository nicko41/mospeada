import {useEffect,useLayoutEffect,useMemo,useState} from 'react'
import {Html,useTexture} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import {createTreeCanopyTest} from './treeCanopyTest.js'
import {isCanopyTestTree,treeCanopyTestMode,TREE_CANOPY_TEST} from './treeCanopyTestConfig.js'
import {forestLayout,forestSurfaceHeight} from './forestLayout.js'
import {timeOfDayState} from '../TimeOfDay.jsx'
import largeUrl from '../../../assets/texturas/follaje/follaje1.png'
import edgeUrl from '../../../assets/texturas/follaje/follaje2.png'

export default function ForestCanopyTest({assets}){const mode=treeCanopyTestMode();return mode==='off'?null:<CanopyComparison assets={assets} initialMode={mode}/>}
function CanopyComparison({assets,initialMode}){
 const atlases=useTexture([largeUrl,edgeUrl]),[mode,setMode]=useState(initialMode)
 const resources=useMemo(()=>createTreeCanopyTest(assets.find(a=>a.name===TREE_CANOPY_TEST.name),forestLayout[TREE_CANOPY_TEST.name].find(isCanopyTestTree),atlases,forestSurfaceHeight),[assets,atlases[0],atlases[1]])
 useLayoutEffect(()=>{resources.setMode(mode)},[resources,mode])
 useEffect(()=>{resources.refs=(resources.refs||0)+1;if(import.meta.env.DEV)window.__FOREST_CANOPY_TEST__=resources;return()=>{resources.refs--;setTimeout(()=>{if(!resources.refs)resources.dispose()},0);if(import.meta.env.DEV&&window.__FOREST_CANOPY_TEST__===resources)delete window.__FOREST_CANOPY_TEST__}},[resources])
 useFrame(()=>{resources.day.value=timeOfDayState.value})
 return <><primitive object={resources.root} dispose={null}/><Html fullscreen style={{pointerEvents:'none'}}><div style={{position:'absolute',right:24,bottom:150,pointerEvents:'auto',padding:12,background:'#152a24e8',color:'#f3f0dc',borderRadius:8,font:'13px system-ui'}}><div style={{marginBottom:8}}>Prueba de copa · un árbol</div>{[['original','A · Original'],['anime','B · Anime'],['compare','A/B · Comparar']].map(([value,label])=><button key={value} onClick={()=>setMode(value)} style={{marginRight:5,padding:7,background:mode===value?'#bacd9d':'#354a40',color:mode===value?'#14291b':'#fff',border:0,borderRadius:4,cursor:'pointer'}}>{label}</button>)}</div></Html></>
}
