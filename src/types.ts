// ═══════════════════════════════════
//          TYPE DEFINITIONS
// ═══════════════════════════════════

export enum GamePhase {
  Lobby = 'lobby',
  Select = 'select',
  Countdown = 'countdown',
  Playing = 'playing',
  Upgrade = 'upgrade',
  GameOver = 'gameover',
  Victory = 'victory',
}

export enum NetworkMode {
  None = 'none',
  Local = 'local',
  Host = 'host',
  Guest = 'guest',
}

export enum EnemyAI {
  Chase = 'chase',
  Ranged = 'ranged',
}

export enum SpellType {
  Projectile = 'projectile',
  Homing = 'homing',
  Beam = 'beam',
  Cone = 'cone',
  Nova = 'nova',
  AoeDelayed = 'aoe_delayed',
  Blink = 'blink',
  Barrage = 'barrage',
  Zone = 'zone',
  Rewind = 'rewind',
  Leap = 'leap',
  AllyShield = 'ally_shield',
  Trap = 'trap',
  Ultimate = 'ultimate',
}

export enum PickupType {
  Chest = 'chest',
  Health = 'health',
  Gold = 'gold',
  Xp = 'xp',
  Trap = 'trap',
}

export enum SfxName {
  Fire = 'fire',
  Ice = 'ice',
  Zap = 'zap',
  Arcane = 'arcane',
  Hit = 'hit',
  Boom = 'boom',
  Kill = 'kill',
  Blink = 'blink',
  Door = 'door',
  Pickup = 'pickup',
}

// ── Spell definitions ──

export interface SpellDef {
  name: string;
  key: string;
  type: SpellType;
  dmg: number;
  speed: number;
  radius: number;
  mana: number;
  cd: number;
  life: number;
  color: string;
  trail: string;
  // Optional modifiers
  explode: number;
  burn: number;
  slow: number;
  stun: number;
  drain: number;
  homing: number;
  zap: number;
  zapRate: number;
  pierce: number;
  range: number;
  width: number;
  angle: number;
  count: number;
  spread: number;
  delay: number;
  duration: number;
  tickRate: number;
  aoeR: number;
  heal: number;
  ultCharge: number;
}

/** Partial spell definition as written in CLASSES constants (many fields optional) */
export type SpellDefInput = Partial<SpellDef> & {
  name: string;
  key: string;
  type: SpellType;
  mana: number;
  cd: number;
  color: string;
};

export interface ClassPassive {
  name: string;
  desc: string;
}

export interface ClassDef {
  name: string;
  color: string;
  glow: string;
  desc: string;
  passive: ClassPassive;
  spells: SpellDef[];
}

/** The shape used in the CLASSES constant (spells are partial) */
export interface ClassDefInput {
  name: string;
  color: string;
  glow: string;
  desc: string;
  passive: ClassPassive;
  spells: SpellDefInput[];
}

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  size: number;
  color: string;
  dmg: number;
  xp: number;
  gold: number;
  ai: EnemyAI;
  atkR: number;
  atkCd: number;
  projSpd?: number;
  projCol?: string;
  phase?: boolean;
  boss?: boolean;
  explodeOnDeath?: number;  // explosion radius on death (damages players)
  teleport?: boolean;       // periodically teleports near target
  splitInto?: string;       // spawns 2 of this enemy type on death
  enrage?: boolean;         // speeds up as HP decreases
}

// ── Runtime entities ──

export interface Player {
  idx: number;
  cls: ClassDef;
  clsKey: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  manaRegen: number;
  alive: boolean;
  iframes: number;
  slowTimer: number;
  stunTimer: number;
  cd: number[];
  moveSpeed: number;
  ultCharge: number;
  ultReady: boolean;
  hitCounter: number;
  killCount: number;
  xp: number;
  xpToNext: number;
  level: number;
  takenUpgrades: Map<number, number>;

  // Upgrade-applied properties
  vampirism: number;
  vampKillReq: number;
  pierce: number;
  armor: number;
  critChance: number;
  overkill: boolean;
  splitShot: number;
  ricochet: number;
  chainHit: number;
  doubleTap: number;
  killResetCD: boolean;
  manaOnKill: number;
  manaOnHit: number;
  lifeSteal: number;
  secondWind: number;
  thorns: number;
  dodgeChance: number;
  critMul: number;
  hpRegen: number;
  chainFullDmg: boolean;
  hasDash: boolean;
  dashCd: number;
  momentum: boolean;
  aftershock: boolean;
  chaosDmg: boolean;
  magnetRange: number;
  goldMul: number;
  xpBoost: number;
  selfDmg: boolean;

