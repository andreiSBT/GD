/** Level Editor - visual grid-based editor for creating levels */

import { SCREEN_WIDTH, SCREEN_HEIGHT, GRID, GROUND_Y, GROUND_H, PLAYER_X_OFFSET, THEMES, SCROLL_SPEED, FPS } from './settings.js';
import { createObstacle, COLOR_TRIGGER_THEMES } from './obstacles.js';
import { LEVEL_DATA } from './level.js';
import { syncEditorLevelToCloud, loadEditorLevelsFromCloud, deleteEditorLevelFromCloud, isConfigured, isAdmin, saveOfficialLevel, uploadLevelMusic, deleteLevelMusic, uploadOfficialMusic } from './supabase.js';
import { loadCustomMusic, removeCustomMusic, hasCustomMusic, getRawMusicFromDB, copyMusicBuffer, getCustomMusicDuration } from './sound.js';

const TOOLBAR_H = 56;
const PANEL_W = 180;
const NAV_BAR_H = 24;
const NAV_BAR_PAD = 8;

const TOOLS = [
  { id: 'spike', label: 'Spike', key: '1', color: '#FF4444' },
  { id: 'platform', label: 'Platform', key: '2', color: '#4488FF' },
  { id: 'moving', label: 'Moving', key: '3', color: '#44AAFF' },
  { id: 'transport', label: 'Transport', key: 'T', color: '#44FF88' },
  { id: 'orb', label: 'Orb', key: '4', color: '#FFD700' },
  { id: 'pad', label: 'Pad', key: '5', color: '#FFAA00' },
  { id: 'portal', label: 'Portal', key: '6', color: '#FF00FF' },
  { id: 'coin', label: 'Coin', key: 'C', color: '#FFD700' },
  { id: 'checkpoint', label: 'Check', key: '7', color: '#00FF44' },
  { id: 'end', label: 'End', key: '8', color: '#00FFFF' },
  { id: 'start', label: 'Start', key: '9', color: '#00FF88' },
  { id: 'slope', label: 'Slope', key: 'S', color: '#88CCFF' },
  { id: 'saw', label: 'Saw', key: 'W', color: '#FF6666' },
  { id: 'color_trigger', label: 'Color', key: 'R', color: '#FF66AA' },
  { id: 'move', label: 'Move', key: 'M', color: '#FFAA00' },
  { id: 'erase', label: 'Erase', key: 'X', color: '#FF0000' },
];

const SUBTYPES = {
  orb: ['yellow_orb', 'pink_orb', 'dash_orb'],
  pad: ['yellow_pad', 'pink_pad'],
  portal: ['gravity', 'speed_up', 'speed_down', 'ship', 'wave', 'cube', 'ball', 'mini', 'big', 'reverse', 'forward'],
  color_trigger: ['blue', 'magenta', 'green', 'orange', 'purple', 'red', 'cyan', 'yellow', 'custom'],
  slope: ['up', 'down'],
  saw: ['1', '2', '3'],
};

const SUBTYPE_COLORS = {
  yellow_orb: '#FFD700', pink_orb: '#FF69B4', dash_orb: '#00FF00',
  yellow_pad: '#FFD700', pink_pad: '#FF69B4',
  gravity: '#FFD700', speed_up: '#FF6600', speed_down: '#00AAFF',
  ship: '#FF00FF', wave: '#00FFAA', cube: '#00C8FF',
  ball: '#FF8800', mini: '#FF44FF', big: '#44AAFF', reverse: '#00FFFF', forward: '#44FF44',
  blue: '#00C8FF', magenta: '#FF3296', green: '#64FF32', orange: '#FF8800',
  purple: '#AA44FF', red: '#FF2222', cyan: '#00FFCC', yellow: '#FFD700', custom: '#FF66AA',
  up: '#88CCFF', down: '#88CCFF',
  '1': '#FF6666', '2': '#FF4444', '3': '#FF2222',
};

export class Editor {
  constructor(canvas, ctx, renderer) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.renderer = renderer;

    this.cameraX = 0;
    this.objects = [];
    this.liveObstacles = [];
    this.selectedTool = 'spike';
    this.subType = null;
    this.rotation = 0; // 0, 90, 180, 270 for spikes
    this.theme = THEMES[1];
    this.themeId = 1;
    this.levelName = 'My Level';

    this.hoverGx = 0;
    this.hoverGy = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.dragStart = null;
    this.dragWidth = 1;
    this.dragHeight = 1;
    this.movingEndMode = false;
    this.movingStart = null;

    this.history = [];
    this.historyIndex = -1;

    this.buttons = [];
    this.showHelp = false;
    this.scrollSpeed = 0;

    this.onTest = null;
    this.onPlay = null;
    this.onBack = null;

    // Touch state
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartCamX = 0;
    this.isTouchScrolling = false;
    this.touchMoved = false;

    // Toast notification
    this.toastText = '';
    this.toastTimer = 0;

    // Paint mode (hold+drag to place multiple objects)
    this.painting = false;
    this.paintErase = false;
    this.lastPaintGx = -1;
    this.lastPaintGy = -1;

    // Move tool state
    this.movingObj = null;       // object being moved
    this.movingObjIndex = -1;    // index in this.objects

    // Start position for testing (grid coords)
    this.startPos = null;

    // Touch swipe mode: 'scroll' (default, free camera) or 'paint' (swipe places/erases)
    this.swipeMode = 'scroll';

    // Level browser
    this.browsing = false;
    this.currentSlot = null;
    this.browseScroll = 0;

    // Delete confirmation dialog
    this.confirmDelete = null; // null or { slotId, slotName }
    this.officialPicker = false; // show official level picker dialog
    this.showInfo = false; // level info overlay

    // Hidden file input for music
    this._musicInput = document.createElement('input');
    this._musicInput.type = 'file';
    this._musicInput.accept = 'audio/*';
    this._musicInput.style.display = 'none';
    document.body.appendChild(this._musicInput);

    // Navigation bar drag state
    this.navDragging = false;

