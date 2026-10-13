// The object scanner (`/?scan`), all in one camera session:
//  1. searching: the camera looks for any exhibit object registered as an image target;
//  2. found: the object glows, and the visitor is asked to point the camera at the floor;
//  3. placed: once they do, that exhibit's creatures appear on the floor where they look, short
//     of the object's wall, facing them (see floor-spot.js), and the regular exhibit view
//     (threejs-scene-init.js) takes over. Two things are measured from the engine's tracked
//     world points first, because what the engine reports is only an assumption: how far the
//     object's wall is (an image target's own distance came out several times too far) and how
//     high the floor is (y = 0 is only where the engine puts it).
// Add `debug` to the address (/?scan&debug) for a live readout of all this on the phone.
//
// `/?scan&marker` is the marker flow: the exhibit's object still names the exhibit and gives the
// wall, but the content stands on a marker printed and laid on the floor (FLOOR_MARKER) and is
// re-anchored to it whenever the marker is seen again, which keeps it from drifting. An invisible
// plane on the real wall hides what is behind it, and the creature starts behind the wall and
// walks out through it (see marker-anchor.js).

import * as THREE from 'three'

import {CREATURES} from './content/creatures.js'
import {IMAGE_TARGET_DATA} from './image-targets'
import {routeFromImageTarget} from './route'
import {TEXT} from './i18n'
import {FLOOR_PITCH, floorHeight, floorSpot, median, wallDistance} from './floor-spot'
import {
  MARKER_SEARCH_ANGLE, MIN_MARKER_POINTS, contentScale, emergeStart, markerPosition, wallPlane, yawToward,
} from './marker-anchor'
import {createDebugPanel} from './debug-panel'
import {initScenePipelineModule, placeCameraAtStart} from './threejs-scene-init'
import {createSparkBurst} from './spark'
import {startXr} from './xr-pipeline'

/** The image target (public/image-targets/floor-marker.json) that is laid on the floor. */
const FLOOR_MARKER = 'floor-marker'
const MARKER_SCALE = 0.6       // content scale when the marker reports no width (see contentScale)

const GLOW_COLOR = 0xffd98a
const GLOW_SIZE = 1.8          // the halo's diameter, in multiples of the object's size
const GLOW_PULSE_SPEED = 4     // radians per second
const GLOW_FADE_SPEED = 2      // opacity per second when it goes away
const MIN_GLOW_SECONDS = 1.2   // the glow shows at least this long, even if already looking down

const FLOOR_SAMPLE_SECONDS = 0.1   // between two readings of the floor's height
const FLOOR_SAMPLES_NEEDED = 5     // readings before the floor counts as measured
const FLOOR_SAMPLES_KEPT = 9       // the median is taken over the latest of them
const FLOOR_GIVE_UP_SECONDS = 2    // looking down this long without a measurement: assume y = 0

/** A soft ring: clear in the middle so the object itself stays visible, brightest near its edge. */
const makeGlowTexture = () => {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,0)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  gradient.addColorStop(0.68, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

/**
 * A pulsing halo, with a burst of sparks when it first appears, over a recognised object.
 * Round, so it looks right whichever way the object's image target is stored (portrait or
 * rotated landscape).
 *
 * @param {THREE.Scene} scene
 */
const createObjectGlow = (scene) => {
  const group = new THREE.Group()
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: GLOW_COLOR, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }))
  group.add(halo)
  group.visible = false
  scene.add(group)

  let sparks = null
  let elapsed = 0
  let fading = false

  return {
    /** @param {{position: {x: number, y: number, z: number}, scale: number}} detail - From a reality.image* event. */
    show(detail) {
      group.position.copy(detail.position)
      halo.scale.setScalar(detail.scale * GLOW_SIZE)
      if (!sparks) {
        const radius = detail.scale * 0.6
        const sparkRoot = new THREE.Group()
        sparkRoot.position.y = -radius * 0.6   // createSparkBurst starts its sparks this far up
        group.add(sparkRoot)
        sparks = createSparkBurst(sparkRoot, {radius, color: GLOW_COLOR})
      }
      group.visible = true
    },
    hide() {
      fading = true
    },
    /** @param {number} dt - Seconds since the last frame. */
    update(dt) {
      if (!group.visible) {
        return
      }
      elapsed += dt
      if (sparks) {
        sparks.update(dt)
      }
      const material = halo.material
      if (fading) {
        material.opacity = Math.max(0, material.opacity - dt * GLOW_FADE_SPEED)
        if (material.opacity === 0) {
          group.visible = false
          scene.remove(group)
        }
      } else {
        material.opacity = 0.45 + 0.25 * Math.sin(elapsed * GLOW_PULSE_SPEED)
      }
    },
  }
}

