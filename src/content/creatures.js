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
//   pulse      how much it "breathes" (heartbeat scale pulse), a share of its size (default 0 = still, e.g. 0.05 for a ±5% beat)
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
//   walkAnim   the clip to loop while it moves out from behind something: its stone wall (the
//               scanner's lock style), an object it walks round or a wall (see showcase.js).
//               Optional: without one it glides out.
// A placement in an exhibit can override any of these for that one exhibit.

export const CREATURES = {
  // Test model from the artist, rigged by Mixamo (65 bones) with its Thriller Idle clip, named Idle.
  // It faces +z (the Mixamo rig's front), so no yaw; its height is measured from the posed vertices.
  granny: {file: 'Granny.glb', targetHeight: 0.5, phase: 0, hover: 0, bob: 0, hop: false},
  // Test model from the artist. The eyes on its sheet look the model's -z way (its back), so it is turned
  // round to face the visitor. Its clips are baked cloth (shape keys): Idle sways, Fly streams back while it moves out.
  ghost: {file: 'AnotherGhost.glb', targetHeight: 0.5, phase: 0, yaw: Math.PI, hop: false, walkAnim: 'Fly'},
}
