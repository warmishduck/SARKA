// The exhibits: one entry per QR code. The code in the address (`/?c=test-panel`) picks the entry, so
// what stands at an exhibit can be changed here without printing a new code. Plain data, like
// creatures.js.
//
// An entry has:
//   creatures  who stands there: [{id: 'ghost', x, z, yaw, ...}]. `id` is a key of CREATURES;
//              x/z are where it stands on the floor in front of the phone (default 0 / -0.2);
//              any other field overrides that creature's own setting for this exhibit
// Codes are lower case letters, digits and dashes.
//
// NOTE: the exhibits here are test setups for the office, with the two creatures that exist so far
// (the ghost and the granny). They get replaced by the museum's real exhibits and creatures.

import {CREATURES} from './creatures.js'

/**
 * @typedef {Object} Placement
 * @property {string} id - A key of CREATURES.
 * @property {number} x - Metres left/right of the phone's start point.
 * @property {number} z - Metres in front (negative) or behind.
 */

/**
 * @typedef {Object} Quest
 * @property {{mlTarget: string, objectSize: {radius: number, height: number}, modelUrl?: string}} find -
 *   The free-standing object the item is found at, recognised like an `mlTarget` exhibit.
 */

/**
 * @typedef {Object} Exhibit
 * @property {Placement[]} creatures
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
 * @property {'floor'} [seat] - With mount 'wall': the creature drops from the box to the floor in
 *   front of it instead of sitting on its top. It must be shorter than the box, or it shows at the start.
 *   It lands below the phone's view, so the in-AR hint asks the visitor to look at the floor.
 *   An ML exhibit without imageTarget opens straight into the stencil, without a poster.
 * @property {Quest} [quest] - A fetch quest (quest.js): the creature at `imageTarget` asks for an item,
 *   which is found at another object and brought back.
 * @property {string} [modelUrl] - The Teachable Machine model this exhibit's mlTarget is a class of,
 *   when it is not the shared one in src/ml/model-config.js.
 */

// Standing still on the floor: no hover, bob, turntable spin or heartbeat pulse, so it walks round an object
// facing the way it goes and stays on the floor.
const GROUNDED = {hover: 0, bob: 0, spinSpeed: 0, pulse: 0}

// An electrical panel on a wall, recognised without a poster. Measured: the grey box 36.5 cm wide,
// 42 cm from its top to the black box's bottom, sticking out 16 cm from the wall. The creature, small
// enough to hide behind the box (0.42 m), drops from it to the floor in front.
const PANEL = {
  mlTarget: 'electrical-panel', mount: 'wall', seat: 'floor',
  objectSize: {width: 0.365, height: 0.42, depth: 0.16},
  // Trained on frames of a video of the panel and on background cut from the same frames.
  modelUrl: 'https://teachablemachine.withgoogle.com/models/uvKjSD9UM/',
}

// An air purifier, found after the cats painting poster: a 26 x 49 cm cylinder. The creature walks round it.
const PURIFIER = {
  imageTarget: 'cats-painting', mlTarget: 'air-purifier',
  objectSize: {radius: 0.13, height: 0.49}, posterWidth: 0.36,
}

const at = (id, x = 0, z = -0.2, extra = {}) => ({id, x, z, ...extra})

// A creature shown on its own (most real exhibits, one QR each), 3x its usual size: without the
// others next to it for scale it read as small and far away.
const alone = (id, extra = {}) => at(id, 0, -0.2, {targetHeight: CREATURES[id].targetHeight * 3, ...extra})

export const EXHIBITS = {
  // Office test objects: an abstract painting and a cats painting. imageTarget matches the name given
  // when running image-target-cli on that object's photo.
  'office-painting': {creatures: [alone('ghost')], imageTarget: 'abstract-painting'},
  'office-cats': {creatures: [alone('ghost')], imageTarget: 'cats-painting'},
  // ML recognition test: cats painting → ML model detects the physical object from any angle.
  // The cats painting is 50 x 40 cm; its image target crop is about 48 x 36 cm.
  'test-purifier': {creatures: [at('ghost', 0, 0, {...GROUNDED, targetHeight: 1.6})], ...PURIFIER},
  // The granny round the same purifier: /?scan&c=test-purifier-granny
  'test-purifier-granny': {creatures: [at('granny', 0, 0, {...GROUNDED, targetHeight: 1.6})], ...PURIFIER},
  // The sock quest, a home test: /?scan&c=test-quest. The ghost at the cats painting asks for its
  // sock, which is by the air purifier. It hops when it gets it back (its other tests do not hop).
  'test-quest': {
    creatures: [alone('ghost', {hop: true})], imageTarget: 'cats-painting',
    quest: {find: {mlTarget: 'air-purifier', objectSize: PURIFIER.objectSize}},
  },
  // The granny (a Mixamo-rigged test model), on the cats painting like the ghost: /?scan&c=test-granny
  'test-granny': {creatures: [alone('granny', GROUNDED)], imageTarget: 'cats-painting'},
  // The same granny on the abstract painting, the only painting in Jussi's office: /?scan&c=test-granny-office
  'test-granny-office': {creatures: [alone('granny', GROUNDED)], imageTarget: 'abstract-painting'},
  // The ghost and the granny at the electrical panel, one link each: /?scan&c=test-panel and
  // /?scan&c=test-panel-granny. They do not fit side by side behind the 36 cm box (the ghost alone is 24 cm wide).
  'test-panel': {creatures: [at('ghost', 0, 0, {...GROUNDED, targetHeight: 1.0})], ...PANEL},
  'test-panel-granny': {creatures: [at('granny', 0, 0, {...GROUNDED, targetHeight: 1.0})], ...PANEL},
}

// What the welcome page shows (the page you get without a code): a preview of the creatures
// waiting inside, standing together.
export const PREVIEW = [
  {id: 'ghost', x: -0.45, z: -0.3, targetHeight: 0.85},
  {id: 'granny', x: 0.45, z: -0.3, targetHeight: 0.85},
]
