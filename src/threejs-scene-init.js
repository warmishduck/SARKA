// Define an 8th Wall XR Camera Pipeline Module that puts one exhibit's content into a threejs
// scene on startup (which exhibit comes from the page's address, see route.js and
// content/exhibits.js). An exhibit has creatures, a mini-game, or both, and this has two modes:
//  - creatures: tapping a creature makes it react, each in its own way (see showcase.js);
//  - level: a small diorama of a level from the game, which you play with on-screen buttons
//    (see level.js). It is a button away, or the only thing there when the exhibit has no
//    creatures.
import * as THREE from 'three';

import {CREATURES} from './content/creatures.js'
import {GAMES} from './content/games.js'
import {createLevel} from './level'
import {addLights, addShadowFloor} from './lights'
import {createShowcase} from './showcase'
import {isMuted, playSound, resumeAudio, setMuted} from './sound'
import {createUi} from './ui'

const EMERGE_SPEED = 0.4          // scene units per second, walking out from behind the wall
const EMERGE_MIN_SECONDS = 1.5
const EMERGE_MAX_SECONDS = 6
const FOLLOW_RATE = 4            // 1/s: how fast content eases after a marker that moved
const TURN_RATE = 6              // 1/s: how fast walking content turns to a new heading

/**
 * The way to turn from one yaw to another, the short way round.
 *
 * @param {number} from - Radians.
 * @param {number} to - Radians.
 * @returns {number} Radians, between -PI and PI.
 */
const turnBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

/**
 * Sets the AR camera's starting pose: 2 units above the floor (y = 0), pulled back so the
 * creatures standing around the origin fit a portrait screen. Call once, when the camera starts.
 *
 * @param {THREE.Camera} camera - The camera from XR8.Threejs.xrScene().
 */
export const placeCameraAtStart = (camera) => {
  camera.position.set(0, 2, 3.5)
  XR8.XrController.updateCameraProjectionMatrix({origin: camera.position, facing: camera.quaternion})
}

/**
 * @param {import('./content/exhibits.js').Exhibit} exhibit
 * @param {Object} [options]
 * @param {{position: THREE.Vector3, yaw: number, scale: number}} [options.anchor] - Stand the
 *   content at this floor point, turned by `yaw` and shrunk by `scale`, inside a camera session
 *   another module already started
 *   (scan.js calls onStart/onUpdate itself). Without it the content stands at the world origin
 *   and this module sets the camera up.
 * @param {boolean} [options.puzzlesEnabled] - False: creatures are awake from the start, no
 *   puzzle and no stone wall (the marker flow, where the real wall does the hiding).
 * @param {THREE.Vector3 | THREE.Vector3[]} [options.emergeFrom] - With an anchor: start the
 *   content here (or at the first of these waypoints, then through the rest) and walk it to the
 *   anchor at EMERGE_SPEED, facing the way it walks, so it comes out from behind something
 *   invisible (a wall, or the object it walks round). At the anchor it turns to `anchor.yaw`.
 * @returns {Object} An 8th Wall camera pipeline module, plus `moveAnchor(position)`: the anchor
 *   follows a marker that is tracked again (the content eases to the new spot).
 */
