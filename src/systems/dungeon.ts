import { GameState, dist, rand, spawnParticles, spawnText, shake } from '../state';
import { PickupType, Enemy, SfxName } from '../types';
import {
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ENEMIES,
  MIN_PILLARS,
  MAX_EXTRA_PILLARS,
  PILLAR_MARGIN,
  PILLAR_MIN_RADIUS,
  PILLAR_MAX_EXTRA_RADIUS,
  PILLAR_CENTER_EXCLUSION,
  PILLAR_SPAWN_TRIES,
} from '../constants';
import { sfx } from '../audio';
import { showUpgradeScreen } from './upgrades';

// ═══════════════════════════════════
//       ARENA GENERATION
// ═══════════════════════════════════

/** Generate a single arena with scattered pillars (called once at game start) */
export function generateArena(state: GameState): void {
  state.pillars.length = 0;
  state.enemies.length = 0;
  state.spells.length = 0;
  state.zones.length = 0;
  state.aoeMarkers.length = 0;
  state.eProj.length = 0;
  state.pickups.length = 0;

  // Scatter pillars across the arena
  const pCount = MIN_PILLARS + Math.floor(Math.random() * (MAX_EXTRA_PILLARS + 2));
  for (let i = 0; i < pCount; i++) {
    let px: number, py: number, tries = 0;
    do {
      px = PILLAR_MARGIN + Math.random() * (ROOM_WIDTH - PILLAR_MARGIN * 2);
      py = PILLAR_MARGIN + Math.random() * (ROOM_HEIGHT - PILLAR_MARGIN * 2);
      tries++;
    } while (tries < PILLAR_SPAWN_TRIES && dist(px, py, ROOM_WIDTH / 2, ROOM_HEIGHT / 2) < PILLAR_CENTER_EXCLUSION);
    state.pillars.push({ x: px, y: py, radius: PILLAR_MIN_RADIUS + Math.random() * PILLAR_MAX_EXTRA_RADIUS });
  }
}

// ═══════════════════════════════════
//       WAVE SYSTEM
// ═══════════════════════════════════

/** Pick an enemy type based on current wave number */
export function pickWaveEnemy(wave: number): string {
  if (wave <= 2) return ['slime', 'bat'][Math.floor(Math.random() * 2)];
  if (wave <= 4) return ['slime', 'bat', 'skeleton'][Math.floor(Math.random() * 3)];
  if (wave <= 7) return ['slime', 'bat', 'skeleton', 'wraith'][Math.floor(Math.random() * 4)];
  // Late game: weighted toward harder enemies
  const pool = ['slime', 'bat', 'skeleton', 'skeleton', 'wraith', 'wraith'];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Spawn a single enemy from a random edge of the arena */
export function spawnEnemy(state: GameState, type: string, hpScale: number, spdScale: number): void {
  const et = ENEMIES[type];
  let ex: number, ey: number;
  const side = Math.floor(Math.random() * 4);
  if (side === 0) { ex = rand(30, ROOM_WIDTH - 30); ey = -20; }
  else if (side === 1) { ex = ROOM_WIDTH + 20; ey = rand(30, ROOM_HEIGHT - 30); }
  else if (side === 2) { ex = rand(30, ROOM_WIDTH - 30); ey = ROOM_HEIGHT + 20; }
  else { ex = -20; ey = rand(30, ROOM_HEIGHT - 30); }

  const hp = et.hp + hpScale - 1;
  state.enemies.push({
    type,
    x: ex,
    y: ey,
    vx: 0,
    vy: 0,
    hp,
    maxHp: hp,
    alive: true,
    atkTimer: et.atkCd * Math.random() + 0.5,
    target: Math.floor(Math.random() * 2),
    iframes: 0,
    slowTimer: 0,
    stunTimer: 0,
    _burnTimer: 0,
    _burnTick: 0,
    _burnOwner: 0,
    _friendly: false,
    _owner: 0,
    _lifespan: 0,
    _spdMul: spdScale,
  });
}

/** Start the current wave — spawn enemies for it */
export function startWave(state: GameState): void {
  state.waveActive = true;
  const wave = state.wave;
  const isBoss = wave % 5 === 0;
  const hpScale = 1 + Math.floor(wave / 4);
  const spdScale = 1 + wave * 0.02;

  if (isBoss) {
    // Boss wave
    const bossType = wave % 10 === 0 ? 'demon' : 'golem';
    const et = ENEMIES[bossType];
    const bossHp = et.hp + wave * 4;
    state.enemies.push({
      type: bossType,
      x: ROOM_WIDTH / 2,
      y: 60,
      vx: 0,
      vy: 0,
      hp: bossHp,
      maxHp: bossHp,
      alive: true,
      atkTimer: 2,
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
    });
    // Minions scale with wave
    const minionCount = 2 + Math.floor(wave / 3);
    for (let i = 0; i < minionCount; i++) {
      spawnEnemy(state, pickWaveEnemy(wave), hpScale, spdScale);
    }
    spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 60, `BOSS WAVE ${wave}!`, '#ff4444');
    sfx(SfxName.Boom);
    shake(state, 6);
  } else {
    // Normal wave — enemy count and variety scales up
    const baseCount = 4 + wave * 2;
    const count = Math.min(baseCount, 30);
    for (let i = 0; i < count; i++) {
      spawnEnemy(state, pickWaveEnemy(wave), hpScale, spdScale);
    }
    spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 60, `WAVE ${wave}`, '#bbaa44');
  }

  state.waveEnemiesTotal = state.enemies.filter(e => e.alive && !e._friendly).length;
  sfx(SfxName.Door);

  const waveNumEl = document.getElementById('wave-num');
  if (waveNumEl) waveNumEl.textContent = String(wave);
}

