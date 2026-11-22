const measurements=new Map()
let context,loaded=false
export const cycloneFontReady=typeof document==='undefined'?Promise.resolve():document.fonts.load('64px "Open 24 Display ST"').catch(()=>{}).then(()=>{loaded=true;measurements.clear()})

// Use painted glyph bounds, not the font's unusually tall line box.
export function fitCycloneReadout(group,value,{x,y,width,height,align='center'}){
  const text=String(value),signature=[text,x,y,width,height,align,loaded].join('/')
  if(group.dataset.readout===signature)return
  group.dataset.readout=signature
  let node=group.querySelector('text')
  if(!node){node=document.createElementNS('http://www.w3.org/2000/svg','text');group.replaceChildren(node)}
  node.setAttribute('class','instrument-font');node.setAttribute('font-size','64');node.setAttribute('x','0');node.setAttribute('y','0');node.textContent=text
  context||=document.createElement('canvas').getContext('2d');context.font='64px "Open 24 Display ST"'
  let bounds=measurements.get(text)
  if(!bounds){const m=context.measureText(text);bounds={x:-m.actualBoundingBoxLeft,y:-m.actualBoundingBoxAscent,width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};if(measurements.size>=128)measurements.delete(measurements.keys().next().value);measurements.set(text,bounds)}
  const scale=Math.min(width/Math.max(1,bounds.width),height/Math.max(1,bounds.height)),offset=align==='end'?width-bounds.width*scale:align==='start'?0:(width-bounds.width*scale)/2
  node.setAttribute('transform',`translate(${x+offset-bounds.x*scale},${y+(height-bounds.height*scale)/2-bounds.y*scale}) scale(${scale})`)
  node.dataset.inkBox=JSON.stringify(bounds)
}
