import * as T from 'three'

const restAxis = new T.Vector3(0, 0.8718175736210823, -0.489830703739005)

function axisRange(mesh, body) {
  const positions = mesh.geometry.attributes.position, points = []
  let min = Infinity, max = -Infinity
  for (let i = 0; i < positions.count; i++) {
    const point = body.worldToLocal(mesh.localToWorld(new T.Vector3().fromBufferAttribute(positions, i)))
    const projection = point.dot(restAxis)
    min = Math.min(min, projection); max = Math.max(max, projection); points.push({ point, projection })
  }
  // Average the cap ring, retaining the authored rod axis and exact top centre.
  const ring = points.filter(point => Math.abs(point.projection - max) < 1e-6)
  const top = ring.reduce((sum, point) => sum.add(point.point), new T.Vector3()).divideScalar(ring.length)
  const bottomRing = points.filter(point => Math.abs(point.projection - min) < 1e-6)
  const bottom = bottomRing.reduce((sum, point) => sum.add(point.point), new T.Vector3()).divideScalar(bottomRing.length)
  return { min, max, top, bottom }
}

// Two independent telescopic legs bridge fixed chassis mounts and the steering
// wheel carrier. Steering changes their angle and length, not their top seats.
export function createFrontForks(body, wheelFrame, surfaces) {
  return ['Left', 'Right'].map(side => {
    const prefix = `Fork_${side}_`, find = suffix => surfaces.find(mesh => mesh.userData.sourcePiece === prefix + suffix)
    const fixed = ['Upper_Clamp', 'Upper_Chassis_Lug', 'Upper_Cross_Pin'].map(find)
    const upperMeshes = ['Sliding_Rod', 'Internal_Piston_Guide'].map(find)
    const lowerMeshes = ['Outer_Sleeve_Hollow', 'Lower_Reinforcement', 'Middle_Collar', 'Upper_Collar', 'Rod_Seal', 'Bottom_Plug'].map(find)
    const lowerMounts = ['Lower_Wheel_Lug', 'Lower_Cross_Pin'].map(find)
    fixed.forEach(mesh => body.attach(mesh))
    lowerMounts.forEach(mesh => wheelFrame.attach(mesh))
    body.updateWorldMatrix(true, true)
    const rod = axisRange(find('Sliding_Rod'), body), sleeve = axisRange(find('Outer_Sleeve_Hollow'), body)
    const top = rod.top
    const crossPin = body.worldToLocal(new T.Box3().setFromObject(find('Lower_Cross_Pin')).getCenter(new T.Vector3()))
    const bottom = top.clone().addScaledVector(restAxis, crossPin.clone().sub(top).dot(restAxis))
    const target = wheelFrame.worldToLocal(body.localToWorld(bottom.clone()))
    const upper = new T.Group(), lower = new T.Group()
    upper.name = `${side}_fork_fixed_top_rod`; upper.position.copy(top)
    lower.name = `${side}_fork_wheel_sleeve`; lower.position.copy(bottom)
    body.add(upper, lower); body.updateWorldMatrix(true, true)
    upperMeshes.forEach(mesh => upper.attach(mesh)); lowerMeshes.forEach(mesh => lower.attach(mesh))
    const restLength = top.distanceTo(bottom), restInsertion = sleeve.max - rod.min
    const rodTip = upper.worldToLocal(body.localToWorld(rod.bottom.clone()))
    const mouth = lower.worldToLocal(body.localToWorld(sleeve.top.clone()))
    const fixedMatrices = fixed.map(mesh => mesh.matrix.clone())
    const state = { length: restLength, stroke: 0, insertion: restInsertion, topError: 0, bottomError: 0, axisError: 0, radialError: 0 }
    const bottomBody = new T.Vector3(), axis = new T.Vector3(), rotation = new T.Quaternion()
    function update() {
      bottomBody.copy(target); wheelFrame.localToWorld(bottomBody); body.worldToLocal(bottomBody)
      axis.copy(top).sub(bottomBody); const length = axis.length(); axis.normalize()
      rotation.setFromUnitVectors(restAxis, axis)
      upper.position.copy(top); upper.quaternion.copy(rotation)
      lower.position.copy(bottomBody); lower.quaternion.copy(rotation)
      body.updateWorldMatrix(true, true)
      Object.assign(state, { length, stroke: restLength - length, insertion: restInsertion + restLength - length })
      state.topError = upper.getWorldPosition(new T.Vector3()).distanceTo(body.localToWorld(top.clone()))
      state.bottomError = lower.getWorldPosition(new T.Vector3()).distanceTo(wheelFrame.localToWorld(target.clone()))
      state.axisError = new T.Vector3().crossVectors(restAxis.clone().applyQuaternion(upper.quaternion), restAxis.clone().applyQuaternion(lower.quaternion)).length()
      const tipWorld = upper.localToWorld(rodTip.clone()), mouthWorld = lower.localToWorld(mouth.clone())
      const worldAxis = restAxis.clone().transformDirection(upper.matrixWorld)
      state.radialError = new T.Vector3().crossVectors(mouthWorld.sub(tipWorld), worldAxis).length()
    }
    update()
    return { side, fixed, fixedMatrices, upperMeshes, lowerMeshes, lowerMounts, upper, lower, top, target, wheelFrame, restLength, restInsertion, state, update }
  })
}
