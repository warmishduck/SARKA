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
//
// `/?scan&c=<code>` of an exhibit with an `mlTarget` is the ML flow: after the poster, a classifier
// (ml/object-detector.js) looks inside a stencil (stencil.js) the visitor fits the free-standing
// object into; once it sees it there, the object stands where the stencil's bottom edge meets the
// floor, and the creature walks out from behind it and round it (object-path.js). Tapping where the
// object stands is the fallback. Sizes are in metres, turned into scene units by the poster's width.
//
// An exhibit with a `quest` (`/?scan&c=test-quest`) goes through the scanner more than once in the
// same session: its creature is placed like any other and asks for an item; a button sends the
// visitor to the other object (the ML flow, without a poster), where the item appears to be tapped;
// then its own object is looked for again and the same creature stands there anew (quest.js).

import * as THREE from 'three'

import {CREATURES} from './content/creatures.js'
import {IMAGE_TARGET_DATA} from './image-targets'
import {routeFromImageTarget} from './route'
import {TEXT} from './i18n'
import {FLOOR_PITCH, floorHeight, floorSpot, localFloorHeight, median, wallDistance} from './floor-spot'
import {
  MARKER_SEARCH_ANGLE, MIN_MARKER_POINTS, contentScale, emergeStart, markerPosition, wallPlane, yawToward,
} from './marker-anchor'
import {dropToFloor, fitCylinderCentre, sitOnWallBox, walkAroundObject} from './object-path'
import {boxStencilShape, createStencil, footDistanceAt, stencilShape} from './stencil'
import {createDebugPanel} from './debug-panel'
import {createQuest} from './quest'
import {createQuestUi} from './quest-ui'
import {createSock} from './sock'
import {playSound, resumeAudio} from './sound'
import {initScenePipelineModule, placeCameraAtStart} from './threejs-scene-init'
import {createSparkBurst} from './spark'
import {startXr} from './xr-pipeline'
import {loadModel, startDetection} from './ml/object-detector.js'
import {OBJECT_MODEL_URL} from './ml/model-config.js'
import {EXHIBITS} from './content/exhibits.js'

/** The image target (public/image-targets/floor-marker.json) that is laid on the floor. */
const FLOOR_MARKER = 'floor-marker'
const MARKER_SCALE = 0.6       // content scale when the marker reports no width (see contentScale)
const OBJECT_GAP = 0.30        // object mode: how far in front of the object's near face the creature stands
const OBJECT_EMERGE_SIDE = 0.55 // emerge-from-side offset in metres (right of anchor)
// AUKI: a guess. A box on a wall, exhibit.seat 'floor': how far in front of its face the creature lands, in metres.
const WALL_FLOOR_GAP = 0.5
// ML mode: a tap further along the floor than this (scene units) is taken to have missed it.
const OBJECT_MAX_DIST = 4
const OBJECT_SCALE_FALLBACK = 0.5
/** ML mode: an exhibit without its own `objectSize` (content/exhibits.js) is taken to be this big, in metres. */
const DEFAULT_OBJECT_SIZE = {radius: 0.15, height: 0.5}
/**
 * Scene units per metre when the poster gave no size to go by: the camera starts 2 units up
 * (placeCameraAtStart), and a phone is held about 1.3 m up.
 */
const DEFAULT_UNITS_PER_METRE = 2 / 1.3
/** ML mode: units per metre read off the poster stay within this factor of the default. */
const UNITS_PER_METRE_RANGE = 1.5
/** ML mode: a poster reading counts only if it puts the phone this high above the floor (metres). */
const MIN_PHONE_HEIGHT = 1.0   // 0.9 passed on the phone and was 1.5x off
const MAX_PHONE_HEIGHT = 2.2
/** ML mode: a poster reading counts only this close (scene units), and agreeing this well with the points. */
const POSTER_MAX_DIST = 6
const POSTER_DISTANCE_AGREEMENT = 0.3
const POSTER_READINGS_KEPT = 15
/**
 * ML mode: the object counts as in the stencil after this many frames running at this confidence.
 * Two frames at 0.6 fired before the object sat in the outline, and it was placed beside it.
 */
const STENCIL_THRESHOLD = 0.8
const STENCIL_INTERVAL_MS = 500
/**
 * ML mode: the object has to stay recognised in the stencil this long, with the phone held steady,
 * before it counts. On the phone it fired the moment the object came into the outline's square,
 * before it sat in it, so it was placed off. A hand that moves or turns more than this starts the
 * wait again; the scale is the median of the readings taken meanwhile.
 */
const STENCIL_HOLD_MS = 2500
/**
 * ML mode: the classifier's square round a tall, narrow outline is about three times wider than
 * the object, so it also matched with the object well off to one side, and on the phone the
 * occluder then stood a radius or more beside it. A second, narrow square round the outline's
 * middle (this share of its width) has to match too, in turn with the wide one.
 * The threshold is lower: that square sees only part of the object.
 */
const CENTRE_CROP = 1.4
// AUKI: a guess, not measured on the phone yet; check with ?debug (`ml centre`).
const CENTRE_THRESHOLD = 0.6
/**
 * ML mode, a box on a wall: the box's distance is read from the tracked points within this angle
 * (radians, about 6°) of the ray to its middle; a box a step away spans about that much.
 */
const WALL_BOX_SEARCH_ANGLE = 0.1
const WALL_BOX_MIN_POINTS = 4
const STENCIL_STEADY_MOVE = 0.25    // scene units the camera may drift while holding
const STENCIL_STEADY_TURN = 0.15    // radians the camera may turn while holding (about 9 degrees)
/**
 * ML mode, after placing: the object follows its own tracked points (fitCylinderCentre), which
 * are seen from more sides as the visitor walks about, so the depth a single ray guessed is
 * corrected and the world's slow drift is too. Only with enough points, never further than a few
 * radii from where it was placed (further is likely the wall or a neighbour), and eased.
 */
