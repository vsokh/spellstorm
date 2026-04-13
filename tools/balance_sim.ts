/**
 * Balance Simulator for Wizard Crawl
 *
 * Headless Node.js script that simulates gameplay without rendering.
 * Runs N runs for each wizard class, tracking survival, kills, DPS,
 * and upgrade impact. Outputs a human-readable console report and
 * a machine-readable JSON file.
 *
 * Usage: npx tsx tools/balance_sim.ts [--runs=50] [--maxWave=25]
 */

import {
  CLASSES,
  CLASS_ORDER,
  ENEMIES,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  WIZARD_HP,
  MAX_MANA,
  MANA_REGEN,
  DEFAULT_MOVE_SPEED,
  WIZARD_SIZE,
  UPGRADE_POOL,
  HEALTH_DROP_CHANCE,
  BOSS_HP_EXPONENT,
  BOSS_HP_EXPONENT_DIVISOR,
} from '../src/constants';
import {
  SpellType,
  EnemyAI,
  SpellDef,
  SpellDefInput,
  EnemyDef,
} from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════
//       CONFIGURATION
// ═══════════════════════════════════

const args = process.argv.slice(2);
function getArg(name: string, fallback: number): number {
  const found = args.find((a: string) => a.startsWith(`--${name}=`));
  return found ? parseInt(found.split('=')[1], 10) : fallback;
}

const NUM_RUNS = getArg('runs', 50);
const MAX_WAVE = getArg('maxWave', 25);
const SIM_DT = 1 / 60; // 60fps simulation tick
const MAX_WAVE_TIME = 120; // seconds before force-ending a wave (safety)

// ═══════════════════════════════════
//       SPELL NORMALIZER
// ═══════════════════════════════════

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

// ═══════════════════════════════════
//       SIMULATION STATE
// ═══════════════════════════════════

interface SimEnemy {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  atkTimer: number;
  slowTimer: number;
  stunTimer: number;
  iframes: number;
  burnTimer: number;
  burnTick: number;
  friendly: boolean;
  lifespan: number;
  spdMul: number;
}

interface SimPlayer {
  clsKey: string;
  spells: SpellDef[];
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  manaRegen: number;
  alive: boolean;
  iframes: number;
  cd: number[];
  moveSpeed: number;
  ultCharge: number;
  armor: number;
  dodgeChance: number;
  secondWind: number;
  killCount: number;
  hitCounter: number;
  vampirism: number;
  vampKillReq: number;
  lifeSteal: number;
  manaOnKill: number;
  manaOnHit: number;
  thorns: number;
  critChance: number;
  pierce: number;
  overkill: boolean;
  furyActive: boolean;
  rageDmgMul: number;
}

interface SimSpell {
  dmg: number;
  speed: number;
  radius: number;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  homing: number;
  slow: number;
  drain: number;
  explode: number;
  burn: number;
  pierceLeft: number;
}

interface SimZone {
  x: number;
  y: number;
  radius: number;
  duration: number;
  dmg: number;
  slow: number;
  drain: number;
  heal: number;
  tickRate: number;
  tickTimer: number;
  age: number;
  stun: number;
}

interface SimState {
  player: SimPlayer;
  enemies: SimEnemy[];
  spells: SimSpell[];
  zones: SimZone[];
  wave: number;
  time: number;
  totalKills: number;
  totalDamageDealt: number;
}

// ═══════════════════════════════════
//       UTILITY FUNCTIONS
// ═══════════════════════════════════

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

// ═══════════════════════════════════
//       WAVE GENERATION
// ═══════════════════════════════════

