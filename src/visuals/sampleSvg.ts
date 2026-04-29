/**
 * SVG IMAGE SAMPLER
 * ─────────────────────────────────────────────────────────────────
 * Sample bright pixels from a region of the reference mockup, map them
 * to SVG coordinates, and render them with optional links between
 * neighboring points. This guarantees each card's visual matches the
 * mockup exactly (cube / flowchart / orbit / robot / torus / sphere).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

let imagePromise: Promise<HTMLImageElement> | null = null;
let imageData: { data: Uint8ClampedArray; width: number; height: number } | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  if (imagePromise) return imagePromise;
  imagePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
  return imagePromise;
}

async function ensureImageData(src: string) {
  if (imageData) return imageData;
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height);
  imageData = { data: d.data, width: img.width, height: img.height };
  return imageData;
}

export interface SvgSampleOptions {
  /** Reference image path. */
  imagePath: string;
  /** Crop in image-pixel coords containing the visual element. */
  crop: { x: number; y: number; w: number; h: number };
  /** Brightness threshold (0..1). */
  threshold: number;
  /** Approximate target dot count. Will be capped by available bright pixels. */
  count: number;
  /** Output SVG viewBox half-size (the SVG spans -size..+size in both axes). */
  svgSize: number;
  /** Whether to draw links between nearby sampled points. */
  drawLinks?: boolean;
  /** Max link distance in SVG units. */
  linkDistance?: number;
  /** Fill color for dots and links. */
  color?: string;
  /** Maximum dot radius in SVG units. */
  maxDotRadius?: number;
}

/**
 * Render a constellation into `container` by sampling the reference image.
 * Returns the SVG element. Async because image must be loaded once.
 */
export async function sampleSvgFromImage(
  container: HTMLElement,
  opts: SvgSampleOptions
): Promise<SVGSVGElement> {
  const img = await ensureImageData(opts.imagePath);

  // Pass 1: collect candidate pixels above threshold inside the crop.
  const candidates: { px: number; py: number; brightness: number }[] = [];
  const step = 2;
  const xEnd = Math.min(opts.crop.x + opts.crop.w, img.width);
  const yEnd = Math.min(opts.crop.y + opts.crop.h, img.height);
  for (let py = opts.crop.y; py < yEnd; py += step) {
    for (let px = opts.crop.x; px < xEnd; px += step) {
      const idx = (py * img.width + px) * 4;
      const r = img.data[idx] / 255;
      const g = img.data[idx + 1] / 255;
      const b = img.data[idx + 2] / 255;
      const brightness = (r + g + b) / 3;
      if (brightness > opts.threshold) {
        candidates.push({ px: px - opts.crop.x, py: py - opts.crop.y, brightness });
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No bright pixels in crop ${JSON.stringify(opts.crop)} above ${opts.threshold}`);
  }

  shuffle(candidates);
  const targetCount = Math.min(opts.count, candidates.length);
  const picked = candidates.slice(0, targetCount);

  // Map crop coords → SVG coords centered at origin.
  // Preserve aspect: scale uniformly to fit svgSize bounding box.
  const aspect = opts.crop.w / opts.crop.h;
  const svgW = aspect >= 1 ? opts.svgSize : opts.svgSize * aspect;
  const svgH = aspect >= 1 ? opts.svgSize / aspect : opts.svgSize;

  const points = picked.map((p) => ({
    x: (p.px / opts.crop.w - 0.5) * svgW * 2,
    y: (p.py / opts.crop.h - 0.5) * svgH * 2,
    brightness: p.brightness,
  }));

  // Build SVG.
  const padding = opts.svgSize * 0.15;
  const viewSize = opts.svgSize * 2 + padding * 2;
  const half = viewSize / 2;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${-half} ${-half} ${viewSize} ${viewSize}`);
  svg.setAttribute('class', 'svg-cluster svg-sampled');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.overflow = 'visible';

  const color = opts.color ?? '#ff5252';
  const maxDotRadius = opts.maxDotRadius ?? 2.4;

  // Draw links via stride neighbor sampling (cheap O(n*stride)).
  if (opts.drawLinks ?? true) {
    const linkDistSq = (opts.linkDistance ?? opts.svgSize * 0.18) ** 2;
    const stride = Math.min(15, points.length);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < Math.min(i + stride, points.length); j++) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const dSq = dx * dx + dy * dy;
        if (dSq > linkDistSq) continue;
        const fade = 1 - Math.sqrt(dSq) / Math.sqrt(linkDistSq);
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', points[i].x.toString());
        line.setAttribute('y1', points[i].y.toString());
        line.setAttribute('x2', points[j].x.toString());
        line.setAttribute('y2', points[j].y.toString());
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '0.4');
        line.setAttribute(
          'stroke-opacity',
          (fade * 0.5 * Math.min(points[i].brightness, points[j].brightness)).toFixed(2)
        );
        svg.appendChild(line);
      }
    }
  }

  for (const p of points) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', p.x.toString());
    dot.setAttribute('cy', p.y.toString());
    // Aggressive boost: dim source pixels still need to pop on dark bg.
    const displayB = Math.min(1, 0.6 + p.brightness * 0.8);
    dot.setAttribute('r', (1.2 + displayB * (maxDotRadius - 1.2)).toString());
    dot.setAttribute('fill', color);
    dot.setAttribute('fill-opacity', displayB.toFixed(2));
    svg.appendChild(dot);
  }

  container.appendChild(svg);
  return svg;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
