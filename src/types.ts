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
  combo?: {
    steps: number;          // Total combo hits (2-4)
    timeout: number;        // Reset window in seconds
    dmgScale: number[];     // Damage multiplier per step [0.8, 1.2, 2.5]
    effects?: {             // Per-step bonus effects (keyed by step number, 1-indexed)
      [step: number]: { stun?: number; aoeR?: number; slow?: number; knockback?: number }
    }
  };
  // Charge-up fields
  chargeTime: number;      // Max charge duration in seconds (0.5-2.5)
  chargeSlow: number;      // Movement speed multiplier while charging (0.3-0.8)
  chargeMinDmg: number;    // Damage at 0 charge (tap-fire). Defaults to dmg * 0.3
  chargeMaxDmg: number;    // Damage at full charge. Defaults to dmg * 3
  chargePierce: number;    // At full charge, projectile gains this many pierce
  chargeRadius: number;    // At full charge, explosion/aoe gains this much extra radius
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

// ── Stance switching ──

export interface StanceFormDef {
  name: string;
  spells: SpellDefInput[];
  passive?: ClassPassive;
  moveSpeed?: number;
  color?: string;
  glow?: string;
}

export interface StanceFormResolved {
  name: string;
  spells: SpellDef[];
  passive?: ClassPassive;
  moveSpeed?: number;
  color?: string;
  glow?: string;
}

export interface StanceDef {
  formA: StanceFormDef;
  formB: StanceFormDef;
  switchCd: number;
  switchBuff?: { duration: number; dmgMult?: number; armor?: number; };
}

export interface StanceResolved {
  formA: StanceFormResolved;
  formB: StanceFormResolved;
  switchCd: number;
  switchBuff?: { duration: number; dmgMult?: number; armor?: number; };
}

export interface ClassDef {
  name: string;
  color: string;
  glow: string;
  desc: string;
  passive: ClassPassive;
  spells: SpellDef[];
  // Per-class base stats (optional, fall back to global constants)
  hp?: number;
  moveSpeed?: number;
  maxMana?: number;
  manaRegen?: number;
  stanceForms?: StanceResolved;
}

/** The shape used in the CLASSES constant (spells are partial) */
export interface ClassDefInput {
  name: string;
  color: string;
  glow: string;
  desc: string;
  passive: ClassPassive;
  spells: SpellDefInput[];
  // Per-class base stats (optional, fall back to global constants)
  hp?: number;
  moveSpeed?: number;
  maxMana?: number;
  manaRegen?: number;
  stanceForms?: StanceDef;
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
  damageTakenMul: number;   // multiplier for incoming damage (1 = normal)
  selfDmgChance: number;    // chance to take self-damage when casting (0 = none)

  // Q ability upgrades
  doubleQ: number;

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

  // Combo chain state
  comboChainCount: number;     // Current combo step (0 = no active chain)
  comboChainTimer: number;     // Time since last combo hit (resets chain at timeout)
  comboChainSlot: number;      // Which spell slot the active combo is on (-1 = none)

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
  _timeLoopUsed: boolean;
  _hasteTimer: number;
  shieldBounce: number;
  tauntAura: boolean;
  bloodlust: boolean;
  _bloodlustStacks: number;
  undyingRage: number;
  reflectShield: boolean;
  resurrection: boolean;
  _resurrectionCd: number;
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

  // Base spell damage before upgrades (for soft cap calculation)
  _baseSpellDmg: number[];

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

  // Bladecaller state
  _lastShadowStep: number;    // timestamp of last Shadow Step cast
  _rushSpeed: number;          // timestamp until speed boost expires

  // Architect state
  _fortified: boolean;         // near own zone DR flag

  // Warden state
  _facingDR: boolean;          // facing enemies DR flag
  _wardenDR: number;           // allied warden DR timer
  _invulnTimer: number;        // invulnerability timer

  // Ranger Eagle Eye state
  _eagleEyeStreak: number;      // consecutive arrow hits (crits at 3+)
  _eagleEyeTimer: number;       // seconds until streak resets (1.5s window)

  // Cannoneer state
  _cannonShots: number;        // cannoneer shot counter

  // Charge-up state
  _chargeLevel: number;     // 0.0-1.0 progress
  _chargeSlot: number;      // which spell slot (0=LMB, 1=RMB) is charging, -1 if none

  // Tidecaller state
  _summonCount: number;        // tidecaller active summon count

  // Stance switching state
  currentForm?: 'A' | 'B';       // Current active form (undefined = no stance class)
  formSwitchCd: number;           // Remaining cooldown on form switch
  formSwitchBuff: number;         // Remaining duration of switch buff
  _formDmgMult: number;           // Active dmg multiplier from switch buff
  _formArmor: number;             // Active armor from switch buff

