// Probe: scan reference.png top-half, report bright-pixel bbox by row.
// Used once to find the bird's true extent before setting CROP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const png = PNG.sync.read(fs.readFileSync(path.join(here, '..', 'public', 'reference.png')));
const W = png.width, H = png.height, data = png.data;
console.log(`image: ${W} x ${H}`);

// Walk the top 700 rows (hero region), find rightmost / leftmost bright pixel per row band.
const THRESHOLD = 0.22;
const ROW_BAND = 20;
console.log('\nrow_band   minX   maxX   minBright  maxBright  count  notes');
for (let yBand = 0; yBand < 700; yBand += ROW_BAND) {
  let minX = W, maxX = -1, count = 0;
  for (let y = yBand; y < Math.min(yBand + ROW_BAND, H); y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
      const lum = (r + g + b) / 3;
      if (lum > THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        count++;
      }
    }
  }
  if (count > 0) {
    console.log(`y=${String(yBand).padStart(4)}-${String(yBand+ROW_BAND).padStart(4)}  ${String(minX).padStart(4)}  ${String(maxX).padStart(4)}  ${String(count).padStart(6)}`);
  } else {
    console.log(`y=${String(yBand).padStart(4)}-${String(yBand+ROW_BAND).padStart(4)}  (no bright pixels)`);
  }
}
