// Legacy animation/controller source. The visible version is selected below;
// V3 keeps a separate native skeleton and receives bind-space retargeting.
export const SCOTT_MODEL_VARIANT='gear-v2'
// Material-only copy. Set to 'source' to recover V2's previous palette.
export const SCOTT_GEAR_V2_PALETTE='classic'
// Set false to restore the approved shape before the rear-only refinement.
export const SCOTT_V2_REAR_REFINEMENT=true
export const SCOTT_V3_MODEL='/models/mospeada/scott-gear-v3-animated.glb'
// Visible selection is independent of the legacy animation/controller proxy.
export const SCOTT_INITIAL_SELECTION='v3'
export const SCOTT_RIG_REFERENCE='/models/mospeada/scott-bernard-animated-original.glb'
export const SCOTT_V2_MODEL=SCOTT_GEAR_V2_PALETTE==='classic'
 ?(SCOTT_V2_REAR_REFINEMENT
  ?'/models/mospeada/scott-bernard-gear-v2-rear-refined.glb'
  :'/models/mospeada/scott-bernard-gear-v2-classic-palette.glb')
 :'/models/mospeada/scott-bernard-gear-v2-animated.glb'
export const SCOTT_MODEL=SCOTT_MODEL_VARIANT==='gear-v2'
 ?SCOTT_V2_MODEL:SCOTT_RIG_REFERENCE
export const SCOTT_ORIGINAL_SHOULDER_MAPS=SCOTT_MODEL_VARIANT==='original'
