// Repair isolated body-bound vertices inside the right shin plate. All welded
// neighbours must already belong rigidly to that leg; collars remain untouched.
export function repairScoutLegWeights({points,ids,edges,joints,weights}){
 const vertexByPoint=new Map(),repairs=[]
 for(let i=0;i<ids.length;i++){const id=ids[i];if(!vertexByPoint.has(id))vertexByPoint.set(id,[]);vertexByPoint.get(id).push(i)}
 for(let point=0;point<points.length;point++){
  const [x,y,z]=points[point],vertices=vertexByPoint.get(point),neighbors=[...edges[point]]
  if(x>=-.25||y>=-.3||z<=.3||neighbors.length<3||!vertices?.every(i=>joints[i*4]===0&&weights[i*4]===255))continue
  if(!neighbors.every(id=>vertexByPoint.get(id).every(i=>joints[i*4]===4&&weights[i*4]===255)))continue
  for(const i of vertices){joints.fill(0,i*4,i*4+4);weights.fill(0,i*4,i*4+4);joints[i*4]=4;weights[i*4]=255}
  repairs.push({position:points[point],vertices,neighbors:neighbors.length,joint:4})
 }
 return repairs
}
