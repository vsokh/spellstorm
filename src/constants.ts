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

/** Network send interval in seconds */
export const NET_SEND_INTERVAL = 0.05;

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

/** Health drop chance on enemy kill */
export const HEALTH_DROP_CHANCE = 0.15;

/** Minimap cell size */
export const MINIMAP_CELL_SIZE = 16;

// ═══════════════════════════════════
//        WIZARD CLASSES
// ═══════════════════════════════════

export const CLASSES: Record<string, ClassDefInput> = {
  pyromancer: {
    name: 'Pyromancer', color: '#ff6633', glow: '#ff4400',
    desc: 'Fire mastery. High burst damage.',
    passive: { name: 'Ignite', desc: 'Enemies hit burn for 2 dmg over 2s' },
    spells: [
      { name: 'Fireball', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 400, radius: 10, mana: 8, cd: 0.35, life: 1.2, explode: 35, color: '#ff6633', trail: '#ff3300', burn: 2 },
      { name: 'Flame Wave', key: 'RMB', type: SpellType.Cone, dmg: 2, range: 110, mana: 22, cd: 2.5, angle: 0.8, color: '#ff4400' },
      { name: 'Meteor', key: 'Q', type: SpellType.AoeDelayed, dmg: 4, mana: 40, cd: 8, delay: 0.8, radius: 75, color: '#ff2200' },
      { name: 'Inferno', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#ff2200', mana: 0, cd: 0 },
    ],
  },
  cryomancer: {
    name: 'Cryomancer', color: '#44bbff', glow: '#2288dd',
    desc: 'Ice magic. Crowd control.',
    passive: { name: 'Frostbite', desc: 'Slowed enemies take +1 damage' },
    spells: [
      { name: 'Ice Shard', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 520, radius: 7, mana: 6, cd: 0.22, life: 1, slow: 0.6, color: '#88ddff', trail: '#44aadd' },
      { name: 'Frost Nova', key: 'RMB', type: SpellType.Nova, dmg: 2, range: 95, mana: 22, cd: 3.5, slow: 1.5, color: '#44bbff' },
      { name: 'Blizzard', key: 'Q', type: SpellType.Zone, dmg: 1, mana: 35, cd: 10, radius: 90, duration: 4, tickRate: 0.7, slow: 0.8, color: '#2288dd' },
      { name: 'Absolute Zero', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#2288dd', mana: 0, cd: 0 },
    ],
  },
  stormcaller: {
    name: 'Stormcaller', color: '#bb66ff', glow: '#9944dd',
    desc: 'Lightning. Instant strikes.',
    passive: { name: 'Static', desc: 'Every 5th hit stuns the target for 0.5s' },
    spells: [
      { name: 'Lightning', key: 'LMB', type: SpellType.Beam, dmg: 1, range: 320, mana: 7, cd: 0.28, width: 3, color: '#cc88ff', trail: '#aa55ff' },
      { name: 'Ball Zap', key: 'RMB', type: SpellType.Projectile, dmg: 1, speed: 140, radius: 16, mana: 18, cd: 3, life: 3.5, zap: 75, zapRate: 0.45, color: '#bb66ff', trail: '#9944dd' },
      { name: 'Thunder', key: 'Q', type: SpellType.AoeDelayed, dmg: 3, mana: 35, cd: 8, delay: 0.5, radius: 65, stun: 1, color: '#ffcc44' },
      { name: 'Storm Fury', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#ffcc44', mana: 0, cd: 0 },
    ],
  },
  arcanist: {
    name: 'Arcanist', color: '#ff55aa', glow: '#dd3388',
    desc: 'Arcane arts. Mobility & homing.',
    passive: { name: 'Arcane Echo', desc: 'Spells have 20% chance to fire twice' },
    spells: [
      { name: 'Arcane Bolt', key: 'LMB', type: SpellType.Homing, dmg: 1, speed: 300, radius: 8, mana: 7, cd: 0.28, life: 2, homing: 2.5, color: '#ff55aa', trail: '#dd3388' },
      { name: 'Blink', key: 'RMB', type: SpellType.Blink, range: 170, mana: 18, cd: 2.5, color: '#ff88cc' },
      { name: 'Barrage', key: 'Q', type: SpellType.Barrage, dmg: 1, speed: 380, radius: 7, mana: 35, cd: 7, count: 7, spread: 0.4, life: 1.2, color: '#ff55aa', trail: '#cc2277' },
      { name: 'Arcane Storm', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#ff55aa', mana: 0, cd: 0 },
    ],
  },
  necromancer: {
    name: 'Necromancer', color: '#55cc55', glow: '#228822',
    desc: 'Death magic. Drains life.',
    passive: { name: 'Soul Harvest', desc: 'Kills heal 1 HP' },
    spells: [
      { name: 'Soul Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 360, radius: 9, mana: 8, cd: 0.35, life: 1.2, color: '#55cc55', trail: '#228822' },
      { name: 'Death Wave', key: 'RMB', type: SpellType.Nova, dmg: 2, range: 90, mana: 28, cd: 4, drain: 1, color: '#44aa44' },
      { name: 'Plague', key: 'Q', type: SpellType.Zone, dmg: 1, mana: 40, cd: 10, radius: 80, duration: 4, tickRate: 0.8, slow: 0.3, color: '#338833' },
      { name: 'Army of Dead', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#228822', mana: 0, cd: 0 },
    ],
  },
  chronomancer: {
    name: 'Chronomancer', color: '#ffcc44', glow: '#cc9922',
    desc: 'Time magic. Haste & slow.',
    passive: { name: 'Haste Aura', desc: '+10% move speed for nearby ally' },
    spells: [
      { name: 'Time Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 480, radius: 8, mana: 6, cd: 0.25, life: 1, slow: 1, color: '#ffcc44', trail: '#cc9922' },
      { name: 'Time Warp', key: 'RMB', type: SpellType.Nova, dmg: 1, range: 110, mana: 22, cd: 4, slow: 2.5, stun: 0.5, color: '#ffdd66' },
      { name: 'Rewind', key: 'Q', type: SpellType.Rewind, mana: 45, cd: 12, color: '#ffcc44' },
      { name: 'Time Stop', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#ffdd66', mana: 0, cd: 0 },
    ],
  },
  knight: {
    name: 'Knight', color: '#aabbcc', glow: '#778899',
    desc: 'Tank. Absorbs damage, protects ally.',
    passive: { name: 'Bulwark', desc: 'Take 25% less damage' },
    spells: [
      { name: 'Shield Throw', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 350, radius: 10, mana: 4, cd: 0.4, life: 0.8, color: '#ccddee', trail: '#8899aa' },
      { name: 'Shield Bash', key: 'RMB', type: SpellType.Nova, dmg: 3, range: 60, mana: 15, cd: 2, stun: 1.5, color: '#8899aa' },
      { name: 'Charge', key: 'Q', type: SpellType.Blink, range: 200, mana: 20, cd: 3.5, color: '#aabbcc' },
      { name: 'Shield Wall', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#ccddee', mana: 0, cd: 0 },
    ],
  },
  berserker: {
    name: 'Berserker', color: '#ff4444', glow: '#cc2222',
    desc: 'Melee DPS. The lower the HP, the stronger.',
    passive: { name: 'Fury', desc: 'Below 50% HP: +50% damage and speed' },
    spells: [
      { name: 'Axe Swing', key: 'LMB', type: SpellType.Cone, dmg: 3, range: 50, mana: 2, cd: 0.35, angle: 1.5, color: '#ff6644' },
      { name: 'Throwing Axe', key: 'RMB', type: SpellType.Projectile, dmg: 3, speed: 500, radius: 10, mana: 8, cd: 0.8, life: 1.2, color: '#ff4444', trail: '#cc2222' },
      { name: 'Leap Slam', key: 'Q', type: SpellType.Leap, range: 180, mana: 20, cd: 3.5, dmg: 3, aoeR: 60, color: '#ff3322' },
      { name: 'Blood Rage', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#ff2222', mana: 0, cd: 0 },
    ],
  },
  paladin: {
    name: 'Paladin', color: '#ffddaa', glow: '#ccaa66',
    desc: 'Support. Heals ally, smites undead.',
    passive: { name: 'Aura of Light', desc: 'Nearby ally regens 2 HP/s' },
    spells: [
      { name: 'Smite', key: 'LMB', type: SpellType.Projectile, dmg: 2, speed: 380, radius: 9, mana: 7, cd: 0.35, life: 1.2, color: '#ffddaa', trail: '#ccaa66' },
      { name: 'Holy Shield', key: 'RMB', type: SpellType.AllyShield, mana: 25, cd: 5, duration: 3, color: '#ffffcc' },
      { name: 'Consecrate', key: 'Q', type: SpellType.Zone, dmg: 2, mana: 30, cd: 7, radius: 80, duration: 3, tickRate: 0.6, slow: 0.3, color: '#ffeeaa', heal: 1 },
      { name: 'Holy Light', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#ffffcc', mana: 0, cd: 0 },
    ],
  },
  ranger: {
    name: 'Ranger', color: '#88cc44', glow: '#668833',
    desc: 'Ranged DPS. Fast attacks, high mobility.',
    passive: { name: 'Eagle Eye', desc: 'Primary range +30%, crits at max range' },
    spells: [
      { name: 'Arrow', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 600, radius: 5, mana: 4, cd: 0.18, life: 1.4, color: '#88cc44', trail: '#668833' },
      { name: 'Volley', key: 'RMB', type: SpellType.Barrage, dmg: 1, speed: 500, radius: 5, mana: 18, cd: 2.5, count: 5, spread: 0.6, life: 1, color: '#88cc44', trail: '#556622' },
      { name: 'Trap', key: 'Q', type: SpellType.Trap, mana: 15, cd: 4, dmg: 3, radius: 50, slow: 2, color: '#aadd55' },
      { name: 'Arrow Rain', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#88cc44', mana: 0, cd: 0 },
    ],
  },
  druid: {
    name: 'Druid', color: '#44aa33', glow: '#337722',
    desc: 'Nature magic. Summons + heals.',
    passive: { name: 'Regrowth', desc: 'Regen 1 HP every 10 seconds' },
    spells: [
      { name: 'Thorn Shot', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 380, radius: 7, mana: 6, cd: 0.32, life: 1.2, burn: 3, color: '#44aa33', trail: '#337722' },
      { name: 'Entangle', key: 'RMB', type: SpellType.Zone, dmg: 0, mana: 20, cd: 5, radius: 60, duration: 2, tickRate: 0.5, stun: 2, color: '#66bb44' },
      { name: 'Spirit Wolf', key: 'Q', type: SpellType.Ultimate, ultCharge: 0, mana: 30, cd: 10, color: '#88aa55' },
      { name: "Nature's Wrath", key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#33aa22', mana: 0, cd: 0 },
    ],
  },
  warlock: {
    name: 'Warlock', color: '#8833aa', glow: '#662288',
    desc: 'Dark magic. High risk, high reward.',
    passive: { name: 'Dark Pact', desc: 'Spells cost HP instead of 30% mana cost (saves mana)' },
    spells: [
      { name: 'Shadow Bolt', key: 'LMB', type: SpellType.Projectile, dmg: 3, speed: 260, radius: 10, mana: 10, cd: 0.5, life: 1.5, color: '#8833aa', trail: '#662288' },
      { name: 'Drain Life', key: 'RMB', type: SpellType.Beam, dmg: 2, range: 200, mana: 18, cd: 1, width: 4, drain: 2, color: '#aa44cc' },
      { name: 'Summon Imp', key: 'Q', type: SpellType.Ultimate, ultCharge: 0, mana: 25, cd: 8, color: '#cc4466' },
      { name: 'Doom', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#662288', mana: 0, cd: 0 },
    ],
  },
  monk: {
    name: 'Monk', color: '#eedd88', glow: '#ccaa44',
    desc: 'Martial arts. Fast melee + dodging.',
    passive: { name: 'Inner Peace', desc: 'Dodge 25% of attacks naturally' },
    spells: [
      { name: 'Chi Blast', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 500, radius: 8, mana: 3, cd: 0.15, life: 0.5, color: '#eedd88', trail: '#ccaa44' },
      { name: 'Flying Kick', key: 'RMB', type: SpellType.Leap, range: 180, mana: 12, cd: 2, dmg: 4, aoeR: 55, color: '#ccaa44' },
      { name: 'Meditation', key: 'Q', type: SpellType.Zone, dmg: 0, mana: 15, cd: 6, radius: 40, duration: 3, tickRate: 0.8, heal: 2, color: '#ffffcc' },
      { name: 'Thousand Fists', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#eedd88', mana: 0, cd: 0 },
    ],
  },
  engineer: {
    name: 'Engineer', color: '#dd8833', glow: '#aa6622',
    desc: 'Builds turrets and gadgets.',
    passive: { name: 'Overclock', desc: 'Turrets fire 20% faster' },
    spells: [
      { name: 'Wrench Throw', key: 'LMB', type: SpellType.Projectile, dmg: 1, speed: 350, radius: 7, mana: 5, cd: 0.3, life: 1.0, color: '#dd8833', trail: '#aa6622' },
      { name: 'Deploy Turret', key: 'RMB', type: SpellType.Zone, dmg: 1, mana: 25, cd: 6, radius: 120, duration: 15, tickRate: 0.8, color: '#cc7722' },
      { name: 'Mine Field', key: 'Q', type: SpellType.Trap, mana: 20, cd: 5, dmg: 4, radius: 45, count: 3, spread: 0.8, color: '#ffaa33' },
      { name: 'Mega Turret', key: 'R', type: SpellType.Ultimate, ultCharge: 100, color: '#dd8833', mana: 0, cd: 0 },
    ],
  },
};

export const CLASS_ORDER: string[] = [
  'pyromancer', 'cryomancer', 'stormcaller', 'arcanist', 'necromancer',
  'chronomancer', 'knight', 'berserker', 'paladin', 'ranger',
  'druid', 'warlock', 'monk', 'engineer',
];

// ═══════════════════════════════════
//        ENEMY TYPES
// ═══════════════════════════════════

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { name: 'Slime', hp: 2, speed: 55, size: 11, color: '#44cc44', dmg: 1, xp: 1, gold: 1, ai: EnemyAI.Chase, atkR: 20, atkCd: 1 },
  bat: { name: 'Bat', hp: 1, speed: 120, size: 8, color: '#8866aa', dmg: 1, xp: 1, gold: 1, ai: EnemyAI.Chase, atkR: 16, atkCd: 0.7 },
  skeleton: { name: 'Skeleton', hp: 3, speed: 70, size: 11, color: '#ccbb88', dmg: 1, xp: 2, gold: 2, ai: EnemyAI.Ranged, atkR: 220, atkCd: 1.4, projSpd: 280, projCol: '#ddcc99' },
  wraith: { name: 'Wraith', hp: 3, speed: 130, size: 10, color: '#8855cc', dmg: 2, xp: 3, gold: 3, ai: EnemyAI.Chase, atkR: 18, atkCd: 0.8, phase: true },
  golem: { name: 'Golem', hp: 20, speed: 35, size: 24, color: '#886644', dmg: 3, xp: 10, gold: 10, ai: EnemyAI.Chase, atkR: 32, atkCd: 2, boss: true },
  demon: { name: 'Demon', hp: 25, speed: 50, size: 22, color: '#cc3333', dmg: 3, xp: 12, gold: 12, ai: EnemyAI.Ranged, atkR: 250, atkCd: 1.2, projSpd: 350, projCol: '#ff4422', boss: true },
  spider: { name: 'Spider', hp: 3, speed: 100, size: 9, color: '#665544', dmg: 1, xp: 2, gold: 2, ai: EnemyAI.Chase, atkR: 16, atkCd: 0.6 },
  spiderling: { name: 'Spiderling', hp: 1, speed: 110, size: 6, color: '#887766', dmg: 1, xp: 1, gold: 0, ai: EnemyAI.Chase, atkR: 14, atkCd: 0.5 },
  necro: { name: 'Necro', hp: 5, speed: 50, size: 12, color: '#55aa77', dmg: 1, xp: 3, gold: 3, ai: EnemyAI.Ranged, atkR: 250, atkCd: 1.6, projSpd: 250, projCol: '#77cc99' },
  shieldbearer: { name: 'Shield Bearer', hp: 8, speed: 40, size: 14, color: '#7788aa', dmg: 2, xp: 4, gold: 4, ai: EnemyAI.Chase, atkR: 24, atkCd: 1.5 },
  assassin: { name: 'Assassin', hp: 2, speed: 160, size: 8, color: '#334455', dmg: 4, xp: 3, gold: 3, ai: EnemyAI.Chase, atkR: 16, atkCd: 1.2 },
  _ally: { name: 'Skeleton', hp: 4, speed: 80, size: 9, color: '#55cc55', dmg: 2, xp: 0, gold: 0, ai: EnemyAI.Chase, atkR: 20, atkCd: 0.8 },
  _wolf: { name: 'Wolf', hp: 8, speed: 120, size: 10, color: '#88aa66', dmg: 2, xp: 0, gold: 0, ai: EnemyAI.Chase, atkR: 20, atkCd: 0.6 },
  _imp: { name: 'Imp', hp: 5, speed: 90, size: 8, color: '#cc4466', dmg: 1, xp: 0, gold: 0, ai: EnemyAI.Ranged, atkR: 150, atkCd: 1.0, projSpd: 300, projCol: '#ff5577' },
};

// ═══════════════════════════════════
//           UPGRADES
// ═══════════════════════════════════

export const UPGRADE_POOL: UpgradeDef[] = [
  // -- DAMAGE --
  { name: 'Spell Power', desc: 'All spells deal +1 damage', apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 1; } },
  { name: 'Primary Boost', desc: 'Primary spell +2 damage', apply: (p: Player) => { p.cls.spells[0].dmg += 2; } },
  { name: 'Ultimate Power', desc: 'Ultimate spell +3 damage', apply: (p: Player) => { if (p.cls.spells[2].dmg) p.cls.spells[2].dmg += 3; } },
  { name: 'Glass Cannon', desc: '+3 spell damage, -2 max HP', apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 3; p.maxHp = Math.max(1, p.maxHp - 2); p.hp = Math.min(p.hp, p.maxHp); } },
  { name: 'Critical Strike', desc: '15% chance to deal 2x damage', apply: (p: Player) => { p.critChance = (p.critChance || 0) + 0.15; } },
  { name: 'Overkill', desc: 'Excess kill damage chains to nearby enemy', apply: (p: Player) => { p.overkill = true; } },

  // -- PROJECTILE MODIFIERS --
  { name: 'Piercing', desc: 'Primary passes through +1 enemy', apply: (p: Player) => { p.pierce = (p.pierce || 0) + 1; } },
  { name: 'Split Shot', desc: 'Primary fires 2 extra bolts at +/-15 deg', apply: (p: Player) => { p.splitShot = (p.splitShot || 0) + 2; } },
  { name: 'Ricochet', desc: 'Projectiles bounce off walls once', apply: (p: Player) => { p.ricochet = (p.ricochet || 0) + 1; } },
  { name: 'Velocity', desc: 'Projectile speed +40%', apply: (p: Player) => { for (const s of p.cls.spells) if (s.speed) s.speed *= 1.4; } },
  { name: 'Chain Hit', desc: 'Hits jump to 1 nearby enemy for 50% dmg', apply: (p: Player) => { p.chainHit = (p.chainHit || 0) + 1; } },
  { name: 'Homing Bolts', desc: 'Primary slightly tracks enemies', apply: (p: Player) => { const s = p.cls.spells[0]; s.homing = (s.homing || 0) + 1.5; } },
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
  { name: 'Max Mana +30', desc: 'Bigger mana pool', apply: (p: Player) => { p.maxMana += 30; p.mana += 30; } },
  { name: 'Mana on Kill', desc: 'Restore 8 mana per kill', apply: (p: Player) => { p.manaOnKill = (p.manaOnKill || 0) + 8; } },
  { name: 'Spell Thief', desc: 'Hits restore 2 mana', apply: (p: Player) => { p.manaOnHit = (p.manaOnHit || 0) + 2; } },

  // -- SURVIVABILITY --
  { name: 'Vitality', desc: 'Max HP +2, heal to full', apply: (p: Player) => { p.maxHp += 2; p.hp = p.maxHp; } },
  { name: 'Armor', desc: 'Take -1 damage (min 1)', apply: (p: Player) => { p.armor = (p.armor || 0) + 1; } },
  { name: 'Vampirism', desc: 'Heal 1 HP per 4 kills', apply: (p: Player) => { p.vampirism = (p.vampirism || 0) + 1; p.vampKillReq = 4; } },
  { name: 'Life Steal', desc: '5% of damage dealt heals you', apply: (p: Player) => { p.lifeSteal = (p.lifeSteal || 0) + 0.05; } },
  { name: 'Second Wind', desc: 'Revive once per floor with 50% HP', apply: (p: Player) => { p.secondWind = (p.secondWind || 0) + 1; } },
  { name: 'Thorns', desc: 'Enemies take 1 damage when they hit you', apply: (p: Player) => { p.thorns = (p.thorns || 0) + 1; } },
  { name: 'Dodge', desc: '15% chance to avoid damage entirely', apply: (p: Player) => { p.dodgeChance = (p.dodgeChance || 0) + 0.15; } },

  // -- MOBILITY --
  { name: 'Quick Step', desc: 'Move speed +25%', apply: (p: Player) => { p.moveSpeed *= 1.25; } },
  { name: 'Dash', desc: 'Press SHIFT to dash. 2s cooldown.', apply: (p: Player) => { p.hasDash = true; p.dashCd = 0; } },
  { name: 'Momentum', desc: 'Moving increases damage by up to 20%', apply: (p: Player) => { p.momentum = true; } },

  // -- AREA / ZONE --
  { name: 'Lingering', desc: 'Zones last 50% longer', apply: (p: Player) => { for (const s of p.cls.spells) if (s.duration) s.duration *= 1.5; } },
  { name: 'Deep Freeze', desc: 'Slow effects 2x stronger', apply: (p: Player) => { for (const s of p.cls.spells) if (s.slow) s.slow *= 2; } },
  { name: 'Aftershock', desc: 'AoE spells leave a damage zone for 2s', apply: (p: Player) => { p.aftershock = true; } },

  // -- SECONDARY (RMB) UPGRADES --
  { name: 'Secondary Mastery', desc: 'RMB cooldown -40%', apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].cd *= 0.6; } },
  { name: 'Double Secondary', desc: 'RMB fires/activates twice', apply: (p: Player) => { p.doubleSecondary = (p.doubleSecondary || 0) + 1; } },
  { name: 'Secondary Power', desc: 'RMB +3 damage', apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].dmg = (p.cls.spells[1].dmg || 0) + 3; } },
  { name: 'Free Cast', desc: 'RMB costs no mana (extra 2s cooldown)', apply: (p: Player) => { if (p.cls.spells[1]) { p.cls.spells[1].mana = 0; p.cls.spells[1].cd += 2; } } },
  { name: 'Combo', desc: 'RMB deals +50% dmg if target was hit by LMB recently', apply: (p: Player) => { p.comboBonus = true; } },
  { name: 'Area Secondary', desc: 'RMB range/radius +50%', apply: (p: Player) => { const s = p.cls.spells[1]; if (s) { if (s.range) s.range *= 1.5; if (s.radius) s.radius *= 1.5; if (s.aoeR) s.aoeR *= 1.5; } } },

  // -- ULTIMATE (R) UPGRADES --
  { name: 'Quick Charge', desc: 'Ultimate charges 50% faster', apply: (p: Player) => { p.ultChargeRate = (p.ultChargeRate || 1) * 1.5; } },
  { name: 'Ult Mastery', desc: 'Ultimate deals 2x damage/effect', apply: (p: Player) => { p.ultPower = (p.ultPower || 1) * 2; } },
  { name: 'Overflow', desc: 'Ult charges to 200% for double cast', apply: (p: Player) => { p.ultOverflow = true; } },
  { name: 'Ult Echo', desc: 'After ult, next 5 primary shots deal 2x', apply: (p: Player) => { p.ultEcho = (p.ultEcho || 0) + 5; } },
  { name: 'Ult Regen', desc: 'Using ult restores 50% HP', apply: (p: Player) => { p.ultHeal = true; } },

  // -- CROSS-SPELL SYNERGIES --
  { name: 'Spell Weaving', desc: 'Alternating LMB/RMB: +25% dmg per swap (3x max)', apply: (p: Player) => { p.spellWeaving = true; } },
  { name: 'Cooldown Cascade', desc: 'LMB kills reduce RMB cooldown by 1s', apply: (p: Player) => { p.cdCascade = true; } },
  { name: 'Full Rotation', desc: 'Use all 3 spells in 5s: 3x attack speed for 3s', apply: (p: Player) => { p.fullRotation = true; } },
  { name: 'Q Mastery', desc: 'Q skill cooldown -35%, +2 damage', apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].cd *= 0.65; p.cls.spells[2].dmg = (p.cls.spells[2].dmg || 0) + 2; } } },
  { name: 'Skill Reset', desc: 'Using ult resets Q and RMB cooldowns', apply: (p: Player) => { p.ultResetCDs = true; } },

  // -- WILD / FUN --
  { name: 'Chaos Bolts', desc: 'Primary deals random 1-4 damage', apply: (p: Player) => { p.chaosDmg = true; } },
  { name: 'Magnet', desc: 'Pickups fly to you from further away', apply: (p: Player) => { p.magnetRange = (p.magnetRange || 30) + 60; } },
  { name: 'Gold Rush', desc: 'Enemies drop 2x gold', apply: (p: Player) => { p.goldMul = (p.goldMul || 1) * 2; } },
  { name: 'XP Boost', desc: 'Gain upgrades 30% more often', apply: (p: Player) => { p.xpBoost = (p.xpBoost || 0) + 0.3; } },
  { name: 'Friendly Fire', desc: '+2 dmg but your spells can hurt you', apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 2; p.selfDmg = true; } },
];
