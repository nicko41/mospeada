// Scout-specific source coordinates (+Y up, face +Z), before gameplay scale.
// These five joints are the entire rig: no elbow, knee or claw articulation.
export const SCOUT_JOINTS=Object.freeze([
  {name:'body_root',pivot:[0,0,0]},
  {name:'arm_L',pivot:[.36,.36,.075]},
  {name:'arm_R',pivot:[-.34,.31,.065]},
  {name:'leg_L',pivot:[.18,.18,-.045]},
  {name:'leg_R',pivot:[-.18,.16,-.045]},
])
export const SCOUT_MOTION=Object.freeze({groundSpeed:.9,walkCycle:1.4,blend:.16,clawDuration:.78,clawImpact:.24,landingContact:.45,landingDuration:.75})
