import './style.css';
import { Scene } from './scene/Scene';
import { StateMachine } from './scene/StateMachine';
import { sampleBirdFromImage } from './geometry/birdFromImage';
import { chainFromSvg } from './geometry/chainFromSvg';
import { nebulaize, addHotSpots } from './geometry/nebulaize';
import { MouseAttractor } from './interaction/mouse';
import { ringConstellation } from './visuals/svgClusters';
import { sampleSvgFromImage } from './visuals/sampleSvg';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const scene = new Scene(canvas);
const sm = new StateMachine(scene.particles);
const mouse = new MouseAttractor(scene.camera);

// `baseline` holds the target positions for all particles (bird + wave +
// ambient). Gets filled once the reference image has been sampled.
let baseline = new Float32Array(scene.particles.count * 3);
let baselineReady = false;

scene.particles.scatterInitial(45);

// Three sampling regions, each capturing a different design element:
//   1. BIRD     — tight crop, high threshold → bright dense bird silhouette
//   2. WAVE     — bottom band, low threshold → the horizontal flowing wave
//   3. AMBIENT  — right side (above bird's lower half), low threshold →
//                 scattered atmospheric particles, avoiding the text area
//
// The text "CONNECT THE DOTS" sits in image-x≈40..360. Both ambient/wave
// crops carefully start at x≥360 to avoid sampling the text pixels.
const TOTAL = scene.particles.count;
const BIRD_COUNT = Math.floor(TOTAL * 0.63);   // 1512 of 2400 — denser bird
const WAVE_COUNT = 650;                         // chain.svg woven beads
const AMBIENT_COUNT = TOTAL - BIRD_COUNT - WAVE_COUNT;

(async () => {
  const bird = await sampleBirdFromImage({
    imagePath: '/reference.png',
    crop: { x: 350, y: 15, w: 530, h: 540 },
    threshold: 0.32,
    count: BIRD_COUNT,
    worldWidth: 58,
    // Math: mockup bird crop center (1331, 617) on a 1920×1080 viewport
    // back-projects to world (17.1, -3.55) at our camera (z=60, fov=45).
    centerX: 17,
    centerY: -3.5,
    zJitter: 1.4,
  });

  // Nebula dispersion: particles past the bird's centerX get progressively
  // jittered outward — left side (head/body) stays tight & dense, right
  // side (wings/tail) thins out like a cloud dissolving into space.
  // Quadratic falloff (t²) so the scattering accelerates at the edges.
  // bird spans world x ∈ [-12, 46]; dispersion engages for x > centerX (17).
  const BIRD_CENTER_X = 17;
  const BIRD_RIGHT_EDGE = 46;
  const MAX_JITTER = 4.5; // world units of max displacement at far right
  for (let i = 0; i < BIRD_COUNT; i++) {
    const i3 = i * 3;
    const t = Math.max(0, (bird.positions[i3] - BIRD_CENTER_X) /
                          (BIRD_RIGHT_EDGE - BIRD_CENTER_X));
    const jitter = t * t * MAX_JITTER;
    bird.positions[i3]     += (Math.random() - 0.5) * jitter;
    bird.positions[i3 + 1] += (Math.random() - 0.5) * jitter;
    bird.positions[i3 + 2] += (Math.random() - 0.5) * jitter * 0.6;
  }

  // Chain woven below the bird: position + brightness sourced directly
  // from /public/chain.svg (the user-supplied design). The SVG's circles
  // are extracted and replayed through our particle system so the wave
  // shares the same scatter→form animation as the bird.
  // scaleY=18 ≈ aspect-preserving (SVG viewBox is 1400x400 → 3.5:1, world
  // width is 74, so height should be ~21 to keep the woven curves intact).
  // baseY=-19 pushes the band well below CTA so the now-taller wave
  // doesn't crowd the bird above.
  const wave = await chainFromSvg({
    svgPath: '/chain.svg',
    viewBoxWidth: 1400,
    viewBoxHeight: 400,
    startX: -42,
    endX: 32,
    baseY: -19,
    scaleY: 18,
    count: WAVE_COUNT,
    zJitter: 0.5,
  });

  // (Hero text is rendered as a static <img src="/text.svg"> in index.html
  // — particle text was visually too noisy alongside the bird.)

  // Ambient: dim "stars" surrounding the bird. Crop excludes the text
  // column (x<360) AND the button row (y>410) so we don't sample those
  // pixels. Threshold tuned to keep a few hundred candidate pixels while
  // skipping tiny gray text remnants.
  const ambient = await sampleBirdFromImage({
    imagePath: '/reference.png',
    crop: { x: 360, y: 30, w: 510, h: 380 },
    threshold: 0.20,
    count: AMBIENT_COUNT,
    worldWidth: 56,
    centerX: 17,    // matches bird align
    centerY: 1.5,   // matches bird align (centered slightly above bird)
    zJitter: 0.7,
  });

  // Concatenate: bird, then wave, then ambient.
  const positions = new Float32Array(TOTAL * 3);
  positions.set(bird.positions, 0);
  positions.set(wave.positions, BIRD_COUNT * 3);
  positions.set(ambient.positions, (BIRD_COUNT + WAVE_COUNT) * 3);

  // Nebula brightness: bird + ambient get re-tiered into stars/mid/dust
  // so they read as glowing gas rather than uniform mesh. Wave brightness
  // is preserved as-is because chain.svg's per-circle opacity already
  // encodes that designer intent (and we don't want to override it).
  const birdNebula = nebulaize(BIRD_COUNT);
  const ambientNebula = nebulaize(AMBIENT_COUNT);

  // Hot spots boost brightness around specific bird anatomy points so
  // the eye sees clear highlight clusters (head/wing apex/wing tip)
  // rather than a uniformly-sparkly cloud. Coords follow the bird's
  // current center (17, -3.5) — shift if you re-center the bird.
  addHotSpots(bird.positions, birdNebula, [
    { x: 3,   y: 0.5, radius: 9,  boost: 0.55 }, // head / breast
    { x: 25,  y: 4.5, radius: 11, boost: 0.50 }, // wing apex
    { x: 41,  y: 1.5, radius: 8,  boost: 0.45 }, // wing tip far right
  ]);

  // Wave brightness preserved as-is so it reads as the same blue
  // as the bird. (Earlier we scaled it to 0.55 to keep the bird focal,
  // but that visually shifted wave's hue toward darker — the user
  // wanted unified color, so we keep brightness 1:1 with bird.)
  const waveBrightness = wave.brightness;

  const brightness = new Float32Array(TOTAL);
  brightness.set(birdNebula, 0);
  brightness.set(waveBrightness, BIRD_COUNT);
  brightness.set(ambientNebula, BIRD_COUNT + WAVE_COUNT);

  baseline.set(positions);
  scene.particles.setBrightness(brightness);
  // Wave particles: pure dots only, no constellation links between them.
  for (let i = BIRD_COUNT; i < BIRD_COUNT + WAVE_COUNT; i++) {
    scene.particles.noLinkFlags[i] = 1;
  }
  baselineReady = true;
  setTimeout(() => sm.setState('forming'), 250);
})().catch((err) => console.error('[bird] image sampling failed:', err));

