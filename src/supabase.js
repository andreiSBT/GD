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
 *    -- Profiles table (for friend search)
 *    CREATE TABLE profiles (
 *      user_id uuid PRIMARY KEY,
 *      username text NOT NULL,
 *      display_name text NOT NULL,
 *      updated_at timestamptz DEFAULT now()
 *    );
 *    CREATE INDEX idx_profiles_username ON profiles(username);
 *
 *    -- Friends table
 *    CREATE TABLE friends (
 *      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *      user_id uuid NOT NULL,
 *      friend_id uuid NOT NULL,
 *      status text NOT NULL DEFAULT 'pending',
 *      created_at timestamptz DEFAULT now(),
 *      UNIQUE(user_id, friend_id)
 *    );
 *
 *    -- Friend messages table
 *    CREATE TABLE friend_messages (
 *      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *      sender_id uuid NOT NULL,
 *      receiver_id uuid NOT NULL,
 *      content text NOT NULL DEFAULT '',
 *      message_type text NOT NULL DEFAULT 'text',
 *      level_data jsonb,
 *      read bool DEFAULT false,
 *      created_at timestamptz DEFAULT now()
 *    );
 *    CREATE INDEX idx_messages_receiver ON friend_messages(receiver_id, read);
 *
 *    -- Enable RLS and add policies for all tables
 *    ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
 *    ALTER TABLE customizations ENABLE ROW LEVEL SECURITY;
 *    ALTER TABLE editor_levels ENABLE ROW LEVEL SECURITY;
 *    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
 *    ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
 *    ALTER TABLE friend_messages ENABLE ROW LEVEL SECURITY;
 *
 *    CREATE POLICY "Allow all" ON progress FOR ALL USING (true) WITH CHECK (true);
 *    CREATE POLICY "Allow all" ON customizations FOR ALL USING (true) WITH CHECK (true);
 *    CREATE POLICY "Allow all" ON editor_levels FOR ALL USING (true) WITH CHECK (true);
 *    CREATE POLICY "Allow all" ON profiles FOR ALL USING (true) WITH CHECK (true);
 *    CREATE POLICY "Allow all" ON friends FOR ALL USING (true) WITH CHECK (true);
 *    CREATE POLICY "Allow all" ON friend_messages FOR ALL USING (true) WITH CHECK (true);
 *
 *    -- Admin: add is_admin to profiles
 *    ALTER TABLE profiles ADD COLUMN is_admin bool DEFAULT false;
 *
 *    -- Official levels table (admin-editable)
 *    CREATE TABLE official_levels (
 *      level_id int4 PRIMARY KEY,
 *      name text NOT NULL,
 *      speed float4 DEFAULT 1.0,
 *      theme_id int4 DEFAULT 1,
 *      objects jsonb DEFAULT '[]'::jsonb,
 *      updated_at timestamptz DEFAULT now()
 *    );
 *    ALTER TABLE official_levels ENABLE ROW LEVEL SECURITY;
 *    CREATE POLICY "Anyone can read" ON official_levels FOR SELECT USING (true);
 *    CREATE POLICY "Admins can write" ON official_levels FOR ALL USING (true) WITH CHECK (true);
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
    id = (crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
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

export async function signUp(username, password) {
  const client = getClient();
  if (!client) return { error: 'Supabase not configured' };

  const email = username.toLowerCase().trim() + '@gdgame.com';
  const { data, error } = await client.auth.signUp({
    email,
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
    : usernameOrEmail.toLowerCase().trim() + '@gdgame.com';
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  currentAuthUser = data.user;
  if (onAuthChangeCallback) onAuthChangeCallback(currentAuthUser);
  return { error: null };
}

export async function signOut() {
  const client = getClient();
  if (!client) return;

  await client.auth.signOut({ scope: 'local' });
  currentAuthUser = null;
  _isAdmin = false;
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

// === LEVEL MUSIC (Supabase Storage) ===

export async function uploadOfficialMusic(levelId, file) {
  const client = getClient();
  if (!client) return null;
  const path = `official/${levelId}.audio`;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const { error } = await client.storage.from('level-music')
      .upload(path, arrayBuffer, { contentType: file.type || 'audio/mpeg', upsert: true });
    if (error) { console.warn('Official music upload failed:', error.message); return null; }
    return path;
  } catch (e) {
    console.warn('Official music upload failed:', e.message);
    return null;
  }
}

export async function downloadOfficialMusic(levelId) {
  const client = getClient();
  if (!client) return null;
  const path = `official/${levelId}.audio`;
  try {
    const { data, error } = await client.storage.from('level-music').download(path);
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch { return null; }
}

export async function uploadLevelMusic(slotId, file) {
  const client = getClient();
  if (!client) return null;
  const userId = getUserId();
  const path = `${userId}/${slotId}.audio`;
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const { error } = await client.storage.from('level-music')
      .upload(path, arrayBuffer, { contentType: file.type || 'audio/mpeg', upsert: true });
    if (error) { console.warn('Music upload failed:', error.message); return null; }
    return path;
  } catch (e) {
    console.warn('Music upload failed:', e.message);
    return null;
  }
}

export async function downloadLevelMusic(slotId) {
  const client = getClient();
  if (!client) return null;
  const userId = getUserId();
  const path = `${userId}/${slotId}.audio`;
  try {
    const { data, error } = await client.storage.from('level-music').download(path);
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch (e) {
    console.warn('Music download failed:', e.message);
    return null;
  }
}

export async function deleteLevelMusic(slotId) {
  const client = getClient();
  if (!client) return;
  const userId = getUserId();
  const path = `${userId}/${slotId}.audio`;
  try {
    await client.storage.from('level-music').remove([path]);
  } catch {}
}

export async function listLevelMusic() {
  const client = getClient();
  if (!client) return [];
  const userId = getUserId();
  try {
    const { data, error } = await client.storage.from('level-music').list(userId);
    if (error || !data) return [];
    return data.map(f => f.name.replace('.audio', ''));
  } catch { return []; }
}

export function isConfigured() {
  return !!(supabaseUrl && supabaseKey);
}

// === FRIENDS SYSTEM ===

// Ensure user profile exists in profiles table (for search)
export async function ensureProfile() {
  const client = getClient();
  if (!client || !currentAuthUser) return;
  const username = getUsername();
  if (!username) return;
  try {
    await client.from('profiles').upsert({
      user_id: currentAuthUser.id,
      username: username.toLowerCase(),
      display_name: username,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('[Friends] ensureProfile failed:', e.message);
  }
}

// Search users by username
export async function searchUsers(query) {
  const client = getClient();
  if (!client || !currentAuthUser) return [];
  try {
    const { data, error } = await client
      .from('profiles')
      .select('user_id, display_name')
      .ilike('username', `%${query.toLowerCase()}%`)
      .neq('user_id', currentAuthUser.id)
      .limit(20);
    if (error) { console.warn('[Friends] search error:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.warn('[Friends] search failed:', e.message);
    return [];
  }
}

// Send friend request
export async function sendFriendRequest(friendId) {
  const client = getClient();
  if (!client || !currentAuthUser) return { error: 'Not logged in' };
  try {
    // Check if request already exists
    const { data: existing } = await client.from('friends')
      .select('id, status')
      .or(`and(user_id.eq.${currentAuthUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentAuthUser.id})`)
      .limit(1);
    if (existing && existing.length > 0) {
      if (existing[0].status === 'accepted') return { error: 'Already friends' };
      return { error: 'Request already sent' };
    }
    const { error } = await client.from('friends').insert({
      user_id: currentAuthUser.id,
      friend_id: friendId,
      status: 'pending',
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e.message };
  }
}

// Accept friend request
export async function acceptFriendRequest(requestId) {
  const client = getClient();
  if (!client) return;
  try {
    await client.from('friends').update({ status: 'accepted' }).eq('id', requestId);
  } catch (e) {
    console.warn('[Friends] accept failed:', e.message);
  }
}

// Decline/remove friend request or friendship
export async function removeFriend(requestId) {
  const client = getClient();
  if (!client) return;
  try {
    await client.from('friends').delete().eq('id', requestId);
  } catch (e) {
    console.warn('[Friends] remove failed:', e.message);
  }
}

// Get accepted friends list
export async function getFriends() {
  const client = getClient();
  if (!client || !currentAuthUser) return [];
  try {
    const uid = currentAuthUser.id;
    // Get all accepted friendships where I'm either side
    const { data, error } = await client.from('friends')
      .select('id, user_id, friend_id, status')
      .eq('status', 'accepted')
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`);
    if (error || !data) return [];
    // Collect friend user_ids
    const friendIds = data.map(r => r.user_id === uid ? r.friend_id : r.user_id);
    if (friendIds.length === 0) return [];
    // Fetch display names
    const { data: profiles } = await client.from('profiles')
      .select('user_id, display_name')
      .in('user_id', friendIds);
    const nameMap = {};
    if (profiles) for (const p of profiles) nameMap[p.user_id] = p.display_name;
    return data.map(r => {
      const fid = r.user_id === uid ? r.friend_id : r.user_id;
      return { id: r.id, friendId: fid, name: nameMap[fid] || 'Unknown' };
    });
  } catch (e) {
    console.warn('[Friends] getFriends failed:', e.message);
    return [];
  }
}

// Get pending friend requests (incoming)
export async function getFriendRequests() {
  const client = getClient();
  if (!client || !currentAuthUser) return [];
  try {
    const { data, error } = await client.from('friends')
      .select('id, user_id')
      .eq('friend_id', currentAuthUser.id)
      .eq('status', 'pending');
    if (error || !data) return [];
    if (data.length === 0) return [];
    const senderIds = data.map(r => r.user_id);
    const { data: profiles } = await client.from('profiles')
      .select('user_id, display_name')
      .in('user_id', senderIds);
    const nameMap = {};
    if (profiles) for (const p of profiles) nameMap[p.user_id] = p.display_name;
    return data.map(r => ({ id: r.id, senderId: r.user_id, name: nameMap[r.user_id] || 'Unknown' }));
  } catch (e) {
    console.warn('[Friends] getRequests failed:', e.message);
    return [];
  }
}

// Send a message to a friend
export async function sendMessage(receiverId, content, type = 'text', levelData = null) {
  const client = getClient();
  if (!client || !currentAuthUser) return { error: 'Not logged in' };
  try {
    const { error } = await client.from('friend_messages').insert({
      sender_id: currentAuthUser.id,
      receiver_id: receiverId,
      content: content,
      message_type: type,
      level_data: levelData,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e.message };
  }
}

// Delete a message (only own messages)
export async function deleteMessage(messageId) {
  const client = getClient();
  if (!client || !currentAuthUser) return { error: 'Not logged in' };
  try {
    const { error } = await client.from('friend_messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', currentAuthUser.id);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e.message };
  }
}

// Get messages with a specific friend
export async function getMessages(friendId) {
  const client = getClient();
  if (!client || !currentAuthUser) return [];
  try {
    const uid = currentAuthUser.id;
    const { data, error } = await client.from('friend_messages')
      .select('*')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error || !data) return [];
    // Mark received messages as read
    await client.from('friend_messages')
      .update({ read: true })
      .eq('sender_id', friendId)
      .eq('receiver_id', uid)
      .eq('read', false);
    return data.map(m => ({
      id: m.id,
      senderId: m.sender_id,
      content: m.content,
      type: m.message_type,
      levelData: m.level_data,
      createdAt: m.created_at,
      mine: m.sender_id === uid,
    }));
  } catch (e) {
    console.warn('[Friends] getMessages failed:', e.message);
    return [];
  }
}

// Get unread message count
export async function getUnreadCount() {
  const client = getClient();
  if (!client || !currentAuthUser) return 0;
  try {
    const { count, error } = await client.from('friend_messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', currentAuthUser.id)
      .eq('read', false);
    if (error) return 0;
    return count || 0;
  } catch (e) { return 0; }
}

// Get user's editor levels (for sharing)
export async function getMyEditorLevels() {
  const client = getClient();
  if (!client || !currentAuthUser) return [];
  try {
    const { data, error } = await client.from('editor_levels')
      .select('slot_id, name, object_count')
      .eq('user_id', currentAuthUser.id)
      .order('updated_at', { ascending: false });
    if (error || !data) return [];
    return data.map(r => ({ slotId: r.slot_id, name: r.name, objectCount: r.object_count }));
  } catch (e) { return []; }
}

// Get a shared level's data
export async function getSharedLevel(userId, slotId) {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('editor_levels')
      .select('*')
      .eq('user_id', userId)
      .eq('slot_id', slotId)
      .single();
    if (error || !data) return null;
    return {
      name: data.name,
      themeId: data.theme_id,
      objects: data.objects,
    };
  } catch (e) { return null; }
}

// === ADMIN & OFFICIAL LEVELS ===

let _isAdmin = false;

export function isAdmin() {
  return _isAdmin;
}

export async function checkAdmin() {
  const client = getClient();
  if (!client || !currentAuthUser) { _isAdmin = false; return false; }
  try {
    const { data, error } = await client.from('profiles')
      .select('is_admin')
      .eq('user_id', currentAuthUser.id)
      .single();
    _isAdmin = !error && data?.is_admin === true;
    return _isAdmin;
  } catch (e) {
    _isAdmin = false;
    return false;
  }
}

export async function loadOfficialLevels() {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from('official_levels')
      .select('*')
      .order('level_id', { ascending: true });
    if (error || !data || data.length === 0) return null;
    const result = {};
    for (const row of data) {
      result[row.level_id] = {
        id: row.level_id,
        name: row.name,
        speed: row.speed || 1.0,
        themeId: row.theme_id || row.level_id,
        objects: row.objects,
      };
    }
    return result;
  } catch (e) {
    console.warn('[Admin] loadOfficialLevels failed:', e.message);
    return null;
  }
}

export async function saveOfficialLevel(levelId, levelData) {
  const client = getClient();
  if (!client || !_isAdmin) return { error: 'Not admin' };
  try {
    const { error } = await client.from('official_levels').upsert({
      level_id: levelId,
      name: levelData.name,
      speed: levelData.speed || 1.0,
      theme_id: levelData.themeId || levelId,
      objects: levelData.objects,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'level_id' });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e.message };
  }
}
