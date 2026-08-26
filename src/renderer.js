/** Background, parallax and ground rendering.
 *
 * Two texture styles (see settings.js):
 *   modern — layered depth: aurora clouds, perspective grid, skyline, bloom.
 *   simple — flat colour blocking: sky, slab, edge line. Nothing per-pixel.
 *
 * Perf note: the theme object is re-interpolated every frame during a colour
 * trigger, so nothing expensive may be keyed on the exact theme. Costly layers
 * are either theme-independent (vignette), baked at low resolution and scaled
 * (aurora), or reduced to a tiny tile keyed on a quantised colour (hatch,
 * ticks). Everything else is a handful of full-width fills, which are cheap.
 */

import {
  SCREEN_WIDTH, SCREEN_HEIGHT, GROUND_Y, GROUND_H, GRID,
  isLowDetail, isSimpleTextures,
} from './settings.js';

const AURORA_W = 1400;      // world width of one aurora tile
const AURORA_SCALE = 0.25;  // baked at quarter res; soft blobs upscale cleanly
const SKYLINE_W = 1400;

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

    this.skylineShapes = [[], []];
    for (let b = 0; b < 2; b++) {
      let x = 0;
      while (x < SKYLINE_W) {
        const w = 40 + rng() * 90;
        const h = (b === 0 ? 40 : 70) + rng() * (b === 0 ? 60 : 120);
        this.skylineShapes[b].push({ x, w, h, notch: rng() < 0.4 });
        x += w + rng() * 30;
      }
    }

    this._time = 0;
  }

  // ------------------------------------------------------------------
  // Background
  // ------------------------------------------------------------------
  drawBackground(ctx, cameraX, theme, pulseIntensity = 0) {
    this._time += 1 / 60;
    const simple = isSimpleTextures();
    const low = isLowDetail();

    if (simple) {
      ctx.fillStyle = getGradient(ctx, 'sky_s', theme.bgTop + theme.bgBot, 0, 0, 0, GROUND_Y,
        [[0, theme.bgTop], [1, theme.bgBot]]);
      ctx.fillRect(0, 0, SCREEN_WIDTH, GROUND_Y);
      this._drawMotes(ctx, cameraX, theme, pulseIntensity, true);
      return;
    }

    // Sky
    ctx.fillStyle = getGradient(ctx, 'sky', theme.bgTop + theme.bgBot, 0, 0, 0, GROUND_Y,
      [[0, shade(theme.bgTop, -12)], [0.55, theme.bgTop], [1, theme.bgBot]]);
    ctx.fillRect(0, 0, SCREEN_WIDTH, GROUND_Y);

    // Aurora clouds — one low-res tile, scaled up, only the visible slice
    if (!low) {
      const tile = getAuroraTile(theme);
      blitScrolling(ctx, tile, AURORA_W, -cameraX * 0.03, GROUND_Y);
    }

    // Perspective grid, both directions in a single path each
    const horizon = GROUND_Y - 190;
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    const rows = low ? 5 : 9;
    ctx.beginPath();
    for (let i = 1; i <= rows; i++) {
      const t = i / rows;
      const y = horizon + (GROUND_Y - horizon) * (t * t);
      ctx.moveTo(0, y);
      ctx.lineTo(SCREEN_WIDTH, y);
    }
    ctx.globalAlpha = 0.08 + pulseIntensity * 0.07;
    ctx.stroke();

    if (!low) {
      const vpX = SCREEN_WIDTH / 2;
      const spacing = 110;
      const off = ((-cameraX * 0.25) % spacing + spacing) % spacing;
      ctx.beginPath();
      for (let x = off - spacing * 6; x < SCREEN_WIDTH + spacing * 6; x += spacing) {
        ctx.moveTo(vpX + (x - vpX) * 0.12, horizon);
        ctx.lineTo(vpX + (x - vpX) * 2.4, GROUND_Y);
      }
      ctx.globalAlpha = 0.05 + pulseIntensity * 0.05;
      ctx.stroke();
    }
    ctx.restore();

    // Skyline silhouettes — batched fills, no per-building state changes
    if (!low) this._drawSkyline(ctx, cameraX, theme);

    // Parallax motes
    this._drawMotes(ctx, cameraX, theme, pulseIntensity, false);

    // Horizon glow
    ctx.globalAlpha = 0.8 + pulseIntensity * 0.2;
    ctx.fillStyle = getGradient(ctx, 'horizon', theme.groundLine, 0, GROUND_Y - 150, 0, GROUND_Y,
      [[0, rgba(theme.groundLine, 0)], [1, rgba(theme.groundLine, 0.22)]]);
    ctx.fillRect(0, GROUND_Y - 150, SCREEN_WIDTH, 150);
    ctx.globalAlpha = 1;

    // Vignette — pure black, so it is baked once and never rebuilt
    if (!low) ctx.drawImage(getVignette(), 0, 0);
  }

  _drawSkyline(ctx, cameraX, theme) {
    const bands = [
      { speed: 0.07, base: GROUND_Y - 40, alpha: 0.15, lift: 6, shapes: this.skylineShapes[0] },
      { speed: 0.16, base: GROUND_Y - 10, alpha: 0.24, lift: 10, shapes: this.skylineShapes[1] },
    ];
    ctx.save();
    for (const band of bands) {
      const off = ((-cameraX * band.speed) % SKYLINE_W + SKYLINE_W) % SKYLINE_W - SKYLINE_W;
      ctx.globalAlpha = band.alpha;
      ctx.fillStyle = shade(theme.bgTop, band.lift);
      for (let base = off; base < SCREEN_WIDTH; base += SKYLINE_W) {
        for (const s of band.shapes) {
          const x = base + s.x;
          if (x > SCREEN_WIDTH || x + s.w < 0) continue;
          ctx.fillRect(x, band.base - s.h, s.w, s.h);
        }
      }
      ctx.globalAlpha = band.alpha * 0.5;
      ctx.fillStyle = theme.accent;
      for (let base = off; base < SCREEN_WIDTH; base += SKYLINE_W) {
        for (const s of band.shapes) {
          const x = base + s.x;
          if (x > SCREEN_WIDTH || x + s.w < 0) continue;
          ctx.fillRect(x + s.w * 0.3, band.base - s.h + 4, 2, 2);
          if (s.notch) ctx.fillRect(x + s.w * 0.6, band.base - s.h * 0.6, 2, 2);
        }
      }
    }
    ctx.restore();
  }

  _drawMotes(ctx, cameraX, theme, pulseIntensity, simple) {
    const low = isLowDetail();
    // Simple keeps only the nearest layer; low detail drops the farthest
    const first = simple ? 2 : (low ? 1 : 0);
    ctx.save();
    ctx.fillStyle = theme.accent;
    for (let l = first; l < 3; l++) {
      for (const obj of this.layers[l]) {
        const sx = ((obj.x - cameraX * obj.speed) % 6000 + 6000) % 6000 - 200;
        if (sx < -20 || sx > SCREEN_WIDTH + 20) continue;

        const tw = simple ? 1 : 0.75 + Math.sin(this._time * 1.6 + obj.twinkle) * 0.25;
        ctx.globalAlpha = Math.min(1, (0.1 + l * 0.09) * obj.brightness * tw + pulseIntensity * 0.4);

        if (simple || obj.shape === 'rect') {
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
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------
  // Ground
  // ------------------------------------------------------------------
  drawGround(ctx, cameraX, theme, pulseIntensity = 0) {
    if (isSimpleTextures()) {
      ctx.fillStyle = theme.ground;
      ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H);
      ctx.fillStyle = shade(theme.ground, -28);
      ctx.fillRect(0, SCREEN_HEIGHT - 14, SCREEN_WIDTH, 14);
      ctx.fillStyle = theme.groundLine;
      ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 3);
      return;
    }

    const low = isLowDetail();

    // Slab
    ctx.fillStyle = getGradient(ctx, 'gnd', theme.ground, 0, GROUND_Y, 0, SCREEN_HEIGHT,
      [[0, theme.ground], [0.35, shade(theme.ground, -25)], [1, shade(theme.ground, -60)]]);
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H);

    if (!low) {
      // Hatch and ticks come from tiny cached tiles — one fill each, not ~180 ops
      const hatch = getTilePattern(ctx, 'hatch', theme.groundLine, buildHatchTile);
      if (hatch) {
        const off = ((-cameraX * 0.5) % 40 + 40) % 40;
        setPatternShift(hatch, off, 0);
        ctx.fillStyle = hatch;
        ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H);
      }

      // Gloss
      ctx.fillStyle = getGradient(ctx, 'gloss', 'x', 0, GROUND_Y, 0, GROUND_Y + GROUND_H * 0.45,
        [[0, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, GROUND_H * 0.45);

      // Edge bloom
      ctx.fillStyle = getGradient(ctx, 'bloom', theme.groundLine + pulseIntensity.toFixed(2),
        0, GROUND_Y - 10, 0, GROUND_Y + 14,
        [[0, rgba(theme.groundLine, 0)],
         [0.42, rgba(theme.groundLine, 0.35 + pulseIntensity * 0.3)],
         [1, rgba(theme.groundLine, 0)]]);
      ctx.fillRect(0, GROUND_Y - 10, SCREEN_WIDTH, 24);
    }

    // Edge light
    ctx.fillStyle = theme.groundLine;
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 2);
    ctx.globalAlpha = 0.55 + pulseIntensity * 0.35;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 1);
    ctx.globalAlpha = 1;

    // Tick marks
    if (!low) {
      const ticks = getTilePattern(ctx, 'ticks', theme.groundLine, buildTickTile);
      if (ticks) {
        const off = ((-cameraX * 0.5) % 100 + 100) % 100;
        setPatternShift(ticks, off, GROUND_Y);
        ctx.fillStyle = ticks;
        ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 20);
      }
    }

    // Bottom shadow lip
    ctx.fillStyle = getGradient(ctx, 'lip', 'x', 0, SCREEN_HEIGHT - 18, 0, SCREEN_HEIGHT,
      [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
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

// ====================================================================
// Cached resources
// ====================================================================

// Gradients keyed by purpose + the colours that define them, so a colour
// transition rebuilds them (cheap) but a steady theme does not.
const _gradients = new Map();
function getGradient(ctx, id, colorKey, x0, y0, x1, y1, stops) {
  const key = `${id}|${colorKey}|${x0},${y0},${x1},${y1}`;
  let g = _gradients.get(key);
  if (g) return g;
  g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [pos, col] of stops) g.addColorStop(pos, col);
  if (_gradients.size > 64) _gradients.clear();
  _gradients.set(key, g);
  return g;
}

// Theme-independent, so this is built exactly once per screen size
let _vignette = null;
let _vignetteW = 0;
function getVignette() {
  if (_vignette && _vignetteW === SCREEN_WIDTH) return _vignette;
  _vignetteW = SCREEN_WIDTH;
  _vignette = makeCanvas(SCREEN_WIDTH, GROUND_Y);
  const v = _vignette.getContext('2d');
  const g = v.createRadialGradient(
    SCREEN_WIDTH / 2, GROUND_Y * 0.5, GROUND_Y * 0.35,
    SCREEN_WIDTH / 2, GROUND_Y * 0.5, SCREEN_WIDTH * 0.72
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.30)');
  v.fillStyle = g;
  v.fillRect(0, 0, SCREEN_WIDTH, GROUND_Y);
  return _vignette;
}

// Aurora baked at quarter resolution: a rebuild is ~50k pixels, so even the
// per-frame colour lerp of a trigger can afford it.
let _auroraTile = null;
let _auroraKey = '';
function getAuroraTile(theme) {
  const key = quant(theme.accent) + quant(theme.groundLine) + quant(theme.player);
  if (_auroraTile && _auroraKey === key) return _auroraTile;
  _auroraKey = key;
  const w = Math.ceil(AURORA_W * AURORA_SCALE);
  const h = Math.ceil(GROUND_Y * AURORA_SCALE);
  _auroraTile = makeCanvas(w, h);
  const a = _auroraTile.getContext('2d');
  const rng = mulberry32(9182);
  const cols = [theme.accent, theme.groundLine, theme.player];
  for (let i = 0; i < 7; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.95;
    const r = (140 + rng() * 260) * AURORA_SCALE;
    const col = cols[i % cols.length];
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, 0.15));
    g.addColorStop(0.5, rgba(col, 0.05));
    g.addColorStop(1, rgba(col, 0));
    a.fillStyle = g;
    a.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return _auroraTile;
}

