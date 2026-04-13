import { GameState, nextEnemyId, dist, rand, spawnParticles, spawnText, shake, flashScreen } from '../state';
import { GamePhase, PickupType, Enemy, SfxName } from '../types';
import {
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ENEMIES,
  MAX_WAVES,
  MIN_PILLARS,
  MAX_EXTRA_PILLARS,
  PILLAR_MARGIN,
  PILLAR_MIN_RADIUS,
  PILLAR_MAX_EXTRA_RADIUS,
  PILLAR_CENTER_EXCLUSION,
  PILLAR_SPAWN_TRIES,
  waveClearGold,
  DUNGEON_TIMING,
  BOSS_HP_EXPONENT,
  BOSS_HP_EXPONENT_DIVISOR,
  TIME_SCALING_FACTOR,
  ENEMY_HP_WAVE_MULT,
  CO_OP_HP_MULTIPLIER,
} from '../constants';

import { sfx } from '../audio';

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
  if (wave <= 7) {
    const pool = ['slime', 'bat', 'skeleton', 'wraith', 'spider', 'bomber'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (wave <= 9) {
    const pool = ['skeleton', 'skeleton', 'wraith', 'wraith', 'spider', 'necro', 'shieldbearer', 'bomber', 'splitter'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (wave <= 12) {
    const pool = ['skeleton', 'wraith', 'wraith', 'spider', 'necro', 'shieldbearer', 'bomber', 'splitter', 'teleporter', 'teleporter'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Late game: all enemy types with weighting toward threats
  const pool = ['skeleton', 'wraith', 'necro', 'shieldbearer', 'assassin', 'assassin', 'bomber', 'splitter', 'teleporter', 'teleporter', 'berserker', 'berserker'];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Spawn a single enemy from a random edge of the arena */
export function spawnEnemy(state: GameState, type: string, hpScale: number, spdScale: number, timeMul: number = 1): void {
  const et = ENEMIES[type];
  let ex: number, ey: number;
  const side = Math.floor(Math.random() * 4);
  if (side === 0) { ex = rand(30, ROOM_WIDTH - 30); ey = -20; }
  else if (side === 1) { ex = ROOM_WIDTH + 20; ey = rand(30, ROOM_HEIGHT - 30); }
  else if (side === 2) { ex = rand(30, ROOM_WIDTH - 30); ey = ROOM_HEIGHT + 20; }
  else { ex = -20; ey = rand(30, ROOM_HEIGHT - 30); }

  const hp = Math.max(1, Math.ceil((et.hp + hpScale - 1) * timeMul));
  state.enemies.push({
    id: nextEnemyId(state),
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
    _dmgMul: timeMul,
    _teleportTimer: 0,
    _hitFlash: 0,
    _deathTimer: -1,
    _atkAnim: 0,
    _dmgReductionActive: false, _dmgReductionTimer: 0, _dmgReductionTriggered: false,
  });
}

/** Start the current wave — spawn enemies for it */
export function startWave(state: GameState): void {
  state.waveActive = true;
  state.shopTempDmg = 0; // reset temporary damage boost each wave
  const wave = state.wave;
  const isBoss = wave % 5 === 0;
  const hpScale = 1 + Math.floor(wave * 0.6);
  const spdScale = 1 + wave * 0.03;
  const baseTimeMul = 1 + (state.time / 60) * TIME_SCALING_FACTOR;
  const coopMul = state.players.length >= 2 ? CO_OP_HP_MULTIPLIER : 1;
  const timeMul = baseTimeMul * (1 + wave * ENEMY_HP_WAVE_MULT) * coopMul;

  // FINALE — The Archlord (wave 20)
  if (wave === MAX_WAVES) {
    const et = ENEMIES['archlord'];
    const bossHp = Math.ceil(et.hp * Math.pow(BOSS_HP_EXPONENT, wave / BOSS_HP_EXPONENT_DIVISOR) * baseTimeMul * coopMul);
    state.enemies.push({
      id: nextEnemyId(state),
      type: 'archlord',
      x: ROOM_WIDTH / 2,
      y: 60,
      vx: 0, vy: 0,
      hp: bossHp, maxHp: bossHp,
      alive: true,
      atkTimer: 2,
      target: 0,
      iframes: 0,
      slowTimer: 0, stunTimer: 0,
      _burnTimer: 0, _burnTick: 0, _burnOwner: 0,
      _friendly: false, _owner: 0, _lifespan: 0,
      _spdMul: 1,
      _dmgMul: baseTimeMul,
      _teleportTimer: 0,
      _hitFlash: 0, _deathTimer: -1, _atkAnim: 0,
      _dmgReductionActive: false, _dmgReductionTimer: 0, _dmgReductionTriggered: false,
    });
    // Elite guard — spawn 11 mixed elites
    const elitePool = ['shieldbearer', 'necro', 'assassin', 'wraith'];
    for (let i = 0; i < 11; i++) {
      spawnEnemy(state, elitePool[i % elitePool.length], hpScale + 2, spdScale, timeMul);
    }
    spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 80, 'THE ARCHLORD', '#ffaa00');
    spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 50, 'FINAL WAVE!', '#ff4444');
    sfx(SfxName.Boom);
    shake(state, 10);
    flashScreen(state, 0.3);

    state.waveEnemiesTotal = state.enemies.filter(e => e.alive && !e._friendly).length;
    sfx(SfxName.Door);
    const waveNumEl = document.getElementById('wave-num');
    if (waveNumEl) waveNumEl.textContent = String(wave);
    return; // Skip normal wave logic
  }

  if (isBoss) {
    // Boss wave
    const bossType = wave % 10 === 0 ? 'demon' : 'golem';
    const et = ENEMIES[bossType];
    const bossHp = Math.ceil(et.hp * Math.pow(BOSS_HP_EXPONENT, wave / BOSS_HP_EXPONENT_DIVISOR) * baseTimeMul * coopMul);
    state.enemies.push({
      id: nextEnemyId(state),
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
      _dmgMul: baseTimeMul,
      _teleportTimer: 0,
      _hitFlash: 0, _deathTimer: -1, _atkAnim: 0,
      _dmgReductionActive: false, _dmgReductionTimer: 0, _dmgReductionTriggered: false,
    });
    // Minions trickle-spawn over 10 seconds
    const minionCount = 5 + Math.floor(wave / 3);
    state.bossMinionQueue = minionCount;
    state.bossMinionInterval = DUNGEON_TIMING.BOSS_MINION_SPAWN_DURATION / minionCount;
    state.bossMinionTimer = state.bossMinionInterval;
    spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 60, `BOSS WAVE ${wave}!`, '#ff4444');
    sfx(SfxName.Boom);
    shake(state, 6);
  } else {
    // Normal wave — smooth difficulty curve
    const count = Math.floor(5 + wave * 2.5 + Math.floor(wave / 8) * wave);
    const immediateCount = Math.ceil(count * 0.6);
    for (let i = 0; i < immediateCount; i++) {
      spawnEnemy(state, pickWaveEnemy(wave), hpScale, spdScale, timeMul);
    }
    // Queue remainder for trickle spawning
    state.waveSpawnQueue = count - immediateCount;
    state.waveSpawnTimer = DUNGEON_TIMING.WAVE_SPAWN_TIMER;
    spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 60, `WAVE ${wave}`, '#bbaa44');

    // Horde event: 15% chance starting wave 5
    if (wave >= 5 && Math.random() < 0.15) {
      const hordeTypes = ['swarm_bat', 'slime'];
      for (let i = 0; i < 12; i++) {
        const ht = hordeTypes[Math.floor(Math.random() * hordeTypes.length)];
        spawnEnemy(state, ht, hpScale, spdScale, timeMul);
      }
      spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 30, 'HORDE!', '#ff4444');
      shake(state, 4);
    }
  }

  state.waveEnemiesTotal = state.enemies.filter(e => e.alive && !e._friendly).length;
  sfx(SfxName.Door);

  const waveNumEl = document.getElementById('wave-num');
  if (waveNumEl) waveNumEl.textContent = String(wave);
}

/** Check if the current wave is complete (all non-friendly enemies dead) */
export function checkWaveComplete(state: GameState): void {
  if (!state.waveActive) return;
  if (state.waveSpawnQueue > 0) return; // still trickle spawning
  if (state.bossMinionQueue > 0) return; // still spawning boss minions
  const alive = state.enemies.filter(e => e.alive && !e._friendly && e._deathTimer < 0).length;
  if (alive <= 0) {
    state.waveActive = false;
    state.waveBreakTimer = 2; // 2 second break between waves

    // Wave clear gold bonus
    const clearGold = waveClearGold(state.wave);
    const wcp = state.players[0]; // local player
    const finalGold = Math.round(clearGold * (wcp ? wcp.goldMul : 1));
    state.gold += finalGold;
    spawnText(state, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 + 20, `+${finalGold}g WAVE CLEAR`, '#ddcc44');

    // Drop some health pickups — more reliable in later waves
    const isBossWave = state.wave % 5 === 0;
    if (isBossWave || Math.random() < 0.55) {
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
    if (isBossWave) {
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

    // Upgrades are now XP-driven (level-ups), not wave-driven

    // Victory check — completed all waves
    if (state.wave >= MAX_WAVES) {
      state.gamePhase = GamePhase.Victory;
      document.exitPointerLock();
      document.body.classList.remove('in-game');
      setTimeout(() => {
        const statsEl = document.getElementById('victory-stats');
        if (statsEl) {
          statsEl.innerHTML = `Waves Cleared: ${state.wave}<br>Total Kills: ${state.totalKills}<br>Gold: ${state.gold}`;
        }
        const victoryEl = document.getElementById('victory-screen');
        if (victoryEl) victoryEl.style.display = 'flex';
      }, 1500);
    }
  }
}

/** Tick wave system: count down break timer, start next wave, trickle spawn */
export function updateWaves(state: GameState, dt: number): void {
  if (state.gamePhase !== GamePhase.Playing) return;
  if (state.waveActive) {
    // Trickle spawn boss minions
    if (state.bossMinionQueue > 0) {
      state.bossMinionTimer -= dt;
      if (state.bossMinionTimer <= 0) {
        const hpScale = 1 + Math.floor(state.wave * 0.6);
        const spdScale = 1 + state.wave * DUNGEON_TIMING.TRICKLE_SPEED_SCALE;
        const coopMul = state.players.length >= 2 ? CO_OP_HP_MULTIPLIER : 1;
        const timeMul = (1 + (state.time / 60) * TIME_SCALING_FACTOR) * coopMul;
        spawnEnemy(state, pickWaveEnemy(state.wave), hpScale, spdScale, timeMul);
        state.bossMinionQueue--;
        state.bossMinionTimer = state.bossMinionInterval;
      }
    }
    // Trickle spawn queued enemies
    if (state.waveSpawnQueue > 0) {
      state.waveSpawnTimer -= dt;
      if (state.waveSpawnTimer <= 0) {
        const hpScale = 1 + Math.floor(state.wave * 0.6);
        const spdScale = 1 + state.wave * DUNGEON_TIMING.TRICKLE_SPEED_SCALE;
        const coopMul = state.players.length >= 2 ? CO_OP_HP_MULTIPLIER : 1;
        const timeMul = (1 + (state.time / 60) * TIME_SCALING_FACTOR) * (1 + state.wave * ENEMY_HP_WAVE_MULT) * coopMul;
        const batch = Math.min(2 + Math.floor(Math.random() * 2), state.waveSpawnQueue); // 2-3
        for (let i = 0; i < batch; i++) {
          spawnEnemy(state, pickWaveEnemy(state.wave), hpScale, spdScale, timeMul);
        }
        state.waveSpawnQueue -= batch;
        state.waveSpawnTimer = DUNGEON_TIMING.WAVE_SPAWN_TIMER;
      }
    }
    checkWaveComplete(state);
    return;
  }
  // Between waves: countdown to next
  if (state.shopOpen) return; // don't count down while shopping
  state.waveBreakTimer -= dt;
  if (state.waveBreakTimer <= 0) {
    if (state.wave >= MAX_WAVES) return; // Don't start wave 21
    state.wave++;
    startWave(state);
  }
}

// ═══════════════════════════════════
//       FRIENDLY ENEMY (necro ult)
// ═══════════════════════════════════

export function createFriendlyEnemy(state: GameState, x: number, y: number, ownerIdx: number): Enemy {
  return {
    id: nextEnemyId(state),
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
    _dmgMul: 1,
    _teleportTimer: 0,
    _hitFlash: 0,
    _deathTimer: -1,
    _atkAnim: 0,
    _dmgReductionActive: false, _dmgReductionTimer: 0, _dmgReductionTriggered: false,
  };
}
