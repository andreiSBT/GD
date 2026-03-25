/** Game constants and configuration */

export let SCREEN_WIDTH = 1200;
export const SCREEN_HEIGHT = 700;

// Performance: detect mobile/low-end devices and skip expensive effects
export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const _initialLowPerf = IS_MOBILE || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
export let LOW_PERF = _initialLowPerf;
export function setLowPerf(v) { LOW_PERF = v; }

export function setScreenWidth(w) { SCREEN_WIDTH = w; }
export const FPS = 60;

// Grid
export const GRID = 50; // pixels per grid unit

// Player
export const PLAYER_SIZE = 44;
export const SCROLL_SPEED = 8;
export const GRAVITY = 0.93;
export const JUMP_VEL = -14;
export const PLAYER_X_OFFSET = 300; // fixed screen x

// Ground
export const GROUND_H = 100;
export const GROUND_Y = SCREEN_HEIGHT - GROUND_H;

// Particles
export const MAX_PARTICLES = 200;

// Player customization options
export const PLAYER_COLORS = [
  '#00FF64', '#00C8FF', '#FF3296', '#FFD700', '#FF6600',
  '#FF0000', '#AA00FF', '#00FFAA', '#FF69B4', '#FFFFFF',
];

export const PLAYER_TRAIL_COLORS = [
  null,       // same as player color
  '#00C8FF', '#FF3296', '#FFD700', '#FF6600',
  '#FF0000', '#AA00FF', '#00FFAA', '#FF69B4', '#FFFFFF',
];

// Cube shape variants (visual only, hitbox stays the same)
export const CUBE_SHAPES = [
  'square',     // classic square
  'circle',     // round ball
  'diamond',    // rotated square / diamond
  'triangle',   // triangle pointing right
  'hexagon',    // hexagonal shape
  'rounded',    // rounded square
  'cross',      // plus/cross shape
  'dart',       // dart/arrow shape
];

// Icon IDs for cube face designs
export const CUBE_ICONS = [
  'default',    // classic two eyes
  'cyclops',    // one big eye
  'angry',      // angry eyes
  'robot',      // square visor
  'star',       // star face
  'x_eyes',     // X eyes (dead look)
  'shades',     // sunglasses
  'smile',      // simple smile
];

// Level themes
export const THEMES = {
  1: {
    name: 'Stereo Madness',
    bgTop: '#001444',
    bgBot: '#003C78',
    ground: '#005099',
    groundLine: '#0078C8',
    accent: '#00C8FF',
    player: '#00FF64',
    spike: '#FFFFFF',
    platform: '#0064C8',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  2: {
    name: 'Back on Track',
    bgTop: '#3C0028',
    bgBot: '#780050',
    ground: '#960064',
    groundLine: '#C80078',
    accent: '#FF3296',
    player: '#FF64C8',
    spike: '#FFDCFF',
    platform: '#B40064',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  3: {
    name: 'Polargeist',
    bgTop: '#0A2800',
    bgBot: '#1E6400',
    ground: '#288200',
    groundLine: '#3CB400',
    accent: '#64FF32',
    player: '#C8FF00',
    spike: '#DCFFDC',
    platform: '#329600',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
};