function pickWaveEnemy(wave: number): string {
  if (wave <= 2) return ['slime', 'bat'][Math.floor(Math.random() * 2)];
  if (wave <= 4) return ['slime', 'bat', 'skeleton'][Math.floor(Math.random() * 3)];
  if (wave <= 7) return ['slime', 'bat', 'skeleton', 'wraith', 'spider'][Math.floor(Math.random() * 5)];
  if (wave <= 12) {
    const pool = ['slime', 'bat', 'skeleton', 'skeleton', 'wraith', 'wraith', 'spider', 'necro', 'shieldbearer'];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = ['skeleton', 'skeleton', 'wraith', 'wraith', 'spider', 'necro', 'shieldbearer', 'assassin', 'assassin'];
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnSimEnemy(type: string, hpScale: number, spdScale: number): SimEnemy {
  const et = ENEMIES[type];
  let ex: number, ey: number;
  const side = Math.floor(Math.random() * 4);
  if (side === 0) { ex = rand(30, ROOM_WIDTH - 30); ey = -20; }
  else if (side === 1) { ex = ROOM_WIDTH + 20; ey = rand(30, ROOM_HEIGHT - 30); }
  else if (side === 2) { ex = rand(30, ROOM_WIDTH - 30); ey = ROOM_HEIGHT + 20; }
  else { ex = -20; ey = rand(30, ROOM_HEIGHT - 30); }
  const hp = et.hp + hpScale - 1;
  return {
    type,
    x: ex, y: ey,
    vx: 0, vy: 0,
    hp, maxHp: hp,
    alive: true,
    atkTimer: et.atkCd * Math.random() + 0.5,
    slowTimer: 0, stunTimer: 0, iframes: 0,
    burnTimer: 0, burnTick: 0,
    friendly: false,
    lifespan: 0,
    spdMul: spdScale,
  };
}

function generateWave(state: SimState): void {
  const wave = state.wave;
  const isBoss = wave % 5 === 0;
  const hpScale = 1 + Math.floor(wave / 4);
  const spdScale = 1 + wave * 0.02;

  if (isBoss) {
    const bossType = wave % 10 === 0 ? 'demon' : 'golem';
    const et = ENEMIES[bossType];
    const bossHp = Math.ceil(et.hp * Math.pow(BOSS_HP_EXPONENT, wave / BOSS_HP_EXPONENT_DIVISOR));
    state.enemies.push({
      type: bossType,
      x: ROOM_WIDTH / 2, y: 60,
      vx: 0, vy: 0,
      hp: bossHp, maxHp: bossHp,
      alive: true,
      atkTimer: 2,
      slowTimer: 0, stunTimer: 0, iframes: 0,
      burnTimer: 0, burnTick: 0,
      friendly: false, lifespan: 0, spdMul: 1,
    });
    const minionCount = 2 + Math.floor(wave / 3);
    for (let i = 0; i < minionCount; i++) {
      state.enemies.push(spawnSimEnemy(pickWaveEnemy(wave), hpScale, spdScale));
    }
  } else {
    const baseCount = 4 + wave * 2;
    const count = Math.min(baseCount, 30);
    for (let i = 0; i < count; i++) {
      state.enemies.push(spawnSimEnemy(pickWaveEnemy(wave), hpScale, spdScale));
    }
  }
}

// ═══════════════════════════════════
//       COMBAT SIMULATION
// ═══════════════════════════════════

function damageSimEnemy(state: SimState, e: SimEnemy, rawDmg: number): void {
  if (e.iframes > 0) return;
  const p = state.player;
  let dmg = rawDmg;

  // Berserker fury
  if (p.furyActive) dmg = Math.ceil(dmg * 1.5);
  // Rage multiplier
  if (p.rageDmgMul > 1) dmg = Math.ceil(dmg * p.rageDmgMul);
  // Critical strike
  if (p.critChance && Math.random() < p.critChance) dmg *= 2;

  e.hp -= dmg;
  e.iframes = 0.1;
  state.totalDamageDealt += dmg;

  // Ult charge
  p.ultCharge = Math.min(100, p.ultCharge + 5);

  // Cryomancer frostbite
  if (p.clsKey === 'cryomancer' && e.slowTimer > 0) {
    e.hp -= 1;
    state.totalDamageDealt += 1;
  }

  // Stormcaller static stun
  if (p.clsKey === 'stormcaller') {
    p.hitCounter++;
    if (p.hitCounter % 5 === 0) {
      e.stunTimer += 0.5;
    }
  }

  // Pyromancer burn
  if (p.clsKey === 'pyromancer') {
    e.burnTimer += 2;
  }

  // Mana on hit
  if (p.manaOnHit) {
    p.mana = Math.min(p.maxMana, p.mana + p.manaOnHit);
  }

  // Life steal
  if (p.lifeSteal) {
    const heal = Math.floor(dmg * p.lifeSteal);
    if (heal > 0) p.hp = Math.min(p.maxHp, p.hp + heal);
  }

  if (e.hp <= 0) {
    e.alive = false;
    state.totalKills++;
    p.killCount++;
    p.ultCharge = Math.min(100, p.ultCharge + 15);

    // Necro soul harvest
    if (p.clsKey === 'necromancer') {
      p.hp = Math.min(p.maxHp, p.hp + 1);
    }

    // Vampirism
    if (p.vampirism && p.killCount % (p.vampKillReq || 5) === 0) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
    }

    // Mana on kill
    if (p.manaOnKill) {
      p.mana = Math.min(p.maxMana, p.mana + p.manaOnKill);
    }

    // Health drop
    if (Math.random() < HEALTH_DROP_CHANCE) {
      p.hp = Math.min(p.maxHp, p.hp + 2);
    }

    // Spider: spawn babies on death
    if (e.type === 'spider') {
      for (let i = 0; i < 3; i++) {
        const baby: SimEnemy = {
          type: 'spiderling',
          x: e.x + rand(-15, 15), y: e.y + rand(-15, 15),
          vx: 0, vy: 0,
          hp: 1, maxHp: 1,
          alive: true,
          atkTimer: 0.5,
          slowTimer: 0, stunTimer: 0, iframes: 0.3,
          burnTimer: 0, burnTick: 0,
          friendly: false, lifespan: 0,
          spdMul: e.spdMul,
        };
        state.enemies.push(baby);
      }
    }
  }
}

function damageSimPlayer(state: SimState, rawDmg: number): void {
  const p = state.player;
  if (p.iframes > 0) return;

  // Dodge
  if (p.dodgeChance && Math.random() < p.dodgeChance) return;

  let reducedDmg = rawDmg;
  // Knight bulwark
  if (p.clsKey === 'knight') reducedDmg = Math.ceil(reducedDmg * 0.75);
  const dmg = Math.max(1, reducedDmg - p.armor);

  p.hp -= dmg;
  p.iframes = 0.4;

  if (p.hp <= 0) {
    if (p.secondWind > 0) {
      p.secondWind--;
      p.hp = Math.floor(p.maxHp / 2);
      p.iframes = 1.5;
    } else {
      p.alive = false;
    }
  }
}

// ═══════════════════════════════════
//       PLAYER AI (auto-play)
// ═══════════════════════════════════

function findNearestEnemy(state: SimState): SimEnemy | null {
  let nearest: SimEnemy | null = null;
  let nd = Infinity;
  for (const e of state.enemies) {
    if (!e.alive || e.friendly) continue;
    const d = dist(state.player.x, state.player.y, e.x, e.y);
    if (d < nd) { nd = d; nearest = e; }
  }
  return nearest;
}

function simPlayerTick(state: SimState, dt: number): void {
  const p = state.player;
  if (!p.alive) return;

  // Mana regen
  p.mana = Math.min(p.maxMana, p.mana + p.manaRegen * dt);

  // Cooldown tick
  for (let i = 0; i < 4; i++) {
    if (p.cd[i] > 0) p.cd[i] -= dt;
  }
  if (p.iframes > 0) p.iframes -= dt;

  // Berserker fury
  p.furyActive = p.clsKey === 'berserker' && p.hp <= p.maxHp / 2;

  // Druid regrowth passive
  if (p.clsKey === 'druid') {
    // Simple: heal 1 HP per 10 seconds by checking accumulated time
    if (Math.floor(state.time * 10) % 100 === 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
    }
  }

  // Monk inner peace (set once)
  if (p.clsKey === 'monk' && p.dodgeChance < 0.2) {
    p.dodgeChance = 0.2;
  }

  const target = findNearestEnemy(state);
  if (!target) return;

  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = dist(p.x, p.y, target.x, target.y);
  const angle = Math.atan2(dy, dx);

  // Movement AI: kite enemies, stay near center
  const idealDist = getIdealDistance(p.clsKey);
  const ms = p.moveSpeed;

  if (d < idealDist * 0.6) {
    // Too close, back away
    p.x -= (dx / d) * ms * dt;
    p.y -= (dy / d) * ms * dt;
  } else if (d > idealDist * 1.5) {
    // Too far, close in (mostly for melee)
    p.x += (dx / d) * ms * dt;
    p.y += (dy / d) * ms * dt;
  } else {
    // Circle strafe
    const perp = Math.atan2(dy, dx) + Math.PI / 2;
    p.x += Math.cos(perp) * ms * 0.5 * dt;
    p.y += Math.sin(perp) * ms * 0.5 * dt;
  }

  // Stay in bounds
  p.x = clamp(p.x, WIZARD_SIZE + 20, ROOM_WIDTH - WIZARD_SIZE - 20);
  p.y = clamp(p.y, WIZARD_SIZE + 20, ROOM_HEIGHT - WIZARD_SIZE - 20);

  const sd = p.spells;

  // Primary (LMB) - auto fire at nearest enemy
  if (p.cd[0] <= 0 && p.mana >= sd[0].mana) {
    castSimSpell(state, 0, angle);
  }

  // Secondary (RMB) - use when available and enemies in range
  if (p.cd[1] <= 0 && p.mana >= sd[1].mana && d < 200) {
    castSimSpell(state, 1, angle);
  }

  // Q ability - use when available
  if (p.cd[2] <= 0 && p.mana >= sd[2].mana) {
    castSimSpell(state, 2, angle);
  }

  // Ultimate - use when ready and enemies present
  if (p.ultCharge >= 100 && state.enemies.filter(e => e.alive && !e.friendly).length >= 3) {
    castSimUltimate(state, angle);
  }
}

function getIdealDistance(clsKey: string): number {
  switch (clsKey) {
    case 'knight':
    case 'berserker':
    case 'monk':
      return 50; // melee
    case 'ranger':
      return 250; // long range
    case 'stormcaller':
      return 200; // beam range
    default:
      return 150; // mid range
  }
}

// ═══════════════════════════════════
//       SPELL SIMULATION
// ═══════════════════════════════════

function castSimSpell(state: SimState, idx: number, angle: number): void {
  const p = state.player;
  const def = p.spells[idx];
  p.mana -= def.mana;

  // Warlock Dark Pact
  if (p.clsKey === 'warlock' && def.mana > 0) {
    const refund = Math.floor(def.mana * 0.3);
    p.mana += refund;
    p.hp -= 1;
    if (p.hp <= 0) p.hp = 1;
  }

  p.cd[idx] = def.cd;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  if (def.type === SpellType.Projectile || def.type === SpellType.Homing) {
    state.spells.push({
      dmg: def.dmg,
      speed: def.speed,
      radius: def.radius,
      life: def.life,
      x: p.x + cos * WIZARD_SIZE * 1.5,
      y: p.y + sin * WIZARD_SIZE * 1.5,
      vx: cos * def.speed,
      vy: sin * def.speed,
      age: 0,
      homing: def.homing,
      slow: def.slow,
      drain: def.drain,
      explode: def.explode,
      burn: def.burn,
      pierceLeft: p.pierce || 0,
    });
  } else if (def.type === SpellType.Beam) {
    // Instant beam damage to nearest enemy in range
    for (const e of state.enemies) {
      if (!e.alive || e.friendly || e.iframes > 0) continue;
      if (dist(p.x, p.y, e.x, e.y) <= def.range) {
        damageSimEnemy(state, e, def.dmg);
        if (def.drain) {
          p.hp = Math.min(p.maxHp, p.hp + def.drain);
        }
        break;
      }
    }
  } else if (def.type === SpellType.Cone) {
    // Cone: damage enemies in range and angle
    for (const e of state.enemies) {
      if (!e.alive || e.friendly) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d > def.range) continue;
      const a2 = Math.atan2(e.y - p.y, e.x - p.x);
      let diff = a2 - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= (def.angle || 0.8) / 2) {
        damageSimEnemy(state, e, def.dmg);
      }
    }
  } else if (def.type === SpellType.Nova) {
    // Nova: damage all in range
    for (const e of state.enemies) {
      if (!e.alive || e.friendly) continue;
      if (dist(p.x, p.y, e.x, e.y) <= def.range) {
        damageSimEnemy(state, e, def.dmg);
        if (def.slow) e.slowTimer += def.slow;
        if (def.stun) e.stunTimer += def.stun;
      }
    }
  } else if (def.type === SpellType.AoeDelayed) {
    // AOE: target nearest enemy cluster
    const target = findNearestEnemy(state);
    if (target) {
      // Delayed damage (approximate as instant for sim)
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        if (dist(target.x, target.y, e.x, e.y) <= def.radius) {
          damageSimEnemy(state, e, def.dmg);
          if (def.stun) e.stunTimer += def.stun;
        }
      }
    }
  } else if (def.type === SpellType.Zone) {
    const target = findNearestEnemy(state);
    const tx = target ? target.x : p.x;
    const ty = target ? target.y : p.y;
    state.zones.push({
      x: tx, y: ty,
      radius: def.radius,
      duration: def.duration,
      dmg: def.dmg,
      slow: def.slow,
      drain: def.drain,
      heal: def.heal,
      tickRate: def.tickRate,
      tickTimer: 0,
      age: 0,
      stun: def.stun,
    });
  } else if (def.type === SpellType.Barrage) {
    // Fire multiple projectiles
    const count = def.count || 5;
    for (let i = 0; i < count; i++) {
      const sa = angle + (i - count / 2) * (def.spread || 0.4) / count;
      state.spells.push({
        dmg: def.dmg,
        speed: def.speed,
        radius: def.radius,
        life: def.life,
        x: p.x + Math.cos(sa) * WIZARD_SIZE,
        y: p.y + Math.sin(sa) * WIZARD_SIZE,
        vx: Math.cos(sa) * def.speed,
        vy: Math.sin(sa) * def.speed,
        age: 0,
        homing: 0,
        slow: def.slow,
        drain: def.drain,
        explode: def.explode,
        burn: def.burn,
        pierceLeft: 0,
      });
    }
  } else if (def.type === SpellType.Blink || def.type === SpellType.Leap) {
    // Teleport/leap
    const range = def.range || 150;
    p.x = clamp(p.x + cos * range, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
    p.y = clamp(p.y + sin * range, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
    p.iframes = Math.max(p.iframes, 0.3);
    // Leap slam damage
    if (def.type === SpellType.Leap && def.dmg && def.aoeR) {
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        if (dist(p.x, p.y, e.x, e.y) < def.aoeR + ENEMIES[e.type].size) {
          damageSimEnemy(state, e, def.dmg);
        }
      }
    }
  } else if (def.type === SpellType.Rewind) {
    // Approximate: heal 30% HP and mana
    p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.3));
    p.mana = Math.min(p.maxMana, p.mana + 30);
  } else if (def.type === SpellType.AllyShield) {
    // Self-shield
    p.iframes = Math.max(p.iframes, def.duration || 3);
  } else if (def.type === SpellType.Trap) {
    // Instant trap damage to nearest enemy
    const target = findNearestEnemy(state);
    if (target && dist(p.x, p.y, target.x, target.y) < 200) {
      damageSimEnemy(state, target, def.dmg);
      if (def.slow) target.slowTimer += def.slow;
    }
  } else if (def.type === SpellType.Ultimate && def.key === 'Q') {
    // Special Q abilities (druid wolf, warlock imp)
    if (p.clsKey === 'druid') {
      // Spirit Wolf: summon a friendly wolf
      state.enemies.push({
        type: '_wolf',
        x: p.x + cos * 40, y: p.y + sin * 40,
        vx: 0, vy: 0,
        hp: 8, maxHp: 8,
        alive: true, atkTimer: 0,
        slowTimer: 0, stunTimer: 0, iframes: 0,
        burnTimer: 0, burnTick: 0,
        friendly: true, lifespan: 15, spdMul: 1,
      });
    } else if (p.clsKey === 'warlock') {
      // Summon Imp
      state.enemies.push({
        type: '_imp',
        x: p.x + cos * 40, y: p.y + sin * 40,
        vx: 0, vy: 0,
        hp: 5, maxHp: 5,
        alive: true, atkTimer: 0,
        slowTimer: 0, stunTimer: 0, iframes: 0,
        burnTimer: 0, burnTick: 0,
        friendly: true, lifespan: 12, spdMul: 1,
      });
    }
  }
}

