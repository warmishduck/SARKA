import * as THREE from 'three'

import {
  FLAT_TOLERANCE, MAX_DISTANCE, MAX_EYE_HEIGHT, MAX_HEIGHT_SHARE, MIN_DISTANCE, MIN_EYE_HEIGHT, MIN_SCALE,
  WALL_GAP, flatSurfaceHeight, floorSpot, median,
} from '../src/floor-spot.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// A camera's view direction, `down` degrees below the horizon, turned `heading` degrees from -z
// towards -x (the same way three.js turns a camera by rotation.y).
const looking = (down, heading = 0) => {
  const d = THREE.MathUtils.degToRad(down)
  const h = THREE.MathUtils.degToRad(heading)
  return new THREE.Vector3(-Math.sin(h) * Math.cos(d), -Math.sin(d), -Math.cos(h) * Math.cos(d))
}
// Which way content turned by `yaw` faces (it faces +z when yaw is 0).
const facing = (yaw) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
// Where the view ray `down` degrees below the horizon meets the floor, from `height`.
const hitDistance = (height, down) => height / Math.tan(THREE.MathUtils.degToRad(down))

const camera = new THREE.Vector3(0, 2, 3.5)      // where the AR view starts the camera
const painting = new THREE.Vector3(0, 1.9, 0.5)  // on a wall 3 units in front of it
const acornAlone = 0.85 * 3
const along = (spot) => camera.z - spot.position.z

check('looking ahead: no spot yet', floorSpot(painting, camera, looking(5), acornAlone) === null)
check('tilting down only a little (the phone case that landed behind the wall): no spot yet',
  floorSpot(painting, camera, looking(25), acornAlone) === null)

const steep = floorSpot(painting, camera, looking(60), acornAlone)
check('looking down at the floor close by: lands where the view meets the floor',
  steep && near(along(steep), hitDistance(2, 60)) && near(steep.position.x, 0) && steep.position.y === 0,
  steep && `along=${along(steep).toFixed(3)}`)
check('facing the camera straight on: no turn', steep && near(steep.yaw, 0))

const first = floorSpot(painting, camera, looking(31), acornAlone)
check('just past the threshold, where the view meets the floor far away: stays close instead',
  first && near(along(first), MAX_DISTANCE), first && `along=${along(first).toFixed(3)} (view ray: ${hitDistance(2, 31).toFixed(2)})`)

const wallClose = floorSpot(new THREE.Vector3(0, 1.9, 2), camera, looking(35), acornAlone)
check('a wall closer than that: stops just out from it', wallClose && near(wallClose.position.z, 2 + WALL_GAP))

const wrongDepth = floorSpot(new THREE.Vector3(0, 1.9, -40), camera, looking(60), acornAlone)
check('object estimated far too far away: no effect', wrongDepth && near(along(wrongDepth), hitDistance(2, 60)))
const wrongSide = floorSpot(new THREE.Vector3(0, 1.9, 9), camera, looking(60), acornAlone)
check('object estimated behind the camera: ignored', wrongSide && near(along(wrongSide), hitDistance(2, 60)))

const down = floorSpot(painting, camera, new THREE.Vector3(0, -1, 0), acornAlone)
check('straight down: not closer than the minimum', down && near(along(down), MIN_DISTANCE))

const ok = [0, 45, 90, 135, 180, -60].every((heading) => {
  const cam = new THREE.Vector3(1, 1.5, -2)
  const s = floorSpot(new THREE.Vector3(1, 1.7, -2).addScaledVector(looking(0, heading), 3), cam, looking(45, heading), acornAlone)
  const toCamera = new THREE.Vector3(cam.x - s.position.x, 0, cam.z - s.position.z).normalize()
  return facing(s.yaw).dot(toCamera) > 0.9999
})
check('whatever way the camera is turned, content faces it', ok)

check('a tall creature shrinks to stay below the painting', steep && near(steep.scale * acornAlone, painting.y * MAX_HEIGHT_SHARE),
  steep && `scale=${steep.scale.toFixed(3)}`)
check('a small creature keeps its size', floorSpot(painting, camera, looking(45), 0.5).scale === 1)
check('an implausibly low object estimate is bounded by eye level',
  near(floorSpot(new THREE.Vector3(0, 0.05, 0.5), camera, looking(45), 1).scale, 2 * 0.5 * MAX_HEIGHT_SHARE))
check('never shrinks below the minimum', floorSpot(painting, camera, looking(45), 100).scale === MIN_SCALE)
check('no creatures (a game only): no shrinking', floorSpot(painting, camera, looking(45), 0).scale === 1)

// A floor that is not at y = 0 is handled by the caller, which hands floorSpot everything measured
// from it: the spot comes out the same, only lifted by the floor's height.
const floorAt = 0.7
const lifted = (v) => v.clone().setY(v.y - floorAt)
const onRaisedFloor = floorSpot(lifted(painting), lifted(camera), looking(50), acornAlone)
check('a floor measured above y = 0: the view meets it closer, measured from that floor',
  onRaisedFloor && near(onRaisedFloor.position.y, 0) && near(onRaisedFloor.position.z, camera.z - hitDistance(2 - floorAt, 50)),
  onRaisedFloor && `z=${onRaisedFloor.position.z.toFixed(3)}`)

check('median: odd, even, unordered', median([3, 1, 2]) === 2 && median([4, 1, 2, 3]) === 2.5 && median([5]) === 5)

const eye = 2   // the camera's height; a floor 2 below it is at y = 0
check('hits that agree at the same height: that height',
  near(flatSurfaceHeight([0.02, 0, -0.03], eye), 0, 0.02))
check('one hit alone is not enough to call it flat', flatSurfaceHeight([0], eye) === null)
check('no hits: null', flatSurfaceHeight([], eye) === null)
check('the foot of a wall (the height climbs up the screen) is not a floor',
  flatSurfaceHeight([0.3, 0.9, 1.5], eye) === null)
check('a floor with one stray hit: the stray one is ignored',
  near(flatSurfaceHeight([0.01, -0.02, 0.0, 1.4], eye), 0, 0.02))
check('on a tie, the lower group wins (the floor, not a bench above it)',
  near(flatSurfaceHeight([0.5, 0.52, 0, 0.03], eye), 0.015, 1e-6))
check('hits right at the tolerance still agree', flatSurfaceHeight([0, FLAT_TOLERANCE], eye) !== null)
check('a surface at the camera\'s own height is no floor', flatSurfaceHeight([1.9, 1.95], eye) === null,
  `needs at least ${MIN_EYE_HEIGHT} below`)
check('a surface far under the camera is no floor', flatSurfaceHeight([-2, -2.05], eye) === null,
  `at most ${MAX_EYE_HEIGHT} below`)
check('a floor above y = 0 is found where it is', near(flatSurfaceHeight([0.9, 0.92], eye), 0.91))

console.log(failures === 0 ? '\nALL FLOOR SPOT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
