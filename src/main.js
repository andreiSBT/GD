/** Main game - loop, state machine, collision, everything wired together */

import { SCREEN_WIDTH, SCREEN_HEIGHT, PLAYER_SIZE, PLAYER_X_OFFSET, GROUND_Y, GRID, THEMES, PLAYER_COLORS, PLAYER_TRAIL_COLORS, PLAYER_TRAIL_STYLES, CUBE_ICONS, CUBE_SHAPES, setScreenWidth, IS_MOBILE, SCROLL_SPEED, FPS } from './settings.js';
import { Player, MODE_CUBE, MODE_SHIP, MODE_WAVE, MODE_BALL } from './player.js';
import { Level, Camera, getLevelCount, LEVEL_DATA, createLevelFromData } from './level.js';
import { Editor } from './editor.js';
import { ParticleSystem } from './particles.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { loadProgress, updateLevelProgress, incrementAttempt, initProgress } from './progress.js';
import * as Sound from './sound.js';
import { COLOR_TRIGGER_THEMES, COLOR_TRIGGER_FULL_THEMES } from './obstacles.js';
import { syncCustomizationToCloud, loadCustomizationFromCloud, isConfigured, initAuth, signIn, signUp, signOut, getAuthUser, getUsername, ensureProfile, searchUsers, sendFriendRequest, acceptFriendRequest, removeFriend, getFriends, getFriendRequests, sendMessage, deleteMessage, getMessages, getUnreadCount, getMyEditorLevels, getSharedLevel, checkAdmin, isAdmin, loadOfficialLevels, saveOfficialLevel, listLevelMusic, downloadLevelMusic, downloadOfficialMusic, submitScore, getLeaderboard, getPublishedLevels, publishLevel, incrementPlays, deletePublishedLevel, resetProgressInCloud } from './supabase.js';
import { evaluateAchievements, loadUnlocked, getAchievements } from './achievements.js';
import { ReplayRecorder, ReplayGhost, saveReplay, loadReplay } from './replay.js';
import { customConfirm } from './dialogs.js';

