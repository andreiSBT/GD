/** Obstacle types with neon glow visuals and new GD mechanics */

import { GRID, PLAYER_SIZE, GROUND_Y, PLAYER_X_OFFSET, SCREEN_WIDTH, THEMES } from './settings.js';
import { lighten, darken } from './player.js';

// AABB collision check
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Shared neon glow helper
function drawNeonGlow(ctx, color, blur = 10) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}
function clearGlow(ctx) {
  ctx.shadowBlur = 0;
}

// Offscreen canvas sprite cache — render once, blit every frame
const _spriteCache = new Map();
function getCachedSprite(key, w, h, drawFn) {
  let entry = _spriteCache.get(key);
  if (entry) return entry;
  const canvas = document.createElement('canvas');
  // Extra padding for glow/shadow overflow
  const pad = 24;
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const offCtx = canvas.getContext('2d');
  offCtx.translate(pad, pad);
  drawFn(offCtx);
  entry = { canvas, pad };
  _spriteCache.set(key, entry);
  return entry;
}
// Clear cache when theme changes (called from Level)
export function clearSpriteCache() {
  _spriteCache.clear();
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
    const topInset = Math.round(GRID * 0.1); // forgiveness at spike tip
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

    const key = `spike_${this.rot}_${theme.spike}_${theme.accent}`;
    const sprite = getCachedSprite(key, GRID, GRID, (c) => {
      const halfG = GRID / 2;
      c.translate(GRID / 2, GRID / 2);
      c.rotate((this.rot * Math.PI) / 180);

      drawNeonGlow(c, theme.accent, 12);
      const grad = c.createLinearGradient(0, -halfG, 0, halfG);
      grad.addColorStop(0, theme.spike);
      grad.addColorStop(1, theme.accent);
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(0, -halfG + 2);
      c.lineTo(-halfG + 4, halfG - 2);
      c.lineTo(halfG - 4, halfG - 2);
      c.closePath();
      c.fill();

      c.fillStyle = 'rgba(255,255,255,0.15)';
      c.beginPath();
      c.moveTo(0, -halfG + 10);
      c.lineTo(-halfG + 14, halfG - 6);
      c.lineTo(halfG - 14, halfG - 6);
      c.closePath();
      c.fill();

      clearGlow(c);
      c.strokeStyle = theme.accent;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, -halfG + 2);
      c.lineTo(-halfG + 4, halfG - 2);
      c.lineTo(halfG - 4, halfG - 2);
      c.closePath();
      c.stroke();
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
    const forgiveness = Math.round(GRID * 0.1);
    const platTop = this.y;
    const platBottom = this.y + this.h;

    // Collision rect: narrow on x (side forgiveness), extended for re-detection
    // Extend in direction player approaches from: above for normal, below for inverted
    const ext = 10;
    const sideRect = {
      x: this.x + forgiveness,
      y: gravityMult === -1 ? this.y : this.y - ext,
      w: this.w - forgiveness * 2,
      h: this.h + ext,
    };
    if (!rectsOverlap(playerRect, sideRect)) return null;
    const playerBottom = playerRect.y + playerRect.h;

    // Inverted gravity: player rises and lands on bottom of platform
    if (gravityMult === -1) {
      const playerTop = playerRect.y;
      const rawTop = playerTop - 4; // remove getRect inset for direction checks
      // Was below platform last frame
      const wasBelow = prevPlayerY >= platBottom - forgiveness - 4;
      if (wasBelow) {
        return { type: 'land', y: platBottom };
      }
      // Rising into platform bottom
      const rising = rawTop < prevPlayerY;
      if (rising && playerTop <= platBottom + forgiveness) {
        return { type: 'land', y: platBottom };
      }
      // Already standing on bottom of platform (re-land check)
      if (playerTop >= platBottom - 8 && playerTop <= platBottom + forgiveness + 4 &&
          prevPlayerY >= platBottom - forgiveness - 8) {
        return { type: 'land', y: platBottom };
      }
      return { type: 'death' };
    }

    // Normal gravity: check if player is on top of platform
    const pSize = playerRect.h + 8; // actual player size (mini-aware, 8 = 2*inset)
    const wasAbove = prevPlayerY + pSize <= platTop + forgiveness;
    if (wasAbove) {
      return { type: 'land', y: platTop };
    }
    // Falling onto platform
    const currentY = playerRect.y - 4;
    const falling = currentY > prevPlayerY;
    if (falling && currentY <= platTop + forgiveness) {
      return { type: 'land', y: platTop };
    }
    // Already standing on platform (feet near top, within 6px above) - re-land
    // Only if player was also near the top last frame (prevents side approach false land)
    const prevBottom = prevPlayerY + pSize;
    if (playerBottom >= platTop - 6 && playerBottom <= platTop + forgiveness + 2 &&
        prevBottom >= platTop - 6 && prevBottom <= platTop + forgiveness + 2) {
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

    const key = `plat_${drawW}_${drawH}_${theme.platform}_${theme.accent}_${edgeKey}`;
    const sprite = getCachedSprite(key, drawW, drawH, (c) => {
      // Main fill with gradient
      const grad = c.createLinearGradient(0, 0, 0, drawH);
      grad.addColorStop(0, lighten(theme.platform, 20));
      grad.addColorStop(1, theme.platform);
      c.fillStyle = grad;
      c.fillRect(0, 0, drawW, drawH);

      // Neon top edge (only if top not hidden)
      if (!he.has('top')) {
        drawNeonGlow(c, theme.accent, 8);
        c.fillStyle = theme.accent;
        c.fillRect(0, 0, drawW, 3);
        clearGlow(c);
      }

      // Border — only on non-hidden edges
      c.strokeStyle = theme.accent;
      c.lineWidth = 1;
      c.beginPath();
      if (!he.has('top')) { c.moveTo(0, 0); c.lineTo(drawW, 0); }
      if (!he.has('right')) { c.moveTo(drawW, 0); c.lineTo(drawW, drawH); }
      if (!he.has('bottom')) { c.moveTo(drawW, drawH); c.lineTo(0, drawH); }
      if (!he.has('left')) { c.moveTo(0, drawH); c.lineTo(0, 0); }
      c.stroke();
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
      if (p.type !== 'slope') continue;
      const result = p.checkCollision(playerRect, prevPlayerY, gravityMult);
      if (result) { result._piece = p; return result; }
    }
    for (const p of this.pieces) {
      if (p.type === 'slope') continue;
      const result = p.checkCollision(playerRect, prevPlayerY, gravityMult);
      if (result) { result._piece = p; return result; }
    }
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w - 50 || sx > SCREEN_WIDTH + 50) return;

    ctx.save();

    // Build clip path from all pieces (rects for platforms, triangles for slopes)
    ctx.beginPath();
    for (const p of this.pieces) {
      const px = p.x - cameraX + PLAYER_X_OFFSET;
      if (p.type === 'slope') {
        if (p.direction === 'up') {
          ctx.moveTo(px, p.y + p.h);
          ctx.lineTo(px + p.w, p.y + p.h);
          ctx.lineTo(px + p.w, p.y);
          ctx.closePath();
        } else {
          ctx.moveTo(px, p.y);
          ctx.lineTo(px, p.y + p.h);
          ctx.lineTo(px + p.w, p.y + p.h);
          ctx.closePath();
        }
      } else {
        ctx.rect(px, p.y, p.w, p.h);
      }
    }
    ctx.clip();

    // Single gradient over the whole group
    const grad = ctx.createLinearGradient(0, this.y, 0, this.y + this.h);
    grad.addColorStop(0, lighten(theme.platform, 20));
    grad.addColorStop(1, theme.platform);
    ctx.fillStyle = grad;
    ctx.fillRect(sx, this.y, this.w, this.h);

    // Neon top edge on exposed platform tops
    drawNeonGlow(ctx, theme.accent, 8);
    ctx.fillStyle = theme.accent;
    for (const p of this.pieces) {
      if (p.type === 'slope') continue; // slopes get diagonal glow below
      const hasAbove = this.pieces.some(q =>
        q !== p && Math.abs(q.y + q.h - p.y) < 2 && q.x < p.x + p.w && q.x + q.w > p.x
      );
      if (!hasAbove) {
        const px = p.x - cameraX + PLAYER_X_OFFSET;
        ctx.fillRect(px, p.y, p.w, 3);
      }
    }
    clearGlow(ctx);

    ctx.restore();

    // Slope diagonal glow (drawn outside clip)
    for (const p of this.pieces) {
      if (p.type !== 'slope') continue;
      const px = p.x - cameraX + PLAYER_X_OFFSET;
      ctx.save();
      drawNeonGlow(ctx, theme.accent, 8);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (p.direction === 'up') { ctx.moveTo(px, p.y + p.h); ctx.lineTo(px + p.w, p.y); }
      else { ctx.moveTo(px, p.y); ctx.lineTo(px + p.w, p.y + p.h); }
      ctx.stroke();
      clearGlow(ctx);
      ctx.restore();
    }

    // Border — outer edges only
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    for (const p of this.pieces) {
      const px = p.x - cameraX + PLAYER_X_OFFSET;
      const he = p.hiddenEdges || new Set();
      ctx.beginPath();
      if (p.type === 'slope') {
        if (p.direction === 'up') {
          if (!he.has('bottom')) { ctx.moveTo(px, p.y + p.h); ctx.lineTo(px + p.w, p.y + p.h); }
          if (!he.has('right')) { ctx.moveTo(px + p.w, p.y + p.h); ctx.lineTo(px + p.w, p.y); }
        } else {
          if (!he.has('left')) { ctx.moveTo(px, p.y); ctx.lineTo(px, p.y + p.h); }
          if (!he.has('bottom')) { ctx.moveTo(px, p.y + p.h); ctx.lineTo(px + p.w, p.y + p.h); }
        }
      } else {
        if (!he.has('top')) { ctx.moveTo(px, p.y); ctx.lineTo(px + p.w, p.y); }
        if (!he.has('right')) { ctx.moveTo(px + p.w, p.y); ctx.lineTo(px + p.w, p.y + p.h); }
        if (!he.has('bottom')) { ctx.moveTo(px + p.w, p.y + p.h); ctx.lineTo(px, p.y + p.h); }
        if (!he.has('left')) { ctx.moveTo(px, p.y + p.h); ctx.lineTo(px, p.y); }
      }
      ctx.stroke();
    }
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

    const grad = ctx.createLinearGradient(sx, sy, sx, sy + this.h);
    grad.addColorStop(0, lighten(theme.platform, 30));
    grad.addColorStop(1, theme.platform);
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, this.w, this.h);

    // Arrow indicators inside
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    const mid = sy + this.h / 2;
    for (let ax = sx + 10; ax < sx + this.w - 10; ax += 20) {
      ctx.beginPath();
      ctx.moveTo(ax, mid - 5);
      ctx.lineTo(ax + 8, mid);
      ctx.lineTo(ax, mid + 5);
      ctx.closePath();
      ctx.fill();
    }

    // Neon border dashed
    drawNeonGlow(ctx, theme.accent, 6);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx, sy, this.w, this.h);
    ctx.setLineDash([]);
    clearGlow(ctx);
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
    const forgiveness = Math.round(GRID * 0.1);
    const platTop = this.y;
    const platBottom = this.y + this.h;

    // Collision rect: narrow on x (side forgiveness), extended for re-detection
    // Extend in direction player approaches from: above for normal, below for inverted
    const ext = 10;
    const sideRect = {
      x: this.x + forgiveness,
      y: gravityMult === -1 ? this.y : this.y - ext,
      w: this.w - forgiveness * 2,
      h: this.h + ext,
    };
    if (!rectsOverlap(playerRect, sideRect)) return null;
    const playerBottom = playerRect.y + playerRect.h;

    // Inverted gravity: player rises and lands on bottom of platform
    if (gravityMult === -1) {
      const playerTop = playerRect.y;
      const rawTop = playerTop - 4; // remove getRect inset for direction checks
      // Was below platform last frame
      const wasBelow = prevPlayerY >= platBottom - forgiveness - 4;
      if (wasBelow) {
        return { type: 'land', y: platBottom };
      }
      // Rising into platform bottom
      const rising = rawTop < prevPlayerY;
      if (rising && playerTop <= platBottom + forgiveness) {
        return { type: 'land', y: platBottom };
      }
      // Already standing on bottom of platform (re-land check)
      if (playerTop >= platBottom - 8 && playerTop <= platBottom + forgiveness + 4 &&
          prevPlayerY >= platBottom - forgiveness - 8) {
        return { type: 'land', y: platBottom };
      }
      return { type: 'death' };
    }

    // Normal gravity: check if player is on top of platform
    const pSize = playerRect.h + 8; // actual player size (mini-aware, 8 = 2*inset)
    const wasAbove = prevPlayerY + pSize <= platTop + forgiveness;
    if (wasAbove) {
      return { type: 'land', y: platTop };
    }
    // Falling onto platform
    const currentY = playerRect.y - 4;
    const falling = currentY > prevPlayerY;
    if (falling && currentY <= platTop + forgiveness) {
      return { type: 'land', y: platTop };
    }
    // Already standing on platform (feet near top, within 6px above) - re-land
    // Only if player was also near the top last frame (prevents side approach false land)
    const prevBottom = prevPlayerY + pSize;
    if (playerBottom >= platTop - 6 && playerBottom <= platTop + forgiveness + 2 &&
        prevBottom >= platTop - 6 && prevBottom <= platTop + forgiveness + 2) {
      return { type: 'land', y: platTop };
    }
    return { type: 'death' };
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w - 200 || sx > SCREEN_WIDTH + 200) return;
    const sy = this.y;

    // Fill with distinct color
    const color = this.active ? '#44FF88' : '#44AAFF';
    const grad = ctx.createLinearGradient(sx, sy, sx, sy + this.h);
    grad.addColorStop(0, lighten(color, 30));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, this.w, this.h);

    // Transport arrows (double chevrons)
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    const mid = sy + this.h / 2;
    for (let ax = sx + 8; ax < sx + this.w - 8; ax += 16) {
      ctx.beginPath();
      ctx.moveTo(ax, mid - 5);
      ctx.lineTo(ax + 5, mid);
      ctx.lineTo(ax, mid + 5);
      ctx.moveTo(ax + 6, mid - 5);
      ctx.lineTo(ax + 11, mid);
      ctx.lineTo(ax + 6, mid + 5);
      ctx.fill();
    }

    // Neon border solid
    drawNeonGlow(ctx, '#44FF88', 6);
    ctx.strokeStyle = '#44FF88';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, this.w, this.h);
    clearGlow(ctx);
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
    const pulse = 1 + Math.sin(this.pulseTimer) * 0.1;
    const radius = (this.w / 2) * pulse;
    const cx = sx + this.w / 2;
    const cy = sy + this.h / 2;

    const colors = {
      yellow_orb: '#FFD700',
      pink_orb: '#FF69B4',
      dash_orb: '#00FF00',
    };
    const color = colors[this.orbType] || '#FFD700';

    ctx.save();
    ctx.globalAlpha = this.activated ? 0.2 : 1;

    // Outer glow ring
    drawNeonGlow(ctx, color, 15);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.stroke();

    // Main orb
    const grad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, radius);
    grad.addColorStop(0, '#FFF');
    grad.addColorStop(0.4, color);
    grad.addColorStop(1, darken(color, 40));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 3, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    clearGlow(ctx);
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
    };
    const color = colors[this.padType] || '#FFD700';

    ctx.save();

    // Base
    drawNeonGlow(ctx, color, flash ? 20 : 8);
    ctx.fillStyle = flash ? '#FFF' : color;
    ctx.beginPath();
    ctx.moveTo(sx + 5, sy + this.h);
    ctx.lineTo(sx + GRID / 2, sy);
    ctx.lineTo(sx + GRID - 5, sy + this.h);
    ctx.closePath();
    ctx.fill();

    // Arrow up indicator
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(sx + GRID / 2 - 5, sy + this.h - 4);
    ctx.lineTo(sx + GRID / 2, sy + 6);
    ctx.lineTo(sx + GRID / 2 + 5, sy + this.h - 4);
    ctx.closePath();
    ctx.fill();

    clearGlow(ctx);
    ctx.restore();
  }
}

