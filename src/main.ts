import './style.css';
import { Scene } from './scene/Scene';
import { StateMachine } from './scene/StateMachine';
import { sampleBirdFromImage } from './geometry/birdFromImage';
import { chainFromSvg } from './geometry/chainFromSvg';
import { nebulaize, addHotSpots } from './geometry/nebulaize';
import { MouseAttractor } from './interaction/mouse';
import { ringConstellation } from './visuals/svgClusters';

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
    imagePath: `${import.meta.env.BASE_URL}reference.png`,
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
    svgPath: `${import.meta.env.BASE_URL}chain.svg`,
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
    imagePath: `${import.meta.env.BASE_URL}reference.png`,
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
  // Boosted to read as "constellation anchor stars" (matches footer
  // LET'S COMBINE star-river visual language), plus body + tail spots
  // so the bird's skeletal structure is implied by the bright nodes.
  addHotSpots(bird.positions, birdNebula, [
    { x: -7,  y: -2,  radius: 7,  boost: 0.65 }, // tail
    { x: 3,   y: 0.5, radius: 9,  boost: 0.85 }, // head / breast
    { x: 12,  y: -2,  radius: 8,  boost: 0.70 }, // body / wing root
    { x: 25,  y: 4.5, radius: 11, boost: 0.80 }, // wing apex
    { x: 41,  y: 1.5, radius: 8,  boost: 0.75 }, // wing tip far right
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
// Article dialogs. <dialog id="article-<slug>"> blocks are injected
// into index.html at build time by scripts/build_articles.mjs from
// posts/*.md. A thinking-card's "閱讀全文 →" link declares which slug
// to open via `data-article="<slug>"`. We open with the native
// dialog.showModal() so the browser handles focus trap, ESC-to-close,
// and body scroll lock for free.
// ────────────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLAnchorElement>('a[data-article]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const slug = link.dataset.article;
    if (!slug) return;
    const dialog = document.getElementById(`article-${slug}`) as HTMLDialogElement | null;
    if (!dialog) return;
    event.preventDefault();
    dialog.showModal();
  });
});

// Each dialog: close on backdrop click (the dialog itself receives the
// event when you click outside the inner <article>) and on the ×
// button. ESC is handled natively by <dialog>.
document.querySelectorAll<HTMLDialogElement>('dialog.article-dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog
    .querySelector<HTMLButtonElement>('[data-close-dialog]')
    ?.addEventListener('click', () => dialog.close());
});

// ────────────────────────────────────────────────────────────────────
// Card decorations (hand-composed inline SVG in index.html).
// Procedural sampling was removed in favour of intentional star
// placement.
// ────────────────────────────────────────────────────────────────────

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

// What I Do: 3 service icons are now hand-composed inline SVG in
// index.html (cube / flowchart / orbit) — sampling produced loose
// dot clouds that didn't read as semantic shapes at small sizes.
// See logo design memory: handcraft semantic marks, only use sampling
// for atmospheric/decorative density.

// Selected Work: each card's visual is now a hand-composed inline SVG
// in index.html (profile head / flow chain / shopping bot). Sampling
// produced unreadable text-shaped dot piles at this size; semantic
// silhouettes need intentional triangulation to read.

// Thinking: 3 card visuals are now hand-composed inline SVG in
// index.html (stuck-gear / handshake / rocket). Sampling produced
// uninterpretable red dot scatter at 120px — semantic icons need
// intentional star placement to read at this size.

// Tracing-reference controls (dev only):
//   T = hide / show
//   Y = cycle opacity: normal → faded → bright → normal
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  const refs = document.querySelectorAll<HTMLElement>('.ref-trace');
  if (!refs.length) return;
  if (k === 't') refs.forEach((el) => el.classList.toggle('hidden'));
  if (k === 'y') {
    refs.forEach((el) => {
      const cur =
        el.classList.contains('faded') ? 'faded' :
        el.classList.contains('bright') ? 'bright' : 'normal';
      el.classList.remove('faded', 'bright');
      const next = cur === 'normal' ? 'faded' : cur === 'faded' ? 'bright' : 'normal';
      if (next !== 'normal') el.classList.add(next);
    });
  }
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