function _lerpColor(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

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
const FRIENDS = 'friends';
const COMMUNITY = 'community';
const LEADERBOARD = 'leaderboard';
const SECRETS = 'secrets';

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
    this.peakProgress = 0;
    this.previousBest = 0;
    this.newBestTimer = 0;
    this.newBestTriggered = false;
    this.lastCheckpoint = null;
    this.shakeIntensity = 0;
    this._portalFlash = null;
    this.deathTimer = 0;
    this.pendingOrbHit = null; // orb waiting for click activation
    this.coinsCollected = 0;
    // Color trigger transition state
    this._colorTransition = null; // { from, to, progress, duration }

    // Achievement toast queue
    this._achievementToasts = [];
    // Replay/ghost
    this._replayRecorder = null;
    this._replayGhost = null;
    this._replayFrame = 0;
    // Leaderboard
    this._levelStartTime = 0;
    this._leaderboardData = { entries: [], loading: false, levelId: null };
    // Community
    this.communityData = { levels: [], sort: 'newest', page: 0, loading: false };
    this.levelPage = 0; // level select pagination
    // Secret codes
    this.secretsData = { inputActive: false, inputText: '', message: null, messageTimer: 0 };
    this._redeemedCodes = this._loadRedeemedCodes();
    this._levelScrollCount = 0;
    this._showScrollCoin = false;

    // Editor
    this.editor = new Editor(this.canvas, this.ctx, this.renderer);
    this.editor.onTest = (levelData) => this._testEditorLevel(levelData);
    this.editor.onPlay = (levelData) => this._playEditorLevel(levelData);
    this.editor.onBack = () => { this.state = MENU; };
    this.editor.onLoadLevel = (id) => {
      const data = LEVEL_DATA[id];
      if (data) this.editor.loadExistingLevel(data, id);
    };
    this.editorLevelData = null;
    this.editorStartCheckpoint = null;

    // Friends system state
    this.friendsData = {
      tab: 'list',
      friends: [],
      requests: [],
      searchResults: null,
      searchQuery: '',
      messages: [],
      chatFriend: null,
      myLevels: [],
      shareTarget: null,
      notification: null,
      unreadCount: 0,
      inputActive: null, // 'search' or 'chat' when HTML input is visible
      sentRequests: new Set(), // user_ids that already got a friend request
    };
    this._friendsNotifTimer = null;

    // Load customization from localStorage (cloud sync after auth init)
    this.customization = this._loadCustomization();
    this._applyCustomization();

    this._bindEvents();
    this._setupAccountUI();
    // Load persisted custom music from IndexedDB
    Sound.loadCustomMusicFromDB().catch(() => {});
    initAuth().then(async () => {
      await this._syncFromCloud();
      await checkAdmin();
      if (isAdmin()) console.log('[Admin] User is admin');
      // Restore jump count for logged-in user
      const user = getAuthUser();
      if (user) {
        const saved = localStorage.getItem('gd_total_jumps_' + user.id);
        if (saved) localStorage.setItem('gd_total_jumps', saved);
      }
      // Load official levels from cloud (override hardcoded ones)
      const cloudLevels = await loadOfficialLevels();
      if (cloudLevels) {
        for (const [id, data] of Object.entries(cloudLevels)) {
          LEVEL_DATA[id] = data;
        }
        console.log('[Admin] Loaded official levels from cloud:', Object.keys(cloudLevels));
      }
      // Sync custom music from cloud storage
      this._syncCloudMusic();
    });
    // Re-sync when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._syncFromCloud();
    });
    // Periodic sync every 30s (only when tab is visible)
    setInterval(() => {
      if (!document.hidden) this._syncFromCloud();
    }, 30000);
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

      // Don't intercept keys when an HTML input is focused
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        if (e.code === 'Escape') { ae.blur(); return; }
        return;
      }

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
          if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
          Sound.pauseMusic();
          this.state = PAUSED;
        } else if (this.state === FRIENDS) {
          if (this.friendsData.tab === 'chat' || this.friendsData.tab === 'share_select') {
            this.friendsData.tab = 'list';
            this._hideFriendsInput();
            this._loadFriendsData();
          } else {
            this._hideFriendsInput();
            this.state = MENU;
          }
        } else if (this.state === SECRETS) {
          this._hideSecretsInput();
          this.state = MENU;
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
    this._draggingSlider = null; // 'volume_music' or 'volume_sfx' while dragging

    this.canvas.addEventListener('mousedown', (e) => {
      Sound.resumeAudio();
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);

      // Don't steal focus from active HTML inputs (secrets, friends, etc.)
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        // Only process button clicks, re-focus input after
        if (this.state === SECRETS) {
          const action = this.ui.handleClick(x, y);
          if (action && action !== 'secrets_input') {
            Sound.playSelect();
            this._handleAction(action);
          }
          requestAnimationFrame(() => ae.focus());
          return;
        }
      }

      this._mouseDownState = this.state;

      if (this.state === EDITOR) {
        this.editor.handleMouseDown(x, y, e.button);
        return;
      }

      if (this.state === MENU || this.state === LEVEL_SELECT || this.state === CUSTOMIZE || this.state === STATS || this.state === PAUSED || this.state === COMPLETE || this.state === FRIENDS || this.state === COMMUNITY || this.state === LEADERBOARD || this.state === SECRETS) {
        const action = this.ui.handleClick(x, y);
        if (action) {
          // Volume slider interaction
          if (action === 'volume_music' || action === 'volume_sfx') {
            this._draggingSlider = action;
            this._applySliderValue(action, x);
            return;
          }
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
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);
      if (this._draggingSlider) {
        this._applySliderValue(this._draggingSlider, x);
        return;
      }
      if (this.state === EDITOR) {
        this.editor.handleMouseMove(x, y);
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (this._draggingSlider) {
        this._draggingSlider = null;
        return;
      }
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

      // Don't steal focus from active HTML inputs
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        if (this.state === SECRETS) {
          const action = this.ui.handleClick(x, y);
          if (action && action !== 'secrets_input') {
            Sound.playSelect();
            this._handleAction(action);
          }
          requestAnimationFrame(() => ae.focus());
          return;
        }
      }

      this._touchStartState = this.state;

      if (this.state === EDITOR) {
        this.editor.handleTouchStart(x, y, e.touches.length);
        return;
      }

      // Start scroll tracking for scrollable screens
      const isScrollable = [FRIENDS, COMMUNITY, LEADERBOARD, STATS, SECRETS].includes(this.state);
      if (isScrollable) {
        this.ui.handleScrollTouchStart(y);
        this._scrollTouchX = x;
        this._scrollTouchY = y;
      }

      // Check UI buttons first for all menu-like states
      if (this.state === MENU || this.state === LEVEL_SELECT || this.state === CUSTOMIZE ||
          this.state === STATS || this.state === PAUSED || this.state === COMPLETE || this.state === FRIENDS ||
          this.state === COMMUNITY || this.state === LEADERBOARD || this.state === SECRETS) {
        // For scrollable screens, defer button clicks to touchend (to avoid triggering on swipe)
        if (isScrollable) return;
        const action = this.ui.handleClick(x, y);
        if (action) {
          // Volume slider interaction (touch)
          if (action === 'volume_music' || action === 'volume_sfx') {
            this._draggingSlider = action;
            this._applySliderValue(action, x);
            return;
          }
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
      if (this._draggingSlider) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = (touch.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
        this._applySliderValue(this._draggingSlider, x);
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) * (SCREEN_WIDTH / rect.width);
      const y = (touch.clientY - rect.top) * (SCREEN_HEIGHT / rect.height);
      if (this.state === EDITOR) {
        e.preventDefault();
        this.editor.handleTouchMove(x, y);
      } else if ([FRIENDS, COMMUNITY, LEADERBOARD, STATS].includes(this.state)) {
        e.preventDefault();
        this.ui.handleScrollTouchMove(y);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this._draggingSlider) {
        this._draggingSlider = null;
        return;
      }
      // Scrollable screens: process tap only if user didn't scroll
      if ([FRIENDS, COMMUNITY, LEADERBOARD, STATS].includes(this.state) && !this.ui.isScrollDragging) {
        const action = this.ui.handleClick(this._scrollTouchX, this._scrollTouchY);
        if (action) {
          Sound.playSelect();
          this._handleAction(action);
        }
        return;
      }
      if ([FRIENDS, COMMUNITY, LEADERBOARD, STATS].includes(this.state)) {
        return;
      }
      // Only forward to editor if the touch STARTED in editor state
      // (prevents menu tap from triggering editor browse buttons)
      if (this.state === EDITOR && this._touchStartState === EDITOR) {
        this.editor.handleTouchEnd();
        return;
      }
      doRelease();
    }, { passive: false });

    const SCROLLABLE_STATES = [FRIENDS, COMMUNITY, LEADERBOARD, STATS];
    this.canvas.addEventListener('wheel', (e) => {
      if (this.state === EDITOR) {
        e.preventDefault();
        this.editor.handleWheel(e);
      } else if (SCROLLABLE_STATES.includes(this.state)) {
        e.preventDefault();
        this.ui.handleWheel(e.deltaY);
      }
    }, { passive: false });

    // Pause game & music when phone screen is turned off or tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === PLAYING || this.state === EDITOR_TESTING || this.state === DEAD) {
          if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
          this.shakeIntensity = 0;
          this.state = PAUSED;
        }
        Sound.pauseMusic();
      }
    });
  }

  _applySliderValue(sliderId, clickX) {
    // Find the slider button region to compute ratio
    const btn = this.ui.buttons.find(b => b.id === sliderId);
    if (!btn) return;
    // The button region has padding; the actual bar is inset by pad on each side
    const pad = IS_MOBILE ? 18 : 14;
    const barX = btn.x + pad;
    const barW = btn.w - pad * 2;
    const ratio = Math.max(0, Math.min(1, (clickX - barX) / barW));
    if (sliderId === 'volume_music') {
      Sound.setMusicVolume(ratio);
    } else if (sliderId === 'volume_sfx') {
      Sound.setSFXVolume(ratio);
    }
  }

  _handleAction(action) {
    if (action === 'collect_scroll_coin') {
      this._showScrollCoin = false;
      const secretCoins = parseInt(localStorage.getItem('gd_secret_coins') || '0');
      localStorage.setItem('gd_secret_coins', String(secretCoins + 1));
      localStorage.setItem('gd_scroll_coin', '1');
      this._achievementToasts.push({ text: '\u{1F31F} Secret Coin found!', subtext: 'Hidden in the level list...', timer: 0, duration: 3 });
    } else if (action === 'levels') {
      this.state = LEVEL_SELECT;
      this.levelPage = 0;
    } else if (action === 'levels_prev') {
      if (this.levelPage > 0) { this.levelPage--; this._onLevelScroll(); }
    } else if (action === 'levels_next') {
      const maxPage = Math.ceil(getLevelCount() / 3) - 1;
      if (this.levelPage <= maxPage) { this.levelPage++; this._onLevelScroll(); }
    } else if (action === 'levels_wrap_start') {
      this.levelPage = 0; this._onLevelScroll();
    } else if (action === 'levels_wrap_end') {
      const maxPage = Math.ceil(getLevelCount() / 3) - 1;
      this.levelPage = maxPage + 1; this._onLevelScroll();
    } else if (action.startsWith('normal_')) {
      const id = parseInt(action.split('_')[1]);
      this.practiceMode = false;
      this._startLevel(id);
    } else if (action.startsWith('practice_')) {
      const id = parseInt(action.split('_')[1]);
      this.practiceMode = true;
      this._startLevel(id);
    } else if (action === 'stats') {
      this.ui.resetScroll();
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
    } else if (action.startsWith('trailstyle_')) {
      this.customization.trailStyleIndex = parseInt(action.split('_')[1]);
      this._applyCustomization();
      this._saveCustomization();
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
        // Music stays paused until _restart
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
    } else if (action === 'switch_practice') {
      // Switch to practice mode, keep last checkpoint if one was passed
      this.practiceMode = true;
      // lastCheckpoint stays as-is (set by checkpoint obstacles), or null if none passed
      this.state = this.editorLevelData ? EDITOR_TESTING : PLAYING;
      Sound.resumeMusic();
    } else if (action === 'switch_normal') {
      // Switch to normal mode, restart from beginning
      this.practiceMode = false;
      this.lastCheckpoint = null;
      Sound.stopDeath();
      this._restart();
    } else if (action === 'retry' || action === 'restart') {
      Sound.stopDeath();
      this._restart();
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
      this.editor.showBrowser(true);
    } else if (action === 'account') {
      this._showAccountOverlay();
    } else if (action === 'friends') {
      if (!getAuthUser()) {
        this._showAccountOverlay();
        return;
      }
      this.ui.resetScroll();
      this.state = FRIENDS;
      this.friendsData.tab = 'list';
      this._loadFriendsData();
    } else if (action === 'community') {
      this.ui.resetScroll();
      this.state = COMMUNITY;
      this.communityData.loading = true;
      this.communityData.levels = [];
      getPublishedLevels('newest', 0).then(levels => {
        this.communityData.levels = levels;
        this.communityData.loading = false;
      });
    } else if (action === 'back_secrets') {
      this._hideSecretsInput();
      this.state = MENU;
    } else if (action === 'secrets_input') {
      this._showSecretsInput();
    } else if (action === 'secrets_submit') {
      this._submitSecretCode();
    } else if (action === 'back_community') {
      this.state = MENU;
    } else if (action.startsWith('community_sort_')) {
      const sort = action.replace('community_sort_', '');
      this.communityData.sort = sort;
      this.ui.resetScroll();
      this.communityData.loading = true;
      getPublishedLevels(sort, 0).then(levels => {
        this.communityData.levels = levels;
        this.communityData.loading = false;
      });
    } else if (action.startsWith('community_play_')) {
      const idx = parseInt(action.replace('community_play_', ''));
      const level = this.communityData.levels[idx];
      if (level) {
        incrementPlays(level.id);
        this.editorLevelData = { name: level.name, themeId: level.themeId, objects: level.objects };
        this.level = createLevelFromData(this.editorLevelData);
        this.theme = THEMES[level.themeId] || THEMES[1];
        this._baseTheme = this.theme;
        this._colorTransition = null;
        this.practiceMode = false;
        this.attempts = 0;
        this.lastCheckpoint = null;
        this.editorStartCheckpoint = null;
        this._levelStartTime = performance.now();
        this._restart();
      }
    } else if (action.startsWith('community_delete_')) {
      const idx = parseInt(action.replace('community_delete_', ''));
      const level = this.communityData.levels[idx];
      if (level) {
        this.communityData.confirmDelete = { idx, id: level.id, name: level.name };
      }
    } else if (action === 'community_confirm_yes') {
      const cd = this.communityData.confirmDelete;
      if (cd) {
        deletePublishedLevel(cd.id).then(res => {
          if (!res.error) {
            this.communityData.levels.splice(cd.idx, 1);
          }
        });
        this.communityData.confirmDelete = null;
      }
    } else if (action === 'community_confirm_no') {
      this.communityData.confirmDelete = null;
    } else if (action === 'leaderboard') {
      if (this.level) {
        this._leaderboardData = { entries: [], loading: true, levelId: this.level.id };
        getLeaderboard(this.level.id).then(entries => {
          this._leaderboardData.entries = entries;
          this._leaderboardData.loading = false;
        });
        this.ui.resetScroll();
        this.state = LEADERBOARD;
      }
    } else if (action === 'back_leaderboard') {
      this.state = COMPLETE;
    } else if (action === 'back') {
      this.state = MENU;
    } else if (action.startsWith('friends_')) {
      this._handleFriendsAction(action);
    }
  }

  _handleFriendsAction(action) {
    const fd = this.friendsData;

    if (action === 'friends_tab_list') {
      fd.tab = 'list';
      this.ui.resetScroll();
      this._hideFriendsInput();
      this._loadFriendsData();
    } else if (action === 'friends_tab_requests') {
      fd.tab = 'requests';
      this.ui.resetScroll();
      this._hideFriendsInput();
      this._loadFriendsData();
    } else if (action === 'friends_tab_search') {
      fd.tab = 'search';
      this.ui.resetScroll();
      fd.searchResults = null;
      this._showFriendsInput('search');
    } else if (action === 'friends_focus_search') {
      this._showFriendsInput('search');
    } else if (action === 'friends_focus_chat') {
      this._showFriendsInput('chat');
    } else if (action === 'friends_do_search') {
      if (fd.searchQuery.trim()) {
        searchUsers(fd.searchQuery.trim()).then(r => { fd.searchResults = r; });
      }
    } else if (action.startsWith('friends_add_')) {
      const idx = parseInt(action.split('_')[2]);
      const user = fd.searchResults?.[idx];
      if (user && !fd.sentRequests.has(user.user_id)) {
        fd.sentRequests.add(user.user_id);
        sendFriendRequest(user.user_id).then(res => {
          if (res.error && res.error !== 'Already friends' && res.error !== 'Request already sent') {
            fd.sentRequests.delete(user.user_id);
            this._showFriendsNotif(res.error, 'error');
          }
        });
      }
    } else if (action.startsWith('friends_accept_')) {
      const idx = parseInt(action.split('_')[2]);
      const req = fd.requests[idx];
      if (req) {
        acceptFriendRequest(req.id).then(() => {
          this._showFriendsNotif('Friend added!', 'success');
          this._loadFriendsData();
        });
      }
    } else if (action.startsWith('friends_decline_')) {
      const idx = parseInt(action.split('_')[2]);
      const req = fd.requests[idx];
      if (req) {
        removeFriend(req.id).then(() => {
          this._showFriendsNotif('Request declined.', 'success');
          this._loadFriendsData();
        });
      }
    } else if (action.startsWith('friends_remove_')) {
      const idx = parseInt(action.split('_')[2]);
      const friend = fd.friends[idx];
      if (friend) {
        removeFriend(friend.id).then(() => {
          this._showFriendsNotif('Friend removed.', 'success');
          this._loadFriendsData();
        });
      }
    } else if (action.startsWith('friends_chat_')) {
      const idx = parseInt(action.split('_')[2]);
      const friend = fd.friends[idx];
      if (friend) {
        fd.chatFriend = { ...friend, _inputText: '' };
        fd.tab = 'chat';
        fd.messages = [];
        getMessages(friend.friendId).then(m => { fd.messages = m; });
        this._showFriendsInput('chat');
      }
    } else if (action === 'friends_send_msg') {
      if (fd.chatFriend && fd.chatFriend._inputText?.trim()) {
        const text = fd.chatFriend._inputText.trim();
        fd.chatFriend._inputText = '';
        this._hideFriendsInput();
        const friendId = fd.chatFriend.friendId;
        sendMessage(friendId, text).then(() => {
          if (fd.chatFriend && fd.chatFriend.friendId === friendId) {
            getMessages(friendId).then(m => { fd.messages = m; });
          }
        });
        this._showFriendsInput('chat');
      }
    } else if (action === 'friends_share_level') {
      if (fd.chatFriend) {
        fd.shareTarget = fd.chatFriend;
        fd.tab = 'share_select';
        this._hideFriendsInput();
      }
    } else if (action.startsWith('friends_send_level_')) {
      // Find the button to get the slotId
      const btnId = action;
      const btn = this.ui.buttons.find(b => b.id === btnId);
      const slotId = btn?.slotId;
      if (slotId && fd.shareTarget) {
        // Read full level data from localStorage and embed in message
        try {
          const raw = localStorage.getItem('gd_editor_slot_' + slotId);
          if (raw) {
            const levelData = JSON.parse(raw);
            const name = levelData.name || 'Untitled';
            sendMessage(fd.shareTarget.friendId, name, 'level', {
              name: levelData.name,
              themeId: levelData.themeId,
              objects: levelData.objects,
            }).then(() => {
              this._showFriendsNotif('Level shared!', 'success');
              fd.tab = 'chat';
              getMessages(fd.chatFriend.friendId).then(m => { fd.messages = m; });
              this._showFriendsInput('chat');
            });
          }
        } catch {}
      }
    } else if (action.startsWith('friends_play_level_')) {
      const idx = parseInt(action.split('_')[3]);
      const msg = fd.messages[idx];
      console.log('[Friends] PLAY action:', action, 'idx:', idx, 'msg type:', msg?.type, 'has levelData:', !!msg?.levelData, 'messages count:', fd.messages.length);
      if (msg && msg.type === 'level' && msg.levelData) {
        const ld = msg.levelData;
        console.log('[Friends] PLAY level data keys:', Object.keys(ld), 'objects count:', ld.objects?.length);
        // Level data is embedded directly in the message
        if (ld.objects && ld.objects.length > 0) {
          try {
            const lvl = createLevelFromData({
              name: ld.name || msg.content,
              themeId: ld.themeId || 1,
              objects: ld.objects,
            });
            if (lvl) {
              this._hideFriendsInput();
              this.editorLevelData = { name: ld.name || msg.content, themeId: ld.themeId || 1, objects: ld.objects };
              this.level = lvl;
              this.theme = THEMES[ld.themeId] || THEMES[1];
              this.practiceMode = false;
              this.attempts = 0;
              this.player.reset(0);
              this.camera.reset();
              this.particles.clear();
              this.state = PLAYING;
              Sound.playMusic(1);
            } else {
              this._showFriendsNotif('Failed to load level.', 'error');
            }
          } catch (err) {
            console.error('[Friends] Error loading shared level:', err);
            this._showFriendsNotif('Error loading level: ' + err.message, 'error');
          }
        } else {
          // Old format without embedded data
          this._showFriendsNotif('Old format. Re-share level.', 'error');
        }
      } else {
        console.warn('[Friends] PLAY: msg not found or missing data. msg:', JSON.stringify(msg)?.slice(0, 300));
        this._showFriendsNotif('No level data in this message.', 'error');
      }
    } else if (action.startsWith('friends_edit_level_')) {
      const idx = parseInt(action.split('_')[3]);
      const msg = fd.messages[idx];
      if (msg && msg.type === 'level' && msg.levelData) {
        const ld = msg.levelData;
        if (ld.objects && ld.objects.length > 0) {
          this._hideFriendsInput();
          this.editor.loadExistingLevel({
            name: ld.name || msg.content,
            themeId: ld.themeId || 1,
            objects: ld.objects,
          });
          this.state = EDITOR;
        } else {
          this._showFriendsNotif('Old format. Re-share level.', 'error');
        }
      } else {
        this._showFriendsNotif('No level data in this message.', 'error');
      }
    } else if (action === 'friends_back') {
      this._hideFriendsInput();
      this.state = MENU;
    } else if (action.startsWith('friends_del_msg_')) {
      const idx = parseInt(action.split('_')[3]);
      const msg = fd.messages[idx];
      if (msg && msg.mine && msg.id) {
        deleteMessage(msg.id).then(res => {
          if (!res.error) {
            fd.messages.splice(idx, 1);
          } else {
            this._showFriendsNotif('Failed to delete.', 'error');
          }
        });
      }
    } else if (action === 'friends_back_to_list') {
      fd.tab = 'list';
      this._hideFriendsInput();
      this._loadFriendsData();
    }
  }

  async _loadFriendsData() {
    await ensureProfile();
    const [friends, requests] = await Promise.all([getFriends(), getFriendRequests()]);
    this.friendsData.friends = friends;
    this.friendsData.requests = requests;
  }

  _showFriendsNotif(text, type = 'success') {
    this.friendsData.notification = { text, type };
    if (this._friendsNotifTimer) clearTimeout(this._friendsNotifTimer);
    this._friendsNotifTimer = setTimeout(() => {
      this.friendsData.notification = null;
      this._friendsNotifTimer = null;
    }, 3000);
  }

  _showFriendsInput(mode) {
    let input = document.getElementById('friends-input');
    if (!input) {
      input = document.createElement('input');
      input.id = 'friends-input';
      input.type = 'text';
      input.autocomplete = 'off';
      input.style.display = 'none';
      document.body.appendChild(input);
    }

    // Position input over the canvas element based on mode
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / SCREEN_WIDTH;
    const scaleY = rect.height / SCREEN_HEIGHT;

    if (mode === 'search') {
      // Match the search box position from drawFriendSearch: contentY=145, boxW=400, centered
      const boxW = 400, boxH = 42;
      const boxX = (SCREEN_WIDTH - boxW) / 2;
      const boxY = 145; // contentY
      const screenLeft = rect.left + boxX * scaleX;
      const screenTop = rect.top + boxY * scaleY;
      const screenW = boxW * scaleX;
      const screenH = boxH * scaleY;
      input.style.cssText = `position:fixed;left:${screenLeft}px;top:${screenTop}px;width:${screenW}px;height:${screenH}px;padding:0 30px;background:rgba(0,10,30,0.95);color:#fff;border:1px solid rgba(0,200,255,0.4);border-radius:10px;font:${Math.round(15 * scaleY)}px monospace;outline:none;z-index:100;box-sizing:border-box;`;
    } else {
      // Chat input: match the input box from drawFriendChat
      const inputW = 390;
      const inputX = (SCREEN_WIDTH - inputW) / 2 - 60;
      const inputY = SCREEN_HEIGHT - 65;
      const screenLeft = rect.left + inputX * scaleX;
      const screenTop = rect.top + inputY * scaleY;
      const screenW = inputW * scaleX;
      const screenH = 40 * scaleY;
      input.style.cssText = `position:fixed;left:${screenLeft}px;top:${screenTop}px;width:${screenW}px;height:${screenH}px;padding:0 14px;background:rgba(0,10,30,0.95);color:#fff;border:1px solid rgba(0,170,255,0.35);border-radius:10px;font:${Math.round(14 * scaleY)}px monospace;outline:none;z-index:100;box-sizing:border-box;`;
    }

    input.value = mode === 'search' ? (this.friendsData.searchQuery || '') : '';
    input.placeholder = mode === 'search' ? 'Search username...' : 'Type a message...';
    input.style.display = 'block';
    this.friendsData.inputActive = mode;
    input.focus();

    // Remove old listeners
    input._onInput = () => {
      if (mode === 'search') {
        this.friendsData.searchQuery = input.value;
      } else if (mode === 'chat' && this.friendsData.chatFriend) {
        this.friendsData.chatFriend._inputText = input.value;
      }
    };
    input._onKeydown = (e) => {
      if (e.key === 'Enter') {
        if (mode === 'search') {
          this._handleFriendsAction('friends_do_search');
        } else if (mode === 'chat') {
          this._handleFriendsAction('friends_send_msg');
          input.value = '';
        }
      }
    };
    input.removeEventListener('input', input._prevOnInput);
    input.removeEventListener('keydown', input._prevOnKeydown);
    input.addEventListener('input', input._onInput);
    input.addEventListener('keydown', input._onKeydown);
    input._prevOnInput = input._onInput;
    input._prevOnKeydown = input._onKeydown;
  }

  _hideFriendsInput() {
    this.friendsData.inputActive = null;
    const input = document.getElementById('friends-input');
    if (input) {
      input.style.display = 'none';
      input.blur();
    }
  }

  // --- Secret codes ---
  _loadRedeemedCodes() {
    try {
      const raw = localStorage.getItem('gd_redeemed_codes');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  }

  _saveRedeemedCodes() {
    try { localStorage.setItem('gd_redeemed_codes', JSON.stringify([...this._redeemedCodes])); } catch {}
  }

  _showSecretsInput() {
    let input = document.getElementById('secrets-input');
    if (!input) {
      input = document.createElement('input');
      input.id = 'secrets-input';
      input.type = 'text';
      input.autocomplete = 'off';
      document.body.appendChild(input);
    }
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / SCREEN_WIDTH;
    const scaleY = rect.height / SCREEN_HEIGHT;
    const inputW = 360;
    const inputX = (SCREEN_WIDTH - inputW) / 2;
    const inputY = 190;
    const screenLeft = rect.left + inputX * scaleX;
    const screenTop = rect.top + inputY * scaleY;
    const screenW = inputW * scaleX;
    const screenH = 44 * scaleY;
    input.style.cssText = `position:fixed;left:${screenLeft}px;top:${screenTop}px;width:${screenW}px;height:${screenH}px;padding:0;background:transparent;color:transparent;border:none;font:${Math.round(16 * scaleY)}px monospace;outline:none;z-index:100;box-sizing:border-box;text-align:center;caret-color:transparent;`;
    input.value = this.secretsData.inputText || '';
    input.placeholder = 'Enter secret code...';
    input.style.display = 'block';
    this.secretsData.inputActive = true;
    requestAnimationFrame(() => input.focus());

    input._onInput = () => { this.secretsData.inputText = input.value; };
    input._onKeydown = (e) => { if (e.key === 'Enter') this._submitSecretCode(); };
    input.removeEventListener('input', input._prevOnInput);
    input.removeEventListener('keydown', input._prevOnKeydown);
    input.addEventListener('input', input._onInput);
    input.addEventListener('keydown', input._onKeydown);
    input._prevOnInput = input._onInput;
    input._prevOnKeydown = input._onKeydown;
  }

  _hideSecretsInput() {
    this.secretsData.inputActive = false;
    this.secretsData.inputText = '';
    const input = document.getElementById('secrets-input');
    if (input) { input.style.display = 'none'; input.blur(); }
  }

  _submitSecretCode() {
    const code = (this.secretsData.inputText || '').trim().toUpperCase();
    if (!code) return;

    if (this._redeemedCodes.has(code)) {
      this.secretsData.message = { text: 'Code already redeemed!', color: '#FF6644' };
      this.secretsData.messageTimer = 3;
      return;
    }

    // Define secret codes and their rewards
    const SECRET_CODES = {
      'COINS?!': { reward: 'coin', desc: '+1 Secret Coin unlocked!' },
      'GD GO!': { reward: 'rainbow', desc: 'Rainbow color unlocked!' },
      '...': { reward: 'dotted_trail', desc: 'Dotted trail unlocked!' },
      ';)': { reward: 'wink_icon', desc: 'Wink face unlocked!' },
    };

    const entry = SECRET_CODES[code];
    if (!entry) {
      this.secretsData.message = { text: 'Invalid code', color: '#FF6644' };
      this.secretsData.messageTimer = 3;
      return;
    }

    if (entry.condition && !entry.condition()) {
      this.secretsData.message = { text: entry.failMsg, color: '#FF6644' };
      this.secretsData.messageTimer = 3;
      return;
    }

    // Apply reward
    if (entry.reward === 'coin') {
      const secretCoins = parseInt(localStorage.getItem('gd_secret_coins') || '0');
      localStorage.setItem('gd_secret_coins', String(secretCoins + 1));
    } else if (entry.reward === 'rainbow') {
      localStorage.setItem('gd_rainbow_color', '1');
    } else if (entry.reward === 'dotted_trail') {
      localStorage.setItem('gd_dotted_trail', '1');
    } else if (entry.reward === 'wink_icon') {
      localStorage.setItem('gd_wink_icon', '1');
    }

    this._redeemedCodes.add(code);
    this._saveRedeemedCodes();
    this.secretsData.message = { text: entry.desc, color: '#00FF64' };
    this.secretsData.messageTimer = 3;
    this.secretsData.inputText = '';
    const input = document.getElementById('secrets-input');
    if (input) input.value = '';
  }

  _onLevelScroll() {
    if (localStorage.getItem('gd_scroll_coin')) return;
    this._levelScrollCount++;
    if (this._levelScrollCount >= 19) {
      this._showScrollCoin = true;
    }
  }

  // Find the nearest solid surface below a given position (platform top or ground)
  _findGroundY(pixelX, pixelY) {
    let bestY = GROUND_Y - PLAYER_SIZE; // default: ground level
    if (!this.level) return bestY;

    for (const obs of this.level.obstacles) {
      if (obs.type !== 'platform') continue;
      // Platform must overlap horizontally with the player
      if (pixelX + PLAYER_SIZE <= obs.x || pixelX >= obs.x + obs.w) continue;
      // Platform top must be at or below the spawn point
      const platTop = obs.y;
      if (platTop < pixelY) continue;
      // Pick the closest one below
      const landY = platTop - PLAYER_SIZE;
      if (landY < bestY) bestY = landY;
    }
    return bestY;
  }

  async _startLevel(levelId) {
    this.editorLevelData = null;
    this.editorStartCheckpoint = null;
    this.level = new Level(levelId);
    this.theme = THEMES[levelId] || THEMES[1];
    this._baseTheme = this.theme;
    this._colorTransition = null;
    this.attempts = 0;
    this.lastCheckpoint = null;
    // Track previous best for "NEW BEST!" popup
    const lp = this.progress[levelId];
    this.previousBest = lp ? lp.bestProgress : 0;
    this.newBestTimer = 0;
    this._replayGhost = loadReplay(levelId);
    this._levelStartTime = performance.now();
    // Ensure official music is downloaded before first play
    if (!Sound.hasCustomMusic(levelId)) {
      try {
        const ab = await downloadOfficialMusic(levelId);
        if (ab) {
          const blob = new Blob([ab], { type: 'audio/mpeg' });
          const file = new File([blob], 'music.mp3', { type: 'audio/mpeg' });
          await Sound.loadCustomMusic(levelId, file);
        }
      } catch {}
    }
    this._restart();
  }

  _testEditorLevel(levelData) {
    this.editorLevelData = levelData;
    this.level = createLevelFromData(levelData);
    this.theme = this.editor.theme;
    this._baseTheme = this.theme;
    this._colorTransition = null;
    this.practiceMode = true;
    this.attempts = 1;
    const startPixelX = (levelData.startX || 0) * GRID;
    const rawStartY = levelData.startY != null ? GROUND_Y - (levelData.startY + 1) * GRID : GROUND_Y - PLAYER_SIZE;
    const startPixelY = this._findGroundY(startPixelX, rawStartY);
    const musicOffset = startPixelX / (SCROLL_SPEED * FPS);
    // Set start pos as a persistent checkpoint so player always respawns here
    if (levelData.startX != null || levelData.startY != null) {
      this.editorStartCheckpoint = {
        x: startPixelX,
        y: startPixelY,
        gravityMult: 1,
        speedMult: 1,
        mode: MODE_CUBE,
        musicTime: musicOffset,
      };
      this.lastCheckpoint = { ...this.editorStartCheckpoint };
    } else {
      this.editorStartCheckpoint = null;
      this.lastCheckpoint = null;
    }
    this.player.reset(startPixelX, startPixelY);
    this.level.resetFrom(startPixelX);
    this.state = EDITOR_TESTING;
    this.deathTimer = 0;
    this.shakeIntensity = 0;
    this.pendingOrbHit = null;
    this._playEditorMusic(musicOffset);
  }

  _playEditorLevel(levelData) {
    this.editorLevelData = levelData;
    this.level = createLevelFromData(levelData);
    this.theme = this.editor.theme;
    this._baseTheme = this.theme;
    this._colorTransition = null;
    this.practiceMode = false;
    this.attempts = 1;
    this.previousBest = 0;
    this.newBestTimer = 0;
    this.newBestTriggered = false;
    // Use start pos if set (same as test mode)
    const startPixelX = (levelData.startX || 0) * GRID;
    const rawStartY = levelData.startY != null ? GROUND_Y - (levelData.startY + 1) * GRID : GROUND_Y - PLAYER_SIZE;
    const startPixelY = this._findGroundY(startPixelX, rawStartY);
    const musicOffset = startPixelX / (SCROLL_SPEED * FPS);
    if (levelData.startX != null || levelData.startY != null) {
      this.editorStartCheckpoint = {
        x: startPixelX,
        y: startPixelY,
        gravityMult: 1,
        speedMult: 1,
        mode: MODE_CUBE,
        musicTime: musicOffset,
      };
      this.lastCheckpoint = { ...this.editorStartCheckpoint };
    } else {
      this.editorStartCheckpoint = null;
      this.lastCheckpoint = null;
    }
    this.player.reset(startPixelX, startPixelY);
    this.level.resetFrom(startPixelX);
    this.state = PLAYING;
    this.deathTimer = 0;
    this.shakeIntensity = 0;
    this.pendingOrbHit = null;
    this._playEditorMusic(musicOffset);
  }

  _applySliderValue(sliderId, screenX) {
    // Find the slider button to get its bar bounds
    const btn = this.ui.buttons.find(b => b.id === sliderId);
    if (!btn) return;
    const pad = 14; // matches UI padding
    const barX = btn.x + pad;
    const barW = btn.w - pad * 2;
    const ratio = Math.max(0, Math.min(1, (screenX - barX) / barW));
    if (sliderId === 'volume_music') Sound.setMusicVolume(ratio);
    else if (sliderId === 'volume_sfx') Sound.setSFXVolume(ratio);
  }

  async _playEditorMusic(offset = 0) {
    await Sound.resumeAudio();
    const musicKey = this.editor._getMusicKey();
    if (musicKey && Sound.hasCustomMusic(musicKey)) {
      await Sound.playMusic(musicKey, offset);
    } else {
      await Sound.playMusic(this.editor.themeId, offset);
    }
  }

  async _restart() {
    Sound.stopDeath();
    Sound.stopMusic();
    this.attempts++;
    this.coinsCollected = 0;
    this.newBestTriggered = false;
    this.newBestTimer = 0;
    this.peakProgress = 0;
    // Update previousBest so NEW BEST only shows when actually beating the record
    if (this.level && !this.editorLevelData) {
      const lp = this.progress[this.level.id];
      if (lp) this.previousBest = lp.bestProgress;
    }
    // Count every started attempt (including abandoned ones) in persistent stats
    if (this.level && !this.editorLevelData) {
      this.progress = incrementAttempt(this.progress, this.level.id);
      this._checkAchievements();
    } else if (this.editorLevelData) {
      try {
        const cur = parseInt(localStorage.getItem('gd_editor_attempts') || '0');
        localStorage.setItem('gd_editor_attempts', String(cur + 1));
      } catch {}
    }
    this.particles.clear();
    this.shakeIntensity = 0;
    this._portalFlash = null;
    this.deathTimer = 0;
    this.pendingOrbHit = null;
    // Reset replay and timer
    this._replayRecorder = new ReplayRecorder();
    this._replayFrame = 0;
    this._levelStartTime = performance.now();
    if (this._replayGhost) this._replayGhost.reset();
    // Reset theme and re-apply any color triggers before spawn point
    this._colorTransition = null;
    if (this._baseTheme) this.theme = this._baseTheme;

    // Reset all transport platforms back to start position
    if (this.level) {
      for (const obs of this.level.obstacles) {
        if (obs.type === 'transport' && obs.reset) obs.reset();
      }
    }

    if (this.practiceMode && this.lastCheckpoint) {
      this.player.reset(this.lastCheckpoint.x, this.lastCheckpoint.y);
      this.player.gravityMult = this.lastCheckpoint.gravityMult;
      this.player.speedMult = this.lastCheckpoint.speedMult;
      this.player.mode = this.lastCheckpoint.mode || MODE_CUBE;
      this.player.mini = this.lastCheckpoint.mini || false;
      this.player.reversed = this.lastCheckpoint.reversed || false;
      if (this.lastCheckpoint.theme) this.theme = { ...this.lastCheckpoint.theme };
      this.level.resetFrom(this.lastCheckpoint.x);
      this.camera.reset(this.lastCheckpoint.x);
    } else if (this.editorStartCheckpoint) {
      // Editor start pos - always respawn here
      this.player.reset(this.editorStartCheckpoint.x, this.editorStartCheckpoint.y);
      this.level.resetFrom(this.editorStartCheckpoint.x);
      this.lastCheckpoint = { ...this.editorStartCheckpoint };
      this.camera.reset(this.editorStartCheckpoint.x);
    } else {
      this.player.reset(0);
      this.level.reset();
      this.lastCheckpoint = null;
      this.camera.reset(0);
    }

    // Re-apply color triggers before spawn point instantly
    if (this.level) {
      const spawnX = this.player.x;
      let lastTrigger = null;
      for (const obs of this.level.obstacles) {
        if (obs.type === 'color_trigger' && obs.x <= spawnX) {
          lastTrigger = obs;
        }
      }
      if (lastTrigger) {
        const targetTheme = lastTrigger.customTheme || COLOR_TRIGGER_FULL_THEMES[lastTrigger.colorType];
        if (targetTheme) this.theme = { ...targetTheme };
      }
    }

    // Restart music: from checkpoint offset (practice), editor start pos, or beginning
    await Sound.resumeAudio();
    let musicOffset = 0;
    if (this.practiceMode && this.lastCheckpoint && this.lastCheckpoint.musicTime) {
      musicOffset = this.lastCheckpoint.musicTime;
    } else if (this.editorStartCheckpoint && this.editorStartCheckpoint.musicTime) {
      musicOffset = this.editorStartCheckpoint.musicTime;
    }
    if (this.editorLevelData) {
      const musicKey = this.editor._getMusicKey();
      if (musicKey && Sound.hasCustomMusic(musicKey)) {
        await Sound.playMusic(musicKey, musicOffset);
      } else {
        await Sound.playMusic(this.editor.themeId, musicOffset);
      }
    } else {
      await Sound.playMusic(this.level.id, musicOffset);
    }

    this.state = this.editorLevelData ? EDITOR_TESTING : PLAYING;
  }

  _die() {
    if (this.state === DEAD) return;
    this.player.alive = false;
    this._portalFlash = null;
    this.shakeIntensity = 10;
    Sound.playDeath();
    Sound.pauseMusic();
    this.particles.emitDeath(
      this.player.x,
      this.player.y + PLAYER_SIZE / 2,
      this.theme.accent
    );

    const progress = this.level.getProgress(this.player.x);
    this.currentProgress = progress;
    // Use peak progress (highest point reached this run) for saving
    const saveProgress = Math.max(progress, this.peakProgress);
    if (!this.practiceMode) {
      this.progress = updateLevelProgress(this.progress, this.level.id, saveProgress, false);
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

  _getAchievementStats() {
    const totalCoins = {};
    for (const [id, data] of Object.entries(LEVEL_DATA)) {
      totalCoins[id] = data.objects ? Math.min(3, data.objects.filter(o => o.type === 'coin').length) : 0;
    }
    return { totalCoins };
  }

  _checkAchievements() {
    const newAchs = evaluateAchievements(this.progress, this._getAchievementStats());
    for (const ach of newAchs) {
      this._achievementToasts.push({ text: `\u{1F3C6} ${ach.title}`, subtext: ach.desc, timer: 0, duration: 3 });
    }
  }

  _startColorTransition(colorKey, customTheme, duration) {
    const targetTheme = customTheme || COLOR_TRIGGER_FULL_THEMES[colorKey];
    if (!targetTheme) return;
    // Snapshot current theme as "from"
    const from = {};
    for (const k of Object.keys(targetTheme)) {
      from[k] = this.theme[k];
    }
    this._colorTransition = { from, to: targetTheme, progress: 0, duration: duration || 0.6 };
  }

  _updateColorTransition(dt) {
    const t = this._colorTransition;
    if (!t) return;
    t.progress += dt / t.duration;
    if (t.progress >= 1) {
      // Transition complete - set final theme
      this.theme = { ...t.to };
      this._colorTransition = null;
      // Force renderer to re-cache gradients
      this.renderer._bgTheme = null;
      this.renderer._gndTheme = null;
      return;
    }
    // Interpolate all color properties
    const blended = {};
    for (const k of Object.keys(t.to)) {
      if (typeof t.to[k] === 'string' && t.to[k][0] === '#' && t.from[k] && t.from[k][0] === '#') {
        blended[k] = _lerpColor(t.from[k], t.to[k], t.progress);
      } else {
        blended[k] = t.to[k];
      }
    }
    this.theme = blended;
    // Force renderer to re-cache gradients each frame during transition
    this.renderer._bgTheme = null;
    this.renderer._gndTheme = null;
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
    this._updateColorTransition(dt);

    // Advance achievement toasts
    for (const toast of this._achievementToasts) {
      toast.timer += dt;
    }
    this._achievementToasts = this._achievementToasts.filter(t => t.timer < t.duration);

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
      // Keep prevY in sync so collision doesn't think player approached from side
      this.player.prevY += this.player.movingPlatformRef.deltaY;
      if (this.player.transportLocked) {
        this.player.x += this.player.movingPlatformRef.deltaX;
      }
    }

    // For active transport: keep player locked (including arrived grace period)
    const prevTransportRef = (this.player.movingPlatformRef &&
      this.player.movingPlatformRef.type === 'transport' &&
      this.player.movingPlatformRef.active &&
      (!this.player.movingPlatformRef.arrived || this.player.movingPlatformRef.arrivedFrames < 12)) ? this.player.movingPlatformRef : null;

    // Save moving platform ref to force-snap player each frame
    const prevMovingRef = (this.player.movingPlatformRef &&
      this.player.movingPlatformRef.type === 'moving' &&
      this.player.grounded) ? this.player.movingPlatformRef : null;

    // Detect transport just arrived: was locked, now arrived → skip ramp, full speed immediately
    const transportJustArrived = this.player.transportLocked &&
      this.player.movingPlatformRef?.type === 'transport' &&
      this.player.movingPlatformRef.arrived;

    // Reset moving platform flag before collision so it's fresh this frame
    this.player.onMovingPlatform = false;
    this.player.movingPlatformRef = null;
    this.player.transportLocked = false;
    this.pendingOrbHit = null;

    // When transport just arrived, restore full speed immediately (no ramp)
    if (transportJustArrived) {
      this.player.transportExitRamp = 1;
    }

    // If player was on active transport, force-keep them locked
    if (prevTransportRef) {
      this.player.onMovingPlatform = true;
      this.player.movingPlatformRef = prevTransportRef;
      const tmo = this.player.mini ? (PLAYER_SIZE - this.player.getSize()) / 2 : 0;
      this.player.y = this.player.gravityMult === -1 ? prevTransportRef.y + prevTransportRef.h - tmo : prevTransportRef.y - PLAYER_SIZE + tmo;
      this.player.vy = 0;
      this.player.grounded = true;
      this.player.onPlatform = true;
      this.player.platformRef = prevTransportRef;
      if (prevTransportRef.arrived) {
        // Arrived: keep on platform but don't lock x, let player walk off
        this.player.transportLocked = false;
      } else {
        this.player.transportLocked = true;
        // During wait phase, slide player toward platform center
        if (prevTransportRef.waitFrames < prevTransportRef.waitTotal) {
          const centerX = prevTransportRef.x + prevTransportRef.w / 2 - PLAYER_SIZE / 2;
          const diff = centerX - this.player.x;
          this.player.x += diff * 0.2;
        }
      }
    }

    // Force-snap player to moving platform if they were on it and haven't jumped
    // Also check horizontal bounds so jumping past the platform doesn't snap back
    if (prevMovingRef && !prevTransportRef) {
      const inverted = this.player.gravityMult === -1;
      const movingAway = inverted ? this.player.vy < 0 : this.player.vy > 0;
      if (!movingAway) {
        const px = this.player.x;
        const platLeft = prevMovingRef.x;
        const platRight = prevMovingRef.x + prevMovingRef.w;
        if (px + PLAYER_SIZE > platLeft && px < platRight) {
          const mo = this.player.mini ? (PLAYER_SIZE - this.player.getSize()) / 2 : 0;
          this.player.y = inverted ? prevMovingRef.y + prevMovingRef.h - mo : prevMovingRef.y - PLAYER_SIZE + mo;
          this.player.prevY = this.player.y;
          this.player.vy = 0;
          this.player.grounded = true;
          this.player.onPlatform = true;
          this.player.onMovingPlatform = true;
          this.player.movingPlatformRef = prevMovingRef;
        }
      }
    }

    // Collision detection (before player.update so moving platform flag is set in time)
    const playerRect = this.player.getRect();
    const miniOffset = this.player.mini ? (PLAYER_SIZE - this.player.getSize()) / 2 : 0;
    const visible = this.level.getVisible(this.camera.x);
    const wasOnPlatform = this.player.onPlatform;
    this.player.onPlatform = false;

    for (const obs of visible) {
      if (obs.type === 'spike') {
        if (obs.checkCollision(playerRect) === 'death') {
          this._die();
          return;
        }
      } else if (obs.type === 'saw') {
        if (obs.checkCollision(playerRect) === 'death') {
          this._die();
          return;
        }
      } else if (obs.type === 'slope') {
        const result = obs.checkCollision(playerRect, this.player.prevY, this.player.gravityMult);
        if (result && result.type === 'land') {
          // Allow jumping off slope — don't land if vy is strongly upward
          const jumpingOff = (this.player.gravityMult > 0 && this.player.vy < -2) ||
                             (this.player.gravityMult < 0 && this.player.vy > 2);
          if (!jumpingOff) {
            const slopeMiniOffset = this.player.mini ? (PLAYER_SIZE - this.player.getSize()) / 2 : 0;
            this.player.y = this.player.gravityMult === -1 ? result.y - slopeMiniOffset : result.y - PLAYER_SIZE + slopeMiniOffset;
            this.player.prevY = this.player.y;
            // Set vy based on slope angle — player follows the diagonal
            const speed = SCROLL_SPEED * this.player.speedMult;
            this.player.vy = result.slopeRatio * speed;
            this.player.grounded = true;
            this.player.onPlatform = true;
            this.player._snapRotation();
          }
        }
      } else if (obs.type === 'platform_group') {
        const result = obs.checkCollision(playerRect, this.player.prevY + miniOffset, this.player.gravityMult);
        if (result) {
          // Use the exact sub-piece bounds, not the group bounding box
          const piece = result._piece || obs;
          if (result.type === 'death') {
            // Slopes are safe surfaces, except wall hits (flat vertical side)
            if (piece.type === 'slope' && !result.wall) continue;
            const prevBottom = this.player.prevY + PLAYER_SIZE;
            const prevTop = this.player.prevY;
            const prevRight = this.player.prevX + PLAYER_SIZE;
            const pieceLeft = piece.x;
            const wasHorizInside = prevRight > pieceLeft + 4;
            const wasOnTop = wasHorizInside && this.player.gravityMult > 0 && Math.abs(prevBottom - piece.y) < 8;
            const wasBelow = wasHorizInside && this.player.gravityMult > 0 && prevBottom > piece.y + piece.h - 4;
            const wasOnBottom = wasHorizInside && this.player.gravityMult < 0 && Math.abs(prevTop - (piece.y + piece.h)) < 8;
            const wasAboveInv = wasHorizInside && this.player.gravityMult < 0 && prevTop < piece.y + 4;
            // Skip death if player is rising near a slope in this group (just jumped off)
            const risingNearSlope = this.player.vy * this.player.gravityMult < 0 && obs.pieces.some(p => p.type === 'slope');
            // Hitting from below = death (unless near a slope)
            if ((wasBelow || wasAboveInv) && !risingNearSlope) {
              this._die(); return;
            }
            if (wasOnTop || wasOnBottom || risingNearSlope) {
              continue;
            }
            this._die(); return;
          } else if (result.type === 'land') {
            // If player was approaching from the left (side hit), die instead of landing
            const prevRight = this.player.prevX + PLAYER_SIZE;
            const landPiece = result._piece || piece;
            if (prevRight <= landPiece.x + 4 && !result.slopeRatio) {
              this._die(); return;
            }
            // If player was below platform piece and rising, die (hitting underside)
            if (!result.slopeRatio && landPiece.type !== 'slope') {
              const prevBot = this.player.prevY + PLAYER_SIZE;
              if (this.player.gravityMult > 0 && prevBot > landPiece.y + 8 && this.player.vy < 0) {
                this._die(); return;
              }
              if (this.player.gravityMult < 0 && this.player.prevY < landPiece.y + landPiece.h - 8 && this.player.vy > 0) {
                this._die(); return;
              }
            }
            const jumpingOff = (this.player.gravityMult > 0 && this.player.vy < -2) || (this.player.gravityMult < 0 && this.player.vy > 2);
            if (jumpingOff) continue;
            // Handle slope landing with diagonal vy
            if (result.slopeRatio != null) {
              const slopeMiniOffset = this.player.mini ? (PLAYER_SIZE - this.player.getSize()) / 2 : 0;
              this.player.y = this.player.gravityMult === -1 ? result.y - slopeMiniOffset : result.y - PLAYER_SIZE + slopeMiniOffset;
              this.player.prevY = this.player.y;
              const speed = SCROLL_SPEED * this.player.speedMult;
              this.player.vy = result.slopeRatio * speed;
            } else {
              this.player.y = this.player.gravityMult === -1 ? result.y - miniOffset : result.y - PLAYER_SIZE + miniOffset;
              this.player.prevY = this.player.y;
              this.player.vy = 0;
            }
            this.player.grounded = true;
            this.player.onPlatform = true;
            this.player._snapRotation();
          }
        }
      } else if (obs.type === 'platform' || obs.type === 'moving' || obs.type === 'transport') {
        // Skip collision with transport that just arrived (grace period so player flies off cleanly)
        if (obs.type === 'transport' && obs.arrived && obs.arrivedFrames < 12) continue;
        const result = obs.checkCollision(playerRect, this.player.prevY + miniOffset, this.player.gravityMult);
        if (result) {
          if (result.type === 'death') {
            // Check if player was vertically aligned with the platform last frame
            // (on top, below, or above) vs approaching from the side (side hit = death)
            const prevBottom = this.player.prevY + PLAYER_SIZE;
            const prevTop = this.player.prevY;
            const platTop = obs.y;
            const platBottom = obs.y + obs.h;
            // Check if player was horizontally overlapping with platform last frame
            const prevRight = this.player.prevX + PLAYER_SIZE;
            const platLeft = obs.x;
            const wasHorizontallyInside = prevRight > platLeft + 4;
            // Was on top of platform, below it, or above it (not approaching from side)
            const wasOnTop = wasHorizontallyInside && this.player.gravityMult > 0 && Math.abs(prevBottom - platTop) < 8;
            const wasBelow = wasHorizontallyInside && this.player.gravityMult > 0 && prevBottom > platBottom - 4;
            const wasOnBottom = wasHorizontallyInside && this.player.gravityMult < 0 && Math.abs(prevTop - platBottom) < 8;
            const wasAboveInv = wasHorizontallyInside && this.player.gravityMult < 0 && prevTop < platTop + 4;
            // Hitting platform from below = death
            if (wasBelow || wasAboveInv) {
              this._die(); return;
            }
            if (wasOnTop || wasOnBottom) {
              continue;
            }
            // Side hit — always die
            this._die();
            return;
          } else if (result.type === 'land') {
            // If player was approaching from the left (side hit), die instead of landing
            const prevRight = this.player.prevX + PLAYER_SIZE;
            if (prevRight <= obs.x + 4) {
              this._die(); return;
            }
            // If player was below platform and rising, die (hitting underside)
            const prevBot = this.player.prevY + PLAYER_SIZE;
            if (this.player.gravityMult > 0 && prevBot > obs.y + 8 && this.player.vy < 0) {
              this._die(); return;
            }
            if (this.player.gravityMult < 0 && this.player.prevY < obs.y + obs.h - 8 && this.player.vy > 0) {
              this._die(); return;
            }
            // Don't land if player just jumped (vy strongly away from surface)
            // This prevents collision from cancelling a jump before player.update moves the player
            const jumpingOff = (this.player.gravityMult > 0 && this.player.vy < -2) ||
                               (this.player.gravityMult < 0 && this.player.vy > 2);
            if (jumpingOff) continue;
            // Snap player so mini/full rect aligns with platform surface
            this.player.y = this.player.gravityMult === -1 ? result.y - miniOffset : result.y - PLAYER_SIZE + miniOffset;
            this.player.prevY = this.player.y; // prevent interpolation jitter on landing
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
          this._portalFlash = { timer: 0, duration: 0.3, color: '#FF00FF' };
        } else if (result === 'portal_wave') {
          this.player.setMode(MODE_WAVE);
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#00FFAA', 8);
          this._portalFlash = { timer: 0, duration: 0.3, color: '#00FFAA' };
        } else if (result === 'portal_cube') {
          this.player.setMode(MODE_CUBE);
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#00C8FF', 8);
          this._portalFlash = { timer: 0, duration: 0.3, color: '#00C8FF' };
        } else if (result === 'portal_ball') {
          this.player.setMode(MODE_BALL);
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#FF8800', 8);
          this._portalFlash = { timer: 0, duration: 0.3, color: '#FF8800' };
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
          if ((this.coinsCollected || 0) >= 3) continue; // max 3 coins per level
          this.coinsCollected = (this.coinsCollected || 0) + 1;
          Sound.playCheckpoint(); // reuse checkpoint sound for now
          this.particles.emitDeath(this.player.x, this.player.y + PLAYER_SIZE / 2, '#FFD700', 15);
        }
      } else if (obs.type === 'color_trigger') {
        const result = obs.checkCollision(playerRect);
        if (result) {
          const colorKey = result.replace('color_', '');
          this._startColorTransition(colorKey, obs.customTheme, obs.duration);
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
            theme: { ...this.theme },
            musicTime: Sound.getCustomMusicTime(),
          };
        }
      } else if (obs.type === 'end') {
        if (obs.checkCollision(playerRect) === 'complete') {
          this.currentProgress = 1;
          this.state = COMPLETE;
          Sound.stopMusic();
          Sound.playComplete();
          if (!this.practiceMode) {
            this.progress = updateLevelProgress(this.progress, this.level.id, 1.0, true, this.coinsCollected || 0);
          } else {
            this.progress = updateLevelProgress(this.progress, this.level.id, 1.0, false, this.coinsCollected || 0, true);
          }
          this._checkAchievements();
          // Track community/editor level completions
          if (this.editorLevelData) {
            const count = parseInt(localStorage.getItem('gd_community_completions') || '0');
            localStorage.setItem('gd_community_completions', String(count + 1));
          }
          // Save replay ghost & submit score
          if (!this.editorLevelData) {
            if (this._replayRecorder) saveReplay(this.level.id, this._replayRecorder.serialize());
            const completionTimeMs = Math.round(performance.now() - this._levelStartTime);
            submitScore(this.level.id, this.attempts, completionTimeMs);
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

    // Walked off platform edge: start falling
    if (wasOnPlatform && !this.player.onPlatform) {
      this.player.grounded = false;
      this.player.coyoteCounter = 6;
    }

    // Now update player movement (after collision set onMovingPlatform)
    this.player.update();
    this.camera.update(this.player.x);

    // Record replay frame
    if (this._replayRecorder && this.player.alive) {
      this._replayRecorder.record(this.player);
    }
    this._replayFrame++;

    // Hold-to-jump: emit effects when auto-jumping from hold
    if (this.player.holdJumped) {
      Sound.playJump();
      this.particles.emitJump(
        this.player.x,
        this.player.y + PLAYER_SIZE,
        this.theme.accent
      );
    }

    // Trail particles (skip for dashed trail style)
    if (this.player.trailStyle !== 'dotted') {
      this.particles.emitTrail(
        this.player.x - 5,
        this.player.y + PLAYER_SIZE / 2,
        this.theme.accent
      );
    }
    this.particles.update(dt);
    this.shakeIntensity *= 0.9;

    // Advance portal flash timer
    if (this._portalFlash) {
      this._portalFlash.timer += dt;
      if (this._portalFlash.timer >= this._portalFlash.duration) {
        this._portalFlash = null;
      }
    }

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
      this.ui.drawLevelSelect(ctx, this.progress, this.levelPage, this._showScrollCoin);
    } else if (this.state === CUSTOMIZE) {
      this.ui.drawCustomize(ctx, this.customization);
    } else if (this.state === STATS) {
      this.ui.drawStats(ctx, this.progress);
    } else if (this.state === FRIENDS) {
      this.ui.drawFriends(ctx, this.friendsData);
    } else if (this.state === COMMUNITY) {
      const user = getAuthUser();
      this.communityData.currentUserId = user ? user.id : null;
      this.communityData.isAdmin = isAdmin();
      this.ui.drawCommunity(ctx, this.communityData);
    } else if (this.state === LEADERBOARD) {
      this.ui.drawLeaderboard(ctx, this._leaderboardData);
    } else if (this.state === SECRETS) {
      if (this.secretsData.messageTimer > 0) this.secretsData.messageTimer -= 1 / FPS;
      this.ui.drawSecrets(ctx, this.secretsData, this._redeemedCodes);
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

      const pulseIntensity = Sound.getBeatIntensity();
      this.renderer.drawBackground(ctx, camX, this.theme, pulseIntensity);

      const visible = this.level.getVisible(camX);
      for (const obs of visible) {
        obs.draw(ctx, camX, this.theme);
      }

      this.renderer.drawGround(ctx, camX, this.theme, pulseIntensity);
      this.particles.draw(ctx, camX - PLAYER_X_OFFSET);

      // Draw ghost replay (behind the player)
      if (this._replayGhost && this.player.alive) {
        const ghostPos = this._replayGhost.getPosition(this._replayFrame);
        if (ghostPos) {
          const gx = ghostPos.x - camX + PLAYER_X_OFFSET;
          const gy = ghostPos.y;
          const sz = PLAYER_SIZE;
          ctx.save();
          ctx.globalAlpha = 0.2;
          ctx.translate(gx + sz / 2, gy + sz / 2);
          ctx.rotate(ghostPos.rotation);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
          ctx.restore();
        }
      }

      if (this.player.alive) {
        this.player.draw(ctx, camX, this.theme, alpha);
      }

      if (mirrored) {
        ctx.restore();
      }

      // Portal transition flash effect (white flash + colored tint)
      if (this._portalFlash) {
        const f = this._portalFlash;
        const progress_ = f.timer / f.duration;
        ctx.save();
        // White flash that fades out quickly
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = (1 - progress_) * 0.35;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        // Colored tint that fades slower
        ctx.fillStyle = f.color;
        ctx.globalAlpha = (1 - progress_) * 0.15;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        ctx.restore();
      }

      const progress = this.level ? this.level.getProgress(this.player.x) : 0;

      // Track peak progress and new best during gameplay
      if (this.state === PLAYING || this.state === EDITOR_TESTING) {
        if (progress > this.peakProgress) this.peakProgress = progress;
        if (!this.practiceMode && !this.editorLevelData && this.previousBest < 1) {
          if (Math.round(this.peakProgress * 100) > Math.round(this.previousBest * 100) && Math.round(this.peakProgress * 100) > 0) {
            this.newBestTriggered = true;
            this.newBestValue = this.peakProgress;
          }
        }
      }

      // Show NEW BEST! only on death screen, never in practice mode
      const showNewBest = this.state === DEAD && this.newBestTriggered && !this.practiceMode;
      const totalCoins = this.level ? Math.min(3, this.level.totalCoins) : 0;
      this.ui.drawHUD(ctx, progress, this.attempts, this.practiceMode, this.level.name, showNewBest, totalCoins > 0 ? { collected: this.coinsCollected || 0, total: totalCoins } : null, showNewBest ? this.newBestValue : 0);

      if (this.state === PAUSED) {
        const bestProg = (this.level && this.progress[this.level.id]) ? this.progress[this.level.id].bestProgress : 0;
        const pauseCoins = totalCoins > 0 ? { collected: this.coinsCollected || 0, total: totalCoins, best: (this.level && this.progress[this.level.id]) ? (this.progress[this.level.id].bestCoins || 0) : 0 } : null;
        this.ui.drawPauseScreen(ctx, !!this.editorLevelData, this.practiceMode, bestProg, pauseCoins);
      } else if (this.state === COMPLETE) {
        const completeCoins = totalCoins > 0 ? { collected: this.coinsCollected || 0, total: totalCoins } : null;
        this.ui.drawCompleteScreen(ctx, this.attempts, this.theme, completeCoins, !!this.editorLevelData);
      }
    }

    ctx.restore();

    // Achievement toasts — slide in from top
    for (let i = 0; i < this._achievementToasts.length; i++) {
      const toast = this._achievementToasts[i];
      const t = toast.timer / toast.duration;
      // Slide in for first 15%, hold, slide out for last 15%
      const baseY = 65; // below pause button
      let slideY;
      if (t < 0.15) {
        slideY = -70 + (70 + baseY + i * 70) * (t / 0.15);
      } else if (t > 0.85) {
        slideY = (baseY + i * 70) - (70 + baseY + i * 70) * ((t - 0.85) / 0.15);
      } else {
        slideY = baseY + i * 70;
      }
      const toastW = IS_MOBILE ? 280 : 340;
      const toastH = 56;
      const tx = SCREEN_WIDTH / 2 - toastW / 2;
      this.ctx.save();
      // Dark background
      this.ctx.globalAlpha = 0.88;
      this.ctx.fillStyle = '#1A1200';
      this.ctx.beginPath();
      this.ctx.roundRect(tx, slideY, toastW, toastH, 10);
      this.ctx.fill();
      // Gold border
      this.ctx.globalAlpha = 0.7;
      this.ctx.strokeStyle = '#FFD700';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
      // Title text
      this.ctx.fillStyle = '#FFD700';
      this.ctx.font = 'bold 18px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(toast.text, SCREEN_WIDTH / 2, slideY + 8);
      // Description text
      this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
      this.ctx.font = '13px monospace';
      this.ctx.fillText(toast.subtext, SCREEN_WIDTH / 2, slideY + 32);
      this.ctx.restore();
    }

    // Portrait mode overlay — hint to rotate
    if (this.isPortrait) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,20,0.92)';
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      ctx.fillStyle = '#00C8FF';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ROTATE YOUR DEVICE', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 30);
      // Rotate icon
      ctx.font = '60px monospace';
      ctx.fillText('\u21BB', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 40);
      ctx.fillStyle = '#4A6A8A';
      ctx.font = '16px monospace';
      ctx.fillText('This game is best played in landscape', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 90);
      ctx.restore();
    }
  }

  _resizeCanvas() {
    const vv = window.visualViewport;
    const windowW = vv ? vv.width : window.innerWidth;
    const windowH = vv ? vv.height : window.innerHeight;
    const windowRatio = windowW / windowH;
    const dpr = window.devicePixelRatio || 1;

    // Track portrait mode for rotate hint on mobile
    this.isPortrait = IS_MOBILE && windowRatio < 1;

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
      ensureProfile();
      this._clearLocalData();
      await this._syncFromCloud();
      await checkAdmin();
      // Restore jump count for this user
      const user = getAuthUser();
      if (user) {
        const saved = localStorage.getItem('gd_total_jumps_' + user.id);
        if (saved) localStorage.setItem('gd_total_jumps', saved);
      }
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
      ensureProfile();
      await this._syncFromCloud();
      await checkAdmin();
      // Restore jump count for this user
      const user = getAuthUser();
      if (user) {
        const saved = localStorage.getItem('gd_total_jumps_' + user.id);
        if (saved) localStorage.setItem('gd_total_jumps', saved);
      }
      updateView();
    });

    document.getElementById('acc-logout').addEventListener('click', async () => {
      // Save jump count per-user before logout
      const user = getAuthUser();
      if (user) {
        const jumps = localStorage.getItem('gd_total_jumps') || '0';
        localStorage.setItem('gd_total_jumps_' + user.id, jumps);
      }
      await signOut();
      this._clearLocalData();
      updateView();
    });

    document.getElementById('acc-avatar')?.addEventListener('click', () => {
      overlay.style.display = 'none';
      this.ui.resetScroll();
      this.secretsData.message = null;
      this.state = SECRETS;
    });

    document.getElementById('acc-reset').addEventListener('click', async () => {
      const confirmed = await customConfirm('RESET PROGRESS', 'Reset ALL progress, coins, attempts, jumps, achievements, secret codes, and secret coins? This cannot be undone.', 'YES, RESET', 'CANCEL');
      if (!confirmed) return;
      // Clear from Supabase
      await resetProgressInCloud();
      // Clear everything except editor levels, friends, customization
      localStorage.removeItem('gd_progress');
      localStorage.removeItem('gd_total_jumps');
      localStorage.removeItem('gd_achievements');
      localStorage.removeItem('gd_secret_coins');
      localStorage.removeItem('gd_redeemed_codes');
      localStorage.removeItem('gd_scroll_coin');
      localStorage.removeItem('gd_rainbow_color');
      localStorage.removeItem('gd_dotted_trail');
      localStorage.removeItem('gd_wink_icon');
      const user = getAuthUser();
      if (user) localStorage.removeItem('gd_total_jumps_' + user.id);
      // Reset in-memory state
      this.progress = loadProgress();
      this._redeemedCodes = new Set();
      this._achievementToasts = [];
      this._showScrollCoin = false;
      this._levelScrollCount = 0;
      // Reset secret customizations if currently using them
      if (this.customization.colorIndex === PLAYER_COLORS.indexOf('rainbow')) this.customization.colorIndex = 0;
      if (this.customization.trailStyleIndex === 1) this.customization.trailStyleIndex = 0;
      if (CUBE_ICONS[this.customization.iconIndex] === 'wink') this.customization.iconIndex = 0;
      this._applyCustomization();
      this._saveCustomization();
      overlay.style.display = 'none';
      this.state = MENU;
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
      const defaults = { colorIndex: 0, trailIndex: 0, iconIndex: 0, shapeIndex: 0, trailStyleIndex: 0 };
      this.customization = { ...defaults, ...this.customization, ...cloud };
      localStorage.setItem('gd_customization', JSON.stringify(this.customization));
      this._applyCustomization();
    }
  }

  _clearLocalData() {
    // Clear all game data from localStorage
    localStorage.removeItem('gd_progress');
    localStorage.removeItem('gd_customization');
    localStorage.removeItem('gd_editor_attempts');
    localStorage.removeItem('gd_total_jumps');
    localStorage.removeItem('gd_achievements');
    localStorage.removeItem('gd_secret_coins');
    localStorage.removeItem('gd_redeemed_codes');
    localStorage.removeItem('gd_scroll_coin');
    // Clear replay ghosts
    for (let i = 1; i <= 9; i++) localStorage.removeItem('gd_replay_' + i);
    // Clear editor slots
    try {
      const slots = JSON.parse(localStorage.getItem('gd_editor_slots') || '[]');
      for (const slot of slots) {
        localStorage.removeItem('gd_editor_slot_' + slot.id);
      }
    } catch {}
    localStorage.removeItem('gd_editor_slots');
    // Reset in-memory state
    this.progress = {};
    for (let i = 1; i <= 9; i++) {
      this.progress[i] = { attempts: 0, bestProgress: 0, completed: false, bestCoins: 0 };
    }
    this.customization = this._loadCustomization();
    this._applyCustomization();
    if (this.editor) {
      this.editor.objects = [];
      this.editor.currentSlot = null;
    }
  }

  async _syncFromCloud() {
    this.progress = await initProgress();
    await this._initCloudCustomization();
  }

  async _syncCloudMusic() {
    try {
      // Sync editor slot music
      const slots = await listLevelMusic();
      for (const slotId of slots) {
        const key = 'editor_' + slotId;
        if (Sound.hasCustomMusic(key)) continue;
        const ab = await downloadLevelMusic(slotId);
        if (ab) {
          const blob = new Blob([ab], { type: 'audio/mpeg' });
          const file = new File([blob], 'music.mp3', { type: 'audio/mpeg' });
          await Sound.loadCustomMusic(key, file);
        }
      }
      // Sync official level music (levels 1-10)
      for (let id = 1; id <= 9; id++) {
        if (Sound.hasCustomMusic(id)) continue;
        const ab = await downloadOfficialMusic(id);
        if (ab) {
          const blob = new Blob([ab], { type: 'audio/mpeg' });
          const file = new File([blob], 'music.mp3', { type: 'audio/mpeg' });
          await Sound.loadCustomMusic(id, file);
        }
      }
    } catch (e) {
      console.warn('Cloud music sync failed:', e);
    }
  }

  _loadCustomization() {
    const defaults = { colorIndex: 0, trailIndex: 0, iconIndex: 0, shapeIndex: 0, trailStyleIndex: 0 };
    try {
      const data = localStorage.getItem('gd_customization');
      if (data) return { ...defaults, ...JSON.parse(data) };
    } catch (e) {
      console.warn('Failed to load customization:', e);
    }
    return defaults;
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
    const { colorIndex, trailIndex, iconIndex, shapeIndex, trailStyleIndex } = this.customization;
    this.player.customColor = PLAYER_COLORS[colorIndex] || null;
    this.player.customTrailColor = PLAYER_TRAIL_COLORS[trailIndex] || null;
    this.player.trailStyle = PLAYER_TRAIL_STYLES[trailStyleIndex || 0] || 'normal';
    this.player.cubeIcon = CUBE_ICONS[iconIndex] || 'default';
    this.player.cubeShape = CUBE_SHAPES[shapeIndex || 0] || 'square';
  }
}

new Game();