/** Check if the current wave is complete (all non-friendly enemies dead) */
export function checkWaveComplete(state: GameState): void {
  if (!state.waveActive) return;
  const alive = state.enemies.filter(e => e.alive && !e._friendly).length;
  if (alive <= 0) {
    state.waveActive = false;
    state.waveBreakTimer = 2; // 2 second break between waves

    // Drop some health pickups
    if (Math.random() < 0.4) {
      state.pickups.push({
        x: rand(100, ROOM_WIDTH - 100),
        y: rand(100, ROOM_HEIGHT - 100),
        type: PickupType.Health,
        collected: false,
        value: 0,
        _owner: 0,
        _dmg: 0,
        _radius: 0,
        _slow: 0,
        _color: '',
      });
    }
    if (state.wave % 5 === 0) {
      // Boss killed — drop extra rewards
      for (let i = 0; i < 2; i++) {
        state.pickups.push({
          x: ROOM_WIDTH / 2 + rand(-40, 40),
          y: ROOM_HEIGHT / 2 + rand(-40, 40),
          type: PickupType.Health,
          collected: false,
          value: 0,
          _owner: 0,
          _dmg: 0,
          _radius: 0,
          _slow: 0,
          _color: '',
        });
      }
    }

    // Show upgrade every wave
    showUpgradeScreen(state);
  }
}

/** Tick wave system: count down break timer, start next wave */
export function updateWaves(state: GameState, dt: number): void {
  if (state.gamePhase !== 'playing') return;
  if (state.waveActive) {
    checkWaveComplete(state);
    return;
  }
  // Between waves: countdown to next
  state.waveBreakTimer -= dt;
  if (state.waveBreakTimer <= 0) {
    state.wave++;
    startWave(state);
  }
}

// ═══════════════════════════════════
//       FRIENDLY ENEMY (necro ult)
// ═══════════════════════════════════

export function createFriendlyEnemy(x: number, y: number, ownerIdx: number): Enemy {
  return {
    type: '_ally',
    x,
    y,
    vx: 0,
    vy: 0,
    hp: 4,
    maxHp: 4,
    alive: true,
    atkTimer: 0,
    target: -1,
    iframes: 0,
    slowTimer: 0,
    stunTimer: 0,
    _burnTimer: 0,
    _burnTick: 0,
    _burnOwner: 0,
    _friendly: true,
    _owner: ownerIdx,
    _lifespan: 8,
    _spdMul: 1,
  };
}
