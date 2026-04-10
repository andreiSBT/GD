/** Bot with mini-simulation: tests jump vs no-jump each frame */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const RECORD_INTERVAL = 1;
const LOOKAHEAD = 60;

// Check all obstacles — returns { dead, landed, landY }
function checkAll(x, y, prevY, obstacles) {
  const inset = 4;
  const pr = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
  let landed = false, landY = y;

  for (const obs of obstacles) {
    if (!obs.checkCollision) continue;

    if (obs.type === 'spike' || obs.type === 'saw') {
      const r = obs.checkCollision(pr);
      if (r === 'death') return { dead: true };
    } else if (obs.type === 'platform' || obs.type === 'platform_group') {
      const r = obs.checkCollision(pr, prevY, 1);
      if (r) {
        if (r.type === 'death') return { dead: true };
        if (r.type === 'land' && !landed) {
          landed = true;
          landY = r.y;
        }
      }
    }
  }
  return { dead: false, landed, landY };
}

function simFrames(startX, startY, startVy, startGrounded, speed, obstacles, doJump, numFrames) {
  let x = startX, y = startY, vy = startVy, grounded = startGrounded;

  if (doJump && grounded) {
    vy = JUMP_VEL;
    grounded = false;
  }

  for (let f = 0; f < numFrames; f++) {
    const prevY = y;
    if (!grounded) vy += GRAVITY;
    y += vy;

    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    const result = checkAll(x, y, prevY, obstacles);
    if (result.dead) return false;
    if (result.landed) {
      y = result.landY - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Edge detection
    if (grounded && y < GROUND_Y - PLAYER_SIZE - 2) {
      const edgeResult = checkAll(x, y, y, obstacles);
      if (!edgeResult.landed) grounded = false;
    }

    x += speed;
  }
  return true;
}

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speed = SCROLL_SPEED * (level.speedMult || 1);

  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let grounded = true, rotation = 0, wantJump = false;
  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX) break;

    frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });

    // Decision: always check if we'll die, even mid-air
    const willDie = !simFrames(x, y, vy, grounded, speed, obstacles, false, LOOKAHEAD);
    if (willDie) wantJump = true;
    if (grounded && wantJump) {
      wantJump = false;
      vy = JUMP_VEL;
      grounded = false;
      rotation -= 90;
      if (frame < 200) console.log('[Bot] JUMP at frame:', frame, 'x:', Math.round(x), 'y:', Math.round(y));
    }

    // Physics
    const prevY = y;
    if (!grounded) vy += GRAVITY;
    y += vy;

    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Collision
    const result = checkAll(x, y, prevY, obstacles);
    if (result.dead) {
      console.log('[Bot] DEAD at x:', Math.round(x), 'y:', Math.round(y), 'prevY:', Math.round(prevY), 'vy:', vy.toFixed(2), 'grounded:', grounded, 'frame:', frame);
      // Log which obstacle killed us
      const inset = 4;
      const pr = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
      for (const obs of obstacles) {
        if (!obs.checkCollision) continue;
        if (obs.type === 'spike' || obs.type === 'saw') {
          if (obs.checkCollision(pr) === 'death') console.log('[Bot] Killed by', obs.type, 'at obs.x:', obs.x, 'obs.y:', obs.y);
        } else if (obs.type === 'platform' || obs.type === 'platform_group') {
          const r = obs.checkCollision(pr, prevY, 1);
          if (r && r.type === 'death') console.log('[Bot] Killed by', obs.type, 'at obs.x:', obs.x, 'obs.y:', obs.y, 'obs.w:', obs.w, 'obs.h:', obs.h);
        }
      }
      break;
    }
    if (result.landed) {
      y = result.landY - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Edge detection
    if (grounded && y < GROUND_Y - PLAYER_SIZE - 2) {
      const edgeResult = checkAll(x, y, y, obstacles);
      if (!edgeResult.landed) grounded = false;
    }

    x += speed;
  }

  console.log('[Bot] Generated', frames.length, 'frames, reached x:', Math.round(x), '/', endX);
  return frames.length > 5 ? JSON.stringify(frames) : null;
}
