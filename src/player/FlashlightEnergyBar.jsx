import { useEffect, useRef } from 'react'
import { phoneLightState } from './PhoneLight'

export default function FlashlightEnergyBar() {
  const bar = useRef(), label = useRef(), fill = useRef()
  useEffect(() => {
    let previous = -1
    const update = () => {
      const percent = Math.round(phoneLightState.energy * 100)
      if (percent === previous) return
      previous = percent
      label.current.textContent = `${percent}%`
      fill.current.style.transform = `scaleX(${phoneLightState.energy})`
      bar.current.setAttribute('aria-valuenow', percent)
    }
    update()
    const timer = window.setInterval(update, 100)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="flashlight-energy">
    <div className="player-health-label"><span>F · LUZ</span><span ref={label}>100%</span></div>
    <div ref={bar} className="player-health-track" role="progressbar" aria-label="Energía del mobile"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
      <div ref={fill} className="player-health-fill" />
    </div>
  </div>
}
