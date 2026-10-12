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
 * @property {string} [imageTarget] - Name of the image target that opens this exhibit.
 */

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
  // Office test objects: an abstract painting, a backlit sign and a wooden wall clock.
  'office-painting': {creatures: [alone('pinecone')], imageTarget: 'abstract-painting'},
  'office-sign': {creatures: [alone('glowcap')], imageTarget: 'modify-sign'},
  'office-clock': {creatures: [alone('acorn')], imageTarget: 'wood-clock'},
  // The whole demo: all the creatures, and the game a button away.
  demo: {creatures: TOGETHER, game: 'light_the_way'},
  // The yard game, open whenever the museum is closed: no creatures, straight into the game.
  yard: {creatures: [], game: 'light_the_way', startIn: 'game'},
}

// What the welcome page shows (the page you get without a code): a preview of the creatures
// waiting inside, all standing together.
export const PREVIEW = TOGETHER
