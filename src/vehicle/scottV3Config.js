// Cyclone/world metres. These assembly/pose offsets apply exclusively to V3.
export const scottV3Config={
 palette:{enabled:true},
 undersuit:{enabled:true,inset:.05,overlap:.075,drop:0,radiusY:.039,radiusZ:.042,raisedDrop:.022,raisedRadiusY:.060,raisedRadiusZ:.065,clothUV:[.7563629746437073,.8004850149154663]},
 riding:{
  elbowReference:'intro',
  pelvisOffset:[0,.025,.11],
  footOffset:[0,0,-.17],kneePoleOffset:[0,0,-.12],
  // Approved airborne contact anchors, before footOffset, in the bike frame.
  // Standard riding reuses these; ground dabs and wheelie contacts stay live.
  footSupports:{Left:[.46954763379535513,.1947733409990028,-.019091633341287967],Right:[-.48401257279340426,.19477338609265965,.003146113449805494]},
  // Body silhouette owns the waist pitch; grip reach never drives the torso.
  torsoPitch:-4*Math.PI/180,
  elbowPole:[0,-1,-.15],elbowPoleOut:.18,minimumElbowBend:40*Math.PI/180,
  // Actual grip contacts, below/behind the cover tops, in bike-local metres.
  handGrips:{offset:[0,-.02,-.055],wristPitch:20*Math.PI/180},
  clavicleRelax:16*Math.PI/180,
  headPitch:8*Math.PI/180,
  standard:{elbowPoleOut:.32,minimumElbowBend:44*Math.PI/180},
  speedMotion:{startSpeed:2,fullSpeed:24,maxTorsoLean:12*Math.PI/180,maxElbowOpening:0,maxElbowBend:0,headFollow:.7,response:4},
  turnMotion:{startSpeed:1,fullSpeed:6,leanGain:.45,maxTorsoRoll:8*Math.PI/180,response:6},
  // Mounted Cyclone flight only; Armor Mode keeps its approved pose.
  airborne:{minimumKneeBend:50*Math.PI/180,maxHipDrop:.18,kneePoleForward:.08,kneePoleOut:.015,torsoExtension:6*Math.PI/180},
 },
 assembly:{
  torso:{bone:'Spine2',offset:[0,0,0]},
  cuffLeft:{bone:'LeftForeArm',offset:[0,0,0]},
  cuffRight:{bone:'RightForeArm',offset:[0,0,0]},
  legLeft:{bone:'LeftUpLeg',offset:[0,0,0],kneeProbeOffset:[0,-.01,-.05]},
  legRight:{bone:'RightUpLeg',offset:[0,0,0],kneeProbeOffset:[0,-.01,-.05]},
 },
}
