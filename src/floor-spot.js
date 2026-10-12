// Where content goes once a recognised object (a painting on a wall) is found and the visitor
// points the camera down: where the view meets the floor, but close to the visitor (on the phone,
// the view ray at a shallow tilt met the floor metres away, behind the wall) and with the whole
// exhibit in front of the object's wall. The object's own distance, as an image target reports it,
// is the least certain part of its pose and came out several times too far on the phone, so
// scan.js replaces it with wallDistance, measured from the tracked world points. Pure (three.js
// maths only, no DOM, no 8th Wall), so it can be tested in Node.
//
// floorSpot works in a frame where the floor is the plane y = 0, which is where the 8th Wall world
// tracking assumes it (see placeCameraAtStart in threejs-scene-init.js) but not always where it
// really is: scan.js finds the floor with floorHeight and hands floorSpot positions relative to it.

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
/**
 * How far behind its spot an exhibit reaches, as a share of its height: the stone wall and the
 * creature waiting behind it (WALL and WAIT_BEHIND in showcase.js).
 */
export const CONTENT_DEPTH_SHARE = 1.0
/** A measured floor lies at least this far and at most that far below the camera (scene units). */
export const MIN_EYE_HEIGHT = 0.8
export const MAX_EYE_HEIGHT = 3.5
/** World points within this height of each other count as one flat surface. */
export const FLAT_TOLERANCE = 0.2
/** A floor needs this many points in one band, and this share of all the points below the camera. */
export const MIN_FLOOR_POINTS = 6
export const MIN_FLOOR_SHARE = 0.25
/** A wall is read from the points within this angle (radians) of the way to the object... */
export const WALL_SEARCH_ANGLE = 0.12
/** ...and needs at least this many of them. */
export const MIN_WALL_POINTS = 6

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
 * The height of the floor, from the heights of the tracked world points.
 *
 * A floor shows as many points at one height; a wall's points are spread over its whole height.
 * So the floor is the most crowded band (0.2 deep) among the points that lie a plausible
 * distance below the camera, the lowest one on a tie.
 *
 * @param {number[]} heights - World `y` of each tracked point.
 * @param {number} cameraHeight - The camera's world `y`.
 * @returns {number | null} The band's median height; null when no band is crowded enough.
 */
export const floorHeight = (heights, cameraHeight) => {
  const candidates = heights
    .filter((y) => cameraHeight - y >= MIN_EYE_HEIGHT && cameraHeight - y <= MAX_EYE_HEIGHT)
    .sort((a, b) => a - b)
  let best = []
  let start = 0
  candidates.forEach((y, end) => {
    while (y - candidates[start] > FLAT_TOLERANCE) {
      start++
    }
    if (end - start + 1 > best.length) {
      best = candidates.slice(start, end + 1)
    }
  })
  const crowded = best.length >= MIN_FLOOR_POINTS && best.length >= candidates.length * MIN_FLOOR_SHARE
  return crowded ? median(best) : null
}

/**
 * How far away the surface behind an object really is: the median distance of the tracked world
 * points that lie in the object's direction. The direction of an image target's position is
 * reliable, its distance is not.
 *
 * @param {{position: {x: number, y: number, z: number}}[]} points - The tracked world points.
 * @param {THREE.Vector3} origin - The camera's world position.
 * @param {THREE.Vector3} towards - Any point on the way to the object (its reported position).
 * @returns {number | null} Scene units from `origin`; null with too few points there.
 */
export const wallDistance = (points, origin, towards) => {
  const direction = towards.clone().sub(origin).normalize()
  const cosLimit = Math.cos(WALL_SEARCH_ANGLE)
  const offset = new THREE.Vector3()
  const distances = []
  points.forEach(({position}) => {
    offset.set(position.x - origin.x, position.y - origin.y, position.z - origin.z)
    const length = offset.length()
    if (length > 0.2 && offset.dot(direction) / length >= cosLimit) {
      distances.push(length)
    }
  })
  return distances.length >= MIN_WALL_POINTS ? median(distances) : null
}

/**
 * @param {THREE.Vector3} objectPosition - The recognised object's centre, world space; the
 *   distance should be one from wallDistance, not the image target's own.
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
  along = Math.max(along, MIN_DISTANCE)

  // The object's height is only an estimate too; eye level (the camera) keeps it plausible.
  const objectHeight = THREE.MathUtils.clamp(objectPosition.y, cameraPosition.y * 0.5, cameraPosition.y * 1.5)
  const fit = contentHeight > 0 ? (objectHeight * MAX_HEIGHT_SHARE) / contentHeight : 1
  let scale = THREE.MathUtils.clamp(fit, MIN_SCALE, 1)

  // The whole exhibit, not just its spot, has to stand in front of the wall: first move it in
  // towards the visitor, then shrink it. Less than that is not possible, the wall is too close.
  const objectAlong = (objectPosition.x - cameraPosition.x) * heading.x + (objectPosition.z - cameraPosition.z) * heading.z
  if (objectAlong > WALL_GAP && contentHeight > 0) {
    const reach = contentHeight * CONTENT_DEPTH_SHARE
    const room = (from) => objectAlong - WALL_GAP - from
    if (reach * scale > room(along)) {
      along = Math.max(MIN_DISTANCE, objectAlong - WALL_GAP - reach * scale)
      scale = THREE.MathUtils.clamp(Math.min(scale, room(along) / reach), MIN_SCALE, 1)
    }
  }

  const position = cameraPosition.clone().addScaledVector(heading, along).setY(0)
  const yaw = Math.atan2(cameraPosition.x - position.x, cameraPosition.z - position.z)
  return {position, yaw, scale}
}
