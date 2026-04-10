/** Learning bot: runs level multiple times, remembers deaths, tries different jumps */

import { PLAYER_SIZE, SCROLL_SPEED, GRAVITY, JUMP_VEL, GROUND_Y, GRID } from './settings.js';

const MAX_FRAMES = 60 * 120;
const LOOKAHEAD = 50;
const MAX_ATTEMPTS = 10;
const SIM_LOOKAHEAD = 20; // inner sim lookahead (shorter to keep fast)

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
        // Platform side-hit: only die if we're clearly hitting the side (moving into it)
        // Ignore side-death if we're falling or already near platform top
        if (r.type === 'death') {
          // Check if it's a spike inside the group (real death) vs side hit (can survive)
          if (obs.type === 'platform_group' && obs.pieces) {
            // Check if any spike in group kills us
            let spikeKill = false;
            for (const p of obs.pieces) {
              if ((p.type === 'spike' || p.type === 'slope') && p.checkCollision) {
                const sr = p.checkCollision(pr);
                if (sr === 'death') { spikeKill = true; break; }
              }
            }
            if (spikeKill) return { dead: true };
            // Side hit on platform — treat as landing on top instead
            if (r.y != null) { landed = true; landY = r.y; }
          } else {
            return { dead: true };
          }
        }
        if (r.type === 'land' && !landed) { landed = true; landY = r.y; }
      }
    }
  }
  return { dead: false, landed, landY };
}

// Simulate with smart auto-jump (bot keeps playing during sim)
function simFrames(startX, startY, startVy, startGrounded, speed, obstacles, doJumpNow, numFrames) {
  let x = startX, y = startY, vy = startVy, grounded = startGrounded;
  if (doJumpNow && grounded) { vy = JUMP_VEL; grounded = false; }

  for (let f = 0; f < numFrames; f++) {
    // Auto-jump: if grounded and danger ahead, jump
    if (grounded && f > 0) {
      let dieSoon = false;
      let sx = x, sy = y, svy = 0;
      for (let s = 0; s < SIM_LOOKAHEAD; s++) {
        const sprev = sy;
        sy += svy;
        if (sy >= GROUND_Y - PLAYER_SIZE) { sy = GROUND_Y - PLAYER_SIZE; svy = 0; }
        const sr = checkAll(sx, sy, sprev, obstacles);
        if (sr.dead) { dieSoon = true; break; }
        if (sr.landed) { sy = sr.landY - PLAYER_SIZE; svy = 0; }
        sx += speed;
      }
      if (dieSoon) { vy = JUMP_VEL; grounded = false; }
    }

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
  let grounded = true, rotation = 0, targetRotation = 0;
  const frames = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    if (x >= endX) break;

    // Smooth rotation lerp (like player)
    rotation += (targetRotation - rotation) * 0.25;
    if (Math.abs(targetRotation - rotation) < 0.5) rotation = targetRotation;

    frames.push({ f: frame, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
      r: Math.round(rotation * 100) / 100, m: 'cube', a: 1 });

    // Jump decision — wait for optimal timing
    let doJump = false;
    if (grounded) {
      const noJumpSurvival = simFrames(x, y, vy, true, speed, obstacles, false, LOOKAHEAD);

      if (jumpSet.has(frame)) {
        // Forced jump from learning
        const jumpSurvival = simFrames(x, y, vy, true, speed, obstacles, true, LOOKAHEAD);
        if (jumpSurvival > noJumpSurvival) doJump = true;
      } else if (noJumpSurvival < LOOKAHEAD) {
        // We'll die soon — but wait for best timing
        // Only jump if: jump survives full lookahead, OR we die in < 5 frames (urgent)
        const jumpSurvival = simFrames(x, y, vy, true, speed, obstacles, true, LOOKAHEAD);
        if (jumpSurvival >= LOOKAHEAD) {
          doJump = true;
        } else if (noJumpSurvival < 5) {
          // Emergency: about to die, jump if it helps at all
          if (jumpSurvival > noJumpSurvival) doJump = true;
        }
        // Otherwise wait — maybe next frame has better timing
      }
    }

    if (doJump && grounded) {
      vy = JUMP_VEL;
      grounded = false;
      targetRotation -= 90;
    }

    // Physics
    const prevY = y;
    if (!grounded) vy += GRAVITY;
    y += vy;
    if (y >= GROUND_Y - PLAYER_SIZE) { y = GROUND_Y - PLAYER_SIZE; vy = 0; grounded = true; }

    // Collision
    const result = checkAll(x, y, prevY, obstacles);
    if (result.dead) {
      // Log what killed us
      const inset = 4;
      const pr = { x: x + inset, y: y + inset, w: PLAYER_SIZE - inset * 2, h: PLAYER_SIZE - inset * 2 };
      for (const obs of obstacles) {
        if (!obs.checkCollision) continue;
        if (obs.type === 'spike' || obs.type === 'saw') {
          if (obs.checkCollision(pr) === 'death') { console.log('[Bot] Killed by', obs.type, 'at', obs.x, obs.y, 'rot:', obs.rot, 'player at', Math.round(x), Math.round(y)); break; }
        } else if (obs.type === 'platform' || obs.type === 'platform_group') {
          const r = obs.checkCollision(pr, prevY, 1);
          if (r && r.type === 'death') { console.log('[Bot] Killed by', obs.type, 'side at', obs.x, obs.y, obs.w, 'x', obs.h, 'player at', Math.round(x), Math.round(y)); break; }
        }
      }
      return { frames, deathFrame: frame, deathX: x, completed: false };
    }
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
