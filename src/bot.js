/** Simple bot that simulates playing a level and generates a replay */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const BOT_MAX_FRAMES = 60 * 120; // 2 min max
const LOOK_AHEAD = GRID * 4; // how far ahead to scan

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speedMult = level.speedMult || 1;
  const speed = SCROLL_SPEED * speedMult;

  // Simple physics sim
  let x = 0;
  let y = GROUND_Y - PLAYER_SIZE;
  let vy = 0;
  let grounded = true;
  let rotation = 0;
  let alive = true;

  const frames = [];
  const RECORD_INTERVAL = 3;

  for (let frame = 0; frame < BOT_MAX_FRAMES; frame++) {
    if (!alive) break;
    if (x >= endX) break;

    // Record
    if (frame % RECORD_INTERVAL === 0) {
      frames.push({
        f: frame,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        r: Math.round(rotation * 100) / 100,
        m: 'cube',
        a: 1,
      });
    }

    // Look ahead for hazards
    const playerRight = x + PLAYER_SIZE;
    let shouldJump = false;

    for (const obs of obstacles) {
      if (obs.type !== 'spike' && obs.type !== 'saw') continue;

      const obsX = obs.x != null ? obs.x : 0;
      const obsW = obs.w || GRID;

      // Is this hazard ahead and close?
      if (obsX + obsW > playerRight && obsX < playerRight + LOOK_AHEAD) {
        // Check if it's at ground level (would hit us)
        const obsY = obs.y != null ? obs.y : 0;
        if (obsY + (obs.h || GRID) > y && obsY < y + PLAYER_SIZE) {
          shouldJump = true;
          break;
        }
      }
    }

    // Jump if needed and grounded
    if (shouldJump && grounded) {
      vy = JUMP_VEL;
      grounded = false;
      rotation -= 90;
    }

    // Physics
    if (!grounded) {
      vy += GRAVITY;
    }
    y += vy;

    // Ground collision
    if (y >= GROUND_Y - PLAYER_SIZE) {
      y = GROUND_Y - PLAYER_SIZE;
      vy = 0;
      grounded = true;
    }

    // Platform landing
    for (const obs of obstacles) {
      if (obs.type !== 'platform') continue;
      const px = obs.x;
      const py = obs.y;
      const pw = obs.w || GRID;
      const ph = obs.h || GRID;

      // Are we above this platform and falling?
      if (vy >= 0 && x + PLAYER_SIZE > px && x < px + pw) {
        if (y + PLAYER_SIZE >= py && y + PLAYER_SIZE <= py + 8) {
          y = py - PLAYER_SIZE;
          vy = 0;
          grounded = true;
        }
      }
    }

    // Check death (simple — did we hit a spike?)
    const inset = 6;
    const playerRect = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
    for (const obs of obstacles) {
      if (obs.type !== 'spike' && obs.type !== 'saw') continue;
      const ox = obs.x + inset;
      const oy = obs.y + inset;
      const ow = (obs.w || GRID) - inset * 2;
      const oh = (obs.h || GRID) - inset * 2;
      if (playerRect.x < ox + ow && playerRect.x + playerRect.w > ox &&
          playerRect.y < oy + oh && playerRect.y + playerRect.h > oy) {
        alive = false;
        break;
      }
    }

    // Move forward
    x += speed;
  }

  // Mark final frame
  if (frames.length > 0) {
    const last = frames[frames.length - 1];
    if (alive && x >= endX) {
      // Bot completed the level!
      return JSON.stringify(frames);
    }
  }

  // Bot didn't complete — return partial replay anyway
  return frames.length > 10 ? JSON.stringify(frames) : null;
}
