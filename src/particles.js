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
      this.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 2, '#555', 8 + Math.random() * 6, 0.8 + Math.random() * 0.6, 0.1));
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
