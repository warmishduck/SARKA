// 3D object recognition via a Teachable Machine image classifier.
// The model runs in a Web Worker (detector-worker.js), which loads TF.js from a CDN on first use;
// this side only cuts frames out of the camera feed and hands them over.

const INPUT_SIZE = 224
// Teachable Machine trains on square crops of the middle of the frame, so a frame is classified
// as squares, not squashed into one: this many, from one end of its long side to the other, so
// an object anywhere in view (on the phone it was often near the top) is seen whole in one.
// One square per tick, in turn: all three at once tripled the GPU work, and 8th Wall's tracking,
// which shares the GPU, lost its way on the phone.
const CROPS = 3

/** @type {Worker | null} */
let worker = null
/** @type {Promise<{backend: string, ms: number}> | null} */
let ready = null
let isReady = false
/** @type {((result: {scores: {className: string, probability: number}[], ms: number} | null) => void) | null} */
let pendingResult = null
let offscreen = null
let offCtx = null

/**
 * Starts loading the model in the worker; only loads once, so it is safe to call repeatedly.
 * The first prediction (TF.js compiling its GPU programs) is made in the worker too, so this
 * resolves only once predictions are fast.
 *
 * @param {string} modelUrl - The Teachable Machine model folder.
 * @returns {Promise<{backend: string, ms: number}>} The TF.js backend the worker got, and how
 *   long loading took. Rejects if it failed; a later call tries again.
 */
export const loadModel = (modelUrl) => {
  if (ready) {
    return ready
  }
  worker = new Worker(new URL('./detector-worker.js', import.meta.url))
  ready = new Promise((resolve, reject) => {
    worker.onmessage = ({data}) => {
      if (data.type === 'ready') {
        isReady = true
        resolve({backend: data.backend, ms: data.ms})
      } else if (data.type === 'result') {
        pendingResult?.(data)
      } else if (data.type === 'error') {
        if (!isReady) {
          worker.terminate()
          ready = null
          reject(new Error(data.message))
        }
        pendingResult?.(null)
      }
    }
  })
  worker.postMessage({type: 'load', modelUrl})
  offscreen = document.createElement('canvas')
  offscreen.width = INPUT_SIZE
  offscreen.height = INPUT_SIZE
  offCtx = offscreen.getContext('2d', {willReadFrequently: true})
  return ready
}

/**
 * The square of a frame, in its own pixels, that shows a square of the screen. The camera feed is
 * drawn to cover the whole canvas (scaled to fill it, the overflow cut off equally on both sides).
 *
 * @param {{width: number, height: number}} frame - Its pixel size.
 * @param {DOMRect} canvasRect - The canvas on screen.
 * @param {{x: number, y: number, size: number}} region - CSS px, relative to the canvas.
 * @returns {{x: number, y: number, size: number}}
 */
const frameSquare = (frame, canvasRect, region) => {
  const scale = Math.max(canvasRect.width / frame.width, canvasRect.height / frame.height)
  const offsetX = (canvasRect.width - frame.width * scale) / 2
  const offsetY = (canvasRect.height - frame.height * scale) / 2
  const size = Math.min(region.size / scale, frame.width, frame.height)
  const clamp = (value, max) => Math.min(Math.max(value, 0), max - size)
  return {
    x: clamp((region.x - offsetX) / scale, frame.width),
    y: clamp((region.y - offsetY) / scale, frame.height),
    size,
  }
}

/**
 * Has the worker classify one square of a frame.
 *
 * @param {HTMLVideoElement | HTMLCanvasElement} source
 * @param {number | {x: number, y: number, size: number}} crop - Which of the CROPS squares along the
 *   long side (0 at the top or left), or a square in the frame's own pixels.
 * @returns {Promise<{scores: {className: string, probability: number}[][], ms: number} | null>}
 *   The scores of that one square, as the only entry of `scores`.
 */
