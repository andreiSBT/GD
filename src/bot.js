/** Bot with mini-simulation: tests jump vs no-jump each frame */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const RECORD_INTERVAL = 1;
const LOOKAHEAD = 30; // simulate full jump arc ahead

function checkDeath(x, y, obstacles) {
  const inset = 4;
  const pr = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
  for (const obs of obstacles) {
    if ((obs.type === 'spike' || obs.type === 'saw') && obs.checkCollision) {
      if (obs.checkCollision(pr) === 'death') return true;
    }
  }
  return false;
}

function miniSim(startX, startY, startVy, startGrounded, speed, obstacles, doJump, frames) {
  let x = startX, y = startY, vy = startVy, grounded = startGrounded;
  const inset = 4;

  if (doJump && grounded) {
    vy = JUMP_VEL;
    grounded = false;
  }

  for (let f = 0; f < frames; f++) {
    if (!grounded) vy += GRAVITY;
    y += vy;

    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Platform landing
    const pr = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
    for (const obs of obstacles) {
      if ((obs.type === 'platform' || obs.type === 'platform_group') && obs.checkCollision) {
        const result = obs.checkCollision(pr, y - vy, 1);
        if (result) {
          if (result.type === 'land') { y = result.y - PLAYER_SIZE; vy = 0; grounded = true; }
          else if (result.type === 'death') return false;
        }
      }
    }

    // Death check
    if (checkDeath(x, y, obstacles)) return false;

    x += speed;
  }
  return true; // survived
}

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speed = SCROLL_SPEED * (level.speedMult || 1);

  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let prevY = y;
  let grounded = true, rotation = 0;
  const inset = 4;
  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX) break;

    if (frame % RECORD_INTERVAL === 0) {
      frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });
    }

    // Decision: jump or not?
    let shouldJump = false;
    if (grounded) {
      // Test: will I die if I DON'T jump in the next N frames?
      const surviveNoJump = miniSim(x, y, vy, grounded, speed, obstacles, false, LOOKAHEAD);
      if (!surviveNoJump) {
        // Will jumping save me?
        const surviveJump = miniSim(x, y, vy, grounded, speed, obstacles, true, LOOKAHEAD);
        if (surviveJump) {
          shouldJump = true;
        } else {
          // Both die — jump anyway (might get further)
          shouldJump = true;
        }
      }
    }

    if (shouldJump && grounded) {
      vy = JUMP_VEL;
      grounded = false;
      rotation -= 90;
    }

    // Physics
    prevY = y;
    if (!grounded) vy += GRAVITY;
    y += vy;

    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Platform collision
    const playerRect = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
    for (const obs of obstacles) {
      if ((obs.type === 'platform' || obs.type === 'platform_group') && obs.checkCollision) {
        const result = obs.checkCollision(playerRect, prevY, 1);
        if (result) {
          if (result.type === 'land') { y = result.y - PLAYER_SIZE; vy = 0; grounded = true; }
          else if (result.type === 'death') { return frames.length > 5 ? JSON.stringify(frames) : null; }
        }
      }
    }

    // Death
    if (checkDeath(x, y, obstacles)) {
      break;
    }

    // Edge detection
    if (grounded && y < GROUND_Y - PLAYER_SIZE - 2) {
      let onSurface = false;
      for (const obs of obstacles) {
        if ((obs.type === 'platform' || obs.type === 'platform_group') && obs.checkCollision) {
          const testRect = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
          const result = obs.checkCollision(testRect, y, 1);
          if (result && result.type === 'land') { onSurface = true; break; }
        }
      }
      if (!onSurface) grounded = false;
    }

    x += speed;
  }

  return frames.length > 5 ? JSON.stringify(frames) : null;
}
