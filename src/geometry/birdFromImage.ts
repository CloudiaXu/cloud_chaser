/**
 * BIRD FROM IMAGE
 * ─────────────────────────────────────────────────────────────────
 * Load the reference mockup, crop to the bird region, threshold to
 * isolate bright pixels (the bird's particles in the original art),
 * and sample N positions in world coordinates.
 *
 * This trades the "every dot has a math reason" purity for
 * "the silhouette literally matches the reference."
 */

export interface SampleOptions {
  /** Path served by Vite (e.g. /reference.png). */
  imagePath: string;
  /** Crop in image-pixel coordinates: which rectangle contains the bird. */
  crop: { x: number; y: number; w: number; h: number };
  /** Brightness threshold (0..1). Pixels above this are candidate bird points. */
  threshold: number;
  /** How many particles to allocate. */
  count: number;
  /** Final bird width in world units (height derived from crop aspect). */
  worldWidth: number;
  /** World-space center of the bird. */
  centerX: number;
  centerY: number;
  /** Z depth jitter range. */
  zJitter: number;
}

export interface BirdSample {
  /** Length count*3, xyz per particle. */
  positions: Float32Array;
  /** Length count, raw 0..1 brightness from the source pixel. */
  brightness: Float32Array;
}

/**
 * Sample bird positions AND each particle's source-pixel brightness.
 * Preserving brightness is what gives the silhouette its depth — the
 * artist's "where is this dot bright vs. faint" decision is transferred.
 */
export async function sampleBirdFromImage(opts: SampleOptions): Promise<BirdSample> {
  const img = await loadImage(opts.imagePath);

  const c = document.createElement('canvas');
  c.width = opts.crop.w;
  c.height = opts.crop.h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(
    img,
    opts.crop.x, opts.crop.y, opts.crop.w, opts.crop.h,
    0, 0, opts.crop.w, opts.crop.h
  );
  const data = ctx.getImageData(0, 0, opts.crop.w, opts.crop.h).data;

  // Pass 1: collect candidate pixels above brightness threshold.
  // Step by 1 px would over-densify; step by 2 keeps it light and fast.
  const candidates: { px: number; py: number; brightness: number }[] = [];
  const step = 2;
  for (let py = 0; py < opts.crop.h; py += step) {
    for (let px = 0; px < opts.crop.w; px += step) {
      const idx = (py * opts.crop.w + px) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;
      const brightness = (r + g + b) / 3;
      if (brightness > opts.threshold) {
        candidates.push({ px, py, brightness });
      }
    }
  }

  if (candidates.length < opts.count) {
    throw new Error(
      `Only ${candidates.length} bright pixels above threshold ${opts.threshold}; need ${opts.count}. Lower the threshold.`
    );
  }

  // Pass 2: random subsample to exactly `count`.
  // Brightness-weighted would clump on the brightest pixels — for now uniform
  // sampling preserves outline coverage. (Easy knob if you want it later.)
  shuffle(candidates);
  const picked = candidates.slice(0, opts.count);

  // Map pixel coords → world coords.
  // Image y grows downward; world y grows upward → flip.
  const aspect = opts.crop.h / opts.crop.w;
  const worldHeight = opts.worldWidth * aspect;

  const positions = new Float32Array(opts.count * 3);
  const brightness = new Float32Array(opts.count);
  for (let i = 0; i < opts.count; i++) {
    const p = picked[i];
    const u = p.px / opts.crop.w;
    const v = p.py / opts.crop.h;
    const wx = (u - 0.5) * opts.worldWidth + opts.centerX;
    const wy = (0.5 - v) * worldHeight + opts.centerY;
    const wz = (Math.random() - 0.5) * opts.zJitter;
    positions[i * 3] = wx;
    positions[i * 3 + 1] = wy;
    positions[i * 3 + 2] = wz;
    brightness[i] = p.brightness;
  }
  return { positions, brightness };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