function castSimUltimate(state: SimState, angle: number): void {
  const p = state.player;
  p.ultCharge = 0;

  switch (p.clsKey) {
    case 'pyromancer': {
      // Inferno: 5 AoE blasts doing 5 dmg each
      for (let i = 0; i < 5; i++) {
        for (const e of state.enemies) {
          if (!e.alive || e.friendly) continue;
          if (Math.random() < 0.5) { // ~50% chance per enemy per meteor
            damageSimEnemy(state, e, 5);
          }
        }
      }
      break;
    }
    case 'cryomancer': {
      // Absolute Zero: freeze + 3 dmg to all
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        e.stunTimer += 3;
        damageSimEnemy(state, e, 3);
      }
      break;
    }
    case 'stormcaller': {
      // Storm Fury: 8 lightning bolts on random enemies
      const alive = state.enemies.filter(e => e.alive && !e.friendly);
      for (let i = 0; i < 8 && alive.length > 0; i++) {
        const target = alive[Math.floor(Math.random() * alive.length)];
        if (target.alive) damageSimEnemy(state, target, 2);
      }
      break;
    }
    case 'arcanist': {
      // Arcane Storm: 20 homing missiles doing 2 dmg each
      const alive = state.enemies.filter(e => e.alive && !e.friendly);
      for (let i = 0; i < 20 && alive.length > 0; i++) {
        const target = alive[Math.floor(Math.random() * alive.length)];
        if (target.alive) damageSimEnemy(state, target, 2);
      }
      break;
    }
    case 'necromancer': {
      // Army of Dead: summon 6 friendly skeletons
      for (let i = 0; i < 6; i++) {
        const sa = (i / 6) * Math.PI * 2;
        state.enemies.push({
          type: '_ally',
          x: p.x + Math.cos(sa) * 50, y: p.y + Math.sin(sa) * 50,
          vx: 0, vy: 0,
          hp: 4, maxHp: 4,
          alive: true, atkTimer: 0,
          slowTimer: 0, stunTimer: 0, iframes: 0,
          burnTimer: 0, burnTick: 0,
          friendly: true, lifespan: 8, spdMul: 1,
        });
      }
      break;
    }
    case 'chronomancer': {
      // Time Stop: freeze all enemies 4s
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        e.stunTimer += 4;
      }
      break;
    }
    case 'knight': {
      // Shield Wall: invulnerable 3s
      p.iframes = Math.max(p.iframes, 3);
      break;
    }
    case 'berserker': {
      // Blood Rage: 2x damage for 5s
      p.rageDmgMul = 2;
      // Decay handled in tick
      break;
    }
    case 'paladin': {
      // Holy Light: full heal + 3 dmg to all
      p.hp = p.maxHp;
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        damageSimEnemy(state, e, 3);
      }
      break;
    }
    case 'ranger': {
      // Arrow Rain: 15 arrows doing 2 dmg each
      const alive = state.enemies.filter(e => e.alive && !e.friendly);
      for (let i = 0; i < 15 && alive.length > 0; i++) {
        const target = alive[Math.floor(Math.random() * alive.length)];
        if (target.alive) damageSimEnemy(state, target, 2);
      }
      break;
    }
    case 'druid': {
      // Nature's Wrath: 5 dmg + root 3s to all
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        damageSimEnemy(state, e, 5);
        e.stunTimer += 3;
      }
      break;
    }
    case 'warlock': {
      // Doom: 50% max HP damage to all after delay (instant in sim)
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        const doomDmg = Math.max(1, Math.ceil(e.maxHp * 0.5));
        damageSimEnemy(state, e, doomDmg);
      }
      break;
    }
    case 'monk': {
      // Thousand Fists: 20 hits doing 1 dmg in cone
      for (let i = 0; i < 20; i++) {
        for (const e of state.enemies) {
          if (!e.alive || e.friendly) continue;
          if (dist(p.x, p.y, e.x, e.y) < 60) {
            damageSimEnemy(state, e, 1);
            break; // one enemy per hit
          }
        }
      }
      break;
    }
    case 'engineer': {
      // Mega Turret: summon powerful turret + damage zone
      state.enemies.push({
        type: '_ally',
        x: p.x + Math.cos(angle) * 40, y: p.y + Math.sin(angle) * 40,
        vx: 0, vy: 0,
        hp: 30, maxHp: 30,
        alive: true, atkTimer: 0,
        slowTimer: 0, stunTimer: 0, iframes: 0,
        burnTimer: 0, burnTick: 0,
        friendly: true, lifespan: 20, spdMul: 1,
      });
      state.zones.push({
        x: p.x + Math.cos(angle) * 40,
        y: p.y + Math.sin(angle) * 40,
        radius: 130, duration: 20,
        dmg: 3, slow: 0, drain: 0, heal: 0,
        tickRate: 0.7, tickTimer: 0, age: 0, stun: 0,
      });
      break;
    }
  }
}

