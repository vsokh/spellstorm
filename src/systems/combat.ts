import {
  GameState,
  nextEnemyId,
  dist,
  clamp,
  rand,
  wrapAngle,
  toWorld,
  spawnParticles,
  spawnText,
  spawnShockwave,
  shake,
  flashScreen,
  netSfx,
} from '../state';
import {
  Player,
  Enemy,
  Spell,
  SpellDef,
  SpellType,
  PickupType,
  GamePhase,
  NetworkMode,
  SfxName,
  EnemyView,
} from '../types';
import {
  ENEMIES,
  WIZARD_SIZE,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  GAME_OVER_DELAY_MS,
  RESPAWN_DELAY_MS,
  scaledHealthDropChance,
  goldDropBonus,
  COMBAT,
  TIMING,
  ULTIMATE,
  RANGES,
  CD_FLOORS,
  softCapBonusDmg,
  BOSS_WAVE_XP,
} from '../constants';
import { createFriendlyEnemy } from './dungeon';

// Pre-allocated scratch array to avoid per-frame filter() allocations
let _aliveEnemies: EnemyView[] = [];

// ═══════════════════════════════════
//       BONUS DAMAGE SOFT CAP
// ═══════════════════════════════════

/** Get effective spell damage after applying bonus damage soft cap.
 *  Calculates how much flat bonus was added by upgrades, caps it, returns base + capped bonus. */
function getEffectiveSpellDmg(p: Player, spellIdx: number): number {
  const baseDmg = p._baseSpellDmg[spellIdx] || 0;
  const currentDmg = p.cls.spells[spellIdx].dmg;
  const bonus = currentDmg - baseDmg;
  if (bonus <= 0) return currentDmg;
  return baseDmg + softCapBonusDmg(bonus);
}

// ═══════════════════════════════════
//       DAMAGE ENEMY
// ═══════════════════════════════════

/**
 * Damage modifier application order (multiplicative stacking):
 *   1. shopTempDmg — flat additive (+1 from Power Shard)
 *   2. chaosDmg — replaces with random 1–4
 *   3. fury — ×1.5 (Berserker, below half HP)
 *   4. bloodRage — ×2 (ultimate active)
 *   5. critStrike — ×2 or ×2.5 (with Lethal Precision)
 *   6. momentum — ×1.0–1.2 (speed-based)
 * Capped at COMBAT.DAMAGE_CAP × rawDmg to prevent runaway burst.
 */
