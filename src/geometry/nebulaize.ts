/**
 * NEBULAIZE
 * ─────────────────────────────────────────────────────────────────
 * Re-distributes a flat / narrow brightness range into a three-tier
 * "nebula" pattern so a particle cloud reads as a glowing gas with
 * embedded stars rather than a uniform mesh.
 *
 *   ~15% bright "stars"  (0.80–1.00) — big, glow-triggering dots
 *   ~30% mid             (0.40–0.70) — silhouette-defining particles
 *   ~55% dim "dust"      (0.10–0.35) — atmospheric background
 *
 * The tier each particle falls into is a deterministic hash of its
 * index, so a given particle stays bright (or stays dim) across
 * scatter→form replays — the eye tracks "that bright dot" instead of
 * watching brightness flicker.
 *
 * Source brightness is NOT used: the reference image has too narrow
 * a range to express nebula tiers naturally. We replace it entirely
 * while preserving the spatial layout (positions are untouched).
 */
export function nebulaize(count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // xorshift-style hash on index — stable across reloads, no globals.
    let s = (i + 1) * 374761393;
    s = (s ^ (s >>> 13)) * 1274126177;
    s = (s ^ (s >>> 16)) >>> 0;
    const r = (s % 100000) / 100000; // 0..1

    if (r > 0.85) {
      // Top 15% — bright stars. Range 0.80-1.00 hits the bloom-trigger
      // band in the particle shader's color mapping.
      out[i] = 0.80 + (r - 0.85) / 0.15 * 0.20;
    } else if (r > 0.55) {
      // Mid 30% — silhouette body.
      out[i] = 0.40 + (r - 0.55) / 0.30 * 0.30;
    } else {
      // Bottom 55% — atmospheric dust. Floor lowered to 0.06 to deepen
      // contrast with bright anchor stars (matches footer constellation
      // visual: anchors stand out crisply against dim atmospheric scatter).
      out[i] = 0.06 + r / 0.55 * 0.25;
    }
  }
  return out;
}

export interface HotSpot {
  /** World-space center of the bright cluster. */
  x: number;
  y: number;
  /** Falloff radius — particles within this distance get boosted. */
  radius: number;
  /** Max brightness added at the spot's exact center (0..1). */
  boost: number;
}

/**
 * Boost brightness near each hot spot so the cloud has visible
 * "highlight clusters" rather than uniform sparkle. Quadratic
 * falloff means the boost is strong at the center and fades
 * smoothly to zero at the radius edge — no hard circular halo.
 *
 * Each particle takes the MAX boost across all overlapping spots
 * (rather than summing) so spots near each other don't blow out.
 */
export function addHotSpots(
  positions: Float32Array,
  brightness: Float32Array,
  spots: HotSpot[]
): void {
  for (let i = 0; i < brightness.length; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    let maxBoost = 0;
    for (const s of spots) {
      const dx = px - s.x;
      const dy = py - s.y;
      const distSq = dx * dx + dy * dy;
      const rSq = s.radius * s.radius;
      if (distSq >= rSq) continue;
      // Quadratic falloff: 1 at center, 0 at edge.
      const t = 1 - Math.sqrt(distSq) / s.radius;
      const boost = s.boost * t * t;
      if (boost > maxBoost) maxBoost = boost;
    }
    brightness[i] = Math.min(1, brightness[i] + maxBoost);
  }
}
