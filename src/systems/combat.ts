import {
  GameState,
  dist,
  clamp,
  rand,
  wrapAngle,
  toWorld,
  spawnParticles,
  spawnText,
  spawnShockwave,
  shake,
} from '../state';
import {
  Player,
  Enemy,
  Spell,
  SpellDef,
  SpellType,
  PickupType,
  GamePhase,
  SfxName,
} from '../types';
import {
  ENEMIES,
  WIZARD_SIZE,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  GAME_OVER_DELAY_MS,
  RESPAWN_DELAY_MS,
  HEALTH_DROP_CHANCE,
} from '../constants';
import { sfx } from '../audio';
import { createFriendlyEnemy } from './dungeon';

// ═══════════════════════════════════
//       DAMAGE ENEMY
// ═══════════════════════════════════

export function damageEnemy(state: GameState, e: Enemy, rawDmg: number, pIdx: number): void {
  if (e.iframes > 0) return;
  const p = state.players[pIdx];
  let dmg = rawDmg;

  // Chaos damage: random 1-4
  if (p && p.chaosDmg) dmg = 1 + Math.floor(Math.random() * 4);
  // Berserker fury: +50% dmg below half HP
  if (p && p._furyActive) dmg = Math.ceil(dmg * 1.5);
  // Blood rage: 2x damage
  if (p && p._rageDmgMul > 1) dmg = Math.ceil(dmg * p._rageDmgMul);
  // Critical strike
  if (p && p.critChance && Math.random() < p.critChance) {
    dmg *= 2;
    spawnText(state, e.x, e.y - 25, 'CRIT!', '#ffcc44');
  }
  // Momentum bonus
  if (p && p.momentum) {
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    dmg = Math.round(dmg * (1 + Math.min(0.2, spd / 1000)));
  }

  e.hp -= dmg;
  e.iframes = 0.1;
  spawnParticles(state, e.x, e.y, '#ff6644', 5, 0.5);
  sfx(SfxName.Hit);

  // Ultimate charge (+5 per hit, +15 per kill)
  if (p) {
    p.ultCharge = Math.min(100, (p.ultCharge || 0) + 5);
    if (p.ultCharge >= 100) p.ultReady = true;
  }

  // Passive: Stormcaller static (every 5th hit stuns)
  if (p && p.clsKey === 'stormcaller') {
    p.hitCounter = (p.hitCounter || 0) + 1;
    if (p.hitCounter % 5 === 0) {
      e.stunTimer = (e.stunTimer || 0) + 0.5;
      spawnText(state, e.x, e.y - 15, 'STUN', '#ffcc44');
    }
  }

  // Passive: Cryomancer frostbite (+1 dmg if slowed)
  if (p && p.clsKey === 'cryomancer' && e.slowTimer > 0) {
    e.hp -= 1;
    spawnText(state, e.x, e.y - 15, '+1', '#88ddff');
  }

  // Passive: Arcanist echo (20% chance double cast)
  if (p && p.clsKey === 'arcanist' && Math.random() < 0.2) {
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
    e.alive = false;
    state.totalKills++;
    const et = ENEMIES[e.type];
    const goldDrop = et.gold * (p ? p.goldMul : 1);
    state.gold += goldDrop;

    if (p) {
      p.killCount++;
      // Ultimate charge on kill
      p.ultCharge = Math.min(100, (p.ultCharge || 0) + 15);
      if (p.ultCharge >= 100) p.ultReady = true;

      // Passive: Necro soul harvest
      if (p.clsKey === 'necromancer') {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        spawnText(state, p.x, p.y - 15, '+1 HP', '#44ff88');
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
    }

    spawnParticles(state, e.x, e.y, et.color, 18, 1);
    spawnShockwave(state, e.x, e.y, 25);
    sfx(SfxName.Kill);

    if (et.boss) {
      shake(state, 10);
      spawnText(state, e.x, e.y - 20, 'BOSS SLAIN!', '#ffcc44');
      state.screenFlash = 0.2;
    }

    // Chain hit: damage jumps to nearby enemy
    if (p && p.chainHit) {
      let nearest: Enemy | null = null;
      let nd = Infinity;
      for (const e2 of state.enemies) {
        if (!e2.alive || e2 === e) continue;
        const d = dist(e.x, e.y, e2.x, e2.y);
        if (d < 120 && d < nd) { nd = d; nearest = e2; }
      }
      if (nearest) {
        damageEnemy(state, nearest, Math.max(1, Math.floor(dmg * 0.5)), pIdx);
        state.beams.push({
          x: e.x, y: e.y,
          angle: Math.atan2(nearest.y - e.y, nearest.x - e.x),
          range: nd, width: 2, color: p.cls.color, life: 0.12,
        });
      }
    }

    // Overkill: excess damage chains
    if (p && p.overkill && e.hp < 0) {
      const excess = Math.abs(e.hp);
      let nearest2: Enemy | null = null;
      let nd2 = Infinity;
      for (const e2 of state.enemies) {
        if (!e2.alive || e2 === e) continue;
        const d = dist(e.x, e.y, e2.x, e2.y);
        if (d < 100 && d < nd2) { nd2 = d; nearest2 = e2; }
      }
      if (nearest2) damageEnemy(state, nearest2, excess, pIdx);
    }

    // Drop health sometimes
    if (Math.random() < HEALTH_DROP_CHANCE) {
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

  // Dodge
  if (p.dodgeChance && Math.random() < p.dodgeChance) {
    spawnText(state, p.x, p.y - 20, 'DODGE', '#88ccff');
    return;
  }

  let reducedDmg = rawDmg;
  // Knight bulwark: 25% less damage
  if (p.clsKey === 'knight') reducedDmg = Math.ceil(reducedDmg * 0.75);
  // Blood rage: take 2x damage
  if (p._rage > 0) reducedDmg = Math.ceil(reducedDmg * 2);
  const dmg = Math.max(1, reducedDmg - (p.armor || 0));

  p.hp -= dmg;
  p.iframes = 0.4;
  shake(state, 3);
  spawnParticles(state, p.x, p.y, '#ff4444', 8);
  sfx(SfxName.Hit);
  spawnText(state, p.x, p.y - 20, `-${dmg}`, '#ff4444');

  // Thorns
  if (p.thorns && attacker && attacker.alive !== undefined) {
    attacker.hp -= p.thorns;
    spawnParticles(state, attacker.x, attacker.y, '#aa88ff', 4, 0.3);
    if (attacker.hp <= 0) {
      attacker.alive = false;
      spawnParticles(state, attacker.x, attacker.y, ENEMIES[attacker.type].color, 12);
      sfx(SfxName.Kill);
    }
  }

  if (p.hp <= 0) {
    // Second wind
    if (p.secondWind && p.secondWind > 0) {
      p.secondWind--;
      p.hp = Math.floor(p.maxHp / 2);
      p.iframes = 1.5;
      spawnParticles(state, p.x, p.y, '#ffcc44', 20);
      spawnText(state, p.x, p.y - 25, 'SECOND WIND', '#ffcc44');
      sfx(SfxName.Pickup);
      return;
    }

    p.alive = false;
    spawnParticles(state, p.x, p.y, '#ff6633', 35, 1.3);
    spawnShockwave(state, p.x, p.y, 70, 'rgba(255,100,50,.5)');
    sfx(SfxName.Boom);
    shake(state, 10);
    state.screenFlash = 0.3;

    if (state.players.every(pl => !pl.alive)) {
      state.gamePhase = GamePhase.GameOver;
      setTimeout(() => {
        const statsEl = document.getElementById('go-stats');
        if (statsEl) {
          statsEl.innerHTML = `Wave ${state.wave}<br>Kills: ${state.totalKills}<br>Gold: ${state.gold}`;
        }
        const goEl = document.getElementById('gameover');
        if (goEl) goEl.style.display = 'flex';
      }, GAME_OVER_DELAY_MS);
    } else {
      // Revive after delay if ally still alive
      setTimeout(() => {
        if (state.gamePhase === GamePhase.Playing && state.players.some(pl => pl.alive)) {
          p.hp = Math.floor(p.maxHp / 2);
          p.mana = p.maxMana;
          p.alive = true;
          p.iframes = 2;
          p.x = ROOM_WIDTH / 2;
          p.y = ROOM_HEIGHT / 2;
        }
      }, RESPAWN_DELAY_MS);
    }
  }
}

// ═══════════════════════════════════
//       SPELL CASTING
// ═══════════════════════════════════

/** Silent cast: no mana cost, no cooldown, no sound (for split shot / double tap) */
export function castSpellSilent(state: GameState, p: Player, idx: number, angle: number): void {
  const def = p.cls.spells[idx];
  if (def.type === SpellType.Projectile || def.type === SpellType.Homing) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sx = p.x + cos * WIZARD_SIZE * 1.5;
    const sy = p.y + sin * WIZARD_SIZE * 1.5;
    state.spells.push({
      ...spellToRuntime(def),
      x: sx, y: sy,
      vx: cos * def.speed, vy: sin * def.speed,
      owner: p.idx, age: 0, zapTimer: 0, pierceLeft: p.pierce || 0,
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
  p.cd[idx] = def.cd;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sx = p.x + cos * WIZARD_SIZE * 1.5;
  const sy = p.y + sin * WIZARD_SIZE * 1.5;
  const sType = classSfx(p.clsKey);

  if (def.type === SpellType.Projectile || def.type === SpellType.Homing) {
    state.spells.push({
      ...spellToRuntime(def),
      x: sx, y: sy,
      vx: cos * def.speed, vy: sin * def.speed,
      owner: p.idx, age: 0, zapTimer: 0, pierceLeft: p.pierce || 0,
    });
    sfx(sType);
  } else if (def.type === SpellType.Beam) {
    state.beams.push({ x: p.x, y: p.y, angle, range: def.range, width: def.width, color: def.color, life: 0.15 });
    // Beam hit detection
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
          damageEnemy(state, e, def.dmg, p.idx);
          break;
        }
      }
    }
    sfx(SfxName.Zap);
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
        damageEnemy(state, e, def.dmg, p.idx);
      }
    }
    sfx(SfxName.Fire);
    shake(state, 4);
  } else if (def.type === SpellType.Nova) {
    spawnShockwave(state, p.x, p.y, def.range, def.color);
    spawnParticles(state, p.x, p.y, def.color, 20);
    let novaHealed = 0;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (dist(p.x, p.y, e.x, e.y) <= def.range) {
        damageEnemy(state, e, def.dmg, p.idx);
        if (def.slow) e.slowTimer = (e.slowTimer || 0) + def.slow;
        if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
        if (def.drain) novaHealed += def.drain;
      }
    }
    if (novaHealed > 0) {
      p.hp = Math.min(p.maxHp, p.hp + novaHealed);
      spawnText(state, p.x, p.y - 20, `+${novaHealed} HP`, '#44ff88');
    }
    sfx(SfxName.Ice);
    shake(state, 5);
  } else if (def.type === SpellType.AoeDelayed) {
    const wp = toWorld(state, state.mouseX, state.mouseY);
    state.aoeMarkers.push({
      x: wp.x, y: wp.y, radius: def.radius, delay: def.delay, dmg: def.dmg,
      color: def.color, owner: p.idx, stun: def.stun || 0, age: 0,
    });
    sfx(SfxName.Arcane);
  } else if (def.type === SpellType.Blink) {
    const nx = clamp(p.x + cos * def.range, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
    const ny = clamp(p.y + sin * def.range, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
    spawnParticles(state, p.x, p.y, def.color, 12);
    p.x = nx;
    p.y = ny;
    spawnParticles(state, p.x, p.y, def.color, 12);
    p.iframes = 0.3;
    sfx(SfxName.Blink);
  } else if (def.type === SpellType.Barrage) {
    for (let i = 0; i < def.count; i++) {
      const sa = angle + (i - def.count / 2) * def.spread / def.count + rand(-0.05, 0.05);
      // Stagger barrage shots
      setTimeout(() => {
        state.spells.push({
          ...spellToRuntime(def),
          type: SpellType.Projectile,
          x: p.x + Math.cos(sa) * WIZARD_SIZE,
          y: p.y + Math.sin(sa) * WIZARD_SIZE,
          vx: Math.cos(sa) * def.speed,
          vy: Math.sin(sa) * def.speed,
          owner: p.idx, age: 0, pierceLeft: 0, zapTimer: 0,
        });
        sfx(SfxName.Arcane);
      }, i * 60);
    }
  } else if (def.type === SpellType.Zone) {
    const wp = toWorld(state, state.mouseX, state.mouseY);
    state.zones.push({
      x: wp.x, y: wp.y, radius: def.radius, duration: def.duration,
      dmg: def.dmg, color: def.color, owner: p.idx,
      slow: def.slow || 0, tickRate: def.tickRate, tickTimer: 0, age: 0,
      drain: def.drain || 0, heal: def.heal || 0,
    });
    sfx(SfxName.Ice);
  } else if (def.type === SpellType.Rewind) {
    const snap = p._rewindSnap;
    if (snap) {
      p.hp = Math.min(p.maxHp, Math.max(p.hp, snap.hp));
      p.mana = Math.min(p.maxMana, Math.max(p.mana, snap.mana));
      spawnParticles(state, p.x, p.y, '#ffcc44', 20);
      spawnShockwave(state, p.x, p.y, 60, 'rgba(255,200,60,.4)');
      spawnText(state, p.x, p.y - 25, 'REWIND', '#ffcc44');
      sfx(SfxName.Blink);
      shake(state, 3);
      state.screenFlash = 0.15;
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
    sfx(SfxName.Boom);
    shake(state, 6);
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (dist(p.x, p.y, e.x, e.y) < def.aoeR + ENEMIES[e.type].size) {
        damageEnemy(state, e, def.dmg, p.idx);
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
    sfx(SfxName.Pickup);
    spawnText(state, target.x, target.y - 20, 'SHIELDED', '#ffffcc');
  } else if (def.type === SpellType.Trap) {
    // Ranger trap: place at mouse position
    const wp = toWorld(state, state.mouseX, state.mouseY);
    state.pickups.push({
      x: wp.x, y: wp.y, type: PickupType.Trap, collected: false,
      value: 0,
      _owner: p.idx, _dmg: def.dmg, _radius: def.radius, _slow: def.slow || 0, _color: def.color,
    });
    sfx(SfxName.Hit);
  }
}

// ═══════════════════════════════════
//       ULTIMATE ABILITIES
// ═══════════════════════════════════

export function castUltimate(state: GameState, p: Player, angle: number): void {
  p.ultCharge = 0;
  p.ultReady = false;
  sfx(SfxName.Boom);
  shake(state, 12);
  state.screenFlash = 0.3;
  spawnParticles(state, p.x, p.y, p.cls.color, 30, 1.5);
  spawnShockwave(state, p.x, p.y, 120, p.cls.color);
  spawnText(state, p.x, p.y - 35, 'ULTIMATE!', p.cls.color);

  if (p.clsKey === 'pyromancer') {
    // Inferno: rain 5 meteors across the room
    for (let i = 0; i < 5; i++) {
      const mx = rand(60, ROOM_WIDTH - 60);
      const my = rand(60, ROOM_HEIGHT - 60);
      setTimeout(() => {
        state.aoeMarkers.push({
          x: mx, y: my, radius: 65, delay: 0.5, dmg: 5, color: '#ff2200',
          owner: p.idx, stun: 0, age: 0,
        });
        sfx(SfxName.Fire);
      }, i * 200);
    }
  } else if (p.clsKey === 'cryomancer') {
    // Absolute Zero: freeze ALL enemies for 3s + damage
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.stunTimer = (e.stunTimer || 0) + 3;
      damageEnemy(state, e, 3, p.idx);
    }
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(100,200,255,.3)');
  } else if (p.clsKey === 'stormcaller') {
    // Storm Fury: 8 random lightning bolts hitting enemies
    const alive = state.enemies.filter(e => e.alive);
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        const target = alive[Math.floor(Math.random() * alive.length)];
        if (target && target.alive) {
          state.beams.push({
            x: target.x + rand(-20, 20), y: -10,
            angle: Math.PI / 2, range: target.y + 20,
            width: 4, color: '#ffcc44', life: 0.2,
          });
          damageEnemy(state, target, 2, p.idx);
          sfx(SfxName.Zap);
          shake(state, 2);
        }
      }, i * 100);
    }
  } else if (p.clsKey === 'arcanist') {
    // Arcane Storm: spiral of 20 homing missiles
    for (let i = 0; i < 20; i++) {
      const sa = p.angle + (i / 20) * Math.PI * 4;
      setTimeout(() => {
        state.spells.push({
          type: SpellType.Homing, dmg: 2, speed: 250, radius: 6, life: 2.5,
          homing: 3, color: '#ff55aa', trail: '#dd3388',
          x: p.x + Math.cos(sa) * 20, y: p.y + Math.sin(sa) * 20,
          vx: Math.cos(sa) * 200, vy: Math.sin(sa) * 200,
          owner: p.idx, age: 0, zapTimer: 0, pierceLeft: 0,
          zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
        });
        sfx(SfxName.Arcane);
      }, i * 50);
    }
  } else if (p.clsKey === 'necromancer') {
    // Army of Dead: summon 6 friendly skeletons
    for (let i = 0; i < 6; i++) {
      const sa = p.angle + (i / 6) * Math.PI * 2;
      const sx = p.x + Math.cos(sa) * 50;
      const sy = p.y + Math.sin(sa) * 50;
      state.enemies.push(createFriendlyEnemy(sx, sy, p.idx));
      spawnParticles(state, sx, sy, '#55cc55', 8);
    }
  } else if (p.clsKey === 'chronomancer') {
    // Time Stop: freeze all enemies for 4s, player moves at 2x speed
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.stunTimer = (e.stunTimer || 0) + 4;
    }
    p.moveSpeed *= 2;
    p._timeStopTimer = 4;
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(255,200,60,.2)');
  } else if (p.clsKey === 'knight') {
    // Shield Wall: become invulnerable for 3s + reflect all damage
    p.iframes = 3;
    p._shieldWall = 3;
    spawnShockwave(state, p.x, p.y, 80, 'rgba(200,200,255,.4)');
  } else if (p.clsKey === 'berserker') {
    // Blood Rage: 2x damage, 2x speed, take 2x damage for 5s
    p._rage = 5;
    p._rageDmgMul = 2;
    spawnParticles(state, p.x, p.y, '#ff3333', 25, 1.2);
  } else if (p.clsKey === 'paladin') {
    // Holy Light: heal both players to full + damage all enemies for 3
    for (const pl of state.players) {
      if (pl.alive) {
        pl.hp = pl.maxHp;
        spawnParticles(state, pl.x, pl.y, '#ffffaa', 15);
        spawnText(state, pl.x, pl.y - 20, 'FULL HEAL', '#ffffaa');
      }
    }
    for (const e of state.enemies) {
      if (!e.alive) continue;
      damageEnemy(state, e, 3, p.idx);
    }
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(255,255,180,.3)');
  } else if (p.clsKey === 'ranger') {
    // Arrow Rain: barrage of 15 arrows across the room
    for (let i = 0; i < 15; i++) {
      const tx = rand(40, ROOM_WIDTH - 40);
      const ty = rand(40, ROOM_HEIGHT - 40);
      setTimeout(() => {
        state.spells.push({
          type: SpellType.Projectile, dmg: 2, speed: 500, radius: 5, life: 0.8,
          color: '#88cc44', trail: '#668833',
          x: tx, y: -20, vx: 0, vy: 500,
          owner: p.idx, age: 0, zapTimer: 0, pierceLeft: 1,
          homing: 0, zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
        });
        sfx(SfxName.Hit);
      }, i * 60);
    }
  }
}
