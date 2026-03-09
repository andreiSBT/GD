/** Level 3 - Polargeist (Hard) */
export default {
  id: 3,
  name: 'Polargeist',
  speed: 1.0,
  objects: [
    // Immediate pressure
    { type: 'spike', x: 5, y: 0 },
    { type: 'spike', x: 6, y: 0 },
    { type: 'spike', x: 7, y: 0 },
    { type: 'platform', x: 9, y: 2, w: 2, h: 1 },
    { type: 'spike', x: 10, y: 0 },
    { type: 'spike', x: 10, y: 3 },

    // Platform maze
    { type: 'platform', x: 14, y: 1, w: 1, h: 1 },
    { type: 'platform', x: 16, y: 3, w: 1, h: 1 },
    { type: 'platform', x: 18, y: 2, w: 1, h: 1 },
    { type: 'spike', x: 15, y: 0 },
    { type: 'spike', x: 17, y: 0 },
    { type: 'spike', x: 19, y: 0 },

    // Speed up
    { type: 'portal', x: 22, y: 0, portalType: 'speed_up' },

    // Fast spike rush
    { type: 'spike', x: 26, y: 0 },
    { type: 'spike', x: 28, y: 0 },
    { type: 'spike', x: 30, y: 0 },
    { type: 'spike', x: 32, y: 0 },
    { type: 'spike', x: 33, y: 0 },

    // Checkpoint 1
    { type: 'checkpoint', x: 37, y: 0 },

    // Speed back to normal
    { type: 'portal', x: 39, y: 0, portalType: 'speed_down' },

    // Moving platform hell
    { type: 'moving', x: 43, y: 2, w: 2, h: 1, endX: 43, endY: 5, speed: 3 },
    { type: 'spike', x: 47, y: 0 },
    { type: 'spike', x: 48, y: 0 },
    { type: 'moving', x: 50, y: 3, w: 2, h: 1, endX: 50, endY: 6, speed: 4 },
    { type: 'spike', x: 54, y: 0 },

    // Double gravity flip
    { type: 'portal', x: 57, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 60, y: 12, rot: 180 },
    { type: 'spike', x: 61, y: 12, rot: 180 },
    { type: 'portal', x: 63, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 66, y: 0 },
    { type: 'portal', x: 68, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 71, y: 12, rot: 180 },
    { type: 'spike', x: 72, y: 12, rot: 180 },
    { type: 'spike', x: 73, y: 12, rot: 180 },
    { type: 'portal', x: 76, y: 0, portalType: 'gravity' },

    // Checkpoint 2
    { type: 'checkpoint', x: 80, y: 0 },

    // Staircase with spikes on every step
    { type: 'platform', x: 84, y: 1, w: 2, h: 1 },
    { type: 'spike', x: 85, y: 2 },
    { type: 'platform', x: 87, y: 2, w: 2, h: 1 },
    { type: 'spike', x: 88, y: 3 },
    { type: 'platform', x: 90, y: 3, w: 2, h: 1 },
    { type: 'spike', x: 91, y: 4 },
    { type: 'platform', x: 93, y: 4, w: 2, h: 1 },
    { type: 'spike', x: 94, y: 5 },

    // Speed up for finale
    { type: 'portal', x: 98, y: 0, portalType: 'speed_up' },

    // Checkpoint 3
    { type: 'checkpoint', x: 102, y: 0 },

    // Final rush - alternating spikes and platforms
    { type: 'spike', x: 106, y: 0 },
    { type: 'spike', x: 107, y: 0 },
    { type: 'platform', x: 109, y: 2, w: 2, h: 1 },
    { type: 'spike', x: 110, y: 3 },
    { type: 'spike', x: 113, y: 0 },
    { type: 'spike', x: 114, y: 0 },
    { type: 'spike', x: 115, y: 0 },

    // Gravity flip final
    { type: 'portal', x: 118, y: 0, portalType: 'gravity' },
    { type: 'spike', x: 121, y: 12, rot: 180 },
    { type: 'spike', x: 122, y: 12, rot: 180 },
    { type: 'spike', x: 123, y: 12, rot: 180 },
    { type: 'spike', x: 124, y: 12, rot: 180 },
    { type: 'portal', x: 127, y: 0, portalType: 'gravity' },

    // Very last spikes
    { type: 'spike', x: 131, y: 0 },
    { type: 'spike', x: 132, y: 0 },
    { type: 'spike', x: 133, y: 0 },
    { type: 'spike', x: 134, y: 0 },
    { type: 'spike', x: 135, y: 0 },

    // End
    { type: 'end', x: 142 },
  ],
};
