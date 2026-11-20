import { Box3, Matrix4, Quaternion, Vector3 } from 'three'

// The frames are in editor/project coordinates: group transforms have already
// been baked into the vertices. IDs, not duplicate group names, bind members.
export function attachFrontMotionGroups(data,source,target,meshes) {
  for(const piece of data.pieces){delete piece.motionGroupId;delete piece.separationGroupId;delete piece.sourcePivot}
  for(const record of data.records){delete record.motionGroupId;delete record.sequenceRole}
  const selected=source.groups.filter(g=>['CHEST-left','Headlight_Module_Left','tapa-manubrio-izq'].includes(g.name)).sort((a,b)=>(a.name==='CHEST-left'?0:1)-(b.name==='CHEST-left'?0:1))
  const sourcePieces=new Map(source.pieces.map(p=>[p.id,p])),targetPieces=new Map(target.pieces.map(p=>[p.id,p]))
  const parents=new Map(source.groups.map(g=>[g.id,g.parentId]))
  const separating=new Set(source.groups.filter(g=>g.name==='CHEST-left').map(g=>g.id))
  const members=group=>source.pieces.filter(p=>{let id=p.parentId;while(id){if(id===group.id)return true;id=parents.get(id)}return false}).map(p=>p.id)
  const separationGroup=piece=>{
    let id=piece.parentId
    while(id){if(separating.has(id))return id;id=parents.get(id)}
    return null
  }
  const groups=selected.map(group=>{
    const destination=target.groups.find(g=>g.id===group.id)
    if(!destination)throw Error(`Falta el grupo Battloid ${group.id}`)
    return{id:group.id,name:group.name,role:group.name==='CHEST-left'?'carrier':group.name==='tapa-manubrio-izq'?'cover':'hinge',sourceFrame:group.matrix,targetFrame:destination.matrix,pieceIds:members(group)}
  })
  const carriers=groups.filter(g=>g.role==='carrier')
  if(carriers.length!==2)throw Error('Se necesitan las dos bases CHEST-left')
  const position=g=>new Vector3().setFromMatrixPosition(new Matrix4().fromArray(g))
  const lateral=position(carriers[0].sourceFrame).sub(position(carriers[1].sourceFrame)).normalize()
  const width=position(carriers[0].sourceFrame).distanceTo(position(carriers[1].sourceFrame))
  const finalWidth=Math.abs(position(carriers[0].targetFrame).sub(position(carriers[1].targetFrame)).dot(lateral))
  for(const [i,carrier]of carriers.entries()){
    const q=new Quaternion().setFromRotationMatrix(new Matrix4().fromArray(carrier.sourceFrame))
    carrier.separationOffset=lateral.clone().multiplyScalar((i===0?1:-1)*Math.max(0,(finalWidth-width)/2)).applyQuaternion(q.invert()).toArray()
  }
  for(const light of groups.filter(g=>g.role==='hinge')){
    const originalGroup=source.groups.find(g=>g.id===light.id)
    const chest=carriers.find(g=>source.groups.find(s=>s.id===g.id).parentId===originalGroup.parentId)
    if(!chest)throw Error(`Falta la base CHEST del faro ${light.id}`)
    light.parentGroupId=chest.id
    const housing=data.records.find(r=>r.pieceIds.some(id=>light.pieceIds.includes(id)&&sourcePieces.get(id)?.name==='Headlight_Housing'))
    const chestDelta=new Matrix4().fromArray(chest.targetFrame).multiply(new Matrix4().fromArray(chest.sourceFrame).invert())
    const headDelta=new Matrix4().fromArray(housing.delta),relative=chestDelta.clone().invert().multiply(headDelta)
    const q=new Quaternion().setFromRotationMatrix(relative).normalize(),axis=new Vector3(q.x,q.y,q.z).normalize(),angle=2*Math.acos(Math.max(-1,Math.min(1,q.w)))
    const translation=position(relative.toArray()),perpendicular=translation.clone().addScaledVector(axis,-translation.dot(axis))
    // Fixed axis of the authored relative rotation, inside the CHEST base.
    // A small axial slide in the source data stays inside that same socket.
    const pin=perpendicular.clone().add(axis.clone().cross(perpendicular).multiplyScalar(1/Math.tan(angle/2))).multiplyScalar(.5)
    pin.addScaledVector(axis,position(light.sourceFrame).sub(pin).dot(axis))
    const from=new Matrix4().fromArray(light.sourceFrame),to=new Matrix4().fromArray(light.targetFrame)
    from.decompose(new Vector3(),q,new Vector3());from.compose(pin,q,new Vector3(1,1,1))
    const end=pin.clone().applyMatrix4(headDelta)
    to.decompose(new Vector3(),q,new Vector3());to.compose(end,q,new Vector3(1,1,1))
    const slide=end.distanceTo(pin.clone().applyMatrix4(chestDelta))
    if(slide>.01)throw Error(`El faro ${light.id} no tiene una bisagra compatible con su base: ${slide}`)
    light.sourceFrame=from.toArray();light.targetFrame=to.toArray()
    light.hinge={axis:axis.toArray(),source:pin.toArray(),target:end.toArray(),axialSlide:slide}
  }
  for(const cover of groups.filter(g=>g.role==='cover')){
    const originalGroup=source.groups.find(g=>g.id===cover.id)
    const chest=carriers.find(g=>source.groups.find(s=>s.id===g.id).parentId===originalGroup.parentId)
    const plate=sourcePieces.get(cover.pieceIds.find(id=>sourcePieces.get(id)?.name==='tapa-up'))
    const basePoints=chest.pieceIds.flatMap(id=>sourcePieces.get(id).vertices.map(v=>new Vector3(...v.point)))
    const contact=plate.vertices.reduce((best,v)=>{
      const distance=p=>Math.min(...basePoints.map(b=>b.distanceToSquared(new Vector3(...p.point))))
      return distance(v)<distance(best)?v:best
    })
    const record=data.records.find(r=>r.pieceIds.includes(plate.id))
    const from=new Matrix4().makeTranslation(...contact.point)
    cover.parentGroupId=chest.id
    cover.sourceFrame=from.toArray();cover.targetFrame=new Matrix4().fromArray(record.delta).multiply(from).toArray()
    cover.hinge={source:contact.point,sourceVertexId:contact.id,sourcePieceId:plate.id}
  }
  const tankIds=source.groups.filter(g=>g.name==='tanque nafta').flatMap(g=>members(g)).filter(id=>sourcePieces.get(id)?.name!=='Conexión circulo front-chest')
  const tankRecords=data.records.filter(r=>r.pieceIds.some(id=>tankIds.includes(id)))
  const tankShells=tankRecords.filter(r=>r.pieceIds.some(id=>sourcePieces.get(id)?.name==='tanque-nafta'))
  const unbake=new Matrix4().fromArray(data.importMatrix).multiply(new Matrix4().fromArray(data.originalAssemblyMatrix)).invert()
  const points=tankShells.flatMap(r=>{
    const mesh=meshes?.get(r.key)
    if(!mesh)throw Error(`Falta la geometría visible del tanque ${r.key}`)
    return Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(unbake))
  })
  const bounds=new Box3().setFromPoints(points),rear=points.filter(p=>p.x>bounds.max.x-1e-5)
  const pin=new Box3().setFromPoints(rear).getCenter(new Vector3()),from=new Matrix4().makeTranslation(...pin.toArray())
  const foldAngle=20*Math.PI/180,dipped=from.clone().multiply(new Matrix4().makeRotationZ(foldAngle)).multiply(from.clone().invert())
  const tip=points.reduce((a,b)=>a.clone().applyMatrix4(dipped).x<b.clone().applyMatrix4(dipped).x?a:b)
  groups.push({id:'cyclone-tank-fold',name:'Tanque · conjunto completo',role:'tank',sourceFrame:from.toArray(),targetFrame:new Matrix4().fromArray(tankShells[0].delta).multiply(from).toArray(),pieceIds:tankIds,foldAngle,length:bounds.max.x-bounds.min.x,center:bounds.getCenter(new Vector3()).toArray(),tip:tip.toArray()})
  for(const piece of data.pieces){
    const separate=separationGroup(sourcePieces.get(piece.id)||{})
    if(separate)piece.separationGroupId=separate
    const group=groups.find(g=>g.pieceIds.includes(piece.id))
    if(!group||piece.absent)continue
    const original=sourcePieces.get(piece.id),destination=targetPieces.get(piece.id)
    if(!original||!destination)throw Error(`Falta pieza del módulo ${piece.id}`)
    // Refuse to mix frames from a different version of either assembly.
    for(const check of piece.checkpoints||[]){
      const a=original.vertices.find(v=>v.id===check.id),b=destination.vertices.find(v=>v.id===check.id)
      if(!a||!b||new Vector3(...a.point).distanceTo(new Vector3(...check.source))>1e-7||new Vector3(...b.point).distanceTo(new Vector3(...check.target))>1e-7)throw Error(`Los vértices cambiaron; regenerá el recurso completo: ${piece.id}/${check.id}`)
    }
    piece.motionGroupId=group.id
    piece.sourcePivot=original.objectPose?.position||original.primitive?.position||new Box3().setFromPoints(original.vertices.map(v=>new Vector3(...v.point))).getCenter(new Vector3()).toArray()
  }
  for(const record of data.records){
    if(record.pieceIds.some(id=>data.pieces.find(p=>p.id===id)?.separationGroupId))record.sequenceRole='separation'
    const ids=new Set(record.pieceIds.map(id=>data.pieces.find(p=>p.id===id)?.motionGroupId).filter(Boolean))
    if(ids.size>1)throw Error(`La superficie mezcla módulos independientes: ${record.key}`)
    if(ids.size===1)record.motionGroupId=[...ids][0]
  }
  data.motionGroups=groups
  return data
}
