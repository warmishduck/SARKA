import * as THREE from 'three'

import {END_ANGLE, MIN_FIT_POINTS, dropToFloor, fitCylinderCentre, sitOnWallBox, walkAroundObject} from '../src/object-path.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// The camera 3 units in front (+z) of an object whose near face is at the origin.
const camera = new THREE.Vector3(0, 2, 3)
const nearFace = new THREE.Vector3(0, 0.5, 0)
const radius = 0.2
const clearance = 0.2
const walk = walkAroundObject(nearFace, camera, {floorY: 0.1, radius, clearance})
const all = [...walk.waypoints, walk.anchor]

check('the centre is one radius behind the near face', near(walk.centre.z, -radius) && near(walk.centre.x, 0))
check('everything lies on the floor', all.every((point) => near(point.y, 0.1)) && near(walk.centre.y, 0.1))
const flatDistance = (point) => Math.hypot(point.x - walk.centre.x, point.z - walk.centre.z)
check('it never comes closer to the object than the clearance', all.every((point) => flatDistance(point) >= radius + clearance - 1e-9))
check('it starts straight behind the object', near(walk.waypoints[0].x, 0) && walk.waypoints[0].z < walk.centre.z)
check('it ends in front of the object, towards the camera', walk.anchor.z > 0)
check('it ends a little to the side, END_ANGLE round', near(Math.atan2(walk.anchor.x - walk.centre.x, walk.anchor.z - walk.centre.z), END_ANGLE))
check('it goes round the right as the visitor sees it (+x here)', walk.waypoints.slice(1).every((point) => point.x > 0))
const left = walkAroundObject(nearFace, camera, {floorY: 0, radius, clearance, side: -1})
check('side -1 goes round the left', left.waypoints.slice(1).every((point) => point.x < 0) && left.anchor.x < 0)
const steps = all.slice(1).map((point, i) => point.distanceTo(all[i]))
check('the steps are short and even', Math.max(...steps) - Math.min(...steps) < 1e-9 && Math.max(...steps) < 0.1, steps[0].toFixed(3))

const sideways = walkAroundObject(nearFace, new THREE.Vector3(3, 1.5, 0), {floorY: 0, radius, clearance})
check('a camera off to the side: the walk ends towards it', sideways.anchor.x > walk.centre.x && near(sideways.centre.x, -radius))
const above = walkAroundObject(nearFace, new THREE.Vector3(0, 2, 0), {floorY: 0, radius, clearance})
check('a camera straight above: still a walk, no NaN', [...above.waypoints, above.anchor].every((point) => Number.isFinite(point.x + point.z)))

// ---------------------------------------------------------------- fitting the object from tracked points
// A cylinder of radius 0.28 and height 1.04 at (-2.1, 6.86), seen from +z: points on its near half,
// a little noisy (a fixed pseudo-random sequence), and some floor points that must be ignored.
const truth = {x: -2.1, z: 6.86}
const size = {floorY: 0.01, radius: 0.28, height: 1.04, viewer: {x: -1.8, z: 8.2}}
let seed = 1
const noise = (amount) => { seed = (seed * 16807) % 2147483647; return ((seed / 2147483647) - 0.5) * 2 * amount }
const side = Array.from({length: 24}, (_, i) => {
  const angle = -Math.PI / 2 + (i / 23) * Math.PI   // the half facing +z
  return {position: {x: truth.x + Math.sin(angle) * 0.28 + noise(0.02), y: 0.2 + (i % 6) * 0.15, z: truth.z + Math.cos(angle) * 0.28 + noise(0.02)}}
})
const floorPts = Array.from({length: 20}, (_, i) => ({position: {x: truth.x + noise(0.5), y: 0.01 + noise(0.01), z: truth.z + 0.4 + noise(0.3)}}))
const guess = {x: truth.x + 0.12, z: truth.z - 0.08}   // the tap, ~14 cm off at 2.12 units/m
const fit = fitCylinderCentre([...side, ...floorPts], guess, size)
check('the fit finds the centre from the side points', fit && Math.hypot(fit.centre.x - truth.x, fit.centre.z - truth.z) < 0.03,
  fit ? `off by ${Math.hypot(fit.centre.x - truth.x, fit.centre.z - truth.z).toFixed(3)}` : 'no fit')
check('floor points are not counted', fit?.count === side.length)
check('the centre is on the floor', near(fit?.centre.y, size.floorY))
const wall = Array.from({length: 4}, (_, i) => ({position: {x: truth.x - 0.4 + i * 0.1, y: 0.5, z: truth.z - 0.45}}))
const withWall = fitCylinderCentre([...side, ...wall], guess, size)
check('a few wall points nearby shift it only a little', withWall && Math.hypot(withWall.centre.x - truth.x, withWall.centre.z - truth.z) < 0.08,
  withWall ? `off by ${Math.hypot(withWall.centre.x - truth.x, withWall.centre.z - truth.z).toFixed(3)}` : 'no fit')
