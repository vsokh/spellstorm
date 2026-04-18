import { GameState, dist, spawnParticles, spawnShockwave, spawnText } from '../state';

/**
 * Updates active tether connections each frame.
 * Priority 25: runs after updateSpells (20), before updateAoe (30).
 */
export function updateTethers(state: GameState, dt: number): void {
  for (const p of state.players) {
    if (!p.alive || p._tetherTarget < 0) continue;

    const target = state.enemies.at(p._tetherTarget);
    const spellIdx = p._tetherSpellIdx;
    if (spellIdx < 0) { breakTether(p); continue; }
    const def = p.cls.spells[spellIdx];
    if (!def) { breakTether(p); continue; }

    const tetherRange = def.tetherRange || 200;

    // Target dead — partial reward (50%)
    if (!target || !target.alive) {
      applyReward(state, p, def, 0.5);
      breakTether(p);
      continue;
    }

    // Distance check — break if out of range
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const tdist = Math.sqrt(dx * dx + dy * dy);
    if (tdist > tetherRange) {
      spawnText(state, p.x, p.y - 20, 'TETHER BROKE', '#ff6666');
      breakTether(p);
      continue;
    }

    // Tick damage/heal
    const tickRate = def.tetherTickRate || 0.3;
    p._tetherTickTimer += dt;
    while (p._tetherTickTimer >= tickRate) {
      p._tetherTickTimer -= tickRate;

      // Damage tick
      const dmg = def.tetherDmg || 0;
      if (dmg > 0 && target.alive) {
        target.hp -= dmg;
        p.hitCounter++;
        spawnParticles(state, target.x, target.y, def.color, 3, 0.15);
        if (target.hp <= 0) {
          target.alive = false;
          p.killCount++;
          applyReward(state, p, def, 0.5);
          breakTether(p);
          return; // Player's tether is done
        }
      }

      // Heal tick
      const heal = def.tetherHeal || 0;
      if (heal > 0) {
        p.hp = Math.min(p.maxHp, p.hp + heal);
        // Necromancer: splash half the heal to owned skeletons within 200 units.
        if (p.clsKey === 'necromancer') {
          const skelHeal = heal * 0.5;
          for (const ally of state.enemies) {
            if (!ally.alive || !ally._friendly || ally._owner !== p.idx) continue;
            if (ally.type !== '_skeleton') continue;
            if (dist(p.x, p.y, ally.x, ally.y) > 200) continue;
            if (ally.hp >= ally.maxHp) continue;
            ally.hp = Math.min(ally.maxHp, ally.hp + skelHeal);
            spawnParticles(state, ally.x, ally.y, '#77ffaa', 2, 0.3);
          }
        }
      }

      // Vampirism interaction: tether healing boosted by 25% of vampirism
      if (p.vampirism > 0 && heal > 0) {
        p.hp = Math.min(p.maxHp, p.hp + heal * 0.25);
      }
    }

    // Decrement tether timer
    p._tetherTimer -= dt;
    if (p._tetherTimer <= 0) {
      // Full duration completed — apply full reward
      applyReward(state, p, def, 1.0);
      breakTether(p);
    }
  }
}

function breakTether(p: { _tetherTarget: number; _tetherTimer: number; _tetherSpellIdx: number; _tetherTickTimer: number }): void {
  p._tetherTarget = -1;
  p._tetherTimer = 0;
  p._tetherSpellIdx = -1;
  p._tetherTickTimer = 0;
}

function applyReward(
  state: GameState,
  p: { x: number; y: number; hp: number; maxHp: number; cls: { color: string } },
  def: { tetherReward?: { stun?: number; dmgBurst?: number; healBurst?: number }; color: string; tetherRange?: number },
  scale: number,
): void {
  const reward = def.tetherReward;
  if (!reward) return;

  if (reward.healBurst) {
    const heal = reward.healBurst * scale;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    spawnText(state, p.x, p.y - 20, `+${Math.round(heal)} HP`, '#44ff44');
  }

  if (reward.dmgBurst && scale > 0) {
    // Burst damage to enemies in tether range
    const burstR = def.tetherRange || 200;
    for (const e of state.enemies) {
      if (!e.alive || e._friendly) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy < burstR * burstR) {
        e.hp -= reward.dmgBurst * scale;
        spawnParticles(state, e.x, e.y, def.color, 5);
        if (e.hp <= 0) e.alive = false;
      }
    }
  }

  if (reward.stun && scale > 0) {
    // Stun enemies in tether range
    const stunR = def.tetherRange || 200;
    for (const e of state.enemies) {
      if (!e.alive || e._friendly) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy < stunR * stunR) {
        e.stunTimer = Math.max(e.stunTimer || 0, reward.stun * scale);
      }
    }
  }

  // Visual feedback for reward
  if (scale >= 1.0) {
    spawnParticles(state, p.x, p.y, def.color, 20, 0.3);
    spawnShockwave(state, p.x, p.y, 60, def.color);
    spawnText(state, p.x, p.y - 35, 'TETHER COMPLETE!', def.color);
  }
}