// ═══════════════════════════════════
//       ENEMY AI SIMULATION
// ═══════════════════════════════════

function simEnemyTick(state: SimState, dt: number): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;

    // Friendly summon logic
    if (e.friendly) {
      e.lifespan -= dt;
      if (e.lifespan <= 0) { e.alive = false; continue; }

      // Chase nearest enemy
      let nt: SimEnemy | null = null;
      let nd = Infinity;
      for (const e2 of state.enemies) {
        if (!e2.alive || e2.friendly || e2 === e) continue;
        const d = dist(e.x, e.y, e2.x, e2.y);
        if (d < nd) { nd = d; nt = e2; }
      }
      if (nt) {
        const dx = nt.x - e.x;
        const dy = nt.y - e.y;
        const dd = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const et = ENEMIES[e.type] || ENEMIES['_ally'];
        e.x += (dx / dd) * et.speed * dt;
        e.y += (dy / dd) * et.speed * dt;
        e.atkTimer -= dt;
        if (e.atkTimer <= 0 && dd < et.atkR + 5) {
          e.atkTimer = et.atkCd;
          damageSimEnemy(state, nt, et.dmg);
        }
      }
      continue;
    }

    const et = ENEMIES[e.type];
    if (!et) continue;

    if (e.iframes > 0) e.iframes -= dt;
    if (e.slowTimer > 0) e.slowTimer -= dt;
    if (e.stunTimer > 0) { e.stunTimer -= dt; continue; }

    // Burn DOT
    if (e.burnTimer > 0) {
      e.burnTimer -= dt;
      e.burnTick -= dt;
      if (e.burnTick <= 0) {
        e.burnTick = 0.5;
        damageSimEnemy(state, e, 1);
      }
    }

    const slow = e.slowTimer > 0 ? 0.4 : 1;
    const spdMul = e.spdMul || 1;
    const p = state.player;

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const spd = et.speed * spdMul * slow;

    // Movement
    if (et.ai === EnemyAI.Chase) {
      if (d > et.atkR * 0.8) {
        e.vx = (dx / d) * spd;
        e.vy = (dy / d) * spd;
      } else {
        e.vx *= 0.8;
        e.vy *= 0.8;
      }
    } else if (et.ai === EnemyAI.Ranged) {
      if (d > et.atkR * 0.6) {
        e.vx = (dx / d) * spd;
        e.vy = (dy / d) * spd;
      } else if (d < et.atkR * 0.3) {
        e.vx = -(dx / d) * spd * 0.5;
        e.vy = -(dy / d) * spd * 0.5;
      } else {
        e.vx *= 0.9;
        e.vy *= 0.9;
      }
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.x = clamp(e.x, et.size, ROOM_WIDTH - et.size);
    e.y = clamp(e.y, et.size, ROOM_HEIGHT - et.size);

    // Attack
    e.atkTimer -= dt;
    if (e.atkTimer <= 0 && d < et.atkR) {
      e.atkTimer = et.atkCd;
      if (et.ai === EnemyAI.Chase) {
        damageSimPlayer(state, et.dmg);
        // Thorns
        if (p.thorns && e.alive) {
          e.hp -= p.thorns;
          if (e.hp <= 0) { e.alive = false; state.totalKills++; }
        }
      } else {
        // Ranged projectile: approximate as having ~60% hit rate
        if (Math.random() < 0.6) {
          damageSimPlayer(state, et.dmg);
        }
      }
    }
  }
}

