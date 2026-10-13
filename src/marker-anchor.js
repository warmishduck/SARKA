// The marker flow's maths (`/?scan&marker`): content tied to a marker lying on the floor, with the
// real wall (the exhibit's own image target) standing in as an invisible plane that hides what is
// behind it. Pure (three.js maths only, no DOM, no 8th Wall), so it can be tested in Node.
//
// An image target's direction from the camera is reliable, its distance is not (see floor-spot.js),
// so every position here is the reported one pulled along its own ray to a distance read from the
// tracked world points.

import * as THREE from 'three'

/** The cone the marker's distance is read in (radians, about 6°): it is small, and so is the floor round it. */
export const MARKER_SEARCH_ANGLE = 0.1
export const MIN_MARKER_POINTS = 4
/** A target's own facing counts only when it is within 60° of the way to the camera. */
export const FACING_LIMIT = 0.5
/** A marker closer to the wall than this (scene units) has nothing to walk out of. */
export const MIN_WALL_CLEARANCE = 0.05

/**
 * @typedef {Object} WallPlane
 * @property {THREE.Vector3} point - A point on the wall.
 * @property {THREE.Vector3} normal - Unit, horizontal, pointing out of the wall towards the visitor.
 */

/**
 * The real wall as a plane, from the object stuck on it.
 *
 * The normal is the target's own facing (its +z, as three.js and 8th Wall draw a poster) flattened
 * to horizontal, since a wall stands upright whatever the target's tilt estimate says. When that
 * does not roughly face the camera, the way back to the camera is used instead.
 *
 * @param {{x: number, y: number, z: number}} cameraPosition
 * @param {{x: number, y: number, z: number}} point - Where the target is (its distance already corrected).
 * @param {{x: number, y: number, z: number, w: number}} [rotation] - `detail.rotation` of the target.
 * @returns {WallPlane}
 */
export const wallPlane = (cameraPosition, point, rotation) => {
  const wallPoint = new THREE.Vector3(point.x, point.y, point.z)
  const toCamera = new THREE.Vector3(cameraPosition.x - point.x, 0, cameraPosition.z - point.z)
  if (toCamera.lengthSq() < 1e-8) {
    toCamera.set(0, 0, 1)
  }
  toCamera.normalize()

  if (rotation) {
    const facing = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
      .setY(0)
    if (facing.lengthSq() > 1e-6) {
      facing.normalize()
      if (facing.dot(toCamera) < 0) {
        facing.negate()
      }
      if (facing.dot(toCamera) >= FACING_LIMIT) {
        return {point: wallPoint, normal: facing}
      }
    }
  }
  return {point: wallPoint, normal: toCamera}
}

/**
 * Where a marker really is: along its reported direction, at the distance read from the points.
 *
 * @param {{x: number, y: number, z: number}} reported - `detail.position` of the marker.
 * @param {{x: number, y: number, z: number}} cameraPosition
 * @param {number | null} distance - From wallDistance; null when there were too few points.
 * @returns {THREE.Vector3} The reported position itself when there is no distance.
 */
export const markerPosition = (reported, cameraPosition, distance) => {
  const position = new THREE.Vector3(reported.x, reported.y, reported.z)
  if (distance === null) {
    return position
  }
  const camera = new THREE.Vector3(cameraPosition.x, cameraPosition.y, cameraPosition.z)
  return position.sub(camera).setLength(distance).add(camera)
}

/**
 * The turn that makes content (facing +z at 0) face the camera.
 *
 * @param {THREE.Vector3} position
 * @param {{x: number, z: number}} cameraPosition
 * @returns {number} Radians about y.
 */
export const yawToward = (position, cameraPosition) =>
  Math.atan2(cameraPosition.x - position.x, cameraPosition.z - position.z)

/**
 * Where content starts when it walks out of the wall to its marker: straight behind the marker,
 * `reach` beyond the wall, so none of it shows until the wall plane lets it through.
 *
 * @param {THREE.Vector3} position - The marker.
 * @param {WallPlane} plane
 * @param {number} reach - How far the content extends, scene units.
 * @returns {THREE.Vector3 | null} null when the marker is not in front of the wall.
 */
export const emergeStart = (position, plane, reach) => {
  const inFront = position.clone().sub(plane.point).dot(plane.normal)
  if (inFront < MIN_WALL_CLEARANCE) {
    return null
  }
  return position.clone().addScaledVector(plane.normal, -(inFront + reach))
}
