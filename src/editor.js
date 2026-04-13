/** Level Editor - visual grid-based editor for creating levels */

import { SCREEN_WIDTH, SCREEN_HEIGHT, GRID, GROUND_Y, GROUND_H, PLAYER_X_OFFSET, THEMES, SCROLL_SPEED, FPS } from './settings.js';
import { createObstacle, COLOR_TRIGGER_THEMES } from './obstacles.js';
import { LEVEL_DATA } from './level.js';
import { syncEditorLevelToCloud, loadEditorLevelsFromCloud, deleteEditorLevelFromCloud, isConfigured, isAdmin, saveOfficialLevel, uploadLevelMusic, deleteLevelMusic, uploadOfficialMusic, publishLevel, getAuthUser } from './supabase.js';
import { loadCustomMusic, removeCustomMusic, hasCustomMusic, getRawMusicFromDB, copyMusicBuffer, getCustomMusicDuration } from './sound.js';
import { customPrompt, showMusicPicker } from './dialogs.js';

const TOOLBAR_H = 56;
const PANEL_W = 180;
const NAV_BAR_H = 24;
const NAV_BAR_PAD = 8;

const TOOL_CATEGORIES = [
  { id: 'hazards', label: 'HAZARDS', color: '#FF4444', tools: [
    { id: 'spike', label: 'Spike', color: '#FF4444' },
    { id: 'mini_spike', label: 'Mini', color: '#FF8866' },
    { id: 'saw:1', label: 'Saw S', color: '#FF6666', toolType: 'saw', subType: '1' },
    { id: 'saw:2', label: 'Saw M', color: '#FF4444', toolType: 'saw', subType: '2' },
    { id: 'saw:3', label: 'Saw L', color: '#FF2222', toolType: 'saw', subType: '3' },
  ]},
  { id: 'platforms', label: 'BLOCKS', color: '#4488FF', tools: [
    { id: 'platform', label: 'Platform', color: '#4488FF' },
    { id: 'mini_block', label: 'Mini B', color: '#6699FF' },
    { id: 'slope:up', label: 'Slope ↗', color: '#88CCFF', toolType: 'slope', subType: 'up' },
    { id: 'slope:down', label: 'Slope ↘', color: '#88CCFF', toolType: 'slope', subType: 'down' },
    { id: 'mini_slope:up', label: 'M.Slp ↗', color: '#AADDFF', toolType: 'mini_slope', subType: 'up' },
    { id: 'mini_slope:down', label: 'M.Slp ↘', color: '#AADDFF', toolType: 'mini_slope', subType: 'down' },
    { id: 'moving', label: 'Moving', color: '#44AAFF' },
    { id: 'transport', label: 'Transport', color: '#44FF88' },
  ]},
  { id: 'orbs', label: 'ORBS', color: '#FFD700', tools: [
    { id: 'orb:yellow_orb', label: 'Yellow', color: '#FFD700', toolType: 'orb', subType: 'yellow_orb' },
    { id: 'orb:pink_orb', label: 'Pink', color: '#FF69B4', toolType: 'orb', subType: 'pink_orb' },
    { id: 'orb:dash_orb', label: 'Dash', color: '#00FF00', toolType: 'orb', subType: 'dash_orb' },
    { id: 'orb:blue_orb', label: 'Blue', color: '#00CCFF', toolType: 'orb', subType: 'blue_orb' },
  ]},
  { id: 'pads', label: 'PADS', color: '#FFAA00', tools: [
    { id: 'pad:yellow_pad', label: 'Yellow', color: '#FFD700', toolType: 'pad', subType: 'yellow_pad' },
    { id: 'pad:pink_pad', label: 'Pink', color: '#FF69B4', toolType: 'pad', subType: 'pink_pad' },
    { id: 'pad:blue_pad', label: 'Blue', color: '#00CCFF', toolType: 'pad', subType: 'blue_pad' },
  ]},
  { id: 'portals', label: 'PORTALS', color: '#FF00FF', tools: [
    { id: 'portal:gravity', label: 'Gravity', color: '#FFD700', toolType: 'portal', subType: 'gravity' },
    { id: 'portal:speed_up', label: 'Spd +', color: '#FF6600', toolType: 'portal', subType: 'speed_up' },
    { id: 'portal:speed_down', label: 'Spd -', color: '#00AAFF', toolType: 'portal', subType: 'speed_down' },
    { id: 'portal:ship', label: 'Ship', color: '#FF00FF', toolType: 'portal', subType: 'ship' },
    { id: 'portal:wave', label: 'Wave', color: '#00FFAA', toolType: 'portal', subType: 'wave' },
    { id: 'portal:cube', label: 'Cube', color: '#00C8FF', toolType: 'portal', subType: 'cube' },
    { id: 'portal:ball', label: 'Ball', color: '#FF8800', toolType: 'portal', subType: 'ball' },
    { id: 'portal:mini', label: 'Mini', color: '#FF44FF', toolType: 'portal', subType: 'mini' },
    { id: 'portal:big', label: 'Big', color: '#44AAFF', toolType: 'portal', subType: 'big' },
  ]},
  { id: 'special', label: 'SPECIAL', color: '#00FF88', tools: [
    { id: 'coin', label: 'Coin', color: '#FFD700' },
    { id: 'checkpoint', label: 'Check', color: '#00FF44' },
    { id: 'start', label: 'Start', color: '#00FF88' },
    { id: 'end', label: 'End', color: '#00FFFF' },
    { id: 'color_trigger', label: 'Color', color: '#FF66AA' },
  ]},
  { id: 'edit', label: 'EDIT', color: '#FFAA00', tools: [
    { id: 'move', label: 'Move', color: '#FFAA00' },
    { id: 'erase', label: 'Erase', color: '#FF0000' },
    { id: 'action_rotate', label: 'Rotate', color: '#6688AA' },
  ]},
];

// Flat list for backwards compatibility
const TOOLS = TOOL_CATEGORIES.flatMap(c => c.tools);

const SUBTYPES = {
  color_trigger: ['blue', 'magenta', 'green', 'orange', 'purple', 'red', 'cyan', 'yellow', 'custom'],
};

