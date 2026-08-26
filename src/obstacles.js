/** Obstacle types with neon glow visuals and new GD mechanics */

import {
  GRID, PLAYER_SIZE, GROUND_Y, PLAYER_X_OFFSET, SCREEN_WIDTH, THEMES,
  isLowDetail, isSimpleTextures, isFancy, noParticles,
} from './settings.js';
import { lighten, darken } from './player.js';
import { getBeatIntensity } from './sound.js';

const EMPTY_EDGES = new Set();

// Five-pointed star centred on the current origin
function fillStar(ctx, outerR) {
  const innerR = outerR * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const oa = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const ia = oa + Math.PI / 5;
    if (i === 0) ctx.moveTo(Math.cos(oa) * outerR, Math.sin(oa) * outerR);
    else ctx.lineTo(Math.cos(oa) * outerR, Math.sin(oa) * outerR);
    ctx.lineTo(Math.cos(ia) * innerR, Math.sin(ia) * innerR);
  }
  ctx.closePath();
  ctx.fill();
}

// AABB collision check
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Shared neon glow helper. Blur is the single most expensive canvas operation
// here, so the simple style and low detail both skip it entirely.
function drawNeonGlow(ctx, color, blur = 10) {
  if (!isFancy()) return;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}
function clearGlow(ctx) {
  ctx.shadowBlur = 0;
}

// Mix two hex colors — t=0 gives a, t=1 gives b
function mix(a, b, t) {
  const pa = hexToRgbArr(a), pb = hexToRgbArr(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hexToRgbArr(hex) {
  if (!hex || hex[0] !== '#') return [255, 255, 255];
  if (hex.length === 4) {
    return [parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16), parseInt(hex[3] + hex[3], 16)];
  }
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function rgba(hex, a) {
  const p = hexToRgbArr(hex);
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
}

// Bevelled blade shape used by spikes — two lit facets, ridge, rim light, dark base.
// Drawn centred at (0,0) in the current transform, pointing up.
function drawBlade(c, halfW, halfH, sideInset, baseInset, theme, glow) {
  const tipY = -halfH + 2;
  const baseY = halfH - baseInset;
  const lx = -halfW + sideInset;
  const rx = halfW - sideInset;

  const outline = () => {
    c.beginPath();
    c.moveTo(0, tipY);
    c.lineTo(lx, baseY);
    c.lineTo(rx, baseY);
    c.closePath();
  };

  // Simple style: one flat triangle and an accent outline
  if (isSimpleTextures()) {
    c.fillStyle = theme.spike;
    outline();
    c.fill();
    c.strokeStyle = theme.accent;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    outline();
    c.stroke();
    return;
  }

  // Soft outer bloom
  drawNeonGlow(c, theme.accent, glow);
  c.fillStyle = mix(theme.accent, '#000000', 0.35);
  outline();
  c.fill();
  clearGlow(c);

  // Base body — vertical gradient, bright at the tip
  const body = c.createLinearGradient(0, tipY, 0, baseY);
  body.addColorStop(0, mix(theme.spike, '#FFFFFF', 0.55));
  body.addColorStop(0.35, theme.spike);
  body.addColorStop(0.8, theme.accent);
  body.addColorStop(1, mix(theme.accent, '#000000', 0.45));
  c.fillStyle = body;
  outline();
  c.fill();

  // Right facet in shadow — reads as a bevelled edge
  c.save();
  outline();
  c.clip();
  const shade = c.createLinearGradient(0, 0, rx, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.38)');
  c.fillStyle = shade;
  c.fillRect(0, tipY, rx, baseY - tipY);

  // Left facet catches the light
  const lit = c.createLinearGradient(lx, 0, 0, 0);
  lit.addColorStop(0, 'rgba(255,255,255,0.28)');
  lit.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = lit;
  c.fillRect(lx, tipY, -lx, baseY - tipY);

  // Contact shadow where the blade meets the ground
  const foot = c.createLinearGradient(0, baseY - halfH * 0.4, 0, baseY);
  foot.addColorStop(0, 'rgba(0,0,0,0)');
  foot.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = foot;
  c.fillRect(lx, baseY - halfH * 0.4, rx - lx, halfH * 0.4);
  c.restore();

  // Central ridge highlight
  const ridge = c.createLinearGradient(0, tipY, 0, baseY);
  ridge.addColorStop(0, 'rgba(255,255,255,0.6)');
  ridge.addColorStop(1, 'rgba(255,255,255,0)');
  c.strokeStyle = ridge;
  c.lineWidth = Math.max(1, halfW * 0.09);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, tipY + 2);
  c.lineTo(0, baseY - 2);
  c.stroke();

  // Rim light along the left edge
  c.strokeStyle = 'rgba(255,255,255,0.42)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(0, tipY);
  c.lineTo(lx, baseY);
  c.stroke();

  // Neon outline
  c.strokeStyle = mix(theme.accent, '#FFFFFF', 0.25);
  c.lineWidth = 1.4;
  c.lineJoin = 'round';
  outline();
  c.stroke();

  // Hot tip
  drawNeonGlow(c, '#FFFFFF', 8);
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.beginPath();
  c.arc(0, tipY + 2, Math.max(1, halfW * 0.09), 0, Math.PI * 2);
  c.fill();
  clearGlow(c);
}

// ---- Block surface painting (shared by Platform / PlatformGroup / Slope) ----

// The tile is theme-independent (pure white/black overlays), so it is built once.
const _blockTiles = new Map();
function getBlockTile() {
  let tile = _blockTiles.get('tile');
  if (tile) return tile;
  tile = document.createElement('canvas');
  tile.width = 25;
  tile.height = 25;
  const t = tile.getContext('2d');
  // Faint diagonal brushed lines
  t.strokeStyle = 'rgba(255,255,255,0.045)';
  t.lineWidth = 1;
  for (let i = -25; i < 50; i += 8) {
    t.beginPath();
    t.moveTo(i, 0);
    t.lineTo(i + 25, 25);
    t.stroke();
  }
  // Rivet dot in the corner of each tile
  t.fillStyle = 'rgba(0,0,0,0.16)';
  t.beginPath();
  t.arc(12.5, 12.5, 1.4, 0, Math.PI * 2);
  t.fill();
  t.fillStyle = 'rgba(255,255,255,0.10)';
  t.beginPath();
  t.arc(12.5, 11.7, 1.1, 0, Math.PI * 2);
  t.fill();
  _blockTiles.set('tile', tile);
  return tile;
}

// Pattern anchored to a given x so the texture rides with the world, not the screen
const _blockPatterns = new WeakMap();
function blockPattern(c, offX) {
  let pat = _blockPatterns.get(c);
  if (pat === undefined) {
    pat = c.createPattern(getBlockTile(), 'repeat') || null;
    _blockPatterns.set(c, pat);
  }
  if (pat && typeof DOMMatrix !== 'undefined' && pat.setTransform) {
    pat.setTransform(new DOMMatrix().translateSelf(((offX % 25) + 25) % 25, 0));
  }
  return pat;
}

// Gradient caches are scoped per context: sprite bakes run in a translated
// offscreen context, so a gradient cached there would sit at the wrong offset
// if it were reused on the live canvas.
const _gradCaches = new WeakMap();
function gradCache(c) {
  let m = _gradCaches.get(c);
  if (!m) { m = new Map(); _gradCaches.set(c, m); }
  else if (m.size > 200) m.clear();
  return m;
}

// The theme lerps every frame during a colour trigger, so this is keyed on the
// quantised colour plus the band the gradient spans.
function bodyGradient(c, y, h, theme) {
  const cache = gradCache(c);
  const key = `body|${themeSpriteKey(theme)}|${Math.round(y)}|${Math.round(h)}`;
  let g = cache.get(key);
  if (g) return g;
  g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, lighten(theme.platform, 34));
  g.addColorStop(0.14, lighten(theme.platform, 14));
  g.addColorStop(0.62, theme.platform);
  g.addColorStop(1, darken(theme.platform, 34));
  cache.set(key, g);
  return g;
}

// Reusable white/black falloffs — independent of theme, keyed on their band
function shadeGradient(c, id, y0, y1, from, to) {
  const cache = gradCache(c);
  const key = `${id}|${Math.round(y0)}|${Math.round(y1)}`;
  let g = cache.get(key);
  if (g) return g;
  g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  cache.set(key, g);
  return g;
}

// Base fill: depth gradient + brushed texture + top gloss + bottom occlusion
function paintBlockBody(c, x, y, w, h, theme, patOffX = 0) {
  if (isSimpleTextures()) {
    c.fillStyle = theme.platform;
    c.fillRect(x, y, w, h);
    return;
  }

  c.fillStyle = bodyGradient(c, y, h, theme);
  c.fillRect(x, y, w, h);

  if (isFancy()) {
    const pat = blockPattern(c, patOffX);
    if (pat) {
      c.fillStyle = pat;
      c.fillRect(x, y, w, h);
    }

    // Glossy sheen across the top band
    const gh = Math.min(h * 0.5, 18);
    c.fillStyle = shadeGradient(c, 'gloss', y, y + gh, 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0)');
    c.fillRect(x, y, w, gh);

    // Ambient occlusion along the bottom
    const ah = Math.min(h * 0.5, 14);
    c.fillStyle = shadeGradient(c, 'ao', y + h - ah, y + h, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.30)');
    c.fillRect(x, y + h - ah, w, ah);
  }
}

