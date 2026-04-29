import * as THREE from 'three';

export interface ParticleSystemOptions {
  count: number;
  color: THREE.ColorRepresentation;
  size: number;
  linkDistance: number;
  linkOpacity: number;
  maxLinksPerParticle: number;
  /** Optional sprite texture for each particle (e.g. radial glow). */
  sprite?: THREE.Texture;
}

/**
 * Owns three parallel buffers for N particles:
 *   current[i]  — where particle i is right now
 *   target[i]   — where it wants to be (set by state machine)
 *   velocity[i] — for spring-damper motion
 *
 * Plus a LineSegments mesh for the constellation links.
 */
export class ParticleSystem {
  readonly group = new THREE.Group();
  readonly count: number;

  readonly current: Float32Array;
  readonly target: Float32Array;
  readonly velocity: Float32Array;
  /** Per-particle 0..1 brightness (set by setBrightness). */
  readonly brightness: Float32Array;
  /** Per-particle flag: 1 = exclude from constellation links. */
  readonly noLinkFlags: Uint8Array;

  private points!: THREE.Points;
  private positionAttr!: THREE.BufferAttribute;
  private colorAttr!: THREE.BufferAttribute;
  private sizeAttr!: THREE.BufferAttribute;
  private particleColors!: Float32Array;
  private particleSizes!: Float32Array;

  private links!: THREE.LineSegments;
  private linkPositions!: Float32Array;
  private linkColors!: Float32Array;
  private linkPositionAttr!: THREE.BufferAttribute;
  private linkColorAttr!: THREE.BufferAttribute;
  private maxLinks: number;

  private opts: ParticleSystemOptions;

  constructor(opts: ParticleSystemOptions) {
    this.opts = opts;
    this.count = opts.count;
    this.current = new Float32Array(this.count * 3);
    this.target = new Float32Array(this.count * 3);
    this.velocity = new Float32Array(this.count * 3);
    this.brightness = new Float32Array(this.count).fill(1);
    this.noLinkFlags = new Uint8Array(this.count);
    this.particleColors = new Float32Array(this.count * 3);
    this.particleSizes = new Float32Array(this.count);
    this.maxLinks = this.count * opts.maxLinksPerParticle;
    this.fillParticleColors();
    this.fillParticleSizes();

    this.buildPoints();
    this.buildLinks();
  }

  private buildPoints() {
    const geom = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.current, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('position', this.positionAttr);

    this.colorAttr = new THREE.BufferAttribute(this.particleColors, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('color', this.colorAttr);

    this.sizeAttr = new THREE.BufferAttribute(this.particleSizes, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('size', this.sizeAttr);

    // Custom shader: per-particle size attribute + glow sprite, with
    // perspective scaling so size feels consistent across z depth.
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.opts.sprite ?? null },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Perspective size attenuation; the constant tunes overall scale.
          gl_PointSize = size * uPixelRatio * (650.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor, 1.0) * t;
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geom, mat);
    this.group.add(this.points);
  }

  private fillParticleSizes() {
    // Per-particle size scales with brightness:
    // - very bright pixels become big "stars" (1.5x base)
    // - average pixels are baseline (1.0x)
    // - dim pixels are small "dust" (0.45x)
    // The reference image's bird has all three tiers — that's what gives
    // it visual rhythm rather than uniform sparkle.
    const base = this.opts.size;
    for (let i = 0; i < this.count; i++) {
      const b = this.brightness[i]; // 0..1
      // Square the brightness to push contrast — bright stays bright, mid drops.
      const factor = 0.45 + Math.pow(b, 1.5) * 1.1;
      this.particleSizes[i] = base * factor;
    }
    if (this.sizeAttr) this.sizeAttr.needsUpdate = true;
  }

  /**
   * Apply per-particle brightness — modulates each particle's RGB
   * by its source-image brightness, mapped through a curve so the
   * range [0..1] reads as [dim..bright] visibly.
   */
  setBrightness(values: Float32Array) {
    for (let i = 0; i < this.count; i++) {
      this.brightness[i] = i < values.length ? values[i] : 1.0;
    }
    this.fillParticleColors();
    this.fillParticleSizes();
  }

  private fillParticleColors() {
    const c = new THREE.Color(this.opts.color);
    for (let i = 0; i < this.count; i++) {
      // (B) Wider, slightly hotter mapping. Floor 0.4 keeps dim pixels visible;
      // multiplier 1.4 pushes bright pixels into the bloom-trigger range
      // (anything > ~0.7 starts to glow noticeably with our bloom config).
      const b = Math.min(1.6, Math.max(0.4, this.brightness[i] * 1.4));
      const i3 = i * 3;
      this.particleColors[i3] = c.r * b;
      this.particleColors[i3 + 1] = c.g * b;
      this.particleColors[i3 + 2] = c.b * b;
    }
    if (this.colorAttr) this.colorAttr.needsUpdate = true;
  }

