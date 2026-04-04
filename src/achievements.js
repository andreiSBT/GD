/** Achievement system */

import { getLevelCount, LEVEL_DATA } from './level.js';

// Achievement categories
export const CATEGORIES = [
  { id: 'levels', name: 'LEVELS' },
  { id: 'practice', name: 'PRACTICE' },
  { id: 'coins', name: 'COINS' },
  { id: 'community', name: 'COMMUNITY' },
  { id: 'jumps', name: 'JUMPS' },
  { id: 'persistence', name: 'PERSISTENCE' },
  { id: 'skill', name: 'SKILL' },
];

function _buildAchievements() {
  const LEVEL_NAMES = {
    1: 'Stereo Madness', 2: 'Back on Track', 3: 'Polargeist',
    4: 'Dry Out', 5: 'Base After Base', 6: "Can't Let Go",
    7: 'Jumper', 8: 'Time Machine', 9: 'Cycles',
  };

  const achievements = [];
  const count = getLevelCount();

  // === LEVELS ===
  for (let id = 1; id <= count; id++) {
    const name = (LEVEL_DATA[id] && LEVEL_DATA[id].name) || LEVEL_NAMES[id] || `Level ${id}`;
    achievements.push({
      id: `complete_${id}`, category: 'levels',
      title: `${name}`, desc: `Complete ${name}`,
      check: (p) => p[id]?.completed,
    });
  }
  achievements.push({
    id: 'complete_all', category: 'levels',
    title: 'CHAMPION', desc: 'Complete all official levels',
    check: (p) => { for (let i = 1; i <= getLevelCount(); i++) { if (!p[i]?.completed) return false; } return true; },
  });

  // === PRACTICE ===
  for (let id = 1; id <= count; id++) {
    const name = (LEVEL_DATA[id] && LEVEL_DATA[id].name) || LEVEL_NAMES[id] || `Level ${id}`;
    achievements.push({
      id: `practice_${id}`, category: 'practice',
      title: `${name} (Practice)`, desc: `Complete ${name} in practice mode`,
      check: (p) => p[id]?.practiceCompleted,
    });
  }

  // === COINS ===
  achievements.push(
    { id: 'coins_5', category: 'coins', title: 'POCKET CHANGE', desc: 'Collect 5 total coins', check: (p) => _totalCoins(p) >= 5 },
    { id: 'coins_10', category: 'coins', title: 'COIN COLLECTOR', desc: 'Collect 10 total coins', check: (p) => _totalCoins(p) >= 10 },
    { id: 'coins_15', category: 'coins', title: 'SHINY HOARDER', desc: 'Collect 15 total coins', check: (p) => _totalCoins(p) >= 15 },
    { id: 'coins_20', category: 'coins', title: 'GOLD DIGGER', desc: 'Collect 20 total coins', check: (p) => _totalCoins(p) >= 20 },
    { id: 'coins_25', category: 'coins', title: 'TREASURE SEEKER', desc: 'Collect 25 total coins', check: (p) => _totalCoins(p) >= 25 },
    { id: 'coins_30', category: 'coins', title: 'COIN MANIAC', desc: 'Collect 30 total coins', check: (p) => _totalCoins(p) >= 30 },
    { id: 'coins_40', category: 'coins', title: 'GOLDEN TOUCH', desc: 'Collect 40 total coins', check: (p) => _totalCoins(p) >= 40 },
    { id: 'coins_50', category: 'coins', title: 'TREASURE HUNTER', desc: 'Collect 50 total coins', check: (p) => _totalCoins(p) >= 50 },
    { id: 'coins_60', category: 'coins', title: 'COIN MASTER', desc: 'Collect 60 total coins', check: (p) => _totalCoins(p) >= 60 },
    { id: 'coins_65', category: 'coins', title: 'COMPLETIONIST', desc: 'Collect all 65 coins', check: (p) => _totalCoins(p) >= 65 },
  );

  // === COMMUNITY ===
  achievements.push(
    { id: 'comm_1', category: 'community', title: 'EXPLORER', desc: 'Complete 1 community level', check: () => _communityCompletions() >= 1 },
    { id: 'comm_5', category: 'community', title: 'ADVENTURER', desc: 'Complete 5 community levels', check: () => _communityCompletions() >= 5 },
    { id: 'comm_10', category: 'community', title: 'PATHFINDER', desc: 'Complete 10 community levels', check: () => _communityCompletions() >= 10 },
    { id: 'comm_25', category: 'community', title: 'TRAILBLAZER', desc: 'Complete 25 community levels', check: () => _communityCompletions() >= 25 },
    { id: 'comm_50', category: 'community', title: 'VETERAN EXPLORER', desc: 'Complete 50 community levels', check: () => _communityCompletions() >= 50 },
    { id: 'comm_100', category: 'community', title: 'COMMUNITY HERO', desc: 'Complete 100 community levels', check: () => _communityCompletions() >= 100 },
    { id: 'comm_500', category: 'community', title: 'LEGEND', desc: 'Complete 500 community levels', check: () => _communityCompletions() >= 500 },
  );

  // === JUMPS ===
  achievements.push(
    { id: 'jumps_100', category: 'jumps', title: 'HOPPER', desc: '100 total jumps', check: () => _totalJumps() >= 100 },
    { id: 'jumps_500', category: 'jumps', title: 'BOUNCY', desc: '500 total jumps', check: () => _totalJumps() >= 500 },
    { id: 'jumps_1000', category: 'jumps', title: 'SPRING', desc: '1,000 total jumps', check: () => _totalJumps() >= 1000 },
    { id: 'jumps_2000', category: 'jumps', title: 'KANGAROO', desc: '2,000 total jumps', check: () => _totalJumps() >= 2000 },
    { id: 'jumps_5000', category: 'jumps', title: 'SKYDIVER', desc: '5,000 total jumps', check: () => _totalJumps() >= 5000 },
    { id: 'jumps_10k', category: 'jumps', title: 'FREQUENT FLYER', desc: '10,000 total jumps', check: () => _totalJumps() >= 10000 },
    { id: 'jumps_50k', category: 'jumps', title: 'ORBIT', desc: '50,000 total jumps', check: () => _totalJumps() >= 50000 },
    { id: 'jumps_100k', category: 'jumps', title: 'STRATOSPHERE', desc: '100,000 total jumps', check: () => _totalJumps() >= 100000 },
    { id: 'jumps_1m', category: 'jumps', title: 'TO THE MOON', desc: '1,000,000 total jumps', check: () => _totalJumps() >= 1000000 },
    { id: 'jumps_10m', category: 'jumps', title: 'TO INFINITY AND BEYOND', desc: '10,000,000 total jumps', check: () => _totalJumps() >= 10000000 },
  );

  // === PERSISTENCE ===
  achievements.push(
    { id: 'attempts_100', category: 'persistence', title: 'PERSISTENT', desc: 'Make 100 total attempts', check: (p) => _totalAttempts(p) >= 100 },
    { id: 'attempts_500', category: 'persistence', title: 'DEDICATED', desc: 'Make 500 total attempts', check: (p) => _totalAttempts(p) >= 500 },
    { id: 'attempts_1000', category: 'persistence', title: 'UNSTOPPABLE', desc: 'Make 1000 total attempts', check: (p) => _totalAttempts(p) >= 1000 },
  );

  // === SKILL ===
  achievements.push(
    { id: 'first_try', category: 'skill', title: 'FLAWLESS', desc: 'Complete any level on first attempt', check: (p) => Object.values(p).some(l => l.completed && l.attempts === 1) },
    { id: 'ninety', category: 'skill', title: 'SO CLOSE', desc: 'Reach 90% without completing', check: (p) => Object.values(p).some(l => !l.completed && l.bestProgress >= 0.9) },
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

function _communityCompletions() {
  return parseInt(localStorage.getItem('gd_community_completions') || '0');
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
