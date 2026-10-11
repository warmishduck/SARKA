// Where content goes once a recognised object (a painting on a wall) is found and the visitor
// points the camera down: where the view meets the floor, but close to the visitor (on the phone,
// the view ray at a shallow tilt met the floor metres away, behind the wall) and never past the
// object's wall. The object's own distance is only a guard: it is the least certain part of an
// image target's pose and came out far too large on the phone. Pure (three.js maths only, no
// DOM, no 8th Wall), so it can be tested in Node. floorSpot works in a frame where the floor is
// the plane y = 0, which is where the 8th Wall world tracking assumes it (see placeCameraAtStart
// in threejs-scene-init.js) but not always where it really is: scan.js measures the floor with
// surface hits (flatSurfaceHeight, median) and hands floorSpot positions relative to it.

import * as THREE from 'three'

/** Camera forward `y` below this counts as looking at the floor (30° down). */
export const FLOOR_PITCH = -0.5
/** How far out from the object's wall content stands at most (scene units). */
export const WALL_GAP = 0.5
/** Closest and farthest from the camera, along the floor (scene units; the camera starts 2 up). */
export const MIN_DISTANCE = 0.8
export const MAX_DISTANCE = 1.6
/** Content stays below this share of the object's height above the floor, so it never covers it. */
export const MAX_HEIGHT_SHARE = 0.6
/** Never shrink content below this. */
export const MIN_SCALE = 0.25
/** A measured floor lies at least this far and at most that far below the camera (scene units). */
export const MIN_EYE_HEIGHT = 0.8
export const MAX_EYE_HEIGHT = 3.5
/** Surface hits count as one flat floor when they lie within this height of each other. */
export const FLAT_TOLERANCE = 0.2

/**
 * @param {number[]} values
 * @returns {number} The middle value (the mean of the two middle ones for an even count); NaN when empty.
 */
export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The height of a flat surface, from surface hits taken at several points of one camera frame.
 *
 * Asking about different rows of the screen is what tells a floor from the foot of a wall: a
 * floor has the same height wherever on the screen it is hit, a wall's height climbs up it. So
 * the hits only count where at least two agree; the largest group that does wins (the lowest,
 * on a tie), so one stray hit does not spoil a frame.
 *
 * @param {number[]} heights - World `y` of each hit.
 * @param {number} cameraHeight - The camera's world `y`.
 * @returns {number | null} The agreeing hits' median height; null when fewer than two agree or
 *   the surface is not a plausible distance below the camera.
 */
export const flatSurfaceHeight = (heights, cameraHeight) => {
  const sorted = [...heights].sort((a, b) => a - b)
  let best = []
  sorted.forEach((low, i) => {
    const group = sorted.slice(i).filter((y) => y - low <= FLAT_TOLERANCE)
    if (group.length > best.length) {
      best = group
    }
  })
  if (best.length < 2) {
    return null
  }
  const height = median(best)
  const below = cameraHeight - height
  return below >= MIN_EYE_HEIGHT && below <= MAX_EYE_HEIGHT ? height : null
}

/**
 * @param {THREE.Vector3} objectPosition - The recognised object's estimated centre, world space.
 * @param {THREE.Vector3} cameraPosition - The camera's world position.
 * @param {THREE.Vector3} forward - The camera's unit view direction, in world space.
 * @param {number} contentHeight - How tall the tallest creature to place is, unscaled.
 * @returns {{position: THREE.Vector3, yaw: number, scale: number} | null} Where to stand the
 *   content, the turn that makes it (facing +z, as in the AR view) face the camera, and how much
 *   to shrink it; null while the camera is not looking down at the floor.
 */
export const floorSpot = (objectPosition, cameraPosition, forward, contentHeight) => {
  if (forward.y >= FLOOR_PITCH) {
    return null
  }
  const horizontal = Math.hypot(forward.x, forward.z)
  const heading = horizontal > 1e-6
    ? new THREE.Vector3(forward.x / horizontal, 0, forward.z / horizontal)
    : new THREE.Vector3(0, 0, -1)   // straight down: no heading, so use the default one

  let along = Math.min((cameraPosition.y / -forward.y) * horizontal, MAX_DISTANCE)   // view ray meets floor
  const objectAlong = (objectPosition.x - cameraPosition.x) * heading.x + (objectPosition.z - cameraPosition.z) * heading.z
  if (objectAlong > WALL_GAP) {
    along = Math.min(along, objectAlong - WALL_GAP)
  }
  along = Math.max(along, MIN_DISTANCE)

  const position = cameraPosition.clone().addScaledVector(heading, along).setY(0)
  const yaw = Math.atan2(cameraPosition.x - position.x, cameraPosition.z - position.z)

  // The object's height is only an estimate too; eye level (the camera) keeps it plausible.
  const objectHeight = THREE.MathUtils.clamp(objectPosition.y, cameraPosition.y * 0.5, cameraPosition.y * 1.5)
  const fit = contentHeight > 0 ? (objectHeight * MAX_HEIGHT_SHARE) / contentHeight : 1
  const scale = THREE.MathUtils.clamp(fit, MIN_SCALE, 1)
  return {position, yaw, scale}
}
