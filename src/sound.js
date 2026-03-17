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
  playTone(400, 0.1, 'sine', 0.25, 800);
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
  noiseGain.gain.setValueAtTime(0.25, c.currentTime);
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
  oscGain.gain.setValueAtTime(0.3, c.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
  osc.connect(oscGain);
  oscGain.connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.35);
  deathNodes.push({ gain: oscGain, source: osc });
}

export function playCheckpoint() {
  playTone(600, 0.06, 'sine', 0.2);
  setTimeout(() => playTone(900, 0.06, 'sine', 0.2), 60);
}

export function playSelect() {
  playTone(500, 0.08, 'sine', 0.15);
}

export function playComplete() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, 'sine', 0.2), i * 120);
  });
}

// Music system
let musicInterval = null;
let musicGain = null;
let currentMusicLevel = null;
let activeNodes = []; // track all active oscillators/sources to stop them cleanly

export function playMusic(levelId) {
  stopMusic();
  currentMusicLevel = levelId;
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

  let beat = 0;
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

    // Clean up finished nodes to prevent memory buildup
    if (beat % 16 === 0) {
      activeNodes = activeNodes.filter(n => {
        try { return n.playbackState !== 3; } catch (_) { return false; }
      });
    }

    beat++;
  }

  tick();
  musicInterval = setInterval(tick, beatMs);
}

export function pauseMusic() {
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
  if (currentMusicLevel != null && !musicInterval) {
    playMusic(currentMusicLevel);
  }
}

export function isMusicPlaying() {
  return musicInterval != null;
}

export function stopMusic() {
  pauseMusic();
  currentMusicLevel = null;
}
