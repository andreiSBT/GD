/** Replay recording and ghost playback */

const RECORD_INTERVAL = 3; // record every 3rd frame

export class ReplayRecorder {
  constructor() {
    this.frames = []; // [{frame, x, y, rot, mode, alive}]
    this.frameCount = 0;
  }

  record(player) {
    if (this.frameCount % RECORD_INTERVAL === 0) {
      this.frames.push({
        f: this.frameCount,
        x: Math.round(player.x * 10) / 10,
        y: Math.round(player.y * 10) / 10,
        r: Math.round(player.rotation * 100) / 100,
        m: player.mode,
        a: player.alive ? 1 : 0,
      });
    }
    this.frameCount++;
  }

  serialize() {
    return JSON.stringify(this.frames);
  }
}

export class ReplayGhost {
  constructor(data) {
    this.frames = typeof data === 'string' ? JSON.parse(data) : data;
    this.idx = 0;
  }

  getPosition(frameCount) {
    // Find the two surrounding keyframes and interpolate
    while (this.idx < this.frames.length - 1 && this.frames[this.idx + 1].f <= frameCount) {
      this.idx++;
    }
    const curr = this.frames[this.idx];
    if (!curr) return null;
    if (!curr.a) return null; // ghost died

    const next = this.frames[this.idx + 1];
    if (!next || !next.a) return { x: curr.x, y: curr.y, rotation: curr.r, mode: curr.m };

    // Interpolate between curr and next
    const t = (frameCount - curr.f) / (next.f - curr.f);
    return {
      x: curr.x + (next.x - curr.x) * t,
      y: curr.y + (next.y - curr.y) * t,
      rotation: curr.r + (next.r - curr.r) * t,
      mode: curr.m,
    };
  }

  reset() {
    this.idx = 0;
  }

  get totalFrames() {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1].f : 0;
  }
}

export function saveReplay(levelId, data) {
  try {
    localStorage.setItem('gd_replay_' + levelId, data);
  } catch {}
}

export function loadReplay(levelId) {
  try {
    const raw = localStorage.getItem('gd_replay_' + levelId);
    return raw ? new ReplayGhost(raw) : null;
  } catch { return null; }
}
