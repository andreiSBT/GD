/** Bot that learns from deaths — multiple passes with hold-jump support */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const RECORD_INTERVAL = 3;
const LOOK_AHEAD_FRAMES = 7;
const MAX_LEARN_PASSES = 20;

function runSimulation(obstacles, endX, speed, forceJumpZones) {
  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let prevY = y;
  let grounded = true, rotation = 0, alive = true;
  let deathX = -1;
  let holding = false; // simulates holding jump button
  const inset = 4;
  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX || !alive) break;

    if (frame % RECORD_INTERVAL === 0) {
      frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });
    }

    const playerRect = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };

    // Decide: should we be holding jump?
    let wantJump = false;

    // Check forced jump zones (learned from deaths)
    for (const zone of forceJumpZones) {
      if (x >= zone.start && x <= zone.end) {
        wantJump = true;
        break;
      }
    }

    // Look-ahead for hazards (check at ground level AND current Y)
    if (!wantJump) {
      const lookX = x + speed * LOOK_AHEAD_FRAMES;
      const groundY = GROUND_Y - PLAYER_SIZE;
      // Check both current Y and ground Y for hazards
      const checkYs = [y, groundY];
      for (const checkY of checkYs) {
        const futureRect = { x: x + inset, y: checkY + inset, w: lookX - x + PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
        for (const obs of obstacles) {
          if (obs.type !== 'spike' && obs.type !== 'saw') continue;
          const hr = { x: obs.x + 10, y: obs.y + 10, w: (obs.w || GRID) - 20, h: (obs.h || GRID) - 20 };
          if (futureRect.x < hr.x + hr.w && futureRect.x + futureRect.w > hr.x &&
              futureRect.y < hr.y + hr.h && futureRect.y + futureRect.h > hr.y) {
            wantJump = true;
            break;
          }
        }
        if (wantJump) break;
      }
    }

    holding = wantJump;

    // Jump if holding and grounded (hold = instant jump on landing)
    if (holding && grounded) {
      vy = JUMP_VEL;
      grounded = false;
      rotation -= 90;
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
  let lastDeathX = -1;
  let sameDeathCount = 0;

  for (let pass = 0; pass < MAX_LEARN_PASSES; pass++) {
    const result = runSimulation(obstacles, endX, speed, forceJumpZones);

    if (result.completed) {
      bestResult = result;
      break;
    }

    if (result.deathX >= 0) {
      // Check if dying at same spot repeatedly
      if (lastDeathX >= 0 && Math.abs(result.deathX - lastDeathX) < speed * 5) {
        sameDeathCount++;
        // Widen the jump zone each time
        const zone = forceJumpZones.find(z => Math.abs(z.start - result.deathX + speed * 6) < speed * 10);
        if (zone) {
          zone.start -= speed * 3;
          zone.end += speed * 2;
        } else {
          forceJumpZones.push({ start: result.deathX - speed * (6 + sameDeathCount * 3), end: result.deathX + speed * 2 });
        }
      } else {
        sameDeathCount = 0;
        // New death location — add jump zone
        forceJumpZones.push({ start: result.deathX - speed * 6, end: result.deathX + speed * 2 });
      }
      lastDeathX = result.deathX;
    }

    bestResult = result;
    if (result.deathX < 0) break;
  }

  if (!bestResult || bestResult.frames.length < 5) return null;
  return JSON.stringify(bestResult.frames);
}