export function damageEnemy(state: GameState, e: Enemy, rawDmg: number, pIdx: number): void {
  if (e.iframes > 0) return;
  // Already in death animation — don't re-trigger death effects
  if (e._deathTimer >= 0) return;
  const p = state.players[pIdx];
  let dmg = rawDmg + (state.shopTempDmg || 0);

  // Chaos damage: random 1-4
  if (p && p.chaosDmg) dmg = 1 + Math.floor(Math.random() * 4);
  // Berserker fury: +50% dmg below half HP
  if (p && p._furyActive) dmg = Math.ceil(dmg * COMBAT.FURY_DAMAGE_MULT);
  // Blood rage: 2x damage
  if (p && p._rageDmgMul > 1) dmg = Math.ceil(dmg * p._rageDmgMul);
  // Critical strike
  if (p && p.critChance && Math.random() < p.critChance) {
    dmg *= (p.critMul || 2);
    spawnText(state, e.x, e.y - 25, 'CRIT!', '#ffcc44');
  }
  // Momentum bonus
  if (p && p.momentum) {
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    dmg = Math.round(dmg * (1 + Math.min(COMBAT.MOMENTUM_CAP, spd / COMBAT.MOMENTUM_DIVISOR)));
  }

  // Cap total damage to prevent runaway multiplicative burst
  const maxDmg = rawDmg * COMBAT.DAMAGE_CAP;
  if (dmg > maxDmg) dmg = maxDmg;

  // Boss damage reduction phase: 50% damage while active
  if (e._dmgReductionActive) {
    dmg = Math.ceil(dmg * COMBAT.BOSS_DMG_REDUCTION_MULT);
    spawnText(state, e.x, e.y - 35, 'RESISTED', '#88aaff');
  }

  e.hp -= dmg;

  // Trigger boss damage reduction phase at 50% HP (wave 15+ only)
  const et_check = ENEMIES[e.type];
  if (et_check.boss && state.wave >= COMBAT.BOSS_DMG_REDUCTION_MIN_WAVE
      && !e._dmgReductionTriggered
      && e.hp <= e.maxHp * COMBAT.BOSS_DMG_REDUCTION_HP_THRESHOLD && e.hp > 0) {
    e._dmgReductionActive = true;
    e._dmgReductionTimer = COMBAT.BOSS_DMG_REDUCTION_DURATION;
    e._dmgReductionTriggered = true;
    spawnText(state, e.x, e.y - 50, 'HARDENED!', '#6688ff');
  }

  e.iframes = 0.1;
  e._hitFlash = 0.12;
  spawnParticles(state, e.x, e.y, '#ff6644', 5, TIMING.HIT_PARTICLE_SCALE);
  netSfx(state, SfxName.Hit);

  // Ultimate charge (+5 per hit, +15 per kill)
  if (p) {
    const hitChargeGain = Math.round(COMBAT.ULT_CHARGE_HIT * (p.ultChargeRate || 1));
    const chargeCap = p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD;
    p.ultCharge = Math.min(chargeCap, (p.ultCharge || 0) + hitChargeGain);
    if (p.ultCharge >= (p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD)) p.ultReady = true;
  }

  // Passive: Stormcaller static (every 5th hit stuns)
  if (p && p.clsKey === 'stormcaller') {
    p.hitCounter = (p.hitCounter || 0) + 1;
    if (p.hitCounter % 5 === 0) {
      e.stunTimer = (e.stunTimer || 0) + COMBAT.COMBO_STUN_DURATION;
      spawnText(state, e.x, e.y - 15, 'STUN', '#ffcc44');
    }
  }

  // Passive: Cryomancer frostbite (+1 dmg if slowed)
  if (p && p.clsKey === 'cryomancer' && e.slowTimer > 0) {
    e.hp -= 1;
    spawnText(state, e.x, e.y - 15, '+1', '#88ddff');
  }

  // Passive: Arcanist echo (20% chance double cast)
  if (p && p.clsKey === 'arcanist' && Math.random() < COMBAT.ARCANIST_ECHO_CHANCE) {
    castSpellSilent(state, p, 0, Math.atan2(e.y - p.y, e.x - p.x));
  }

  // Passive: burn DOT (pyromancer)
  if (p && p.clsKey === 'pyromancer') {
    e._burnTimer = (e._burnTimer || 0) + 2;
    e._burnOwner = p.idx;
  }

  // Mana on hit
  if (p && p.manaOnHit) {
    p.mana = Math.min(p.maxMana, p.mana + p.manaOnHit);
  }

  // Life steal
  if (p && p.lifeSteal) {
    const heal = Math.floor(dmg * p.lifeSteal);
    if (heal > 0) p.hp = Math.min(p.maxHp, p.hp + heal);
  }

  if (e.hp <= 0) {
    // Start death animation instead of immediately removing
    e._deathTimer = TIMING.DEATH_TIMER;
    state.totalKills++;
    const et = ENEMIES[e.type];

    // ── Combo system ──
    state.comboCount++;
    state.comboTimer = 2;
    if (state.comboCount === 5) spawnText(state, e.x, e.y - 35, '5x COMBO!', '#ffcc44');
    else if (state.comboCount === 10) spawnText(state, e.x, e.y - 35, 'MASSACRE!', '#ff8833');
    else if (state.comboCount === 20) spawnText(state, e.x, e.y - 35, 'UNSTOPPABLE!', '#ff4444');
    else if (state.comboCount === 50) spawnText(state, e.x, e.y - 40, 'GODLIKE!', '#ffdd44');

    // ── Hitstop ──
    state.hitStop = et.boss ? 0.1 : 0.03;

    // ── Spawn XP gems ──
    const isBoss = !!et.boss;
    if (isBoss) {
      // Boss: 3 gems split from wave-scaled XP
      const bossXp = BOSS_WAVE_XP[state.wave] ?? et.xp * 2;
      const xpPerGem = Math.max(1, Math.ceil(bossXp / 3));
      for (let i = 0; i < 3; i++) {
        state.pickups.push({
          x: e.x + rand(-20, 20), y: e.y + rand(-20, 20),
          type: PickupType.Xp, collected: false,
          value: xpPerGem, _owner: 0, _dmg: 0, _radius: 0, _slow: 0, _color: '',
        });
      }
    } else {
      const gemCount = 3 + Math.floor(Math.random() * 4); // 3-6 gems
      const baseXp = e._elite ? et.xp * COMBAT.ELITE_XP_MULT : et.xp;
      const xpPerGem = Math.max(1, Math.ceil(baseXp / gemCount));
      for (let i = 0; i < gemCount; i++) {
        state.pickups.push({
          x: e.x + rand(-15, 15), y: e.y + rand(-15, 15),
          type: PickupType.Xp, collected: false,
          value: xpPerGem, _owner: 0, _dmg: 0, _radius: 0, _slow: 0, _color: '',
        });
      }
    }

    // ── Spawn gold as physical pickups ──
    const bonusGold = goldDropBonus(state.wave);
    const goldDrop = (et.gold + bonusGold) * (p ? p.goldMul : 1);
    if (goldDrop > 0) {
      const goldGemCount = 2 + Math.floor(Math.random() * 2); // 2-3 coins
      const goldPerGem = Math.max(1, Math.ceil(goldDrop / goldGemCount));
      for (let i = 0; i < goldGemCount; i++) {
        state.pickups.push({
          x: e.x + rand(-12, 12), y: e.y + rand(-12, 12),
          type: PickupType.Gold, collected: false,
          value: goldPerGem, _owner: 0, _dmg: 0, _radius: 0, _slow: 0, _color: '',
        });
      }
    }

    if (p) {
      p.killCount++;
      // Bloodlust: +5% attack speed per kill (cap +100%), then +1% crit per kill (cap +15%)
      if (p.bloodlust) {
        p._bloodlustStacks++;
        // After speed cap, overflow stacks grant crit chance
        if (p._bloodlustStacks > 20 && (p._bloodlustStacks - 20) * 0.01 <= COMBAT.BLOODLUST_CRIT_CAP) {
          p.critChance += 0.01;
        }
      }
      // Ultimate charge on kill
      const killChargeGain = Math.round(COMBAT.ULT_CHARGE_KILL * (p.ultChargeRate || 1));
      const killChargeCap = p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD;
      p.ultCharge = Math.min(killChargeCap, (p.ultCharge || 0) + killChargeGain);
      if (p.ultCharge >= (p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD)) p.ultReady = true;

      // Passive: Necro soul harvest
      if (p.clsKey === 'necromancer') {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        spawnText(state, p.x, p.y - 15, '+1 HP', '#44ff88');
      }

      // Raise Dead: chance to convert killed enemy into friendly minion
      if (p.raiseDead > 0 && !et.boss && !e._friendly && Math.random() < p.raiseDead) {
        const minion = createFriendlyEnemy(state, e.x, e.y, p.idx);
        minion._lifespan = 5;
        state.enemies.push(minion);
        spawnText(state, e.x, e.y - 20, 'RAISED!', '#55cc55');
        spawnParticles(state, e.x, e.y, '#55cc55', 8);
      }

      // Vampirism
      if (p.vampirism && p.killCount % (p.vampKillReq || 5) === 0) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        spawnText(state, p.x, p.y - 20, '+1 HP', '#44ff88');
      }

      // Mana on kill
      if (p.manaOnKill) {
        p.mana = Math.min(p.maxMana, p.mana + p.manaOnKill);
      }

      // Kill resets primary CD
      if (p.killResetCD) p.cd[0] = 0;

      // Fork: spawn 2 projectiles from corpse
      if (p.forkOnKill) {
        const baseAngle = Math.random() * Math.PI * 2;
        for (let fi = 0; fi < 2; fi++) {
          const fa = baseAngle + (fi === 0 ? -COMBAT.SPLITTER_ANGLE : COMBAT.SPLITTER_ANGLE);
          const fDef = p.cls.spells[0];
          state.spells.push({
            ...spellToRuntime(fDef),
            x: e.x, y: e.y,
            vx: Math.cos(fa) * fDef.speed, vy: Math.sin(fa) * fDef.speed,
            owner: p.idx, age: 0, zapTimer: 0,
            pierceLeft: 0,
            clsKey: p.clsKey,
            _reversed: false,
            dmg: Math.max(1, Math.ceil(fDef.dmg * COMBAT.SPLITTER_DMG_MULT)),
          });
        }
      }

      // Seeker Mines: drop explosive mine on kill
      if (p.seekerMines) {
        const mineZone = state.zones.acquire();
        if (mineZone) {
          mineZone.x = e.x; mineZone.y = e.y; mineZone.radius = 50; mineZone.duration = 4;
          mineZone.dmg = 3; mineZone.color = '#ff8844'; mineZone.owner = p.idx;
          mineZone.slow = 0; mineZone.stun = 0; mineZone.tickRate = 4; mineZone.tickTimer = 0; mineZone.age = 0;
          mineZone.drain = 0; mineZone.heal = 0; mineZone.pull = 0; mineZone.freezeAfter = 0;
        }
        spawnParticles(state, e.x, e.y, '#ff8844', 5, TIMING.PARTICLE_LIFE_SHORT);
      }

      // Shatter: frozen/slowed enemies explode on death
      if (p.shatter && (e.stunTimer > 0 || e.slowTimer > 0)) {
        const SHATTER_RADIUS = 80;
        const SHATTER_DMG = 3;
        for (const other of state.enemies) {
          if (!other.alive || other === e || other._deathTimer >= 0) continue;
          if (dist(e.x, e.y, other.x, other.y) < SHATTER_RADIUS + ENEMIES[other.type].size) {
            damageEnemy(state, other, SHATTER_DMG, p.idx);
          }
        }
        spawnParticles(state, e.x, e.y, '#88ddff', 20, TIMING.PARTICLE_LIFE_LONG);
        spawnShockwave(state, e.x, e.y, SHATTER_RADIUS, '#44bbff');
        shake(state, 3);
      }
    }

    // Explode on death — damage nearby players
    if (et.explodeOnDeath) {
      const explR = et.explodeOnDeath;
      for (const pl of state.players) {
        if (!pl.alive || pl.iframes > 0) continue;
        if (dist(e.x, e.y, pl.x, pl.y) < explR + WIZARD_SIZE) {
          damagePlayer(state, pl, 2);
        }
      }
      spawnParticles(state, e.x, e.y, '#ff8833', 25, TIMING.PARTICLE_LIFE_LONG);
      spawnShockwave(state, e.x, e.y, explR, '#ff6622');
      shake(state, 4);
    }

    // Split on death — spawn 2 smaller copies
    if (et.splitInto && ENEMIES[et.splitInto]) {
      const hpScale = 1 + Math.floor(state.wave / 4);
      const spdScale = 1 + state.wave * 0.02;
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const splitDist = 20;
        const splitEt = ENEMIES[et.splitInto];
        const splitHp = splitEt.hp + hpScale - 1;
        state.enemies.push({
          id: nextEnemyId(state),
          type: et.splitInto,
          x: e.x + Math.cos(angle) * splitDist,
          y: e.y + Math.sin(angle) * splitDist,
          vx: Math.cos(angle) * 50,
          vy: Math.sin(angle) * 50,
          hp: splitHp,
          maxHp: splitHp,
          alive: true,
          atkTimer: splitEt.atkCd * Math.random() + 0.5,
          target: Math.floor(Math.random() * 2),
          iframes: TIMING.IFRAME_SPLIT,
          slowTimer: 0,
          stunTimer: 0,
          _burnTimer: 0,
          _burnTick: 0,
          _burnOwner: 0,
          _friendly: false,
          _owner: 0,
          _lifespan: 0,
          _spdMul: spdScale,
          _dmgMul: e._dmgMul || 1,
          _teleportTimer: 0,
          _hitFlash: 0, _deathTimer: -1, _atkAnim: 0,
          _elite: false,
          _dmgReductionActive: false, _dmgReductionTimer: 0, _dmgReductionTriggered: false,
        });
      }
      spawnText(state, e.x, e.y - 15, 'SPLIT!', '#66aa66');
    }

    // Scale particles with combo
    const particleCount = 8 + Math.min(state.comboCount, 12);
    spawnParticles(state, e.x, e.y, et.color, particleCount, 1);
    // Scale shockwave radius with combo
    const shockR = 25 + Math.min(state.comboCount * 0.5, 20);
    spawnShockwave(state, e.x, e.y, shockR);
    netSfx(state, SfxName.Kill);

    if (et.boss) {
      shake(state, 10);
      spawnText(state, e.x, e.y - 20, 'BOSS SLAIN!', '#ffcc44');
      flashScreen(state, TIMING.FLASH_SCREEN_BOSS, '255,220,100');
    }

    // Chain hit: damage jumps to nearby enemy
    if (p && p.chainHit) {
      let nearest: EnemyView | null = null;
      let nd = Infinity;
      for (const e2 of state.enemies) {
        if (!e2.alive || e2 === e) continue;
        const d = dist(e.x, e.y, e2.x, e2.y);
        if (d < RANGES.CHAIN && d < nd) { nd = d; nearest = e2; }
      }
      if (nearest) {
        damageEnemy(state, nearest, Math.max(1, Math.floor(p.chainFullDmg ? dmg : dmg * COMBAT.CHAIN_DMG_MULT)), pIdx);
        const chainBeam = state.beams.acquire();
        if (chainBeam) {
          chainBeam.x = e.x; chainBeam.y = e.y;
          chainBeam.angle = Math.atan2(nearest.y - e.y, nearest.x - e.x);
          chainBeam.range = nd; chainBeam.width = 2; chainBeam.color = p.cls.color; chainBeam.life = 0.12;
        }
      }
    }

    // Overkill: excess damage chains
    if (p && p.overkill && e.hp < 0) {
      const excess = Math.abs(e.hp);
      let nearest2: EnemyView | null = null;
      let nd2 = Infinity;
      for (const e2 of state.enemies) {
        if (!e2.alive || e2 === e) continue;
        const d = dist(e.x, e.y, e2.x, e2.y);
        if (d < 100 && d < nd2) { nd2 = d; nearest2 = e2; }
      }
      if (nearest2) damageEnemy(state, nearest2, excess, pIdx);
    }

    // Drop health sometimes
    if (Math.random() < scaledHealthDropChance(state.wave)) {
      state.pickups.push({
        x: e.x, y: e.y, type: PickupType.Health, collected: false,
        value: 0, _owner: 0, _dmg: 0, _radius: 0, _slow: 0, _color: '',
      });
    }

    // Wave completion is handled by checkWaveComplete() in dungeon.ts
  }
}