// Inner bevel: light on top/left, shadow on bottom/right
function paintBlockBevel(c, x, y, w, h, theme, he) {
  if (isSimpleTextures()) return;
  c.save();
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  if (!he.has('top')) { c.moveTo(x + 1, y + 2); c.lineTo(x + w - 1, y + 2); }
  if (!he.has('left')) { c.moveTo(x + 2, y + 1); c.lineTo(x + 2, y + h - 1); }
  c.stroke();

  c.strokeStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  if (!he.has('bottom')) { c.moveTo(x + 1, y + h - 2); c.lineTo(x + w - 1, y + h - 2); }
  if (!he.has('right')) { c.moveTo(x + w - 2, y + 1); c.lineTo(x + w - 2, y + h - 1); }
  c.stroke();
  c.restore();
}

// Neon top strip + crisp accent border on exposed edges
function paintBlockEdges(c, x, y, w, h, theme, he) {
  if (!he.has('top')) {
    drawNeonGlow(c, theme.accent, 10);
    c.fillStyle = isSimpleTextures() ? theme.accent : mix(theme.accent, '#FFFFFF', 0.35);
    c.fillRect(x, y, w, 3);
    clearGlow(c);
  }

  c.strokeStyle = rgba(theme.accent, 0.85);
  c.lineWidth = 1;
  c.beginPath();
  if (!he.has('top')) { c.moveTo(x, y + 0.5); c.lineTo(x + w, y + 0.5); }
  if (!he.has('right')) { c.moveTo(x + w - 0.5, y); c.lineTo(x + w - 0.5, y + h); }
  if (!he.has('bottom')) { c.moveTo(x + w, y + h - 0.5); c.lineTo(x, y + h - 0.5); }
  if (!he.has('left')) { c.moveTo(x + 0.5, y + h); c.lineTo(x + 0.5, y); }
  c.stroke();
}

// Sprite keys must not use exact theme colours: a colour trigger re-interpolates
// the theme every frame, which would re-bake every visible sprite 60x a second.
// Quantising to 8-value buckets makes a whole transition cost a few dozen bakes,
// and the colour stepping is imperceptible at that granularity.
export function themeSpriteKey(theme) {
  const q = (hex) => {
    if (!hex || hex[0] !== '#') return 'x';
    return `${parseInt(hex.slice(1, 3), 16) >> 3}.${parseInt(hex.slice(3, 5), 16) >> 3}.${parseInt(hex.slice(5, 7), 16) >> 3}`;
  };
  return `${q(theme.platform)}|${q(theme.accent)}|${q(theme.spike)}|${isSimpleTextures() ? 's' : 'm'}${isLowDetail() ? 'l' : ''}`;
}

// Offscreen canvas sprite cache — render once, blit every frame
const SPRITE_CACHE_MAX = 400;
const _spriteCache = new Map();
function getCachedSprite(key, w, h, drawFn) {
  const entry = _spriteCache.get(key);
  if (entry) {
    // Refresh recency so the eviction below drops genuinely stale sprites
    _spriteCache.delete(key);
    _spriteCache.set(key, entry);
    return entry;
  }
  const canvas = document.createElement('canvas');
  // Extra padding for glow/shadow overflow
  const pad = 24;
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const offCtx = canvas.getContext('2d');
  offCtx.translate(pad, pad);
  drawFn(offCtx);
  const fresh = { canvas, pad };
  _spriteCache.set(key, fresh);
  // Evict least-recently-used so a long level with many colour triggers can't
  // grow the cache without bound
  while (_spriteCache.size > SPRITE_CACHE_MAX) {
    const oldest = _spriteCache.keys().next().value;
    _spriteCache.delete(oldest);
  }
  return fresh;
}
// Clear cache when theme or display settings change
export function clearSpriteCache() {
  _spriteCache.clear();
  _blockTiles.clear();
}

// ============================================================
// SPIKE - triangle with gradient + glow
// ============================================================
export class Spike {
  constructor(gx, gy, rot = 0) {
    this.type = 'spike';
    this.gx = gx;
    this.gy = gy;
    this.rot = rot;
    this.x = gx * GRID;
    this.w = GRID;
    this.h = GRID;
    this._updateY();
  }

  _updateY() {
    if (this.rot === 180) {
      this.y = this.gy * GRID;
    } else {
      this.y = GROUND_Y - (this.gy + 1) * GRID;
    }
  }

  checkCollision(playerRect) {
    const inset = 10;
    const topInset = Math.round(GRID * 0.1) + 4;
    const spikeRect = {
      x: this.x + inset,
      y: this.y + topInset,
      w: this.w - inset * 2,
      h: this.h - inset - topInset,
    };
    if (rectsOverlap(playerRect, spikeRect)) return 'death';
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    const key = `spike_${this.rot}_${themeSpriteKey(theme)}`;
    const sprite = getCachedSprite(key, GRID, GRID, (c) => {
      const halfG = GRID / 2;
      c.translate(GRID / 2, GRID / 2);
      c.rotate((this.rot * Math.PI) / 180);
      drawBlade(c, halfG, halfG, 4, 2, theme, 12);
    });
    ctx.drawImage(sprite.canvas, sx - sprite.pad, sy - sprite.pad);
  }
}

// ============================================================
// MINI SPIKE - half-height triangle hazard
// ============================================================
export class MiniSpike {
  constructor(gx, gy, rot = 0) {
    this.type = 'mini_spike';
    this.gx = gx;
    this.gy = gy;
    this.rot = rot;
    this.x = gx * GRID;
    this.w = GRID;
    this.h = GRID * 0.5;
    this._updateY();
  }

  _updateY() {
    if (this.rot === 180) {
      this.y = this.gy * GRID;
    } else {
      this.y = GROUND_Y - this.gy * GRID - this.h;
    }
  }

  checkCollision(playerRect) {
    const inset = 12;
    const topInset = 6;
    const spikeRect = {
      x: this.x + inset,
      y: this.y + topInset,
      w: this.w - inset * 2,
      h: this.h - topInset,
    };
    if (rectsOverlap(playerRect, spikeRect)) return 'death';
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    const key = `minispike_${this.rot}_${themeSpriteKey(theme)}`;
    const spriteH = this.h;
    const sprite = getCachedSprite(key, GRID, spriteH, (c) => {
      const halfW = GRID / 2;
      const halfH = spriteH / 2;
      c.translate(halfW, halfH);
      c.rotate((this.rot * Math.PI) / 180);
      drawBlade(c, halfW, halfH, 6, 1, theme, 8);
    });
    ctx.drawImage(sprite.canvas, sx - sprite.pad, sy - sprite.pad);
  }
}

// ============================================================
// PLATFORM - with grid texture + glow edges
// ============================================================
export class Platform {
  constructor(gx, gy, gw = 1, gh = 1) {
    this.type = 'platform';
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + gh) * GRID;
    this.w = gw * GRID;
    this.h = gh * GRID;
  }

  checkCollision(playerRect, prevPlayerY, gravityMult = 1) {
    const platTop = this.y;
    const platBottom = this.y + this.h;

    // Detection rect: block bounds with vertical extension for stable re-landing
    const ext = 10;
    const sideRect = {
      x: this.x,
      y: gravityMult === -1 ? this.y : this.y - ext,
      w: this.w,
      h: this.h + ext,
    };
    if (!rectsOverlap(playerRect, sideRect)) return null;
    const playerBottom = playerRect.y + playerRect.h;

    // Inverted gravity: player rises and lands on bottom of platform
    if (gravityMult === -1) {
      const playerTop = playerRect.y;
      const rawTop = playerTop - 4;
      const wasBelow = prevPlayerY >= platBottom - 4;
      if (wasBelow) {
        return { type: 'land', y: platBottom };
      }
      const rising = rawTop < prevPlayerY;
      if (rising && playerTop <= platBottom) {
        return { type: 'land', y: platBottom };
      }
      if (playerTop >= platBottom - 8 && playerTop <= platBottom + 4 &&
          prevPlayerY >= platBottom - 8) {
        return { type: 'land', y: platBottom };
      }
      return { type: 'death' };
    }

    // Normal gravity: check if player is on top of platform
    const pSize = playerRect.h + 8;
    const wasAbove = prevPlayerY + pSize <= platTop;
    if (wasAbove) {
      return { type: 'land', y: platTop };
    }
    const currentY = playerRect.y - 4;
    const falling = currentY > prevPlayerY;
    if (falling && currentY <= platTop) {
      return { type: 'land', y: platTop };
    }
    const prevBottom = prevPlayerY + pSize;
    if (playerBottom >= platTop - 6 && playerBottom <= platTop + 2 &&
        prevBottom >= platTop - 6 && prevBottom <= platTop + 2) {
      return { type: 'land', y: platTop };
    }
    return { type: 'death' };
  }

  draw(ctx, cameraX, theme) {
    if (this._hitboxOnly) return;
    const he = this.hiddenEdges || new Set();
    // Extend draw area by 1px on hidden edges to cover subpixel gaps
    const ex = { l: he.has('left') ? 1 : 0, r: he.has('right') ? 1 : 0, t: he.has('top') ? 1 : 0, b: he.has('bottom') ? 1 : 0 };
    const drawX = this.x - ex.l;
    const drawY = this.y - ex.t;
    const drawW = this.w + ex.l + ex.r;
    const drawH = this.h + ex.t + ex.b;

    const sx = drawX - cameraX + PLAYER_X_OFFSET;
    if (sx < -drawW || sx > SCREEN_WIDTH + drawW) return;
    const sy = drawY;
    const edgeKey = [...he].sort().join('');

    const key = `plat_${drawW}_${drawH}_${edgeKey}_${themeSpriteKey(theme)}`;
    const sprite = getCachedSprite(key, drawW, drawH, (c) => {
      paintBlockBody(c, 0, 0, drawW, drawH, theme);
      paintBlockBevel(c, 0, 0, drawW, drawH, theme, he);
      paintBlockEdges(c, 0, 0, drawW, drawH, theme, he);
    });
    ctx.drawImage(sprite.canvas, sx - sprite.pad, sy - sprite.pad);
  }
}

