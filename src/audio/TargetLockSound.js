export class TargetLockSound{
  constructor(audio){this.audio=audio;this.actor=null;this.announced=new WeakSet()}
  update({lock,aiming,state,enabled=true}){
    if(this.actor!==state){this.actor=state;this.announced=new WeakSet()}
    const target=lock?.target
    if(!enabled||!aiming||!lock?.ready||!target||this.announced.has(target))return
    if(this.audio.play('targetLock'))this.announced.add(target)
  }
}
