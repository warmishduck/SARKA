// A small mossy stone wall with a glowing door outline on its front: where a creature hides until
// its puzzle is solved, when the wall sinks into the floor and lets it out (see showcase.js's
// lockStyle 'wall'). Built from rounded boxes, so it needs no model file. It stands
// on y = 0, centred on x = 0, front face +z. Whatever goes below the floor it stands on (the
// world height of its own origin, which is not always world y = 0) is cut away, which needs the
// renderer's localClippingEnabled (threejs-scene-init.js turns it on).

import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'

const ROWS = 5
const MORTAR = 0.07   // gap between stones, as a share of a row's height
const STONE_COLORS = [0x8a8378, 0x7a746a, 0x958c7d, 0x6e6a62, 0x9b927f]
const MOSS_COLORS = [0x5d7a3a, 0x4f6b31, 0x6f8c44]
const DOOR_COLOR = '#ffd98a'

// Seeded, so every visit builds the same wall.
const seededRandom = (seed) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

// A door-shaped arch, drawn soft and glowing on a transparent canvas, open at the bottom.
const makeDoorTexture = () => {
  const width = 256
  const height = 384
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const pad = 36
  const radius = width / 2 - pad
  const arch = new Path2D()
  arch.moveTo(pad, height)
  arch.lineTo(pad, pad + radius)
  arch.arc(width / 2, pad + radius, radius, Math.PI, 0)
  arch.lineTo(width - pad, height)
  ctx.fillStyle = DOOR_COLOR
  ctx.globalAlpha = 0.16
  ctx.fill(arch)
  ctx.globalAlpha = 1
  ctx.strokeStyle = DOOR_COLOR
  ctx.shadowColor = DOOR_COLOR
  ctx.shadowBlur = 26
  ctx.lineWidth = 9
  ctx.stroke(arch)
  ctx.stroke(arch)   // a second pass doubles the glow
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * @param {Object} size - In the units of whatever the wall is added to.
 * @param {number} size.width
 * @param {number} size.height
 * @param {number} size.depth
 * @returns {{root: THREE.Group, setDoorGlow: (level: number) => void}} setDoorGlow takes 0..1.
 */
export const createStoneWall = ({width, height, depth}) => {
  const random = seededRandom(7)
  const root = new THREE.Group()
  const body = new THREE.Group()   // what shakes and sinks; root keeps the wall's place
  root.add(body)
  const rowHeight = height / ROWS
  const aboveFloor = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]   // world space
  const clipped = (material) => Object.assign(material, {clippingPlanes: aboveFloor, clipShadows: true})
  // The plane is in world space, but the wall is moved around: parked on the scanner's measured
  // floor, inside a scaled stage. It is lined up with the wall's own base just before drawing.
  const basePoint = new THREE.Vector3()
  const standOnOwnFloor = () => {
    root.getWorldPosition(basePoint)
    aboveFloor[0].constant = -basePoint.y
  }
  const followFloor = (mesh) => {
    mesh.onBeforeRender = standOnOwnFloor
    mesh.onBeforeShadow = standOnOwnFloor
  }

  // Stones in a running bond: every other row shifted by about half a stone.
  const stones = []
  for (let row = 0; row < ROWS; row++) {
    let x = -width / 2 - (row % 2 ? rowHeight * 0.8 : 0)
    while (x < width / 2) {
      const length = rowHeight * (1.3 + random() * 0.8)
      const left = Math.max(x, -width / 2)
      const right = Math.min(x + length, width / 2)
      if (right - left > rowHeight * 0.35) {
        stones.push({x: (left + right) / 2, y: rowHeight * (row + 0.5), length: right - left})
      }
      x += length
    }
  }
  const stoneMesh = new THREE.InstancedMesh(
    new RoundedBoxGeometry(1, 1, 1, 2, 0.18),
    clipped(new THREE.MeshStandardMaterial({roughness: 0.95, metalness: 0})),
    stones.length
  )
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scale = new THREE.Vector3()
  const position = new THREE.Vector3()
  const color = new THREE.Color()
  stones.forEach((stone, i) => {
    rotation.setFromEuler(euler.set((random() - 0.5) * 0.06, (random() - 0.5) * 0.06, (random() - 0.5) * 0.08))
    scale.set(stone.length - rowHeight * MORTAR, rowHeight * (1 - MORTAR) * (0.9 + random() * 0.1), depth * (0.85 + random() * 0.15))
    position.set(stone.x, stone.y, (random() - 0.5) * depth * 0.1)
    stoneMesh.setMatrixAt(i, matrix.compose(position, rotation, scale))
    stoneMesh.setColorAt(i, color.setHex(STONE_COLORS[Math.floor(random() * STONE_COLORS.length)]))
  })
  stoneMesh.castShadow = true
  stoneMesh.receiveShadow = true
  followFloor(stoneMesh)
  body.add(stoneMesh)

  // Moss along the top: flattened green lumps.
  const mossCount = Math.max(3, Math.round((width / rowHeight) * 1.6))
  const mossMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 6),
    clipped(new THREE.MeshStandardMaterial({roughness: 1, metalness: 0})),
    mossCount
  )
  for (let i = 0; i < mossCount; i++) {
    rotation.identity()
    scale.set(rowHeight * (0.45 + random() * 0.35), rowHeight * (0.14 + random() * 0.1), depth * (0.45 + random() * 0.2))
    position.set(-width / 2 + ((i + 0.5) / mossCount) * width + (random() - 0.5) * rowHeight * 0.4, height - rowHeight * 0.06, (random() - 0.5) * depth * 0.3)
    mossMesh.setMatrixAt(i, matrix.compose(position, rotation, scale))
    mossMesh.setColorAt(i, color.setHex(MOSS_COLORS[Math.floor(random() * MOSS_COLORS.length)]))
  }
  mossMesh.castShadow = true
  followFloor(mossMesh)
  body.add(mossMesh)

  // The door: a glow on the front face, the way out once the puzzle is solved.
  const doorHeight = height * 0.82
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.5, doorHeight),
    clipped(new THREE.MeshBasicMaterial({
      map: makeDoorTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
  )
  door.position.set(0, doorHeight / 2, depth * 0.6)
  followFloor(door)
  body.add(door)

  return {
    root,
    setDoorGlow: (level) => {
      door.material.opacity = level
      door.visible = level > 0.001
    },
    /** @param {number} amount - 0 standing, 1 fully under the floor. It shakes on the way down. */
    setSunk: (amount) => {
      body.position.y = -amount * height
      body.position.x = Math.sin(amount * 70) * rowHeight * 0.06 * (1 - amount)
    },
  }
}
