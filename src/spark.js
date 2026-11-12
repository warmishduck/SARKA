// A one-shot burst of sparks, played at a creature's position the moment its puzzle is solved —
// the "хоп, іскри" between the puzzle closing and the creature waking up. Unrelated to glow.js
// (that is a continuous glow while a creature is lit; this fires once and is gone).
import * as THREE from 'three'

const makeSparkTexture = () => {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,240,190,0.9)')
  gradient.addColorStop(1, 'rgba(255,240,190,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

let sharedTexture = null
const PARTICLE_COUNT = 18
const DURATION = 0.7

// Adds a burst of particles to `group` as children, so it sits in whatever coordinate space the
// group is already in (world space for the AR showcase, a scaled stage, ...). `radius`
// is roughly how far the sparks travel, in that same space — pass something proportional to the
// creature's own height. Returns {update(dt)}: call it every frame; once the burst has finished
// it removes its own particles and update() stops doing anything.
export const createSparkBurst = (group, {radius = 0.4, color = 0xfff2b0} = {}) => {
  if (!sharedTexture) {
    sharedTexture = makeSparkTexture()
  }
  const particles = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const material = new THREE.SpriteMaterial({
      map: sharedTexture, color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    })
    const sprite = new THREE.Sprite(material)
    const angle = Math.random() * Math.PI * 2
    const upBias = 0.5 + Math.random() * 0.7
    const speed = radius * (2.4 + Math.random() * 1.6)
    sprite.userData.velocity = new THREE.Vector3(Math.cos(angle) * speed, upBias * speed, Math.sin(angle) * speed * 0.6)
    const scale = radius * (0.14 + Math.random() * 0.12)
    sprite.scale.setScalar(scale)
    sprite.position.y += radius * 0.6   // start roughly chest-height, not at the feet
    group.add(sprite)
    particles.push(sprite)
  }
  let elapsed = 0
  let done = false
  return {
    update(dt) {
      if (done) {
        return
      }
      elapsed += dt
      const life = Math.min(elapsed / DURATION, 1)
      particles.forEach((sprite) => {
        sprite.position.addScaledVector(sprite.userData.velocity, dt)
        sprite.userData.velocity.y -= dt * radius * 4   // gravity pulls the sparks back down
        sprite.material.opacity = 1 - life
      })
      if (life >= 1) {
        done = true
        particles.forEach((sprite) => {
          group.remove(sprite)
          sprite.material.dispose()
        })
      }
    },
  }
}