const FOLLOW_SECONDS = 1
const FOLLOW_MIN_POINTS = 15   // points on the circle only, now that wall points are dropped
const FOLLOW_MAX_DRIFT_RADII = 4   // 2 was reached on the phone walking round the purifier
const FOLLOW_MAX_STEP_RADII = 0.5
const FOLLOW_RATE = 2              // 1/s
/** ML mode: room between the object's surface and the creature's centre, in creature heights. */
const OBJECT_CLEARANCE_SHARE = 0.5

const GLOW_COLOR = 0xffd98a
const GLOW_SIZE = 1.8          // the halo's diameter, in multiples of the object's size
const GLOW_PULSE_SPEED = 4     // radians per second
const GLOW_FADE_SPEED = 2      // opacity per second when it goes away
const MIN_GLOW_SECONDS = 1.2   // the glow shows at least this long, even if already looking down

// AUKI: guesses for the home test, not tried on the phone: the quest's item, in metres.
const ITEM_HEIGHT = 0.3          // how tall the sock is drawn (bigger than a real one, to be seen and tapped)
const ITEM_HOVER = 0.08          // how high it floats above the floor
const ITEM_TOWARD_VIEWER = 0.25  // how far in front of the object's near face it appears
const ITEM_SPIN = 1.2            // radians per second, so it catches the eye
const GIVEN_ITEM_SIDE = 0.4      // where the given sock stands beside the creature, in creature heights

