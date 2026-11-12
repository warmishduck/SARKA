// The glowcap's glow: its emissive spots get brighter while a green point light and a soft
// halo fade in around it. Used by the creature showcase.
import * as THREE from 'three'

// A soft round blob: white in the middle, fading to nothing. Used for halos and light pools.
export const makeHaloTexture = () => {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // Several stops make a smooth, roughly quadratic falloff; with just two or three the
  // edge of the disc shows up as a visible ring.
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.55)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)')
  gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.03)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// Sets up the glow for a model that lives in `group`. `level` eases toward `target`
// (0 = off, 1 = on) so it fades smoothly; flipping `target` switches it.
//
// `light` is one shared PointLight. It is created up front at zero intensity by the caller,
// because adding a light later changes the light count and makes three recompile every lit
// material, which would freeze the moment of the first tap. Only one glow shines at a time,
// so call `attachLight()` on whichever glow is currently on screen.
//
// Sizes are in the units of `group` (the level diorama's group is scaled down, so it passes
// bigger numbers): `haloSize` is the halo's width, `haloY` and `lightY` their heights.
export const createGlow = (group, model, light, {haloSize = 1.3, haloY = 0.28, lightY = 0.3, lightDistance = 2.5} = {}) => {
  const materials = []
  model.traverse((node) => {
    if (node.isMesh && node.material && node.material.emissive) {
      materials.push(node.material)
    }
  })

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeHaloTexture(),
    color: 0xb6ff8a,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,  // adds light instead of covering what's behind it
    depthWrite: false,
    depthTest: false,  // otherwise the floor plane slices off the bottom of the halo
  }))
  halo.scale.setScalar(haloSize)
  halo.position.y = haloY
  // The halo is a big see-through billboard in front of whatever stands behind the
  // glowcap. Raycasting ignores transparency, so left alone it would swallow taps meant
  // for those characters.
  halo.raycast = () => {}
  group.add(halo)

  return {
    materials,
    baseEmissive: materials.map((material) => material.emissiveIntensity),
    halo,
    light,
    level: 0,
    target: 0,
    attachLight() {
      light.position.set(0, lightY, 0)
      light.distance = lightDistance
      group.add(light)
    },
  }
}

export const updateGlow = (glow, dt, t) => {
  glow.level += (glow.target - glow.level) * (1 - Math.exp(-dt * 4))
  const flicker = 0.85 + 0.15 * Math.sin(t * 3)  // slow shimmer while lit
  glow.materials.forEach((material, i) => {
    material.emissiveIntensity = glow.baseEmissive[i] + glow.level * 0.9 * flicker
  })
  glow.light.intensity = glow.level * 1.6 * flicker
  glow.halo.material.opacity = glow.level * 0.5 * flicker
}
