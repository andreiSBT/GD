/** Supabase integration for cloud saving.
 *
 * Setup:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Run this SQL to create tables:
 *
 *    -- Progress table
 *    CREATE TABLE progress (
 *      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *      user_id text NOT NULL,
 *      level_id int4 NOT NULL,
 *      attempts int4 DEFAULT 0,
 *      best_progress float4 DEFAULT 0,
 *      completed bool DEFAULT false,
 *      updated_at timestamptz DEFAULT now(),
 *      UNIQUE(user_id, level_id)
 *    );
 *
 *    -- Customization table
 *    CREATE TABLE customizations (
 *      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *      user_id text NOT NULL UNIQUE,
 *      color_index int4 DEFAULT 0,
 *      trail_index int4 DEFAULT 0,
 *      icon_index int4 DEFAULT 0,
 *      shape_index int4 DEFAULT 0,
 *      updated_at timestamptz DEFAULT now()
 *    );
 *
 *    -- Editor levels table
 *    CREATE TABLE editor_levels (
 *      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *      user_id text NOT NULL,
 *      slot_id text NOT NULL,
 *      name text DEFAULT 'Custom Level',
 *      theme_id int4 DEFAULT 1,
 *      objects jsonb DEFAULT '[]'::jsonb,
 *      object_count int4 DEFAULT 0,
 *      updated_at timestamptz DEFAULT now(),
 *      UNIQUE(user_id, slot_id)
 *    );
 *
 *    -- Enable RLS and add policies for all tables
 *    ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
 *    ALTER TABLE customizations ENABLE ROW LEVEL SECURITY;
 *    ALTER TABLE editor_levels ENABLE ROW LEVEL SECURITY;
 *
 *    CREATE POLICY "Allow all" ON progress FOR ALL USING (true) WITH CHECK (true);
 *    CREATE POLICY "Allow all" ON customizations FOR ALL USING (true) WITH CHECK (true);
 *    CREATE POLICY "Allow all" ON editor_levels FOR ALL USING (true) WITH CHECK (true);
 *
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
  // If logged in via Supabase Auth, use that ID
  if (currentAuthUser) return currentAuthUser.id;
  let id = localStorage.getItem('gd_user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('gd_user_id', id);
  }
  return id;
}

// === AUTHENTICATION ===

let currentAuthUser = null;
let onAuthChangeCallback = null;

export function onAuthChange(cb) {
  onAuthChangeCallback = cb;
}

export function getAuthUser() {
  return currentAuthUser;
}

export function getUsername() {
  if (!currentAuthUser) return null;
  return currentAuthUser.user_metadata?.username || currentAuthUser.email?.split('@')[0] || null;
}

export async function initAuth() {
  const client = getClient();
  if (!client) {
    console.log('[Auth] Supabase not configured, skipping auth');
    return;
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn('[Auth] getSession error:', error.message);
    } else if (data.session?.user) {
      currentAuthUser = data.session.user;
      console.log('[Auth] Session restored for:', currentAuthUser.user_metadata?.username || currentAuthUser.email);
      if (onAuthChangeCallback) onAuthChangeCallback(currentAuthUser);
    } else {
      console.log('[Auth] No existing session');
    }
  } catch (e) {
    console.warn('[Auth] Init failed:', e.message);
  }

  client.auth.onAuthStateChange((_event, session) => {
    currentAuthUser = session?.user || null;
    if (onAuthChangeCallback) onAuthChangeCallback(currentAuthUser);
  });
}

export async function signUp(username, email, password) {
  const client = getClient();
  if (!client) return { error: 'Supabase not configured' };

  const { data, error } = await client.auth.signUp({
    email: email.toLowerCase().trim(),
    password,
    options: { data: { username: username.trim() } }
  });

  if (error) return { error: error.message };

  currentAuthUser = data.user;

  // Migrate anonymous data to the new account
  await _migrateAnonymousData(data.user.id);

  if (onAuthChangeCallback) onAuthChangeCallback(currentAuthUser);
  return { error: null };
}

export async function signIn(usernameOrEmail, password) {
  const client = getClient();
  if (!client) return { error: 'Supabase not configured' };

  // If it contains @, treat as email; otherwise append @gd.game
  const email = usernameOrEmail.includes('@')
    ? usernameOrEmail.toLowerCase().trim()
    : usernameOrEmail.toLowerCase().trim() + '@gd.game';
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  currentAuthUser = data.user;
  if (onAuthChangeCallback) onAuthChangeCallback(currentAuthUser);
  return { error: null };
}

export async function signOut() {
  const client = getClient();
  if (!client) return;

  await client.auth.signOut();
  currentAuthUser = null;
  if (onAuthChangeCallback) onAuthChangeCallback(null);
}

// Migrate data from anonymous user_id to authenticated user
async function _migrateAnonymousData(newUserId) {
  const client = getClient();
  if (!client) return;

  const anonId = localStorage.getItem('gd_user_id');
  if (!anonId) return;

  try {
    // Migrate progress
    const { data: progressRows } = await client.from('progress').select('*').eq('user_id', anonId);
    if (progressRows) {
      for (const row of progressRows) {
        await client.from('progress').upsert({
          ...row, id: undefined, user_id: newUserId
        }, { onConflict: 'user_id,level_id' });
      }
    }

    // Migrate customization
    const { data: custRow } = await client.from('customizations').select('*').eq('user_id', anonId).single();
    if (custRow) {
      await client.from('customizations').upsert({
        ...custRow, id: undefined, user_id: newUserId
      }, { onConflict: 'user_id' });
    }

    // Migrate editor levels
    const { data: levelRows } = await client.from('editor_levels').select('*').eq('user_id', anonId);
    if (levelRows) {
      for (const row of levelRows) {
        await client.from('editor_levels').upsert({
          ...row, id: undefined, user_id: newUserId
        }, { onConflict: 'user_id,slot_id' });
      }
    }
  } catch (e) {
    console.warn('Migration failed:', e.message);
  }
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

// === CUSTOMIZATION ===

export async function syncCustomizationToCloud(customization) {
  const client = getClient();
  if (!client) return;

  const userId = getUserId();
  try {
    await client.from('customizations').upsert({
      user_id: userId,
      color_index: customization.colorIndex,
      trail_index: customization.trailIndex,
      icon_index: customization.iconIndex,
      shape_index: customization.shapeIndex,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('Supabase customization sync failed:', e.message);
  }
}

export async function loadCustomizationFromCloud() {
  const client = getClient();
  if (!client) return null;

  const userId = getUserId();
  try {
    const { data, error } = await client
      .from('customizations')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return {
      colorIndex: data.color_index,
      trailIndex: data.trail_index,
      iconIndex: data.icon_index,
      shapeIndex: data.shape_index,
    };
  } catch (e) {
    console.warn('Supabase customization load failed:', e.message);
    return null;
  }
}

// === EDITOR LEVELS ===

export async function syncEditorLevelToCloud(slotId, levelData) {
  const client = getClient();
  if (!client) return;

  const userId = getUserId();
  try {
    await client.from('editor_levels').upsert({
      user_id: userId,
      slot_id: slotId,
      name: levelData.name,
      theme_id: levelData.themeId,
      objects: levelData.objects,
      object_count: levelData.objects.length,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,slot_id' });
  } catch (e) {
    console.warn('Supabase editor sync failed:', e.message);
  }
}

export async function loadEditorLevelsFromCloud() {
  const client = getClient();
  if (!client) return null;

  const userId = getUserId();
  try {
    const { data, error } = await client
      .from('editor_levels')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error || !data) return null;
    return data.map(row => ({
      slotId: row.slot_id,
      name: row.name,
      themeId: row.theme_id,
      objects: row.objects,
      objectCount: row.object_count,
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  } catch (e) {
    console.warn('Supabase editor load failed:', e.message);
    return null;
  }
}

export async function deleteEditorLevelFromCloud(slotId) {
  const client = getClient();
  if (!client) return;

  const userId = getUserId();
  try {
    await client.from('editor_levels')
      .delete()
      .eq('user_id', userId)
      .eq('slot_id', slotId);
  } catch (e) {
    console.warn('Supabase editor delete failed:', e.message);
  }
}

export function isConfigured() {
  return !!(supabaseUrl && supabaseKey);
}
