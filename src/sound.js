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

export function playDeath() {
  playNoise(0.3, 0.25);
  playTone(80, 0.35, 'sine', 0.3);
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

export function stopMusic() {
  pauseMusic();
  currentMusicLevel = null;
}
