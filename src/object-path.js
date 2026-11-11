// The ML object flow's maths (`/?scan&c=test-purifier`): a free-standing object on the floor (an
// air purifier) that the creature hides behind, then walks round to stand in front of the visitor.
// Pure (three.js maths only, no DOM, no 8th Wall), so it can be tested in Node.
//
// The object is taken as an upright cylinder. Only its near face is measured (the camera ray at
// the object's middle height, see scan.js), so its centre is one radius further along that ray.

import * as THREE from 'three'

/** Where the walk ends: this far round from straight in front of the object (radians, about 25°). */
export const END_ANGLE = 0.45
/** The arc is cut into steps of about this angle (radians, about 10°). */
export const STEP_ANGLE = 0.18

/**
 * @typedef {Object} ObjectWalk
 * @property {THREE.Vector3} centre - The object's centre on the floor.
 * @property {THREE.Vector3[]} waypoints - From straight behind the object round one side, all on
 *   the floor; the anchor (where it ends) not included.
 * @property {THREE.Vector3} anchor - Where the creature ends up, in front of the object, a little
 *   to the side it came round, so the object stays in view.
 */

/**
 * The walk out from behind an object and round it to the front, on a circle that keeps
 * `clearance` between the creature and the object's surface, so it never walks through it.
 *
 * @param {{x: number, z: number}} nearFace - The point of the object's surface the camera looked
 *   at (its height is ignored).
 * @param {{x: number, z: number}} cameraPosition
 * @param {Object} options
 * @param {number} options.floorY - The floor's height; every point returned lies on it.
 * @param {number} options.radius - The object's radius, scene units.
 * @param {number} options.clearance - Gap between the object's surface and the creature's
 *   centre, scene units (at least the creature's half-width).
 * @param {1 | -1} [options.side] - 1 goes round the object's right as the visitor sees it, -1 its left.
 * @returns {ObjectWalk}
 */
export const walkAroundObject = (nearFace, cameraPosition, {floorY, radius, clearance, side = 1}) => {
  const toCamera = new THREE.Vector3(cameraPosition.x - nearFace.x, 0, cameraPosition.z - nearFace.z)
  if (toCamera.lengthSq() < 1e-8) {
    toCamera.set(0, 0, 1)
  }
  toCamera.normalize()
  // The visitor's right, looking at the object.
  const right = new THREE.Vector3(toCamera.z, 0, -toCamera.x).multiplyScalar(side)
  const centre = new THREE.Vector3(nearFace.x, floorY, nearFace.z).addScaledVector(toCamera, -radius)
  const pathRadius = radius + clearance

  // 0 is straight in front of the object (towards the camera), PI straight behind it.
  const pointAt = (angle) => centre.clone()
    .addScaledVector(toCamera, Math.cos(angle) * pathRadius)
    .addScaledVector(right, Math.sin(angle) * pathRadius)

  const steps = Math.max(1, Math.ceil((Math.PI - END_ANGLE) / STEP_ANGLE))
  const waypoints = []
  for (let i = 0; i < steps; i++) {
    waypoints.push(pointAt(Math.PI - (i / steps) * (Math.PI - END_ANGLE)))
  }
  return {centre, waypoints, anchor: pointAt(END_ANGLE)}
}

/** A fit needs this many tracked points on the object's side. */
export const MIN_FIT_POINTS = 6
/** Points this far from the guessed centre (in radii) and no further can be on the object. */
export const FIT_SEARCH_RADII = 3
/** How far off the fitted circle (in radii) a point may lie and still count, round after round. */
export const FIT_INLIER_SHARES = [0.6, 0.35, 0.2]
/** Points lower than this share of the object's height are taken to be floor. */
export const FIT_MIN_HEIGHT_SHARE = 0.1

/**
 * Where an upright cylinder of known size stands, from the engine's tracked points on its side:
 * the centre whose circle the points lie closest to (a least-squares circle of fixed radius).
 *
 * The points lie on the side facing the viewer, and a circle of that radius fits an arc from
 * either side of it, so the search starts on the far side: one radius beyond the points' middle.
 *
 * @param {{position: {x: number, y: number, z: number}}[]} points - The tracked world points.
 * @param {{x: number, z: number}} guess - Where the centre is thought to be (from the tap).
 * @param {Object} options
 * @param {number} options.floorY
 * @param {number} options.radius - Scene units.
 * @param {number} options.height - Scene units.
 * @param {{x: number, z: number}} options.viewer - The camera, which sees the points' side.
 * @returns {{centre: THREE.Vector3, count: number} | null} null with too few points on the side.
 */