// ============================================================
// PLATFORM GROUP - merged touching platforms + slopes (seamless render, per-piece collision)
// ============================================================
export class PlatformGroup {
  constructor(pieces) {
    this.type = 'platform_group';
    this.pieces = pieces; // Platform and Slope objects
    // Bounding box for visibility culling
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pieces) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }
    this.x = minX;
    this.y = minY;
    this.w = maxX - minX;
    this.h = maxY - minY;
  }

  checkCollision(playerRect, prevPlayerY, gravityMult) {
    // Check slopes first (they return land, never death), then platforms
    // This prevents a platform returning death when the player is actually on a slope
    for (const p of this.pieces) {
      if (p.type !== 'slope' && p.type !== 'mini_slope') continue;
      const result = p.checkCollision(playerRect, prevPlayerY, gravityMult);
      if (result) { result._piece = p; return result; }
    }
    for (const p of this.pieces) {
      if (p.type === 'slope' || p.type === 'mini_slope') continue;
      const result = p.checkCollision(playerRect, prevPlayerY, gravityMult);
      if (result) { result._piece = p; return result; }
    }
    return null;
  }

  // Geometry never changes, so the clip, border, slope and top-edge shapes are
  // built once in local space (x relative to this.x, y absolute) and reused every
  // frame under a single translate. Previously this rebuilt every path per frame
  // and ran an O(pieces^2) scan for exposed tops.
  _buildPaths() {
    if (this._paths) return this._paths;
    const ox = this.x;
    const clip = new Path2D();
    const border = new Path2D();
    const slopeFill = new Path2D();
    const slopeEdge = new Path2D();
    const tops = [];
    let hasSlope = false;

    for (const p of this.pieces) {
      const px = p.x - ox;
      const isSlope = p.type === 'slope' || p.type === 'mini_slope';
      const he = p.hiddenEdges || EMPTY_EDGES;

      if (isSlope) {
        if (p.direction === 'up') {
          clip.moveTo(px, p.y + p.h);
          clip.lineTo(px + p.w, p.y + p.h);
          clip.lineTo(px + p.w, p.y);
          clip.closePath();
        } else {
          clip.moveTo(px, p.y);
          clip.lineTo(px, p.y + p.h);
          clip.lineTo(px + p.w, p.y + p.h);
          clip.closePath();
        }
        if (p.type === 'slope') {
          hasSlope = true;
          if (p.direction === 'up') {
            slopeFill.moveTo(px, p.y + p.h);
            slopeFill.lineTo(px + p.w, p.y + p.h);
            slopeFill.lineTo(px + p.w, p.y);
            slopeEdge.moveTo(px, p.y + p.h);
            slopeEdge.lineTo(px + p.w, p.y);
          } else {
            slopeFill.moveTo(px, p.y);
            slopeFill.lineTo(px, p.y + p.h);
            slopeFill.lineTo(px + p.w, p.y + p.h);
            slopeEdge.moveTo(px, p.y);
            slopeEdge.lineTo(px + p.w, p.y + p.h);
          }
          slopeFill.closePath();
        }
        if (p.direction === 'up') {
          if (!he.has('bottom')) { border.moveTo(px, p.y + p.h); border.lineTo(px + p.w, p.y + p.h); }
          if (!he.has('right')) { border.moveTo(px + p.w, p.y + p.h); border.lineTo(px + p.w, p.y); }
        } else {
          if (!he.has('left')) { border.moveTo(px, p.y); border.lineTo(px, p.y + p.h); }
          if (!he.has('bottom')) { border.moveTo(px, p.y + p.h); border.lineTo(px + p.w, p.y + p.h); }
        }
        continue;
      }

      const el = he.has('left') ? 1 : 0;
      const er = he.has('right') ? 1 : 0;
      const et = he.has('top') ? 1 : 0;
      const eb = he.has('bottom') ? 1 : 0;
      clip.rect(px - el, p.y - et, p.w + el + er, p.h + et + eb);

      if (!he.has('top')) { border.moveTo(px, p.y); border.lineTo(px + p.w, p.y); }
      if (!he.has('right')) { border.moveTo(px + p.w, p.y); border.lineTo(px + p.w, p.y + p.h); }
      if (!he.has('bottom')) { border.moveTo(px + p.w, p.y + p.h); border.lineTo(px, p.y + p.h); }
      if (!he.has('left')) { border.moveTo(px, p.y + p.h); border.lineTo(px, p.y); }

      const covered = this.pieces.some(q =>
        q !== p && Math.abs(q.y + q.h - p.y) < 2 && q.x < p.x + p.w && q.x + q.w > p.x
      );
      if (!covered) tops.push({ x: px, y: p.y, w: p.w });
    }

    this._paths = { clip, border, slopeFill, slopeEdge, tops, hasSlope };
    return this._paths;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w - 50 || sx > SCREEN_WIDTH + 50) return;

    const paths = this._buildPaths();
    const simple = isSimpleTextures();
    const fancy = isFancy();

    ctx.save();
    ctx.translate(sx, 0); // everything below is in local space

    ctx.save();
    ctx.clip(paths.clip);
    paintBlockBody(ctx, 0, this.y, this.w, this.h, theme);

    // Exposed tops catch the light. Glow state is set once for the whole run —
    // toggling shadowBlur per piece was the single most expensive thing here.
    if (paths.tops.length) {
      if (fancy) {
        for (const t of paths.tops) {
          ctx.fillStyle = shadeGradient(ctx, 'topgloss', t.y, t.y + 16, 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)');
          ctx.fillRect(t.x, t.y, t.w, 16);
        }
      }
      drawNeonGlow(ctx, theme.accent, 10);
      ctx.fillStyle = simple ? theme.accent : mix(theme.accent, '#FFFFFF', 0.35);
      for (const t of paths.tops) ctx.fillRect(t.x, t.y, t.w, 3);
      clearGlow(ctx);
      if (!simple) {
        ctx.strokeStyle = 'rgba(255,255,255,0.20)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const t of paths.tops) {
          ctx.moveTo(t.x, t.y + 4.5);
          ctx.lineTo(t.x + t.w, t.y + 4.5);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    if (paths.hasSlope) {
      // Refill slopes outside the clip to cover antialiasing seams
      ctx.fillStyle = simple ? theme.platform : bodyGradient(ctx, this.y, this.h, theme);
      ctx.fill(paths.slopeFill);
      if (fancy) {
        const pat = blockPattern(ctx, 0);
        if (pat) { ctx.fillStyle = pat; ctx.fill(paths.slopeFill); }
      }

      ctx.save();
      ctx.lineCap = 'round';
      drawNeonGlow(ctx, theme.accent, 10);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3;
      ctx.stroke(paths.slopeEdge);
      clearGlow(ctx);
      if (!simple) {
        ctx.strokeStyle = mix(theme.accent, '#FFFFFF', 0.7);
        ctx.lineWidth = 1;
        ctx.stroke(paths.slopeEdge);
      }
      ctx.restore();
    }

    // Border — outer edges only, one stroke for the whole group
    ctx.strokeStyle = rgba(theme.accent, 0.85);
    ctx.lineWidth = 1;
    ctx.stroke(paths.border);

    ctx.restore();
  }

  reset() {}
}

// ============================================================
// MOVING PLATFORM
// ============================================================
export class MovingPlatform extends Platform {
  constructor(gx, gy, gw, gh, endGx, endGy, speed = 2) {
    super(gx, gy, gw, gh);
    this.startX = this.x;
    this.startY = this.y;
    this.endX = endGx * GRID;
    this.endY = GROUND_Y - (endGy + gh) * GRID;
    this.speed = speed;
    this.t = 0;
    this.type = 'moving';
  }

  update() {
    const prevX = this.x;
    const prevY = this.y;
    this.t += this.speed * 0.005;
    const s = (Math.sin(this.t) + 1) / 2;
    this.x = this.startX + (this.endX - this.startX) * s;
    this.y = this.startY + (this.endY - this.startY) * s;
    this.deltaX = this.x - prevX;
    this.deltaY = this.y - prevY;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w - 200 || sx > SCREEN_WIDTH + 200) return;
    const sy = this.y;

    if (isSimpleTextures()) {
      ctx.fillStyle = theme.platform;
      ctx.fillRect(sx, sy, this.w, this.h);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sx, sy, this.w, this.h);
      ctx.setLineDash([]);
      return;
    }

    ctx.save();

    // Shaded body with rounded corners
    const rr = Math.min(6, this.h / 2);
    ctx.beginPath();
    ctx.roundRect(sx, sy, this.w, this.h, rr);
    ctx.save();
    ctx.clip();
    paintBlockBody(ctx, sx, sy, this.w, this.h, theme, sx);

    // Hazard chevrons drifting along the platform
    const mid = sy + this.h / 2;
    const drift = (this.t * 60) % 22;
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let ax = sx - 22 + drift; ax < sx + this.w; ax += 22) {
      ctx.beginPath();
      ctx.moveTo(ax, mid - 6);
      ctx.lineTo(ax + 9, mid);
      ctx.lineTo(ax, mid + 6);
      ctx.lineTo(ax + 4, mid);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Neon top edge + rounded outline
    drawNeonGlow(ctx, theme.accent, 10);
    ctx.strokeStyle = mix(theme.accent, '#FFFFFF', 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sx + 1, sy + 1, this.w - 2, this.h - 2, rr);
    ctx.stroke();
    clearGlow(ctx);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + rr, sy + 3);
    ctx.lineTo(sx + this.w - rr, sy + 3);
    ctx.stroke();

    ctx.restore();
  }
}