  private buildLinks() {
    const geom = new THREE.BufferGeometry();
    this.linkPositions = new Float32Array(this.maxLinks * 6); // 2 endpoints * xyz
    this.linkColors = new Float32Array(this.maxLinks * 6); // rgb per endpoint

    this.linkPositionAttr = new THREE.BufferAttribute(this.linkPositions, 3);
    this.linkPositionAttr.setUsage(THREE.DynamicDrawUsage);
    this.linkColorAttr = new THREE.BufferAttribute(this.linkColors, 3);
    this.linkColorAttr.setUsage(THREE.DynamicDrawUsage);

    geom.setAttribute('position', this.linkPositionAttr);
    geom.setAttribute('color', this.linkColorAttr);

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: this.opts.linkOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.links = new THREE.LineSegments(geom, mat);
    this.group.add(this.links);
  }

  /**
   * Set initial scattered positions — random cloud around origin.
   * Used as the "chaos" starting state before the bird forms.
   */
  scatterInitial(radius: number) {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const r = Math.random() * radius;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      this.current[i3] = r * Math.sin(phi) * Math.cos(theta);
      this.current[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.current[i3 + 2] = r * Math.cos(phi) * 0.3; // flatten z slightly
      this.target[i3] = this.current[i3];
      this.target[i3 + 1] = this.current[i3 + 1];
      this.target[i3 + 2] = this.current[i3 + 2];
    }
    this.positionAttr.needsUpdate = true;
  }

  /**
   * Spring-damper integration toward target positions.
   * stiffness: how aggressively particles pull toward target (0..1)
   * damping:   how much velocity is preserved each frame (0..1)
   */
  step(stiffness: number, damping: number) {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      for (let k = 0; k < 3; k++) {
        const idx = i3 + k;
        const dx = this.target[idx] - this.current[idx];
        this.velocity[idx] = this.velocity[idx] * damping + dx * stiffness;
        this.current[idx] += this.velocity[idx];
      }
    }
    this.positionAttr.needsUpdate = true;
  }

  /**
   * Build constellation links between nearby particles.
   * Uses neighbor sampling instead of full O(n²) — for each particle,
   * we only check the next N particles in array order. This works well
   * because the parametric bird emits points in coherent regions.
   */
  updateLinks(strideCheck = 18) {
    const linkColor = new THREE.Color(this.opts.color);
    const maxDistSq = this.opts.linkDistance * this.opts.linkDistance;
    let writeIdx = 0;
    const maxWrite = this.maxLinks * 6;

    for (let i = 0; i < this.count && writeIdx < maxWrite; i++) {
      if (this.noLinkFlags[i]) continue;
      const ai = i * 3;
      const ax = this.current[ai];
      const ay = this.current[ai + 1];
      const az = this.current[ai + 2];
      const ba = Math.min(1.6, Math.max(0.35, this.brightness[i] * 1.3));

      for (let j = i + 1; j < Math.min(i + strideCheck, this.count); j++) {
        if (writeIdx >= maxWrite) break;
        if (this.noLinkFlags[j]) continue;
        const bi = j * 3;
        const dx = this.current[bi] - ax;
        const dy = this.current[bi + 1] - ay;
        const dz = this.current[bi + 2] - az;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > maxDistSq) continue;

        const fade = 1 - Math.sqrt(distSq) / this.opts.linkDistance;
        const bb = Math.min(1.6, Math.max(0.35, this.brightness[j] * 1.3));

        this.linkPositions[writeIdx] = ax;
        this.linkPositions[writeIdx + 1] = ay;
        this.linkPositions[writeIdx + 2] = az;
        this.linkPositions[writeIdx + 3] = this.current[bi];
        this.linkPositions[writeIdx + 4] = this.current[bi + 1];
        this.linkPositions[writeIdx + 5] = this.current[bi + 2];

        // Each endpoint's color is base * fade * its own brightness — so a
        // bright-to-dim link visibly fades from one end to the other.
        const ra = linkColor.r * fade * ba;
        const ga = linkColor.g * fade * ba;
        const blu_a = linkColor.b * fade * ba;
        const rb = linkColor.r * fade * bb;
        const gb = linkColor.g * fade * bb;
        const blu_b = linkColor.b * fade * bb;

        this.linkColors[writeIdx] = ra;
        this.linkColors[writeIdx + 1] = ga;
        this.linkColors[writeIdx + 2] = blu_a;
        this.linkColors[writeIdx + 3] = rb;
        this.linkColors[writeIdx + 4] = gb;
        this.linkColors[writeIdx + 5] = blu_b;

        writeIdx += 6;
      }
    }

    // Zero out the tail so old segments don't render
    for (let k = writeIdx; k < maxWrite; k++) {
      this.linkPositions[k] = 0;
      this.linkColors[k] = 0;
    }

    this.linkPositionAttr.needsUpdate = true;
    this.linkColorAttr.needsUpdate = true;
  }
}