export const initScenePipelineModule = (exhibit, {anchor = null, puzzlesEnabled = true, emergeFrom = null} = {}) => {
  const clock = new THREE.Clock()

  const hasCreatures = exhibit.creatures.length > 0
  // Placed by the scanner, a creature still behind its puzzle hides behind a stone wall instead of
  // standing as a silhouette (see showcase.js's lockStyle).
  const lockStyle = anchor ? 'wall' : 'silhouette'
  const hidesBehindWall = lockStyle === 'wall' && puzzlesEnabled &&
    exhibit.creatures.some((placement) => ({...CREATURES[placement.id], ...placement}).puzzle)
  // What plays, if anything (content/games.js turns an id like 'light_the_way' into the level
  // data an actual game reads). Only one `type` exists yet ('platformer', run by level.js); a
  // second kind of game would be started here too, picked by `game.type`, alongside this one.
  const game = exhibit.game ? GAMES[exhibit.game] : null
  const hasGame = !!game

  // The creature showcase and the level diorama, created in initXrScene (the level only when the
  // exhibit has a game); and which of the two modes is showing.
  let showcase = null
  let level = null
  let mode = hasCreatures && exhibit.startIn !== 'game' ? 'creatures' : 'level'
  let showingLevelLoading = false   // the "loading the level" note is up

  // What anchors the content: the stage group everything stands in, where it is heading, and
  // (until it has arrived) the walk it makes from behind the wall.
  let stage = null
  let shadowFloor = null
  const anchorTarget = anchor ? anchor.position.clone() : null
  const route = emergeFrom && anchor ? [...[emergeFrom].flat(), anchor.position].map((point) => point.clone()) : null
  const routeLengths = route ? route.slice(1).map((point, i) => point.distanceTo(route[i])) : []
  const routeLength = routeLengths.reduce((sum, length) => sum + length, 0)
  const emerging = route
    ? {elapsed: 0, seconds: THREE.MathUtils.clamp(routeLength / EMERGE_SPEED, EMERGE_MIN_SECONDS, EMERGE_MAX_SECONDS)}
    : null
  let carrying = false   // the showcase has been told the content is on its way (setMoving)

  /**
   * Where along the route the content is, and which way that leg of it heads.
   *
   * @param {number} distance - Scene units walked from the start of the route.
   * @returns {{position: THREE.Vector3, heading: number | null}} heading null on a leg of no length.
   */
  const alongRoute = (distance) => {
    let leg = 0
    while (leg < routeLengths.length - 1 && distance > routeLengths[leg]) {
      distance -= routeLengths[leg]
      leg++
    }
    const from = route[leg]
    const to = route[leg + 1]
    const length = routeLengths[leg]
    const position = length > 0 ? from.clone().lerp(to, Math.min(1, distance / length)) : to.clone()
    // A leg straight up (coming up onto a box on a wall) has no heading: keep facing as before.
    const heading = Math.hypot(to.x - from.x, to.z - from.z) > 1e-6 ? Math.atan2(to.x - from.x, to.z - from.z) : null
    return {position, heading}
  }

  // The on-screen extras (loading note, hint, buttons), created in onStart.
  let ui = null
  const hintSeconds = 15    // how long a hint stays if nobody taps
  let hintTimer = null

  const raycaster = new THREE.Raycaster()

  // Shows a hint until the person acts on it (or a while passes).
  const showHint = () => {
    ui.showHint()
    clearTimeout(hintTimer)
    hintTimer = setTimeout(() => ui.hideHint(), hintSeconds * 1000)
  }

  // Called as each creature's model finishes loading. Updates the loading note; once everything
  // is in, it shows the "tap a creature" hint, which goes away on the first tap (or after a while).
  const modelProgress = (done, total) => {
    ui.setLoading(done, total)
    if (done === total && total > 0 && mode === 'creatures') {
      showHint()
    }
  }

  // Populates the scene and sets the initial camera position.
  const initXrScene = ({scene, camera, renderer}) => {
    // The level diorama is a box: anything outside it is clipped away.
    renderer.localClippingEnabled = true

    // Everything the exhibit shows lives in `stage`, so an anchor moves it all at once.
    stage = new THREE.Group()
    if (anchor) {
      const start = emerging ? alongRoute(0) : null
      stage.position.copy(start ? start.position : anchor.position)
      stage.rotation.y = start?.heading ?? anchor.yaw
      stage.scale.setScalar(anchor.scale)
    }
    scene.add(stage)

    const {glowLight, keyLight} = addLights(scene, renderer)
    stage.add(keyLight, keyLight.target)   // its shadows only reach +/-2 around the target

    showcase = createShowcase({placements: exhibit.creatures, glowLight, onProgress: modelProgress, puzzlesEnabled, lockStyle})
    showcase.load(stage)

    // The level diorama. Hidden (and not even loaded) until it is shown.
    if (hasGame) {
      level = createLevel({
        glowLight,
        data: game.data,
        onEvent: (name) => {
          if (name === 'won') {
            ui.notice(ui.text.won, 3500)
          } else if (name === 'branchLost') {
            ui.notice(ui.text.branchLost, 3000)
          }
        },
      })
      stage.add(level.root)
    }

    // The scanner's floor is only estimated, and a shadow on a wrong floor gives that away.
    if (!anchor) {
      shadowFloor = addShadowFloor(scene)
    }

    if (!anchor) {
      placeCameraAtStart(camera)
    }
  }

  // Walks the stage out along its route, then turns it to face the visitor and eases it after a
  // marker that moved.
  const updateAnchor = (dt) => {
    if (!stage || !anchorTarget) {
      return
    }
    const walking = !!emerging && emerging.elapsed < emerging.seconds
    if (walking !== carrying) {
      carrying = walking
      showcase.setMoving(walking)
    }
    const turnRate = 1 - Math.exp(-dt * TURN_RATE)
    if (walking) {
      emerging.elapsed += dt
      const {position, heading} = alongRoute(routeLength * Math.min(1, emerging.elapsed / emerging.seconds))
      stage.position.copy(position)
      if (heading !== null) {
        stage.rotation.y += turnBetween(stage.rotation.y, heading) * turnRate
      }
      return
    }
    stage.rotation.y += turnBetween(stage.rotation.y, anchor.yaw) * turnRate
    stage.position.lerp(anchorTarget, 1 - Math.exp(-dt * FOLLOW_RATE))
  }

  // Recentering moves the camera back to its start pose; anchored content would not follow it.
  const onEmptyTap = () => {
    if (!anchor) {
      XR8.XrController.recenter()
    }
  }

  // Points the raycaster along the ray from the camera through a tap.
  const aimRaycaster = (touch, canvas, camera) => {
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((touch.clientX - rect.left) / rect.width) * 2 - 1,
      -((touch.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
  }

  // Makes the tapped creature react in whatever way its entry describes.
  const onTap = (index) => {
    ui.hideHint()  // they found out they can tap
    showcase.tap(index)
  }

  // Switches between the creature showcase and the level diorama.
  const setMode = (next) => {
    mode = next
    const inLevel = next === 'level'
    showcase.setActive(!inLevel)
    if (inLevel) {
      level.ensureLoaded()   // the first time this loads the level's models
      if (!level.isReady()) {
        showingLevelLoading = true
        ui.notice(ui.text.loadingLevel, 20000)   // taken down as soon as it is ready (see onUpdate)
      }
    }
    if (!inLevel) {
      showingLevelLoading = false
      ui.hideNotice()
      ui.setAction(null)
    }
    if (level) {
      level.setActive(inLevel)
    }
    ui.setMode(next)
    showHint()
  }

  // Takes a photo of the camera feed with the characters in it and shows it to share or save.
  const takePhoto = () => {
    resumeAudio()
    playSound('shutter')
    ui.flash()
    XR8.CanvasScreenshot.takeScreenshot().then(
      (base64Jpeg) => ui.showPhoto(base64Jpeg),
      (error) => {
        console.error('Screenshot failed:', error)
        ui.notice(ui.text.photoFailed)
      }
    )
  }

  // Return a camera pipeline module that adds scene elements on start.
  return {
    // Camera pipeline modules need a unique name.
    name: 'threejsinitscene',

    // onStart is called once when the camera feed begins.
    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()  // Get the 3js scene.

      // The screenshot module has to be added in app.js; without it there is no photo button.
      const canTakePhoto = !!(XR8.CanvasScreenshot && XR8.CanvasScreenshot.takeScreenshot)
      ui = createUi({
        onToggleMute: () => {
          setMuted(!isMuted())
          resumeAudio()  // a button press is a valid gesture to unlock audio
          return isMuted()
        },
        onPhoto: canTakePhoto ? takePhoto : null,
        onToggleMode: () => setMode(mode === 'creatures' ? 'level' : 'creatures'),
        onAction: () => level && level.pressAction(),
        onGesture: resumeAudio,
        showModeButton: hasCreatures && hasGame,   // with only one of them there is nothing to switch to
        creaturesHint: hidesBehindWall ? 'hintWall' : 'hintCreatures',
      })
      ui.setLoading(0, exhibit.creatures.length)

      initXrScene({scene, camera, renderer})  // Add objects and set the starting camera.
      if (mode === 'level') {
        setMode('level')   // an exhibit that opens straight into its game
      }

      // Prevent scroll/pinch gestures on the canvas.
      canvas.addEventListener('touchmove', (event) => {
        event.preventDefault()
      })

      // iOS only lets audio start on touchend/click (not touchstart). Sounds are already
      // scheduled by then; this releases them.
      canvas.addEventListener('touchend', resumeAudio)

      // Tap a character to make it react (in the level: tap the ground to send the Glowcap
      // there, or the Glowcap to call it to the acorn); tap empty space to recenter content
      // instead.
      canvas.addEventListener(
        'touchstart', (e) => {
          if (e.touches.length !== 1) {
            return
          }
          aimRaycaster(e.touches[0], canvas, camera)
          if (mode === 'level') {
            if (level.tap(raycaster)) {
              ui.hideHint()
            } else {
              onEmptyTap()
            }
            return
          }
          const hitIndex = showcase.hitTest(raycaster)
          if (hitIndex !== -1) {
            onTap(hitIndex)
          } else {
            onEmptyTap()
          }
        }, true
      )
    },

    // onUpdate is called once per frame. In the level mode the level runs itself; in the
    // creature mode the showcase animates the creatures.
    onUpdate: () => {
      const dt = clock.getDelta()       // seconds since last frame (framerate-independent)
      const t = clock.getElapsedTime()  // total seconds since start

      if (mode === 'level') {
        if (showingLevelLoading && level.isReady()) {
          showingLevelLoading = false
          ui.hideNotice()
        }
        level.update(dt, t, ui.getInput())
        ui.setAction(level.action())   // the anchor's button shows only while the acorn stands at it
        return
      }

      updateAnchor(dt)
      showcase.update(dt, t)
    },

    moveAnchor: (position) => {
      if (anchorTarget) {
        anchorTarget.copy(position)
        if (shadowFloor) {
          shadowFloor.position.y = position.y
        }
      }
    },
  }
}