const SUBTYPE_COLORS = {
  yellow_orb: '#FFD700', pink_orb: '#FF69B4', dash_orb: '#00FF00', blue_orb: '#00CCFF',
  yellow_pad: '#FFD700', pink_pad: '#FF69B4', blue_pad: '#00CCFF',
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
    this.selectedCategory = null;
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
    this.movingOrigPos = null;   // original position before move
    this.movingGrabOffset = null; // offset from grab point to object origin
    this.scrollVelocity = 0;     // momentum scroll velocity

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
    this.showMenu = false; // editor menu overlay
    this.showColorPicker = false; // theme color picker overlay
    this.officialLoadPicker = false; // load official level picker

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

    // Setup inline color picker
    this._setupColorPicker();

    const labels = {
      accent: 'Accent', bgTop: 'BG Top', bgBot: 'BG Bottom',
      ground: 'Ground', groundLine: 'Ground Line', spike: 'Spike',
      platform: 'Platform', player: 'Player',
    };
    // Build color fields with custom swatch buttons instead of native color inputs
    for (const [key, label] of Object.entries(labels)) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'color:#99AABB; font-size:12px; font-family:monospace; flex:1; text-align:left;';
      const btn = document.createElement('div');
      btn.id = 'ce-' + key;
      btn.style.cssText = 'width:44px; height:32px; border:1px solid rgba(255,255,255,0.15); border-radius:6px; cursor:pointer; background:' + this._customColorData[key] + ';';
      btn.dataset.colorKey = key;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openColorPicker(btn, key);
      });
      wrap.appendChild(lbl);
      wrap.appendChild(btn);
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
        document.getElementById('color-picker-popup').style.display = 'none';
        if (this._customThemeMode) {
          // Apply as level theme
          this.theme = { ...this.theme, ...this._customColorData };
          this.themeId = 0; // custom
          this._customThemeMode = false;
          this._showToast('Custom theme applied!');
        } else if (this._customColorPending) {
          this._placeCustomColorTrigger(this._customColorPending.gx, this._customColorPending.gy);
          this._customColorPending = null;
        }
      } else if (id === 'ce-cancel') {
        overlay.style.display = 'none';
        document.getElementById('color-picker-popup').style.display = 'none';
        this._customColorPending = null;
        this._customThemeMode = false;
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


  _showCustomThemeOverlay() {
    const overlay = document.getElementById('color-editor-overlay');
    if (!overlay) return;
    // Pre-fill from current theme
    const cur = this.theme;
    for (const k of Object.keys(this._customColorData)) {
      if (cur[k]) this._customColorData[k] = cur[k];
    }
    for (const k of Object.keys(this._customColorData)) {
      const el = document.getElementById('ce-' + k);
      if (el) el.style.background = this._customColorData[k];
    }
    // Store that we're editing theme, not a color trigger
    this._customThemeMode = true;
    this._customColorPending = null;
    overlay.style.display = 'flex';
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
      const el = document.getElementById('ce-' + k);
      if (el) el.style.background = this._customColorData[k];
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

  // --- HSL helpers ---
  _hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
  }

  _hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  _setupColorPicker() {
    const popup = document.getElementById('color-picker-popup');
    const wheelCanvas = document.getElementById('cpk-wheel');
    const lightCanvas = document.getElementById('cpk-lightness');
    const hexInput = document.getElementById('cpk-hex');
    if (!popup || !wheelCanvas) return;

    this._cpkHue = 0;
    this._cpkSat = 100;
    this._cpkLight = 50;
    this._cpkDraggingWheel = false;
    this._cpkDraggingLight = false;

    // Draw the wheel
    this._drawColorWheel();
    this._drawLightnessBar();

    // Wheel interaction
    const getWheelHS = (e) => {
      const rect = wheelCanvas.getBoundingClientRect();
      const x = (e.clientX || e.touches[0].clientX) - rect.left - 60;
      const y = (e.clientY || e.touches[0].clientY) - rect.top - 60;
      const dist = Math.sqrt(x * x + y * y);
      const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      return { h: angle, s: Math.min(100, (dist / 60) * 100) };
    };

    const wheelDown = (e) => { e.stopPropagation(); this._cpkDraggingWheel = true; const hs = getWheelHS(e); this._cpkHue = hs.h; this._cpkSat = hs.s; this._updatePickerFromHSL(); };
    const wheelMove = (e) => { if (!this._cpkDraggingWheel) return; e.preventDefault(); const hs = getWheelHS(e); this._cpkHue = hs.h; this._cpkSat = hs.s; this._updatePickerFromHSL(); };
    const wheelUp = () => { this._cpkDraggingWheel = false; };
    wheelCanvas.addEventListener('mousedown', wheelDown);
    wheelCanvas.addEventListener('touchstart', wheelDown, { passive: false });
    document.addEventListener('mousemove', wheelMove);
    document.addEventListener('touchmove', wheelMove, { passive: false });
    document.addEventListener('mouseup', wheelUp);
    document.addEventListener('touchend', wheelUp);

    // Lightness bar interaction
    const getLightness = (e) => {
      const rect = lightCanvas.getBoundingClientRect();
      const y = (e.clientY || e.touches[0].clientY) - rect.top;
      return Math.max(0, Math.min(100, (y / rect.height) * 100));
    };
    const lightDown = (e) => { e.stopPropagation(); this._cpkDraggingLight = true; this._cpkLight = getLightness(e); this._drawLightnessBar(); this._updatePickerFromHSL(); };
    const lightMove = (e) => { if (!this._cpkDraggingLight) return; e.preventDefault(); this._cpkLight = getLightness(e); this._drawLightnessBar(); this._updatePickerFromHSL(); };
    const lightUp = () => { this._cpkDraggingLight = false; };
    lightCanvas.addEventListener('mousedown', lightDown);
    lightCanvas.addEventListener('touchstart', lightDown, { passive: false });
    document.addEventListener('mousemove', lightMove);
    document.addEventListener('touchmove', lightMove, { passive: false });
    document.addEventListener('mouseup', lightUp);
    document.addEventListener('touchend', lightUp);

    hexInput.addEventListener('input', (e) => {
      e.stopPropagation();
      let v = hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
      if (v.length === 6) {
        const hex = '#' + v.toUpperCase();
        const hsl = this._hexToHsl(hex);
        this._cpkHue = hsl.h; this._cpkSat = hsl.s; this._cpkLight = hsl.l;
        this._drawColorWheel();
        this._drawLightnessBar();
        this._pickColor(hex);
      }
    });
    hexInput.addEventListener('keydown', (e) => e.stopPropagation());
    popup.addEventListener('pointerdown', (e) => e.stopPropagation());
    popup.addEventListener('mousedown', (e) => e.stopPropagation());
    popup.addEventListener('touchstart', (e) => e.stopPropagation());

    this._colorPickerCloseHandler = (e) => {
      if (!popup.contains(e.target) && popup.style.display !== 'none') {
        popup.style.display = 'none';
      }
    };
    document.addEventListener('pointerdown', this._colorPickerCloseHandler);
  }

  _drawColorWheel() {
    const canvas = document.getElementById('cpk-wheel');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 60, cy = 60, r = 60;

    // Draw HSL wheel
    const img = ctx.createImageData(120, 120);
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 120; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) continue;
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const sat = (dist / r) * 100;
        const hex = this._hslToHex(angle, sat, this._cpkLight);
        const ri = parseInt(hex.slice(1, 3), 16);
        const gi = parseInt(hex.slice(3, 5), 16);
        const bi = parseInt(hex.slice(5, 7), 16);
        const i = (y * 120 + x) * 4;
        img.data[i] = ri; img.data[i + 1] = gi; img.data[i + 2] = bi; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Draw selector dot
    const selAngle = this._cpkHue * Math.PI / 180;
    const selDist = (this._cpkSat / 100) * r;
    const sx = cx + Math.cos(selAngle) * selDist;
    const sy = cy + Math.sin(selAngle) * selDist;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawLightnessBar() {
    const canvas = document.getElementById('cpk-lightness');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = 18, h = 120;

    // Gradient from white (top) to black (bottom) through current hue
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, this._hslToHex(this._cpkHue, this._cpkSat, 100));
    grad.addColorStop(0.5, this._hslToHex(this._cpkHue, this._cpkSat, 50));
    grad.addColorStop(1, this._hslToHex(this._cpkHue, this._cpkSat, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Selector line
    const sy = (this._cpkLight / 100) * h;
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, sy - 2, w, 4);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, sy - 2, w, 4);
  }

  _updatePickerFromHSL() {
    const color = this._hslToHex(this._cpkHue, this._cpkSat, this._cpkLight);
    this._drawColorWheel();
    this._drawLightnessBar();
    this._pickColor(color);
  }

  _openColorPicker(targetEl, key) {
    const popup = document.getElementById('color-picker-popup');
    const hexInput = document.getElementById('cpk-hex');
    const preview = document.getElementById('cpk-preview');
    if (!popup) return;

    this._colorPickerTarget = targetEl;
    this._colorPickerKey = key;

    // Center on screen
    popup.style.display = 'block';
    popup.style.left = Math.round((window.innerWidth - popup.offsetWidth) / 2) + 'px';
    popup.style.top = Math.round((window.innerHeight - popup.offsetHeight) / 2) + 'px';

    const current = this._customColorData[key] || '#FFFFFF';
    const hsl = this._hexToHsl(current);
    this._cpkHue = hsl.h; this._cpkSat = hsl.s; this._cpkLight = hsl.l;
    hexInput.value = current.replace('#', '');
    preview.style.background = current;
    this._drawColorWheel();
    this._drawLightnessBar();
  }

  _pickColor(color) {
    const hexInput = document.getElementById('cpk-hex');
    const preview = document.getElementById('cpk-preview');

    this._customColorData[this._colorPickerKey] = color;
    if (this._colorPickerTarget) {
      this._colorPickerTarget.style.background = color;
    }
    hexInput.value = color.replace('#', '');
    preview.style.background = color;
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
    showMusicPicker(
      hasCustomMusic(key),
      async (file) => {
        try {
          await loadCustomMusic(key, file);
          this._showToast('Music added!');
          uploadLevelMusic(this.currentSlot, file);
        } catch (e) {
          this._showToast('Failed to load audio');
        }
      },
      () => {
        removeCustomMusic(key);
        deleteLevelMusic(this.currentSlot);
        this._showToast('Music removed');
      }
    );
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
    // Dismiss overlays on click
    if (this.officialLoadPicker) {
      const clicked = this.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (!clicked) { this.officialLoadPicker = false; return; }
    }
    if (this.showColorPicker) {
      const clicked = this.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (!clicked) { this.showColorPicker = false; return; }
    }
    if (this.showMenu) {
      const clicked = this.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (!clicked) { this.showMenu = false; return; }
    }
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

    if (this.selectedTool === 'action_rotate') {
      const idx = this._findObjectAt(half.gx, half.gy);
      if (idx >= 0) {
        this._pushHistory();
        const obj = this.objects[idx];
        const oldRot = obj.rot || 0;
        obj.rot = (oldRot + 90) % 360;
        // For spikes: compensate Y shift when going to/from rot=180
        if (obj.type === 'spike') {
          const wasFlipped = oldRot === 180;
          const isFlipped = obj.rot === 180;
          if (!wasFlipped && isFlipped) {
            // Going to ceiling — convert gy
            obj.y = Math.floor(GROUND_Y / GRID) - obj.y - 1;
          } else if (wasFlipped && !isFlipped) {
            // Coming back from ceiling
            obj.y = Math.floor(GROUND_Y / GRID) - obj.y - 1;
          }
        }
        this._rebuildLive();
      }
      return;
    }

    if (this.selectedTool === 'erase') {
      this._removeObjectAt(half.gx, half.gy);
      this.painting = this.swipeMode === 'paint';
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
        this.movingOrigPos = { x: this.objects[idx].x, y: this.objects[idx].y };
        this.movingGrabOffset = { dx: this.objects[idx].x - half.gx, dy: this.objects[idx].y - half.gy };
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
    // Start paint mode for tools that support it (only in paint swipe mode)
    if (this.swipeMode === 'paint' && ['spike', 'saw', 'orb', 'pad', 'coin', 'checkpoint', 'end', 'color_trigger'].includes(this.selectedTool)) {
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

    // Move tool: update object position live while dragging (half-grid snap + grab offset)
    if (this.movingObj) {
      const half = this._screenToHalfGrid(x, y);
      const off = this.movingGrabOffset || { dx: 0, dy: 0 };
      this.movingObj.x = half.gx + off.dx;
      this.movingObj.y = half.gy + off.dy;
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
      this.movingOrigPos = null;
      this.movingGrabOffset = null;
    }
    if (this.dragStart) {
      const minGx = Math.min(this.dragStart.gx, this.hoverGx);
      const minGy = Math.min(this.dragStart.gy, this.hoverGy);
      const w = Math.abs(this.hoverGx - this.dragStart.gx) + 1;
      const h = Math.abs(this.hoverGy - this.dragStart.gy) + 1;
      this._pushHistory();
      if (this.selectedTool === 'slope') {
        const sObj = { type: 'slope', x: minGx, y: minGy, w, h, direction: this.subType || 'up' };
        if (this.rotation !== 0) sObj.rot = this.rotation;
        this.objects.push(sObj);
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
        if (this.browseFromMenu) {
          if (this.onBack) this.onBack();
        } else {
          this.browsing = false;
        }
      }
      return true;
    }
    if (e.key === 'Escape') {
      if (this.movingEndMode) {
        this.movingEndMode = false;
        this.movingStart = null;
        return true;
      }
      if (this.officialLoadPicker) {
        this.officialLoadPicker = false;
        return true;
      }
      if (this.showColorPicker) {
        this.showColorPicker = false;
        return true;
      }
      if (this.showMenu) {
        this.showMenu = false;
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
      // Auto-save and go back to main menu
      if (this.currentSlot && this.objects.length > 0) {
        this.saveToSlot(this.currentSlot);
      }
      if (this.onBack) this.onBack();
      return true;
    }

    if (e.key === 'h' || e.key === 'H' || e.key === '?') {
      this.showHelp = !this.showHelp;
      return true;
    }

    // Tool shortcuts
    const keyMap = {
      '1': { cat: 'hazards', tool: 'spike' },
      '2': { cat: 'platforms', tool: 'platform' },
      '3': { cat: 'platforms', tool: 'moving' },
      '4': { cat: 'orbs', tool: 'orb', sub: 'yellow_orb' },
      '5': { cat: 'pads', tool: 'pad', sub: 'yellow_pad' },
      '6': { cat: 'portals', tool: 'portal', sub: 'gravity' },
      '7': { cat: 'special', tool: 'checkpoint' },
      '8': { cat: 'special', tool: 'end' },
      '9': { cat: 'special', tool: 'start' },
      'w': { cat: 'hazards', tool: 'saw', sub: '1' },
      's': { cat: 'platforms', tool: 'slope', sub: 'up' },
      't': { cat: 'platforms', tool: 'transport' },
      'c': { cat: 'special', tool: 'coin' },
      'r': { cat: 'special', tool: 'color_trigger' },
      'm': { cat: 'edit', tool: 'move' },
      'x': { cat: 'edit', tool: 'erase' },
    };
    const km = keyMap[e.key.toLowerCase()];
    if (km) {
      this.selectedCategory = km.cat;
      this.selectedTool = km.tool;
      this.subType = km.sub || null;
      if (km.tool === 'move' || km.tool === 'erase') this.swipeMode = 'scroll';
      return true;
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
    this.scrollVelocity = 0; // stop momentum
    this.touchStartX = x;
    this.touchStartY = y;
    this.touchStartCamX = this.cameraX;
    this.isTouchScrolling = false;
    this.touchMoved = false;

    // Browse screen: track touch for scroll
    if (this.browsing) {
      this._browseScrollStartY = y;
      this._browseScrollStart = this.browseScroll;
      this._browseTouchMoved = false;
      return;
    }

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
        this.movingOrigPos = { x: this.objects[idx].x, y: this.objects[idx].y };
        this.movingGrabOffset = { dx: this.objects[idx].x - halfTouch.gx, dy: this.objects[idx].y - halfTouch.gy };
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

    // Move tool always scrolls, never paints
    if (this.selectedTool === 'move') { this.touchPaintPending = false; return; }

    // In paint swipe mode, swiping places/erases objects instead of scrolling
    const paintableTools = ['spike', 'mini_spike', 'mini_block', 'mini_slope', 'saw', 'orb', 'pad', 'checkpoint', 'end', 'coin', 'color_trigger'];
    const eraseSwipe = this.swipeMode === 'paint' && this.selectedTool === 'erase';
    const paintSwipe = this.swipeMode === 'paint' && paintableTools.includes(this.selectedTool);
    if (touchCount === 1 && y > TOOLBAR_H && (paintSwipe || eraseSwipe)) {
      this.touchPaintPending = true;
    } else {
      this.touchPaintPending = false;
    }
  }

  handleTouchMove(x, y) {
    // Browse screen scroll
    if (this.browsing) {
      const dy = this._browseScrollStartY - y;
      if (Math.abs(dy) > 5) this._browseTouchMoved = true;
      this.browseScroll = Math.max(0, this._browseScrollStart + dy);
      return;
    }

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

    // Move tool: drag object with finger (half-grid snap + grab offset)
    if (this.movingObj) {
      const half = this._screenToHalfGrid(x, y);
      const off = this.movingGrabOffset || { dx: 0, dy: 0 };
      this.movingObj.x = half.gx + off.dx;
      this.movingObj.y = half.gy + off.dy;
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
      const newCamX = Math.max(0, this.touchStartCamX - dx);
      this.scrollVelocity = newCamX - this.cameraX;
      this.cameraX = newCamX;
    }
  }

  handleTouchEnd() {
    this.touchPaintPending = false;

    // Browse screen: tap only if didn't scroll
    if (this.browsing) {
      if (!this._browseTouchMoved) {
        this._handleBrowseClick(this.touchStartX, this.touchStartY);
      }
      return;
    }

    if (this.navDragging) {
      this.navDragging = false;
      return;
    }

    if (this.movingObj) {
      this.movingObj = null;
      this.movingObjIndex = -1;
      this.movingOrigPos = null;
      this.movingGrabOffset = null;
      return;
    }

    if (this.painting) {
      this.painting = false;
      this.paintErase = false;
      return;
    }

    if (this.isTouchScrolling) {
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
        const sObj = { type: 'slope', x: minGx, y: minGy, w, h, direction: this.subType || 'up' };
        if (this.rotation !== 0) sObj.rot = this.rotation;
        this.objects.push(sObj);
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
    // Momentum scrolling after touch release
    if (!this.isTouchScrolling && Math.abs(this.scrollVelocity) > 0.5) {
      this.cameraX = Math.max(0, this.cameraX + this.scrollVelocity);
      this.scrollVelocity *= 0.92; // friction
      if (Math.abs(this.scrollVelocity) < 0.5) this.scrollVelocity = 0;
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
      } else if (obs.editorRot) {
        // Draw rotated obstacle
        const cx = obs.x - editorCamX + PLAYER_X_OFFSET + obs.w / 2;
        const cy = obs.y + (obs.h || GRID) / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(obs.editorRot * Math.PI / 180);
        ctx.translate(-cx, -cy);
        obs.draw(ctx, editorCamX, this.theme);
        ctx.restore();
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

    // Move preview - show ghost at original pos + object following cursor
    if (this.movingObj && this.mouseY > TOOLBAR_H) {
      const tool = TOOLS.find(t => t.id === this.movingObj.type || t.toolType === this.movingObj.type);
      const sz = this._getObjSize(this.movingObj);
      const objW = sz.w * GRID;
      const objH = sz.h * GRID;
      // _gridToScreen gives top-left of a 1x1 cell; adjust for taller objects
      const heightOffset = (sz.h - 1) * GRID;
      const color = tool ? tool.color : '#FFF';

      // Ghost at original position (dashed outline)
      if (this.movingOrigPos) {
        const orig = this._gridToScreen(this.movingOrigPos.x, this.movingOrigPos.y);
        const osx = orig.sx, osy = orig.sy - heightOffset;
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = color;
        ctx.fillRect(osx, osy, objW, objH);
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(osx, osy, objW, objH);
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Current position (solid with glow)
      const { sx, sy: rawSy } = this._gridToScreen(this.movingObj.x, this.movingObj.y);
      const sy = rawSy - heightOffset;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, objW, objH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, objW, objH);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.movingObj.type, sx + objW / 2, sy + objH / 2 + 3);
      ctx.restore();

      // Connection line from original to current
      if (this.movingOrigPos && (this.movingOrigPos.x !== this.movingObj.x || this.movingOrigPos.y !== this.movingObj.y)) {
        const orig = this._gridToScreen(this.movingOrigPos.x, this.movingOrigPos.y);
        const osy = orig.sy - heightOffset;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(orig.sx + objW / 2, osy + objH / 2);
        ctx.lineTo(sx + objW / 2, sy + objH / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
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

    // Menu overlay
    if (this.showMenu) {
      this._drawMenu(ctx);
    }

    // Official load picker
    if (this.officialLoadPicker) {
      this._drawOfficialLoadPicker(ctx);
    }

    // Color picker overlay
    if (this.showColorPicker) {
      this._drawColorPicker(ctx);
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
      } else {
        this.startPos = { gx, gy };
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

    // Mini block/slope: detect top/bottom half of grid cell
    if (this.selectedTool === 'mini_block' || this.selectedTool === 'mini_slope') {
      const cellTopY = GROUND_Y - (gy + 1) * GRID;
      const mouseInCell = this.mouseY - cellTopY;
      if (mouseInCell < GRID / 2) {
        obj.halfTop = true;
      }
    }

    if (this.selectedTool === 'spike' || this.selectedTool === 'mini_spike') {
      if (this.rotation !== 0) obj.rot = this.rotation;
      if (this.rotation === 180) {
        obj.y = Math.floor(GROUND_Y / GRID) - gy - 1;
      }
    }

    if (this.selectedTool === 'slope' || this.selectedTool === 'mini_slope') {
      if (this.rotation !== 0) obj.rot = this.rotation;
    }

    if (this.selectedTool === 'mini_slope') {
      obj.direction = this.subType || 'up';
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

  _getObjSize(o) {
    const w = Math.max(1, o.w || 1);
    const h = Math.max(1, o.type === 'portal' ? 3 : (o.h || 1));
    return { w, h };
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
      const { w: ow, h: oh } = this._getObjSize(o);
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
      const { w: ow, h: oh } = this._getObjSize(o);
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
      const list = raw ? JSON.parse(raw) : [];
      return list.filter(s => s.id !== '__secrets__');
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

  async _newLevel() {
    const name = await customPrompt('LEVEL NAME', 'My Level');
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
    this.browseFromMenu = fromMenu;
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

    // Category buttons (left side) + action buttons (right side) in one row
    const catButtons = TOOL_CATEGORIES.map(cat => ({
      id: 'cat_' + cat.id, label: cat.label, color: cat.color, isCat: true, catId: cat.id,
    }));

    const actions = [
      { id: 'action_save_test', label: '▶ TEST', color: '#00BB44' },
      { id: 'action_menu', label: '≡', color: '#778899', big: true },
    ];

    // Size buttons - categories on left, actions on right
    const actBtnW = 52;
    const actTotalW = actions.length * (actBtnW + gap) - gap;
    const catAvailW = SCREEN_WIDTH - margin * 2 - actTotalW - 20 - (catButtons.length - 1) * gap;
    const btnW = Math.min(64, Math.floor(catAvailW / catButtons.length));

    // Unified retro button renderer
    const _drawRetroBtn = (x, y, w, h, color, label, active) => {
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      if (active) {
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '88');
      } else {
        grad.addColorStop(0, 'rgba(30,30,50,0.95)');
        grad.addColorStop(1, 'rgba(20,20,38,0.95)');
      }
      this._editorRoundRect(ctx, x, y, w, h, r);
      ctx.fillStyle = grad;
      ctx.fill();
      // Neon border glow
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = active ? 8 : 3;
      this._editorRoundRect(ctx, x, y, w, h, r);
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 1.5 : 0.8;
      ctx.globalAlpha = active ? 0.8 : 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      // Top edge highlight
      ctx.globalAlpha = active ? 0.15 : 0.06;
      ctx.fillStyle = '#FFF';
      ctx.fillRect(x + r, y + 1, w - r * 2, 1);
      ctx.globalAlpha = 1;
      // Label
      ctx.fillStyle = active ? '#FFF' : color;
      const fs = Math.min(11, Math.max(8, w / 5.5));
      ctx.font = `bold ${fs}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h / 2 + fs / 3);
    };

    // Draw category buttons
    for (let i = 0; i < catButtons.length; i++) {
      const btn = catButtons[i];
      const bx = margin + i * (btnW + gap);
      const active = this.selectedCategory === btn.catId;
      _drawRetroBtn(bx, btnY, btnW, btnH, btn.color, btn.label, active);
      this.buttons.push({ id: btn.id, x: bx, y: btnY, w: btnW, h: btnH });
    }

    // Action buttons anchored to right
    let ax = SCREEN_WIDTH - margin - actTotalW;
    for (const act of actions) {
      if (act.big) {
        // Custom hamburger menu button
        const bx = ax, by = btnY, bw = actBtnW, bh = btnH;
        const menuOpen = this.showMenu;
        const mGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
        mGrad.addColorStop(0, menuOpen ? 'rgba(80,90,110,0.95)' : 'rgba(30,30,50,0.95)');
        mGrad.addColorStop(1, menuOpen ? 'rgba(60,70,90,0.95)' : 'rgba(20,20,38,0.95)');
        this._editorRoundRect(ctx, bx, by, bw, bh, r);
        ctx.fillStyle = mGrad;
        ctx.fill();
        ctx.save();
        ctx.shadowColor = menuOpen ? '#AABBDD' : act.color;
        ctx.shadowBlur = menuOpen ? 10 : 4;
        this._editorRoundRect(ctx, bx, by, bw, bh, r);
        ctx.strokeStyle = menuOpen ? '#AABBDD' : act.color;
        ctx.lineWidth = menuOpen ? 1.5 : 0.8;
        ctx.globalAlpha = menuOpen ? 0.7 : 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
        // 3 hamburger lines
        const lineW = 18, lineH = 2.5, lineGap = 5;
        const lx = bx + (bw - lineW) / 2;
        const ly = by + (bh - lineH * 3 - lineGap * 2) / 2;
        ctx.fillStyle = menuOpen ? '#FFF' : act.color;
        for (let l = 0; l < 3; l++) {
          const lineY = ly + l * (lineH + lineGap);
          ctx.fillRect(lx, lineY, lineW, lineH);
        }
      } else {
        _drawRetroBtn(ax, btnY, actBtnW, btnH, act.color, act.label, false);
      }
      this.buttons.push({ id: act.id, x: ax, y: btnY, w: actBtnW, h: btnH });
      ax += actBtnW + gap;
    }

    // Undo/Redo buttons below toolbar, left side
    const urY = TOOLBAR_H + 10;
    const urW = 40;
    const urH = 32;
    const urGap = 4;
    const urX = 10;
    // Undo arrow
    _drawRetroBtn(urX, urY, urW, urH, '#5577AA', '<', false);
    this.buttons.push({ id: 'action_undo', x: urX, y: urY, w: urW, h: urH });
    // Redo arrow
    _drawRetroBtn(urX + urW + urGap, urY, urW, urH, '#5577AA', '>', false);
    this.buttons.push({ id: 'action_redo', x: urX + urW + urGap, y: urY, w: urW, h: urH });
  }

  _hasSidePanel() {
    // Show side panel when a category is selected, or for color_trigger subtypes
    return this.selectedCategory || SUBTYPES[this.selectedTool] !== undefined;
  }

  _drawSidePanel(ctx) {
    // If color_trigger is selected, show its subtypes
    const colorSubs = SUBTYPES[this.selectedTool];
    // Get tools from active category
    const activeCat = TOOL_CATEGORIES.find(c => c.id === this.selectedCategory);
    const items = colorSubs || (activeCat ? activeCat.tools : null);
    if (!items) return;

    const isColorTrigger = !!colorSubs;
    const px = SCREEN_WIDTH - PANEL_W;
    const py = TOOLBAR_H + 10;
    const panelH = items.length * 40 + 34;
    const r = 10;

    // Panel background with rounded corners (left side only)
    this._editorRoundRect(ctx, px - 4, py, PANEL_W + 4, panelH, r);
    ctx.fillStyle = 'rgba(5,5,20,0.9)';
    ctx.fill();
    ctx.strokeStyle = activeCat ? activeCat.color + '33' : 'rgba(0,200,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = activeCat ? activeCat.color : 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isColorTrigger ? 'SUBTYPE' : (activeCat ? activeCat.label : ''), px + PANEL_W / 2, py + 16);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // For color_trigger subtypes, item is a string; for category tools, item is an object
      const st = isColorTrigger ? item : (item.toolType ? item.subType : item.id);
      const label = isColorTrigger ? item : item.label;
      const by = py + 26 + i * 36;
      const isActive = isColorTrigger
        ? (this.subType === st || (!this.subType && i === 0))
        : (item.toolType
          ? (this.selectedTool === item.toolType && this.subType === item.subType)
          : (this.selectedTool === item.id));
      const bx = px + 10;
      const bw = PANEL_W - 20;

      const itemColor = isColorTrigger ? SUBTYPE_COLORS[st] : (item.color || '#888');
      this._editorRoundRect(ctx, bx, by, bw, 30, 6);
      ctx.fillStyle = isActive ? itemColor : 'rgba(255,255,255,0.08)';
      ctx.fill();

      if (isActive) {
        ctx.save();
        ctx.shadowColor = itemColor;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = itemColor;
        ctx.lineWidth = 1.5;
        this._editorRoundRect(ctx, bx, by, bw, 30, 6);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = isActive ? '#000' : '#BBB';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      const displayLabel = typeof label === 'string' ? label.replace('_', ' ') : st;
      ctx.fillText(displayLabel, px + PANEL_W / 2, by + 19);

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

    const barY = SCREEN_HEIGHT - 42 - NAV_BAR_H - NAV_BAR_PAD;
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

    // Draw object dots on the minimap (skip hazards, orbs, pads)
    const navHidden = new Set(['spike', 'mini_spike', 'saw', 'orb', 'pad', 'platform', 'mini_block', 'slope', 'mini_slope', 'moving', 'transport']);
    for (const o of this.objects) {
      if (navHidden.has(o.type)) continue;
      const ox = o.x * GRID;
      const frac = ox / totalWorldW;
      const dx = barX + frac * barW;
      if (dx < barX || dx > barX + barW) continue;

      const tool = TOOLS.find(t => t.id === o.type || t.toolType === o.type);
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
    const barH = 42;
    const y = SCREEN_HEIGHT - barH;
    const btnH = 32;
    const sby = y + 5;
    const gap = 3;
    const r = 6;
    const m = 8;

    // Background — same as top toolbar
    const bbGrad = ctx.createLinearGradient(0, y, 0, SCREEN_HEIGHT);
    bbGrad.addColorStop(0, 'rgba(10,10,20,0.95)');
    bbGrad.addColorStop(1, 'rgba(5,5,15,0.9)');
    ctx.fillStyle = bbGrad;
    ctx.fillRect(0, y, SCREEN_WIDTH, barH);
    ctx.fillStyle = 'rgba(0,200,255,0.15)';
    ctx.fillRect(0, y, SCREEN_WIDTH, 1);

    // Retro button helper — same style as top toolbar
    const _btn = (x, w, color, label, active) => {
      const g = ctx.createLinearGradient(x, sby, x, sby + btnH);
      if (active) { g.addColorStop(0, color); g.addColorStop(1, color + '88'); }
      else { g.addColorStop(0, 'rgba(30,30,50,0.95)'); g.addColorStop(1, 'rgba(20,20,38,0.95)'); }
      this._editorRoundRect(ctx, x, sby, w, btnH, r);
      ctx.fillStyle = g; ctx.fill();
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = active ? 8 : 3;
      this._editorRoundRect(ctx, x, sby, w, btnH, r);
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 1.5 : 0.8;
      ctx.globalAlpha = active ? 0.8 : 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.globalAlpha = active ? 0.15 : 0.06;
      ctx.fillStyle = '#FFF';
      ctx.fillRect(x + r, sby + 1, w - r * 2, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = active ? '#FFF' : color;
      const fs = Math.min(11, Math.max(8, w / 5.5));
      ctx.font = `bold ${fs}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, sby + btnH / 2 + fs / 3);
    };

    // === LEFT: ◀ ▶ + PAINT/MOVE + info ===
    let lx = m;
    const arrowW = 34;

    _btn(lx, arrowW, '#6688AA', '◀', false);
    this.buttons.push({ id: 'scroll_left', x: lx, y: sby, w: arrowW, h: btnH });
    lx += arrowW + gap;

    _btn(lx, arrowW, '#6688AA', '▶', false);
    this.buttons.push({ id: 'scroll_right', x: lx, y: sby, w: arrowW, h: btnH });
    lx += arrowW + gap;

    const isPaint = this.swipeMode === 'paint';
    const swipeW = 52;
    _btn(lx, swipeW, isPaint ? '#FF6600' : '#6688AA', isPaint ? 'PAINT' : 'MOVE', isPaint);
    this.buttons.push({ id: 'action_swipe', x: lx, y: sby, w: swipeW, h: btnH });
    lx += swipeW + 10;

    // Info
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.objects.length} obj`, lx, sby + 13);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.fillText(`X:${this.hoverGx} Y:${this.hoverGy}`, lx, sby + 26);

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
    } else if (this.selectedTool === 'mini_spike') {
      ctx.fillStyle = '#FF8866';
      ctx.save();
      const mh = GRID * 0.5;
      ctx.translate(sx + GRID / 2, sy + GRID - mh / 2);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, -mh / 2 + 2);
      ctx.lineTo(-GRID / 2 + 6, mh / 2 - 1);
      ctx.lineTo(GRID / 2 - 6, mh / 2 - 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (this.selectedTool === 'mini_block') {
      ctx.fillStyle = '#6699FF';
      const cellTopY = GROUND_Y - (this.hoverGy + 1) * GRID;
      const inTop = this.mouseY - cellTopY < GRID / 2;
      ctx.fillRect(sx, inTop ? sy : sy + GRID * 0.5, GRID, GRID * 0.5);
    } else if (this.selectedTool === 'mini_slope') {
      ctx.fillStyle = '#AADDFF';
      const cellTopY2 = GROUND_Y - (this.hoverGy + 1) * GRID;
      const inTop2 = this.mouseY - cellTopY2 < GRID / 2;
      const msy = inTop2 ? sy : sy + GRID * 0.5;
      const msh = GRID * 0.5;
      const dir = this.subType || 'up';
      ctx.beginPath();
      if (dir === 'up') {
        ctx.moveTo(sx, msy + msh);
        ctx.lineTo(sx + GRID, msy + msh);
        ctx.lineTo(sx + GRID, msy);
      } else {
        ctx.moveTo(sx, msy);
        ctx.lineTo(sx, msy + msh);
        ctx.lineTo(sx + GRID, msy + msh);
      }
      ctx.closePath();
      ctx.fill();
    } else if (this.selectedTool === 'platform') {
      ctx.fillStyle = '#4488FF';
      ctx.fillRect(sx, sy, GRID, GRID);
    } else if (this.selectedTool === 'slope') {
      ctx.strokeStyle = '#88CCFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if ((this.subType || 'up') === 'up') {
        ctx.moveTo(sx, sy + GRID);
        ctx.lineTo(sx + GRID, sy + GRID);
        ctx.lineTo(sx + GRID, sy);
      } else {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + GRID);
        ctx.lineTo(sx + GRID, sy + GRID);
      }
      ctx.closePath();
      ctx.stroke();
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
      const portalColors = {
        gravity: ['#FFD700', '#FF8800'], speed_up: ['#FF6600', '#FF2200'],
        speed_down: ['#00AAFF', '#0055FF'], ship: ['#FF00FF', '#8800AA'],
        wave: ['#00FFAA', '#008866'], cube: ['#00C8FF', '#0066CC'],
        ball: ['#FF8800', '#CC4400'], mini: ['#FF44FF', '#AA00AA'],
        big: ['#44AAFF', '#2266CC'],
      };
      const portalIcons = {
        gravity: '↕', speed_up: '▶▶', speed_down: '▶',
        ship: '✈', wave: '∿', cube: '■', ball: '●',
        mini: '▼', big: '▲',
      };
      const pType = this.subType || 'gravity';
      const [c1, c2] = portalColors[pType] || ['#FFD700', '#FF8800'];
      const ph = GRID * 3;
      const ptop = sy - ph + GRID;
      const pcx = sx + GRID / 2;
      const pcy = ptop + ph / 2;
      const fw = 32, fh = ph - 6, fy = ptop + 3, fr = fw / 2;
      const fx = pcx - fw / 2;
      // Outer pill frame
      const fg = ctx.createLinearGradient(0, fy, 0, fy + fh);
      fg.addColorStop(0, c1); fg.addColorStop(0.5, c2); fg.addColorStop(1, c1);
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.roundRect(fx, fy, fw, fh, fr); ctx.fill();
      // Inner dark cutout
      const iw = fw - 14, ih = fh - 10;
      ctx.fillStyle = 'rgba(0,0,10,0.7)';
      ctx.beginPath(); ctx.roundRect(pcx - iw / 2, fy + 5, iw, ih, iw / 2); ctx.fill();
      // Icon badge
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.arc(pcx, pcy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c1; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(portalIcons[pType] || '?', pcx, pcy);
      ctx.textBaseline = 'alphabetic';
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

    if (this.selectedTool === 'slope') {
      const dir = this.subType || 'up';
      ctx.fillStyle = '#88CCFF';
      ctx.beginPath();
      if (dir === 'up') {
        ctx.moveTo(sx, sy + h);
        ctx.lineTo(sx + w, sy + h);
        ctx.lineTo(sx + w, sy);
      } else {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + h);
        ctx.lineTo(sx + w, sy + h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#4488FF';
      ctx.fillRect(sx, sy, w, h);
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, w, h);
    }

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

  _drawMenu(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const menuItems = [
      { id: 'action_load', label: 'OPEN LEVEL', color: '#AA88FF' },
      { id: 'menu_info', label: 'LEVEL INFO', color: '#44BBFF' },
      { id: 'action_music', label: this._hasSlotMusic() ? 'MUSIC  \u2713' : 'MUSIC', color: this._hasSlotMusic() ? '#FF66AA' : '#FF77BB' },
      { id: 'menu_color', label: 'COLOR', color: THEMES[this.themeId]?.accent || '#FFD700' },
      { id: 'menu_help', label: 'HELP', color: '#00CC88' },
    ];
    if (isAdmin()) {
      menuItems.push({ id: 'menu_load_official', label: 'LOAD OFFICIAL', color: '#FFAA22' });
      menuItems.push({ id: 'action_save_official', label: 'SAVE AS OFFICIAL', color: '#FF6622' });
    }
    menuItems.push({ id: 'menu_exit', label: 'EXIT TO MENU', color: '#FF4455' });

    const btnW = 280;
    const btnH = 48;
    const btnGap = 12;
    const totalH = menuItems.length * (btnH + btnGap) - btnGap;
    const startY = (SCREEN_HEIGHT - totalH) / 2;
    const bx = (SCREEN_WIDTH - btnW) / 2;
    const r = 10;

    // Title
    ctx.save();
    ctx.shadowColor = '#778899';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#AABBCC';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MENU', SCREEN_WIDTH / 2, startY - 30);
    ctx.shadowBlur = 0;
    ctx.restore();

    for (let i = 0; i < menuItems.length; i++) {
      const item = menuItems[i];
      const by = startY + i * (btnH + btnGap);

      // Button background gradient
      const grad = ctx.createLinearGradient(bx, by, bx, by + btnH);
      grad.addColorStop(0, 'rgba(25,25,45,0.95)');
      grad.addColorStop(1, 'rgba(15,15,30,0.95)');
      this._editorRoundRect(ctx, bx, by, btnW, btnH, r);
      ctx.fillStyle = grad;
      ctx.fill();

      // Neon border
      ctx.save();
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 6;
      this._editorRoundRect(ctx, bx, by, btnW, btnH, r);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Top highlight
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#FFF';
      ctx.fillRect(bx + r, by + 1, btnW - r * 2, 1);
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = item.color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, SCREEN_WIDTH / 2, by + btnH / 2 + 6);

      this.buttons.push({ id: item.id, x: bx, y: by, w: btnW, h: btnH });
    }

    // Close hint
    ctx.fillStyle = '#445566';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC to close', SCREEN_WIDTH / 2, startY + totalH + 30);
  }



  _drawOfficialLoadPicker(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const lvlCount = Object.keys(LEVEL_DATA).length;
    const cols = 3;
    const btnW = 120;
    const btnH = 50;
    const gap = 12;
    const rows = Math.ceil(lvlCount / cols);
    const gridW = cols * btnW + (cols - 1) * gap;
    const startX = (SCREEN_WIDTH - gridW) / 2;
    const startY = (SCREEN_HEIGHT - rows * (btnH + gap)) / 2 + 40;

    ctx.save();
    ctx.shadowColor = '#FFAA22';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFAA22';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOAD OFFICIAL LEVEL', SCREEN_WIDTH / 2, startY - 30);
    ctx.shadowBlur = 0;
    ctx.restore();

    for (let i = 0; i < lvlCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = startX + col * (btnW + gap);
      const by = startY + row * (btnH + gap);
      const theme = THEMES[i + 1] || THEMES[1];
      const name = LEVEL_DATA[i + 1]?.name || ('Level ' + (i + 1));

      const grad = ctx.createLinearGradient(bx, by, bx, by + btnH);
      grad.addColorStop(0, theme.bgTop);
      grad.addColorStop(1, theme.bgBot);
      this._editorRoundRect(ctx, bx, by, btnW, btnH, 8);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 4;
      this._editorRoundRect(ctx, bx, by, btnW, btnH, 8);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(name, bx + btnW / 2, by + btnH / 2 + 5);

      this.buttons.push({ id: 'loadofficial_' + (i + 1), x: bx, y: by, w: btnW, h: btnH });
    }

    ctx.fillStyle = '#445566';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC to close', SCREEN_WIDTH / 2, startY + rows * (btnH + gap) + 20);
  }

  _drawColorPicker(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const themeKeys = Object.keys(THEMES);
    const cols = 3;
    const dotSize = 50;
    const dotGap = 14;
    const rows = Math.ceil(themeKeys.length / cols);
    const gridW = cols * dotSize + (cols - 1) * dotGap;
    const gridH = rows * dotSize + (rows - 1) * dotGap;
    const startX = (SCREEN_WIDTH - gridW) / 2;
    const startY = (SCREEN_HEIGHT - gridH - 80) / 2 + 50;

    // Title
    ctx.save();
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COLOR', SCREEN_WIDTH / 2, startY - 30);
    ctx.shadowBlur = 0;
    ctx.restore();

    for (let i = 0; i < themeKeys.length; i++) {
      const t = parseInt(themeKeys[i]);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = startX + col * (dotSize + dotGap);
      const by = startY + row * (dotSize + dotGap);
      const theme = THEMES[t];
      const isActive = this.themeId === t;

      // Button bg gradient
      const grad = ctx.createLinearGradient(bx, by, bx, by + dotSize);
      grad.addColorStop(0, theme.bgTop);
      grad.addColorStop(1, theme.bgBot);
      this._editorRoundRect(ctx, bx, by, dotSize, dotSize, 10);
      ctx.fillStyle = grad;
      ctx.fill();

      // Accent color circle
      ctx.beginPath();
      ctx.arc(bx + dotSize / 2, by + dotSize / 2, 12, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();

      // Active border
      if (isActive) {
        ctx.save();
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = 10;
        this._editorRoundRect(ctx, bx, by, dotSize, dotSize, 10);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      } else {
        this._editorRoundRect(ctx, bx, by, dotSize, dotSize, 10);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      this.buttons.push({ id: 'colpick_' + t, x: bx, y: by, w: dotSize, h: dotSize });
    }

    // CUSTOM button spanning full grid width
    const customY = startY + gridH + 16;
    const customH = 44;
    const customGrad = ctx.createLinearGradient(startX, customY, startX, customY + customH);
    customGrad.addColorStop(0, 'rgba(40,30,60,0.95)');
    customGrad.addColorStop(1, 'rgba(25,20,45,0.95)');
    this._editorRoundRect(ctx, startX, customY, gridW, customH, 10);
    ctx.fillStyle = customGrad;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = '#FF66AA';
    ctx.shadowBlur = 6;
    this._editorRoundRect(ctx, startX, customY, gridW, customH, 10);
    ctx.strokeStyle = '#FF66AA';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.fillStyle = '#FF66AA';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CUSTOM', SCREEN_WIDTH / 2, customY + customH / 2 + 6);
    this.buttons.push({ id: 'colpick_custom', x: startX, y: customY, w: gridW, h: customH });

    // Close hint
    ctx.fillStyle = '#445566';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC to close', SCREEN_WIDTH / 2, customY + customH + 25);
  }

  _drawInfo(ctx) {
    const info = this._calculateLevelInfo();
    const c = info.counts;

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const panelW = 420;
    const panelH = 400;
    const px = (SCREEN_WIDTH - panelW) / 2;
    const py = (SCREEN_HEIGHT - panelH) / 2;
    const r = 14;
    const lx = px + 28;
    const vx = px + panelW - 28;
    const rowH = 26;

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
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL INFO', SCREEN_WIDTH / 2, py + 38);
    ctx.shadowBlur = 0;
    ctx.restore();

    let sy = py + 65;

    const drawRow = (label, value, color = '#DDE') => {
      ctx.fillStyle = '#667788';
      ctx.font = '13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx, sy);
      ctx.fillStyle = color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(value, vx, sy);
      sy += rowH;
    };

    const drawSep = () => {
      sy += 6;
      ctx.strokeStyle = 'rgba(0,170,200,0.12)';
      ctx.beginPath();
      ctx.moveTo(lx, sy - 8);
      ctx.lineTo(vx, sy - 8);
      ctx.stroke();
      sy += 10;
    };

    // Level duration
    drawRow('Level Duration', info.hasEnd ? info.durationStr : 'No end marker', info.hasEnd ? '#44AACC' : '#556677');

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

    drawSep();

    // Total objects
    drawRow('Total Objects', String(info.objectCount), '#FFF');

    // Categories
    const hazards = (c.spike || 0) + (c.mini_spike || 0) + (c.saw || 0);
    const blocks = (c.platform || 0) + (c.mini_block || 0) + (c.slope || 0) + (c.mini_slope || 0) + (c.moving || 0) + (c.transport || 0);
    const orbs = (c.orb || 0);
    const pads = (c.pad || 0);
    const coins = (c.coin || 0);
    const checkpoints = (c.checkpoint || 0);

    drawRow('Hazards', String(hazards), '#FF5555');
    drawRow('Blocks', String(blocks), '#4488FF');
    drawRow('Orbs', String(orbs), '#FFD700');
    drawRow('Pads', String(pads), '#FFAA00');
    drawRow('Coins', String(coins), '#FFD700');
    drawRow('Checkpoints', String(checkpoints), '#00FF44');

    // Close hint
    ctx.fillStyle = '#445566';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Click anywhere or press ESC to close', SCREEN_WIDTH / 2, py + panelH - 16);
  }

  _drawHelp(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    const panelW = Math.min(700, SCREEN_WIDTH - 40);
    const panelH = Math.min(600, SCREEN_HEIGHT - 40);
    const px = (SCREEN_WIDTH - panelW) / 2;
    const py = (SCREEN_HEIGHT - panelH) / 2;

    const panelGrad = ctx.createLinearGradient(px, py, px, py + panelH);
    panelGrad.addColorStop(0, 'rgba(15,15,30,0.97)');
    panelGrad.addColorStop(1, 'rgba(8,8,18,0.97)');
    ctx.fillStyle = panelGrad;
    this._editorRoundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fill();
    ctx.shadowColor = '#00C8FF';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(0,200,255,0.5)';
    ctx.lineWidth = 1.5;
    this._editorRoundRect(ctx, px, py, panelW, panelH, 16);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.shadowColor = '#00C8FF';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EDITOR HELP', SCREEN_WIDTH / 2, py + 38);
    ctx.shadowBlur = 0;

    const leftX = px + 24;
    const rightX = px + panelW / 2 + 6;
    let ly = py + 62;
    let ry = py + 62;
    const lineH = 16;
    const secGap = 14;

    const drawSection = (x, yRef, title, color, lines) => {
      let y = yRef;
      ctx.fillStyle = color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(title, x, y);
      y += 4;
      ctx.font = '11px monospace';
      ctx.fillStyle = '#AAB';
      for (const line of lines) {
        y += lineH;
        ctx.fillText(line, x, y);
      }
      return y + secGap;
    };

    // LEFT COLUMN
    ly = drawSection(leftX, ly, 'HAZARDS', '#FF4444', [
      'Spike  - Triangle obstacle',
      'Saw    - Spinning blade (S / M / L)',
      'Click to place, Right-click to delete',
    ]);
    ly = drawSection(leftX, ly, 'BLOCKS', '#4488FF', [
      'Platform  - Click + drag for size',
      'Slope     - Ramp up or down',
      'Moving    - Click start, then end',
      'Transport - Locks player, moves to end',
    ]);
    ly = drawSection(leftX, ly, 'ORBS', '#FFD700', [
      'Yellow - Normal bounce on click',
      'Pink   - Lower bounce on click',
      'Dash   - Launches forward on click',
      'Blue   - Reverses gravity on click',
    ]);
    ly = drawSection(leftX, ly, 'PADS', '#FFAA00', [
      'Yellow - Auto bounce on contact',
      'Pink   - Lower auto bounce',
      'Blue   - Reverses gravity on contact',
    ]);

    // RIGHT COLUMN
    ry = drawSection(rightX, ry, 'PORTALS', '#FF00FF', [
      'Gravity    - Flip gravity',
      'Speed +/-  - Change scroll speed',
      'Ship / Wave / Cube / Ball - Mode',
      'Mini / Big - Change player size',
    ]);
    ry = drawSection(rightX, ry, 'SPECIAL', '#00FF88', [
      'Coin            - Collectible (max 3)',
      'Checkpoint      - Respawn point (practice)',
      'Start Pos       - Custom spawn point',
      'End Gate        - Level finish (only 1)',
      'Color Trigger   - Change theme mid-level',
    ]);
    ry = drawSection(rightX, ry, 'CONTROLS', '#00C8FF', [
      'Left Click    - Place object',
      'Right Click   - Delete object',
      'Scroll / Drag - Navigate level',
      'Ctrl+Z / Y    - Undo / Redo',
      'Ctrl+S        - Quick save',
    ]);
    ry = drawSection(rightX, ry, 'MENU  ≡', '#AABBCC', [
      'Open Level    - Browse saved levels',
      'Level Info    - Duration & stats',
      'Music         - Add custom music',
      'Help          - This screen',
      'Exit to Menu  - Return to main menu',
    ]);

    ctx.fillStyle = '#556677';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Click anywhere or press ESC to close', SCREEN_WIDTH / 2, py + panelH - 14);
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
    const cardH = 95;
    const gap = 12;
    const startX = (SCREEN_WIDTH - cardW) / 2;
    const newBtnY = 95;
    const listStartY = newBtnY + cardH + gap * 2;

    // Clamp scroll to max
    const listContentH = slots.length * (cardH + gap) - gap;
    const listVisibleH = SCREEN_HEIGHT - listStartY - 80;
    const maxBrowseScroll = Math.max(0, listContentH - listVisibleH);
    if (this.browseScroll > maxBrowseScroll) this.browseScroll = maxBrowseScroll;

    if (slots.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '18px monospace';
      ctx.fillText('No saved levels yet', SCREEN_WIDTH / 2, listStartY + 30);
    }

    // Scrollable level list (clipped)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listStartY, SCREEN_WIDTH, listVisibleH);
    ctx.clip();

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const cy = listStartY + i * (cardH + gap) - this.browseScroll;
      if (cy + cardH < listStartY || cy > listStartY + listVisibleH) continue;

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

      // NAME and PUBLISH buttons (bottom row of card)
      const smallH = 22;
      const smallY = cy + cardH - smallH - 6;
      const smallW = 60;
      const smallGap = 6;

      // NAME
      ctx.fillStyle = 'rgba(120,120,40,0.6)';
      this._editorRoundRect(ctx, startX + 10, smallY, smallW, smallH, 5);
      ctx.fill();
      ctx.fillStyle = '#CCCC66';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RENAME', startX + 10 + smallW / 2, smallY + smallH / 2 + 4);
      this.buttons.push({ id: 'browse_name_' + slot.id, x: startX + 10, y: smallY, w: smallW, h: smallH });

      // PUBLISH
      if (getAuthUser()) {
        const pubX = startX + 10 + smallW + smallGap;
        ctx.fillStyle = 'rgba(0,120,80,0.6)';
        this._editorRoundRect(ctx, pubX, smallY, smallW + 10, smallH, 5);
        ctx.fill();
        ctx.fillStyle = '#44DDAA';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('PUBLISH', pubX + (smallW + 10) / 2, smallY + smallH / 2 + 4);
        this.buttons.push({ id: 'browse_pub_' + slot.id, x: pubX, y: smallY, w: smallW + 10, h: smallH });
      }

      ctx.textAlign = 'center';
    }

    ctx.restore();

    // "New Level" button - drawn on top, not affected by scroll
    ctx.shadowColor = '#00FF66';
    ctx.shadowBlur = 12;
    const newGrad = ctx.createLinearGradient(startX, newBtnY, startX, newBtnY + cardH);
    newGrad.addColorStop(0, '#00CC55');
    newGrad.addColorStop(1, '#009940');
    ctx.fillStyle = newGrad;
    this._editorRoundRect(ctx, startX, newBtnY, cardW, cardH, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    this._editorRoundRect(ctx, startX, newBtnY, cardW, cardH, 12);
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('+ NEW LEVEL', SCREEN_WIDTH / 2, newBtnY + cardH / 2 + 8);
    this.buttons.push({ id: 'browse_new', x: startX, y: newBtnY, w: cardW, h: cardH });

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

    // Check buttons in reverse so later-drawn buttons (BACK) take priority
    for (let bi = this.buttons.length - 1; bi >= 0; bi--) {
      const btn = this.buttons[bi];
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.id === 'browse_new') {
          this._newLevel();
        } else if (btn.id === 'browse_back') {
          if (this.browseFromMenu) {
            if (this.onBack) this.onBack();
          } else {
            this.browsing = false;
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
        } else if (btn.id.startsWith('browse_name_')) {
          const slotId = btn.id.replace('browse_name_', '');
          const raw = localStorage.getItem('gd_editor_slot_' + slotId);
          if (raw) {
            const data = JSON.parse(raw);
            customPrompt('RENAME LEVEL', data.name || 'Untitled').then(name => {
              if (name != null && name.trim()) {
                data.name = name.trim();
                localStorage.setItem('gd_editor_slot_' + slotId, JSON.stringify(data));
                if (this.currentSlot === slotId) this.levelName = data.name;
                this._showToast('Renamed!');
              }
            });
          }
        } else if (btn.id.startsWith('browse_pub_')) {
          const slotId = btn.id.replace('browse_pub_', '');
          const raw = localStorage.getItem('gd_editor_slot_' + slotId);
          if (raw) {
            const data = JSON.parse(raw);
            if ((data.objects || []).length < 5) { this._showToast('Level too short!'); return; }
            publishLevel({ name: data.name || 'Untitled', themeId: data.themeId || 1, objects: data.objects }).then(res => {
              if (res.error) this._showToast('Error: ' + res.error);
              else this._showToast('Published!');
            });
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
    if (id.startsWith('cat_')) {
      const catId = id.replace('cat_', '');
      // Toggle: click same category again to close
      if (this.selectedCategory === catId) {
        this.selectedCategory = null;
        return;
      }
      this.selectedCategory = catId;
      // Select first tool of category
      const cat = TOOL_CATEGORIES.find(c => c.id === catId);
      if (cat) {
        const first = cat.tools[0];
        if (first.toolType) {
          this.selectedTool = first.toolType;
          this.subType = first.subType;
        } else {
          this.selectedTool = first.id;
          this.subType = null;
        }
      }
    } else if (id.startsWith('tool_')) {
      const toolId = id.replace('tool_', '');
      // Compound tool IDs like "orb:yellow_orb" set both tool and subtype
      const compoundTool = TOOLS.find(t => t.id === toolId);
      if (compoundTool && compoundTool.toolType) {
        this.selectedTool = compoundTool.toolType;
        this.subType = compoundTool.subType;
      } else {
        this.selectedTool = toolId;
        this.subType = null;
      }
      this.movingEndMode = false;
      this.movingStart = null;
      this.movingObj = null;
      this.movingObjIndex = -1;
      if (this.selectedTool === 'move' || this.selectedTool === 'erase') {
        this.swipeMode = 'scroll';
      }
    } else if (id.startsWith('sub_')) {
      const subId = id.replace('sub_', '');
      // Check if this is a category tool item
      if (this.selectedCategory) {
        const cat = TOOL_CATEGORIES.find(c => c.id === this.selectedCategory);
        if (cat) {
          const tool = cat.tools.find(t => (t.toolType ? t.subType : t.id) === subId);
          if (tool) {
            if (tool.toolType) {
              this.selectedTool = tool.toolType;
              this.subType = tool.subType;
            } else {
              this.selectedTool = tool.id;
              this.subType = null;
            }
            this.movingEndMode = false;
            this.movingStart = null;
            this.movingObj = null;
            this.movingObjIndex = -1;
            if (this.selectedTool === 'move' || this.selectedTool === 'erase') {
              this.swipeMode = 'scroll';
            }
            return;
          }
        }
      }
      // Default: color_trigger subtypes
      this.subType = subId;
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
    } else if (id === 'action_save_test') {
      if (!this.currentSlot) this.currentSlot = 'lvl_' + Date.now();
      this.saveToSlot(this.currentSlot);
      if (this.onTest) this.onTest(this.getLevelData());
    } else if (id === 'action_save_official') {
      this.showMenu = false;
      if (isAdmin()) {
        // Save current level first
        if (this.currentSlot && this.objects.length > 0) {
          this.saveToSlot(this.currentSlot);
        }
        this.officialPicker = true;
      }
    } else if (id === 'action_load') {
      this.showMenu = false;
      this.showBrowser();
    } else if (id === 'action_music') {
      this.showMenu = false;
      this._handleMusicButton();
    } else if (id === 'action_publish') {
      if (!getAuthUser()) { this._showToast('Login required!'); return; }
      if (this.objects.length < 5) { this._showToast('Level too short!'); return; }
      publishLevel({ name: this.levelName, themeId: this.themeId, objects: this.objects }).then(res => {
        if (res.error) this._showToast('Error: ' + res.error);
        else this._showToast('Published!');
      });
    } else if (id === 'action_export') {
      const json = this.exportJSON();
      navigator.clipboard?.writeText(json).then(() => {
        this._showToast('JSON copied!');
      }).catch(() => {
        this._showToast('Copy failed');
      });
    } else if (id === 'action_rename') {
      customPrompt('RENAME LEVEL', this.levelName).then(name => {
        if (name != null && name.trim()) {
          this.levelName = name.trim();
          this._showToast('Renamed to "' + this.levelName + '"');
        }
      });
    } else if (id === 'menu_load_official') {
      this.showMenu = false;
      this.officialLoadPicker = true;
    } else if (id.startsWith('loadofficial_')) {
      const lvl = parseInt(id.replace('loadofficial_', ''));
      this.officialLoadPicker = false;
      if (this.onLoadLevel) this.onLoadLevel(lvl);
    } else if (id === 'menu_color') {
      this.showMenu = false;
      this.showColorPicker = !this.showColorPicker;
    } else if (id === 'colpick_custom') {
      this.showColorPicker = false;
      this._showCustomThemeOverlay();
    } else if (id.startsWith('colpick_')) {
      const t = parseInt(id.replace('colpick_', ''));
      this.themeId = t;
      this.theme = THEMES[t];
      this.showColorPicker = false;
      this._showToast('Theme: ' + (THEMES[t].name || 'Level ' + t));
    } else if (id === 'action_menu') {
      this.showMenu = !this.showMenu;
    } else if (id === 'menu_info' || id === 'action_info') {
      this.showMenu = false;
      this.showInfo = !this.showInfo;
    } else if (id === 'menu_help' || id === 'action_help') {
      this.showMenu = false;
      this.showHelp = !this.showHelp;
    } else if (id === 'menu_exit' || id === 'action_back') {
      this.showMenu = false;
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
    const dlgH = 400;
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

    // Level buttons — 3 per row, up to 9
    const lvlCount = Object.keys(THEMES).length;
    const cols = 3;
    const rows = Math.ceil(lvlCount / cols);
    const btnW = (dlgW - 50) / cols;
    const btnH = 56;
    const btnGapY = 8;
    const startBtnY = dlgY + 90;

    for (let i = 0; i < lvlCount; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = dlgX + 15 + col * (btnW + 10);
      const by = startBtnY + row * (btnH + btnGapY);
      const theme = THEMES[i + 1] || THEMES[1];
      const grad = ctx.createLinearGradient(bx, by, bx, by + btnH);
      grad.addColorStop(0, theme.accent);
      grad.addColorStop(1, theme.accent + '66');
      ctx.fillStyle = grad;
      this._editorRoundRect(ctx, bx, by, btnW, btnH, 8);
      ctx.fill();

      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(theme.name || 'Level ' + (i + 1), bx + btnW / 2, by + btnH / 2 + 6);

      this.buttons.push({ id: 'official_pick_' + (i + 1), x: bx, y: by, w: btnW, h: btnH });
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
              console.log('[Official] Music key:', editorKey, 'hasMusic:', editorKey ? hasCustomMusic(editorKey) : false);
              if (editorKey && hasCustomMusic(editorKey)) {
                copyMusicBuffer(editorKey, levelId);
                const raw = await getRawMusicFromDB(editorKey);
                console.log('[Official] Raw music from DB:', raw ? raw.byteLength + ' bytes' : 'null');
                if (raw) {
                  const blob = new Blob([raw], { type: 'audio/mpeg' });
                  const file = new File([blob], 'music.mp3', { type: 'audio/mpeg' });
                  console.log('[Official] Uploading music for level', levelId, '...');
                  const musicPath = await uploadOfficialMusic(levelId, file);
                  console.log('[Official] Upload result:', musicPath);
                  if (musicPath) {
                    this._showToast('Official L' + levelId + ' + music saved!');
                  } else {
                    this._showToast('L' + levelId + ' saved, music upload failed');
                  }
                } else {
                  this._showToast('Official L' + levelId + ' saved (no music data)');
                }
              } else {
                this._showToast('Official L' + levelId + ' saved!');
              }
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
  }

  _showToast(text) {
    this.toastText = text;
    this.toastTimer = 2.0;
  }

  _handlePanelClick(x, y) {
    for (const btn of this.buttons) {
      if (btn.id.startsWith('sub_') && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        const st = btn.id.replace('sub_', '');
        // Find matching tool in active category
        const activeCat = TOOL_CATEGORIES.find(c => c.id === this.selectedCategory);
        if (activeCat) {
          const tool = activeCat.tools.find(t => t.id === st || t.subType === st);
          if (tool) {
            if (tool.toolType) {
              this.selectedTool = tool.toolType;
              this.subType = tool.subType;
            } else {
              this.selectedTool = tool.id;
              this.subType = null;
            }
          }
        } else {
          this.subType = st;
        }
        return;
      }
    }
  }
}
