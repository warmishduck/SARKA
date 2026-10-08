// The jigsaw puzzle mini-game: cuts a 2D image into pieces the visitor drags into a grid and
// rotates upright, backed by the rules in puzzle-logic.js (see that file for what "correct"
// means). A 2D DOM overlay, not three.js — it sits on top of the AR canvas, not inside the AR
// scene, so ordinary touch/pointer events are all it needs.
//
// config (from a creature's `puzzle` field, content/creatures.js):
//   pieces      how many pieces (default 6 — a 2x3 grid; see puzzle-logic.js's layouts)
//   snapRatio   how close a drop must land to a slot's centre to snap there, as a fraction of
//               the board's width (default 0.15, i.e. 15%)
//   hintMs      how long without any touch before one unplaced piece's home slot pulses
//               (default 15000)
//   art         a URL to the 2D art to cut up, or omit it to use a generated placeholder
//   label       shown on the placeholder art (and read by the hint); the creature's own name
//   hue         placeholder art's colour, 0-360 (ignored once real art exists)
//   creatureId  used (with the site's folder) as the localStorage key so progress on this
//               creature survives a revisit
import {MiniGame} from './base.js'
import {TEXT} from '../i18n.js'
import {makePlaceholderArt} from './placeholder-art.js'
import {rememberStaffUnlocked, STAFF_PASSWORD, staffUnlocked} from '../staff.js'
import {
  applySaved, createPuzzle, isPieceCorrect, isSolved, resolveDrop, rotatePiece, solveAll, toSaved,
} from './puzzle-logic.js'

const LONG_PRESS_MS = 1500
const LONG_PRESS_MOVE_TOLERANCE = 12   // px of finger drift still counted as "holding still"
const SOLVED_FLOURISH_MS = 500

// localStorage is shared by every site on the same host (all of someone.github.io), so progress
// is keyed by the site's folder too: a preview deployed next to the live site must not pick up
// (or overwrite) the live site's half-finished puzzles.
const sitePath = () => location.pathname.replace(/[^/]*$/, '')
const saveKey = (creatureId) => `lumina-puzzle-save:${sitePath()}:${creatureId}`

const loadSave = (creatureId) => {
  try {
    const raw = localStorage.getItem(saveKey(creatureId))
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null   // private mode, storage disabled, or a corrupted value: play as if unsaved
  }
}
const persistSave = (creatureId, pieces) => {
  try {
    localStorage.setItem(saveKey(creatureId), JSON.stringify(toSaved(pieces)))
  } catch (e) {
    // Not saved this time; the puzzle still works for the rest of the visit.
  }
}
const clearSave = (creatureId) => {
  try {
    localStorage.removeItem(saveKey(creatureId))
  } catch (e) {
    // Nothing to do: either it wasn't there or storage is unavailable either way.
  }
}

const make = (tag, className, props) => Object.assign(document.createElement(tag), {className}, props)

// A three-quarter circle ending in an arrowhead, turning clockwise. The "rotate left" button
// shows the same icon mirrored (CSS), so the two can never disagree about direction.
const ROTATE_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path d="M17.5 35.26 A13 13 0 1 1 35.26 30.5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
  <path d="M40.9 33.8 L29.6 27.3 L31.8 36.6 Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path d="M24 20 L25.3 22.7 L28 24 L25.3 25.3 L24 28 L22.7 25.3 L20 24 L22.7 22.7 Z" fill="rgba(150,170,220,0.75)"/>
