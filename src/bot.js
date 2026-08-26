/**
 * Search-based bot.
 *
 * The old bot reimplemented a rough cube-only physics model and hill-climbed
 * jump timings, which meant it understood none of the portals, orbs, pads,
 * slopes or gravity flips the levels are actually built from — it died within
 * a second on every level.
 *
 * This one drives the real `Player` class and the real obstacle hitboxes
 * through a step function that mirrors main.js's frame order exactly, then
 * runs a beam search over the only input the game has: whether the button is
 * held on each frame. Because the simulation is the game's own code, anything
 * the player can do the bot can do.
 */

import { Player, MODE_CUBE, MODE_SHIP, MODE_WAVE, MODE_BALL } from './player.js';
import { PLAYER_SIZE, SCROLL_SPEED, GROUND_Y, GRID, SCREEN_HEIGHT } from './settings.js';

const MAX_FRAMES = 60 * 180;       // 3 minutes of level is plenty
const RECORD_INTERVAL = 2;         // frames per recorded ghost keyframe
const DEFAULT_BUDGET_MS = 2500;    // total search time before returning best effort
const SLICE_MS = 6;                // work done per pump() call, to stay off the frame budget
const BEAM_WIDTH = 900;            // generous: the reachable set is usually far smaller
const TIEBREAK_ROLLOUT = 12;       // frames of lookahead used only when over the cap

// Player fields that affect simulation. platformRef / movingPlatformRef are
// object references and are stored separately as obstacle indices.
const PLAYER_KEYS = [
  'x', 'prevX', 'y', 'prevY', 'vy', 'alive', 'grounded', 'rotation',
  'targetRotation', 'gravityMult', 'speedMult', 'onPlatform', 'onMovingPlatform',
  'transportLocked', 'transportExitRamp', 'mode', 'holding', 'coyoteCounter',
  'jumpBufferCounter', 'dashTimer', 'dashing', 'holdJumped', 'mini', 'reversed',
  'flipEaseTimer',
];

const STATEFUL = new Set(['portal', 'orb', 'pad', 'checkpoint', 'color_trigger', 'coin']);
const MOVER = new Set(['moving', 'transport']);

// ============================================================
// SIMULATION
// ============================================================