let lastTime = performance.now();
let time = 0;

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  time += dt;

  if (baselineReady) {
    const breathe = sm.getState() === 'breathing' ? Math.sin(time * 0.8) * 0.03 : 0;
    if (breathe !== 0) {
      for (let i = 0; i < baseline.length; i++) {
        scene.particles.target[i] = baseline[i] * (1 + breathe);
      }
    } else {
      scene.particles.target.set(baseline);
    }

    if (sm.getState() !== 'scattered' && sm.getState() !== 'forming') {
      mouse.applyTo(scene.particles.target, scene.particles.target, scene.particles.count);
      if (mouse.active && sm.getState() !== 'attracted') sm.setState('attracted');
      else if (!mouse.active && sm.getState() === 'attracted') sm.setState('breathing');
    }
  }

  sm.step(dt);
  scene.particles.updateLinks();
  scene.render();

  requestAnimationFrame(frame);
}

requestAnimationFrame((t) => {
  lastTime = t;
  frame(t);
});

// Scroll-aware scene: shift the whole scene UP as the page scrolls down,
// so particles "belong" to specific sections rather than being pinned
// to the viewport. Canvas stays position:fixed for performance; only the
// scene's internal Y is adjusted. Each section's particles can later
// live at their own world-Y, and they'll naturally enter/leave view.
function applyScrollOffset() {
  const scrollY = window.scrollY;
  // World units per pixel — uses live camera distance so the offset
  // stays consistent when handleResize() pulls the camera back on
  // narrow (mobile-portrait) viewports.
  const worldHeight = 2 * scene.camera.position.z * Math.tan(Math.PI / 8);
  const worldPerPx = worldHeight / window.innerHeight;
  scene.scene.position.y = scrollY * worldPerPx;
}
window.addEventListener('scroll', applyScrollOffset, { passive: true });
applyScrollOffset();

