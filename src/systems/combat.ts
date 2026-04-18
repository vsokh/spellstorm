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
  spawnBeam,
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
import { dispatchCastUltimate, dispatchCastQAbility, dispatchCastRMBAbility, dispatchDamageEnemy, dispatchKill } from '../classes/hooks';
import '../classes/registry';
import { dispatchSpell } from './spell-handlers';
import './spell-handlers-builtin';

// Pre-allocated scratch array to avoid per-frame filter() allocations
let _aliveEnemies: EnemyView[] = [];

// ═══════════════════════════════════
//       STANCE SWITCHING
// ═══════════════════════════════════

export function switchStance(state: GameState, p: Player): void {
  const forms = p.cls.stanceForms;
  if (!forms || p.formSwitchCd > 0) return;

  // Toggle form
  const newForm = p.currentForm === 'A' ? 'B' : 'A';
  const formDef = newForm === 'A' ? forms.formA : forms.formB;

  // Swap spell slots 0-2 (keep slot 3 structure for compatibility)
  p.cls.spells[0] = formDef.spells[0];
  p.cls.spells[1] = formDef.spells[1];
  p.cls.spells[2] = formDef.spells[2];

  // Update base spell damage for soft cap calculation
  p._baseSpellDmg[0] = formDef.spells[0].dmg;
  p._baseSpellDmg[1] = formDef.spells[1].dmg;
  p._baseSpellDmg[2] = formDef.spells[2].dmg;

  // Apply form-specific overrides
  if (formDef.moveSpeed) p.moveSpeed = formDef.moveSpeed;
  if (formDef.color) p.cls.color = formDef.color;
  if (formDef.glow) p.cls.glow = formDef.glow;

  // Set cooldown
  p.formSwitchCd = forms.switchCd;
  p.currentForm = newForm;

  // Apply switch buff
  if (forms.switchBuff) {
    p.formSwitchBuff = forms.switchBuff.duration;
    p._formDmgMult = forms.switchBuff.dmgMult ?? 1;
    p._formArmor = forms.switchBuff.armor ?? 0;
  }

  // VFX
  spawnParticles(state, p.x, p.y, p.cls.color, 15, 0.8);
  spawnText(state, p.x, p.y - 30, formDef.name, p.cls.color);
  netSfx(state, SfxName.Boom);
}

// ═══════════════════════════════════
//       BONUS DAMAGE SOFT CAP
// ═══════════════════════════════════

/** Get effective spell damage after applying bonus damage soft cap.
 *  Calculates how much flat bonus was added by upgrades, caps it, returns base + capped bonus. */
