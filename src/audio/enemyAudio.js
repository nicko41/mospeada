// Softer falloff: retain distance cues without burying nearby enemies under
// the player's weapon. The final fade prevents a hard audible range edge.
export function enemyDistanceGain(distance){
  if(!Number.isFinite(distance)||distance>=200)return 0
  const d=Math.max(0,distance)
  return 1/(1+(d/50)**2)*Math.min(1,(200-d)/40)
}
export function playEnemyExplosion(audio,name,target,listener){
  const p=target?.position||target
  const gain=p&&listener?enemyDistanceGain(Math.hypot(p.x-listener.x,p.y-listener.y,p.z-listener.z)):1
  return audio.play(name,{gain})
}
