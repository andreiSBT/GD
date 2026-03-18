/** Obstacle types with neon glow visuals and new GD mechanics */

import { GRID, PLAYER_SIZE, GROUND_Y, PLAYER_X_OFFSET, SCREEN_WIDTH, LOW_PERF } from './settings.js';
import { lighten, darken } from './player.js';

// AABB collision check
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Shared neon glow helper — skip on mobile for performance
function drawNeonGlow(ctx, color, blur = 10) {
  if (LOW_PERF) return;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}
function clearGlow(ctx) {
  if (LOW_PERF) return;
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

  checkCollision(playerRect, prevPlayerY, gravityMult = 1) {
    const forgiveness = Math.round(GRID * 0.1);
    const platTop = this.y;
    const platBottom = this.y + this.h;

    // Collision rect: narrow on x (side forgiveness), extended for re-detection
    const sideRect = {
      x: this.x + forgiveness,
      y: gravityMult === -1 ? this.y : this.y - 6,
      w: this.w - forgiveness * 2,
      h: this.h + 6,
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
    const sideRect = {
      x: this.x + forgiveness,
      y: gravityMult === -1 ? this.y : this.y - 6,
      w: this.w - forgiveness * 2,
      h: this.h + 6,
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
      gravity: '#FFD700',
      speed_up: '#FF6600',
      speed_down: '#00AAFF',
      ship: '#FF00FF',
      wave: '#00FFAA',
      cube: '#00C8FF',
      ball: '#FF8800',
      mini: '#FF44FF',
      big: '#44AAFF',
      reverse: '#00FFFF',
      forward: '#44FF44',
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
      ball: '●',
      mini: '▼',
      big: '▲',
      reverse: '⇐',
      forward: '⇒',
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
    const scale = Math.abs(Math.cos(this.animTimer)); // spinning effect

    const cx = sx + GRID / 2;
    const cy = sy + GRID / 2;
    const r = GRID * 0.35;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, 1); // horizontal squash for spin

    // Gold coin
    drawNeonGlow(ctx, '#FFD700', 10);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    clearGlow(ctx);

    // Inner circle
    ctx.fillStyle = '#FFC000';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Star in center
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${Math.floor(r)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', 0, 1);

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
    default:
      return null;
  }
}
