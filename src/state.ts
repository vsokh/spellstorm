import {
  GamePhase,
  NetworkMode,
  Player,
  Enemy,
  Spell,
  Particle,
  Trail,
  Shockwave,
  FloatingText,
  Beam,
  Zone,
  AoeMarker,
  EnemyProjectile,
  Pillar,
  Pickup,
  PlayerInput,
  ClassDef,
  SpellDef,
  SpellDefInput,
  NetFxEvent,
  EnemyPool,
  SfxName,
} from './types';
import { sfx } from './audio';
import { SpatialGrid } from './ecs/spatial-grid';
import { SpellPool } from './ecs/spell-pool';
import { EProjPool } from './ecs/eproj-pool';
import {
  WIZARD_HP,
  MAX_MANA,
  MANA_REGEN,
  DEFAULT_MOVE_SPEED,
  CLASSES,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  DEFAULT_LIVES,
  NET_SEND_INTERVAL,
  MAX_PARTICLES,
  MAX_TRAILS,
  MAX_SHOCKWAVES,
  MAX_FLOATING_TEXTS,
  MAX_SPELLS,
  MAX_EPROJ,
  MAX_ZONES,
  MAX_AOE_MARKERS,
  MAX_BEAMS,
} from './constants';
import { Pool } from './systems/pools';

// ═══════════════════════════════════
//        GAME STATE
// ═══════════════════════════════════

/** Central mutable game state passed to all systems */
export interface GameState {
  // Screen dimensions
  width: number;
  height: number;

  // Core mode / phase
  mode: NetworkMode;
  gamePhase: GamePhase;
  localIdx: number;

  // Timing
  time: number;
  shakeIntensity: number;
  shakeX: number;
  shakeY: number;
  screenFlash: number;
  screenFlashColor: string;

  // Camera
  camX: number;
  camY: number;

  // Wave progress
  wave: number;
  waveActive: boolean;
  waveBreakTimer: number;
  waveEnemiesTotal: number;
  totalKills: number;
  gold: number;
  countdownTimer: number;

  // Input
  keys: Record<string, boolean>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  rightDown: boolean;

  // Entities
  players: Player[];
  enemies: EnemyPool;
  spells: SpellPool;
  particles: Pool<Particle>;
  trails: Pool<Trail>;
  shockwaves: Pool<Shockwave>;
  texts: Pool<FloatingText>;
  beams: Pool<Beam>;
  zones: Pool<Zone>;
  aoeMarkers: Pool<AoeMarker>;
  eProj: EProjPool;
  pillars: Pillar[];
  pickups: Pickup[];

  // Wave trickle spawn
  waveSpawnQueue: number;
  waveSpawnTimer: number;
  bossMinionQueue: number;
  bossMinionTimer: number;
  bossMinionInterval: number;

  // Combo & hitstop
  comboCount: number;
  comboTimer: number;
  hitStop: number;

  // Network remote input
  remoteInput: PlayerInput;

  // Upgrade state
  pendingUpgradeChoices: number[] | null;
  upgradePickedLocal: boolean;
  upgradePickedRemote: boolean;

  // Network
  netTimer: number;
  _lastNetTime: number;    // performance.now() of last received net packet (guest)
  _netInterval: number;    // measured interval between net packets in seconds (EMA)

  // Class selection
  selectedClassIndex: number;
  hostClassKey: string | null;
  guestClassKey: string | null;

  // Shop state
  shopOpen: boolean;
  shopPurchases: Record<string, number>; // tracks how many times each item was bought
  shopTempDmg: number; // temporary damage boost from Power Shard
  shopShieldHits: number; // remaining shield hits from Ward Stone

  // Synergy
  activeSynergy: { name: string; desc: string; color: string } | null;
  synergyBannerTimer: number;

  // Lives system
  lives: number;
  maxLives: number;

  // Network fx queue (host collects, sends to guest)
  pendingFx: NetFxEvent[];

  // Monotonic enemy ID counter (host only)
  _nextEnemyId: number;

