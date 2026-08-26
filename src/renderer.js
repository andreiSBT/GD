/** Background, parallax, ground rendering with modern layered neon visuals */

import { SCREEN_WIDTH, SCREEN_HEIGHT, GROUND_Y, GROUND_H, GRID, isLowDetail } from './settings.js';

const AURORA_W = 1400; // width of the cached, tiled aurora layer

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
          twinkle: rng() * Math.PI * 2,
        });
      }
    }

    // Distant skyline silhouettes (two parallax bands)
    this.skyline = [[], []];
    for (let b = 0; b < 2; b++) {
      let x = 0;
      while (x < AURORA_W) {
        const w = 40 + rng() * 90;
        const h = (b === 0 ? 40 : 70) + rng() * (b === 0 ? 60 : 120);
        this.skyline[b].push({ x, w, h, notch: rng() < 0.4 });
        x += w + rng() * 30;
      }
    }

    this._time = 0;
  }

  // Soft colour clouds baked once per theme, then tiled + scrolled
  _getAurora(theme) {
    if (this._auroraTheme === theme && this._aurora) return this._aurora;
    const c = document.createElement('canvas');
    c.width = AURORA_W;
    c.height = GROUND_Y;
    const g = c.getContext('2d');
    const rng = mulberry32(9182);
    const cols = [theme.accent, theme.groundLine, theme.player];
    for (let i = 0; i < 7; i++) {
      const x = rng() * AURORA_W;
      const y = rng() * GROUND_Y * 0.95;
      const r = 140 + rng() * 260;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const col = hexToRgb(cols[i % cols.length]);
      grad.addColorStop(0, `rgba(${col},0.20)`);
      grad.addColorStop(0.5, `rgba(${col},0.07)`);
      grad.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this._auroraTheme = theme;
    this._aurora = c;
    return c;
  }

  drawBackground(ctx, cameraX, theme, pulseIntensity = 0) {
    this._time += 1 / 60;

    // Base gradient — three stops for a richer sky (cached per theme)
    if (this._bgTheme !== theme) {
      this._bgTheme = theme;
      this._bgGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      this._bgGrad.addColorStop(0, darkenHex(theme.bgTop, 12));
      this._bgGrad.addColorStop(0.55, theme.bgTop);
      this._bgGrad.addColorStop(1, theme.bgBot);
    }
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, GROUND_Y);

    const low = isLowDetail();

    // Soft aurora clouds (slowest parallax)
    if (!low) {
      const aur = this._getAurora(theme);
      const off = ((-cameraX * 0.03) % AURORA_W + AURORA_W) % AURORA_W;
      ctx.globalAlpha = 0.9 + pulseIntensity * 0.1;
      ctx.drawImage(aur, off - AURORA_W, 0);
      ctx.drawImage(aur, off, 0);
      if (off + AURORA_W < SCREEN_WIDTH) ctx.drawImage(aur, off + AURORA_W, 0);
      ctx.globalAlpha = 1;
    }

    // Perspective floor grid fading toward the horizon
    this._drawPerspectiveGrid(ctx, cameraX, theme, pulseIntensity, low);

    // Distant skyline silhouettes
    if (!low) this._drawSkyline(ctx, cameraX, theme);

    // Parallax particles with varied shapes + gentle twinkle
    for (let l = 0; l < 3; l++) {
      for (const obj of this.layers[l]) {
        const sx = ((obj.x - cameraX * obj.speed) % 6000 + 6000) % 6000 - 200;
        if (sx < -20 || sx > SCREEN_WIDTH + 20) continue;

        const tw = 0.75 + Math.sin(this._time * 1.6 + obj.twinkle) * 0.25;
        const alpha = Math.min(1, (0.1 + l * 0.09) * obj.brightness * tw + pulseIntensity * 0.4);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.accent;

        if (obj.shape === 'rect') {
          ctx.fillRect(sx, obj.y, obj.size, obj.size);
        } else if (obj.shape === 'diamond') {
          ctx.save();
          ctx.translate(sx, obj.y);
          ctx.rotate(Math.PI / 4 + this._time * 0.15);
          ctx.fillRect(-obj.size / 2, -obj.size / 2, obj.size, obj.size);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(sx, obj.y, obj.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Soft bloom on the larger motes
        if (obj.size > 3 && !low) {
          ctx.globalAlpha = alpha * 0.35;
          ctx.shadowColor = theme.accent;
          ctx.shadowBlur = 8 + pulseIntensity * 6;
          ctx.beginPath();
          ctx.arc(sx + obj.size / 2, obj.y + obj.size / 2, obj.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.globalAlpha = 1;

    // Horizon glow just above the ground line
    if (!low) {
      if (this._horizonTheme !== theme) {
        this._horizonTheme = theme;
        const hg = ctx.createLinearGradient(0, GROUND_Y - 150, 0, GROUND_Y);
        const col = hexToRgb(theme.groundLine);
        hg.addColorStop(0, `rgba(${col},0)`);
        hg.addColorStop(1, `rgba(${col},0.22)`);
        this._horizonGrad = hg;
      }
      ctx.globalAlpha = 0.8 + pulseIntensity * 0.2;
      ctx.fillStyle = this._horizonGrad;
      ctx.fillRect(0, GROUND_Y - 150, SCREEN_WIDTH, 150);
      ctx.globalAlpha = 1;
    }

    // Vignette to focus the play area
    if (!low) {
      if (!this._vignette || this._vigW !== SCREEN_WIDTH) {
        this._vigW = SCREEN_WIDTH;
        const vg = ctx.createRadialGradient(
          SCREEN_WIDTH / 2, GROUND_Y * 0.5, GROUND_Y * 0.35,
          SCREEN_WIDTH / 2, GROUND_Y * 0.5, SCREEN_WIDTH * 0.72
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.45)');
        this._vignette = vg;
      }
      ctx.fillStyle = this._vignette;
      ctx.fillRect(0, 0, SCREEN_WIDTH, GROUND_Y);
    }
  }

  _drawPerspectiveGrid(ctx, cameraX, theme, pulseIntensity, low) {
    const horizon = GROUND_Y - 190;
    const col = hexToRgb(theme.accent);
    ctx.save();
    ctx.lineWidth = 1;

    // Horizontal receding lines
    const rows = low ? 5 : 9;
    for (let i = 1; i <= rows; i++) {
      const t = i / rows;
      const y = horizon + (GROUND_Y - horizon) * (t * t);
      ctx.globalAlpha = 0.06 + t * 0.1 + pulseIntensity * 0.08;
      ctx.strokeStyle = `rgb(${col})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SCREEN_WIDTH, y);
      ctx.stroke();
    }

    // Vertical lines converging to a vanishing point
    if (!low) {
      const vpX = SCREEN_WIDTH / 2;
      const spacing = 110;
      const off = ((-cameraX * 0.25) % spacing + spacing) % spacing;
      for (let x = off - spacing * 6; x < SCREEN_WIDTH + spacing * 6; x += spacing) {
        const spread = (x - vpX) * 2.4;
        ctx.globalAlpha = 0.07 + pulseIntensity * 0.06;
        ctx.strokeStyle = `rgb(${col})`;
        ctx.beginPath();
        ctx.moveTo(vpX + (x - vpX) * 0.12, horizon);
        ctx.lineTo(vpX + spread, GROUND_Y);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawSkyline(ctx, cameraX, theme) {
    const bands = [
      { speed: 0.07, base: GROUND_Y - 40, alpha: 0.22, shade: 55 },
      { speed: 0.16, base: GROUND_Y - 10, alpha: 0.34, shade: 80 },
    ];
    for (let b = 0; b < 2; b++) {
      const band = bands[b];
      const off = ((-cameraX * band.speed) % AURORA_W + AURORA_W) % AURORA_W;
      ctx.save();
      ctx.globalAlpha = band.alpha;
      ctx.fillStyle = darkenHex(theme.bgTop, -band.shade * 0.15);
      for (let rep = -1; rep <= 1; rep++) {
        const base = off + rep * AURORA_W;
        if (base > SCREEN_WIDTH || base + AURORA_W < 0) continue;
        for (const s of this.skyline[b]) {
          const x = base + s.x;
          if (x > SCREEN_WIDTH || x + s.w < 0) continue;
          ctx.fillRect(x, band.base - s.h, s.w, s.h);
          // Lit window strip
          ctx.save();
          ctx.globalAlpha = band.alpha * 0.5;
          ctx.fillStyle = theme.accent;
          ctx.fillRect(x + s.w * 0.3, band.base - s.h + 4, 2, 2);
          if (s.notch) ctx.fillRect(x + s.w * 0.6, band.base - s.h * 0.6, 2, 2);
          ctx.restore();
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawGround(ctx, cameraX, theme, pulseIntensity = 0) {
    const low = isLowDetail();

    // Ground body — darker, deeper gradient for a solid slab feel
    if (this._gndTheme !== theme) {
      this._gndTheme = theme;
      const g = ctx.createLinearGradient(0, GROUND_Y, 0, SCREEN_HEIGHT);
      g.addColorStop(0, theme.ground);
      g.addColorStop(0.35, darkenHex(theme.ground, 25));
      g.addColorStop(1, darkenHex(theme.ground, 60));
      this._gndGrad = g;

      // Diagonal hatch tile, baked once per theme
      const tile = document.createElement('canvas');
      tile.width = 40;
      tile.height = 40;
      const t = tile.getContext('2d');
      t.strokeStyle = `rgba(${hexToRgb(theme.groundLine)},0.10)`;
      t.lineWidth = 2;
      for (let i = -40; i < 80; i += 20) {
        t.beginPath();
        t.moveTo(i, 0);
        t.lineTo(i + 40, 40);
        t.stroke();
      }
      this._gndPattern = ctx.createPattern(tile, 'repeat');
    }
    ctx.fillStyle = this._gndGrad;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H);

    // Scrolling hatch texture
    if (!low && this._gndPattern) {
      ctx.save();
      const off = ((-cameraX * 0.5) % 40 + 40) % 40;
      ctx.translate(off, 0);
      ctx.fillStyle = this._gndPattern;
      ctx.fillRect(-off, GROUND_Y, SCREEN_WIDTH + 40, GROUND_H);
      ctx.restore();
    }

    // Glossy sheen on the upper third of the slab
    if (!low) {
      if (this._sheenTheme !== theme) {
        this._sheenTheme = theme;
        const sg = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + GROUND_H * 0.45);
        sg.addColorStop(0, 'rgba(255,255,255,0.14)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        this._sheenGrad = sg;
      }
      ctx.fillStyle = this._sheenGrad;
      ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H * 0.45);
    }

    // Neon edge: wide soft bloom + crisp core line
    const lineCol = hexToRgb(theme.groundLine);
    if (!low) {
      const bloom = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GROUND_Y + 14);
      bloom.addColorStop(0, `rgba(${lineCol},0)`);
      bloom.addColorStop(0.42, `rgba(${lineCol},${0.35 + pulseIntensity * 0.3})`);
      bloom.addColorStop(1, `rgba(${lineCol},0)`);
      ctx.fillStyle = bloom;
      ctx.fillRect(0, GROUND_Y - 10, SCREEN_WIDTH, 24);
      ctx.shadowColor = theme.groundLine;
      ctx.shadowBlur = 14 + pulseIntensity * 10;
    }
    ctx.fillStyle = theme.groundLine;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.55 + pulseIntensity * 0.35;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 1);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Scrolling tick marks — alternating long/short for rhythm
    ctx.fillStyle = theme.groundLine;
    const tickOffset = ((-cameraX * 0.5) % (GRID * 2) + GRID * 2) % (GRID * 2);
    let idx = 0;
    for (let x = tickOffset - GRID * 2; x < SCREEN_WIDTH; x += GRID / 2) {
      const major = idx % 4 === 0;
      ctx.globalAlpha = major ? 0.45 : 0.2;
      ctx.fillRect(x, GROUND_Y + 4, major ? 2 : 1, major ? 16 : 8);
      idx++;
    }
    ctx.globalAlpha = 1;

    // Bottom shadow lip so the slab reads as thick
    const bg = ctx.createLinearGradient(0, SCREEN_HEIGHT - 18, 0, SCREEN_HEIGHT);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, SCREEN_HEIGHT - 18, SCREEN_WIDTH, 18);
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

function hexToRgb(hex) {
  if (!hex || hex[0] !== '#') return '255,255,255';
  return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;
}

function darkenHex(hex, amount) {
  if (!hex || hex[0] !== '#') return hex;
  const r = clamp255(parseInt(hex.slice(1, 3), 16) - amount);
  const g = clamp255(parseInt(hex.slice(3, 5), 16) - amount);
  const b = clamp255(parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}

function clamp255(v) {
  return Math.max(0, Math.min(255, v));
}