  // Animation state
  _animCastFlash: number;     // timer for casting glow (decays to 0)
  _animHitFlash: number;      // timer for hit reaction flash (decays to 0)
  _animDeathFade: number;     // 1.0 → 0.0 fade out on death (-1 when not dying)
  _animMoving: boolean;       // true when velocity is non-zero
  _animUltTimer: number;      // timer for class-specific ult animation (decays to 0)
  respawnTimer: number;

  // Network interpolation (guest only)
  _targetX?: number;
  _targetY?: number;
  _prevX?: number;
  _prevY?: number;
  _lerpT?: number;
  _serverVx?: number;   // last known host velocity
  _serverVy?: number;
}

export interface Enemy {
  id: number;
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

  // Cross-spell synergy: LMB hit timer for Combo augment
  _lmbHitTimer: number;

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

  // Boss damage reduction phase (wave 15+)
  _dmgReductionActive: boolean;  // true during the 3s reduction phase
  _dmgReductionTimer: number;    // countdown timer (starts at 3, counts to 0)
  _dmgReductionTriggered: boolean; // true once triggered (prevents re-trigger)

  // Elite variant flag
  _elite: boolean;

  // Hexblade hex stacks
  _hexStacks: number;

  // Warden mark (allies deal +1 dmg)
  _wardenMark: boolean;

  // Soulbinder mark expiry timestamp
  _soulMark: number;

  // Network interpolation (guest only)
  _targetX?: number;
  _targetY?: number;
  _prevX?: number;
  _prevY?: number;
  _lerpT?: number;
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
  _slot: number;
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
  stun: number;
  _turret?: boolean;
  _megaTurret?: boolean;
  _hasteZone?: boolean;
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
  /** If true, this is a cursed upgrade — benefit + drawback */
  isCursed?: boolean;
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
  vx: number;   // x velocity for prediction
  vy: number;   // y velocity for prediction
  hp: number;
  mhp: number;
  mn: number;
  mmn: number;
  al: boolean;
  cd: number[];
  if: boolean;
}

export interface NetStateEnemyData {
  i: number;
  t: string;
  x: number;
  y: number;
  hp?: number;
  mhp?: number;
  al: boolean;
  tgt?: number;
}

export interface NetStateSpellData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  c: string;
  o: number;
  // Rendering-critical fields
  k: string;   // clsKey
  t: string;   // type
  tr: string;  // trail color
  ex: number;  // explode
  sl: number;  // slow
  ho: number;  // homing
  z: number;   // zap
  dr: number;  // drain
  bn: number;  // burn
  st: number;  // stun
  l: number;   // life
  ag: number;  // age
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

export interface NetFxEvent {
  t: 'p' | 't' | 'sw' | 's';  // particle, text, shockwave, sfx
  x: number;
  y: number;
  c: string;  // color
  n?: number;  // count (particles)
  s?: number;  // scale (particles)
  tx?: string; // text content
  mr?: number; // maxR (shockwave)
  sn?: string; // sfx name
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
  lv: number;   // lives remaining
  mlv: number;  // max lives
  fx?: NetFxEvent[];  // visual effect events for guest replay
}

export interface NetDeltaMessage {
  type: 'delta';
  p?: NetStatePlayerData[];
  e?: NetStateEnemyData[];
  sp?: NetStateSpellData[];
  ep?: NetStateEProjData[];
  zn?: NetStateZoneData[];
  aoe?: NetStateAoeData[];
  pk?: NetStatePickupData[];
  pl?: NetStatePillarData[];
  w?: number;
  wA?: boolean;
  wBr?: number;
  g?: number;
  tk?: number;
  gp?: GamePhase;
  ct?: number;
  sc?: number;
  sk?: number;
  lv?: number;
  mlv?: number;
  fx?: NetFxEvent[];
}

export type NetMessage =
  | NetInputMessage
  | NetClassMessage
  | NetGoMessage
  | NetUpgradeMessage
  | NetHostPickedMessage
  | NetGuestPickedMessage
  | NetResumeMessage
  | NetStateMessage
  | NetDeltaMessage;

export interface NetBatchMessage {
  type: 'batch';
  msgs: NetMessage[];
}

export type NetWireMessage = NetMessage | NetBatchMessage;

// Re-export SoA enemy pool types
export { EnemyPool, EnemyView } from './ecs/enemy-pool';
export type { EnemyInit } from './ecs/enemy-pool';
export type { SpellView } from './ecs/spell-pool';
export type { EProjView } from './ecs/eproj-pool';
