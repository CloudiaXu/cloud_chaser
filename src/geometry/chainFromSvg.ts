/**
 * DOTS FROM SVG
 * ─────────────────────────────────────────────────────────────────
 * Loads any SVG that encodes a design as <circle> dots and replays
 * them through our particle system. Used for two distinct sources:
 *
 *   chain.svg — woven beads pattern below the bird hero.
 *   text.svg  — "CONNECT THE DOTS, CREATE VALUE." typography.
 *
 * Each SVG encodes per-dot brightness differently:
 *   - chain.svg uses `opacity` (0.07 haze → 0.99 bright core).
 *   - text.svg  uses `r`     (large r=halo → small r=text vertex).
 *
 * We normalize both to a 0..1 brightness that the particle system
 * maps to size + color intensity.
 *
 * <line>, <path>, and <polyline> elements are silently ignored — only
 * <circle> data is sampled. So the user can drop a richly-styled SVG
 * (with strokes, gradients, blurs) and we just lift the dot positions.
 */
export interface DotsFromSvgOptions {
  /** Path to the SVG file (served from /public). */
  svgPath: string;
  /** SVG viewBox width — used to map cx into world x. */
  viewBoxWidth: number;
  /** SVG viewBox height — used to map cy into world y. */
  viewBoxHeight: number;
  /** World-x where SVG cx=0 maps to (left edge). */
  startX: number;
  /** World-x where SVG cx=viewBoxWidth maps to (right edge). */
  endX: number;
  /** World-y at the SVG's vertical center. */
  baseY: number;
  /** World-units the SVG's full viewBox height should occupy. */
  scaleY: number;
  /** How many particles to produce. */
  count: number;
  /**
   * How to derive brightness when an opacity attribute is missing.
   *  - `opacity`: read circle's opacity attr (0..1). Default.
   *  - `inverse-radius`: small r → high brightness (text dots).
   *    Tuned for r ∈ [1, 13]: r≤2 → 1.0, r≥10 → 0.15.
   */
  brightnessFrom?: 'opacity' | 'inverse-radius';
  /** Random Z spread. */
  zJitter?: number;
}

export interface DotsResult {
  positions: Float32Array; // length count * 3
  brightness: Float32Array; // length count
}

interface RawDot {
  cx: number;
  cy: number;
  r: number;
  /** Derived brightness 0..1 (after `brightnessFrom` rule). */
  b: number;
}

/** @deprecated alias kept so existing call sites (chain wave) continue compiling. */
export type ChainOptions = DotsFromSvgOptions;
export type ChainResult = DotsResult;

export async function chainFromSvg(opts: DotsFromSvgOptions): Promise<DotsResult> {
  const text = await fetch(opts.svgPath).then((r) => r.text());
  const mode = opts.brightnessFrom ?? 'opacity';

  // Match `<circle cx="X" cy="Y" r="R" .../>` with optional opacity.
  // Both attribute orderings (with/without opacity) are accepted.
  const re = /<circle\s+cx="([^"]+)"\s+cy="([^"]+)"\s+r="([^"]+)"(?:\s+opacity="([^"]+)")?\s*\/?>/g;

  const all: RawDot[] = [];
  for (const m of text.matchAll(re)) {
    const cx = parseFloat(m[1]);
    const cy = parseFloat(m[2]);
    const r = parseFloat(m[3]);
    const op = m[4] !== undefined ? parseFloat(m[4]) : NaN;

    // Skip giant nebula blobs that would map to huge particles.
    if (r > 15) continue;

    let b: number;
    if (mode === 'opacity') {
      // chain.svg style: opacity is brightness directly.
      b = isNaN(op) ? 1 : op;
    } else {
      // text.svg style: small r = bright text vertex, big r = dim halo.
      // r=1 → 1.0, r=2 → 0.95, r=6 → 0.55, r=13 → 0.15 (inverse-linear).
      b = Math.max(0.1, Math.min(1, 1.05 - r / 14));
    }

    all.push({ cx, cy, r, b });
  }

  // Dedupe by position: many SVGs stack a bright core + soft halo at
  // the SAME (cx,cy). Keep the entry with the highest derived brightness
  // so the visible "core" wins over its halo.
  const byPos = new Map<string, RawDot>();
  for (const d of all) {
    const key = `${d.cx.toFixed(1)},${d.cy.toFixed(1)}`;
    const existing = byPos.get(key);
    if (!existing || d.b > existing.b) byPos.set(key, d);
  }
  let dots = Array.from(byPos.values());

  // Pick exactly `count` dots, biased toward the brightest. Bright dots
  // are kept in full (so the visible "highlights" survive); dim haze is
  // stratified-sampled to fill the remainder while preserving spread.
  if (dots.length > opts.count) {
    const sorted = dots.slice().sort((a, b) => b.b - a.b);
    const bright = sorted.filter((d) => d.b > 0.55);
    const dim = sorted.filter((d) => d.b <= 0.55);
    const keepBright = Math.min(bright.length, Math.floor(opts.count * 0.55));
    const dimNeeded = opts.count - keepBright;
    const stride = dim.length / Math.max(1, dimNeeded);
    const sampledDim: RawDot[] = [];
    for (let i = 0; i < dimNeeded; i++) sampledDim.push(dim[Math.floor(i * stride)]);
    dots = bright.slice(0, keepBright).concat(sampledDim);
  }

  const positions = new Float32Array(opts.count * 3);
  const brightness = new Float32Array(opts.count);
  const xRange = opts.endX - opts.startX;

  for (let i = 0; i < opts.count; i++) {
    const d = dots[i % dots.length];
    // SVG x: 0..viewBoxWidth → world x: startX..endX (linear).
    positions[i * 3] = opts.startX + (d.cx / opts.viewBoxWidth) * xRange;
    // SVG y is top-down; world y is bottom-up, so flip around vertical center.
    positions[i * 3 + 1] = opts.baseY + opts.scaleY * (0.5 - d.cy / opts.viewBoxHeight);
    positions[i * 3 + 2] = (Math.random() - 0.5) * (opts.zJitter ?? 0.5);
    brightness[i] = d.b;
  }

  return { positions, brightness };
}

/** Re-export under a clearer name; same implementation. */
export const dotsFromSvg = chainFromSvg;