function getEffectiveSpellDmg(p: Player, spellIdx: number): number {
  const baseDmg = p._baseSpellDmg[spellIdx] || 0;
  const currentDmg = p.cls.spells[spellIdx].dmg;
  const bonus = currentDmg - baseDmg;
  const raw = bonus <= 0 ? currentDmg : baseDmg + softCapBonusDmg(bonus);
  return raw * (p._formDmgMult || 1);
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
  // Bladecaller Phantom Veil guaranteed crit on next attack
  let bladecallerVeilCrit = false;
  if (p && p._critPending) {
    dmg *= 2;
    bladecallerVeilCrit = true;
    p._critPending = false;
    spawnText(state, e.x, e.y - 25, 'VEIL CRIT!', '#cc3355');
  }
  // Momentum bonus
  if (p && p.momentum) {
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    dmg = Math.round(dmg * (1 + Math.min(COMBAT.MOMENTUM_CAP, spd / COMBAT.MOMENTUM_DIVISOR)));
  }

  // Positional bonuses
  if (p) {
    const passive = p.cls.passive;
    // Backstab: check if spell hit from behind the enemy
    if (passive.backstab) {
      // Enemy facing direction: use velocity if moving, otherwise face toward target player
      const eFacing = (e.vx !== 0 || e.vy !== 0)
        ? Math.atan2(e.vy, e.vx)
        : Math.atan2(p.y - e.y, p.x - e.x);
      // Angle from enemy to the attacking player
      const angleToPlayer = Math.atan2(p.y - e.y, p.x - e.x);
      // If player is behind the enemy (within BACKSTAB_ANGLE of the enemy's back)
      const angleDiff = Math.abs(wrapAngle(angleToPlayer - eFacing));
      if (angleDiff > Math.PI - COMBAT.BACKSTAB_ANGLE) {
        const backstabMult = passive.backstab + (p.assassinMark * 0.3);
        dmg = Math.ceil(dmg * backstabMult);
        spawnText(state, e.x, e.y - 35, 'BACKSTAB!', '#ff4488');
        // Bladecaller Crimson Edge: backstabs lifesteal 40%
        if (p.clsKey === 'bladecaller') {
          const bsHeal = Math.ceil(dmg * 0.4);
          p.hp = Math.min(p.maxHp, p.hp + bsHeal);
        }
      }
    }
    // Proximity bonus: close-range damage multiplier
    if (passive.proximityBonus) {
      const proxRange = passive.proximityBonus.range + (p.closeQuarters * 20);
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < proxRange) {
        dmg = Math.ceil(dmg * passive.proximityBonus.dmgMult);
        spawnText(state, e.x, e.y - 35, 'CLOSE!', '#ff8844');
      }
    }
    // Flanking: hitting from perpendicular angle
    if (passive.flanking) {
      const eFacing = (e.vx !== 0 || e.vy !== 0)
        ? Math.atan2(e.vy, e.vx)
        : Math.atan2(p.y - e.y, p.x - e.x);
      const angleToPlayer = Math.atan2(p.y - e.y, p.x - e.x);
      const angleDiff = Math.abs(wrapAngle(angleToPlayer - eFacing));
      if (Math.abs(angleDiff - Math.PI / 2) < passive.flanking.angleTolerance) {
        dmg = Math.ceil(dmg * passive.flanking.dmgMult);
        spawnText(state, e.x, e.y - 35, 'FLANK!', '#44aaff');
      }
    }
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

  e.iframes = TIMING.IFRAME_ENEMY_HIT;
  e._hitFlash = 0.12;
  spawnParticles(state, e.x, e.y, '#ff6644', 5, TIMING.HIT_PARTICLE_SCALE);
  netSfx(state, SfxName.Hit);

  // Ultimate charge (+5 per hit, +15 per kill) — stance classes don't accumulate ultCharge
  if (p && !p.cls.stanceForms) {
    const hitChargeGain = Math.round(COMBAT.ULT_CHARGE_HIT * (p.ultChargeRate || 1));
    const chargeCap = p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD;
    p.ultCharge = Math.min(chargeCap, (p.ultCharge || 0) + hitChargeGain);
    if (p.ultCharge >= (p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD)) p.ultReady = true;
  }

  // Per-class onDamageEnemy hooks (frostbite, echo, burn DOT, hex, soul mark, attunement, decay, heavy caliber).
  if (p) dispatchDamageEnemy(state, p, e, dmg);

  // Cross-class passive: Hexblade hex mastery — any player deals +25% to hex-marked enemies.
  if (e._hexStacks && e._hexStacks > 0) {
    const hexBonus = Math.max(1, Math.floor(dmg * 0.25));
    e.hp -= hexBonus;
    spawnText(state, e.x, e.y - 20, '+' + hexBonus, '#7755cc');
  }

  // Cross-class passive: Warden mark — allies (non-warden) deal +1 to marked enemies.
  if (p && e._wardenMark && p.clsKey !== 'warden') {
    e.hp -= 1;
    spawnText(state, e.x, e.y - 20, '+1', '#5588aa');
  }

  // Cross-class passive: Soulbinder soul bond — allies (non-soulbinder) deal +1 to soul-marked enemies.
  if (p && e._soulMark && e._soulMark > state.time && p.clsKey !== 'soulbinder') {
    e.hp -= 1;
    spawnText(state, e.x, e.y - 20, '+1', '#55aa88');
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

  // Bladecaller Crimson Edge baseline 15% lifesteal (stacks with upgrade lifeSteal)
  if (p && p.clsKey === 'bladecaller') {
    const cheal = Math.max(1, Math.floor(dmg * 0.15));
    p.hp = Math.min(p.maxHp, p.hp + cheal);
  }

  // Berserker fury lifesteal: 5% heal when fury active
  if (p && p._furyActive) {
    const furyHeal = Math.floor(dmg * COMBAT.FURY_LIFESTEAL);
    if (furyHeal > 0) p.hp = Math.min(p.maxHp, p.hp + furyHeal);
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
      // Ultimate charge on kill — stance classes don't accumulate ultCharge
      if (!p.cls.stanceForms) {
        const killChargeGain = Math.round(COMBAT.ULT_CHARGE_KILL * (p.ultChargeRate || 1));
        const killChargeCap = p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD;
        p.ultCharge = Math.min(killChargeCap, (p.ultCharge || 0) + killChargeGain);
        if (p.ultCharge >= (p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD)) p.ultReady = true;
      }

      // Per-class onKill hooks (necro soul harvest, bladecaller kill rush, voidweaver explode).
      dispatchKill(state, p, e);

      // Bladecaller Crimson Edge: stealth-crit kill grants a brief absorb shield.
      if (bladecallerVeilCrit && p.clsKey === 'bladecaller') {
        p._stealthShield = 1.5;
        spawnText(state, p.x, p.y - 30, 'CRIMSON SHIELD', '#cc3355');
        spawnParticles(state, p.x, p.y, '#cc3355', 12, 0.6);
      }

      // Cross-class passive: Soulbinder — non-soulbinder players heal on marked kill.
      if (p.clsKey !== 'soulbinder' && e._soulMark && e._soulMark > state.time) {
        p.hp = Math.min(p.maxHp, p.hp + 0.5);
        spawnText(state, p.x, p.y - 15, '+0.5 HP', '#55aa88');
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

      // Cooldown Cascade: kills reduce RMB cooldown by 1s
      if (p.cdCascade) {
        p.cd[1] = Math.max(0, p.cd[1] - 1);
      }

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

  // Bladecaller stealth-kill shield: block the next hit entirely
  if (p._stealthShield > 0) {
    p._stealthShield = 0;
    p.iframes = TIMING.IFRAME_BLOCK;
    spawnText(state, p.x, p.y - 20, 'VEIL SHIELD', '#cc3355');
    spawnParticles(state, p.x, p.y, '#cc3355', 10);
    return;
  }

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
  // Warden Bastion: allies inside a Warden-owned Bastion zone take reduced damage.
  // Warden is the only class with a Zone-type spell, so owner.clsKey === 'warden' is sufficient.
  for (const z of state.zones) {
    if (!z || z.duration <= 0) continue;
    const owner = state.players[z.owner];
    if (!owner || owner.clsKey !== 'warden') continue;
    if (dist(p.x, p.y, z.x, z.y) < z.radius) {
      reducedDmg = Math.ceil(reducedDmg * COMBAT.BASTION_ALLY_DR_MULT);
      break;
    }
  }
  const dmg = Math.max(1, reducedDmg - (p.armor || 0) - (p._formArmor || 0));

  p.hp -= dmg;
  p.iframes = TIMING.IFRAME_DAMAGE;
  p._animHitFlash = TIMING.HIT_FLASH;
  shake(state, 3);
  spawnParticles(state, p.x, p.y, '#ff4444', 8);
  netSfx(state, SfxName.Hit);
  spawnText(state, p.x, p.y - 20, `-${dmg}`, '#ff4444');

  // Break Bladecaller stealth on damage
  if (p._stealth > 0) {
    p._stealth = 0;
    p._critPending = false;
  }

  // Channel break: interrupt channel if damage exceeds threshold
  if (p.channeling && p.channelSlot !== undefined) {
    const chDef = p.cls.spells[p.channelSlot];
    if (chDef && chDef.channelBreak && chDef.channelBreak > 0 && dmg >= chDef.channelBreak) {
      // Partial cooldown refund: 50% of remaining channel time mapped to cooldown reduction
      const progress = Math.min(1, (p.channelTimer || 0) / (chDef.channel || 1));
      const refundedCd = chDef.cd * (1 - progress) * 0.5;
      p.cd[p.channelSlot] = Math.max(0, chDef.cd - refundedCd);
      p.channeling = false;
      p.channelTimer = 0;
      p.channelSlot = undefined;
      p.channelAngle = undefined;
      spawnText(state, p.x, p.y - 30, 'INTERRUPTED', '#ff8844');
    }
  }

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

    // Time Loop: rewind instead of dying (once per wave)
    if (p.timeLoop > 0 && !p._timeLoopUsed) {
      p._timeLoopUsed = true;
      const snap = p._rewindSnap;
      if (snap) {
        p.hp = Math.min(p.maxHp, Math.max(1, snap.hp));
        p.mana = Math.min(p.maxMana, Math.max(p.mana, snap.mana));
      } else {
        p.hp = Math.ceil(p.maxHp * 0.5);
      }
      p.iframes = 2.0;
      spawnParticles(state, p.x, p.y, '#ffcc44', 25, 1.2);
      spawnShockwave(state, p.x, p.y, 80, 'rgba(255,200,60,.5)');
      spawnText(state, p.x, p.y - 25, 'TIME LOOP', '#ffcc44');
      netSfx(state, SfxName.Blink);
      shake(state, 5);
      flashScreen(state, 0.2, '255,200,60');
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
      p.iframes = TIMING.IFRAME_LIVES_RESPAWN; // generous iframes on respawn
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

    // Check if ally can resurrect this player
    const ally = state.players[1 - p.idx];
    if (ally && ally.alive && ally.resurrection && ally._resurrectionCd <= 0) {
      ally._resurrectionCd = 45; // 45s cooldown
      p.hp = Math.floor(p.maxHp / 2);
      p.iframes = TIMING.IFRAME_RESPAWN;
      spawnParticles(state, p.x, p.y, '#ffddaa', 25, 1.2);
      spawnShockwave(state, p.x, p.y, 80, 'rgba(255,221,170,.5)');
      spawnText(state, p.x, p.y - 25, 'RESURRECTED', '#ffddaa');
      netSfx(state, SfxName.Pickup);
      return;
    }

    // Clear channeling on death
    p.channeling = false;
    p.channelTimer = 0;
    p.channelSlot = undefined;
    p.channelAngle = undefined;

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
      state._gameOverTimer = GAME_OVER_DELAY_MS / 1000;
    }
  }
}

// ═══════════════════════════════════
//       SPELL CASTING
// ═══════════════════════════════════

/** Charged cast: temporarily overrides spell stats based on charge level, then delegates to castSpell */
export function castChargedSpell(state: GameState, p: Player, idx: number, angle: number, chargeLevel: number): void {
  const def = p.cls.spells[idx];

  // Compute charge-scaled values
  const minDmg = def.chargeMinDmg || def.dmg * 0.3;
  const maxDmg = def.chargeMaxDmg || def.dmg * 3;
  const chargeDmg = minDmg + (maxDmg - minDmg) * chargeLevel;

  // Temporarily override def values for the cast
  const origDmg = def.dmg;
  def.dmg = chargeDmg;

  const origPierce = def.pierce;
  if (def.chargePierce) {
    def.pierce = (def.pierce || 0) + Math.floor(def.chargePierce * chargeLevel);
  }

  const origExplode = def.explode;
  if (def.chargeRadius) {
    def.explode = (def.explode || 0) + Math.floor(def.chargeRadius * chargeLevel);
  }

  castSpell(state, p, idx, angle);

  // Restore original values
  def.dmg = origDmg;
  def.pierce = origPierce;
  def.explode = origExplode;
}

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
    // Ranger Eagle Eye: +40% primary range
    if (p.clsKey === 'ranger' && idx === 0) {
      rt.life *= 1.4;
    }
    state.spells.push({
      ...rt,
      x: sx, y: sy,
      vx: cos * def.speed, vy: sin * def.speed,
      owner: p.idx, age: 0, zapTimer: 0, pierceLeft: (p.pierce || 0) + (def.pierce || 0),
      clsKey: p.clsKey,
      _reversed: false,
      _slot: 0,
    });
  }
}

