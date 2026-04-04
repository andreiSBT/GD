/** Achievement system */

import { getLevelCount, LEVEL_DATA } from './level.js';

// Build per-level achievements dynamically
function _buildAchievements() {
  const LEVEL_NAMES = {
    1: 'Stereo Madness', 2: 'Back on Track', 3: 'Polargeist',
    4: 'Dry Out', 5: 'Base After Base', 6: "Can't Let Go",
    7: 'Jumper', 8: 'Time Machine', 9: 'Cycles',
  };

  const achievements = [];

  // Per-level: normal completion + practice completion
  const count = getLevelCount();
  for (let id = 1; id <= count; id++) {
    const name = (LEVEL_DATA[id] && LEVEL_DATA[id].name) || LEVEL_NAMES[id] || `Level ${id}`;
    achievements.push({
      id: `complete_${id}`,
      title: `${name}`,
      desc: `Complete ${name}`,
      check: (p) => p[id]?.completed,
    });
    achievements.push({
      id: `practice_${id}`,
      title: `${name} (Practice)`,
      desc: `Complete ${name} in practice mode`,
      check: (p) => p[id]?.practiceCompleted,
    });
  }

  // General achievements
  achievements.push(
    { id: 'complete_all', title: 'CHAMPION', desc: 'Complete all official levels', check: (p) => {
      const n = getLevelCount();
      for (let i = 1; i <= n; i++) { if (!p[i]?.completed) return false; }
      return true;
    }},
    { id: 'first_try', title: 'FLAWLESS', desc: 'Complete any level on first attempt', check: (p) => Object.values(p).some(l => l.completed && l.attempts === 1) },
    // Coin milestones
    { id: 'coins_5', title: 'POCKET CHANGE', desc: 'Collect 5 total coins', check: (p) => _totalCoins(p) >= 5 },
    { id: 'coins_10', title: 'COIN COLLECTOR', desc: 'Collect 10 total coins', check: (p) => _totalCoins(p) >= 10 },
    { id: 'coins_15', title: 'SHINY HOARDER', desc: 'Collect 15 total coins', check: (p) => _totalCoins(p) >= 15 },
    { id: 'coins_20', title: 'GOLD DIGGER', desc: 'Collect 20 total coins', check: (p) => _totalCoins(p) >= 20 },
    { id: 'coins_25', title: 'TREASURE SEEKER', desc: 'Collect 25 total coins', check: (p) => _totalCoins(p) >= 25 },
    { id: 'coins_30', title: 'COIN MANIAC', desc: 'Collect 30 total coins', check: (p) => _totalCoins(p) >= 30 },
    { id: 'coins_40', title: 'GOLDEN TOUCH', desc: 'Collect 40 total coins', check: (p) => _totalCoins(p) >= 40 },
    { id: 'coins_50', title: 'TREASURE HUNTER', desc: 'Collect 50 total coins', check: (p) => _totalCoins(p) >= 50 },
    { id: 'coins_60', title: 'COIN MASTER', desc: 'Collect 60 total coins', check: (p) => _totalCoins(p) >= 60 },
    { id: 'coins_65', title: 'COMPLETIONIST', desc: 'Collect all 65 coins', check: (p) => _totalCoins(p) >= 65 },
    // Persistence
    { id: 'attempts_100', title: 'PERSISTENT', desc: 'Make 100 total attempts', check: (p) => _totalAttempts(p) >= 100 },
    { id: 'attempts_500', title: 'DEDICATED', desc: 'Make 500 total attempts', check: (p) => _totalAttempts(p) >= 500 },
    { id: 'attempts_1000', title: 'UNSTOPPABLE', desc: 'Make 1000 total attempts', check: (p) => _totalAttempts(p) >= 1000 },
    // Jumps
    { id: 'jumps_100', title: 'HOPPER', desc: '100 total jumps', check: () => _totalJumps() >= 100 },
    { id: 'jumps_500', title: 'BOUNCY', desc: '500 total jumps', check: () => _totalJumps() >= 500 },
    { id: 'jumps_1000', title: 'SPRING', desc: '1,000 total jumps', check: () => _totalJumps() >= 1000 },
    { id: 'jumps_2000', title: 'KANGAROO', desc: '2,000 total jumps', check: () => _totalJumps() >= 2000 },
    { id: 'jumps_5000', title: 'SKYDIVER', desc: '5,000 total jumps', check: () => _totalJumps() >= 5000 },
    { id: 'jumps_10k', title: 'FREQUENT FLYER', desc: '10,000 total jumps', check: () => _totalJumps() >= 10000 },
    { id: 'jumps_50k', title: 'ORBIT', desc: '50,000 total jumps', check: () => _totalJumps() >= 50000 },
    { id: 'jumps_100k', title: 'STRATOSPHERE', desc: '100,000 total jumps', check: () => _totalJumps() >= 100000 },
    { id: 'jumps_1m', title: 'TO THE MOON', desc: '1,000,000 total jumps', check: () => _totalJumps() >= 1000000 },
    { id: 'jumps_10m', title: 'TO INFINITY AND BEYOND', desc: '10,000,000 total jumps', check: () => _totalJumps() >= 10000000 },
    // Progress
    { id: 'ninety', title: 'SO CLOSE', desc: 'Reach 90% without completing', check: (p) => Object.values(p).some(l => !l.completed && l.bestProgress >= 0.9) },
  );

  return achievements;
}

let _cachedAchievements = null;
let _cachedLevelCount = 0;

function _totalAttempts(p) {
  return Object.values(p).reduce((sum, l) => sum + (l.attempts || 0), 0);
}

function _totalJumps() {
  return parseInt(localStorage.getItem('gd_total_jumps') || '0');
}

function _totalCoins(p) {
  const levelCoins = Object.values(p).reduce((sum, l) => sum + (l.bestCoins || 0), 0);
  const secretCoins = parseInt(localStorage.getItem('gd_secret_coins') || '0');
  return levelCoins + secretCoins;
}

export function getAchievements() {
  const count = getLevelCount();
  if (!_cachedAchievements || count !== _cachedLevelCount) {
    _cachedAchievements = _buildAchievements();
    _cachedLevelCount = count;
  }
  return _cachedAchievements;
}

export function loadUnlocked() {
  try {
    const raw = localStorage.getItem('gd_achievements');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function _saveUnlocked(set) {
  try { localStorage.setItem('gd_achievements', JSON.stringify([...set])); } catch {}
}

export function evaluateAchievements(progress, stats) {
  const unlocked = loadUnlocked();
  const achievements = getAchievements();
  const newlyUnlocked = [];
  for (const ach of achievements) {
    if (unlocked.has(ach.id)) continue;
    try {
      if (ach.check(progress, stats)) {
        unlocked.add(ach.id);
        newlyUnlocked.push(ach);
      }
    } catch {}
  }
  if (newlyUnlocked.length > 0) _saveUnlocked(unlocked);
  return newlyUnlocked;
}
