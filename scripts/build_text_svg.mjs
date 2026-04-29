/**
 * Build /public/text.svg from /text_dots.svg in one pass:
 *   1. Strip the background rect (so SVG is transparent on dark page).
 *   2. Tint pure-white #ffffff cores into pale blue #cdedff so the
 *      slogan reads as light-blue typography rather than white-on-dark.
 *   3. For each O letter:
 *        - replace the closed ellipse polyline with a true <circle r=55>
 *        - shift the circle's center right by +22 to keep the gap to the
 *          previous letter unchanged (since the new circle expands ±22)
 *        - remap the O's vertex dots onto the new circle's perimeter
 *        - shift all other elements on the SAME LINE that sit to the
 *          right of the original O by +44 (full width difference) so
 *          letter-to-letter spacing stays uniform downstream.
 *
 * Coordinates only — no font metrics. Lines are detected by y-bands.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'text_dots.svg');
const DST = path.join(here, '..', 'public', 'text.svg');

let svg = fs.readFileSync(SRC, 'utf8');

// 1. Strip dark background rect.
svg = svg.replace(
  '<rect width="1216" height="654" fill="url(#bg)"/>',
  '<!-- bg removed -->'
);

// 2. Tint the pure-white cores into a pale blue so the slogan reads as
// "blue typography" rather than "white text on dark". The two SOLID
// `<g fill="#ffffff">` layers (small bright dots) become #cdedff, and
// the innermost gradient stops (#ffffff in radialGradient defs) also
// shift so the dots' centers tint pale-blue instead of harsh white.
svg = svg.split('"#ffffff"').join('"#cdedff"')
         .split('#ffffff').join('#cdedff');

// Constants for the typography:
const ORIG_RX = 33;     // half-width of all letters in this SVG
const NEW_R = 55;       // circle radius = full letter half-height
const HALF_GROW = NEW_R - ORIG_RX;   // 22 — how much the O's center shifts
const FULL_GROW = HALF_GROW * 2;     // 44 — how much post-O letters shift

// Line bands (y-ranges) used to scope per-line shifts. Each band's
// lower bound is extended ~20px past the letter baseline to include
// punctuation descenders (comma, period) so they shift with their line.
const LINE_BANDS = [
  { yMin: 80, yMax: 225 },     // line 1: CONNECT
  { yMin: 240, yMax: 390 },    // line 2: THE DOTS,  (comma tail at y≈374)
  { yMin: 400, yMax: 540 },    // line 3: CREATE VALUE.
];
function lineOf(y) {
  return LINE_BANDS.findIndex((b) => y >= b.yMin && y <= b.yMax);
}

// Pass A — find each O letter (closed circular polyline) and record the
// transformation that letter triggers. We don't mutate the SVG yet.
const polylineRe = /<polyline\s+points="([^"]+)"\s*\/>/g;
const Os = []; // { line, oldCx, oldCy, newCx, originalRightEdge, oldVertices: [{x,y}] }
for (const m of [...svg.matchAll(polylineRe)]) {
  const pts = m[1].trim().split(/\s+/).map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
  if (pts.length < 6) continue;
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) >= 4) continue;

  // Reject polylines with a long flat side (D etc.).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  let maxFlatFrac = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.x - b.x) < 0.5)
      maxFlatFrac = Math.max(maxFlatFrac, Math.abs(a.y - b.y) / (maxY - minY));
    if (Math.abs(a.y - b.y) < 0.5)
      maxFlatFrac = Math.max(maxFlatFrac, Math.abs(a.x - b.x) / (maxX - minX));
  }
  if (maxFlatFrac > 0.30) continue; // not a circle (D/B/P/R/...)

  const oldCx = (minX + maxX) / 2;
  const oldCy = (minY + maxY) / 2;
  const li = lineOf(oldCy);
  if (li < 0) continue;

  const unique = Math.hypot(first.x - last.x, first.y - last.y) < 0.01
    ? pts.slice(0, -1) : pts;

  // Dedupe O letters by (cx, cy) — same letter appears in multiple
  // <g> stroke layers, but the transformation is identical for all.
  if (Os.find((o) => o.line === li && Math.abs(o.oldCx - oldCx) < 1)) continue;

  Os.push({
    line: li,
    oldCx,
    oldCy,
    newCx: oldCx + HALF_GROW,
    originalRightEdge: oldCx + ORIG_RX, // 246 for CONNECT O at 213
    oldVertices: unique,
  });
}

// Pass B — apply per-line shifts to every <circle>, <polyline>, <line>, etc.
// For each (cx, cy) coordinate pair in the SVG, decide its shift delta.
// We process attribute occurrences one-by-one rather than line-by-line so
// dot remaps are exact.

// Build a remap table: for each original (x, y), what's the new (x, y)?
// (Identity by default; overridden when on or right of an O.)
function shiftPoint(x, y) {
  const li = lineOf(y);
  if (li < 0) return { x, y };
  for (const O of Os) {
    if (O.line !== li) continue;
    // O's own vertex dots → project onto the new circle.
    for (const v of O.oldVertices) {
      if (Math.abs(v.x - x) < 0.5 && Math.abs(v.y - y) < 0.5) {
        const ang = Math.atan2(y - O.oldCy, x - O.oldCx);
        return {
          x: Number((O.newCx + NEW_R * Math.cos(ang)).toFixed(2)),
          y: Number((O.oldCy + NEW_R * Math.sin(ang)).toFixed(2)),
        };
      }
    }
    // Anything strictly to the right of the original O's right edge
    // shifts by +44 (full width difference) so the next letter's
    // pre-gap matches what it was before the O grew.
    if (x > O.originalRightEdge + 0.5) {
      return { x: Number((x + FULL_GROW).toFixed(2)), y };
    }
  }
  return { x, y };
}

// Apply to every "cx=, cy=" pair in <circle> / <ellipse> elements.
svg = svg.replace(/cx="([^"]+)"\s+cy="([^"]+)"/g, (_, cxStr, cyStr) => {
  const { x, y } = shiftPoint(parseFloat(cxStr), parseFloat(cyStr));
  return `cx="${x}" cy="${y}"`;
});

// Apply to polyline points.
svg = svg.replace(/<polyline\s+points="([^"]+)"\s*\/>/g, (orig, ptsStr) => {
  const pts = ptsStr.trim().split(/\s+/).map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
  // If this polyline IS one of the Os we're replacing, swap for a circle.
  if (pts.length >= 6) {
    const first = pts[0], last = pts[pts.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 4) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const matched = Os.find(
        (o) => Math.abs(o.oldCx - cx) < 1 && Math.abs(o.oldCy - cy) < 1
      );
      if (matched) {
        return `<circle cx="${matched.newCx}" cy="${matched.oldCy}" r="${NEW_R}"/>`;
      }
    }
  }
  // Otherwise shift each point of the polyline.
  const shifted = pts.map((p) => {
    const { x, y } = shiftPoint(p.x, p.y);
    return `${x},${y}`;
  });
  return `<polyline points="${shifted.join(' ')}"/>`;
});

// 5. Make "VALUE" deeper blue than the rest. VALUE+. spans roughly
// cx 670-1130 in line 3 (y 400-540). Add an explicit `stroke=`
// attribute to each polyline whose points all fall inside that bbox
// — the attribute overrides the parent <g stroke=...> color.
const VALUE_BBOX = { xMin: 670, xMax: 1130, yMin: 400, yMax: 540 };
const VALUE_STROKE = '#5ec6ff'; // a step deeper than the bird's #7ad6ff

svg = svg.replace(/<polyline\s+points="([^"]+)"\s*\/>/g, (orig, ptsStr) => {
  const pts = ptsStr.trim().split(/\s+/).map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
  const inValue = pts.every(
    (p) => p.x >= VALUE_BBOX.xMin && p.x <= VALUE_BBOX.xMax &&
           p.y >= VALUE_BBOX.yMin && p.y <= VALUE_BBOX.yMax
  );
  if (!inValue) return orig;
  return `<polyline points="${ptsStr}" stroke="${VALUE_STROKE}"/>`;
});

fs.writeFileSync(DST, svg);
console.log(`built text.svg: ${Os.length} O letters → circles r=${NEW_R}, post-O letters shifted +${FULL_GROW}`);
