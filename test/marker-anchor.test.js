import * as THREE from 'three'

import {
  MIN_WALL_CLEARANCE, emergeStart, markerPosition, wallPlane, yawToward,
} from '../src/marker-anchor.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

const camera = new THREE.Vector3(0, 1.7, 3)
const wallPoint = new THREE.Vector3(0, 1.5, -1)   // a wall facing +z, 4 units from the camera
const quaternion = (yAxisDegrees) => new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yAxisDegrees))

const straight = wallPlane(camera, wallPoint, quaternion(0))
check('a target facing the camera: the normal points back at it', near(straight.normal.z, 1) && near(straight.normal.y, 0))
const turned = wallPlane(camera, wallPoint, quaternion(30))
check('a target turned 30°: its own facing is kept', near(turned.normal.x, Math.sin(Math.PI / 6), 1e-4))
const backwards = wallPlane(camera, wallPoint, quaternion(180))
check('a target whose +z points away: the normal is flipped towards the camera', near(backwards.normal.z, 1, 1e-4))
const tilted = wallPlane(camera, wallPoint, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4))
check('a tilt is flattened: the wall stays upright', near(tilted.normal.y, 0) && near(tilted.normal.length(), 1))
const sideways = wallPlane(camera, wallPoint, quaternion(90))
check('a target facing sideways is not believed: back to the way to the camera', near(sideways.normal.z, 1) && near(sideways.normal.x, 0, 1e-4))
const noRotation = wallPlane(camera, wallPoint)
check('no rotation: the way to the camera', near(noRotation.normal.z, 1))
check('the plane passes through the object', noRotation.point.distanceTo(wallPoint) < 1e-9)

const reported = {x: 0.5, y: 0.2, z: -4}
const fixed = markerPosition(reported, camera, 3)
check('a marker keeps its direction and takes the measured distance',
  near(fixed.distanceTo(camera), 3) &&
  near(fixed.clone().sub(camera).normalize().dot(new THREE.Vector3(0.5 - 0, 0.2 - 1.7, -4 - 3).normalize()), 1, 1e-6))
check('no distance: the reported position is used', markerPosition(reported, camera, null).distanceTo(new THREE.Vector3(0.5, 0.2, -4)) < 1e-9)

const spot = new THREE.Vector3(1, 0, 1)
const yaw = yawToward(spot, camera)
check('content turned by that yaw faces the camera',
  near(Math.sin(yaw), (camera.x - spot.x) / Math.hypot(camera.x - spot.x, camera.z - spot.z)) &&
  near(Math.cos(yaw), (camera.z - spot.z) / Math.hypot(camera.x - spot.x, camera.z - spot.z)))

const start = emergeStart(new THREE.Vector3(0.5, 0, 1), straight, 0.6)
check('it starts behind the wall, reach beyond it, in line with the marker',
  start !== null && near(start.z, -1 - 0.6) && near(start.x, 0.5) && near(start.y, 0))
check('a marker at the wall has nothing to walk out of',
  emergeStart(new THREE.Vector3(0, 0, -1 + MIN_WALL_CLEARANCE / 2), straight, 0.6) === null)
check('a marker behind the wall has nothing to walk out of',
  emergeStart(new THREE.Vector3(0, 0, -2), straight, 0.6) === null)

console.log(failures === 0 ? '\nALL MARKER ANCHOR CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
