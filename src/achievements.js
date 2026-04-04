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
    // Coins
    { id: 'coins_any', title: 'COIN COLLECTOR', desc: 'Get all coins in any level', check: (p, s) => Object.keys(s.totalCoins).some(id => (p[id]?.bestCoins || 0) >= s.totalCoins[id] && s.totalCoins[id] > 0) },
    { id: 'coins_all', title: 'TREASURE HUNTER', desc: 'Get all coins in all levels', check: (p, s) => Object.keys(s.totalCoins).every(id => (p[id]?.bestCoins || 0) >= s.totalCoins[id]) },
    // Persistence
    { id: 'attempts_100', title: 'PERSISTENT', desc: 'Make 100 total attempts', check: (p) => _totalAttempts(p) >= 100 },
    { id: 'attempts_500', title: 'DEDICATED', desc: 'Make 500 total attempts', check: (p) => _totalAttempts(p) >= 500 },
    { id: 'attempts_1000', title: 'UNSTOPPABLE', desc: 'Make 1000 total attempts', check: (p) => _totalAttempts(p) >= 1000 },
    // Progress
    { id: 'half_1', title: 'HALFWAY THERE', desc: 'Reach 50% on any level', check: (p) => Object.values(p).some(l => l.bestProgress >= 0.5) },
    { id: 'ninety', title: 'SO CLOSE', desc: 'Reach 90% without completing', check: (p) => Object.values(p).some(l => !l.completed && l.bestProgress >= 0.9) },
  );

  return achievements;
}

let _cachedAchievements = null;
let _cachedLevelCount = 0;

function _totalAttempts(p) {
  return Object.values(p).reduce((sum, l) => sum + (l.attempts || 0), 0);
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