  // Spatial grid for broad-phase enemy collision queries
  enemyGrid: SpatialGrid;
}

export function createInitialState(): GameState {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    mode: NetworkMode.None,
    gamePhase: GamePhase.Lobby,
    localIdx: 0,
    time: 0,
    shakeIntensity: 0,
    shakeX: 0,
    shakeY: 0,
    screenFlash: 0,
    screenFlashColor: '255,255,255',
    camX: 0,
    camY: 0,
    wave: 1,
    waveActive: false,
    waveBreakTimer: 0,
    waveEnemiesTotal: 0,
    totalKills: 0,
    gold: 0,
    countdownTimer: 0,
    waveSpawnQueue: 0,
    waveSpawnTimer: 0,
    bossMinionQueue: 0,
    bossMinionTimer: 0,
    bossMinionInterval: 0,
    comboCount: 0,
    comboTimer: 0,
    hitStop: 0,
    keys: {},
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    mouseDown: false,
    rightDown: false,
    players: [],
    enemies: new EnemyPool(),
    spells: new SpellPool(MAX_SPELLS),
    particles: new Pool<Particle>(MAX_PARTICLES, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 0, color: '' })),
    trails: new Pool<Trail>(MAX_TRAILS, () => ({ x: 0, y: 0, life: 0, r: 0, color: '' })),
    shockwaves: new Pool<Shockwave>(MAX_SHOCKWAVES, () => ({ x: 0, y: 0, radius: 0, maxR: 0, life: 0, color: '' })),
    texts: new Pool<FloatingText>(MAX_FLOATING_TEXTS, () => ({ x: 0, y: 0, text: '', color: '', life: 0, vy: 0 })),
    beams: new Pool<Beam>(MAX_BEAMS, () => ({ x: 0, y: 0, angle: 0, range: 0, width: 0, color: '', life: 0 })),
    zones: new Pool<Zone>(MAX_ZONES, () => ({ x: 0, y: 0, radius: 0, duration: 0, dmg: 0, color: '', owner: 0, slow: 0, tickRate: 0, tickTimer: 0, age: 0, drain: 0, heal: 0, pull: 0, freezeAfter: 0, stun: 0, _turret: false, _megaTurret: false })),
    aoeMarkers: new Pool<AoeMarker>(MAX_AOE_MARKERS, () => ({ x: 0, y: 0, radius: 0, delay: 0, dmg: 0, color: '', owner: 0, stun: 0, age: 0 })),
    eProj: new EProjPool(MAX_EPROJ),
    pillars: [],
    pickups: [],
    remoteInput: { angle: 0, mx: 0, my: 0, shoot: false, shoot2: false, ability: false, ult: false, dash: false },
    pendingUpgradeChoices: null,
    upgradePickedLocal: false,
    upgradePickedRemote: false,
    netTimer: 0,
    _lastNetTime: 0,
    _netInterval: NET_SEND_INTERVAL,
    selectedClassIndex: 0,
    hostClassKey: null,
    guestClassKey: null,
    shopOpen: false,
    shopPurchases: {},
    shopTempDmg: 0,
    shopShieldHits: 0,
    activeSynergy: null,
    synergyBannerTimer: 0,
    lives: 0,
    maxLives: 0,
    pendingFx: [],
    _nextEnemyId: 1,
    enemyGrid: new SpatialGrid(128, ROOM_WIDTH, ROOM_HEIGHT),
  };
}

/** Deep-copy a class definition so upgrades don't mutate the constant */
export function cloneClassDef(key: string): ClassDef {
  const src = CLASSES[key] ?? CLASSES[Object.keys(CLASSES)[0]];
  return {
    name: src.name,
    color: src.color,
    glow: src.glow,
    desc: src.desc,
    passive: { ...src.passive },
    spells: src.spells.map(s => normalizeSpellDef({ ...s })),
  };
}