class Sim {
  constructor(level) {
    this.level = level;
    this.obstacles = level.obstacles;
    this.endX = level.endX;
    this.player = new Player();

    this.statefulIdx = [];
    this.moverIdx = [];
    this.maxWidth = GRID;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (STATEFUL.has(o.type)) this.statefulIdx.push(i);
      if (MOVER.has(o.type)) this.moverIdx.push(i);
      if (o.w > this.maxWidth) this.maxWidth = o.w;
    }
    // Obstacles are sorted by x, so a window can be found by binary search
    this.xs = this.obstacles.map(o => o.x);
    this.pendingOrb = null;
  }

  reset() {
    this.level.reset();
    this.player.reset(0);
    this.player.trail.length = 0;
    this.pendingOrb = null;
  }

  // ---- state snapshot / restore ----

  snapshot() {
    const p = this.player;
    const vals = new Array(PLAYER_KEYS.length);
    for (let i = 0; i < PLAYER_KEYS.length; i++) vals[i] = p[PLAYER_KEYS[i]];

    const act = new Uint8Array(this.statefulIdx.length);
    for (let i = 0; i < this.statefulIdx.length; i++) {
      const o = this.obstacles[this.statefulIdx[i]];
      act[i] = (o.type === 'coin' ? o.collected : o.activated) ? 1 : 0;
    }

    const mov = new Float64Array(this.moverIdx.length * 10);
    for (let i = 0; i < this.moverIdx.length; i++) {
      const o = this.obstacles[this.moverIdx[i]];
      const b = i * 10;
      mov[b] = o.t || 0;
      mov[b + 1] = o.progress || 0;
      mov[b + 2] = o.active ? 1 : 0;
      mov[b + 3] = o.arrived ? 1 : 0;
      mov[b + 4] = o.arrivedFrames || 0;
      mov[b + 5] = o.waitFrames || 0;
      mov[b + 6] = o.x;
      mov[b + 7] = o.y;
      mov[b + 8] = o.deltaX || 0;
      mov[b + 9] = o.deltaY || 0;
    }

    return {
      vals, act, mov,
      platformRef: this._refIndex(p.platformRef),
      movingRef: this._refIndex(p.movingPlatformRef),
    };
  }

  restore(s) {
    const p = this.player;
    for (let i = 0; i < PLAYER_KEYS.length; i++) p[PLAYER_KEYS[i]] = s.vals[i];
    p.platformRef = s.platformRef >= 0 ? this.obstacles[s.platformRef] : null;
    p.movingPlatformRef = s.movingRef >= 0 ? this.obstacles[s.movingRef] : null;

    for (let i = 0; i < this.statefulIdx.length; i++) {
      const o = this.obstacles[this.statefulIdx[i]];
      if (o.type === 'coin') o.collected = !!s.act[i];
      else o.activated = !!s.act[i];
    }

    for (let i = 0; i < this.moverIdx.length; i++) {
      const o = this.obstacles[this.moverIdx[i]];
      const b = i * 10;
      o.t = s.mov[b];
      o.progress = s.mov[b + 1];
      o.active = !!s.mov[b + 2];
      o.arrived = !!s.mov[b + 3];
      o.arrivedFrames = s.mov[b + 4];
      o.waitFrames = s.mov[b + 5];
      o.x = s.mov[b + 6];
      o.y = s.mov[b + 7];
      o.deltaX = s.mov[b + 8];
      o.deltaY = s.mov[b + 9];
    }
    this.pendingOrb = null;
  }

  _refIndex(obj) {
    if (!obj) return -1;
    const i = this.obstacles.indexOf(obj);
    return i;
  }

  // Obstacles whose bounds can reach the player this frame
  _window(px) {
    const lo = px - this.maxWidth - 8;
    const hi = px + PLAYER_SIZE + 8;
    const xs = this.xs;
    let a = 0, b = xs.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (xs[m] < lo) a = m + 1; else b = m;
    }
    const out = [];
    for (let i = a; i < xs.length && xs[i] <= hi; i++) out.push(this.obstacles[i]);
    return out;
  }

  /**
   * Advance one frame with the button held or not.
   * Mirrors the order in main.js: input, level update, platform carry,
   * collision resolution, orb activation, edge detection, player update.
   * Returns 'alive' | 'dead' | 'complete'.
   */
  step(hold) {
    const p = this.player;
    if (!p.alive) return 'dead';

    // --- input edges ---
    if (hold && !p.holding) {
      p.pressJump();
      // A fresh press while overlapping an orb fires it immediately in the game;
      // the holding branch after collision covers that case here.
      if (p.mode === MODE_CUBE) p.jump();
    } else if (!hold && p.holding) {
      p.releaseJump();
    }

    // --- level update (moving + transport platforms) ---
    for (const i of this.moverIdx) this.obstacles[i].update();

    // --- carry the player with the platform they're standing on ---
    if (p.movingPlatformRef && p.grounded) {
      p.y += p.movingPlatformRef.deltaY;
      p.prevY += p.movingPlatformRef.deltaY;
      if (p.transportLocked) p.x += p.movingPlatformRef.deltaX;
    }

    const prevTransportRef = (p.movingPlatformRef &&
      p.movingPlatformRef.type === 'transport' && p.movingPlatformRef.active &&
      (!p.movingPlatformRef.arrived || p.movingPlatformRef.arrivedFrames < 12))
      ? p.movingPlatformRef : null;
    const prevMovingRef = (p.movingPlatformRef &&
      p.movingPlatformRef.type === 'moving' && p.grounded) ? p.movingPlatformRef : null;
    const transportJustArrived = p.transportLocked &&
      p.movingPlatformRef && p.movingPlatformRef.type === 'transport' &&
      p.movingPlatformRef.arrived;

    p.onMovingPlatform = false;
    p.movingPlatformRef = null;
    p.transportLocked = false;
    this.pendingOrb = null;

    if (transportJustArrived) p.transportExitRamp = 1;

    if (prevTransportRef) {
      p.onMovingPlatform = true;
      p.movingPlatformRef = prevTransportRef;
      const tmo = p.mini ? (PLAYER_SIZE - p.getSize()) / 2 : 0;
      p.y = p.gravityMult === -1
        ? prevTransportRef.y + prevTransportRef.h - tmo
        : prevTransportRef.y - PLAYER_SIZE + tmo;
      p.vy = 0;
      p.grounded = true;
      p.onPlatform = true;
      p.platformRef = prevTransportRef;
      if (prevTransportRef.arrived) {
        p.transportLocked = false;
      } else {
        p.transportLocked = true;
        if (prevTransportRef.waitFrames < prevTransportRef.waitTotal) {
          const centerX = prevTransportRef.x + prevTransportRef.w / 2 - PLAYER_SIZE / 2;
          p.x += (centerX - p.x) * 0.2;
        }
      }
    }

    if (prevMovingRef && !prevTransportRef) {
      const inverted = p.gravityMult === -1;
      const movingAway = inverted ? p.vy < 0 : p.vy > 0;
      if (!movingAway) {
        const platLeft = prevMovingRef.x;
        const platRight = prevMovingRef.x + prevMovingRef.w;
        if (p.x + PLAYER_SIZE > platLeft && p.x < platRight) {
          const mo = p.mini ? (PLAYER_SIZE - p.getSize()) / 2 : 0;
          p.y = inverted ? prevMovingRef.y + prevMovingRef.h - mo : prevMovingRef.y - PLAYER_SIZE + mo;
          p.prevY = p.y;
          p.vy = 0;
          p.grounded = true;
          p.onPlatform = true;
          p.onMovingPlatform = true;
          p.movingPlatformRef = prevMovingRef;
        }
      }
    }

    const outcome = this._collide();
    if (outcome) return outcome;

    // Orb fires when the button is held while overlapping it
    if (this.pendingOrb && p.holding) {
      p.orbBounce(this.pendingOrb.orbType);
      this.pendingOrb.obs.markActivated();
      this.pendingOrb = null;
    }

    if (this._wasOnPlatform && !p.onPlatform) {
      p.grounded = false;
      p.coyoteCounter = 6;
    }

    p.update();
    if (!p.alive) {
      this.deathCause = { reason: 'offscreen', px: Math.round(p.x), py: Math.round(p.y) };
      return 'dead';
    }
    if (p.x >= this.endX) return 'complete';
    return 'alive';
  }

  /** Mirrors main.js's collision pass. Returns 'dead' | 'complete' | null. */
  _collide() {
    const p = this.player;
    const die = (reason, obs) => {
      this.deathCause = { reason, type: obs ? obs.type : null,
        ox: obs ? Math.round(obs.x) : null, oy: obs ? Math.round(obs.y) : null,
        px: Math.round(p.x), py: Math.round(p.y), vy: Math.round(p.vy * 10) / 10 };
      return 'dead';
    };
    const playerRect = p.getRect();
    const hazardRect = p.getHazardRect();
    const platformRect = p.getPlatformRect();
    const landingRect = p.getLandingRect();
    const miniOffset = p.mini ? (PLAYER_SIZE - p.getSize()) / 2 : 0;
    this._wasOnPlatform = p.onPlatform;
    p.onPlatform = false;

    const visible = this._window(p.x);

    for (const obs of visible) {
      const t = obs.type;

      if (t === 'spike' || t === 'mini_spike' || t === 'saw') {
        if (obs.checkCollision(hazardRect) === 'death') return die('hazard', obs);

      } else if (t === 'slope' || t === 'mini_slope') {
        const r = obs.checkCollision(playerRect, p.prevY, p.gravityMult);
        if (r && r.type === 'land') {
          const jumpingOff = (p.gravityMult > 0 && p.vy < -2) || (p.gravityMult < 0 && p.vy > 2);
          if (!jumpingOff) {
            p.y = p.gravityMult === -1 ? r.y - miniOffset : r.y - PLAYER_SIZE + miniOffset;
            p.prevY = p.y;
            p.vy = r.slopeRatio * (SCROLL_SPEED * p.speedMult);
            p.grounded = true;
            p.onPlatform = true;
            p._snapRotation();
          }
        }

      } else if (t === 'platform_group') {
        const r = obs.checkCollision(landingRect, p.prevY + miniOffset, p.gravityMult);
        if (r) {
          const piece = r._piece || obs;
          if (r.type === 'death') {
            if (piece.type === 'slope' && !r.wall) continue;
            const px = piece.x, py = piece.y, pw = piece.w || GRID, ph = piece.h || GRID;
            if (platformRect.x + platformRect.w <= px || platformRect.x >= px + pw ||
                platformRect.y + platformRect.h <= py || platformRect.y >= py + ph) continue;
            const risingNearSlope = p.vy * p.gravityMult < 0 && obs.pieces.some(q => q.type === 'slope');
            if (risingNearSlope) continue;
            return die('group-side', obs);
          }
          const lp = r._piece || piece;
          const lpx = lp.x, lpy = lp.y, lpw = lp.w || GRID, lph = lp.h || GRID;
          const prOverlap = !(platformRect.x + platformRect.w <= lpx || platformRect.x >= lpx + lpw ||
                              platformRect.y + platformRect.h <= lpy || platformRect.y >= lpy + lph);
          const prevRight = p.prevX + PLAYER_SIZE - 4 - miniOffset;
          if (prevRight <= lp.x + 4 && !r.slopeRatio && prOverlap) return die('group-left', lp);
          if (!r.slopeRatio && lp.type !== 'slope' && prOverlap) {
            const prevBot = p.prevY + PLAYER_SIZE - miniOffset;
            if (p.gravityMult > 0 && prevBot > lp.y + lp.h - 4 && p.vy < 0) return die('group-under', lp);
            const prevTop = p.prevY + miniOffset;
            if (p.gravityMult < 0 && prevTop < lp.y + 4 && p.vy > 0) return die('group-over', lp);
          }
          const jumpingOff = (p.gravityMult > 0 && p.vy < -2) || (p.gravityMult < 0 && p.vy > 2);
          if (jumpingOff) continue;
          if (r.slopeRatio != null) {
            p.y = p.gravityMult === -1 ? r.y - miniOffset : r.y - PLAYER_SIZE + miniOffset;
            p.prevY = p.y;
            p.vy = r.slopeRatio * (SCROLL_SPEED * p.speedMult);
          } else {
            p.y = p.gravityMult === -1 ? r.y - miniOffset : r.y - PLAYER_SIZE + miniOffset;
            p.prevY = p.y;
            p.vy = 0;
          }
          p.grounded = true;
          p.onPlatform = true;
          p._snapRotation();
        }

      } else if (t === 'platform' || t === 'mini_block' || t === 'moving' || t === 'transport') {
        if (t === 'transport' && obs.arrived && obs.arrivedFrames < 12) continue;
        const r = obs.checkCollision(landingRect, p.prevY + miniOffset, p.gravityMult);
        if (r) {
          if (r.type === 'death') {
            if (platformRect.x + platformRect.w <= obs.x || platformRect.x >= obs.x + obs.w ||
                platformRect.y + platformRect.h <= obs.y || platformRect.y >= obs.y + obs.h) continue;
            return die('plat-side', obs);
          }
          const oprOverlap = !(platformRect.x + platformRect.w <= obs.x || platformRect.x >= obs.x + obs.w ||
                               platformRect.y + platformRect.h <= obs.y || platformRect.y >= obs.y + obs.h);
          const prevRight = p.prevX + PLAYER_SIZE - 4 - miniOffset;
          if (prevRight <= obs.x + 4 && oprOverlap) return die('plat-left', obs);
          const prevBot = p.prevY + PLAYER_SIZE - miniOffset;
          if (p.gravityMult > 0 && prevBot > obs.y + obs.h - 4 && p.vy < 0 && oprOverlap) return die('plat-under', obs);
          const prevTop = p.prevY + miniOffset;
          if (p.gravityMult < 0 && prevTop < obs.y + 4 && p.vy > 0 && oprOverlap) return die('plat-over', obs);
          const jumpingOff = (p.gravityMult > 0 && p.vy < -2) || (p.gravityMult < 0 && p.vy > 2);
          if (jumpingOff) continue;
          p.y = p.gravityMult === -1 ? r.y - miniOffset : r.y - PLAYER_SIZE + miniOffset;
          p.prevY = p.y;
          p.vy = 0;
          p.grounded = true;
          p.onPlatform = true;
          if (t === 'moving') {
            p.onMovingPlatform = true;
            p.movingPlatformRef = obs;
          } else if (t === 'transport') {
            obs.active = true;
            p.onMovingPlatform = true;
            p.movingPlatformRef = obs;
            p.transportLocked = obs.isPlayerLocked();
          }
          p._snapRotation();
        }

      } else if (t === 'portal') {
        const r = obs.checkCollision(playerRect);
        if (r === 'portal_gravity') p.flipGravity();
        else if (r === 'portal_speed_up') p.speedMult = 1.4;
        else if (r === 'portal_speed_down') p.speedMult = 1.0;
        else if (r === 'portal_ship') p.setMode(MODE_SHIP);
        else if (r === 'portal_wave') p.setMode(MODE_WAVE);
        else if (r === 'portal_cube') p.setMode(MODE_CUBE);
        else if (r === 'portal_ball') p.setMode(MODE_BALL);
        else if (r === 'portal_mini') p.mini = true;
        else if (r === 'portal_big') p.mini = false;
        else if (r === 'portal_reverse') p.reversed = true;
        else if (r === 'portal_forward') p.reversed = false;

      } else if (t === 'orb') {
        const orbType = obs.checkCollision(playerRect);
        if (orbType) this.pendingOrb = { obs, orbType };

      } else if (t === 'pad') {
        const padType = obs.checkCollision(playerRect);
        if (padType) p.orbBounce(padType);

      } else if (t === 'end') {
        if (obs.checkCollision(playerRect) === 'complete') return 'complete';
      }
      // coins and color triggers do not affect physics, so they are skipped
    }
    return null;
  }
}

