/** Particle system for visual effects */

import { MAX_PARTICLES, SCREEN_WIDTH, isFancy, isSimpleTextures } from './settings.js';

class Particle {
  constructor(x, y, vx, vy, color, size = 4, lifetime = 0.5, gravity = 0, shape = null) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.lifetime = lifetime;
    this.age = 0;
    this.gravity = gravity;
    // Shards tumble, sparks streak, motes are soft round glows
    this.shape = shape || (size > 4 ? 'shard' : 'spark');
    this.rot = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.35;
  }

  update(dt) {
    this.age += dt;
    this.vy += this.gravity * dt * 60;
    this.x += this.vx;
    this.y += this.vy;
    this.rot += this.spin;
    // Air drag so bursts decelerate instead of flying at constant speed
    this.vx *= 0.985;
  }

  alive() {
    return this.age < this.lifetime;
  }

  draw(ctx, cameraX) {
    const progress = this.age / this.lifetime;
    // Ease-out fade reads softer than a linear one
    const alpha = (1 - progress) * (1 - progress * 0.35);
    const size = Math.max(0.6, this.size * (1.0 - progress * 0.55));
    const sx = this.x - cameraX;
    const sy = this.y;

    if (sx < -20 || sx > SCREEN_WIDTH + 20) return;

    if (isSimpleTextures()) {
      // Flat square, no transform or state stack — cheapest possible particle
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.fillRect(sx, sy, size, size);
      ctx.globalAlpha = 1;
      return;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;

    if (this.shape === 'puff') {
      // Soft smoke ball that swells as it fades
      const r = size * (0.6 + progress * 0.9);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, this.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === 'spark') {
      // Streak stretched along the direction of travel
      const speed = Math.hypot(this.vx, this.vy);
      // Blur is costly at burst counts — only the bigger sparks get it
      if (size >= 3 && isFancy()) {
        ctx.shadowColor = this.color;
        ctx.shadowBlur = size * 2.5;
      }
      if (speed > 1.5) {
        ctx.translate(sx, sy);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        const len = Math.min(14, size + speed * 0.8);
        ctx.beginPath();
        ctx.ellipse(0, 0, len / 2, size / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Tumbling shard with a lit leading edge
      ctx.translate(sx, sy);
      ctx.rotate(this.rot);
      if (isFancy()) {
        ctx.shadowColor = this.color;
        ctx.shadowBlur = size;
      }
      const h = size * 0.72;
      ctx.beginPath();
      ctx.moveTo(-size / 2, -h / 2);
      ctx.lineTo(size / 2, -h / 2 + size * 0.12);
      ctx.lineTo(size / 2 - size * 0.15, h / 2);
      ctx.lineTo(-size / 2 + size * 0.1, h / 2 - size * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-size / 2, -h / 2, size, Math.max(1, size * 0.16));
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.fireball = null; // { x, y, age, duration }
  }

  emitDeath(x, y, color, count = 30) {
    // Main burst — colored fragments
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 10;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 2;
      const size = 3 + Math.random() * 5;
      const lifetime = 0.4 + Math.random() * 0.6;
      this.particles.push(new Particle(x, y, vx, vy, color, size, lifetime, 0.25));
    }
    // White flash sparks — fast, tiny
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 12;
      this.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, '#FFF', 2 + Math.random() * 2, 0.15 + Math.random() * 0.2, 0.1));
    }
    // Larger slow chunks
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 1, color, 6 + Math.random() * 4, 0.6 + Math.random() * 0.5, 0.35));
    }
  }

  emitDeathBoom(x, y, color, count = 50) {
    // Massive ring burst
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 8 + Math.random() * 6;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 4 + Math.random() * 6;
      this.particles.push(new Particle(x, y, vx, vy, color, size, 0.6 + Math.random() * 0.4, 0.15));
    }
    // Fire core — orange/yellow inner burst
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      const fireColor = Math.random() > 0.5 ? '#FF6600' : '#FFAA00';
      this.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, fireColor, 5 + Math.random() * 7, 0.5 + Math.random() * 0.5, 0.2));
    }
    // White flash — fast expanding
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 15;
      this.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, '#FFF', 2 + Math.random() * 3, 0.1 + Math.random() * 0.15, 0));
    }
    // Smoke — slow dark chunks
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 2, '#6A6A72', 10 + Math.random() * 8, 0.8 + Math.random() * 0.6, 0.1, 'puff'));
    }
    // Animated fireball
    this.fireball = { x, y, age: 0, duration: 0.6 };
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
    if (this.fireball) {
      this.fireball.age += dt;
      if (this.fireball.age >= this.fireball.duration) this.fireball = null;
    }
  }

  draw(ctx, cameraX) {
    // Draw fireball behind particles
    if (this.fireball) {
      const fb = this.fireball;
      const p = fb.age / fb.duration;
      const sx = fb.x - cameraX;
      const sy = fb.y;

      // Expanding shockwave ring
      const ringR = 10 + p * 80;
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.4;
      ctx.strokeStyle = '#FF6600';
      ctx.lineWidth = 3 * (1 - p);
      ctx.shadowColor = '#FF6600';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner fireball — layered glowing circles
      const maxR = 35 * (1 - p * p);
      if (maxR > 1) {
        ctx.save();
        // Outer glow
        ctx.globalAlpha = (1 - p) * 0.3;
        ctx.shadowColor = '#FF4400';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#FF4400';
        ctx.beginPath();
        ctx.arc(sx, sy, maxR, 0, Math.PI * 2);
        ctx.fill();
        // Mid layer — orange
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#FF8800';
        ctx.beginPath();
        ctx.arc(sx, sy, maxR * 0.7, 0, Math.PI * 2);
        ctx.fill();
        // Core — yellow/white
        ctx.globalAlpha = (1 - p) * 0.8;
        ctx.shadowColor = '#FFCC00';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#FFDD44';
        ctx.beginPath();
        ctx.arc(sx, sy, maxR * 0.35, 0, Math.PI * 2);
        ctx.fill();
        // White hot center
        ctx.globalAlpha = (1 - p * 2) > 0 ? (1 - p * 2) : 0;
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(sx, sy, maxR * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    for (const p of this.particles) p.draw(ctx, cameraX);
  }

  clear() {
    this.particles = [];
    this.fireball = null;
  }
}
