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
} from './types';
import {
  WIZARD_HP,
  MAX_MANA,
  MANA_REGEN,
  DEFAULT_MOVE_SPEED,
  CLASSES,
  ROOM_WIDTH,
  ROOM_HEIGHT,
} from './constants';

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
  enemies: Enemy[];
  spells: Spell[];
  particles: Particle[];
  trails: Trail[];
  shockwaves: Shockwave[];
  texts: FloatingText[];
  beams: Beam[];
  zones: Zone[];
  aoeMarkers: AoeMarker[];
  eProj: EnemyProjectile[];
  pillars: Pillar[];
  pickups: Pickup[];

  // Network remote input
  remoteInput: PlayerInput;

  // Upgrade state
  pendingUpgradeChoices: number[] | null;
  upgradePickedLocal: boolean;
  upgradePickedRemote: boolean;

  // Network
  netTimer: number;

  // Class selection
  selectedClassIndex: number;
  hostClassKey: string | null;
  guestClassKey: string | null;
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
    camX: 0,
    camY: 0,
    wave: 1,
    waveActive: false,
    waveBreakTimer: 0,
    waveEnemiesTotal: 0,
    totalKills: 0,
    gold: 0,
    countdownTimer: 0,
    keys: {},
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    mouseDown: false,
    rightDown: false,
    players: [],
    enemies: [],
    spells: [],
    particles: [],
    trails: [],
    shockwaves: [],
    texts: [],
    beams: [],
    zones: [],
    aoeMarkers: [],
    eProj: [],
    pillars: [],
    pickups: [],
    remoteInput: { angle: 0, mx: 0, my: 0, shoot: false, shoot2: false, ability: false, ult: false, dash: false },
    pendingUpgradeChoices: null,
    upgradePickedLocal: false,
    upgradePickedRemote: false,
    netTimer: 0,
    selectedClassIndex: 0,
    hostClassKey: null,
    guestClassKey: null,
  };
}

/** Deep-copy a class definition so upgrades don't mutate the constant */
export function cloneClassDef(key: string): ClassDef {
  const src = CLASSES[key];
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
  return {
    idx,
    cls: cloneClassDef(clsKey),
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
    hasDash: false,
    dashCd: 0,
    momentum: false,
    aftershock: false,
    chaosDmg: false,
    magnetRange: 30,
    goldMul: 1,
    xpBoost: 0,
    selfDmg: false,
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
    blinkExplode: false,
    spellMirror: 0,
    raiseDead: 0,
    deathMark: false,
    soulWell: false,
    timeLoop: 0,
    hasteZone: false,
    temporalEcho: false,
    shieldBounce: 0,
    tauntAura: false,
    bloodlust: false,
    undyingRage: 0,
    reflectShield: false,
    resurrection: false,
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
  };
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
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (25 + Math.random() * 100) * scale;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 1,
      r: 1 + Math.random() * 3,
      color: col,
    });
  }
}

export function spawnText(
  state: GameState, x: number, y: number, text: string, color: string
): void {
  state.texts.push({ x, y, text, color, life: 1.5, vy: -35 });
}

export function spawnShockwave(
  state: GameState, x: number, y: number, maxR: number = 60, color: string = 'rgba(255,200,100,.4)'
): void {
  state.shockwaves.push({ x, y, radius: 0, maxR, life: 1, color });
}

export function shake(state: GameState, intensity: number): void {
  state.shakeIntensity = Math.max(state.shakeIntensity, intensity);
}