export { Sim as _Sim };

// ============================================================
// SEARCH
// ============================================================

/**
 * Identity of a search state.
 *
 * Every state on a given frame shares the same x (the run speed is fixed), so
 * what distinguishes futures is the player's kinematics plus the flags that
 * decide whether a jump is even possible. An earlier version rounded y to 6px
 * and vy to 2, which merged jump arcs launched a frame apart and collapsed the
 * beam onto a single phase — the bot would commit to one arc and ride it into a
 * spike. Keep this fine.
 */
function stateKey(p) {
  return `${p.mode}|${Math.round(p.y * 2)}|${Math.round(p.vy * 4)}|${p.grounded ? 1 : 0}` +
         `|${p.onPlatform ? 1 : 0}|${p.gravityMult}|${p.mini ? 1 : 0}|${p.holding ? 1 : 0}` +
         `|${p.speedMult}|${p.coyoteCounter}|${p.jumpBufferCounter}|${p.dashing ? 1 : 0}`;
}

function reconstruct(node) {
  const holds = [];
  for (let n = node; n && n.parent; n = n.parent) holds.push(n.hold);
  holds.reverse();
  return holds;
}

/**
 * Resumable beam search. Call pump() repeatedly; it does a slice of work and
 * returns true when finished, so the caller can spread the search across frames
 * instead of blocking on level load.
 */