// Small repeating tiles (hatch, ticks) keyed on a quantised colour
const _tiles = new Map();
function getTilePattern(ctx, id, color, build) {
  const key = `${id}|${quant(color)}`;
  let entry = _tiles.get(key);
  if (!entry) {
    entry = { canvas: build(color), pattern: null };
    if (_tiles.size > 16) _tiles.clear();
    _tiles.set(key, entry);
  }
  if (!entry.pattern) entry.pattern = ctx.createPattern(entry.canvas, 'repeat');
  return entry.pattern;
}

function setPatternShift(pattern, x, y) {
  if (typeof DOMMatrix === 'undefined' || !pattern.setTransform) return;
  pattern.setTransform(new DOMMatrix().translateSelf(x, y));
}

function buildHatchTile(color) {
  const c = makeCanvas(40, 40);
  const t = c.getContext('2d');
  t.strokeStyle = rgba(color, 0.10);
  t.lineWidth = 2;
  t.beginPath();
  for (let i = -40; i < 80; i += 20) {
    t.moveTo(i, 0);
    t.lineTo(i + 40, 40);
  }
  t.stroke();
  return c;
}

function buildTickTile(color) {
  const c = makeCanvas(100, 20);
  const t = c.getContext('2d');
  t.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const major = i === 0;
    t.globalAlpha = major ? 0.45 : 0.2;
    t.fillRect(i * 25, 4, major ? 2 : 1, major ? 16 : 8);
  }
  return c;
}

