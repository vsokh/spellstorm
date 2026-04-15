import {
  ClassDefInput,
  EnemyAI,
  EnemyDef,
  SpellType,
  UpgradeDef,
  Player,
} from './types';

// ═══════════════════════════════════
//          GAME CONSTANTS
// ═══════════════════════════════════

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
export const SIM_TICK_RATE = 60;          // simulation runs at 60 FPS (via requestAnimationFrame)
export const NET_TICK_RATE = 20;          // network state broadcast rate in Hz
export const NET_SEND_INTERVAL = 1 / NET_TICK_RATE;  // 0.05s = 50ms between net ticks
/** Minimum network send interval (fastest rate during ideal conditions) */
export const NET_SEND_INTERVAL_MIN = 0.033;
/** Maximum network send interval (slowest rate during congestion) */
export const NET_SEND_INTERVAL_MAX = 0.15;

/** Distance from guest player beyond which entities are not sent */
export const NET_CULL_RADIUS = 1200;
/** Distance from guest player beyond which entities use reduced detail */
export const NET_LOD_RADIUS = 600;

/** Countdown duration in seconds */
export const COUNTDOWN_DURATION = 3;

/** Room grid spacing for drawing */
export const GRID_SPACING = 40;

/** Wall thickness */
export const WALL_THICKNESS = 8;

/** Pillar count range for combat/boss rooms */
export const MIN_PILLARS = 3;
export const MAX_EXTRA_PILLARS = 3;

/** Pillar spawn margin from room edges */
export const PILLAR_MARGIN = 80;
export const PILLAR_MIN_RADIUS = 18;
export const PILLAR_MAX_EXTRA_RADIUS = 10;
/** Minimum distance from room center for pillar spawn */
export const PILLAR_CENTER_EXCLUSION = 80;
export const PILLAR_SPAWN_TRIES = 20;

/** Respawn delay after death (when ally alive), in ms */
export const RESPAWN_DELAY_MS = 3000;
/** Game over delay after all players die, in ms */
export const GAME_OVER_DELAY_MS = 1500;
/** Default number of lives per match */
export const DEFAULT_LIVES = 3;

/** Minimum cooldown floors — prevent stacking from reaching absurd fire rates */
export const CD_FLOOR_PRIMARY = 0.12;
export const CD_FLOOR_SECONDARY = 1.0;
export const CD_FLOOR_Q = 2.0;
export const CD_FLOORS = [CD_FLOOR_PRIMARY, CD_FLOOR_SECONDARY, CD_FLOOR_Q, 0];

/** Fixed run length — 20 waves with a finale boss */
export const MAX_WAVES = 20;

/** Number of normal (non-cursed) upgrade choices per wave tier */
export function upgradeChoiceCount(wave: number): number {
  if (wave >= 12) return 4;
  return 3;
}

/** Health drop chance on enemy kill */
export const HEALTH_DROP_CHANCE = 0.18;

/** Health pickup healing scales with wave progression */
export function healthPickupAmount(wave: number): number {
  if (wave >= 15) return 4;
  if (wave >= 8) return 3;
  return 2;
}

/** Health drop chance scales in late game */
export function scaledHealthDropChance(wave: number): number {
  const base = 0.18;
  if (wave <= 10) return base;
  return base + (wave - 10) * 0.01; // wave 15 = 0.23, wave 20 = 0.28
}

/** Player gains +1 max HP every 3 levels */
export const HP_LEVEL_INTERVAL = 3;

/** XP system constants */
export const XP_BASE_THRESHOLD = 28;
/** XP stepped-linear tier config: [maxLevel, xpIncrement] */
export const XP_STEPS: [number, number][] = [
  [5, 22],   // levels 1-5: +22 per level
  [10, 28],  // levels 6-10: +28 per level
  [15, 38],  // levels 11-15: +38 per level
  [Infinity, 50], // levels 16+: +50 per level
];
/** Get the XP increment for a given level (stepped linear) */
export function getXpStep(level: number): number {
  for (const [maxLvl, step] of XP_STEPS) {
    if (level <= maxLvl) return step;
  }
  return XP_STEPS[XP_STEPS.length - 1][1];
}


/** Bonus gold per kill scales with wave progression */
export function goldDropBonus(wave: number): number {
  if (wave >= 15) return 3;  // Late game: +3 bonus gold
  if (wave >= 8) return 2;   // Mid game: +2 bonus gold
  if (wave >= 4) return 1;   // Early-mid: +1 bonus gold
  return 0;                   // Waves 1-3: no bonus
}

/** Gold reward for clearing a wave */
export function waveClearGold(wave: number): number {
  const base = 5 + wave * 3;  // Wave 1: 8g, Wave 10: 35g, Wave 20: 65g
  return Math.round(base);
}

/** Shop item definitions */
export interface ShopItemDef {
  id: string;
  name: string;
  desc: string;
  basePrice: number;
  priceIncrease: number; // price goes up by this each purchase
  maxBuys: number;       // 0 = unlimited
  color: string;
}

export const SHOP_ITEMS: ShopItemDef[] = [
  { id: 'heal', name: 'Health Potion', desc: 'Restore 3 HP', basePrice: 8, priceIncrease: 2, maxBuys: 0, color: '#44cc55' },
  { id: 'maxhp', name: 'Vitality Charm', desc: '+2 Max HP', basePrice: 30, priceIncrease: 15, maxBuys: 5, color: '#cc4444' },
  { id: 'dmgboost', name: 'Power Shard', desc: '+1 spell damage (this wave)', basePrice: 15, priceIncrease: 5, maxBuys: 0, color: '#cc8833' },
  { id: 'shield', name: 'Ward Stone', desc: 'Block next 2 hits', basePrice: 20, priceIncrease: 5, maxBuys: 0, color: '#4488cc' },
  { id: 'speed', name: 'Swift Boots', desc: '+15% move speed (permanent)', basePrice: 25, priceIncrease: 20, maxBuys: 3, color: '#88cc44' },
];

/** Minimap cell size */
export const MINIMAP_CELL_SIZE = 16;

// ═══════════════════════════════════
//        COMBAT BALANCE
// ═══════════════════════════════════

export const COMBAT = {
  FURY_DAMAGE_MULT: 1.5,
  MOMENTUM_CAP: 0.2,
  MOMENTUM_DIVISOR: 1000,
  ULT_CHARGE_HIT: 3,
  ULT_CHARGE_KILL: 8,
  ULT_THRESHOLD: 100,
  ULT_THRESHOLD_OVERFLOW: 200,
  KNOCKBACK_FORCE: 300,
  SPLITTER_DMG_MULT: 0.5,
  SPLITTER_ANGLE: 0.8,
  CHAIN_DMG_MULT: 0.5,
  BULWARK_DMG_MULT: 0.75,
  ARCANIST_ECHO_CHANCE: 0.25,
  COMBO_STUN_DURATION: 0.5,
  WARLOCK_MANA_REFUND: 0.3,
  THORNS_PARTICLE_LIFE: 0.3,
  MONK_DODGE_CHANCE: 0.25,
  SPLIT_SHOT_SIDE_DAMAGE_MULT: 0.6,
  DAMAGE_CAP: 8,
  BOSS_DMG_REDUCTION_MULT: 0.5,       // 50% damage during phase
  BOSS_DMG_REDUCTION_DURATION: 3,     // 3 seconds
  BOSS_DMG_REDUCTION_HP_THRESHOLD: 0.5, // triggers at 50% HP
  BOSS_DMG_REDUCTION_MIN_WAVE: 15,    // only wave 15+ bosses
  BONUS_DMG_SOFT_CAP_THRESHOLD: 8,
  BONUS_DMG_SOFT_CAP_KNEE: 6,
  BLOODLUST_SPEED_CAP: 1.0,    // max +100% attack speed (20 kills × 5%)
  BLOODLUST_CRIT_CAP: 0.15,    // max +15% crit chance overflow
  // Elite enemies (wave 13+)
  ELITE_WAVE_THRESHOLD: 13,       // wave where elites start appearing
  ELITE_WAVE2_THRESHOLD: 17,      // wave where elite chance increases
  ELITE_CHANCE: 0.1,              // 10% chance at wave 13+
  ELITE_CHANCE_WAVE2: 0.2,        // 20% chance at wave 17+
  ELITE_HP_MULT: 2.5,             // 2.5x HP
  ELITE_DMG_MULT: 1.3,            // 1.3x damage
  ELITE_XP_MULT: 2,               // 2x XP on death
} as const;

export const TIMING = {
  // iframes
  IFRAME_DASH: 0.2,
  IFRAME_SPLIT: 0.3,
  IFRAME_BLOCK: 0.3,
  IFRAME_DAMAGE: 0.4,
  IFRAME_RESPAWN: 1.5,
  IFRAME_MONK_ULT: 0.8,
  IFRAME_SHIELD_WALL: 1.5,
  IFRAME_ENEMY_HIT: 0.1,
  IFRAME_BLINK: 0.3,
  IFRAME_LEAP: 0.3,
  IFRAME_LIVES_RESPAWN: 3.0,
  // animations
  DEATH_TIMER: 0.4,
  HIT_FLASH: 0.3,
  FLASH_SCREEN: 0.3,
  FLASH_SCREEN_BOSS: 0.2,
  FLASH_SCREEN_ULT: 0.3,
  ANIM_CAST: 0.25,
  ANIM_ATTACK: 0.8,
  ANIM_ATTACK_WIND: 0.2,
  ANIM_ULT: 0.8,             // duration of class-specific ultimate animation
  // tick rates & delays
  ZONE_TICK: 0.5,
  BURN_TICK: 0.5,
  AURA_HEAL_TICK: 0.5,
  METEOR_DELAY_STEP: 0.25,
  BEAM_LIFE: 0.25,
  SPELL_DEFAULT_DELAY: 0.5,
  STUN_DURATION: 0.5,
  FREEZE_DURATION: 1.5,
  STORM_SHIELD_TIME: 1.0,
  // particles
  PARTICLE_LIFE_SHORT: 0.3,
  PARTICLE_LIFE_MEDIUM: 0.5,
  PARTICLE_LIFE_LONG: 0.8,
  HIT_PARTICLE_SCALE: 0.5,
  SPAWN_PARTICLE_SCALE: 1.5,
} as const;