/** Fill in all optional fields on a SpellDefInput to produce a full SpellDef */
function normalizeSpellDef(input: SpellDefInput): SpellDef {
  return {
    name: input.name,
    key: input.key,
    type: input.type,
    dmg: input.dmg ?? 0,
    speed: input.speed ?? 0,
    radius: input.radius ?? 0,
    mana: input.mana,
    cd: input.cd,
    life: input.life ?? 0,
    color: input.color,
    trail: input.trail ?? '',
    explode: input.explode ?? 0,
    burn: input.burn ?? 0,
    slow: input.slow ?? 0,
    stun: input.stun ?? 0,
    drain: input.drain ?? 0,
    homing: input.homing ?? 0,
    zap: input.zap ?? 0,
    zapRate: input.zapRate ?? 0,
    pierce: input.pierce ?? 0,
    range: input.range ?? 0,
    width: input.width ?? 0,
    angle: input.angle ?? 0,
    count: input.count ?? 0,
    spread: input.spread ?? 0,
    delay: input.delay ?? 0,
    duration: input.duration ?? 0,
    tickRate: input.tickRate ?? 0,
    aoeR: input.aoeR ?? 0,
    heal: input.heal ?? 0,
    ultCharge: input.ultCharge ?? 0,
  };
}

/** Create a fresh Player from a class key */
export function createPlayer(idx: number, clsKey: string): Player {
  const cls = cloneClassDef(clsKey);
  return {
    idx,
    cls,
    clsKey,
    x: ROOM_WIDTH / 2 + (idx === 0 ? -30 : 30),
    y: ROOM_HEIGHT * 0.6,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: WIZARD_HP,
    maxHp: WIZARD_HP,
    mana: MAX_MANA,
    maxMana: MAX_MANA,
    manaRegen: MANA_REGEN,
    alive: true,
    iframes: 1.5,
    slowTimer: 0,
    stunTimer: 0,
    cd: [0, 0, 0, 0],
    moveSpeed: DEFAULT_MOVE_SPEED,
    ultCharge: 0,
    ultReady: false,
    hitCounter: 0,
    killCount: 0,
    xp: 0,
    xpToNext: 20,
    level: 0,
    takenUpgrades: new Map<number, number>(),
    vampirism: 0,
    vampKillReq: 5,
    pierce: 0,
    armor: 0,
    critChance: 0,
    overkill: false,
    splitShot: 0,
    ricochet: 0,
    chainHit: 0,
    doubleTap: 0,
    killResetCD: false,
    manaOnKill: 0,
    manaOnHit: 0,
    lifeSteal: 0,
    secondWind: 0,
    thorns: 0,
    dodgeChance: 0,
    critMul: 2,
    hpRegen: 0,
    chainFullDmg: false,
    hasDash: false,
    dashCd: 0,
    momentum: false,
    aftershock: false,
    chaosDmg: false,
    magnetRange: 30,
    goldMul: 1,
    xpBoost: 0,
    selfDmg: false,
    damageTakenMul: 1,
    selfDmgChance: 0,
    doubleSecondary: 0,
    comboBonus: false,
    ultChargeRate: 1,
    ultPower: 1,
    ultOverflow: false,
    ultEcho: 0,
    ultEchoLeft: 0,
    ultHeal: false,
    ultResetCDs: false,
    spellWeaving: false,
    spellWeaveStack: 0,
    lastSpellSlot: -1,
    cdCascade: false,
    fullRotation: false,
    fullRotationTimer: 0,
    fullRotationSpells: 0,
    fullRotationBuff: 0,
    burnSpread: false,
    magmaArmor: false,
    fireZoneOnExplode: false,
    shatter: false,
    permafrost: false,
    iceArmor: false,
    chainLightning: 0,
    overcharge: false,
    stormShield: false,
    _stormTimer: 0,
    blinkExplode: false,
    spellMirror: 0,
    raiseDead: 0,
    deathMark: false,
    soulWell: false,
    timeLoop: 0,
    hasteZone: false,
    temporalEcho: false,
    _timeLoopUsed: false,
    _hasteTimer: 0,
    shieldBounce: 0,
    tauntAura: false,
    bloodlust: false,
    _bloodlustStacks: 0,
    undyingRage: 0,
    reflectShield: false,
    resurrection: false,
    _resurrectionCd: 0,
    packLeader: false,
    overgrowthHeal: false,
    barkSkinRegen: false,
    soulSiphon: false,
    demonicPact: false,
    hexChain: 0,
    zenMana: false,
    turretArmy: false,
    laserTurret: false,
    turretExplode: false,
    boomerang: false,
    volatile: false,
    forkOnKill: false,
    gravityWell: false,
    spectral: false,
    frozenTouch: false,
    seekerMines: false,
    burstFire: false,
    _baseSpellDmg: cls.spells.map(s => s.dmg),
    _hyperAcc: {},
    _snapTimer: 0,
    _rewindSnap: null,
    _hasteBonus: false,
    _furyActive: false,
    _auraTick: 0,
    _timeStopTimer: 0,
    _rage: 0,
    _rageDmgMul: 1,
    _shieldWall: 0,
    _holyShield: 0,
    _animCastFlash: 0,
    _animHitFlash: 0,
    _animDeathFade: -1,
    _animMoving: false,
    _animUltTimer: 0,
    respawnTimer: 0,
  };
}

