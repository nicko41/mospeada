// Riding-only fit. Bind pose, source clips, bike and other control modes stay
// independent of these values. Distances are in the Cyclone body frame.
export const scottV2RidingConfig={
 enabled:true,
 // One reversible selection: 'previous' retains the preceding riding pose.
 variant:'air-squat-seated',
 seated:{rearShift:.16,pelvisLift:.08,kneePoleForward:.10,minLean:30*Math.PI/180,maxLean:65*Math.PI/180,elbowFlex:18*Math.PI/180,maxElbowFlex:25*Math.PI/180,maxClavicleSwing:6*Math.PI/180},
 upperBodyReference:{clip:'air_squat',time:.6688890198866526},
 pelvisOffset:[0,-.090,-.025],
 torsoLean:36*Math.PI/180,
 torsoLeanLimit:45*Math.PI/180,
 armReachReserve:.012,
 headPitch:1.5*Math.PI/180,
 footPitch:3*Math.PI/180,
 soleLift:.012,
}
