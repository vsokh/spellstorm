import { GameState, createPlayer } from '../state';
import { GamePhase, NetworkMode, Player, Particle, Trail, Shockwave, FloatingText, Beam, Zone, AoeMarker, EnemyPool } from '../types';
import { SpellPool } from '../ecs/spell-pool';
import { EProjPool } from '../ecs/eproj-pool';
import { Pool } from '../systems/pools';
import { MAX_PARTICLES, MAX_TRAILS, MAX_SHOCKWAVES, MAX_FLOATING_TEXTS, MAX_SPELLS, MAX_EPROJ, MAX_ZONES, MAX_AOE_MARKERS, MAX_BEAMS, ROOM_WIDTH, ROOM_HEIGHT } from '../constants';
import { SpatialGrid } from '../ecs/spatial-grid';

/**
 * Create a GameState-compatible object for testing without window references.
 * Uses fixed 1280x720 dimensions instead of window.innerWidth/Height.
 */
export function createTestState(): GameState {
  return {
    width: 1280,
    height: 720,
    mode: NetworkMode.None,
    gamePhase: GamePhase.Playing,
    localIdx: 0,
    time: 0,
    shakeIntensity: 0,
    shakeX: 0,
    shakeY: 0,
    screenFlash: 0,
    screenFlashColor: '255,255,255',
    _gameOverTimer: 0,
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
    mouseX: 640,
    mouseY: 360,
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
    _netInterval: 0.05,
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

/**
 * Create a test player from a class key using the real createPlayer function.
 */
export function createTestPlayer(idx: number, clsKey: string): Player {
  return createPlayer(idx, clsKey);
}

/**
 * Create a minimal test enemy for use in combat tests.
 */
export function createTestEnemy(overrides: Partial<import('../types').Enemy> = {}): import('../types').Enemy {
  return {
    id: 0,
    type: 'slime',
    x: 500,
    y: 350,
    vx: 0,
    vy: 0,
    hp: 5,
    maxHp: 5,
    alive: true,
    atkTimer: 1,
    target: 0,
    iframes: 0,
    slowTimer: 0,
    stunTimer: 0,
    _burnTimer: 0,
    _burnTick: 0,
    _burnOwner: 0,
    _friendly: false,
    _owner: 0,
    _lifespan: 0,
    _spdMul: 1,
    _dmgMul: 1,
    _teleportTimer: 0,
    _lmbHitTimer: 0,
    _hitFlash: 0,
    _deathTimer: -1,
    _atkAnim: 0,
    _dmgReductionActive: false,
    _dmgReductionTimer: 0,
    _dmgReductionTriggered: false,
    _elite: false,
    ...overrides,
  };
}
