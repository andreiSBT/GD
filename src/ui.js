/** UI screens: menu, level select, HUD, death screen, complete screen */

import { SCREEN_WIDTH, SCREEN_HEIGHT, THEMES, GROUND_Y, PLAYER_COLORS, PLAYER_TRAIL_COLORS, CUBE_ICONS, CUBE_SHAPES, PLAYER_SIZE } from './settings.js';
import { getLevelCount } from './level.js';
import { lighten } from './player.js';
import { getUsername } from './supabase.js';

function getEditorLevelCount() {
  try {
    const raw = localStorage.getItem('gd_editor_slots');
    return raw ? JSON.parse(raw).length : 0;
  } catch { return 0; }
}

function getTotalAttempts(progress) {
  let total = 0;
  for (const key of Object.keys(progress)) {
    total += (progress[key]?.attempts || 0);
  }
  // Add editor testing attempts
  try {
    total += parseInt(localStorage.getItem('gd_editor_attempts') || '0');
  } catch {}
  return total;
}

function getCompletedCount(progress) {
  let count = 0;
  for (const key of Object.keys(progress)) {
    if (progress[key]?.completed) count++;
  }
  return count;
}

export class UI {
  constructor() {
    this.buttons = [];
    this.pulseTimer = 0;
    // Floating menu particles
    this.menuParticles = [];
    for (let i = 0; i < 30; i++) {
      this.menuParticles.push({
        x: Math.random() * 1400,
        y: Math.random() * 700,
        size: 1 + Math.random() * 3,
        speed: 0.2 + Math.random() * 0.5,
        alpha: 0.05 + Math.random() * 0.15,
        drift: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  update(dt) {
    this.pulseTimer += dt;
    // Animate menu particles
    for (const p of this.menuParticles) {
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < -10) { p.y = 710; p.x = Math.random() * 1400; }
    }
  }

  // Returns button id if clicked, null otherwise
  handleClick(x, y) {
    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        return btn.id;
      }
    }
    return null;
  }

  drawMainMenu(ctx, progress) {
    this.buttons = [];

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#000818');
    grad.addColorStop(0.5, '#001030');
    grad.addColorStop(1, '#002060');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Floating particles
    this._drawMenuParticles(ctx);

    // Decorative horizontal line
    const lineW = 320;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#00C8FF';
    ctx.fillRect(SCREEN_WIDTH / 2 - lineW / 2, 215, lineW, 1);
    ctx.globalAlpha = 1;

    // Title with pulse and neon glow
    const pulse = 1 + Math.sin(this.pulseTimer * 3) * 0.03;
    ctx.save();
    ctx.translate(SCREEN_WIDTH / 2, 140);
    ctx.scale(pulse, pulse);

    // Outer glow
    ctx.shadowColor = '#00C8FF';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 68px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GEOMETRY DASH', 0, 0);
    ctx.shadowBlur = 0;

    // Bright inner text
    ctx.fillStyle = '#FFF';
    ctx.globalAlpha = 0.9;
    ctx.fillText('GEOMETRY DASH', 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Subtitle
    ctx.fillStyle = '#4A6A8A';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A  S I D E - S C R O L L I N G  R H Y T H M  G A M E', SCREEN_WIDTH / 2, 190);

    // Menu buttons
    const bw = 260, bh = 56, gap = 60;
    const bx = SCREEN_WIDTH / 2 - bw / 2;
    let by = 250;
    this._drawButton(ctx, bx, by, bw, bh, 'LEVELS', 'levels', '#00C864');
    by += gap;
    this._drawButton(ctx, bx, by, bw, bh, 'CUSTOMIZE', 'customize', '#8844CC');
    by += gap;
    this._drawButton(ctx, bx, by, bw, bh, 'EDITOR', 'editor', '#CC6600');

    // Stats button
    by += gap;
    this._drawButton(ctx, bx, by, bw, bh, 'STATS', 'stats', '#C8A000');

    // Account button (top right)
    const username = getUsername();
    if (username) {
      this._drawButton(ctx, SCREEN_WIDTH - 200, 12, 180, 38, username, 'account', '#224466', 16);
    } else {
      this._drawButton(ctx, SCREEN_WIDTH - 140, 12, 120, 38, 'ACCOUNT', 'account', '#224466', 16);
    }

    // Controls hint
    ctx.fillStyle = '#334455';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE / CLICK to jump   •   ESC for menu', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 30);
  }

  drawLevelSelect(ctx, progress) {
    this.buttons = [];

    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#000818');
    grad.addColorStop(1, '#001840');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    this._drawMenuParticles(ctx);

    // Title with glow
    ctx.save();
    ctx.shadowColor = '#00C8FF';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT LEVEL', SCREEN_WIDTH / 2, 60);
    ctx.shadowBlur = 0;
    ctx.restore();

    const count = getLevelCount();
    const cardW = 280;
    const cardH = 340;
    const gap = 40;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (SCREEN_WIDTH - totalW) / 2;
    const r = 14;

    for (let i = 1; i <= count; i++) {
      const theme = THEMES[i];
      const x = startX + (i - 1) * (cardW + gap);
      const y = 95;
      const prog = progress[i] || { attempts: 0, bestProgress: 0, completed: false };

      // Card shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      this._roundRect(ctx, x, y, cardW, cardH, r);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();

      // Card background gradient
      const cgrad = ctx.createLinearGradient(x, y, x, y + cardH);
      cgrad.addColorStop(0, theme.bgTop);
      cgrad.addColorStop(1, theme.bgBot);
      this._roundRect(ctx, x, y, cardW, cardH, r);
      ctx.fillStyle = cgrad;
      ctx.fill();

      // Inner highlight at top
      ctx.globalAlpha = 0.08;
      this._roundRect(ctx, x, y, cardW, cardH / 2, r);
      ctx.fillStyle = '#FFF';
      ctx.fill();
      ctx.globalAlpha = 1;

      // Neon border glow
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 10;
      this._roundRect(ctx, x, y, cardW, cardH, r);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Level name
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(theme.name, x + cardW / 2, y + 36);

      // Level number with glow
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 58px monospace';
      ctx.fillText(`${i}`, x + cardW / 2, y + 105);
      ctx.restore();

      // Progress bar with rounded ends
      const barX = x + 30;
      const barY = y + 140;
      const barW = cardW - 60;
      const barH = 10;
      const barR = 5;
      this._roundRect(ctx, barX, barY, barW, barH, barR);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      if (prog.bestProgress > 0) {
        const fillW = Math.max(barH, barW * prog.bestProgress);
        this._roundRect(ctx, barX, barY, fillW, barH, barR);
        ctx.fillStyle = prog.completed ? '#00FF64' : theme.accent;
        ctx.fill();
      }

      // Stats
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Best: ${Math.floor(prog.bestProgress * 100)}%`, x + cardW / 2, y + 175);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`Attempts: ${prog.attempts}`, x + cardW / 2, y + 195);

      // Completed badge
      if (prog.completed) {
        ctx.save();
        ctx.shadowColor = '#00FF64';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#00FF64';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('COMPLETED', x + cardW / 2, y + 220);
        ctx.restore();
      }

      // Normal and Practice buttons inside card
      const btnW = 110;
      const btnH = 40;
      const btnGap = 10;
      const btnY = y + cardH - btnH - 16;
      const btnX1 = x + (cardW - btnW * 2 - btnGap) / 2;
      const btnX2 = btnX1 + btnW + btnGap;

      this._drawButton(ctx, btnX1, btnY, btnW, btnH, 'NORMAL', `normal_${i}`, '#00C864', 15);
      this._drawButton(ctx, btnX2, btnY, btnW, btnH, 'PRACTICE', `practice_${i}`, '#C8A000', 15);
    }

    // Back button
    this._drawButton(ctx, 30, SCREEN_HEIGHT - 65, 130, 44, 'BACK', 'back', '#445566', 20);
  }

  drawStats(ctx, progress) {
    this.buttons = [];

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#0A0800');
    grad.addColorStop(0.5, '#1A1000');
    grad.addColorStop(1, '#2A1800');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    this._drawMenuParticles(ctx);

    // Title with glow
    ctx.save();
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STATS', SCREEN_WIDTH / 2, 70);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Decorative line
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(SCREEN_WIDTH / 2 - 150, 95, 300, 1);
    ctx.globalAlpha = 1;

    const prog = progress || {};
    const totalAttempts = getTotalAttempts(prog);
    const completedLevels = getCompletedCount(prog);
    const officialCount = getLevelCount();
    const createdLevels = getEditorLevelCount();

    const statItems = [
      { label: 'TOTAL ATTEMPTS', value: `${totalAttempts}`, color: '#FFD700' },
      { label: 'LEVELS COMPLETED', value: `${completedLevels} / ${officialCount}`, color: '#00FF64' },
      { label: 'LEVELS CREATED', value: `${createdLevels}`, color: '#FF8844' },
    ];

    const cardW = 340;
    const cardH = 100;
    const cardGap = 24;
    const startY = 140;
    const cardX = (SCREEN_WIDTH - cardW) / 2;

    for (let i = 0; i < statItems.length; i++) {
      const stat = statItems[i];
      const cy = startY + i * (cardH + cardGap);

      // Card background
      this._roundRect(ctx, cardX, cy, cardW, cardH, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      // Card border with stat color glow
      ctx.save();
      ctx.shadowColor = stat.color;
      ctx.shadowBlur = 8;
      this._roundRect(ctx, cardX, cy, cardW, cardH, 12);
      ctx.strokeStyle = stat.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Value
      ctx.save();
      ctx.shadowColor = stat.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = stat.color;
      ctx.font = 'bold 38px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stat.value, SCREEN_WIDTH / 2, cy + 50);
      ctx.restore();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stat.label, SCREEN_WIDTH / 2, cy + 80);
    }

    // Back button
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 100, SCREEN_HEIGHT - 80, 200, 48, 'BACK', 'back_stats', '#445566', 20);
  }

  drawHUD(ctx, progress, attempts, practiceMode, levelName) {
    this.buttons = [];

    // Progress bar at top — rounded, sleek
    const barW = 360;
    const barH = 8;
    const barX = (SCREEN_WIDTH - barW) / 2;
    const barY = 18;
    const barR = 4;

    this._roundRect(ctx, barX, barY, barW, barH, barR);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();

    if (progress > 0) {
      const fillW = Math.max(barH, barW * progress);
      ctx.save();
      ctx.shadowColor = '#00FF64';
      ctx.shadowBlur = 6;
      this._roundRect(ctx, barX, barY, fillW, barH, barR);
      ctx.fillStyle = '#00FF64';
      ctx.fill();
      ctx.restore();
    }

    // Progress percentage
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(progress * 100)}%`, SCREEN_WIDTH / 2, barY + barH + 16);

    // Attempts counter
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ATTEMPT: ${attempts}`, 16, 28);

    // Practice mode indicator
    if (practiceMode) {
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('PRACTICE', SCREEN_WIDTH - 65, 28);
      ctx.restore();
    }

    // Pause button (top right) — rounded
    const pbS = 44;
    const pbX = SCREEN_WIDTH - pbS - 10;
    const pbY = 8;
    this._roundRect(ctx, pbX, pbY, pbS, pbS, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    // Two vertical bars (pause icon)
    const bw = 6, bGap = 5;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    this._roundRect(ctx, pbX + pbS / 2 - bw - bGap / 2, pbY + 11, bw, pbS - 22, 2);
    ctx.fill();
    this._roundRect(ctx, pbX + pbS / 2 + bGap / 2, pbY + 11, bw, pbS - 22, 2);
    ctx.fill();
    const hitPad = 15;
    this.buttons.push({ id: 'pause', x: pbX - hitPad, y: 0, w: pbS + hitPad + 10, h: pbS + pbY + hitPad });

    // Level name
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(levelName, SCREEN_WIDTH - 20, SCREEN_HEIGHT - 12);
  }

  drawDeathScreen(ctx, progress, attempts) {
    this.buttons = [];

    // Dark overlay with vignette
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    const vig = ctx.createRadialGradient(SCREEN_WIDTH / 2, 300, 100, SCREEN_WIDTH / 2, 300, SCREEN_WIDTH * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Death text with red glow
    ctx.save();
    ctx.shadowColor = '#FF3333';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#FF3333';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU CRASHED!', SCREEN_WIDTH / 2, 230);
    ctx.restore();

    // Progress
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`${Math.floor(progress * 100)}%`, SCREEN_WIDTH / 2, 290);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '16px monospace';
    ctx.fillText(`Attempt ${attempts}`, SCREEN_WIDTH / 2, 320);

    // Buttons
    const bw = 240, bh = 52;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, 365, bw, bh, 'RETRY', 'retry', '#00C864');
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, 432, bw, bh, 'MENU', 'menu', '#445566');
  }

  drawCompleteScreen(ctx, attempts, theme) {
    this.buttons = [];

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Green glow vignette
    const glow = ctx.createRadialGradient(SCREEN_WIDTH / 2, 230, 50, SCREEN_WIDTH / 2, 230, 400);
    glow.addColorStop(0, 'rgba(0,255,100,0.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Complete text with neon glow
    ctx.save();
    ctx.shadowColor = '#00FF64';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#00FF64';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COMPLETE!', SCREEN_WIDTH / 2, 230);
    ctx.shadowBlur = 0;
    // Bright overlay
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('LEVEL COMPLETE!', SCREEN_WIDTH / 2, 230);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Attempts: ${attempts}`, SCREEN_WIDTH / 2, 295);

    // Buttons
    const bw = 240, bh = 52;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, 350, bw, bh, 'NEXT LEVEL', 'next_level', '#00C864');
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, 418, bw, bh, 'MENU', 'menu', '#445566');
  }

  drawPauseScreen(ctx, editorTesting = false) {
    this.buttons = [];

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Title with subtle glow
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', SCREEN_WIDTH / 2, 240);
    ctx.restore();

    // Decorative line
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#FFF';
    ctx.fillRect(SCREEN_WIDTH / 2 - 100, 260, 200, 1);
    ctx.globalAlpha = 1;

    const bw = 240, bh = 52, gap = 64;
    let btnY = 300;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, btnY, bw, bh, 'RESUME', 'resume', '#00C864');
    btnY += gap;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, btnY, bw, bh, 'RESTART', 'restart', '#CC3333');
    if (editorTesting) {
      btnY += gap;
      this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, btnY, bw, bh, 'EDIT LEVEL', 'back_to_editor', '#CC6600');
    }
    btnY += gap;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, btnY, bw, bh, 'MENU', 'menu', '#445566');
  }

  drawCustomize(ctx, customization) {
    this.buttons = [];

    const { colorIndex, trailIndex, iconIndex, shapeIndex } = customization;

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#080018');
    grad.addColorStop(0.5, '#0A0020');
    grad.addColorStop(1, '#1A0040');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    this._drawMenuParticles(ctx);

    // Title with glow
    ctx.save();
    ctx.shadowColor = '#AA55FF';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#CC88FF';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CUSTOMIZE', SCREEN_WIDTH / 2, 50);
    ctx.restore();

    // === PREVIEW ===
    const previewX = SCREEN_WIDTH / 2;
    const previewY = 110;
    const previewSize = PLAYER_SIZE * 1.6;
    const previewColor = PLAYER_COLORS[colorIndex];
    const trailColor = PLAYER_TRAIL_COLORS[trailIndex] || previewColor;
    const previewShape = CUBE_SHAPES[shapeIndex || 0] || 'square';

    // Preview background circle
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(previewX, previewY, 50, 0, Math.PI * 2);
    ctx.fill();

    // Draw preview cube with shape
    this._drawPreviewCube(ctx, previewX, previewY, previewSize, previewColor, CUBE_ICONS[iconIndex], previewShape);

    // Trail preview dots
    for (let i = 0; i < 6; i++) {
      const alpha = (i / 6) * 0.5;
      const sz = 3 + (i / 6) * 8;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = trailColor;
      ctx.fillRect(previewX - 55 - i * 14, previewY - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    // === COLOR SECTION ===
    const sectionY1 = 175;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('COLOR', SCREEN_WIDTH / 2, sectionY1);

    const colorSize = 38;
    const colorGap = 10;
    const colorTotalW = PLAYER_COLORS.length * (colorSize + colorGap) - colorGap;
    const colorStartX = (SCREEN_WIDTH - colorTotalW) / 2;

    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      const cx = colorStartX + i * (colorSize + colorGap);
      const cy = sectionY1 + 10;

      ctx.fillStyle = PLAYER_COLORS[i];
      ctx.fillRect(cx, cy, colorSize, colorSize);

      if (i === colorIndex) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - 3, cy - 3, colorSize + 6, colorSize + 6);
      }

      this.buttons.push({ id: `color_${i}`, x: cx, y: cy, w: colorSize, h: colorSize });
    }

    // === TRAIL COLOR SECTION ===
    const sectionY2 = 270;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRAIL', SCREEN_WIDTH / 2, sectionY2);

    const trailSize = 38;
    const trailGap = 10;
    const trailTotalW = PLAYER_TRAIL_COLORS.length * (trailSize + trailGap) - trailGap;
    const trailStartX = (SCREEN_WIDTH - trailTotalW) / 2;

    for (let i = 0; i < PLAYER_TRAIL_COLORS.length; i++) {
      const tx = trailStartX + i * (trailSize + trailGap);
      const ty = sectionY2 + 10;

      const tc = PLAYER_TRAIL_COLORS[i] || PLAYER_COLORS[colorIndex];
      ctx.fillStyle = tc;
      ctx.fillRect(tx, ty, trailSize, trailSize);

      if (i === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(tx, ty, trailSize, trailSize);
        ctx.fillStyle = '#FFF';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AUTO', tx + trailSize / 2, ty + trailSize / 2 + 4);
      }

      if (i === trailIndex) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(tx - 3, ty - 3, trailSize + 6, trailSize + 6);
      }

      this.buttons.push({ id: `trail_${i}`, x: tx, y: ty, w: trailSize, h: trailSize });
    }

    // === SHAPE SECTION ===
    const sectionY3 = 365;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SHAPE', SCREEN_WIDTH / 2, sectionY3);

    const shapeSize = 55;
    const shapeGap = 14;
    const shapeTotalW = CUBE_SHAPES.length * (shapeSize + shapeGap) - shapeGap;
    const shapeStartX = (SCREEN_WIDTH - shapeTotalW) / 2;

    for (let i = 0; i < CUBE_SHAPES.length; i++) {
      const sx = shapeStartX + i * (shapeSize + shapeGap);
      const sy = sectionY3 + 10;

      // Shape background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(sx, sy, shapeSize, shapeSize);

      // Draw mini cube with this shape
      this._drawPreviewCube(ctx, sx + shapeSize / 2, sy + shapeSize / 2, shapeSize * 0.7, previewColor, null, CUBE_SHAPES[i]);

      if (i === (shapeIndex || 0)) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(sx - 3, sy - 3, shapeSize + 6, shapeSize + 6);
      }

      this.buttons.push({ id: `shape_${i}`, x: sx, y: sy, w: shapeSize, h: shapeSize });
    }

    // === ICON SECTION ===
    const sectionY4 = 475;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ICON', SCREEN_WIDTH / 2, sectionY4);

    const iconSize = 55;
    const iconGap = 14;
    const iconTotalW = CUBE_ICONS.length * (iconSize + iconGap) - iconGap;
    const iconStartX = (SCREEN_WIDTH - iconTotalW) / 2;

    for (let i = 0; i < CUBE_ICONS.length; i++) {
      const ix = iconStartX + i * (iconSize + iconGap);
      const iy = sectionY4 + 10;

      // Icon background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(ix, iy, iconSize, iconSize);

      // Draw mini cube with this icon
      this._drawPreviewCube(ctx, ix + iconSize / 2, iy + iconSize / 2, iconSize * 0.7, previewColor, CUBE_ICONS[i], previewShape);

      if (i === iconIndex) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(ix - 3, iy - 3, iconSize + 6, iconSize + 6);
      }

      this.buttons.push({ id: `icon_${i}`, x: ix, y: iy, w: iconSize, h: iconSize });
    }

    // Back button
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 100, SCREEN_HEIGHT - 65, 200, 44, 'BACK', 'back_customize', '#445566', 20);
  }

  _drawPreviewCube(ctx, cx, cy, size, color, icon, shape) {
    const hs = size / 2;
    shape = shape || 'square';
    ctx.save();
    ctx.translate(cx, cy);

    // Body
    ctx.fillStyle = color;
    this._makePreviewShapePath(ctx, size, hs, shape);
    ctx.fill();

    // Gradient overlay
    const grad = ctx.createLinearGradient(0, -hs, 0, hs);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    this._makePreviewShapePath(ctx, size, hs, shape);
    ctx.fill();

    // Inner shape (lighter)
    const m = size * 0.18;
    ctx.fillStyle = lighten(color, 50);
    if (shape === 'square') {
      ctx.fillRect(-hs + m, -hs + m, size - m * 2, size - m * 2);
    } else if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, hs - m, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      const sc = (size - m * 2) / size;
      ctx.scale(sc, sc);
      this._makePreviewShapePath(ctx, size, hs, shape);
      ctx.fill();
      ctx.restore();
    }

    // Icon face (scaled)
    if (icon) {
      const scale = size / PLAYER_SIZE;
      ctx.save();
      ctx.scale(scale, scale);
      this._drawIconFace(ctx, icon);
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    this._makePreviewShapePath(ctx, size, hs, shape);
    ctx.stroke();

    ctx.restore();
  }

  _makePreviewShapePath(ctx, size, hs, shape) {
    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(0, 0, hs, 0, Math.PI * 2);
        break;
      case 'diamond':
        ctx.moveTo(0, -hs);
        ctx.lineTo(hs, 0);
        ctx.lineTo(0, hs);
        ctx.lineTo(-hs, 0);
        ctx.closePath();
        break;
      case 'triangle':
        ctx.moveTo(hs, 0);
        ctx.lineTo(-hs + 2, -hs + 2);
        ctx.lineTo(-hs + 2, hs - 2);
        ctx.closePath();
        break;
      case 'hexagon':
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = Math.cos(a) * hs;
          const py = Math.sin(a) * hs;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      case 'rounded': {
        const r = hs * 0.4;
        ctx.moveTo(-hs + r, -hs);
        ctx.lineTo(hs - r, -hs);
        ctx.quadraticCurveTo(hs, -hs, hs, -hs + r);
        ctx.lineTo(hs, hs - r);
        ctx.quadraticCurveTo(hs, hs, hs - r, hs);
        ctx.lineTo(-hs + r, hs);
        ctx.quadraticCurveTo(-hs, hs, -hs, hs - r);
        ctx.lineTo(-hs, -hs + r);
        ctx.quadraticCurveTo(-hs, -hs, -hs + r, -hs);
        ctx.closePath();
        break;
      }
      case 'cross': {
        const arm = hs * 0.38;
        ctx.moveTo(-arm, -hs);
        ctx.lineTo(arm, -hs);
        ctx.lineTo(arm, -arm);
        ctx.lineTo(hs, -arm);
        ctx.lineTo(hs, arm);
        ctx.lineTo(arm, arm);
        ctx.lineTo(arm, hs);
        ctx.lineTo(-arm, hs);
        ctx.lineTo(-arm, arm);
        ctx.lineTo(-hs, arm);
        ctx.lineTo(-hs, -arm);
        ctx.lineTo(-arm, -arm);
        ctx.closePath();
        break;
      }
      case 'dart':
        ctx.moveTo(hs, 0);
        ctx.lineTo(-hs + 2, -hs + 2);
        ctx.lineTo(-hs / 2, 0);
        ctx.lineTo(-hs + 2, hs - 2);
        ctx.closePath();
        break;
      default: // square
        ctx.rect(-hs, -hs, size, size);
        break;
    }
  }

  _drawIconFace(ctx, icon) {
    switch (icon) {
      case 'default':
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-4, -2, 5, 0, Math.PI * 2);
        ctx.arc(8, -2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-3, -2, 2.5, 0, Math.PI * 2);
        ctx.arc(9, -2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'cyclops':
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(2, -2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(3, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(1, -4, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'angry':
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-4, 0, 5, 0, Math.PI * 2);
        ctx.arc(8, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-3, 0, 2.5, 0, Math.PI * 2);
        ctx.arc(9, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-9, -6); ctx.lineTo(-1, -3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(13, -6); ctx.lineTo(5, -3);
        ctx.stroke();
        break;
      case 'robot':
        ctx.fillStyle = '#0FF';
        ctx.fillRect(-8, -6, 20, 8);
        ctx.fillStyle = '#000';
        ctx.fillRect(-6, -5, 6, 6);
        ctx.fillRect(4, -5, 6, 6);
        ctx.fillStyle = '#0FF';
        ctx.fillRect(-5, -4, 4, 4);
        ctx.fillRect(5, -4, 4, 4);
        break;
      case 'star':
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const innerAngle = angle + Math.PI / 5;
          ctx.lineTo(2 + Math.cos(angle) * 8, -1 + Math.sin(angle) * 8);
          ctx.lineTo(2 + Math.cos(innerAngle) * 4, -1 + Math.sin(innerAngle) * 4);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'x_eyes':
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-8, -6); ctx.lineTo(-1, 1);
        ctx.moveTo(-1, -6); ctx.lineTo(-8, 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(5, -6); ctx.lineTo(12, 1);
        ctx.moveTo(12, -6); ctx.lineTo(5, 1);
        ctx.stroke();
        break;
      case 'shades':
        ctx.fillStyle = '#111';
        ctx.fillRect(-10, -5, 10, 7);
        ctx.fillRect(3, -5, 10, 7);
        ctx.fillStyle = '#333';
        ctx.fillRect(-9, -4, 8, 5);
        ctx.fillRect(4, -4, 8, 5);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -2); ctx.lineTo(3, -2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-8, -4, 3, 2);
        ctx.fillRect(5, -4, 3, 2);
        break;
      case 'smile':
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-3, -3, 3, 0, Math.PI * 2);
        ctx.arc(7, -3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-2, -3, 1.5, 0, Math.PI * 2);
        ctx.arc(8, -3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(2, 2, 7, 0.2, Math.PI - 0.2);
        ctx.stroke();
        break;
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
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

  _drawMenuParticles(ctx) {
    for (const p of this.menuParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#00C8FF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawButton(ctx, x, y, w, h, text, id, color, fontSize = 22) {
    const r = 10;

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Main fill with gradient
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, lightenColor(color, 20));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darkenColor(color, 20));
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = grad;
    ctx.fill();

    // Top highlight
    ctx.globalAlpha = 0.2;
    this._roundRect(ctx, x, y, w, h / 2, r);
    ctx.fillStyle = '#FFF';
    ctx.fill();
    ctx.globalAlpha = 1;

    // Subtle border
    this._roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text with subtle shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    this.buttons.push({ id, x, y, w, h });
  }
}

function lightenColor(hex, amt) {
  if (!hex || hex[0] !== '#') return hex;
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amt);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amt);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amt);
  return `rgb(${r},${g},${b})`;
}

function darkenColor(hex, amt) {
  if (!hex || hex[0] !== '#') return hex;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
  return `rgb(${r},${g},${b})`;
}