const classifyFrame = (source, crop) => {
  const width = source.videoWidth || source.width
  const height = source.videoHeight || source.height
  let square = crop
  if (typeof crop === 'number') {
    const side = Math.min(width, height)
    const offset = ((Math.max(width, height) - side) * crop) / (CROPS - 1)
    square = width > height ? {x: offset, y: 0, size: side} : {x: 0, y: offset, size: side}
  }
  offCtx.drawImage(source, square.x, square.y, square.size, square.size, 0, 0, INPUT_SIZE, INPUT_SIZE)
  const {data} = offCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
  return new Promise((resolve) => {
    pendingResult = resolve
    worker.postMessage({type: 'classify', count: 1, width: INPUT_SIZE, height: INPUT_SIZE, pixels: data.buffer}, [data.buffer])
  })
}

/**
 * Run inference on the camera feed every intervalMs, one square of the frame at a time (middle,
 * top, bottom, middle, …), so the whole view is covered every CROPS ticks; or, with
 * `screenRegion`, always the part of the frame shown in that square of the screen.
 * Prefers the raw <video> element that 8th Wall injects (avoids the preserveDrawingBuffer
 * issue where reading a WebGL canvas outside the render frame produces a black image).
 * Falls back to glCanvas when no video element is found.
 * Calls onDetect(className, confidence) when a non-background class exceeds the threshold.
 * Returns a stop function — call it to cancel the detection loop.
 *
 * @param {HTMLCanvasElement} glCanvas - The WebGL renderer canvas (used as fallback source).
 * @param {(className: string, confidence: number) => void} onDetect
 * @param {{intervalMs?: number, threshold?: number, backgroundClass?: string,
 *   onFrame?: (best: {className: string, probability: number, crop: number | string}, ms: number) => void,
 *   screenRegion?: {x: number, y: number, size: number} | {x: number, y: number, size: number}[],
 *   showInput?: boolean}} options -
 *   `onFrame` hears every tick's best guess, which square it was (`crop`, 0 at the top, or
 *   'region'; 'region 0', 'region 1', … with several) and how long the worker took.
 *   `screenRegion` is CSS px relative to `glCanvas`: one square, or several taken in turn.
 *   `showInput` shows what the classifier is given, small, in a corner (for ?debug).
 * @returns {() => void} stop
 */
export const startDetection = (glCanvas, onDetect, {
  intervalMs = 700,
  threshold = 0.60,
  backgroundClass = 'background',
  onFrame = null,
  screenRegion = null,
  showInput = false,
} = {}) => {
  if (!isReady) throw new Error('Call loadModel() first')
  let active = true
  let ticks = 0
  const regions = screenRegion ? [screenRegion].flat() : null
  if (showInput) {
    offscreen.className = 'ml-input-preview'
    document.body.appendChild(offscreen)
  }

  const tick = async () => {
    if (!active) return
    try {
      // 8th Wall injects a <video> element for the raw camera stream; use it so we get a
      // live frame rather than reading a WebGL canvas that may have an empty drawing buffer.
      const source = document.querySelector('video') ?? glCanvas
      // The middle first: that is where a visitor usually holds what they point at.
      const regionIndex = regions ? ticks++ % regions.length : null
      const crop = regions
        ? frameSquare({width: source.videoWidth || source.width, height: source.videoHeight || source.height},
          glCanvas.getBoundingClientRect(), regions[regionIndex])
        : (Math.floor(CROPS / 2) + ticks++) % CROPS
      const result = await classifyFrame(source, crop)
      if (active && result) {
        const label = regions && regions.length > 1 ? `region ${regionIndex}` : 'region'
        const best = {
          ...result.scores[0].reduce((a, b) => a.probability > b.probability ? a : b),
          crop: regions ? label : crop,
        }
        onFrame?.(best, result.ms)
        if (best.className !== backgroundClass && best.probability >= threshold) {
          onDetect(best.className, best.probability)
        }
      }
    } catch (_) {
      // Source not ready or context lost — skip this frame
    }
    if (active) setTimeout(tick, intervalMs)
  }

  tick()
  return () => {
    active = false
    offscreen.remove()
  }
}
