// The creature showcase: a set of creatures standing in a scene, each loaded from its model,
// kept animated (idle bob, heartbeat pulse, turntable spin, skeletal clips), and reacting when
// tapped in whatever way its entry in content/creatures.js describes (the pinecone hops, the
// acorn plays one of its animations, the glowcap lights up). Used by the AR view and by the
// welcome page, so neither needs its own copy of any of this.
import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

import {CREATURES} from './content/creatures.js'
import {snapshotCreature} from './creature-snapshot.js'
import {createGlow, updateGlow} from './glow'
import {loadMiniGame} from './minigames/registry.js'
import {artUrl, modelUrl} from './models'
import {measureModel, pinRootHorizontally} from './rig'
import {playSound} from './sound'
import {createSparkBurst} from './spark'
import {createStoneWall} from './stone-wall'

const BPM = 70                 // "heartbeat" rate for the idle pulse animation
const JUMP_DURATION = 0.45     // seconds a tap-triggered hop takes, start to finish
const JUMP_HEIGHT = 0.35       // how high a tapped character hops
const HIT_BOX_EXTRA_HEIGHT = 0.4  // headroom above an animated character that still counts as a hit
const SILHOUETTE_COLOR = 0x0a0d0a
const SILHOUETTE_OPACITY = 0.55
const UNLOCK_FALLBACK_MS = 900   // how long to hold before going idle when there's no unlockAnim
// lockStyle 'wall', as shares of the creature's height: the wall's size, how far its centre stands
// behind the creature's spot, and how far behind that spot the creature waits.
const WALL = {width: 1.0, height: 1.1, depth: 0.14, behind: 0.4}
const WAIT_BEHIND = 0.85
const WALK_SECONDS = 1.3
const SINK_SECONDS = 1.4
const DUST_COLOR = 0xc9b8a0

// Returns a copy of `array` in random order (Fisher-Yates).
const shuffled = (array) => {
  const copy = array.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = copy[i]
    copy[i] = copy[j]
    copy[j] = swap
  }
  return copy
}

