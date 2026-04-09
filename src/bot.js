/** Fast bot that generates a ghost replay using live obstacle collision */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const RECORD_INTERVAL = 3;
const LOOK_AHEAD_FRAMES = 7;

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speed = SCROLL_SPEED * (level.speedMult || 1);

  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let prevY = y;
  let grounded = true, onPlatform = false;
  let rotation = 0, alive = true;

  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX || !alive) break;

    if (frame % RECORD_INTERVAL === 0) {
      frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });
    }

    // Build player rect (same inset as real game)
    const inset = 4;
    const playerRect = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };

    // Look ahead: check if any hazard will hit us at current Y
    if (grounded) {
      let danger = false;
      const lookX = x + speed * LOOK_AHEAD_FRAMES;
      const futureRect = { x: x + inset, y: y + inset, w: lookX - x + PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };

      for (const obs of obstacles) {
        if (obs.type === 'spike' || obs.type === 'saw') {
          const hr = { x: obs.x + 10, y: obs.y + 10, w: (obs.w || GRID) - 20, h: (obs.h || GRID) - 20 };
          if (futureRect.x < hr.x + hr.w && futureRect.x + futureRect.w > hr.x &&
              futureRect.y < hr.y + hr.h && futureRect.y + futureRect.h > hr.y) {
            danger = true;
            break;
          }
        }
      }

      if (danger) {
        vy = JUMP_VEL;
        grounded = false;
        onPlatform = false;
        rotation -= 90;
      }
    }

    // Physics
    prevY = y;
    if (!grounded) {
      vy += GRAVITY;
    }
    y += vy;

    // Ground collision
    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
      onPlatform = false;
    }

    // Update player rect after physics
    playerRect.x = x + inset;
    playerRect.y = y + inset;

    // Use real obstacle checkCollision for platforms
    let landedOnPlatform = false;
    for (const obs of obstacles) {
      if (obs.type === 'platform' && obs.checkCollision) {
        const result = obs.checkCollision(playerRect, prevY, 1);
        if (result) {
          if (result.type === 'land') {
            y = result.y - PLAYER_SIZE;
            vy = 0;
            grounded = true;
            landedOnPlatform = true;
          } else if (result.type === 'death') {
            // Hit side of platform — die
            alive = false;
            break;
          }
        }
      }
      // PlatformGroup
      if (obs.type === 'platform_group' && obs.checkCollision) {
        const result = obs.checkCollision(playerRect, prevY, 1);
        if (result) {
          if (result.type === 'land') {
            y = result.y - PLAYER_SIZE;
            vy = 0;
            grounded = true;
            landedOnPlatform = true;
          } else if (result.type === 'death') {
            alive = false;
            break;
          }
        }
      }
    }

    if (!alive) break;

    // Spike/saw collision (use real checkCollision)
    playerRect.y = y + inset; // update after platform landing
    for (const obs of obstacles) {
      if (obs.type === 'spike' && obs.checkCollision) {
        const result = obs.checkCollision(playerRect);
        if (result === 'death') { alive = false; break; }
      }
      if (obs.type === 'saw' && obs.checkCollision) {
        const result = obs.checkCollision(playerRect);
        if (result === 'death') { alive = false; break; }
      }
    }

    if (!alive) break;

    // Edge detection — if on platform but platform ended
    if (grounded && landedOnPlatform === false && y < GROUND_Y - PLAYER_SIZE - 2) {
      let stillOnSomething = false;
      for (const obs of obstacles) {
        if ((obs.type === 'platform' || obs.type === 'platform_group') && obs.checkCollision) {
          const testRect = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
          const result = obs.checkCollision(testRect, y, 1);
          if (result && result.type === 'land') { stillOnSomething = true; break; }
        }
      }
      if (!stillOnSomething) { grounded = false; onPlatform = false; }
    }

    x += speed;
  }

  return frames.length > 5 ? JSON.stringify(frames) : null;
}
