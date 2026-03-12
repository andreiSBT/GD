/** Main game - loop, state machine, collision, everything wired together */

import { SCREEN_WIDTH, SCREEN_HEIGHT, PLAYER_SIZE, PLAYER_X_OFFSET, GROUND_Y, GRID, THEMES, PLAYER_COLORS, PLAYER_TRAIL_COLORS, CUBE_ICONS, CUBE_SHAPES, setScreenWidth } from './settings.js';
import { Player, MODE_CUBE, MODE_SHIP, MODE_WAVE, MODE_BALL } from './player.js';
import { Level, Camera, getLevelCount, LEVEL_DATA, createLevelFromData } from './level.js';
import { Editor } from './editor.js';
import { ParticleSystem } from './particles.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { loadProgress, updateLevelProgress, incrementAttempt, initProgress } from './progress.js';
import * as Sound from './sound.js';
import { syncCustomizationToCloud, loadCustomizationFromCloud, isConfigured, initAuth, signIn, signUp, signOut, getAuthUser, getUsername } from './supabase.js';

const MENU = 'menu';
const LEVEL_SELECT = 'level_select';
const CUSTOMIZE = 'customize';
const PLAYING = 'playing';
const DEAD = 'dead';
const COMPLETE = 'complete';
const PAUSED = 'paused';
const STATS = 'stats';
const EDITOR = 'editor';
const EDITOR_TESTING = 'editor_testing';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');

    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
    window.visualViewport?.addEventListener?.('resize', () => this._resizeCanvas());
    screen.orientation?.addEventListener?.('change', () => this._resizeCanvas());

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
    this.previousBest = 0;
    this.newBestTimer = 0;
    this.newBestTriggered = false;
    this.lastCheckpoint = null;
    this.shakeIntensity = 0;
    this.deathTimer = 0;
    this.pendingOrbHit = null; // orb waiting for click activation

    // Editor
    this.editor = new Editor(this.canvas, this.ctx, this.renderer);
    this.editor.onTest = (levelData) => this._testEditorLevel(levelData);
    this.editor.onPlay = (levelData) => this._playEditorLevel(levelData);
    this.editor.onBack = () => { this.state = MENU; };
    this.editor.onLoadLevel = (id) => {
      const data = LEVEL_DATA[id];
      if (data) this.editor.loadExistingLevel(data);
    };
    this.editorLevelData = null;
    this.editorStartCheckpoint = null;

    // Load customization from localStorage (cloud sync after auth init)
    this.customization = this._loadCustomization();
    this._applyCustomization();

    this._bindEvents();
    this._setupAccountUI();
    initAuth().then(() => this._syncFromCloud());
    // Re-sync when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._syncFromCloud();
    });
    // Periodic sync every 30s
    setInterval(() => this._syncFromCloud(), 30000);
    this._startLoop();
  }

  _bindEvents() {
    const doPress = () => {
      Sound.resumeAudio();
      if (this.state === PLAYING || this.state === EDITOR_TESTING) {
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
      if (this.state === PLAYING || this.state === EDITOR_TESTING) {
        this.player.releaseJump();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;

      // Editor handles its own keys
      if (this.state === EDITOR) {
        if (this.editor.handleKeyDown(e)) return;
      }

      // When testing editor level, ESC goes to menu
      if (this.state === EDITOR_TESTING && e.code === 'Escape') {
        Sound.stopMusic();
        this.shakeIntensity = 0;
        this.editorLevelData = null;
        this.editorStartCheckpoint = null;
        this.state = MENU;
        return;
      }

      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (this.state === DEAD && this.deathTimer > 0.3) {
          this._restart();
          return;
        }
        doPress();
      }
      if (e.code === 'Escape') {
        if (this.state === STATS) {
          this.state = MENU;
        } else if (this.state === CUSTOMIZE) {
          this._saveCustomization();
          this.state = MENU;
        } else if (this.state === PAUSED) {
          this.state = this.editorLevelData ? EDITOR_TESTING : PLAYING;
          Sound.resumeMusic();
        } else if (this.state === PLAYING || this.state === EDITOR_TESTING) {
          this.shakeIntensity = 0;
          Sound.pauseMusic();
          this.state = PAUSED;
        } else if (this.state === DEAD || this.state === COMPLETE) {
          Sound.stopMusic();
          this.shakeIntensity = 0;
          this.editorLevelData = null;
          this.editorStartCheckpoint = null;
          this.state = MENU;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        doRelease();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._mouseDownState = null; // track which state the mousedown began in

    this.canvas.addEventListener('mousedown', (e) => {
      Sound.resumeAudio();
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);

      this._mouseDownState = this.state;

      if (this.state === EDITOR) {
        this.editor.handleMouseDown(x, y, e.button);
        return;
      }

      if (this.state === MENU || this.state === LEVEL_SELECT || this.state === CUSTOMIZE || this.state === STATS || this.state === PAUSED || this.state === COMPLETE) {
        const action = this.ui.handleClick(x, y);
        if (action) {
          Sound.playSelect();
          this._handleAction(action);
          return;
        }
      }

      if (this.state === PLAYING || this.state === EDITOR_TESTING) {
        // Check pause button first
        const action = this.ui.handleClick(x, y);
        if (action === 'pause') {
          this.shakeIntensity = 0;
          Sound.pauseMusic();
          this.state = PAUSED;
          return;
        }
        doPress();
      } else if (this.state === DEAD) {
        // Allow pause button anytime during death
        const action = this.ui.handleClick(x, y);
        if (action === 'pause') {
          if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
          this.shakeIntensity = 0;
          Sound.pauseMusic();
          this.state = PAUSED;
          return;
        }
        if (this.deathTimer > 0.3) this._restart();
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.state === EDITOR) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
        const y = (e.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);
        this.editor.handleMouseMove(x, y);
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (this.state === EDITOR && this._mouseDownState === EDITOR) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
        const y = (e.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);
        this.editor.handleMouseUp(x, y);
        return;
      }
      doRelease();
    });

    this._touchStartState = null; // track which state the touch began in

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      Sound.resumeAudio();

      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
      const y = (touch.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);

      this._touchStartState = this.state;

      if (this.state === EDITOR) {
        this.editor.handleTouchStart(x, y, e.touches.length);
        return;
      }

      // Check UI buttons first for all menu-like states
      if (this.state === MENU || this.state === LEVEL_SELECT || this.state === CUSTOMIZE ||
          this.state === STATS || this.state === PAUSED || this.state === COMPLETE) {
        const action = this.ui.handleClick(x, y);
        if (action) {
          Sound.playSelect();
          this._handleAction(action);
          return;
        }
      }

      if (this.state === PLAYING || this.state === EDITOR_TESTING) {
        // Check pause button first
        const action = this.ui.handleClick(x, y);
        if (action === 'pause') {
          this.shakeIntensity = 0;
          Sound.pauseMusic();
          this.state = PAUSED;
          return;
        }
        doPress();
      } else if (this.state === DEAD) {
        const action = this.ui.handleClick(x, y);
        if (action === 'pause') {
          if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
          this.shakeIntensity = 0;
          Sound.pauseMusic();
          this.state = PAUSED;
          return;
        }
        if (this.deathTimer > 0.3) this._restart();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.state === EDITOR) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
        const y = (touch.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);
        this.editor.handleTouchMove(x, y);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      // Only forward to editor if the touch STARTED in editor state
      // (prevents menu tap from triggering editor browse buttons)
      if (this.state === EDITOR && this._touchStartState === EDITOR) {
        this.editor.handleTouchEnd();
        return;
      }
      doRelease();
    }, { passive: false });

    this.canvas.addEventListener('wheel', (e) => {
      if (this.state === EDITOR) {
        e.preventDefault();
        this.editor.handleWheel(e);
      }
    }, { passive: false });

    // Pause game & music when phone screen is turned off or tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === PLAYING || this.state === EDITOR_TESTING || this.state === DEAD) {
          this.shakeIntensity = 0;
          this.state = PAUSED;
        }
        Sound.pauseMusic();
      }
    });
  }

  _handleAction(action) {
    if (action === 'levels') {
      this.state = LEVEL_SELECT;
    } else if (action.startsWith('normal_')) {
      const id = parseInt(action.split('_')[1]);
      this.practiceMode = false;
      this._startLevel(id);
    } else if (action.startsWith('practice_')) {
      const id = parseInt(action.split('_')[1]);
      this.practiceMode = true;
      this._startLevel(id);
    } else if (action === 'stats') {
      this.state = STATS;
    } else if (action === 'back_stats') {
      this.state = MENU;
    } else if (action === 'customize') {
      this.state = CUSTOMIZE;
    } else if (action === 'back_customize') {
      this._saveCustomization();
      this.state = MENU;
    } else if (action.startsWith('color_')) {
      this.customization.colorIndex = parseInt(action.split('_')[1]);
      this._applyCustomization();
    } else if (action.startsWith('trail_')) {
      this.customization.trailIndex = parseInt(action.split('_')[1]);
      this._applyCustomization();
    } else if (action.startsWith('icon_')) {
      this.customization.iconIndex = parseInt(action.split('_')[1]);
      this._applyCustomization();
    } else if (action.startsWith('shape_')) {
      this.customization.shapeIndex = parseInt(action.split('_')[1]);
      this._applyCustomization();
    } else if (action === 'pause') {
      this.shakeIntensity = 0;
      Sound.pauseMusic();
      this.state = PAUSED;
    } else if (action === 'resume') {
      if (!this.player.alive) {
        // Resume into DEAD state so explosion continues, then auto-retry
        this.state = DEAD;
        const delay = (this.practiceMode && this.lastCheckpoint) ? 800 : 1200;
        if (this._retryTimer) clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => {
          this._retryTimer = null;
          if (this.state === DEAD) this._restart();
        }, delay);
        Sound.resumeMusic();
      } else {
        this.state = this.editorLevelData ? EDITOR_TESTING : PLAYING;
        Sound.resumeMusic();
      }
    } else if (action === 'back_to_editor') {
      Sound.stopMusic();
      this.shakeIntensity = 0;
      this.editorLevelData = null;
      this.editorStartCheckpoint = null;
      this.state = EDITOR;
    } else if (action === 'retry' || action === 'restart') {
      Sound.stopDeath();
      Sound.stopMusic();
      this._restart();
      Sound.resumeAudio();
      Sound.playMusic(this.level.id);
    } else if (action === 'menu') {
      Sound.stopMusic();
      this.shakeIntensity = 0;
      this.editorLevelData = null;
      this.editorStartCheckpoint = null;
      this.state = MENU;
    } else if (action === 'next_level') {
      const nextId = this.level.id + 1;
      if (nextId <= getLevelCount()) {
        this._startLevel(nextId);
      } else {
        Sound.stopMusic();
        this.state = MENU;
      }
    } else if (action === 'editor') {
      this.state = EDITOR;
      this.editor.showBrowser();
    } else if (action === 'account') {
      this._showAccountOverlay();
    } else if (action === 'back') {
      this.state = MENU;
    }
  }

  _startLevel(levelId) {
    this.editorLevelData = null;
    this.editorStartCheckpoint = null;
    this.level = new Level(levelId);
    this.theme = THEMES[levelId];
    this.attempts = 0;
    this.lastCheckpoint = null;
    // Track previous best for "NEW BEST!" popup
    const lp = this.progress[levelId];
    this.previousBest = lp ? lp.bestProgress : 0;
    this.newBestTimer = 0;
    this._restart();
    Sound.playMusic(levelId);
  }

  _testEditorLevel(levelData) {
    this.editorLevelData = levelData;
    this.level = createLevelFromData(levelData);
    this.theme = this.editor.theme;
    this.practiceMode = true;
    this.attempts = 0;
    const startPixelX = (levelData.startX || 0) * GRID;
    // Set start pos as a persistent checkpoint so player always respawns here
    if (startPixelX > 0) {
      this.editorStartCheckpoint = {
        x: startPixelX,
        y: GROUND_Y - PLAYER_SIZE,
        gravityMult: 1,
        speedMult: 1,
        mode: MODE_CUBE,
      };
      this.lastCheckpoint = { ...this.editorStartCheckpoint };
    } else {
      this.editorStartCheckpoint = null;
      this.lastCheckpoint = null;
    }
    this.player.reset(startPixelX);
    this.level.resetFrom(startPixelX);
    this.state = EDITOR_TESTING;
    this.deathTimer = 0;
    this.shakeIntensity = 0;
    this.pendingOrbHit = null;
    Sound.playMusic(this.editor.themeId);
  }

  _playEditorLevel(levelData) {
    this.editorLevelData = levelData;
    this.level = createLevelFromData(levelData);
    this.theme = this.editor.theme;
    this.practiceMode = false;
    this.attempts = 0;
    this.previousBest = 0;
    this.newBestTimer = 0;
    this.newBestTriggered = false;
    this.editorStartCheckpoint = null;
    this.lastCheckpoint = null;
    this.player.reset(0);
    this.state = PLAYING;
    this.deathTimer = 0;
    this.shakeIntensity = 0;
    this.pendingOrbHit = null;
    Sound.playMusic(this.editor.themeId);
  }

  _restart() {
    Sound.stopDeath();
    // Ensure music is playing (may have been paused during death/pause)
    if (!Sound.isMusicPlaying() && this.level) {
      Sound.resumeAudio();
      Sound.playMusic(this.level.id);
    }
    this.attempts++;
    this.coinsCollected = 0;
    this.newBestTriggered = false;
    this.newBestTimer = 0;
    // Update previousBest so NEW BEST only shows when actually beating the record
    if (this.level && !this.editorLevelData) {
      const lp = this.progress[this.level.id];
      if (lp) this.previousBest = lp.bestProgress;
    }
    // Count every started attempt (including abandoned ones) in persistent stats
    if (this.level && !this.editorLevelData) {
      this.progress = incrementAttempt(this.progress, this.level.id);
    } else if (this.editorLevelData) {
      try {
        const cur = parseInt(localStorage.getItem('gd_editor_attempts') || '0');
        localStorage.setItem('gd_editor_attempts', String(cur + 1));
      } catch {}
    }
    this.particles.clear();
    this.shakeIntensity = 0;
    this.deathTimer = 0;
    this.pendingOrbHit = null;

    // Reset all transport platforms back to start position
    if (this.level) {
      for (const obs of this.level.obstacles) {
        if (obs.type === 'transport' && obs.reset) obs.reset();
      }
    }

    if (this.practiceMode && this.lastCheckpoint) {
      this.player.reset(this.lastCheckpoint.x);
      this.player.y = this.lastCheckpoint.y;
      this.player.gravityMult = this.lastCheckpoint.gravityMult;
      this.player.speedMult = this.lastCheckpoint.speedMult;
      this.player.mode = this.lastCheckpoint.mode || MODE_CUBE;
      this.player.mini = this.lastCheckpoint.mini || false;
      this.player.reversed = this.lastCheckpoint.reversed || false;
      this.level.resetFrom(this.lastCheckpoint.x);
      this.camera.reset(this.lastCheckpoint.x);
    } else if (this.editorStartCheckpoint) {
      // Editor start pos - always respawn here
      this.player.reset(this.editorStartCheckpoint.x);
      this.player.y = this.editorStartCheckpoint.y;
      this.level.resetFrom(this.editorStartCheckpoint.x);
      this.lastCheckpoint = { ...this.editorStartCheckpoint };
      this.camera.reset(this.editorStartCheckpoint.x);
    } else {
      this.player.reset(0);
      this.level.reset();
      this.lastCheckpoint = null;
      this.camera.reset(0);
    }

    this.state = this.editorLevelData ? EDITOR_TESTING : PLAYING;
  }

  _die() {
    if (this.state === DEAD) return;
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
    if (!this.practiceMode) {
      this.progress = updateLevelProgress(this.progress, this.level.id, progress, false);
    }

    // Auto-retry after a short delay
    if (this._retryTimer) clearTimeout(this._retryTimer);
    const delay = (this.practiceMode && this.lastCheckpoint) ? 800 : 1200;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (this.state === DEAD) this._restart();
    }, delay);

    this.state = DEAD;
    this.deathTimer = 0;
  }

  _startLoop() {
    let lastTime = performance.now();
    const FIXED_DT = 1 / 60; // physics at fixed 60Hz
    let accumulator = 0;

    const loop = (now) => {
      const frameDt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Fixed timestep: physics always steps at 60Hz
      accumulator += frameDt;
      while (accumulator >= FIXED_DT) {
        this._update(FIXED_DT);
        accumulator -= FIXED_DT;
      }

      // Interpolation alpha for smooth rendering between physics steps
      this._drawAlpha = accumulator / FIXED_DT;
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

    if (this.state === EDITOR) {
      this.editor.update(dt);
      return;
    }

    // Keep moving platforms animated during pause so timing isn't luck-based
    // Transport platforms freeze in place during pause
    if (this.state === PAUSED) {
      for (const obs of this.level.obstacles) {
        if (obs.type === 'moving' && obs.update) obs.update();
      }
      return;
    }

    if (this.state !== PLAYING && this.state !== EDITOR_TESTING) return;

    this.level.update();

    // Move player with platform BEFORE collision detection
    if (this.player.movingPlatformRef && this.player.grounded) {
      this.player.y += this.player.movingPlatformRef.deltaY;
      if (this.player.transportLocked) {
        this.player.x += this.player.movingPlatformRef.deltaX;
      }
    }

    // For active transport: keep player fully locked until arrived
    const prevTransportRef = (this.player.movingPlatformRef &&
      this.player.movingPlatformRef.type === 'transport' &&
      this.player.movingPlatformRef.active &&
      !this.player.movingPlatformRef.arrived) ? this.player.movingPlatformRef : null;

    // Reset moving platform flag before collision so it's fresh this frame
    this.player.onMovingPlatform = false;
    this.player.movingPlatformRef = null;
    this.player.transportLocked = false;
    this.pendingOrbHit = null;

    // If player was on active transport, force-keep them fully locked
    if (prevTransportRef) {
      this.player.onMovingPlatform = true;
      this.player.movingPlatformRef = prevTransportRef;
      this.player.transportLocked = true;
      this.player.y = prevTransportRef.y - PLAYER_SIZE;
      this.player.vy = 0;
      this.player.grounded = true;
      this.player.onPlatform = true;
    }

    // Collision detection (before player.update so moving platform flag is set in time)
    const playerRect = this.player.getRect();
    const visible = this.level.getVisible(this.camera.x);

    for (const obs of visible) {
      if (obs.type === 'spike') {
        if (obs.checkCollision(playerRect) === 'death') {
          this._die();
          return;
        }
      } else if (obs.type === 'platform' || obs.type === 'moving' || obs.type === 'transport') {
        const result = obs.checkCollision(playerRect, this.player.prevY, this.player.gravityMult);
        if (result) {
          if (result.type === 'death') {
            this._die();
            return;
          } else if (result.type === 'land') {
            // Inverted gravity: land on bottom of platform (player top at platBottom)
            this.player.y = this.player.gravityMult === -1 ? result.y : result.y - PLAYER_SIZE;
            this.player.vy = 0;
            this.player.grounded = true;
            this.player.onPlatform = true;
            if (obs.type === 'moving') {
              this.player.onMovingPlatform = true;
              this.player.movingPlatformRef = obs;
            } else if (obs.type === 'transport') {
              obs.active = true;
              this.player.onMovingPlatform = true;
              this.player.movingPlatformRef = obs;
              this.player.transportLocked = obs.isPlayerLocked();
            }
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
        } else if (result === 'portal_ball') {
          this.player.setMode(MODE_BALL);
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#FF8800', 8);
        } else if (result === 'portal_mini') {
          this.player.mini = true;
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#FF44FF', 8);
        } else if (result === 'portal_big') {
          this.player.mini = false;
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#44AAFF', 8);
        } else if (result === 'portal_reverse') {
          this.player.reversed = true;
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#00FFFF', 8);
        } else if (result === 'portal_forward') {
          this.player.reversed = false;
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#44FF44', 8);
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
      } else if (obs.type === 'coin') {
        if (obs.checkCollision(playerRect) === 'coin') {
          this.coinsCollected = (this.coinsCollected || 0) + 1;
          Sound.playCheckpoint(); // reuse checkpoint sound for now
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#FFD700', 15);
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
            mini: this.player.mini,
            reversed: this.player.reversed,
          };
        }
      } else if (obs.type === 'end') {
        if (obs.checkCollision(playerRect) === 'complete') {
          this.state = COMPLETE;
          Sound.stopMusic();
          Sound.playComplete();
          if (!this.practiceMode) {
            this.progress = updateLevelProgress(this.progress, this.level.id, 1.0, true);
          }
          return;
        }
      }
    }

    // Auto-activate orb if player is already holding click/touch
    if (this.pendingOrbHit && this.player.holding) {
      Sound.playJump();
      this.player.orbBounce(this.pendingOrbHit.orbType);
      this.pendingOrbHit.obs.markActivated();
      this.particles.emitJump(this.player.x, this.player.y + PLAYER_SIZE / 2, this.theme.accent);
      this.pendingOrbHit = null;
    }

    // Check platform fall-off
    if (this.player.onPlatform && this.player.grounded) {
      let stillOn = false;
      for (const obs of visible) {
        if (obs.type === 'platform' || obs.type === 'moving' || obs.type === 'transport') {
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

    // Now update player movement (after collision set onMovingPlatform)
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

    // Player death check (wave hitting boundaries, etc.)
    if (!this.player.alive && this.state !== DEAD) {
      this._die();
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeIntensity > 0.5) {
      this.renderer.drawScreenShake(ctx, this.shakeIntensity);
    }

    if (this.state === EDITOR) {
      this.editor.draw(ctx);
      ctx.restore();
      return;
    }

    if (this.state === MENU) {
      this.ui.drawMainMenu(ctx, this.progress);
    } else if (this.state === LEVEL_SELECT) {
      this.ui.drawLevelSelect(ctx, this.progress);
    } else if (this.state === CUSTOMIZE) {
      this.ui.drawCustomize(ctx, this.customization);
    } else if (this.state === STATS) {
      this.ui.drawStats(ctx, this.progress);
    } else {
      // Use interpolated camera for smooth rendering between physics steps
      // When paused or dead, don't interpolate — use final position to avoid jitter
      const isPaused = this.state === PAUSED || this.state === DEAD || this.state === COMPLETE;
      const alpha = isPaused ? 1 : (this._drawAlpha || 0);
      const camX = this.camera.getInterpolatedX(alpha);

      // Mirror the entire gameplay visually when mirrored flag is active
      const mirrored = this.player.reversed;
      if (mirrored) {
        ctx.save();
        ctx.translate(SCREEN_WIDTH, 0);
        ctx.scale(-1, 1);
      }

      this.renderer.drawBackground(ctx, camX, this.theme);

      const visible = this.level.getVisible(camX);
      for (const obs of visible) {
        obs.draw(ctx, camX, this.theme);
      }

      this.renderer.drawGround(ctx, camX, this.theme);
      this.particles.draw(ctx, camX - PLAYER_X_OFFSET);

      if (this.player.alive) {
        this.player.draw(ctx, camX, this.theme, alpha);
      }

      if (mirrored) {
        ctx.restore();
      }

      const progress = this.level ? this.level.getProgress(this.player.x) : 0;

      // Track new best silently during gameplay (only normal mode, only if there's a previous record to beat)
      if ((this.state === PLAYING || this.state === EDITOR_TESTING) && !this.practiceMode && !this.editorLevelData) {
        if (this.previousBest > 0 && this.previousBest < 1 && progress > this.previousBest) {
          this.newBestTriggered = true;
        }
      }

      // Show NEW BEST! only on death screen, never in practice mode
      const showNewBest = this.state === DEAD && this.newBestTriggered && !this.practiceMode;
      // Count total coins in level
      const totalCoins = this.level ? this.level.obstacles.filter(o => o.type === 'coin').length : 0;
      this.ui.drawHUD(ctx, progress, this.attempts, this.practiceMode, this.level.name, showNewBest, totalCoins > 0 ? { collected: this.coinsCollected || 0, total: totalCoins } : null);

      if (this.state === PAUSED) {
        this.ui.drawPauseScreen(ctx, !!this.editorLevelData);
      } else if (this.state === COMPLETE) {
        this.ui.drawCompleteScreen(ctx, this.attempts, this.theme);
      }
    }

    ctx.restore();
  }

  _resizeCanvas() {
    const vv = window.visualViewport;
    const windowW = vv ? vv.width : window.innerWidth;
    const windowH = vv ? vv.height : window.innerHeight;
    const windowRatio = windowW / windowH;
    const dpr = window.devicePixelRatio || 1;

    // Minimum aspect ratio (~4:3) - below this, show black bars instead of squishing
    const MIN_RATIO = 1.33;

    let logicalW, cssW, cssH;

    if (windowRatio >= MIN_RATIO) {
      logicalW = Math.round(SCREEN_HEIGHT * windowRatio);
      cssW = Math.floor(windowW);
      cssH = Math.floor(windowH);
    } else {
      logicalW = Math.round(SCREEN_HEIGHT * MIN_RATIO);
      cssW = Math.floor(windowW);
      cssH = Math.floor(windowW / MIN_RATIO);
    }

    setScreenWidth(logicalW);

    // Set canvas buffer size to logical * dpr for crisp rendering
    this.canvas.width = logicalW * dpr;
    this.canvas.height = SCREEN_HEIGHT * dpr;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    // Scale context so all drawing code uses logical coordinates
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  _setupAccountUI() {
    const overlay = document.getElementById('account-overlay');
    const loggedOut = document.getElementById('account-logged-out');
    const loggedIn = document.getElementById('account-logged-in');
    const displayName = document.getElementById('acc-display-name');
    const loginForm = document.getElementById('acc-login-form');
    const registerForm = document.getElementById('acc-register-form');
    const loginError = document.getElementById('acc-error');
    const regError = document.getElementById('acc-reg-error');

    if (!overlay) return;

    const showLogin = () => {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      loginError.textContent = '';
    };

    const showRegister = () => {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      regError.textContent = '';
    };

    const updateView = () => {
      const user = getAuthUser();
      if (user) {
        loggedOut.style.display = 'none';
        loggedIn.style.display = 'block';
        displayName.textContent = getUsername() || 'Player';
      } else {
        loggedOut.style.display = 'block';
        loggedIn.style.display = 'none';
        showLogin();
      }
    };

    document.getElementById('acc-show-register').addEventListener('click', showRegister);
    document.getElementById('acc-show-login').addEventListener('click', showLogin);

    document.getElementById('acc-login').addEventListener('click', async () => {
      loginError.textContent = '';
      const u = document.getElementById('acc-login-user').value.trim();
      const p = document.getElementById('acc-login-pass').value;
      if (!u || !p) { loginError.textContent = 'Enter username/email and password'; return; }
      loginError.textContent = 'Logging in...';
      loginError.style.color = '#AAA';
      const { error } = await signIn(u, p);
      loginError.style.color = '#FF4444';
      if (error) { loginError.textContent = error; return; }
      await this._syncFromCloud();
      updateView();
    });

    document.getElementById('acc-register').addEventListener('click', async () => {
      regError.textContent = '';
      const u = document.getElementById('acc-reg-username').value.trim();
      const p = document.getElementById('acc-reg-pass').value;
      const p2 = document.getElementById('acc-reg-pass2').value;
      if (!u || !p || !p2) { regError.textContent = 'Fill in all fields'; return; }
      if (u.length < 3) { regError.textContent = 'Username must be at least 3 characters'; return; }
      if (p.length < 6) { regError.textContent = 'Password must be at least 6 characters'; return; }
      if (p !== p2) { regError.textContent = 'Passwords do not match'; return; }
      regError.textContent = 'Creating account...';
      regError.style.color = '#AAA';
      const { error } = await signUp(u, p);
      regError.style.color = '#FF4444';
      if (error) { regError.textContent = error; return; }
      await this._syncFromCloud();
      updateView();
    });

    document.getElementById('acc-logout').addEventListener('click', async () => {
      await signOut();
      updateView();
    });

    document.getElementById('acc-close').addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    this._accountOverlay = overlay;
    this._updateAccountView = updateView;
  }

  _showAccountOverlay() {
    if (!this._accountOverlay) return;
    this._accountOverlay.style.display = 'flex';
    this._updateAccountView();
  }

  async _initCloudCustomization() {
    if (!isConfigured()) return;
    const cloud = await loadCustomizationFromCloud();
    if (cloud) {
      this.customization = cloud;
      localStorage.setItem('gd_customization', JSON.stringify(cloud));
      this._applyCustomization();
    }
  }

  async _syncFromCloud() {
    // Sync progress from cloud (merges with local, keeps best)
    console.log('[Sync] Loading progress from cloud...');
    this.progress = await initProgress();
    console.log('[Sync] Progress:', JSON.stringify(this.progress));
    // Sync customization from cloud
    console.log('[Sync] Loading customization from cloud...');
    await this._initCloudCustomization();
    console.log('[Sync] Customization:', JSON.stringify(this.customization));
  }

  _loadCustomization() {
    try {
      const data = localStorage.getItem('gd_customization');
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to load customization:', e);
    }
    return { colorIndex: 0, trailIndex: 0, iconIndex: 0, shapeIndex: 0 };
  }

  _saveCustomization() {
    try {
      localStorage.setItem('gd_customization', JSON.stringify(this.customization));
    } catch (e) {
      console.warn('Failed to save customization:', e);
    }
    syncCustomizationToCloud(this.customization);
  }

  _applyCustomization() {
    const { colorIndex, trailIndex, iconIndex, shapeIndex } = this.customization;
    this.player.customColor = PLAYER_COLORS[colorIndex] || null;
    this.player.customTrailColor = PLAYER_TRAIL_COLORS[trailIndex] || null;
    this.player.cubeIcon = CUBE_ICONS[iconIndex] || 'default';
    this.player.cubeShape = CUBE_SHAPES[shapeIndex || 0] || 'square';
  }
}

new Game();
