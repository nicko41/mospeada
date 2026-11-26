import {BufferGeometry,Float32BufferAttribute,Vector3} from 'three'
import {FOREST_STAGE2 as S,stage2LipZ,stage2Smooth} from './forestStage2Config.js'

export function riverSection(x){
  const bend=stage2Smooth(145,235,Math.abs(x))
  return {z:(stage2LipZ(x)+stage2LipZ(x,true))*.5+5*Math.sin(x*.024)+2.3*Math.sin(x*.061)+bend*28*Math.sin((Math.abs(x)-135)*.055),y:-36.8+x*.0008,halfWidth:(13+2.2*Math.sin(x*.018)+1.1*Math.cos(x*.053))*(1-bend*.28)}
}
export function canyonFloor(x,z){
  const r=riverSection(x),d=Math.abs(z-r.z),bank=Math.max(0,d-r.halfWidth)
  if(d<=r.halfWidth)return r.y-1.7-2*(1-(d/r.halfWidth)**2)
  return r.y-.25+Math.min(8,bank*.19)+Math.sin(x*.083+z*.17)*.55*Math.min(1,bank/3)
}
// The two upper rims are deliberately unchanged: all erosion is below them.
export function canyonWallPoint(x,t,back,heightAt){
  const edge=stage2LipZ(x,back),direction=back?1:-1,envelope=Math.sin(Math.PI*t),end=Math.max(0,Math.min(1,(S.halfWidth-Math.abs(x))/8))
  const turn=stage2Smooth(145,235,Math.abs(x)),river=riverSection(x),openFoot=edge+direction*(15+3*Math.sin(x*.037)+2*Math.cos(x*.081))
  // Downstream bends disappear behind interlocking talus spurs; the original
  // lateral extent and all upper terrain vertices remain exactly unchanged.
  const footZ=openFoot*(1-turn)+(river.z-direction*(river.halfWidth+10))*turn,bottom=canyonFloor(x,footZ)
  const strata=2.5*Math.sin(t*24+x*.043)+1.4*Math.sin(t*49-x*.11),gully=2.6*Math.sin(x*.12+Math.sin(x*.031)*2)
  return new Vector3(x+end*envelope*1.25*Math.sin(x*.073+t*13),heightAt(x,edge)*(1-t)+bottom*t+envelope*.8*Math.sin(x*.09+t*19),edge+(footZ-edge)*t+direction*envelope*(strata+gully))
}
function geometry(positions,uv,indices,colours){
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));if(colours)g.setAttribute('color',new Float32BufferAttribute(colours,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g
}
export function createNaturalCanyon(heightAt,options){const steps=createNaturalCanyonSteps(heightAt,options);let step;do{step=steps.next()}while(!step.done);return step.value}
export function* createNaturalCanyonSteps(heightAt,{minX=-S.halfWidth,maxX=S.halfWidth,step=null,skirts=true}={}){
  // Exactly the same X stations as the top meshes: no cracks along the rims.
  const xs=[];for(let x=minX;x<=maxX;x+=step||(x>=-S.detailHalfWidth&&x<S.detailHalfWidth?1:4))xs.push(x)
  const positions=[],uv=[],indices=[],colours=[],rows=30,columns=xs.length
  for(const back of [false,true]){
    const offset=positions.length/3,previous=[],vertical=new Float64Array(columns)
    for(let row=0;row<=rows;row++){
      if(row%4===0)yield
      let horizontal=0,last
      for(let col=0;col<columns;col++){
        const p=canyonWallPoint(xs[col],row/rows,back,heightAt)
        if(last)horizontal+=p.distanceTo(last);if(previous[col])vertical[col]+=p.distanceTo(previous[col]);previous[col]=p;last=p
        positions.push(p.x,p.y,p.z);uv.push(horizontal/4,vertical[col]/4)
        const ao=.86+.10*Math.sin(xs[col]*.12+row*.7)**2;colours.push(ao,ao,ao)
        if(row<rows&&col<columns-1){const a=offset+row*columns+col,b=a+columns;if(back)indices.push(a,b,a+1,a+1,b,b+1);else indices.push(a,a+1,b,a+1,b+1,b)}
      }
    }
  }
  const cliffs=geometry(positions,uv,indices,colours),bedPositions=[],bedUv=[],bedIndices=[],across=48
  cliffs.userData.canyonRows=rows
  for(let row=0;row<=across;row++){if(row%4===0)yield;for(const x of xs){const front=canyonWallPoint(x,1,false,heightAt),back=canyonWallPoint(x,1,true,heightAt),z=front.z+(back.z-front.z)*row/across;bedPositions.push(x,canyonFloor(x,z),z);bedUv.push(x/4,z/4)}}
  for(let row=0;row<across;row++)for(let col=0;col<columns-1;col++){const a=row*columns+col,b=a+columns;bedIndices.push(a,a+1,b,a+1,b+1,b)}
  // Closed lateral skirts continue the land mass downward, rather than leaving
  // an open sheet with sky underneath. They add no drivable surface.
  if(skirts)for(const col of [0,columns-1])for(let row=0;row<across;row++){
    const a=(row*columns+col)*3,b=((row+1)*columns+col)*3,i=bedPositions.length/3
    bedPositions.push(...bedPositions.slice(a,a+3),...bedPositions.slice(b,b+3),xs[col],-80,bedPositions[a+2],xs[col],-80,bedPositions[b+2]);bedUv.push(row/4,0,(row+1)/4,0,row/4,12,(row+1)/4,12);bedIndices.push(i,i+1,i+2,i+1,i+3,i+2)
  }
  const bed=geometry(bedPositions,bedUv,bedIndices),bankFrame=[]
  for(let i=0;i<bedPositions.length;i+=3){
    if(i%12288===0)yield
    const x=bedPositions[i],r=riverSection(x)
    bankFrame.push(r.z,r.halfWidth,canyonWallPoint(x,1,false,heightAt).z,canyonWallPoint(x,1,true,heightAt).z)
  }
  // Interpolate the bank frame, not a pre-clamped coverage value: the latter
  // exposed straight triangle contours in the grass/earth transition.
  bed.setAttribute('aRiverBankFrame',new Float32BufferAttribute(bankFrame,4))
  return {cliffs,bed}
}
export const riverObstacles=Array.from({length:6},(_,i)=>{const x=-112+i*43,r=riverSection(x);return {x,z:r.z+Math.sin(i*2.3)*r.halfWidth*.52,y:r.y,radius:1.1+(i%3)*.22}})
export function createRiverGeometry(minX=-S.halfWidth,maxX=S.halfWidth,step=2){
  const positions=[],uv=[],depth=[],indices=[],rows=(maxX-minX)/step,columns=17
  for(let row=0;row<=rows;row++){const x=minX+row*step,r=riverSection(x);for(let col=0;col<columns;col++){const across=col/(columns-1)*2-1,z=r.z+across*(r.halfWidth+1.8);positions.push(x,r.y,z);uv.push(x/4,across);depth.push(r.y-canyonFloor(x,z));if(row<rows&&col<columns-1){const a=row*columns+col,b=a+columns;indices.push(a,a+1,b,a+1,b+1,b)}}}
  const g=geometry(positions,uv,indices);g.setAttribute('aRiverDepth',new Float32BufferAttribute(depth,1));g.boundingBox.min.y-=.4;g.boundingBox.max.y+=.4;g.boundingSphere.radius+=.4;return g
}