// ═══════════════════════════════════
//       SPELL & ZONE TICK
// ═══════════════════════════════════

function simSpellTick(state: SimState, dt: number): void {
  for (let i = state.spells.length - 1; i >= 0; i--) {
    const s = state.spells[i];

    // Homing
    if (s.homing) {
      let nt: SimEnemy | null = null;
      let nd = Infinity;
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        const d = dist(s.x, s.y, e.x, e.y);
        if (d < nd) { nd = d; nt = e; }
      }
      if (nt && nd < 280) {
        const da = Math.atan2(nt.y - s.y, nt.x - s.x);
        const ca = Math.atan2(s.vy, s.vx);
        let df = da - ca;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        df = Math.max(-s.homing * dt, Math.min(s.homing * dt, df));
        const na = ca + df;
        const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        s.vx = Math.cos(na) * sp;
        s.vy = Math.sin(na) * sp;
      }
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.age += dt;

    // Collision with enemies
    let hit = false;
    for (const e of state.enemies) {
      if (!e.alive || e.friendly || e.iframes > 0) continue;
      const et = ENEMIES[e.type];
      if (!et) continue;
      if (dist(s.x, s.y, e.x, e.y) < et.size + s.radius) {
        damageSimEnemy(state, e, s.dmg);
        if (s.slow) e.slowTimer += s.slow;
        if (s.drain) {
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + s.drain);
        }
        if (s.burn) e.burnTimer += s.burn;
        if (s.pierceLeft > 0) { s.pierceLeft--; continue; }

        // Explode
        if (s.explode) {
          for (const e2 of state.enemies) {
            if (!e2.alive || e2.friendly) continue;
            if (dist(s.x, s.y, e2.x, e2.y) < s.explode) {
              damageSimEnemy(state, e2, 1);
            }
          }
        }

        hit = true;
        break;
      }
    }

    if (hit || s.age > s.life || s.x < -30 || s.x > ROOM_WIDTH + 30 || s.y < -30 || s.y > ROOM_HEIGHT + 30) {
      state.spells.splice(i, 1);
    }
  }
}