  // Secondary (RMB) upgrades
  doubleSecondary: number;
  comboBonus: boolean;
  // Ultimate (R) upgrades
  ultChargeRate: number;
  ultPower: number;
  ultOverflow: boolean;
  ultEcho: number;
  ultEchoLeft: number;
  ultHeal: boolean;
  ultResetCDs: boolean;
  // Cross-spell synergies
  spellWeaving: boolean;
  spellWeaveStack: number;
  lastSpellSlot: number;
  cdCascade: boolean;
  fullRotation: boolean;
  fullRotationTimer: number;
  fullRotationSpells: number;
  fullRotationBuff: number;

  // Class-specific upgrade flags
  burnSpread: boolean;
  magmaArmor: boolean;
  fireZoneOnExplode: boolean;
  shatter: boolean;
  permafrost: boolean;
  iceArmor: boolean;
  chainLightning: number;
  overcharge: boolean;
  stormShield: boolean;
  _stormTimer: number;
  blinkExplode: boolean;
  spellMirror: number;
  raiseDead: number;
  deathMark: boolean;
  soulWell: boolean;
  timeLoop: number;
  hasteZone: boolean;
  temporalEcho: boolean;
  shieldBounce: number;
  tauntAura: boolean;
  bloodlust: boolean;
  undyingRage: number;
  reflectShield: boolean;
  resurrection: boolean;
  packLeader: boolean;
  overgrowthHeal: boolean;
  barkSkinRegen: boolean;
  soulSiphon: boolean;
  demonicPact: boolean;
  hexChain: number;
  zenMana: boolean;
  turretArmy: boolean;
  laserTurret: boolean;
  turretExplode: boolean;

  // Qualitative upgrade flags
  boomerang: boolean;
  volatile: boolean;
  forkOnKill: boolean;
  gravityWell: boolean;
  spectral: boolean;
  frozenTouch: boolean;
  seekerMines: boolean;
  burstFire: boolean;

  // Hyperbolic stacking accumulators (raw sums before diminishing returns)
  _hyperAcc: Record<string, number>;

  // Internal timers / state
  _snapTimer: number;
  _rewindSnap: { hp: number; mana: number } | null;
  _hasteBonus: boolean;
  _furyActive: boolean;
  _auraTick: number;
  _timeStopTimer: number;
  _rage: number;
  _rageDmgMul: number;
  _shieldWall: number;
  _holyShield: number;

  // Animation state
  _animCastFlash: number;     // timer for casting glow (decays to 0)
  _animHitFlash: number;      // timer for hit reaction flash (decays to 0)
  _animDeathFade: number;     // 1.0 → 0.0 fade out on death (-1 when not dying)
  _animMoving: boolean;       // true when velocity is non-zero
}

export interface Enemy {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  atkTimer: number;
  target: number;
  iframes: number;
  slowTimer: number;
  stunTimer: number;

  // Burn DOT
  _burnTimer: number;
  _burnTick: number;
  _burnOwner: number;

  // Friendly summon fields (necromancer ult)
  _friendly: boolean;
  _owner: number;
  _lifespan: number;

  // Wave speed multiplier
  _spdMul: number;
  // Wave damage multiplier
  _dmgMul: number;

  // Teleport ability timer
  _teleportTimer: number;

  // Animation state
  _hitFlash: number;    // timer for white flash on hit (starts at 0.12, counts down)
  _deathTimer: number;  // death animation timer (-1 = alive, 0.4 = just died, counts down to 0)
  _atkAnim: number;     // attack wind-up animation timer (starts at 0.2, counts down)
}

export interface Spell {
  type: string;
  dmg: number;
  speed: number;
  radius: number;
  life: number;
  color: string;
  trail: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  age: number;
  zapTimer: number;
  pierceLeft: number;
  // Optional modifiers carried from def
  homing: number;
  zap: number;
  zapRate: number;
  slow: number;
  drain: number;
  explode: number;
  burn: number;
  stun: number;
  clsKey: string;
  _reversed: boolean;
  _bounces: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  color: string;
}

