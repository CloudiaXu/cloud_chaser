import { ParticleSystem } from './ParticleSystem';

export type ParticleState = 'scattered' | 'forming' | 'breathing' | 'attracted';

/**
 * Drives the particle system's spring stiffness/damping over time
 * based on its current narrative state.
 *
 * The targets (where particles want to go) are written by setTargets();
 * this class only controls *how aggressively* particles chase them.
 */
export class StateMachine {
  private state: ParticleState = 'scattered';
  private elapsed = 0;
  private system: ParticleSystem;

  constructor(system: ParticleSystem) {
    this.system = system;
  }

  setState(next: ParticleState) {
    if (this.state === next) return;
    this.state = next;
    this.elapsed = 0;
  }

  getState() {
    return this.state;
  }

  step(dt: number) {
    this.elapsed += dt;

    let stiffness: number;
    let damping: number;

    switch (this.state) {
      case 'scattered':
        // Drift slowly, basically no pull.
        stiffness = 0.001;
        damping = 0.96;
        break;

      case 'forming':
        // Strong pull during the initial scatter → bird formation.
        // Eases out after ~3s into the gentler "breathing" mode.
        stiffness = 0.04;
        damping = 0.86;
        if (this.elapsed > 3) this.setState('breathing');
        break;

      case 'breathing':
        // Soft idle — particles hover near targets, slow micro-motion.
        stiffness = 0.012;
        damping = 0.92;
        break;

      case 'attracted':
        // Hover-state: targets are externally biased toward the cursor;
        // we want responsive but smooth tracking.
        stiffness = 0.06;
        damping = 0.82;
        break;
    }

    this.system.step(stiffness, damping);
  }
}
