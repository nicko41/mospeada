import {BufferGeometry,Float32BufferAttribute} from 'three'
import {FOREST_STAGE4 as S,stage4Edge,stage4ForestHeight,stage4DesertHeight,smooth4} from './forestStage4Config.js'

export function stage4Grid(minX,maxX,start,end,stepX,stepZ,height,mapped=false){
  const p=[],uv=[],ix=[],columns=Math.ceil((maxX-minX)/stepX)+1,rows=Math.ceil((end-start)/stepZ)+1
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const x=Math.min(maxX,minX+col*stepX),d=Math.min(end,start+row*stepZ),z=-(mapped?d+(stage4Edge(x)-620)*smooth4(560,620,d):d)
    p.push(x,height(x,z),z);uv.push(x/12,-z/6)
  }
  for(let row=0;row<rows-1;row++)for(let col=0;col<columns-1;col++){const a=row*columns+col,b=a+columns;ix.push(a,a+1,b,a+1,b+1,b)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData.rideGridCell=stepX>=8?16:4;g.userData.rideMutableHeight=mapped&&start===0;return g
}
export function createStage4Terrain(){
  const forest=[]
  for(let start=0;start<620;start+=96)for(const [a,b,s]of [[-S.halfWidth,-96,16],[-96,96,2],[96,S.halfWidth,16]])forest.push(stage4Grid(a,b,start,Math.min(620,start+96),s,2,stage4ForestHeight,true))
  const desert=[]
  for(let start=520;start<2400;start+=160)for(const [a,b,s]of [[-2400,-512,32],[-512,512,16],[512,2400,32]])desert.push(stage4Grid(a,b,start,Math.min(2400,start+160),s,16,stage4DesertHeight))
  const p=[],uv=[],ix=[],cols=257,rows=17
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const x=-1024+col*8,t=row/(rows-1),edge=stage4Edge(x),z=-edge-t*(8+3*Math.sin(x*.05))
    const top=stage4ForestHeight(x,-edge),bottom=stage4DesertHeight(x,z)-.1
    p.push(x,top+(bottom-top)*t+(Math.sin(x*.17+t*25)+Math.sin(x*.047-t*13))*.5*Math.sin(t*Math.PI),z);uv.push(x/8,(top-bottom)*t/6)
  }
  for(let row=0;row<rows-1;row++)for(let col=0;col<cols-1;col++){const a=row*cols+col,b=a+cols;ix.push(a,b,a+1,a+1,b,b+1)}
  const cliff=new BufferGeometry();cliff.setAttribute('position',new Float32BufferAttribute(p,3));cliff.setAttribute('uv',new Float32BufferAttribute(uv,2));cliff.setIndex(ix);cliff.computeVertexNormals();cliff.computeBoundingBox();cliff.computeBoundingSphere()
  return {forest,desert,cliff}
}
export function patchStage4Connector(geometry,anchor){
  const p=geometry.attributes.position
  if(geometry.boundingBox.max.z<= -96)return false
  for(let i=0;i<p.count;i++)if(p.getZ(i)>-96)p.setY(i,stage4ForestHeight(p.getX(i),p.getZ(i),anchor))
  p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return true
}