// ═══════════════════════════════════
//       DAMAGE PLAYER
// ═══════════════════════════════════

export function damagePlayer(state: GameState, p: Player, rawDmg: number, attacker?: Enemy): void {
  if (p.iframes > 0) return;

  // Ward Stone shield: block hit entirely
  if (state.shopShieldHits > 0) {
    state.shopShieldHits--;
    spawnText(state, p.x, p.y - 20, 'BLOCKED!', '#4488cc');
    p.iframes = TIMING.IFRAME_BLOCK;
    return;
  }

  // Dodge
  if (p.dodgeChance && Math.random() < p.dodgeChance) {
    spawnText(state, p.x, p.y - 20, 'DODGE', '#88ccff');
    return;
  }

  let reducedDmg = rawDmg;
  // Knight bulwark: 25% less damage
  if (p.clsKey === 'knight') reducedDmg = Math.ceil(reducedDmg * COMBAT.BULWARK_DMG_MULT);
  // Blood rage: take 2x damage
  if (p._rage > 0) reducedDmg = Math.ceil(reducedDmg * 2);
  // Cursed: damage taken multiplier
  if (p.damageTakenMul && p.damageTakenMul !== 1) reducedDmg = Math.ceil(reducedDmg * p.damageTakenMul);
  const dmg = Math.max(1, reducedDmg - (p.armor || 0));

  p.hp -= dmg;
  p.iframes = TIMING.IFRAME_DAMAGE;
  p._animHitFlash = TIMING.HIT_FLASH;
  shake(state, 3);
  spawnParticles(state, p.x, p.y, '#ff4444', 8);
  netSfx(state, SfxName.Hit);
  spawnText(state, p.x, p.y - 20, `-${dmg}`, '#ff4444');

  // Thorns
  if (p.thorns && attacker && attacker.alive !== undefined) {
    attacker.hp -= p.thorns;
    spawnParticles(state, attacker.x, attacker.y, '#aa88ff', 4, COMBAT.THORNS_PARTICLE_LIFE);
    if (attacker.hp <= 0) {
      attacker.alive = false;
      spawnParticles(state, attacker.x, attacker.y, ENEMIES[attacker.type].color, 12);
      netSfx(state, SfxName.Kill);
    }
  }

  // Magma Armor: attackers catch fire
  if (p.magmaArmor && attacker && attacker.alive) {
    attacker._burnTimer = (attacker._burnTimer || 0) + 3;
    attacker._burnOwner = p.idx;
    spawnParticles(state, attacker.x, attacker.y, '#ff6633', 4, 0.3);
  }

  if (p.hp <= 0) {
    // Second wind
    if (p.secondWind && p.secondWind > 0) {
      p.secondWind--;
      p.hp = Math.floor(p.maxHp / 2);
      p.iframes = TIMING.IFRAME_RESPAWN;
      spawnParticles(state, p.x, p.y, '#ffcc44', 20);
      spawnText(state, p.x, p.y - 25, 'SECOND WIND', '#ffcc44');
      netSfx(state, SfxName.Pickup);
      return;
    }

    // Lives system: single-player instant respawn if lives remain
    if (state.mode === NetworkMode.Local && state.lives > 1) {
      state.lives--;
      p.hp = p.maxHp;
      p.x = ROOM_WIDTH / 2;
      p.y = ROOM_HEIGHT * 0.6;
      p.vx = 0;
      p.vy = 0;
      p.iframes = 3.0; // generous iframes on respawn
      p.stunTimer = 0;
      p.slowTimer = 0;
      spawnParticles(state, p.x, p.y, '#44ccff', 25, 1.2);
      spawnShockwave(state, p.x, p.y, 80, 'rgba(68,204,255,.5)');
      spawnText(state, p.x, p.y - 30, `${state.lives} LIVES LEFT`, '#44ccff');
      netSfx(state, SfxName.Pickup);
      shake(state, 5);
      flashScreen(state, 0.2, '68,204,255');
      return;
    }

    p.alive = false;
    p._animDeathFade = 1.0;
    spawnParticles(state, p.x, p.y, '#ff6633', 35, 1.3);
    spawnShockwave(state, p.x, p.y, 70, 'rgba(255,100,50,.5)');
    netSfx(state, SfxName.Boom);
    shake(state, 10);
    flashScreen(state, TIMING.FLASH_SCREEN_ULT, '255,100,50');

    // Co-op: delayed respawn handled by physics.ts
    if (state.mode !== NetworkMode.Local) {
      p.respawnTimer = RESPAWN_DELAY_MS / 1000;
    }

    // Game over if all players dead and no lives left
    const allDead = state.players.every(pl => !pl.alive);
    if (allDead && state.lives <= (state.mode === NetworkMode.Local ? 1 : 0)) {
      state.gamePhase = GamePhase.GameOver;
      document.exitPointerLock();
      document.body.classList.remove('in-game');
      setTimeout(() => {
        const statsEl = document.getElementById('go-stats');
        if (statsEl) {
          statsEl.innerHTML = `Wave Reached: ${state.wave} / 20<br>Kills: ${state.totalKills}<br>Gold: ${state.gold}<br>Lives Used: ${state.maxLives}`;
        }
        const goEl = document.getElementById('gameover');
        if (goEl) goEl.style.display = 'flex';
      }, GAME_OVER_DELAY_MS);
    }
  }
}

// ═══════════════════════════════════
//       SPELL CASTING
// ═══════════════════════════════════

/** Silent cast: no mana cost, no cooldown, no sound (for split shot / double tap) */
export function castSpellSilent(state: GameState, p: Player, idx: number, angle: number, dmgMult = 1): void {
  const def = p.cls.spells[idx];
  if (def.type === SpellType.Projectile || def.type === SpellType.Homing) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sx = p.x + cos * WIZARD_SIZE * 1.5;
    const sy = p.y + sin * WIZARD_SIZE * 1.5;
    const rt = spellToRuntime(def);
    rt.dmg = getEffectiveSpellDmg(p, idx);
    if (dmgMult !== 1) rt.dmg = Math.ceil(rt.dmg * dmgMult);
    // Ranger Eagle Eye: +30% primary range
    if (p.clsKey === 'ranger' && idx === 0) {
      rt.life *= 1.3;
    }
    state.spells.push({
      ...rt,
      x: sx, y: sy,
      vx: cos * def.speed, vy: sin * def.speed,
      owner: p.idx, age: 0, zapTimer: 0, pierceLeft: (p.pierce || 0) + (def.pierce || 0),
      clsKey: p.clsKey,
      _reversed: false,
    });
  }
}

function spellToRuntime(def: SpellDef): Spell {
  return {
    type: def.type,
    dmg: def.dmg,
    speed: def.speed,
    radius: def.radius,
    life: def.life,
    color: def.color,
    trail: def.trail,
    x: 0, y: 0, vx: 0, vy: 0,
    owner: 0, age: 0, zapTimer: 0, pierceLeft: 0,
    homing: def.homing,
    zap: def.zap,
    zapRate: def.zapRate,
    slow: def.slow,
    drain: def.drain,
    explode: def.explode,
    burn: def.burn,
    stun: def.stun,
    clsKey: '',
    _reversed: false,
    _bounces: 0,
  };
}