// ============================================================
// TRANSPORT PLATFORM - moves only when player is on it, locks player
// ============================================================
export class TransportPlatform extends Platform {
  constructor(gx, gy, gw, gh, endGx, endGy, speed = 2) {
    super(gx, gy, gw, gh);
    this.startX = this.x;
    this.startY = this.y;
    this.endX = endGx * GRID;
    this.endY = GROUND_Y - (endGy + gh) * GRID;
    this.speed = speed;
    this.t = 0;
    this.type = 'transport';
    this.active = false; // only moves when player is on it
    this.progress = 0; // 0 to 1, linear progress toward end
    this.arrived = false;
    this.arrivedFrames = 0; // frames since arrival (for grace period)
    this.waitFrames = 0; // delay before movement starts (0.2s = 12 frames)
    this.waitTotal = 12; // frames to wait before moving
    this.deltaX = 0;
    this.deltaY = 0;

    // Calculate total distance for timing
    const dx = this.endX - this.startX;
    const dy = this.endY - this.startY;
    this.totalDist = Math.sqrt(dx * dx + dy * dy);
    // Speed in pixels per frame
    this.pixelsPerFrame = speed * 1.5;
    this.totalFrames = this.totalDist / this.pixelsPerFrame;
    // How many frames = 0.1 sec at 60fps
    this.unlockFrame = Math.max(0, this.totalFrames - 6);
  }

  update() {
    const prevX = this.x;
    const prevY = this.y;
    if (this.active && !this.arrived) {
      // Wait before starting to move
      if (this.waitFrames < this.waitTotal) {
        this.waitFrames++;
        this.deltaX = 0;
        this.deltaY = 0;
        return;
      }
      this.progress += 1 / this.totalFrames;
      if (this.progress >= 1) {
        this.progress = 1;
        this.arrived = true;
        this.arrivedFrames = 0;
      }
    }
    if (this.arrived) {
      this.arrivedFrames++;
    }
    this.x = this.startX + (this.endX - this.startX) * this.progress;
    this.y = this.startY + (this.endY - this.startY) * this.progress;
    this.deltaX = this.x - prevX;
    this.deltaY = this.y - prevY;
  }

  reset() {
    this.active = false;
    this.progress = 0;
    this.arrived = false;
    this.arrivedFrames = 0;
    this.waitFrames = 0;
    this.x = this.startX;
    this.y = this.startY;
    this.deltaX = 0;
    this.deltaY = 0;
  }

  isPlayerLocked() {
    if (!this.active || this.arrived) return false;
    const currentFrame = this.progress * this.totalFrames;
    return currentFrame < this.unlockFrame;
  }

  checkCollision(playerRect, prevPlayerY, gravityMult = 1) {
    const platTop = this.y;
    const platBottom = this.y + this.h;

    // Detection rect: block bounds with vertical extension for stable re-landing
    const ext = 10;
    const sideRect = {
      x: this.x,
      y: gravityMult === -1 ? this.y : this.y - ext,
      w: this.w,
      h: this.h + ext,
    };
    if (!rectsOverlap(playerRect, sideRect)) return null;
    const playerBottom = playerRect.y + playerRect.h;

    // Inverted gravity: player rises and lands on bottom of platform
    if (gravityMult === -1) {
      const playerTop = playerRect.y;
      const rawTop = playerTop - 4;
      const wasBelow = prevPlayerY >= platBottom - 4;
      if (wasBelow) {
        return { type: 'land', y: platBottom };
      }
      const rising = rawTop < prevPlayerY;
      if (rising && playerTop <= platBottom) {
        return { type: 'land', y: platBottom };
      }
      if (playerTop >= platBottom - 8 && playerTop <= platBottom + 4 &&
          prevPlayerY >= platBottom - 8) {
        return { type: 'land', y: platBottom };
      }
      return { type: 'death' };
    }

    // Normal gravity: check if player is on top of platform
    const pSize = playerRect.h + 8;
    const wasAbove = prevPlayerY + pSize <= platTop;
    if (wasAbove) {
      return { type: 'land', y: platTop };
    }
    const currentY = playerRect.y - 4;
    const falling = currentY > prevPlayerY;
    if (falling && currentY <= platTop) {
      return { type: 'land', y: platTop };
    }
    const prevBottom = prevPlayerY + pSize;
    if (playerBottom >= platTop - 6 && playerBottom <= platTop + 2 &&
        prevBottom >= platTop - 6 && prevBottom <= platTop + 2) {
      return { type: 'land', y: platTop };
    }
    return { type: 'death' };
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w - 200 || sx > SCREEN_WIDTH + 200) return;
    const sy = this.y;

    // Distinct colour: idle blue, engaged green
    const color = this.active ? '#44FF88' : '#44AAFF';

