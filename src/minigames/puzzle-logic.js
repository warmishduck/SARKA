// The jigsaw puzzle's rules, with no DOM in it, so they can be tested on their own (see
// test/puzzle-logic.test.js). src/minigames/puzzle.js is the
// DOM/canvas layer that draws this state and turns pointer events into calls here.
//
// A piece is {id, homeRow, homeCol, row, col, rotation}: `home` is where it belongs, `row`/`col`
// are where it currently sits on the board (null while it is still in the tray, unplaced), and
// `rotation` is one of 0/1/2/3, each a 90-degree turn. A piece is correct once `row/col` match
// its home and `rotation` is 0 — pieces are plain rectangular slices, so any other rotation
// visibly doesn't fit its slot (a landscape slice turned on its side).

export const ROTATION_STEPS = 4

// row/col counts for a given piece count. Only 6 is used today (a 2x3 grid reads well on a
// portrait phone screen), but a puzzle with a different piece count is just another entry here.
const LAYOUTS = {
  4: {rows: 2, cols: 2},
  6: {rows: 2, cols: 3},
  9: {rows: 3, cols: 3},
}

export const layoutFor = (pieceCount) => {
  const layout = LAYOUTS[pieceCount]
  if (!layout) {
    throw new Error(`No grid layout defined for a ${pieceCount}-piece puzzle`)
  }
  return layout
}

const shuffled = (array, random) => {
  const copy = array.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// The starting state: every piece unplaced, in a shuffled tray order, each at a random rotation
// (so the puzzle is never already solved). `random` is injectable for deterministic tests.
// `layout` overrides the default grid for `pieceCount` (e.g. {rows: 3, cols: 2} for portrait art
// on a 6-piece puzzle, instead of the default landscape 2x3) — same piece count, different shape.
export const createPuzzle = (pieceCount, random = Math.random, layout = null) => {
  const {rows, cols} = layout || layoutFor(pieceCount)
  const pieces = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      pieces.push({id: pieces.length, homeRow: row, homeCol: col, row: null, col: null, rotation: 0})
    }
  }
  pieces.forEach((p) => { p.rotation = Math.floor(random() * ROTATION_STEPS) })
  return {rows, cols, pieces, trayOrder: shuffled(pieces.map((p) => p.id), random)}
}

const findPiece = (pieces, id) => {
  const piece = pieces.find((p) => p.id === id)
  if (!piece) {
    throw new Error(`No piece with id ${id}`)
  }
  return piece
}

export const isPieceCorrect = (piece) => piece.row === piece.homeRow && piece.col === piece.homeCol && piece.rotation === 0

export const isSolved = (pieces) => pieces.every(isPieceCorrect)

// Turns piece `id` a quarter turn; `direction` is +1 (clockwise / "right") or -1 ("left").
export const rotatePiece = (pieces, id, direction) => {
  const piece = findPiece(pieces, id)
  piece.rotation = (piece.rotation + direction + ROTATION_STEPS) % ROTATION_STEPS
}

// Whatever piece currently sits at (row, col) on the board, or null.
const pieceAt = (pieces, row, col) => pieces.find((p) => p.row === row && p.col === col) || null

// Call when a drag ends. (dropXFrac, dropYFrac) is where the piece's centre was let go, as a
// fraction (0..1) of the board's own width/height — fractions rather than pixels so the same
// call works whatever size the board is drawn at. Finds the nearest grid slot; if the piece's
// centre landed within `snapRatio` of that slot's centre (as a fraction of the board width, so
// snapping feels the same however the puzzle is sized), it is placed there — bumping whatever
// piece already occupied that slot back to the tray, if any. Otherwise the piece is left
// unplaced (the tray). Returns {snapped, row, col, displacedId}.
export const resolveDrop = (pieces, id, dropXFrac, dropYFrac, rows, cols, snapRatio) => {
  const piece = findPiece(pieces, id)
  const col = Math.min(cols - 1, Math.max(0, Math.round(dropXFrac * cols - 0.5)))
  const row = Math.min(rows - 1, Math.max(0, Math.round(dropYFrac * rows - 0.5)))
  const slotCenterX = (col + 0.5) / cols
  const slotCenterY = (row + 0.5) / rows
  const distance = Math.hypot(dropXFrac - slotCenterX, (dropYFrac - slotCenterY) * (cols / rows))
  if (distance > snapRatio) {
    piece.row = null
    piece.col = null
    return {snapped: false, row: null, col: null, displacedId: null}
  }
  const occupant = pieceAt(pieces, row, col)
  const displacedId = occupant && occupant.id !== id ? occupant.id : null
  if (displacedId !== null) {
    occupant.row = null
    occupant.col = null
  }
  piece.row = row
  piece.col = col
  return {snapped: true, row, col, displacedId}
}

// The staff bypass: every piece home, upright, solved.
export const solveAll = (pieces) => {
  pieces.forEach((p) => { p.row = p.homeRow; p.col = p.homeCol; p.rotation = 0 })
}

// A plain snapshot safe to hand to localStorage (see puzzle.js) — just the fields that matter
// for resuming, not the home position (createPuzzle always rebuilds that the same way for a
// given piece count).
export const toSaved = (pieces) => pieces.map((p) => ({id: p.id, row: p.row, col: p.col, rotation: p.rotation}))

// Applies a saved snapshot from toSaved() onto a freshly created puzzle's pieces (matched by id).
// Ignores anything that doesn't look right (wrong length, bad ids, a position outside the
// CURRENT `rows`/`cols`) rather than throwing — a corrupted or stale save (e.g. from before the
// grid's shape changed, so an old column no longer exists) should be treated as no save, not
// break the puzzle.
export const applySaved = (pieces, saved, rows, cols) => {
  if (!Array.isArray(saved) || saved.length !== pieces.length) {
    return false
  }
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const inBounds = (value, max) => value === null || (Number.isInteger(value) && value >= 0 && value < max)
  for (const entry of saved) {
    const piece = byId.get(entry.id)
    if (!piece || !Number.isInteger(entry.rotation) || !inBounds(entry.row, rows) || !inBounds(entry.col, cols)) {
      return false
    }
  }
  saved.forEach((entry) => {
    const piece = byId.get(entry.id)
    piece.row = entry.row
    piece.col = entry.col
    piece.rotation = ((entry.rotation % ROTATION_STEPS) + ROTATION_STEPS) % ROTATION_STEPS
  })
  return true
}
