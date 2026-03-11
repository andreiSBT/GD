/** Particle system for visual effects */

import { MAX_PARTICLES, SCREEN_WIDTH } from './settings.js';

class Particle {
  constructor(x, y, vx, vy, color, size = 4, lifetime = 0.5, gravity = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.lifetime = lifetime;
    this.age = 0;
    this.gravity = gravity;
  }

  update(dt) {
    this.age += dt;
    this.vy += this.gravity * dt * 60;
    this.x += this.vx;
    this.y += this.vy;
  }

  alive() {
    return this.age < this.lifetime;
  }

  draw(ctx, cameraX) {
    const progress = this.age / this.lifetime;
    const alpha = 1.0 - progress;
    const size = Math.max(1, this.size * (1.0 - progress * 0.5));
    const sx = this.x - cameraX;
    const sy = this.y;

    if (sx < -10 || sx > SCREEN_WIDTH + 10) return;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.fillRect(sx, sy, size, size);
    ctx.globalAlpha = 1;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emitDeath(x, y, color, count = 30) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 16;
      const vy = (Math.random() - 0.8) * 12;
      const size = 3 + Math.random() * 5;
      const lifetime = 0.3 + Math.random() * 0.5;
      this.particles.push(new Particle(x, y, vx, vy, color, size, lifetime, 0.3));
    }
  }

  emitJump(x, y, color, count = 5) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 2;
      const vy = Math.random() * 2 + 0.5;
      this.particles.push(new Particle(x, y, vx, vy, color, 2 + Math.random() * 2, 0.2));
    }
  }

  emitTrail(x, y, color) {
    if (this.particles.length < MAX_PARTICLES) {
      const vx = -Math.random() * 0.5;
      const vy = (Math.random() - 0.5) * 0.6;
      this.particles.push(new Particle(x, y, vx, vy, color, 3, 0.3));
    }
  }

  update(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => p.alive());
    if (this.particles.length > MAX_PARTICLES) {
      this.particles = this.particles.slice(-MAX_PARTICLES);
    }
  }

  draw(ctx, cameraX) {
    for (const p of this.particles) p.draw(ctx, cameraX);
  }

  clear() {
    this.particles = [];
  }
}
