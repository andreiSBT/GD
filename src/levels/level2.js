/** Level 2 - Back on Track (Medium) */
export default {
  id: 2,
  name: 'Back on Track',
  speed: 1.0,
  objects: [
    // Opening - quick double spikes
    { type: 'spike', x: 6, y: 0 },
    { type: 'spike', x: 7, y: 0 },
    { type: 'spike', x: 10, y: 0 },
    { type: 'spike', x: 11, y: 0 },

    // Platform hop
    { type: 'platform', x: 15, y: 2, w: 2, h: 1 },
    { type: 'spike', x: 16, y: 0 },
    { type: 'platform', x: 19, y: 3, w: 2, h: 1 },
    { type: 'spike', x: 20, y: 0 },

    // Moving platform intro
    { type: 'moving', x: 24, y: 2, w: 3, h: 1, endX: 24, endY: 5, speed: 2 },
    { type: 'spike', x: 29, y: 0 },
    { type: 'spike', x: 30, y: 0 },

    // Checkpoint 1
    { type: 'checkpoint', x: 33, y: 0 },

    // Tight spike corridor
    { type: 'platform', x: 37, y: 3, w: 8, h: 1 },
    { type: 'spike', x: 38, y: 4 },
    { type: 'spike', x: 40, y: 4 },
    { type: 'spike', x: 42, y: 4 },
    { type: 'spike', x: 39, y: 0 },
    { type: 'spike', x: 41, y: 0 },
    { type: 'spike', x: 43, y: 0 },

    // Gravity flip section
    { type: 'portal', x: 48, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 52, y: 12, rot: 180 },
    { type: 'spike', x: 53, y: 12, rot: 180 },
    { type: 'platform', x: 56, y: 10, w: 3, h: 1 },
    { type: 'spike', x: 57, y: 11 },
    { type: 'portal', x: 61, y: 0, portalType: 'gravity' },

    // Checkpoint 2
    { type: 'checkpoint', x: 65, y: 0 },

    // Moving platforms gauntlet
    { type: 'moving', x: 69, y: 2, w: 2, h: 1, endX: 69, endY: 4, speed: 3 },
    { type: 'spike', x: 73, y: 0 },
    { type: 'moving', x: 75, y: 3, w: 2, h: 1, endX: 75, endY: 5, speed: 2 },
    { type: 'spike', x: 79, y: 0 },
    { type: 'spike', x: 80, y: 0 },

    // Speed section
    { type: 'portal', x: 83, y: 0, portalType: 'speed_up' },
    { type: 'spike', x: 87, y: 0 },
    { type: 'spike', x: 89, y: 0 },
    { type: 'spike', x: 91, y: 0 },
    { type: 'spike', x: 93, y: 0 },

    // Checkpoint 3
    { type: 'checkpoint', x: 97, y: 0 },

    // Final section - gravity flips with platforms
    { type: 'portal', x: 101, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 105, y: 12, rot: 180 },
    { type: 'spike', x: 106, y: 12, rot: 180 },
    { type: 'spike', x: 107, y: 12, rot: 180 },
    { type: 'portal', x: 110, y: 0, portalType: 'gravity' },

    { type: 'spike', x: 114, y: 0 },
    { type: 'spike', x: 115, y: 0 },
    { type: 'spike', x: 116, y: 0 },
    { type: 'spike', x: 117, y: 0 },

    // End
    { type: 'end', x: 124 },
  ],
};
