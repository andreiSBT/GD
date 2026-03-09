/** Background, parallax, ground rendering with neon glow effects */

import { SCREEN_WIDTH, SCREEN_HEIGHT, GROUND_Y, GROUND_H, GRID } from './settings.js';

export class Renderer {
  constructor() {
    this.layers = [[], [], []];
    const speeds = [0.05, 0.15, 0.3];
    const counts = [50, 35, 25];
    const rng = mulberry32(12345);

    for (let l = 0; l < 3; l++) {
      for (let i = 0; i < counts[l]; i++) {
        this.layers[l].push({
          x: rng() * 6000,
          y: rng() * (GROUND_Y - 50) + 10,
          size: 1 + rng() * (l + 1) * 2,
          speed: speeds[l],
          shape: rng() < 0.3 ? 'diamond' : rng() < 0.6 ? 'circle' : 'rect',
          brightness: 0.5 + rng() * 0.5,
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

    // Parallax layers with varied shapes
    for (let l = 0; l < 3; l++) {
      for (const obj of this.layers[l]) {
        const sx = ((obj.x - cameraX * obj.speed) % 6000 + 6000) % 6000 - 200;
        if (sx < -20 || sx > SCREEN_WIDTH + 20) continue;

        const alpha = (0.1 + l * 0.08) * obj.brightness;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.accent;

        if (obj.shape === 'rect') {
          ctx.fillRect(sx, obj.y, obj.size, obj.size);
        } else if (obj.shape === 'diamond') {
          ctx.save();
          ctx.translate(sx, obj.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(sx, obj.y, obj.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Subtle glow on larger particles
        if (obj.size > 3) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.shadowColor = theme.accent;
          ctx.shadowBlur = 6;
          ctx.fillRect(sx, obj.y, obj.size, obj.size);
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawGround(ctx, cameraX, theme) {
    // Main ground fill with gradient
    const grad = ctx.createLinearGradient(0, GROUND_Y, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, theme.ground);
    grad.addColorStop(1, darkenHex(theme.ground, 30));
    ctx.fillStyle = grad;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H);

    // Grid pattern on ground
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const offsetX = (-cameraX * 0.5) % GRID;
    for (let x = offsetX; x < SCREEN_WIDTH; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x, SCREEN_HEIGHT);
      ctx.stroke();
    }
    for (let y = GROUND_Y; y < SCREEN_HEIGHT; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SCREEN_WIDTH, y);
      ctx.stroke();
    }

    // Neon top line with glow
    ctx.shadowColor = theme.groundLine;
    ctx.shadowBlur = 12;
    ctx.fillStyle = theme.groundLine;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 3);
    ctx.shadowBlur = 0;

    // Scrolling tick marks
    ctx.fillStyle = theme.groundLine;
    ctx.globalAlpha = 0.4;
    const tickOffset = (-cameraX * 0.5) % 50;
    for (let x = tickOffset; x < SCREEN_WIDTH; x += 50) {
      ctx.fillRect(x, GROUND_Y + 3, 1, 12);
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

function darkenHex(hex, amount) {
  if (!hex || hex[0] !== '#') return hex;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}
