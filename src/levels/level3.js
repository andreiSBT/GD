/** Level 3 - Polargeist (Hard) - Wave mode, all mechanics combined */
export default {
  id: 3,
  name: 'Polargeist',
  speed: 1.0,
  objects: [
    // Immediate pressure - triples
    { type: 'spike', x: 5, y: 0 },
    { type: 'spike', x: 6, y: 0 },
    { type: 'spike', x: 7, y: 0 },
    { type: 'orb', x: 9, y: 3, orbType: 'yellow_orb' },
    { type: 'spike', x: 10, y: 0 },
    { type: 'spike', x: 11, y: 0 },

    // Platform maze with pads
    { type: 'platform', x: 14, y: 1, w: 1, h: 1 },
    { type: 'pad', x: 16, y: 0, padType: 'yellow_pad' },
    { type: 'platform', x: 18, y: 4, w: 2, h: 1 },
    { type: 'spike', x: 19, y: 5 },
    { type: 'spike', x: 17, y: 0 },

    // Speed up
    { type: 'portal', x: 23, y: 0, portalType: 'speed_up' },

    // Fast spike rush with orbs
    { type: 'spike', x: 27, y: 0 },
    { type: 'orb', x: 29, y: 3, orbType: 'yellow_orb' },
    { type: 'spike', x: 30, y: 0 },
    { type: 'spike', x: 31, y: 0 },
    { type: 'orb', x: 33, y: 2, orbType: 'pink_orb' },
    { type: 'spike', x: 34, y: 0 },

    // Checkpoint 1
    { type: 'checkpoint', x: 38, y: 0 },
    { type: 'portal', x: 39, y: 0, portalType: 'speed_down' },

    // ===== WAVE MODE SECTION =====
    { type: 'portal', x: 43, y: 0, portalType: 'wave' },

    // Wave corridor - tight navigation
    { type: 'platform', x: 47, y: 4, w: 1, h: 8 },
    { type: 'platform', x: 51, y: 0, w: 1, h: 6 },
    { type: 'platform', x: 55, y: 5, w: 1, h: 7 },
    { type: 'platform', x: 59, y: 0, w: 1, h: 5 },

    // Back to cube
    { type: 'portal', x: 63, y: 0, portalType: 'cube' },

    // Checkpoint 2
    { type: 'checkpoint', x: 67, y: 0 },

    // ===== SHIP MODE with gravity flips =====
    { type: 'portal', x: 71, y: 0, portalType: 'ship' },
    { type: 'spike', x: 75, y: 0 },
    { type: 'spike', x: 75, y: 10, rot: 180 },
    { type: 'portal', x: 78, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 81, y: 0 },
    { type: 'spike', x: 81, y: 10, rot: 180 },
    { type: 'portal', x: 84, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 87, y: 2 },
    { type: 'spike', x: 87, y: 8, rot: 180 },

    // Back to cube
    { type: 'portal', x: 90, y: 0, portalType: 'cube' },

    // Checkpoint 3
    { type: 'checkpoint', x: 94, y: 0 },

    // Moving platforms + orbs gauntlet
    { type: 'moving', x: 98, y: 2, w: 2, h: 1, endX: 98, endY: 5, speed: 3 },
    { type: 'orb', x: 101, y: 4, orbType: 'dash_orb' },
    { type: 'spike', x: 103, y: 0 },
    { type: 'spike', x: 104, y: 0 },
    { type: 'moving', x: 106, y: 3, w: 2, h: 1, endX: 106, endY: 6, speed: 4 },

    // Speed up for finale
    { type: 'portal', x: 110, y: 0, portalType: 'speed_up' },

    // Staircase with spikes
    { type: 'platform', x: 114, y: 1, w: 2, h: 1 },
    { type: 'spike', x: 115, y: 2 },
    { type: 'platform', x: 117, y: 2, w: 2, h: 1 },
    { type: 'spike', x: 118, y: 3 },
    { type: 'platform', x: 120, y: 3, w: 2, h: 1 },
    { type: 'spike', x: 121, y: 4 },

    // Checkpoint 4
    { type: 'checkpoint', x: 125, y: 0 },

    // Final gravity flip rush
    { type: 'portal', x: 128, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 131, y: 12, rot: 180 },
    { type: 'orb', x: 133, y: 10, orbType: 'yellow_orb' },
    { type: 'spike', x: 134, y: 12, rot: 180 },
    { type: 'spike', x: 135, y: 12, rot: 180 },
    { type: 'portal', x: 138, y: 0, portalType: 'gravity' },

    // Very last spikes
    { type: 'pad', x: 141, y: 0, padType: 'yellow_pad' },
    { type: 'spike', x: 144, y: 0 },
    { type: 'spike', x: 145, y: 0 },
    { type: 'spike', x: 146, y: 0 },
    { type: 'spike', x: 147, y: 0 },
    { type: 'spike', x: 148, y: 0 },

    { type: 'end', x: 155 },
  ],
};
