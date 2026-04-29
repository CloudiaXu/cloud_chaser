import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';

/**
 * Generate a radial-gradient glow texture used as the particle sprite.
 * Center: opaque white. Edge: transparent. With AdditiveBlending this
 * makes each particle look like a self-illuminating dot — without
 * needing screen-wide post-processing (which produced the blue haze).
 */
function createGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Tight bright core, soft fall-off, fully transparent edge.
  g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.18, 'rgba(255, 255, 255, 0.55)');
  g.addColorStop(0.45, 'rgba(255, 255, 255, 0.12)');
  g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly particles: ParticleSystem;

  private size = { w: 0, h: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Transparent clear so the body bg (and design-guide mockup) show through.
    this.renderer.setClearColor(0x05070d, 0);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 60);
    this.camera.lookAt(0, 0, 0);

    const isMobile = window.matchMedia('(max-width: 720px)').matches;

    this.particles = new ParticleSystem({
      // Bird (focal) + wave (bottom) + ambient (right of text).
      // Bumped from 1900 → 2400 so the bird body reads as denser nebula.
      count: isMobile ? 1500 : 2400,
      // Deeper sky blue — recedes behind the slogan text so it stays
      // legible on mobile (where bird overlaps the .lede column).
      color: 0x4ea0ff,
      // 2× previous (was 0.55 / 0.7) — user wanted dots noticeably bigger
      // so the nebula's bright stars read as proper highlights.
      size: isMobile ? 1.1 : 1.4,
      // Slightly extended so doubled-size dots keep proportional link reach.
      linkDistance: 4.5,
      // Boosted from 0.6 so lines (limited to 1px on WebGL) appear visually
      // thicker via additive blending stacking.
      linkOpacity: 0.95,
      maxLinksPerParticle: isMobile ? 5 : 9,
      sprite: createGlowTexture(),
    });
    this.scene.add(this.particles.group);

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  private handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.size.w = w;
    this.size.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull the camera further back on narrow viewports (mobile portrait)
    // so the bird (worldWidth=58) still fits horizontally. At fov=45,
    // visible width = 2 * z * tan(22.5°) * aspect. Solving for z when
    // we want at least 70 world units visible: z = 35 / (tan(22.5°)*aspect).
    const aspect = w / h;
    const targetVisibleWidth = 70;
    const tanHalfFov = Math.tan(Math.PI / 8);
    const minZ = targetVisibleWidth / (2 * tanHalfFov * aspect);
    this.camera.position.z = Math.max(60, minZ);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
