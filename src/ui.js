/** UI screens: menu, level select, HUD, death screen, complete screen */

import { SCREEN_WIDTH, SCREEN_HEIGHT, THEMES, GROUND_Y, PLAYER_COLORS, PLAYER_TRAIL_COLORS, CUBE_ICONS, PLAYER_SIZE } from './settings.js';
import { getLevelCount } from './level.js';
import { lighten } from './player.js';

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

    // Customize button
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 120, 480, 240, 60, 'CUSTOMIZE', 'customize', '#8844CC');

    // Controls hint
    ctx.fillStyle = '#445566';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE / CLICK to jump  •  ESC for menu', SCREEN_WIDTH / 2, 600);
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

  drawCustomize(ctx, customization) {
    this.buttons = [];

    const { colorIndex, trailIndex, iconIndex } = customization;

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#0A0020');
    grad.addColorStop(1, '#1A0040');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Title
    ctx.fillStyle = '#CC88FF';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CUSTOMIZE', SCREEN_WIDTH / 2, 60);

    // === PREVIEW ===
    const previewX = SCREEN_WIDTH / 2;
    const previewY = 130;
    const previewSize = PLAYER_SIZE * 1.8;
    const previewColor = PLAYER_COLORS[colorIndex];
    const trailColor = PLAYER_TRAIL_COLORS[trailIndex] || previewColor;

    // Preview background circle
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(previewX, previewY, 55, 0, Math.PI * 2);
    ctx.fill();

    // Draw preview cube
    this._drawPreviewCube(ctx, previewX, previewY, previewSize, previewColor, CUBE_ICONS[iconIndex]);

    // Trail preview dots
    for (let i = 0; i < 6; i++) {
      const alpha = (i / 6) * 0.5;
      const sz = 3 + (i / 6) * 8;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = trailColor;
      ctx.fillRect(previewX - 60 - i * 15, previewY - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    // === COLOR SECTION ===
    const sectionY1 = 210;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('COLOR', SCREEN_WIDTH / 2, sectionY1);

    const colorSize = 45;
    const colorGap = 12;
    const colorTotalW = PLAYER_COLORS.length * (colorSize + colorGap) - colorGap;
    const colorStartX = (SCREEN_WIDTH - colorTotalW) / 2;

    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      const cx = colorStartX + i * (colorSize + colorGap);
      const cy = sectionY1 + 15;

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
    const sectionY2 = 310;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRAIL', SCREEN_WIDTH / 2, sectionY2);

    const trailSize = 45;
    const trailGap = 12;
    const trailTotalW = PLAYER_TRAIL_COLORS.length * (trailSize + trailGap) - trailGap;
    const trailStartX = (SCREEN_WIDTH - trailTotalW) / 2;

    for (let i = 0; i < PLAYER_TRAIL_COLORS.length; i++) {
      const tx = trailStartX + i * (trailSize + trailGap);
      const ty = sectionY2 + 15;

      const tc = PLAYER_TRAIL_COLORS[i] || PLAYER_COLORS[colorIndex];
      ctx.fillStyle = tc;
      ctx.fillRect(tx, ty, trailSize, trailSize);

      if (i === 0) {
        // "Auto" label for first slot
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(tx, ty, trailSize, trailSize);
        ctx.fillStyle = '#FFF';
        ctx.font = '11px monospace';
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

    // === ICON SECTION ===
    const sectionY3 = 410;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ICON', SCREEN_WIDTH / 2, sectionY3);

    const iconSize = 60;
    const iconGap = 16;
    const iconTotalW = CUBE_ICONS.length * (iconSize + iconGap) - iconGap;
    const iconStartX = (SCREEN_WIDTH - iconTotalW) / 2;

    for (let i = 0; i < CUBE_ICONS.length; i++) {
      const ix = iconStartX + i * (iconSize + iconGap);
      const iy = sectionY3 + 15;

      // Icon background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(ix, iy, iconSize, iconSize);

      // Draw mini cube with this icon
      this._drawPreviewCube(ctx, ix + iconSize / 2, iy + iconSize / 2, iconSize * 0.7, previewColor, CUBE_ICONS[i]);

      if (i === iconIndex) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(ix - 3, iy - 3, iconSize + 6, iconSize + 6);
      }

      this.buttons.push({ id: `icon_${i}`, x: ix, y: iy, w: iconSize, h: iconSize });
    }

    // Back button
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 100, SCREEN_HEIGHT - 80, 200, 50, '← BACK', 'back_customize', '#666');
  }

  _drawPreviewCube(ctx, cx, cy, size, color, icon) {
    const hs = size / 2;
    ctx.save();
    ctx.translate(cx, cy);

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(-hs, -hs, size, size);

    // Gradient overlay
    const grad = ctx.createLinearGradient(0, -hs, 0, hs);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    ctx.fillRect(-hs, -hs, size, size);

    // Inner square
    const m = size * 0.18;
    ctx.fillStyle = lighten(color, 50);
    ctx.fillRect(-hs + m, -hs + m, size - m * 2, size - m * 2);

    // Icon face (scaled)
    const scale = size / PLAYER_SIZE;
    ctx.save();
    ctx.scale(scale, scale);
    this._drawIconFace(ctx, icon);
    ctx.restore();

    // Border
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(-hs, -hs, size, size);

    ctx.restore();
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