export interface Trail {
  x: number;
  y: number;
  life: number;
  r: number;
  color: string;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxR: number;
  life: number;
  color: string;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

export interface Beam {
  x: number;
  y: number;
  angle: number;
  range: number;
  width: number;
  color: string;
  life: number;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
  duration: number;
  dmg: number;
  color: string;
  owner: number;
  slow: number;
  tickRate: number;
  tickTimer: number;
  age: number;
  drain: number;
  heal: number;
  pull: number;
  freezeAfter: number;
  _turret?: boolean;
  _megaTurret?: boolean;
}

export interface AoeMarker {
  x: number;
  y: number;
  radius: number;
  delay: number;
  dmg: number;
  color: string;
  owner: number;
  stun: number;
  age: number;
}

export interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  radius: number;
  color: string;
  _bounces?: number;
}

export interface Pillar {
  x: number;
  y: number;
  radius: number;
}

export interface Pickup {
  x: number;
  y: number;
  type: PickupType;
  collected: boolean;
  value: number;
  // Trap-specific
  _owner: number;
  _dmg: number;
  _radius: number;
  _slow: number;
  _color: string;
}

export interface PlayerInput {
  angle: number;
  mx: number;
  my: number;
  shoot: boolean;
  shoot2: boolean;
  ability: boolean;
  ult: boolean;
  dash: boolean;
}

export interface UpgradeDef {
  name: string;
  desc: string;
  apply: (p: Player, stacks: number) => void;
  /** If set, only offered to this class */
  forClass?: string;
  /** Color hint for UI */
  color?: string;
  /** If true, can be picked multiple times (stacks) */
  stackable?: boolean;
  /** Maximum number of times this upgrade can be stacked (only relevant if stackable) */
  maxStacks?: number;
  /** Index in UPGRADE_POOL this evolves FROM (only on evolution upgrades) */
  evolvesFrom?: number;
  /** If true, this is an evolution — never offered normally */
  isEvolution?: boolean;
}

// ── Network message types ──

export interface NetInputMessage {
  type: 'input';
  angle: number;
  mx: number;
  my: number;
  shoot: boolean;
  shoot2: boolean;
  ability: boolean;
  ult: boolean;
  dash: boolean;
}

export interface NetClassMessage {
  type: 'cls';
  cls: string;
}

export interface NetGoMessage {
  type: 'go';
  h: string;
  g: string;
}

export interface NetUpgradeMessage {
  type: 'upgrade';
  indices: number[];
}

export interface NetHostPickedMessage {
  type: 'host_picked';
  idx: number;
}

export interface NetGuestPickedMessage {
  type: 'guest_picked';
  idx: number;
}

export interface NetResumeMessage {
  type: 'resume';
}

export interface NetStatePlayerData {
  x: number;
  y: number;
  a: number;
  hp: number;
  mhp: number;
  mn: number;
  mmn: number;
  al: boolean;
  cd: number[];
  if: boolean;
}

export interface NetStateEnemyData {
  t: string;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  al: boolean;
  tgt: number;
}

export interface NetStateSpellData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  c: string;
  o: number;
}

export interface NetStateEProjData {
  x: number;
  y: number;
  r: number;
  c: string;
}

export interface NetStateZoneData {
  x: number;
  y: number;
  r: number;
  c: string;
  age: number;
  dur: number;
}

export interface NetStateAoeData {
  x: number;
  y: number;
  r: number;
  c: string;
  age: number;
  del: number;
}

export interface NetStatePickupData {
  x: number;
  y: number;
  t: PickupType;
}

export interface NetStatePillarData {
  x: number;
  y: number;
  r: number;
}

export interface NetStateMessage {
  type: 'state';
  p: NetStatePlayerData[];
  e: NetStateEnemyData[];
  sp: NetStateSpellData[];
  ep: NetStateEProjData[];
  zn: NetStateZoneData[];
  aoe: NetStateAoeData[];
  pk: NetStatePickupData[];
  pl: NetStatePillarData[];
  w: number;
  wA: boolean;
  wBr: number;
  g: number;
  tk: number;
  gp: GamePhase;
  ct: number;
  sc: number;
  sk: number;
}

export type NetMessage =
  | NetInputMessage
  | NetClassMessage
  | NetGoMessage
  | NetUpgradeMessage
  | NetHostPickedMessage
  | NetGuestPickedMessage
  | NetResumeMessage
  | NetStateMessage;
