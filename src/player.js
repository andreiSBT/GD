/** Player with game modes (cube, ship, wave), improved physics, and neon visuals */

import {
  PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL,
  GROUND_Y, PLAYER_X_OFFSET, SCREEN_HEIGHT,
  PLAYER_COLORS, CUBE_SHAPES
} from './settings.js';
import { getAuthUser } from './supabase.js';

// Game modes
export const MODE_CUBE = 'cube';
export const MODE_SHIP = 'ship';
export const MODE_WAVE = 'wave';
export const MODE_BALL = 'ball';

// Physics tuning
const COYOTE_TIME = 6;        // frames of grace after leaving ground
const JUMP_BUFFER = 8;        // frames to buffer a jump press
const BALL_GRAVITY = 0.45;    // gentle gravity for smooth ball arcs
const SHIP_GRAVITY = 0.5;     // lighter gravity for ship
const SHIP_LIFT = -1.1;       // per-frame lift when holding in ship mode
const WAVE_SPEED = 6;         // wave diagonal speed
const ORB_JUMP_VEL = -16;     // yellow orb bounce
const PINK_ORB_VEL = -12;     // pink orb (shorter bounce)
const DASH_ORB_VEL = -10;     // dash orb (horizontal dash feel)
const PAD_JUMP_VEL = -21;     // jump pad (stronger than orb)

export class Player {
  constructor() {
    this.trail = [];  // position history for glow trail
    this.customColor = null;     // custom player color (null = use theme)
    this.customTrailColor = null; // custom trail color (null = use accent)
    this.trailStyle = 'normal';  // 'normal' or 'dotted'
    this.cubeIcon = 'default';   // cube face icon id
    this.cubeShape = 'square';   // cube shape variant
    this.reset(0);
  }

  reset(startX, startY) {
    this.x = startX;
    this.prevX = startX;
    this.y = startY != null ? startY : GROUND_Y - PLAYER_SIZE;
    this.vy = 0;
    this.prevY = this.y;
    this.alive = true;
    this.grounded = true;
    this.rotation = 0;
    this.targetRotation = 0;  // target rotation (increments by 90 per jump)
    this.gravityMult = 1;
    this.speedMult = 1;
    this.onPlatform = false;
    this.platformRef = null;        // reference to platform player is standing on
    this.onMovingPlatform = false;
    this.movingPlatformRef = null;
    this.transportLocked = false;
    this.transportExitRamp = 1; // smooth speed ramp after leaving transport (1 = full speed)
    this.mode = MODE_CUBE;
    this.holding = false;       // is jump/click held down
    this.coyoteCounter = 0;     // frames since leaving ground
    this.jumpBufferCounter = 0; // frames since jump was pressed
    this.trail = [];
    this.dashTimer = 0;         // frames of horizontal dash remaining
    this.dashing = false;        // true while dash orb is active (held)
    this.iconIndex = 0;         // visual icon variant
    this.holdJumped = false;    // flag: did auto-jump from hold this frame
    this.mini = false;          // mini mode (0.5x size)
    this.reversed = false;      // reverse direction
    this.flipEaseTimer = 0;     // gravity ease-in after ball/blue flip
  }

  // Called on key/click DOWN
  pressJump() {
    this.holding = true;
    this.jumpBufferCounter = JUMP_BUFFER;
  }

  // Called on key/click UP
  releaseJump() {
    this.holding = false;
    if (this.dashing) {
      this.dashing = false;
      this.dashTimer = 0;
    }
  }

  jump() {
    if (!this.alive || this.transportLocked) return false;

    if (this.mode === MODE_CUBE) {
      // Cube: single jump with coyote time + buffer
      if (this.grounded || this.coyoteCounter > 0) {
        this.vy = JUMP_VEL * this.gravityMult * (this.mini ? 0.7 : 1);
        this.grounded = false;
        this.onPlatform = false;
        this.platformRef = null;
        this.coyoteCounter = 0;
        this.jumpBufferCounter = 0;
        // Rotate 90 degrees per jump
        const dir = this.gravityMult > 0 ? -1 : 1;
        this.targetRotation += dir * 90;
        Player._countJump();
        return true;
      }
      return false;
    } else if (this.mode === MODE_BALL) {
      // Ball: click flips gravity with gentle arc (~55 degrees)
      if (this.grounded || this.coyoteCounter > 0) {
        this.gravityMult *= -1;
        this.vy = 0;
        this.grounded = false;
        this.onPlatform = false;
        this.platformRef = null;
        this.coyoteCounter = 0;
        this.jumpBufferCounter = 0;
        Player._countJump();
        return true;
      }
      return false;
    }
    // Ship and wave are handled in update() via this.holding
    return false;
  }