// `placements` is a list like [{id: 'acorn', x, z, ...overrides}] (see content/exhibits.js).
// `glowLight` is the shared point light the glowcap's glow drives. `onProgress(done, total)` is
// called as each model finishes loading (or fails to). `puzzlesEnabled` is false for the welcome
// page's preview: it always shows creatures awake, never gated behind their puzzle, since it is
// meant to be a glimpse of what is inside, not a copy of the exhibit. `lockStyle` is how a
// creature still behind its puzzle looks: 'silhouette' (a dark stand-in where it stands) or
// 'wall' (hidden behind a stone wall; tapping the wall opens the puzzle, and once it is solved
// the wall sinks into the floor and the creature walks out).
export const createShowcase = ({
  placements, glowLight, onProgress = () => {}, puzzlesEnabled = true, lockStyle = 'silhouette',
}) => {
  // Each item is a creature's own settings with this placement's overrides on top.
  const items = placements.map((placement) => ({...CREATURES[placement.id], ...placement}))

  // Each item's animated container, populated by load(). Parallel to `items`.
  const groups = []
  // Elapsed timestamp when an item was last tapped, or null if not hopping.
  const jumpStart = items.map(() => null)
  // Skeletal-animation mixers and clip lists for models that ship with built-in clips (glowcap,
  // acorn), indexed like `items` (not every item has one, so this isn't a flat pushed list).
  const mixerByIndex = items.map(() => null)
  const clipsByIndex = items.map(() => null)
  // Tap-reaction state for items with `reactions` and glow state for items with `glow`
  // (both parallel to `items`, filled in once the model has loaded).
  const reactionStates = items.map(() => null)
  const glows = items.map(() => null)

  // A puzzle-gated item's state: null (no puzzle — always interactive, the old behaviour),
  // 'locked' (a silhouette; tap opens the puzzle), 'opening' (the puzzle module is being
  // fetched/started), 'unlocking' (materials restored, its wake animation is playing), or
  // 'unlocked' (solved: tapping it plays its `reactions` like any other creature).
  const lockState = items.map((item) => (item.puzzle && puzzlesEnabled ? 'locked' : null))
  const silhouetteOriginals = items.map(() => null)   // {node, material}[] to restore on unlock
  const activeGames = items.map(() => null)           // the running MiniGame instance, if any
  const puzzleRoots = items.map(() => null)           // its DOM mount point, if any
  const activeSparks = items.map(() => null)
  const puzzleArt = items.map(() => null)             // an auto-rendered <canvas> portrait, once taken
  const models = items.map(() => null)                // the loaded model, once in
  const homes = items.map(() => null)                 // where it stands once awake (x, 0, z)
  const walls = items.map(() => null)                 // lockStyle 'wall': its stone wall
  const walks = items.map(() => null)                 // {from, elapsed, action} while walking out
  const sinks = items.map(() => null)                 // seconds into its wall's sink (< 0: waiting)
  const dust = items.map(() => null)                  // the puff as its wall starts to sink
  const sunk = items.map(() => false)                 // its wall is gone
  const carryActions = items.map(() => null)          // its walkAnim action while the anchor carries it

  let finished = 0    // how many models have loaded (or failed to)
  let carried = false // the anchor is carrying the creatures along (setMoving)
  let now = 0         // the time of the latest update(), which taps are stamped with
  let active = true   // false while something else has the stage

  // Swaps every mesh's material for a dark, semi-transparent stand-in, keeping the originals to
  // put back on unlock() — a locked creature is a silhouette, not the real thing.
  const applySilhouette = (index, model) => {
    const originals = []
    model.traverse((node) => {
      if (node.isMesh) {
        originals.push({node, material: node.material})
        node.material = new THREE.MeshBasicMaterial({
          color: SILHOUETTE_COLOR, transparent: true, opacity: SILHOUETTE_OPACITY, depthWrite: false,
        })
      }
    })
    silhouetteOriginals[index] = originals
  }
  const restoreMaterials = (index) => {
    const originals = silhouetteOriginals[index]
    if (!originals) {
      return
    }
    originals.forEach(({node, material}) => { node.material = material })
    silhouetteOriginals[index] = null
  }

  // Sets up tap reactions for an animated model: one action per reaction clip, and the way
  // back to the idle loop once a reaction has finished.
  const setupReactions = (index, mixer, idleAction, clips, reactions) => {
    const list = []
    const sounds = []  // parallel to `list`: the sound that goes with each reaction
    reactions.forEach(({clip, repeat, sound}) => {
      const found = THREE.AnimationClip.findByName(clips, clip)
      if (!found) {
        console.warn(`Reaction clip "${clip}" not found in the model`)
        return
      }
      const action = mixer.clipAction(found)
      action.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat || 1)
      action.clampWhenFinished = true  // hold the last pose while easing back to idle
      list.push(action)
      sounds.push(sound)
    })
    if (list.length === 0) {
      return
    }

    // The first tap always plays the first listed reaction (the jump); the rest of that
    // round follows in random order.
    const rest = shuffled(list.map((action, i) => i).slice(1))
    const state = {idle: idleAction, list, sounds, current: null, queue: [0, ...rest], last: -1}
    reactionStates[index] = state
    mixer.addEventListener('finished', (event) => {
      // Ignore clips that were interrupted by a newer tap; only the current one returns to idle.
      if (event.action === state.current) {
        idleAction.reset().play().crossFadeFrom(event.action, 0.4, false)
        state.current = null
      }
    })
  }

  // Picks which reaction plays next. They come out of a shuffled "bag": every reaction
  // plays once before any repeats, so a few taps show all of them (pure random would
  // sometimes take a dozen taps to show one), and never the same one twice in a row.
  const nextReactionIndex = (state) => {
    if (state.queue.length === 0) {
      state.queue = shuffled(state.list.map((action, i) => i))
      if (state.queue.length > 1 && state.queue[0] === state.last) {
        state.queue.push(state.queue.shift())  // don't open a round with the one that just played
      }
    }
    return state.queue.shift()
  }

  // Plays the next reaction. A tap during a reaction interrupts it and blends straight
  // into the next one.
  const playReaction = (index) => {
    const state = reactionStates[index]
    if (!state) {
      return
    }
    const pick = nextReactionIndex(state)
    state.last = pick

    const next = state.list[pick]
    const from = state.current || state.idle
    next.reset().play().crossFadeFrom(from, state.current ? 0.2 : 0.25, false)
    state.current = next
    playSound(state.sounds[pick])
  }

  const modelFinished = () => {
    finished++
    onProgress(finished, items.length)
  }

  // Loads one model into its own group, normalizing scale/footing so it stands on the
  // floor at (x, 0, z) regardless of the source model's original size/pivot.
  const loadItem = (index, scene) => {
    const {file, targetHeight, x, z, yaw = 0, reactions, glow} = items[index]
    const url = modelUrl(file)
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = yaw
    group.visible = active
    scene.add(group)
    groups[index] = group
    homes[index] = new THREE.Vector3(x, 0, z)

    if (lockState[index] && lockStyle === 'wall') {
      const wall = createStoneWall({
        width: targetHeight * WALL.width, height: targetHeight * WALL.height, depth: targetHeight * WALL.depth,
      })
      wall.root.position.set(x, 0, z - targetHeight * WALL.behind)
      wall.root.visible = active
      scene.add(wall.root)
      walls[index] = wall
      // It waits behind the wall, on the line it will walk out along (the way it faces).
      group.position.x -= Math.sin(yaw) * targetHeight * WAIT_BEHIND
      group.position.z -= Math.cos(yaw) * targetHeight * WAIT_BEHIND
    }

    if (reactions || lockState[index]) {
      // An invisible box to tap on. A moving skinned mesh is a poor hit target (its cached
      // bounds are computed once, in one pose, so a jump can leave them). Raycasting ignores
      // `visible`, so this box still catches taps without being drawn. Also what a locked
      // creature (no `reactions` needed yet) is tapped through to open its puzzle.
      const height = targetHeight + HIT_BOX_EXTRA_HEIGHT
      const hitBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.6), new THREE.MeshBasicMaterial())
      hitBox.position.y = height / 2
      hitBox.visible = false
      group.add(hitBox)
    }

    new GLTFLoader().load(
      url,
      (gltf) => {
        const model = gltf.scene
        const clips = gltf.animations
        const idleClip = THREE.AnimationClip.findByName(clips, 'Idle') || clips[0]
        if (reactions) {
          pinRootHorizontally(model, clips, idleClip)
        }

        const {box, mixer} = measureModel(model, idleClip)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())

        const scale = targetHeight / size.y
        model.scale.setScalar(scale)
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true
          }
          if (node.isSkinnedMesh) {
            // three caches the bounding sphere once, from a single pose; once the bones
            // animate, the mesh can drift outside it and get wrongly culled.
            node.frustumCulled = false
          }
        })

        // A puzzle without its own art (content/creatures.js's `puzzle.art`) gets a real picture
        // of this creature instead of the abstract placeholder pattern — much easier to tell
        // apart mid-puzzle. Must happen before group.add(model): the model needs to be an orphan
        // to render into creature-snapshot.js's own scene, and before any silhouette override
        // below, while its materials are still its real ones.
        if (lockState[index] && !items[index].puzzle.art) {
          try {
            puzzleArt[index] = snapshotCreature(model, targetHeight)
          } catch (e) {
            console.warn('Could not render a puzzle-art snapshot; falling back to the placeholder pattern', e)
          }
        }

        group.add(model)
        models[index] = model

        // Animated models come back with a mixer that is already playing their idle clip.
        if (mixer) {
          mixerByIndex[index] = mixer
          clipsByIndex[index] = clips
          if (reactions) {
            setupReactions(index, mixer, mixer.clipAction(idleClip), clips, reactions)
          }
          applyCarried(index)
        }
        if (walls[index]) {
          // Out of sight behind its wall until the puzzle is solved (it may already be, if the
          // model loaded late).
          model.visible = lockState[index] !== 'locked' && lockState[index] !== 'opening'
        } else if (lockState[index]) {
          applySilhouette(index, model)
        }
        if (glow) {
          // The halo/light sizes in createGlow's defaults are metres, sized for this creature's
          // own usual height; scale them the same way an exhibit scaled the creature (see
          // content/exhibits.js's `alone`), or an enlarged glowcap would glow like a normal one.
          const glowScale = targetHeight / CREATURES[items[index].id].targetHeight
          glows[index] = createGlow(group, model, glowLight, {
            haloSize: 1.3 * glowScale, haloY: 0.28 * glowScale, lightY: 0.3 * glowScale, lightDistance: 2.5 * glowScale,
          })
          if (active) {
            glows[index].attachLight()
          }
        }
        modelFinished()
      },
      undefined,
      (err) => {
        console.error(`Failed to load model ${url}:`, err)  // shows up in the phone's console
        modelFinished()  // count it anyway, or the loading note would never go away
      }
    )
  }

  // The moment a puzzle is won: real materials back, a spark burst, its wake sound, and — if it has
  // one — its `unlockAnim` played once before settling into the ordinary idle/tap-reacts-to
  // `reactions` state.
  const wake = (index) => {
    restoreMaterials(index)
    const item = items[index]
    activeSparks[index] = createSparkBurst(groups[index], {radius: item.targetHeight * 0.6})
    playSound('wake')

    const mixer = mixerByIndex[index]
    const clips = clipsByIndex[index]
    const unlockClip = item.unlockAnim && clips && THREE.AnimationClip.findByName(clips, item.unlockAnim)
    const idleAction = reactionStates[index] ? reactionStates[index].idle : null

    if (!unlockClip || !mixer) {
      if (item.unlockAnim) {
        console.warn(`unlockAnim clip "${item.unlockAnim}" not found in the model`)
      }
      setTimeout(() => { lockState[index] = 'unlocked' }, UNLOCK_FALLBACK_MS)
      return
    }
    const action = mixer.clipAction(unlockClip)
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    if (idleAction) {
      action.crossFadeFrom(idleAction, 0.3, false)
    }
    const holdMs = Math.max((unlockClip.duration / (action.timeScale || 1)) * 1000, 300)
    setTimeout(() => {
      if (idleAction) {
        idleAction.reset().play().crossFadeFrom(action, 0.4, false)
      }
      lockState[index] = 'unlocked'
    }, holdMs)
  }

  // lockStyle 'wall', once the puzzle is won: the door flares and the wall shakes, puffs dust and
  // sinks into the floor, uncovering the creature waiting behind it; update() then has it walk
  // out (startWalk) and wake.
  const startSink = (index) => {
    if (models[index]) {
      models[index].visible = true   // still behind the wall: the sinking wall uncovers it
    }
    const wall = walls[index]
    const puff = new THREE.Group()
    puff.position.copy(wall.root.position)
    wall.root.parent.add(puff)
    dust[index] = createSparkBurst(puff, {radius: items[index].targetHeight * 0.5, color: DUST_COLOR})
    playSound('rumble')
    sinks[index] = 0
  }

  // The wall is down: the creature walks to its spot, playing its `walkAnim` if it has one.
  const startWalk = (index) => {
    const item = items[index]
    const mixer = mixerByIndex[index]
    const clips = clipsByIndex[index]
    const walkClip = item.walkAnim && clips && THREE.AnimationClip.findByName(clips, item.walkAnim)
    let action = null
    if (walkClip && mixer) {
      action = mixer.clipAction(walkClip)
      action.reset().setLoop(THREE.LoopRepeat, Infinity).play()
      const idleAction = reactionStates[index] ? reactionStates[index].idle : null
      if (idleAction) {
        action.crossFadeFrom(idleAction, 0.25, false)
      }
      playSound('patter')
    }
    walks[index] = {from: groups[index].position.clone(), elapsed: 0, action}
  }

  // While the anchor carries the creatures along (the scanner's walk out from behind an object),
  // one with a `walkAnim` loops it; once they stop it eases back into its idle loop. A model that
  // loads mid-walk joins in (loadItem calls this too).
  const applyCarried = (index) => {
    const mixer = mixerByIndex[index]
    const clips = clipsByIndex[index]
    const walkClip = items[index].walkAnim && clips && THREE.AnimationClip.findByName(clips, items[index].walkAnim)
    if (!mixer || !walkClip || walks[index]) {
      return
    }
    const idleAction = mixer.clipAction(THREE.AnimationClip.findByName(clips, 'Idle') || clips[0])
    if (carried && !carryActions[index]) {
      carryActions[index] = mixer.clipAction(walkClip)
      carryActions[index].reset().setLoop(THREE.LoopRepeat, Infinity).play().crossFadeFrom(idleAction, 0.3, false)
    } else if (!carried && carryActions[index]) {
      idleAction.reset().play().crossFadeFrom(carryActions[index], 0.4, false)
      carryActions[index] = null
    }
  }

  // Takes a wall out of the scene for good: hidden, and no longer caught by taps.
  const removeWall = (index) => {
    sinks[index] = null
    sunk[index] = true
    walls[index].root.visible = false
  }

  // Puts the creature on its spot, back in its idle loop if it was walking there.
  const endWalk = (index) => {
    const walk = walks[index]
    walks[index] = null
    groups[index].position.x = homes[index].x
    groups[index].position.z = homes[index].z
    const idleAction = reactionStates[index] ? reactionStates[index].idle : null
    if (walk && walk.action && idleAction) {
      idleAction.reset().play().crossFadeFrom(walk.action, 0.25, false)
    }
  }

  return {
    count: items.length,

    // Adds the creatures to `scene` and starts loading their models.
    load(scene) {
      if (items.length === 0) {
        onProgress(0, 0)
      }
      items.forEach((item, i) => loadItem(i, scene))
    },

    /**
     * The anchor starts or stops carrying the creatures along: each one with a `walkAnim` plays it
     * meanwhile (see applyCarried).
     *
     * @param {boolean} on
     */
    setMoving(on) {
      carried = on
      items.forEach((_, i) => applyCarried(i))
    },

    // Shows the creatures or hides them (something else takes the stage). Either way the glows start
    // from off, and coming back moves the shared light to the glowcap again.
    setActive(on) {
      active = on
      groups.forEach((group) => {
        group.visible = on
      })
      walls.forEach((wall, i) => {
        if (wall) {
          wall.root.visible = on && !sunk[i]
        }
      })
      glows.forEach((glow) => {
        if (!glow) {
          return
        }
        glow.target = 0
        glow.level = 0
        if (on) {
          glow.attachLight()
        }
      })
      glowLight.intensity = 0
      if (!on) {
        // Leaving the stage mid-puzzle must not leave a dangling overlay or a stuck creature:
        // close whatever's open. Progress on an unsolved puzzle is already saved by the puzzle
        // module itself, so this costs nothing — it reopens where they left off. A puzzle that
        // had already been WON (mid wake-animation) is simply finished outright instead of
        // reverting it to locked, since undoing a solve would be a strange thing to see.
        items.forEach((item, i) => {
          if (activeGames[i]) {
            activeGames[i].destroy()
            activeGames[i] = null
          }
          if (puzzleRoots[i]) {
            puzzleRoots[i].remove()
            puzzleRoots[i] = null
          }
          if (lockState[i] === 'opening') {
            lockState[i] = 'locked'
          } else if (lockState[i] === 'unlocking') {
            if (walls[i]) {
              endWalk(i)   // mid-sink or mid-walk: straight to its spot
            }
            restoreMaterials(i)
            lockState[i] = 'unlocked'
          }
          if (walls[i] && lockState[i] === 'unlocked' && !sunk[i]) {
            removeWall(i)   // solved already: coming back to a wall still standing would be odd
          }
        })
      }
    },

    // Returns the index of whichever creature the aimed raycaster's ray hits (or the wall it hides
    // behind), or -1 if it missed them all.
    hitTest(raycaster) {
      const wallRoots = walls.map((wall, i) => (wall && !sunk[i] ? wall.root : null))
      const targets = [...groups, ...wallRoots.filter(Boolean)]
      const hits = raycaster.intersectObjects(targets, true)  // true: check nested meshes too
      if (hits.length === 0) {
        return -1
      }

      // Walk up from the hit mesh to whichever top-level group or wall it belongs to.
      let node = hits[0].object
      while (node && !targets.includes(node)) {
        node = node.parent
      }
      if (!node) {
        return -1
      }
      return groups.includes(node) ? groups.indexOf(node) : wallRoots.indexOf(node)
    },

    // Makes creature `index` react in whatever way its entry describes: opens its puzzle if it's
    // still locked, does nothing while that puzzle or its wake animation is already in progress,
    // otherwise the ordinary hop / reaction / glow-toggle tap it always did.
    tap(index) {
      const state = lockState[index]
      if (state === 'locked') {
        this.openPuzzle(index)
        return
      }
      if (state === 'opening' || state === 'unlocking') {
        return
      }
      if (items[index].hop !== false) {
        jumpStart[index] = now
        playSound(items[index].hopSound)
      }
      playReaction(index)  // does nothing for models without reactions
      if (glows[index]) {
        glows[index].target = glows[index].target ? 0 : 1
        playSound(glows[index].target ? 'glowOn' : 'glowOff')
      }
    },

    // Fetches and starts creature `index`'s puzzle as a full-screen DOM overlay. Does nothing if
    // it isn't currently locked (a stray double-tap while one is already opening, say).
    openPuzzle(index) {
      if (lockState[index] !== 'locked') {
        return
      }
      lockState[index] = 'opening'
      const item = items[index]
      const root = document.createElement('div')
      root.className = 'puzzle-root'
      document.body.appendChild(root)
      puzzleRoots[index] = root
      loadMiniGame(item.puzzle.type || 'puzzle').then((MiniGameClass) => {
        if (lockState[index] !== 'opening') {
          return   // the exhibit was left (setActive(false)) while this was still loading
        }
        const config = {...item.puzzle, art: item.puzzle.art ? artUrl(item.puzzle.art) : puzzleArt[index], creatureId: item.id}
        const game = new MiniGameClass(root, config, () => {
          game.destroy()
          root.remove()
          puzzleRoots[index] = null
          activeGames[index] = null
          this.unlock(index)
        })
        activeGames[index] = game
        game.start()
      }).catch((e) => {
        // A failure this early (the module itself, or something before the mini-game's own error
        // handling takes over) must not leave a silent empty overlay — there's no devtools on a
        // museum floor to explain why nothing happened.
        console.error('Failed to open the puzzle', e)
        root.textContent = `${e && e.name || 'Error'}: ${e && e.message || e}`
        Object.assign(root.style, {
          color: '#fff', font: '13px monospace', padding: '20px', background: 'rgba(120,20,20,0.95)',
        })
      })
    },

    // Called once a puzzle is won: behind a wall, the wall first sinks and the creature walks out;
    // then it wakes.
    unlock(index) {
      lockState[index] = 'unlocking'
      if (walls[index]) {
        startSink(index)
      } else {
        wake(index)
      }
    },

    // Advances the skeletal animations, then spins, bobs and pulses each creature, adding a hop
    // on top for whichever one was just tapped. `t` is the total time in seconds.
    update(dt, t) {
      now = t
      mixerByIndex.forEach((mixer) => mixer && mixer.update(dt))
      glows.forEach((glow) => glow && updateGlow(glow, dt, t))
      activeSparks.forEach((spark) => spark && spark.update(dt))

      walls.forEach((wall, i) => {
        if (wall && (lockState[i] === 'locked' || lockState[i] === 'opening')) {
          wall.setDoorGlow(0.45 + 0.25 * Math.sin(t * 2.5))   // a slow pulse: tap me
        }
      })
      walks.forEach((walk, i) => {
        if (!walk) {
          return
        }
        walk.elapsed += dt
        const progress = Math.min(walk.elapsed / WALK_SECONDS, 1)
        const eased = progress * progress * (3 - 2 * progress)
        groups[i].position.x = THREE.MathUtils.lerp(walk.from.x, homes[i].x, eased)
        groups[i].position.z = THREE.MathUtils.lerp(walk.from.z, homes[i].z, eased)
        if (progress === 1) {
          endWalk(i)
          wake(i)
        }
      })
      sinks.forEach((elapsed, i) => {
        if (elapsed === null) {
          return
        }
        sinks[i] = elapsed + dt
        const progress = Math.min(sinks[i] / SINK_SECONDS, 1)
        walls[i].setSunk(progress * progress)   // slow to start, then it drops away
        walls[i].setDoorGlow(1 - progress)      // a flare as it starts, fading on the way down
        if (progress === 1) {
          removeWall(i)
          startWalk(i)
        }
      })
      dust.forEach((puff) => puff && puff.update(dt))

      groups.forEach((group, i) => {
        const {spinSpeed = 0, phase = 0, hover = 0.08, bob = 0.05, pulse = 0} = items[i]

        group.rotation.y += dt * spinSpeed

        // Tap-triggered hop: a half sine arc over JUMP_DURATION seconds, then done.
        let hopOffset = 0
        if (jumpStart[i] !== null) {
          const elapsed = t - jumpStart[i]
          if (elapsed < JUMP_DURATION) {
            hopOffset = Math.sin((elapsed / JUMP_DURATION) * Math.PI) * JUMP_HEIGHT
          } else {
            jumpStart[i] = null
          }
        }

        group.position.y = hover + Math.sin(t * 1.5 + phase) * bob + hopOffset

        // "Heartbeat" scale pulse at BPM, offset per item so they don't beat in unison. Off unless a
        // creature sets `pulse` (a share of its size).
        const beat = t * (BPM / 60) * Math.PI * 2 + phase
        group.scale.setScalar(1 + Math.sin(beat) * pulse)
      })
    },
  }
}
