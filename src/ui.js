/** UI screens: menu, level select, HUD, death screen, complete screen */

import { SCREEN_WIDTH, SCREEN_HEIGHT, THEMES, GROUND_Y } from './settings.js';
import { getLevelCount } from './level.js';

export class UI {
  constructor() {
    this.buttons = [];
    this.pulseTimer = 0;
  }

  update(dt) {
    this.pulseTimer += dt;
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

  drawMainMenu(ctx) {
    this.buttons = [];

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#001030');
    grad.addColorStop(1, '#002060');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Title with pulse
    const pulse = 1 + Math.sin(this.pulseTimer * 3) * 0.05;
    ctx.save();
    ctx.translate(SCREEN_WIDTH / 2, 180);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GEOMETRY DASH', 0, 0);

    // Title glow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 74px monospace';
    ctx.fillText('GEOMETRY DASH', 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Subtitle
    ctx.fillStyle = '#6688AA';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A side-scrolling rhythm game', SCREEN_WIDTH / 2, 240);

    // Play button
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 120, 320, 240, 60, 'PLAY', 'play', '#00C864');

    // Practice button
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 120, 400, 240, 60, 'PRACTICE', 'practice', '#C8A000');

    // Controls hint
    ctx.fillStyle = '#445566';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE / CLICK to jump  •  ESC for menu', SCREEN_WIDTH / 2, 530);
  }

  drawLevelSelect(ctx, progress) {
    this.buttons = [];

    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#001030');
    grad.addColorStop(1, '#002060');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#00C8FF';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT LEVEL', SCREEN_WIDTH / 2, 80);

    const count = getLevelCount();
    const cardW = 280;
    const cardH = 280;
    const gap = 40;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (SCREEN_WIDTH - totalW) / 2;

    for (let i = 1; i <= count; i++) {
      const theme = THEMES[i];
      const x = startX + (i - 1) * (cardW + gap);
      const y = 140;
      const prog = progress[i] || { attempts: 0, bestProgress: 0, completed: false };

      // Card background
      const cgrad = ctx.createLinearGradient(x, y, x, y + cardH);
      cgrad.addColorStop(0, theme.bgTop);
      cgrad.addColorStop(1, theme.bgBot);
      ctx.fillStyle = cgrad;
      ctx.fillRect(x, y, cardW, cardH);

      // Card border
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardW, cardH);

      // Level name
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(theme.name, x + cardW / 2, y + 40);

      // Level number
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 60px monospace';
      ctx.fillText(`${i}`, x + cardW / 2, y + 120);

      // Progress bar
      const barX = x + 30;
      const barY = y + 160;
      const barW = cardW - 60;
      const barH = 12;
      ctx.fillStyle = '#111';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = prog.completed ? '#0F0' : theme.accent;
      ctx.fillRect(barX, barY, barW * prog.bestProgress, barH);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // Stats
      ctx.fillStyle = '#AAA';
      ctx.font = '14px monospace';
      ctx.fillText(`Best: ${Math.floor(prog.bestProgress * 100)}%`, x + cardW / 2, y + 200);
      ctx.fillText(`Attempts: ${prog.attempts}`, x + cardW / 2, y + 222);

      // Completed badge
      if (prog.completed) {
        ctx.fillStyle = '#0F0';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('✓ COMPLETED', x + cardW / 2, y + 252);
      }

      // Clickable area
      this.buttons.push({ id: `level_${i}`, x, y, w: cardW, h: cardH });
    }

    // Back button
    this._drawButton(ctx, 30, SCREEN_HEIGHT - 70, 120, 45, '← BACK', 'back', '#666');
  }

  drawHUD(ctx, progress, attempts, practiceMode, levelName) {
    // Progress bar at top
    const barW = 400;
    const barH = 8;
    const barX = (SCREEN_WIDTH - barW) / 2;
    const barY = 20;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#00FF64';
    ctx.fillRect(barX, barY, barW * progress, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // Progress percentage
    ctx.fillStyle = '#FFF';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(progress * 100)}%`, SCREEN_WIDTH / 2, barY + barH + 18);

    // Attempts counter
    ctx.textAlign = 'left';
    ctx.fillText(`Attempt ${attempts}`, 20, 30);

    // Practice mode indicator
    if (practiceMode) {
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'right';
      ctx.fillText('PRACTICE MODE', SCREEN_WIDTH - 20, 30);
    }

    // Level name
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(levelName, SCREEN_WIDTH - 20, SCREEN_HEIGHT - 15);
  }

  drawDeathScreen(ctx, progress, attempts) {
    this.buttons = [];

    // Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Death text
    ctx.fillStyle = '#FF3333';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU CRASHED!', SCREEN_WIDTH / 2, 230);

    // Progress
    ctx.fillStyle = '#FFF';
    ctx.font = '24px monospace';
    ctx.fillText(`Progress: ${Math.floor(progress * 100)}%`, SCREEN_WIDTH / 2, 290);
    ctx.fillStyle = '#AAA';
    ctx.font = '18px monospace';
    ctx.fillText(`Attempt ${attempts}`, SCREEN_WIDTH / 2, 325);

    // Retry
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 120, 370, 240, 55, 'RETRY', 'retry', '#00C864');

    // Back to menu
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 120, 440, 240, 55, 'MENU', 'menu', '#666');
  }

  drawCompleteScreen(ctx, attempts, theme) {
    this.buttons = [];

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Complete text with glow
    ctx.fillStyle = '#00FF64';
    ctx.font = 'bold 56px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COMPLETE!', SCREEN_WIDTH / 2, 230);

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#00FF96';
    ctx.font = 'bold 58px monospace';
    ctx.fillText('LEVEL COMPLETE!', SCREEN_WIDTH / 2, 230);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#FFF';
    ctx.font = '24px monospace';
    ctx.fillText(`Attempts: ${attempts}`, SCREEN_WIDTH / 2, 300);

    // Next level / menu
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 120, 360, 240, 55, 'NEXT LEVEL', 'next_level', '#00C864');
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 120, 430, 240, 55, 'MENU', 'menu', '#666');
  }

  _drawButton(ctx, x, y, w, h, text, id, color) {
    // Check hover
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);

    // Lighter top edge
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, w, 3);

    // Text
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';

    this.buttons.push({ id, x, y, w, h });
  }
}