    if (isSimpleTextures()) {
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, this.w, this.h);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, this.w, this.h);
      return;
    }

    const rr = Math.min(7, this.h / 2);
    const mid = sy + this.h / 2;

    ctx.save();

    // Under-glow so it reads as hovering
    if (isFancy()) {
      const under = ctx.createLinearGradient(0, sy + this.h, 0, sy + this.h + 16);
      under.addColorStop(0, rgba(color, 0.35));
      under.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = under;
      ctx.fillRect(sx, sy + this.h, this.w, 16);
    }

    ctx.beginPath();
    ctx.roundRect(sx, sy, this.w, this.h, rr);
    ctx.save();
    ctx.clip();

    // Metallic body
    const grad = ctx.createLinearGradient(0, sy, 0, sy + this.h);
    grad.addColorStop(0, mix(color, '#FFFFFF', 0.6));
    grad.addColorStop(0.2, mix(color, '#FFFFFF', 0.25));
    grad.addColorStop(0.65, color);
    grad.addColorStop(1, darken(color, 45));
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, this.w, this.h);

    // Travelling double chevrons show the direction of transport
    const flow = this.active ? (this.progress * this.totalFrames * 1.6) % 18 : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let ax = sx - 18 + flow; ax < sx + this.w; ax += 18) {
      ctx.beginPath();
      ctx.moveTo(ax, mid - 5);
      ctx.lineTo(ax + 5, mid);
      ctx.lineTo(ax, mid + 5);
      ctx.lineTo(ax + 2, mid);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ax + 7, mid - 5);
      ctx.lineTo(ax + 12, mid);
      ctx.lineTo(ax + 7, mid + 5);
      ctx.lineTo(ax + 9, mid);
      ctx.closePath();
      ctx.fill();
    }

    // Top gloss
    const gloss = ctx.createLinearGradient(0, sy, 0, sy + this.h * 0.5);
    gloss.addColorStop(0, 'rgba(255,255,255,0.30)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(sx, sy, this.w, this.h * 0.5);
    ctx.restore();

    // Neon outline
    drawNeonGlow(ctx, color, this.active ? 14 : 8);
    ctx.strokeStyle = mix(color, '#FFFFFF', 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sx + 1, sy + 1, this.w - 2, this.h - 2, rr);
    ctx.stroke();
    clearGlow(ctx);

    // Corner rivets
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const [rx, ry] of [[sx + 6, sy + 5], [sx + this.w - 6, sy + 5],
                            [sx + 6, sy + this.h - 5], [sx + this.w - 6, sy + this.h - 5]]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ============================================================
// JUMP ORB - click while touching to bounce
// ============================================================
export class JumpOrb {
  constructor(gx, gy, orbType = 'yellow_orb') {
    this.type = 'orb';
    this.orbType = orbType; // yellow_orb, pink_orb, dash_orb
    this.x = gx * GRID + GRID / 4;
    this.y = GROUND_Y - (gy + 1) * GRID + GRID / 4;
    this.w = GRID / 2;
    this.h = GRID / 2;
    this.activated = false;
    this.pulseTimer = Math.random() * Math.PI * 2;
  }

  reset() {
    this.activated = false;
  }

  checkCollision(playerRect) {
    if (this.activated) return null;
    if (rectsOverlap(playerRect, this)) {
      return this.orbType; // caller must check if player is clicking
    }
    return null;
  }

  markActivated() {
    this.activated = true;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    this.pulseTimer += 0.05;
    const beat = getBeatIntensity();
    const beatScale = beat > 0 ? (beat * 2 - 1) * 0.25 : 0;
    const pulse = 1 + beatScale + Math.sin(this.pulseTimer) * 0.05;
    const radius = (this.w / 2) * pulse;
    const cx = sx + this.w / 2;
    const cy = sy + this.h / 2;

    const colors = {
      yellow_orb: '#FFD700',
      pink_orb: '#FF69B4',
      dash_orb: '#00FF00',
      blue_orb: '#00CCFF',
    };
    const color = colors[this.orbType] || '#FFD700';

    ctx.save();
    ctx.globalAlpha = this.activated ? 0.2 : 1;

    if (isSimpleTextures()) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Soft ambient halo behind the orb
    if (isFancy()) {
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 3);
      halo.addColorStop(0, rgba(color, 0.35 + beat * 0.2));
      halo.addColorStop(0.5, rgba(color, 0.10));
      halo.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rotating dashed capture ring — reads as "interactive"
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.pulseTimer * 0.6);
    drawNeonGlow(ctx, color, 12 + beat * 10);
    ctx.strokeStyle = mix(color, '#FFFFFF', 0.35);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, radius + 7 + beat * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    clearGlow(ctx);
    ctx.restore();

    // Glass sphere body
    drawNeonGlow(ctx, color, 14 + beat * 10);
    const grad = ctx.createRadialGradient(
      cx - radius * 0.35, cy - radius * 0.4, radius * 0.05,
      cx, cy, radius
    );
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.22 + beat * 0.08, mix(color, '#FFFFFF', 0.45));
    grad.addColorStop(0.62, color);
    grad.addColorStop(1, darken(color, 55));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    clearGlow(ctx);

    // Bottom rim bounce-light
    const rim = ctx.createRadialGradient(
      cx + radius * 0.2, cy + radius * 0.5, radius * 0.1,
      cx, cy, radius
    );
    rim.addColorStop(0, rgba(color, 0));
    rim.addColorStop(0.75, rgba(color, 0));
    rim.addColorStop(1, 'rgba(255,255,255,0.5)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = `rgba(255,255,255,${0.55 + beat * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(cx - radius * 0.3, cy - radius * 0.38, radius * 0.3, radius * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Tiny secondary sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(cx + radius * 0.35, cy + radius * 0.3, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ============================================================
// JUMP PAD - automatic bounce on contact (no click needed)
// ============================================================
export class JumpPad {
  constructor(gx, gy, padType = 'yellow_pad') {
    this.type = 'pad';
    this.padType = padType; // yellow_pad, pink_pad
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + 0.5) * GRID;
    this.w = GRID;
    this.h = GRID * 0.5;
    this.flashTimer = 0;
    this.activated = false;
    this._particles = [];
  }

  reset() { this.activated = false; }

  checkCollision(playerRect) {
    if (rectsOverlap(playerRect, this)) {
      if (this.activated) return null;
      this.activated = true;
      this.flashTimer = 10;
      return this.padType;
    }
    this.activated = false;
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    if (this.flashTimer > 0) this.flashTimer--;
    const flash = this.flashTimer > 0;

    const colors = {
      yellow_pad: '#FFD700',
      pink_pad: '#FF69B4',
      blue_pad: '#00CCFF',
    };
    const color = colors[this.padType] || '#FFD700';

    ctx.save();

    const cx = sx + GRID / 2;
    const baseY = sy + this.h;
    const halfW = GRID * 0.38;
    const height = this.h * 0.45;

    if (isSimpleTextures()) {
      ctx.fillStyle = flash ? '#FFFFFF' : color;
      ctx.beginPath();
      ctx.moveTo(cx - halfW, baseY);
      ctx.quadraticCurveTo(cx, baseY - height * 2.4, cx + halfW, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    // Ground pool of light beneath the pad
    if (isFancy()) {
      const pool = ctx.createRadialGradient(cx, baseY, 2, cx, baseY, halfW * 2);
      pool.addColorStop(0, rgba(color, flash ? 0.7 : 0.4));
      pool.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = pool;
      ctx.fillRect(cx - halfW * 2, baseY - halfW * 1.2, halfW * 4, halfW * 2.4);
    }

    // Dark mounting plate for contrast against the floor
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(cx - halfW - 2, baseY - 3, (halfW + 2) * 2, 5, 2.5);
    ctx.fill();

    // Emitter dome
    drawNeonGlow(ctx, color, flash ? 24 : 12);
    const dome = ctx.createLinearGradient(0, baseY - height * 2, 0, baseY);
    dome.addColorStop(0, flash ? '#FFFFFF' : mix(color, '#FFFFFF', 0.65));
    dome.addColorStop(0.55, flash ? '#FFFFFF' : color);
    dome.addColorStop(1, flash ? mix(color, '#FFFFFF', 0.4) : darken(color, 45));
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);
    ctx.quadraticCurveTo(cx, baseY - height * 2.4, cx + halfW, baseY);
    ctx.closePath();
    ctx.fill();
    clearGlow(ctx);

    // Glass highlight across the dome
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.62, baseY - 2);
    ctx.quadraticCurveTo(cx - halfW * 0.1, baseY - height * 2, cx + halfW * 0.15, baseY - 2);
    ctx.closePath();
    ctx.fill();

    // Bright emitter slit along the crown
    drawNeonGlow(ctx, '#FFFFFF', flash ? 14 : 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.35, baseY - height * 1.15);
    ctx.lineTo(cx + halfW * 0.35, baseY - height * 1.15);
    ctx.stroke();
    clearGlow(ctx);

    // Stacked chevrons pointing up
    ctx.strokeStyle = flash ? '#FFFFFF' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const yOff = baseY - height * (2.6 + i * 0.8) - (flash ? 6 : 0);
      ctx.globalAlpha = (1 - i * 0.45) * (flash ? 1 : 0.8);
      ctx.beginPath();
      ctx.moveTo(cx - 6, yOff + 5);
      ctx.lineTo(cx, yOff);
      ctx.lineTo(cx + 6, yOff + 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    clearGlow(ctx);

    // Ambient particles (world coords, converted to screen at draw)
    const skipParticles = noParticles() || !isFancy();
    if (!skipParticles) {
      const worldCx = this.x + GRID / 2;
      const worldBaseY = this.y + this.h;
      if (Math.random() < 0.15) {
        this._particles.push({
          wx: worldCx + (Math.random() - 0.5) * halfW * 1.5,
          wy: worldBaseY - Math.random() * height * 0.5,
          vy: -0.3 - Math.random() * 0.8,
          vx: (Math.random() - 0.5) * 0.3,
          life: 1,
          size: 1.5 + Math.random() * 2,
        });
      }
      for (let i = this._particles.length - 1; i >= 0; i--) {
        const p = this._particles[i];
        p.wx += p.vx;
        p.wy += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) { this._particles.splice(i, 1); continue; }
        const px = p.wx - cameraX + PLAYER_X_OFFSET;
        ctx.globalAlpha = p.life * 0.6;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, p.wy, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this._particles.length > 15) this._particles.splice(0, this._particles.length - 15);
    }

    ctx.restore();
  }
}

// ============================================================
// PORTAL - gravity, speed, ship mode, wave mode
// ============================================================
const PORTAL_ICONS = {
  gravity: '↕', speed_up: '▶▶', speed_down: '▶',
  ship: '✈', wave: '∿', cube: '■', ball: '●',
  mini: '▼', big: '▲', reverse: '⇐', forward: '⇒',
};

export class Portal {
  constructor(gx, gy, portalType = 'gravity') {
    this.type = 'portal';
    this.portalType = portalType;
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + 3) * GRID;
    this.w = GRID;
    this.h = GRID * 3;
    this.activated = false;
    this.animTimer = Math.random() * Math.PI * 2;
  }

  reset() {
    this.activated = false;
  }

  checkCollision(playerRect) {
    if (this.activated) return null;
    if (rectsOverlap(playerRect, this)) {
      this.activated = true;
      return `portal_${this.portalType}`;
    }
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID * 2 || sx > SCREEN_WIDTH + GRID * 2) return;
    const sy = this.y;

    this.animTimer += 0.04;

    const portalColors = {
      gravity: ['#FFD700', '#FF8800'],
      speed_up: ['#FF6600', '#FF2200'],
      speed_down: ['#00AAFF', '#0055FF'],
      ship: ['#FF00FF', '#8800AA'],
      wave: ['#00FFAA', '#008866'],
      cube: ['#00C8FF', '#0066CC'],
      ball: ['#FF8800', '#CC4400'],
      mini: ['#FF44FF', '#AA00AA'],
      big: ['#44AAFF', '#2266CC'],
      reverse: ['#00FFFF', '#008888'],
      forward: ['#44FF44', '#228822'],
    };
    const [color1, color2] = portalColors[this.portalType] || ['#FFD700', '#FF8800'];

    const cx = sx + this.w / 2;
    const cy = sy + this.h / 2;
    const frameW = 38;
    const frameH = this.h - 6;
    const frameX = cx - frameW / 2;
    const frameY = sy + 3;
    const frameR = frameW / 2; // pill shape
    const barW = 8;
    const barInset = 6;

    const innerW = frameW - barW * 2 - 2;
    const innerH = frameH - barInset * 2;
    const innerX = cx - innerW / 2;
    const innerY = frameY + barInset;
    const low = !isFancy();

    ctx.save();
    ctx.globalAlpha = this.activated ? 0.15 : 1;

    if (isSimpleTextures()) {
      ctx.fillStyle = color1;
      ctx.beginPath();
      ctx.roundRect(frameX, frameY, frameW, frameH, frameR);
      ctx.fill();
      ctx.fillStyle = color2;
      ctx.beginPath();
      ctx.roundRect(innerX, innerY, innerW, innerH, innerW / 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PORTAL_ICONS[this.portalType] || '?', cx, cy + 0.5);
      ctx.restore();
      return;
    }

    // Ambient light spill onto the surroundings
    if (!low) {
      const spill = ctx.createRadialGradient(cx, cy, 4, cx, cy, frameH * 0.7);
      spill.addColorStop(0, rgba(color1, 0.28));
      spill.addColorStop(1, rgba(color1, 0));
      ctx.fillStyle = spill;
      ctx.fillRect(cx - frameH * 0.7, cy - frameH * 0.7, frameH * 1.4, frameH * 1.4);
    }

    // Outer frame — brushed metal pill with a coloured core
    drawNeonGlow(ctx, color1, 18);
    const frameGrad = ctx.createLinearGradient(frameX, 0, frameX + frameW, 0);
    frameGrad.addColorStop(0, mix(color2, '#000000', 0.35));
    frameGrad.addColorStop(0.22, mix(color1, '#FFFFFF', 0.45));
    frameGrad.addColorStop(0.5, color1);
    frameGrad.addColorStop(0.78, color2);
    frameGrad.addColorStop(1, mix(color2, '#000000', 0.45));
    ctx.fillStyle = frameGrad;
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameW, frameH, frameR);
    ctx.fill();
    clearGlow(ctx);

    // Bevelled outline
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(frameX + 0.5, frameY + 0.5, frameW - 1, frameH - 1, frameR);
    ctx.stroke();

    // Cap rings at the top and bottom of the pill
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(frameX + 5, frameY + frameR * 0.9);
    ctx.lineTo(frameX + frameW - 5, frameY + frameR * 0.9);
    ctx.moveTo(frameX + 5, frameY + frameH - frameR * 0.9);
    ctx.lineTo(frameX + frameW - 5, frameY + frameH - frameR * 0.9);
    ctx.stroke();

    // Inner void
    ctx.fillStyle = 'rgba(2,2,14,0.86)';
    ctx.beginPath();
    ctx.roundRect(innerX, innerY, innerW, innerH, innerW / 2);
    ctx.fill();

    // Energy field inside the void
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(innerX, innerY, innerW, innerH, innerW / 2);
    ctx.clip();

    const flow = ctx.createLinearGradient(0, innerY, 0, innerY + innerH);
    flow.addColorStop(0, rgba(color1, 0.55));
    flow.addColorStop(0.5, rgba(color2, 0.12));
    flow.addColorStop(1, rgba(color1, 0.55));
    ctx.fillStyle = flow;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Scrolling scanlines
    if (!low) {
      ctx.globalAlpha = this.activated ? 0.1 : 0.35;
      ctx.fillStyle = mix(color1, '#FFFFFF', 0.6);
      const period = 14;
      const off = ((this.animTimer * 26) % period + period) % period;
      for (let y = innerY - period + off; y < innerY + innerH; y += period) {
        ctx.fillRect(innerX, y, innerW, 2);
      }
      ctx.globalAlpha = this.activated ? 0.15 : 1;
    }

    // Energy motes riding the field
    for (let i = 0; i < 4; i++) {
      const t = (this.animTimer * 1.5 + i * 0.25) % 1;
      const py = innerY + t * innerH;
      const px = cx + Math.sin(this.animTimer * 3 + i * 1.5) * (innerW / 2 - 3);
      const alpha = (this.activated ? 0.1 : 0.85) * (1 - Math.abs(t - 0.5) * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = this.activated ? 0.15 : 1;

    // Icon in center
    clearGlow(ctx);
    const icon = PORTAL_ICONS[this.portalType] || '?';
    // Icon disc — frosted glass with a lit rim
    const discR = 13;
    const disc = ctx.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, discR);
    disc.addColorStop(0, 'rgba(46,46,62,0.95)');
    disc.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fill();
    drawNeonGlow(ctx, color1, 8);
    ctx.strokeStyle = mix(color1, '#FFFFFF', 0.4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    clearGlow(ctx);
    // Icon text
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, cx, cy + 0.5);

    ctx.restore();
  }
}

