/** Level Editor - visual grid-based editor for creating levels */

import { SCREEN_WIDTH, SCREEN_HEIGHT, GRID, GROUND_Y, GROUND_H, PLAYER_X_OFFSET, THEMES } from './settings.js';
import { createObstacle } from './obstacles.js';

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
  }

  // === EVENT HANDLERS ===

  handleMouseDown(x, y, button) {
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

    if (this.dragStart) {
      this.dragWidth = Math.max(1, this.hoverGx - this.dragStart.gx + 1);
      this.dragHeight = Math.max(1, this.dragStart.gy - this.hoverGy + 1);
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
    if (this.dragStart) {
      const w = Math.max(1, this.hoverGx - this.dragStart.gx + 1);
      const h = Math.max(1, this.dragStart.gy - this.hoverGy + 1);
      const baseY = this.dragStart.gy - (h - 1);
      this._pushHistory();
      this.objects.push({
        type: 'platform', x: this.dragStart.gx, y: baseY, w, h,
      });
      this._rebuildLive();
      this.dragStart = null;
    }
    this.painting = false;
    this.paintErase = false;
  }

  handleKeyDown(e) {
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
      if (this.onBack) this.onBack();
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
      this.save('autosave');
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
  }

  handleTouchMove(x, y) {
    const dx = x - this.touchStartX;
    const dy = y - this.touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If moved more than 15px, treat as scroll
    if (dist > 15) {
      this.touchMoved = true;
      this.isTouchScrolling = true;
      this.cameraX = Math.max(0, this.touchStartCamX - dx);
    }

    // Update hover
    this.mouseX = x;
    this.mouseY = y;
    const grid = this._screenToGrid(x, y);
    this.hoverGx = grid.gx;
    this.hoverGy = grid.gy;

    // Platform drag (only if started dragging a platform)
    if (this.dragStart && !this.isTouchScrolling) {
      this.dragWidth = Math.max(1, this.hoverGx - this.dragStart.gx + 1);
      this.dragHeight = Math.max(1, this.dragStart.gy - this.hoverGy + 1);
    }
  }

  handleTouchEnd() {
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

    // Moving platform end indicator
    if (this.movingEndMode && this.movingStart) {
      this._drawMovingPreview(ctx);
    }

    // Drag preview
    if (this.dragStart) {
      this._drawDragPreview(ctx);
    }

    // Hover preview
    if (!this.dragStart && !this.showHelp && this.mouseY > TOOLBAR_H) {
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

  _gridToScreen(gx, gy) {
    const sx = gx * GRID - this.cameraX;
    const sy = GROUND_Y - (gy + 1) * GRID;
    return { sx, sy };
  }

  // === OBJECT MANAGEMENT ===

  _placeObject(gx, gy) {
    // Check if object already exists at this position
    const exists = this.objects.find(o => {
      if (o.x !== gx || o.type !== this.selectedTool) return false;
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

  _removeObjectAt(gx, gy) {
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
    return {
      id: 99,
      name: this.levelName,
      speed: 1.0,
      objects: [...this.objects],
    };
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
      { id: 'action_undo', label: '↩', color: '#555' },
      { id: 'action_redo', label: '↪', color: '#555' },
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
    const startGy = this.dragStart.gy - (this.dragHeight - 1);
    const { sx, sy } = this._gridToScreen(this.dragStart.gx, startGy);
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
      this.save('manual');
      this._showToast('Saved!');
    } else if (id === 'action_load') {
      if (this.load('manual')) this._showToast('Loaded!');
      else this._showToast('No save found');
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
