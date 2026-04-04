/** Progress persistence - local storage + optional Supabase */

import { syncProgressToCloud, loadProgressFromCloud, isConfigured } from './supabase.js';

const STORAGE_KEY = 'gd_progress';

const DEFAULT_PROGRESS = {};
for (let i = 1; i <= 9; i++) {
  DEFAULT_PROGRESS[i] = { attempts: 0, bestProgress: 0, completed: false };
}

export function loadProgress() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // Merge with defaults in case new levels added
      return { ...DEFAULT_PROGRESS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load progress:', e);
  }
  return { ...DEFAULT_PROGRESS };
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('Failed to save progress:', e);
  }
}

export function incrementAttempt(progress, levelId) {
  if (!progress[levelId]) {
    progress[levelId] = { attempts: 0, bestProgress: 0, completed: false };
  }
  progress[levelId].attempts++;
  saveProgress(progress);
  syncProgressToCloud(progress);
  return progress;
}

export function updateLevelProgress(progress, levelId, currentProgress, completed, coins = 0, practiceCompleted = false) {
  if (!progress[levelId]) {
    progress[levelId] = { attempts: 0, bestProgress: 0, completed: false, bestCoins: 0, practiceCompleted: false };
  }
  const lp = progress[levelId];
  if (currentProgress > lp.bestProgress) {
    lp.bestProgress = currentProgress;
  }
  if (completed) {
    lp.completed = true;
  }
  if (practiceCompleted) {
    lp.practiceCompleted = true;
  }
  if (coins > (lp.bestCoins || 0)) {
    lp.bestCoins = coins;
  }
  saveProgress(progress);
  // Sync to cloud in background (non-blocking)
  syncProgressToCloud(progress);
  return progress;
}

// Try to load from cloud on startup, merge with local
export async function initProgress() {
  const local = loadProgress();
  if (!isConfigured()) return local;

  const cloud = await loadProgressFromCloud();
  if (!cloud) return local;

  // Merge: keep the best of local and cloud for ALL keys
  const allKeys = new Set([...Object.keys(DEFAULT_PROGRESS), ...Object.keys(local), ...Object.keys(cloud)]);
  const merged = { ...DEFAULT_PROGRESS };
  for (const key of allKeys) {
    const def = { attempts: 0, bestProgress: 0, completed: false };
    const l = local[key] || def;
    const c = cloud[key] || def;
    merged[key] = {
      attempts: Math.max(l.attempts || 0, c.attempts || 0),
      bestProgress: Math.max(l.bestProgress || 0, c.bestProgress || 0),
      completed: !!(l.completed || c.completed),
      bestCoins: Math.max(l.bestCoins || 0, c.bestCoins || 0),
    };
  }
  saveProgress(merged);
  return merged;
}
