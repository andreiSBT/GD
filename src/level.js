/** Level loader and camera system */

import { GRID, PLAYER_SIZE, PLAYER_X_OFFSET, SCREEN_WIDTH } from './settings.js';
import { createObstacle, clearSpriteCache, Platform, PlatformGroup } from './obstacles.js';
import level1 from './levels/level1.js';
import level2 from './levels/level2.js';
import level3 from './levels/level3.js';
import level4 from './levels/level4.js';
import level5 from './levels/level5.js';
import level6 from './levels/level6.js';
import level7 from './levels/level7.js';
import level8 from './levels/level8.js';
import level9 from './levels/level9.js';

export const LEVEL_DATA = { 1: level1, 2: level2, 3: level3, 4: level4, 5: level5, 6: level6, 7: level7, 8: level8, 9: level9 };

export function createLevelFromData(data) {
  const lvl = Object.create(Level.prototype);
  lvl.id = data.id || 99;
  lvl.data = data;
  lvl.name = data.name || 'Custom Level';
  lvl.speedMult = data.speed || 1.0;
  lvl.obstacles = [];
  lvl.endX = 0;
  lvl._load();
  return lvl;
}

export class Level {
  constructor(levelId) {
    this.id = levelId;
    this.data = LEVEL_DATA[levelId];
    if (!this.data) {
      console.warn(`Level ${levelId} not found, falling back to level 1`);
      this.data = LEVEL_DATA[1];
    }
    this.name = this.data.name;
    this.speedMult = this.data.speed;
    this.obstacles = [];
    this.endX = 0;
    this._load();
  }

  _load() {
    clearSpriteCache();
    this.obstacles = [];
    this.totalCoins = 0;
    for (const obj of this.data.objects) {
      const obstacle = createObstacle(obj);
      if (obstacle) {
        this.obstacles.push(obstacle);
        if (obstacle.type === 'end') {
          this.endX = obstacle.x;
        }
        if (obstacle.type === 'coin') {
          this.totalCoins++;
        }
      }
    }
    // Merge touching platforms into single larger ones
    this._mergePlatforms();
    // Sort by x for faster visibility filtering
    this.obstacles.sort((a, b) => a.x - b.x);
    // Cache for getVisible
    this._visibleCache = null;
    this._visibleCacheKey = -Infinity;
  }