</svg>`

// Loads `url` as a drawable image. Resolves to a generated placeholder instead if `url` is
// missing, or if it fails to load (a typo'd path must not brick the puzzle). `source` can also
// already be a drawable (a <canvas>, e.g. from creature-snapshot.js) instead of a URL to fetch —
// it's used as-is.
const loadArt = (source, label, hue) => new Promise((resolve) => {
  if (!source) {
    resolve(makePlaceholderArt(label, {hue}))
    return
  }
  if (typeof source !== 'string') {
    resolve(source)
    return
  }
  const img = new Image()
  // No crossOrigin here: every real `art` file is served from this same site (src/assets/), and
  // setting crossOrigin on a same-origin image can mark it "tainted" for canvas use if the
  // response happens to lack CORS headers (which a plain static host has no reason to send for
  // its own assets) — buildPieces()'s drawImage() would then throw and leave the puzzle empty.
  img.onload = () => resolve(img)
  img.onerror = () => {
    console.warn(`Puzzle art failed to load (${source}); using a placeholder instead`)
    resolve(makePlaceholderArt(label, {hue}))
  }
  img.src = source
})

export default class PuzzleGame extends MiniGame {
  start() {
    const {
      pieces: pieceCount = 6, snapRatio = 0.15, hintMs = 15000,
      art = null, label = '', hue = 120, creatureId = 'creature', rows: rowsOverride, cols: colsOverride,
    } = this.config
    this.creatureId = creatureId
    this.snapRatio = snapRatio
    this.hintMs = hintMs
    this.destroyed = false
    this.solved = false
    this.hintTimer = null
    this.hintedSlotEl = null
    this.longPressTimer = null
    this.nudgeTimer = null
    this.selectedId = null
    this.activeDrags = 0
    this.dragCleanups = []

    const layout = rowsOverride && colsOverride ? {rows: rowsOverride, cols: colsOverride} : null
    const {rows, cols, pieces} = createPuzzle(pieceCount, Math.random, layout)
    this.rows = rows
    this.cols = cols
    this.pieces = pieces
    // A no-op (returns false) if there's no save, or it doesn't fit this grid (e.g. left over
    // from before the layout changed shape — see applySaved's own comment).
    applySaved(pieces, loadSave(creatureId), rows, cols)

    this.buildShell()
    loadArt(art, label, hue).then((source) => {
      if (this.destroyed) {
        return
      }
      this.source = source
      try {
        try {
          this.buildPieces()
        } catch (e) {
          // Drawing the real art into a piece canvas failed (a tainted canvas from an
          // unexpected CORS situation, say) — never leave the puzzle showing an empty board
          // over this; fall back to the placeholder, which never touches a loaded image.
          console.warn('Could not draw the puzzle art onto its pieces; falling back to the placeholder', e)
          this.source = makePlaceholderArt(label, {hue})
          this.buildPieces()
        }
        this.layoutTray()
        const allPlacedAtStart = this.pieces.every((p) => p.row !== null)
        const firstWrong = this.pieces.find((p) => !isPieceCorrect(p))
        // Pre-select only when the board is already populated (restored save); for a fresh puzzle
        // no piece is selected until the user places something.
        this.selectPiece(allPlacedAtStart && firstWrong ? firstWrong.id : null)
        if (isSolved(this.pieces)) {
          // A returning visitor who had already finished it: nothing to show them solving.
          this.finish(false)
        } else {
          // Show rotation feedback immediately if a save was restored with pieces already on the
          // board — without this the visitor would see a "done" board with no signal to rotate.
          this.updateRotationFeedback()
          if (allPlacedAtStart && firstWrong) {
            this.nudgeRotateButtons()
          }
          this.resetHintTimer()
        }
      } catch (e) {
        // Something broke that even the placeholder fallback couldn't route around. Show it
        // in the puzzle itself rather than a silent empty board — this can be read straight off
        // a phone screen with no devtools, which is the whole point on a museum floor.
        console.error('Puzzle failed to build', e)
        this.showError(`${e.name || 'Error'}: ${e.message || e}`)
      }
    }, (e) => {
      console.error('Puzzle art failed to load', e)
      this.showError(`${e && e.name || 'Error'}: ${e && e.message || e}`)
    })

    this.bindStaffBypass()
    this.maybeStaffAutoSolve()
  }

  // Puts a plain, readable error message on top of the puzzle's own DOM — for a failure so bad
  // even the placeholder-art fallback didn't route around it. There is no devtools on a museum
  // floor; this can be read (and photographed) straight off the phone that hit it.
  showError(message) {
    const banner = make('div', 'puzzle-error', {textContent: message})
    this.stage.appendChild(banner)
  }

  // The static parts of the DOM: the scrim, the board's slot outlines, the tray. Pieces are
  // added once the art has finished loading (buildPieces), since a piece needs it to draw itself.
  buildShell() {
    const stage = make('div', 'puzzle-stage')
    this.stage = stage
    // iOS can still pan or rubber-band the page under a finger even with touch-action:none, which
    // looks like the whole window sliding away mid-drag; cancelling touchmove while a piece is
    // held stops that. Only during a drag, so the tray can still be scrolled.
    stage.addEventListener('touchmove', (event) => {
      if (this.activeDrags > 0) {
        event.preventDefault()
      }
    }, {passive: false})

    const board = make('div', 'puzzle-board')
    board.style.aspectRatio = `${this.cols} / ${this.rows}`
    // Cap the board's height so it can't eat the whole screen and leave the tray crammed off the
    // bottom (portrait art is tall): at most ~46% of the viewport, or whatever the 88vw width cap
    // allows, whichever is smaller. Setting a definite height also gives aspect-ratio something to
    // derive the width from (an empty fr grid has no intrinsic size of its own).
    board.style.height = `min(46dvh, calc(88vw * ${this.rows / this.cols}))`
    this.board = board
    this.slotEls = []
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const slot = make('div', 'puzzle-slot')
        slot.style.gridRow = String(row + 1)
        slot.style.gridColumn = String(col + 1)
        board.appendChild(slot)
        this.slotEls.push({row, col, el: slot})
      }
    }
    board.style.gridTemplateRows = `repeat(${this.rows}, 1fr)`
    board.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`

    const tray = make('div', 'puzzle-tray')
    this.tray = tray

    // An unmarked corner the spec's "long-press on a corner" staff bypass lives on — no visible
    // hint that it's there, on purpose.
    const corner = make('div', 'puzzle-staff-corner')
    this.cornerEl = corner

    // One pair of big turn buttons for whichever piece is selected (the last one touched),
    // instead of tiny buttons on every piece: they stay put and upright however the piece is
    // turned, so which way each one spins is always obvious.
    const rotator = make('div', 'puzzle-rotator')
    this.rotateButtons = [this.makeRotateButton(-1), this.makeRotateButton(1)]
    rotator.append(...this.rotateButtons)

    stage.append(board, tray, rotator, corner)
    this.root.appendChild(stage)
  }

  makeRotateButton(direction) {
    const clockwise = direction > 0
    const label = clockwise ? TEXT.rotateRight : TEXT.rotateLeft
    const button = make('button', `puzzle-rotate-btn ${clockwise ? 'is-right' : 'is-left'}`, {type: 'button'})
    button.setAttribute('aria-label', label)
    const disc = make('span', 'puzzle-rotate-disc')
    disc.innerHTML = ROTATE_ICON
    button.append(disc, make('span', 'puzzle-rotate-label', {textContent: label}))
    button.addEventListener('click', () => {
      if (this.selectedId !== null) {
        this.rotate(this.selectedId, direction)
      }
    })
    return button
  }

  // Marks `pieceId` as the piece the turn buttons act on, and shows which one it is.
  selectPiece(pieceId) {
    if (this.selectedId !== null && this.pieceEls[this.selectedId]) {
      this.pieceEls[this.selectedId].classList.remove('is-selected')
    }
    this.selectedId = pieceId
    if (pieceId !== null) {
      // is-selected takes visual priority over is-needs-rotation (both use outline, selected wins)
      this.pieceEls[pieceId].classList.add('is-selected')
    }
  }

  slotEl(row, col) {
    return this.slotEls.find((s) => s.row === row && s.col === col).el
  }

  // Cuts `this.source` into one <canvas> per piece and makes each a draggable, rotatable element.
  buildPieces() {
    const sw = this.source.width || this.source.naturalWidth
    const sh = this.source.height || this.source.naturalHeight
    const pw = sw / this.cols
    const ph = sh / this.rows

    this.pieceEls = {}
    this.angles = {}
    this.pieces.forEach((piece) => {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 160 * (ph / pw)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(this.source, piece.homeCol * pw, piece.homeRow * ph, pw, ph, 0, 0, canvas.width, canvas.height)

      const el = make('div', 'puzzle-piece')
      el.dataset.pieceId = String(piece.id)
      el.setAttribute('role', 'img')
      el.setAttribute('aria-label', `Puzzle piece ${piece.id + 1}`)
      el.appendChild(canvas)

      this.bindDrag(el, piece.id)
      this.pieceEls[piece.id] = el
      this.applyRotation(piece)
    })
  }

  // Sets the piece's on-screen turn. `turned` is the quarter turn just made (+1 / -1): it is added
  // to a running angle, so the CSS transition spins the short, visible way (going from 270deg to
  // 0deg would otherwise swing three quarters backwards). Omitted: jump straight to the piece's
  // own rotation (the first draw, or one restored from a save).
  applyRotation(piece, turned = null) {
    const angle = turned === null ? piece.rotation * 90 : this.angles[piece.id] + turned * 90
    this.angles[piece.id] = angle
    this.pieceEls[piece.id].style.transform = `rotate(${angle}deg)`
  }

  // Places every currently-unplaced piece into the tray (normal document flow — the browser
  // wraps them, no manual layout needed) and every placed piece onto its board slot.
  layoutTray() {
    this.pieces.forEach((piece) => {
      const el = this.pieceEls[piece.id]
      if (piece.row === null) {
        el.classList.remove('is-placed')
        el.style.position = ''
        el.style.left = ''
        el.style.top = ''
        el.style.width = ''
        el.style.height = ''
        this.tray.appendChild(el)
      } else {
        this.placeOnBoard(el, piece.row, piece.col, true)
      }
    })
  }

  // Positions `el` to exactly cover board slot (row, col), absolutely within the stage.
  placeOnBoard(el, row, col, immediate) {
    const slot = this.slotEl(row, col)
    const stageRect = this.stage.getBoundingClientRect()
    const slotRect = slot.getBoundingClientRect()
    el.classList.add('is-placed')
    if (immediate) {
      el.classList.add('is-not-animated')
    }
    el.style.position = 'absolute'
    el.style.left = `${slotRect.left - stageRect.left}px`
    el.style.top = `${slotRect.top - stageRect.top}px`
    el.style.width = `${slotRect.width}px`
    el.style.height = `${slotRect.height}px`
    this.stage.appendChild(el)   // re-parented from the tray; absolute position keeps it visually in place
    if (immediate) {
      // Force layout so the position above applies before re-enabling the snap transition,
      // or the piece would visibly animate in from wherever it happened to sit before.
      void el.offsetWidth
      el.classList.remove('is-not-animated')
    }
  }

  // Pointer handling for one piece: press to pick it up (however it's currently laid out —
  // tray flow or already on the board), drag to follow the finger, release to resolve a drop.
  // The move/up listeners sit on `window` for the length of the gesture rather than on the piece:
  // they keep working whatever the finger is over, so a drag never depends on pointer capture
  // surviving. (It used not to: re-inserting the piece into the stage after capturing the pointer
  // released the capture, and the piece then stuck to where it was picked up.) touch-action:none
  // (in CSS) and the touchmove guard in buildShell keep the page from scrolling underneath.
  bindDrag(el, pieceId) {
    let active = null   // {pointerId, offsetX, offsetY} while this piece is being dragged

    const onMove = (event) => {
      if (!active || event.pointerId !== active.pointerId) {
        return
      }
      const stageRect = this.stage.getBoundingClientRect()
      el.style.left = `${event.clientX - stageRect.left - active.offsetX}px`
      el.style.top = `${event.clientY - stageRect.top - active.offsetY}px`
    }
    const stopListening = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    const onUp = (event) => {
      if (!active || event.pointerId !== active.pointerId) {
        return
      }
      const {pointerId} = active
      active = null
      this.activeDrags--
      stopListening()
      el.classList.remove('is-dragging', 'is-not-animated')
      el.style.zIndex = ''
      try {
        el.releasePointerCapture(pointerId)
      } catch (e) {
        // Capture was never taken or is already gone — fine either way.
      }
      this.drop(pieceId, el)
      this.registerActivity()
    }
    const onDown = (event) => {
      if (active || (event.button !== undefined && event.button !== 0)) {
        return
      }
      this.selectPiece(pieceId)
      el.classList.add('is-dragging', 'is-not-animated')
      const rect = el.getBoundingClientRect()
      const stageRect = this.stage.getBoundingClientRect()
      // Pick it up without a jump: keep the same offset between the finger and the piece's
      // top-left corner that it started at.
      active = {pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top}
      this.activeDrags++
      el.classList.add('is-placed')   // now positioned absolutely regardless of where it came from
      el.style.position = 'absolute'
      el.style.left = `${rect.left - stageRect.left}px`
      el.style.top = `${rect.top - stageRect.top}px`
      el.style.width = `${rect.width}px`
      el.style.height = `${rect.height}px`
      // Only a piece leaving the tray changes parent. Re-inserting one that is already in the
      // stage would pull it out of the document for a moment, which ends a pointer capture.
      if (el.parentNode !== this.stage) {
        this.stage.appendChild(el)
      }
      el.style.zIndex = '10'
      try {
        el.setPointerCapture(event.pointerId)
      } catch (e) {
        // No active pointer with this id (a synthetic event in a test): the window listeners
        // below still follow the drag.
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      this.registerActivity()
    }

    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', onDown)
    this.dragCleanups.push(stopListening)
  }

  // Where a piece's centre now sits, as a fraction of the board's own width/height — the
  // coordinate space resolveDrop() works in.
  centreFraction(el) {
    const boardRect = this.board.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    return {x: (cx - boardRect.left) / boardRect.width, y: (cy - boardRect.top) / boardRect.height}
  }

  drop(pieceId, el) {
    const wasInTray = this.pieces.find((p) => p.id === pieceId)?.row === null
    const {x, y} = this.centreFraction(el)
    const result = resolveDrop(this.pieces, pieceId, x, y, this.rows, this.cols, this.snapRatio)
    if (result.snapped) {
      this.placeOnBoard(el, result.row, result.col, false)
      if (result.displacedId !== null) {
        this.layoutTray()   // easiest correct way to put the bumped piece back into the tray's flow
      }
    } else {
      el.classList.remove('is-placed')
      el.style.position = ''
      el.style.left = ''
      el.style.top = ''
      el.style.width = ''
      el.style.height = ''
      this.tray.appendChild(el)
    }
    persistSave(this.creatureId, this.pieces)
    if (isSolved(this.pieces)) {
      this.finish(true)
    } else {
      this.updateRotationFeedback()
      // Only auto-select when the very last piece just landed — that's the "aha" moment.
      // For any other drop (re-drop of an already-placed piece, a tap to select it), keep
      // whatever selectPiece(pieceId) set in onDown — overriding it would make the user
      // unable to choose which piece to rotate.
      const allNowPlaced = this.pieces.every((p) => p.row !== null)
      if (wasInTray && allNowPlaced) {
        const firstWrong = this.pieces.find((p) => !isPieceCorrect(p))
        if (firstWrong) {
          this.selectPiece(firstWrong.id)
          this.nudgeRotateButtons()
        }
      }
    }
  }

  rotate(pieceId, direction) {
    rotatePiece(this.pieces, pieceId, direction)
    const piece = this.pieces.find((p) => p.id === pieceId)
    this.applyRotation(piece, direction)
    persistSave(this.creatureId, this.pieces)
    this.registerActivity()
    if (isSolved(this.pieces)) {
      this.finish(true)
    } else {
      this.updateRotationFeedback()
      // If the piece we just fixed is now correct, advance to the next wrong one so the
      // user doesn't have to tap again to move on.
      if (isPieceCorrect(piece)) {
        const nextWrong = this.pieces.find((p) => !isPieceCorrect(p))
        this.selectPiece(nextWrong ? nextWrong.id : null)
        if (nextWrong) {
          this.nudgeRotateButtons()
        }
      }
    }
  }

  nudgeRotateButtons() {
    this.rotateButtons.forEach((btn) => btn.classList.add('is-nudge'))
    clearTimeout(this.nudgeTimer)
    this.nudgeTimer = setTimeout(() => {
      this.rotateButtons.forEach((btn) => btn.classList.remove('is-nudge'))
    }, 600)
  }

  updateRotationFeedback() {
    // No-op — orange "needs rotation" hint removed; gold selection border is enough.
  }

  // ---- the 15-second idle hint ----
  registerActivity() {
    this.clearHint()
    this.resetHintTimer()
  }
  resetHintTimer() {
    clearTimeout(this.hintTimer)
    if (this.solved) {
      return
    }
    this.hintTimer = setTimeout(() => this.showHint(), this.hintMs)
  }
  clearHint() {
    if (this.hintedSlotEl) {
      this.hintedSlotEl.classList.remove('is-hinting')
      this.hintedSlotEl = null
    }
  }
  showHint() {
    if (this.solved) {
      return
    }
    // Prefer a piece still sitting in the tray; if everything happens to be placed but wrong
    // (e.g. two pieces swapped), fall back to any incorrect one.
    const target = this.pieces.find((p) => p.row === null) || this.pieces.find((p) => !isPieceCorrect(p))
    if (!target) {
      return
    }
    this.hintedSlotEl = this.slotEl(target.homeRow, target.homeCol)
    this.hintedSlotEl.classList.add('is-hinting')
    this.resetHintTimer()   // keeps gently pulsing a (possibly different) slot until solved
  }

  // ---- staff bypass ----
  bindStaffBypass() {
    let pressStart = null
    const cancel = () => { clearTimeout(this.longPressTimer); this.longPressTimer = null; pressStart = null }
    this.cornerEl.addEventListener('pointerdown', (event) => {
      pressStart = {x: event.clientX, y: event.clientY}
      this.longPressTimer = setTimeout(() => { pressStart = null; this.promptStaff() }, LONG_PRESS_MS)
    })
    this.cornerEl.addEventListener('pointermove', (event) => {
      if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > LONG_PRESS_MOVE_TOLERANCE) {
        cancel()
      }
    })
    this.cornerEl.addEventListener('pointerup', cancel)
    this.cornerEl.addEventListener('pointercancel', cancel)
  }

  // `?staff=1` in the address, with this browser already having entered the password this visit,
  // solves the puzzle immediately with no prompt at all.
  maybeStaffAutoSolve() {
    const staffRequested = new URLSearchParams(location.search).get('staff') === '1'
    if (staffRequested && staffUnlocked()) {
      solveAll(this.pieces)
      persistSave(this.creatureId, this.pieces)
      this.finish(false)
    } else if (staffRequested) {
      this.promptStaff()
    }
  }

  promptStaff() {
    if (this.solved) {
      return
    }
    const overlay = make('div', 'puzzle-staff-prompt')
    const card = make('div', 'puzzle-staff-card')
    const input = make('input', 'puzzle-staff-input', {type: 'password', placeholder: 'Staff password', autocomplete: 'off'})
    const error = make('div', 'puzzle-staff-error', {textContent: ' '})
    const buttons = make('div', 'puzzle-staff-buttons')
    const ok = make('button', 'puzzle-staff-ok', {type: 'button', textContent: 'OK'})
    const cancel = make('button', 'puzzle-staff-cancel', {type: 'button', textContent: 'Cancel'})
    buttons.append(cancel, ok)
    card.append(input, error, buttons)
    overlay.appendChild(card)
    this.stage.appendChild(overlay)
    input.focus()

    const close = () => overlay.remove()
    const submit = () => {
      if (input.value === STAFF_PASSWORD) {
        rememberStaffUnlocked()
        close()
        solveAll(this.pieces)
        persistSave(this.creatureId, this.pieces)
        this.finish(false)
      } else {
        error.textContent = 'Wrong password'
        input.value = ''
        input.focus()
      }
    }
    ok.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() })
    cancel.addEventListener('click', close)
  }

  // ---- winning ----
  // `withFlourish` is false when the puzzle was already solved on arrival (a returning visitor,
  // or the staff bypass): nothing to animate, just call onWin.
  finish(withFlourish) {
    this.solved = true
    this.rotateButtons.forEach((button) => { button.disabled = true })
    clearTimeout(this.hintTimer)
    this.clearHint()
    clearSave(this.creatureId)   // a solved creature reverts to a fresh puzzle if ever reset
    if (!withFlourish) {
      this.onWin()
      return
    }
    Object.values(this.pieceEls).forEach((el) => el.classList.add('is-solved'))
    setTimeout(() => this.onWin(), SOLVED_FLOURISH_MS)
  }

  destroy() {
    this.destroyed = true
    clearTimeout(this.hintTimer)
    clearTimeout(this.longPressTimer)
    clearTimeout(this.nudgeTimer)
    this.dragCleanups.forEach((stopListening) => stopListening())
    this.stage.remove()
  }
}