/** A hint at the bottom of the screen; returns {setText, remove}. */
const createHint = (text) => {
  const root = document.createElement('div')
  root.className = 'ui'
  const hint = document.createElement('div')
  hint.className = 'ui-toast ui-hint is-visible'
  hint.textContent = text
  root.appendChild(hint)
  document.body.appendChild(root)
  return {
    setText: (next) => { hint.textContent = next },
    remove: () => root.remove(),
  }
}

/**
 * How tall the exhibit's tallest creature is, as it would stand in the QR view.
 *
 * @param {import('./content/exhibits.js').Exhibit} exhibit
 * @returns {number} Scene units; 0 for an exhibit with no creatures.
 */
const tallestCreature = (exhibit) => Math.max(0, ...exhibit.creatures.map(
  (placement) => placement.targetHeight ?? CREATURES[placement.id].targetHeight
))

/** The scanner's camera pipeline module: steps 1-3 above. */
const scanPipelineModule = () => {
  const clock = new THREE.Clock()
  const forward = new THREE.Vector3()
  const objectPosition = new THREE.Vector3()
  let state = 'searching'   // -> 'found' -> 'placed'
  let foundName = null
  let foundSeconds = 0
  let worldPoints = []        // the engine's tracked points, as of the latest frame
  // Until the engine has worked out where the phone is it returns no points and keeps moving the
  // world about, so content placed then jumps or follows the camera. null until the first report.
  let tracking = null
  const floorSamples = []     // readings of the floor's height
  let lookingDownSeconds = 0
  let secondsSinceSample = 0
  let exhibit = null
  let glow = null
  let hint = null
  let canvas = null
  let exhibitModule = null
  const debug = createDebugPanel()
  const markerMode = new URLSearchParams(window.location.search).has('marker')
  let wall = null              // marker flow: the exhibit object's wall plane (marker-anchor.js)
  let markerAt = null          // marker flow: where the floor marker is, a THREE.Vector3
  let markerWidth = 0          // marker flow: its width in world units (detail.scale)

  const onObjectSeen = ({detail}) => {
    if (markerMode && detail.name === FLOOR_MARKER) {
      onMarkerSeen({detail})
      return
    }
    debug?.set('seen', `${detail.name} scale=${detail.scale?.toFixed(2)} pos=${detail.position.x.toFixed(2)}, ${detail.position.y.toFixed(2)}, ${detail.position.z.toFixed(2)}`)
    if (state === 'searching') {
      const match = routeFromImageTarget(detail.name)
      if (!match) {
        return
      }
      state = 'found'
      foundName = detail.name
      exhibit = match.exhibit
      hint.setText(markerMode ? TEXT.scanMarker : TEXT.scanFloor)
    }
    if (state === 'found' && detail.name === foundName) {
      objectPosition.copy(detail.position)   // detail.position is a plain {x, y, z}
      // The way to the object is right, how far it is is not: take that from the points on it.
      const {camera} = XR8.Threejs.xrScene()
      const reported = objectPosition.distanceTo(camera.position)
      const distance = wallDistance(worldPoints, camera.position, objectPosition)
      if (distance !== null) {
        objectPosition.sub(camera.position).setLength(distance).add(camera.position)
      }
      if (markerMode) {
        wall = wallPlane(camera.position, objectPosition, detail.rotation)
        debug?.set('wall plane normal', wall.normal)
      }
      debug?.set('wall', `${distance === null ? 'no points there' : `${distance.toFixed(2)} from points`}; image target says ${reported.toFixed(2)}`)
      glow.show(detail)
    }
  }

  /**
   * The floor marker, seen or seen again: where it is, along its own direction at the distance
   * the tracked points give. Before the exhibit is placed that is all; after it, the content eases
   * to the new spot, but only on a distance read from points (the reported one is not trusted).
   */
  const onMarkerSeen = ({detail}) => {
    const {camera} = XR8.Threejs.xrScene()
    const distance = wallDistance(worldPoints, camera.position, detail.position, {
      angle: MARKER_SEARCH_ANGLE, minPoints: MIN_MARKER_POINTS,
    })
    debug?.set('marker', `${distance === null ? 'no points there' : `${distance.toFixed(2)} from points`}; target says ${camera.position.distanceTo(detail.position).toFixed(2)}`)
    if (state === 'placed') {
      if (distance !== null) {
        const position = markerPosition(detail.position, camera.position, distance)
        debug?.set('marker at', position)
        exhibitModule.moveAnchor(position)
      }
      return
    }
    markerAt = markerPosition(detail.position, camera.position, distance)
    markerWidth = detail.scale
    debug?.set('marker width', detail.scale)
    debug?.set('marker at', markerAt)
  }

  /** An invisible plane on the real wall: it writes depth but no colour, so what lies behind it is not drawn. */
  const addWallOccluder = (scene) => {
    const occluder = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({colorWrite: false, side: THREE.DoubleSide})
    )
    occluder.renderOrder = -1
    occluder.position.copy(wall.point)
    occluder.lookAt(wall.point.clone().add(wall.normal))
    scene.add(occluder)
  }

  /** Marker flow: once the wall and the marker are both known and tracking is steady, stand the exhibit on the marker. */
  const placeOnMarker = (camera) => {
    if (!wall || !markerAt) {
      return
    }
    if (tracking && tracking.status !== 'NORMAL') {
      hint.setText(TEXT.scanMove)
      return
    }
    const {scene} = XR8.Threejs.xrScene()
    addWallOccluder(scene)
    const yaw = yawToward(markerAt, camera.position)
    const scale = contentScale(markerWidth, tallestCreature(exhibit), MARKER_SCALE)
    debug?.set('content scale', scale)
    const reach = tallestCreature(exhibit) * scale
    placeExhibit(
      {position: markerAt.clone(), yaw, scale},
      {puzzlesEnabled: false, emergeFrom: emergeStart(markerAt, wall, reach)}
    )
  }

  const onTrackingStatus = ({detail}) => {
    tracking = detail
    debug?.set('tracking', `${detail.status} ${detail.reason}`)
  }

  /**
   * The floor's world height while the camera looks down at it: a median of several readings of
   * the tracked points. 8th Wall puts the floor at y = 0 only by assumption, and where the phone
   * was held at the start decides how far that is from the real one.
   *
   * @param {number} cameraY
   * @param {number} dt - Seconds since the last frame.
   * @returns {number | null} null while still measuring; 0 once it gives up (no clear floor).
   */
  const measureFloor = (cameraY, dt) => {
    lookingDownSeconds += dt
    secondsSinceSample += dt
    if (secondsSinceSample >= FLOOR_SAMPLE_SECONDS) {
      secondsSinceSample = 0
      const height = floorHeight(worldPoints.map((point) => point.position.y), cameraY)
      if (height !== null) {
        floorSamples.push(height)
        floorSamples.splice(0, floorSamples.length - FLOOR_SAMPLES_KEPT)
      }
    }
    debug?.set('floor readings', `${floorSamples.length}/${FLOOR_SAMPLES_NEEDED}, of ${worldPoints.length} points, looking down ${lookingDownSeconds.toFixed(1)}s`)
    if (floorSamples.length >= FLOOR_SAMPLES_NEEDED) {
      debug?.set('floor', `measured y=${median(floorSamples).toFixed(2)}`)
      return median(floorSamples)
    }
    if (lookingDownSeconds >= FLOOR_GIVE_UP_SECONDS) {
      debug?.set('floor', 'assumed y=0 (no clear floor in the points)')
      return 0
    }
    return null
  }

  const placeExhibit = (anchor, options = {}) => {
    state = 'placed'
    debug?.set('state', state)
    debug?.set('anchor', anchor.position)
    debug?.set('anchor scale', anchor.scale)
    glow.hide()
    hint.remove()
    // Setting the scene up renders (the lights' environment map) in the middle of an 8th Wall
    // frame, so three's cached WebGL state is resynced before and after.
    const {renderer} = XR8.Threejs.xrScene()
    renderer.resetState()
    try {
      exhibitModule = initScenePipelineModule(exhibit, {anchor, ...options})
      exhibitModule.onStart({canvas})
    } catch (error) {
      debug?.set('place error', error?.stack || error)
      throw error
    } finally {
      renderer.resetState()
    }
  }

  return {
    name: 'object-scanner',

    onStart: (args) => {
      canvas = args.canvas
      const {scene, camera} = XR8.Threejs.xrScene()
      placeCameraAtStart(camera)
      glow = createObjectGlow(scene)
      hint = createHint(TEXT.scanHint)
      debug?.set('state', state)
    },

    onUpdate: ({processCpuResult}) => {
      const dt = clock.getDelta()
      glow.update(dt)
      worldPoints = processCpuResult?.reality?.worldPoints ?? worldPoints
      if (debug) {
        const {camera} = XR8.Threejs.xrScene()
        debug.set('camera', camera.position)
        debug.set(`looking down (y < ${FLOOR_PITCH})`, camera.getWorldDirection(forward).y)
        debug.set('world points', worldPoints.length)
      }
      if (state === 'placed') {
        exhibitModule.onUpdate()
        return
      }
      if (state === 'found') {
        foundSeconds += dt
        debug?.set('state', `${state} ${foundSeconds.toFixed(1)}s`)
        if (foundSeconds < MIN_GLOW_SECONDS) {
          return
        }
        const {camera} = XR8.Threejs.xrScene()
        if (markerMode) {
          placeOnMarker(camera)
          return
        }
        camera.getWorldDirection(forward)
        if (forward.y >= FLOOR_PITCH) {
          hint.setText(TEXT.scanFloor)
          return
        }
        if (tracking && tracking.status !== 'NORMAL') {
          hint.setText(TEXT.scanMove)
          return
        }
        hint.setText(TEXT.scanFloor)
        const floorY = measureFloor(camera.position.y, dt)
        if (floorY === null) {
          return
        }
        // floorSpot takes the floor as y = 0, so it gets everything measured from the real one.
        const anchor = floorSpot(
          objectPosition.clone().setY(objectPosition.y - floorY),
          camera.position.clone().setY(camera.position.y - floorY),
          forward,
          tallestCreature(exhibit)
        )
        if (anchor) {
          anchor.position.y += floorY
          placeExhibit(anchor)
        }
      }
    },

    onException: (error) => debug?.set('8th Wall exception', error?.stack || error?.message || error),

    // Without A-Frame, 8th Wall delivers reality.* events only to pipeline-module listeners.
    listeners: [
      {event: 'reality.imagefound', process: onObjectSeen},
      {event: 'reality.imageupdated', process: onObjectSeen},
      {event: 'reality.trackingstatus', process: onTrackingStatus},
    ],
  }
}

/** Starts the camera, with world tracking and every configured image target. */
export const startScan = () => {
  startXr(scanPipelineModule(), {imageTargetData: IMAGE_TARGET_DATA})
}

/** True when at least one image target is configured, so scanning can find something. */
export const canScan = IMAGE_TARGET_DATA.length > 0
