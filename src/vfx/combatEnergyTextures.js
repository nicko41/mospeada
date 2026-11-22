import {DataTexture,LinearFilter} from 'three'

// Small reusable particle maps, independent of the approved explosion atlas.
export function combatEnergyTexture(muzzle=false){
  const size=96,data=new Uint8Array(size*size*4)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,angle=Math.atan2(v,u)
    const edge=muzzle?.78+.1*Math.sin(angle*3+.4):.83+.065*Math.sin(angle*5)+.035*Math.cos(angle*9)
    const radius=Math.hypot(u*(muzzle?.92:1),v*(muzzle?1.35:1))/edge
    const heat=Math.max(0,1-radius),i=(y*size+x)*4
    data[i]=255;data[i+1]=Math.round(65+190*Math.min(1,heat*2.5));data[i+2]=Math.round(8+235*Math.max(0,(heat-.35)/.65)**.65)
    data[i+3]=Math.round(Math.min(1,Math.max(0,(1-radius)*7))*255)
  }
  const map=new DataTexture(data,size,size);map.name=muzzle?'Gallant hot muzzle tongue':'Quarks white-hot fireball';map.minFilter=map.magFilter=LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;return map
}
