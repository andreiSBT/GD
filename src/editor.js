/** Level Editor - visual grid-based editor for creating levels */

import { SCREEN_WIDTH, SCREEN_HEIGHT, GRID, GROUND_Y, GROUND_H, PLAYER_X_OFFSET, THEMES } from './settings.js';
import { createObstacle } from './obstacles.js';
import { syncEditorLevelToCloud, loadEditorLevelsFromCloud, deleteEditorLevelFromCloud, isConfigured } from './supabase.js';

const TOOLBAR_H = 56;
const PANEL_W = 180;

const TOOLS = [
  { id: 'spike', label: 'Spike', key: '1', color: '#FF4444' },
  { id: 'platform', label: 'Platform', key: '2', color: '#4488FF' },
  { id: 'moving', label: 'Moving', key: '3', color: '#44AAFF' },
  { id: 'orb', label: 'Orb', key: '4', color: '#FFD700' },
  { id: 'pad', label: 'Pad', key: '5', color: '#FFAA00' },
  { id: 'portal', label: 'Portal', key: '6', color: '#FF00FF' },
  { id: 'checkpoint', label: 'Check', key: '7', color: '#00FF44' },
  { id: 'end', label: 'End', key: '8', color: '#00FFFF' },
  { id: 'start', label: 'Start', key: '9', color: '#00FF88' },
  { id: 'move', label: 'Move', key: 'M', color: '#FFAA00' },
  { id: 'erase', label: 'Erase', key: 'X', color: '#FF0000' },
];

const SUBTYPES = {
  orb: ['yellow_orb', 'pink_orb', 'dash_orb'],
  pad: ['yellow_pad', 'pink_pad'],
  portal: ['gravity', 'speed_up', 'speed_down', 'ship', 'wave', 'cube'],
};

