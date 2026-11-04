// The exhibits: one entry per QR code. The code in the address (`/?c=03`) picks the entry, so
// what stands at an exhibit can be changed here without printing a new code. Plain data, like
// creatures.js.
//
// An entry has:
//   creatures  who stands there: [{id: 'acorn', x, z, yaw, ...}]. `id` is a key of CREATURES;
//              x/z are where it stands on the floor in front of the phone (default 0 / -0.2);
//              any other field overrides that creature's own setting for this exhibit
//   game       the id of the mini-game to offer (or start in), if any — a key of GAMES in
//              content/games.js, which is where the id turns into what actually plays
//   startIn    'game' opens straight into the game, with no creature showcase first
// Codes are lower case letters, digits and dashes.
//
// NOTE: 01-03, demo and yard are stand-ins to try the flow with the three creatures that exist
// so far. They get replaced by the museum's real exhibits and creatures.

import {CREATURES} from './creatures.js'

/**
 * @typedef {Object} Placement
 * @property {string} id - A key of CREATURES.
 * @property {number} x - Metres left/right of the phone's start point.
 * @property {number} z - Metres in front (negative) or behind.
 */

/**
 * @typedef {Object} Exhibit
 * @property {Placement[]} creatures
 * @property {string} [game] - A key of GAMES in content/games.js.
 * @property {'game'} [startIn]
 * @property {string} [imageTarget] - Name of the image target for the exhibit's description poster.
 *   When `objectTarget` is also set, scanning this poster shows a "Find the exhibit object" hint;
 *   otherwise the poster IS the trigger that places the creature (single-target flow).
 * @property {string} [objectTarget] - Name of a second image target placed on or near the physical
 *   exhibit object. When set, the creature appears near this target rather than on the floor in
 *   front of the poster. The visitor scans the poster first, then finds and scans the object.
 *   Register both JSONs in src/image-targets/index.js.
 * @property {string} [mlTarget] - A class of the object classifier (src/ml/model-config.js). After
 *   the poster, the visitor points the camera at that free-standing object, then taps where it
 *   stands on the floor; the creature comes out from behind it and walks round it to the front.
 * @property {{radius: number, height: number}} [objectSize] - The mlTarget object as an upright
 *   cylinder, in metres: it hides the creature while it is behind it.
 * @property {number} [posterWidth] - Metres: the real width of the poster's image target, i.e. of
 *   the crop image-target-cli made (its shorter side), which the engine reports as `detail.scale`
 *   in scene units. It turns metres into this session's scene units, which differ every session.
 * @property {'wall'} [mount] - 'wall': the mlTarget object is a box hanging on a wall, and objectSize
 *   is {width, height, depth} in metres (its front face, and how far it sticks out); the creature
 *   comes up from behind its top edge and sits on it. Without mount it stands on the floor.
 *   An ML exhibit without imageTarget opens straight into the stencil, without a poster.
 * @property {string} [modelUrl] - The Teachable Machine model this exhibit's mlTarget is a class of,
 *   when it is not the shared one in src/ml/model-config.js.
 */

// Standing still on the floor: no hover, bob, turntable spin or heartbeat pulse, so it walks round an object
// facing the way it goes and stays on the floor.
const GROUNDED = {hover: 0, bob: 0, spinSpeed: 0, pulse: 0}

const at = (id, x = 0, z = -0.2, extra = {}) => ({id, x, z, ...extra})

// A creature shown on its own (most real exhibits, one QR each), 3x its usual size: without the
// others next to it for scale it read as small and far away.
const alone = (id, extra = {}) => at(id, 0, -0.2, {targetHeight: CREATURES[id].targetHeight * 3, ...extra})

// The three creatures standing together, as the demo page has always shown them.
const TOGETHER = [
  {id: 'acorn', x: -0.45, z: -0.85},
  {id: 'pinecone', x: 0.45, z: -0.85},
  {id: 'glowcap', x: 0, z: 0.5},
]

export const EXHIBITS = {
  // imageTarget matches the name given when running image-target-cli on that exhibit's photo.
  '01': {creatures: [alone('acorn')], imageTarget: '01'},
  '02': {creatures: [alone('pinecone')], imageTarget: '02'},
  '03': {creatures: [alone('glowcap')], game: 'light_the_way', imageTarget: '03'},
  // Office test objects: an abstract painting, a cats painting and a wooden wall clock.
  'office-painting': {creatures: [alone('pinecone')], imageTarget: 'abstract-painting'},
  'office-cats': {creatures: [alone('ghost')], imageTarget: 'cats-painting'},
  'office-clock': {creatures: [alone('acorn')], imageTarget: 'wood-clock'},
  // ML recognition test: cats painting → ML model detects the physical object from any angle.
  // The cats painting is 50 x 40 cm; its image target crop is about 48 x 36 cm.
  'test-purifier': {
    creatures: [at('ghost', 0, 0, {...GROUNDED, targetHeight: 0.8})], imageTarget: 'cats-painting', mlTarget: 'air-purifier',
    objectSize: {radius: 0.13, height: 0.49}, posterWidth: 0.36,
  },
  // objectSize is a guess; measure the real station.
  'test-vacuum': {
    creatures: [at('glowcap', 0, 0, GROUNDED)], imageTarget: 'cats-painting', mlTarget: 'vacuum-station',
    objectSize: {radius: 0.17, height: 0.4}, posterWidth: 0.36,
  },
  // An electrical panel on a wall, no poster. Measured: the grey box 36.5 cm wide, 42 cm from its
  // top to the black box's bottom, sticking out 16 cm from the wall.
  'test-panel': {
    creatures: [at('pinecone', 0, 0, GROUNDED)], mlTarget: 'electrical-panel', mount: 'wall',
    objectSize: {width: 0.365, height: 0.42, depth: 0.16},
    // Trained on frames of a video of the panel and on background cut from the same frames.
    modelUrl: 'https://teachablemachine.withgoogle.com/models/uvKjSD9UM/',
  },
  // The whole demo: all the creatures, and the game a button away.
  demo: {creatures: TOGETHER, game: 'light_the_way'},
  // The yard game, open whenever the museum is closed: no creatures, straight into the game.
  yard: {creatures: [], game: 'light_the_way', startIn: 'game'},
}

// What the welcome page shows (the page you get without a code): a preview of the creatures
// waiting inside, all standing together.
export const PREVIEW = TOGETHER