// The purifier in a corner: a wall 8 cm behind it and another beside it, as many points as the object.
const cornerWall = [
  ...Array.from({length: 16}, (_, i) => ({position: {x: truth.x - 0.5 + i * 0.07, y: 0.2 + (i % 5) * 0.15, z: truth.z - 0.36}})),
  ...Array.from({length: 10}, (_, i) => ({position: {x: truth.x - 0.36, y: 0.2 + (i % 5) * 0.15, z: truth.z - 0.3 + i * 0.06}})),
]
const inCorner = fitCylinderCentre([...side, ...cornerWall], guess, size)
const cornerOff = inCorner && Math.hypot(inCorner.centre.x - truth.x, inCorner.centre.z - truth.z)
check('in a corner: the wall points are dropped and the fit stays on the object', cornerOff !== null && cornerOff < 0.03,
  inCorner ? `off by ${cornerOff.toFixed(3)}, ${inCorner.count} points kept of ${side.length + cornerWall.length}` : 'no fit')
check('too few points: no fit', fitCylinderCentre(side.slice(0, MIN_FIT_POINTS - 1), guess, size) === null)
const farGuess = {x: truth.x + 0.5, z: truth.z + 0.05}   // a tap about 24 cm off, to the side
const farFit = fitCylinderCentre(side, farGuess, size)
check('a tap a radius and more off: still the centre, on the far side of the points', farFit && Math.hypot(farFit.centre.x - truth.x, farFit.centre.z - truth.z) < 0.05,
  farFit ? `off by ${Math.hypot(farFit.centre.x - truth.x, farFit.centre.z - truth.z).toFixed(3)}, ${farFit.count} points` : 'no fit')
check('points far from the guess are not used', fitCylinderCentre(side, {x: truth.x + 3, z: truth.z}, size) === null)

// ---------------------------------------------------------------- sitting on a box on a wall
// The camera in front of a box face whose middle is at (0, 1.2, 0), facing +z; the box 0.34 tall,
// 0.12 deep, its top front edge at y = 1.37.
const cam = new THREE.Vector3(0.1, 1.6, 1.3)
const dirTo = (p) => p.clone().sub(cam).normalize()
const faceMid = new THREE.Vector3(0, 1.2, 0)
const topEdge = new THREE.Vector3(0, 1.37, 0)
const sit = sitOnWallBox(cam, dirTo(faceMid), dirTo(topEdge), cam.distanceTo(faceMid), {height: 0.34, depth: 0.12}, 0.3)
check('the seat is on the top, half the depth behind the front edge', sit && near(sit.seat.y, 1.37, 1e-6) && near(sit.seat.z, -0.06, 0.01) && near(sit.seat.x, 0, 0.01),
  sit ? sit.seat.toArray().map((v) => v.toFixed(3)).join(', ') : 'null')
check('the box\'s middle is half its height below the top', sit && near(sit.boxCentre.y, 1.2, 1e-6) && near(sit.boxCentre.z, -0.06, 0.01))
check('it comes up from inside the box, below the seat', sit && near(sit.emergeFrom.y, 1.07, 1e-6) && near(sit.emergeFrom.z, sit.seat.z))
check('it faces the camera', sit && Math.abs(sit.yaw - Math.atan2(0.1, 1.3)) < 0.02, sit?.yaw.toFixed(3))
check('a top ray that points away: no seat', sitOnWallBox(cam, dirTo(faceMid), new THREE.Vector3(0, 0, 1), cam.distanceTo(faceMid), {height: 0.34, depth: 0.12}, 0.3) === null)

const drop = sit && dropToFloor(sit, 0.34, 0.12, 0.05, 0.3)
check('dropToFloor: it lands on the floor', drop && near(drop.seat.y, 0.05))
check('dropToFloor: it lands in front of the face, towards the camera',
  drop && near(drop.seat.clone().sub(sit.boxCentre).setY(0).length(), 0.12 / 2 + 0.3, 1e-6) && drop.seat.z > sit.boxCentre.z)
check('dropToFloor: it starts inside the box, feet at its bottom, hidden by the box',
  drop && near(drop.emergeFrom.y, sit.boxCentre.y - 0.17) && near(drop.emergeFrom.x, sit.boxCentre.x) && near(drop.emergeFrom.z, sit.boxCentre.z))
const thick = dropToFloor(sit, 0.34, 0.12, 0.05, 0.3, 0.5)
check('dropToFloor: a thick creature starts further back, into the wall',
  near(thick.emergeFrom.z, sit.boxCentre.z - (0.5 * 0.4 - 0.06) * Math.cos(sit.yaw), 1e-6) && thick.emergeFrom.z < drop.emergeFrom.z)
check('dropToFloor: the facing and the box are kept', drop && drop.yaw === sit.yaw && drop.boxCentre.equals(sit.boxCentre))

console.log(failures === 0 ? '\nALL OBJECT PATH CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
