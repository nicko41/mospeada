import * as T from 'three'

// The two authored sequences and the held riding pose use the original bones.
// Playback only: no runtime IK, geometry processing or skeleton reconstruction.
export function parseCycloneScottActions(data) {
  const clips = data.animations.map(json => T.AnimationClip.parse(json))
  const pose = data.ridingPose, times = [0, 1 / 60]
  const tracks = [new T.VectorKeyframeTrack('mixamorigHips.position', times, [...pose.hips, ...pose.hips])]
  pose.boneNames.forEach((name, i) => tracks.push(new T.QuaternionKeyframeTrack(name + '.quaternion', times, [...pose.quaternions[i], ...pose.quaternions[i]])))
  return [...clips, new T.AnimationClip(pose.name, 1 / 60, tracks)]
}

export const isCycloneAction = name => name?.startsWith('Cyclone_')
