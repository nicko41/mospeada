export const rockHash=(x,z,seed)=>{const n=Math.sin(x*127.1+z*311.7+seed*19.19)*43758.5453;return n-Math.floor(n)}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}

// The approved broad, broken-crested profile, shared by the old mountain
// terrain and the newer instanced horizon formations.
export function desertRockProfile(x,z,seed,i=(x+1)*7.5,j=(z+1)*5.5){
  if(Math.abs(x)>=1||Math.abs(z)>=1)return 0
  const edge=smooth((1-Math.abs(x))/.3)*smooth((1-Math.abs(z))/.4)
  const ridgeZ=-.16+.22*Math.sin(x*3.8+seed)+.12*Math.sin(x*9.3+seed*.7)
  const slope=Math.max(0,1-Math.abs(z-ridgeZ)/(.65+.13*Math.sin(x*4.7)))
  const crest=smooth((slope-.08)/.53),shelves=.3*Math.max(0,1-Math.abs(z+.46-x*.17)/.38)
  const broken=.66+.16*Math.sin(x*6.1+seed)+.075*Math.sin(x*16.3-seed*.5)
  const erosion=(rockHash(i,j,seed+8)-.5)*.13+Math.abs(Math.sin(x*19.1+z*3.5))*.065
  return Math.max(0,edge*(.12+crest*broken+shelves+erosion))
}

const mountains=Object.freeze([
  [-1500,1030,1050,680,180,13],[1630,1120,1120,720,185,30],
  [-1580,2010,1250,820,210,47],[1720,2050,1300,850,215,13],
  [-710,2050,580,600,105,30],[750,1950,620,640,115,47],
])
function facetedProfile(x,z,seed){
  if(Math.abs(x)>=1||Math.abs(z)>=1)return 0
  const col=(x+1)*7.5,row=(z+1)*5.5,i=Math.min(14,Math.floor(col)),j=Math.min(10,Math.floor(row)),u=col-i,v=row-j
  // Broad shelves truncate every summit across several columns/rows. This
  // prevents isolated pointed apexes even when viewed along the ridge axis.
  const at=(a,b)=>{
    const shelf=.60+.045*Math.floor(a/5)
    const relief=desertRockProfile(-1+2*a/15,-1+2*b/11,seed,a,b)*1.7
    const terrace=relief<.16?relief:relief<.35?.23:relief<.65?.43:.70
    return Math.min(shelf,terrace)
  }
  const a=at(i,j),b=at(i,j+1),c=at(i+1,j),d=at(i+1,j+1)
  if(rockHash(i,j,seed)>.5)return u+v<=1?a+(c-a)*u+(b-a)*v:d+(b-d)*(1-u)+(c-d)*(1-v)
  return u<=v?a+(b-a)*v+(d-b)*u:a+(c-a)*u+(d-c)*v
}
export function originalDesertRockHeight(x,depth){
  let height=0
  for(const [cx,cz,sx,sz,h,seed]of mountains)height=Math.max(height,facetedProfile((x-cx)/sx,(depth-cz)/sz,seed)*h)
  return 14+height
}
