import { GameState, dist, rand, wrapAngle, spawnParticles, spawnShockwave, spawnText, shake, flashScreen, netSfx } from '../state';
import { ENEMIES, ROOM_WIDTH, ROOM_HEIGHT, WALL_THICKNESS, WAVE_PHYSICS, TIMING, RANGES } from '../constants';
import { SfxName, EnemyView } from '../types';
import { damageEnemy } from './combat';

// Upper bound on enemy collision radius for broad-phase query padding.
// The largest enemy (archlord) has size 28; 30 provides a safe margin.
const MAX_ENEMY_SIZE = 30;

// ═══════════════════════════════════
//       SPELL UPDATE
// ═══════════════════════════════════

export function updateSpells(state: GameState, dt: number): void {
  for (let i = state.spells.length - 1; i >= 0; i--) {
    const s = state.spells.at(i);

    // Homing
    if (s.homing) {
      let nt = null;
      let nd = Infinity;
      const homingCandidates = state.enemyGrid.queryArea(s.x, s.y, 280);
      for (const idx of homingCandidates) {
        const e = state.enemies.at(idx);
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

    // Boomerang: reverse projectile at half lifetime
    if (!s._reversed && state.players[s.owner]?.boomerang && s.age > s.life * WAVE_PHYSICS.BOOMERANG_RETURN) {
      s.vx = -s.vx;
      s.vy = -s.vy;
      s._reversed = true;
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.age += dt;

    // Wall bounce
    const wL = WALL_THICKNESS;
    const wR = ROOM_WIDTH - WALL_THICKNESS;
    const wT = WALL_THICKNESS;
    const wB = ROOM_HEIGHT - WALL_THICKNESS;
    const maxBounces = WAVE_PHYSICS.MAX_BOUNCES + (state.players[s.owner]?.ricochet || 0);
    if (s._bounces < maxBounces) {
      if (s.x < wL)  { s.x = wL + (wL - s.x);  s.vx = Math.abs(s.vx);  s._bounces++; }
      if (s.x > wR)  { s.x = wR - (s.x - wR);  s.vx = -Math.abs(s.vx); s._bounces++; }
      if (s.y < wT)  { s.y = wT + (wT - s.y);  s.vy = Math.abs(s.vy);  s._bounces++; }
      if (s.y > wB)  { s.y = wB - (s.y - wB);  s.vy = -Math.abs(s.vy); s._bounces++; }
    }

    // Gravity Well: pull nearby enemies toward projectile path
    if (state.players[s.owner]?.gravityWell) {
      const gwCandidates = state.enemyGrid.queryArea(s.x, s.y, 60);
      for (const idx of gwCandidates) {
        const e = state.enemies.at(idx);
        if (!e.alive) continue;
        const d = dist(s.x, s.y, e.x, e.y);
        if (d < 60 && d > 5) {
          const pullAngle = Math.atan2(s.y - e.y, s.x - e.x);
          e.x += Math.cos(pullAngle) * 40 * dt;
          e.y += Math.sin(pullAngle) * 40 * dt;
        }
      }
    }

    // Trail particles
    if (s.trail && Math.random() > WAVE_PHYSICS.TRAIL_CHANCE) {
      const tr = state.trails.acquire();
      if (tr) {
        tr.x = s.x + rand(-3, 3); tr.y = s.y + rand(-3, 3);
        tr.life = 1; tr.r = s.radius * WAVE_PHYSICS.TRAIL_PARTICLE_SCALE; tr.color = s.trail;
      }
    }

    // Zap aura (Ball Zap)
    if (s.zap) {
      s.zapTimer -= dt;
      if (s.zapTimer <= 0) {
        s.zapTimer = s.zapRate;
        let firstTarget: EnemyView | null = null;
        const zapCandidates = state.enemyGrid.queryArea(s.x, s.y, s.zap);
        for (const idx of zapCandidates) {
          const e = state.enemies.at(idx);
          if (!e.alive) continue;
          if (dist(s.x, s.y, e.x, e.y) < s.zap) {
            const beam = state.beams.acquire();
            if (beam) {
              beam.x = s.x; beam.y = s.y;
              beam.angle = Math.atan2(e.y - s.y, e.x - s.x);
              beam.range = dist(s.x, s.y, e.x, e.y);
              beam.width = 2; beam.color = '#bb88ff'; beam.life = 0.1;
            }
            damageEnemy(state, e, s.dmg, s.owner);
            firstTarget = e;
            break;
          }
        }
        // Chain lightning: bounce to additional enemies
        const chainCount = state.players[s.owner]?.chainLightning ?? 0;
        if (firstTarget && chainCount > 0) {
          const zapped = new Set([firstTarget]);
          let prev = firstTarget;
          const chainRange = WAVE_PHYSICS.CHAIN_RANGE;
          for (let i = 0; i < chainCount; i++) {
            let nearest: EnemyView | null = null;
            let nearestDist = Infinity;
            const chainCandidates = state.enemyGrid.queryArea(prev.x, prev.y, chainRange);
            for (const idx of chainCandidates) {
              const e = state.enemies.at(idx);
              if (!e.alive || zapped.has(e)) continue;
              const d = dist(prev.x, prev.y, e.x, e.y);
              if (d < chainRange && d < nearestDist) {
                nearest = e;
                nearestDist = d;
              }
            }
            if (!nearest) break;
            const chainBeam = state.beams.acquire();
            if (chainBeam) {
              chainBeam.x = prev.x; chainBeam.y = prev.y;
              chainBeam.angle = Math.atan2(nearest.y - prev.y, nearest.x - prev.x);
              chainBeam.range = nearestDist;
              chainBeam.width = 2; chainBeam.color = '#bb88ff'; chainBeam.life = 0.1;
            }
            damageEnemy(state, nearest, s.dmg, s.owner);
            zapped.add(nearest);
            prev = nearest;
          }
        }
      }
    }

    // Collision with pillars
    let hitP = false;
    if (!state.players[s.owner]?.spectral) {
      for (const pl of state.pillars) {
        if (dist(s.x, s.y, pl.x, pl.y) < pl.radius + s.radius) {
          hitP = true;
          break;
        }
      }
    }

    // Collision with enemies
    let hitE = false;
    const collCandidates = state.enemyGrid.queryArea(s.x, s.y, MAX_ENEMY_SIZE + s.radius);
    for (const idx of collCandidates) {
      const e = state.enemies.at(idx);
      if (!e.alive || e.iframes > 0) continue;
      if (dist(s.x, s.y, e.x, e.y) < ENEMIES[e.type].size + s.radius) {
        damageEnemy(state, e, s.dmg, s.owner);
        if (s.slow) e.slowTimer = (e.slowTimer || 0) + s.slow;
        if (s.stun) e.stunTimer = (e.stunTimer || 0) + s.stun;
        if (state.players[s.owner]?.frozenTouch && Math.random() < WAVE_PHYSICS.FROZEN_TOUCH_CHANCE) {
          e.stunTimer = (e.stunTimer || 0) + 1;
          spawnText(state, e.x, e.y - 15, 'FREEZE', '#88ddff');
        }
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
        spawnParticles(state, s.x, s.y, s.color, 15, TIMING.PARTICLE_LIFE_LONG);
        spawnShockwave(state, s.x, s.y, s.explode, s.color);
        netSfx(state, SfxName.Boom);
        shake(state, 3);

        // Element-specific impact effects based on spell color
        const c = s.color;
        if (c.includes('ff66') || c.includes('ff44') || c.includes('ff22')) {
          // Fire: upward-drifting embers + second orange shockwave
          for (let ei = 0; ei < 5; ei++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 30 + Math.random() * 60;
            const fp = state.particles.acquire();
            if (fp) {
              fp.x = s.x; fp.y = s.y;
              fp.vx = Math.cos(a) * spd; fp.vy = -40 - Math.random() * 80;
              fp.life = 1; fp.r = 1 + Math.random() * 2; fp.color = '#ff8833';
            }
          }
          spawnShockwave(state, s.x, s.y, s.explode * WAVE_PHYSICS.EXPLOSION_SHOCKWAVE_SCALE, '#ff8833');
        } else if (c.includes('22cc') || c.includes('88cc') || c.includes('44aa')) {
          // Ice: extra large particles + brief screen flash
          spawnParticles(state, s.x, s.y, s.color, 8, 1.2);
          flashScreen(state, 0.05, '136,204,255');
        } else if (c.includes('ffcc') || c.includes('ffee') || c.includes('bb88')) {
          // Lightning: quick random beams + bigger shake
          for (let li = 0; li < 3; li++) {
            const la = Math.random() * Math.PI * 2;
            const lb = state.beams.acquire();
            if (lb) {
              lb.x = s.x; lb.y = s.y;
              lb.angle = la;
              lb.range = 40 + Math.random() * 20;
              lb.width = 1; lb.color = '#ffee88'; lb.life = 0.08;
            }
          }
          shake(state, 5);
        } else if (c.includes('8844') || c.includes('aa44') || c.includes('6622')) {
          // Dark/Necro: converging particles + dark shockwave
          for (let di = 0; di < 8; di++) {
            const a = Math.random() * Math.PI * 2;
            const d = 30 + Math.random() * 40;
            const dp = state.particles.acquire();
            if (dp) {
              dp.x = s.x + Math.cos(a) * d; dp.y = s.y + Math.sin(a) * d;
              dp.vx = -Math.cos(a) * 60; dp.vy = -Math.sin(a) * 60;
              dp.life = 1; dp.r = WAVE_PHYSICS.EXPLOSION_PARTICLE_SCALE + Math.random() * 2;
              dp.color = s.color;
            }
          }
          spawnShockwave(state, s.x, s.y, s.explode * WAVE_PHYSICS.MAGIC_EXPLOSION_SHOCKWAVE, '#6622aa');
        }

        const explodeCandidates = state.enemyGrid.queryArea(s.x, s.y, s.explode);
        for (const idx of explodeCandidates) {
          const e = state.enemies.at(idx);
          if (!e.alive) continue;
          if (dist(s.x, s.y, e.x, e.y) < s.explode) {
            damageEnemy(state, e, 1, s.owner);
          }
        }
      } else if (hitP || hitE) {
        spawnParticles(state, s.x, s.y, s.color, 6, WAVE_PHYSICS.HIT_PARTICLE_LIFE);
        shake(state, 1);
      } else if (!hitP && !hitE && state.players[s.owner]?.volatile) {
        // Volatile: explode on expiry
        spawnParticles(state, s.x, s.y, s.color, 12, WAVE_PHYSICS.ZONE_HIT_PARTICLE_LIFE);
        spawnShockwave(state, s.x, s.y, 40, s.color);
        const volatileCandidates = state.enemyGrid.queryArea(s.x, s.y, 40);
        for (const idx of volatileCandidates) {
          const e = state.enemies.at(idx);
          if (!e.alive) continue;
          if (dist(s.x, s.y, e.x, e.y) < 40) {
            damageEnemy(state, e, 2, s.owner);
          }
        }
      }
      state.spells.release(i);
    }
  }
}

// ═══════════════════════════════════
//       AOE MARKER UPDATE
// ═══════════════════════════════════

export function updateAoe(state: GameState, dt: number): void {
  for (let i = state.aoeMarkers.count - 1; i >= 0; i--) {
    const m = state.aoeMarkers.get(i);
    m.age += dt;
    if (m.age >= m.delay) {
      spawnParticles(state, m.x, m.y, m.color, 25, 1);
      spawnShockwave(state, m.x, m.y, m.radius, m.color);
      netSfx(state, SfxName.Boom);
      shake(state, 6);
      flashScreen(state, 0.1);
      const aoeCandidates = state.enemyGrid.queryArea(m.x, m.y, m.radius + MAX_ENEMY_SIZE);
      for (const idx of aoeCandidates) {
        const e = state.enemies.at(idx);
        if (!e.alive) continue;
        if (dist(m.x, m.y, e.x, e.y) < m.radius + ENEMIES[e.type].size) {
          damageEnemy(state, e, m.dmg, m.owner);
          if (m.stun) e.stunTimer = (e.stunTimer || 0) + m.stun;
        }
      }
      state.aoeMarkers.release(i);
    }
  }
}

// ═══════════════════════════════════
//       ZONE UPDATE
// ═══════════════════════════════════

export function updateZones(state: GameState, dt: number): void {
  for (let i = state.zones.count - 1; i >= 0; i--) {
    const z = state.zones.get(i);
    z.age += dt;
    z.tickTimer -= dt;
    if (z.tickTimer <= 0) {
      z.tickTimer = z.tickRate;
      let zHealed = 0;
      const zoneCandidates = state.enemyGrid.queryArea(z.x, z.y, z.radius + MAX_ENEMY_SIZE);
      for (const idx of zoneCandidates) {
        const e = state.enemies.at(idx);
        if (!e.alive) continue;
        if (dist(z.x, z.y, e.x, e.y) < z.radius + ENEMIES[e.type].size) {
          damageEnemy(state, e, z.dmg, z.owner);
          if (z.slow) e.slowTimer = (e.slowTimer || 0) + z.slow;
          if (z.drain) zHealed += z.drain;
          if (z.pull) {
            const pullAngle = Math.atan2(z.y - e.y, z.x - e.x);
            e.x += Math.cos(pullAngle) * z.pull * dt;
            e.y += Math.sin(pullAngle) * z.pull * dt;
          }
        }
      }
      // Freeze-after: stun enemies inside zone once age threshold reached
      if (z.freezeAfter && z.age >= z.freezeAfter) {
        for (const idx of zoneCandidates) {
          const e = state.enemies.at(idx);
          if (!e.alive) continue;
          if (dist(z.x, z.y, e.x, e.y) < z.radius + ENEMIES[e.type].size) {
            e.stunTimer = Math.max(e.stunTimer || 0, z.duration - z.age);
          }
        }
        z.freezeAfter = 0; // only apply once
      }
      if (zHealed > 0) {
        const p = state.players[z.owner];
        if (p) {
          p.hp = Math.min(p.maxHp, p.hp + zHealed);
          spawnText(state, p.x, p.y - 20, `+${zHealed}`, '#44ff88');
        }
      }
      // Heal: restore HP to the owner while inside the zone
      if (z.heal) {
        const p = state.players[z.owner];
        if (p && dist(z.x, z.y, p.x, p.y) < z.radius) {
          p.hp = Math.min(p.maxHp, p.hp + z.heal);
          spawnText(state, p.x, p.y - 20, `+${z.heal}`, '#ffffaa');
        }
      }
    }
    if (z.age >= z.duration) state.zones.release(i);
  }
}
