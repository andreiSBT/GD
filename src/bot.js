/** Fast bot that generates a ghost replay using simple look-ahead */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const RECORD_INTERVAL = 3;
const INSET = 8;

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speed = SCROLL_SPEED * (level.speedMult || 1);

  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let grounded = true, rotation = 0;

  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX) break;

    if (frame % RECORD_INTERVAL === 0) {
      frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });
    }

    // Look ahead: will we hit a hazard in next ~6 frames if we don't jump?
    if (grounded) {
      let danger = false;
      const lookX = x + speed * 8;
      for (const obs of obstacles) {
        if (obs.type !== 'spike' && obs.type !== 'saw') continue;
        const ox = obs.x, oy = obs.y, ow = obs.w || GRID, oh = obs.h || GRID;
        if (ox + ow > x && ox < lookX) {
          if (oy + oh > y + INSET && oy < y + PLAYER_SIZE - INSET) {
            danger = true;
            break;
          }
        }
      }
      if (danger) {
        vy = JUMP_VEL;
        grounded = false;
        rotation -= 90;
      }
    }

    // Physics
    if (!grounded) vy += GRAVITY;
    y += vy;

    // Ground
    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Platform landing
    if (vy >= 0) {
      for (const obs of obstacles) {
        if (obs.type !== 'platform') continue;
        const px = obs.x, py = obs.y, pw = obs.w || GRID;
        if (x + PLAYER_SIZE > px + 4 && x < px + pw - 4) {
          if (y + PLAYER_SIZE >= py && y + PLAYER_SIZE - vy <= py + 4) {
            y = py - PLAYER_SIZE;
            vy = 0;
            grounded = true;
          }
        }
      }
    }

    x += speed;
  }

  return frames.length > 5 ? JSON.stringify(frames) : null;
}