export const ULTIMATE = {
  TIME_STOP_DURATION: 3,
  TIME_STOP_SPEED_MULT: 1.5,
  BLOOD_RAGE_DURATION: 5,
  BLOOD_RAGE_DMG_MULT: 2,
  PALADIN_HEAL_FRACTION: 0.75,
  DOOM_DMG_FRACTION: 0.35,
  MONK_CONE_ANGLE: 0.8,
  MONK_KNOCKBACK: 30,
  RANGER_SPREAD_BASE: 0.4,
  RANGER_SPREAD_STEP: 0.05,
  RANGER_ARROW_LIFE: 1.0,
  RANGER_ARROW_PIERCE: 2,
  DRUID_SPAWN_DIST: 120,
  DRUID_ZONE_SLOW: 0.5,
  DRUID_ZONE_TICK: 0.5,
  DRUID_TREANT_ANGLE: 0.5,
  DRUID_TREANT_LIFE: 10,
  TURRET_LIFE: 12,
  TURRET_RADIUS: 100,
  SHOCKWAVE_RADIUS: 120,
  HEAL_FRACTION: 0.5,
  CHAIN_TARGETS: 7,
  CHAIN_RANGE: 200,
  CHAIN_DMG_MULT: 3,
  CHAIN_BEAM_LIFE: 0.3,
  CHAIN_PARTICLE_SCALE: 0.4,
  CHAIN_DELAY_STEP: 80,
  HOMING_MISSILE_LIFE: 2.5,
  HOMING_FACTOR: 3,
  ARCANE_STORM_TIMEOUT: 50,
  METEOR_DELAY: 0.3,
  BURN_ZONE_LINGER: 300,
  BURN_ZONE_TICK: 0.5,
  GRAVITY_PULL_RANGE: 200,
  GRAVITY_PULL_DMG: 4,
  GRAVITY_SLOW_DURATION: 3,
  THOUSAND_CUTS_HITS: 12,
  THOUSAND_CUTS_DMG: 2,
  MEGA_CONSTRUCT_RADIUS: 130,
  MEGA_CONSTRUCT_DURATION: 15,
  MEGA_CONSTRUCT_DMG: 2,
  HEXSTORM_STACKS: 3,
  HEXSTORM_EXPLOSION_DMG: 4,
  UNBREAKABLE_DURATION: 5,
  UNBREAKABLE_DR: 0.8,
  ARTILLERY_SHELLS: 6,
  ARTILLERY_DMG: 5,
  ARTILLERY_RADIUS: 70,
  SOUL_STORM_RADIUS: 200,
  SOUL_STORM_DMG: 3,
  CONVERGENCE_RADIUS: 90,
  CONVERGENCE_DURATION: 4,
  CONVERGENCE_DMG: 2,
  TSUNAMI_RADIUS: 300,
  TSUNAMI_DMG: 4,
  TSUNAMI_PUSH: 150,
  TSUNAMI_SLOW: 2,
  VOID_RIFT_RADIUS: 160,
  VOID_RIFT_DURATION: 5,
  VOID_RIFT_DMG: 3,
} as const;

export const RANGES = {
  AURA: 120,
  CHAIN: 120,
  CHAIN_ULT: 200,
  DASH_DISTANCE: 120,
  SHOCKWAVE: 120,
  STORM_SHIELD: 120,
  MAGNET_PULL: 300,
} as const;

export const ENEMY_AI = {
  ENRAGE_MULT: 1.5,
  KITING_SLOW: 0.8,
  BACK_AWAY_SLOW: 0.6,
  SLOW_MULT: 0.4,
  TRAIL_SPAWN_CHANCE: 0.5,
} as const;

export const DUNGEON_TIMING = {
  REWIND_SNAPSHOT_INTERVAL: 3,
  WAVE_SPAWN_TIMER: 1.5,
  TRICKLE_SPEED_SCALE: 0.02,
  BOSS_MINION_SPAWN_DURATION: 10,
} as const;

export const MAX_PARTICLES = 200;
export const MAX_SHOCKWAVES = 50;
export const MAX_FLOATING_TEXTS = 50;
export const MAX_TRAILS = 300;
export const MAX_SPELLS = 128;
export const MAX_EPROJ = 64;
export const MAX_ZONES = 32;
export const MAX_AOE_MARKERS = 32;
export const MAX_BEAMS = 64;

export const WAVE_PHYSICS = {
  BOOMERANG_RETURN: 0.5,
  MAX_BOUNCES: 3,
  TRAIL_CHANCE: 0.3,
  TRAIL_PARTICLE_SCALE: 0.5,
  CHAIN_RANGE: 120,
  FROZEN_TOUCH_CHANCE: 0.25,
  EXPLOSION_SHOCKWAVE_SCALE: 0.7,
  EXPLOSION_PARTICLE_SCALE: 1.5,
  MAGIC_EXPLOSION_SHOCKWAVE: 0.8,
  HIT_PARTICLE_LIFE: 0.3,
  ZONE_HIT_PARTICLE_LIFE: 0.6,
  SPLIT_SHOT_ANGLE: 0.26,
  SLOW_MOVE_MULT: 0.5,
} as const;

// ═══════════════════════════════════
//        WIZARD CLASSES
// ═══════════════════════════════════

