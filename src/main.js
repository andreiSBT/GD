/** Main game - loop, state machine, collision, everything wired together */

import { SCREEN_WIDTH, SCREEN_HEIGHT, PLAYER_SIZE, PLAYER_X_OFFSET, GROUND_Y, THEMES } from './settings.js';
import { Player, MODE_CUBE, MODE_SHIP, MODE_WAVE } from './player.js';
import { Level, Camera, getLevelCount } from './level.js';
import { ParticleSystem } from './particles.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { loadProgress, updateLevelProgress } from './progress.js';
import * as Sound from './sound.js';

const MENU = 'menu';
const LEVEL_SELECT = 'level_select';
const PLAYING = 'playing';
const DEAD = 'dead';
const COMPLETE = 'complete';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.canvas.width = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    this.ctx = this.canvas.getContext('2d');

    this.player = new Player();
    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.renderer = new Renderer();
    this.ui = new UI();
    this.progress = loadProgress();

    this.state = MENU;
    this.level = null;
    this.theme = THEMES[1];
    this.practiceMode = false;
    this.attempts = 0;
    this.currentProgress = 0;
    this.lastCheckpoint = null;
    this.shakeIntensity = 0;
    this.deathTimer = 0;
    this.pendingOrbHit = null; // orb waiting for click activation

    this._bindEvents();
    this._startLoop();
  }

  _bindEvents() {
    const doPress = () => {
      Sound.resumeAudio();
      if (this.state === PLAYING) {
        this.player.pressJump();

        // Check if we're touching an orb (orbs need click while overlapping)
        if (this.pendingOrbHit) {
          Sound.playJump();
          this.player.orbBounce(this.pendingOrbHit.orbType);
          this.pendingOrbHit.obs.markActivated();
          this.particles.emitJump(this.player.x, this.player.y + PLAYER_SIZE / 2, this.theme.accent);
          this.pendingOrbHit = null;
          return;
        }

        // Normal jump (cube mode)
        if (this.player.mode === MODE_CUBE) {
          if (this.player.jump()) {
            Sound.playJump();
            this.particles.emitJump(
              this.player.x,
              this.player.y + PLAYER_SIZE,
              this.theme.accent
            );
          }
        }
      }
    };

    const doRelease = () => {
      if (this.state === PLAYING) {
        this.player.releaseJump();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (this.state === DEAD && this.deathTimer > 0.3) {
          this._restart();
          return;
        }
        doPress();
      }
      if (e.code === 'Escape') {
        if (this.state === PLAYING || this.state === DEAD || this.state === COMPLETE) {
          Sound.stopMusic();
          this.state = MENU;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        doRelease();
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      Sound.resumeAudio();
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);

      if (this.state === MENU || this.state === LEVEL_SELECT || this.state === DEAD || this.state === COMPLETE) {
        const action = this.ui.handleClick(x, y);
        if (action) {
          Sound.playSelect();
          this._handleAction(action);
          return;
        }
      }

      if (this.state === PLAYING) {
        doPress();
      }

      if (this.state === DEAD && this.deathTimer > 0.3) {
        this._restart();
      }
    });

    this.canvas.addEventListener('mouseup', () => doRelease());

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      Sound.resumeAudio();

      if (this.state === PLAYING) {
        doPress();
      } else if (this.state === DEAD && this.deathTimer > 0.3) {
        this._restart();
      } else {
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
        const y = (touch.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);
        const action = this.ui.handleClick(x, y);
        if (action) {
          Sound.playSelect();
          this._handleAction(action);
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      doRelease();
    }, { passive: false });
  }

  _handleAction(action) {
    if (action === 'play') {
      this.practiceMode = false;
      this.state = LEVEL_SELECT;
    } else if (action === 'practice') {
      this.practiceMode = true;
      this.state = LEVEL_SELECT;
    } else if (action.startsWith('level_')) {
      const id = parseInt(action.split('_')[1]);
      this._startLevel(id);
    } else if (action === 'retry') {
      this._restart();
    } else if (action === 'menu') {
      Sound.stopMusic();
      this.state = MENU;
    } else if (action === 'next_level') {
      const nextId = this.level.id + 1;
      if (nextId <= getLevelCount()) {
        this._startLevel(nextId);
      } else {
        Sound.stopMusic();
        this.state = MENU;
      }
    } else if (action === 'back') {
      this.state = MENU;
    }
  }

  _startLevel(levelId) {
    this.level = new Level(levelId);
    this.theme = THEMES[levelId];
    this.attempts = 0;
    this.lastCheckpoint = null;
    this._restart();
    Sound.playMusic(levelId);
  }

  _restart() {
    this.attempts++;
    this.particles.clear();
    this.shakeIntensity = 0;
    this.deathTimer = 0;
    this.pendingOrbHit = null;

    if (this.practiceMode && this.lastCheckpoint) {
      this.player.reset(this.lastCheckpoint.x);
      this.player.y = this.lastCheckpoint.y;
      this.player.gravityMult = this.lastCheckpoint.gravityMult;
      this.player.speedMult = this.lastCheckpoint.speedMult;
      this.player.mode = this.lastCheckpoint.mode || MODE_CUBE;
    } else {
      this.player.reset(0);
      this.level.reset();
      this.lastCheckpoint = null;
    }

    this.state = PLAYING;
  }

  _die() {
    this.player.alive = false;
    this.shakeIntensity = 10;
    Sound.playDeath();
    this.particles.emitDeath(
      this.player.x,
      this.player.y + PLAYER_SIZE / 2,
      this.theme.accent
    );

    const progress = this.level.getProgress(this.player.x);
    this.currentProgress = progress;
    this.progress = updateLevelProgress(this.progress, this.level.id, progress, false);

    if (this.practiceMode && this.lastCheckpoint) {
      setTimeout(() => {
        if (this.state === DEAD) this._restart();
      }, 800);
    }

    this.state = DEAD;
    this.deathTimer = 0;
  }

  _startLoop() {
    let lastTime = performance.now();

    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      this._update(dt);
      this._draw();
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  _update(dt) {
    this.ui.update(dt);

    if (this.state === DEAD) {
      this.deathTimer += dt;
      this.particles.update(dt);
      this.shakeIntensity *= 0.9;
      return;
    }

    if (this.state !== PLAYING) return;

    this.level.update();
    this.player.update();
    this.camera.update(this.player.x);

    // Hold-to-jump: emit effects when auto-jumping from hold
    if (this.player.holdJumped) {
      Sound.playJump();
      this.particles.emitJump(
        this.player.x,
        this.player.y + PLAYER_SIZE,
        this.theme.accent
      );
    }

    // Trail particles
    this.particles.emitTrail(
      this.player.x - 5,
      this.player.y + PLAYER_SIZE / 2,
      this.theme.accent
    );
    this.particles.update(dt);
    this.shakeIntensity *= 0.9;

    // Reset pending orb each frame
    this.pendingOrbHit = null;

    // Collision detection
    const playerRect = this.player.getRect();
    const visible = this.level.getVisible(this.camera.x);

    for (const obs of visible) {
      if (obs.type === 'spike') {
        if (obs.checkCollision(playerRect) === 'death') {
          this._die();
          return;
        }
      } else if (obs.type === 'platform' || obs.type === 'moving') {
        const result = obs.checkCollision(playerRect, this.player.prevY);
        if (result) {
          if (result.type === 'death') {
            this._die();
            return;
          } else if (result.type === 'land') {
            this.player.y = result.y - PLAYER_SIZE;
            this.player.vy = 0;
            this.player.grounded = true;
            this.player.onPlatform = true;
            this.player._snapRotation();
          }
        }
      } else if (obs.type === 'portal') {
        const result = obs.checkCollision(playerRect);
        if (result === 'portal_gravity') {
          this.player.flipGravity();
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, this.theme.portalGravity, 10);
        } else if (result === 'portal_speed_up') {
          this.player.speedMult = 1.4;
        } else if (result === 'portal_speed_down') {
          this.player.speedMult = 1.0;
        } else if (result === 'portal_ship') {
          this.player.setMode(MODE_SHIP);
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#FF00FF', 8);
        } else if (result === 'portal_wave') {
          this.player.setMode(MODE_WAVE);
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#00FFAA', 8);
        } else if (result === 'portal_cube') {
          this.player.setMode(MODE_CUBE);
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#00C8FF', 8);
        }
      } else if (obs.type === 'orb') {
        const orbType = obs.checkCollision(playerRect);
        if (orbType) {
          // Orb: player must be clicking to activate
          this.pendingOrbHit = { obs, orbType };
        }
      } else if (obs.type === 'pad') {
        const padType = obs.checkCollision(playerRect);
        if (padType) {
          Sound.playJump();
          this.player.orbBounce(padType);
          this.particles.emitJump(this.player.x, this.player.y + PLAYER_SIZE / 2, '#FFD700');
        }
      } else if (obs.type === 'checkpoint') {
        if (obs.checkCollision(playerRect) === 'checkpoint') {
          Sound.playCheckpoint();
          this.lastCheckpoint = {
            x: this.player.x,
            y: this.player.y,
            gravityMult: this.player.gravityMult,
            speedMult: this.player.speedMult,
            mode: this.player.mode,
          };
        }
      } else if (obs.type === 'end') {
        if (obs.checkCollision(playerRect) === 'complete') {
          this.state = COMPLETE;
          Sound.stopMusic();
          Sound.playComplete();
          this.progress = updateLevelProgress(this.progress, this.level.id, 1.0, true);
          return;
        }
      }
    }

    // Check platform fall-off
    if (this.player.onPlatform && this.player.grounded) {
      let stillOn = false;
      for (const obs of visible) {
        if (obs.type === 'platform' || obs.type === 'moving') {
          const below = {
            x: this.player.x + 4,
            y: this.player.y + PLAYER_SIZE,
            w: PLAYER_SIZE - 8,
            h: 4,
          };
          if (below.x < obs.x + obs.w && below.x + below.w > obs.x &&
              below.y < obs.y + obs.h && below.y + below.h > obs.y) {
            stillOn = true;
            break;
          }
        }
      }
      if (!stillOn) {
        this.player.onPlatform = false;
        this.player.grounded = false;
      }
    }

    // Player death check (wave hitting boundaries, etc.)
    if (!this.player.alive) {
      this._die();
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeIntensity > 0.5) {
      this.renderer.drawScreenShake(ctx, this.shakeIntensity);
    }

    if (this.state === MENU) {
      this.ui.drawMainMenu(ctx);
    } else if (this.state === LEVEL_SELECT) {
      this.ui.drawLevelSelect(ctx, this.progress);
    } else {
      this.renderer.drawBackground(ctx, this.camera.x, this.theme);

      const visible = this.level.getVisible(this.camera.x);
      for (const obs of visible) {
        obs.draw(ctx, this.camera.x, this.theme);
      }

      this.renderer.drawGround(ctx, this.camera.x, this.theme);
      this.particles.draw(ctx, this.camera.x - PLAYER_X_OFFSET);

      if (this.player.alive) {
        this.player.draw(ctx, this.camera.x, this.theme);
      }

      const progress = this.level ? this.level.getProgress(this.player.x) : 0;
      this.ui.drawHUD(ctx, progress, this.attempts, this.practiceMode, this.level.name);

      if (this.state === DEAD && this.deathTimer > 0.3) {
        this.ui.drawDeathScreen(ctx, this.currentProgress, this.attempts);
      } else if (this.state === COMPLETE) {
        this.ui.drawCompleteScreen(ctx, this.attempts, this.theme);
      }
    }

    ctx.restore();
  }
}

new Game();
