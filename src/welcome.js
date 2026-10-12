// The welcome page: what you get at the bare address, with no exhibit's code. There is no camera
// and no AR here, just a plain 3D scene of the creatures waiting inside the museum, standing
// together as a preview, with a line telling the visitor to scan the QR code next to an exhibit,
// and the language switch. It is also where an unknown code ends up (with a note saying so).
import * as THREE from 'three'

import {PREVIEW} from './content/exhibits.js'
import {addLights} from './lights'
import {createLangPicker, onLangChange, TEXT} from './i18n'
import {createShowcase} from './showcase'
import {setMuted} from './sound'

// What has to fit on screen, as half-widths/heights around where the creatures stand (game units).
const FRAME_HALF_WIDTH = 1.0
const FRAME_HALF_HEIGHT = 1.15
const CAMERA_FOV = 40

const make = (tag, className, props) => Object.assign(document.createElement(tag), {className}, props)

// A soft round patch of ground for the creatures to stand on: a disc that fades out at its edge.
const makeGround = () => {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, '#fff')
  gradient.addColorStop(0.65, '#fff')
  gradient.addColorStop(1, '#000')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const geometry = new THREE.CircleGeometry(1.9, 64)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshStandardMaterial({
    color: 0x2f4438, roughness: 1, transparent: true, alphaMap: new THREE.CanvasTexture(canvas),
  })
  const ground = new THREE.Mesh(geometry, material)
  ground.receiveShadow = true
  return ground
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.unknownCode] - Show the "code not recognised" note.
 * @param {boolean} [options.hasScan] - Offer the object scanner (image targets are configured).
 */
export const startWelcome = ({unknownCode = false, hasScan = false} = {}) => {
  // The camera feed's canvas (index.html) is for the AR view only.
  const feed = document.getElementById('camerafeed')
  if (feed) {
    feed.remove()
  }
  document.body.classList.add('welcome-page')

  // ---- the words ----
  const root = make('div', 'ui welcome-ui')
  const langButton = createLangPicker()   // self-syncing badge + popup menu of all four languages
  const card = make('div', 'welcome-card')
  const title = make('h1')
  const body = make('p', 'welcome-body')
  const note = make('p', 'welcome-note')
  note.hidden = !unknownCode
  card.append(title, body, note)

  if (hasScan) {
    const scanBtn = make('button', 'welcome-scan-btn', {type: 'button'})
    const refreshScanBtn = () => { scanBtn.textContent = TEXT.scanObjects }
    refreshScanBtn()
    onLangChange(refreshScanBtn)
    // A fresh page load, so the scanner starts clean instead of beside this page's WebGL preview.
    scanBtn.addEventListener('click', () => { window.location.search = '?scan' })
    card.append(scanBtn)
  }

  root.append(langButton, card)
  document.body.appendChild(root)

  const refreshTexts = () => {
    title.textContent = TEXT.welcomeTitle
    body.textContent = TEXT.welcomeBody
    note.textContent = TEXT.welcomeUnknown
  }
  refreshTexts()
  onLangChange(refreshTexts)

  // ---- the creatures ----
  // Taps make them react just as in AR, but silently: nobody expects noise from a page they
  // opened in a quiet museum.
  setMuted(true)

  let renderer
  try {
    const canvas = make('canvas', 'welcome-canvas')
    document.body.insertBefore(canvas, root)
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true})
  } catch (e) {
    // No WebGL (an old or restricted browser): the words alone still do their job.
    console.warn('Welcome preview needs WebGL:', e)
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)   // the page's own gradient shows through

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50)
  const {glowLight} = addLights(scene, renderer)
  scene.add(makeGround())

  // Always shown awake: a locked silhouette here would invite a tap that can't do anything
  // useful this far from the exhibit (there's no puzzle-solving on the welcome page).
  const showcase = createShowcase({placements: PREVIEW, glowLight, puzzlesEnabled: false})
  showcase.load(scene)

  // Frames the creatures whatever the screen's shape: far enough back that both their width and
  // their height fit, and looking a little below them so they sit above the words.
  const fit = () => {
    const width = window.innerWidth
    const height = window.innerHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2))
    const distance = Math.max(FRAME_HALF_HEIGHT / tanHalf, FRAME_HALF_WIDTH / (tanHalf * camera.aspect)) + 0.6
    camera.position.set(0, 0.55 + distance * 0.3, distance)
    camera.lookAt(0, -0.05, 0)
    camera.updateProjectionMatrix()
  }
  fit()
  window.addEventListener('resize', fit)

  const raycaster = new THREE.Raycaster()
  renderer.domElement.addEventListener('pointerdown', (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    ), camera)
    const hit = showcase.hitTest(raycaster)
    if (hit !== -1) {
      showcase.tap(hit)
    }
  })

  let last = performance.now()
  let elapsed = 0
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1))   // a hidden tab must not leap ahead
    last = now
    elapsed += dt
    showcase.update(dt, elapsed)
    renderer.render(scene, camera)
  })
}