  // Triggered by orbs/pads
  orbBounce(type) {
    if (type === 'yellow_orb') {
      this.vy = ORB_JUMP_VEL * this.gravityMult;
    } else if (type === 'pink_orb') {
      this.vy = PINK_ORB_VEL * this.gravityMult;
    } else if (type === 'dash_orb') {
      this.vy = 0; // horizontal dash — no vertical movement
      this.dashing = true;
      this.dashTimer = 120; // max dash duration (safety limit)
    } else if (type === 'blue_orb' || type === 'blue_pad') {
      this.gravityMult *= -1;
      this.vy = 0;
    } else if (type === 'yellow_pad') {
      this.vy = PAD_JUMP_VEL * this.gravityMult;
    } else if (type === 'pink_pad') {
      this.vy = PINK_ORB_VEL * this.gravityMult * 1.2;
    }
    this.grounded = false;
    this.onPlatform = false;
    this.platformRef = null;
    // Rotate 90 degrees for orb/pad bounce too
    const dir = this.gravityMult > 0 ? -1 : 1;
    this.targetRotation += dir * 90;
  }

  setMode(mode) {
    this.mode = mode;
    this.rotation = 0;
    this.targetRotation = 0;
    if (mode === MODE_SHIP) {
      this.vy = 0;
    } else if (mode === MODE_BALL) {
      this.vy = 0;
    }
  }

  flipGravity() {
    this.platformRef = null;
    this.onPlatform = false;
    this.grounded = false;
    this.coyoteCounter = 0;
    this.gravityMult *= -1;
    this.vy = 0;
  }

  update() {
    if (!this.alive) return;

    this.prevX = this.x;
    this.prevY = this.y;

    // Horizontal — stop on transport, smooth ramp after exit
    if (this.transportLocked) {
      // Player frozen on transport — delta applied in main.js before collision
      this.transportExitRamp = 0;
    } else {
      // Smooth ramp-up after leaving transport (0 → 1 over ~15 frames)
      if (this.transportExitRamp < 1) {
        this.transportExitRamp = Math.min(1, this.transportExitRamp + 0.07);
      }
      const ramp = this.transportExitRamp;
      const speed = SCROLL_SPEED * this.speedMult * ramp * (this.dashTimer > 0 ? 1.5 : 1.0);
      this.x += speed;
    }
    if (this.dashTimer > 0) {
      this.dashTimer--;
      if (this.dashTimer <= 0) this.dashing = false;
    }

    // Store trail position (wave: from back tip of arrow, rotated)
    let trailX = this.x;
    let trailY = this.y + PLAYER_SIZE / 2;
    if (this.mode === MODE_WAVE) {
      const hs = PLAYER_SIZE / 2;
      // Back tip of arrow shape is at (-hs + 10, 0) relative to center
      const tipLocalX = -hs + 10;
      const rad = (this.rotation * Math.PI) / 180;
      trailX = this.x + PLAYER_SIZE / 2 + tipLocalX * Math.cos(rad);
      trailY = this.y + PLAYER_SIZE / 2 + tipLocalX * Math.sin(rad);
    }
    this.trail.push({ x: trailX, y: trailY });
    const maxTrail = this.trailStyle === 'dotted' ? 45 : 20;
    if (this.trail.length > maxTrail) this.trail.shift();

    // Mode-specific physics
    if (this.mode === MODE_CUBE) {
      this._updateCube();
    } else if (this.mode === MODE_SHIP) {
      this._updateShip();
    } else if (this.mode === MODE_WAVE) {
      this._updateWave();
    } else if (this.mode === MODE_BALL) {
      this._updateBall();
    }

    // Coyote time counter
    if (!this.grounded) {
      if (this.coyoteCounter > 0) this.coyoteCounter--;
    }

    // Jump buffer - try to jump if buffered
    if (this.jumpBufferCounter > 0) {
      this.jumpBufferCounter--;
      if (this.grounded || this.coyoteCounter > 0) {
        this.jump();
      }
    }

    // Hold-to-jump: cube only, auto-jump on landing while holding
    if (this.mode === MODE_CUBE && this.holding && this.grounded && !this.dashing) {
      this.holdJumped = this.jump();
    } else {
      this.holdJumped = false;
    }

    // Off screen = dead
    if (this.y > SCREEN_HEIGHT + 100 || this.y < -200) {
      this.alive = false;
    }
  }

