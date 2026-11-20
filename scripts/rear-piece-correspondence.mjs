import {Vector3} from 'three'

// A duplicated 3D LAB piece gets fresh piece/vertex IDs. Recover provenance
// only when its unchanged geometry AND topology give one exact translation.
// Ambiguous or edited shapes are rejected, never matched by array order.
export function matchTranslatedReplacement(target,candidates,tolerance=1e-7){
  const center=p=>p.vertices.reduce((v,w)=>v.add(new Vector3(...w.point)),new Vector3()).divideScalar(p.vertices.length)
  const matches=[]
  for(const source of candidates){
    if(source.name!==target.name||source.vertices.length!==target.vertices.length||source.faces.length!==target.faces.length||source.edges.length!==target.edges.length||source.tubes?.length||target.tubes?.length)continue
    const offset=center(target).sub(center(source)),pairs=[],used=new Set()
    for(const v of source.vertices){
      const expected=new Vector3(...v.point).add(offset)
      const found=target.vertices.filter(w=>new Vector3(...w.point).distanceTo(expected)<tolerance)
      if(found.length!==1||used.has(found[0].id))break
      used.add(found[0].id);pairs.push({source:v.id,target:found[0].id})
    }
    if(pairs.length!==source.vertices.length)continue
    const ids=new Map(pairs.map(p=>[p.source,p.target]))
    const faceKey=v=>[...v].sort().join('|'),edgeKey=e=>faceKey([e.a,e.b])
    const faces=new Set(target.faces.map(f=>faceKey(f.vertices))),edges=new Set(target.edges.map(edgeKey))
    if(!source.faces.every(f=>faces.has(faceKey(f.vertices.map(id=>ids.get(id)))))||!source.edges.every(e=>edges.has(faceKey([ids.get(e.a),ids.get(e.b)]))))continue
    matches.push({sourceId:source.id,vertexPairs:pairs,translation:offset.toArray()})
  }
  if(matches.length!==1)throw Error(`Procedencia ${matches.length?'ambigua':'no identificada'} para ${target.id} (${target.name})`)
  return matches[0]
}
