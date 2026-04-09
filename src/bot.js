/** Brute-force bot that learns to complete a level through trial and error */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 180; // 3 min max per attempt
const MAX_ATTEMPTS = 200;    // max learning attempts
const RECORD_INTERVAL = 3;
const INSET = 8;             // collision forgiveness

// Simulate one full run with given jump inputs
function simulate(obstacles, endX, speed, jumpFrames) {
  let x = 0;
  let y = GROUND_Y - PLAYER_SIZE;
  let vy = 0;
  let grounded = true;
  let rotation = 0;
  let deathFrame = -1;
  let deathX = 0;
  let completed = false;

  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX) { completed = true; break; }

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

    // Jump if this frame is in jumpFrames
    if (jumpFrames.has(frame) && grounded) {
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

    // Platform landing (falling onto top)
    for (const obs of obstacles) {
      if (obs.type !== 'platform') continue;
      const px = obs.x, py = obs.y, pw = obs.w || GRID;
      if (vy >= 0 && x + PLAYER_SIZE > px + 4 && x < px + pw - 4) {
        const playerBottom = y + PLAYER_SIZE;
        const prevBottom = playerBottom - vy;
        if (prevBottom <= py + 4 && playerBottom >= py) {
          y = py - PLAYER_SIZE;
          vy = 0;
          grounded = true;
        }
      }
    }

    // Walking off platform edge
    if (grounded && y < GROUND_Y - PLAYER_SIZE - 1) {
      let onSomething = false;
      for (const obs of obstacles) {
        if (obs.type !== 'platform') continue;
        const px = obs.x, py = obs.y, pw = obs.w || GRID;
        if (x + PLAYER_SIZE > px + 2 && x < px + pw - 2 && Math.abs(y + PLAYER_SIZE - py) < 3) {
          onSomething = true;
          break;
        }
      }
      if (!onSomething) grounded = false;
    }

    // Death check
    const pr = { x: x + INSET, y: y + INSET, w: PLAYER_SIZE - INSET * 2, h: PLAYER_SIZE - INSET * 2 };
    for (const obs of obstacles) {
      if (obs.type !== 'spike' && obs.type !== 'saw') continue;
      const ox = obs.x, oy = obs.y;
      const ow = obs.w || GRID, oh = obs.h || GRID;
      if (pr.x < ox + ow - INSET && pr.x + pr.w > ox + INSET &&
          pr.y < oy + oh - INSET && pr.y + pr.h > oy + INSET) {
        deathFrame = frame;
        deathX = x;
        return { frames, completed: false, deathFrame, deathX };
      }
    }

    // Move
    x += speed;
  }

  return { frames, completed, deathFrame: -1, deathX: x };
}

// Find the best frame to jump near a given X position
function findJumpFrame(speed, targetX) {
  // Calculate which frame the bot reaches targetX
  // frame = targetX / speed
  const frame = Math.floor(targetX / speed);
  return Math.max(0, frame);
}

export function generateBotReplay(level) {
  if (!level || !level.obstacles) return null;

  const obstacles = level.obstacles;
  const endMarker = obstacles.find(o => o.type === 'end');
  if (!endMarker) return null;

  const endX = endMarker.x;
  const speedMult = level.speedMult || 1;
  const speed = SCROLL_SPEED * speedMult;

  const jumpFrames = new Set();
  let bestResult = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = simulate(obstacles, endX, speed, jumpFrames);

    if (result.completed) {
      // Success!
      bestResult = result;
      break;
    }

    if (result.deathFrame < 0) {
      // Timed out, not dead — save what we have
      bestResult = result;
      break;
    }

    // Learn from death: try jumping at different frames before death point
    // Try jumping earlier — scan backwards from death to find the right timing
    const deathFrame = result.deathFrame;
    const deathX = result.deathX;

    // Strategy: try jumping 1-15 frames before death position
    let added = false;
    for (let offset = 2; offset <= 20; offset++) {
      const tryFrame = deathFrame - offset;
      if (tryFrame < 0) continue;
      if (jumpFrames.has(tryFrame)) continue;

      // Test if jumping here helps
      const testJumps = new Set(jumpFrames);
      testJumps.add(tryFrame);
      const testResult = simulate(obstacles, endX, speed, testJumps);

      if (testResult.completed) {
        // This jump solves it!
        jumpFrames.add(tryFrame);
        bestResult = testResult;
        added = true;
        break;
      }

      if (testResult.deathFrame > deathFrame || testResult.deathFrame < 0) {
        // This jump gets us further — keep it
        jumpFrames.add(tryFrame);
        added = true;
        break;
      }
    }

    // If no single jump helped, try removing a recent jump that might be wrong
    if (!added) {
      // Try a wider range
      for (let offset = 21; offset <= 40; offset++) {
        const tryFrame = deathFrame - offset;
        if (tryFrame < 0) continue;
        if (jumpFrames.has(tryFrame)) continue;
        jumpFrames.add(tryFrame);
        added = true;
        break;
      }
    }

    if (!added) {
      // Stuck — save best so far
      bestResult = result;
      break;
    }

    bestResult = result;
  }

  if (!bestResult || bestResult.frames.length < 5) return null;

  console.log(`[Bot] ${bestResult.completed ? 'COMPLETED' : 'PARTIAL'} in ${jumpFrames.size} jumps, ${bestResult.frames.length} frames`);
  return JSON.stringify(bestResult.frames);
}
