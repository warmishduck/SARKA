// A stand-in sock for the quest, built from simple shapes, until the artist's model arrives.
import * as THREE from 'three'

const RED = 0xc8402f
const WHITE = 0xf3ead8
const LEG_RADIUS = 0.17
const STRIPE_HEIGHT = 0.11

const material = (color) => new THREE.MeshStandardMaterial({
  color, roughness: 0.9, emissive: color, emissiveIntensity: 0.25,   // readable in a dim room
})

/**
 * A striped sock, 1 unit tall, standing on its sole at the origin with the toe towards +x.
 * It carries an invisible, roomier ball for taps: a sock is a small target for a finger.
 *
 * @returns {{root: THREE.Group, hitTarget: THREE.Mesh}}
 */
export const createSock = () => {
  const root = new THREE.Group()
  const red = material(RED)
  const white = material(WHITE)
  const add = (geometry, mat, x, y, z = 0) => {
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.set(x, y, z)
    root.add(mesh)
    return mesh
  }

  // The leg, in stripes from the heel up, then the cuff.
  const bottom = LEG_RADIUS
  for (let i = 0; i < 6; i++) {
    add(new THREE.CylinderGeometry(LEG_RADIUS, LEG_RADIUS, STRIPE_HEIGHT, 24), i % 2 ? white : red,
      0, bottom + STRIPE_HEIGHT * (i + 0.5))
  }
  const cuffHeight = 1 - bottom - STRIPE_HEIGHT * 6
  add(new THREE.CylinderGeometry(LEG_RADIUS * 1.12, LEG_RADIUS * 1.12, cuffHeight, 24), white, 0, 1 - cuffHeight / 2)

  // The heel, the foot lying along +x, and the toe.
  add(new THREE.SphereGeometry(LEG_RADIUS, 24, 16), white, 0, LEG_RADIUS)
  add(new THREE.CylinderGeometry(LEG_RADIUS, LEG_RADIUS, 0.4, 24), red, 0.2, LEG_RADIUS).rotation.z = Math.PI / 2
  add(new THREE.SphereGeometry(LEG_RADIUS, 24, 16), white, 0.4, LEG_RADIUS)

  const hitTarget = add(new THREE.SphereGeometry(0.85, 12, 8), new THREE.MeshBasicMaterial(), 0.12, 0.5)
  hitTarget.visible = false   // raycasting ignores this, so it still catches taps
  return {root, hitTarget}
}
