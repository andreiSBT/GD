/** Level 2 - Back on Track (Medium) - Ship mode + more orbs */
export default {
  id: 2,
  name: 'Back on Track',
  speed: 1.0,
  objects: [
    // Quick doubles
    { type: 'spike', x: 6, y: 0 },
    { type: 'spike', x: 7, y: 0 },
    { type: 'spike', x: 10, y: 0 },
    { type: 'spike', x: 11, y: 0 },

    // Platform hops with orbs
    { type: 'platform', x: 15, y: 2, w: 2, h: 1 },
    { type: 'orb', x: 16, y: 4, orbType: 'yellow_orb' },
    { type: 'spike', x: 18, y: 0 },
    { type: 'platform', x: 20, y: 3, w: 2, h: 1 },
    { type: 'spike', x: 21, y: 0 },

    // Moving platform + pad
    { type: 'moving', x: 25, y: 2, w: 3, h: 1, endX: 25, endY: 5, speed: 2 },
    { type: 'pad', x: 30, y: 0, padType: 'yellow_pad' },

    // Checkpoint 1
    { type: 'checkpoint', x: 34, y: 0 },

    // ===== SHIP MODE SECTION =====
    { type: 'portal', x: 38, y: 0, portalType: 'ship' },

    // Ship corridor - navigate between spikes
    { type: 'spike', x: 43, y: 0 },
    { type: 'spike', x: 43, y: 10, rot: 180 },
    { type: 'spike', x: 47, y: 0 },
    { type: 'spike', x: 47, y: 10, rot: 180 },
    { type: 'spike', x: 51, y: 2 },
    { type: 'spike', x: 51, y: 8, rot: 180 },
    { type: 'spike', x: 55, y: 0 },

    // Back to cube
    { type: 'portal', x: 58, y: 0, portalType: 'cube' },

    // Checkpoint 2
    { type: 'checkpoint', x: 62, y: 0 },

    // Gravity flip with orbs
    { type: 'portal', x: 66, y: 0, portalType: 'gravity' },
    { type: 'orb', x: 69, y: 10, orbType: 'yellow_orb' },
    { type: 'spike', x: 71, y: 12, rot: 180 },
    { type: 'spike', x: 72, y: 12, rot: 180 },
    { type: 'portal', x: 75, y: 0, portalType: 'gravity' },

    // Dash orb section
    { type: 'orb', x: 80, y: 2, orbType: 'dash_orb' },
    { type: 'spike', x: 83, y: 0 },
    { type: 'spike', x: 84, y: 0 },

    // Speed up
    { type: 'portal', x: 88, y: 0, portalType: 'speed_up' },

    // Fast spike run
    { type: 'spike', x: 92, y: 0 },
    { type: 'spike', x: 94, y: 0 },
    { type: 'pad', x: 96, y: 0, padType: 'pink_pad' },
    { type: 'spike', x: 99, y: 0 },

    // Checkpoint 3
    { type: 'checkpoint', x: 103, y: 0 },

    // Speed normal
    { type: 'portal', x: 105, y: 0, portalType: 'speed_down' },

    // Final gravity section
    { type: 'portal', x: 109, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 112, y: 12, rot: 180 },
    { type: 'spike', x: 113, y: 12, rot: 180 },
    { type: 'spike', x: 114, y: 12, rot: 180 },
    { type: 'portal', x: 117, y: 0, portalType: 'gravity' },

    { type: 'spike', x: 121, y: 0 },
    { type: 'spike', x: 122, y: 0 },
    { type: 'spike', x: 123, y: 0 },

    { type: 'end', x: 128 },
  ],
};
