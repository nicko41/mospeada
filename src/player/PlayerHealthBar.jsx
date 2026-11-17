import { useSyncExternalStore } from 'react'
import { getPlayerHealth, subscribePlayerHealth, playerCombat } from './playerCombat'

export default function PlayerHealthBar() {
  const health = useSyncExternalStore(subscribePlayerHealth, getPlayerHealth)
  const max = playerCombat.playerMaxHealth
  return <div className="player-health">
    <div className="player-health-label"><span>VIDA</span><span>{health} / {max}</span></div>
    <div className="player-health-track" role="progressbar" aria-label="Vida del jugador"
      aria-valuemin={0} aria-valuemax={max} aria-valuenow={health}>
      <div className="player-health-fill" style={{ transform: `scaleX(${health / max})` }} />
    </div>
  </div>
}
