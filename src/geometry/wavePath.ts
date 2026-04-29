/**
 * BEZIER WAVE PATH + FLOWING RIBBON
 * ─────────────────────────────────────────────────────────────────
 * Two generators for the hero's flowing line beneath the bird:
 *
 *   bezierWave()    — single smooth arc from cubic Bezier control
 *                     points, evenly spaced via arc-length walk.
 *
 *   flowingRibbon() — horizontal sine-wave ribbon. Multiple sine
 *                     frequencies superpose for organic motion;
 *                     brightness modulates so dots vary in size/glow,
 *                     producing the "thin/thick chain" effect.
 */

export interface BezierWaveOptions {
  /** Bezier control points in world space. */
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  /** Number of dots to place along the curve. */
  count: number;
  /** Z jitter range. */
  zJitter?: number;
  /** Optional small per-dot perpendicular offset for organic feel. */
  perpJitter?: number;
}

export interface WaveResult {
  positions: Float32Array; // length count * 3
  brightness: Float32Array; // length count
}

/** Sample a cubic Bezier at parameter t (0..1). */
function bezier(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { x: number; y: number } {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Tangent of the bezier at t (used for perpendicular offset direction). */
function bezierTangent(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { x: number; y: number } {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

export function bezierWave(opts: BezierWaveOptions): WaveResult {
  const { p0, p1, p2, p3, count } = opts;

  // 1. Densely sample the curve and compute cumulative arc lengths.
  const samples = 200;
  const samplePoints: { x: number; y: number }[] = [];
  const cumLengths: number[] = [0];
  for (let i = 0; i <= samples; i++) {
    samplePoints.push(bezier(i / samples, p0, p1, p2, p3));
    if (i > 0) {
      const dx = samplePoints[i].x - samplePoints[i - 1].x;
      const dy = samplePoints[i].y - samplePoints[i - 1].y;
      cumLengths.push(cumLengths[i - 1] + Math.hypot(dx, dy));
    }
  }
  const totalLength = cumLengths[samples];

  // 2. Walk equal step sizes along the curve to get evenly spaced dots.
  const positions = new Float32Array(count * 3);
  const brightness = new Float32Array(count);
  const stepLen = totalLength / (count - 1);

  let sampleIdx = 0;
  for (let i = 0; i < count; i++) {
    const targetLen = i * stepLen;
    while (sampleIdx < samples && cumLengths[sampleIdx + 1] < targetLen) {
      sampleIdx++;
    }
    // Linear interp between sample[sampleIdx] and sample[sampleIdx+1].
    const segStart = cumLengths[sampleIdx];
    const segEnd = cumLengths[Math.min(sampleIdx + 1, samples)];
    const segT = segEnd > segStart ? (targetLen - segStart) / (segEnd - segStart) : 0;
    const a = samplePoints[sampleIdx];
    const b = samplePoints[Math.min(sampleIdx + 1, samples)];
    let x = a.x + (b.x - a.x) * segT;
    let y = a.y + (b.y - a.y) * segT;

    // Optional perpendicular jitter for organic wobble. Direction is the
    // unit normal to the curve tangent at this t.
    if (opts.perpJitter && opts.perpJitter > 0) {
      const tParam = (sampleIdx + segT) / samples;
      const tan = bezierTangent(tParam, p0, p1, p2, p3);
      const len = Math.hypot(tan.x, tan.y) || 1;
      const nx = -tan.y / len;
      const ny = tan.x / len;
      const jitter = (Math.random() - 0.5) * opts.perpJitter;
      x += nx * jitter;
      y += ny * jitter;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * (opts.zJitter ?? 0.4);

    // Subtle brightness variation along the curve (peak in the middle,
    // dimmer at the ends — feels like a fading stroke).
    const mid = i / (count - 1);
    brightness[i] = 0.35 + Math.sin(mid * Math.PI) * 0.30;
  }

  return { positions, brightness };
}

export interface FlowingRibbonOptions {
  /** Left endpoint x (world units). */
  startX: number;
  /** Right endpoint x. */
  endX: number;
  /** Baseline y (curve oscillates around this). */
  baseY: number;
  /** Peak amplitude of the wave. */
  amplitude: number;
  /** Number of full sine cycles across startX→endX (e.g. 2.5 ≈ 2-3 humps). */
  frequency: number;
  /** Number of dots along the ribbon. */
  count: number;
  /** Z jitter range. */
  zJitter?: number;
}

/**
 * Sine-wave ribbon with brightness modulation. Produces the
 * "fluttering chain" feel: multiple bright spots like beads of light
 * threaded along a curve, with thinner/dimmer dots in between.
 */
export function flowingRibbon(opts: FlowingRibbonOptions): WaveResult {
  const { startX, endX, baseY, amplitude, frequency, count } = opts;
  const positions = new Float32Array(count * 3);
  const brightness = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1); // 0..1
    const x = startX + t * (endX - startX);

    // Two superposed sines — primary wave + smaller higher-freq overlay.
    // Envelope `sin(πt)` tapers amplitude to zero at the ends.
    const env = Math.sin(t * Math.PI);
    const wave1 = Math.sin(t * Math.PI * frequency) * amplitude;
    const wave2 = Math.sin(t * Math.PI * frequency * 2.7 + 1.3) * amplitude * 0.35;
    const y = baseY + (wave1 + wave2) * env;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * (opts.zJitter ?? 0.5);

    // Mixed-size dots: most are small/dim (background dust), with a
    // ~35% sprinkle of brighter "highlight" dots that the particle
    // system maps to bigger sizes via the brightness→size curve.
    // Deterministic per-index hash so the pattern stays stable across
    // re-renders while looking random.
    let seed = (i + 1) * 374761393;
    seed = (seed ^ (seed >>> 13)) * 1274126177;
    seed = (seed ^ (seed >>> 16)) >>> 0;
    const rnd = (seed % 100000) / 100000; // 0..1
    const isHighlight = rnd > 0.65;       // ~35% are big bright highlights
    const beads = Math.sin(t * Math.PI * 6) * 0.5 + 0.5;
    brightness[i] = isHighlight
      ? 0.55 + rnd * 0.30      // 0.55-0.85 (big glowing dots)
      : 0.16 + beads * 0.18;   // 0.16-0.34 (small background dust)
  }

  return { positions, brightness };
}
