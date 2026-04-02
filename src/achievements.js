/** Achievement system */

const ACHIEVEMENTS = [
  // Level completion
  { id: 'complete_1', title: 'FIRST CLEAR', desc: 'Complete Level 1', check: (p) => p[1]?.completed },
  { id: 'complete_2', title: 'GETTING BETTER', desc: 'Complete Level 2', check: (p) => p[2]?.completed },
  { id: 'complete_3', title: 'VETERAN', desc: 'Complete Level 3', check: (p) => p[3]?.completed },
  { id: 'complete_all', title: 'CHAMPION', desc: 'Complete all official levels', check: (p) => p[1]?.completed && p[2]?.completed && p[3]?.completed },
  // Skill-based
  { id: 'under3_1', title: 'SPEEDRUNNER', desc: 'Complete Level 1 in under 3 attempts', check: (p) => p[1]?.completed && p[1]?.attempts <= 3 },
  { id: 'under3_2', title: 'NATURAL TALENT', desc: 'Complete Level 2 in under 3 attempts', check: (p) => p[2]?.completed && p[2]?.attempts <= 3 },
  { id: 'first_try', title: 'FLAWLESS', desc: 'Complete any level on first attempt', check: (p) => Object.values(p).some(l => l.completed && l.attempts === 1) },
  // Coins
  { id: 'coins_1', title: 'COIN COLLECTOR', desc: 'Get all coins in Level 1', check: (p, s) => (p[1]?.bestCoins || 0) >= s.totalCoins[1] },
  { id: 'coins_all', title: 'TREASURE HUNTER', desc: 'Get all coins in all levels', check: (p, s) => Object.keys(s.totalCoins).every(id => (p[id]?.bestCoins || 0) >= s.totalCoins[id]) },
  // Persistence
  { id: 'attempts_100', title: 'PERSISTENT', desc: 'Make 100 total attempts', check: (p) => _totalAttempts(p) >= 100 },
  { id: 'attempts_500', title: 'DEDICATED', desc: 'Make 500 total attempts', check: (p) => _totalAttempts(p) >= 500 },
  { id: 'attempts_1000', title: 'UNSTOPPABLE', desc: 'Make 1000 total attempts', check: (p) => _totalAttempts(p) >= 1000 },
  // Progress
  { id: 'half_1', title: 'HALFWAY THERE', desc: 'Reach 50% on any level', check: (p) => Object.values(p).some(l => l.bestProgress >= 0.5) },
  { id: 'ninety', title: 'SO CLOSE', desc: 'Reach 90% without completing', check: (p) => Object.values(p).some(l => !l.completed && l.bestProgress >= 0.9) },
];

function _totalAttempts(p) {
  return Object.values(p).reduce((sum, l) => sum + (l.attempts || 0), 0);
}

export function getAchievements() {
  return ACHIEVEMENTS;
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
  const newlyUnlocked = [];
  for (const ach of ACHIEVEMENTS) {
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
