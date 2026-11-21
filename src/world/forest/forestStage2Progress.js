import {FOREST_STAGE2 as S,inForestStage2,stage2Void,stage2Checkpoint} from './forestStage2Config.js'
export class ForestStage2Progress{
  constructor(){this.reset()}
  reset(){this.checkpoint=null;this.recoveries=0}
  observe(s){
    // The checkpoint is a fixed tested ground pose, not the current bike pose.
    // Arm it even if a fast first jump is still airborne over the trigger.
    if(!this.checkpoint&&s.z<S.checkpointTriggerZ&&s.z>S.canyon.lipZ&&Number.isFinite(s.height))this.checkpoint=stage2Checkpoint()
  }
  airEnabled(s,phase='idle'){return phase==='idle'&&inForestStage2(s.x,s.z)}
  allowsVoid(x,z){return stage2Void(x,z)}
  needsRecovery(s){return !!this.checkpoint&&(s.height<S.fallY||!Number.isFinite(s.height))}
  recover(resetAt){if(!this.checkpoint)return false;this.recoveries++;resetAt(this.checkpoint);return true}
}
