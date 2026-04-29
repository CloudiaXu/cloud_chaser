/**
 * SVG-BASED PARTICLE CLUSTERS
 * ─────────────────────────────────────────────────────────────────
 * Lightweight constellation visuals for cards, photo rings, and small
 * icon spots. Uses SVG (one element per cluster, no extra canvases or
 * Three.js scenes) — fast and tracks layout for free.
 *
 * Two visual types:
 *   ringConstellation()   — ring of dots, optional center, used for the
 *                           About photo halo.
 *   sphereConstellation() — fuzzy filled cluster + connecting lines,
 *                           used for the Selected Work / Thinking /
 *                           What-I-Do card visuals.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface RingOptions {
  /** Number of dots around the circumference. */
  dotCount?: number;
  /** Approximate ring radius (SVG units). */
  radius?: number;
  /** Per-dot radial jitter so the ring isn't perfectly geometric. */
  spread?: number;
  /** Color of the dots and lines. */
  color?: string;
  /** Whether to draw subtle chord lines between random dot pairs. */
  drawChords?: boolean;
  /** Maximum dot radius. */
  maxDotRadius?: number;
}

/** Ring of dots — a constellation halo around a focal element. */
export function ringConstellation(container: HTMLElement, opts: RingOptions = {}): SVGSVGElement {
  const dotCount = opts.dotCount ?? 36;
  const radius = opts.radius ?? 100;
  const spread = opts.spread ?? 14;
  const color = opts.color ?? '#ff5252';
  const drawChords = opts.drawChords ?? true;
  const maxDotRadius = opts.maxDotRadius ?? 2.6;

  const padding = radius * 0.25;
  const viewSize = (radius + spread + padding) * 2;
  const half = viewSize / 2;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${-half} ${-half} ${viewSize} ${viewSize}`);
  svg.setAttribute('class', 'svg-cluster svg-ring');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.overflow = 'visible';

  const points: { x: number; y: number; brightness: number }[] = [];
  for (let i = 0; i < dotCount; i++) {
    const angle = (i / dotCount) * Math.PI * 2 + (rand(i, 1) - 0.5) * 0.15;
    const r = radius + (rand(i, 2) - 0.5) * spread;
    points.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      brightness: 0.4 + rand(i, 3) * 0.6,
    });
  }

  if (drawChords) {
    // Chords: a few random connections between non-adjacent dots.
    const chordCount = Math.floor(dotCount * 0.25);
    for (let c = 0; c < chordCount; c++) {
      const a = points[Math.floor(rand(c, 7) * dotCount)];
      const b = points[Math.floor(rand(c, 11) * dotCount)];
      if (a === b) continue;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', a.x.toString());
      line.setAttribute('y1', a.y.toString());
      line.setAttribute('x2', b.x.toString());
      line.setAttribute('y2', b.y.toString());
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('stroke-opacity', '0.25');
      svg.appendChild(line);
    }
  }

  for (const p of points) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', p.x.toString());
    dot.setAttribute('cy', p.y.toString());
    dot.setAttribute('r', (1 + p.brightness * (maxDotRadius - 1)).toString());
    dot.setAttribute('fill', color);
    dot.setAttribute('fill-opacity', p.brightness.toFixed(2));
    svg.appendChild(dot);
  }

  container.appendChild(svg);
  return svg;
}

export interface SphereOptions {
  /** Approximate "size" of the sphere within the viewBox. */
  size?: number;
  /** Number of particle dots. */
  dotCount?: number;
  /** Color. */
  color?: string;
  /** How many connecting links to draw between nearby dots. */
  linkCount?: number;
  /** Visual character: 'sphere' (round 3D-ish), 'wireframe', 'cluster' (loose). */
  character?: 'sphere' | 'wireframe' | 'cluster';
  /** RNG seed for deterministic per-card variation. */
  seed?: number;
}

/**
 * Constellation "sphere" — a small particle blob with internal links,
 * suitable for filling card visual slots (130×130 etc.).
 */
export function sphereConstellation(container: HTMLElement, opts: SphereOptions = {}): SVGSVGElement {
  const size = opts.size ?? 100;
  const dotCount = opts.dotCount ?? 60;
  const color = opts.color ?? '#ff5252';
  const linkCount = opts.linkCount ?? 50;
  const character = opts.character ?? 'sphere';
  const seed = opts.seed ?? 0;

  const padding = size * 0.15;
  const viewSize = size + padding * 2;
  const half = viewSize / 2;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${-half} ${-half} ${viewSize} ${viewSize}`);
  svg.setAttribute('class', `svg-cluster svg-sphere svg-${character}`);
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.overflow = 'visible';

  const points: { x: number; y: number; brightness: number }[] = [];
  for (let i = 0; i < dotCount; i++) {
    const u = rand(i, seed + 1);
    const v = rand(i, seed + 2);
    let x: number, y: number;
    if (character === 'sphere') {
      // Bias toward center: sample radius via sqrt for more uniform area
      // distribution, then squash slightly to give a sphere feel.
      const r = Math.sqrt(u) * (size / 2);
      const a = v * Math.PI * 2;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else if (character === 'wireframe') {
      // Sparse hollow-ish: uniform over annulus from 0.3R to 1.0R.
      const r = (0.3 + u * 0.7) * (size / 2);
      const a = v * Math.PI * 2;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;
    } else {
      // 'cluster' — uneven blob, not centered.
      const r = u * (size / 2);
      const a = v * Math.PI * 2;
      x = Math.cos(a) * r + (rand(i, seed + 4) - 0.5) * size * 0.2;
      y = Math.sin(a) * r + (rand(i, seed + 5) - 0.5) * size * 0.2;
    }
    const brightness = 0.35 + rand(i, seed + 3) * 0.65;
    points.push({ x, y, brightness });
  }

  // Connect each point to its nearest few neighbors via index stride
  // (cheap pseudo-spatial). Not exact nearest-neighbor — but visually it
  // produces the woven look without an O(n²) pass.
  const links: [number, number][] = [];
  for (let i = 0; i < dotCount && links.length < linkCount; i++) {
    for (let j = i + 1; j < Math.min(i + 5, dotCount); j++) {
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const d = Math.hypot(dx, dy);
      if (d < size * 0.35) links.push([i, j]);
      if (links.length >= linkCount) break;
    }
  }

  for (const [i, j] of links) {
    const a = points[i];
    const b = points[j];
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', a.x.toString());
    line.setAttribute('y1', a.y.toString());
    line.setAttribute('x2', b.x.toString());
    line.setAttribute('y2', b.y.toString());
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '0.5');
    line.setAttribute('stroke-opacity', (Math.min(a.brightness, b.brightness) * 0.5).toFixed(2));
    svg.appendChild(line);
  }

  for (const p of points) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', p.x.toString());
    dot.setAttribute('cy', p.y.toString());
    dot.setAttribute('r', (0.6 + p.brightness * 1.6).toString());
    dot.setAttribute('fill', color);
    dot.setAttribute('fill-opacity', p.brightness.toFixed(2));
    svg.appendChild(dot);
  }

  container.appendChild(svg);
  return svg;
}

/** Stable per-(i, salt) pseudo-random in [0,1). */
function rand(i: number, salt: number): number {
  let x = (i + 1) * 374761393 + salt * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}
