/** Fast bot that generates a ghost replay using look-ahead + collision */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const RECORD_INTERVAL = 3;
const INSET = 6;

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speed = SCROLL_SPEED * (level.speedMult || 1);

  // Collect hazards and platforms from live obstacles
  const hazards = [];
  const platforms = [];
  for (const obs of obstacles) {
    if (obs.type === 'spike' || obs.type === 'saw') {
      hazards.push({ x: obs.x, y: obs.y, w: obs.w || GRID, h: obs.h || GRID });
    }
    if (obs.type === 'platform') {
      platforms.push({ x: obs.x, y: obs.y, w: obs.w || GRID, h: obs.h || GRID });
    }
    // PlatformGroup pieces
    if (obs.type === 'platform_group' && obs.pieces) {
      for (const p of obs.pieces) {
        if (p.type === 'platform') {
          platforms.push({ x: p.x, y: p.y, w: p.w || GRID, h: p.h || GRID });
        }
        if (p.type === 'spike') {
          hazards.push({ x: p.x, y: p.y, w: p.w || GRID, h: p.h || GRID });
        }
      }
    }
  }

  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let grounded = true, rotation = 0, alive = true;

  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX || !alive) break;

    if (frame % RECORD_INTERVAL === 0) {
      frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });
    }

    // Look ahead for hazards
    if (grounded) {
      const lookDist = speed * 7;
      let danger = false;
      for (const h of hazards) {
        // Only check hazards that are ahead and nearby
        if (h.x + h.w <= x || h.x >= x + PLAYER_SIZE + lookDist) continue;
        // Would we collide at ground level?
        if (h.y + h.h > y + INSET && h.y < y + PLAYER_SIZE - INSET) {
          danger = true;
          break;
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
      for (const p of platforms) {
        if (x + PLAYER_SIZE > p.x + 4 && x < p.x + p.w - 4) {
          const bot = y + PLAYER_SIZE;
          const prevBot = bot - vy;
          if (prevBot <= p.y + 6 && bot >= p.y) {
            y = p.y - PLAYER_SIZE;
            vy = 0;
            grounded = true;
          }
        }
      }
    }

    // Walk off edge check
    if (grounded && y < GROUND_Y - PLAYER_SIZE - 2) {
      let onSurface = false;
      for (const p of platforms) {
        if (x + PLAYER_SIZE > p.x + 2 && x < p.x + p.w - 2 && Math.abs(y + PLAYER_SIZE - p.y) < 4) {
          onSurface = true;
          break;
        }
      }
      if (!onSurface) grounded = false;
    }

    // Death check
    const pr = { x: x + INSET, y: y + INSET, w: PLAYER_SIZE - INSET * 2, h: PLAYER_SIZE - INSET * 2 };
    for (const h of hazards) {
      const hr = { x: h.x + INSET, y: h.y + INSET, w: h.w - INSET * 2, h: h.h - INSET * 2 };
      if (rectsOverlap(pr, hr)) {
        alive = false;
        break;
      }
    }

    x += speed;
  }

  return frames.length > 5 ? JSON.stringify(frames) : null;
}
