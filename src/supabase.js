/** Supabase integration for online progress saving.
 *
 * Setup:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Create a table 'progress' with columns:
 *      - id (uuid, primary key, default gen_random_uuid())
 *      - user_id (text, not null)
 *      - level_id (int4, not null)
 *      - attempts (int4, default 0)
 *      - best_progress (float4, default 0)
 *      - completed (bool, default false)
 *      - updated_at (timestamptz, default now())
 *    Add unique constraint on (user_id, level_id)
 * 3. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

function getClient() {
  if (!supabase && supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// Get or create a simple anonymous user id
function getUserId() {
  let id = localStorage.getItem('gd_user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('gd_user_id', id);
  }
  return id;
}

export async function syncProgressToCloud(localProgress) {
  const client = getClient();
  if (!client) return; // Supabase not configured, skip silently

  const userId = getUserId();

  try {
    for (const [levelId, data] of Object.entries(localProgress)) {
      const { error } = await client
        .from('progress')
        .upsert({
          user_id: userId,
          level_id: parseInt(levelId),
          attempts: data.attempts,
          best_progress: data.bestProgress,
          completed: data.completed,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,level_id',
        });

      if (error) console.warn('Supabase sync error:', error.message);
    }
  } catch (e) {
    console.warn('Supabase sync failed:', e.message);
  }
}

export async function loadProgressFromCloud() {
  const client = getClient();
  if (!client) return null;

  const userId = getUserId();

  try {
    const { data, error } = await client
      .from('progress')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.warn('Supabase load error:', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    const progress = {};
    for (const row of data) {
      progress[row.level_id] = {
        attempts: row.attempts,
        bestProgress: row.best_progress,
        completed: row.completed,
      };
    }
    return progress;
  } catch (e) {
    console.warn('Supabase load failed:', e.message);
    return null;
  }
}

export function isConfigured() {
  return !!(supabaseUrl && supabaseKey);
}