document.querySelectorAll<HTMLElement>('[data-cta]').forEach((btn) => {
  btn.addEventListener('mouseenter', () => {
    mouse.strength = 4;
    mouse.radius = 9;
  });
  btn.addEventListener('mouseleave', () => {
    mouse.strength = 2.4;
    mouse.radius = 6;
  });
});

// ────────────────────────────────────────────────────────────────────
// SVG visuals: sampled directly from the mockup so each card's shape
// matches the design (cube, flowchart, orbit, robot, torus, sphere).
// Crops are in image-pixel coords against the 887x1774 reference.
// ────────────────────────────────────────────────────────────────────

const REF = '/reference.png';

// About photo halo: procedural dense ring of dots reads as atmospheric
// "halo glow" around the portrait — better than handcrafted sparse
// constellation (which felt empty in this size). DEV red palette.
const photoRing = document.querySelector<HTMLElement>('.photo-ring');
if (photoRing) {
  ringConstellation(photoRing, {
    /* Radius/spread tuned for the 420px photo at 1920w. */
    dotCount: 210,
    radius: 230,
    spread: 28,
    color: '#4ea0ff',
    drawChords: true,
    maxDotRadius: 2.8,
  });
}

// About side icons: hand-composed inline SVG in index.html (cube /
// hexagon / radial-burst). Each shape semantically matches its label
// — "currently building" / "domains" / "outward collaboration".

// What I Do: 3 service icons (cube / flowchart / orbit) — visuals on LEFT.
const serviceCrops = [
  { x: 70, y: 880, w: 140, h: 140 },   // AI 產品開發 — wireframe cube
  { x: 290, y: 890, w: 175, h: 130 },  // 流程與體驗設計 — flowchart
  { x: 525, y: 880, w: 150, h: 140 },  // 商業思維 — orbit/planet
];
document.querySelectorAll<HTMLElement>('.service-icon').forEach((el, i) => {
  sampleSvgFromImage(el, {
    imagePath: REF,
    crop: serviceCrops[i] ?? serviceCrops[0],
    threshold: 0.12,
    count: 110,
    svgSize: 40,
    drawLinks: true,
    linkDistance: 14,
    color: '#ff5252',
    maxDotRadius: 2.6,
  }).catch((e) => console.warn('service icon sample failed', i, e));
});

// Selected Work: visuals on RIGHT side of each card (sphere / torus / ROBOT).
const workCrops = [
  { x: 245, y: 1075, w: 145, h: 175 },  // ELEMI — dense sphere
  { x: 510, y: 1075, w: 130, h: 175 },  // 客服流程優化 — stacked torus
  { x: 750, y: 1065, w: 140, h: 185 },  // 電商導購機器人 — ROBOT
];
document.querySelectorAll<HTMLElement>('.work-visual').forEach((el, i) => {
  sampleSvgFromImage(el, {
    imagePath: REF,
    crop: workCrops[i] ?? workCrops[0],
    threshold: 0.12,
    count: 200,
    svgSize: 78,
    drawLinks: true,
    linkDistance: 18,
    color: '#ff5252',
    maxDotRadius: 2.6,
  }).catch((e) => console.warn('work visual sample failed', i, e));
});

// Thinking: 3 card visuals on RIGHT side of each card (different globes).
const thinkingCrops = [
  { x: 220, y: 1305, w: 130, h: 165 },
  { x: 480, y: 1305, w: 130, h: 165 },
  { x: 735, y: 1305, w: 130, h: 165 },
];
document.querySelectorAll<HTMLElement>('.thinking-visual').forEach((el, i) => {
  sampleSvgFromImage(el, {
    imagePath: REF,
    crop: thinkingCrops[i] ?? thinkingCrops[0],
    threshold: 0.13,
    count: 150,
    svgSize: 62,
    drawLinks: true,
    linkDistance: 16,
    color: '#ff5252',
    maxDotRadius: 2.4,
  }).catch((e) => console.warn('thinking visual sample failed', i, e));
});

// Design guide controls (dev only):
//   G = hide / show
//   F = cycle opacity: normal → faded → bright → normal
const guide = document.querySelector<HTMLElement>('#design-guide');
if (guide) {
  let opacityState: 'normal' | 'faded' | 'bright' = 'normal';
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'g') {
      guide.classList.toggle('hidden');
    } else if (k === 'f') {
      guide.classList.remove('faded', 'bright');
      opacityState =
        opacityState === 'normal' ? 'faded' : opacityState === 'faded' ? 'bright' : 'normal';
      if (opacityState !== 'normal') guide.classList.add(opacityState);
    }
  });
}