const SUBTYPE_COLORS = {
  yellow_orb: '#FFD700', pink_orb: '#FF69B4', dash_orb: '#00FF00',
  yellow_pad: '#FFD700', pink_pad: '#FF69B4',
  gravity: '#FFD700', speed_up: '#FF6600', speed_down: '#00AAFF',
  ship: '#FF00FF', wave: '#00FFAA', cube: '#00C8FF',
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
    this.levelName = 'Custom Level';

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

    // Level browser
    this.browsing = false;
    this.currentSlot = null;
    this.browseScroll = 0;
  }

  // === EVENT HANDLERS ===

  handleMouseDown(x, y, button) {
    // Level browser intercepts all clicks
    if (this.browsing) {
      this._handleBrowseClick(x, y);
      return;
    }
    // Dismiss help overlay on any click
    if (this.showHelp) {
      this.showHelp = false;
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

    if (button === 2) {
      // Right click = erase
      this._removeObjectAt(gx, gy);
      return;
    }

    if (this.selectedTool === 'erase') {
      this._removeObjectAt(gx, gy);
      this.painting = true;
      this.paintErase = true;
      this.lastPaintGx = gx;
      this.lastPaintGy = gy;
      return;
    }

    if (this.selectedTool === 'move') {
      // Pick up object at this position (drag to move)
      const idx = this._findObjectAt(gx, gy);
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

    if (this.selectedTool === 'platform') {
      this.dragStart = { gx, gy };
      this.dragWidth = 1;
    this.dragHeight = 1;
      return;
    }

    if (this.selectedTool === 'moving') {
      this.movingStart = { gx, gy };
      this.movingEndMode = true;
      return;
    }

    this._placeObject(gx, gy);
    // Start paint mode for tools that support it
    if (['spike', 'orb', 'pad', 'checkpoint', 'end'].includes(this.selectedTool)) {
      this.painting = true;
      this.paintErase = false;
      this.lastPaintGx = gx;
      this.lastPaintGy = gy;
    }
  }

  handleMouseMove(x, y) {
    this.mouseX = x;
    this.mouseY = y;
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
    if (this.painting && (grid.gx !== this.lastPaintGx || grid.gy !== this.lastPaintGy)) {
      if (this.paintErase) {
        this._removeObjectAt(grid.gx, grid.gy);
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
      this.objects.push({
        type: 'platform', x: minGx, y: minGy, w, h,
      });
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

    // Update hover position
    this.mouseX = x;
    this.mouseY = y;
    const grid = this._screenToGrid(x, y);
    this.hoverGx = grid.gx;
    this.hoverGy = grid.gy;

    // Move tool: pick up object on touch start
    if (this.selectedTool === 'move' && touchCount === 1 && y > TOOLBAR_H) {
      const idx = this._findObjectAt(grid.gx, grid.gy);
      if (idx >= 0) {
        this._pushHistory();
        this.movingObj = { ...this.objects[idx] };
        this.movingObjIndex = idx;
        this.touchPaintPending = false;
        return;
      }
    }

    // Start paint mode on touch for paintable tools (1 finger, on grid area)
    const paintTools = ['spike', 'orb', 'pad', 'checkpoint', 'end'];
    if (touchCount === 1 && y > TOOLBAR_H && paintTools.includes(this.selectedTool)) {
      this.touchPaintPending = true;
    } else {
      this.touchPaintPending = false;
    }
  }

  handleTouchMove(x, y) {
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

    // If paint pending and moved enough, start painting instead of scrolling
    if (this.touchPaintPending && dist > 15) {
      this.touchPaintPending = false;
      this.painting = true;
      this.paintErase = false;
      // Place first object at start position
      const startGrid = this._screenToGrid(this.touchStartX, this.touchStartY);
      this._placeObject(startGrid.gx, startGrid.gy);
      this.lastPaintGx = startGrid.gx;
      this.lastPaintGy = startGrid.gy;
      this.touchMoved = true;
    }

    // Paint mode: place objects on each new grid cell
    if (this.painting && (grid.gx !== this.lastPaintGx || grid.gy !== this.lastPaintGy)) {
      this._placeObject(grid.gx, grid.gy);
      this.lastPaintGx = grid.gx;
      this.lastPaintGy = grid.gy;
      return;
    }

    // If moved more than 15px and not painting, treat as scroll
    if (!this.painting && dist > 15) {
      this.touchMoved = true;
      this.isTouchScrolling = true;
      this.cameraX = Math.max(0, this.touchStartCamX - dx);
    }

    // Platform drag (only if started dragging a platform)
    if (this.dragStart && !this.isTouchScrolling) {
      const minGx = Math.min(this.dragStart.gx, this.hoverGx);
      const maxGx = Math.max(this.dragStart.gx, this.hoverGx);
      const minGy = Math.min(this.dragStart.gy, this.hoverGy);
      const maxGy = Math.max(this.dragStart.gy, this.hoverGy);
      this.dragMinGx = minGx;
      this.dragMinGy = minGy;
      this.dragWidth = maxGx - minGx + 1;
      this.dragHeight = maxGy - minGy + 1;
    }
  }

  handleTouchEnd() {
    this.touchPaintPending = false;

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

    if (this.touchMoved) return;

    // Tap = click at the touch position
    this.handleMouseDown(this.touchStartX, this.touchStartY, 0);

    // If we started a platform drag via tap, auto-finish it with width 1
    if (this.dragStart) {
      this._pushHistory();
      this.objects.push({
        type: 'platform', x: this.dragStart.gx, y: this.dragStart.gy, w: 1, h: 1,
      });
      this._rebuildLive();
      this.dragStart = null;
    }
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
      obs.draw(ctx, editorCamX, this.theme);
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

    // Bottom bar
    this._drawBottomBar(ctx);

    // Help overlay
    if (this.showHelp) {
      this._drawHelp(ctx);
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
    const gy = Math.max(0, Math.floor((GROUND_Y - sy) / GRID));
    return { gx, gy };
  }

  _screenToHalfGrid(sx, sy) {
    const worldX = sx + this.cameraX;
    const half = GRID / 2;
    const gx = Math.round(worldX / half) * 0.5;
    const gy = Math.max(0, Math.round((GROUND_Y - sy) / half) * 0.5);
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
      // Allow stacking portals of different subtypes
      if (o.type === 'portal') {
        const newSub = this.subType || 'gravity';
        if (o.portalType !== newSub) return false;
      }
      let objGy = o.y;
      if (o.type === 'spike' && o.rot === 180) {
        objGy = Math.floor(GROUND_Y / GRID) - o.y - 1;
      }
      return objGy === gy;
    });
    if (exists) return;

    this._pushHistory();

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
    }

    this.objects.push(obj);
    this._rebuildLive();
  }

  _findObjectAt(gx, gy) {
    return this.objects.findIndex(o => {
      if (o.type === 'platform' || o.type === 'moving') {
        return gx >= o.x && gx < o.x + (o.w || 1) && gy >= o.y && gy < o.y + (o.h || 1);
      }
      let objGy = o.y;
      if (o.type === 'spike' && o.rot === 180) {
        objGy = Math.floor(GROUND_Y / GRID) - o.y - 1;
      }
      return o.x === gx && objGy === gy;
    });
  }

  _removeObjectAt(gx, gy) {
    // Check if erasing the start position
    if (this.startPos && this.startPos.gx === gx && this.startPos.gy === gy) {
      this.startPos = null;
      this._showToast('Start pos removed');
      return;
    }

    const idx = this.objects.findIndex(o => {
      if (o.type === 'platform' || o.type === 'moving') {
        return gx >= o.x && gx < o.x + (o.w || 1) && gy >= o.y && gy < o.y + (o.h || 1);
      }
      // For rot=180 spikes, stored y is top-down, convert for comparison
      let objGy = o.y;
      if (o.type === 'spike' && o.rot === 180) {
        objGy = Math.floor(GROUND_Y / GRID) - o.y - 1;
      }
      return o.x === gx && objGy === gy;
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
      type: 'moving',
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
    this.currentSlot = 'lvl_' + Date.now();
    this.levelName = 'My Level';
    this.themeId = 1;
    this.theme = THEMES[1];
    this.objects = [];
    this.liveObstacles = [];
    this.history = [];
    this.historyIndex = -1;
    this.cameraX = 0;
    this.browsing = false;
  }

  showBrowser() {
    this.browsing = true;
    this.browseScroll = 0;
    this.buttons = [];
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

  loadExistingLevel(levelData) {
    this.objects = JSON.parse(JSON.stringify(levelData.objects));
    this.levelName = levelData.name;
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

    // Vertical lines
    for (let gx = startGx; gx <= endGx; gx++) {
      const sx = gx * GRID - this.cameraX;
      ctx.beginPath();
      ctx.moveTo(sx, TOOLBAR_H);
      ctx.lineTo(sx, GROUND_Y);
      ctx.stroke();
    }

    // Horizontal lines
    for (let gy = 0; gy <= maxGy; gy++) {
      const sy = GROUND_Y - gy * GRID;
      if (sy < TOOLBAR_H) break;
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

  _drawToolbar(ctx) {
    this.buttons = [];

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, TOOLBAR_H);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, TOOLBAR_H - 1, SCREEN_WIDTH, 1);

    const btnH = 40;
    const btnY = 8;
    const gap = 3;
    const margin = 8;

    const actions = [
      { id: 'action_rotate', label: 'ROT', color: '#888' },
      { id: 'action_undo', label: '⤹', color: '#555' },
      { id: 'action_redo', label: '⤸', color: '#555' },
      { id: 'action_test', label: 'TEST', color: '#00CC44' },
      { id: 'action_save', label: 'SAVE', color: '#4488CC' },
      { id: 'action_load', label: 'LOAD', color: '#6644AA' },
      { id: 'action_export', label: 'EXP', color: '#CC8800' },
      { id: 'action_help', label: '?', color: '#666' },
      { id: 'action_back', label: 'EXIT', color: '#CC3333' },
    ];

    // Calculate responsive button width
    const totalItems = TOOLS.length + actions.length;
    const totalGaps = (TOOLS.length - 1 + actions.length - 1 + 1) * gap; // gaps within groups + gap between groups
    const separatorGap = 12; // extra space between tools and actions
    const availW = SCREEN_WIDTH - margin * 2 - totalGaps - separatorGap;
    const btnW = Math.min(64, Math.floor(availW / totalItems));

    // Tool buttons
    for (let i = 0; i < TOOLS.length; i++) {
      const tool = TOOLS[i];
      const bx = margin + i * (btnW + gap);
      const isActive = this.selectedTool === tool.id;

      ctx.fillStyle = isActive ? tool.color : 'rgba(255,255,255,0.1)';
      ctx.fillRect(bx, btnY, btnW, btnH);

      if (isActive) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(bx, btnY, btnW, btnH);
      }

      ctx.fillStyle = isActive ? '#FFF' : '#AAA';
      ctx.font = `bold ${Math.min(11, Math.max(8, btnW / 6))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(tool.label, bx + btnW / 2, btnY + 16);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '9px monospace';
      ctx.fillText(tool.key, bx + btnW / 2, btnY + 32);

      this.buttons.push({ id: 'tool_' + tool.id, x: bx, y: btnY, w: btnW, h: btnH });
    }

    // Action buttons from right
    let ax = SCREEN_WIDTH - margin - actions.length * (btnW + gap) + gap;
    for (const act of actions) {
      ctx.fillStyle = act.color;
      ctx.fillRect(ax, btnY, btnW, btnH);
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

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(px, py, PANEL_W, subtypes.length * 40 + 30);

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Subtype', px + PANEL_W / 2, py + 16);

    for (let i = 0; i < subtypes.length; i++) {
      const st = subtypes[i];
      const by = py + 26 + i * 36;
      const isActive = this.subType === st || (!this.subType && i === 0);

      ctx.fillStyle = isActive ? SUBTYPE_COLORS[st] : 'rgba(255,255,255,0.1)';
      ctx.fillRect(px + 10, by, PANEL_W - 20, 30);

      if (isActive) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 10, by, PANEL_W - 20, 30);
      }

      ctx.fillStyle = isActive ? '#000' : '#CCC';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(st.replace('_', ' '), px + PANEL_W / 2, by + 19);

      this.buttons.push({ id: 'sub_' + st, x: px + 10, y: by, w: PANEL_W - 20, h: 30 });
    }
  }

  _drawBottomBar(ctx) {
    const y = SCREEN_HEIGHT - 36;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, y, SCREEN_WIDTH, 36);

    const scrollBtnW = 44;
    const scrollBtnH = 28;
    const sby = y + 4;
    const btnGap = 6;
    const smallBtnW = 32;

    // Left side: scroll buttons + info
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(10, sby, scrollBtnW, scrollBtnH);
    ctx.fillStyle = '#CCC';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◀', 10 + scrollBtnW / 2, sby + 20);
    this.buttons.push({ id: 'scroll_left', x: 10, y: sby, w: scrollBtnW, h: scrollBtnH });

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(60, sby, scrollBtnW, scrollBtnH);
    ctx.fillStyle = '#CCC';
    ctx.fillText('▶', 60 + scrollBtnW / 2, sby + 20);
    this.buttons.push({ id: 'scroll_right', x: 60, y: sby, w: scrollBtnW, h: scrollBtnH });

    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Obj: ${this.objects.length}  X: ${this.hoverGx}  Y: ${this.hoverGy}`, 114, sby + 19);

    // Right side: L1 L2 L3 | T1 T2 T3 — positioned from right edge
    let rx = SCREEN_WIDTH - 10;

    // Theme buttons (rightmost)
    for (let t = 3; t >= 1; t--) {
      rx -= smallBtnW;
      const isActive = this.themeId === t;
      ctx.fillStyle = isActive ? THEMES[t].accent : 'rgba(255,255,255,0.15)';
      ctx.fillRect(rx, sby, smallBtnW, scrollBtnH);
      ctx.fillStyle = isActive ? '#000' : '#AAA';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`T${t}`, rx + smallBtnW / 2, sby + 19);
      this.buttons.push({ id: 'theme_' + t, x: rx, y: sby, w: smallBtnW, h: scrollBtnH });
      rx -= btnGap;
    }

    rx -= 8; // extra gap between groups

    // Load level buttons
    for (let l = 3; l >= 1; l--) {
      rx -= smallBtnW;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(rx, sby, smallBtnW, scrollBtnH);
      ctx.fillStyle = '#AAA';
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

  _drawHelp(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL EDITOR HELP', SCREEN_WIDTH / 2, 60);

    const lines = [
      '1-8 : Select tool  |  X : Eraser',
      'Left Click : Place object',
      'Right Click : Delete object',
      'Platform : Click + drag for width',
      'Moving : Click start, then click end',
      '',
      'Mouse Wheel / Arrows : Scroll',
      'Ctrl+Z : Undo  |  Ctrl+Y : Redo',
      'Ctrl+S : Quick save',
      '',
      'TEST : Play your level',
      'SAVE/LOAD : LocalStorage',
      'EXPORT : Copy level JSON',
      'L1/L2/L3 : Load existing level',
      'T1/T2/T3 : Change theme',
      '',
      'ESC / H : Close this help',
    ];

    ctx.fillStyle = '#CCC';
    ctx.font = '16px monospace';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], SCREEN_WIDTH / 2, 110 + i * 28);
    }
  }

  // === LEVEL BROWSER ===

  _drawBrowse(ctx) {
    this.buttons = [];

    // Dark background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Title
    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MY LEVELS', SCREEN_WIDTH / 2, 60);

    const slots = this._getSlotList();
    // Sort by most recently updated
    slots.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const cardW = Math.min(500, SCREEN_WIDTH - 60);
    const cardH = 70;
    const gap = 12;
    const startX = (SCREEN_WIDTH - cardW) / 2;
    let startY = 100;

    // "New Level" button
    const newBtnY = startY;
    ctx.fillStyle = '#00C864';
    ctx.beginPath();
    ctx.roundRect(startX, newBtnY, cardW, cardH, 10);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('+ NEW LEVEL', SCREEN_WIDTH / 2, newBtnY + cardH / 2 + 8);
    this.buttons.push({ id: 'browse_new', x: startX, y: newBtnY, w: cardW, h: cardH });

    startY += cardH + gap * 2;

    // Level cards
    if (slots.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '18px monospace';
      ctx.fillText('No saved levels yet', SCREEN_WIDTH / 2, startY + 30);
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const cy = startY + i * (cardH + gap) - this.browseScroll;
      if (cy + cardH < 90 || cy > SCREEN_HEIGHT - 60) continue;

      // Card background
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.roundRect(startX, cy, cardW, cardH, 10);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(startX, cy, cardW, cardH, 10);
      ctx.stroke();

      // Level name
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(slot.name || 'Untitled', startX + 16, cy + 28);

      // Object count + date
      ctx.fillStyle = '#888';
      ctx.font = '14px monospace';
      const objText = (slot.objectCount || 0) + ' objects';
      const dateText = slot.updatedAt ? new Date(slot.updatedAt).toLocaleDateString() : '';
      ctx.fillText(objText + '  •  ' + dateText, startX + 16, cy + 52);

      // Click area for opening
      this.buttons.push({ id: 'browse_open_' + slot.id, x: startX, y: cy, w: cardW - 60, h: cardH });

      // Delete button (small X)
      const delX = startX + cardW - 50;
      const delY = cy + 10;
      const delS = 50;
      const delH = cardH - 20;
      ctx.fillStyle = '#661111';
      ctx.beginPath();
      ctx.roundRect(delX, delY, delS, delH, 8);
      ctx.fill();
      ctx.fillStyle = '#FF4444';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✕', delX + delS / 2, delY + delH / 2 + 7);
      this.buttons.push({ id: 'browse_del_' + slot.id, x: delX, y: delY, w: delS, h: delH });

      ctx.textAlign = 'center';
    }

    // Back button at bottom
    const backW = 200;
    const backH = 50;
    const backX = (SCREEN_WIDTH - backW) / 2;
    const backY = SCREEN_HEIGHT - 70;
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.roundRect(backX, backY, backW, backH, 10);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BACK', SCREEN_WIDTH / 2, backY + backH / 2 + 7);
    this.buttons.push({ id: 'browse_back', x: backX, y: backY, w: backW, h: backH });
  }

  _handleBrowseClick(x, y) {
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
        } else if (btn.id.startsWith('browse_del_')) {
          const slotId = btn.id.replace('browse_del_', '');
          this.deleteSlot(slotId);
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
    } else if (id === 'action_load') {
      this.showBrowser();
    } else if (id === 'action_export') {
      const json = this.exportJSON();
      navigator.clipboard?.writeText(json).then(() => {
        // Copied!
      }).catch(() => {
        prompt('Copy level JSON:', json);
      });
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