/** Determine the sfx type from class key */
function classSfx(clsKey: string): SfxName {
  if (clsKey === 'pyromancer') return SfxName.Fire;
  if (clsKey === 'cryomancer') return SfxName.Ice;
  if (clsKey === 'stormcaller') return SfxName.Zap;
  return SfxName.Arcane;
}

export function castSpell(state: GameState, p: Player, idx: number, angle: number): void {
  const def = p.cls.spells[idx];
  p.mana -= def.mana;
  // Warlock Dark Pact: refund 30% mana cost but pay HP instead
  if (p.clsKey === 'warlock' && def.mana > 0) {
    const refund = Math.floor(def.mana * COMBAT.WARLOCK_MANA_REFUND);
    p.mana += refund;
    if (p.soulSiphon) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      spawnText(state, p.x, p.y - 20, '+1 HP', '#44ff88');
    } else {
      p.hp -= 1;
      if (p.hp <= 0) p.hp = 1; // don't let Dark Pact kill you
    }
  }
  let cd = def.cd;
  // Bloodlust: reduce cooldown based on kill stacks (max +100% attack speed = halve cooldown)
  if (p.bloodlust && p._bloodlustStacks > 0) {
    const speedBonus = Math.min(p._bloodlustStacks * 0.05, COMBAT.BLOODLUST_SPEED_CAP);
    cd = cd / (1 + speedBonus);
  }
  p.cd[idx] = Math.max(CD_FLOORS[idx] ?? 0, cd);

  // Cursed: self-damage chance
  if (p.selfDmgChance && Math.random() < p.selfDmgChance) {
    damagePlayer(state, p, 1);
  }

  // ultEcho: double LMB damage for N casts after ultimate
  let echoDmgMul = 1;
  if (idx === 0 && p.ultEchoLeft > 0) {
    echoDmgMul = 2;
    p.ultEchoLeft--;
    spawnText(state, p.x, p.y - 15, 'ECHO!', '#ffaa44');
  }

  // ── CLASS-SPECIFIC Q ABILITIES ──
  if (idx === 2) {
    // Pyromancer: Meteor Shower — 3 scattered meteors + burn zones
    if (p.clsKey === 'pyromancer') {
      const wp = toWorld(state, state.mouseX, state.mouseY);
      for (let i = 0; i < 3; i++) {
        const ox = rand(-40, 40);
        const oy = rand(-40, 40);
        const meteorDelay = TIMING.ZONE_TICK + i * TIMING.METEOR_DELAY_STEP;
        const meteorAoe = state.aoeMarkers.acquire();
        if (meteorAoe) {
          meteorAoe.x = wp.x + ox; meteorAoe.y = wp.y + oy; meteorAoe.radius = 50; meteorAoe.delay = meteorDelay;
          meteorAoe.dmg = 2; meteorAoe.color = '#ff2200'; meteorAoe.owner = p.idx; meteorAoe.stun = 0; meteorAoe.age = 0;
        }
        // Burn zone after each meteor lands
        setTimeout(() => {
          const burnZone = state.zones.acquire();
          if (burnZone) {
            burnZone.x = wp.x + ox; burnZone.y = wp.y + oy; burnZone.radius = 35; burnZone.duration = 2;
            burnZone.dmg = 1; burnZone.color = '#ff4400'; burnZone.owner = p.idx;
            burnZone.slow = 0; burnZone.stun = 0; burnZone.tickRate = TIMING.ZONE_TICK; burnZone.tickTimer = 0; burnZone.age = 0;
            burnZone.drain = 0; burnZone.heal = 0; burnZone.pull = 0; burnZone.freezeAfter = 0;
          }
        }, meteorDelay * 1000);
      }
      netSfx(state, SfxName.Fire);
      return;
    }
    // Stormcaller: Thunder Strike — AoE + chain lightning on detonation
    if (p.clsKey === 'stormcaller') {
      const wp = toWorld(state, state.mouseX, state.mouseY);
      const thunderAoe = state.aoeMarkers.acquire();
      if (thunderAoe) {
        thunderAoe.x = wp.x; thunderAoe.y = wp.y; thunderAoe.radius = def.radius; thunderAoe.delay = def.delay;
        thunderAoe.dmg = def.dmg; thunderAoe.color = def.color; thunderAoe.owner = p.idx;
        thunderAoe.stun = def.stun || 0; thunderAoe.age = 0;
      }
      // After detonation, chain to nearby enemies
      setTimeout(() => {
        const hitEnemies: EnemyView[] = [];
        let lastX = wp.x, lastY = wp.y;
        for (let chain = 0; chain < 3; chain++) {
          let nearest: EnemyView | null = null;
          let nd = Infinity;
          for (const e of state.enemies) {
            if (!e.alive || hitEnemies.includes(e)) continue;
            const d = dist(lastX, lastY, e.x, e.y);
            if (d < 150 && d > 20 && d < nd) { nd = d; nearest = e; }
          }
          if (!nearest) break;
          hitEnemies.push(nearest);
          damageEnemy(state, nearest, 2, p.idx);
          nearest.stunTimer = (nearest.stunTimer || 0) + TIMING.STUN_DURATION;
          const thunderBeam = state.beams.acquire();
          if (thunderBeam) {
            thunderBeam.x = lastX; thunderBeam.y = lastY;
            thunderBeam.angle = Math.atan2(nearest.y - lastY, nearest.x - lastX);
            thunderBeam.range = nd; thunderBeam.width = 3; thunderBeam.color = '#ffcc44'; thunderBeam.life = TIMING.BEAM_LIFE;
          }
          spawnParticles(state, nearest.x, nearest.y, '#ffcc44', 5, TIMING.PARTICLE_LIFE_SHORT);
          lastX = nearest.x;
          lastY = nearest.y;
        }
        if (hitEnemies.length > 0) netSfx(state, SfxName.Zap);
      }, (def.delay || TIMING.SPELL_DEFAULT_DELAY) * 1000);
      netSfx(state, SfxName.Arcane);
      return;
    }
    // Cryomancer: Frost Prison — strong slow + freeze after 1.5s
    if (p.clsKey === 'cryomancer') {
      const wp = toWorld(state, state.mouseX, state.mouseY);
      const frostZone = state.zones.acquire();
      if (frostZone) {
        frostZone.x = wp.x; frostZone.y = wp.y; frostZone.radius = def.radius; frostZone.duration = def.duration;
        frostZone.dmg = def.dmg; frostZone.color = def.color; frostZone.owner = p.idx;
        frostZone.slow = 0.95; frostZone.stun = 0; frostZone.tickRate = def.tickRate; frostZone.tickTimer = 0; frostZone.age = 0;
        frostZone.drain = 0; frostZone.heal = 0; frostZone.pull = 0; frostZone.freezeAfter = TIMING.FREEZE_DURATION;
      }
      netSfx(state, SfxName.Ice);
      return;
    }
    // Necromancer: Death Harvest — drain + pull enemies toward center
    if (p.clsKey === 'necromancer') {
      const wp = toWorld(state, state.mouseX, state.mouseY);
      const deathZone = state.zones.acquire();
      if (deathZone) {
        deathZone.x = wp.x; deathZone.y = wp.y; deathZone.radius = def.radius; deathZone.duration = def.duration;
        deathZone.dmg = def.dmg; deathZone.color = def.color; deathZone.owner = p.idx;
        deathZone.slow = def.slow || 0; deathZone.stun = 0; deathZone.tickRate = def.tickRate; deathZone.tickTimer = 0; deathZone.age = 0;
        deathZone.drain = 1; deathZone.heal = 0; deathZone.pull = 30; deathZone.freezeAfter = 0;
      }
      netSfx(state, SfxName.Arcane);
      return;
    }
    // Arcanist: Arcane Salvo — 5 homing projectiles
    if (p.clsKey === 'arcanist') {
      for (let i = 0; i < 5; i++) {
        const sa = angle + (i - 2.5) * 0.12 + rand(-0.05, 0.05);
        setTimeout(() => {
          state.spells.push({
            type: SpellType.Homing, dmg: def.dmg, speed: def.speed,
            radius: def.radius || 7, life: 2, homing: 2.5,
            color: def.color, trail: def.trail,
            x: p.x + Math.cos(sa) * WIZARD_SIZE,
            y: p.y + Math.sin(sa) * WIZARD_SIZE,
            vx: Math.cos(sa) * def.speed,
            vy: Math.sin(sa) * def.speed,
            owner: p.idx, age: 0, zapTimer: 0, pierceLeft: 0,
            zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
            stun: 0, clsKey: p.clsKey, _reversed: false, _bounces: 0,
          });
          netSfx(state, SfxName.Arcane);
        }, i * 80);
      }
      return;
    }
    // Paladin: Hallowed Ground — self-centered healing zone
    if (p.clsKey === 'paladin') {
      const healZone = state.zones.acquire();
      if (healZone) {
        healZone.x = p.x; healZone.y = p.y; healZone.radius = 100; healZone.duration = def.duration;
        healZone.dmg = def.dmg; healZone.color = def.color; healZone.owner = p.idx;
        healZone.slow = def.slow || 0; healZone.stun = 0; healZone.tickRate = def.tickRate; healZone.tickTimer = 0; healZone.age = 0;
        healZone.drain = 0; healZone.heal = 2; healZone.pull = 0; healZone.freezeAfter = 0;
      }
      netSfx(state, SfxName.Pickup);
      spawnParticles(state, p.x, p.y, '#ffffaa', 15);
      return;
    }
    // Monk: Chi Burst — instant heal + knockback pulse
    if (p.clsKey === 'monk') {
      // Heal self (reads spell def so Zen Master 3× multiplier works)
      const healAmt = def.heal || 3;
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      spawnText(state, p.x, p.y - 20, `+${healAmt} HP`, '#88ff88');
      // Zen Master: also restore mana equal to heal amount
      if (p.zenMana) {
        p.mana = Math.min(p.maxMana, p.mana + healAmt);
        spawnText(state, p.x, p.y - 35, `+${healAmt} MP`, '#88bbff');
      }
      // Knockback all enemies in range
      const knockR = 80;
      const knockForce = COMBAT.KNOCKBACK_FORCE;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < knockR && d > 0) {
          const knockAngle = Math.atan2(e.y - p.y, e.x - p.x);
          e.x += Math.cos(knockAngle) * (knockForce / Math.max(d, 30)) * 3;
          e.y += Math.sin(knockAngle) * (knockForce / Math.max(d, 30)) * 3;
          damageEnemy(state, e, 1, p.idx);
        }
      }
      spawnShockwave(state, p.x, p.y, knockR, 'rgba(255,255,200,.4)');
      spawnParticles(state, p.x, p.y, '#eedd88', 20, 0.8);
      netSfx(state, SfxName.Boom);
      shake(state, 4);
      return;
    }
  }

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sx = p.x + cos * WIZARD_SIZE * 1.5;
  const sy = p.y + sin * WIZARD_SIZE * 1.5;
  const sType = classSfx(p.clsKey);

  if (def.type === SpellType.Projectile || def.type === SpellType.Homing) {
    const spell = {
      ...spellToRuntime(def),
      x: sx, y: sy,
      vx: cos * def.speed, vy: sin * def.speed,
      owner: p.idx, age: 0, zapTimer: 0, pierceLeft: (p.pierce || 0) + (def.pierce || 0),
      clsKey: p.clsKey,
    };
    spell.dmg = Math.round(getEffectiveSpellDmg(p, idx) * echoDmgMul);
    // Ranger Eagle Eye: +30% primary range
    if (p.clsKey === 'ranger' && idx === 0) {
      spell.life *= 1.3;
    }
    state.spells.push(spell);
    // Muzzle flash
    spawnParticles(state, p.x + cos * 15, p.y + sin * 15, spell.color, 3, 0.3);
    // Barrage Mode: fire 2 extra burst shots for primary
    if (idx === 0 && p.burstFire) {
      for (const bOff of [-0.12, 0.12]) {
        const ba = angle + bOff;
        const bcos = Math.cos(ba);
        const bsin = Math.sin(ba);
        const burstRt = spellToRuntime(def);
        burstRt.dmg = getEffectiveSpellDmg(p, idx);
        state.spells.push({
          ...burstRt,
          x: p.x + bcos * WIZARD_SIZE * 1.5,
          y: p.y + bsin * WIZARD_SIZE * 1.5,
          vx: bcos * def.speed, vy: bsin * def.speed,
          owner: p.idx, age: 0, zapTimer: 0,
          pierceLeft: (p.pierce || 0) + (def.pierce || 0),
          clsKey: p.clsKey,
          _reversed: false,
        });
      }
    }
    netSfx(state, sType);
  } else if (def.type === SpellType.Beam) {
    const beamFx = state.beams.acquire();
    if (beamFx) { beamFx.x = p.x; beamFx.y = p.y; beamFx.angle = angle; beamFx.range = def.range; beamFx.width = def.width; beamFx.color = def.color; beamFx.life = 0.15; }
    // Beam hit detection
    const beamDmg = Math.round(getEffectiveSpellDmg(p, idx) * echoDmgMul);
    let primaryTarget: EnemyView | null = null;
    for (let d = 0; d < def.range; d += 5) {
      const bx = p.x + cos * d;
      const by = p.y + sin * d;
      let blocked = false;
      for (const pl of state.pillars) {
        if (dist(bx, by, pl.x, pl.y) < pl.radius) { blocked = true; break; }
      }
      if (blocked) break;
      for (const e of state.enemies) {
        if (!e.alive || e.iframes > 0) continue;
        if (dist(bx, by, e.x, e.y) < ENEMIES[e.type].size + 4) {
          damageEnemy(state, e, beamDmg, p.idx);
          if (def.drain) {
            p.hp = Math.min(p.maxHp, p.hp + def.drain);
            spawnText(state, p.x, p.y - 20, `+${def.drain}`, '#44ff88');
          }
          if (!primaryTarget) primaryTarget = e;
          break;
        }
      }
    }
    // Hex Chain: Drain Life chains to additional nearby enemies
    if (p.hexChain > 0 && primaryTarget) {
      const hitSet = new Set<EnemyView>([primaryTarget]);
      let lastHit = primaryTarget;
      for (let c = 0; c < p.hexChain; c++) {
        let nearest: EnemyView | null = null;
        let nd = Infinity;
        for (const e2 of state.enemies) {
          if (!e2.alive || hitSet.has(e2)) continue;
          const d2 = dist(lastHit.x, lastHit.y, e2.x, e2.y);
          if (d2 < 200 && d2 < nd) { nd = d2; nearest = e2; }
        }
        if (!nearest) break;
        hitSet.add(nearest);
        damageEnemy(state, nearest, beamDmg, p.idx);
        if (def.drain) {
          p.hp = Math.min(p.maxHp, p.hp + def.drain);
          spawnText(state, p.x, p.y - 20, `+${def.drain}`, '#44ff88');
        }
        const chainBeam = state.beams.acquire();
        if (chainBeam) {
          chainBeam.x = lastHit.x; chainBeam.y = lastHit.y;
          chainBeam.angle = Math.atan2(nearest.y - lastHit.y, nearest.x - lastHit.x);
          chainBeam.range = nd; chainBeam.width = 2; chainBeam.color = def.color; chainBeam.life = 0.12;
        }
        lastHit = nearest;
      }
    }
    netSfx(state, SfxName.Zap);
  } else if (def.type === SpellType.Cone) {
    // Visual particles
    for (let a = -def.angle / 2; a <= def.angle / 2; a += 0.15) {
      for (let d = 30; d < def.range; d += 20) {
        spawnParticles(state, p.x + Math.cos(angle + a) * d, p.y + Math.sin(angle + a) * d, def.color, 1, 0.4);
      }
    }
    // Damage enemies in cone
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > def.range) continue;
      const a2 = Math.atan2(e.y - p.y, e.x - p.x);
      if (Math.abs(wrapAngle(a2 - angle)) <= def.angle / 2) {
        damageEnemy(state, e, Math.round(getEffectiveSpellDmg(p, idx) * echoDmgMul), p.idx);
        if (def.slow) e.slowTimer = (e.slowTimer || 0) + def.slow;
        if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
      }
    }
    netSfx(state, SfxName.Fire);
    shake(state, 4);
  } else if (def.type === SpellType.Nova) {
    spawnShockwave(state, p.x, p.y, def.range, def.color);
    spawnParticles(state, p.x, p.y, def.color, 20);
    let novaHealed = 0;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (dist(p.x, p.y, e.x, e.y) <= def.range) {
        damageEnemy(state, e, getEffectiveSpellDmg(p, idx), p.idx);
        if (def.slow) e.slowTimer = (e.slowTimer || 0) + def.slow;
        if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
        if (def.drain) novaHealed += def.drain;
      }
    }
    if (novaHealed > 0) {
      p.hp = Math.min(p.maxHp, p.hp + novaHealed);
      spawnText(state, p.x, p.y - 20, `+${novaHealed} HP`, '#44ff88');
    }
    netSfx(state, SfxName.Ice);
    shake(state, 5);
  } else if (def.type === SpellType.AoeDelayed) {
    const wp = toWorld(state, state.mouseX, state.mouseY);
    const aoeM = state.aoeMarkers.acquire();
    if (aoeM) {
      aoeM.x = wp.x; aoeM.y = wp.y; aoeM.radius = def.radius; aoeM.delay = def.delay; aoeM.dmg = def.dmg;
      aoeM.color = def.color; aoeM.owner = p.idx; aoeM.stun = def.stun || 0; aoeM.age = 0;
    }
    netSfx(state, SfxName.Arcane);
  } else if (def.type === SpellType.Blink) {
    const nx = clamp(p.x + cos * def.range, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
    const ny = clamp(p.y + sin * def.range, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
    spawnParticles(state, p.x, p.y, def.color, 12);
    p.x = nx;
    p.y = ny;
    spawnParticles(state, p.x, p.y, def.color, 12);
    p.iframes = 0.3;
    netSfx(state, SfxName.Blink);
  } else if (def.type === SpellType.Barrage) {
    // Muzzle flash for barrage
    spawnParticles(state, p.x + cos * 15, p.y + sin * 15, def.color, 3, 0.3);
    for (let i = 0; i < def.count; i++) {
      const sa = angle + (i - def.count / 2) * def.spread / def.count + rand(-0.05, 0.05);
      // Stagger barrage shots
      setTimeout(() => {
        const barRt = spellToRuntime(def);
        barRt.dmg = getEffectiveSpellDmg(p, idx);
        state.spells.push({
          ...barRt,
          type: SpellType.Projectile,
          x: p.x + Math.cos(sa) * WIZARD_SIZE,
          y: p.y + Math.sin(sa) * WIZARD_SIZE,
          vx: Math.cos(sa) * def.speed,
          vy: Math.sin(sa) * def.speed,
          owner: p.idx, age: 0, pierceLeft: (p.pierce || 0) + (def.pierce || 0), zapTimer: 0,
          clsKey: p.clsKey,
        });
        netSfx(state, SfxName.Arcane);
      }, i * 60);
    }
  } else if (def.type === SpellType.Zone) {
    const wp = toWorld(state, state.mouseX, state.mouseY);
    const spellZone = state.zones.acquire();
    if (spellZone) {
      spellZone.x = wp.x; spellZone.y = wp.y; spellZone.radius = def.radius; spellZone.duration = def.duration;
      spellZone.dmg = def.dmg; spellZone.color = def.color; spellZone.owner = p.idx;
      spellZone.slow = def.slow || 0; spellZone.stun = def.stun || 0; spellZone.tickRate = def.tickRate; spellZone.tickTimer = 0; spellZone.age = 0;
      spellZone.drain = def.drain || 0; spellZone.heal = def.heal || 0; spellZone.pull = 0; spellZone.freezeAfter = 0;
      spellZone._turret = p.clsKey === 'engineer' && def.name.includes('Turret');
      // Engineer Overclock: turrets fire 20% faster
      if (spellZone._turret) {
        spellZone.tickRate *= 0.8;
      }
      // Engineer Turret Army: enforce turret count limit
      if (spellZone._turret && !spellZone._megaTurret) {
        const maxTurrets = p.turretArmy ? 3 : 1;
        // Count existing turrets owned by this player (excluding the just-created one)
        const existing: { idx: number; age: number }[] = [];
        for (let ti = state.zones.count - 1; ti >= 0; ti--) {
          const tz = state.zones.get(ti);
          if (tz === spellZone) continue; // skip the one we just created
          if (tz._turret && !tz._megaTurret && tz.owner === p.idx) {
            existing.push({ idx: ti, age: tz.age });
          }
        }
        // Remove oldest turrets until we're within the limit
        if (existing.length >= maxTurrets) {
          existing.sort((a, b) => b.age - a.age); // highest age = oldest first
          for (let ri = 0; ri < existing.length - maxTurrets + 1; ri++) {
            state.zones.release(existing[ri].idx);
          }
        }
      }
    }
    netSfx(state, SfxName.Ice);
  } else if (def.type === SpellType.Rewind) {
    const snap = p._rewindSnap;
    if (snap) {
      p.hp = Math.min(p.maxHp, Math.max(p.hp, snap.hp));
      p.mana = Math.min(p.maxMana, Math.max(p.mana, snap.mana));
      spawnParticles(state, p.x, p.y, '#ffcc44', 20);
      spawnShockwave(state, p.x, p.y, 60, 'rgba(255,200,60,.4)');
      spawnText(state, p.x, p.y - 25, 'REWIND', '#ffcc44');
      netSfx(state, SfxName.Blink);
      shake(state, 3);
      flashScreen(state, 0.15, '255,200,60');
    } else {
      // Refund if no snapshot
      spawnText(state, p.x, p.y - 20, 'NO SNAPSHOT', '#886644');
      p.mana += def.mana;
      p.cd[2] = 0;
    }
  } else if (def.type === SpellType.Leap) {
    // Berserker leap slam
    const nx = clamp(p.x + cos * def.range, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
    const ny = clamp(p.y + sin * def.range, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
    spawnParticles(state, p.x, p.y, def.color, 8);
    p.x = nx;
    p.y = ny;
    p.iframes = 0.3;
    // AoE damage on landing
    spawnShockwave(state, p.x, p.y, def.aoeR, def.color);
    spawnParticles(state, p.x, p.y, def.color, 15, 1);
    netSfx(state, SfxName.Boom);
    shake(state, 6);
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (dist(p.x, p.y, e.x, e.y) < def.aoeR + ENEMIES[e.type].size) {
        damageEnemy(state, e, getEffectiveSpellDmg(p, idx), p.idx);
        if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
      }
    }
  } else if (def.type === SpellType.AllyShield) {
    // Paladin: shield ally (or self if solo)
    const ally = state.players[1 - p.idx];
    const target = (ally && ally.alive) ? ally : p;
    target.iframes = Math.max(target.iframes, def.duration);
    target._holyShield = def.duration;
    spawnParticles(state, target.x, target.y, '#ffffcc', 15);
    spawnShockwave(state, target.x, target.y, 40, 'rgba(255,255,200,.4)');
    netSfx(state, SfxName.Pickup);
    spawnText(state, target.x, target.y - 20, 'SHIELDED', '#ffffcc');
  } else if (def.type === SpellType.Trap) {
    // Ranger trap: place at mouse position
    const wp = toWorld(state, state.mouseX, state.mouseY);
    state.pickups.push({
      x: wp.x, y: wp.y, type: PickupType.Trap, collected: false,
      value: 0,
      _owner: p.idx, _dmg: def.dmg, _radius: def.radius, _slow: def.slow || 0, _color: def.color,
    });
    netSfx(state, SfxName.Hit);
    // Engineer mine field: place 3 mines
    if (p.clsKey === 'engineer' && def.count && def.count > 1) {
      for (let m = 1; m < def.count; m++) {
        const spreadAngle = angle + (m - def.count / 2) * (def.spread || 0.4);
        state.pickups.push({
          x: wp.x + Math.cos(spreadAngle) * 30 * m, y: wp.y + Math.sin(spreadAngle) * 30 * m,
          type: PickupType.Trap, collected: false,
          value: 0,
          _owner: p.idx, _dmg: def.dmg, _radius: def.radius, _slow: def.slow || 0, _color: def.color,
        });
      }
    }
  } else if (def.type === SpellType.Ultimate && def.key === 'Q') {
    // Special Q abilities that use Ultimate type
    if (p.clsKey === 'druid') {
      // Spirit Wolf: summon a wolf ally
      const wolf = createFriendlyEnemy(state, p.x + cos * 40, p.y + sin * 40, p.idx);
      wolf.type = '_wolf';
      wolf.hp = 8;
      wolf.maxHp = 8;
      wolf._lifespan = 15;
      state.enemies.push(wolf);
      spawnParticles(state, wolf.x, wolf.y, '#88aa66', 10);
      netSfx(state, SfxName.Pickup);
    } else if (p.clsKey === 'warlock') {
      // Summon Imp: small ranged demon ally
      let canSpawn = true;
      if (p.demonicPact) {
        const impCount = state.enemies.filter(e => e.alive && e._friendly && e.type === '_imp' && e._owner === p.idx).length;
        if (impCount >= 3) canSpawn = false;
      }
      if (canSpawn) {
        const imp = createFriendlyEnemy(state, p.x + cos * 40, p.y + sin * 40, p.idx);
        imp.type = '_imp';
        imp.hp = 5;
        imp.maxHp = 5;
        imp._lifespan = p.demonicPact ? 0 : 12;
        state.enemies.push(imp);
        spawnParticles(state, imp.x, imp.y, '#cc4466', 10);
        netSfx(state, SfxName.Arcane);
      }
    }
  }
}

// ═══════════════════════════════════
//       ULTIMATE ABILITIES
// ═══════════════════════════════════

export function castUltimate(state: GameState, p: Player, angle: number): void {
  p.ultCharge = 0;
  p.ultReady = false;
  p._animUltTimer = TIMING.ANIM_ULT;
  netSfx(state, SfxName.Boom);
  shake(state, 12);
  flashScreen(state, TIMING.FLASH_SCREEN);
  spawnParticles(state, p.x, p.y, p.cls.color, 30, TIMING.SPAWN_PARTICLE_SCALE);
  spawnShockwave(state, p.x, p.y, ULTIMATE.SHOCKWAVE_RADIUS, p.cls.color);
  spawnText(state, p.x, p.y - 35, 'ULTIMATE!', p.cls.color);

  // ultHeal: heal 50% max HP on cast
  if (p.ultHeal) {
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * ULTIMATE.HEAL_FRACTION));
    spawnText(state, p.x, p.y - 25, '+50% HP', '#88ff88');
  }

  const pw = p.ultPower || 1;

  if (p.clsKey === 'pyromancer') {
    // Inferno: rain 8 meteors across the room with lingering burn zones
    for (let i = 0; i < 8; i++) {
      const mx = rand(60, ROOM_WIDTH - 60);
      const my = rand(60, ROOM_HEIGHT - 60);
      setTimeout(() => {
        const ultAoe = state.aoeMarkers.acquire();
        if (ultAoe) {
          ultAoe.x = mx; ultAoe.y = my; ultAoe.radius = 80; ultAoe.delay = ULTIMATE.METEOR_DELAY;
          ultAoe.dmg = Math.round(5 * pw); ultAoe.color = '#ff2200'; ultAoe.owner = p.idx; ultAoe.stun = 0; ultAoe.age = 0;
        }
        netSfx(state, SfxName.Fire);
        // Lingering burn zone after meteor lands
        setTimeout(() => {
          const ultBurnZone = state.zones.acquire();
          if (ultBurnZone) {
            ultBurnZone.x = mx; ultBurnZone.y = my; ultBurnZone.radius = 40; ultBurnZone.duration = 3;
            ultBurnZone.dmg = 1; ultBurnZone.color = '#ff4400'; ultBurnZone.owner = p.idx;
            ultBurnZone.slow = 0; ultBurnZone.stun = 0; ultBurnZone.tickRate = ULTIMATE.BURN_ZONE_TICK; ultBurnZone.tickTimer = 0; ultBurnZone.age = 0;
            ultBurnZone.drain = 0; ultBurnZone.heal = 0; ultBurnZone.pull = 0; ultBurnZone.freezeAfter = 0;
          }
        }, ULTIMATE.BURN_ZONE_LINGER);
      }, i * 200);
    }
  } else if (p.clsKey === 'cryomancer') {
    // Absolute Zero: freeze ALL enemies for 3s + damage
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.stunTimer = (e.stunTimer || 0) + 3 * pw;
      damageEnemy(state, e, Math.round(3 * pw), p.idx);
    }
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(100,200,255,.3)');
  } else if (p.clsKey === 'stormcaller') {
    // Chain Lightning: chain from nearest enemy to 7 more
    _aliveEnemies.length = 0;
    for (const e2 of state.enemies) {
      if (e2.alive) _aliveEnemies.push(e2);
    }
    if (_aliveEnemies.length > 0) {
      // Find nearest enemy to start the chain
      let current: EnemyView | null = null;
      let minD = Infinity;
      for (const e of _aliveEnemies) {
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < minD) { minD = d; current = e; }
      }
      const chainTargets: EnemyView[] = [];
      const hitSet = new Set<EnemyView>();
      if (current) {
        chainTargets.push(current);
        hitSet.add(current);
      }
      // Chain to 7 more targets
      for (let i = 0; i < ULTIMATE.CHAIN_TARGETS && current; i++) {
        let next: EnemyView | null = null;
        let nextD = Infinity;
        // Try to find an un-hit enemy within range
        for (const e of _aliveEnemies) {
          if (!e.alive) continue;
          if (hitSet.has(e)) continue;
          const d = dist(current.x, current.y, e.x, e.y);
          if (d < ULTIMATE.CHAIN_RANGE && d < nextD) { nextD = d; next = e; }
        }
        // If no un-hit enemies, wrap around to already-hit ones
        if (!next) {
          for (const e of _aliveEnemies) {
            if (!e.alive || e === current) continue;
            const d = dist(current.x, current.y, e.x, e.y);
            if (d < ULTIMATE.CHAIN_RANGE && d < nextD) { nextD = d; next = e; }
          }
        }
        if (next) {
          chainTargets.push(next);
          hitSet.add(next);
          current = next;
        } else {
          break;
        }
      }
      // Apply damage and draw beams between chain targets
      const chainDmg = Math.round(ULTIMATE.CHAIN_DMG_MULT * pw);
      // Draw beam from player to first target
      if (chainTargets.length > 0) {
        const first = chainTargets[0];
        const ultBeam = state.beams.acquire();
        if (ultBeam) {
          ultBeam.x = p.x; ultBeam.y = p.y;
          ultBeam.angle = Math.atan2(first.y - p.y, first.x - p.x);
          ultBeam.range = dist(p.x, p.y, first.x, first.y);
          ultBeam.width = 4; ultBeam.color = '#ffcc44'; ultBeam.life = ULTIMATE.CHAIN_BEAM_LIFE;
        }
      }
      for (let i = 0; i < chainTargets.length; i++) {
        const target = chainTargets[i];
        ((idx: number, t: EnemyView) => {
          setTimeout(() => {
            if (t.alive) {
              damageEnemy(state, t, chainDmg, p.idx);
              spawnParticles(state, t.x, t.y, '#ffcc44', 6, ULTIMATE.CHAIN_PARTICLE_SCALE);
              netSfx(state, SfxName.Zap);
              shake(state, 2);
            }
            // Draw beam to next target
            if (idx < chainTargets.length - 1) {
              const next = chainTargets[idx + 1];
              const nextBeam = state.beams.acquire();
              if (nextBeam) {
                nextBeam.x = t.x; nextBeam.y = t.y;
                nextBeam.angle = Math.atan2(next.y - t.y, next.x - t.x);
                nextBeam.range = dist(t.x, t.y, next.x, next.y);
                nextBeam.width = 4; nextBeam.color = '#ffcc44'; nextBeam.life = ULTIMATE.CHAIN_BEAM_LIFE;
              }
            }
          }, idx * ULTIMATE.CHAIN_DELAY_STEP);
        })(i, target);
      }
    }
  } else if (p.clsKey === 'arcanist') {
    // Arcane Storm: spiral of 20 homing missiles
    for (let i = 0; i < 20; i++) {
      const sa = p.angle + (i / 20) * Math.PI * 4;
      setTimeout(() => {
        state.spells.push({
          type: SpellType.Homing, dmg: Math.round(2 * pw), speed: 250, radius: 6, life: ULTIMATE.HOMING_MISSILE_LIFE,
          homing: ULTIMATE.HOMING_FACTOR, color: '#ff55aa', trail: '#dd3388',
          x: p.x + Math.cos(sa) * 20, y: p.y + Math.sin(sa) * 20,
          vx: Math.cos(sa) * 200, vy: Math.sin(sa) * 200,
          owner: p.idx, age: 0, zapTimer: 0, pierceLeft: 0,
          zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
          stun: 0, clsKey: p.clsKey, _reversed: false, _bounces: 0,
        });
        netSfx(state, SfxName.Arcane);
      }, i * ULTIMATE.ARCANE_STORM_TIMEOUT);
    }
  } else if (p.clsKey === 'necromancer') {
    // Army of Dead: summon 6 friendly skeletons
    for (let i = 0; i < 6; i++) {
      const sa = p.angle + (i / 6) * Math.PI * 2;
      const sx = p.x + Math.cos(sa) * 50;
      const sy = p.y + Math.sin(sa) * 50;
      state.enemies.push(createFriendlyEnemy(state, sx, sy, p.idx));
      spawnParticles(state, sx, sy, '#55cc55', 8);
    }
  } else if (p.clsKey === 'chronomancer') {
    // Time Stop: freeze all enemies for 3s, player moves at 1.5x speed
    const freezeDur = ULTIMATE.TIME_STOP_DURATION * pw;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.stunTimer = (e.stunTimer || 0) + freezeDur;
    }
    p.moveSpeed *= ULTIMATE.TIME_STOP_SPEED_MULT;
    p._timeStopTimer = freezeDur;
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(255,200,60,.2)');
  } else if (p.clsKey === 'knight') {
    // Shield Wall: become invulnerable for 3s + reflect all damage
    const shieldDur = ULTIMATE.TIME_STOP_DURATION * pw;
    p.iframes = shieldDur;
    p._shieldWall = shieldDur;
    spawnShockwave(state, p.x, p.y, 80, 'rgba(200,200,255,.4)');
  } else if (p.clsKey === 'berserker') {
    // Blood Rage: 2x damage, 2x speed, take 2x damage for 5s
    const rageDur = ULTIMATE.BLOOD_RAGE_DURATION * pw;
    p._rage = rageDur;
    p._rageDmgMul = ULTIMATE.BLOOD_RAGE_DMG_MULT;
    spawnParticles(state, p.x, p.y, '#ff3333', 25, 1.2);
  } else if (p.clsKey === 'paladin') {
    // Holy Light: heal both players for 75% max HP + damage all enemies for 3
    for (const pl of state.players) {
      if (pl.alive) {
        pl.hp = Math.min(pl.maxHp, pl.hp + Math.round(pl.maxHp * ULTIMATE.PALADIN_HEAL_FRACTION));
        spawnParticles(state, pl.x, pl.y, '#ffffaa', 15);
        spawnText(state, pl.x, pl.y - 20, 'HEAL 75%', '#ffffaa');
      }
    }
    for (const e of state.enemies) {
      if (!e.alive) continue;
      damageEnemy(state, e, Math.round(3 * pw), p.idx);
    }
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(255,255,180,.3)');
  } else if (p.clsKey === 'ranger') {
    // Volley: fire 20 arrows in a spread cone in the aimed direction
    const cos0 = Math.cos(angle);
    const sin0 = Math.sin(angle);
    const spreadHalf = ULTIMATE.RANGER_SPREAD_BASE;
    for (let i = 0; i < 20; i++) {
      const aOff = -spreadHalf + (spreadHalf * 2) * (i / 19) + rand(-ULTIMATE.RANGER_SPREAD_STEP, ULTIMATE.RANGER_SPREAD_STEP);
      const sa = angle + aOff;
      const aCos = Math.cos(sa);
      const aSin = Math.sin(sa);
      setTimeout(() => {
        state.spells.push({
          type: SpellType.Projectile, dmg: Math.round(2 * pw), speed: 400, radius: 5, life: ULTIMATE.RANGER_ARROW_LIFE,
          color: '#88cc44', trail: '#668833',
          x: p.x + cos0 * WIZARD_SIZE, y: p.y + sin0 * WIZARD_SIZE,
          vx: aCos * 400, vy: aSin * 400,
          owner: p.idx, age: 0, zapTimer: 0, pierceLeft: ULTIMATE.RANGER_ARROW_PIERCE,
          homing: 0, zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
          stun: 0, clsKey: p.clsKey, _reversed: false, _bounces: 0,
        });
        netSfx(state, SfxName.Hit);
      }, i * 30);
    }
  } else if (p.clsKey === 'druid') {
    // Nature's Wrath: summon ring of 6 thorn zones + 2 treant allies
    for (let i = 0; i < 6; i++) {
      const za = (i / 6) * Math.PI * 2;
      const zDist = rand(100, 120);
      const zx = p.x + Math.cos(za) * zDist;
      const zy = p.y + Math.sin(za) * zDist;
      const thornZone = state.zones.acquire();
      if (thornZone) {
        thornZone.x = zx; thornZone.y = zy; thornZone.radius = 40; thornZone.duration = 4;
        thornZone.dmg = Math.round(2 * pw); thornZone.color = '#66aa44'; thornZone.owner = p.idx;
        thornZone.slow = ULTIMATE.DRUID_ZONE_SLOW; thornZone.stun = 0; thornZone.tickRate = ULTIMATE.DRUID_ZONE_TICK; thornZone.tickTimer = 0; thornZone.age = 0;
        thornZone.drain = 0; thornZone.heal = 0; thornZone.pull = 0; thornZone.freezeAfter = 0;
      }
      spawnParticles(state, zx, zy, '#88aa66', 6, TIMING.PARTICLE_LIFE_MEDIUM);
    }
    // Summon 2 treant allies
    for (let i = 0; i < 2; i++) {
      const ta = angle + (i === 0 ? -ULTIMATE.DRUID_TREANT_ANGLE : ULTIMATE.DRUID_TREANT_ANGLE);
      const tx = p.x + Math.cos(ta) * 50;
      const ty = p.y + Math.sin(ta) * 50;
      const treant = createFriendlyEnemy(state, tx, ty, p.idx);
      treant.hp = 8;
      treant.maxHp = 8;
      treant._lifespan = ULTIMATE.DRUID_TREANT_LIFE;
      state.enemies.push(treant);
      spawnParticles(state, tx, ty, '#88aa66', 10);
    }
    spawnShockwave(state, p.x, p.y, 130, 'rgba(80,180,60,.3)');
  } else if (p.clsKey === 'warlock') {
    // Doom: marks all enemies, after 3s they take 35% of their max HP as damage
    const marked = state.enemies.filter(e => e.alive && !e._friendly);
    for (const e of marked) {
      spawnText(state, e.x, e.y - 15, 'DOOMED', '#662288');
    }
    const pIdx = p.idx;
    setTimeout(() => {
      for (const e of marked) {
        if (!e.alive) continue;
        const doomDmg = Math.max(1, Math.ceil(e.maxHp * ULTIMATE.DOOM_DMG_FRACTION * pw));
        damageEnemy(state, e, doomDmg, pIdx);
        spawnParticles(state, e.x, e.y, '#662288', 10);
      }
      netSfx(state, SfxName.Boom);
      shake(state, 6);
    }, 3000);
  } else if (p.clsKey === 'monk') {
    // Thousand Fists: 20 rapid melee hits in a cone with knockback
    p.iframes = TIMING.IFRAME_MONK_ULT;
    const monkDmg = Math.round(1 * pw);
    for (let i = 0; i < 20; i++) {
      setTimeout(() => {
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const d = dist(p.x, p.y, e.x, e.y);
          if (d > 60) continue;
          const a2 = Math.atan2(e.y - p.y, e.x - p.x);
          const diff = Math.abs(((a2 - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff <= ULTIMATE.MONK_CONE_ANGLE) {
            damageEnemy(state, e, monkDmg, p.idx);
            // Knockback: push enemy away from player
            if (d > 0) {
              const nx = (e.x - p.x) / d;
              const ny = (e.y - p.y) / d;
              e.vx = nx * ULTIMATE.MONK_KNOCKBACK;
              e.vy = ny * ULTIMATE.MONK_KNOCKBACK;
            }
          }
        }
        spawnParticles(state, p.x + Math.cos(angle) * 30, p.y + Math.sin(angle) * 30, '#eedd88', 2, 0.3);
        netSfx(state, SfxName.Hit);
      }, i * 40);
    }
  } else if (p.clsKey === 'engineer') {
    // Mega Turret: huge turret (20 HP, 3 dmg/shot, 12s)
    const turret = createFriendlyEnemy(state, p.x + Math.cos(angle) * 40, p.y + Math.sin(angle) * 40, p.idx);
    turret.type = '_ally';
    turret.hp = 20;
    turret.maxHp = 20;
    turret._lifespan = ULTIMATE.TURRET_LIFE;
    state.enemies.push(turret);
    spawnParticles(state, turret.x, turret.y, '#dd8833', 15);
    // Also create a high-damage zone around the turret
    const megaZone = state.zones.acquire();
    if (megaZone) {
      megaZone.x = turret.x; megaZone.y = turret.y; megaZone.radius = ULTIMATE.TURRET_RADIUS; megaZone.duration = ULTIMATE.TURRET_LIFE;
      megaZone.dmg = Math.round(3 * pw); megaZone.color = '#dd8833'; megaZone.owner = p.idx;
      megaZone.slow = 0; megaZone.stun = 0; megaZone.tickRate = 0.7; megaZone.tickTimer = 0; megaZone.age = 0;
      megaZone.drain = 0; megaZone.heal = 0; megaZone.pull = 0; megaZone.freezeAfter = 0;
      megaZone._turret = true; megaZone._megaTurret = true;
      // Engineer Overclock: turrets fire 20% faster
      megaZone.tickRate *= 0.8;
    }
  }

  // ultEcho: buff next N LMB casts with double damage
  if (p.ultEcho > 0) {
    p.ultEchoLeft = p.ultEcho;
  }

  // ultResetCDs: reset RMB and Q cooldowns
  if (p.ultResetCDs) {
    p.cd[1] = 0;
    p.cd[2] = 0;
  }
}
