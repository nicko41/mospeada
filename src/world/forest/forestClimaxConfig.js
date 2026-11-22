export const DESERT_CLIMAX=Object.freeze({
  count:30,squadSize:5,start:2400,descent:340,drop:24,halfWidth:3000,
  tileLength:160,terrainRows:12,revealDistance:2480,firstPatrol:2680,patrolSpacing:165,
  engageRange:190,brakeSeconds:.5,glanceSeconds:.55,retrySeconds:1.4,
})
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)}
export function climaxPathX(distance){const d=Math.max(0,distance-DESERT_CLIMAX.start);return (38*Math.sin(d*.0022)+16*Math.sin(d*.0041))*smooth(0,350,d)}
export function climaxTerrainHeight(x,z,entryHeight){
  const d=-z,t=smooth(DESERT_CLIMAX.start,DESERT_CLIMAX.start+DESERT_CLIMAX.descent,d),cross=x-climaxPathX(d)
  const path=1-smooth(10,50,Math.abs(cross))
  const waves=(.85*Math.sin(x*.008+d*.011)+.6*Math.sin(x*.017-d*.007))*(1-path*.65)
  const hills=2.4*Math.sin(x*.004+d*.003)**2*smooth(80,350,Math.abs(cross))
  const rim=smooth(1250,DESERT_CLIMAX.halfWidth,Math.abs(cross))*(50+55*Math.sin(x*.004+d*.001)**2)
  return entryHeight*(1-t)+(-28-DESERT_CLIMAX.drop+waves+hills+rim)*t
}
