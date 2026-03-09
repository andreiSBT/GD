/** Background, parallax, ground rendering */

import { SCREEN_WIDTH, SCREEN_HEIGHT, GROUND_Y, GROUND_H } from './settings.js';

export class Renderer {
  constructor() {
    // Generate parallax stars/shapes for 3 layers
    this.layers = [[], [], []];
    const speeds = [0.05, 0.15, 0.3];
    const counts = [40, 30, 20];
    const rng = mulberry32(12345);

    for (let l = 0; l < 3; l++) {
      for (let i = 0; i < counts[l]; i++) {
        this.layers[l].push({
          x: rng() * 5000,
          y: rng() * (GROUND_Y - 50) + 10,
          size: 1 + rng() * (l + 1) * 1.5,
          speed: speeds[l],
          shape: rng() > 0.5 ? 'rect' : 'diamond',
        });
      }
    }
  }

  drawBackground(ctx, cameraX, theme) {
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, theme.bgTop);
    grad.addColorStop(1, theme.bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, GROUND_Y);

    // Parallax layers
    for (let l = 0; l < 3; l++) {
      const alpha = 0.15 + l * 0.1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.accent;

      for (const obj of this.layers[l]) {
        const sx = ((obj.x - cameraX * obj.speed) % 5000 + 5000) % 5000 - 200;
        if (sx < -20 || sx > SCREEN_WIDTH + 20) continue;

        if (obj.shape === 'rect') {
          ctx.fillRect(sx, obj.y, obj.size, obj.size);
        } else {
          ctx.save();
          ctx.translate(sx, obj.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawGround(ctx, cameraX, theme) {
    // Ground fill
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H);

    // Top line
    ctx.fillStyle = theme.groundLine;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 3);

    // Grid tick marks scrolling
    ctx.fillStyle = theme.groundLine;
    ctx.globalAlpha = 0.3;
    const offset = (-cameraX * 0.5) % 50;
    for (let x = offset; x < SCREEN_WIDTH; x += 50) {
      ctx.fillRect(x, GROUND_Y + 3, 1, 15);
    }
    ctx.globalAlpha = 1;
  }

  drawScreenShake(ctx, intensity) {
    if (intensity > 0) {
      const dx = (Math.random() - 0.5) * intensity;
      const dy = (Math.random() - 0.5) * intensity;
      ctx.translate(dx, dy);
      return true;
    }
    return false;
  }
}

// Seeded random
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
