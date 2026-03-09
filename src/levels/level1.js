/** Level 1 - Stereo Madness (Easy) */
export default {
  id: 1,
  name: 'Stereo Madness',
  speed: 1.0,
  objects: [
    // Opening - simple single jumps
    { type: 'spike', x: 8, y: 0 },
    { type: 'spike', x: 14, y: 0 },
    { type: 'spike', x: 15, y: 0 },

    // First platform section
    { type: 'platform', x: 20, y: 2, w: 4, h: 1 },
    { type: 'spike', x: 22, y: 3 },

    // Gap with spikes
    { type: 'spike', x: 28, y: 0 },
    { type: 'spike', x: 29, y: 0 },
    { type: 'spike', x: 30, y: 0 },

    // Higher platform
    { type: 'platform', x: 34, y: 1, w: 2, h: 1 },
    { type: 'platform', x: 37, y: 3, w: 3, h: 1 },
    { type: 'spike', x: 38, y: 4 },

    // Checkpoint 1
    { type: 'checkpoint', x: 43, y: 0 },

    // More spikes with rhythm
    { type: 'spike', x: 48, y: 0 },
    { type: 'spike', x: 50, y: 0 },
    { type: 'spike', x: 52, y: 0 },
    { type: 'spike', x: 54, y: 0 },

    // Platform staircase
    { type: 'platform', x: 58, y: 1, w: 2, h: 1 },
    { type: 'platform', x: 61, y: 2, w: 2, h: 1 },
    { type: 'platform', x: 64, y: 3, w: 2, h: 1 },
    { type: 'spike', x: 65, y: 4 },

    // First gravity portal section
    { type: 'portal', x: 70, y: 0, portalType: 'gravity' },

    // Upside down spikes (on ceiling)
    { type: 'spike', x: 75, y: 12, rot: 180 },
    { type: 'spike', x: 77, y: 12, rot: 180 },

    // Back to normal
    { type: 'portal', x: 81, y: 0, portalType: 'gravity' },

    // Checkpoint 2
    { type: 'checkpoint', x: 85, y: 0 },

    // Final rush - triple spikes
    { type: 'spike', x: 90, y: 0 },
    { type: 'spike', x: 91, y: 0 },
    { type: 'spike', x: 92, y: 0 },

    { type: 'platform', x: 95, y: 2, w: 3, h: 1 },
    { type: 'spike', x: 96, y: 3 },

    { type: 'spike', x: 101, y: 0 },
    { type: 'spike', x: 102, y: 0 },

    // End
    { type: 'end', x: 108 },
  ],
};
