/** Obstacle types with neon glow visuals and new GD mechanics */

import { GRID, PLAYER_SIZE, GROUND_Y, PLAYER_X_OFFSET, SCREEN_WIDTH } from './settings.js';
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
    const spikeRect = {
      x: this.x + inset,
      y: this.y + inset,
      w: this.w - inset * 2,
      h: this.h - inset * 2,
    };
    if (rectsOverlap(playerRect, spikeRect)) return 'death';
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > SCREEN_WIDTH + GRID) return;
    const sy = this.y;

    ctx.save();
    ctx.translate(sx + GRID / 2, sy + GRID / 2);
    ctx.rotate((this.rot * Math.PI) / 180);

    const halfG = GRID / 2;

    // Glow
    drawNeonGlow(ctx, theme.accent, 12);

    // Main triangle with gradient
    const grad = ctx.createLinearGradient(0, -halfG, 0, halfG);
    grad.addColorStop(0, theme.spike);
    grad.addColorStop(1, theme.accent);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -halfG + 2);
    ctx.lineTo(-halfG + 4, halfG - 2);
    ctx.lineTo(halfG - 4, halfG - 2);
    ctx.closePath();
    ctx.fill();

    // Inner highlight triangle
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, -halfG + 10);
    ctx.lineTo(-halfG + 14, halfG - 6);
    ctx.lineTo(halfG - 14, halfG - 6);
    ctx.closePath();
    ctx.fill();

    // Border
    clearGlow(ctx);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -halfG + 2);
    ctx.lineTo(-halfG + 4, halfG - 2);
    ctx.lineTo(halfG - 4, halfG - 2);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
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

  checkCollision(playerRect, prevPlayerY) {
    if (!rectsOverlap(playerRect, this)) return null;
    const playerBottom = playerRect.y + playerRect.h;
    const platTop = this.y;
    const wasAbove = prevPlayerY + PLAYER_SIZE <= platTop + 4;
    if (wasAbove && playerBottom >= platTop && playerBottom <= platTop + 20) {
      return { type: 'land', y: platTop };
    }
    return { type: 'death' };
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w || sx > SCREEN_WIDTH + this.w) return;
    const sy = this.y;

    // Main fill with gradient
    const grad = ctx.createLinearGradient(sx, sy, sx, sy + this.h);
    grad.addColorStop(0, lighten(theme.platform, 20));
    grad.addColorStop(1, theme.platform);
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, this.w, this.h);

    // Grid pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < this.w; gx += GRID) {
      ctx.beginPath();
      ctx.moveTo(sx + gx, sy);
      ctx.lineTo(sx + gx, sy + this.h);
      ctx.stroke();
    }
    for (let gy = 0; gy < this.h; gy += GRID) {
      ctx.beginPath();
      ctx.moveTo(sx, sy + gy);
      ctx.lineTo(sx + this.w, sy + gy);
      ctx.stroke();
    }

    // Neon top edge
    drawNeonGlow(ctx, theme.accent, 8);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(sx, sy, this.w, 3);
    clearGlow(ctx);

    // Border
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, this.w, this.h);
  }
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
  }

  reset() {}

  checkCollision(playerRect) {
    if (rectsOverlap(playerRect, this)) {
      this.flashTimer = 10;
      return this.padType;
    }
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
      gravity: '#FFD700',
      speed_up: '#FF6600',
      speed_down: '#00AAFF',
      ship: '#FF00FF',
      wave: '#00FFAA',
      cube: '#00C8FF',
    };
    const color = portalColors[this.portalType] || '#FFD700';

    const cx = sx + this.w / 2;
    const cy = sy + this.h / 2;
    const rx = this.w / 2 + 8;
    const ry = this.h / 2;

    ctx.save();
    ctx.globalAlpha = this.activated ? 0.2 : 1;

    // Outer glow
    drawNeonGlow(ctx, color, 18);

    // Rotating particles around portal
    for (let i = 0; i < 6; i++) {
      const angle = this.animTimer * 2 + (i * Math.PI * 2) / 6;
      const px = cx + Math.cos(angle) * rx;
      const py = cy + Math.sin(angle) * ry * 0.6;
      ctx.fillStyle = color;
      ctx.globalAlpha = (this.activated ? 0.1 : 0.6) * (0.5 + Math.sin(this.animTimer + i) * 0.5);
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    ctx.globalAlpha = this.activated ? 0.2 : 1;

    // Main ellipse
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner fill gradient
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ry);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = this.activated ? 0.03 : 0.12;
    ctx.fill();
    ctx.globalAlpha = this.activated ? 0.2 : 1;

    // Icon
    clearGlow(ctx);
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = {
      gravity: '↕',
      speed_up: '▶▶',
      speed_down: '▶',
      ship: '🚀',
      wave: '〰',
      cube: '■',
    };
    ctx.fillText(icons[this.portalType] || '?', cx, cy);

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
    default:
      return null;
  }
}
