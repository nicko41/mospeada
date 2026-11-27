const wrap=value=>(value%1+1)%1

export class MovementSounds{
  constructor(audio){this.audio=audio;this.actor=null;this.armor=null;this.boostCount=0;this.strafe='';this.airborne=false;this.gait=null}
  update({state,armor=null,instance=null,input={},enabled=true,paused=false}){
    const boostCount=state?.boostCount||0
    const strafe=armor?.boosting?`${Math.sign(input.walkForward||0)}:${Math.sign(input.walkSide||0)}`:''
    if(this.actor!==state){this.actor=state;this.boostCount=boostCount;this.strafe=strafe;this.gait=null;this.airborne=false;this.armor=armor;return}
    if(!enabled||paused){this.boostCount=boostCount;this.strafe=strafe;this.gait=null;return}
    if(!armor&&state?.riderMode==='mounted'&&boostCount>this.boostCount)this.audio.play('cycloneBoost')
    this.boostCount=boostCount
    if(armor!==this.armor){this.armor=armor;this.strafe='';this.airborne=false;this.gait=null}
    if(armor&&strafe&&strafe!==this.strafe)this.audio.play('armorStrafe')
    this.strafe=strafe
    if(!armor){this.gait=null;this.airborne=false;return}
    const grounded=armor.grounded||['impact','recover'].includes(armor.groundLanding?.phase)
    if(!grounded&&(armor.height>.2||armor.jump?.launched||armor.groundLanding?.phase==='descend'))this.airborne=true
    const landed=grounded&&this.airborne
    if(landed){this.airborne=false;this.audio.play('armorLanding');this.gait=null}
    const action=instance?.action,info=instance?.armorLocomotion?.info.get(instance.clip)
    if(landed||!grounded||armor.mode!=='ARMOR_GROUND'||armor.jump||armor.groundLanding||armor.knockedDown||armor.speed<.15||!info?.contactPhases||!action){this.gait=null;return}
    // The evaluated native mixer supplies the contacts, including backwards
    // walking, run speed and phase wrap. No separate footstep clock or pose.
    const phase=wrap(action.time/action.getClip().duration),previous=this.gait
    this.gait={phase,clip:instance.clip}
    if(!previous||previous.clip!==instance.clip)return
    const reverse=action.getEffectiveTimeScale()<0,travel=reverse?wrap(previous.phase-phase):wrap(phase-previous.phase)
    if(travel<1e-6)return
    for(const contact of info.contactPhases){
      const distance=reverse?wrap(previous.phase-contact):wrap(contact-previous.phase)
      if(distance>1e-6&&distance<=travel+1e-6)this.audio.play('armorStep')
    }
  }
}