export const fitCylinderCentre = (points, guess, {floorY, radius, height, viewer}) => {
  const reach = radius * FIT_SEARCH_RADII
  const side = points
    .map(({position}) => position)
    .filter((p) => p.y >= floorY + height * FIT_MIN_HEIGHT_SHARE && p.y <= floorY + height &&
      Math.hypot(p.x - guess.x, p.z - guess.z) <= reach)
  if (side.length < MIN_FIT_POINTS) {
    return null
  }
  const middleX = side.reduce((sum, p) => sum + p.x, 0) / side.length
  const middleZ = side.reduce((sum, p) => sum + p.z, 0) / side.length
  const away = Math.hypot(middleX - viewer.x, middleZ - viewer.z) || 1e-9
  // Each point pulls the centre to one radius behind it, as seen from the current centre.
  let x = middleX + ((middleX - viewer.x) / away) * radius
  let z = middleZ + ((middleZ - viewer.z) / away) * radius
  // Points of a wall or a neighbour behind the object pull a plain fit off it (on the phone the
  // purifier stood in a corner), so after a first fit only the points near its circle are kept,
  // and the tolerance narrows round by round.
  let used = side
  const fitTo = (points, rounds) => {
    for (let round = 0; round < rounds; round++) {
      let sumX = 0
      let sumZ = 0
      points.forEach((p) => {
        const length = Math.hypot(p.x - x, p.z - z) || 1e-9
        sumX += p.x - ((p.x - x) / length) * radius
        sumZ += p.z - ((p.z - z) / length) * radius
      })
      x = sumX / points.length
      z = sumZ / points.length
    }
  }
  fitTo(used, 20)
  for (const share of FIT_INLIER_SHARES) {
    const inliers = side.filter((p) => Math.abs(Math.hypot(p.x - x, p.z - z) - radius) <= radius * share)
    if (inliers.length < MIN_FIT_POINTS) {
      break
    }
    used = inliers
    fitTo(used, 10)
  }
  return {centre: new THREE.Vector3(x, floorY, z), count: used.length}
}

/**
 * @typedef {Object} WallBoxSeat
 * @property {THREE.Vector3} boxCentre - The middle of the box (for an occluder of its size).
 * @property {THREE.Vector3} seat - The middle of its top, where a creature sits.
 * @property {THREE.Vector3} emergeFrom - Below the seat inside the box, where the creature starts so
 *   that it comes up from behind the top edge.
 * @property {number} yaw - Radians about y that turn content (facing +z) and the box to the camera.
 */

/**
 * Where a creature sits on a box hanging on a wall, from two rays through the box's outline on the
 * screen: one through its middle, one through the middle of its top edge. The box's front face is
 * taken as upright and facing the camera, at `distance` along the middle ray.
 *
 * @param {{x: number, y: number, z: number}} cameraPosition
 * @param {THREE.Vector3} middleDirection - Unit ray to the middle of the box's face.
 * @param {THREE.Vector3} topDirection - Unit ray to the middle of its top edge.
 * @param {number} distance - Along middleDirection to the face, scene units.
 * @param {{height: number, depth: number}} size - Scene units.
 * @param {number} rise - How far below the top the creature starts, scene units.
 * @returns {WallBoxSeat | null} null when the top ray does not meet the face's plane in front.
 */
export const sitOnWallBox = (cameraPosition, middleDirection, topDirection, distance, {height, depth}, rise) => {
  const camera = new THREE.Vector3(cameraPosition.x, cameraPosition.y, cameraPosition.z)
  const faceMiddle = camera.clone().addScaledVector(middleDirection, distance)
  const toCamera = new THREE.Vector3(camera.x - faceMiddle.x, 0, camera.z - faceMiddle.z)
  if (toCamera.lengthSq() < 1e-8) {
    return null
  }
  toCamera.normalize()
  // The top ray meets the face's plane (through faceMiddle, facing toCamera) at the top front edge.
  const towardsFace = -topDirection.dot(toCamera)
  if (towardsFace <= 1e-6) {
    return null
  }
  const along = faceMiddle.clone().sub(camera).dot(toCamera) / -towardsFace
  const topFront = camera.clone().addScaledVector(topDirection, along)
  const seat = topFront.clone().addScaledVector(toCamera, -depth / 2)
  const boxCentre = seat.clone().setY(topFront.y - height / 2)
  const emergeFrom = seat.clone().setY(seat.y - rise)
  return {boxCentre, seat, emergeFrom, yaw: Math.atan2(toCamera.x, toCamera.z)}
}

/**
 * The same box on a wall, but the creature ends on the floor in front of it instead of on its top:
 * it starts inside the box, with its feet at the box's bottom, and drops from there to the floor.
 *
 * @param {WallBoxSeat} box - From sitOnWallBox.
 * @param {number} height - The box's, scene units.
 * @param {number} depth - How far the box sticks out from the wall, scene units.
 * @param {number} floorY - Where the floor is, world y.
 * @param {number} gap - How far in front of the box's face it lands, scene units.
 * @param {number} creatureHeight - Scene units. A creature has some thickness (a sheet bulges
 *   about this share of its height to the front), so its start is moved back into the wall until
 *   its front is behind the box's face, or it would show in front of the box at the start.
 * @returns {WallBoxSeat} `seat` is on the floor, `emergeFrom` at the box's bottom (moved back), the rest as given.
 */
export const dropToFloor = (box, height, depth, floorY, gap, creatureHeight = 0) => {
  const toCamera = new THREE.Vector3(Math.sin(box.yaw), 0, Math.cos(box.yaw))
  const seat = box.boxCentre.clone().addScaledVector(toCamera, depth / 2 + gap).setY(floorY)
  const back = Math.max(0, creatureHeight * CREATURE_FRONT_BULGE - depth / 2)
  const emergeFrom = box.boxCentre.clone().addScaledVector(toCamera, -back).setY(box.boxCentre.y - height / 2)
  return {...box, seat, emergeFrom}
}

/** How far a creature reaches to the front of where it stands, as a share of its height (the ghost: ~0.4). */
const CREATURE_FRONT_BULGE = 0.4
