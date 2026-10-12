import * as THREE from 'three'

import {
  CONTENT_DEPTH_SHARE, MAX_DISTANCE, MAX_HEIGHT_SHARE, MIN_DISTANCE, MIN_SCALE, WALL_GAP,
  floorHeight, floorSpot, median, wallDistance,
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
const reach = (height, spot) => height * CONTENT_DEPTH_SHARE * spot.scale

check('looking ahead: no spot yet', floorSpot(painting, camera, looking(5), acornAlone) === null)
check('tilting down only a little (the phone case that landed behind the wall): no spot yet',
  floorSpot(painting, camera, looking(25), acornAlone) === null)

const steep = floorSpot(painting, camera, looking(60), acornAlone)
check('looking down at the floor close by: lands where the view meets the floor',
  steep && near(along(steep), hitDistance(2, 60)) && near(steep.position.x, 0) && steep.position.y === 0,
  steep && `along=${along(steep).toFixed(3)}`)
check('facing the camera straight on: no turn', steep && near(steep.yaw, 0))

const farPainting = new THREE.Vector3(0, 1.9, -6)
const first = floorSpot(farPainting, camera, looking(31), acornAlone)
check('just past the threshold, where the view meets the floor far away: stays close instead',
  first && near(along(first), MAX_DISTANCE), first && `along=${along(first).toFixed(3)} (view ray: ${hitDistance(2, 31).toFixed(2)})`)

// The exhibit reaches behind its spot (the stone wall and the creature waiting behind it), and
// all of that has to fit between the visitor and the object's wall.
const wallMid = floorSpot(new THREE.Vector3(0, 1.9, 0.9), camera, looking(35), acornAlone)   // wall 2.6 ahead
check('a wall too near for the exhibit behind its spot: the spot moves in, the size stays',
  wallMid && near(along(wallMid), 0.96) && near(wallMid.scale, 1.9 * MAX_HEIGHT_SHARE / acornAlone),
  wallMid && `along=${along(wallMid).toFixed(3)} scale=${wallMid.scale.toFixed(3)}`)
check('...and it ends just short of the wall',
  wallMid && near(along(wallMid) + reach(acornAlone, wallMid) + WALL_GAP, 2.6))

const wallClose = floorSpot(new THREE.Vector3(0, 1.9, 2), camera, looking(35), acornAlone)     // wall 1.5 ahead
check('a wall closer than that: as near as allowed, and as small',
  wallClose && near(along(wallClose), MIN_DISTANCE) && wallClose.scale === MIN_SCALE,
  wallClose && `along=${along(wallClose).toFixed(3)} scale=${wallClose.scale.toFixed(3)}`)

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

// ---- the floor, from the heights of the tracked world points (the camera is 2 up) ----
const eye = 2
const around = (centre, count, spread = 0.02) => Array.from({length: count}, (_, i) => centre + (i % 3 - 1) * spread)

check('many points at one height: that is the floor',
  near(floorHeight([...around(0, 6), 0.3, 0.8, 1.1], eye), 0, 0.02))
check('a floor above y = 0 is found where it is', near(floorHeight(around(0.9, 8), eye), 0.9, 0.02))
check('the points of a wall are spread over its height: no floor',
  floorHeight(Array.from({length: 12}, (_, i) => -0.5 + i * 0.14), eye) === null)
check('too few points: no floor', floorHeight(around(0, 5), eye) === null)
check('no points: no floor', floorHeight([], eye) === null)
check('points above the camera are not the floor', floorHeight(around(2.5, 10), eye) === null)
check('points at the camera\'s own height are not the floor', floorHeight(around(1.9, 8), eye) === null)
check('points far under the camera are not the floor', floorHeight(around(-2, 8), eye) === null)
check('a floor and a bench above it as crowded: the floor (the lower) wins',
  near(floorHeight([...around(0.5, 6), ...around(0, 6)], eye), 0, 0.02))
check('a crowded band among very many scattered points is no floor',
  floorHeight([...around(0, 6), ...Array.from({length: 40}, (_, i) => -0.8 + i * 0.045)], eye) === null)

// ---- the wall, from the tracked world points in the object's direction ----
const origin = new THREE.Vector3(0, 2, 3.5)
const toObject = new THREE.Vector3(0.03, 1.96, -0.17)   // what the image target reported: 3.7 away
const dir = toObject.clone().sub(origin).normalize()
const sideways = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
const pointAt = (direction, distance, offset = 0) => ({
  position: origin.clone().addScaledVector(direction, distance).addScaledVector(sideways, offset),
})
const wallPoints = Array.from({length: 8}, (_, i) => pointAt(dir, 1.9 + 0.03 * i, (i - 4) * 0.02))

check('points on the object: the wall is where they are, not where the target says',
  near(wallDistance(wallPoints, origin, toObject), 2.005, 0.01) && toObject.distanceTo(origin) > 3.5,
  `${wallDistance(wallPoints, origin, toObject)?.toFixed(3)} (target said ${toObject.distanceTo(origin).toFixed(2)})`)
const aside = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5)
check('points off to the side are left out',
  near(wallDistance([...wallPoints, ...Array.from({length: 12}, () => pointAt(aside, 5))], origin, toObject), 2.005, 0.01))
check('points behind the camera are left out',
  near(wallDistance([...wallPoints, ...Array.from({length: 12}, () => pointAt(dir.clone().negate(), 4))], origin, toObject), 2.005, 0.01))
check('the target as a plain object, the way an 8th Wall event delivers it',
  near(wallDistance(wallPoints, origin, {x: toObject.x, y: toObject.y, z: toObject.z}), 2.005, 0.01))
check('too few points there: no distance', wallDistance(wallPoints.slice(0, 4), origin, toObject) === null)
check('a handful is enough', wallDistance(wallPoints.slice(0, 5), origin, toObject) !== null)
check('no points: no distance', wallDistance([], origin, toObject) === null)

console.log(failures === 0 ? '\nALL FLOOR SPOT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
