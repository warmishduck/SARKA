// Helpers for placing rigged (skinned, animated) glTF characters, used by the creature showcase.
import * as THREE from 'three'

// Measures a model so it can be scaled and placed and, if it ships an animation clip,
// starts a mixer playing it. The box is "precise", built from the actual posed vertices.
// The default Box3 only transforms each mesh's local box by its world matrix, which is a
// loose fit whenever that matrix is rotated. The glowcap's skinned mesh node carries a
// leftover Blender rotation and mirror, so its default box came out ~45% too tall and
// twice too wide: the model was scaled far too small and hovered above its shadow. The
// idle clips only change their model's height by a few %, so their first frame is fine.
export const measureModel = (model, clip) => {
  const mixer = clip ? new THREE.AnimationMixer(model) : null
  if (mixer) {
    mixer.clipAction(clip).play()
    mixer.setTime(0)
  }
  // Bones need world matrices before a skinned mesh can report its posed vertices.
  model.updateMatrixWorld(true)
  return {box: new THREE.Box3().setFromObject(model, true), mixer}
}

// The reaction clips ship with the root bone ("Hips") travelling: the jump leaps forward,
// the run cycle drifts. On screen the character would slide off its spot and snap back
// when the clip ends. Pin the root's horizontal position to where the idle clip starts and
// keep its vertical motion: that IS the jump, the crouch and the bend.
//
// `pinVerticallyIn` lists clips whose vertical root motion should go too, pinned to the
// idle's height. Use it when code moves the character and decides how high it is itself,
// so the clip must not add its own leap on top.
//
// Must run before the model is scaled or moved, so "model space" here is the model's own
// Y-up space.
export const pinRootHorizontally = (model, clips, idleClip, {pinVerticallyIn = []} = {}) => {
  const hips = model.getObjectByName('Hips')
  const anchorTrack = idleClip.tracks.find((track) => track.name === 'Hips.position')
  if (!hips || !hips.parent || !anchorTrack) {
    return
  }
  model.updateMatrixWorld(true)
  // The root's translation is expressed in its parent's space (which carries the
  // armature's rotation and scale). Convert to model space, pin x/z, convert back.
  const toModel = new THREE.Matrix3().setFromMatrix4(hips.parent.matrixWorld)
  const toParent = toModel.clone().invert()
  const anchor = new THREE.Vector3().fromArray(anchorTrack.values, 0).applyMatrix3(toModel)
  const v = new THREE.Vector3()
  clips.forEach((clip) => {
    const track = clip.tracks.find((t) => t.name === 'Hips.position')
    if (!track || clip === idleClip) {
      return
    }
    const pinVertical = pinVerticallyIn.includes(clip.name)
    for (let i = 0; i < track.values.length; i += 3) {
      v.fromArray(track.values, i).applyMatrix3(toModel)
      v.x = anchor.x
      v.z = anchor.z
      if (pinVertical) {
        v.y = anchor.y
      }
      v.applyMatrix3(toParent).toArray(track.values, i)
    }
  })
}
