/** Level loader and camera system */

import { GRID, PLAYER_X_OFFSET, SCREEN_WIDTH } from './settings.js';
import { createObstacle } from './obstacles.js';
import level1 from './levels/level1.js';
import level2 from './levels/level2.js';
import level3 from './levels/level3.js';

export const LEVEL_DATA = { 1: level1, 2: level2, 3: level3 };

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
    this.name = this.data.name;
    this.speedMult = this.data.speed;
    this.obstacles = [];
    this.endX = 0;
    this._load();
  }

  _load() {
    this.obstacles = [];
    for (const obj of this.data.objects) {
      const obstacle = createObstacle(obj);
      if (obstacle) {
        this.obstacles.push(obstacle);
        if (obstacle.type === 'end') {
          this.endX = obstacle.x;
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
    const left = cameraX - PLAYER_X_OFFSET - 100;
    const right = cameraX + SCREEN_WIDTH + 100;
    return this.obstacles.filter(o => {
      const ox = o.x;
      const ow = o.w || GRID;
      return ox + ow > left && ox < right;
    });
  }

  getProgress(playerX) {
    if (this.endX <= 0) return 0;
    return Math.min(1, Math.max(0, playerX / this.endX));
  }

  update() {
    // Update moving platforms
    for (const obs of this.obstacles) {
      if (obs.type === 'moving' && obs.update) obs.update();
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
