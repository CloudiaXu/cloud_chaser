/**
 * BIRD PARAMETRIC GEOMETRY
 * ─────────────────────────────────────────────────────────────────
 * Pose: spread-wing flight, V-shape opening upward.
 * Wings = feathers radiating from a spine (not a flat leaf area).
 *
 *   t ∈ [0.00, 0.20) → BODY        (smooth ellipsoid, no pinch)
 *   t ∈ [0.20, 0.27) → HEAD        (overlaps body's front)
 *   t ∈ [0.27, 0.55) → FRONT WING  (z > 0)
 *   t ∈ [0.55, 0.85) → BACK WING   (z < 0, smaller)
 *   t ∈ [0.85, 1.00) → TAIL
 *
 * Each wing point is built from:
 *   1. anchorU  — where on the spine this feather starts
 *   2. feather angle (perp to spine + spread)
 *   3. uFeather — how far along the feather this particle sits
 * This gives a real radiating-feather structure.
 */

const SCALE = 1.7;
const OFFSET_X = 13;
const OFFSET_Y = 1;

export function birdTargets(out: Float32Array, count: number): void {
  for (let i = 0; i < count; i++) {
    const t = i / count;
    let x = 0;
    let y = 0;
    let z = 0;

    if (t < 0.20) {
      // ─── BODY ─────────────────────────────────────────────
      // Soft ellipsoid; taper is exponentiated so the front end
      // doesn't pinch to zero (it has to merge with the head).
      const u = t / 0.20;
      const taper = Math.pow(Math.sin(u * Math.PI), 0.55) + 0.05;
      const angle = hash(i) * Math.PI * 2;
      const radius = 0.95 * taper;
      const rJitter = Math.sqrt(hash(i + 100));
      x = -2.8 + u * 5.6;
      y = -0.3 + Math.sin(angle) * radius * rJitter * 0.85;
      z = Math.cos(angle) * radius * rJitter * 0.6;
    } else if (t < 0.27) {
      // ─── HEAD ─────────────────────────────────────────────
      // Sits at x≈2.8 — overlapping the body's front so they read
      // as one continuous shape, not two balls in a row.
      const angle = hash(i) * Math.PI * 2;
      const r = 0.3 + Math.sqrt(hash(i + 200)) * 0.6;
      x = 2.8 + Math.cos(angle) * r * 0.85;
      y = 0.45 + Math.sin(angle) * r;
      z = Math.cos(angle * 1.3) * r * 0.55;
    } else if (t < 0.55) {
      // ─── FRONT WING (z > 0) ───────────────────────────────
      [x, y, z] = featherWing(i, {
        rootX: 0.5,
        rootY: 0.3,
        spineTheta: Math.PI * 0.42, // ~75° → up-and-right
        spineLength: 11,
        featherSide: -1, // feathers extend right-and-down (outward)
        featherSpread: 0.6, // ±~17° angular spread
        featherMax: 4.0,
        featherCount: 14,
        zBase: 0.5,
        zRamp: 0.3,
        seed: 300,
      });
    } else if (t < 0.85) {
      // ─── BACK WING (z < 0) ────────────────────────────────
      [x, y, z] = featherWing(i, {
        rootX: -0.5,
        rootY: 0.2,
        spineTheta: Math.PI * 0.62, // ~112° → up-and-left
        spineLength: 9.5,
        featherSide: +1, // feathers extend left-and-down (outward)
        featherSpread: 0.55,
        featherMax: 3.4,
        featherCount: 11,
        zBase: -0.5,
        zRamp: -0.3,
        seed: 600,
      });
    } else {
      // ─── TAIL ─────────────────────────────────────────────
      const u = (t - 0.85) / 0.15;
      const fanAngle = Math.PI + (hash(i) - 0.5) * 0.5;
      const length = 1 + Math.pow(u, 0.7) * 4.5;
      x = -2.8 + length * Math.cos(fanAngle);
      y = -0.5 + Math.sin(fanAngle) * length * 0.4;
      z = (hash(i + 900) - 0.5) * 0.5;
    }

    // Small organic noise.
    const noise = 0.12;
    x += (hash(i + 7) - 0.5) * noise;
    y += (hash(i + 13) - 0.5) * noise;
    z += (hash(i + 23) - 0.5) * noise;

    const i3 = i * 3;
    out[i3] = x * SCALE + OFFSET_X;
    out[i3 + 1] = y * SCALE + OFFSET_Y;
    out[i3 + 2] = z * SCALE;
  }
}

interface FeatherWingParams {
  rootX: number;
  rootY: number;
  spineTheta: number;
  spineLength: number;
  /** -1 to send feathers right-of-spine, +1 for left-of-spine */
  featherSide: 1 | -1;
  /** Angular spread of feathers around the perpendicular (radians, total range) */
  featherSpread: number;
  /** Max feather length (at the wing's middle, where feathers are longest) */
  featherMax: number;
  /** Number of stratified feather strips */
  featherCount: number;
  zBase: number;
  zRamp: number;
  seed: number;
}

/**
 * A particle here represents (anchor along spine) × (position along a feather).
 *
 * Stratified feather index → particles cluster onto N distinct feathers,
 * but neighboring particle indices land on different feathers — this is
 * exactly what makes the constellation links cross between feathers and
 * produce the woven look.
 */
function featherWing(i: number, p: FeatherWingParams): [number, number, number] {
  const anchorU = hash(i + p.seed);                    // where on spine
  const featherIdx = Math.floor(hash(i + p.seed + 1) * p.featherCount);
  const featherT = featherIdx / Math.max(1, p.featherCount - 1); // 0..1
  const uFeather = hash(i + p.seed + 2);               // along feather

  const sx = p.rootX + anchorU * p.spineLength * Math.cos(p.spineTheta);
  const sy = p.rootY + anchorU * p.spineLength * Math.sin(p.spineTheta);

  // Feather direction = perpendicular to spine + small angular spread
  const perpTheta = p.spineTheta + (p.featherSide * Math.PI) / 2;
  const featherTheta = perpTheta + (featherT - 0.5) * p.featherSpread;

  // Feathers in the middle of the wing are longest (sine bell along spine)
  const featherLen = Math.sin(anchorU * Math.PI) * p.featherMax + 0.3;
  const dist = uFeather * featherLen;

  const x = sx + Math.cos(featherTheta) * dist;
  const y = sy + Math.sin(featherTheta) * dist;
  // z drifts from base toward zBase+zRamp as we go outward on spine,
  // plus a tiny per-feather offset so it has thickness.
  const z = p.zBase + anchorU * p.zRamp + (hash(i + p.seed + 3) - 0.5) * 0.4;
  return [x, y, z];
}

/** Stable per-index pseudo-random in [0,1). */
export function hash(i: number): number {
  let x = (i + 1) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}
