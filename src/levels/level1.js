/** Level 1 - Stereo Madness (Easy) - Introduces basic mechanics + orbs/pads */
export default {
  id: 1,
  name: 'Stereo Madness',
  speed: 1.0,
  objects: [
    // Opening - simple jumps
    { type: 'spike', x: 8, y: 0 },
    { type: 'spike', x: 14, y: 0 },
    { type: 'spike', x: 15, y: 0 },

    // Platform + spike on top
    { type: 'platform', x: 20, y: 2, w: 4, h: 1 },
    { type: 'spike', x: 22, y: 3 },

    // Yellow orb intro
    { type: 'orb', x: 27, y: 3, orbType: 'yellow_orb' },
    { type: 'spike', x: 28, y: 0 },
    { type: 'spike', x: 29, y: 0 },

    // Jump pad intro
    { type: 'pad', x: 33, y: 0, padType: 'yellow_pad' },
    { type: 'spike', x: 36, y: 0 },
    { type: 'spike', x: 37, y: 0 },

    // Platform section
    { type: 'platform', x: 40, y: 3, w: 3, h: 1 },
    { type: 'spike', x: 41, y: 4 },

    // Checkpoint 1
    { type: 'checkpoint', x: 46, y: 0 },

    // Rhythm spikes + orb
    { type: 'spike', x: 50, y: 0 },
    { type: 'spike', x: 52, y: 0 },
    { type: 'orb', x: 54, y: 3, orbType: 'yellow_orb' },
    { type: 'spike', x: 55, y: 0 },
    { type: 'spike', x: 56, y: 0 },

    // Staircase
    { type: 'platform', x: 60, y: 1, w: 2, h: 1 },
    { type: 'platform', x: 63, y: 2, w: 2, h: 1 },
    { type: 'platform', x: 66, y: 3, w: 2, h: 1 },
    { type: 'spike', x: 67, y: 4 },

    // Gravity flip
    { type: 'portal', x: 72, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 76, y: 12, rot: 180 },
    { type: 'spike', x: 78, y: 12, rot: 180 },
    { type: 'portal', x: 82, y: 0, portalType: 'gravity' },

    // Checkpoint 2
    { type: 'checkpoint', x: 86, y: 0 },

    // Pink orb
    { type: 'spike', x: 90, y: 0 },
    { type: 'orb', x: 91, y: 2, orbType: 'pink_orb' },
    { type: 'spike', x: 93, y: 0 },

    // Final rush
    { type: 'pad', x: 97, y: 0, padType: 'yellow_pad' },
    { type: 'spike', x: 100, y: 0 },
    { type: 'spike', x: 101, y: 0 },
    { type: 'spike', x: 102, y: 0 },

    { type: 'end', x: 108 },
  ],
};
