import { GameState, dist, spawnParticles } from '../state';
import { TIMING } from '../constants';
import { damageEnemy } from './combat';

/**
 * System 2: Enemy Status Effects (priority 51)
 * Handles friendly summon AI, iframes, slow/stun timers, and burn DOT.
 */
export function enemyStatus(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e._deathTimer >= 0) continue;

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
          e.atkTimer = TIMING.ANIM_ATTACK;
          damageEnemy(state, nt, 2, e._owner);
        }
      }
      continue;
    }

    if (e.iframes > 0) e.iframes -= dt;
    if (e.slowTimer > 0) {
      const hasPerm = state.players.some(p => p.alive && p.permafrost);
      if (!hasPerm) e.slowTimer -= dt;
    }
    if (e.stunTimer > 0) { e.stunTimer -= dt; continue; }

    // Burn DOT
    if (e._burnTimer > 0) {
      e._burnTimer -= dt;
      e._burnTick = (e._burnTick || 0) - dt;
      if (e._burnTick <= 0) {
        e._burnTick = TIMING.BURN_TICK;
        damageEnemy(state, e, 1, e._burnOwner || 0);

        // Wildfire: burn spreads to nearby enemies
        const burnOwner = state.players[e._burnOwner || 0];
        if (burnOwner && burnOwner.burnSpread) {
          const spreadCandidates = state.enemyGrid.queryArea(e.x, e.y, 80);
          for (const idx of spreadCandidates) {
            const e2 = state.enemies.at(idx);
            if (!e2.alive || e2 === e || e2._burnTimer > 0) continue;
            if (dist(e.x, e.y, e2.x, e2.y) < 80) {
              e2._burnTimer = 2;
              e2._burnOwner = e._burnOwner;
            }
          }
        }
      }
    }
  }
}