// ── Mark/Detonate helpers ──

/** Apply a mark to an enemy (stacks up to maxStacks, refreshes timer) */
export function applyMarkToEnemy(
  state: GameState,
  e: Enemy,
  mark: NonNullable<SpellDef['applyMark']>,
  ownerIdx: number
): void {
  const maxStk = mark.maxStacks ?? 1;
  const wasUnderMax = e._markName !== mark.name || e._markStacks < maxStk;
  if (e._markName === mark.name) {
    if (e._markStacks < maxStk) e._markStacks++;
    e._markTimer = mark.duration;
  } else {
    e._markName = mark.name;
    e._markStacks = 1;
    e._markTimer = mark.duration;
    e._markOwner = ownerIdx;
  }
  // Visual feedback: small particle burst on stack gain; bigger on reaching max
  const col = mark.visual || '#ffaa44';
  if (wasUnderMax && e._markStacks >= maxStk) {
    spawnParticles(state, e.x, e.y, col, 8, 0.6);
    spawnText(state, e.x, e.y - 40, 'MAX', col);
  } else if (wasUnderMax) {
    spawnParticles(state, e.x, e.y, col, 3, 0.4);
  }
}

/** Detonate marks on an enemy for bonus damage and effects */
export function detonateMarks(
  state: GameState,
  e: Enemy,
  det: NonNullable<SpellDef['detonateMark']>,
  ownerIdx: number,
  color: string
): void {
  const stacks = e._markStacks;
  if (stacks <= 0 || e._markName !== det.name) return;

  const bonusDmg = det.dmgPerStack * stacks;
  damageEnemy(state, e, bonusDmg, ownerIdx);

  const markColor = e._markName === 'frost' ? '#88CCFF' :
                    e._markName === 'soul' ? '#55aa88' :
                    e._markName === 'judgment' ? '#ffdd44' :
                    e._markName === 'static' ? '#ffcc44' : '#ffaa44';
  spawnText(state, e.x, e.y - 30, 'DETONATE!', markColor);
  spawnParticles(state, e.x, e.y, color, 12, 0.5);
  spawnShockwave(state, e.x, e.y, det.aoeOnDetonate || 40, color);

  // Visual + audio feedback (task #206)
  const bigWaveR = Math.min(140, 60 + 25 * stacks);
  spawnShockwave(state, e.x, e.y, bigWaveR, color);
  if (det.aoeOnDetonate && det.aoeOnDetonate > 0) {
    spawnShockwave(state, e.x, e.y, det.aoeOnDetonate, 'rgba(255,255,255,.25)');
  }
  const burstCount = Math.min(32, 8 + 6 * stacks);
  spawnParticles(state, e.x, e.y, color, burstCount, 0.9);
  spawnParticles(state, e.x, e.y, '#ffffff', 6, 1.1);
  shake(state, Math.min(3.5, 1.2 + 0.6 * stacks));
  const h = (markColor.startsWith('#') ? markColor.slice(1) : markColor).padEnd(6, '0');
  const fr = parseInt(h.substring(0, 2), 16) || 255;
  const fg = parseInt(h.substring(2, 4), 16) || 255;
  const fb = parseInt(h.substring(4, 6), 16) || 255;
  flashScreen(state, 0.12, `${fr},${fg},${fb}`);
  netSfx(state, SfxName.Boom);
  netSfx(state, SfxName.Zap);

  if (det.aoeOnDetonate && det.aoeOnDetonate > 0) {
    const aoeCandidates = state.enemyGrid.queryArea(e.x, e.y, det.aoeOnDetonate);
    for (const aidx of aoeCandidates) {
      const ae = state.enemies.at(aidx);
      if (!ae.alive || ae === e) continue;
      if (dist(e.x, e.y, ae.x, ae.y) < det.aoeOnDetonate) {
        damageEnemy(state, ae, Math.ceil(bonusDmg * 0.5), ownerIdx);
      }
    }
  }

  if (det.spreadOnDetonate) {
    const spreadRange = 80;
    const spreadCandidates = state.enemyGrid.queryArea(e.x, e.y, spreadRange);
    for (const sidx of spreadCandidates) {
      const se = state.enemies.at(sidx);
      if (!se.alive || se === e) continue;
      if (dist(e.x, e.y, se.x, se.y) < spreadRange && se._markStacks === 0) {
        se._markName = det.name;
        se._markStacks = 1;
        se._markTimer = 3;
        se._markOwner = ownerIdx;
      }
    }
  }

  if (det.effectOnDetonate) {
    if (det.effectOnDetonate.stun) e.stunTimer = (e.stunTimer || 0) + det.effectOnDetonate.stun * stacks;
    if (det.effectOnDetonate.slow) e.slowTimer = (e.slowTimer || 0) + det.effectOnDetonate.slow * stacks;
    if (det.effectOnDetonate.heal) {
      const p = state.players[ownerIdx];
      if (p) {
        p.hp = Math.min(p.maxHp, p.hp + det.effectOnDetonate.heal * stacks);
        spawnText(state, p.x, p.y - 20, `+${det.effectOnDetonate.heal * stacks} HP`, '#44ff88');
      }
    }
  }

  e._markName = '';
  e._markStacks = 0;
  e._markTimer = 0;
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
    _slot: 0,
    applyMark: def.applyMark,
    detonateMark: def.detonateMark,
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

  // Channel start: begin channeling instead of instant cast
  if (def.channel && !p.channeling) {
    p.channeling = true;
    p.channelTimer = 0;
    p.channelSlot = idx;
    p.channelAngle = angle;
    // Mana already deducted above. Don't set cooldown yet — it starts when channel ends.
    // Nova channels apply their burst effects on activation (stun, detonate, shield).
    if (def.type === SpellType.Nova) {
      spawnShockwave(state, p.x, p.y, def.range, def.color);
      spawnParticles(state, p.x, p.y, def.color, 20);
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (dist(p.x, p.y, e.x, e.y) <= def.range) {
          damageEnemy(state, e, getEffectiveSpellDmg(p, idx), p.idx);
          if (def.slow) e.slowTimer = (e.slowTimer || 0) + def.slow;
          if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
          if (def.applyMark) applyMarkToEnemy(state, e, def.applyMark, p.idx);
          if (def.detonateMark) detonateMarks(state, e, def.detonateMark, p.idx, def.color);
        }
      }
      if (p.clsKey === 'stormcaller') {
        p._dischargeShield = def.channel;
        spawnParticles(state, p.x, p.y, '#cc88ff', 20, 1.1);
        spawnParticles(state, p.x, p.y, '#ffffff', 10, 0.8);
        flashScreen(state, 0.15, '200,140,255');
        shake(state, 4);
        netSfx(state, SfxName.Zap);
      }
    }
    return;
  }

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
  // Full Rotation buff: 3x attack speed = cooldown / 3
  if (p.fullRotationBuff > 0) {
    cd = cd / 3;
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

  // ── Combo Chain: advance combo step, apply damage scaling ──
  let comboDmgMul = 1;
  const comboDef = def.combo;
  if (comboDef) {
    // Check if continuing an active combo on the same slot
    if (p.comboChainSlot === idx && p.comboChainCount > 0 && p.comboChainTimer < comboDef.timeout) {
      // Advance to next step
      p.comboChainCount++;
    } else {
      // Start new combo (first hit or different slot or timed out)
      p.comboChainCount = 1;
    }
    p.comboChainSlot = idx;
    p.comboChainTimer = 0; // Reset timer on each hit

    // Apply damage scaling for current step
    const stepIdx = p.comboChainCount - 1; // 0-indexed into dmgScale array
    if (stepIdx < comboDef.dmgScale.length) {
      comboDmgMul = comboDef.dmgScale[stepIdx];
    }

    // Show combo step text
    if (p.comboChainCount > 1) {
      const stepColor = p.comboChainCount >= comboDef.steps ? '#ffaa00' : '#ffcc88';
      spawnText(state, p.x, p.y - 25, `${p.comboChainCount}/${comboDef.steps}`, stepColor);
    }

    // Check if combo is complete (reached final step)
    if (p.comboChainCount >= comboDef.steps) {
      p.comboChainCount = 0; // Reset after completing the chain
      p.comboChainSlot = -1;
    }
  }

  // Spell Weaving: alternating LMB/RMB gives +25% dmg per swap (max 3 stacks)
  if (p.spellWeaving && (idx === 0 || idx === 1)) {
    if (p.lastSpellSlot !== -1 && p.lastSpellSlot !== idx && (p.lastSpellSlot === 0 || p.lastSpellSlot === 1)) {
      p.spellWeaveStack = Math.min(3, p.spellWeaveStack + 1);
    } else if (p.lastSpellSlot === idx) {
      p.spellWeaveStack = 0;
    }
    p.lastSpellSlot = idx;
  }
  let spellWeaveMul = 1;
  if (p.spellWeaving && p.spellWeaveStack > 0 && (idx === 0 || idx === 1)) {
    spellWeaveMul = 1 + p.spellWeaveStack * 0.25;
    spawnText(state, p.x, p.y - 15, `WEAVE x${p.spellWeaveStack}!`, '#cc88ff');
  }

  // Full Rotation: use all 3 spells in 5s for 3x attack speed buff
  if (p.fullRotation) {
    p.fullRotationSpells |= (1 << idx);
    p.fullRotationTimer = 5;
    if (p.fullRotationSpells === 7) {
      p.fullRotationBuff = 3;
      p.fullRotationSpells = 0;
      p.fullRotationTimer = 0;
      spawnText(state, p.x, p.y - 25, 'FULL ROTATION!', '#ffaa00');
    }
  }

  // Temporarily boost def.dmg for combo chain, spell weaving, and echo multipliers
  const origDmg = def.dmg;
  const totalMul = comboDmgMul * spellWeaveMul;
  if (totalMul !== 1) {
    def.dmg = Math.ceil(def.dmg * totalMul);
  }

  // Apply combo chain per-step effects
  let origStun = def.stun;
  let origAoeR = def.aoeR;
  let comboEffectsApplied = false;
  if (comboDef?.effects) {
    // Use the step that was just fired (before reset). If chain completed, use the final step.
    const firedStep = comboDmgMul !== 1 ? (p.comboChainCount === 0 ? comboDef.steps : p.comboChainCount) : 0;
    const stepEffects = comboDef.effects[firedStep];
    if (stepEffects) {
      comboEffectsApplied = true;
      if (stepEffects.stun) def.stun = Math.max(def.stun, stepEffects.stun);
      if (stepEffects.aoeR) def.aoeR = Math.max(def.aoeR, stepEffects.aoeR);
      if (stepEffects.slow) def.slow = Math.max(def.slow, stepEffects.slow);
    }
  }

  // ── CLASS-SPECIFIC Q ABILITIES ──
  // All per-class Q overrides live in class hooks (castQAbility).
  if (idx === 2 && dispatchCastQAbility(state, p, def, angle)) return;

  // ── CLASS-SPECIFIC RMB ABILITIES ──
  // Per-class RMB overrides (e.g. Necromancer Raise Skeleton).
  if (idx === 1 && dispatchCastRMBAbility(state, p, def, angle)) return;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sx = p.x + cos * WIZARD_SIZE * 1.5;
  const sy = p.y + sin * WIZARD_SIZE * 1.5;
  const sType = classSfx(p.clsKey);

  if (dispatchSpell(state, p, def, idx, angle, cos, sin)) {
    // handler returned true — skip legacy chain
  } else if (def.type === SpellType.Projectile || def.type === SpellType.Homing) {
    const spell = {
      ...spellToRuntime(def),
      x: sx, y: sy,
      vx: cos * def.speed, vy: sin * def.speed,
      owner: p.idx, age: 0, zapTimer: 0, pierceLeft: (p.pierce || 0) + (def.pierce || 0),
      clsKey: p.clsKey,
      _slot: idx,
    };
    spell.dmg = Math.round(getEffectiveSpellDmg(p, idx) * echoDmgMul);
    // Ranger Eagle Eye: +40% primary range
    if (p.clsKey === 'ranger' && idx === 0) {
      spell.life *= 1.4;
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
          _slot: idx,
        });
      }
    }
    netSfx(state, sType);
  } else if (def.type === SpellType.Beam) {
    spawnBeam(state, p.x, p.y, angle, def.range, def.width, def.color, 0.15);
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
          if (def.applyMark) applyMarkToEnemy(state, e, def.applyMark, p.idx);
          if (def.detonateMark) detonateMarks(state, e, def.detonateMark, p.idx, def.color);
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
    const coneDmg = Math.round(getEffectiveSpellDmg(p, idx) * echoDmgMul);
    // Visual: narrow cones (Bladecaller thrust) render as a beam flash; wide cones use particle spray.
    if (def.angle < 0.5) {
      spawnBeam(state, p.x, p.y, angle, def.range, 4, def.color, 0.12);
      for (let d = 20; d < def.range; d += 18) {
        spawnParticles(state, p.x + Math.cos(angle) * d, p.y + Math.sin(angle) * d, def.color, 2, 0.25);
      }
      // Thrust hit detection: sample points along the line; hit any enemy the line passes through.
      // Track hit enemies by id (or reference) so we only damage each once per thrust.
      const hit = new Set<number>();
      for (let d = 0; d < def.range; d += 5) {
        const bx = p.x + cos * d;
        const by = p.y + sin * d;
        for (const e of state.enemies) {
          if (!e.alive || hit.has(e.id)) continue;
          if (dist(bx, by, e.x, e.y) < ENEMIES[e.type].size + 4) {
            hit.add(e.id);
            damageEnemy(state, e, coneDmg, p.idx);
            if (def.slow) e.slowTimer = (e.slowTimer || 0) + def.slow;
            if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
            if (def.applyMark) applyMarkToEnemy(state, e, def.applyMark, p.idx);
            if (def.detonateMark) detonateMarks(state, e, def.detonateMark, p.idx, def.color);
          }
        }
      }
    } else {
      for (let a = -def.angle / 2; a <= def.angle / 2; a += 0.15) {
        for (let d = 30; d < def.range; d += 20) {
          spawnParticles(state, p.x + Math.cos(angle + a) * d, p.y + Math.sin(angle + a) * d, def.color, 1, 0.4);
        }
      }
      // Angle-based cone hit detection for wide cones.
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > def.range) continue;
        const a2 = Math.atan2(e.y - p.y, e.x - p.x);
        if (Math.abs(wrapAngle(a2 - angle)) <= def.angle / 2) {
          damageEnemy(state, e, coneDmg, p.idx);
          if (def.slow) e.slowTimer = (e.slowTimer || 0) + def.slow;
          if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
          if (def.applyMark) applyMarkToEnemy(state, e, def.applyMark, p.idx);
          if (def.detonateMark) detonateMarks(state, e, def.detonateMark, p.idx, def.color);
        }
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
        if (def.applyMark) applyMarkToEnemy(state, e, def.applyMark, p.idx);
        if (def.detonateMark) detonateMarks(state, e, def.detonateMark, p.idx, def.color);
      }
    }
    if (novaHealed > 0) {
      p.hp = Math.min(p.maxHp, p.hp + novaHealed);
      spawnText(state, p.x, p.y - 20, `+${novaHealed} HP`, '#44ff88');
    }
    // Aftershock: Nova leaves a damage zone for 2s
    if (p.aftershock) {
      const ashockZone = state.zones.acquire();
      if (ashockZone) {
        ashockZone.x = p.x; ashockZone.y = p.y; ashockZone.radius = def.range || 60;
        ashockZone.duration = 2; ashockZone.dmg = 1; ashockZone.color = def.color;
        ashockZone.owner = p.idx; ashockZone.slow = 0; ashockZone.stun = 0;
        ashockZone.tickRate = 0.5; ashockZone.tickTimer = 0; ashockZone.age = 0;
        ashockZone.drain = 0; ashockZone.heal = 0; ashockZone.pull = 0; ashockZone.freezeAfter = 0;
      }
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
          _slot: idx,
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
      // Chronomancer Haste Zone: mark temporal field for ally speed boost
      if (p.hasteZone && p.clsKey === 'chronomancer' && def.name === 'Temporal Field') {
        spellZone._hasteZone = true;
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
    // Target-locked leap (Bladecaller Shadow Step): find enemy nearest cursor within range,
    // teleport to a point behind them, auto-backstab.
    if (def.targetLock) {
      const mw = toWorld(state, state.mouseX, state.mouseY);
      let best: EnemyView | null = null;
      let bestD = Infinity;
      for (const e of state.enemies) {
        if (!e.alive || e._friendly || e._deathTimer >= 0) continue;
        if (dist(p.x, p.y, e.x, e.y) > def.range) continue;
        const d = dist(mw.x, mw.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) {
        // No valid target — fizzle, refund mana+cd
        p.mana = Math.min(p.maxMana, p.mana + def.mana);
        p.cd[idx] = 0;
        spawnText(state, p.x, p.y - 20, 'NO TARGET', '#888888');
        return;
      }
      // Position behind enemy (opposite player → enemy vector)
      const dx = best.x - p.x, dy = best.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const behindDist = ENEMIES[best.type].size + WIZARD_SIZE + 4;
      const nx = clamp(best.x + (dx / d) * behindDist, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
      const ny = clamp(best.y + (dy / d) * behindDist, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
      spawnParticles(state, p.x, p.y, def.color, 10);
      p.x = nx; p.y = ny;
      p.angle = Math.atan2(best.y - p.y, best.x - p.x);
      p.iframes = TIMING.IFRAME_LEAP;
      spawnParticles(state, best.x, best.y, def.color, 18, 1);
      netSfx(state, SfxName.Blink);
      shake(state, 4);
      const leapDmg = getEffectiveSpellDmg(p, idx);
      // Single-target backstab by default; only hit area if aoeR > 0 (augment later)
      if ((def.aoeR || 0) > 0) {
        spawnShockwave(state, best.x, best.y, def.aoeR, def.color);
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (dist(best.x, best.y, e.x, e.y) < def.aoeR + ENEMIES[e.type].size) {
            damageEnemy(state, e, leapDmg, p.idx);
            if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
          }
        }
      } else {
        damageEnemy(state, best, leapDmg, p.idx);
        if (def.stun) best.stunTimer = (best.stunTimer || 0) + def.stun;
      }
      // Set the timestamp AFTER damage so the Shadow Step's own kill doesn't reset its cd.
      // Only follow-up LMB / passive kills within 1.5s trigger Kill Rush.
      p._lastShadowStep = state.time;
      return;
    }
    // Berserker leap slam (free-aim)
    const nx = clamp(p.x + cos * def.range, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
    const ny = clamp(p.y + sin * def.range, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
    spawnParticles(state, p.x, p.y, def.color, 8);
    p.x = nx;
    p.y = ny;
    p.iframes = TIMING.IFRAME_LEAP;
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
    // Aftershock: Leap slam leaves a damage zone for 2s
    if (p.aftershock) {
      const ashockZone = state.zones.acquire();
      if (ashockZone) {
        ashockZone.x = p.x; ashockZone.y = p.y; ashockZone.radius = def.aoeR || 60;
        ashockZone.duration = 2; ashockZone.dmg = 1; ashockZone.color = def.color;
        ashockZone.owner = p.idx; ashockZone.slow = 0; ashockZone.stun = 0;
        ashockZone.tickRate = 0.5; ashockZone.tickTimer = 0; ashockZone.age = 0;
        ashockZone.drain = 0; ashockZone.heal = 0; ashockZone.pull = 0; ashockZone.freezeAfter = 0;
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
  } else if (def.type === SpellType.Tether) {
    // Tether: find nearest enemy within tetherRange and attach
    const tetherRange = def.tetherRange || 200;
    let bestDist = tetherRange;
    let bestIdx = -1;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies.at(i);
      if (!e.alive || e._friendly) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const edist = Math.sqrt(dx * dx + dy * dy);
      if (edist < bestDist) {
        bestDist = edist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      p._tetherTarget = bestIdx;
      p._tetherTimer = def.tetherDuration || 3;
      p._tetherSpellIdx = idx;
      p._tetherTickTimer = 0;
      netSfx(state, SfxName.Arcane);
      spawnParticles(state, p.x, p.y, def.color, 10);
      const te = state.enemies.at(bestIdx);
      spawnText(state, te.x, te.y - 20, 'TETHERED', def.color);
    } else {
      // No enemy in range — full fizzle: refund mana and clear cooldown.
      p.mana = Math.min(p.maxMana, p.mana + def.mana);
      p.cd[idx] = 0;
      spawnText(state, p.x, p.y - 20, 'NO TARGET', '#888888');
    }
  }
  // Summon-style Q (druid spirit wolf, warlock imp, tidecaller elemental, bladecaller Phantom Veil) are in class castQAbility hooks now.

  // Temporal Echo: fire a delayed copy at 50% damage
  if (p.temporalEcho && idx === 0 && (def.type === SpellType.Projectile || def.type === SpellType.Homing)) {
    setTimeout(() => {
      if (!p.alive) return;
      const echoCos = Math.cos(angle);
      const echoSin = Math.sin(angle);
      const echoRt = spellToRuntime(def);
      echoRt.dmg = Math.max(1, Math.round(getEffectiveSpellDmg(p, idx) * 0.5));
      state.spells.push({
        ...echoRt,
        x: p.x + echoCos * WIZARD_SIZE * 1.5,
        y: p.y + echoSin * WIZARD_SIZE * 1.5,
        vx: echoCos * def.speed, vy: echoSin * def.speed,
        owner: p.idx, age: 0, zapTimer: 0,
        pierceLeft: (p.pierce || 0) + (def.pierce || 0),
        clsKey: p.clsKey,
      });
      spawnParticles(state, p.x + echoCos * 15, p.y + echoSin * 15, '#ffcc44', 2, 0.2);
    }, 500);
  }

  // Restore def.dmg and combo effects after temporary boosts
  def.dmg = origDmg;
  if (comboEffectsApplied) {
    def.stun = origStun;
    def.aoeR = origAoeR;
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

  dispatchCastUltimate(state, p, angle);

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
