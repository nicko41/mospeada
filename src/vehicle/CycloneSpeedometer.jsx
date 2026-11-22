import {useId,useLayoutEffect,useRef} from 'react'
import {cycloneGaugeSegments} from '../ui/cycloneGauge.js'
import {instrumentLevel,speedometerValue} from '../ui/cycloneInstrumentModel.js'
import {fitCycloneReadout,cycloneFontReady} from '../ui/cycloneReadout.js'

export default function CycloneSpeedometer({speed=0,maximum,reverse=false,armor=false}){
  const number=useRef(),id='cyclone-speed-'+useId().replace(/[^a-z0-9]/gi,''),value=speedometerValue(speed),lit=instrumentLevel(Math.abs(speed),maximum,cycloneGaugeSegments.length)
  useLayoutEffect(()=>{
    let mounted=true
    const fit=()=>{if(mounted&&number.current)fitCycloneReadout(number.current,value,{x:400,y:139,width:226,height:114,align:'end'})}
    fit();cycloneFontReady.then(fit);return()=>{mounted=false}
  },[value])
  return <div className="ride-speed" role="img" aria-label={`Velocidad ${Number(value)} kilómetros por hora${reverse?' · reversa':''}`}>
    <svg className="cyclone-instrument cyclone-speedometer" viewBox="110 35 565 315" aria-hidden="true">
      <defs><filter id={id} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="2.8"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g className="speed-segments">{cycloneGaugeSegments.map((s,i)=><path key={i} d={s.d} className={`segment${i<lit?' on':''}`} style={{'--lamp':s.color}}/>)}</g>
      <g ref={number} className="speed-readout" filter={`url(#${id})`}/>
      <text className="speed-unit" x="626" y="282" textAnchor="end" fontSize="23">KM/H</text>
      <text className="speed-mode" x="626" y="310" textAnchor="end" fontSize="17">{reverse?'R':armor?'ARMOR':'D'}</text>
    </svg>
  </div>
}
