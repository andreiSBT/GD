/** Procedural audio using Web Audio API - no external files needed */

let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

// Resume audio context on first user interaction
export function resumeAudio() {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
}

function playTone(freq, duration, type = 'sine', volume = 0.3, freqEnd = null) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (freqEnd) {
    osc.frequency.linearRampToValueAtTime(freqEnd, c.currentTime + duration);
  }
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

function playNoise(duration, volume = 0.2) {
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  source.connect(gain);
  gain.connect(c.destination);
  source.start();
}

export function playJump() {
  playTone(400, 0.1, 'sine', 0.2, 800);
}

let deathNodes = [];

export function stopDeath() {
  const c = getCtx();
  const now = c.currentTime;
  for (const n of deathNodes) {
    try {
      n.gain.gain.cancelScheduledValues(now);
      n.gain.gain.setValueAtTime(0, now);
      if (n.source) n.source.stop(0);
    } catch {}
  }
  deathNodes = [];
}

export function playDeath() {
  stopDeath();
  const c = getCtx();

  // Noise burst
  const bufferSize = c.sampleRate * 0.3;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noiseSrc = c.createBufferSource();
  noiseSrc.buffer = buffer;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.2, c.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  noiseSrc.connect(noiseGain);
  noiseGain.connect(c.destination);
  noiseSrc.start(c.currentTime);
  noiseSrc.stop(c.currentTime + 0.35);
  deathNodes.push({ gain: noiseGain, source: noiseSrc });

  // Low rumble
  const osc = c.createOscillator();
  const oscGain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, c.currentTime);
  oscGain.gain.setValueAtTime(0.24, c.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
  osc.connect(oscGain);
  oscGain.connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.35);
  deathNodes.push({ gain: oscGain, source: osc });
}

export function playCheckpoint() {
  playTone(600, 0.06, 'sine', 0.16);
  setTimeout(() => playTone(900, 0.06, 'sine', 0.16), 60);
}

export function playSelect() {
  playTone(500, 0.08, 'sine', 0.12);
}

export function playComplete() {
  // no-op: removed to let music play uninterrupted
}

// Custom music per level
const customMusicBuffers = {}; // levelId -> AudioBuffer
let customMusicSource = null;
let customMusicGain = null;
let customMusicLevelId = null;
let customMusicStartTime = 0;  // AudioContext time when playback started
let customMusicOffset = 0;     // offset into the buffer when started

export function loadCustomMusic(levelId, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const c = getCtx();
        // Save raw bytes before decodeAudioData consumes the buffer
        const raw = new Uint8Array(reader.result);
        const buffer = await c.decodeAudioData(reader.result);
        customMusicBuffers[levelId] = buffer;
        _saveCustomMusicToDB(levelId, raw);
        resolve();
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function removeCustomMusic(levelId) {
  delete customMusicBuffers[levelId];
  _removeCustomMusicFromDB(levelId);
}

export function hasCustomMusic(levelId) {
  return !!customMusicBuffers[levelId] || !!_pendingMusicRaw[levelId];
}

function _playCustomMusic(levelId, offset = 0) {
  _stopCustomMusic();
  const buffer = customMusicBuffers[levelId];
  if (!buffer) return false;
  const c = getCtx();
  customMusicSource = c.createBufferSource();
  customMusicSource.buffer = buffer;
  customMusicSource.loop = true;
  customMusicGain = c.createGain();
  customMusicGain.gain.setValueAtTime(1.0, c.currentTime);
  customMusicSource.connect(customMusicGain);
  customMusicGain.connect(c.destination);
  // Start from offset (modulo buffer duration for looping)
  const startOffset = buffer.duration > 0 ? (offset % buffer.duration) : 0;
  customMusicSource.start(0, startOffset);
  customMusicStartTime = c.currentTime;
  customMusicOffset = startOffset;
  customMusicLevelId = levelId;
  return true;
}

function _stopCustomMusic() {
  if (customMusicSource) {
    try { customMusicSource.stop(0); } catch (_) {}
    customMusicSource.disconnect();
    customMusicSource = null;
  }
  if (customMusicGain) {
    customMusicGain.disconnect();
    customMusicGain = null;
  }
  customMusicLevelId = null;
}

export function getCustomMusicTime() {
  if (!customMusicSource || customMusicLevelId == null) return 0;
  const c = getCtx();
  return customMusicOffset + (c.currentTime - customMusicStartTime);
}

export function restartCustomMusic(offset = 0) {
  if (customMusicLevelId != null) {
    const id = customMusicLevelId;
    _stopCustomMusic();
    _playCustomMusic(id, offset);
  }
}

// IndexedDB persistence for custom music
function _openMusicDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gd_custom_music', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('tracks');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _saveCustomMusicToDB(levelId, arrayBuffer) {
  try {
    const db = await _openMusicDB();
    const tx = db.transaction('tracks', 'readwrite');
    tx.objectStore('tracks').put(arrayBuffer, levelId);
  } catch {}
}

async function _removeCustomMusicFromDB(levelId) {
  try {
    const db = await _openMusicDB();
    const tx = db.transaction('tracks', 'readwrite');
    tx.objectStore('tracks').delete(levelId);
  } catch {}
}

// Raw audio bytes loaded from IndexedDB, decoded lazily after user interaction
const _pendingMusicRaw = {};

export async function loadCustomMusicFromDB() {
  try {
    const db = await _openMusicDB();
    const tx = db.transaction('tracks', 'readonly');
    const store = tx.objectStore('tracks');
    const keys = await new Promise((res, rej) => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = rej; });
    for (const key of keys) {
      const data = await new Promise((res, rej) => { const r = store.get(key); r.onsuccess = () => res(r.result); r.onerror = rej; });
      _pendingMusicRaw[key] = data;
    }
  } catch {}
}

