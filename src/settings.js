/** Game constants and configuration */

export let SCREEN_WIDTH = 1200;
export const SCREEN_HEIGHT = 700;

export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
export const UI_SCALE = IS_MOBILE ? 1.25 : 1;

export function setScreenWidth(w) { SCREEN_WIDTH = w; }
export const FPS = 60;

// Grid
export const GRID = 50; // pixels per grid unit

// Player
export const PLAYER_SIZE = 44;
export const SCROLL_SPEED = 8.4;
export const GRAVITY = 0.87;
export const JUMP_VEL = -14.7;
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
  'rainbow',
  'christmas',
];

export const PLAYER_TRAIL_COLORS = [
  null,       // same as player color
  '#00C8FF', '#FF3296', '#FFD700', '#FF6600',
  '#FF0000', '#AA00FF', '#00FFAA', '#FF69B4', '#FFFFFF',
];

// Trail styles
export const PLAYER_TRAIL_STYLES = ['normal', 'dotted', 'year_flag'];

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
  'heart',      // heart shape (Valentine's secret)
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
  'wink',       // wink face (secret)
  'egg',        // Easter egg face (holiday secret)
  'spooky',     // Halloween face (holiday secret)
];

// Level themes
export const THEMES = {
  1: {
    name: 'Level 1',
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
    name: 'Level 2',
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
    name: 'Level 3',
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
  4: {
    name: 'Level 4',
    bgTop: '#2A1400',
    bgBot: '#5A3000',
    ground: '#704000',
    groundLine: '#FF8800',
    accent: '#FF8800',
    player: '#FFAA44',
    spike: '#FFDDAA',
    platform: '#884400',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  5: {
    name: 'Level 5',
    bgTop: '#0A0028',
    bgBot: '#2A0060',
    ground: '#3A0080',
    groundLine: '#AA44FF',
    accent: '#AA44FF',
    player: '#CC88FF',
    spike: '#EEDDFF',
    platform: '#5500AA',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  6: {
    name: 'Level 6',
    bgTop: '#1A0000',
    bgBot: '#4A0000',
    ground: '#660000',
    groundLine: '#FF2222',
    accent: '#FF2222',
    player: '#FF6644',
    spike: '#FFCCCC',
    platform: '#880000',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  7: {
    name: 'Level 7',
    bgTop: '#001A1A',
    bgBot: '#004040',
    ground: '#006060',
    groundLine: '#00FFCC',
    accent: '#00FFCC',
    player: '#66FFE0',
    spike: '#CCFFEE',
    platform: '#008888',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  8: {
    name: 'Level 8',
    bgTop: '#1A1400',
    bgBot: '#3A2A00',
    ground: '#554400',
    groundLine: '#FFD700',
    accent: '#FFD700',
    player: '#FFEE66',
    spike: '#FFF8DD',
    platform: '#887700',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
  9: {
    name: 'Level 9',
    bgTop: '#0A0018',
    bgBot: '#1A0038',
    ground: '#280050',
    groundLine: '#8844FF',
    accent: '#8844FF',
    player: '#AA88FF',
    spike: '#DDCCFF',
    platform: '#4400AA',
    portalGravity: '#FFD700',
    portalSpeed: '#FF6600',
  },
};