class BotSearch {
  constructor(level, options = {}) {
    this.level = level;
    this.sim = new Sim(level);
    this.budgetMs = options.budgetMs || DEFAULT_BUDGET_MS;
    this.beamWidth = options.beamWidth || BEAM_WIDTH;
    this.spent = 0;
    this.frame = 0;
    this.done = false;
    this.completed = false;
    this.result = null;

    this.sim.reset();
    const root = { snap: this.sim.snapshot(), parent: null, hold: false, x: this.sim.player.x };
    this.frontier = [root];
    this.deepest = root;
    this.next = [];
    this.seen = new Set();
    this.cursor = 0;
  }

  /**
   * Runs one slice of work. Returns true when the search has finished.
   *
   * Expansion is resumable at node granularity, not frame granularity: a wide
   * frontier can take several milliseconds to expand in one go, which is enough
   * to drop a frame, so the cursor is kept between calls.
   */
  pump(sliceMs = SLICE_MS) {
    if (this.done) return true;
    const sim = this.sim;
    const t0 = Date.now();

    while (true) {
      if (Date.now() - t0 >= sliceMs) {
        this.spent += Date.now() - t0;
        return false;
      }
      if (this.spent + (Date.now() - t0) > this.budgetMs || this.frame >= MAX_FRAMES) {
        return this._finish(false);
      }

      // Expand a chunk of the current frontier
      const chunkEnd = Math.min(this.cursor + 24, this.frontier.length);
      for (; this.cursor < chunkEnd; this.cursor++) {
        const node = this.frontier[this.cursor];
        for (let i = 0; i < 2; i++) {
          const hold = i === 1;
          sim.restore(node.snap);
          const r = sim.step(hold);
          if (r === 'dead') continue;
          if (r === 'complete') {
            this.deepest = { parent: node, hold, x: sim.player.x };
            return this._finish(true);
          }
          const key = stateKey(sim.player);
          if (this.seen.has(key)) continue;
          this.seen.add(key);
          const child = { snap: sim.snapshot(), parent: node, hold, x: sim.player.x };
          this.next.push(child);
          if (child.x > this.deepest.x) this.deepest = child;
        }
      }
      if (this.cursor < this.frontier.length) continue; // more of this frame to do

      // Frame complete
      const next = this.next;
      if (!next.length) return this._finish(false);

      if (next.length > this.beamWidth) {
        for (const n of next) n.score = this._survival(n.snap);
        next.sort((a, b) => b.score - a.score);
        next.length = this.beamWidth;
      }

      this.frontier = next;
      this.next = [];
      this.seen = new Set();
      this.cursor = 0;
      this.frame++;
    }
  }

