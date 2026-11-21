// Shared by detailed and distant batches. Only mounting prepares transforms and
// instance colours; camera movement never changes the shrub's contact or tint.
export function forestBurial(kind,bounds,scale) {
  const height=bounds.max.y-bounds.min.y
  return kind==='shrub'?height*scale*.24:kind==='rock'?height*scale*.13:.015
}
export function forestInstanceTint(color,kind,tint) {
  if(kind!=='shrub')return color.setScalar(tint)
  const variation=Math.max(0,Math.min(1,(tint-.84)/.24)),value=.78+variation*.5
  return color.setRGB(value*(.96+variation*.06),value,value*(1.03-variation*.1))
}