  _mergePlatforms() {
    const platforms = this.obstacles.filter(o => o.type === 'platform');
    if (platforms.length < 2) {
      this._computeAdjacentEdges();
      return;
    }

    // Group touching platforms
    const groupOf = new Array(platforms.length).fill(-1);
    let groupCount = 0;
    for (let i = 0; i < platforms.length; i++) {
      if (groupOf[i] >= 0) continue;
      const gid = groupCount++;
      groupOf[i] = gid;
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < platforms.length; j++) {
          if (groupOf[j] >= 0) continue;
          const p = platforms[j];
          const px2 = p.x + p.w, py2 = p.y + p.h;
          for (let k = 0; k < platforms.length; k++) {
            if (groupOf[k] !== gid) continue;
            const q = platforms[k];
            if (p.x <= q.x + q.w && px2 >= q.x && p.y <= q.y + q.h && py2 >= q.y) {
              groupOf[j] = gid;
              changed = true;
              break;
            }
          }
        }
      }
    }

    // Compute hidden edges first (needed for PlatformGroup border drawing)
    this._computeAdjacentEdges();

    // Replace grouped platforms with PlatformGroup objects
    const removed = new Set();
    for (let g = 0; g < groupCount; g++) {
      const group = [];
      for (let i = 0; i < platforms.length; i++) {
        if (groupOf[i] === g) group.push(platforms[i]);
      }
      if (group.length <= 1) continue;
      for (const p of group) removed.add(p);
      this.obstacles.push(new PlatformGroup(group));
    }
    this.obstacles = this.obstacles.filter(o => !removed.has(o));
  }

  _computeAdjacentEdges() {
    // For each slope, check which of its edges touch a platform or another slope
    // hidden edges: 'bottom', 'left', 'right' (slope diagonal edge is never hidden)
    const solids = this.obstacles.filter(o => o.type === 'platform' || o.type === 'slope');
    for (const obs of solids) {
      obs.hiddenEdges = obs.hiddenEdges || new Set();
    }
    for (let i = 0; i < solids.length; i++) {
      const a = solids[i];
      const ax2 = a.x + a.w, ay2 = a.y + a.h;
      for (let j = i + 1; j < solids.length; j++) {
        const b = solids[j];
        const bx2 = b.x + b.w, by2 = b.y + b.h;
        // Check if they share a vertical edge (left/right touching)
        // A's right == B's left
        if (Math.abs(ax2 - b.x) < 2) {
          const overlapY = Math.min(ay2, by2) - Math.max(a.y, b.y);
          if (overlapY > 2) {
            a.hiddenEdges.add('right');
            b.hiddenEdges.add('left');
          }
        }
        // A's left == B's right
        if (Math.abs(a.x - bx2) < 2) {
          const overlapY = Math.min(ay2, by2) - Math.max(a.y, b.y);
          if (overlapY > 2) {
            a.hiddenEdges.add('left');
            b.hiddenEdges.add('right');
          }
        }
        // Check horizontal edge (top/bottom touching)
        // A's bottom == B's top
        if (Math.abs(ay2 - b.y) < 2) {
          const overlapX = Math.min(ax2, bx2) - Math.max(a.x, b.x);
          if (overlapX > 2) {
            a.hiddenEdges.add('bottom');
            b.hiddenEdges.add('top');
          }
        }
        // A's top == B's bottom
        if (Math.abs(a.y - by2) < 2) {
          const overlapX = Math.min(ax2, bx2) - Math.max(a.x, b.x);
          if (overlapX > 2) {
            a.hiddenEdges.add('top');
            b.hiddenEdges.add('bottom');
          }
        }
      }
    }
  }

  reset() {
    // Reset portals and checkpoints
    for (const obs of this.obstacles) {
      if (obs.reset) obs.reset();
    }
  }

  resetFrom(fromX) {
    // Reset only obstacles at or after fromX (for checkpoint respawn)
    for (const obs of this.obstacles) {
      if (obs.x >= fromX && obs.reset) obs.reset();
    }
  }

  getVisible(cameraX) {
    // Return cached result if camera hasn't moved enough
    const key = Math.round(cameraX);
    if (this._visibleCache && key === this._visibleCacheKey) {
      return this._visibleCache;
    }
    const right = cameraX + SCREEN_WIDTH + 100;
    const visibleLeft = cameraX - PLAYER_X_OFFSET - 100;
    // Binary search on o.x only (monotonic since sorted).
    // Subtract max possible obstacle width so wide platforms aren't skipped.
    const searchLeft = visibleLeft - SCREEN_WIDTH;
    let lo = 0, hi = this.obstacles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.obstacles[mid].x < searchLeft) lo = mid + 1;
      else hi = mid;
    }
    const result = [];
    for (let i = lo; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (o.x >= right) break;
      // Skip obstacles whose right edge is left of the viewport
      if (o.x + (o.w || GRID) <= visibleLeft) continue;
      result.push(o);
    }
    this._visibleCache = result;
    this._visibleCacheKey = key;
    return result;
  }

  getProgress(playerX) {
    if (this.endX <= 0) return 0;
    // Player reaches end marker when playerX + PLAYER_SIZE >= endX
    const effectiveEnd = this.endX - PLAYER_SIZE;
    return Math.min(1, Math.max(0, playerX / effectiveEnd));
  }

  update() {
    // Update moving platforms
    for (const obs of this.obstacles) {
      if ((obs.type === 'moving' || obs.type === 'transport') && obs.update) obs.update();
    }
  }
}

export class Camera {
  constructor() {
    this.x = 0;
    this.prevX = 0;
    this.targetX = 0;
  }

  update(playerX) {
    this.prevX = this.x;
    this.targetX = playerX;
    // Smooth follow — lerp toward target
    this.x += (this.targetX - this.x) * 0.35;
  }

  getInterpolatedX(alpha) {
    return this.prevX + (this.x - this.prevX) * alpha;
  }

  reset(x = 0) {
    this.x = x;
    this.prevX = x;
    this.targetX = x;
  }
}

export function getLevelCount() {
  return Object.keys(LEVEL_DATA).length;
}