  _survival(snap) {
    const sim = this.sim;
    let best = 0;
    for (let i = 0; i < 2; i++) {
      sim.restore(snap);
      let n = 0;
      for (; n < TIEBREAK_ROLLOUT; n++) {
        const r = sim.step(i === 1);
        if (r === 'dead') break;
        if (r === 'complete') { n = TIEBREAK_ROLLOUT; break; }
      }
      if (n > best) best = n;
    }
    return best;
  }

  _finish(completed) {
    this.done = true;
    this.completed = completed;
    this.result = { holds: reconstruct(this.deepest), completed, reachedX: this.deepest.x };
    return true;
  }

  /** Replays the chosen inputs and returns ghost keyframes. */
  record() {
    if (!this.result) return null;
    const sim = this.sim;
    const holds = this.result.holds;
    sim.reset();
    const frames = [];
    const push = (f) => {
      const p = sim.player;
      frames.push({
        f, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
        r: Math.round(p.rotation * 100) / 100, m: p.mode, a: 1,
      });
    };

    push(0);
    for (let i = 0; i < holds.length; i++) {
      const r = sim.step(holds[i]);
      const f = i + 1;
      if (f % RECORD_INTERVAL === 0 || r !== 'alive') push(f);
      if (r !== 'alive') break;
    }
    try { this.level.reset(); } catch {}
    return frames;
  }
}

