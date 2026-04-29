import * as THREE from 'three';

/**
 * MOUSE MAGNETIC ATTRACTION  ✦  (you write the force curve)
 * ─────────────────────────────────────────────────────────────────
 * This module:
 *   1. Tracks the cursor in world coordinates (already done below).
 *   2. Applies a per-frame "bias" to the bird's target positions
 *      so particles near the cursor get pulled toward it.
 *
 * What you write:
 *   The force function `attractionForce(distance)` — given the
 *   distance from a particle to the cursor, return a 0..1 weight
 *   for how strongly that particle should bend toward the cursor.
 *
 *   This shapes the *feel* of hover:
 *     • Linear falloff:    f(d) = max(0, 1 - d/R)        — uniform pull
 *     • Quadratic:         f(d) = max(0, 1 - d/R)^2      — gentler edges
 *     • Inverse-square:    f(d) = R^2 / (d^2 + R^2)      — physics-like
 *     • Smoothstep:        smoothstep(R, 0, d)           — soft both ends
 *     • Capped & shaped:   ... whatever feels good
 *
 *   The user has described "magnetic" — I'd lean toward something with
 *   a soft edge (no hard cutoff) so links flow smoothly. But you decide.
 */

export class MouseAttractor {
  /** World-space cursor position, updated every mousemove. */
  readonly worldPos = new THREE.Vector3(0, 0, 0);
  /** Whether the cursor is currently over the canvas. */
  active = false;

  /** Maximum radius (in world units) where the cursor influences particles. */
  radius = 6;
  /** Maximum displacement (in world units) at the very center of the cursor. */
  strength = 2.4;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private camera: THREE.Camera;
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    window.addEventListener('mousemove', (e) => {
      this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.ndc, this.camera);
      this.raycaster.ray.intersectPlane(this.plane, this.worldPos);
      this.active = true;
    });

    window.addEventListener('mouseleave', () => {
      this.active = false;
    });
  }

  /**
   * Apply attraction bias to baseline targets, writing into outTargets.
   * (Doesn't mutate baseline; the state machine integrates outTargets.)
   */
  applyTo(baseline: Float32Array, outTargets: Float32Array, count: number) {
    if (!this.active) {
      // No cursor → outTargets just mirrors baseline.
      outTargets.set(baseline);
      return;
    }

    const cx = this.worldPos.x;
    const cy = this.worldPos.y;
    const cz = this.worldPos.z;
    const R = this.radius;
    const S = this.strength;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const bx = baseline[i3];
      const by = baseline[i3 + 1];
      const bz = baseline[i3 + 2];

      const dx = cx - bx;
      const dy = cy - by;
      const dz = cz - bz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const w = attractionForce(dist, R);
      const pull = w * S;
      const len = dist || 1;

      outTargets[i3] = bx + (dx / len) * pull;
      outTargets[i3 + 1] = by + (dy / len) * pull;
      outTargets[i3 + 2] = bz + (dz / len) * pull;
    }
  }
}

/**
 * ─── TODO (USER): pick the magnetic feel ───
 *
 * Return how strongly a particle at `distance` from the cursor
 * should be pulled toward it. Output range: [0, 1].
 *
 * `radius` is the influence range — at distance >= radius, return 0.
 *
 * Default below = quadratic falloff. Try replacing with one of the
 * variants in the doc comment above and watch the difference.
 */
export function attractionForce(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t;
}
