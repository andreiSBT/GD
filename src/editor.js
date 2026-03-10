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
    this.theme = THEMES[1];
    this.themeId = 1;
    this.levelName = 'Custom Level';

    this.hoverGx = 0;
    this.hoverGy = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.dragStart = null;
    this.dragWidth = 1;
    this.movingEndMode = false;
    this.movingStart = null;

    this.history = [];
    this.historyIndex = -1;

    this.buttons = [];
    this.showHelp = false;
    this.scrollSpeed = 0;

    this.onTest = null;
    this.onBack = null;
  }

  // === EVENT HANDLERS ===

  handleMouseDown(x, y, button) {
    this.buttons = [];
    this._collectButtons();

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
      return;
    }

    if (this.selectedTool === 'moving') {
      this.movingStart = { gx, gy };
      this.movingEndMode = true;
      return;
    }

    this._placeObject(gx, gy);
  }

  handleMouseMove(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    const grid = this._screenToGrid(x, y);
    this.hoverGx = grid.gx;
    this.hoverGy = grid.gy;

    if (this.dragStart) {
      this.dragWidth = Math.max(1, this.hoverGx - this.dragStart.gx + 1);
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
      this._pushHistory();
      this.objects.push({
        type: 'platform', x: this.dragStart.gx, y: this.dragStart.gy, w, h: 1,
      });
      this._rebuildLive();
      this.dragStart = null;
    }
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
      // Cycle through spike rotation
      // No-op for now, rotation set via placement
      return true;
    }

    return false;
  }

  handleWheel(e) {
    this.cameraX = Math.max(0, this.cameraX + (e.deltaX || e.deltaY));
  }

  // === UPDATE / DRAW ===

  update(dt) {
    if (this.scrollSpeed !== 0) {
      this.cameraX = Math.max(0, this.cameraX + this.scrollSpeed);
    }
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
    const exists = this.objects.find(o => o.x === gx && o.y === gy && o.type === this.selectedTool);
    if (exists) return;

    this._pushHistory();

    const obj = { type: this.selectedTool, x: gx, y: gy };

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
      return o.x === gx && o.y === gy;
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

    // Tool buttons
    const btnW = 64;
    const btnH = 40;
    const startX = 10;
    const btnY = 8;

    for (let i = 0; i < TOOLS.length; i++) {
      const tool = TOOLS[i];
      const bx = startX + i * (btnW + 4);
      const isActive = this.selectedTool === tool.id;

      ctx.fillStyle = isActive ? tool.color : 'rgba(255,255,255,0.1)';
      ctx.fillRect(bx, btnY, btnW, btnH);

      if (isActive) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(bx, btnY, btnW, btnH);
      }

      ctx.fillStyle = isActive ? '#FFF' : '#AAA';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tool.label, bx + btnW / 2, btnY + 16);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '9px monospace';
      ctx.fillText(tool.key, bx + btnW / 2, btnY + 32);

      this.buttons.push({ id: 'tool_' + tool.id, x: bx, y: btnY, w: btnW, h: btnH });
    }

    // Right side: action buttons
    const actions = [
      { id: 'action_test', label: 'TEST', color: '#00CC44' },
      { id: 'action_save', label: 'SAVE', color: '#4488CC' },
      { id: 'action_load', label: 'LOAD', color: '#6644AA' },
      { id: 'action_export', label: 'EXPORT', color: '#CC8800' },
      { id: 'action_help', label: '?', color: '#666' },
      { id: 'action_back', label: 'EXIT', color: '#CC3333' },
    ];

    const actBtnW = 56;
    let ax = SCREEN_WIDTH - (actions.length * (actBtnW + 4)) - 6;
    for (const act of actions) {
      ctx.fillStyle = act.color;
      ctx.fillRect(ax, btnY, actBtnW, btnH);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(act.label, ax + actBtnW / 2, btnY + 24);
      this.buttons.push({ id: act.id, x: ax, y: btnY, w: actBtnW, h: btnH });
      ax += actBtnW + 4;
    }

    // Object count + position info
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Objects: ${this.objects.length}  Grid: ${this.hoverGx},${this.hoverGy}  Cam: ${Math.floor(this.cameraX / GRID)}`, startX + TOOLS.length * (btnW + 4) + 10, btnY + 24);
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
    const y = SCREEN_HEIGHT - 30;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, y, SCREEN_WIDTH, 30);

    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Level: ${this.levelName}  |  Theme: ${this.themeId}  |  H for help  |  Scroll: mouse wheel / arrows`, 10, y + 19);

    // Theme cycle buttons
    for (let t = 1; t <= 3; t++) {
      const tx = SCREEN_WIDTH - 150 + (t - 1) * 40;
      const isActive = this.themeId === t;
      ctx.fillStyle = isActive ? THEMES[t].accent : 'rgba(255,255,255,0.15)';
      ctx.fillRect(tx, y + 3, 32, 24);
      ctx.fillStyle = isActive ? '#000' : '#AAA';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`T${t}`, tx + 16, y + 19);
      this.buttons.push({ id: 'theme_' + t, x: tx, y: y + 3, w: 32, h: 24 });
    }

    // Load level buttons
    for (let l = 1; l <= 3; l++) {
      const lx = SCREEN_WIDTH - 310 + (l - 1) * 40;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(lx, y + 3, 32, 24);
      ctx.fillStyle = '#AAA';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`L${l}`, lx + 16, y + 19);
      this.buttons.push({ id: 'loadlevel_' + l, x: lx, y: y + 3, w: 32, h: 24 });
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
      ctx.beginPath();
      ctx.moveTo(sx + GRID / 2, sy + 2);
      ctx.lineTo(sx + 4, sy + GRID - 2);
      ctx.lineTo(sx + GRID - 4, sy + GRID - 2);
      ctx.closePath();
      ctx.fill();
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
    const { sx, sy } = this._gridToScreen(this.dragStart.gx, this.dragStart.gy);
    const w = this.dragWidth * GRID;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#4488FF';
    ctx.fillRect(sx, sy, w, GRID);
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, w, GRID);

    ctx.fillStyle = '#FFF';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.8;
    ctx.fillText(`${this.dragWidth}×1`, sx + w / 2, sy + GRID / 2 + 4);
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
    } else if (id.startsWith('loadlevel_')) {
      const lvl = parseInt(id.replace('loadlevel_', ''));
      if (this.onLoadLevel) this.onLoadLevel(lvl);
    } else if (id === 'action_test') {
      if (this.onTest) this.onTest(this.getLevelData());
    } else if (id === 'action_save') {
      this.save('manual');
      // Visual feedback could be added here
    } else if (id === 'action_load') {
      this.load('manual');
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
