/**
 * BIRD FROM IMAGE — browser front-end
 * ─────────────────────────────────────────────────────────────────
 * Load the reference mockup, crop to the bird region, threshold to
 * isolate bright pixels (the bird's particles in the original art),
 * and sample N positions in Three.js world coordinates.
 *
 * Pixel sampling + shuffle are delegated to ./birdSampling.mjs so
 * the og-image build script can reuse THE SAME algorithm in Node.
 * This file's job is canvas decoding + world-space transform.
 */

import { sampleBrightPixels, shuffleInPlace } from './birdSampling.mjs';

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

  // Pass 1: shared sampler — same code path the og-image builder runs.
  // Buffer is already pre-cropped to opts.crop.w × opts.crop.h, so we
  // pass a 0-origin crop and use the buffer's own width.
  const candidates = sampleBrightPixels({
    rgba: data,
    imageWidth: opts.crop.w,
    crop: { x: 0, y: 0, w: opts.crop.w, h: opts.crop.h },
    threshold: opts.threshold,
    step: 2,
  });

  if (candidates.length < opts.count) {
    throw new Error(
      `Only ${candidates.length} bright pixels above threshold ${opts.threshold}; need ${opts.count}. Lower the threshold.`
    );
  }

  // Pass 2: random subsample to exactly `count` (shared shuffle).
  // Brightness-weighted would clump on the brightest pixels — for now uniform
  // sampling preserves outline coverage. (Easy knob if you want it later.)
  shuffleInPlace(candidates);
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