export const CLASSES: Record<string, ClassDefInput> = {
  pyromancer: {
    name: 'Pyromancer', color: '#ff6633', glow: '#ff4400',
    desc: 'Fire mastery. High burst damage.',
    hp: 7, moveSpeed: 185, maxMana: 100, manaRegen: 14,
    passive: { name: 'Ignite', desc: 'Enemies hit burn for 4 dmg over 2s' },
    spells: [
      { name: 'Fireball', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 400, radius: 10, mana: 10, cd: 0.35, life: 1.2, explode: 50, color: '#ff6633', trail: '#ff3300', burn: 2 },
      { name: 'Flame Wave', key: 'RMB', type: SpellType.Cone, dmg: 2, range: 110, mana: 22, cd: 2.5, angle: 0.8, color: '#ff4400' },
      { name: 'Meteor', key: 'Q', type: SpellType.AoeDelayed, dmg: 4, mana: 32, cd: 7, delay: 0.8, radius: 75, color: '#ff2200' },
      { name: 'Inferno', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#ff2200', mana: 0, cd: 0 },
    ],
  },
  cryomancer: {
    name: 'Cryomancer', color: '#44bbff', glow: '#2288dd',
    desc: 'Ice magic. Crowd control.',
    hp: 7, moveSpeed: 185, maxMana: 100, manaRegen: 14,
    passive: { name: 'Frostbite', desc: 'Slowed enemies take +1 damage' },
    spells: [
      { name: 'Frost Ray', key: 'LMB', type: SpellType.Beam, dmg: 1.2, range: 250, mana: 6, cd: 0.2, width: 4, slow: 1.0, color: '#88ddff', trail: '#44aadd' },
      { name: 'Freeze Breath', key: 'RMB', type: SpellType.Cone, dmg: 2, range: 120, mana: 22, cd: 3.5, angle: 0.7, slow: 1.5, color: '#88ddff' },
      { name: 'Blizzard', key: 'Q', type: SpellType.Zone, dmg: 1, mana: 28, cd: 8, radius: 90, duration: 4, tickRate: 0.7, slow: 0.8, color: '#2288dd' },
      { name: 'Absolute Zero', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#2288dd', mana: 0, cd: 0 },
    ],
  },
  stormcaller: {
    name: 'Stormcaller', color: '#bb66ff', glow: '#9944dd',
    desc: 'Lightning. Instant strikes.',
    hp: 7, moveSpeed: 190, maxMana: 100, manaRegen: 14,
    passive: { name: 'Static', desc: 'Every 4th hit stuns the target for 0.5s' },
    spells: [
      { name: 'Lightning', key: 'LMB', type: SpellType.Beam, dmg: 2, range: 320, mana: 7, cd: 0.28, width: 3, color: '#cc88ff', trail: '#aa55ff' },
      { name: 'Ball Zap', key: 'RMB', type: SpellType.Projectile, dmg: 2, speed: 140, radius: 16, mana: 18, cd: 3, life: 3.5, zap: 75, zapRate: 0.45, color: '#bb66ff', trail: '#9944dd' },
      { name: 'Thunder', key: 'Q', type: SpellType.AoeDelayed, dmg: 3, mana: 28, cd: 7, delay: 0.5, radius: 65, stun: 1, color: '#ffcc44' },
      { name: 'Storm Fury', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#ffcc44', mana: 0, cd: 0 },
    ],
  },
  arcanist: {
    name: 'Arcanist', color: '#ff55aa', glow: '#dd3388',
    desc: 'Arcane arts. Mobility & homing.',
    hp: 7, moveSpeed: 195, maxMana: 90, manaRegen: 13,
    passive: { name: 'Arcane Echo', desc: 'Hits have 25% chance to echo your primary attack' },
    spells: [
      { name: 'Arcane Bolt', key: 'LMB', type: SpellType.Homing, dmg: 1.5, speed: 300, radius: 8, mana: 7, cd: 0.28, life: 2, homing: 2.5, color: '#ff55aa', trail: '#dd3388' },
      { name: 'Blink', key: 'RMB', type: SpellType.Blink, range: 170, mana: 18, cd: 2.5, color: '#ff88cc' },
      { name: 'Barrage', key: 'Q', type: SpellType.Barrage, dmg: 1, speed: 380, radius: 7, mana: 35, cd: 7, count: 7, spread: 0.4, life: 1.2, color: '#ff55aa', trail: '#cc2277' },
      { name: 'Arcane Storm', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#ff55aa', mana: 0, cd: 0 },
    ],
  },
  necromancer: {
    name: 'Necromancer', color: '#55cc55', glow: '#228822',
    desc: 'Death magic. Drains life.',
    hp: 8, moveSpeed: 180, maxMana: 100, manaRegen: 14,
    passive: { name: 'Soul Harvest', desc: 'Kills heal 1 HP' },
    spells: [
      { name: 'Soul Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 1.5, speed: 360, radius: 9, mana: 8, cd: 0.35, life: 1.2, color: '#55cc55', trail: '#228822', drain: 1 },
      { name: 'Death Coil', key: 'RMB', type: SpellType.Homing, dmg: 3, speed: 280, radius: 10, mana: 28, cd: 4, life: 2.5, homing: 3.5, drain: 2, color: '#44aa44', trail: '#228822' },
      { name: 'Plague', key: 'Q', type: SpellType.Zone, dmg: 1, mana: 32, cd: 8, radius: 80, duration: 4, tickRate: 0.8, slow: 0.3, color: '#338833' },
      { name: 'Army of Dead', key: 'Space', type: SpellType.Ultimate, ultCharge: 110, color: '#228822', mana: 0, cd: 0 },
    ],
  },
  chronomancer: {
    name: 'Chronomancer', color: '#ffcc44', glow: '#cc9922',
    desc: 'Time magic. Haste & slow.',
    hp: 6, moveSpeed: 195, maxMana: 110, manaRegen: 16,
    passive: { name: 'Haste Aura', desc: '+15% move speed for nearby ally' },
    spells: [
      { name: 'Time Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 480, radius: 8, mana: 8, cd: 0.35, life: 1, stun: 0.3, color: '#ffcc44', trail: '#cc9922' },
      { name: 'Temporal Field', key: 'RMB', type: SpellType.Zone, dmg: 0, mana: 22, cd: 4, radius: 70, duration: 3.5, tickRate: 0.5, slow: 2.5, stun: 0.3, color: '#ffdd66' },
      { name: 'Rewind', key: 'Q', type: SpellType.Rewind, mana: 36, cd: 12, color: '#ffcc44' },
      { name: 'Time Stop', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#ffdd66', mana: 0, cd: 0 },
    ],
  },
  knight: {
    name: 'Knight', color: '#aabbcc', glow: '#778899',
    desc: 'Tank. Absorbs damage, protects ally.',
    hp: 12, moveSpeed: 170, maxMana: 80, manaRegen: 12,
    passive: { name: 'Bulwark', desc: 'Take 25% less damage' },
    spells: [
      { name: 'Shield Throw', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 350, radius: 10, mana: 4, cd: 0.4, life: 0.8, color: '#ccddee', trail: '#8899aa', pierce: 1 },
      { name: 'Shield Rush', key: 'RMB', type: SpellType.Leap, range: 100, mana: 15, cd: 2, dmg: 3, aoeR: 60, stun: 1.5, color: '#8899aa' },
      { name: 'Charge', key: 'Q', type: SpellType.Blink, range: 200, mana: 20, cd: 3.5, color: '#aabbcc' },
      { name: 'Shield Wall', key: 'Space', type: SpellType.Ultimate, ultCharge: 120, color: '#ccddee', mana: 0, cd: 0 },
    ],
  },
  berserker: {
    name: 'Berserker', color: '#ff4444', glow: '#cc2222',
    desc: 'Melee DPS. The lower the HP, the stronger.',
    hp: 12, moveSpeed: 200, maxMana: 70, manaRegen: 10,
    passive: { name: 'Fury', desc: 'Below 50% HP: +50% damage and speed' },
    spells: [
      { name: 'Axe Swing', key: 'LMB', type: SpellType.Cone, dmg: 3, range: 50, mana: 2, cd: 0.35, angle: 1.5, color: '#ff6644' },
      { name: 'Throwing Axe', key: 'RMB', type: SpellType.Projectile, dmg: 3, speed: 500, radius: 10, mana: 8, cd: 0.8, life: 1.2, color: '#ff4444', trail: '#cc2222' },
      { name: 'Leap Slam', key: 'Q', type: SpellType.Leap, range: 180, mana: 20, cd: 3.5, dmg: 3, aoeR: 60, color: '#ff3322' },
      { name: 'Blood Rage', key: 'Space', type: SpellType.Ultimate, ultCharge: 80, color: '#ff2222', mana: 0, cd: 0 },
    ],
  },
  paladin: {
    name: 'Paladin', color: '#ffddaa', glow: '#ccaa66',
    desc: 'Support. Heals ally, smites undead.',
    hp: 10, moveSpeed: 180, maxMana: 120, manaRegen: 16,
    passive: { name: 'Aura of Light', desc: 'Nearby ally regens 2 HP/s' },
    spells: [
      { name: 'Smite', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 380, radius: 9, mana: 7, cd: 0.35, life: 1.2, color: '#ffddaa', trail: '#ccaa66', explode: 25 },
      { name: 'Holy Shield', key: 'RMB', type: SpellType.AllyShield, mana: 25, cd: 5, duration: 3, color: '#ffffcc' },
      { name: 'Consecrate', key: 'Q', type: SpellType.Zone, dmg: 2, mana: 24, cd: 7, radius: 100, duration: 3, tickRate: 0.6, slow: 0.3, color: '#ffeeaa', heal: 2 },
      { name: 'Holy Light', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#ffffcc', mana: 0, cd: 0 },
    ],
  },
  ranger: {
    name: 'Ranger', color: '#88cc44', glow: '#668833',
    desc: 'Ranged DPS. Fast attacks, high mobility.',
    hp: 6, moveSpeed: 200, maxMana: 90, manaRegen: 14,
    passive: { name: 'Eagle Eye', desc: 'Primary range +40%, crits at max range' },
    spells: [
      { name: 'Arrow', key: 'LMB', type: SpellType.Projectile, dmg: 1.0, speed: 600, radius: 5, mana: 4, cd: 0.25, life: 1.8, pierce: 2, color: '#88cc44', trail: '#668833' },
      { name: 'Volley', key: 'RMB', type: SpellType.Barrage, dmg: 1, speed: 500, radius: 5, mana: 18, cd: 2.5, count: 4, spread: 0.6, life: 1, color: '#88cc44', trail: '#556622' },
      { name: 'Trap', key: 'Q', type: SpellType.Trap, mana: 15, cd: 4, dmg: 3, radius: 50, slow: 2, color: '#aadd55' },
      { name: 'Arrow Rain', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#88cc44', mana: 0, cd: 0 },
    ],
  },
  druid: {
    name: 'Druid', color: '#44aa33', glow: '#337722',
    desc: 'Nature magic. Summons + heals.',
    hp: 9, moveSpeed: 185, maxMana: 100, manaRegen: 14,
    passive: { name: 'Regrowth', desc: 'Regen 1 HP every 7 seconds' },
    spells: [
      { name: 'Thorn Swipe', key: 'LMB', type: SpellType.Cone, dmg: 1.5, range: 80, mana: 4, cd: 0.32, angle: 1.0, slow: 0.4, color: '#44aa33' },
      { name: 'Entangle', key: 'RMB', type: SpellType.Zone, dmg: 0, mana: 20, cd: 5, radius: 60, duration: 2, tickRate: 0.5, stun: 2, color: '#66bb44' },
      { name: 'Spirit Wolf', key: 'Q', type: SpellType.Ultimate, ultCharge: 0, mana: 30, cd: 10, color: '#88aa55' },
      { name: "Nature's Wrath", key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#33aa22', mana: 0, cd: 0 },
    ],
  },
  warlock: {
    name: 'Warlock', color: '#8833aa', glow: '#662288',
    desc: 'Dark magic. High risk, high reward.',
    hp: 6, moveSpeed: 175, maxMana: 120, manaRegen: 18,
    passive: { name: 'Dark Pact', desc: 'Casting refunds 30% mana but costs 1 HP' },
    spells: [
      { name: 'Shadow Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 3, speed: 260, radius: 10, mana: 10, cd: 0.5, life: 1.5, color: '#8833aa', trail: '#662288' },
      { name: 'Drain Life', key: 'RMB', type: SpellType.Beam, dmg: 2, range: 200, mana: 18, cd: 1, width: 4, drain: 2, color: '#aa44cc' },
      { name: 'Summon Imp', key: 'Q', type: SpellType.Ultimate, ultCharge: 0, mana: 25, cd: 8, color: '#cc4466' },
      { name: 'Doom', key: 'Space', type: SpellType.Ultimate, ultCharge: 90, color: '#662288', mana: 0, cd: 0 },
    ],
  },
  monk: {
    name: 'Monk', color: '#eedd88', glow: '#ccaa44',
    desc: 'Martial arts. Fast melee + dodging.',
    hp: 7, moveSpeed: 210, maxMana: 80, manaRegen: 12,
    passive: { name: 'Inner Peace', desc: '25% chance to dodge attacks' },
    spells: [
      { name: 'Chi Blast', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 500, radius: 8, mana: 3, cd: 0.15, life: 0.5, color: '#eedd88', trail: '#ccaa44' },
      { name: 'Flying Kick', key: 'RMB', type: SpellType.Leap, range: 180, mana: 12, cd: 2, dmg: 4, aoeR: 55, color: '#ccaa44' },
      { name: 'Chi Burst', key: 'Q', type: SpellType.Zone, dmg: 0, mana: 15, cd: 6, radius: 40, duration: 3, tickRate: 0.8, heal: 2, color: '#ffffcc' },
      { name: 'Thousand Fists', key: 'Space', type: SpellType.Ultimate, ultCharge: 80, color: '#eedd88', mana: 0, cd: 0 },
    ],
  },
  engineer: {
    name: 'Engineer', color: '#dd8833', glow: '#aa6622',
    desc: 'Builds turrets and gadgets.',
    hp: 9, moveSpeed: 175, maxMana: 100, manaRegen: 14,
    passive: { name: 'Overclock', desc: 'Turrets fire 20% faster' },
    spells: [
      { name: 'Wrench Throw', key: 'LMB', type: SpellType.Projectile, dmg: 1.5, speed: 350, radius: 7, mana: 5, cd: 0.3, life: 1.0, color: '#dd8833', trail: '#aa6622', homing: 1.0 },
      { name: 'Deploy Turret', key: 'RMB', type: SpellType.Zone, dmg: 1, mana: 25, cd: 6, radius: 120, duration: 15, tickRate: 0.8, color: '#cc7722' },
      { name: 'Mine Field', key: 'Q', type: SpellType.Trap, mana: 20, cd: 5, dmg: 4, radius: 45, count: 3, spread: 0.8, color: '#ffaa33' },
      { name: 'Mega Turret', key: 'Space', type: SpellType.Ultimate, ultCharge: 120, color: '#dd8833', mana: 0, cd: 0 },
    ],
  },
  graviturge: {
    name: 'Graviturge', color: '#6644aa', glow: '#4422aa',
    desc: 'Gravity magic. Proximity aura + sustain.',
    passive: { name: 'Gravity Well', desc: 'Enemies within 80 units take 0.5 dps; each nearby enemy grants +1 mana/s' },
    spells: [
      { name: 'Gravity Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 1.5, speed: 280, radius: 10, mana: 6, cd: 0.32, life: 0.8, slow: 0.5, color: '#6644aa', trail: '#4422aa' },
      { name: 'Singularity', key: 'RMB', type: SpellType.Zone, dmg: 1.5, mana: 22, cd: 5, radius: 80, duration: 4, tickRate: 0.6, slow: 0.8, color: '#5533aa' },
      { name: 'Collapse', key: 'Q', type: SpellType.Nova, dmg: 3, mana: 35, cd: 8, range: 120, stun: 1.0, color: '#7755cc' },
      { name: 'Gravitational Ruin', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#4422aa', mana: 0, cd: 0 },
    ],
  },
  bladecaller: {
    name: 'Bladecaller', color: '#cc3355', glow: '#aa2244',
    desc: 'Blade dancer. Kill-chain mobility.',
    passive: { name: 'Kill Rush', desc: 'Kills within 1.5s of Shadow Step reset its cooldown; kills grant +10% speed for 3s' },
    spells: [
      { name: 'Blade Slash', key: 'LMB', type: SpellType.Cone, dmg: 2.5, range: 55, mana: 3, cd: 0.3, angle: 1.2, color: '#cc3355' },
      { name: 'Shadow Step', key: 'RMB', type: SpellType.Leap, range: 140, mana: 12, cd: 2.5, dmg: 2, aoeR: 45, color: '#aa2244' },
      { name: 'Blade Toss', key: 'Q', type: SpellType.Barrage, dmg: 1.5, speed: 450, radius: 6, mana: 20, cd: 6, count: 5, spread: 0.5, life: 0.8, color: '#cc3355', trail: '#881133' },
      { name: 'Thousand Cuts', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#aa2244', mana: 0, cd: 0 },
    ],
  },
  architect: {
    name: 'Architect', color: '#44aacc', glow: '#228899',
    desc: 'Zone control. Constructs + fortification.',
    passive: { name: 'Fortification', desc: 'Take 20% less damage and +1 mana/s while near own zones' },
    spells: [
      { name: 'Arcane Bolt', key: 'LMB', type: SpellType.Homing, dmg: 1.5, speed: 320, radius: 7, mana: 5, cd: 0.28, life: 1.5, homing: 2.0, color: '#44aacc', trail: '#228899' },
      { name: 'Deploy Construct', key: 'RMB', type: SpellType.Zone, dmg: 1, mana: 24, cd: 6, radius: 100, duration: 12, tickRate: 0.9, slow: 0.3, color: '#339dbb' },
      { name: 'Scatter Mines', key: 'Q', type: SpellType.Trap, mana: 25, cd: 7, dmg: 3, radius: 40, count: 4, spread: 1.0, slow: 1.5, color: '#55ccdd' },
      { name: 'Mega Construct', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#228899', mana: 0, cd: 0 },
    ],
  },
  hexblade: {
    name: 'Hexblade', color: '#7755cc', glow: '#5533aa',
    desc: 'Curse mage. Mark and detonate.',
    passive: { name: 'Hex Mastery', desc: 'Hex-marked enemies take 25% more damage from all sources; 3 stacks also slows 30%' },
    spells: [
      { name: 'Hex Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 1.5, speed: 380, radius: 8, mana: 7, cd: 0.3, life: 1.2, slow: 0.3, color: '#7755cc', trail: '#5533aa' },
      { name: 'Doom Mark', key: 'RMB', type: SpellType.Homing, dmg: 2, speed: 250, radius: 12, mana: 20, cd: 3, life: 2.5, homing: 3.0, color: '#9966dd', trail: '#5533aa' },
      { name: 'Hex Blast', key: 'Q', type: SpellType.AoeDelayed, dmg: 3, mana: 30, cd: 7, delay: 0.6, radius: 85, stun: 0.8, color: '#6644bb' },
      { name: 'Hexstorm', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#5533aa', mana: 0, cd: 0 },
    ],
  },
  warden: {
    name: 'Warden', color: '#5588aa', glow: '#336688',
    desc: 'Shield tank. Body-blocks for allies.',
    passive: { name: 'Sentinel', desc: 'Take 20% less damage from enemies you face; melee attackers are marked for +1 ally damage' },
    spells: [
      { name: 'Guardian Strike', key: 'LMB', type: SpellType.Cone, dmg: 2.5, range: 60, mana: 4, cd: 0.4, angle: 1.0, color: '#5588aa' },
      { name: 'Bastion', key: 'RMB', type: SpellType.Zone, dmg: 0, mana: 20, cd: 5, radius: 70, duration: 3.5, tickRate: 0.5, slow: 0.5, color: '#6699bb' },
      { name: 'Aegis Link', key: 'Q', type: SpellType.AllyShield, mana: 25, cd: 8, duration: 4, color: '#88bbdd' },
      { name: 'Unbreakable', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#336688', mana: 0, cd: 0 },
    ],
  },
  cannoneer: {
    name: 'Cannoneer', color: '#aa7733', glow: '#885522',
    desc: 'Artillery. Slow power shots, long range.',
    hp: 9, moveSpeed: 170, maxMana: 90, manaRegen: 12,
    passive: { name: 'Heavy Caliber', desc: 'Every 4th shot deals 2x damage with double explosion radius' },
    spells: [
      { name: 'Power Shot', key: 'LMB', type: SpellType.Projectile, dmg: 3, speed: 500, radius: 11, mana: 10, cd: 0.5, life: 1.5, explode: 40, pierce: 1, color: '#aa7733', trail: '#885522' },
      { name: 'Concussive Shell', key: 'RMB', type: SpellType.AoeDelayed, dmg: 2, mana: 18, cd: 3.5, delay: 0.4, radius: 60, stun: 0.8, color: '#cc9944' },
      { name: 'Caltrops', key: 'Q', type: SpellType.Trap, mana: 15, cd: 5, dmg: 2, radius: 55, slow: 2.5, count: 2, spread: 0.6, color: '#ddaa55' },
      { name: 'Artillery Barrage', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#885522', mana: 0, cd: 0 },
    ],
  },
  soulbinder: {
    name: 'Soulbinder', color: '#55aa88', glow: '#338866',
    desc: 'Soul mage. Marks + ally empowerment.',
    hp: 7, moveSpeed: 185, maxMana: 110, manaRegen: 15,
    passive: { name: 'Soul Bond', desc: 'LMB marks enemies for 4s; allies deal +1 damage and heal 0.5 HP on marked kills' },
    spells: [
      { name: 'Soul Lash', key: 'LMB', type: SpellType.Beam, dmg: 1.5, range: 220, mana: 6, cd: 0.28, width: 3, color: '#55aa88', trail: '#338866' },
      { name: 'Spirit Chain', key: 'RMB', type: SpellType.Homing, dmg: 2, speed: 260, radius: 10, mana: 18, cd: 3.5, life: 2.5, homing: 3.5, slow: 1.2, color: '#66bb99', trail: '#338866' },
      { name: 'Soul Surge', key: 'Q', type: SpellType.Zone, dmg: 0, mana: 30, cd: 8, radius: 80, duration: 4, tickRate: 0.8, heal: 1.5, color: '#44aa77' },
      { name: 'Soul Storm', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#338866', mana: 0, cd: 0 },
    ],
  },
  invoker: {
    name: 'Invoker', color: '#cc8844', glow: '#aa6622',
    desc: 'Elemental mastery. Multi-element combos.',
    hp: 7, moveSpeed: 190, maxMana: 100, manaRegen: 14,
    passive: { name: 'Elemental Attunement', desc: 'Burning+slowed enemies take +1 dmg/tick; stunned+burning enemies take 2x burn damage' },
    spells: [
      { name: 'Flame Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 400, radius: 8, mana: 7, cd: 0.3, life: 1.1, burn: 2, color: '#cc8844', trail: '#aa6622' },
      { name: 'Frost Spike', key: 'RMB', type: SpellType.Projectile, dmg: 1.5, speed: 480, radius: 7, mana: 16, cd: 2, life: 1.0, slow: 1.5, pierce: 1, color: '#88ccee', trail: '#5599bb' },
      { name: 'Storm Strike', key: 'Q', type: SpellType.AoeDelayed, dmg: 3.5, mana: 35, cd: 9, delay: 0.7, radius: 70, stun: 0.8, color: '#ffcc44' },
      { name: 'Elemental Convergence', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#aa6622', mana: 0, cd: 0 },
    ],
  },
  tidecaller: {
    name: 'Tidecaller', color: '#3388bb', glow: '#226699',
    desc: 'Water mage. Summons + wave control.',
    hp: 8, moveSpeed: 180, maxMana: 100, manaRegen: 14,
    passive: { name: 'Rising Tide', desc: 'Each active summon grants +10% ability damage (max 3); 2+ summons enhance slow to 0.6s' },
    spells: [
      { name: 'Water Bolt', key: 'LMB', type: SpellType.Homing, dmg: 1.5, speed: 340, radius: 7, mana: 6, cd: 0.28, life: 1.8, homing: 2.5, color: '#3388bb', trail: '#226699' },
      { name: 'Tidal Wave', key: 'RMB', type: SpellType.Cone, dmg: 2, range: 130, mana: 22, cd: 3, angle: 0.9, slow: 1.5, color: '#44aadd' },
      { name: 'Summon Elemental', key: 'Q', type: SpellType.Ultimate, ultCharge: 0, mana: 35, cd: 10, color: '#55bbee' },
      { name: 'Tsunami', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#226699', mana: 0, cd: 0 },
    ],
  },
  voidweaver: {
    name: 'Voidweaver', color: '#aa44cc', glow: '#882299',
    desc: 'Void magic. Traps, zones, debuffs.',
    hp: 6, moveSpeed: 185, maxMana: 110, manaRegen: 16,
    passive: { name: 'Entropic Decay', desc: 'Debuffed enemies take 15% more damage from all sources; debuffed kills explode for 1 AOE damage' },
    spells: [
      { name: 'Void Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 1.5, speed: 320, radius: 9, mana: 6, cd: 0.32, life: 1.2, burn: 3, slow: 0.4, color: '#aa44cc', trail: '#882299' },
      { name: 'Corruption Zone', key: 'RMB', type: SpellType.Zone, dmg: 1, mana: 22, cd: 4, radius: 90, duration: 5, tickRate: 0.6, slow: 1.0, color: '#9933bb' },
      { name: 'Void Traps', key: 'Q', type: SpellType.Trap, mana: 25, cd: 6, dmg: 3, radius: 50, count: 3, spread: 0.9, slow: 2.0, color: '#cc55ee' },
      { name: 'Void Rift', key: 'Space', type: SpellType.Ultimate, ultCharge: 100, color: '#882299', mana: 0, cd: 0 },
    ],
  },
};

export const CLASS_ORDER: string[] = [
  'pyromancer', 'cryomancer', 'stormcaller', 'arcanist', 'necromancer',
  'chronomancer', 'knight', 'berserker', 'paladin', 'ranger',
  'druid', 'warlock', 'monk', 'engineer',
  'graviturge', 'bladecaller', 'architect', 'hexblade', 'warden',
  'cannoneer', 'soulbinder', 'invoker', 'tidecaller', 'voidweaver',
];

export const BOSS_HP_EXPONENT = 1.6;
export const BOSS_HP_EXPONENT_DIVISOR = 5;
export const TIME_SCALING_FACTOR = 0.12;
export const ENEMY_HP_WAVE_MULT = 0.03;
export const CO_OP_HP_MULTIPLIER = 1.5;
export const BOSS_WAVE_XP: Record<number, number> = { 5: 65, 10: 90, 15: 110, 20: 150 };

// ═══════════════════════════════════
//        ENEMY TYPES
// ═══════════════════════════════════

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { name: 'Slime', hp: 2, speed: 55, size: 11, color: '#44cc44', dmg: 1, xp: 3, gold: 1, ai: EnemyAI.Chase, atkR: 20, atkCd: 1 },
  bat: { name: 'Bat', hp: 1, speed: 120, size: 8, color: '#8866aa', dmg: 1, xp: 3, gold: 1, ai: EnemyAI.Chase, atkR: 16, atkCd: 0.7 },
  skeleton: { name: 'Skeleton', hp: 3, speed: 70, size: 11, color: '#ccbb88', dmg: 1, xp: 5, gold: 2, ai: EnemyAI.Ranged, atkR: 220, atkCd: 1.4, projSpd: 280, projCol: '#ddcc99' },
  wraith: { name: 'Wraith', hp: 3, speed: 130, size: 10, color: '#8855cc', dmg: 2, xp: 8, gold: 3, ai: EnemyAI.Chase, atkR: 18, atkCd: 0.8, phase: true },
  golem: { name: 'Golem', hp: 20, speed: 35, size: 24, color: '#886644', dmg: 3, xp: 20, gold: 10, ai: EnemyAI.Chase, atkR: 32, atkCd: 2, boss: true },
  demon: { name: 'Demon', hp: 25, speed: 50, size: 22, color: '#cc3333', dmg: 3, xp: 25, gold: 12, ai: EnemyAI.Ranged, atkR: 250, atkCd: 1.2, projSpd: 350, projCol: '#ff4422', boss: true },
  spider: { name: 'Spider', hp: 3, speed: 100, size: 9, color: '#665544', dmg: 1, xp: 5, gold: 2, ai: EnemyAI.Chase, atkR: 16, atkCd: 0.6 },
  spiderling: { name: 'Spiderling', hp: 1, speed: 110, size: 6, color: '#887766', dmg: 1, xp: 2, gold: 0, ai: EnemyAI.Chase, atkR: 14, atkCd: 0.5 },
  necro: { name: 'Necro', hp: 5, speed: 50, size: 12, color: '#55aa77', dmg: 1, xp: 8, gold: 3, ai: EnemyAI.Ranged, atkR: 250, atkCd: 1.6, projSpd: 250, projCol: '#77cc99' },
  shieldbearer: { name: 'Shield Bearer', hp: 8, speed: 40, size: 14, color: '#7788aa', dmg: 2, xp: 10, gold: 4, ai: EnemyAI.Chase, atkR: 24, atkCd: 1.5 },
  assassin: { name: 'Assassin', hp: 2, speed: 160, size: 8, color: '#334455', dmg: 3, xp: 8, gold: 3, ai: EnemyAI.Chase, atkR: 16, atkCd: 1.2 },
  swarm_bat: { name: 'Swarm Bat', hp: 1, speed: 140, size: 6, color: '#9977bb', dmg: 1, xp: 2, gold: 0, ai: EnemyAI.Chase, atkR: 14, atkCd: 0.6 },
  archlord: { name: 'Archlord', hp: 125, speed: 45, size: 28, color: '#ffaa00', dmg: 3, xp: 50, gold: 25, ai: EnemyAI.Ranged, atkR: 280, atkCd: 1.5, projSpd: 350, projCol: '#ffcc44', boss: true },
  _ally: { name: 'Skeleton', hp: 4, speed: 80, size: 9, color: '#55cc55', dmg: 2, xp: 0, gold: 0, ai: EnemyAI.Chase, atkR: 20, atkCd: 0.8 },
  _wolf: { name: 'Wolf', hp: 8, speed: 120, size: 10, color: '#88aa66', dmg: 2, xp: 0, gold: 0, ai: EnemyAI.Chase, atkR: 20, atkCd: 0.6 },
  _imp: { name: 'Imp', hp: 5, speed: 90, size: 8, color: '#cc4466', dmg: 1, xp: 0, gold: 0, ai: EnemyAI.Ranged, atkR: 150, atkCd: 1.0, projSpd: 300, projCol: '#ff5577' },
  bomber: { name: 'Bomber', hp: 4, speed: 45, size: 12, color: '#cc6622', dmg: 1, xp: 7, gold: 2, ai: EnemyAI.Chase, atkR: 20, atkCd: 1.2, explodeOnDeath: 60 },
  teleporter: { name: 'Teleporter', hp: 3, speed: 70, size: 9, color: '#aa33cc', dmg: 2, xp: 10, gold: 3, ai: EnemyAI.Chase, atkR: 18, atkCd: 0.9, teleport: true },
  splitter: { name: 'Splitter', hp: 5, speed: 60, size: 13, color: '#448844', dmg: 1, xp: 5, gold: 2, ai: EnemyAI.Chase, atkR: 22, atkCd: 1.0, splitInto: 'splitling' },
  splitling: { name: 'Splitling', hp: 1, speed: 110, size: 7, color: '#66aa66', dmg: 1, xp: 2, gold: 0, ai: EnemyAI.Chase, atkR: 14, atkCd: 0.5 },
  berserker: { name: 'Berserker', hp: 6, speed: 50, size: 11, color: '#cc2222', dmg: 3, xp: 10, gold: 4, ai: EnemyAI.Chase, atkR: 22, atkCd: 1.0, enrage: true },
};

// ═══════════════════════════════════
//           UPGRADES
// ═══════════════════════════════════

/** Hyperbolic stacking: diminishing returns that never reach 100%.
 *  Formula: 1 - 1/(1 + acc), where acc is the raw sum of base increments.
 *  Example: critChance base 0.15 → 1 stack = 13%, 2 = 23%, 5 = 43%, 10 = 60% */
function hyperStack(p: Player, key: string, base: number): number {
  const acc = (p._hyperAcc[key] = (p._hyperAcc[key] || 0) + base);
  return 1 - 1 / (1 + acc);
}

/** Logarithmic diminishing returns for flat stackable upgrades.
 *  Stacks 1-3: full value. Stack 4+: ln(4)/ln(stacks+1) multiplier. */
export function flatScaling(baseValue: number, stacks: number): number {
  if (stacks <= 3) return baseValue;
  return baseValue * Math.log(4) / Math.log(stacks + 1);
}

/** Hyperbolic soft cap for total flat bonus damage.
 *  First THRESHOLD points uncapped; beyond that, diminishing returns.
 *  Example: +15 raw → ~9.6 effective, +30 raw → ~10.8 effective. */
export function softCapBonusDmg(rawBonus: number): number {
  if (rawBonus <= COMBAT.BONUS_DMG_SOFT_CAP_THRESHOLD) return rawBonus;
  const excess = rawBonus - COMBAT.BONUS_DMG_SOFT_CAP_THRESHOLD;
  const knee = COMBAT.BONUS_DMG_SOFT_CAP_KNEE;
  return COMBAT.BONUS_DMG_SOFT_CAP_THRESHOLD + excess / (1 + excess / knee);
}

export const UPGRADE_POOL: UpgradeDef[] = [
  // -- DAMAGE --
  { name: 'Spell Power', desc: 'All spells deal +1 damage', stackable: true, maxStacks: 5,
    apply: (p, stacks) => { const v = flatScaling(1, stacks); for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + v; } },
  { name: 'Primary Boost', desc: 'Primary spell +2 damage', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { p.cls.spells[0].dmg += flatScaling(2, stacks); } },
  { name: 'Ultimate Power', desc: 'Ultimate spell +3 damage', apply: (p: Player) => { if (p.cls.spells[3].dmg) p.cls.spells[3].dmg += 3; } },
  { name: 'Glass Cannon', desc: '+3 spell damage, -2 max HP', apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 3; p.maxHp = Math.max(1, p.maxHp - 2); p.hp = Math.min(p.hp, p.maxHp); } },
  { name: 'Critical Strike', desc: '15% chance to deal 2x damage', stackable: true, maxStacks: 3, apply: (p: Player) => { p.critChance = hyperStack(p, 'critChance', 0.15); } },
  { name: 'Overkill', desc: 'Leftover damage from a kill splashes to a nearby enemy', apply: (p: Player) => { p.overkill = true; } },

  // -- PROJECTILE MODIFIERS --
  { name: 'Piercing', desc: 'Primary passes through +1 enemy', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { p.pierce = (p.pierce || 0) + flatScaling(1, stacks); } },
  { name: 'Split Shot', desc: 'Primary fires 2 extra bolts at +/-15 deg', apply: (p: Player) => { p.splitShot = (p.splitShot || 0) + 2; } },
  { name: 'Ricochet', desc: 'Projectiles bounce off walls once', apply: (p: Player) => { p.ricochet = (p.ricochet || 0) + 1; } },
  { name: 'Velocity', desc: 'Projectile speed +40%', apply: (p: Player) => { for (const s of p.cls.spells) if (s.speed) s.speed *= 1.4; } },
  { name: 'Chain Hit', desc: 'Hits jump to 1 nearby enemy for 50% dmg', stackable: true, maxStacks: 3,
    apply: (p, stacks) => { p.chainHit = (p.chainHit || 0) + flatScaling(1, stacks); } },
  { name: 'Homing Bolts', desc: 'Primary gently curves toward nearby enemies', apply: (p: Player) => { const s = p.cls.spells[0]; s.homing = (s.homing || 0) + 1.5; } },
  { name: 'Big Spells', desc: 'Projectile size +30%', apply: (p: Player) => { for (const s of p.cls.spells) if (s.radius) s.radius *= 1.3; } },
  { name: 'Blast Radius', desc: 'Explosions +50% area', apply: (p: Player) => { for (const s of p.cls.spells) { if (s.explode) s.explode *= 1.5; if (s.radius && s.type === SpellType.AoeDelayed) s.radius *= 1.5; } } },

  // -- FIRE RATE / COOLDOWN --
  { name: 'Swift Cast', desc: 'All cooldowns -20%', apply: (p: Player) => { for (const s of p.cls.spells) s.cd *= 0.8; } },
  { name: 'Rapid Fire', desc: 'Primary fires 40% faster', apply: (p: Player) => { p.cls.spells[0].cd *= 0.6; } },
  { name: 'Double Tap', desc: 'Primary fires 2 shots per cast', apply: (p: Player) => { p.doubleTap = (p.doubleTap || 0) + 1; } },
  { name: 'Trigger Happy', desc: 'Kills reset primary cooldown', apply: (p: Player) => { p.killResetCD = true; } },

  // -- MANA --
  { name: 'Efficiency', desc: 'Mana costs -25%', apply: (p: Player) => { for (const s of p.cls.spells) s.mana *= 0.75; } },
  { name: 'Mana Flow', desc: 'Mana regen +50%', apply: (p: Player) => { p.manaRegen *= 1.5; } },
  { name: 'Max Mana +30', desc: '+30 max mana, immediately restored', apply: (p: Player) => { p.maxMana += 30; p.mana += 30; } },
  { name: 'Mana on Kill', desc: 'Restore 8 mana per kill', apply: (p: Player) => { p.manaOnKill = (p.manaOnKill || 0) + 8; } },
  { name: 'Spell Thief', desc: 'Hits restore 2 mana', apply: (p: Player) => { p.manaOnHit = (p.manaOnHit || 0) + 2; } },

  // -- SURVIVABILITY --
  { name: 'Vitality', desc: 'Max HP +2, heal to full', stackable: true, maxStacks: 5,
    apply: (p, stacks) => { p.maxHp += flatScaling(2, stacks); p.hp = p.maxHp; } },
  { name: 'Armor', desc: 'Reduce all damage taken by 1 (you always take at least 1)', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { p.armor = (p.armor || 0) + flatScaling(1, stacks); } },
  { name: 'Vampirism', desc: 'Heal 1 HP per 4 kills', apply: (p: Player) => { p.vampirism = (p.vampirism || 0) + 1; p.vampKillReq = 4; } },
  { name: 'Life Steal', desc: '5% of damage dealt heals you', apply: (p: Player) => { p.lifeSteal = hyperStack(p, 'lifeSteal', 0.05); } },
  { name: 'Second Wind', desc: 'Revive once per floor with 50% HP', apply: (p: Player) => { p.secondWind = (p.secondWind || 0) + 1; } },
  { name: 'Thorns', desc: 'Enemies take 1 damage when they hit you', apply: (p: Player) => { p.thorns = (p.thorns || 0) + 1; } },
  { name: 'Dodge', desc: '15% chance to avoid damage entirely', stackable: true, maxStacks: 3, apply: (p: Player) => { p.dodgeChance = hyperStack(p, 'dodgeChance', 0.15); } },

  // -- MOBILITY --
  { name: 'Quick Step', desc: 'Move speed +25%', apply: (p: Player) => { p.moveSpeed *= 1.25; } },
  { name: 'Dash', desc: 'Press SHIFT to dash. 2s cooldown.', apply: (p: Player) => { p.hasDash = true; p.dashCd = 0; } },
  { name: 'Momentum', desc: 'Moving increases damage by up to 20%', apply: (p: Player) => { p.momentum = true; } },

  // -- AREA / ZONE --
  { name: 'Lingering', desc: 'Zones last 50% longer', apply: (p: Player) => { for (const s of p.cls.spells) if (s.duration) s.duration *= 1.5; } },
  { name: 'Deep Freeze', desc: 'Slow effects 2x stronger', apply: (p: Player) => { for (const s of p.cls.spells) if (s.slow) s.slow *= 2; } },
  { name: 'Aftershock', desc: 'AoE spells leave a damage zone for 2s', apply: (p: Player) => { p.aftershock = true; } },

  // -- SECONDARY (RMB) UPGRADES --
  { name: 'Secondary Mastery', desc: 'Secondary spell cooldown -40%', apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].cd *= 0.6; } },
  { name: 'Double Secondary', desc: 'Secondary spell triggers twice per cast', apply: (p: Player) => { p.doubleSecondary = (p.doubleSecondary || 0) + 1; } },
  { name: 'Secondary Power', desc: 'Secondary spell +3 damage', apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].dmg = (p.cls.spells[1].dmg || 0) + 3; } },
  { name: 'Free Cast', desc: 'Secondary spell costs no mana (+2s cooldown)', apply: (p: Player) => { if (p.cls.spells[1]) { p.cls.spells[1].mana = 0; p.cls.spells[1].cd += 2; } } },
  { name: 'Combo', desc: 'Secondary deals +50% damage to targets hit by primary recently', apply: (p: Player) => { p.comboBonus = true; } },
  { name: 'Area Secondary', desc: 'Secondary spell range and radius +50%', apply: (p: Player) => { const s = p.cls.spells[1]; if (s) { if (s.range) s.range *= 1.5; if (s.radius) s.radius *= 1.5; if (s.aoeR) s.aoeR *= 1.5; } } },

  // -- Q ABILITY (Q) UPGRADES --
  { name: 'Q Power', desc: 'Q ability +2 damage', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { if (p.cls.spells[2]) p.cls.spells[2].dmg = (p.cls.spells[2].dmg || 0) + flatScaling(2, stacks); } },
  { name: 'Q Rapid Cooldown', desc: 'Q ability cooldown -40%', apply: (p: Player) => { if (p.cls.spells[2]) p.cls.spells[2].cd *= 0.6; } },
  { name: 'Double Q', desc: 'Q ability triggers twice per cast', apply: (p: Player) => { p.doubleQ = (p.doubleQ || 0) + 1; } },
  { name: 'Q Efficiency', desc: 'Q ability costs no mana (+3s cooldown)', apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].mana = 0; p.cls.spells[2].cd += 3; } } },
  { name: 'Q Area', desc: 'Q ability range and radius +50%', apply: (p: Player) => { const s = p.cls.spells[2]; if (s) { if (s.range) s.range *= 1.5; if (s.radius) s.radius *= 1.5; if (s.aoeR) s.aoeR *= 1.5; } } },

  // -- ULTIMATE (R) UPGRADES --
  { name: 'Quick Charge', desc: 'Ultimate charges 50% faster', apply: (p: Player) => { p.ultChargeRate = (p.ultChargeRate || 1) * 1.5; } },
  { name: 'Ult Mastery', desc: 'Ultimate deals 2x damage/effect', apply: (p: Player) => { p.ultPower = (p.ultPower || 1) * 2; } },
  { name: 'Overflow', desc: 'Ult charges to 200% for double cast', apply: (p: Player) => { p.ultOverflow = true; } },
  { name: 'Ult Echo', desc: 'After using ultimate, your next 5 primary shots deal double damage', apply: (p: Player) => { p.ultEcho = (p.ultEcho || 0) + 5; } },
  { name: 'Ult Regen', desc: 'Using ult restores 50% HP', apply: (p: Player) => { p.ultHeal = true; } },

  // -- CROSS-SPELL SYNERGIES --
  { name: 'Spell Weaving', desc: 'Switching between primary and secondary grants +25% damage (up to 3 stacks)', apply: (p: Player) => { p.spellWeaving = true; } },
  { name: 'Cooldown Cascade', desc: 'Primary kills reduce secondary cooldown by 1s', apply: (p: Player) => { p.cdCascade = true; } },
  { name: 'Full Rotation', desc: 'Cast all 3 spells within 5s to gain 3x attack speed for 3s', apply: (p: Player) => { p.fullRotation = true; } },
  { name: 'Q Mastery', desc: 'Q skill cooldown -35%, +2 damage', apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].cd *= 0.65; p.cls.spells[2].dmg = (p.cls.spells[2].dmg || 0) + 2; } } },
  { name: 'Skill Reset', desc: 'Using ultimate resets Q and secondary cooldowns', apply: (p: Player) => { p.ultResetCDs = true; } },

  // -- WILD / FUN --
  { name: 'Chaos Bolts', desc: 'Primary damage randomized between 1 and 4 per hit', apply: (p: Player) => { p.chaosDmg = true; } },
  { name: 'Magnet', desc: '+60 pickup range', apply: (p: Player) => { p.magnetRange = (p.magnetRange || 30) + 60; } },
  { name: 'Gold Rush', desc: 'Enemies drop 2x gold', apply: (p: Player) => { p.goldMul = (p.goldMul || 1) * 2; } },
  { name: 'XP Boost', desc: 'Gain upgrades 30% more often', apply: (p: Player) => { p.xpBoost = hyperStack(p, 'xpBoost', 0.3); } },
  { name: 'Friendly Fire', desc: '+2 dmg but your spells can hurt you', apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 2; p.selfDmg = true; } },

  // -- QUALITATIVE (behavior-changing) --
  { name: 'Boomerang', desc: 'Projectiles return to you at half range, hitting enemies twice', apply: (p: Player) => { p.boomerang = true; } },
  { name: 'Volatile', desc: 'Projectiles explode when they expire (2 dmg, small radius)', apply: (p: Player) => { p.volatile = true; } },
  { name: 'Fork', desc: 'Kills spawn 2 mini-projectiles from the corpse', apply: (p: Player) => { p.forkOnKill = true; } },
  { name: 'Gravity Pull', desc: 'Projectiles pull nearby enemies toward their path', apply: (p: Player) => { p.gravityWell = true; } },
  { name: 'Spectral', desc: 'Projectiles pass through walls and pillars', apply: (p: Player) => { p.spectral = true; } },
  { name: 'Frozen Touch', desc: '25% chance any attack freezes enemies for 1s', apply: (p: Player) => { p.frozenTouch = true; } },
  { name: 'Seeker Mines', desc: 'Kills drop proximity mines with a small blast radius (3 dmg each)', apply: (p: Player) => { p.seekerMines = true; } },
  { name: 'Barrage Mode', desc: 'Primary fires a 3-shot burst (40% damage each, slower fire rate)', apply: (p: Player) => { p.burstFire = true; const s = p.cls.spells[0]; s.dmg = Math.max(1, Math.ceil(s.dmg * 0.4)); s.cd *= 1.5; } },

  // ══════════════════════════════════════
  //     CLASS-SPECIFIC UPGRADES (3 each)
  // ══════════════════════════════════════

  // ── Pyromancer ──
  { name: 'Wildfire', desc: 'Burn spreads to nearby enemies', forClass: 'pyromancer', color: '#ff6633',
    apply: (p: Player) => { p.burnSpread = true; } },
  { name: 'Magma Armor', desc: 'Enemies that hit you catch fire (3 dmg)', forClass: 'pyromancer', color: '#ff6633',
    apply: (p: Player) => { p.magmaArmor = true; } },
  { name: 'Pyroclasm', desc: 'Fireball explosions are 2x bigger and leave fire zones', forClass: 'pyromancer', color: '#ff6633',
    apply: (p: Player) => { const s = p.cls.spells[0]; if (s.explode) s.explode *= 2; p.fireZoneOnExplode = true; } },

  // ── Cryomancer ──
  { name: 'Shatter', desc: 'Frozen enemies explode on death, dealing 3 AoE dmg', forClass: 'cryomancer', color: '#44bbff',
    apply: (p: Player) => { p.shatter = true; } },
  { name: 'Permafrost', desc: 'Slow effects never expire (permanent until enemy dies)', forClass: 'cryomancer', color: '#44bbff',
    apply: (p: Player) => { p.permafrost = true; } },
  { name: 'Ice Armor', desc: '+3 armor. Melee attackers get frozen 1s', forClass: 'cryomancer', color: '#44bbff',
    apply: (p: Player) => { p.armor = (p.armor || 0) + 3; p.iceArmor = true; } },

  // ── Stormcaller ──
  { name: 'Chain Lightning', desc: 'Lightning beam bounces to 2 more enemies', forClass: 'stormcaller', color: '#bb66ff', stackable: true, maxStacks: 3,
    apply: (p, stacks) => { p.chainLightning = (p.chainLightning || 0) + flatScaling(2, stacks); } },
  { name: 'Overcharge', desc: 'Every 3rd spell deals 3x damage', forClass: 'stormcaller', color: '#bb66ff',
    apply: (p: Player) => { p.overcharge = true; } },
  { name: 'Storm Shield', desc: 'Lightning randomly strikes enemies at close range (1 dmg/s)', forClass: 'stormcaller', color: '#bb66ff',
    apply: (p: Player) => { p.stormShield = true; } },

  // ── Arcanist ──
  { name: 'Arcane Amplifier', desc: 'Homing gets 3x stronger, projectiles are 50% faster', forClass: 'arcanist', color: '#ff55aa',
    apply: (p: Player) => { const s = p.cls.spells[0]; s.homing = (s.homing || 0) * 3; if (s.speed) s.speed *= 1.5; } },
  { name: 'Phase Shift', desc: 'Blink leaves behind a small explosion (4 dmg)', forClass: 'arcanist', color: '#ff55aa',
    apply: (p: Player) => { p.blinkExplode = true; } },
  { name: 'Spell Mirror', desc: '30% chance to copy any spell you cast for free', forClass: 'arcanist', color: '#ff55aa',
    apply: (p: Player) => { p.spellMirror = hyperStack(p, 'spellMirror', 0.3); } },

  // ── Necromancer ──
  { name: 'Raise Dead', desc: 'Killed enemies have 25% chance to fight for you (5s)', forClass: 'necromancer', color: '#55cc55', stackable: true, maxStacks: 3,
    apply: (p: Player) => { p.raiseDead = hyperStack(p, 'raiseDead', 0.25); } },
  { name: 'Death Mark', desc: 'Enemies below 20% HP take 3x damage', forClass: 'necromancer', color: '#55cc55',
    apply: (p: Player) => { p.deathMark = true; } },
  { name: 'Soul Well', desc: 'Kills create a medium healing zone (2 HP/s for 3s)', forClass: 'necromancer', color: '#55cc55',
    apply: (p: Player) => { p.soulWell = true; } },

  // ── Chronomancer ──
  { name: 'Time Loop', desc: 'When you die, rewind 5s instead (once per wave)', forClass: 'chronomancer', color: '#ffcc44',
    apply: (p: Player) => { p.timeLoop = (p.timeLoop || 0) + 1; } },
  { name: 'Haste Zone', desc: 'Time Warp now also boosts ally speed 2x for 3s', forClass: 'chronomancer', color: '#ffcc44',
    apply: (p: Player) => { p.hasteZone = true; } },
  { name: 'Temporal Echo', desc: 'Spells fire a delayed copy 0.5s later at 50% damage', forClass: 'chronomancer', color: '#ffcc44',
    apply: (p: Player) => { p.temporalEcho = true; } },

  // ── Knight ──
  { name: 'Shield Mastery', desc: 'Shield Throw bounces between 3 enemies', forClass: 'knight', color: '#aabbcc',
    apply: (p: Player) => { p.shieldBounce = (p.shieldBounce || 0) + 3; } },
  { name: 'Fortify', desc: '+5 max HP, +2 armor, move 15% slower', forClass: 'knight', color: '#aabbcc',
    apply: (p: Player) => { p.maxHp += 5; p.hp += 5; p.armor = (p.armor || 0) + 2; p.moveSpeed *= 0.85; } },
  { name: 'Taunt Aura', desc: 'Enemies within close range target you instead of your ally', forClass: 'knight', color: '#aabbcc',
    apply: (p: Player) => { p.tauntAura = true; } },

  // ── Berserker ──
  { name: 'Bloodlust', desc: 'Each kill: +5% attack speed (cap +100%). After cap: +1% crit (cap +15%)', forClass: 'berserker', color: '#ff4444',
    apply: (p: Player) => { p.bloodlust = true; } },
  { name: 'Undying Rage', desc: 'Cannot die for 3s after reaching 1 HP (once per wave)', forClass: 'berserker', color: '#ff4444',
    apply: (p: Player) => { p.undyingRage = (p.undyingRage || 0) + 1; } },
  { name: 'Cleave', desc: 'Axe Swing hits 360° around you and +2 damage', forClass: 'berserker', color: '#ff4444',
    apply: (p: Player) => { p.cls.spells[0].angle = Math.PI * 2; p.cls.spells[0].dmg += 2; } },

  // ── Paladin ──
  { name: 'Blessed Weapons', desc: 'Both players deal +2 damage', forClass: 'paladin', color: '#ffddaa',
    apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 2; } },
  { name: 'Divine Shield', desc: 'Holy Shield lasts 5s and reflects projectiles', forClass: 'paladin', color: '#ffddaa',
    apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].duration = 5; p.reflectShield = true; } },
  { name: 'Resurrection', desc: 'If your ally dies, auto-revive them at 50% HP (45s cd)', forClass: 'paladin', color: '#ffddaa',
    apply: (p: Player) => { p.resurrection = true; } },

  // ── Ranger ──
  { name: 'Multishot', desc: 'Arrows fire in a 2-arrow spread', forClass: 'ranger', color: '#88cc44',
    apply: (p: Player) => { p.splitShot = (p.splitShot || 0) + 1; } },
  { name: 'Poison Arrows', desc: 'All arrows poison (2 dmg over 2s)', forClass: 'ranger', color: '#88cc44',
    apply: (p: Player) => { p.cls.spells[0].burn = 2; } },
  { name: 'Trap Master', desc: 'Traps do 2x damage, slow 2x longer, place 5 instead of 3', forClass: 'ranger', color: '#88cc44',
    apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].dmg = (p.cls.spells[2].dmg || 0) * 2; p.cls.spells[2].count = 5; } } },

  // ── Druid ──
  { name: 'Pack Leader', desc: 'Spirit Wolf is 2x stronger and you can have 2 wolves', forClass: 'druid', color: '#44aa33',
    apply: (p: Player) => { p.packLeader = true; } },
  { name: 'Overgrowth', desc: 'Entangle radius 2x, also heals allies inside for 2 HP/s', forClass: 'druid', color: '#44aa33',
    apply: (p: Player) => { if (p.cls.spells[1]) { p.cls.spells[1].radius = (p.cls.spells[1].radius || 60) * 2; } p.overgrowthHeal = true; } },
  { name: 'Bark Skin', desc: '+3 armor, regen 1 HP every 5s (stacks with passive)', forClass: 'druid', color: '#44aa33',
    apply: (p: Player) => { p.armor = (p.armor || 0) + 3; p.barkSkinRegen = true; p.hpRegen = (p.hpRegen || 0) + 0.2; } },

  // ── Warlock ──
  { name: 'Soul Siphon', desc: 'Dark Pact HP cost becomes healing instead (pay mana, gain HP)', forClass: 'warlock', color: '#6622aa',
    apply: (p: Player) => { p.soulSiphon = true; } },
  { name: 'Demonic Pact', desc: 'Imps are permanent and you can have 3 at once', forClass: 'warlock', color: '#6622aa',
    apply: (p: Player) => { p.demonicPact = true; } },
  { name: 'Hex', desc: 'Drain Life chains to 3 targets', forClass: 'warlock', color: '#6622aa',
    apply: (p: Player) => { p.hexChain = (p.hexChain || 0) + 3; } },

  // ── Monk ──
  { name: 'Way of the Fist', desc: 'Chi Blast fires 3 projectiles in a fan', forClass: 'monk', color: '#eedd88',
    apply: (p: Player) => { p.splitShot = (p.splitShot || 0) + 2; } },
  { name: 'Iron Skin', desc: 'Dodge chance +25%, take -1 damage from all sources', forClass: 'monk', color: '#eedd88',
    apply: (p: Player) => { p.dodgeChance = hyperStack(p, 'dodgeChance', 0.25); p.armor = (p.armor || 0) + 1; } },
  { name: 'Zen Master', desc: 'Meditation heals 3x faster and also restores mana', forClass: 'monk', color: '#eedd88',
    apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].heal = (p.cls.spells[2].heal || 1) * 3; } p.zenMana = true; } },

  // ── Engineer ──
  { name: 'Turret Army', desc: 'Can have 3 turrets at once, each lasts 25s', forClass: 'engineer', color: '#dd8833',
    apply: (p: Player) => { p.turretArmy = true; if (p.cls.spells[1]) p.cls.spells[1].duration = 25; } },
  { name: 'Laser Turret', desc: 'Turrets fire beams instead of shots (2x damage, hits instantly)', forClass: 'engineer', color: '#dd8833',
    apply: (p: Player) => { p.laserTurret = true; } },
  { name: 'Self-Destruct', desc: 'Turrets explode when they expire (6 dmg, medium radius)', forClass: 'engineer', color: '#dd8833',
    apply: (p: Player) => { p.turretExplode = true; } },

  // ══════════════════════════════════════
  //     EVOLUTION UPGRADES
  // ══════════════════════════════════════
  // Evolutions appear when their parent stackable upgrade reaches max stacks.
  // They are NOT offered in the normal upgrade pool.

  { name: 'Spell Mastery', desc: 'Caps total spell damage bonus at +7 and reduces all cooldowns by 30%', isEvolution: true, evolvesFrom: 0, color: '#ffaa00',
    apply: (p: Player, _s: number) => {
      const parentStacks = p.takenUpgrades.get(0) || 0;
      let parentTotal = 0;
      for (let i = 1; i <= parentStacks; i++) parentTotal += flatScaling(1, i);
      const bonus = Math.max(0, 7 - parentTotal);
      for (const s of p.cls.spells) { s.dmg = (s.dmg || 0) + bonus; s.cd *= 0.7; }
    } },

  { name: 'Primary Overload', desc: 'Caps primary damage bonus at +10 and adds a 3-damage explosion on hit', isEvolution: true, evolvesFrom: 1, color: '#ffaa00',
    apply: (p: Player, _s: number) => {
      const parentStacks = p.takenUpgrades.get(1) || 0;
      let parentTotal = 0;
      for (let i = 1; i <= parentStacks; i++) parentTotal += flatScaling(2, i);
      p.cls.spells[0].dmg += Math.max(0, 10 - parentTotal);
      p.cls.spells[0].explode = (p.cls.spells[0].explode || 0) + 40;
    } },

  { name: 'Lethal Precision', desc: 'Crits deal 2.5x damage and +25% crit chance', isEvolution: true, evolvesFrom: 4, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.critChance = (p.critChance || 0) + 0.25; p.critMul = 2.5; } },

  { name: 'Void Lance', desc: 'Primary pierces all enemies and gains +3 damage', isEvolution: true, evolvesFrom: 6, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.pierce = (p.pierce || 0) + 99; p.cls.spells[0].dmg += 3; } },

  { name: 'Chain Annihilation', desc: 'Chain hits deal full damage and +3 extra jumps', isEvolution: true, evolvesFrom: 10, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.chainHit = (p.chainHit || 0) + 3; p.chainFullDmg = true; } },

  { name: 'Regeneration', desc: '+5 max HP, regenerate 1 HP every 3 seconds', isEvolution: true, evolvesFrom: 23, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.maxHp += 5; p.hp = p.maxHp; p.hpRegen = (p.hpRegen || 0) + 0.333; } },

  { name: 'Fortress', desc: '+3 armor and enemies take 3 damage when hitting you', isEvolution: true, evolvesFrom: 24, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.armor = (p.armor || 0) + 3; p.thorns = (p.thorns || 0) + 3; } },

  { name: 'Shadow Step', desc: '+30% dodge chance and +25% move speed', isEvolution: true, evolvesFrom: 29, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.dodgeChance = (p.dodgeChance || 0) + 0.30; p.moveSpeed *= 1.25; } },

  { name: 'Storm Lord', desc: 'Lightning chains to +5 enemies and primary +2 damage', isEvolution: true, evolvesFrom: 76, color: '#ffaa00', forClass: 'stormcaller',
    apply: (p: Player, _s: number) => { p.chainLightning = (p.chainLightning || 0) + 5; p.cls.spells[0].dmg += 2; } },

  { name: 'Lich King', desc: 'Raise dead chance +50% — nearly every kill raises a minion', isEvolution: true, evolvesFrom: 82, color: '#ffaa00', forClass: 'necromancer',
    apply: (p: Player, _s: number) => { p.raiseDead = (p.raiseDead || 0) + 0.50; } },

  // ══════════════════════════════════════
  //     CURSED UPGRADES (wave 16+)
  // ══════════════════════════════════════
  // Cursed upgrades offer powerful benefits with meaningful drawbacks.
  // They appear as the 4th choice card from wave 16 onward.

  { name: 'Reckless Haste', desc: 'All cooldowns -40%, but take +50% more damage',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { for (const s of p.cls.spells) s.cd *= 0.6; p.damageTakenMul = (p.damageTakenMul || 1) * 1.5; } },

  { name: 'Blood Pact', desc: '+20% life steal, but -3 max HP',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.lifeSteal = hyperStack(p, 'lifeSteal', 0.2); p.maxHp = Math.max(1, p.maxHp - 3); p.hp = Math.min(p.hp, p.maxHp); } },

  { name: 'Unstable Power', desc: 'Primary +8 damage, but 5% chance to hurt yourself when casting',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.cls.spells[0].dmg += 8; p.selfDmgChance = Math.min(1, (p.selfDmgChance || 0) + 0.05); } },

  { name: 'Berserker Pact', desc: '+50% crit chance, but -2 armor',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.critChance = hyperStack(p, 'critChance', 0.5); p.armor = (p.armor || 0) - 2; } },

  { name: 'Soul Bargain', desc: '+60% mana regen and -50% mana costs, but -4 max HP',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.manaRegen *= 1.6; for (const s of p.cls.spells) s.mana *= 0.5; p.maxHp = Math.max(1, p.maxHp - 4); p.hp = Math.min(p.hp, p.maxHp); } },
];
