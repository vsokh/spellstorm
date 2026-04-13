import { GameState, dist, clamp, rand, spawnParticles, spawnShockwave, shake } from '../state';
import { EnemyAI, SfxName, PickupType } from '../types';
import { ENEMIES, ROOM_WIDTH, ROOM_HEIGHT, WIZARD_SIZE, WALL_THICKNESS } from '../constants';
import { sfx } from '../audio';
import { damageEnemy, damagePlayer } from './combat';

// ═══════════════════════════════════
//       ENEMY AI
// ═══════════════════════════════════

export function updateEnemies(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;

    // Tick animation timers
    if (e._hitFlash > 0) e._hitFlash -= dt;
    if (e._atkAnim > 0) e._atkAnim -= dt;

    // Death animation timer
    if (e._deathTimer >= 0) {
      e._deathTimer -= dt;
      if (e._deathTimer <= 0) {
        e.alive = false;  // Actually remove after animation completes
      }
      continue;  // Skip all AI/movement while dying
    }

    // Friendly summons (necro ult)
    if (e._friendly) {
      e._lifespan -= dt;
      if (e._lifespan <= 0) {
        e.alive = false;
        spawnParticles(state, e.x, e.y, '#55cc55', 6);
        continue;
      }
      // Chase nearest non-friendly enemy
      let nt = null;
      let nd = Infinity;
      for (const e2 of state.enemies) {
        if (!e2.alive || e2._friendly || e2 === e) continue;
        const d = dist(e.x, e.y, e2.x, e2.y);
        if (d < nd) { nd = d; nt = e2; }
      }
      if (nt) {
        const dx = nt.x - e.x;
        const dy = nt.y - e.y;
        const dd = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        e.x += (dx / dd) * 80 * dt;
        e.y += (dy / dd) * 80 * dt;
        e.atkTimer -= dt;
        if (e.atkTimer <= 0 && dd < 25) {
          e.atkTimer = 0.8;
          damageEnemy(state, nt, 2, e._owner);
        }
      }
      continue;
    }

    const et = ENEMIES[e.type];
    if (e.iframes > 0) e.iframes -= dt;
    if (e.slowTimer > 0) e.slowTimer -= dt;
    if (e.stunTimer > 0) { e.stunTimer -= dt; continue; }

    // Burn DOT
    if (e._burnTimer > 0) {
      e._burnTimer -= dt;
      e._burnTick = (e._burnTick || 0) - dt;
      if (e._burnTick <= 0) {
        e._burnTick = 0.5;
        damageEnemy(state, e, 1, e._burnOwner || 0);
      }
    }

    const slow = e.slowTimer > 0 ? 0.4 : 1;
    const spdMul = e._spdMul || 1;

    // Target selection
    let target = state.players[e.target];
    if (!target || !target.alive) {
      target = state.players.find(p => p.alive) || state.players[0];
      if (!target) continue;
      e.target = target.idx;
    }

    // Occasional retarget to closer player
    if (Math.random() < dt * 0.5) {
      const other = state.players[1 - e.target];
      if (other && other.alive && dist(e.x, e.y, other.x, other.y) < dist(e.x, e.y, target.x, target.y) * 0.7) {
        e.target = other.idx;
        target = other;
      }
    }

    // Teleport behavior
    if (et.teleport) {
      e._teleportTimer = (e._teleportTimer || 0) - dt;
      if (e._teleportTimer <= 0) {
        e._teleportTimer = 3 + Math.random() * 2; // 3-5 second cooldown
        // Teleport to random position near target
        const angle = Math.random() * Math.PI * 2;
        const teleportDist = 60 + Math.random() * 40; // 60-100 units from target
        e.x = clamp(target.x + Math.cos(angle) * teleportDist, et.size, ROOM_WIDTH - et.size);
        e.y = clamp(target.y + Math.sin(angle) * teleportDist, et.size, ROOM_HEIGHT - et.size);
        e.vx = 0;
        e.vy = 0;
        spawnParticles(state, e.x, e.y, '#aa33cc', 10, 0.4);
      }
    }

    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    // Movement AI
    const enrageMul = et.enrage ? 1 + (1 - e.hp / e.maxHp) * 1.5 : 1;
    const spd = et.speed * spdMul * slow * enrageMul;
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

    // Pillar collision (unless phasing)
    if (!et.phase) {
      for (const pl of state.pillars) {
        const pd = dist(e.x, e.y, pl.x, pl.y);
        if (pd < pl.radius + et.size) {
          const nx = (e.x - pl.x) / pd;
          const ny = (e.y - pl.y) / pd;
          e.x = pl.x + nx * (pl.radius + et.size + 1);
          e.y = pl.y + ny * (pl.radius + et.size + 1);
        }
      }
    }

    // Attack
    e.atkTimer -= dt;
    if (e.atkTimer <= 0 && d < et.atkR) {
      e.atkTimer = et.atkCd;
      e._atkAnim = 0.2;
      if (et.ai === EnemyAI.Chase) {
        if (target.iframes <= 0) damagePlayer(state, target, Math.ceil(et.dmg * (e._dmgMul || 1)), e);
      } else if (et.projSpd) {
        const a = Math.atan2(dy, dx);
        state.eProj.push({
          x: e.x, y: e.y,
          vx: Math.cos(a) * et.projSpd,
          vy: Math.sin(a) * et.projSpd,
          dmg: Math.ceil(et.dmg * (e._dmgMul || 1)), life: 2, radius: 5,
          color: et.projCol || '#cc8866',
        });
      }
    }

    // Trap check (ranger)
    for (const pk of state.pickups) {
      if (pk.collected || pk.type !== PickupType.Trap) continue;
      if (dist(e.x, e.y, pk.x, pk.y) < pk._radius) {
        pk.collected = true;
        damageEnemy(state, e, pk._dmg, pk._owner);
        if (pk._slow) e.slowTimer = (e.slowTimer || 0) + pk._slow;
        spawnParticles(state, pk.x, pk.y, pk._color, 15);
        spawnShockwave(state, pk.x, pk.y, pk._radius, pk._color);
        sfx(SfxName.Boom);
        shake(state, 3);
        break;
      }
    }
  }
}

