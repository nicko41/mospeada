import {BufferGeometry,Float32BufferAttribute} from 'three'
import {createNaturalCanyonSteps,createRiverGeometry} from './forestCanyon.js'
import {stage2Height,stage2MappedZ} from './forestStage2Terrain.js'
import {FOREST_STAGE2 as S,stage2LipZ,stage2Smooth} from './forestStage2Config.js'
import {FOREST_ASSETS} from './forestConfig.js'
import {forestRandom} from './forestLayout.js'

export function canyonSideHeight(x,z){
  const edgeX=Math.max(-S.halfWidth,Math.min(S.halfWidth,x)),distance=Math.abs(x)-S.halfWidth
  return stage2Height(edgeX,z)+stage2Smooth(0,128,distance)*(4+Math.sin(x*.012+z*.016)*3+Math.cos(z*.009-x*.007)*2)
}
function* upperBankSteps(minX,maxX,minZ,maxZ){
  const positions=[],uv=[],indices=[],columns=(maxX-minX)/8+1,rows=(maxZ-minZ)/2
  for(let row=0;row<=rows;row++){if(row%4===0)yield;for(let col=0;col<columns;col++){const x=minX+col*8,z=stage2MappedZ(x,minZ+row*2);positions.push(x,canyonSideHeight(x,z),z);uv.push((x+400)/800,1-(z+400)/800)}}
  for(let row=0;row<rows;row++)for(let col=0;col<columns-1;col++){const a=row*columns+col,b=a+columns;indices.push(a,b,a+1,a+1,b,b+1)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g
}
export function createCanyonSides(){const steps=createCanyonSidesSteps();let step;do{step=steps.next()}while(!step.done);return step.value}
export function* createCanyonSidesSteps(){
  const tiles=[],byName=Object.fromEntries(FOREST_ASSETS.map(a=>[a.name,[]])),species=FOREST_ASSETS.filter(a=>a.kind==='tree'),random=forestRandom(19830927),between=(a,b)=>a+(b-a)*random()
  // Three resident modules per side, extending the banks, cliff and river as
  // one continuous landscape. Native frustum/instance culling stays enabled.
  for(const side of [-1,1])for(let n=0;n<3;n++){
    const minX=side<0?-S.halfWidth-(n+1)*256:S.halfWidth+n*256,maxX=minX+256
    const canyon=yield* createNaturalCanyonSteps(canyonSideHeight,{minX,maxX,step:8,skirts:n===2}),river=createRiverGeometry(minX,maxX,4),tops=[yield* upperBankSteps(minX,maxX,S.canyon.lipZ,S.startZ),yield* upperBankSteps(minX,maxX,S.endZ,S.canyon.landingZ)]
    tiles.push({minX,maxX,...canyon,river,tops})
    for(let i=0,tries=0;i<150&&tries<1200;tries++){if(tries%64===0)yield;
      const x=between(minX+5,maxX-5),z=between(S.endZ+5,S.startZ-5);if(z<stage2LipZ(x)+7&&z>stage2LipZ(x,true)-7)continue
      const a=species[Math.floor(random()*species.length)];byName[a.name].push({x,z,scale:between(2.2,3.4),yaw:between(0,Math.PI*2),tint:between(.88,1.05),name:a.name,kind:'tree'});i++
    }
  }
  return {tiles,byName,dispose(){for(const tile of tiles)for(const g of [...tile.tops,tile.cliffs,tile.bed,tile.river])g.dispose()}}
}
