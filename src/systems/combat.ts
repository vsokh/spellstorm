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
  XP_GEM_COUNT,
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
    const hitChargeGain = Math.round(5 * (p.ultChargeRate || 1));
    const chargeCap = p.ultOverflow ? 200 : 100;
    p.ultCharge = Math.min(chargeCap, (p.ultCharge || 0) + hitChargeGain);
    if (p.ultCharge >= (p.ultOverflow ? 200 : 100)) p.ultReady = true;
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
      // Boss: single large gem worth 3x
      state.pickups.push({
        x: e.x, y: e.y, type: PickupType.Xp, collected: false,
        value: et.xp * 3, _owner: 0, _dmg: 0, _radius: 0, _slow: 0, _color: '',
      });
    } else {
      const gemCount = 3 + Math.floor(Math.random() * 4); // 3-6 gems
      const xpPerGem = Math.max(1, Math.ceil(et.xp / gemCount * XP_GEM_COUNT));
      for (let i = 0; i < gemCount; i++) {
        state.pickups.push({
          x: e.x + rand(-15, 15), y: e.y + rand(-15, 15),
          type: PickupType.Xp, collected: false,
          value: xpPerGem, _owner: 0, _dmg: 0, _radius: 0, _slow: 0, _color: '',
        });
      }
    }

    // ── Spawn gold as physical pickups ──
    const goldDrop = et.gold * (p ? p.goldMul : 1);
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
      // Ultimate charge on kill
      const killChargeGain = Math.round(15 * (p.ultChargeRate || 1));
      const killChargeCap = p.ultOverflow ? 200 : 100;
      p.ultCharge = Math.min(killChargeCap, (p.ultCharge || 0) + killChargeGain);
      if (p.ultCharge >= (p.ultOverflow ? 200 : 100)) p.ultReady = true;

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

    // Scale particles with combo
    const particleCount = 18 + Math.min(state.comboCount, 30);
    spawnParticles(state, e.x, e.y, et.color, particleCount, 1);
    // Scale shockwave radius with combo
    const shockR = 25 + Math.min(state.comboCount * 0.5, 20);
    spawnShockwave(state, e.x, e.y, shockR);
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
      owner: p.idx, age: 0, zapTimer: 0, pierceLeft: (p.pierce || 0) + (def.pierce || 0),
      clsKey: p.clsKey,
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
    const refund = Math.floor(def.mana * 0.3);
    p.mana += refund;
    p.hp -= 1;
    if (p.hp <= 0) p.hp = 1; // don't let Dark Pact kill you
  }
  p.cd[idx] = def.cd;

  // ultEcho: double LMB damage for N casts after ultimate
  let echoDmgMul = 1;
  if (idx === 0 && p.ultEchoLeft > 0) {
    echoDmgMul = 2;
    p.ultEchoLeft--;
    spawnText(state, p.x, p.y - 15, 'ECHO!', '#ffaa44');
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
    spell.dmg = Math.round(spell.dmg * echoDmgMul);
    state.spells.push(spell);
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
          damageEnemy(state, e, Math.round(def.dmg * echoDmgMul), p.idx);
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
        damageEnemy(state, e, Math.round(def.dmg * echoDmgMul), p.idx);
        if (def.slow) e.slowTimer = (e.slowTimer || 0) + def.slow;
        if (def.stun) e.stunTimer = (e.stunTimer || 0) + def.stun;
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
          owner: p.idx, age: 0, pierceLeft: (p.pierce || 0) + (def.pierce || 0), zapTimer: 0,
          clsKey: p.clsKey,
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
      const wolf = createFriendlyEnemy(p.x + cos * 40, p.y + sin * 40, p.idx);
      wolf.type = '_wolf';
      wolf.hp = 8;
      wolf.maxHp = 8;
      wolf._lifespan = 15;
      state.enemies.push(wolf);
      spawnParticles(state, wolf.x, wolf.y, '#88aa66', 10);
      sfx(SfxName.Pickup);
    } else if (p.clsKey === 'warlock') {
      // Summon Imp: small ranged demon ally
      const imp = createFriendlyEnemy(p.x + cos * 40, p.y + sin * 40, p.idx);
      imp.type = '_imp';
      imp.hp = 5;
      imp.maxHp = 5;
      imp._lifespan = 12;
      state.enemies.push(imp);
      spawnParticles(state, imp.x, imp.y, '#cc4466', 10);
      sfx(SfxName.Arcane);
    }
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

  // ultHeal: heal 50% max HP on cast
  if (p.ultHeal) {
    p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.5));
    spawnText(state, p.x, p.y - 25, '+50% HP', '#88ff88');
  }

  const pw = p.ultPower || 1;

  if (p.clsKey === 'pyromancer') {
    // Inferno: rain 5 meteors across the room
    for (let i = 0; i < 5; i++) {
      const mx = rand(60, ROOM_WIDTH - 60);
      const my = rand(60, ROOM_HEIGHT - 60);
      setTimeout(() => {
        state.aoeMarkers.push({
          x: mx, y: my, radius: 65, delay: 0.5, dmg: Math.round(5 * pw), color: '#ff2200',
          owner: p.idx, stun: 0, age: 0,
        });
        sfx(SfxName.Fire);
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
    const alive = state.enemies.filter(e => e.alive);
    if (alive.length > 0) {
      // Find nearest enemy to start the chain
      let current: Enemy | null = null;
      let minD = Infinity;
      for (const e of alive) {
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < minD) { minD = d; current = e; }
      }
      const chainTargets: Enemy[] = [];
      const hitSet = new Set<Enemy>();
      if (current) {
        chainTargets.push(current);
        hitSet.add(current);
      }
      // Chain to 7 more targets
      for (let i = 0; i < 7 && current; i++) {
        let next: Enemy | null = null;
        let nextD = Infinity;
        // Try to find an un-hit enemy within 200px
        for (const e of alive) {
          if (!e.alive) continue;
          if (hitSet.has(e)) continue;
          const d = dist(current.x, current.y, e.x, e.y);
          if (d < 200 && d < nextD) { nextD = d; next = e; }
        }
        // If no un-hit enemies, wrap around to already-hit ones
        if (!next) {
          for (const e of alive) {
            if (!e.alive || e === current) continue;
            const d = dist(current.x, current.y, e.x, e.y);
            if (d < 200 && d < nextD) { nextD = d; next = e; }
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
      const chainDmg = Math.round(3 * pw);
      // Draw beam from player to first target
      if (chainTargets.length > 0) {
        const first = chainTargets[0];
        state.beams.push({
          x: p.x, y: p.y,
          angle: Math.atan2(first.y - p.y, first.x - p.x),
          range: dist(p.x, p.y, first.x, first.y),
          width: 4, color: '#ffcc44', life: 0.3,
        });
      }
      for (let i = 0; i < chainTargets.length; i++) {
        const target = chainTargets[i];
        ((idx: number, t: Enemy) => {
          setTimeout(() => {
            if (t.alive) {
              damageEnemy(state, t, chainDmg, p.idx);
              spawnParticles(state, t.x, t.y, '#ffcc44', 6, 0.4);
              sfx(SfxName.Zap);
              shake(state, 2);
            }
            // Draw beam to next target
            if (idx < chainTargets.length - 1) {
              const next = chainTargets[idx + 1];
              state.beams.push({
                x: t.x, y: t.y,
                angle: Math.atan2(next.y - t.y, next.x - t.x),
                range: dist(t.x, t.y, next.x, next.y),
                width: 4, color: '#ffcc44', life: 0.3,
              });
            }
          }, idx * 80);
        })(i, target);
      }
    }
  } else if (p.clsKey === 'arcanist') {
    // Arcane Storm: spiral of 20 homing missiles
    for (let i = 0; i < 20; i++) {
      const sa = p.angle + (i / 20) * Math.PI * 4;
      setTimeout(() => {
        state.spells.push({
          type: SpellType.Homing, dmg: Math.round(2 * pw), speed: 250, radius: 6, life: 2.5,
          homing: 3, color: '#ff55aa', trail: '#dd3388',
          x: p.x + Math.cos(sa) * 20, y: p.y + Math.sin(sa) * 20,
          vx: Math.cos(sa) * 200, vy: Math.sin(sa) * 200,
          owner: p.idx, age: 0, zapTimer: 0, pierceLeft: 0,
          zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
          stun: 0, clsKey: p.clsKey,
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
    const freezeDur = 4 * pw;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.stunTimer = (e.stunTimer || 0) + freezeDur;
    }
    p.moveSpeed *= 2;
    p._timeStopTimer = freezeDur;
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(255,200,60,.2)');
  } else if (p.clsKey === 'knight') {
    // Shield Wall: become invulnerable for 3s + reflect all damage
    const shieldDur = 3 * pw;
    p.iframes = shieldDur;
    p._shieldWall = shieldDur;
    spawnShockwave(state, p.x, p.y, 80, 'rgba(200,200,255,.4)');
  } else if (p.clsKey === 'berserker') {
    // Blood Rage: 2x damage, 2x speed, take 2x damage for 5s
    const rageDur = 5 * pw;
    p._rage = rageDur;
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
      damageEnemy(state, e, Math.round(3 * pw), p.idx);
    }
    spawnShockwave(state, p.x, p.y, ROOM_WIDTH, 'rgba(255,255,180,.3)');
  } else if (p.clsKey === 'ranger') {
    // Volley: fire 20 arrows in a spread cone in the aimed direction
    const cos0 = Math.cos(angle);
    const sin0 = Math.sin(angle);
    const spreadHalf = 0.4;
    for (let i = 0; i < 20; i++) {
      const aOff = -spreadHalf + (spreadHalf * 2) * (i / 19) + rand(-0.05, 0.05);
      const sa = angle + aOff;
      const aCos = Math.cos(sa);
      const aSin = Math.sin(sa);
      setTimeout(() => {
        state.spells.push({
          type: SpellType.Projectile, dmg: Math.round(2 * pw), speed: 400, radius: 5, life: 1.0,
          color: '#88cc44', trail: '#668833',
          x: p.x + cos0 * WIZARD_SIZE, y: p.y + sin0 * WIZARD_SIZE,
          vx: aCos * 400, vy: aSin * 400,
          owner: p.idx, age: 0, zapTimer: 0, pierceLeft: 2,
          homing: 0, zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
          stun: 0, clsKey: p.clsKey,
        });
        sfx(SfxName.Hit);
      }, i * 30);
    }
  } else if (p.clsKey === 'druid') {
    // Nature's Wrath: summon ring of 8 thorn zones + 2 treant allies
    for (let i = 0; i < 8; i++) {
      const za = (i / 8) * Math.PI * 2;
      const zDist = rand(100, 120);
      const zx = p.x + Math.cos(za) * zDist;
      const zy = p.y + Math.sin(za) * zDist;
      state.zones.push({
        x: zx, y: zy, radius: 40, duration: 6,
        dmg: Math.round(2 * pw), color: '#66aa44', owner: p.idx,
        slow: 0.5, tickRate: 0.5, tickTimer: 0, age: 0,
        drain: 0, heal: 0,
      });
      spawnParticles(state, zx, zy, '#88aa66', 6, 0.5);
    }
    // Summon 2 treant allies
    for (let i = 0; i < 2; i++) {
      const ta = angle + (i === 0 ? -0.5 : 0.5);
      const tx = p.x + Math.cos(ta) * 50;
      const ty = p.y + Math.sin(ta) * 50;
      const treant = createFriendlyEnemy(tx, ty, p.idx);
      treant.hp = 12;
      treant.maxHp = 12;
      treant._lifespan = 15;
      state.enemies.push(treant);
      spawnParticles(state, tx, ty, '#88aa66', 10);
    }
    spawnShockwave(state, p.x, p.y, 130, 'rgba(80,180,60,.3)');
  } else if (p.clsKey === 'warlock') {
    // Doom: marks all enemies, after 3s they take 50% of their max HP as damage
    const marked = state.enemies.filter(e => e.alive && !e._friendly);
    for (const e of marked) {
      spawnText(state, e.x, e.y - 15, 'DOOMED', '#662288');
    }
    const pIdx = p.idx;
    setTimeout(() => {
      for (const e of marked) {
        if (!e.alive) continue;
        const doomDmg = Math.max(1, Math.ceil(e.maxHp * 0.5 * pw));
        damageEnemy(state, e, doomDmg, pIdx);
        spawnParticles(state, e.x, e.y, '#662288', 10);
      }
      sfx(SfxName.Boom);
      shake(state, 6);
    }, 3000);
  } else if (p.clsKey === 'monk') {
    // Thousand Fists: 20 rapid melee hits in a cone with knockback
    p.iframes = 0.8;
    const monkDmg = Math.round(1 * pw);
    for (let i = 0; i < 20; i++) {
      setTimeout(() => {
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const d = dist(p.x, p.y, e.x, e.y);
          if (d > 60) continue;
          const a2 = Math.atan2(e.y - p.y, e.x - p.x);
          const diff = Math.abs(((a2 - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff <= 0.8) {
            damageEnemy(state, e, monkDmg, p.idx);
            // Knockback: push enemy away from player
            if (d > 0) {
              const nx = (e.x - p.x) / d;
              const ny = (e.y - p.y) / d;
              e.vx = nx * 30;
              e.vy = ny * 30;
            }
          }
        }
        spawnParticles(state, p.x + Math.cos(angle) * 30, p.y + Math.sin(angle) * 30, '#eedd88', 2, 0.3);
        sfx(SfxName.Hit);
      }, i * 40);
    }
  } else if (p.clsKey === 'engineer') {
    // Mega Turret: huge turret (30 HP, 3 dmg/shot, 20s)
    const turret = createFriendlyEnemy(p.x + Math.cos(angle) * 40, p.y + Math.sin(angle) * 40, p.idx);
    turret.type = '_ally';
    turret.hp = 30;
    turret.maxHp = 30;
    turret._lifespan = 20;
    state.enemies.push(turret);
    spawnParticles(state, turret.x, turret.y, '#dd8833', 15);
    // Also create a high-damage zone around the turret
    state.zones.push({
      x: turret.x, y: turret.y, radius: 130, duration: 20,
      dmg: Math.round(3 * pw), color: '#dd8833', owner: p.idx,
      slow: 0, tickRate: 0.7, tickTimer: 0, age: 0,
      drain: 0, heal: 0,
    });
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