// ═══════════════════════════════════
//       ENEMY PROJECTILE UPDATE
// ═══════════════════════════════════

export function updateEProj(state: GameState, dt: number): void {
  for (let i = state.eProj.length - 1; i >= 0; i--) {
    const p = state.eProj[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    // Wall bounce (enemy projectiles get 1 bounce)
    const wL = WALL_THICKNESS;
    const wR = ROOM_WIDTH - WALL_THICKNESS;
    const wT = WALL_THICKNESS;
    const wB = ROOM_HEIGHT - WALL_THICKNESS;
    if (!p._bounces) p._bounces = 0;
    if (p._bounces < 1) {
      if (p.x < wL)  { p.x = wL + (wL - p.x);  p.vx = Math.abs(p.vx);  p._bounces++; }
      if (p.x > wR)  { p.x = wR - (p.x - wR);  p.vx = -Math.abs(p.vx); p._bounces++; }
      if (p.y < wT)  { p.y = wT + (wT - p.y);  p.vy = Math.abs(p.vy);  p._bounces++; }
      if (p.y > wB)  { p.y = wB - (p.y - wB);  p.vy = -Math.abs(p.vy); p._bounces++; }
    }

    if (Math.random() > 0.5) {
      state.trails.push({ x: p.x, y: p.y, life: 0.5, r: 2, color: p.color });
    }

    let hit = false;
    for (const pl of state.players) {
      if (!pl.alive || pl.iframes > 0) continue;
      if (dist(p.x, p.y, pl.x, pl.y) < WIZARD_SIZE + p.radius) {
        damagePlayer(state, pl, p.dmg);
        hit = true;
        break;
      }
    }
    for (const pl2 of state.pillars) {
      if (dist(p.x, p.y, pl2.x, pl2.y) < pl2.radius + p.radius) {
        hit = true;
        break;
      }
    }

    if (hit || p.life <= 0 || p.x < -20 || p.x > ROOM_WIDTH + 20 || p.y < -20 || p.y > ROOM_HEIGHT + 20) {
      if (hit) spawnParticles(state, p.x, p.y, p.color, 3, 0.3);
      state.eProj.splice(i, 1);
    }
  }
}
