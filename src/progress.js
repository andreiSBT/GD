/** Progress persistence - local storage + optional Supabase */

import { syncProgressToCloud, loadProgressFromCloud, isConfigured } from './supabase.js';

const STORAGE_KEY = 'gd_progress';

const DEFAULT_PROGRESS = {
  1: { attempts: 0, bestProgress: 0, completed: false },
  2: { attempts: 0, bestProgress: 0, completed: false },
  3: { attempts: 0, bestProgress: 0, completed: false },
};

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

export function updateLevelProgress(progress, levelId, currentProgress, completed) {
  if (!progress[levelId]) {
    progress[levelId] = { attempts: 0, bestProgress: 0, completed: false };
  }
  const lp = progress[levelId];
  lp.attempts++;
  if (currentProgress > lp.bestProgress) {
    lp.bestProgress = currentProgress;
  }
  if (completed) {
    lp.completed = true;
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

  // Merge: keep the best of local and cloud
  const merged = { ...DEFAULT_PROGRESS };
  for (const key of Object.keys(merged)) {
    const l = local[key] || merged[key];
    const c = cloud[key] || merged[key];
    merged[key] = {
      attempts: Math.max(l.attempts, c.attempts),
      bestProgress: Math.max(l.bestProgress, c.bestProgress),
      completed: l.completed || c.completed,
    };
  }
  saveProgress(merged);
  return merged;
}
