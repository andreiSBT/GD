/** Obstacle types: Spike, Platform, MovingPlatform, Portal, Checkpoint */

import { GRID, PLAYER_SIZE, GROUND_Y, PLAYER_X_OFFSET } from './settings.js';

// AABB collision check
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class Spike {
  constructor(gx, gy, rot = 0) {
    this.type = 'spike';
    this.gx = gx;
    this.gy = gy;
    this.rot = rot; // 0=up, 180=down
    this.x = gx * GRID;
    this.w = GRID;
    this.h = GRID;
    this._updateY();
  }

  _updateY() {
    if (this.rot === 0) {
      this.y = GROUND_Y - (this.gy + 1) * GRID;
    } else if (this.rot === 180) {
      this.y = this.gy * GRID;
    } else {
      this.y = GROUND_Y - (this.gy + 1) * GRID;
    }
  }

  checkCollision(playerRect) {
    // Use a smaller hitbox for spike (triangle is forgiving)
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
    if (sx < -GRID || sx > ctx.canvas.width + GRID) return;
    const sy = this.y;

    ctx.save();
    ctx.translate(sx + GRID / 2, sy + GRID / 2);
    ctx.rotate((this.rot * Math.PI) / 180);

    ctx.fillStyle = theme.spike;
    ctx.beginPath();
    ctx.moveTo(0, -GRID / 2 + 2);
    ctx.lineTo(-GRID / 2 + 4, GRID / 2 - 2);
    ctx.lineTo(GRID / 2 - 4, GRID / 2 - 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
}

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

    // Determine collision direction
    const playerBottom = playerRect.y + playerRect.h;
    const playerTop = playerRect.y;
    const platTop = this.y;
    const platBottom = this.y + this.h;

    // Landing on top
    const wasAbove = prevPlayerY + PLAYER_SIZE <= platTop + 4;
    if (wasAbove && playerBottom >= platTop && playerBottom <= platTop + 20) {
      return { type: 'land', y: platTop };
    }

    // Any other collision = death (side or bottom hit)
    return { type: 'death' };
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w || sx > ctx.canvas.width + this.w) return;
    const sy = this.y;

    ctx.fillStyle = theme.platform;
    ctx.fillRect(sx, sy, this.w, this.h);

    // Top highlight
    ctx.fillStyle = theme.groundLine;
    ctx.fillRect(sx, sy, this.w, 3);

    // Border
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, this.w, this.h);
  }
}

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
    this.t += this.speed * 0.005;
    const s = (Math.sin(this.t) + 1) / 2; // 0 to 1 oscillation
    this.x = this.startX + (this.endX - this.startX) * s;
    this.y = this.startY + (this.endY - this.startY) * s;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -this.w - 200 || sx > ctx.canvas.width + 200) return;
    const sy = this.y;

    ctx.fillStyle = theme.platform;
    ctx.fillRect(sx, sy, this.w, this.h);

    // Moving indicator - dashed top
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(sx, sy, this.w, this.h);
    ctx.setLineDash([]);
  }
}

export class Portal {
  constructor(gx, gy, portalType = 'gravity') {
    this.type = 'portal';
    this.portalType = portalType; // 'gravity' or 'speed_up' or 'speed_down'
    this.x = gx * GRID;
    this.y = GROUND_Y - (gy + 3) * GRID; // portals are 3 units tall
    this.w = GRID;
    this.h = GRID * 3;
    this.activated = false;
  }

  reset() {
    this.activated = false;
  }

  checkCollision(playerRect) {
    if (this.activated) return null;
    if (rectsOverlap(playerRect, this)) {
      this.activated = true;
      if (this.portalType === 'gravity') return 'portal_gravity';
      if (this.portalType === 'speed_up') return 'portal_speed_up';
      if (this.portalType === 'speed_down') return 'portal_speed_down';
    }
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID * 2 || sx > ctx.canvas.width + GRID * 2) return;
    const sy = this.y;

    const color = this.portalType === 'gravity' ? theme.portalGravity : theme.portalSpeed;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = this.activated ? 0.3 : 0.9;

    // Draw portal as two mirrored arcs
    const cx = sx + this.w / 2;
    const cy = sy + this.h / 2;
    const rx = this.w / 2 + 5;
    const ry = this.h / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner glow
    ctx.fillStyle = color;
    ctx.globalAlpha = this.activated ? 0.05 : 0.15;
    ctx.fill();

    // Type indicator
    ctx.globalAlpha = this.activated ? 0.3 : 1;
    ctx.fillStyle = color;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.portalType === 'gravity') {
      ctx.fillText('↕', cx, cy);
    } else if (this.portalType === 'speed_up') {
      ctx.fillText('▶▶', cx, cy);
    } else {
      ctx.fillText('▶', cx, cy);
    }

    ctx.restore();
  }
}

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
    const checkRect = { x: this.x, y: this.y, w: this.w, h: this.h };
    if (rectsOverlap(playerRect, checkRect)) {
      this.activated = true;
      return 'checkpoint';
    }
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID || sx > ctx.canvas.width + GRID) return;
    const sy = this.y;

    // Flag pole
    ctx.fillStyle = '#AAA';
    ctx.fillRect(sx, sy, 4, this.h);

    // Flag
    ctx.fillStyle = this.activated ? '#0F0' : '#0A0';
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy);
    ctx.lineTo(sx + 24, sy + 12);
    ctx.lineTo(sx + 4, sy + 24);
    ctx.closePath();
    ctx.fill();
  }
}

export class EndMarker {
  constructor(gx) {
    this.type = 'end';
    this.x = gx * GRID;
    this.y = 0;
    this.w = GRID;
    this.h = GROUND_Y;
  }

  checkCollision(playerRect) {
    if (rectsOverlap(playerRect, this)) return 'complete';
    return null;
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    if (sx < -GRID * 2 || sx > ctx.canvas.width + GRID * 2) return;

    // Finish line
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(sx, 0, GRID, GROUND_Y);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(sx + GRID / 2, 0);
    ctx.lineTo(sx + GRID / 2, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Factory function to create obstacles from level data
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
    default:
      return null;
  }
}