// ============================================================
// CHECKPOINT - neon flag
// ============================================================
export class Checkpoint {
  constructor(gx, gy) {
    this.type = 'checkpoint';
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + 4) * GRID;
    this.w = GRID * 0.5;
    this.h = GRID * 4;
    this.activated = false;
  }

  reset() {
    this.activated = false;
  }

  checkCollision(playerRect) {
    if (this.activated) return null;
    if (rectsOverlap(playerRect, { x: this.x, y: this.y, w: this.w, h: this.h })) {
      this.activated = true;
      return 'checkpoint';
    }
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    // The model is one grid shorter than the hitbox: the flag sits a tile lower
    // while collision still uses the full height set in the constructor.
    const sy = this.y + GRID;
    const vh = this.h - GRID;

    const on = this.activated;
    const tint = on ? '#00FF7F' : '#7A8290';
    this._anim = (this._anim || 0) + 0.05;

    ctx.save();

    if (isSimpleTextures()) {
      ctx.fillStyle = tint;
      ctx.fillRect(sx, sy, 4, vh);
      ctx.fillStyle = on ? '#00CC55' : '#3A424C';
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy);
      ctx.lineTo(sx + 28, sy + 14);
      ctx.lineTo(sx + 4, sy + 28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    // Base plate
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(sx - 7, sy + vh - 6, 20, 6, 3);
    ctx.fill();

    // Metal pole with a specular seam
    drawNeonGlow(ctx, tint, on ? 12 : 0);
    const pole = ctx.createLinearGradient(sx, 0, sx + 5, 0);
    pole.addColorStop(0, darken(tint, 55));
    pole.addColorStop(0.4, mix(tint, '#FFFFFF', 0.55));
    pole.addColorStop(1, darken(tint, 35));
    ctx.fillStyle = pole;
    ctx.fillRect(sx, sy, 5, vh);
    clearGlow(ctx);

    // Pole cap
    ctx.fillStyle = mix(tint, '#FFFFFF', 0.5);
    ctx.beginPath();
    ctx.arc(sx + 2.5, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Pennant — subtle wave so it feels alive
    const wave = on ? Math.sin(this._anim * 2) * 2.5 : 0;
    drawNeonGlow(ctx, tint, on ? 16 : 4);
    const flagGrad = ctx.createLinearGradient(sx + 5, sy, sx + 32, sy + 28);
    flagGrad.addColorStop(0, on ? mix(tint, '#FFFFFF', 0.4) : '#4A5560');
    flagGrad.addColorStop(1, on ? darken(tint, 40) : '#2A323C');
    ctx.fillStyle = flagGrad;
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy + 2);
    ctx.quadraticCurveTo(sx + 20, sy + 4 + wave, sx + 32, sy + 15 + wave);
    ctx.quadraticCurveTo(sx + 20, sy + 24 - wave, sx + 4, sy + 30);
    ctx.closePath();
    ctx.fill();
    clearGlow(ctx);

    // Fold highlight down the pennant
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + 5, sy + 3);
    ctx.quadraticCurveTo(sx + 19, sy + 5 + wave, sx + 30, sy + 15 + wave);
    ctx.stroke();

    ctx.restore();
  }
}

// ============================================================
// END MARKER - neon finish line
// ============================================================
export class EndMarker {
  constructor(gx) {
    this.type = 'end';
    this.x = gx * GRID;
    this.y = 0;
    this.w = GRID;
    this.h = GROUND_Y;
    this.animTimer = 0;
  }

  checkCollision(playerRect) {
    if (rectsOverlap(playerRect, this)) return 'complete';
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID * 2 || sx > SCREEN_WIDTH + GRID * 2) return;

    this.animTimer += 0.03;

    const cx = sx + GRID / 2;
    const pulse = 0.5 + Math.sin(this.animTimer * 2) * 0.5;

    ctx.save();

