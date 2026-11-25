import {Component,useLayoutEffect} from 'react'
import {useGLTF} from '@react-three/drei'
import {attachScottHDVisual} from './scottHDVisualAdapter.js'
import {SCOTT_HD_MODEL,scottVisualVariantState as state} from './scottVisualVariantState.js'

export class ScottHDVisualBoundary extends Component{
 state={failed:false}
 static getDerivedStateFromError(){return{failed:true}}
 componentDidCatch(error){state.set({status:'error',error:error.message})}
 render(){return this.state.failed?null:this.props.children}
}
export default function ScottHDVisual({instance}){
 const asset=useGLTF(SCOTT_HD_MODEL)
 useLayoutEffect(()=>{
  const visual=attachScottHDVisual(instance,asset.scene);state.set({status:'ready',error:null})
  return()=>visual.dispose()
 },[asset.scene,instance])
 return null
}