function simZoneTick(state: SimState, dt: number): void {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const z = state.zones[i];
    z.age += dt;
    z.tickTimer -= dt;
    if (z.tickTimer <= 0) {
      z.tickTimer = z.tickRate;
      for (const e of state.enemies) {
        if (!e.alive || e.friendly) continue;
        const et = ENEMIES[e.type];
        if (!et) continue;
        if (dist(z.x, z.y, e.x, e.y) < z.radius + et.size) {
          if (z.dmg > 0) damageSimEnemy(state, e, z.dmg);
          if (z.slow) e.slowTimer += z.slow;
          if (z.stun) e.stunTimer += z.stun;
          if (z.drain) {
            state.player.hp = Math.min(state.player.maxHp, state.player.hp + z.drain);
          }
        }
      }
      // Healing zone (meditation, consecrate)
      if (z.heal && dist(z.x, z.y, state.player.x, state.player.y) < z.radius) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + z.heal);
      }
    }
    if (z.age >= z.duration) state.zones.splice(i, 1);
  }
}

// ═══════════════════════════════════
//       SINGLE RUN SIMULATION
// ═══════════════════════════════════

interface RunResult {
  waveSurvived: number;
  kills: number;
  totalDamage: number;
  totalTime: number;
  hpAtDeath: number;
  wavesSurvived: boolean[]; // index = wave-1, did player survive past it?
}

function createSimPlayer(clsKey: string): SimPlayer {
  const cls = CLASSES[clsKey];
  return {
    clsKey,
    spells: cls.spells.map(s => normalizeSpellDef({ ...s })),
    x: ROOM_WIDTH / 2,
    y: ROOM_HEIGHT * 0.6,
    hp: WIZARD_HP,
    maxHp: WIZARD_HP,
    mana: MAX_MANA,
    maxMana: MAX_MANA,
    manaRegen: MANA_REGEN,
    alive: true,
    iframes: 1.5,
    cd: [0, 0, 0, 0],
    moveSpeed: DEFAULT_MOVE_SPEED,
    ultCharge: 0,
    armor: 0,
    dodgeChance: 0,
    secondWind: 0,
    killCount: 0,
    hitCounter: 0,
    vampirism: 0,
    vampKillReq: 5,
    lifeSteal: 0,
    manaOnKill: 0,
    manaOnHit: 0,
    thorns: 0,
    critChance: 0,
    pierce: 0,
    overkill: false,
    furyActive: false,
    rageDmgMul: 1,
  };
}

function simulateRun(clsKey: string): RunResult {
  const state: SimState = {
    player: createSimPlayer(clsKey),
    enemies: [],
    spells: [],
    zones: [],
    wave: 0,
    time: 0,
    totalKills: 0,
    totalDamageDealt: 0,
  };

  const wavesSurvived: boolean[] = [];

  for (let w = 1; w <= MAX_WAVE; w++) {
    state.wave = w;
    state.enemies = state.enemies.filter(e => e.alive && e.friendly); // keep summons
    state.spells = [];
    // Keep ongoing zones
    generateWave(state);

    // Simulate the wave
    let waveTime = 0;
    while (state.player.alive && waveTime < MAX_WAVE_TIME) {
      const dt = SIM_DT;
      state.time += dt;
      waveTime += dt;

      simPlayerTick(state, dt);
      simSpellTick(state, dt);
      simZoneTick(state, dt);
      simEnemyTick(state, dt);

      // Berserker rage decay
      if (state.player.rageDmgMul > 1) {
        // Rage lasts ~5s - approximate
        if (waveTime > 5) state.player.rageDmgMul = 1;
      }

      // Check if all non-friendly enemies are dead
      const aliveEnemies = state.enemies.filter(e => e.alive && !e.friendly);
      if (aliveEnemies.length === 0) break;
    }

    if (!state.player.alive) {
      // Died this wave
      wavesSurvived.push(false);
      return {
        waveSurvived: w,
        kills: state.totalKills,
        totalDamage: state.totalDamageDealt,
        totalTime: state.time,
        hpAtDeath: 0,
        wavesSurvived,
      };
    }

    wavesSurvived.push(true);

    // Between waves: heal a bit (health pickups from wave clear)
    if (w % 5 === 0) {
      // Boss cleared: extra health
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4);
    } else if (Math.random() < 0.4) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);
    }
  }

  // Survived all waves
  return {
    waveSurvived: MAX_WAVE + 1,
    kills: state.totalKills,
    totalDamage: state.totalDamageDealt,
    totalTime: state.time,
    hpAtDeath: state.player.hp,
    wavesSurvived,
  };
}

// ═══════════════════════════════════
//       UPGRADE IMPACT SIMULATION
// ═══════════════════════════════════

interface UpgradeImpact {
  name: string;
  avgWaveDelta: number;
  sampleSize: number;
}

