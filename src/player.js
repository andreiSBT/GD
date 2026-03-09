/** Player cube with physics, rotation, and rendering */

import {
  PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL,
  GROUND_Y, PLAYER_X_OFFSET, SCREEN_HEIGHT
} from './settings.js';

export class Player {
  constructor() {
    this.reset(0);
  }

  reset(startX) {
    this.x = startX;
    this.y = GROUND_Y - PLAYER_SIZE;
    this.vy = 0;
    this.prevY = this.y;
    this.alive = true;
    this.grounded = true;
    this.rotation = 0;
    this.gravityMult = 1; // 1 normal, -1 flipped
    this.speedMult = 1;
    this.onPlatform = false;
  }

  jump() {
    if (this.grounded && this.alive) {
      this.vy = JUMP_VEL * this.gravityMult;
      this.grounded = false;
      this.onPlatform = false;
      return true;
    }
    return false;
  }

  flipGravity() {
    this.gravityMult *= -1;
    this.vy = JUMP_VEL * this.gravityMult * 0.5;
  }

  update() {
    if (!this.alive) return;

    this.prevY = this.y;
    this.x += SCROLL_SPEED * this.speedMult;
    this.vy += GRAVITY * this.gravityMult;
    this.y += this.vy;

    // Ground/ceiling
    if (this.gravityMult > 0) {
      if (this.y >= GROUND_Y - PLAYER_SIZE) {
        this.y = GROUND_Y - PLAYER_SIZE;
        this.vy = 0;
        this.grounded = true;
        this._snapRotation();
      }
    } else {
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this._snapRotation();
      }
    }

    // Rotation
    if (!this.grounded) {
      const dir = this.gravityMult > 0 ? -1 : 1;
      this.rotation += dir * SCROLL_SPEED * 2.5;
    }

    // Off screen = dead
    if (this.y > SCREEN_HEIGHT + 100 || this.y < -200) {
      this.alive = false;
    }
  }

  _snapRotation() {
    this.rotation = Math.round(this.rotation / 90) * 90;
  }

  getRect() {
    const inset = 4;
    return {
      x: this.x + inset,
      y: this.y + inset,
      w: PLAYER_SIZE - inset * 2,
      h: PLAYER_SIZE - inset * 2,
    };
  }

  draw(ctx, cameraX, theme) {
    const sx = this.x - cameraX + PLAYER_X_OFFSET;
    const sy = this.y;
    const size = PLAYER_SIZE;
    const cx = sx + size / 2;
    const cy = sy + size / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((this.rotation * Math.PI) / 180);

    // Main cube
    const color = theme.player;
    ctx.fillStyle = color;
    ctx.fillRect(-size / 2, -size / 2, size, size);

    // Inner detail
    const m = 8;
    ctx.fillStyle = lighten(color, 30);
    ctx.fillRect(-size / 2 + m, -size / 2 + m, size - m * 2, size - m * 2);

    // Border
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    ctx.restore();
  }
}

function lighten(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}