    if (isSimpleTextures()) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(sx, 0, GRID, GROUND_Y);
      ctx.globalAlpha = 1;
      ctx.fillRect(cx - 1.5, 0, 3, GROUND_Y);
      ctx.restore();
      return;
    }

    // Soft light gate spreading either side of the beam
    const spread = ctx.createLinearGradient(cx - GRID * 1.6, 0, cx + GRID * 1.6, 0);
    spread.addColorStop(0, rgba(theme.accent, 0));
    spread.addColorStop(0.5, rgba(theme.accent, 0.20 + pulse * 0.12));
    spread.addColorStop(1, rgba(theme.accent, 0));
    ctx.fillStyle = spread;
    ctx.fillRect(cx - GRID * 1.6, 0, GRID * 3.2, GROUND_Y);

    // Rising energy bands inside the gate
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, 0, GRID, GROUND_Y);
    ctx.clip();
    const bandH = 26;
    const off = ((-this.animTimer * 70) % (bandH * 2) + bandH * 2) % (bandH * 2);
    for (let y = off - bandH * 2; y < GROUND_Y; y += bandH * 2) {
      const g = ctx.createLinearGradient(0, y, 0, y + bandH);
      g.addColorStop(0, rgba(theme.accent, 0));
      g.addColorStop(0.5, rgba(theme.accent, 0.35));
      g.addColorStop(1, rgba(theme.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx, y, GRID, bandH);
    }
    ctx.restore();

    // Twin neon rails framing the gate
    drawNeonGlow(ctx, theme.accent, 16);
    for (const rx of [sx + 3, sx + GRID - 5]) {
      const rail = ctx.createLinearGradient(rx, 0, rx + 2, 0);
      rail.addColorStop(0, theme.accent);
      rail.addColorStop(1, mix(theme.accent, '#FFFFFF', 0.7));
      ctx.fillStyle = rail;
      ctx.fillRect(rx, 0, 2.5, GROUND_Y);
    }
    clearGlow(ctx);

    // Bright pulsing core beam
    drawNeonGlow(ctx, '#FFFFFF', 10 + pulse * 12);
    ctx.globalAlpha = 0.55 + pulse * 0.35;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - 1, 0, 2, GROUND_Y);
    ctx.globalAlpha = 1;
    clearGlow(ctx);

    // Chevron markers climbing the beam
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    const chevGap = 70;
    const chevOff = ((-this.animTimer * 70) % chevGap + chevGap) % chevGap;
    for (let y = chevOff - chevGap; y < GROUND_Y; y += chevGap) {
      ctx.beginPath();
      ctx.moveTo(cx - 8, y + 7);
      ctx.lineTo(cx, y);
      ctx.lineTo(cx + 8, y + 7);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ============================================================
// COIN - collectible with spinning animation
// ============================================================
export class Coin {
  constructor(gx, gy) {
    this.type = 'coin';
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + 1) * GRID;
    this.w = GRID;
    this.h = GRID;
    this.collected = false;
    this.animTimer = Math.random() * Math.PI * 2;
    this._collectTimer = 0; // 0 = not collecting, >0 = animating
    this._collectDone = false;
  }

  checkCollision(playerRect) {
    if (this.collected) return null;
    // Smaller hitbox centered in the grid cell
    const coinRect = {
      x: this.x + GRID * 0.15,
      y: this.y + GRID * 0.15,
      w: GRID * 0.7,
      h: GRID * 0.7,
    };
    if (rectsOverlap(playerRect, coinRect)) {
      this.collected = true;
      return 'coin';
    }
    return null;
  }

  reset() { this.collected = false; this._collectTimer = 0; this._collectDone = false; }

  draw(ctx, cameraX) {
    if (this._collectDone) return;
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    this.animTimer += 0.05;

    // Collect animation: float up + fade out
    let collectOffset = 0;
    let collectAlpha = 1;
    let collectScale = 1;
    if (this.collected) {
      this._collectTimer += 0.07;
      const t = Math.min(this._collectTimer, 1);
      // Ease-out curve for smooth deceleration
      const ease = 1 - (1 - t) * (1 - t);
      collectOffset = -ease * 40; // float up 40px
      // Fade starts at 40% through animation, smooth to 0
      const fadeT = Math.max(0, (t - 0.3) / 0.7);
      collectAlpha = 1 - fadeT * fadeT;
      collectScale = 1; // no scale change
      if (t >= 1) { this._collectDone = true; return; }
    }

    const spin = Math.cos(this.animTimer);
    const scale = Math.abs(spin);
    const isFront = spin >= 0;

    const cx = sx + GRID / 2;
    const cy = sy + GRID / 2;
    const r = GRID * 0.36;

    // Floating bob
    const bob = this.collected ? 0 : Math.sin(this.animTimer * 0.6) * 2.5;

    ctx.save();
    ctx.globalAlpha = collectAlpha;
    ctx.translate(cx, cy + bob + collectOffset);
    ctx.scale(Math.max(0.08, scale) * collectScale, collectScale);

    // Ghost mode: already collected coin — dashed circle + checkmark
    if (this.alreadyCollected && !this.collected) {
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      // Outer circle
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Checkmark
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, 0);
      ctx.lineTo(-r * 0.05, r * 0.25);
      ctx.lineTo(r * 0.35, -r * 0.25);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (isSimpleTextures()) {
      ctx.fillStyle = '#B8860B';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isFront ? '#FFD700' : '#C8A020';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
      ctx.fill();
      if (isFront) {
        ctx.fillStyle = '#FFF8DC';
        fillStar(ctx, r * 0.38);
      }
      ctx.restore();
      return;
    }

    // Outer glow pulse
    const glowPulse = 0.4 + Math.sin(this.animTimer * 1.5) * 0.15;
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 14 + Math.sin(this.animTimer * 2) * 4;
    ctx.globalAlpha = glowPulse;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Milled rim — vertical metal gradient so the edge reads as a thick band
    const rimGrad = ctx.createLinearGradient(0, -r, 0, r);
    rimGrad.addColorStop(0, '#8C6508');
    rimGrad.addColorStop(0.35, '#E5B93C');
    rimGrad.addColorStop(0.6, '#B8860B');
    rimGrad.addColorStop(1, '#6E4E06');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();

    // Reeded edge notches
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();

    // Main coin face gradient
    const faceGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.32, 0, 0, 0, r * 0.95);
    if (isFront) {
      faceGrad.addColorStop(0, '#FFFBE0');
      faceGrad.addColorStop(0.28, '#FFE873');
      faceGrad.addColorStop(0.6, '#FFC93C');
      faceGrad.addColorStop(0.88, '#D9A116');
      faceGrad.addColorStop(1, '#A8770C');
    } else {
      faceGrad.addColorStop(0, '#EFD46A');
      faceGrad.addColorStop(0.5, '#C8A020');
      faceGrad.addColorStop(1, '#8E7014');
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Sweeping specular arc across the face
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    ctx.clip();
    const sheen = ctx.createLinearGradient(-r, -r, r * 0.4, r);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(255,255,255,0.42)');
    sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();

    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.strokeStyle = isFront ? 'rgba(184,134,11,0.5)' : 'rgba(140,100,10,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (isFront) {
      // Draw star shape instead of text
      ctx.fillStyle = '#FFF8DC';
      ctx.globalAlpha = 0.9;
      fillStar(ctx, r * 0.38);
      ctx.globalAlpha = 1;

      // Top-left highlight
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }

    ctx.restore();
  }
}

// ============================================================
// COLOR TRIGGER - changes theme colors when player passes through
// ============================================================
export const COLOR_TRIGGER_THEMES = {
  blue: { label: 'Blue', color: '#00C8FF' },
  magenta: { label: 'Magenta', color: '#FF3296' },
  green: { label: 'Green', color: '#64FF32' },
  orange: { label: 'Orange', color: '#FF8800' },
  purple: { label: 'Purple', color: '#AA44FF' },
  red: { label: 'Red', color: '#FF2222' },
  cyan: { label: 'Cyan', color: '#00FFCC' },
  yellow: { label: 'Yellow', color: '#FFD700' },
  custom: { label: 'Custom', color: '#FF66AA' },
};