/** Return and increment the next monotonic enemy ID (host only). */
export function nextEnemyId(state: GameState): number {
  return state._nextEnemyId++;
}

// ═══════════════════════════════════
//          UTILITIES
// ═══════════════════════════════════

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function wrapAngle(a: number): number {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function toWorld(state: GameState, sx: number, sy: number): { x: number; y: number } {
  return { x: sx - state.camX, y: sy - state.camY };
}

// ── Spawner helpers (mutate state arrays) ──

export function spawnParticles(
  state: GameState, x: number, y: number, col: string, n: number, scale: number = 1
): void {
  if (state.particles.count >= MAX_PARTICLES) return;
  // Collect fx event for guest when hosting
  if (state.mode === NetworkMode.Host) {
    state.pendingFx.push({ t: 'p', x: ~~x, y: ~~y, c: col, n, s: scale });
  }
  for (let i = 0; i < n; i++) {
    const p = state.particles.acquire();
    if (!p) break;
    const a = Math.random() * Math.PI * 2;
    const s = (25 + Math.random() * 100) * scale;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = 1;
    p.r = 1 + Math.random() * 3;
    p.color = col;
  }
}

export function spawnText(
  state: GameState, x: number, y: number, text: string, color: string
): void {
  // Collect fx event for guest when hosting
  if (state.mode === NetworkMode.Host) {
    state.pendingFx.push({ t: 't', x: ~~x, y: ~~y, c: color, tx: text });
  }
  const t = state.texts.acquire();
  if (!t) return;
  t.x = x; t.y = y; t.text = text; t.color = color; t.life = 1.5; t.vy = -35;
}

export function spawnShockwave(
  state: GameState, x: number, y: number, maxR: number = 60, color: string = 'rgba(255,200,100,.4)'
): void {
  // Collect fx event for guest when hosting
  if (state.mode === NetworkMode.Host) {
    state.pendingFx.push({ t: 'sw', x: ~~x, y: ~~y, c: color, mr: maxR });
  }
  const s = state.shockwaves.acquire();
  if (!s) return;
  s.x = x; s.y = y; s.radius = 0; s.maxR = maxR; s.life = 1; s.color = color;
}

export function shake(state: GameState, intensity: number): void {
  state.shakeIntensity = Math.max(state.shakeIntensity, intensity);
}

/** Play sfx locally and queue it for guest when hosting */
export function netSfx(state: GameState, name: SfxName): void {
  sfx(name);
  if (state.mode === NetworkMode.Host) {
    state.pendingFx.push({ t: 's', x: 0, y: 0, c: '', sn: name });
  }
}

export function flashScreen(state: GameState, intensity: number, color?: string): void {
  state.screenFlash = intensity;
  if (color) state.screenFlashColor = color;
  else state.screenFlashColor = '255,255,255';
}
