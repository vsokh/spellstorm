import { GameState, dist, rand, wrapAngle, spawnParticles, spawnShockwave, spawnText, shake } from '../state';
import { ENEMIES, ROOM_WIDTH, ROOM_HEIGHT } from '../constants';
import { SfxName } from '../types';
import { sfx } from '../audio';
import { damageEnemy } from './combat';

// ═══════════════════════════════════
//       SPELL UPDATE
// ═══════════════════════════════════

export function updateSpells(state: GameState, dt: number): void {
  for (let i = state.spells.length - 1; i >= 0; i--) {
    const s = state.spells[i];

    // Homing
    if (s.homing) {
      let nt = null;
      let nd = Infinity;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = dist(s.x, s.y, e.x, e.y);
        if (d < nd) { nd = d; nt = e; }
      }
      if (nt && nd < 280) {
        const da = Math.atan2(nt.y - s.y, nt.x - s.x);
        const ca = Math.atan2(s.vy, s.vx);
        let df = wrapAngle(da - ca);
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

    // Trail particles
    if (s.trail && Math.random() > 0.3) {
      state.trails.push({ x: s.x + rand(-3, 3), y: s.y + rand(-3, 3), life: 1, r: s.radius * 0.5, color: s.trail });
    }

    // Zap aura (Ball Zap)
    if (s.zap) {
      s.zapTimer -= dt;
      if (s.zapTimer <= 0) {
        s.zapTimer = s.zapRate;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (dist(s.x, s.y, e.x, e.y) < s.zap) {
            state.beams.push({
              x: s.x, y: s.y,
              angle: Math.atan2(e.y - s.y, e.x - s.x),
              range: dist(s.x, s.y, e.x, e.y),
              width: 2, color: '#bb88ff', life: 0.1,
            });
            damageEnemy(state, e, s.dmg, s.owner);
            break;
          }
        }
      }
    }

    // Collision with pillars
    let hitP = false;
    for (const pl of state.pillars) {
      if (dist(s.x, s.y, pl.x, pl.y) < pl.radius + s.radius) {
        hitP = true;
        break;
      }
    }

    // Collision with enemies
    let hitE = false;
    for (const e of state.enemies) {
      if (!e.alive || e.iframes > 0) continue;
      if (dist(s.x, s.y, e.x, e.y) < ENEMIES[e.type].size + s.radius) {
        damageEnemy(state, e, s.dmg, s.owner);
        if (s.slow) e.slowTimer = (e.slowTimer || 0) + s.slow;
        if (s.drain) {
          const p = state.players[s.owner];
          if (p) {
            p.hp = Math.min(p.maxHp, p.hp + s.drain);
            spawnText(state, p.x, p.y - 20, `+${s.drain}`, '#44ff88');
          }
        }
        if (s.pierceLeft > 0) { s.pierceLeft--; continue; }
        hitE = true;
        break;
      }
    }

    if (hitP || hitE || s.age > s.life || s.x < -30 || s.x > ROOM_WIDTH + 30 || s.y < -30 || s.y > ROOM_HEIGHT + 30) {
      if ((hitP || hitE) && s.explode) {
        spawnParticles(state, s.x, s.y, s.color, 15, 0.8);
        spawnShockwave(state, s.x, s.y, s.explode, s.color);
        sfx(SfxName.Boom);
        shake(state, 3);
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (dist(s.x, s.y, e.x, e.y) < s.explode) {
            damageEnemy(state, e, 1, s.owner);
          }
        }
      } else if (hitP || hitE) {
        spawnParticles(state, s.x, s.y, s.color, 4, 0.3);
      }
      state.spells.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════
//       AOE MARKER UPDATE
// ═══════════════════════════════════

export function updateAoe(state: GameState, dt: number): void {
  for (let i = state.aoeMarkers.length - 1; i >= 0; i--) {
    const m = state.aoeMarkers[i];
    m.age += dt;
    if (m.age >= m.delay) {
      spawnParticles(state, m.x, m.y, m.color, 25, 1);
      spawnShockwave(state, m.x, m.y, m.radius, m.color);
      sfx(SfxName.Boom);
      shake(state, 6);
      state.screenFlash = 0.1;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (dist(m.x, m.y, e.x, e.y) < m.radius + ENEMIES[e.type].size) {
          damageEnemy(state, e, m.dmg, m.owner);
          if (m.stun) e.stunTimer = (e.stunTimer || 0) + m.stun;
        }
      }
      state.aoeMarkers.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════
//       ZONE UPDATE
// ═══════════════════════════════════

export function updateZones(state: GameState, dt: number): void {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const z = state.zones[i];
    z.age += dt;
    z.tickTimer -= dt;
    if (z.tickTimer <= 0) {
      z.tickTimer = z.tickRate;
      let zHealed = 0;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (dist(z.x, z.y, e.x, e.y) < z.radius + ENEMIES[e.type].size) {
          damageEnemy(state, e, z.dmg, z.owner);
          if (z.slow) e.slowTimer = (e.slowTimer || 0) + z.slow;
          if (z.drain) zHealed += z.drain;
        }
      }
      if (zHealed > 0) {
        const p = state.players[z.owner];
        if (p) {
          p.hp = Math.min(p.maxHp, p.hp + zHealed);
          spawnText(state, p.x, p.y - 20, `+${zHealed}`, '#44ff88');
        }
      }
    }
    if (z.age >= z.duration) state.zones.splice(i, 1);
  }
}
