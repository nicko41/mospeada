// Supplied sheets: four columns, three rows, read left-to-right/top-to-bottom.
// A two-pixel inset prevents neighbouring frames bleeding through filtering.
export const EXPLOSION_ATLAS = Object.freeze({columns:4,rows:3,frames:12,width:2172,height:724,inset:2})
export function explosionFrame(progress,atlas=EXPLOSION_ATLAS){return Math.min(atlas.frames-1,Math.floor(Math.max(0,progress)*atlas.frames))}
export function explosionFrameRect(frame,mirror=false,atlas=EXPLOSION_ATLAS){
  const a=atlas,f=Math.max(0,Math.min(a.frames-1,frame)),du=a.inset/a.width,dv=a.inset/a.height,w=1/a.columns-2*du,h=1/a.rows-2*dv
  return [(f%a.columns)/a.columns+du+(mirror?w:0),1-(Math.floor(f/a.columns)+1)/a.rows+dv,mirror?-w:w,h]
}
export const INVID_GROUND_ATLAS=Object.freeze({columns:4,rows:3,frames:12,width:1448,height:1086,inset:2})
export const INVID_BLOOD_ATLAS=Object.freeze({columns:4,rows:3,frames:12,width:1448,height:1086,inset:2})