function simulateUpgradeImpact(): UpgradeImpact[] {
  // For each upgrade, run a handful of games with it applied at wave 1
  // Compare against baseline
  const UPGRADE_RUNS = 10;
  const baselineKey = 'pyromancer'; // Use pyromancer as baseline

  // Baseline average
  let baseSum = 0;
  for (let i = 0; i < UPGRADE_RUNS; i++) {
    baseSum += simulateRun(baselineKey).waveSurvived;
  }
  const baseAvg = baseSum / UPGRADE_RUNS;

  const results: UpgradeImpact[] = [];

  for (const upgrade of UPGRADE_POOL) {
    let upgradeSum = 0;
    for (let i = 0; i < UPGRADE_RUNS; i++) {
      // Create a run with the upgrade pre-applied
      // We do this by running a modified sim
      const state: SimState = {
        player: createSimPlayer(baselineKey),
        enemies: [],
        spells: [],
        zones: [],
        wave: 0,
        time: 0,
        totalKills: 0,
        totalDamageDealt: 0,
      };

      // Apply upgrade to the sim player by invoking it on a proxy Player
      try {
        applyUpgradeToSimPlayer(state.player, upgrade.apply);
      } catch {
        // Some upgrades may reference DOM or unsupported properties
      }

      // Run the sim
      const wavesSurvived: boolean[] = [];
      let finalWave = MAX_WAVE + 1;

      for (let w = 1; w <= MAX_WAVE; w++) {
        state.wave = w;
        state.enemies = state.enemies.filter(e => e.alive && e.friendly);
        state.spells = [];
        generateWave(state);

        let waveTime = 0;
        while (state.player.alive && waveTime < MAX_WAVE_TIME) {
          state.time += SIM_DT;
          waveTime += SIM_DT;
          simPlayerTick(state, SIM_DT);
          simSpellTick(state, SIM_DT);
          simZoneTick(state, SIM_DT);
          simEnemyTick(state, SIM_DT);
          if (state.player.rageDmgMul > 1 && waveTime > 5) state.player.rageDmgMul = 1;
          if (state.enemies.filter(e => e.alive && !e.friendly).length === 0) break;
        }

        if (!state.player.alive) {
          finalWave = w;
          break;
        }
        wavesSurvived.push(true);

        if (w % 5 === 0) {
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4);
        } else if (Math.random() < 0.4) {
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);
        }
      }

      upgradeSum += finalWave;
    }

    const upgradeAvg = upgradeSum / UPGRADE_RUNS;
    results.push({
      name: upgrade.name,
      avgWaveDelta: Math.round((upgradeAvg - baseAvg) * 10) / 10,
      sampleSize: UPGRADE_RUNS,
    });
  }

  return results;
}

/** Map upgrade apply function to our SimPlayer by creating a shim Player-like object */
function applyUpgradeToSimPlayer(sp: SimPlayer, apply: (p: any, stacks: number) => void): void {
  // Create a proxy that maps Player fields to SimPlayer
  const proxy: any = {
    cls: { spells: sp.spells },
    maxHp: sp.maxHp,
    hp: sp.hp,
    maxMana: sp.maxMana,
    mana: sp.mana,
    manaRegen: sp.manaRegen,
    moveSpeed: sp.moveSpeed,
    armor: sp.armor,
    critChance: sp.critChance,
    overkill: sp.overkill,
    pierce: sp.pierce,
    splitShot: 0,
    ricochet: 0,
    chainHit: 0,
    doubleTap: 0,
    killResetCD: false,
    manaOnKill: sp.manaOnKill,
    manaOnHit: sp.manaOnHit,
    lifeSteal: sp.lifeSteal,
    secondWind: sp.secondWind,
    thorns: sp.thorns,
    dodgeChance: sp.dodgeChance,
    hasDash: false,
    dashCd: 0,
    momentum: false,
    aftershock: false,
    chaosDmg: false,
    magnetRange: 30,
    goldMul: 1,
    xpBoost: 0,
    selfDmg: false,
    vampirism: sp.vampirism,
    vampKillReq: sp.vampKillReq,
  };

  apply(proxy, 1);

  // Map back
  sp.maxHp = proxy.maxHp;
  sp.hp = Math.min(sp.hp, sp.maxHp);
  sp.maxMana = proxy.maxMana;
  sp.mana = proxy.mana;
  sp.manaRegen = proxy.manaRegen;
  sp.moveSpeed = proxy.moveSpeed;
  sp.armor = proxy.armor;
  sp.critChance = proxy.critChance;
  sp.overkill = proxy.overkill;
  sp.pierce = proxy.pierce;
  sp.manaOnKill = proxy.manaOnKill;
  sp.manaOnHit = proxy.manaOnHit;
  sp.lifeSteal = proxy.lifeSteal;
  sp.secondWind = proxy.secondWind;
  sp.thorns = proxy.thorns;
  sp.dodgeChance = proxy.dodgeChance;
  sp.vampirism = proxy.vampirism;
  sp.vampKillReq = proxy.vampKillReq;
  sp.spells = proxy.cls.spells;
}

// ═══════════════════════════════════
//       MAIN EXECUTION
// ═══════════════════════════════════

interface ClassReport {
  className: string;
  classKey: string;
  avgWaveSurvived: number;
  avgKills: number;
  dps: number;
  avgHpAtDeath: number;
  wave5WinRate: number;
  wave10WinRate: number;
  wave15WinRate: number;
  wave20WinRate: number;
  runs: number;
}