// Full theme definitions for color triggers
export const COLOR_TRIGGER_FULL_THEMES = {
  blue: THEMES[1],
  magenta: THEMES[2],
  green: THEMES[3],
  orange: {
    name: 'Sunset',
    bgTop: '#1A0A00',
    bgBot: '#4A2000',
    ground: '#663300',
    groundLine: '#FF8800',
    accent: '#FF8800',
    player: '#FFAA44',
    spike: '#FFDDAA',
    platform: '#884400',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  purple: {
    name: 'Nebula',
    bgTop: '#0A0020',
    bgBot: '#2A0060',
    ground: '#3A0080',
    groundLine: '#AA44FF',
    accent: '#AA44FF',
    player: '#CC88FF',
    spike: '#EEDDFF',
    platform: '#5500AA',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  red: {
    name: 'Inferno',
    bgTop: '#1A0000',
    bgBot: '#4A0000',
    ground: '#660000',
    groundLine: '#FF2222',
    accent: '#FF2222',
    player: '#FF6644',
    spike: '#FFCCCC',
    platform: '#880000',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  cyan: {
    name: 'Frost',
    bgTop: '#001A1A',
    bgBot: '#004040',
    ground: '#006060',
    groundLine: '#00FFCC',
    accent: '#00FFCC',
    player: '#66FFE0',
    spike: '#CCFFEE',
    platform: '#008888',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  yellow: {
    name: 'Solar',
    bgTop: '#1A1400',
    bgBot: '#3A2A00',
    ground: '#554400',
    groundLine: '#FFD700',
    accent: '#FFD700',
    player: '#FFEE66',
    spike: '#FFF8DD',
    platform: '#887700',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
};

export class ColorTrigger {
  constructor(gx, gy, colorType = 'blue', customTheme = null, duration = 0.6) {
    this.type = 'color_trigger';
    this.colorType = colorType;
    this.x = gx * GRID;
    this.y = 0;
    this.w = GRID;
    this.h = GROUND_Y;
    this.activated = false;
    this.customTheme = customTheme;
    this.duration = duration;
  }

  reset() {
    this.activated = false;
  }

  checkCollision(playerRect) {
    if (this.activated) return null;
    if (rectsOverlap(playerRect, this)) {
      this.activated = true;
      return `color_${this.colorType}`;
    }
    return null;
  }

  draw() {
    // Invisible in gameplay
  }

  drawEditor(ctx, cameraX) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID * 2 || sx > SCREEN_WIDTH + GRID * 2) return;
    const color = this.colorType === 'custom' && this.customTheme
      ? this.customTheme.accent
      : (COLOR_TRIGGER_THEMES[this.colorType] || COLOR_TRIGGER_THEMES.blue).color;
    // Thin vertical dashed line spanning full height
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(sx + GRID / 2, 0);
    ctx.lineTo(sx + GRID / 2, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Small label
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('C', sx + GRID / 2, 14);
    ctx.restore();
  }
}

// ============================================================
// SAW BLADE - rotating circular obstacle with teeth
// ============================================================
export class SawBlade {
  constructor(gx, gy, radius = 1) {
    this.type = 'saw';
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + 1) * GRID;
    this.w = radius * GRID;
    this.h = radius * GRID;
    this.radius = radius;
    this.animTimer = Math.random() * Math.PI * 2;
  }

  reset() {}

  checkCollision(playerRect) {
    // Circular collision: distance from player center to saw center
    const sawCx = this.x + this.w / 2;
    const sawCy = this.y + this.h / 2;
    const sawR = this.w / 2;

    const playerCx = playerRect.x + playerRect.w / 2;
    const playerCy = playerRect.y + playerRect.h / 2;
    const playerR = Math.min(playerRect.w, playerRect.h) / 2;

    const dx = playerCx - sawCx;
    const dy = playerCy - sawCy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const forgiveness = 8;

    if (dist < sawR + playerR - forgiveness) {
      return 'death';
    }
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w - GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    this.animTimer += 0.06;

    const cx = sx + this.w / 2;
    const cy = sy + this.h / 2;
    const r = this.w / 2;
    const teeth = Math.max(8, Math.round(this.radius * 10));
    const color = theme.spike;

    const low = !isFancy();

    ctx.save();

    if (isSimpleTextures()) {
      ctx.translate(cx, cy);
      ctx.rotate(this.animTimer);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
        else ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
        ctx.lineTo(Math.cos(a1) * r * 0.7, Math.sin(a1) * r * 0.7);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Motion-blur halo — the blade reads as spinning fast
    if (!low) {
      const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.5);
      halo.addColorStop(0, rgba(theme.accent, 0.30));
      halo.addColorStop(1, rgba(theme.accent, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(cx, cy);
    ctx.rotate(this.animTimer);

    // Blade silhouette with swept-back teeth
    const bladePath = () => {
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = ((i + 0.35) / teeth) * Math.PI * 2;
        const a2 = ((i + 0.72) / teeth) * Math.PI * 2;
        const innerR = r * 0.74;
        if (i === 0) ctx.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
        else ctx.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
        ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
        ctx.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR);
      }
      ctx.closePath();
    };

    drawNeonGlow(ctx, theme.accent, 14);
    bladePath();
    // Brushed-steel gradient across the disc
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, mix(color, '#FFFFFF', 0.75));
    grad.addColorStop(0.35, color);
    grad.addColorStop(0.6, darken(color, 25));
    grad.addColorStop(1, darken(color, 55));
    ctx.fillStyle = grad;
    ctx.fill();
    clearGlow(ctx);

    // Cutting edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    bladePath();
    ctx.stroke();

    // Recessed disc face
    const face = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r * 0.72);
    face.addColorStop(0, mix(color, '#FFFFFF', 0.5));
    face.addColorStop(0.65, darken(color, 20));
    face.addColorStop(1, darken(color, 50));
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // Lightening holes around the hub
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }

    // Machined rings
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.moveTo(r * 0.28, 0);
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.stroke();

    // Glowing center hub
    drawNeonGlow(ctx, theme.accent, 8);
    const hub = ctx.createRadialGradient(-r * 0.05, -r * 0.06, 0, 0, 0, r * 0.2);
    hub.addColorStop(0, '#FFFFFF');
    hub.addColorStop(1, theme.accent);
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    clearGlow(ctx);

    ctx.restore();
  }
}

// ============================================================
// SLOPE - ramp surface (triangle)
// ============================================================
export class Slope {
  constructor(gx, gy, gw = 2, gh = 2, direction = 'up') {
    this.type = 'slope';
    this.direction = direction;
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + gh) * GRID;
    this.w = gw * GRID;
    this.h = gh * GRID;
  }

  getSurfaceY(worldX) {
    // Clamp worldX to slope's x range
    const clampedX = Math.max(this.x, Math.min(this.x + this.w, worldX));
    const t = (clampedX - this.x) / this.w;
    if (this.direction === 'up') {
      return (this.y + this.h) - this.h * t;
    } else {
      return this.y + this.h * t;
    }
  }

  // Returns the vertical change per pixel of horizontal movement
  getSlopeRatio() {
    // Negative = going up, positive = going down
    if (this.direction === 'up') {
      return -this.h / this.w;
    } else {
      return this.h / this.w;
    }
  }

  checkCollision(playerRect, prevPlayerY, gravityMult) {
    // First check AABB overlap with bounding box
    const bbox = { x: this.x, y: this.y, w: this.w, h: this.h };
    if (!rectsOverlap(playerRect, bbox)) return null;

    // Check vertical wall collision (the tall flat side of the slope)
    // 'up' slope: low-left to high-right → tall wall on RIGHT
    // 'down' slope: high-left to low-right → tall wall on LEFT
    // Player always approaches from the left, so 'down' slope wall is hit first
    const playerRight = playerRect.x + playerRect.w;
    const playerBottom_ = playerRect.y + playerRect.h;
    if (this.direction === 'down') {
      // Tall wall on the left side — player hits this coming from the left
      // Wall spans from this.y to this.y + this.h at x = this.x
      if (playerRight > this.x && playerRight < this.x + 14 &&
          playerBottom_ > this.y + 6 && playerRect.y < this.y + this.h - 6) {
        return { type: 'death', wall: true };
      }
    }

    // Compute surface Y at player's center X
    const playerCenterX = playerRect.x + playerRect.w / 2;
    const surfaceY = this.getSurfaceY(playerCenterX);

    const slopeRatio = this.getSlopeRatio();

    if (gravityMult === 1) {
      // Normal gravity: player lands on top of slope
      const playerBottom = playerRect.y + playerRect.h;
      const pSize = playerRect.h + 8;
      const prevBottom = prevPlayerY + pSize;
      const forgiveness = 12;
      // Don't land if player was well below the surface and rising (hitting from underneath)
      if (prevBottom > surfaceY + forgiveness + 4) return null;
      if (playerBottom >= surfaceY - forgiveness && prevBottom <= surfaceY + forgiveness + 8) {
        return { type: 'land', y: surfaceY, slopeRatio };
      }
      if (playerBottom >= surfaceY - 6 && playerBottom <= surfaceY + forgiveness) {
        return { type: 'land', y: surfaceY, slopeRatio };
      }
    } else {
      // Inverted gravity: player lands on bottom of slope
      const playerTop = playerRect.y;
      const forgiveness = 12;
      // Don't land if player was well above the surface and falling (hitting from other side)
      if (prevPlayerY < surfaceY - forgiveness - 4) return null;
      if (playerTop <= surfaceY + forgiveness && prevPlayerY >= surfaceY - forgiveness - 8) {
        return { type: 'land', y: surfaceY, slopeRatio };
      }
      if (playerTop >= surfaceY - forgiveness && playerTop <= surfaceY + 6) {
        return { type: 'land', y: surfaceY, slopeRatio };
      }
    }
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w || sx > SCREEN_WIDTH + this.w) return;
    const sy = this.y;
    const he = this.hiddenEdges || new Set();
    const edgeKey = [...he].sort().join('');

    const key = `slope_${this.w}_${this.h}_${this.direction}_${edgeKey}_${themeSpriteKey(theme)}`;
    const sprite = getCachedSprite(key, this.w, this.h, (c) => {
      const tri = () => {
        c.beginPath();
        if (this.direction === 'up') {
          c.moveTo(0, this.h);
          c.lineTo(this.w, this.h);
          c.lineTo(this.w, 0);
        } else {
          c.moveTo(0, 0);
          c.lineTo(0, this.h);
          c.lineTo(this.w, this.h);
        }
        c.closePath();
      };

      // Shaded, textured body clipped to the ramp
      c.save();
      tri();
      c.clip();
      paintBlockBody(c, 0, 0, this.w, this.h, theme);
      c.restore();

      // Neon edge along the slope diagonal (always visible)
      c.save();
      c.lineCap = 'round';
      drawNeonGlow(c, theme.accent, 10);
      c.strokeStyle = theme.accent;
      c.lineWidth = 3;
      c.beginPath();
      if (this.direction === 'up') {
        c.moveTo(0, this.h);
        c.lineTo(this.w, 0);
      } else {
        c.moveTo(0, 0);
        c.lineTo(this.w, this.h);
      }
      c.stroke();
      clearGlow(c);
      c.strokeStyle = mix(theme.accent, '#FFFFFF', 0.7);
      c.lineWidth = 1;
      c.stroke();
      c.restore();

      // Border — only on non-hidden edges
      c.strokeStyle = rgba(theme.accent, 0.85);
      c.lineWidth = 1;
      c.beginPath();
      if (this.direction === 'up') {
        if (!he.has('bottom')) { c.moveTo(0, this.h); c.lineTo(this.w, this.h); }
        if (!he.has('right')) { c.moveTo(this.w, this.h); c.lineTo(this.w, 0); }
      } else {
        if (!he.has('left')) { c.moveTo(0, 0); c.lineTo(0, this.h); }
        if (!he.has('bottom')) { c.moveTo(0, this.h); c.lineTo(this.w, this.h); }
      }
      c.stroke();
    });
    ctx.drawImage(sprite.canvas, sx - sprite.pad, sy - sprite.pad);
  }

  reset() {}
}

// ============================================================
// FACTORY
// ============================================================
export function createObstacle(obj) {
  let obs;
  switch (obj.type) {
    case 'spike':
      obs = new Spike(obj.x, obj.y || 0, obj.rot || 0); break;
    case 'mini_spike':
      obs = new MiniSpike(obj.x, obj.y || 0, obj.rot || 0); break;
    case 'mini_block': {
      const mby = obj.halfTop ? obj.y + 0.5 : obj.y;
      obs = new Platform(obj.x, mby, obj.w || 1, 0.5);
      obs.type = 'mini_block';
      break;
    }
    case 'platform':
      obs = new Platform(obj.x, obj.y, obj.w || 1, obj.h || 1); break;
    case 'moving':
      obs = new MovingPlatform(obj.x, obj.y, obj.w || 3, obj.h || 1, obj.endX ?? obj.x, obj.endY ?? obj.y + 3, obj.speed || 2); break;
    case 'transport':
      obs = new TransportPlatform(obj.x, obj.y, obj.w || 3, obj.h || 1, obj.endX ?? obj.x, obj.endY ?? obj.y + 3, obj.speed || 2); break;
    case 'portal':
      obs = new Portal(obj.x, obj.y || 0, obj.portalType || 'gravity'); break;
    case 'checkpoint':
      obs = new Checkpoint(obj.x, obj.y || 0); break;
    case 'end':
      obs = new EndMarker(obj.x); break;
    case 'orb':
      obs = new JumpOrb(obj.x, obj.y || 1, obj.orbType || 'yellow_orb'); break;
    case 'pad':
      obs = new JumpPad(obj.x, obj.y || 0, obj.padType || 'yellow_pad'); break;
    case 'coin':
      obs = new Coin(obj.x, obj.y || 1); break;
    case 'color_trigger':
      obs = new ColorTrigger(obj.x, obj.y || 0, obj.colorType || 'blue', obj.customTheme || null, obj.duration || 0.6); break;
    case 'saw':
      obs = new SawBlade(obj.x, obj.y || 0, obj.radius || 1); break;
    case 'mini_slope': {
      const msy = obj.halfTop ? obj.y + 0.5 : obj.y;
      obs = new Slope(obj.x, msy, 1, 0.5, obj.direction || 'up');
      obs.type = 'mini_slope';
      break;
    }
    case 'slope':
      obs = new Slope(obj.x, obj.y || 0, obj.w || 2, obj.h || 2, obj.direction || 'up'); break;
    default:
      return null;
  }
  if (obs && obj.rot && obj.type !== 'spike') obs.editorRot = obj.rot;
  return obs;
}
