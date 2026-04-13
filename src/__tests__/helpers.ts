import { GameState, createPlayer } from '../state';
import { GamePhase, NetworkMode, Player } from '../types';

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
    comboCount: 0,
    comboTimer: 0,
    hitStop: 0,
    keys: {},
    mouseX: 640,
    mouseY: 360,
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
    _hitFlash: 0,
    _deathTimer: -1,
    _atkAnim: 0,
    _dmgReductionActive: false,
    _dmgReductionTimer: 0,
    _dmgReductionTriggered: false,
    ...overrides,
  };
}
