const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)
const copy=p=>({x:p.x,y:p.y,z:p.z})
export function createCinematicCombatEvents(){
 const pending=[],projectiles=new Set()
 return {
  emit(kind,point,{strength=1,direction=null,style='earth'}={}){
   if(!['blast','ground','explosion'].includes(kind)||!finite(point)||!Number.isFinite(strength)||strength<=0)return
   const e={kind,point:copy(point),strength:Math.min(2,strength),direction:finite(direction)?copy(direction):null,style}
   const previous=pending.find(v=>v.kind===kind&&Math.hypot(v.point.x-e.point.x,v.point.y-e.point.y,v.point.z-e.point.z)<.5)
   if(previous){previous.strength=Math.max(previous.strength,e.strength);return}
   if(pending.length<24)pending.push(e)
   else {const i=pending.findIndex(v=>v.kind!=='explosion'&&v.strength<e.strength);if(i>=0)pending[i]=e}
  },
  // Collect references only. Detection runs after gameplay/camera updates and
  // never writes into the authoritative projectile pool or its physics.
  observeProjectile(b){if(b?.active&&projectiles.size<128)projectiles.add(b)},
  drain(){return pending.splice(0)},drainProjectiles(){const result=[...projectiles];projectiles.clear();return result},
  clear(){pending.length=0;projectiles.clear()},
 }
}
export const cinematicCombatEvents=createCinematicCombatEvents()
