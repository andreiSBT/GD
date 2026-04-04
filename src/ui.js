/** UI screens: menu, level select, HUD, death screen, complete screen */

import { SCREEN_WIDTH, SCREEN_HEIGHT, THEMES, GROUND_Y, PLAYER_COLORS, PLAYER_TRAIL_COLORS, PLAYER_TRAIL_STYLES, CUBE_ICONS, CUBE_SHAPES, PLAYER_SIZE, IS_MOBILE } from './settings.js';
import { getLevelCount, LEVEL_DATA } from './level.js';
import { lighten } from './player.js';
import { getUsername } from './supabase.js';
import { getMusicVolume, getSFXVolume } from './sound.js';
import { getAchievements, loadUnlocked } from './achievements.js';

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
    // Scroll state for list screens
    this.scrollY = 0;
    this.maxScrollY = 0;
    this.scrollTouchStartY = 0;
    this.scrollTouchStartScroll = 0;
    this.isScrollDragging = false;
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

  resetScroll() {
    this.scrollY = 0;
    this.maxScrollY = 0;
  }

  handleWheel(deltaY) {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollY + deltaY));
  }

  handleScrollTouchStart(y) {
    this.scrollTouchStartY = y;
    this.scrollTouchStartScroll = this.scrollY;
    this.isScrollDragging = false;
  }

  handleScrollTouchMove(y) {
    const dy = this.scrollTouchStartY - y;
    if (Math.abs(dy) > 5) this.isScrollDragging = true;
    this.scrollY = Math.max(0, Math.min(this.maxScrollY, this.scrollTouchStartScroll + dy));
  }

  // Returns button id if clicked, null otherwise
  handleClick(x, y) {
    // Check buttons in reverse order so buttons drawn on top take priority
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const btn = this.buttons[i];
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
    const bw = IS_MOBILE ? 300 : 260, bh = IS_MOBILE ? 60 : 56, gap = IS_MOBILE ? 64 : 60;
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

    // Friends button
    by += gap;
    this._drawButton(ctx, bx, by, bw, bh, 'FRIENDS', 'friends', '#0088CC');

    // Community button
    by += gap;
    this._drawButton(ctx, bx, by, bw, bh, 'COMMUNITY', 'community', '#00AA88');

    // Account button (top right)
    const username = getUsername();
    const accH = IS_MOBILE ? 48 : 38;
    const accFont = IS_MOBILE ? 18 : 16;
    if (username) {
      this._drawButton(ctx, SCREEN_WIDTH - 210, 10, 190, accH, username, 'account', '#224466', accFont);
    } else {
      this._drawButton(ctx, SCREEN_WIDTH - 150, 10, 130, accH, 'ACCOUNT', 'account', '#224466', accFont);
    }

    // Controls hint
    ctx.fillStyle = '#334455';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(IS_MOBILE ? 'TAP to jump' : 'SPACE / CLICK to jump   •   ESC for menu', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 30);
  }

  drawLevelSelect(ctx, progress, page = 0, showScrollCoin = false) {
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
    const perPage = 3;
    const maxPage = Math.ceil(count / perPage) - 1;
    // Pages beyond maxPage show "COMING SOON"
    const isComingSoon = page > maxPage;

    if (isComingSoon) {
      // Coming soon screen
      ctx.save();
      ctx.shadowColor = '#00C8FF';
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#00C8FF';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('COMING SOON', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 20);
      ctx.shadowBlur = 0;
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('More levels are on the way!', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 20);

      // Secret coin above COMING SOON
      if (showScrollCoin) {
        const coinX = SCREEN_WIDTH / 2;
        const coinY = SCREEN_HEIGHT / 2 - 90;
        const coinR = 20;
        const pulse = 1 + Math.sin(Date.now() / 300) * 0.1;
        ctx.save();
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(coinX, coinY, coinR * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#FFD700';
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#886600';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', coinX, coinY);
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
        this.buttons.push({ x: coinX - coinR - 5, y: coinY - coinR - 5, w: (coinR + 5) * 2, h: (coinR + 5) * 2, id: 'collect_scroll_coin' });
      }

      // Arrows: left goes back, right wraps to page 0
      const arrowY = 32;
      const arrowW = IS_MOBILE ? 56 : 48, arrowH = IS_MOBILE ? 44 : 38;
      this._drawButton(ctx, 15, arrowY, arrowW, arrowH, '<', 'levels_prev', '#224466', 28);
      this._drawButton(ctx, SCREEN_WIDTH - arrowW - 15, arrowY, arrowW, arrowH, '>', 'levels_wrap_start', '#224466', 28);

      // Page indicator
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${page + 1} / ${maxPage + 2}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 60);

      const backH = IS_MOBILE ? 52 : 44;
      this._drawButton(ctx, 30, SCREEN_HEIGHT - backH - 20, IS_MOBILE ? 150 : 130, backH, 'BACK', 'back', '#445566', 20);
      return;
    }

    const firstIdx = page * perPage + 1;
    const lastIdx = Math.min(firstIdx + perPage - 1, count);
    const visibleCount = lastIdx - firstIdx + 1;

    const cardW = 280;
    const cardH = 340;
    const gap = 40;
    const totalW = visibleCount * cardW + (visibleCount - 1) * gap;
    const startX = (SCREEN_WIDTH - totalW) / 2;
    const r = 14;

    for (let slot = 0; slot < visibleCount; slot++) {
      const i = firstIdx + slot;
      const theme = THEMES[i] || THEMES[1];
      const x = startX + slot * (cardW + gap);
      const y = 95;
      const prog = progress[i] || { attempts: 0, bestProgress: 0, completed: false };

      this.buttons.push({ x, y, w: cardW, h: cardH, id: `normal_${i}` });

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
      const levelName = (LEVEL_DATA[i] && LEVEL_DATA[i].name) || theme.name || `Level ${i}`;
      ctx.fillText(levelName, x + cardW / 2, y + 36);

      // Level number with glow
      ctx.save();
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 15;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 58px monospace';
      ctx.fillText(`${i}`, x + cardW / 2, y + 105);
      ctx.restore();

      // Progress bar
      const barX = x + 30, barY = y + 140, barW = cardW - 60, barH = 10, barR = 5;
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

      // Coins
      const levelData = LEVEL_DATA[i];
      const totalCoins = levelData ? Math.min(3, levelData.objects.filter(o => o.type === 'coin').length) : 0;
      if (totalCoins > 0) {
        const collected = prog.bestCoins || 0;
        const coinY = y + 218, coinSpacing = 22;
        const coinStartX = x + cardW / 2 - ((totalCoins - 1) * coinSpacing) / 2;
        for (let c = 0; c < totalCoins; c++) {
          const cx = coinStartX + c * coinSpacing;
          const got = c < collected;
          ctx.beginPath();
          ctx.arc(cx, coinY, 8, 0, Math.PI * 2);
          ctx.fillStyle = got ? '#FFD700' : 'rgba(255,215,0,0.15)';
          ctx.fill();
          ctx.strokeStyle = got ? '#FFA500' : 'rgba(255,215,0,0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (prog.completed) {
        ctx.save();
        ctx.shadowColor = '#00FF64';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#00FF64';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('COMPLETED', x + cardW / 2, totalCoins > 0 ? y + 248 : y + 220);
        ctx.restore();
      }

      // Buttons
      const btnW = IS_MOBILE ? 115 : 110, btnH = IS_MOBILE ? 50 : 40, btnGap = 10;
      const btnY = y + cardH - btnH - 12;
      const btnX1 = x + (cardW - btnW * 2 - btnGap) / 2;
      const btnX2 = btnX1 + btnW + btnGap;
      this._drawButton(ctx, btnX1, btnY, btnW, btnH, 'NORMAL', `normal_${i}`, '#00C864', IS_MOBILE ? 17 : 15);
      this._drawButton(ctx, btnX2, btnY, btnW, btnH, 'PRACTICE', `practice_${i}`, '#C8A000', IS_MOBILE ? 17 : 15);
    }

    // Page arrows - always visible on both sides
    const arrowY = 32;
    const arrowW = IS_MOBILE ? 56 : 48, arrowH = IS_MOBILE ? 44 : 38;
    this._drawButton(ctx, 15, arrowY, arrowW, arrowH, '<', page > 0 ? 'levels_prev' : 'levels_wrap_end', '#224466', 28);
    this._drawButton(ctx, SCREEN_WIDTH - arrowW - 15, arrowY, arrowW, arrowH, '>', 'levels_next', '#224466', 28);

    // Page indicator
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${page + 1} / ${maxPage + 2}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 60);

    // Back button
    const backH = IS_MOBILE ? 52 : 44;
    this._drawButton(ctx, 30, SCREEN_HEIGHT - backH - 20, IS_MOBILE ? 150 : 130, backH, 'BACK', 'back', '#445566', 20);
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
    const totalJumps = parseInt(localStorage.getItem('gd_total_jumps') || '0');
    const completedLevels = getCompletedCount(prog);
    const officialCount = getLevelCount();
    const createdLevels = getEditorLevelCount();

    const levelCoins = Object.values(prog).reduce((sum, l) => sum + (l.bestCoins || 0), 0);
    const secretCoins = parseInt(localStorage.getItem('gd_secret_coins') || '0');
    const totalCoins = levelCoins + secretCoins;

    const statItems = [
      { label: 'TOTAL ATTEMPTS', value: `${totalAttempts}`, color: '#FFD700' },
      { label: 'TOTAL JUMPS', value: `${totalJumps}`, color: '#FFD700' },
      { label: 'LEVELS COMPLETED', value: `${completedLevels} / ${officialCount}`, color: '#00FF64' },
      { label: 'COINS COLLECTED', value: `${totalCoins}`, color: '#FFD700' },
      { label: 'LEVELS CREATED', value: `${createdLevels}`, color: '#FF8844' },
    ];

    const cardW = 340;
    const cardH = 90;
    const cardGap = 18;
    const startY = 115;
    const cardX = (SCREEN_WIDTH - cardW) / 2;

    // Achievements data
    const achievements = getAchievements();
    const unlocked = loadUnlocked();
    const unlockedCount = achievements.filter(a => unlocked.has(a.id)).length;
    const achCols = 3;
    const achCardW = 200;
    const achCardH = 68;
    const achGapX = 14;
    const achGapY = 10;
    const achRows = Math.ceil(achievements.length / achCols);

    // Calculate total content height
    const statsH = statItems.length * (cardH + cardGap);
    const achHeaderH = 60;
    const achGridH = achRows * (achCardH + achGapY) - achGapY;
    const totalContentH = statsH + achHeaderH + achGridH + 20;
    const visibleH = SCREEN_HEIGHT - startY - 80;
    this.maxScrollY = Math.max(0, totalContentH - visibleH);

    // Scrollable content area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, startY, SCREEN_WIDTH, visibleH);
    ctx.clip();

    for (let i = 0; i < statItems.length; i++) {
      const stat = statItems[i];
      const cy = startY + i * (cardH + cardGap) - this.scrollY;
      if (cy + cardH < startY || cy > startY + visibleH) continue;

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
      ctx.fillText(stat.value, SCREEN_WIDTH / 2, cy + 45);
      ctx.restore();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(stat.label, SCREEN_WIDTH / 2, cy + 72);
    }

    // ---- Achievements section ----
    const achStartY = startY + statsH + 16 - this.scrollY;

    // "ACHIEVEMENTS" sub-title
    ctx.save();
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ACHIEVEMENTS', SCREEN_WIDTH / 2, achStartY);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Count
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${unlockedCount} / ${achievements.length} Unlocked`, SCREEN_WIDTH / 2, achStartY + 22);

    // Achievement grid: 3 columns
    const gridW = achCols * achCardW + (achCols - 1) * achGapX;
    const gridStartX = (SCREEN_WIDTH - gridW) / 2;
    const gridTopY = achStartY + 38;

    for (let i = 0; i < achievements.length; i++) {
      const ach = achievements[i];
      const col = i % achCols;
      const row = Math.floor(i / achCols);
      const ax = gridStartX + col * (achCardW + achGapX);
      const ay = gridTopY + row * (achCardH + achGapY);
      if (ay + achCardH < startY || ay > startY + visibleH) continue;
      const isUnlocked = unlocked.has(ach.id);

      // Card background
      this._roundRect(ctx, ax, ay, achCardW, achCardH, 8);
      ctx.fillStyle = isUnlocked ? 'rgba(50,40,0,0.5)' : 'rgba(0,0,0,0.35)';
      ctx.fill();

      // Card border
      ctx.save();
      const borderColor = isUnlocked ? '#FFD700' : '#444444';
      ctx.shadowColor = isUnlocked ? '#FFD700' : 'transparent';
      ctx.shadowBlur = isUnlocked ? 6 : 0;
      this._roundRect(ctx, ax, ay, achCardW, achCardH, 8);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = isUnlocked ? 0.6 : 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Icon
      ctx.font = '18px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isUnlocked ? '#FFD700' : '#555555';
      ctx.fillText(isUnlocked ? '\u2713' : '\u{1F512}', ax + 8, ay + achCardH / 2 - 2);

      // Title (word wrap)
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = isUnlocked ? '#FFD700' : '#666666';
      ctx.textBaseline = 'top';
      const textMaxW = achCardW - 38;
      const titleLines = this._wrapText(ctx, ach.title, textMaxW);
      for (let l = 0; l < titleLines.length; l++) {
        ctx.fillText(titleLines[l], ax + 30, ay + 8 + l * 14);
      }

      // Description (word wrap)
      ctx.font = '10px monospace';
      ctx.fillStyle = isUnlocked ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
      const descTopY = ay + 8 + titleLines.length * 14 + 4;
      const descLines = this._wrapText(ctx, ach.desc, textMaxW);
      for (let l = 0; l < descLines.length; l++) {
        ctx.fillText(descLines[l], ax + 30, descTopY + l * 12);
      }

      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();

    // Back button
    const statsBkH = IS_MOBILE ? 56 : 48;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 110, SCREEN_HEIGHT - statsBkH - 28, 220, statsBkH, 'BACK', 'back_stats', '#445566', 20);
  }

  drawHUD(ctx, progress, attempts, practiceMode, levelName, isNewBest = false, coins = null) {
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
    ctx.fillText(`${Math.round(progress * 100)}%`, SCREEN_WIDTH / 2, barY + barH + 16);

    // Attempts counter
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ATTEMPT: ${attempts}`, 16, 28);

    // Coins counter
    if (coins && coins.total > 0) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`★ ${coins.collected}/${coins.total}`, 16, 46);
    }

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
    const pbS = IS_MOBILE ? 52 : 44;
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

    // NEW BEST! popup (shown on death only)
    if (isNewBest) {
      ctx.save();
      const popY = 200;

      ctx.translate(SCREEN_WIDTH / 2, popY);

      // Background pill
      const pillW = 260, pillH = 72;
      this._roundRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();

      // Gold border glow
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 25;
      this._roundRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, 18);
      ctx.strokeStyle = 'rgba(255,215,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Star decorations
      ctx.fillStyle = 'rgba(255,215,0,0.35)';
      ctx.font = '18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2605', -pillW / 2 + 24, 0);
      ctx.fillText('\u2605', pillW / 2 - 24, 0);

      // "NEW BEST!" text
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('NEW BEST!', 0, -10);

      // Percentage
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`${Math.floor(progress * 100)}%`, 0, 18);

      ctx.restore();
    }
  }

  drawDeathScreen(ctx, progress, attempts, isNewBest = false) {
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

    // NEW BEST! label above progress
    if (isNewBest) {
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NEW BEST!', SCREEN_WIDTH / 2, 270);
      ctx.restore();
    }

    // Progress
    ctx.fillStyle = isNewBest ? '#FFD700' : 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(progress * 100)}%`, SCREEN_WIDTH / 2, 295);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '16px monospace';
    ctx.fillText(`Attempt ${attempts}`, SCREEN_WIDTH / 2, 325);

    // Buttons
    const bw = IS_MOBILE ? 280 : 240, bh = IS_MOBILE ? 58 : 52;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, 365, bw, bh, 'RETRY', 'retry', '#00C864');
    this._drawButton(ctx, SCREEN_WIDTH / 2 - bw / 2, 365 + bh + 15, bw, bh, 'MENU', 'menu', '#445566');
  }

  drawCompleteScreen(ctx, attempts, theme, coins = null, isEditorLevel = false) {
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

    // Coins collected this run
    let infoBottom = 295;
    if (coins && coins.total > 0) {
      const coinY = 322;
      const coinSpacing = 24;
      const coinStartX = SCREEN_WIDTH / 2 - ((coins.total - 1) * coinSpacing) / 2;
      for (let c = 0; c < coins.total; c++) {
        const cx = coinStartX + c * coinSpacing;
        const got = c < coins.collected;
        ctx.beginPath();
        ctx.arc(cx, coinY, 9, 0, Math.PI * 2);
        if (got) {
          ctx.fillStyle = '#FFD700';
          ctx.fill();
          ctx.save();
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 8;
          ctx.strokeStyle = '#FFA500';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,215,0,0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,215,0,0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      infoBottom = 340;
    }

    // Buttons
    const cbw = IS_MOBILE ? 280 : 240, cbh = IS_MOBILE ? 58 : 52;
    let btnY = infoBottom + 15;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - cbw / 2, btnY, cbw, cbh, 'NEXT LEVEL', 'next_level', '#00C864');
    btnY += cbh + 15;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - cbw / 2, btnY, cbw, cbh, 'RESTART', 'restart', '#CC3333');
    btnY += cbh + 15;
    if (isEditorLevel) {
      this._drawButton(ctx, SCREEN_WIDTH / 2 - cbw / 2, btnY, cbw, cbh, 'EDIT LEVEL', 'back_to_editor', '#CC6600');
      btnY += cbh + 15;
    } else {
      this._drawButton(ctx, SCREEN_WIDTH / 2 - cbw / 2, btnY, cbw, cbh, 'LEADERBOARD', 'leaderboard', '#FFD700');
      btnY += cbh + 15;
    }
    this._drawButton(ctx, SCREEN_WIDTH / 2 - cbw / 2, btnY, cbw, cbh, 'MENU', 'menu', '#445566');

    // Ghost saved indicator
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GHOST SAVED', SCREEN_WIDTH / 2, btnY + cbh + 20);
  }

  drawPauseScreen(ctx, editorTesting = false, practiceMode = false, bestProgress = 0, coins = null) {
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

    // Best progress (only for non-editor levels)
    let infoBottom = 262;
    if (!editorTesting) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Best: ${Math.floor(bestProgress * 100)}%`, SCREEN_WIDTH / 2, 262);
      infoBottom = 262;

      // Coins display under best
      if (coins && coins.total > 0) {
        const coinY = 284;
        const coinSpacing = 22;
        const coinStartX = SCREEN_WIDTH / 2 - ((coins.total - 1) * coinSpacing) / 2;
        for (let c = 0; c < coins.total; c++) {
          const cx = coinStartX + c * coinSpacing;
          const got = c < coins.best;
          ctx.beginPath();
          ctx.arc(cx, coinY, 8, 0, Math.PI * 2);
          if (got) {
            ctx.fillStyle = '#FFD700';
            ctx.fill();
            ctx.strokeStyle = '#FFA500';
          } else {
            ctx.fillStyle = 'rgba(255,215,0,0.15)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,215,0,0.3)';
          }
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        infoBottom = 296;
      }
    }

    // Decorative line
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#FFF';
    ctx.fillRect(SCREEN_WIDTH / 2 - 100, infoBottom + 10, 200, 1);
    ctx.globalAlpha = 1;

    const pbw = IS_MOBILE ? 280 : 240, pbh = IS_MOBILE ? 58 : 52, pgap = IS_MOBILE ? 68 : 64;
    let btnY = infoBottom + 24;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - pbw / 2, btnY, pbw, pbh, 'RESUME', 'resume', '#00C864');
    btnY += pgap;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - pbw / 2, btnY, pbw, pbh, 'RESTART', 'restart', '#CC3333');
    // Practice/Normal toggle (not for editor testing)
    if (!editorTesting) {
      btnY += pgap;
      if (practiceMode) {
        this._drawButton(ctx, SCREEN_WIDTH / 2 - pbw / 2, btnY, pbw, pbh, 'NORMAL MODE', 'switch_normal', '#3388CC');
      } else {
        this._drawButton(ctx, SCREEN_WIDTH / 2 - pbw / 2, btnY, pbw, pbh, 'PRACTICE', 'switch_practice', '#C8A000');
      }
    }
    if (editorTesting) {
      btnY += pgap;
      this._drawButton(ctx, SCREEN_WIDTH / 2 - pbw / 2, btnY, pbw, pbh, 'EDIT LEVEL', 'back_to_editor', '#CC6600');
    }
    btnY += pgap;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - pbw / 2, btnY, pbw, pbh, 'MENU', 'menu', '#445566');

    // Volume sliders
    btnY += pgap + 8;
    this._drawVolumeSlider(ctx, SCREEN_WIDTH / 2, btnY, 'MUSIC', getMusicVolume(), 'volume_music');
    btnY += 42;
    this._drawVolumeSlider(ctx, SCREEN_WIDTH / 2, btnY, 'SFX', getSFXVolume(), 'volume_sfx');
  }

  _drawVolumeSlider(ctx, centerX, y, label, value, id) {
    const barW = IS_MOBILE ? 220 : 200;
    const barH = 10;
    const handleR = IS_MOBILE ? 12 : 10;
    const barX = centerX - barW / 2;
    const barY = y;

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, barX - 12, barY + barH / 2);

    // Background bar
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    const r = barH / 2;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, r);
    ctx.fill();

    // Filled portion
    const fillW = value * barW;
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      grad.addColorStop(0, '#00C864');
      grad.addColorStop(1, '#00C8FF');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, r);
      ctx.fill();
    }

    // Handle circle
    const handleX = barX + fillW;
    const handleY = barY + barH / 2;
    ctx.beginPath();
    ctx.arc(handleX, handleY, handleR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Percentage text
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(Math.round(value * 100) + '%', barX + barW + 14, barY + barH / 2);
    ctx.textBaseline = 'alphabetic';

    // Register the slider bar as a clickable button region (padded for easier interaction)
    const pad = IS_MOBILE ? 18 : 14;
    this.buttons.push({ id, x: barX - pad, y: barY - pad, w: barW + pad * 2, h: barH + pad * 2 });
  }

  drawCustomize(ctx, customization) {
    this.buttons = [];

    const { colorIndex, trailIndex, iconIndex, shapeIndex, trailStyleIndex } = customization;

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
    let previewColor = PLAYER_COLORS[colorIndex];
    if (previewColor === 'rainbow') {
      const hue = (Date.now() / 10) % 360;
      previewColor = `hsl(${hue}, 100%, 60%)`;
    }
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

    const colorSize = IS_MOBILE ? 48 : 38;
    const colorGap = IS_MOBILE ? 8 : 10;
    const rainbowUnlocked = !!localStorage.getItem('gd_rainbow_color');
    const visibleColors = PLAYER_COLORS.filter(c => c !== 'rainbow' || rainbowUnlocked);
    const colorTotalW = visibleColors.length * (colorSize + colorGap) - colorGap;
    const colorStartX = (SCREEN_WIDTH - colorTotalW) / 2;

    let colorSlot = 0;
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      const isRainbow = PLAYER_COLORS[i] === 'rainbow';
      if (isRainbow && !rainbowUnlocked) continue;

      const cx = colorStartX + colorSlot * (colorSize + colorGap);
      colorSlot++;
      const cy = sectionY1 + 10;

      if (isRainbow) {
        // Animated rainbow swatch
        const hue = (Date.now() / 10) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      } else {
        ctx.fillStyle = PLAYER_COLORS[i];
      }
      this._roundRect(ctx, cx, cy, colorSize, colorSize, 6);
      ctx.fill();

      if (i === colorIndex) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - 3, cy - 3, colorSize + 6, colorSize + 6);
      }

      this.buttons.push({ id: `color_${i}`, x: cx, y: cy, w: colorSize, h: colorSize });
    }

    // === TRAIL COLOR SECTION ===
    const sectionY2 = IS_MOBILE ? 285 : 270;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRAIL', SCREEN_WIDTH / 2, sectionY2);

    const trailSize = IS_MOBILE ? 48 : 38;
    const trailGap = IS_MOBILE ? 8 : 10;
    const trailTotalW = PLAYER_TRAIL_COLORS.length * (trailSize + trailGap) - trailGap;
    const trailStartX = (SCREEN_WIDTH - trailTotalW) / 2;

    for (let i = 0; i < PLAYER_TRAIL_COLORS.length; i++) {
      const tx = trailStartX + i * (trailSize + trailGap);
      const ty = sectionY2 + 10;

      const tc = PLAYER_TRAIL_COLORS[i] || PLAYER_COLORS[colorIndex];
      ctx.fillStyle = tc;
      this._roundRect(ctx, tx, ty, trailSize, trailSize, 6);
      ctx.fill();

      if (i === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this._roundRect(ctx, tx, ty, trailSize, trailSize, 6);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.font = `${IS_MOBILE ? 12 : 10}px monospace`;
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

    // === TRAIL STYLE SECTION (only if dotted unlocked) ===
    const dottedUnlocked = !!localStorage.getItem('gd_dotted_trail');
    let trailStyleOffset = 0;
    if (dottedUnlocked) {
      trailStyleOffset = IS_MOBILE ? 80 : 70;
      const sectionYTS = (IS_MOBILE ? 285 : 270) + (IS_MOBILE ? 75 : 65);
      ctx.fillStyle = '#AA77DD';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TRAIL STYLE', SCREEN_WIDTH / 2, sectionYTS);

      const tsLabels = ['NORMAL', 'DOTTED'];
      const tsBtnW = IS_MOBILE ? 120 : 100;
      const tsBtnH = IS_MOBILE ? 40 : 32;
      const tsGap = 14;
      const tsTotalW = tsLabels.length * tsBtnW + (tsLabels.length - 1) * tsGap;
      const tsStartX = (SCREEN_WIDTH - tsTotalW) / 2;

      for (let i = 0; i < tsLabels.length; i++) {
        const bx = tsStartX + i * (tsBtnW + tsGap);
        const by = sectionYTS + 10;
        const selected = (trailStyleIndex || 0) === i;

        this._roundRect(ctx, bx, by, tsBtnW, tsBtnH, 6);
        ctx.fillStyle = selected ? 'rgba(170,0,255,0.4)' : 'rgba(255,255,255,0.08)';
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = '#AA44FF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.fillStyle = selected ? '#FFF' : 'rgba(255,255,255,0.5)';
        ctx.font = `bold ${IS_MOBILE ? 14 : 12}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(tsLabels[i], bx + tsBtnW / 2, by + tsBtnH / 2 + 4);

        this.buttons.push({ id: `trailstyle_${i}`, x: bx, y: by, w: tsBtnW, h: tsBtnH });
      }
    }

    // === SHAPE SECTION ===
    const sectionY3 = (IS_MOBILE ? 395 : 365) + trailStyleOffset;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SHAPE', SCREEN_WIDTH / 2, sectionY3);

    const shapeSize = IS_MOBILE ? 60 : 55;
    const shapeGap = IS_MOBILE ? 10 : 14;
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
    const sectionY4 = (IS_MOBILE ? 520 : 475) + trailStyleOffset;
    ctx.fillStyle = '#AA77DD';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ICON', SCREEN_WIDTH / 2, sectionY4);

    const iconSize = IS_MOBILE ? 60 : 55;
    const iconGap = IS_MOBILE ? 10 : 14;
    const winkUnlocked = !!localStorage.getItem('gd_wink_icon');
    const visibleIcons = CUBE_ICONS.filter(ic => ic !== 'wink' || winkUnlocked);
    const iconTotalW = visibleIcons.length * (iconSize + iconGap) - iconGap;
    const iconStartX = (SCREEN_WIDTH - iconTotalW) / 2;

    let iconSlot = 0;
    for (let i = 0; i < CUBE_ICONS.length; i++) {
      if (CUBE_ICONS[i] === 'wink' && !winkUnlocked) continue;
      const ix = iconStartX + iconSlot * (iconSize + iconGap);
      iconSlot++;
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
    const custBackH = IS_MOBILE ? 52 : 44;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 110, SCREEN_HEIGHT - custBackH - 16, 220, custBackH, 'BACK', 'back_customize', '#445566', 20);
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

  _wrapText(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
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

  // ====== FRIENDS SCREEN ======
  _drawAvatar(ctx, x, y, radius, name, color) {
    // Glow
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.restore();

    // Circle bg
    const agrad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
    agrad.addColorStop(0, lightenColor(color, 40));
    agrad.addColorStop(1, darkenColor(color, 30));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = agrad;
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Letter
    const letter = (name || '?')[0].toUpperCase();
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${Math.round(radius * 1.1)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  _drawEmptyState(ctx, icon, text, subtext, centerY) {
    // Icon circle
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(SCREEN_WIDTH / 2, centerY - 10, 36, 0, Math.PI * 2);
    ctx.fillStyle = '#00AAFF';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(icon, SCREEN_WIDTH / 2, centerY - 2);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '16px monospace';
    ctx.fillText(text, SCREEN_WIDTH / 2, centerY + 40);

    if (subtext) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '13px monospace';
      ctx.fillText(subtext, SCREEN_WIDTH / 2, centerY + 62);
    }
  }

  drawSecrets(ctx, secretsData, redeemedCodes) {
    this.buttons = [];

    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#0A0010');
    grad.addColorStop(1, '#1A0028');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    this._drawMenuParticles(ctx);

    // Title
    ctx.save();
    ctx.shadowColor = '#FF0066';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FF0066';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SECRET CODES', SCREEN_WIDTH / 2, 70);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Decorative line
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#FF0066';
    ctx.fillRect(SCREEN_WIDTH / 2 - 150, 95, 300, 1);
    ctx.globalAlpha = 1;

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Enter a secret code to unlock rewards', SCREEN_WIDTH / 2, 130);

    // Input area
    const inputW = 360;
    const inputX = (SCREEN_WIDTH - inputW) / 2;
    const inputY = 170;

    // Label
    ctx.fillStyle = '#FF0066';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CODE', SCREEN_WIDTH / 2, inputY + 10);

    // Input box (always drawn on canvas)
    this._roundRect(ctx, inputX, inputY + 20, inputW, 44, 10);
    ctx.fillStyle = 'rgba(0,10,30,0.8)';
    ctx.fill();
    ctx.strokeStyle = secretsData.inputActive ? 'rgba(255,0,102,0.6)' : 'rgba(255,0,102,0.35)';
    ctx.lineWidth = secretsData.inputActive ? 1.5 : 1;
    ctx.stroke();

    ctx.fillStyle = secretsData.inputText ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(secretsData.inputText || 'Tap to enter code...', SCREEN_WIDTH / 2, inputY + 47);

    if (!secretsData.inputActive) {
      this.buttons.push({ x: inputX, y: inputY + 20, w: inputW, h: 44, id: 'secrets_input' });
    }

    // Submit button
    const btnW = 180;
    const btnH = IS_MOBILE ? 52 : 44;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - btnW / 2, inputY + 80, btnW, btnH, 'REDEEM', 'secrets_submit', '#FF0066');

    // Message feedback
    if (secretsData.message && secretsData.messageTimer > 0) {
      ctx.save();
      ctx.shadowColor = secretsData.message.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = secretsData.message.color;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, secretsData.messageTimer);
      ctx.fillText(secretsData.message.text, SCREEN_WIDTH / 2, inputY + 155);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Back button
    const bkH = IS_MOBILE ? 56 : 48;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 110, SCREEN_HEIGHT - bkH - 28, 220, bkH, 'BACK', 'back_secrets', '#445566', 20);
  }

  drawCommunity(ctx, data) {
    this.buttons = [];
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#001A10');
    grad.addColorStop(1, '#003820');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this._drawMenuParticles(ctx);

    ctx.save();
    ctx.shadowColor = '#00AA88';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00AA88';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('COMMUNITY', SCREEN_WIDTH / 2, 55);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Sort tabs
    const tabs = [['newest', 'NEWEST'], ['top', 'TOP RATED'], ['played', 'MOST PLAYED']];
    const tabW = 140, tabH = 34, tabGap = 10;
    const tabStartX = SCREEN_WIDTH / 2 - (tabs.length * (tabW + tabGap) - tabGap) / 2;
    for (let i = 0; i < tabs.length; i++) {
      const tx = tabStartX + i * (tabW + tabGap);
      const active = data.sort === tabs[i][0];
      this._drawButton(ctx, tx, 75, tabW, tabH, tabs[i][1], 'community_sort_' + tabs[i][0], active ? '#00AA88' : '#336655', 13);
    }

    if (data.loading) {
      ctx.fillStyle = '#88CCAA';
      ctx.font = '18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOADING...', SCREEN_WIDTH / 2, 300);
    } else if (data.levels.length === 0) {
      ctx.fillStyle = '#667788';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No levels published yet', SCREEN_WIDTH / 2, 300);
    } else {
      const margin = 30;
      const cardW = SCREEN_WIDTH - margin * 2;
      const cardH = 64, gapY = 10;
      const startY = 125;
      const contentH = data.levels.length * (cardH + gapY) - gapY;
      const visibleH = SCREEN_HEIGHT - startY - 80;
      this.maxScrollY = Math.max(0, contentH - visibleH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, startY, SCREEN_WIDTH, visibleH);
      ctx.clip();

      for (let i = 0; i < data.levels.length; i++) {
        const lv = data.levels[i];
        const cy = startY + i * (cardH + gapY) - this.scrollY;
        if (cy + cardH < startY || cy > startY + visibleH) continue;

        // Card bg
        ctx.fillStyle = 'rgba(0,40,30,0.7)';
        ctx.beginPath();
        ctx.roundRect(margin, cy, cardW, cardH, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,170,136,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Name
        ctx.fillStyle = '#CCFFEE';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        const maxChars = IS_MOBILE ? 18 : 28;
        const dispName = lv.name.length > maxChars ? lv.name.slice(0, maxChars) + '...' : lv.name;
        ctx.fillText(dispName, margin + 16, cy + 26);

        // Creator + stats on second line
        ctx.fillStyle = '#669988';
        ctx.font = '12px monospace';
        ctx.fillText('by ' + (lv.creator || 'Unknown'), margin + 16, cy + 48);

        ctx.fillStyle = '#557766';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`▶ ${lv.plays}`, margin + cardW / 2, cy + 26);
        ctx.fillText(`♥ ${lv.likes}`, margin + cardW / 2 + 80, cy + 26);
        ctx.fillText(`◆ ${lv.objectCount || '?'} obj`, margin + cardW / 2, cy + 48);

        // Delete button (owner or admin only)
        const canDelete = data.isAdmin || (data.currentUserId && lv.userId === data.currentUserId);
        const delBtnW = canDelete ? 44 : 0;
        const rightPad = canDelete ? delBtnW + 8 : 0;

        // Play button (right side)
        const pbW = 80, pbH = 36, pbX = margin + cardW - pbW - 12 - rightPad, pbY = cy + (cardH - pbH) / 2;
        this._drawButton(ctx, pbX, pbY, pbW, pbH, 'PLAY', 'community_play_' + i, '#00CC88', 14);

        if (canDelete) {
          const dbX = margin + cardW - delBtnW - 12, dbY = cy + (cardH - pbH) / 2;
          this._drawButton(ctx, dbX, dbY, delBtnW, pbH, '✕', 'community_delete_' + i, '#883333', 16);
        }
      }
      ctx.restore();
    }

    const backH = IS_MOBILE ? 52 : 44;
    this._drawButton(ctx, 30, SCREEN_HEIGHT - backH - 20, 130, backH, 'BACK', 'back_community', '#445566', 18);

    // Delete confirmation popup
    if (data.confirmDelete) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

      const dlgW = Math.min(400, SCREEN_WIDTH - 40);
      const dlgH = 180;
      const dlgX = (SCREEN_WIDTH - dlgW) / 2;
      const dlgY = (SCREEN_HEIGHT - dlgH) / 2;

      // Dialog bg
      const dlgGrad = ctx.createLinearGradient(dlgX, dlgY, dlgX, dlgY + dlgH);
      dlgGrad.addColorStop(0, '#1a1a30');
      dlgGrad.addColorStop(1, '#0e0e20');
      ctx.fillStyle = dlgGrad;
      this._roundRect(ctx, dlgX, dlgY, dlgW, dlgH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,0.4)';
      ctx.lineWidth = 2;
      this._roundRect(ctx, dlgX, dlgY, dlgW, dlgH, 16);
      ctx.stroke();

      // Title
      ctx.fillStyle = '#FF6666';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DELETE LEVEL?', SCREEN_WIDTH / 2, dlgY + 40);

      // Level name
      const dName = (data.confirmDelete.name || 'Untitled');
      const dDisplay = dName.length > 25 ? dName.slice(0, 22) + '...' : dName;
      ctx.fillStyle = '#AAB';
      ctx.font = '14px monospace';
      ctx.fillText('"' + dDisplay + '"', SCREEN_WIDTH / 2, dlgY + 68);
      ctx.fillStyle = '#778';
      ctx.font = '12px monospace';
      ctx.fillText('This cannot be undone', SCREEN_WIDTH / 2, dlgY + 90);

      // Buttons
      const cbW = (dlgW - 30) / 2;
      const cbH = 44;
      const cbY = dlgY + dlgH - cbH - 18;
      this._drawButton(ctx, dlgX + 10, cbY, cbW, cbH, 'CANCEL', 'community_confirm_no', '#445566', 16);
      this._drawButton(ctx, dlgX + dlgW - cbW - 10, cbY, cbW, cbH, 'DELETE', 'community_confirm_yes', '#CC3333', 16);
    }
  }

  drawLeaderboard(ctx, data) {
    this.buttons = [];
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#1A1400');
    grad.addColorStop(1, '#2A1800');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.save();
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEADERBOARD', SCREEN_WIDTH / 2, 60);
    ctx.shadowBlur = 0;
    ctx.restore();

    if (data.loading) {
      ctx.fillStyle = '#CCAA66';
      ctx.font = '18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOADING...', SCREEN_WIDTH / 2, 300);
    } else if (data.entries.length === 0) {
      ctx.fillStyle = '#667755';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No scores yet — be the first!', SCREEN_WIDTH / 2, 300);
    } else {
      // Column headers
      // Responsive column layout
      const margin = Math.round(SCREEN_WIDTH * 0.1);
      const tableW = SCREEN_WIDTH - margin * 2;
      const col1 = margin;                    // #
      const col2 = margin + 40;               // PLAYER
      const col3 = margin + tableW * 0.65;    // ATTEMPTS
      const col4 = margin + tableW - 10;      // TIME (right-aligned)
      const rowBgX = margin - 10;
      const rowBgW = tableW + 20;

      const hdrY = 100;
      ctx.fillStyle = '#998866';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('#', col1, hdrY);
      ctx.fillText('PLAYER', col2, hdrY);
      ctx.fillText('ATTEMPTS', col3, hdrY);
      ctx.textAlign = 'right';
      ctx.fillText('TIME', col4, hdrY);

      const rowH = 32;
      const listStartY = 128;
      const visibleH = SCREEN_HEIGHT - listStartY - 80;
      this.maxScrollY = Math.max(0, data.entries.length * rowH - visibleH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, listStartY - 16, SCREEN_WIDTH, visibleH + 16);
      ctx.clip();

      const maxNameLen = IS_MOBILE ? 14 : 22;
      for (let i = 0; i < data.entries.length; i++) {
        const e = data.entries[i];
        const ry = listStartY + i * rowH - this.scrollY;
        if (ry + rowH < listStartY - 16 || ry > listStartY + visibleH) continue;
        const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        const color = i < 3 ? rankColors[i] : '#AABB99';

        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(255,215,0,0.03)';
          ctx.fillRect(rowBgX, ry - 16, rowBgW, 30);
        }

        const name = e.username || 'Anonymous';
        const displayName = name.length > maxNameLen ? name.slice(0, maxNameLen) + '...' : name;
        ctx.fillStyle = color;
        ctx.font = i < 3 ? 'bold 15px monospace' : '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1), col1, ry);
        ctx.fillText(displayName, col2, ry);
        ctx.fillText(String(e.attempts), col3, ry);
        ctx.textAlign = 'right';
        const timeMs = e.completion_time_ms;
        const timeFmt = timeMs ? `${(timeMs / 1000).toFixed(1)}s` : '--';
        ctx.fillText(timeFmt, col4, ry);
      }
      ctx.restore();
    }

    const backH = IS_MOBILE ? 52 : 44;
    this._drawButton(ctx, SCREEN_WIDTH / 2 - 65, SCREEN_HEIGHT - backH - 20, 130, backH, 'BACK', 'back_leaderboard', '#445566', 18);
  }

  drawFriends(ctx, friendsData) {
    this.buttons = [];

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    grad.addColorStop(0, '#000818');
    grad.addColorStop(0.5, '#001030');
    grad.addColorStop(1, '#001848');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this._drawMenuParticles(ctx);

    const { tab, friends, requests, searchResults, searchQuery, messages, chatFriend, myLevels, shareTarget, notification, inputActive } = friendsData;

    // Title with glow
    ctx.save();
    ctx.shadowColor = '#00AAFF';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#00AAFF';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FRIENDS', SCREEN_WIDTH / 2, 48);
    ctx.shadowBlur = 0;
    ctx.restore();
    // Bright inner text
    ctx.save();
    ctx.fillStyle = '#FFF';
    ctx.globalAlpha = 0.85;
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FRIENDS', SCREEN_WIDTH / 2, 48);
    ctx.restore();

    // Decorative glow line under title
    const lineW = 240;
    ctx.save();
    ctx.shadowColor = '#00AAFF';
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#00AAFF';
    ctx.fillRect(SCREEN_WIDTH / 2 - lineW / 2, 66, lineW, 1.5);
    ctx.restore();

    // Friend count subtitle
    if (tab === 'list' || tab === 'requests' || tab === 'search') {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${friends.length} friend${friends.length !== 1 ? 's' : ''} online`, SCREEN_WIDTH / 2, 80);
    }

    // Tab buttons with active indicator
    const tabs = [
      { id: 'friends_tab_list', label: 'FRIENDS', color: tab === 'list' ? '#00AAFF' : '#334455', active: tab === 'list' },
      { id: 'friends_tab_requests', label: `REQUESTS${requests.length > 0 ? ' (' + requests.length + ')' : ''}`, color: tab === 'requests' ? '#FF8844' : '#334455', active: tab === 'requests' },
      { id: 'friends_tab_search', label: 'SEARCH', color: tab === 'search' ? '#44CC44' : '#334455', active: tab === 'search' },
    ];
    const tabW = IS_MOBILE ? 170 : 160, tabH = IS_MOBILE ? 46 : 36, tabGap = IS_MOBILE ? 10 : 12;
    const tabTotalW = tabs.length * tabW + (tabs.length - 1) * tabGap;
    const tabStartX = (SCREEN_WIDTH - tabTotalW) / 2;
    for (let i = 0; i < tabs.length; i++) {
      const tx = tabStartX + i * (tabW + tabGap);
      this._drawButton(ctx, tx, 92, tabW, tabH, tabs[i].label, tabs[i].id, tabs[i].color, IS_MOBILE ? 16 : 14);
      // Active tab glow underline
      if (tabs[i].active) {
        ctx.save();
        ctx.shadowColor = tabs[i].color;
        ctx.shadowBlur = 6;
        ctx.fillStyle = tabs[i].color;
        ctx.fillRect(tx + 20, 92 + tabH + 2, tabW - 40, 2);
        ctx.restore();
      }
    }

    // Notification toast with glow
    if (notification) {
      ctx.save();
      const isErr = notification.type === 'error';
      const toastColor = isErr ? '#FF4444' : '#44DD66';
      ctx.shadowColor = toastColor;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.92;
      this._roundRect(ctx, SCREEN_WIDTH / 2 - 200, SCREEN_HEIGHT - 55, 400, 40, 10);
      ctx.fillStyle = isErr ? '#441111' : '#113322';
      ctx.fill();
      this._roundRect(ctx, SCREEN_WIDTH / 2 - 200, SCREEN_HEIGHT - 55, 400, 40, 10);
      ctx.strokeStyle = toastColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(notification.text, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 30);
      ctx.restore();
    }

    const contentY = 145;

    if (tab === 'list') {
      this._drawFriendsList(ctx, friends, contentY);
    } else if (tab === 'requests') {
      this._drawFriendRequests(ctx, requests, contentY);
    } else if (tab === 'search') {
      this._drawFriendSearch(ctx, searchResults, searchQuery, contentY, inputActive === 'search', friendsData.sentRequests);
    } else if (tab === 'chat') {
      this._drawFriendChat(ctx, messages, chatFriend, contentY, inputActive === 'chat');
    } else if (tab === 'share_select') {
      this._drawShareLevelSelect(ctx, myLevels, shareTarget, contentY);
    }

    // Back button
    const backTarget = (tab === 'chat' || tab === 'share_select') ? 'friends_back_to_list' : 'friends_back';
    const fbH = IS_MOBILE ? 52 : 44;
    this._drawButton(ctx, 30, SCREEN_HEIGHT - fbH - 16, IS_MOBILE ? 150 : 130, fbH, 'BACK', backTarget, '#445566', 20);
  }

  _drawFriendsList(ctx, friends, startY) {
    if (friends.length === 0) {
      this._drawEmptyState(ctx, '?', 'No friends yet', 'Search for players to add them!', startY + 100);
      return;
    }

    const itemH = IS_MOBILE ? 68 : 60, gap = 8;
    const listW = 520;
    const listX = (SCREEN_WIDTH - listW) / 2;
    const visibleH = SCREEN_HEIGHT - startY - 80;
    this.maxScrollY = Math.max(0, friends.length * (itemH + gap) - gap - visibleH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, startY, SCREEN_WIDTH, visibleH);
    ctx.clip();

    for (let i = 0; i < friends.length; i++) {
      const f = friends[i];
      const iy = startY + i * (itemH + gap) - this.scrollY;
      if (iy + itemH < startY || iy > startY + visibleH) continue;
      const avatarColors = ['#00AAFF', '#FF6644', '#44CC88', '#CC44AA', '#FFAA22', '#8866FF', '#44DDDD'];

      // Row bg with subtle glow
      ctx.save();
      ctx.shadowColor = 'rgba(0,140,255,0.15)';
      ctx.shadowBlur = 8;
      this._roundRect(ctx, listX, iy, listW, itemH, 12);
      ctx.fillStyle = 'rgba(0,60,120,0.18)';
      ctx.fill();
      ctx.restore();

      // Border with gradient
      this._roundRect(ctx, listX, iy, listW, itemH, 12);
      ctx.strokeStyle = 'rgba(0,170,255,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner highlight
      ctx.save();
      ctx.globalAlpha = 0.04;
      this._roundRect(ctx, listX, iy, listW, itemH / 2, 12);
      ctx.fillStyle = '#FFF';
      ctx.fill();
      ctx.restore();

      // Avatar
      this._drawAvatar(ctx, listX + 30, iy + itemH / 2, 16, f.name, avatarColors[i % avatarColors.length]);

      // Name
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(f.name, listX + 56, iy + itemH / 2 + 5);

      // Chat button
      const flBtnH = IS_MOBILE ? 48 : 40;
      this._drawButton(ctx, listX + listW - 210, iy + (itemH - flBtnH) / 2, 95, flBtnH, 'CHAT', `friends_chat_${i}`, '#0088CC', IS_MOBILE ? 16 : 14);
      // Remove button
      this._drawButton(ctx, listX + listW - 100, iy + (itemH - flBtnH) / 2, 90, flBtnH, 'REMOVE', `friends_remove_${i}`, '#663333', IS_MOBILE ? 16 : 14);
    }
    ctx.restore();
  }

  _drawFriendRequests(ctx, requests, startY) {
    if (requests.length === 0) {
      this._drawEmptyState(ctx, '!', 'No pending requests', 'Friend requests will appear here', startY + 100);
      return;
    }

    // Section header
    ctx.fillStyle = 'rgba(255,136,68,0.6)';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    const listW = 520;
    const listX = (SCREEN_WIDTH - listW) / 2;
    ctx.fillText(`${requests.length} PENDING REQUEST${requests.length !== 1 ? 'S' : ''}`, listX + 4, startY - 4);

    const itemH = IS_MOBILE ? 68 : 60, gap = 8;
    const visibleH = SCREEN_HEIGHT - startY - 80;
    this.maxScrollY = Math.max(0, requests.length * (itemH + gap) - gap - visibleH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, startY, SCREEN_WIDTH, visibleH);
    ctx.clip();

    for (let i = 0; i < requests.length; i++) {
      const r = requests[i];
      const iy = startY + i * (itemH + gap) - this.scrollY;
      if (iy + itemH < startY || iy > startY + visibleH) continue;

      // Row bg with warm glow
      ctx.save();
      ctx.shadowColor = 'rgba(255,136,68,0.12)';
      ctx.shadowBlur = 8;
      this._roundRect(ctx, listX, iy, listW, itemH, 12);
      ctx.fillStyle = 'rgba(120,60,0,0.15)';
      ctx.fill();
      ctx.restore();

      this._roundRect(ctx, listX, iy, listW, itemH, 12);
      ctx.strokeStyle = 'rgba(255,136,68,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner highlight
      ctx.save();
      ctx.globalAlpha = 0.04;
      this._roundRect(ctx, listX, iy, listW, itemH / 2, 12);
      ctx.fillStyle = '#FFF';
      ctx.fill();
      ctx.restore();

      // Avatar
      this._drawAvatar(ctx, listX + 30, iy + itemH / 2, 16, r.name, '#FF8844');

      // Name
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(r.name, listX + 56, iy + itemH / 2 + 5);

      // Accept / Decline
      const frBtnH = IS_MOBILE ? 48 : 40;
      this._drawButton(ctx, listX + listW - 220, iy + (itemH - frBtnH) / 2, 105, frBtnH, 'ACCEPT', `friends_accept_${i}`, '#22AA44', IS_MOBILE ? 16 : 14);
      this._drawButton(ctx, listX + listW - 100, iy + (itemH - frBtnH) / 2, 90, frBtnH, 'DECLINE', `friends_decline_${i}`, '#883333', IS_MOBILE ? 16 : 14);
    }
    ctx.restore();
  }

  _drawFriendSearch(ctx, results, query, startY, htmlInputActive, sentRequests) {
    const boxW = 400, boxH = IS_MOBILE ? 50 : 42;
    const boxX = (SCREEN_WIDTH - boxW) / 2;

    // Only draw the canvas search box when HTML input is NOT overlaying it
    if (!htmlInputActive) {
      // Search box with glow
      ctx.save();
      ctx.shadowColor = 'rgba(0,200,255,0.2)';
      ctx.shadowBlur = 10;
      this._roundRect(ctx, boxX, startY, boxW, boxH, 10);
      ctx.fillStyle = 'rgba(0,10,30,0.6)';
      ctx.fill();
      ctx.restore();

      this._roundRect(ctx, boxX, startY, boxW, boxH, 10);
      ctx.strokeStyle = query ? 'rgba(0,200,255,0.5)' : 'rgba(0,200,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Search icon
      ctx.fillStyle = 'rgba(0,200,255,0.5)';
      ctx.font = '16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('>', boxX + 12, startY + 27);

      ctx.fillStyle = query ? '#FFF' : 'rgba(255,255,255,0.3)';
      ctx.font = '15px monospace';
      ctx.fillText(query || 'Type username to search...', boxX + 30, startY + 27);
    }

    // Register search box as clickable to focus input
    this.buttons.push({ id: 'friends_focus_search', x: boxX, y: startY, w: boxW, h: boxH });

    // Search button
    this._drawButton(ctx, boxX + boxW + 12, startY, IS_MOBILE ? 110 : 100, boxH, 'SEARCH', 'friends_do_search', '#44CC44', IS_MOBILE ? 17 : 15);

    // Results
    const resultY = startY + 65;
    if (results && results.length > 0) {
      // Results header
      ctx.fillStyle = 'rgba(68,204,68,0.5)';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const listW = 520;
      const listX = (SCREEN_WIDTH - listW) / 2;
      ctx.fillText(`${results.length} RESULT${results.length !== 1 ? 'S' : ''} FOUND`, listX + 4, resultY - 6);

      const itemH = IS_MOBILE ? 62 : 54, gap = 6;
      const visibleH = SCREEN_HEIGHT - resultY - 80;
      this.maxScrollY = Math.max(0, results.length * (itemH + gap) - gap - visibleH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, resultY, SCREEN_WIDTH, visibleH);
      ctx.clip();

      for (let i = 0; i < results.length; i++) {
        const u = results[i];
        const iy = resultY + i * (itemH + gap) - this.scrollY;
        if (iy + itemH < resultY || iy > resultY + visibleH) continue;

        ctx.save();
        ctx.shadowColor = 'rgba(68,204,68,0.08)';
        ctx.shadowBlur = 6;
        this._roundRect(ctx, listX, iy, listW, itemH, 10);
        ctx.fillStyle = 'rgba(0,80,40,0.12)';
        ctx.fill();
        ctx.restore();

        this._roundRect(ctx, listX, iy, listW, itemH, 10);
        ctx.strokeStyle = 'rgba(68,204,68,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Avatar
        this._drawAvatar(ctx, listX + 30, iy + itemH / 2, 16, u.display_name, '#44CC88');

        ctx.fillStyle = '#FFF';
        ctx.font = '15px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(u.display_name, listX + 54, iy + itemH / 2 + 5);

        if (sentRequests && sentRequests.has(u.user_id)) {
          // Disabled grayed-out "SENT" label (no button, not clickable)
          const srBtnH = IS_MOBILE ? 46 : 38;
          const bx = listX + listW - 140, by = iy + (itemH - srBtnH) / 2, bw = 125, bh = srBtnH;
          ctx.save();
          ctx.globalAlpha = 0.3;
          this._roundRect(ctx, bx, by, bw, bh, 10);
          ctx.fillStyle = '#334455';
          ctx.fill();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#FFF';
          ctx.font = 'bold 13px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('SENT', bx + bw / 2, by + bh / 2);
          ctx.restore();
          ctx.textBaseline = 'alphabetic';
        } else {
          const addBtnH = IS_MOBILE ? 46 : 38;
          this._drawButton(ctx, listX + listW - 140, iy + (itemH - addBtnH) / 2, 125, addBtnH, 'ADD FRIEND', `friends_add_${i}`, '#2288AA', IS_MOBILE ? 15 : 13);
        }
      }
      ctx.restore();
    } else if (results && results.length === 0 && query) {
      this._drawEmptyState(ctx, '?', 'No players found', 'Try a different username', resultY + 60);
    }
  }

  _drawFriendChat(ctx, messages, chatFriend, startY, htmlInputActive) {
    // Chat header with avatar
    const chatName = chatFriend ? chatFriend.name : 'Chat';
    ctx.font = 'bold 20px monospace';
    const nameW = ctx.measureText(chatName).width;
    const headerCenterX = SCREEN_WIDTH / 2;
    const avatarR = 12;
    const avatarGap = 8;
    const totalHeaderW = avatarR * 2 + avatarGap + nameW;
    const avatarX = headerCenterX - totalHeaderW / 2 + avatarR;
    const nameX = avatarX + avatarR + avatarGap;

    if (chatFriend) {
      this._drawAvatar(ctx, avatarX, startY + 4, avatarR, chatFriend.name, '#00AAFF');
    }
    ctx.save();
    ctx.shadowColor = '#00AAFF';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#00AAFF';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(chatName, nameX, startY + 10);
    ctx.restore();

    // Share level button
    const shareBtnH = IS_MOBILE ? 44 : 34;
    this._drawButton(ctx, SCREEN_WIDTH - 210, startY - 14, IS_MOBILE ? 160 : 140, shareBtnH, 'SHARE LEVEL', 'friends_share_level', '#CC6600', IS_MOBILE ? 15 : 13);

    // Message area
    const msgY = startY + 28;
    const msgH = SCREEN_HEIGHT - msgY - 100;
    const msgW = 560;
    const msgX = (SCREEN_WIDTH - msgW) / 2;

    // Message area bg with border
    ctx.save();
    ctx.shadowColor = 'rgba(0,100,200,0.1)';
    ctx.shadowBlur = 12;
    this._roundRect(ctx, msgX, msgY, msgW, msgH, 12);
    ctx.fillStyle = 'rgba(0,8,20,0.4)';
    ctx.fill();
    ctx.restore();
    this._roundRect(ctx, msgX, msgY, msgW, msgH, 12);
    ctx.strokeStyle = 'rgba(0,100,200,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (messages.length === 0) {
      this._drawEmptyState(ctx, '~', 'No messages yet', 'Say hello!', msgY + msgH / 2 - 10);
    } else {
      // Draw messages with chat bubbles
      const lineH = IS_MOBILE ? 50 : 38;
      const maxVisible = Math.floor((msgH - 16) / lineH);
      const startIdx = Math.max(0, messages.length - maxVisible);
      const visibleMsgs = messages.slice(startIdx);
      for (let i = 0; i < visibleMsgs.length; i++) {
        const m = visibleMsgs[i];
        const realIdx = startIdx + i; // actual index in messages array
        const my = msgY + 10 + i * lineH;

        if (m.type === 'level') {
          // Level share bubble
          const bubbleW = msgW - 40;
          const bubbleX = msgX + 20;
          const bubbleH = lineH - 4;
          ctx.save();
          ctx.shadowColor = m.mine ? 'rgba(0,120,255,0.15)' : 'rgba(255,136,0,0.15)';
          ctx.shadowBlur = 6;
          this._roundRect(ctx, bubbleX, my, bubbleW, bubbleH, 8);
          ctx.fillStyle = m.mine ? 'rgba(0,80,180,0.2)' : 'rgba(180,80,0,0.2)';
          ctx.fill();
          ctx.restore();
          this._roundRect(ctx, bubbleX, my, bubbleW, bubbleH, 8);
          ctx.strokeStyle = m.mine ? 'rgba(0,150,255,0.2)' : 'rgba(255,136,0,0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#FFD700';
          ctx.font = `bold ${IS_MOBILE ? 15 : 13}px monospace`;
          ctx.textAlign = m.mine ? 'right' : 'left';
          const lx = m.mine ? bubbleX + bubbleW - (IS_MOBILE ? 220 : 200) : bubbleX + 10;
          ctx.fillText(`[LEVEL] ${m.content}`, lx, my + bubbleH / 2 + 4);
          const playBtnH = IS_MOBILE ? 40 : 26;
          const playBtnW = IS_MOBILE ? 130 : 110;
          const playBtnY = my + Math.floor((bubbleH - playBtnH) / 2);
          const editBtnW = IS_MOBILE ? 70 : 55;
          const playX = m.mine ? bubbleX + bubbleW - playBtnW - 5 : bubbleX + bubbleW - playBtnW - 15;
          const editX = playX - editBtnW - 6;
          this._drawButton(ctx, playX, playBtnY, playBtnW, playBtnH, 'PLAY', `friends_play_level_${realIdx}`, '#00AA44', IS_MOBILE ? 16 : 12);
          this._drawButton(ctx, editX, playBtnY, editBtnW, playBtnH, 'EDIT', `friends_edit_level_${realIdx}`, '#CC6600', IS_MOBILE ? 16 : 12);
          // Delete button on own messages
          if (m.mine) {
            const delS = IS_MOBILE ? 30 : 20;
            const delX = bubbleX + 2, delY = my + 4;
            ctx.fillStyle = 'rgba(255,60,60,0.5)';
            ctx.font = `bold ${IS_MOBILE ? 16 : 12}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✕', delX + delS / 2, delY + delS / 2);
            ctx.textBaseline = 'alphabetic';
            this.buttons.push({ id: `friends_del_msg_${realIdx}`, x: delX, y: delY, w: delS, h: delS });
          }
        } else {
          // Chat bubble
          const text = (m.mine ? '' : `${chatFriend?.name || '?'}: `) + m.content;
          const chatFont = IS_MOBILE ? 15 : 13;
          ctx.font = `${chatFont}px monospace`;
          const textW = Math.min(ctx.measureText(text).width + 24, msgW - 60);
          const bubbleX = m.mine ? msgX + msgW - textW - 16 : msgX + 16;
          const chatBubbleH = lineH - 8;

          this._roundRect(ctx, bubbleX, my, textW, chatBubbleH, 8);
          ctx.fillStyle = m.mine ? 'rgba(0,80,180,0.25)' : 'rgba(60,120,60,0.2)';
          ctx.fill();
          this._roundRect(ctx, bubbleX, my, textW, chatBubbleH, 8);
          ctx.strokeStyle = m.mine ? 'rgba(0,150,255,0.15)' : 'rgba(100,200,100,0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = m.mine ? '#88CCFF' : '#AADDAA';
          ctx.font = `${chatFont}px monospace`;
          ctx.textAlign = 'left';
          ctx.fillText(text, bubbleX + 10, my + chatBubbleH / 2 + 4);
          // Delete button on own messages
          if (m.mine) {
            const delS2 = IS_MOBILE ? 30 : 16;
            const delX = bubbleX - delS2 - 4, delY = my + 2;
            ctx.fillStyle = 'rgba(255,60,60,0.4)';
            ctx.font = `bold ${IS_MOBILE ? 16 : 12}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✕', delX + delS2 / 2, delY + delS2 / 2 + 2);
            ctx.textBaseline = 'alphabetic';
            this.buttons.push({ id: `friends_del_msg_${realIdx}`, x: delX, y: delY, w: delS2, h: delS2 + 4 });
          }
        }
      }
    }

    // Input area - message box
    const inputY = SCREEN_HEIGHT - 65;
    const inputW = 390;
    const inputX = (SCREEN_WIDTH - inputW) / 2 - 60;

    if (!htmlInputActive) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,170,255,0.15)';
      ctx.shadowBlur = 8;
      this._roundRect(ctx, inputX, inputY, inputW, 40, 10);
      ctx.fillStyle = 'rgba(0,10,30,0.5)';
      ctx.fill();
      ctx.restore();
      this._roundRect(ctx, inputX, inputY, inputW, 40, 10);
      ctx.strokeStyle = 'rgba(0,170,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const msgInput = chatFriend?._inputText || '';
      ctx.fillStyle = msgInput ? '#FFF' : 'rgba(255,255,255,0.3)';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(msgInput || 'Type a message...', inputX + 14, inputY + 25);
    }

    // Register chat input box as clickable
    this.buttons.push({ id: 'friends_focus_chat', x: inputX, y: inputY, w: inputW, h: 40 });

    // Send button
    const sendBtnH = IS_MOBILE ? 48 : 40;
    this._drawButton(ctx, inputX + inputW + 10, inputY, IS_MOBILE ? 110 : 100, sendBtnH, 'SEND', 'friends_send_msg', '#00AA44', IS_MOBILE ? 17 : 15);
  }

  _drawShareLevelSelect(ctx, myLevels, shareTarget, startY) {
    // Read local editor slots
    let slots = [];
    try {
      const raw = localStorage.getItem('gd_editor_slots');
      if (raw) slots = JSON.parse(raw);
      slots.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch {}

    // Title with glow (matches editor browse style)
    ctx.save();
    ctx.shadowColor = '#CC6600';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FF8844';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SHARE LEVEL', SCREEN_WIDTH / 2, startY + 5);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Subtitle
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Send to ${shareTarget?.name || '...'}`, SCREEN_WIDTH / 2, startY + 28);

    // Decorative line
    const lineGrad = ctx.createLinearGradient(SCREEN_WIDTH * 0.25, 0, SCREEN_WIDTH * 0.75, 0);
    lineGrad.addColorStop(0, 'transparent');
    lineGrad.addColorStop(0.3, 'rgba(255,136,68,0.4)');
    lineGrad.addColorStop(0.7, 'rgba(255,136,68,0.4)');
    lineGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SCREEN_WIDTH * 0.25, startY + 40);
    ctx.lineTo(SCREEN_WIDTH * 0.75, startY + 40);
    ctx.stroke();

    if (slots.length === 0) {
      this._drawEmptyState(ctx, '~', 'No saved levels', 'Create levels in the editor first', startY + 120);
      return;
    }

    const cardW = Math.min(500, SCREEN_WIDTH - 60);
    const cardH = IS_MOBILE ? 80 : 70;
    const gap = 12;
    const cardX = (SCREEN_WIDTH - cardW) / 2;
    const listStartY = startY + 52;

    for (let i = 0; i < slots.length && i < 6; i++) {
      const slot = slots[i];
      const cy = listStartY + i * (cardH + gap);

      // Card bg (matches editor browse style)
      const cardGrad = ctx.createLinearGradient(cardX, cy, cardX, cy + cardH);
      cardGrad.addColorStop(0, 'rgba(25,25,45,0.95)');
      cardGrad.addColorStop(1, 'rgba(18,18,35,0.95)');
      ctx.fillStyle = cardGrad;
      this._roundRect(ctx, cardX, cy, cardW, cardH, 10);
      ctx.fill();

      // Card border
      ctx.strokeStyle = 'rgba(255,136,68,0.2)';
      ctx.lineWidth = 1;
      this._roundRect(ctx, cardX, cy, cardW, cardH, 10);
      ctx.stroke();

      // Level name
      ctx.fillStyle = '#EEE';
      ctx.font = 'bold 19px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(slot.name || 'Untitled', cardX + 16, cy + 28);

      // Object count + date
      ctx.fillStyle = '#668';
      ctx.font = '13px monospace';
      const objText = (slot.objectCount || 0) + ' objects';
      const dateText = slot.updatedAt ? new Date(slot.updatedAt).toLocaleDateString() : '';
      ctx.fillText(objText + '  •  ' + dateText, cardX + 16, cy + 50);

      // Send/share button (replaces play + delete)
      const shareBtnW = IS_MOBILE ? 58 : 50;
      const btnX = cardX + cardW - shareBtnW - 10;
      const btnY = cy + 10;
      const btnW = shareBtnW;
      const btnH = cardH - 20;

      ctx.save();
      ctx.shadowColor = '#FF8844';
      ctx.shadowBlur = 6;
      ctx.fillStyle = 'rgba(120,50,0,0.7)';
      this._roundRect(ctx, btnX, btnY, btnW, btnH, 8);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,136,68,0.4)';
      ctx.lineWidth = 1;
      this._roundRect(ctx, btnX, btnY, btnW, btnH, 8);
      ctx.stroke();

      // Share arrow icon (↗)
      ctx.fillStyle = '#FF8844';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↗', btnX + btnW / 2, btnY + btnH / 2);
      ctx.textBaseline = 'alphabetic';

      this.buttons.push({ id: `friends_send_level_${i}`, x: btnX, y: btnY, w: btnW, h: btnH });
      // Also store slot id for the handler
      this.buttons[this.buttons.length - 1].slotId = slot.id;
    }
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
