import fs from 'node:fs'
import {readRgbaPng,writeRgbaPng} from './foliage-png.mjs'
// Small authored leaf/blade fragments, cut from the approved foliage library.
// No generated artwork, colour replacement or rectangular opaque backgrounds.
const blades='public/foliage/forest/pasto/pasto-bajo-01.png',leaves='public/foliage/forest/hierbas/hojas-anchas-01.png'
const cuts=[{file:blades,polygon:[[84,0],[104,0],[88,19],[73,33],[69,28],[76,13]]},{file:blades,polygon:[[24,12],[28,9],[40,18],[53,38],[49,43],[38,27]]},{file:blades,polygon:[[0,42],[16,38],[33,40],[47,51],[44,57],[30,48],[13,46],[0,48]]},{file:leaves,polygon:[[110,45],[134,37],[158,43],[175,58],[171,63],[150,66],[131,59]]}]
const inside=(x,y,p)=>{let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])v=!v;return v}
const size=64,width=size*2,pixels=new Uint8Array(width*width*4)
cuts.forEach((cut,tile)=>{const source=readRgbaPng(cut.file),xs=cut.polygon.map(p=>p[0]),ys=cut.polygon.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY,scale=48/Math.max(w,h),ox=tile%2*size+(size-w*scale)/2,oy=Math.floor(tile/2)*size+(size-h*scale)/2;for(let y=0;y<h*scale;y++)for(let x=0;x<w*scale;x++){const sx=Math.floor(minX+x/scale),sy=Math.floor(minY+y/scale);if(!inside(sx+.5,sy+.5,cut.polygon)||sx<0||sy<0||sx>=source.width||sy>=source.height)continue;const a=(sy*source.width+sx)*4,b=((Math.floor(oy+y))*width+Math.floor(ox+x))*4;pixels.set(source.pixels.subarray(a,a+4),b)}})
writeRgbaPng('public/foliage/forest/wheel-fragments.png',{width,height:width,pixels})
fs.writeFileSync('public/foliage/forest/wheel-fragments.json',JSON.stringify({source:'approved original foliage library',tiles:cuts,width,height:width},null,2)+'\n')
