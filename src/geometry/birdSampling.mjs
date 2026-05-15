/**
 * BIRD SAMPLING — shared algorithm
 * ─────────────────────────────────────────────────────────────────
 * Pure-JS, no DOM. Both the live hero (browser) and the og-image
 * builder (Node) call into the SAME `sampleBrightPixels` and
 * `shuffleInPlace` from this file, so the bird's silhouette is
 * defined by ONE algorithm with two I/O front-ends:
 *
 *   browser : src/geometry/birdFromImage.ts
 *               loads /reference.png via <img>, draws to <canvas>,
 *               reads ImageData → sampleBrightPixels.
 *
 *   node    : scripts/build_bird_svg.mjs
 *               decodes public/reference.png with pngjs,
 *               passes the raw RGBA buffer → sampleBrightPixels.
 *
 * Authored as .mjs (not .ts) so node can import it without a
 * transpile step. Vite's `moduleResolution: bundler` lets .ts files
 * import it cleanly on the browser side.
 */

/**
 * Walk every `step`th pixel inside `crop`, return those above
 * `threshold` average brightness. Output coordinates are LOCAL to
 * the crop (0..crop.w, 0..crop.h) regardless of where the crop sits
 * inside the source buffer.
 *
 * @param {object}            o
 * @param {Uint8ClampedArray|Uint8Array} o.rgba         flat RGBA buffer
 * @param {number}            o.imageWidth              source buffer width in px
 * @param {{x:number,y:number,w:number,h:number}} o.crop
 * @param {number}            o.threshold               0..1, brightness floor
 * @param {number}            o.step                    pixel sampling step
 * @returns {Array<{px:number,py:number,brightness:number}>}
 */
export function sampleBrightPixels({ rgba, imageWidth, crop, threshold, step }) {
  const candidates = [];
  for (let py = 0; py < crop.h; py += step) {
    const yAbs = crop.y + py;
    for (let px = 0; px < crop.w; px += step) {
      const xAbs = crop.x + px;
      const idx = (yAbs * imageWidth + xAbs) * 4;
      const r = rgba[idx]     / 255;
      const g = rgba[idx + 1] / 255;
      const b = rgba[idx + 2] / 255;
      const brightness = (r + g + b) / 3;
      if (brightness > threshold) {
        candidates.push({ px, py, brightness });
      }
    }
  }
  return candidates;
}

/**
 * Fisher–Yates shuffle in place. `rand` defaults to `Math.random` for
 * the live hero (different bird every reload). The og-image builder
 * passes a seeded PRNG so its bird stays byte-stable between rebuilds.
 *
 * @template T
 * @param {T[]} arr
 * @param {() => number} [rand]
 */
export function shuffleInPlace(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