// Decode any pending raw audio (call after user interaction when AudioContext is active)
async function _decodePendingMusic() {
  const keys = Object.keys(_pendingMusicRaw);
  if (keys.length === 0) return;
  const c = getCtx();
  if (c.state === 'suspended') await c.resume();
  for (const key of keys) {
    if (customMusicBuffers[key]) { delete _pendingMusicRaw[key]; continue; }
    try {
      const copy = _pendingMusicRaw[key].buffer.slice(0);
      const buffer = await c.decodeAudioData(copy);
      customMusicBuffers[key] = buffer;
    } catch {}
    delete _pendingMusicRaw[key];
  }
}

export function hasPendingMusic(levelId) {
  return !!_pendingMusicRaw[levelId];
}

export function getCustomMusicDuration(levelId) {
  const buf = customMusicBuffers[levelId];
  return buf ? buf.duration : 0;
}

export async function getRawMusicFromDB(levelId) {
  try {
    const db = await _openMusicDB();
    const tx = db.transaction('tracks', 'readonly');
    const data = await new Promise((res, rej) => { const r = tx.objectStore('tracks').get(levelId); r.onsuccess = () => res(r.result); r.onerror = rej; });
    return data || null;
  } catch { return null; }
}

export function copyMusicBuffer(fromKey, toKey) {
  if (customMusicBuffers[fromKey]) {
    customMusicBuffers[toKey] = customMusicBuffers[fromKey];
  }
  if (_pendingMusicRaw[fromKey]) {
    _pendingMusicRaw[toKey] = _pendingMusicRaw[fromKey];
  }
}

// Music system
let musicInterval = null;
let musicGain = null;
let currentMusicLevel = null;
let activeNodes = []; // track all active oscillators/sources to stop them cleanly

export async function playMusic(levelId, offset = 0) {
  stopMusic();
  currentMusicLevel = levelId;

  // Decode any pending music from IndexedDB first
  if (_pendingMusicRaw[levelId] && !customMusicBuffers[levelId]) {
    await _decodePendingMusic();
  }

  // Use custom music if available
  if (customMusicBuffers[levelId]) {
    _playCustomMusic(levelId, offset);
    return;
  }

  const c = getCtx();

  const bpm = 128 + (levelId - 1) * 10;
  const beatMs = (60 / bpm) * 1000;

  const bassNotes = {
    1: [130.81, 164.81, 196.00, 164.81], // C3 E3 G3 E3
    2: [146.83, 174.61, 220.00, 174.61], // D3 F3 A3 F3
    3: [164.81, 196.00, 246.94, 196.00], // E3 G3 B3 G3
  };
  const notes = bassNotes[levelId] || bassNotes[1];

  musicGain = c.createGain();
  musicGain.gain.setValueAtTime(1.0, c.currentTime);
  musicGain.connect(c.destination);

  // Skip ahead if offset provided (e.g. editor start position)
  const beatSec = beatMs / 1000;
  let beat = offset > 0 ? Math.floor(offset / beatSec) : 0;
  function tick() {
    if (!musicGain) return;
    const now = c.currentTime;

    // Kick
    const kickOsc = c.createOscillator();
    const kickGain = c.createGain();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(150, now);
    kickOsc.frequency.exponentialRampToValueAtTime(30, now + 0.08);
    kickGain.gain.setValueAtTime(0.4, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    kickOsc.connect(kickGain);
    kickGain.connect(musicGain);
    kickOsc.start(now);
    kickOsc.stop(now + 0.1);
    activeNodes.push(kickOsc);

    // Hi-hat on off-beats
    if (beat % 2 === 1) {
      const bufSize = c.sampleRate * 0.03;
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const src = c.createBufferSource();
      src.buffer = buf;
      const hg = c.createGain();
      hg.gain.setValueAtTime(0.12, now);
      hg.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      src.connect(hg);
      hg.connect(musicGain);
      src.start(now);
      activeNodes.push(src);
    }

    // Bass note
    const noteIdx = beat % 4;
    const bassOsc = c.createOscillator();
    const bassGainNode = c.createGain();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(notes[noteIdx], now);
    bassGainNode.gain.setValueAtTime(0.15, now);
    bassGainNode.gain.exponentialRampToValueAtTime(0.001, now + beatMs / 1000 * 0.8);
    bassOsc.connect(bassGainNode);
    bassGainNode.connect(musicGain);
    bassOsc.start(now);
    bassOsc.stop(now + beatMs / 1000 * 0.8);
    activeNodes.push(bassOsc);

    // Clean up old nodes to prevent memory buildup
    // Keep only recent nodes (needed for pauseMusic to stop them)
    if (activeNodes.length > 64) {
      activeNodes = activeNodes.slice(-32);
    }

    beat++;
  }

  tick();
  musicInterval = setInterval(tick, beatMs);
}

export function pauseMusic() {
  // Stop custom music (will restart from beginning on resume)
  _stopCustomMusic();
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
  // Stop all active audio nodes immediately
  for (const node of activeNodes) {
    try { node.stop(0); } catch (_) { /* already stopped */ }
  }
  activeNodes = [];
  if (musicGain) {
    musicGain.disconnect();
    musicGain = null;
  }
}

export function resumeMusic() {
  if (currentMusicLevel != null && !musicInterval && !customMusicSource) {
    playMusic(currentMusicLevel);
  }
}

export function isMusicPlaying() {
  return musicInterval != null || customMusicSource != null;
}

export function stopMusic() {
  _stopCustomMusic();
  pauseMusic();
  currentMusicLevel = null;
}