// ====================================================================
// Helpers
// ====================================================================

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Copy only the visible slice of a horizontally tiled layer, scaling the
// low-res source up to full height.
function blitScrolling(ctx, tile, tileW, shift, dh) {
  if (!tile) return;
  const scale = tile.width / tileW;
  let x = ((shift % tileW) + tileW) % tileW - tileW;
  while (x < SCREEN_WIDTH) {
    const srcX = Math.max(0, -x);
    const dstX = Math.max(0, x);
    const w = Math.min(tileW - srcX, SCREEN_WIDTH - dstX);
    if (w > 0) {
      ctx.drawImage(tile, srcX * scale, 0, w * scale, tile.height, dstX, 0, w, dh);
    }
    x += tileW;
  }
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(hex) {
  if (!hex || hex[0] !== '#') return [255, 255, 255];
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgba(hex, a) {
  const p = parseHex(hex);
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}

// Positive amount lightens, negative darkens
function shade(hex, amount) {
  const p = parseHex(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `rgb(${c(p[0])},${c(p[1])},${c(p[2])})`;
}

// Coarse colour key so mid-transition lerps don't thrash the tile caches
function quant(hex) {
  const p = parseHex(hex);
  return `${p[0] >> 5},${p[1] >> 5},${p[2] >> 5};`;
}
