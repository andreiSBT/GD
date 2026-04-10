/** Learning bot: runs level multiple times, remembers deaths, tries different jumps */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const LOOKAHEAD = 40;
const MAX_ATTEMPTS = 10;

function checkAll(x, y, prevY, obstacles) {
  const inset = 4;
  const pr = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
  let landed = false, landY = y;

  for (const obs of obstacles) {
    if (!obs.checkCollision) continue;
    if (obs.type === 'spike' || obs.type === 'saw') {
      if (obs.checkCollision(pr) === 'death') return { dead: true };
    } else if (obs.type === 'platform' || obs.type === 'platform_group') {
      const r = obs.checkCollision(pr, prevY, 1);
      if (r) {
        if (r.type === 'death') return { dead: true };
        if (r.type === 'land' && !landed) { landed = true; landY = r.y; }
      }
    }
  }
  return { dead: false, landed, landY };
}

function simFrames(startX, startY, startVy, startGrounded, speed, obstacles, doJump, numFrames) {
  let x = startX, y = startY, vy = startVy, grounded = startGrounded;
  if (doJump && grounded) { vy = JUMP_VEL; grounded = false; }

  for (let f = 0; f < numFrames; f++) {
    const prevY = y;
    if (!grounded) vy += GRAVITY;
    y += vy;
    if (y >= GROUND_Y - PLAYER_SIZE) { y = GROUND_Y - PLAYER_SIZE; vy = 0; grounded = true; }

    const result = checkAll(x, y, prevY, obstacles);
    if (result.dead) return f;
    if (result.landed) { y = result.landY - PLAYER_SIZE; vy = 0; grounded = true; }

    if (grounded && y < GROUND_Y - PLAYER_SIZE - 2) {
      const edgeResult = checkAll(x, y, y, obstacles);
      if (!edgeResult.landed) grounded = false;
    }
    x += speed;
  }
  return numFrames;
}

// Run one full attempt with a set of forced jump frames
function runAttempt(obstacles, endX, speed, jumpSet) {
  let x = 0, y = GROUND_Y - PLAYER_SIZE, vy = 0;
  let grounded = true, rotation = 0;
  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX) break;

    frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
      r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });

    // Jump decision
    let doJump = false;
    if (grounded) {
      const noJumpSurvival = simFrames(x, y, vy, true, speed, obstacles, false, LOOKAHEAD);
      const jumpSurvival = simFrames(x, y, vy, true, speed, obstacles, true, LOOKAHEAD);

      if (jumpSet.has(frame)) {
        // Forced jump from learning — but only if jumping doesn't kill us faster
        if (jumpSurvival > noJumpSurvival) doJump = true;
      } else {
        // Smart check: jump only if it survives full lookahead and no-jump doesn't
        if (noJumpSurvival < LOOKAHEAD && jumpSurvival >= LOOKAHEAD) {
          doJump = true;
        }
      }
    }

    if (doJump && grounded) {
      vy = JUMP_VEL;
      grounded = false;
      rotation -= 90;
    }

    // Physics
    const prevY = y;
    if (!grounded) vy += GRAVITY;
    y += vy;
    if (y >= GROUND_Y - PLAYER_SIZE) { y = GROUND_Y - PLAYER_SIZE; vy = 0; grounded = true; }

    // Collision
    const result = checkAll(x, y, prevY, obstacles);
    if (result.dead) return { frames, deathFrame: frame, deathX: x, completed: false };
    if (result.landed) { y = result.landY - PLAYER_SIZE; vy = 0; grounded = true; }

    // Edge detection
    if (grounded && y < GROUND_Y - PLAYER_SIZE - 2) {
      const edgeResult = checkAll(x, y, y, obstacles);
      if (!edgeResult.landed) grounded = false;
    }

    x += speed;
  }

  return { frames, deathFrame: -1, deathX: x, completed: x >= endX };
}

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speed = SCROLL_SPEED * (level.speedMult || 1);

  const jumpSet = new Set();
  let bestResult = null;
  let bestFrames = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = runAttempt(obstacles, endX, speed, jumpSet);

    if (result.frames.length > bestFrames) {
      bestResult = result;
      bestFrames = result.frames.length;
    }

    if (result.completed) {
      console.log('[Bot] COMPLETED on attempt', attempt + 1, 'with', jumpSet.size, 'learned jumps,', result.frames.length, 'frames');
      break;
    }

    if (result.deathFrame < 0) break; // timed out

    // Learn from death: try a few jump timings before death
    const df = result.deathFrame;
    let improved = false;

    // Try 5 offsets quickly (don't test all 25)
    const offsets = [3, 6, 10, 15, 20];
    for (const offset of offsets) {
      const tryFrame = df - offset;
      if (tryFrame < 0 || jumpSet.has(tryFrame)) continue;

      jumpSet.add(tryFrame);
      const testResult = runAttempt(obstacles, endX, speed, jumpSet);

      if (testResult.frames.length > bestFrames) {
        // This jump helps
        bestResult = testResult;
        bestFrames = testResult.frames.length;
        improved = true;
        break;
      } else {
        // Didn't help, remove it
        jumpSet.delete(tryFrame);
      }
    }

    if (!improved) {
      console.log('[Bot] Stuck at frame', df, 'after', attempt + 1, 'attempts');
      break;
    }
  }

  if (!bestResult || bestResult.frames.length < 5) return null;
  console.log('[Bot] Best:', bestFrames, 'frames, reached x:', Math.round(bestResult.deathX), '/', endX, 'jumps:', jumpSet.size);
  return JSON.stringify(bestResult.frames);
}