// ============================================================
// PORTAL - gravity, speed, ship mode, wave mode
// ============================================================
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
    const barW = 10;
    const barGap = 18;
    const barH = this.h - 10;
    const barTop = sy + 5;
    const leftX = cx - barGap / 2 - barW;
    const rightX = cx + barGap / 2;

    ctx.save();
    ctx.globalAlpha = this.activated ? 0.15 : 1;

    // Glow behind bars
    drawNeonGlow(ctx, color1, 20);

    // Left bar — gradient top to bottom
    const grad1 = ctx.createLinearGradient(0, barTop, 0, barTop + barH);
    grad1.addColorStop(0, color1);
    grad1.addColorStop(1, color2);
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.roundRect(leftX, barTop, barW, barH, 5);
    ctx.fill();

    // Right bar — gradient bottom to top (mirrored)
    const grad2 = ctx.createLinearGradient(0, barTop, 0, barTop + barH);
    grad2.addColorStop(0, color2);
    grad2.addColorStop(1, color1);
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.roundRect(rightX, barTop, barW, barH, 5);
    ctx.fill();

    clearGlow(ctx);

    // Bright edge highlights on bars
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.roundRect(leftX, barTop, 3, barH, [3, 0, 0, 3]);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(rightX + barW - 3, barTop, 3, barH, [0, 3, 3, 0]);
    ctx.fill();

    // Animated energy particles between bars
    for (let i = 0; i < 4; i++) {
      const t = (this.animTimer * 1.5 + i * 0.25) % 1;
      const py = barTop + t * barH;
      const px = cx + Math.sin(this.animTimer * 3 + i * 1.5) * (barGap / 2 - 2);
      const alpha = (this.activated ? 0.1 : 0.5) * (1 - Math.abs(t - 0.5) * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color1;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = this.activated ? 0.15 : 1;

    // Top and bottom caps (horizontal bars connecting the two pillars)
    ctx.fillStyle = color1;
    ctx.beginPath();
    ctx.roundRect(leftX - 2, barTop - 4, barW * 2 + barGap + 4, 5, 3);
    ctx.fill();
    ctx.fillStyle = color2;
    ctx.beginPath();
    ctx.roundRect(leftX - 2, barTop + barH - 1, barW * 2 + barGap + 4, 5, 3);
    ctx.fill();

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
    this.y = GROUND_Y - (gy + 2) * GRID;
    this.w = GRID * 0.5;
    this.h = GRID * 2;
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
    const sy = this.y;

    ctx.save();

    // Pole with glow
    const poleColor = this.activated ? '#00FF00' : '#888';
    drawNeonGlow(ctx, poleColor, this.activated ? 10 : 0);
    ctx.fillStyle = poleColor;
    ctx.fillRect(sx, sy, 4, this.h);

    // Flag
    const flagColor = this.activated ? '#00FF44' : '#006600';
    drawNeonGlow(ctx, flagColor, this.activated ? 15 : 4);
    ctx.fillStyle = flagColor;
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy);
    ctx.lineTo(sx + 28, sy + 14);
    ctx.lineTo(sx + 4, sy + 28);
    ctx.closePath();
    ctx.fill();

    // Check mark if activated
    if (this.activated) {
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✓', sx + 16, sy + 17);
    }

    clearGlow(ctx);
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

    ctx.save();

    // Pulsing glow column
    const alpha = 0.15 + Math.sin(this.animTimer) * 0.1;
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = alpha;
    ctx.fillRect(sx, 0, GRID, GROUND_Y);

    // Neon stripes
    ctx.globalAlpha = 0.7;
    drawNeonGlow(ctx, theme.accent, 12);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    const stripeH = 20;
    for (let y = (this.animTimer * 50) % (stripeH * 2) - stripeH; y < GROUND_Y; y += stripeH * 2) {
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(sx, y, GRID, stripeH);
    }

    // Center line
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(sx + GRID / 2, 0);
    ctx.lineTo(sx + GRID / 2, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    clearGlow(ctx);
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

  reset() { this.collected = false; }

  draw(ctx, cameraX) {
    if (this.collected) return;
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    this.animTimer += 0.05;
    const spin = Math.cos(this.animTimer);
    const scale = Math.abs(spin);
    const isFront = spin >= 0;

    const cx = sx + GRID / 2;
    const cy = sy + GRID / 2;
    const r = GRID * 0.36;

    // Floating bob
    const bob = Math.sin(this.animTimer * 0.6) * 2.5;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.scale(Math.max(0.08, scale), 1);

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

    // Rim / edge (dark gold border)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#B8860B';
    ctx.fill();

    // Main coin face gradient
    const faceGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r * 0.9);
    if (isFront) {
      faceGrad.addColorStop(0, '#FFF0A0');
      faceGrad.addColorStop(0.4, '#FFD700');
      faceGrad.addColorStop(0.85, '#DAA520');
      faceGrad.addColorStop(1, '#B8860B');
    } else {
      faceGrad.addColorStop(0, '#E8C840');
      faceGrad.addColorStop(0.5, '#C8A020');
      faceGrad.addColorStop(1, '#A08018');
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.strokeStyle = isFront ? 'rgba(184,134,11,0.5)' : 'rgba(140,100,10,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (isFront) {
      // Draw star shape instead of text
      const sr = r * 0.38;
      const ir = sr * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerAngle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const innerAngle = outerAngle + Math.PI / 5;
        const ox = Math.cos(outerAngle) * sr;
        const oy = Math.sin(outerAngle) * sr;
        const ix = Math.cos(innerAngle) * ir;
        const iy = Math.sin(innerAngle) * ir;
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = '#FFF8DC';
      ctx.globalAlpha = 0.9;
      ctx.fill();
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

    ctx.save();

    // Neon glow
    drawNeonGlow(ctx, theme.accent, 14);

    ctx.translate(cx, cy);
    ctx.rotate(this.animTimer);

    // Draw saw body with jagged teeth
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 0.5) / teeth) * Math.PI * 2;
      const outerR = r;
      const innerR = r * 0.7;

      const ox = Math.cos(angle) * outerR;
      const oy = Math.sin(angle) * outerR;
      const ix = Math.cos(nextAngle) * innerR;
      const iy = Math.sin(nextAngle) * innerR;

      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, '#FFF');
    grad.addColorStop(0.3, color);
    grad.addColorStop(1, darken(color, 40));
    ctx.fillStyle = grad;
    ctx.fill();

    // Outline
    clearGlow(ctx);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center hub
    drawNeonGlow(ctx, theme.accent, 6);
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Inner ring
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.stroke();

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

    const key = `slope_${this.w}_${this.h}_${this.direction}_${theme.platform}_${theme.accent}_${edgeKey}`;
    const sprite = getCachedSprite(key, this.w, this.h, (c) => {
      // Gradient fill
      const grad = c.createLinearGradient(0, 0, 0, this.h);
      grad.addColorStop(0, lighten(theme.platform, 20));
      grad.addColorStop(1, theme.platform);
      c.fillStyle = grad;

      // Draw filled triangle
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
      c.fill();

      // Neon edge along the slope diagonal (always visible)
      drawNeonGlow(c, theme.accent, 8);
      c.strokeStyle = theme.accent;
      c.lineWidth = 2;
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

      // Border — only on non-hidden edges
      c.strokeStyle = theme.accent;
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
  switch (obj.type) {
    case 'spike':
      return new Spike(obj.x, obj.y || 0, obj.rot || 0);
    case 'platform':
      return new Platform(obj.x, obj.y, obj.w || 1, obj.h || 1);
    case 'moving':
      return new MovingPlatform(obj.x, obj.y, obj.w || 3, obj.h || 1, obj.endX ?? obj.x, obj.endY ?? obj.y + 3, obj.speed || 2);
    case 'transport':
      return new TransportPlatform(obj.x, obj.y, obj.w || 3, obj.h || 1, obj.endX ?? obj.x, obj.endY ?? obj.y + 3, obj.speed || 2);
    case 'portal':
      return new Portal(obj.x, obj.y || 0, obj.portalType || 'gravity');
    case 'checkpoint':
      return new Checkpoint(obj.x, obj.y || 0);
    case 'end':
      return new EndMarker(obj.x);
    case 'orb':
      return new JumpOrb(obj.x, obj.y || 1, obj.orbType || 'yellow_orb');
    case 'pad':
      return new JumpPad(obj.x, obj.y || 0, obj.padType || 'yellow_pad');
    case 'coin':
      return new Coin(obj.x, obj.y || 1);
    case 'color_trigger':
      return new ColorTrigger(obj.x, obj.y || 0, obj.colorType || 'blue', obj.customTheme || null, obj.duration || 0.6);
    case 'saw':
      return new SawBlade(obj.x, obj.y || 0, obj.radius || 1);
    case 'slope':
      return new Slope(obj.x, obj.y || 0, obj.w || 2, obj.h || 2, obj.direction || 'up');
    default:
      return null;
  }
}