// ============================================================
// ENTRY POINTS
// ============================================================

function canSearch(level) {
  return !!(level && level.obstacles && level.obstacles.length &&
    level.obstacles.some(o => o.type === 'end'));
}

// jump() bumps a localStorage stat counter; a search makes tens of thousands of
// simulated jumps, so it has to be muzzled or it both crawls and corrupts stats.
function withMutedStats(fn) {
  const real = Player._countJump;
  Player._countJump = () => {};
  try { return fn(); } finally { Player._countJump = real; }
}

/**
 * Incremental search. Returns a handle with pump()/done, or null if the level
 * has nothing to search. Pump it from the game loop so the search never blocks
 * a frame; read `.replay` once `.done` is true.
 */
export function startBotSearch(level, options) {
  if (!canSearch(level)) return null;
  let search;
  try {
    search = withMutedStats(() => new BotSearch(level, options));
  } catch (e) {
    console.warn('[Bot] could not start search:', e.message);
    return null;
  }

  return {
    done: false,
    replay: null,
    completed: false,
    pump(sliceMs) {
      if (this.done) return true;
      let finished = false;
      withMutedStats(() => { finished = search.pump(sliceMs); });
      if (!finished) return false;

      this.done = true;
      this.completed = search.completed;
      withMutedStats(() => {
        const frames = search.record();
        if (frames && frames.length >= 3) {
          this.replay = JSON.stringify(frames);
          const reached = frames[frames.length - 1].x;
          const pct = Math.round((reached / level.endX) * 100);
          console.log(`[Bot] ${search.completed ? 'completed the level' : `reached ${pct}%`} ` +
            `in ${search.frame} frames of search`);
        }
      });
      return true;
    },
  };
}

/** Blocking convenience wrapper — runs the search to completion in one call. */
export function generateBotReplay(level, options = {}) {
  const handle = startBotSearch(level, options);
  if (!handle) return null;
  const slice = options.sliceMs || 50;
  while (!handle.pump(slice)) { /* keep going */ }
  return handle.replay;
}