  _updateCube() {
    if (this.dashing) {
      // During dash: maintain velocity, no gravity
      this.y += this.vy;
    } else {
      if (this.grounded) {
        this.vy = 0;
      } else {
        this.vy += GRAVITY * this.gravityMult;
      }
      this.y += this.vy;
    }

    const groundY = GROUND_Y - PLAYER_SIZE;
    if (this.gravityMult > 0) {
      if (this.y >= groundY) {
        this.y = groundY;
        this.vy = 0;
        this.grounded = true;
        this.dashing = false;
        this.dashTimer = 0;
        this._snapRotation();
      }
    } else {
      const ceilY = this.mini ? (PLAYER_SIZE - this.getSize()) / 2 : 0;
      if (this.y <= ceilY) {
        this.y = ceilY;
        this.vy = 0;
        this.grounded = true;
        this.dashing = false;
        this.dashTimer = 0;
        this._snapRotation();
      }
    }

    // Rotation - smoothly interpolate toward target (90° per jump)
    if (!this.grounded) {
      const diff = this.targetRotation - this.rotation;
      if (Math.abs(diff) > 0.5) {
        this.rotation += diff * 0.25;
      } else {
        this.rotation = this.targetRotation;
      }
    }
  }

  _updateShip() {
    // Ship: holding = fly up, releasing = fall down
    if (this.holding) {
      this.vy += SHIP_LIFT * this.gravityMult;
    }
    this.vy += SHIP_GRAVITY * this.gravityMult;

    // Clamp vertical speed
    this.vy = Math.max(-8, Math.min(8, this.vy));
    this.y += this.vy;

    // Boundaries
    const groundY = GROUND_Y - PLAYER_SIZE;
    const ceilY = this.mini ? (PLAYER_SIZE - this.getSize()) / 2 : 0;
    if (this.y >= groundY) {
      this.y = groundY;
      this.vy = 0;
      this.grounded = true;
    } else if (this.y <= ceilY) {
      this.y = ceilY;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Ship tilts based on vy
    this.rotation = this.vy * -3;
  }

  _updateWave() {
    // Wave: holding = diagonal up, releasing = diagonal down
    if (this.holding) {
      this.vy = -WAVE_SPEED * this.gravityMult;
    } else {
      this.vy = WAVE_SPEED * this.gravityMult;
    }
    this.y += this.vy;

    // Boundaries — clamp to ground/ceiling without dying
    const groundY = GROUND_Y - PLAYER_SIZE;
    const waveCeilY = this.mini ? (PLAYER_SIZE - this.getSize()) / 2 : 0;
    let waveOnSurface = false;
    if (this.y >= groundY) {
      this.y = groundY;
      waveOnSurface = true;
    } else if (this.y <= waveCeilY) {
      this.y = waveCeilY;
      waveOnSurface = true;
    }
    this.grounded = waveOnSurface;

    // Rotate ±45° in air, flatten to 0° on surfaces
    const targetRot = waveOnSurface ? 0 : (this.vy < 0 ? -45 : 45);
    this.rotation += (targetRot - this.rotation) * 0.5;
  }

  _updateBall() {
    // Ball: rolls on surfaces, click flips gravity
    const grav = BALL_GRAVITY * this.gravityMult * (this.mini ? 0.7 : 1);
    if (this.dashing) {
      this.y += this.vy;
    } else {
      if (this.grounded) {
        this.vy = 0;
      } else {
        this.vy += grav;
      }
      this.y += this.vy;
    }

    const groundY = GROUND_Y - PLAYER_SIZE;
    if (this.gravityMult > 0) {
      if (this.y >= groundY) {
        this.y = groundY;
        this.vy = 0;
        this.grounded = true;
        this.dashing = false;
        this.dashTimer = 0;
      }
    } else {
      const ceilY = this.mini ? (PLAYER_SIZE - this.getSize()) / 2 : 0;
      if (this.y <= ceilY) {
        this.y = ceilY;
        this.vy = 0;
        this.grounded = true;
        this.dashing = false;
        this.dashTimer = 0;
      }
    }

    // Rolling rotation based on horizontal speed
    const speed = SCROLL_SPEED * this.speedMult;
    this.rotation += speed * 3;
  }

  _snapRotation() {
    this.rotation = this.targetRotation;
    // Enable coyote time when landing
    this.coyoteCounter = COYOTE_TIME;
  }

  getSize() {
    return this.mini ? PLAYER_SIZE * 0.5 : PLAYER_SIZE;
  }

  getRect() {
    const inset = 4;
    const s = this.getSize();
    const offset = this.mini ? (PLAYER_SIZE - s) / 2 : 0;
    return {
      x: this.x + inset + offset,
      y: this.y + inset + offset,
      w: s - inset * 2,
      h: s - inset * 2,
    };
  }

  // Full-size hitbox for hazard collision (no inset — visual shape)
  getHazardRect() {
    const s = this.getSize();
    const offset = this.mini ? (PLAYER_SIZE - s) / 2 : 0;
    return {
      x: this.x + offset,
      y: this.y + offset,
      w: s,
      h: s,
    };
  }

  // Smaller hitbox for platform collision (more forgiveness)
  getPlatformRect() {
    const inset = 8;
    const s = this.getSize();
    const offset = this.mini ? (PLAYER_SIZE - s) / 2 : 0;
    return {
      x: this.x + inset + offset,
      y: this.y + inset + offset,
      w: s - inset * 2,
      h: s - inset * 2,
    };
  }

  draw(ctx, cameraX, theme, alpha) {
    // Interpolate position for smooth rendering between physics steps
    const interpX = alpha != null ? this.prevX + (this.x - this.prevX) * alpha : this.x;
    const interpY = alpha != null ? this.prevY + (this.y - this.prevY) * alpha : this.y;
    const sx = interpX - cameraX + PLAYER_X_OFFSET;
    const sy = interpY;
    const size = this.mini ? PLAYER_SIZE * 0.5 : PLAYER_SIZE;
    const offset = this.mini ? (PLAYER_SIZE - size) / 2 : 0;
    const cx = sx + PLAYER_SIZE / 2;
    const cy = sy + PLAYER_SIZE / 2;
    let color = this.customColor || theme.player;
    if (color === 'rainbow') {
      const hue = (Date.now() / 10) % 360;
      color = `hsl(${hue}, 100%, 60%)`;
    } else if (color === 'christmas') {
      color = Math.sin(Date.now() / 500) > 0 ? '#FF2222' : '#00CC44';
    }

    // --- GLOW TRAIL ---
    this._drawTrail(ctx, cameraX, theme);

    ctx.save();
    ctx.translate(cx, cy);
    if (this.mini) ctx.scale(0.5, 0.5);
    ctx.rotate((this.rotation * Math.PI) / 180);

    if (this.mode === MODE_CUBE) {
      this._drawCube(ctx, PLAYER_SIZE, color);
    } else if (this.mode === MODE_SHIP) {
      this._drawWave(ctx, PLAYER_SIZE, color);
    } else if (this.mode === MODE_WAVE) {
      this._drawShip(ctx, PLAYER_SIZE, color);
    } else if (this.mode === MODE_BALL) {
      this._drawBall(ctx, PLAYER_SIZE, color);
    }

    // Outer glow (inside rotated context so it matches rotation)
    this._drawGlow(ctx, PLAYER_SIZE, color);

    ctx.restore();
  }

  _drawTrail(ctx, cameraX, theme) {
    if (this.trail.length < 2) return;
    let trailColor = this.customTrailColor || this.customColor || theme.player;
    if (trailColor === 'rainbow') {
      const hue = (Date.now() / 10) % 360;
      trailColor = `hsl(${hue}, 100%, 60%)`;
    }
    ctx.save();
    ctx.shadowColor = trailColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = trailColor;
    const dashed = this.trailStyle === 'dotted';
    if (dashed) {
      // Draw dashes following the trail path with gaps
      const dashLen = 10, gapLen = 12, h = 6;
      let dist = 0;
      let drawing = true; // start with a dash
      let segLeft = dashLen;
      for (let i = 1; i < this.trail.length; i++) {
        const prev = this.trail[i - 1];
        const cur = this.trail[i];
        const px = prev.x - cameraX + PLAYER_X_OFFSET;
        const cx = cur.x - cameraX + PLAYER_X_OFFSET;
        const py = prev.y, cy = cur.y;
        const dx = cx - px, dy = cy - py;
        const segDist = Math.sqrt(dx * dx + dy * dy);
        if (segDist < 0.5) continue;

        let consumed = 0;
        while (consumed < segDist) {
          const step = Math.min(segLeft, segDist - consumed);
          if (drawing) {
            const t0 = consumed / segDist;
            const t1 = (consumed + step) / segDist;
            const x0 = px + dx * t0, y0 = py + dy * t0;
            const x1 = px + dx * t1, y1 = py + dy * t1;
            const progress = i / this.trail.length;
            const alpha = 0.15 + progress * 0.85;
            ctx.globalAlpha = alpha;
            ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1) - h / 2,
              Math.abs(x1 - x0) + 2, Math.abs(y1 - y0) + h);
          }
          consumed += step;
          segLeft -= step;
          if (segLeft <= 0) {
            drawing = !drawing;
            segLeft = drawing ? dashLen : gapLen;
          }
        }
      }
    } else if (this.trailStyle === 'year_flag') {
      // Year flag trail — large banners with year
      const year = new Date().getFullYear().toString();
      const flagH = 22, flagW = 32;
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const progress = i / this.trail.length;
        const alpha = 0.1 + progress * 0.8;
        const tsx = t.x - cameraX + PLAYER_X_OFFSET;
        ctx.globalAlpha = alpha;
        // Flag pole
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(tsx, t.y - flagH - 2, 2, flagH + 4);
        // Flag banner
        if (i % 12 === 0 && i > 0) {
          // Flag shape with pointed end
          ctx.fillStyle = trailColor;
          ctx.beginPath();
          ctx.moveTo(tsx + 2, t.y - flagH - 2);
          ctx.lineTo(tsx + 2 + flagW, t.y - flagH - 2);
          ctx.lineTo(tsx + 2 + flagW - 4, t.y - flagH / 2 - 2);
          ctx.lineTo(tsx + 2 + flagW, t.y - 2);
          ctx.lineTo(tsx + 2, t.y - 2);
          ctx.closePath();
          ctx.fill();
          // Year text large
          ctx.fillStyle = '#FFF';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(year, tsx + 2 + flagW / 2, t.y - flagH / 2 + 3);
        }
      }
    } else {
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const alpha = (i / this.trail.length) * 0.4;
        const sz = 3 + (i / this.trail.length) * 6;
        const tsx = t.x - cameraX + PLAYER_X_OFFSET;
        ctx.globalAlpha = alpha;
        ctx.fillRect(tsx, t.y - sz / 2, sz, sz);
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawCube(ctx, size, color) {
    const hs = size / 2;
    const shape = this.cubeShape || 'square';

    // Draw body shape
    this._drawShapeBody(ctx, size, hs, color, shape);

    // Gradient overlay
    const grad = ctx.createLinearGradient(0, -hs, 0, hs);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    this._fillShape(ctx, size, hs, shape);

    // Inner shape (lighter)
    const m = 8;
    ctx.fillStyle = lighten(color, 50);
    this._fillInnerShape(ctx, size, hs, m, shape);

    // Face/icon based on cubeIcon
    if (shape !== 'egg') {
      this._drawCubeIcon(ctx);
    } else {
      // Draw cute chick poking out (like reference image)
      const s = hs * 1.15;
      const chickY = -s * 0.5;
      const chickR = s * 0.5;
      // Chick head (big yellow circle)
      ctx.fillStyle = '#FFDD44';
      ctx.beginPath();
      ctx.arc(0, chickY, chickR, 0, Math.PI * 2);
      ctx.fill();
      // Crest (3 small triangles on top)
      ctx.fillStyle = '#FFCC00';
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, chickY - chickR);
      ctx.lineTo(0, chickY - chickR - s * 0.2);
      ctx.lineTo(s * 0.08, chickY - chickR);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, chickY - chickR + s * 0.04);
      ctx.lineTo(-s * 0.1, chickY - chickR - s * 0.12);
      ctx.lineTo(0, chickY - chickR + s * 0.04);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, chickY - chickR + s * 0.04);
      ctx.lineTo(s * 0.1, chickY - chickR - s * 0.12);
      ctx.lineTo(s * 0.2, chickY - chickR + s * 0.04);
      ctx.fill();
      // Two eyes (black dots)
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-s * 0.15, chickY - s * 0.05, s * 0.07, 0, Math.PI * 2);
      ctx.arc(s * 0.15, chickY - s * 0.05, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      // Small orange beak (triangle pointing down)
      ctx.fillStyle = '#FF8833';
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, chickY + s * 0.08);
      ctx.lineTo(0, chickY + s * 0.2);
      ctx.lineTo(s * 0.06, chickY + s * 0.08);
      ctx.closePath();
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    this._strokeShape(ctx, size, hs, shape);

    // Bright edge highlight (only for shapes with a flat top)
    if (shape === 'square') {
      ctx.strokeStyle = lighten(color, 80);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-hs, -hs);
      ctx.lineTo(hs, -hs);
      ctx.stroke();
    } else if (shape === 'rounded') {
      const r = size * 0.22;
      ctx.strokeStyle = lighten(color, 80);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-hs + r, -hs);
      ctx.lineTo(hs - r, -hs);
      ctx.stroke();
    }
  }

  _makeShapePath(ctx, size, hs, shape) {
    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(0, 0, hs, 0, Math.PI * 2);
        break;
      case 'diamond':
        ctx.moveTo(0, -hs);
        ctx.lineTo(hs, 0);
        ctx.lineTo(0, hs);
        ctx.lineTo(-hs, 0);
        ctx.closePath();
        break;
      case 'triangle':
        ctx.moveTo(hs, 0);
        ctx.lineTo(-hs + 2, -hs + 2);
        ctx.lineTo(-hs + 2, hs - 2);
        ctx.closePath();
        break;
      case 'hexagon':
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = Math.cos(a) * hs;
          const py = Math.sin(a) * hs;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      case 'rounded': {
        const r = 10;
        ctx.moveTo(-hs + r, -hs);
        ctx.lineTo(hs - r, -hs);
        ctx.quadraticCurveTo(hs, -hs, hs, -hs + r);
        ctx.lineTo(hs, hs - r);
        ctx.quadraticCurveTo(hs, hs, hs - r, hs);
        ctx.lineTo(-hs + r, hs);
        ctx.quadraticCurveTo(-hs, hs, -hs, hs - r);
        ctx.lineTo(-hs, -hs + r);
        ctx.quadraticCurveTo(-hs, -hs, -hs + r, -hs);
        ctx.closePath();
        break;
      }
      case 'cross': {
        const arm = hs * 0.38;
        ctx.moveTo(-arm, -hs);
        ctx.lineTo(arm, -hs);
        ctx.lineTo(arm, -arm);
        ctx.lineTo(hs, -arm);
        ctx.lineTo(hs, arm);
        ctx.lineTo(arm, arm);
        ctx.lineTo(arm, hs);
        ctx.lineTo(-arm, hs);
        ctx.lineTo(-arm, arm);
        ctx.lineTo(-hs, arm);
        ctx.lineTo(-hs, -arm);
        ctx.lineTo(-arm, -arm);
        ctx.closePath();
        break;
      }
      case 'dart':
        ctx.moveTo(hs, 0);
        ctx.lineTo(-hs + 4, -hs + 2);
        ctx.lineTo(-hs / 2, 0);
        ctx.lineTo(-hs + 4, hs - 2);
        ctx.closePath();
        break;
      case 'heart': {
        const s = hs * 1.15;
        ctx.moveTo(0, s * 0.7);
        ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.55, -s * 1.2, 0, -s * 0.35);
        ctx.bezierCurveTo(s * 0.55, -s * 1.2, s * 1.2, -s * 0.1, 0, s * 0.7);
        ctx.closePath();
        break;
      }
      case 'egg': {
        // Round egg shell bottom with zigzag crack top
        const s = hs * 1.15;
        // Start from left of zigzag, go right along crack, then curve around bottom
        ctx.moveTo(-s * 0.75, -s * 0.15);
        // Zigzag crack (3 peaks like the image)
        ctx.lineTo(-s * 0.45, -s * 0.45);
        ctx.lineTo(-s * 0.15, -s * 0.1);
        ctx.lineTo(s * 0.15, -s * 0.5);
        ctx.lineTo(s * 0.45, -s * 0.1);
        ctx.lineTo(s * 0.7, -s * 0.4);
        ctx.lineTo(s * 0.8, -s * 0.1);
        // Smooth round bottom
        ctx.quadraticCurveTo(s * 0.95, s * 0.4, s * 0.6, s * 0.85);
        ctx.quadraticCurveTo(0, s * 1.1, -s * 0.6, s * 0.85);
        ctx.quadraticCurveTo(-s * 0.95, s * 0.4, -s * 0.75, -s * 0.15);
        ctx.closePath();
        break;
      }
      default: // square
        ctx.rect(-hs, -hs, size, size);
        break;
    }
  }

  _drawShapeBody(ctx, size, hs, color, shape) {
    ctx.fillStyle = color;
    this._makeShapePath(ctx, size, hs, shape);
    ctx.fill();
  }

  _fillShape(ctx, size, hs, shape) {
    this._makeShapePath(ctx, size, hs, shape);
    ctx.fill();
  }

  _fillInnerShape(ctx, size, hs, m, shape) {
    if (shape === 'square') {
      ctx.fillRect(-hs + m, -hs + m, size - m * 2, size - m * 2);
    } else if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, hs - m, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Scale down for other shapes
      ctx.save();
      const scale = (size - m * 2) / size;
      ctx.scale(scale, scale);
      this._makeShapePath(ctx, size, hs, shape);
      ctx.fill();
      ctx.restore();
    }
  }

  _strokeShape(ctx, size, hs, shape) {
    this._makeShapePath(ctx, size, hs, shape);
    ctx.stroke();
  }

  _drawCubeIcon(ctx) {
    const icon = this.cubeIcon || 'default';
    switch (icon) {
      case 'default':
        // Classic two eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-4, -2, 5, 0, Math.PI * 2);
        ctx.arc(8, -2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-3, -2, 2.5, 0, Math.PI * 2);
        ctx.arc(9, -2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'cyclops':
        // One big eye
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(2, -2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(3, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(1, -4, 2, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'angry':
        // Angry eyes with eyebrows
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-4, 0, 5, 0, Math.PI * 2);
        ctx.arc(8, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-3, 0, 2.5, 0, Math.PI * 2);
        ctx.arc(9, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Eyebrows
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-9, -6);
        ctx.lineTo(-1, -3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(13, -6);
        ctx.lineTo(5, -3);
        ctx.stroke();
        break;

      case 'robot':
        // Square visor
        ctx.fillStyle = '#0FF';
        ctx.fillRect(-8, -6, 20, 8);
        ctx.fillStyle = '#000';
        ctx.fillRect(-6, -5, 6, 6);
        ctx.fillRect(4, -5, 6, 6);
        ctx.fillStyle = '#0FF';
        ctx.fillRect(-5, -4, 4, 4);
        ctx.fillRect(5, -4, 4, 4);
        break;

      case 'star':
        // Star face
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const innerAngle = angle + Math.PI / 5;
          ctx.lineTo(2 + Math.cos(angle) * 8, -1 + Math.sin(angle) * 8);
          ctx.lineTo(2 + Math.cos(innerAngle) * 4, -1 + Math.sin(innerAngle) * 4);
        }
        ctx.closePath();
        ctx.fill();
        break;

      case 'x_eyes':
        // X eyes
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-8, -6); ctx.lineTo(-1, 1);
        ctx.moveTo(-1, -6); ctx.lineTo(-8, 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(5, -6); ctx.lineTo(12, 1);
        ctx.moveTo(12, -6); ctx.lineTo(5, 1);
        ctx.stroke();
        break;

      case 'shades':
        // Sunglasses
        ctx.fillStyle = '#111';
        ctx.fillRect(-10, -5, 10, 7);
        ctx.fillRect(3, -5, 10, 7);
        ctx.fillStyle = '#333';
        ctx.fillRect(-9, -4, 8, 5);
        ctx.fillRect(4, -4, 8, 5);
        // Bridge
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(3, -2);
        ctx.stroke();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-8, -4, 3, 2);
        ctx.fillRect(5, -4, 3, 2);
        break;

      case 'smile':
        // Simple smile
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-3, -3, 3, 0, Math.PI * 2);
        ctx.arc(7, -3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-2, -3, 1.5, 0, Math.PI * 2);
        ctx.arc(8, -3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Smile curve
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(2, 2, 7, 0.2, Math.PI - 0.2);
        ctx.stroke();
        break;
      case 'wink':
        // Big open eye (left)
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-4, -2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-3, -2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Shine
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-5, -4, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Winking eye (right) — thick curved line
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(8, -1, 4, 0.4, Math.PI - 0.4);
        ctx.stroke();
        // Eyebrow over wink
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, -7);
        ctx.lineTo(13, -5);
        ctx.stroke();
        // Smirk (asymmetric smile)
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(4, 4, 6, 0.1, Math.PI * 0.6);
        ctx.stroke();
        break;

      case 'spooky':
        // Halloween — glowing hollow eyes + jagged mouth
        ctx.fillStyle = '#FF8800';
        ctx.beginPath();
        ctx.moveTo(-7, -5); ctx.lineTo(-3, -5); ctx.lineTo(-5, 0); ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(5, -5); ctx.lineTo(9, -5); ctx.lineTo(7, 0); ctx.closePath();
        ctx.fill();
        // Jagged mouth
        ctx.strokeStyle = '#FF8800';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-8, 5);
        ctx.lineTo(-5, 3); ctx.lineTo(-2, 6); ctx.lineTo(1, 3);
        ctx.lineTo(4, 6); ctx.lineTo(7, 3); ctx.lineTo(10, 5);
        ctx.stroke();
        break;
    }
  }

  _drawShip(ctx, size, color) {
    const hs = size / 2;

    // Ship body - triangle/arrow shape
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(hs, 0);
    ctx.lineTo(-hs, -hs + 4);
    ctx.lineTo(-hs + 10, 0);
    ctx.lineTo(-hs, hs - 4);
    ctx.closePath();
    ctx.fill();

    // Gradient overlay
    const grad = ctx.createLinearGradient(0, -hs, 0, hs);
    grad.addColorStop(0, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    ctx.fill();

    if (this.mode !== MODE_WAVE) {
      // Cockpit
      ctx.fillStyle = lighten(color, 60);
      ctx.beginPath();
      ctx.arc(5, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      // Eye in cockpit
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(6, -1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(7, -1, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Wave: inner lighter shape instead of cockpit
      ctx.fillStyle = lighten(color, 50);
      ctx.beginPath();
      ctx.moveTo(hs - 8, 0);
      ctx.lineTo(-hs + 12, -hs + 12);
      ctx.lineTo(-hs + 16, 0);
      ctx.lineTo(-hs + 12, hs - 12);
      ctx.closePath();
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hs, 0);
    ctx.lineTo(-hs, -hs + 4);
    ctx.lineTo(-hs + 10, 0);
    ctx.lineTo(-hs, hs - 4);
    ctx.closePath();
    ctx.stroke();

    if (this.mode !== MODE_WAVE) {
      // Engine flame (ship only)
      ctx.fillStyle = this.holding ? '#FF6600' : '#FF3300';
      ctx.globalAlpha = 0.8 + Math.random() * 0.2;
      const flameLen = this.holding ? 12 + Math.random() * 6 : 6 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(-hs + 10, -4);
      ctx.lineTo(-hs - flameLen, 0);
      ctx.lineTo(-hs + 10, 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  _drawWave(ctx, size, color) {
    const hs = size / 2;

    // Wave - diamond shape
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -hs);
    ctx.lineTo(hs, 0);
    ctx.lineTo(0, hs);
    ctx.lineTo(-hs, 0);
    ctx.closePath();
    ctx.fill();

    // Gradient
    const grad = ctx.createLinearGradient(0, -hs, 0, hs);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner diamond
    const m = 10;
    ctx.fillStyle = lighten(color, 50);
    ctx.beginPath();
    ctx.moveTo(0, -hs + m);
    ctx.lineTo(hs - m, 0);
    ctx.lineTo(0, hs - m);
    ctx.lineTo(-hs + m, 0);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -hs);
    ctx.lineTo(hs, 0);
    ctx.lineTo(0, hs);
    ctx.lineTo(-hs, 0);
    ctx.closePath();
    ctx.stroke();
  }

  _drawBall(ctx, size, color) {
    const hs = size / 2;

    // Ball - circle shape
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, hs, 0, Math.PI * 2);
    ctx.fill();

    // Gradient overlay
    const grad = ctx.createRadialGradient(-hs * 0.3, -hs * 0.3, 0, 0, 0, hs);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner circle
    ctx.fillStyle = lighten(color, 40);
    ctx.beginPath();
    ctx.arc(0, 0, hs * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator line (shows rotation)
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(hs * 0.7, 0);
    ctx.stroke();

    // Border
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, hs, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawGlow(ctx, size, color) {
    const hs = size / 2;
    const shape = this.cubeShape || 'square';
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    if (this.mode === MODE_CUBE) {
      this._makeShapePath(ctx, size, hs, shape);
      ctx.fill();
    } else if (this.mode === MODE_SHIP) {
      ctx.beginPath();
      ctx.moveTo(0, -hs);
      ctx.lineTo(hs, 0);
      ctx.lineTo(0, hs);
      ctx.lineTo(-hs, 0);
      ctx.closePath();
      ctx.fill();
    } else if (this.mode === MODE_WAVE) {
      ctx.beginPath();
      ctx.moveTo(hs, 0);
      ctx.lineTo(-hs, -hs + 4);
      ctx.lineTo(-hs + 10, 0);
      ctx.lineTo(-hs, hs - 4);
      ctx.closePath();
      ctx.fill();
    } else if (this.mode === MODE_BALL) {
      ctx.beginPath();
      ctx.arc(0, 0, hs, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  static _countJump() {
    try {
      const n = parseInt(localStorage.getItem('gd_total_jumps') || '0') + 1;
      localStorage.setItem('gd_total_jumps', n.toString());
      // Also save per-user so it persists across logout/login
      const user = getAuthUser();
      if (user) localStorage.setItem('gd_total_jumps_' + user.id, n.toString());
    } catch {}
  }
}

export function lighten(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

export function darken(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}