const FLOOR_SAMPLE_SECONDS = 0.1   // between two readings of the floor's height
const FLOOR_SAMPLES_NEEDED = 5     // readings before the floor counts as measured
const FLOOR_SAMPLES_KEPT = 9       // the median is taken over the latest of them
const FLOOR_GIVE_UP_SECONDS = 2    // looking down this long without a measurement: assume y = 0
/** ?debug: the camera moving further than this in one frame (scene units) is the engine's world jumping, not a hand. */
const WORLD_JUMP = 0.25

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
  const urlParams = new URLSearchParams(window.location.search)
  const markerMode = urlParams.has('marker')
  const objectMode = urlParams.has('object')
  const absoluteScale = urlParams.has('absolute')   // the engine works in metres (see startScan)
  // /?scan&c=<code> pre-selects an exhibit so the scanner uses its imageTarget as the poster trigger.
  const preloadedCode = urlParams.get('c')?.trim().toLowerCase() ?? null
  if (preloadedCode && Object.hasOwn(EXHIBITS, preloadedCode)) {
    exhibit = EXHIBITS[preloadedCode]
  }
  const questExhibit = exhibit?.quest ? exhibit : null
  const quest = questExhibit ? createQuest() : null
  let questUi = null
  let questCreature = null      // the quest creature's scene module, kept while it is hidden
  let questAnchor = null        // where it stands now
  let item = null               // the sock: {root, hitTarget, baseY}
  let thanks = null             // the sparks when the creature gets it
  let wall = null              // marker flow: the exhibit object's wall plane (marker-anchor.js)
  let markerAt = null          // marker flow: where the floor marker is, a THREE.Vector3
  let markerWidth = 0          // marker flow: its width in world units (detail.scale)
  let latestObjectDetail = null  // object/two-target mode: last seen detail for the exhibit object
  let objectFoundSeconds = 0   // two-target mode: seconds since the exhibit object was first seen
  let mlDetectorStop = null    // ML detection: cancel function returned by startDetection, or null
  let fpsFrames = 0            // ?debug: frames and seconds counted towards the next fps reading
  let fpsSeconds = 0
  let posterScale = 0          // ML mode: the poster's width (median of sound detail.scale readings), scene units
  const posterScales = []      // ML mode: the latest sound readings of it
  let pendingTap = null        // ML mode: where the visitor tapped before the object was recognised
  let objectFit = null         // ML mode, once placed: where the object stands, following its points (followObject)
  let stencil = null           // ML mode: the outline the visitor fits the object into (stencil.js)
  let wallSeat = null           // ML mode, a box on a wall: where the creature will sit (onWallBoxRecognised)
  let stencilUnitsPerMetre = 0 // ML mode: the scale the stencil gave (onRecognised), 0 until then
  let lastCameraPosition = null  // ?debug: the camera one frame ago, to spot the world jumping
  let worldJumps = 0
  const trackingLog = []       // ?debug: the latest changes of tracking status
  const tapRaycaster = new THREE.Raycaster()

  // Loads the ML model in its worker (seconds on a phone, but off the main thread), as early as the
  // exhibit is known, so it is ready by the time the visitor gets to the object.
  const loadMlModel = () => {
    debug?.set('ml', 'loading model…')
    return loadModel((questExhibit?.quest.find ?? exhibit)?.modelUrl ?? OBJECT_MODEL_URL).then(({backend, ms}) => {
      debug?.set('ml', `model ready: ${backend}, ${(ms / 1000).toFixed(1)} s`)
    })
  }

  // Starts the ML detection loop after the poster is recognised and exhibit.mlTarget is set.
  // Re-guards if the state changed while the model was loading.
  const startMlDetection = async () => {
    if (mlDetectorStop || !exhibit?.mlTarget) return
    try {
      await loadMlModel()
    } catch (e) {
      debug?.set('ml', `model load failed: ${e.message}`)
      return
    }
    if (state !== 'found' || !exhibit?.mlTarget) return
    const {renderer, camera} = XR8.Threejs.xrScene()
    // The stencil: the visitor fits the object into it, and the classifier looks only inside it,
    // so a similar object beside it does not count (stencil.js).
    const view = canvas.getBoundingClientRect()
    const onWall = exhibit.mount === 'wall'
    const shape = onWall
      ? boxStencilShape(exhibit.objectSize, camera.projectionMatrix.elements, view)
      : stencilShape({...DEFAULT_OBJECT_SIZE, ...exhibit.objectSize}, camera.projectionMatrix.elements, view)
    stencil = createStencil(shape, view)
    // Without a poster first there is nothing to have "found" yet.
    const fitHint = exhibit.fitHint ? TEXT[exhibit.fitHint] : exhibit.imageTarget ? TEXT.scanFitObject : TEXT.scanFitObjectStart
    hint.setText(fitHint)
    debug?.set('stencil', `drawn for ${shape.distance.toFixed(1)} m, foot at y=${shape.footY.toFixed(0)} px`)
    const centre = onWall ? null : centreSquare(shape)
    const regionHits = centre ? [false, false] : [false]   // the latest answer for each square
    let holdSince = null          // when the object has been in the outline since, steadily
    let holdPosition = null
    let holdDirection = null
    let scaleReadings = []
    const onFrame = (best, ms) => {
      debug?.set('ml frame', `${best.className} ${(best.probability * 100).toFixed(0)}% (${best.crop}), ${ms.toFixed(0)} ms`)
      if (state !== 'found') return
      const region = best.crop === 'region 1' ? 1 : 0
      regionHits[region] = best.className === exhibit.mlTarget &&
        best.probability >= (region === 1 ? CENTRE_THRESHOLD : STENCIL_THRESHOLD)
      if (region === 1) {
        debug?.set('ml centre', `${best.className} ${(best.probability * 100).toFixed(0)}%`)
      }
      const hit = regionHits.every(Boolean)
      const direction = camera.getWorldDirection(new THREE.Vector3())
      const steady = holdSince !== null &&
        camera.position.distanceTo(holdPosition) <= STENCIL_STEADY_MOVE &&
        direction.angleTo(holdDirection) <= STENCIL_STEADY_TURN
      if (!hit || !steady) {
        holdSince = hit ? performance.now() : null
        holdPosition = camera.position.clone()
        holdDirection = direction
        scaleReadings = []
      }
      stencil?.setMatched(hit && holdSince !== null)
      if (!hit) {
        const offCentre = centre && regionHits[0] && !regionHits[1]
        hint.setText(offCentre ? TEXT.scanCentreObject : fitHint)
        debug?.set('hold', offCentre ? 'object in the outline, but not in its middle' : 'object not in the outline')
        return
      }
      const held = performance.now() - holdSince
      hint.setText(TEXT.scanHoldSteady)
      debug?.set('hold', `${(held / 1000).toFixed(1)} s of ${STENCIL_HOLD_MS / 1000}`)
      const reading = onWall ? wallBoxDistanceReading(shape, view) : stencilScaleReading(shape, view)
      reading && scaleReadings.push(reading)
      if (held >= STENCIL_HOLD_MS) {
        onRecognised(best, shape, view, scaleReadings.length > 0 ? median(scaleReadings) : 0)
      }
    }
    mlDetectorStop = startDetection(renderer.domElement, () => {}, {
      onFrame, threshold: STENCIL_THRESHOLD, intervalMs: STENCIL_INTERVAL_MS,
      screenRegion: centre ? [shape.crop, centre] : shape.crop, showInput: !!debug,
    })
  }

  /**
   * ML mode: the narrow square round the outline's middle (see CENTRE_CROP).
   *
   * @param {import('./stencil.js').StencilShape} shape
   * @returns {{x: number, y: number, size: number} | null} CSS px relative to the canvas; null when
   *   the object already fills most of the wide square, so off to one side it would not match.
   */
  const centreSquare = (shape) => {
    const size = shape.width * CENTRE_CROP
    if (size >= shape.crop.size * 0.8) {
      return null
    }
    const middle = (shape.topY + shape.bottomY) / 2
    return {x: shape.centreX - size / 2, y: middle - size / 2, size}
  }

  const removeStencil = () => {
    stencil?.remove()
    stencil = null
  }

  /**
   * ML mode: units per metre from the stencil, right now: the object fills the outline, so the
   * camera is about shape.distance metres from its middle and a known distance from its foot, and
   * the ray to the outline's foot gives that distance in scene units.
   *
   * @returns {number | null} null when the outline's foot does not meet the floor.
   */
  const stencilScaleReading = (shape, view) => {
    const point = floorPointAt(view.left + shape.centreX, view.top + shape.footY)
    if (!point) {
      return null
    }
    const {camera} = XR8.Threejs.xrScene()
    const tilt = Math.asin(THREE.MathUtils.clamp(-camera.getWorldDirection(forward).y, 0, 1))
    const metres = footDistanceAt({...DEFAULT_OBJECT_SIZE, ...exhibit.objectSize}, shape.distance, tilt)
    return camera.position.distanceTo(point) / metres
  }

  /**
   * The ray from the camera through a point of the screen.
   *
   * @returns {THREE.Ray} World space; the direction is a unit vector.
   */
  const screenRay = (clientX, clientY) => {
    const {camera} = XR8.Threejs.xrScene()
    const rect = canvas.getBoundingClientRect()
    tapRaycaster.setFromCamera(new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    ), camera)
    return tapRaycaster.ray.clone()
  }

  /**
   * ML mode, a box on a wall: how far its face is, right now, from the tracked points round the ray
   * to the outline's middle.
   *
   * @returns {number | null} Scene units; null with too few points there.
   */
  const wallBoxDistanceReading = (shape, view) => {
    const ray = screenRay(view.left + shape.centreX, view.top + (shape.topY + shape.bottomY) / 2)
    return wallDistance(worldPoints, ray.origin, ray.origin.clone().add(ray.direction), {
      angle: WALL_BOX_SEARCH_ANGLE, minPoints: WALL_BOX_MIN_POINTS,
    })
  }

  /**
   * ML mode, a box on a wall: the box sat in the outline, so it is about shape.distance metres away,
   * and the points say how far that is in scene units: that is the scale. The creature will sit on
   * the box's top, coming up from behind its top edge (object-path.js sitOnWallBox).
   *
   * @param {number} distance - Scene units to the box's face (median while holding); 0 for none.
   */
  const onWallBoxRecognised = (shape, view, distance) => {
    const metres = exhibit.objectSize
    if (distance > 0) {
      stencilUnitsPerMetre = distance / shape.distance
    }
    const upm = unitsPerMetre()
    const faceDistance = distance > 0 ? distance : shape.distance * upm
    const middle = screenRay(view.left + shape.centreX, view.top + (shape.topY + shape.bottomY) / 2)
    const top = screenRay(view.left + shape.centreX, view.top + shape.topY)
    const scale = OBJECT_SCALE_FALLBACK * upm / DEFAULT_UNITS_PER_METRE
    const size = {width: metres.width * upm, height: metres.height * upm, depth: metres.depth * upm}
    let sit = sitOnWallBox(middle.origin, middle.direction, top.direction, faceDistance, size, tallestCreature(exhibit) * scale)
    if (sit && exhibit.seat === 'floor') {
      sit = dropToFloor(sit, size.height, size.depth, currentFloorY(), WALL_FLOOR_GAP * upm, tallestCreature(exhibit) * scale)
    }
    debug?.set('units per metre', `${upm.toFixed(2)} (${distance > 0 ? `wall box, ${faceDistance.toFixed(2)} away` : 'no points on the box: guessed'})`)
    if (!sit) {
      debug?.set('wall box', 'the top ray missed the face: try again')
      startMlDetection()
      return
    }
    wallSeat = {...sit, size, scale}
    debug?.set('wall box', `seat ${sit.seat.x.toFixed(2)}, ${sit.seat.y.toFixed(2)}, ${sit.seat.z.toFixed(2)}; ${size.width.toFixed(2)} x ${size.height.toFixed(2)} x ${size.depth.toFixed(2)}`)
    glow.show({position: sit.boxCentre, scale: size.height})
    state = 'found_object'
    objectFoundSeconds = 0
  }

  /** ML mode, a box on a wall: the box as an occluder, and the creature coming up onto its top. */
  const placeOnWallBox = () => {
    const {scene} = XR8.Threejs.xrScene()
    const {boxCentre, seat, emergeFrom, yaw, size, scale} = wallSeat
    const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth)
    const occluder = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({colorWrite: false}))
    occluder.renderOrder = -1
    occluder.position.copy(boxCentre)
    occluder.rotation.y = yaw
    if (debug) {
      occluder.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color: 0x00ffff, wireframe: true})))
    }
    scene.add(occluder)
    placeExhibit({position: seat, yaw, scale}, {puzzlesEnabled: false, emergeFrom: [emergeFrom]})
  }

  /**
   * ML mode: the object sat in the stencil, steadily, for STENCIL_HOLD_MS. It stands where the
   * stencil's bottom edge meets the floor (or where the visitor tapped, if they did); if that misses
   * the floor, the visitor is asked to tap instead.
   *
   * @param {number} scale - Units per metre, the median of the readings while holding; 0 for none.
   *   For a box on a wall: the median distance to its face instead (see onWallBoxRecognised).
   */
  const onRecognised = (best, shape, view, scale) => {
    mlDetectorStop()
    mlDetectorStop = null
    debug?.set('ml', `${best.className} ${(best.probability * 100).toFixed(0)}%`)
    if (exhibit.mount === 'wall') {
      removeStencil()
      onWallBoxRecognised(shape, view, scale)
      return
    }
    const point = pendingTap ?? floorPointAt(view.left + shape.centreX, view.top + shape.footY)
    removeStencil()
    if (point && !pendingTap && scale > 0) {
      // A scale that does not depend on the poster (which on the phone was sometimes far off).
      stencilUnitsPerMetre = scale
      debug?.set('units per metre', `${unitsPerMetre().toFixed(2)} (stencil; poster said ${posterScale > 0 ? (posterScale / exhibit.posterWidth).toFixed(2) : '-'})`)
    }
    if (point) {
      standObjectAt(point)
      return
    }
    state = 'tap_object'
    debug?.set('state', state)
    hint.setText(TEXT.scanTapObject)
  }

  /**
   * How many scene units a metre is in this session: 1 at the metre scale; else from the stencil the
   * object was fitted into, else from the poster's reported width when a reading of it was sound,
   * else a guess from the start height.
   */
  const unitsPerMetre = () => {
    if (absoluteScale) {
      return 1
    }
    // The stencil is measured right at the object; a poster reading that passed its checks still
    // came out 1.5x off on the phone, so it is only the fallback (the tap flow has no stencil).
    const measured = stencilUnitsPerMetre > 0
      ? stencilUnitsPerMetre
      : posterScale > 0 && exhibit?.posterWidth > 0 ? posterScale / exhibit.posterWidth : 0
    return measured > 0
      ? THREE.MathUtils.clamp(measured, DEFAULT_UNITS_PER_METRE / UNITS_PER_METRE_RANGE, DEFAULT_UNITS_PER_METRE * UNITS_PER_METRE_RANGE)
      : DEFAULT_UNITS_PER_METRE
  }

  /**
   * ML mode: the object stands at this floor point (its near edge; `y` is the floor there); glow
   * there, then place.
   */
  const standObjectAt = (point) => {
    objectPosition.copy(point)
    const height = {...DEFAULT_OBJECT_SIZE, ...exhibit.objectSize}.height * unitsPerMetre()
    glow.show({position: point.clone().setY(point.y + height / 2), scale: height})
    state = 'found_object'
    objectFoundSeconds = 0
  }

  /**
   * ML mode: where the floor is under a point of the screen at which the object's near edge meets
   * the floor (the stencil's bottom edge, or a tap there). That ray meets the floor at the object's
   * near edge, exactly enough for any height of object, unlike the ray to some point up its side.
   *
   * @param {number} clientX
   * @param {number} clientY
   * @returns {THREE.Vector3 | null} null above the horizon or too far away; `y` is the floor there.
   */
  const floorPointAt = (clientX, clientY) => {
    const {camera} = XR8.Threejs.xrScene()
    const rect = canvas.getBoundingClientRect()
    tapRaycaster.setFromCamera(new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    ), camera)
    const {origin, direction} = tapRaycaster.ray
    const rayToFloor = (floorY) => {
      const along = direction.y < -1e-3 ? (floorY - origin.y) / direction.y : -1
      return along > 0 ? origin.clone().addScaledVector(direction, along) : null
    }
    // The floor measured at the start can be off by now (on the phone the pinecone then stood in
    // the air): the points round the tapped spot say how high the floor is there.
    const startFloor = currentFloorY()
    const first = rayToFloor(startFloor)
    const localFloor = first ? localFloorHeight(worldPoints, first, origin.y) : null
    const onFloor = localFloor === null ? first : rayToFloor(localFloor)
    const reach = onFloor ? Math.hypot(onFloor.x - origin.x, onFloor.z - origin.z) : Infinity
    debug?.set('foot', onFloor
      ? `floor at ${reach.toFixed(2)} away; floor there ${localFloor === null ? 'not seen' : `y=${localFloor.toFixed(2)}`} (start ${startFloor.toFixed(2)})`
      : 'above the horizon')
    return onFloor && reach <= OBJECT_MAX_DIST ? onFloor : null
  }

  /**
   * ML mode, the fallback to the stencil: the visitor taps where the object stands on the floor.
   * A tap before the object is recognised is kept for when it is, so it is not lost.
   */
  const onObjectTap = (event) => {
    if (quest?.step === 'itemThere') {
      resumeAudio()
      tapRaycaster.ray.copy(screenRay(event.clientX, event.clientY))
      if (tapRaycaster.intersectObject(item.hitTarget).length > 0) {
        takeItem()
      }
      return
    }
    if (exhibit?.mount === 'wall') {
      return
    }
    const early = state === 'found' && exhibit?.mlTarget
    if (state !== 'tap_object' && !early) {
      return
    }
    const onFloor = floorPointAt(event.clientX, event.clientY)
    if (!onFloor) {
      return
    }
    if (early) {
      pendingTap = onFloor
      hint.setText(TEXT.scanHoldObject)
      return
    }
    standObjectAt(onFloor)
  }

  const onObjectSeen = ({detail}) => {
    if (markerMode && detail.name === FLOOR_MARKER) {
      onMarkerSeen({detail})
      return
    }
    debug?.set('seen', `${detail.name} scale=${detail.scale?.toFixed(2)} pos=${detail.position.x.toFixed(2)}, ${detail.position.y.toFixed(2)}, ${detail.position.z.toFixed(2)}`)
    // After placement: re-anchor if the tracked target moves.
    // objectMode (single-target URL param) re-anchors on the poster/object target;
    // two-target flow re-anchors on the exhibit object specifically.
    if (state === 'placed') {
      const isAnchorTarget = objectMode
        ? detail.name === foundName
        : exhibit?.objectTarget && detail.name === exhibit.objectTarget
      if (isAnchorTarget) {
        const {camera} = XR8.Threejs.xrScene()
        const pos = new THREE.Vector3(detail.position.x, detail.position.y, detail.position.z)
        const distance = wallDistance(worldPoints, camera.position, detail.position)
        if (distance !== null) {
          pos.sub(camera.position).setLength(distance).add(camera.position)
        }
        const toCamera = new THREE.Vector3(camera.position.x - pos.x, 0, camera.position.z - pos.z)
        if (toCamera.lengthSq() > 1e-8) {
          toCamera.normalize()
        }
        exhibitModule.moveAnchor(pos.addScaledVector(toCamera, OBJECT_GAP))
      }
      return
    }

    // Two-target flow: the exhibit object itself (second target — mortar, clock, etc.) found.
    // Fires when the poster was already scanned and the exhibit declares an objectTarget.
    if ((state === 'found' || state === 'found_object') && exhibit?.objectTarget && detail.name === exhibit.objectTarget) {
      if (state !== 'found_object') {
        state = 'found_object'
        objectFoundSeconds = 0
      }
      const {camera} = XR8.Threejs.xrScene()
      objectPosition.copy(detail.position)
      const distance = wallDistance(worldPoints, camera.position, detail.position)
      if (distance !== null) {
        objectPosition.sub(camera.position).setLength(distance).add(camera.position)
      }
      latestObjectDetail = detail
      debug?.set('object', `scale=${detail.scale?.toFixed(2)} pos=${objectPosition.x.toFixed(2)},${objectPosition.y.toFixed(2)},${objectPosition.z.toFixed(2)}`)
      glow.show(detail)
      return
    }

    // Poster (first target) found: identify the exhibit and set the next instruction.
    if (state === 'searching' && !(quest && detail.name !== exhibit.imageTarget)) {
      // If an exhibit was pre-loaded via ?scan&c=<code>, use it when its imageTarget matches;
      // otherwise fall back to the first exhibit whose imageTarget matches the detected target.
      const preloaded = exhibit && exhibit.imageTarget === detail.name
      const match = preloaded ? {code: preloadedCode, exhibit} : routeFromImageTarget(detail.name)
      if (!match) {
        return
      }
      state = 'found'
      foundName = detail.name
      exhibit = match.exhibit
      foundSeconds = 0
      if (exhibit.objectTarget || exhibit.mlTarget) {
        hint.setText(TEXT.scanFindObject)
        if (exhibit.mlTarget) startMlDetection()
      } else if (!objectMode) {
        hint.setText(markerMode ? TEXT.scanMarker : TEXT.scanFloor)
      }
    }

    // Single-target flows (no objectTarget): track the poster position for floor-spot / marker / objectMode.
    if (state === 'found' && detail.name === foundName && !exhibit?.objectTarget) {
      objectPosition.copy(detail.position)
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
      if (objectMode) {
        latestObjectDetail = detail
      }
      // Only sound readings count: while tracking was lost the phone reported the poster 19 units
      // away at several times its size, and that one reading made the object three times too big.
      // The engine's own distance is often wrong, and its size is wrong with it, so a reading needs
      // the tracked points to agree, and the phone height it implies has to be one a hand holds.
      const phoneHeight = detail.scale > 0 && exhibit.posterWidth > 0
        ? (camera.position.y - currentFloorY()) / (detail.scale / exhibit.posterWidth)
        : NaN
      const sound = tracking?.status === 'NORMAL' && reported <= POSTER_MAX_DIST &&
        distance !== null && Math.abs(reported - distance) <= distance * POSTER_DISTANCE_AGREEMENT &&
        phoneHeight >= MIN_PHONE_HEIGHT && phoneHeight <= MAX_PHONE_HEIGHT
      if (exhibit.mlTarget && detail.scale > 0 && sound) {
        posterScales.push(detail.scale)
        posterScales.splice(0, posterScales.length - POSTER_READINGS_KEPT)
        posterScale = median(posterScales)
        debug?.set('units per metre', `${unitsPerMetre().toFixed(2)} (${posterScales.length} readings)`)
      }
      debug?.set('wall', `${distance === null ? 'no points there' : `${distance.toFixed(2)} from points`}; image target says ${reported.toFixed(2)}; phone ${phoneHeight.toFixed(2)} m up; ${sound ? 'used' : 'not used'}`)
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

  /**
   * Measured floor if the visitor looked down; otherwise the engine's own ground plane, y = 0
   * (placeCameraAtStart). Points read while looking elsewhere pick up tabletops and the object itself.
   */
  const currentFloorY = () => floorSamples.length >= FLOOR_SAMPLES_NEEDED ? median(floorSamples) : 0

  /**
   * An invisible upright cylinder where the real object stands: it writes depth but no colour, so
   * the creature is hidden while it is behind the object. With ?debug it shows as a wireframe.
   */
  const addObjectOccluder = (scene, centre, {radius, height}) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 32)
    const occluder = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({colorWrite: false}))
    occluder.renderOrder = -1
    occluder.position.set(centre.x, centre.y + height / 2, centre.z)
    if (debug) {
      occluder.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color: 0x00ffff, wireframe: true})))
    }
    scene.add(occluder)
    return occluder
  }

  /**
   * ML mode: the creature starts hidden behind the free-standing object and walks round it to
   * stand on the floor in front of it, facing the visitor (object-path.js).
   */
  const placeAroundObject = (camera) => {
    const floorY = objectPosition.y   // the floor where the visitor tapped (onObjectTap)
    const metres = {...DEFAULT_OBJECT_SIZE, ...exhibit.objectSize}
    const size = {radius: metres.radius * unitsPerMetre(), height: metres.height * unitsPerMetre()}
    // Sized in the same units as the object, so the two keep their real proportion.
    const scale = OBJECT_SCALE_FALLBACK * unitsPerMetre() / DEFAULT_UNITS_PER_METRE
    const clearance = tallestCreature(exhibit) * scale * OBJECT_CLEARANCE_SHARE
    const {centre, waypoints, anchor} = walkAroundObject(objectPosition, camera.position, {
      floorY, radius: size.radius, clearance,
    })
    const {scene} = XR8.Threejs.xrScene()
    objectFit = {
      placedAt: centre.clone(), centre: centre.clone(), target: centre.clone(),
      fromCentreToAnchor: anchor.clone().sub(centre), floorY, size, secondsSince: FOLLOW_SECONDS,
      occluder: addObjectOccluder(scene, centre, size), mesh: null,
    }
    if (debug) {
      // The raw fit, before easing and limits: magenta beside the cyan occluder.
      objectFit.mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(size.radius, size.radius, size.height, 32),
        new THREE.MeshBasicMaterial({color: 0xff44cc, wireframe: true})
      )
      objectFit.mesh.visible = false
      scene.add(objectFit.mesh)
    }
    const yaw = yawToward(anchor, camera.position)
    debug?.set('object anchor', `centre=${centre.x.toFixed(2)},${floorY.toFixed(2)},${centre.z.toFixed(2)} r=${size.radius.toFixed(2)} h=${size.height.toFixed(2)} anchor=${anchor.x.toFixed(2)},${anchor.z.toFixed(2)} camY=${camera.position.y.toFixed(2)}`)
    placeExhibit({position: anchor, yaw, scale}, {puzzlesEnabled: false, emergeFrom: waypoints})
  }

  /**
   * ML mode, after placing: the object (its occluder, and the creature's spot beside it) follows
   * where its own tracked points say it stands (see FOLLOW_SECONDS for why and within what limits).
   *
   * @param {number} dt - Seconds since the last frame.
   */
  const followObject = (dt) => {
    const fit = objectFit
    fit.centre.lerp(fit.target, 1 - Math.exp(-dt * FOLLOW_RATE))
    fit.occluder.position.x = fit.centre.x
    fit.occluder.position.z = fit.centre.z
    exhibitModule.moveAnchor(fit.centre.clone().add(fit.fromCentreToAnchor).setY(fit.floorY))

    fit.secondsSince += dt
    if (fit.secondsSince < FOLLOW_SECONDS) {
      return
    }
    fit.secondsSince = 0
    const {camera} = XR8.Threejs.xrScene()
    const {radius, height} = fit.size
    const found = fitCylinderCentre(worldPoints, fit.target, {floorY: fit.floorY, radius, height, viewer: camera.position})
    if (fit.mesh) {
      fit.mesh.visible = !!found
      found && fit.mesh.position.set(found.centre.x, fit.floorY + height / 2, found.centre.z)
    }
    const cm = (a, b) => ((Math.hypot(a.x - b.x, a.z - b.z) / unitsPerMetre()) * 100).toFixed(0)
    if (!found || found.count < FOLLOW_MIN_POINTS) {
      debug?.set('follow', `${found ? found.count : 'too few'} points on the object: not followed`)
      return
    }
    if (Math.hypot(found.centre.x - fit.placedAt.x, found.centre.z - fit.placedAt.z) > radius * FOLLOW_MAX_DRIFT_RADII) {
      debug?.set('follow', `${found.count} points, but ${cm(found.centre, fit.placedAt)} cm from where it was placed: not followed`)
      return
    }
    const step = found.centre.clone().sub(fit.target).setY(0)
    if (step.length() > radius * FOLLOW_MAX_STEP_RADII) {
      step.setLength(radius * FOLLOW_MAX_STEP_RADII)
    }
    fit.target.add(step)
    debug?.set('follow', `${found.count} points; moved ${cm(fit.target, fit.placedAt)} cm from where it was placed`)
  }

  /** Object mode: once the exhibit is recognised, anchor the creature right in front of it. */
  const placeOnObject = (camera) => {
    if (tracking && tracking.status !== 'NORMAL') {
      hint.setText(TEXT.scanMove)
      return
    }
    if (wallSeat) {
      placeOnWallBox()
      return
    }
    if (quest?.step === 'looking') {
      placeItem(camera)
      return
    }
    if (exhibit.mlTarget) {
      placeAroundObject(camera)
      return
    }
    const toCamera = new THREE.Vector3(camera.position.x - objectPosition.x, 0, camera.position.z - objectPosition.z)
    if (toCamera.lengthSq() > 1e-8) {
      toCamera.normalize()
    } else {
      toCamera.set(0, 0, 1)
    }
    const floorY = currentFloorY()
    // Anchor at floor level, a step in front of the object toward the viewer.
    const position = objectPosition.clone()
    position.y = floorY
    position.addScaledVector(toCamera, OBJECT_GAP)
    const yaw = yawToward(position, camera.position)
    const scale = contentScale(latestObjectDetail?.scale, tallestCreature(exhibit), OBJECT_SCALE_FALLBACK)
    debug?.set('object anchor', `pos=${position.x.toFixed(2)},${floorY.toFixed(2)},${position.z.toFixed(2)} scale=${scale.toFixed(3)} camY=${camera.position.y.toFixed(2)}`)
    // Walk in from the side, along the floor in front of the object, so the path never crosses it.
    const right = new THREE.Vector3(-toCamera.z, 0, toCamera.x)
    const emergeFrom = position.clone().addScaledVector(right, OBJECT_EMERGE_SIDE)
    placeExhibit({position, yaw, scale}, {puzzlesEnabled: false, emergeFrom})
  }

  const onTrackingStatus = ({detail}) => {
    const changed = !tracking || tracking.status !== detail.status || tracking.reason !== detail.reason
    tracking = detail
    debug?.set('tracking', `${detail.status} ${detail.reason}`)
    if (debug && changed) {
      trackingLog.push(`${clock.elapsedTime.toFixed(0)}s ${detail.status} ${detail.reason}`)
      trackingLog.splice(0, trackingLog.length - 4)
      debug.set('tracking log', trackingLog.join(' | '))
    }
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
    if (mlDetectorStop) { mlDetectorStop(); mlDetectorStop = null }
    removeStencil()
    state = 'placed'
    debug?.set('state', state)
    debug?.set('anchor', anchor.position)
    debug?.set('anchor scale', anchor.scale)
    glow.hide()
    hint.remove()
    if (quest) {
      questAnchor = {position: anchor.position.clone(), yaw: anchor.yaw, scale: anchor.scale}
    }
    if (questCreature) {
      // Back at the quest creature: the same one, standing where its object is seen now.
      questCreature.jumpTo({...questAnchor, position: anchor.position.clone()})
      questCreature.setShown(true)
      exhibitModule = questCreature
      onQuestCreatureShown()
      return
    }
    // Setting the scene up renders (the lights' environment map) in the middle of an 8th Wall
    // frame, so three's cached WebGL state is resynced before and after.
    const {renderer} = XR8.Threejs.xrScene()
    renderer.resetState()
    try {
      exhibitModule = initScenePipelineModule(exhibit, {anchor: {...anchor}, creatureHint: !quest, ...options})
      exhibitModule.onStart({canvas})
      if (quest) {
        questCreature = exhibitModule
        onQuestCreatureShown()
      }
    } catch (error) {
      debug?.set('place error', error?.stack || error)
      throw error
    } finally {
      renderer.resetState()
    }
  }

  /** The quest creature has just been placed: it asks for the item, or waits to be given it. */
  const onQuestCreatureShown = () => {
    if (!quest.send('creatureShown')) {
      return
    }
    debug?.set('quest', quest.step)
    if (quest.step === 'asked') {
      questUi.showHint('questAsk')
      questUi.showButton('questSearch', startItemSearch)
    } else {
      questUi.showHint(null)
      questUi.showButton('questGive', giveItem)
    }
  }

  /** A new glow and hint, and everything read off the last object forgotten, for the next one. */
  const lookAfresh = (nextExhibit) => {
    exhibit = nextExhibit
    foundName = null
    foundSeconds = 0
    objectFoundSeconds = 0
    pendingTap = null
    stencilUnitsPerMetre = 0
    glow = createObjectGlow(XR8.Threejs.xrScene().scene)
    hint = createHint('')
  }

  /** The button under the creature: leave it, and find the object the item is at. */
  const startItemSearch = () => {
    if (!quest.send('search')) {
      return
    }
    resumeAudio()
    debug?.set('quest', quest.step)
    questUi.showHint(null)
    questUi.showButton(null)
    questCreature.setShown(false)
    lookAfresh({creatures: [], fitHint: 'questFitFind', ...questExhibit.quest.find})
    state = 'found'
    hint.setText(TEXT.questFitFind)
    startMlDetection()
  }

  /** The other object has been recognised: the sock floats just in front of it. */
  const placeItem = (camera) => {
    if (!quest.send('itemShown')) {
      return
    }
    debug?.set('quest', quest.step)
    const upm = unitsPerMetre()
    const toCamera = new THREE.Vector3(camera.position.x - objectPosition.x, 0, camera.position.z - objectPosition.z)
    if (toCamera.lengthSq() > 1e-8) {
      toCamera.normalize()
    } else {
      toCamera.set(0, 0, 1)
    }
    item = createSock()
    item.root.scale.setScalar(ITEM_HEIGHT * upm)
    item.root.position.copy(objectPosition).addScaledVector(toCamera, ITEM_TOWARD_VIEWER * upm)
    item.baseY = objectPosition.y + ITEM_HOVER * upm
    item.root.position.y = item.baseY
    XR8.Threejs.xrScene().scene.add(item.root)
    debug?.set('item', item.root.position)
    state = 'item'
    debug?.set('state', state)
    glow.hide()
    hint.remove()
    playSound('plink')
    questUi.showHint('questTapItem')
  }

  /** The sock was tapped: it goes with the visitor, who now looks for the creature again. */
  const takeItem = () => {
    if (!quest.send('itemTaken')) {
      return
    }
    debug?.set('quest', quest.step)
    XR8.Threejs.xrScene().scene.remove(item.root)
    playSound('pop')
    questUi.showBadge('questCarrying')
    questUi.showHint(null)
    lookAfresh(questExhibit)
    hint.setText(TEXT.questReturn)
    state = 'searching'
    debug?.set('state', state)
  }

  /** The button under the returned creature: the sock goes to it, and it is glad. */
  const giveItem = () => {
    if (!quest.send('give')) {
      return
    }
    resumeAudio()
    debug?.set('quest', quest.step)
    questUi.showButton(null)
    questUi.showBadge(null)
    questUi.showHint('questThanks')
    const {scene} = XR8.Threejs.xrScene()
    const {position, yaw, scale} = questAnchor
    const height = tallestCreature(questExhibit) * scale
    // Beside the creature, to the visitor's right when it faces them.
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    item.root.scale.setScalar(height * 0.35)
    item.root.position.copy(position).addScaledVector(side, height * GIVEN_ITEM_SIDE)
    item.baseY = position.y + height * 0.05
    item.root.position.y = item.baseY
    scene.add(item.root)
    const burstAt = new THREE.Group()
    burstAt.position.copy(position)
    scene.add(burstAt)
    thanks = createSparkBurst(burstAt, {radius: height * 0.6})
    questCreature.react()
    playSound('wake')
  }

  return {
    name: 'object-scanner',

    onStart: (args) => {
      canvas = args.canvas
      const {scene, camera} = XR8.Threejs.xrScene()
      placeCameraAtStart(camera)
      glow = createObjectGlow(scene)
      hint = createHint(TEXT.scanFloorFirst)
      if (quest) {
        questUi = createQuestUi()
        debug?.set('quest', quest.step)
        loadMlModel().catch((e) => debug?.set('ml', `model load failed: ${e.message}`))
      }
      debug?.set('state', state)
      if (exhibit?.mlTarget) {
        loadMlModel().catch((e) => debug?.set('ml', `model load failed: ${e.message}`))
      }
      // An ML exhibit without a poster: straight to its stencil.
      if (exhibit?.mlTarget && !exhibit.imageTarget) {
        state = 'found'
        debug?.set('state', state)
        hint.setText(TEXT.scanFitObjectStart)
        startMlDetection()
      }
      canvas.addEventListener('pointerdown', onObjectTap)
    },

    onUpdate: ({processCpuResult}) => {
      const dt = clock.getDelta()
      glow.update(dt)
      thanks?.update(dt)
      if (item) {
        item.root.rotation.y += dt * ITEM_SPIN
        item.root.position.y = item.baseY + Math.sin(clock.elapsedTime * 2.5) * item.root.scale.y * 0.08
      }
      worldPoints = processCpuResult?.reality?.worldPoints ?? worldPoints
      if (debug) {
        fpsFrames++
        fpsSeconds += dt
        if (fpsSeconds >= 1) {
          debug.set('fps', fpsFrames / fpsSeconds)
          fpsFrames = 0
          fpsSeconds = 0
        }
        const {camera} = XR8.Threejs.xrScene()
        debug.set('camera', camera.position)
        if (lastCameraPosition) {
          const moved = camera.position.distanceTo(lastCameraPosition)
          if (moved > WORLD_JUMP) {
            worldJumps++
            debug.set('world jumps', `${worldJumps}, last ${moved.toFixed(2)} at ${clock.elapsedTime.toFixed(0)}s`)
          }
        }
        lastCameraPosition = camera.position.clone()
        debug.set(`looking down (y < ${FLOOR_PITCH})`, camera.getWorldDirection(forward).y)
        debug.set('world points', worldPoints.length)
      }
      if (state === 'placed') {
        exhibitModule.onUpdate()
        if (objectFit) {
          followObject(dt)
        }
        return
      }
      // Floor calibration: collect samples while still searching. Shows a hint until the floor
      // is measured, then switches to the normal scan hint.
      if (state === 'searching') {
        const {camera} = XR8.Threejs.xrScene()
        camera.getWorldDirection(forward)
        if (forward.y < FLOOR_PITCH) {
          measureFloor(camera.position.y, dt)
        }
        if (quest?.step === 'carrying') {
          hint.setText(TEXT.questReturn)
        } else if (floorSamples.length < FLOOR_SAMPLES_NEEDED) {
          hint.setText(TEXT.scanFloorFirst)
        } else {
          hint.setText(TEXT.scanHint)
        }
      }
      // Two-target flow: exhibit object was found; wait MIN_GLOW_SECONDS then place the creature.
      if (state === 'found_object') {
        objectFoundSeconds += dt
        debug?.set('state', `found_object ${objectFoundSeconds.toFixed(1)}s`)
        if (objectFoundSeconds < MIN_GLOW_SECONDS) {
          return
        }
        const {camera} = XR8.Threejs.xrScene()
        placeOnObject(camera)
        return
      }
      if (state === 'found') {
        foundSeconds += dt
        debug?.set('state', `${state} ${foundSeconds.toFixed(1)}s`)
        // Two-target or ML flow: poster found, waiting for the visitor to point at the exhibit object.
        if (exhibit?.objectTarget || exhibit?.mlTarget) {
          return
        }
        if (foundSeconds < MIN_GLOW_SECONDS) {
          return
        }
        const {camera} = XR8.Threejs.xrScene()
        if (markerMode) {
          placeOnMarker(camera)
          return
        }
        if (objectMode) {
          placeOnObject(camera)
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

/**
 * Starts the camera, with world tracking and every configured image target. `&absolute` in the
 * address tries the engine's metre scale (a trial: the default scale drifted when walking about).
 */
export const startScan = () => {
  const scale = new URLSearchParams(window.location.search).has('absolute') ? 'absolute' : undefined
  startXr(scanPipelineModule(), {imageTargetData: IMAGE_TARGET_DATA, scale})
}

/** True when at least one image target is configured, so scanning can find something. */
export const canScan = IMAGE_TARGET_DATA.length > 0
