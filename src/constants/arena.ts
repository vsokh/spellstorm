/** Dev toggle: skip the level-up upgrade screen and hide the shop.
 *  Set to `false` to restore normal augment/shop flow. */
export const DEV_DISABLE_AUGMENTS = true;

/** Room dimensions in world pixels */
export const ROOM_WIDTH = 1000;
export const ROOM_HEIGHT = 700;

/** Wizard defaults */
export const WIZARD_SIZE = 13;
export const WIZARD_HP = 8;
export const MAX_MANA = 100;
export const MANA_REGEN = 14;
export const DEFAULT_MOVE_SPEED = 190;

/** Door width in pixels */
export const DOOR_WIDTH = 60;

/** Dungeon grid size */
export const DUNGEON_GRID_SIZE = 5;

/** Tick rates */
export const SIM_TICK_RATE = 60;
export const NET_TICK_RATE = 20;
export const NET_SEND_INTERVAL = 1 / NET_TICK_RATE;
export const NET_SEND_INTERVAL_MIN = 0.033;
export const NET_SEND_INTERVAL_MAX = 0.15;

export const NET_CULL_RADIUS = 1200;
export const NET_LOD_RADIUS = 600;

export const COUNTDOWN_DURATION = 3;

export const GRID_SPACING = 40;
export const WALL_THICKNESS = 8;

export const MIN_PILLARS = 3;
export const MAX_EXTRA_PILLARS = 3;
export const PILLAR_MARGIN = 80;
export const PILLAR_MIN_RADIUS = 18;
export const PILLAR_MAX_EXTRA_RADIUS = 10;
export const PILLAR_CENTER_EXCLUSION = 80;
export const PILLAR_SPAWN_TRIES = 20;

export const RESPAWN_DELAY_MS = 3000;
export const GAME_OVER_DELAY_MS = 1500;
export const DEFAULT_LIVES = 3;

export const MINIMAP_CELL_SIZE = 16;