    // Custom color trigger state
    this._customColorData = {
      accent: '#FF66AA', bgTop: '#1A0020', bgBot: '#3A0040',
      ground: '#500060', groundLine: '#FF66AA', spike: '#FFDDEE',
      platform: '#880066', player: '#FF88CC',
    };
    this._customDuration = 0.6;
    this._customColorPending = null; // { gx, gy } when waiting for overlay
    this._setupCustomColorOverlay();
  }

  _setupCustomColorOverlay() {
    const overlay = document.getElementById('color-editor-overlay');
    const fields = document.getElementById('ce-fields');
    if (!overlay || !fields) return;

    const labels = {
      accent: 'Accent', bgTop: 'BG Top', bgBot: 'BG Bottom',
      ground: 'Ground', groundLine: 'Ground Line', spike: 'Spike',
      platform: 'Platform', player: 'Player',
    };
    // Build color fields
    for (const [key, label] of Object.entries(labels)) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'color:#99AABB; font-size:12px; font-family:monospace; flex:1; text-align:left;';
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.id = 'ce-' + key;
      inp.value = this._customColorData[key];
      inp.style.cssText = 'width:44px; height:32px; border:1px solid rgba(255,255,255,0.15); border-radius:6px; background:rgba(0,0,0,0.4); cursor:pointer; padding:1px;';
      inp.addEventListener('input', () => { this._customColorData[key] = inp.value; });
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      fields.appendChild(wrap);
    }

    // Use event delegation on the overlay to catch all clicks reliably
    overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());
    overlay.addEventListener('touchstart', (e) => e.stopPropagation());
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.target.id;
      if (id === 'ce-ok') {
        overlay.style.display = 'none';
        if (this._customColorPending) {
          this._placeCustomColorTrigger(this._customColorPending.gx, this._customColorPending.gy);
          this._customColorPending = null;
        }
      } else if (id === 'ce-cancel') {
        overlay.style.display = 'none';
        this._customColorPending = null;
      } else if (id === 'ce-duration') {
        const durInput = document.getElementById('ce-duration');
        const durVal = document.getElementById('ce-duration-val');
        this._customDuration = parseFloat(durInput.value);
        durVal.textContent = durInput.value + 's';
      }
    });
    // Duration slider continuous update
    const durInput = document.getElementById('ce-duration');
    const durVal = document.getElementById('ce-duration-val');
    if (durInput) {
      durInput.addEventListener('input', () => {
        this._customDuration = parseFloat(durInput.value);
        durVal.textContent = durInput.value + 's';
      });
    }
  }

  _showCustomColorOverlay(gx, gy, existingObj) {
    const overlay = document.getElementById('color-editor-overlay');
    if (!overlay) return;
    // Pre-fill from existing object if editing
    if (existingObj && existingObj.customTheme) {
      for (const k of Object.keys(this._customColorData)) {
        if (existingObj.customTheme[k]) this._customColorData[k] = existingObj.customTheme[k];
      }
      this._customDuration = existingObj.duration || 0.6;
    }
    // Sync inputs
    for (const k of Object.keys(this._customColorData)) {
      const inp = document.getElementById('ce-' + k);
      if (inp) inp.value = this._customColorData[k];
    }
    const durInput = document.getElementById('ce-duration');
    const durVal = document.getElementById('ce-duration-val');
    if (durInput) { durInput.value = this._customDuration; }
    if (durVal) { durVal.textContent = this._customDuration + 's'; }

    this._customColorPending = { gx, gy };
    overlay.style.display = 'flex';
  }

  _placeCustomColorTrigger(gx, gy) {
    this._pushHistory();
    const obj = {
      type: 'color_trigger', x: gx, y: gy,
      colorType: 'custom',
      duration: this._customDuration,
      customTheme: {
        name: 'Custom',
        bgTop: this._customColorData.bgTop,
        bgBot: this._customColorData.bgBot,
        ground: this._customColorData.ground,
        groundLine: this._customColorData.groundLine,
        accent: this._customColorData.accent,
        player: this._customColorData.player,
        spike: this._customColorData.spike,
        platform: this._customColorData.platform,
        portalGravity: '#FFD700',
        portalSpeed: '#FF6600',
      },
    };
    this.objects.push(obj);
    this._rebuildLive();
  }

  _getMusicKey() {
    return this.currentSlot ? 'editor_' + this.currentSlot : null;
  }

  _hasSlotMusic() {
    const key = this._getMusicKey();
    return key ? hasCustomMusic(key) : false;
  }

  _handleMusicButton() {
    const key = this._getMusicKey();
    if (!key) {
      this._showToast('Save level first!');
      return;
    }
    if (hasCustomMusic(key)) {
      removeCustomMusic(key);
      deleteLevelMusic(this.currentSlot);
      this._showToast('Music removed');
    } else {
      this._musicInput.onchange = async () => {
        const file = this._musicInput.files[0];
        if (file) {
          try {
            await loadCustomMusic(key, file);
            this._showToast('Music added!');
            // Upload to cloud in background
            uploadLevelMusic(this.currentSlot, file);
          } catch (e) {
            this._showToast('Failed to load audio');
          }
        }
        this._musicInput.value = '';
      };
      this._musicInput.click();
    }
  }

  // === EVENT HANDLERS ===

  handleMouseDown(x, y, button) {
    // Level browser intercepts all clicks
    if (this.browsing) {
      this._handleBrowseClick(x, y);
      return;
    }
    // Official picker dialog intercepts all clicks
    if (this.officialPicker) {
      this._handleOfficialPickerClick(x, y);
      return;
    }
    // Dismiss help/info overlay on any click
    if (this.showHelp) {
      this.showHelp = false;
      return;
    }
    if (this.showInfo) {
      this.showInfo = false;
      return;
    }
    // Navigation bar — check before toolbar buttons so drag works
    const navBtn = this.buttons.find(b => b.id === 'navbar');
    if (navBtn && x >= navBtn.x && x <= navBtn.x + navBtn.w && y >= navBtn.y && y <= navBtn.y + navBtn.h) {
      this.navDragging = true;
      this._navBarSeek(x);
      return;
    }

    // buttons are populated during draw() — just check them
    // Check toolbar buttons
    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this._handleButton(btn.id);
        return;
      }
    }

    if (y < TOOLBAR_H) return;

    // Check side panel clicks
    if (this._hasSidePanel() && x > SCREEN_WIDTH - PANEL_W) {
      this._handlePanelClick(x, y);
      return;
    }

    const { gx, gy } = this._screenToGrid(x, y);
    const half = this._screenToHalfGrid(x, y);

    if (button === 2) {
      // Right click = erase (use half-grid to find moved objects)
      this._removeObjectAt(half.gx, half.gy);
      return;
    }

    if (this.selectedTool === 'erase') {
      this._removeObjectAt(half.gx, half.gy);
      this.painting = true;
      this.paintErase = true;
      this.lastPaintGx = gx;
      this.lastPaintGy = gy;
      return;
    }

    if (this.selectedTool === 'move') {
      // Pick up object at this position (drag to move)
      const idx = this._findObjectAt(half.gx, half.gy);
      if (idx >= 0) {
        this._pushHistory();
        this.movingObj = { ...this.objects[idx] };
        this.movingObjIndex = idx;
      }
      return;
    }

    if (this.movingEndMode) {
      // Second click for moving platform end position
      this._finishMovingPlatform(gx, gy);
      return;
    }

    if (this.selectedTool === 'platform' || this.selectedTool === 'slope') {
      this.dragStart = { gx, gy };
      this.dragWidth = 1;
      this.dragHeight = 1;
      return;
    }

    if (this.selectedTool === 'moving' || this.selectedTool === 'transport') {
      this.movingStart = { gx, gy };
      this.movingEndMode = true;
      return;
    }

    this._placeObject(gx, gy);
    // Start paint mode for tools that support it
    if (['spike', 'saw', 'orb', 'pad', 'coin', 'checkpoint', 'end', 'color_trigger'].includes(this.selectedTool)) {
      this.painting = true;
      this.paintErase = false;
      this.lastPaintGx = gx;
      this.lastPaintGy = gy;
    }
  }

  handleMouseMove(x, y) {
    this.mouseX = x;
    this.mouseY = y;

    // Nav bar dragging
    if (this.navDragging) {
      this._navBarSeek(x);
      return;
    }

    const grid = this._screenToGrid(x, y);
    this.hoverGx = grid.gx;
    this.hoverGy = grid.gy;

    // Move tool: update object position live while dragging (half-grid snap)
    if (this.movingObj) {
      const half = this._screenToHalfGrid(x, y);
      this.movingObj.x = half.gx;
      this.movingObj.y = half.gy;
      this.objects[this.movingObjIndex] = { ...this.movingObj };
      this._rebuildLive();
    }

    if (this.dragStart) {
      const minGx = Math.min(this.dragStart.gx, this.hoverGx);
      const maxGx = Math.max(this.dragStart.gx, this.hoverGx);
      const minGy = Math.min(this.dragStart.gy, this.hoverGy);
      const maxGy = Math.max(this.dragStart.gy, this.hoverGy);
      this.dragMinGx = minGx;
      this.dragMinGy = minGy;
      this.dragWidth = maxGx - minGx + 1;
      this.dragHeight = maxGy - minGy + 1;
    }

    // Paint mode: place/erase on each new grid cell while dragging
    const halfGrid = this._screenToHalfGrid(x, y);
    if (this.painting && (grid.gx !== this.lastPaintGx || grid.gy !== this.lastPaintGy)) {
      if (this.paintErase) {
        this._removeObjectAt(halfGrid.gx, halfGrid.gy);
      } else {
        this._placeObject(grid.gx, grid.gy);
      }
      this.lastPaintGx = grid.gx;
      this.lastPaintGy = grid.gy;
    }

    // Edge scrolling
    if (y > TOOLBAR_H) {
      if (x < 60) this.scrollSpeed = -12;
      else if (x > SCREEN_WIDTH - 60) this.scrollSpeed = 12;
      else this.scrollSpeed = 0;
    } else {
      this.scrollSpeed = 0;
    }
  }

  handleMouseUp(x, y) {
    if (this.navDragging) {
      this.navDragging = false;
      return;
    }
    if (this.movingObj) {
      // Finalize move - object already at new position from handleMouseMove
      this.movingObj = null;
      this.movingObjIndex = -1;
    }
    if (this.dragStart) {
      const minGx = Math.min(this.dragStart.gx, this.hoverGx);
      const minGy = Math.min(this.dragStart.gy, this.hoverGy);
      const w = Math.abs(this.hoverGx - this.dragStart.gx) + 1;
      const h = Math.abs(this.hoverGy - this.dragStart.gy) + 1;
      this._pushHistory();
      if (this.selectedTool === 'slope') {
        this.objects.push({
          type: 'slope', x: minGx, y: minGy, w, h, direction: this.subType || 'up',
        });
      } else {
        this.objects.push({
          type: 'platform', x: minGx, y: minGy, w, h,
        });
      }
      this._rebuildLive();
      this.dragStart = null;
    }
    this.painting = false;
    this.paintErase = false;
  }

  handleKeyDown(e) {
    if (this.browsing) {
      if (e.key === 'Escape') {
        if (this.onBack) this.onBack();
      }
      return true;
    }
    if (e.key === 'Escape') {
      if (this.movingEndMode) {
        this.movingEndMode = false;
        this.movingStart = null;
        return true;
      }
      if (this.showHelp) {
        this.showHelp = false;
        return true;
      }
      if (this.showInfo) {
        this.showInfo = false;
        return true;
      }
      // Auto-save and go back to browser
      if (this.currentSlot && this.objects.length > 0) {
        this.saveToSlot(this.currentSlot);
      }
      this.showBrowser();
      return true;
    }

    if (e.key === 'h' || e.key === 'H' || e.key === '?') {
      this.showHelp = !this.showHelp;
      return true;
    }

    // Tool shortcuts
    for (const tool of TOOLS) {
      if (e.key === tool.key || e.key === tool.key.toLowerCase()) {
        this.selectedTool = tool.id;
        this.subType = null;
        return true;
      }
    }

    if (e.key === 'ArrowLeft') { this.cameraX = Math.max(0, this.cameraX - GRID * 4); return true; }
    if (e.key === 'ArrowRight') { this.cameraX += GRID * 4; return true; }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      this._undo();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      this._redo();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (this.currentSlot) {
        this.saveToSlot(this.currentSlot);
        this._showToast('Saved!');
      }
      return true;
    }

    if (e.key === 'r' || e.key === 'R') {
      this._cycleRotation();
      return true;
    }

    return false;
  }

  // === TOUCH HANDLERS ===

  handleTouchStart(x, y, touchCount) {
    this.touchStartX = x;
    this.touchStartY = y;
    this.touchStartCamX = this.cameraX;
    this.isTouchScrolling = false;
    this.touchMoved = false;

    // Nav bar touch
    const navBtn = this.buttons.find(b => b.id === 'navbar');
    if (navBtn && x >= navBtn.x && x <= navBtn.x + navBtn.w && y >= navBtn.y && y <= navBtn.y + navBtn.h) {
      this.navDragging = true;
      this._navBarSeek(x);
      return;
    }

    // Update hover position
    this.mouseX = x;
    this.mouseY = y;
    const grid = this._screenToGrid(x, y);
    this.hoverGx = grid.gx;
    this.hoverGy = grid.gy;

    // Move tool: pick up object on touch start
    const halfTouch = this._screenToHalfGrid(x, y);
    if (this.selectedTool === 'move' && touchCount === 1 && y > TOOLBAR_H) {
      const idx = this._findObjectAt(halfTouch.gx, halfTouch.gy);
      if (idx >= 0) {
        this._pushHistory();
        this.movingObj = { ...this.objects[idx] };
        this.movingObjIndex = idx;
        this.touchPaintPending = false;
        return;
      }
    }

    // Platform/Slope tool: start drag on touch
    if ((this.selectedTool === 'platform' || this.selectedTool === 'slope') && touchCount === 1 && y > TOOLBAR_H) {
      this.dragStart = { gx: grid.gx, gy: grid.gy };
      this.dragWidth = 1;
      this.dragHeight = 1;
      this.dragMinGx = grid.gx;
      this.dragMinGy = grid.gy;
      this.touchPaintPending = false;
      return;
    }

    // In paint swipe mode, swiping places/erases objects instead of scrolling
    const paintableTools = ['spike', 'saw', 'orb', 'pad', 'checkpoint', 'end', 'coin', 'color_trigger'];
    const eraseSwipe = this.swipeMode === 'paint' && this.selectedTool === 'erase';
    const paintSwipe = this.swipeMode === 'paint' && paintableTools.includes(this.selectedTool);
    if (touchCount === 1 && y > TOOLBAR_H && (paintSwipe || eraseSwipe)) {
      this.touchPaintPending = true;
    } else {
      this.touchPaintPending = false;
    }
  }

  handleTouchMove(x, y) {
    // Nav bar dragging
    if (this.navDragging) {
      this._navBarSeek(x);
      return;
    }

    const dx = x - this.touchStartX;
    const dy = y - this.touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Update hover
    this.mouseX = x;
    this.mouseY = y;
    const grid = this._screenToGrid(x, y);
    this.hoverGx = grid.gx;
    this.hoverGy = grid.gy;

    // Move tool: drag object with finger
    if (this.movingObj) {
      const half = this._screenToHalfGrid(x, y);
      this.movingObj.x = half.gx;
      this.movingObj.y = half.gy;
      this.objects[this.movingObjIndex] = { ...this.movingObj };
      this._rebuildLive();
      this.touchMoved = true;
      return;
    }

    // If paint pending and moved enough, start painting/erasing instead of scrolling
    if (this.touchPaintPending && dist > 15) {
      this.touchPaintPending = false;
      this.painting = true;
      this.paintErase = this.selectedTool === 'erase';
      // Place/erase first object at start position
      const startGrid = this._screenToGrid(this.touchStartX, this.touchStartY);
      if (this.paintErase) {
        const half = this._screenToHalfGrid(this.touchStartX, this.touchStartY);
        this._removeObjectAt(half.gx, half.gy);
      } else {
        this._placeObject(startGrid.gx, startGrid.gy);
      }
      this.lastPaintGx = startGrid.gx;
      this.lastPaintGy = startGrid.gy;
      this.touchMoved = true;
    }

    // Paint mode: place/erase objects on each new grid cell
    if (this.painting && (grid.gx !== this.lastPaintGx || grid.gy !== this.lastPaintGy)) {
      if (this.paintErase) {
        const half = this._screenToHalfGrid(x, y);
        this._removeObjectAt(half.gx, half.gy);
      } else {
        this._placeObject(grid.gx, grid.gy);
      }
      this.lastPaintGx = grid.gx;
      this.lastPaintGy = grid.gy;
      return;
    }

    // Platform drag takes priority over scrolling
    if (this.dragStart) {
      this.touchMoved = true;
      const minGx = Math.min(this.dragStart.gx, this.hoverGx);
      const maxGx = Math.max(this.dragStart.gx, this.hoverGx);
      const minGy = Math.min(this.dragStart.gy, this.hoverGy);
      const maxGy = Math.max(this.dragStart.gy, this.hoverGy);
      this.dragMinGx = minGx;
      this.dragMinGy = minGy;
      this.dragWidth = maxGx - minGx + 1;
      this.dragHeight = maxGy - minGy + 1;
      return;
    }

    // If moved more than 15px and not painting, treat as scroll
    if (!this.painting && dist > 15) {
      this.touchMoved = true;
      this.isTouchScrolling = true;
      this.cameraX = Math.max(0, this.touchStartCamX - dx);
    }
  }

  handleTouchEnd() {
    this.touchPaintPending = false;

    if (this.navDragging) {
      this.navDragging = false;
      return;
    }

    if (this.movingObj) {
      this.movingObj = null;
      this.movingObjIndex = -1;
      return;
    }

    if (this.painting) {
      this.painting = false;
      this.paintErase = false;
      return;
    }

    if (this.isTouchScrolling) {
      // Was scrolling, don't place anything
      this.isTouchScrolling = false;
      return;
    }

    // Finalize platform/slope drag (tap or drag)
    if (this.dragStart) {
      const minGx = this.dragMinGx != null ? this.dragMinGx : this.dragStart.gx;
      const minGy = this.dragMinGy != null ? this.dragMinGy : this.dragStart.gy;
      const w = this.dragWidth || 1;
      const h = this.dragHeight || 1;
      this._pushHistory();
      if (this.selectedTool === 'slope') {
        this.objects.push({
          type: 'slope', x: minGx, y: minGy, w, h, direction: this.subType || 'up',
        });
      } else {
        this.objects.push({
          type: 'platform', x: minGx, y: minGy, w, h,
        });
      }
      this._rebuildLive();
      this.dragStart = null;
      return;
    }

    if (this.touchMoved) return;

    // Tap = click at the touch position
    this.handleMouseDown(this.touchStartX, this.touchStartY, 0);
  }

  handleWheel(e) {
    if (this.browsing) {
      this.browseScroll = Math.max(0, this.browseScroll + (e.deltaY || 0));
      return;
    }
    this.cameraX = Math.max(0, this.cameraX + (e.deltaX || e.deltaY));
  }

  // === UPDATE / DRAW ===

  update(dt) {
    if (this.scrollSpeed !== 0) {
      this.cameraX = Math.max(0, this.cameraX + this.scrollSpeed);
    }
    if (this.toastTimer > 0) this.toastTimer -= dt;
  }

  draw(ctx) {
    if (this.browsing) {
      this._drawBrowse(ctx);
      return;
    }
    // Background + ground
    this.renderer.drawBackground(ctx, this.cameraX, this.theme);
    this.renderer.drawGround(ctx, this.cameraX, this.theme);

    // Grid lines
    this._drawGrid(ctx);

    // Live obstacles
    const editorCamX = this.cameraX + PLAYER_X_OFFSET;
    for (const obs of this.liveObstacles) {
      if (obs.type === 'color_trigger' && obs.drawEditor) {
        obs.drawEditor(ctx, editorCamX);
      } else {
        obs.draw(ctx, editorCamX, this.theme);
      }
    }

    // Start position marker
    if (this.startPos) {
      const { sx, sy } = this._gridToScreen(this.startPos.gx, this.startPos.gy);
      ctx.save();
      // Green flag pole
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy + GRID);
      ctx.lineTo(sx + 4, sy - 4);
      ctx.stroke();
      // Flag triangle
      ctx.fillStyle = '#00FF88';
      ctx.beginPath();
      ctx.moveTo(sx + 6, sy - 2);
      ctx.lineTo(sx + 28, sy + 10);
      ctx.lineTo(sx + 6, sy + 18);
      ctx.closePath();
      ctx.fill();
      // Label
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#00FF88';
      ctx.textAlign = 'center';
      ctx.fillText('START', sx + GRID / 2, sy - 8);
      ctx.restore();
    }

    // Moving platform end indicator
    if (this.movingEndMode && this.movingStart) {
      this._drawMovingPreview(ctx);
    }

    // Drag preview
    if (this.dragStart) {
      this._drawDragPreview(ctx);
    }

    // Move preview - show object following cursor
    if (this.movingObj && this.mouseY > TOOLBAR_H) {
      const { sx, sy } = this._gridToScreen(this.hoverGx, this.hoverGy);
      ctx.save();
      ctx.globalAlpha = 0.6;
      const tool = TOOLS.find(t => t.id === this.movingObj.type);
      ctx.fillStyle = tool ? tool.color : '#FFF';
      ctx.fillRect(sx, sy, GRID, GRID);
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx, sy, GRID, GRID);
      ctx.setLineDash([]);
      ctx.fillStyle = '#FFF';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.9;
      ctx.fillText(this.movingObj.type, sx + GRID / 2, sy + GRID / 2 + 3);
      ctx.restore();
    }

    // Hover preview
    if (!this.dragStart && !this.movingObj && !this.showHelp && this.mouseY > TOOLBAR_H) {
      this._drawHoverPreview(ctx);
    }

    // Toolbar
    this._drawToolbar(ctx);

    // Side panel
    if (this._hasSidePanel()) {
      this._drawSidePanel(ctx);
    }

    // Navigation bar (minimap)
    this._drawNavBar(ctx);

    // Bottom bar
    this._drawBottomBar(ctx);

    // Help overlay
    if (this.showHelp) {
      this._drawHelp(ctx);
    }

    // Info overlay
    if (this.showInfo) {
      this._drawInfo(ctx);
    }

    // Official level picker dialog
    if (this.officialPicker) {
      this._drawOfficialPicker(ctx);
    }

    // Toast notification
    if (this.toastTimer > 0) {
      const alpha = Math.min(1, this.toastTimer * 2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      const tw = ctx.measureText(this.toastText).width + 40;
      const tx = (SCREEN_WIDTH - tw) / 2;
      ctx.fillRect(tx, SCREEN_HEIGHT / 2 - 20, tw, 40);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.toastText, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 6);
      ctx.restore();
    }
  }

  // === GRID HELPERS ===

  _screenToGrid(sx, sy) {
    const worldX = sx + this.cameraX;
    const gx = Math.floor(worldX / GRID);
    const gy = Math.floor((GROUND_Y - sy) / GRID);
    return { gx, gy };
  }

  _screenToHalfGrid(sx, sy) {
    const worldX = sx + this.cameraX;
    const half = GRID / 2;
    const gx = Math.round(worldX / half) * 0.5;
    const gy = Math.round((GROUND_Y - sy) / half) * 0.5;
    return { gx, gy };
  }

  _gridToScreen(gx, gy) {
    const sx = gx * GRID - this.cameraX;
    const sy = GROUND_Y - (gy + 1) * GRID;
    return { sx, sy };
  }

  // === OBJECT MANAGEMENT ===

  _placeObject(gx, gy) {
    // Start position is special - only one allowed, not an object
    if (this.selectedTool === 'start') {
      if (this.startPos && this.startPos.gx === gx && this.startPos.gy === gy) {
        this.startPos = null;
        this._showToast('Start pos removed');
      } else {
        this.startPos = { gx, gy };
        this._showToast('Start pos set at ' + gx);
      }
      return;
    }

    // Check if object already exists at this position
    const exists = this.objects.find(o => {
      if (o.x !== gx || o.type !== this.selectedTool) return false;
      // Allow stacking portals/color triggers of different subtypes
      if (o.type === 'portal') {
        const newSub = this.subType || 'gravity';
        if (o.portalType !== newSub) return false;
      }
      if (o.type === 'color_trigger') {
        const newSub = this.subType || 'blue';
        if (o.colorType !== newSub) return false;
      }
      let objGy = o.y;
      if (o.type === 'spike' && o.rot === 180) {
        objGy = Math.floor(GROUND_Y / GRID) - o.y - 1;
      }
      return objGy === gy;
    });
    if (exists) return;

    this._pushHistory();

    // End marker is special - only one allowed per level (like start pos)
    if (this.selectedTool === 'end') {
      const oldEnd = this.objects.findIndex(o => o.type === 'end');
      if (oldEnd !== -1) {
        this.objects.splice(oldEnd, 1);
      }
    }

    const obj = { type: this.selectedTool, x: gx, y: gy };

    if (this.selectedTool === 'spike') {
      if (this.rotation !== 0) obj.rot = this.rotation;
      if (this.rotation === 180) {
        // Spike class uses top-down gy for rot=180, convert from ground-relative
        obj.y = Math.floor(GROUND_Y / GRID) - gy - 1;
      }
    }

    if (this.selectedTool === 'orb') {
      obj.orbType = this.subType || 'yellow_orb';
    } else if (this.selectedTool === 'pad') {
      obj.padType = this.subType || 'yellow_pad';
    } else if (this.selectedTool === 'portal') {
      obj.portalType = this.subType || 'gravity';
    } else if (this.selectedTool === 'color_trigger') {
      obj.colorType = this.subType || 'blue';
      if (obj.colorType === 'custom') {
        // Open overlay instead of placing immediately
        this._showCustomColorOverlay(gx, gy, null);
        return;
      }
    } else if (this.selectedTool === 'saw') {
      obj.radius = parseInt(this.subType) || 1;
    }

    this.objects.push(obj);
    this._rebuildLive();
  }

  _findObjectAt(gx, gy) {
    return this.objects.findIndex(o => {
      // Color triggers span full Y — match on X column only
      if (o.type === 'color_trigger') {
        return gx >= o.x - 0.5 && gx < o.x + 1.5;
      }
      // Saw blades use radius for hit area
      if (o.type === 'saw') {
        const r = (o.radius || 1) / 2;
        const cx = o.x + 0.5;
        const cy = o.y + 0.5;
        return gx >= cx - r - 0.5 && gx < cx + r + 0.5 && gy >= cy - r - 0.5 && gy < cy + r + 0.5;
      }
      const ow = Math.max(1, o.w || 1);
      const oh = Math.max(1, o.type === 'portal' ? 3 : (o.h || 1));
      let ox = o.x, oy = o.y;
      if (o.type === 'spike' && o.rot === 180) {
        oy = Math.floor(GROUND_Y / GRID) - o.y - 1;
      }
      return gx >= ox - 0.5 && gx < ox + ow + 0.5 && gy >= oy - 0.5 && gy < oy + oh + 0.5;
    });
  }

  _removeObjectAt(gx, gy) {
    // Check if erasing the start position (use floor to handle half-grid clicks)
    if (this.startPos) {
      const dx = Math.abs(gx - this.startPos.gx);
      const dy = Math.abs(gy - this.startPos.gy);
      if (dx < 1 && dy < 1) {
        this.startPos = null;
        this._showToast('Start pos removed');
        return;
      }
    }

    const idx = this.objects.findIndex(o => {
      if (o.type === 'color_trigger') {
        return gx >= o.x - 0.5 && gx < o.x + 1.5;
      }
      // Saw blades use radius for hit area
      if (o.type === 'saw') {
        const r = (o.radius || 1) / 2;
        const cx = o.x + 0.5;
        const cy = o.y + 0.5;
        return gx >= cx - r - 0.5 && gx < cx + r + 0.5 && gy >= cy - r - 0.5 && gy < cy + r + 0.5;
      }
      const ow = Math.max(1, o.w || 1);
      const oh = Math.max(1, o.type === 'portal' ? 3 : (o.h || 1));
      let ox = o.x, oy = o.y;
      if (o.type === 'spike' && o.rot === 180) {
        oy = Math.floor(GROUND_Y / GRID) - o.y - 1;
      }
      // Bounding box: full object rect + 0.5 padding for easy clicking
      return gx >= ox - 0.5 && gx < ox + ow + 0.5 && gy >= oy - 0.5 && gy < oy + oh + 0.5;
    });
    if (idx >= 0) {
      this._pushHistory();
      this.objects.splice(idx, 1);
      this._rebuildLive();
    }
  }

  _finishMovingPlatform(endGx, endGy) {
    this._pushHistory();
    this.objects.push({
      type: this.selectedTool === 'transport' ? 'transport' : 'moving',
      x: this.movingStart.gx,
      y: this.movingStart.gy,
      w: 3, h: 1,
      endX: endGx,
      endY: endGy,
      speed: 2,
    });
    this._rebuildLive();
    this.movingEndMode = false;
    this.movingStart = null;
  }

  _rebuildLive() {
    this.liveObstacles = [];
    for (const obj of this.objects) {
      const obs = createObstacle(obj);
      if (obs) this.liveObstacles.push(obs);
    }
  }

  // === HISTORY ===

  _pushHistory() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(JSON.stringify(this.objects));
    this.historyIndex = this.history.length - 1;
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  _undo() {
    if (this.historyIndex < 0) return;
    this.objects = JSON.parse(this.history[this.historyIndex]);
    this.historyIndex--;
    this._rebuildLive();
  }

  _redo() {
    if (this.historyIndex >= this.history.length - 2) return;
    this.historyIndex += 2;
    this.objects = JSON.parse(this.history[this.historyIndex]);
    this._rebuildLive();
  }

  // === PERSISTENCE ===

  save(slot) {
    const data = { name: this.levelName, themeId: this.themeId, objects: this.objects };
    localStorage.setItem('gd_editor_' + slot, JSON.stringify(data));
  }

  load(slot) {
    try {
      const raw = localStorage.getItem('gd_editor_' + slot);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.levelName = data.name || 'Custom Level';
      this.themeId = data.themeId || 1;
      this.theme = THEMES[this.themeId];
      this.objects = data.objects || [];
      this._rebuildLive();
      this.history = [];
      this.historyIndex = -1;
      return true;
    } catch { return false; }
  }

  // === SLOT-BASED LEVEL STORAGE ===

  _getSlotList() {
    try {
      const raw = localStorage.getItem('gd_editor_slots');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  _saveSlotList(list) {
    localStorage.setItem('gd_editor_slots', JSON.stringify(list));
  }

  saveToSlot(slotId) {
    const data = {
      name: this.levelName,
      themeId: this.themeId,
      objects: this.objects,
      startPos: this.startPos || null,
      updatedAt: Date.now()
    };
    localStorage.setItem('gd_editor_slot_' + slotId, JSON.stringify(data));

    // Update slot list metadata
    const list = this._getSlotList();
    const idx = list.findIndex(s => s.id === slotId);
    const meta = { id: slotId, name: this.levelName, objectCount: this.objects.length, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = meta;
    else list.push(meta);
    this._saveSlotList(list);
    this.currentSlot = slotId;

    // Sync to cloud in background
    syncEditorLevelToCloud(slotId, data);
  }

  loadFromSlot(slotId) {
    try {
      const raw = localStorage.getItem('gd_editor_slot_' + slotId);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.levelName = data.name || 'Custom Level';
      this.themeId = data.themeId || 1;
      this.theme = THEMES[this.themeId];
      this.objects = data.objects || [];
      this.startPos = data.startPos || null;
      this.editingOfficialId = null;
      this._rebuildLive();
      this.history = [];
      this.historyIndex = -1;
      this.currentSlot = slotId;
      this.cameraX = 0;
      return true;
    } catch { return false; }
  }

  deleteSlot(slotId) {
    localStorage.removeItem('gd_editor_slot_' + slotId);
    const list = this._getSlotList().filter(s => s.id !== slotId);
    this._saveSlotList(list);
    deleteEditorLevelFromCloud(slotId);
  }

  _newLevel() {
    const name = prompt('Level name:', 'My Level');
    if (name == null) return; // cancelled
    this.currentSlot = 'lvl_' + Date.now();
    this.levelName = name.trim() || 'My Level';
    this.themeId = 1;
    this.theme = THEMES[1];
    this.objects = [];
    this.liveObstacles = [];
    this.startPos = null;
    this.editingOfficialId = null;
    this.history = [];
    this.historyIndex = -1;
    this.cameraX = 0;
    this.browsing = false;
  }

  showBrowser(fromMenu = false) {
    this.browsing = true;
    this.browseScroll = 0;
    this.buttons = [];
    if (fromMenu) this.currentSlot = null;
    this._syncCloudLevels();
  }

  async _syncCloudLevels() {
    if (!isConfigured()) return;
    const cloudLevels = await loadEditorLevelsFromCloud();
    if (!cloudLevels) return;

    const localList = this._getSlotList();
    let changed = false;

    for (const cl of cloudLevels) {
      const localIdx = localList.findIndex(s => s.id === cl.slotId);
      const localRaw = localStorage.getItem('gd_editor_slot_' + cl.slotId);
      const localData = localRaw ? JSON.parse(localRaw) : null;

      // Use cloud version if newer or local doesn't exist
      if (!localData || (cl.updatedAt > (localData.updatedAt || 0))) {
        const data = {
          name: cl.name,
          themeId: cl.themeId,
          objects: cl.objects,
          startPos: localData?.startPos || null, // preserve local startPos
          updatedAt: cl.updatedAt
        };
        localStorage.setItem('gd_editor_slot_' + cl.slotId, JSON.stringify(data));
        const meta = { id: cl.slotId, name: cl.name, objectCount: cl.objectCount, updatedAt: cl.updatedAt };
        if (localIdx >= 0) localList[localIdx] = meta;
        else localList.push(meta);
        changed = true;
      }
    }

    if (changed) this._saveSlotList(localList);
  }

  loadExistingLevel(levelData, officialId = null) {
    this.objects = JSON.parse(JSON.stringify(levelData.objects));
    this.levelName = levelData.name;
    this.editingOfficialId = officialId; // track which official level is being edited
    this.themeId = levelData.themeId || officialId || 1;
    this.theme = THEMES[this.themeId] || THEMES[1];
    this.browsing = false;
    this._rebuildLive();
    this.history = [];
    this.historyIndex = -1;
    this.cameraX = 0;
  }

  exportJSON() {
    const data = this.getLevelData();
    return JSON.stringify(data, null, 2);
  }

  getLevelData() {
    const data = {
      id: 99,
      name: this.levelName,
      speed: 1.0,
      objects: [...this.objects],
    };
    if (this.startPos) {
      data.startX = this.startPos.gx;
      data.startY = this.startPos.gy;
    }
    return data;
  }

  // === DRAWING ===

  _drawGrid(ctx) {
    const startGx = Math.floor(this.cameraX / GRID);
    const endGx = startGx + Math.ceil(SCREEN_WIDTH / GRID) + 1;
    const maxGy = Math.floor((GROUND_Y) / GRID);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;

    // Vertical lines (extend below ground)
    for (let gx = startGx; gx <= endGx; gx++) {
      const sx = gx * GRID - this.cameraX;
      ctx.beginPath();
      ctx.moveTo(sx, TOOLBAR_H);
      ctx.lineTo(sx, SCREEN_HEIGHT);
      ctx.stroke();
    }

    // Horizontal lines (above and below ground)
    for (let gy = -5; gy <= maxGy; gy++) {
      const sy = GROUND_Y - gy * GRID;
      if (sy < TOOLBAR_H) break;
      if (sy > SCREEN_HEIGHT) continue;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(SCREEN_WIDTH, sy);
      ctx.stroke();
    }

    // X-axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let gx = startGx; gx <= endGx; gx++) {
      if (gx % 10 === 0) {
        const sx = gx * GRID - this.cameraX;
        ctx.fillText(`${gx}`, sx, GROUND_Y + 14);
      }
    }
  }

  _editorRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _drawToolbar(ctx) {
    this.buttons = [];

    // Background with subtle gradient
    const tbGrad = ctx.createLinearGradient(0, 0, 0, TOOLBAR_H);
    tbGrad.addColorStop(0, 'rgba(10,10,20,0.95)');
    tbGrad.addColorStop(1, 'rgba(5,5,15,0.9)');
    ctx.fillStyle = tbGrad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, TOOLBAR_H);
    // Bottom accent line
    ctx.fillStyle = 'rgba(0,200,255,0.15)';
    ctx.fillRect(0, TOOLBAR_H - 1, SCREEN_WIDTH, 1);

    const btnH = 40;
    const btnY = 8;
    const gap = 3;
    const margin = 8;
    const r = 6;

    const actions = [
      { id: 'action_rotate', label: 'ROT', color: '#888' },
      { id: 'action_undo', label: '←', color: '#555' },
      { id: 'action_redo', label: '→', color: '#555' },
      { id: 'action_test', label: 'TEST', color: '#00CC44' },
      { id: 'action_save', label: 'SAVE', color: '#4488CC' },
      { id: 'action_load', label: 'LOAD', color: '#6644AA' },
      { id: 'action_music', label: this._hasSlotMusic() ? '♫ ✓' : '♫', color: this._hasSlotMusic() ? '#FF66AA' : '#886699' },
      { id: 'action_export', label: 'EXP', color: '#CC8800' },
      ...(isAdmin() ? [{ id: 'action_save_official', label: 'OFFICIAL', color: '#FF4400' }] : []),
      { id: 'action_rename', label: 'NAME', color: '#AAAA44' },
      { id: 'action_info', label: 'INFO', color: '#44AACC' },
      { id: 'action_help', label: '?', color: '#666' },
      { id: 'action_back', label: 'EXIT', color: '#CC3333' },
    ];

    // Calculate responsive button width
    const totalItems = TOOLS.length + actions.length;
    const totalGaps = (TOOLS.length - 1 + actions.length - 1 + 1) * gap;
    const separatorGap = 12;
    const availW = SCREEN_WIDTH - margin * 2 - totalGaps - separatorGap;
    const btnW = Math.min(64, Math.floor(availW / totalItems));

    // Tool buttons
    for (let i = 0; i < TOOLS.length; i++) {
      const tool = TOOLS[i];
      const bx = margin + i * (btnW + gap);
      const isActive = this.selectedTool === tool.id;

      this._editorRoundRect(ctx, bx, btnY, btnW, btnH, r);
      if (isActive) {
        ctx.fillStyle = tool.color;
        ctx.fill();
        // Inner darkening
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();
        // Glow border
        ctx.save();
        ctx.shadowColor = tool.color;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = tool.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
      }

      ctx.fillStyle = isActive ? '#FFF' : '#999';
      ctx.font = `bold ${Math.min(11, Math.max(8, btnW / 6))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(tool.label, bx + btnW / 2, btnY + 16);

      ctx.fillStyle = isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
      ctx.font = '9px monospace';
      ctx.fillText(tool.key, bx + btnW / 2, btnY + 32);

      this.buttons.push({ id: 'tool_' + tool.id, x: bx, y: btnY, w: btnW, h: btnH });
    }

    // Action buttons from right
    let ax = SCREEN_WIDTH - margin - actions.length * (btnW + gap) + gap;
    for (const act of actions) {
      this._editorRoundRect(ctx, ax, btnY, btnW, btnH, r);
      ctx.fillStyle = act.color;
      ctx.fill();
      // Top highlight
      ctx.globalAlpha = 0.15;
      this._editorRoundRect(ctx, ax, btnY, btnW, btnH / 2, r);
      ctx.fillStyle = '#FFF';
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#FFF';
      ctx.font = `bold ${Math.min(11, Math.max(8, btnW / 5))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(act.label, ax + btnW / 2, btnY + 24);
      this.buttons.push({ id: act.id, x: ax, y: btnY, w: btnW, h: btnH });
      ax += btnW + gap;
    }
  }

  _hasSidePanel() {
    return SUBTYPES[this.selectedTool] !== undefined;
  }

  _drawSidePanel(ctx) {
    const subtypes = SUBTYPES[this.selectedTool];
    if (!subtypes) return;

    const px = SCREEN_WIDTH - PANEL_W;
    const py = TOOLBAR_H + 10;
    const panelH = subtypes.length * 40 + 34;
    const r = 10;

    // Panel background with rounded corners (left side only)
    this._editorRoundRect(ctx, px - 4, py, PANEL_W + 4, panelH, r);
    ctx.fillStyle = 'rgba(5,5,20,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,200,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SUBTYPE', px + PANEL_W / 2, py + 16);

    for (let i = 0; i < subtypes.length; i++) {
      const st = subtypes[i];
      const by = py + 26 + i * 36;
      const isActive = this.subType === st || (!this.subType && i === 0);
      const bx = px + 10;
      const bw = PANEL_W - 20;

      this._editorRoundRect(ctx, bx, by, bw, 30, 6);
      ctx.fillStyle = isActive ? SUBTYPE_COLORS[st] : 'rgba(255,255,255,0.08)';
      ctx.fill();

      if (isActive) {
        ctx.save();
        ctx.shadowColor = SUBTYPE_COLORS[st];
        ctx.shadowBlur = 6;
        ctx.strokeStyle = SUBTYPE_COLORS[st];
        ctx.lineWidth = 1.5;
        this._editorRoundRect(ctx, bx, by, bw, 30, 6);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = isActive ? '#000' : '#BBB';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(st.replace('_', ' '), px + PANEL_W / 2, by + 19);

      this.buttons.push({ id: 'sub_' + st, x: bx, y: by, w: bw, h: 30 });
    }
  }

  _getNavBarMetrics() {
    // Determine the level extent (rightmost object + some padding)
    let maxGx = Math.ceil(SCREEN_WIDTH / GRID);
    for (const o of this.objects) {
      const right = o.x + (o.w || 1);
      if (right > maxGx) maxGx = right;
    }
    if (this.startPos && this.startPos.gx + 1 > maxGx) maxGx = this.startPos.gx + 1;
    maxGx += Math.ceil(SCREEN_WIDTH / GRID); // padding so you can scroll past end

    const barY = SCREEN_HEIGHT - 36 - NAV_BAR_H - NAV_BAR_PAD;
    const barX = 10;
    const barW = SCREEN_WIDTH - 20;
    const totalWorldW = maxGx * GRID;
    const viewportFrac = SCREEN_WIDTH / totalWorldW;
    const thumbW = Math.max(20, barW * viewportFrac);
    const scrollFrac = this.cameraX / Math.max(1, totalWorldW - SCREEN_WIDTH);
    const thumbX = barX + scrollFrac * (barW - thumbW);

    return { barX, barY, barW, totalWorldW, thumbW, thumbX };
  }

  _drawNavBar(ctx) {
    const { barX, barY, barW, totalWorldW, thumbW, thumbX } = this._getNavBarMetrics();

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this._editorRoundRect(ctx, barX, barY, barW, NAV_BAR_H, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    this._editorRoundRect(ctx, barX, barY, barW, NAV_BAR_H, 4);
    ctx.stroke();

    // Draw object dots on the minimap
    for (const o of this.objects) {
      const ox = o.x * GRID;
      const frac = ox / totalWorldW;
      const dx = barX + frac * barW;
      if (dx < barX || dx > barX + barW) continue;

      const tool = TOOLS.find(t => t.id === o.type);
      ctx.fillStyle = tool ? tool.color : '#888';
      ctx.globalAlpha = 0.7;
      const dotW = Math.max(2, ((o.w || 1) * GRID / totalWorldW) * barW);
      ctx.fillRect(dx, barY + 4, dotW, NAV_BAR_H - 8);
      ctx.globalAlpha = 1;
    }

    // Start pos marker
    if (this.startPos) {
      const frac = (this.startPos.gx * GRID) / totalWorldW;
      const dx = barX + frac * barW;
      ctx.fillStyle = '#00FF88';
      ctx.globalAlpha = 0.9;
      ctx.fillRect(dx, barY + 2, 3, NAV_BAR_H - 4);
      ctx.globalAlpha = 1;
    }

    // Viewport thumb
    ctx.fillStyle = 'rgba(0,200,255,0.25)';
    this._editorRoundRect(ctx, thumbX, barY + 1, thumbW, NAV_BAR_H - 2, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,200,255,0.6)';
    ctx.lineWidth = 1;
    this._editorRoundRect(ctx, thumbX, barY + 1, thumbW, NAV_BAR_H - 2, 3);
    ctx.stroke();

    // Register hit area
    this.buttons.push({ id: 'navbar', x: barX, y: barY, w: barW, h: NAV_BAR_H });
  }

  _navBarSeek(x) {
    const { barX, barW, totalWorldW, thumbW } = this._getNavBarMetrics();
    const maxScroll = totalWorldW - SCREEN_WIDTH;
    if (maxScroll <= 0) return;
    const frac = (x - barX - thumbW / 2) / (barW - thumbW);
    this.cameraX = Math.max(0, Math.min(maxScroll, frac * maxScroll));
  }

  _drawBottomBar(ctx) {
    const y = SCREEN_HEIGHT - 36;
    const bbGrad = ctx.createLinearGradient(0, y, 0, SCREEN_HEIGHT);
    bbGrad.addColorStop(0, 'rgba(5,5,15,0.85)');
    bbGrad.addColorStop(1, 'rgba(10,10,20,0.9)');
    ctx.fillStyle = bbGrad;
    ctx.fillRect(0, y, SCREEN_WIDTH, 36);
    // Top accent line
    ctx.fillStyle = 'rgba(0,200,255,0.1)';
    ctx.fillRect(0, y, SCREEN_WIDTH, 1);

    const scrollBtnW = 44;
    const scrollBtnH = 28;
    const sby = y + 4;
    const btnGap = 6;
    const smallBtnW = 32;
    const r = 5;

    // Left side: scroll buttons + info
    this._editorRoundRect(ctx, 10, sby, scrollBtnW, scrollBtnH, r);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    ctx.fillStyle = '#AAA';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◀', 10 + scrollBtnW / 2, sby + 20);
    this.buttons.push({ id: 'scroll_left', x: 10, y: sby, w: scrollBtnW, h: scrollBtnH });

    this._editorRoundRect(ctx, 60, sby, scrollBtnW, scrollBtnH, r);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    ctx.fillStyle = '#AAA';
    ctx.fillText('▶', 60 + scrollBtnW / 2, sby + 20);
    this.buttons.push({ id: 'scroll_right', x: 60, y: sby, w: scrollBtnW, h: scrollBtnH });

    // Swipe mode toggle (paint vs scroll)
    const swipeBtnW = 52;
    const swipeX = 60 + scrollBtnW + btnGap;
    const isPaint = this.swipeMode === 'paint';
    this._editorRoundRect(ctx, swipeX, sby, swipeBtnW, scrollBtnH, r);
    ctx.fillStyle = isPaint ? '#FF6600' : 'rgba(255,255,255,0.1)';
    ctx.fill();
    if (isPaint) {
      ctx.save();
      ctx.shadowColor = '#FF6600';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#FF6600';
      ctx.lineWidth = 1;
      this._editorRoundRect(ctx, swipeX, sby, swipeBtnW, scrollBtnH, r);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = isPaint ? '#FFF' : '#888';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isPaint ? 'PAINT' : 'MOVE', swipeX + swipeBtnW / 2, sby + 12);
    ctx.font = '8px monospace';
    ctx.fillText('swipe', swipeX + swipeBtnW / 2, sby + 23);
    this.buttons.push({ id: 'action_swipe', x: swipeX, y: sby, w: swipeBtnW, h: scrollBtnH });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Obj: ${this.objects.length}  X: ${this.hoverGx}  Y: ${this.hoverGy}`, swipeX + swipeBtnW + 10, sby + 19);

    // Right side: L1 L2 L3 | T1 T2 T3
    let rx = SCREEN_WIDTH - 10;

    // Theme buttons (rightmost)
    for (let t = 3; t >= 1; t--) {
      rx -= smallBtnW;
      const isActive = this.themeId === t;
      this._editorRoundRect(ctx, rx, sby, smallBtnW, scrollBtnH, r);
      if (isActive) {
        ctx.fillStyle = THEMES[t].accent;
        ctx.fill();
        ctx.save();
        ctx.shadowColor = THEMES[t].accent;
        ctx.shadowBlur = 5;
        ctx.strokeStyle = THEMES[t].accent;
        ctx.lineWidth = 1;
        this._editorRoundRect(ctx, rx, sby, smallBtnW, scrollBtnH, r);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
      }
      ctx.fillStyle = isActive ? '#000' : '#888';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`T${t}`, rx + smallBtnW / 2, sby + 19);
      this.buttons.push({ id: 'theme_' + t, x: rx, y: sby, w: smallBtnW, h: scrollBtnH });
      rx -= btnGap;
    }

    rx -= 8;

    // Load level buttons
    for (let l = 3; l >= 1; l--) {
      rx -= smallBtnW;
      this._editorRoundRect(ctx, rx, sby, smallBtnW, scrollBtnH, r);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = '#777';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`L${l}`, rx + smallBtnW / 2, sby + 19);
      this.buttons.push({ id: 'loadlevel_' + l, x: rx, y: sby, w: smallBtnW, h: scrollBtnH });
      rx -= btnGap;
    }
  }

  _drawHoverPreview(ctx) {
    if (this.selectedTool === 'erase') return;
    if (this.hoverGx < 0 || this.hoverGy < 0) return;

    const { sx, sy } = this._gridToScreen(this.hoverGx, this.hoverGy);

    ctx.save();
    ctx.globalAlpha = 0.4;

    if (this.selectedTool === 'spike') {
      ctx.fillStyle = '#FF4444';
      ctx.save();
      ctx.translate(sx + GRID / 2, sy + GRID / 2);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, -GRID / 2 + 2);
      ctx.lineTo(-GRID / 2 + 4, GRID / 2 - 2);
      ctx.lineTo(GRID / 2 - 4, GRID / 2 - 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (this.selectedTool === 'platform') {
      ctx.fillStyle = '#4488FF';
      ctx.fillRect(sx, sy, GRID, GRID);
    } else if (this.selectedTool === 'orb') {
      ctx.fillStyle = SUBTYPE_COLORS[this.subType || 'yellow_orb'];
      ctx.beginPath();
      ctx.arc(sx + GRID / 2, sy + GRID / 2, GRID / 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.selectedTool === 'pad') {
      ctx.fillStyle = SUBTYPE_COLORS[this.subType || 'yellow_pad'];
      ctx.beginPath();
      ctx.moveTo(sx + 5, sy + GRID);
      ctx.lineTo(sx + GRID / 2, sy + GRID / 2);
      ctx.lineTo(sx + GRID - 5, sy + GRID);
      ctx.closePath();
      ctx.fill();
    } else if (this.selectedTool === 'portal') {
      ctx.strokeStyle = SUBTYPE_COLORS[this.subType || 'gravity'];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sx + GRID / 2, sy - GRID / 2, GRID / 2, GRID * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.selectedTool === 'coin') {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(sx + GRID / 2, sy + GRID / 2, GRID * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', sx + GRID / 2, sy + GRID / 2);
    } else if (this.selectedTool === 'checkpoint') {
      ctx.fillStyle = '#00FF44';
      ctx.fillRect(sx, sy, 4, GRID * 2);
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy);
      ctx.lineTo(sx + 28, sy + 14);
      ctx.lineTo(sx + 4, sy + 28);
      ctx.closePath();
      ctx.fill();
    } else if (this.selectedTool === 'end') {
      ctx.fillStyle = '#00FFFF';
      ctx.fillRect(sx, 0, GRID, GROUND_Y);
    } else if (this.selectedTool === 'moving') {
      ctx.fillStyle = '#44AAFF';
      ctx.fillRect(sx, sy, GRID * 3, GRID);
      ctx.fillStyle = '#FFF';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Click start', sx + GRID * 1.5, sy + GRID / 2 + 4);
    } else if (this.selectedTool === 'color_trigger') {
      const ctColor = SUBTYPE_COLORS[this.subType || 'blue'];
      ctx.strokeStyle = ctColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx + GRID / 2, sy);
      ctx.lineTo(sx + GRID, sy + GRID);
      ctx.lineTo(sx + GRID / 2, sy + GRID * 2);
      ctx.lineTo(sx, sy + GRID);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('C', sx + GRID / 2, sy + GRID);
    } else if (this.selectedTool === 'saw') {
      const sawRadius = (parseInt(this.subType) || 1) * GRID / 2;
      const sawColor = SUBTYPE_COLORS[this.subType || '1'] || '#FF6666';
      ctx.strokeStyle = sawColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + GRID / 2, sy + GRID / 2, sawRadius, 0, Math.PI * 2);
      ctx.stroke();
      // X through the circle
      ctx.beginPath();
      ctx.moveTo(sx + GRID / 2 - sawRadius * 0.6, sy + GRID / 2 - sawRadius * 0.6);
      ctx.lineTo(sx + GRID / 2 + sawRadius * 0.6, sy + GRID / 2 + sawRadius * 0.6);
      ctx.moveTo(sx + GRID / 2 + sawRadius * 0.6, sy + GRID / 2 - sawRadius * 0.6);
      ctx.lineTo(sx + GRID / 2 - sawRadius * 0.6, sy + GRID / 2 + sawRadius * 0.6);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawDragPreview(ctx) {
    const minGx = this.dragMinGx != null ? this.dragMinGx : this.dragStart.gx;
    const minGy = this.dragMinGy != null ? this.dragMinGy : this.dragStart.gy;
    const topGy = minGy + this.dragHeight - 1;
    const { sx, sy } = this._gridToScreen(minGx, topGy);
    const w = this.dragWidth * GRID;
    const h = this.dragHeight * GRID;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#4488FF';
    ctx.fillRect(sx, sy, w, h);
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, w, h);

    ctx.fillStyle = '#FFF';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.8;
    ctx.fillText(`${this.dragWidth}×${this.dragHeight}`, sx + w / 2, sy + h / 2 + 4);
    ctx.restore();
  }

  _drawMovingPreview(ctx) {
    const start = this._gridToScreen(this.movingStart.gx, this.movingStart.gy);
    const end = this._gridToScreen(this.hoverGx, this.hoverGy);

    ctx.save();
    ctx.globalAlpha = 0.5;

    // Start platform
    ctx.fillStyle = '#44AAFF';
    ctx.fillRect(start.sx, start.sy, GRID * 3, GRID);

    // End position
    ctx.fillStyle = '#44FFAA';
    ctx.fillRect(end.sx, end.sy, GRID * 3, GRID);

    // Dashed line between
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(start.sx + GRID * 1.5, start.sy + GRID / 2);
    ctx.lineTo(end.sx + GRID * 1.5, end.sy + GRID / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#FFF';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Click end position', end.sx + GRID * 1.5, end.sy - 8);

    ctx.restore();
  }

  _calculateLevelInfo() {
    // Sort objects by x position
    const sorted = [...this.objects].sort((a, b) => a.x - b.x);

    // Find end marker
    const endObj = sorted.find(o => o.type === 'end');
    const endX = endObj ? endObj.x * GRID : (sorted.length > 0 ? (sorted[sorted.length - 1].x + 1) * GRID : 0);

    // Simulate horizontal traversal
    let playerX = 0;
    let speedMult = 1.0;
    let totalFrames = 0;

    // Collect speed portals and transports sorted by pixel X
    const events = [];
    for (const o of sorted) {
      if (o.type === 'portal' && o.portalType === 'speed_up') {
        events.push({ x: o.x * GRID, type: 'speed', value: 1.4 });
      } else if (o.type === 'portal' && o.portalType === 'speed_down') {
        events.push({ x: o.x * GRID, type: 'speed', value: 1.0 });
      } else if (o.type === 'transport') {
        const startPx = o.x * GRID;
        const endPx = (o.endX != null ? o.endX : o.x) * GRID;
        const dy = ((o.endY != null ? o.endY : o.y) - o.y) * GRID;
        const dx = endPx - startPx;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const spd = (o.speed || 2) * 1.5;
        const frames = dist / spd;
        const waitFrames = 12;
        events.push({ x: startPx, type: 'transport', endX: endPx, frames, waitFrames });
      }
    }
    events.sort((a, b) => a.x - b.x);

    let evtIdx = 0;
    while (playerX < endX) {
      // Check if we hit an event before endX
      if (evtIdx < events.length && events[evtIdx].x <= playerX) {
        const evt = events[evtIdx];
        evtIdx++;
        if (evt.type === 'speed') {
          speedMult = evt.value;
        } else if (evt.type === 'transport') {
          // Transport: player is locked during transport
          totalFrames += evt.waitFrames + evt.frames;
          playerX = evt.endX;
          continue;
        }
      }
      // Move forward one frame
      const nextEvtX = evtIdx < events.length ? events[evtIdx].x : endX;
      const targetX = Math.min(nextEvtX, endX);
      const dist = targetX - playerX;
      if (dist <= 0) { evtIdx++; continue; }
      const speed = SCROLL_SPEED * speedMult;
      const frames = dist / speed;
      totalFrames += frames;
      playerX = targetX;
    }

    const seconds = totalFrames / FPS;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    // Count objects by type
    const counts = {};
    for (const o of this.objects) {
      counts[o.type] = (counts[o.type] || 0) + 1;
    }

    return {
      duration: seconds,
      durationStr: minutes > 0 ? `${minutes}m ${secs.toFixed(1)}s` : `${secs.toFixed(1)}s`,
      endX: endX / GRID,
      objectCount: this.objects.length,
      counts,
      hasEnd: !!endObj,
    };
  }

  _drawInfo(ctx) {
    const info = this._calculateLevelInfo();

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const panelW = 500;
    const panelH = 380;
    const px = (SCREEN_WIDTH - panelW) / 2;
    const py = (SCREEN_HEIGHT - panelH) / 2;
    const r = 14;

    // Panel background
    this._editorRoundRect(ctx, px, py, panelW, panelH, r);
    ctx.fillStyle = 'rgba(5,10,25,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,170,200,0.3)';
    ctx.lineWidth = 1.5;
    this._editorRoundRect(ctx, px, py, panelW, panelH, r);
    ctx.stroke();

    // Title
    ctx.save();
    ctx.shadowColor = '#44AACC';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#44AACC';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL INFO', SCREEN_WIDTH / 2, py + 45);
    ctx.shadowBlur = 0;
    ctx.restore();

    let sy = py + 85;
    const lx = px + 35;
    const vx = px + panelW - 35;

    const drawRow = (label, value, color = '#EEE') => {
      ctx.fillStyle = '#778899';
      ctx.font = '15px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx, sy);
      ctx.fillStyle = color;
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(value, vx, sy);
      sy += 30;
    };

    // Duration - highlight
    ctx.save();
    ctx.shadowColor = '#44AACC';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#44AACC';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(info.hasEnd ? info.durationStr : '-- no end marker --', SCREEN_WIDTH / 2, sy);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.fillStyle = '#667788';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ESTIMATED DURATION', SCREEN_WIDTH / 2, sy + 18);
    sy += 48;

    // Separator
    ctx.strokeStyle = 'rgba(0,170,200,0.15)';
    ctx.beginPath();
    ctx.moveTo(px + 30, sy - 10);
    ctx.lineTo(px + panelW - 30, sy - 10);
    ctx.stroke();

    // Song duration
    const musicKey = this._getMusicKey();
    const songDur = musicKey ? getCustomMusicDuration(musicKey) : 0;
    if (songDur > 0) {
      const sm = Math.floor(songDur / 60);
      const ss = songDur % 60;
      drawRow('Song Duration', sm > 0 ? `${sm}m ${ss.toFixed(1)}s` : `${ss.toFixed(1)}s`, '#FF66AA');
    } else {
      drawRow('Song Duration', 'No custom music', '#556677');
    }

    drawRow('Level Length', info.endX.toFixed(0) + ' grid units');
    drawRow('Total Objects', String(info.objectCount));

    // Object breakdown
    const typeLabels = {
      spike: 'Spikes', platform: 'Platforms', moving: 'Moving Plats',
      transport: 'Transports', portal: 'Portals', orb: 'Orbs',
      pad: 'Pads', coin: 'Coins', checkpoint: 'Checkpoints',
      color_trigger: 'Color Triggers', end: 'End Markers',
    };
    for (const [type, label] of Object.entries(typeLabels)) {
      if (info.counts[type]) {
        drawRow('  ' + label, String(info.counts[type]), '#AABBCC');
      }
    }

    // Close hint
    ctx.fillStyle = '#556677';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Click anywhere or press ESC to close', SCREEN_WIDTH / 2, py + panelH - 18);
  }

  _drawHelp(ctx) {
    // Dark overlay with blur feel
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Central panel
    const panelW = Math.min(560, SCREEN_WIDTH - 80);
    const panelH = 520;
    const px = (SCREEN_WIDTH - panelW) / 2;
    const py = (SCREEN_HEIGHT - panelH) / 2 - 10;

    // Panel bg with border
    const panelGrad = ctx.createLinearGradient(px, py, px, py + panelH);
    panelGrad.addColorStop(0, 'rgba(15,15,30,0.97)');
    panelGrad.addColorStop(1, 'rgba(8,8,18,0.97)');
    ctx.fillStyle = panelGrad;
    this._editorRoundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fill();

    // Neon border glow
    ctx.shadowColor = '#00C8FF';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(0,200,255,0.5)';
    ctx.lineWidth = 1.5;
    this._editorRoundRect(ctx, px, py, panelW, panelH, 16);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Title with glow
    ctx.shadowColor = '#00C8FF';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EDITOR HELP', SCREEN_WIDTH / 2, py + 45);
    ctx.shadowBlur = 0;

    // Decorative line under title
    const lineGrad = ctx.createLinearGradient(px + 40, 0, px + panelW - 40, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(0.3, 'rgba(0,200,255,0.5)');
    lineGrad.addColorStop(0.7, 'rgba(0,200,255,0.5)');
    lineGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 40, py + 60);
    ctx.lineTo(px + panelW - 40, py + 60);
    ctx.stroke();

    const sections = [
      { title: 'TOOLS', lines: [
        '1-8 : Select tool  |  X : Eraser  |  M : Move',
        'Left Click : Place  |  Right Click : Delete',
        'Platform : Click + drag for width',
        'Moving : Click start, then click end',
      ]},
      { title: 'NAVIGATION', lines: [
        'Mouse Wheel / Arrows : Scroll',
        'Ctrl+Z : Undo  |  Ctrl+Y : Redo',
        'Ctrl+S : Quick save',
      ]},
      { title: 'ACTIONS', lines: [
        'TEST : Play your level',
        'SAVE/LOAD : LocalStorage  |  EXPORT : Copy JSON',
        'L1/L2/L3 : Load level  |  T1/T2/T3 : Theme',
      ]},
    ];

    let sy = py + 80;
    for (const sec of sections) {
      // Section title
      ctx.fillStyle = '#00C8FF';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(sec.title, px + 30, sy);
      sy += 6;

      // Section lines
      ctx.fillStyle = '#BBB';
      ctx.font = '14px monospace';
      for (const line of sec.lines) {
        sy += 22;
        ctx.fillText(line, px + 30, sy);
      }
      sy += 24;
    }

    // Close hint at bottom
    ctx.fillStyle = '#666';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC or H to close', SCREEN_WIDTH / 2, py + panelH - 20);
  }

  // === LEVEL BROWSER ===

  _drawBrowse(ctx) {
    this.buttons = [];

    // Gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    bgGrad.addColorStop(0, '#0a0a18');
    bgGrad.addColorStop(1, '#060612');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Title with neon glow
    ctx.shadowColor = '#00C8FF';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MY LEVELS', SCREEN_WIDTH / 2, 55);
    ctx.shadowBlur = 0;

    // Decorative line
    const lineGrad = ctx.createLinearGradient(SCREEN_WIDTH * 0.2, 0, SCREEN_WIDTH * 0.8, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(0.3, 'rgba(0,200,255,0.4)');
    lineGrad.addColorStop(0.7, 'rgba(0,200,255,0.4)');
    lineGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SCREEN_WIDTH * 0.2, 70);
    ctx.lineTo(SCREEN_WIDTH * 0.8, 70);
    ctx.stroke();

    const slots = this._getSlotList();
    slots.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const cardW = Math.min(500, SCREEN_WIDTH - 60);
    const cardH = 70;
    const gap = 12;
    const startX = (SCREEN_WIDTH - cardW) / 2;
    let startY = 95;

    // "New Level" button with green glow
    const newBtnY = startY;
    ctx.shadowColor = '#00FF66';
    ctx.shadowBlur = 12;
    const newGrad = ctx.createLinearGradient(startX, newBtnY, startX, newBtnY + cardH);
    newGrad.addColorStop(0, '#00CC55');
    newGrad.addColorStop(1, '#009940');
    ctx.fillStyle = newGrad;
    this._editorRoundRect(ctx, startX, newBtnY, cardW, cardH, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Subtle top highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    this._editorRoundRect(ctx, startX, newBtnY, cardW, cardH, 12);
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('+ NEW LEVEL', SCREEN_WIDTH / 2, newBtnY + cardH / 2 + 8);
    this.buttons.push({ id: 'browse_new', x: startX, y: newBtnY, w: cardW, h: cardH });

    startY += cardH + gap * 2;

    if (slots.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '18px monospace';
      ctx.fillText('No saved levels yet', SCREEN_WIDTH / 2, startY + 30);
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const cy = startY + i * (cardH + gap) - this.browseScroll;
      if (cy + cardH < 90 || cy > SCREEN_HEIGHT - 80) continue;

      // Card bg with gradient
      const cardGrad = ctx.createLinearGradient(startX, cy, startX, cy + cardH);
      cardGrad.addColorStop(0, 'rgba(25,25,45,0.95)');
      cardGrad.addColorStop(1, 'rgba(18,18,35,0.95)');
      ctx.fillStyle = cardGrad;
      this._editorRoundRect(ctx, startX, cy, cardW, cardH, 10);
      ctx.fill();

      // Card border with subtle glow
      ctx.strokeStyle = 'rgba(0,200,255,0.2)';
      ctx.lineWidth = 1;
      this._editorRoundRect(ctx, startX, cy, cardW, cardH, 10);
      ctx.stroke();

      // Level name
      ctx.fillStyle = '#EEE';
      ctx.font = 'bold 19px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(slot.name || 'Untitled', startX + 16, cy + 28);

      // Object count + date
      ctx.fillStyle = '#668';
      ctx.font = '13px monospace';
      const objText = (slot.objectCount || 0) + ' objects';
      const dateText = slot.updatedAt ? new Date(slot.updatedAt).toLocaleDateString() : '';
      ctx.fillText(objText + '  •  ' + dateText, startX + 16, cy + 50);

      this.buttons.push({ id: 'browse_open_' + slot.id, x: startX, y: cy, w: cardW - 110, h: cardH });

      // Play button
      const playX = startX + cardW - 100;
      const btnY = cy + 10;
      const btnS = 45;
      const btnH = cardH - 20;
      ctx.shadowColor = '#00FF66';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(0,80,20,0.7)';
      this._editorRoundRect(ctx, playX, btnY, btnS, btnH, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,200,80,0.4)';
      ctx.lineWidth = 1;
      this._editorRoundRect(ctx, playX, btnY, btnS, btnH, 8);
      ctx.stroke();
      ctx.fillStyle = '#44DD44';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▶', playX + btnS / 2, btnY + btnH / 2 + 7);
      this.buttons.push({ id: 'browse_play_' + slot.id, x: playX, y: btnY, w: btnS, h: btnH });

      // Delete button
      const delX = startX + cardW - 50;
      const delY = btnY;
      const delS = 45;
      const delH = btnH;
      ctx.fillStyle = 'rgba(80,10,10,0.7)';
      this._editorRoundRect(ctx, delX, delY, delS, delH, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,50,50,0.3)';
      ctx.lineWidth = 1;
      this._editorRoundRect(ctx, delX, delY, delS, delH, 8);
      ctx.stroke();
      ctx.fillStyle = '#FF5555';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✕', delX + delS / 2, delY + delH / 2 + 7);
      this.buttons.push({ id: 'browse_del_' + slot.id, x: delX, y: delY, w: delS, h: delH });

      ctx.textAlign = 'center';
    }

    // Back button
    const backW = 200;
    const backH = 48;
    const backX = (SCREEN_WIDTH - backW) / 2;
    const backY = SCREEN_HEIGHT - 68;
    const backGrad = ctx.createLinearGradient(backX, backY, backX, backY + backH);
    backGrad.addColorStop(0, 'rgba(50,50,70,0.9)');
    backGrad.addColorStop(1, 'rgba(35,35,55,0.9)');
    ctx.fillStyle = backGrad;
    this._editorRoundRect(ctx, backX, backY, backW, backH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,100,140,0.4)';
    ctx.lineWidth = 1;
    this._editorRoundRect(ctx, backX, backY, backW, backH, 10);
    ctx.stroke();
    ctx.fillStyle = '#CCC';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BACK', SCREEN_WIDTH / 2, backY + backH / 2 + 7);
    this.buttons.push({ id: 'browse_back', x: backX, y: backY, w: backW, h: backH });

    // Delete confirmation dialog overlay
    if (this.confirmDelete) {
      // Dim background
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

      // Dialog box
      const dlgW = Math.min(380, SCREEN_WIDTH - 40);
      const dlgH = 180;
      const dlgX = (SCREEN_WIDTH - dlgW) / 2;
      const dlgY = (SCREEN_HEIGHT - dlgH) / 2;

      const dlgGrad = ctx.createLinearGradient(dlgX, dlgY, dlgX, dlgY + dlgH);
      dlgGrad.addColorStop(0, '#1a1a30');
      dlgGrad.addColorStop(1, '#0e0e20');
      ctx.fillStyle = dlgGrad;
      this._editorRoundRect(ctx, dlgX, dlgY, dlgW, dlgH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,0.4)';
      ctx.lineWidth = 2;
      this._editorRoundRect(ctx, dlgX, dlgY, dlgW, dlgH, 16);
      ctx.stroke();

      // Warning text
      ctx.fillStyle = '#FF6666';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DELETE LEVEL?', SCREEN_WIDTH / 2, dlgY + 40);

      ctx.fillStyle = '#AAB';
      ctx.font = '14px monospace';
      const name = this.confirmDelete.slotName || 'Untitled';
      const displayName = name.length > 25 ? name.slice(0, 22) + '...' : name;
      ctx.fillText('"' + displayName + '"', SCREEN_WIDTH / 2, dlgY + 68);
      ctx.fillStyle = '#778';
      ctx.font = '12px monospace';
      ctx.fillText('This cannot be undone', SCREEN_WIDTH / 2, dlgY + 90);

      // Cancel button
      const cbtnW = (dlgW - 30) / 2;
      const cbtnH = 44;
      const cbtnY = dlgY + dlgH - cbtnH - 18;
      const cancelX = dlgX + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      this._editorRoundRect(ctx, cancelX, cbtnY, cbtnW, cbtnH, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      this._editorRoundRect(ctx, cancelX, cbtnY, cbtnW, cbtnH, 10);
      ctx.stroke();
      ctx.fillStyle = '#CCC';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('CANCEL', cancelX + cbtnW / 2, cbtnY + cbtnH / 2 + 6);
      this.buttons.push({ id: 'confirm_delete_no', x: cancelX, y: cbtnY, w: cbtnW, h: cbtnH });

      // Delete button
      const deleteX = dlgX + dlgW - cbtnW - 10;
      ctx.shadowColor = '#FF3333';
      ctx.shadowBlur = 10;
      const delGrad = ctx.createLinearGradient(deleteX, cbtnY, deleteX, cbtnY + cbtnH);
      delGrad.addColorStop(0, '#DD3333');
      delGrad.addColorStop(1, '#AA2222');
      ctx.fillStyle = delGrad;
      this._editorRoundRect(ctx, deleteX, cbtnY, cbtnW, cbtnH, 10);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('DELETE', deleteX + cbtnW / 2, cbtnY + cbtnH / 2 + 6);
      this.buttons.push({ id: 'confirm_delete_yes', x: deleteX, y: cbtnY, w: cbtnW, h: cbtnH });
    }
  }

  _handleBrowseClick(x, y) {
    // When confirmation dialog is showing, only process dialog buttons
    if (this.confirmDelete) {
      for (const btn of this.buttons) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          if (btn.id === 'confirm_delete_yes') {
            this.deleteSlot(this.confirmDelete.slotId);
            this.confirmDelete = null;
            return;
          } else if (btn.id === 'confirm_delete_no') {
            this.confirmDelete = null;
            return;
          }
        }
      }
      // Click outside dialog = cancel
      this.confirmDelete = null;
      return;
    }

    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.id === 'browse_new') {
          this._newLevel();
        } else if (btn.id === 'browse_back') {
          if (this.currentSlot) {
            this.browsing = false;
          } else if (this.onBack) {
            this.onBack();
          }
        } else if (btn.id.startsWith('browse_play_')) {
          const slotId = btn.id.replace('browse_play_', '');
          if (this.loadFromSlot(slotId)) {
            this.browsing = false;
            if (this.onPlay) this.onPlay(this.getLevelData());
          }
        } else if (btn.id.startsWith('browse_del_')) {
          const slotId = btn.id.replace('browse_del_', '');
          // Show confirmation dialog instead of deleting immediately
          const raw = localStorage.getItem('gd_editor_slot_' + slotId);
          const name = raw ? (JSON.parse(raw).name || 'Untitled') : 'Untitled';
          this.confirmDelete = { slotId, slotName: name };
        } else if (btn.id.startsWith('browse_open_')) {
          const slotId = btn.id.replace('browse_open_', '');
          if (this.loadFromSlot(slotId)) {
            this.browsing = false;
          }
        }
        return;
      }
    }
  }

  // === BUTTON HANDLERS ===

  _collectButtons() {
    // Buttons are collected during draw, but we need them for click handling
    // They persist from the last draw call
  }

  _handleButton(id) {
    if (id.startsWith('tool_')) {
      this.selectedTool = id.replace('tool_', '');
      this.subType = null;
      this.movingEndMode = false;
      this.movingStart = null;
      this.movingObj = null;
      this.movingObjIndex = -1;
    } else if (id.startsWith('sub_')) {
      this.subType = id.replace('sub_', '');
    } else if (id.startsWith('theme_')) {
      this.themeId = parseInt(id.replace('theme_', ''));
      this.theme = THEMES[this.themeId];
    } else if (id === 'scroll_left') {
      this.cameraX = Math.max(0, this.cameraX - GRID * 6);
    } else if (id === 'scroll_right') {
      this.cameraX += GRID * 6;
    } else if (id.startsWith('loadlevel_')) {
      const lvl = parseInt(id.replace('loadlevel_', ''));
      if (this.onLoadLevel) this.onLoadLevel(lvl);
    } else if (id === 'action_swipe') {
      this.swipeMode = this.swipeMode === 'scroll' ? 'paint' : 'scroll';
    } else if (id === 'action_rotate') {
      this._cycleRotation();
    } else if (id === 'action_undo') {
      this._undo();
    } else if (id === 'action_redo') {
      this._redo();
    } else if (id === 'action_test') {
      if (this.onTest) this.onTest(this.getLevelData());
    } else if (id === 'action_save') {
      if (this.currentSlot) {
        this.saveToSlot(this.currentSlot);
        this._showToast('Saved!');
      } else {
        this.currentSlot = 'lvl_' + Date.now();
        this.saveToSlot(this.currentSlot);
        this._showToast('Saved!');
      }
    } else if (id === 'action_save_official') {
      if (isAdmin()) {
        // Save current level first
        if (this.currentSlot && this.objects.length > 0) {
          this.saveToSlot(this.currentSlot);
        }
        this.officialPicker = true;
      }
    } else if (id === 'action_load') {
      this.showBrowser();
    } else if (id === 'action_music') {
      this._handleMusicButton();
    } else if (id === 'action_export') {
      const json = this.exportJSON();
      navigator.clipboard?.writeText(json).then(() => {
        // Copied!
      }).catch(() => {
        prompt('Copy level JSON:', json);
      });
    } else if (id === 'action_rename') {
      const name = prompt('Level name:', this.levelName);
      if (name != null && name.trim()) {
        this.levelName = name.trim();
        this._showToast('Renamed to "' + this.levelName + '"');
      }
    } else if (id === 'action_info') {
      this.showInfo = !this.showInfo;
    } else if (id === 'action_help') {
      this.showHelp = !this.showHelp;
    } else if (id === 'action_back') {
      // Auto-save before leaving
      if (this.currentSlot && this.objects.length > 0) {
        this.saveToSlot(this.currentSlot);
      }
      if (this.onBack) this.onBack();
    }
  }

  _drawOfficialPicker(ctx) {
    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Dialog box
    const dlgW = Math.min(420, SCREEN_WIDTH - 40);
    const dlgH = 260;
    const dlgX = (SCREEN_WIDTH - dlgW) / 2;
    const dlgY = (SCREEN_HEIGHT - dlgH) / 2;

    const dlgGrad = ctx.createLinearGradient(dlgX, dlgY, dlgX, dlgY + dlgH);
    dlgGrad.addColorStop(0, '#1a1a30');
    dlgGrad.addColorStop(1, '#0e0e20');
    ctx.fillStyle = dlgGrad;
    this._editorRoundRect(ctx, dlgX, dlgY, dlgW, dlgH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,100,0,0.4)';
    ctx.lineWidth = 2;
    this._editorRoundRect(ctx, dlgX, dlgY, dlgW, dlgH, 16);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#FF6600';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('REPLACE OFFICIAL LEVEL', SCREEN_WIDTH / 2, dlgY + 40);

    ctx.fillStyle = '#AAB';
    ctx.font = '13px monospace';
    ctx.fillText('Choose which official level to replace:', SCREEN_WIDTH / 2, dlgY + 68);

    // Level buttons
    const names = ['Stereo Madness', 'Back on Track', 'Polargeist'];
    const colors = ['#4488FF', '#CC44AA', '#44CC66'];
    const btnW = (dlgW - 50) / 3;
    const btnH = 80;
    const btnY = dlgY + 90;

    for (let i = 0; i < 3; i++) {
      const bx = dlgX + 15 + i * (btnW + 10);
      const grad = ctx.createLinearGradient(bx, btnY, bx, btnY + btnH);
      grad.addColorStop(0, colors[i]);
      grad.addColorStop(1, colors[i] + '88');
      ctx.fillStyle = grad;
      this._editorRoundRect(ctx, bx, btnY, btnW, btnH, 10);
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('L' + (i + 1), bx + btnW / 2, btnY + 32);
      ctx.font = '11px monospace';
      ctx.fillText(names[i], bx + btnW / 2, btnY + 55);

      this.buttons.push({ id: 'official_pick_' + (i + 1), x: bx, y: btnY, w: btnW, h: btnH });
    }

    // Cancel button
    const cbtnW = 160;
    const cbtnH = 44;
    const cbtnX = (SCREEN_WIDTH - cbtnW) / 2;
    const cbtnY = dlgY + dlgH - cbtnH - 18;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    this._editorRoundRect(ctx, cbtnX, cbtnY, cbtnW, cbtnH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    this._editorRoundRect(ctx, cbtnX, cbtnY, cbtnW, cbtnH, 10);
    ctx.stroke();
    ctx.fillStyle = '#CCC';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('CANCEL', cbtnX + cbtnW / 2, cbtnY + cbtnH / 2 + 6);
    this.buttons.push({ id: 'official_pick_cancel', x: cbtnX, y: cbtnY, w: cbtnW, h: cbtnH });
  }

  _handleOfficialPickerClick(x, y) {
    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.id === 'official_pick_cancel') {
          this.officialPicker = false;
          return;
        }
        if (btn.id.startsWith('official_pick_')) {
          const levelId = parseInt(btn.id.replace('official_pick_', ''));
          this.officialPicker = false;
          const lvlData = {
            name: this.levelName || 'Untitled',
            speed: 1.0,
            themeId: this.themeId,
            objects: this.objects,
          };
          saveOfficialLevel(levelId, lvlData).then(async (res) => {
            if (res.error) {
              this._showToast('Error: ' + res.error);
            } else {
              LEVEL_DATA[levelId] = lvlData;
              // Copy editor slot music to official level
              const editorKey = this._getMusicKey();
              if (editorKey && hasCustomMusic(editorKey)) {
                copyMusicBuffer(editorKey, levelId);
                const raw = await getRawMusicFromDB(editorKey);
                if (raw) {
                  const blob = new Blob([raw], { type: 'audio/mpeg' });
                  const file = new File([blob], 'music.mp3', { type: 'audio/mpeg' });
                  await uploadOfficialMusic(levelId, file);
                }
              }
              this._showToast('Official L' + levelId + ' saved!');
            }
          });
          return;
        }
      }
    }
    // Click outside dialog = cancel
    this.officialPicker = false;
  }

  _cycleRotation() {
    this.rotation = (this.rotation + 90) % 360;
    const labels = { 0: 'Up', 90: 'Right', 180: 'Down', 270: 'Left' };
    this._showToast(`Rotation: ${labels[this.rotation]}`);
  }

  _showToast(text) {
    this.toastText = text;
    this.toastTimer = 2.0;
  }

  _handlePanelClick(x, y) {
    // Check panel buttons (already in this.buttons from last draw)
    for (const btn of this.buttons) {
      if (btn.id.startsWith('sub_') && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this.subType = btn.id.replace('sub_', '');
        return;
      }
    }
  }
}
