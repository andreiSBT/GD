/** Bot that learns from deaths — multiple fast passes with real collision */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const RECORD_INTERVAL = 3;
const LOOK_AHEAD_FRAMES = 7;
const MAX_LEARN_PASSES = 15;

function runSimulation(obstacles, endX, speed, forceJumpZones) {
  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let prevY = y;
  let grounded = true, rotation = 0, alive = true;
  let deathX = -1;
  const inset = 4;
  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX || !alive) break;

    if (frame % RECORD_INTERVAL === 0) {
      frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });
    }

    const playerRect = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };

    // Should jump? Look-ahead OR forced jump zone from previous death
    let shouldJump = false;
    if (grounded) {
      // Check forced jump zones (learned from deaths)
      for (const zone of forceJumpZones) {
        if (x >= zone.x - speed * 4 && x <= zone.x + speed * 2) {
          shouldJump = true;
          break;
        }
      }

      // Look-ahead for hazards
      if (!shouldJump) {
        const lookX = x + speed * LOOK_AHEAD_FRAMES;
        const futureRect = { x: x + inset, y: y + inset, w: lookX - x + PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
        for (const obs of obstacles) {
          if (obs.type !== 'spike' && obs.type !== 'saw') continue;
          const hr = { x: obs.x + 10, y: obs.y + 10, w: (obs.w || GRID) - 20, h: (obs.h || GRID) - 20 };
          if (futureRect.x < hr.x + hr.w && futureRect.x + futureRect.w > hr.x &&
              futureRect.y < hr.y + hr.h && futureRect.y + futureRect.h > hr.y) {
            shouldJump = true;
            break;
          }
        }
      }

      if (shouldJump) {
        vy = JUMP_VEL;
        grounded = false;
        rotation -= 90;
      }
    }

    // Physics
    prevY = y;
    if (!grounded) vy += GRAVITY;
    y += vy;

    // Ground
    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Platform/group collision
    playerRect.x = x + inset;
    playerRect.y = y + inset;
    for (const obs of obstacles) {
      if ((obs.type === 'platform' || obs.type === 'platform_group') && obs.checkCollision) {
        const result = obs.checkCollision(playerRect, prevY, 1);
        if (result) {
          if (result.type === 'land') {
            y = result.y - PLAYER_SIZE;
            vy = 0;
            grounded = true;
          } else if (result.type === 'death') {
            alive = false;
            deathX = x;
            break;
          }
        }
      }
    }
    if (!alive) break;

    // Hazard collision
    playerRect.y = y + inset;
    for (const obs of obstacles) {
      if ((obs.type === 'spike' || obs.type === 'saw') && obs.checkCollision) {
        const result = obs.checkCollision(playerRect);
        if (result === 'death') { alive = false; deathX = x; break; }
      }
    }
    if (!alive) break;

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

  return { frames, alive, completed: x >= endX, deathX };
}

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speed = SCROLL_SPEED * (level.speedMult || 1);

  const forceJumpZones = [];
  let bestResult = null;

  for (let pass = 0; pass < MAX_LEARN_PASSES; pass++) {
    const result = runSimulation(obstacles, endX, speed, forceJumpZones);

    if (result.completed) {
      bestResult = result;
      break;
    }

    // Learn: if died, add a forced jump zone at death location
    if (result.deathX >= 0) {
      // Check if we already have a zone near this death
      const nearby = forceJumpZones.find(z => Math.abs(z.x - result.deathX) < speed * 8);
      if (nearby) {
        // Already tried jumping here — try jumping earlier
        nearby.x -= speed * 3;
      } else {
        forceJumpZones.push({ x: result.deathX });
      }
    }

    bestResult = result;
    if (result.deathX < 0) break; // timed out
  }

  if (!bestResult || bestResult.frames.length < 5) return null;
  return JSON.stringify(bestResult.frames);
}
