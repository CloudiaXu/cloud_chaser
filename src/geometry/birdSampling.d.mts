// Type declarations for the JS-side shared sampler. The runtime lives
// in birdSampling.mjs so Node can import it without a transpile step;
// TypeScript only needs this sidecar to keep birdFromImage.ts strict.

export interface BrightPixel {
  /** x within the crop (0..crop.w) */
  px: number;
  /** y within the crop (0..crop.h) */
  py: number;
  /** average brightness 0..1 of the source pixel */
  brightness: number;
}

export interface SampleBrightPixelsOptions {
  rgba: Uint8ClampedArray | Uint8Array;
  imageWidth: number;
  crop: { x: number; y: number; w: number; h: number };
  threshold: number;
  step: number;
}

export function sampleBrightPixels(
  opts: SampleBrightPixelsOptions
): BrightPixel[];

export function shuffleInPlace<T>(arr: T[], rand?: () => number): void;