function main(): void {
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log(`  WIZARD CRAWL BALANCE SIMULATOR`);
  console.log(`  Runs per class: ${NUM_RUNS}  |  Max wave: ${MAX_WAVE}`);
  console.log('='.repeat(60));
  console.log('');

  const classReports: ClassReport[] = [];

  for (const clsKey of CLASS_ORDER) {
    const cls = CLASSES[clsKey];
    process.stdout.write(`  Simulating ${cls.name.padEnd(14)} ...`);

    const runs: RunResult[] = [];
    for (let i = 0; i < NUM_RUNS; i++) {
      runs.push(simulateRun(clsKey));
    }

    const avgWave = runs.reduce((s, r) => s + r.waveSurvived, 0) / NUM_RUNS;
    const avgKills = runs.reduce((s, r) => s + r.kills, 0) / NUM_RUNS;
    const avgTime = runs.reduce((s, r) => s + r.totalTime, 0) / NUM_RUNS;
    const avgDmg = runs.reduce((s, r) => s + r.totalDamage, 0) / NUM_RUNS;
    const dps = avgTime > 0 ? avgDmg / avgTime : 0;
    const avgHpDeath = runs.reduce((s, r) => s + r.hpAtDeath, 0) / NUM_RUNS;

    const wave5WR = runs.filter(r => r.wavesSurvived.length >= 5 && r.wavesSurvived[4]).length / NUM_RUNS;
    const wave10WR = runs.filter(r => r.wavesSurvived.length >= 10 && r.wavesSurvived[9]).length / NUM_RUNS;
    const wave15WR = runs.filter(r => r.wavesSurvived.length >= 15 && r.wavesSurvived[14]).length / NUM_RUNS;
    const wave20WR = runs.filter(r => r.wavesSurvived.length >= 20 && r.wavesSurvived[19]).length / NUM_RUNS;

    const report: ClassReport = {
      className: cls.name,
      classKey: clsKey,
      avgWaveSurvived: Math.round(avgWave * 10) / 10,
      avgKills: Math.round(avgKills * 10) / 10,
      dps: Math.round(dps * 10) / 10,
      avgHpAtDeath: Math.round(avgHpDeath * 10) / 10,
      wave5WinRate: Math.round(wave5WR * 1000) / 10,
      wave10WinRate: Math.round(wave10WR * 1000) / 10,
      wave15WinRate: Math.round(wave15WR * 1000) / 10,
      wave20WinRate: Math.round(wave20WR * 1000) / 10,
      runs: NUM_RUNS,
    };
    classReports.push(report);

    console.log(` avg wave ${report.avgWaveSurvived}, kills ${report.avgKills}, DPS ${report.dps}`);
  }

  // Print class tier list
  console.log('');
  console.log('='.repeat(60));
  console.log('  CLASS TIER LIST (sorted by avg wave survived)');
  console.log('='.repeat(60));
  const sorted = [...classReports].sort((a, b) => b.avgWaveSurvived - a.avgWaveSurvived);
  console.log('');
  console.log('  Rank  Class            Wave   Kills   DPS    W5%    W10%   W15%   W20%');
  console.log('  ' + '-'.repeat(78));
  sorted.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}.   ${r.className.padEnd(16)} ${String(r.avgWaveSurvived).padStart(5)}  ${String(r.avgKills).padStart(6)}  ${String(r.dps).padStart(5)}  ${String(r.wave5WinRate).padStart(5)}% ${String(r.wave10WinRate).padStart(5)}% ${String(r.wave15WinRate).padStart(5)}% ${String(r.wave20WinRate).padStart(5)}%`
    );
  });

  // Outlier detection
  console.log('');
  console.log('='.repeat(60));
  console.log('  OUTLIERS');
  console.log('='.repeat(60));
  let hasOutliers = false;

  for (const r of sorted) {
    if (r.wave10WinRate > 65) {
      console.log(`  ** ${r.className}: wave-10 survival ${r.wave10WinRate}% > 65% -- NEEDS NERF **`);
      hasOutliers = true;
    }
    if (r.wave5WinRate < 20) {
      console.log(`  ** ${r.className}: wave-5 survival ${r.wave5WinRate}% < 20% -- NEEDS BUFF **`);
      hasOutliers = true;
    }
  }

  // Also flag if any class is 2+ sigma away from mean wave
  const meanWave = sorted.reduce((s, r) => s + r.avgWaveSurvived, 0) / sorted.length;
  const variance = sorted.reduce((s, r) => s + (r.avgWaveSurvived - meanWave) ** 2, 0) / sorted.length;
  const stddev = Math.sqrt(variance);
  if (stddev > 0.5) {
    for (const r of sorted) {
      const z = (r.avgWaveSurvived - meanWave) / stddev;
      if (z > 2) {
        console.log(`  ** ${r.className}: ${r.avgWaveSurvived} avg wave is >2 sigma above mean (${Math.round(meanWave * 10) / 10}) -- NERF? **`);
        hasOutliers = true;
      } else if (z < -2) {
        console.log(`  ** ${r.className}: ${r.avgWaveSurvived} avg wave is >2 sigma below mean (${Math.round(meanWave * 10) / 10}) -- BUFF? **`);
        hasOutliers = true;
      }
    }
  }

  if (!hasOutliers) {
    console.log('  (no significant outliers detected)');
  }

  // Upgrade impact
  console.log('');
  console.log('='.repeat(60));
  console.log('  UPGRADE IMPACT (delta waves on Pyromancer baseline)');
  console.log('='.repeat(60));
  console.log('');

  const upgradeImpacts = simulateUpgradeImpact();
  const sortedUpgrades = [...upgradeImpacts].sort((a, b) => b.avgWaveDelta - a.avgWaveDelta);

  console.log('  Rank  Upgrade                 Delta Waves');
  console.log('  ' + '-'.repeat(50));
  sortedUpgrades.forEach((u, i) => {
    const sign = u.avgWaveDelta >= 0 ? '+' : '';
    console.log(`  ${String(i + 1).padStart(2)}.   ${u.name.padEnd(22)} ${sign}${u.avgWaveDelta}`);
  });

  const elapsed = Date.now() - startTime;
  console.log('');
  console.log('='.repeat(60));
  console.log(`  Completed in ${(elapsed / 1000).toFixed(1)}s`);
  console.log('='.repeat(60));

  // Export JSON
  const jsonReport = {
    timestamp: new Date().toISOString(),
    config: { runs: NUM_RUNS, maxWave: MAX_WAVE },
    classTierList: sorted,
    outliers: sorted.filter(r => r.wave10WinRate > 65 || r.wave5WinRate < 20).map(r => ({
      className: r.className,
      reason: r.wave10WinRate > 65 ? 'wave10_too_high' : 'wave5_too_low',
      value: r.wave10WinRate > 65 ? r.wave10WinRate : r.wave5WinRate,
    })),
    upgradeImpact: sortedUpgrades,
    meta: {
      meanWave: Math.round(meanWave * 10) / 10,
      stddevWave: Math.round(stddev * 10) / 10,
      elapsedMs: elapsed,
    },
  };

  const jsonPath = path.resolve(process.cwd(), 'tools', 'balance_report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`  Report written to: ${jsonPath}`);
}

main();
