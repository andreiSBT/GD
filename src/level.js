/** Level loader and camera system */

import { GRID, PLAYER_SIZE, PLAYER_X_OFFSET, SCREEN_WIDTH } from './settings.js';
import { createObstacle, clearSpriteCache, Platform } from './obstacles.js';
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
    // Group static platforms that touch or overlap into merged larger platforms
    const platforms = this.obstacles.filter(o => o.type === 'platform');
    if (platforms.length < 2) return;

    const merged = new Set();
    const newPlatforms = [];

    for (let i = 0; i < platforms.length; i++) {
      if (merged.has(i)) continue;
      // Start a group with this platform's bounding box
      let minX = platforms[i].x;
      let minY = platforms[i].y;
      let maxX = platforms[i].x + platforms[i].w;
      let maxY = platforms[i].y + platforms[i].h;
      merged.add(i);

      // Keep expanding the group until no more neighbors found
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < platforms.length; j++) {
          if (merged.has(j)) continue;
          const p = platforms[j];
          const px2 = p.x + p.w;
          const py2 = p.y + p.h;
          // Check if platform j touches or overlaps the current group
          // Touch = edges exactly meet (no gap), overlap = edges cross
          const touchX = p.x <= maxX && px2 >= minX;
          const touchY = p.y <= maxY && py2 >= minY;
          if (touchX && touchY) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, px2);
            maxY = Math.max(maxY, py2);
            merged.add(j);
            changed = true;
          }
        }
      }

      // Create a merged platform using pixel coordinates
      const mp = new Platform(0, 0, 1, 1);
      mp.x = minX;
      mp.y = minY;
      mp.w = maxX - minX;
      mp.h = maxY - minY;
      newPlatforms.push(mp);
    }

    // Replace old platforms with merged ones
    this.obstacles = this.obstacles.filter(o => o.type !== 'platform').concat(newPlatforms);
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
