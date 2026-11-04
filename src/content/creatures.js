// The creatures: one entry per kind of creature, reused by every exhibit that shows it. This is
// plain data (no imports), so it can be checked in Node (`npm test`). An exhibit says where a
// creature stands (see exhibits.js); this says what it is and how it behaves.
//
// Every entry needs:
//   file          the model, a .glb in src/assets/ (found by name, see models.js)
//   targetHeight  how tall it is scaled to be, in the scene's units
// Optional:
//   phase      offset for its idle bob and heartbeat pulse, so creatures don't move in lockstep
//   yaw        starting rotation about the vertical axis, in radians
//   spinSpeed  turntable spin in rad/s (default 0: it just faces the viewer)
//   hover/bob  how high it floats above the floor and how much it bobs (defaults 0.08/0.05)
//   pulse      how much it "breathes" (heartbeat scale pulse), a share of its size (default 0.05; 0 = still)
//   hop        set false to skip the tap-triggered hop
//   hopSound   sound to play with the hop (names are in sound.js)
//   reactions  built-in clips to play on tap, each with the sound that goes with it. They come
//              out in a shuffled order, then it eases back to its 'Idle' clip. `repeat` loops
//              a short clip. Once a creature has a `puzzle` (below), these become what tapping
//              it does AFTER it wakes — before that, tapping it opens the puzzle instead.
//   glow       tapping toggles a glow instead
//   puzzle     if set, the creature stands locked (a dark silhouette) until this puzzle is
//               solved: {pieces, rows, cols, snapRatio, hintMs, art, label, hue} — see
//               src/minigames/puzzle.js for what each one does. `art` is a file in src/assets/
//               (found by name like `file`, via models.js's artUrl) — a portrait image cut into
//               a `rows` x `cols` grid; leave it out to use a generated placeholder (a real
//               rendered snapshot of the model, see creature-snapshot.js) until real 2D art exists.
//   unlockAnim the clip to play once, in full, the moment the puzzle is solved (its "waking up"
//               animation) before settling into its `reactions`. Optional: without one it still
//               unlocks, just with no dedicated animation for the moment itself.
//   walkAnim   the clip to loop while it walks out from behind its wall (the scanner's lock
//               style, see showcase.js). Optional: without one it glides out.
// A placement in an exhibit can override any of these for that one exhibit.

export const CREATURES = {
  acorn: {
    file: 'Acorn.glb', targetHeight: 0.85, phase: 0, yaw: 0.3, hover: 0, bob: 0, hop: false,
    reactions: [
      {clip: 'Jump', sound: 'boing'},
      {clip: 'Ouch', sound: 'squeak'},
      {clip: 'PickUp', sound: 'plink'},
      {clip: 'PickThrow', sound: 'whoosh'},
      {clip: 'Run', repeat: 3, sound: 'patter'},
    ],
    // `Jump` stands in for a proper wake animation until one exists.
    puzzle: {pieces: 6, rows: 3, cols: 2, snapRatio: 0.15, hintMs: 15000, art: 'Acorn-art.webp', label: 'Acorn'},
    unlockAnim: 'Jump',
    walkAnim: 'Run',
  },
  pinecone: {
    file: 'Pinecone.glb', targetHeight: 0.8, phase: Math.PI / 2, spinSpeed: -0.6, hopSound: 'pop',
    puzzle: {pieces: 6, rows: 3, cols: 2, snapRatio: 0.15, hintMs: 15000, art: 'Pinecone-art.png', label: 'Pinecone'},
    // No unlockAnim: the model has no clip of its own, just the idle bob/pulse. It still
    // unlocks fine — a spark and its wake sound, then a short hold before going idle.
  },
  glowcap: {
    file: 'Glowcap.glb', targetHeight: 0.55, phase: Math.PI, spinSpeed: -0.5, hop: false, glow: true,
    puzzle: {pieces: 6, rows: 3, cols: 2, snapRatio: 0.15, hintMs: 15000, art: 'Glowcap-art.png', label: 'Glowcap'},
  },
  // Test model from the artist (no clips, no rig): floats and bobs like the others.
  ghost: {file: 'AnotherGhost.glb', targetHeight: 0.5, phase: 0, hop: false},
}
