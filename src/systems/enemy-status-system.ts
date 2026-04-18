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

    // Friendly summons (necro skeletons, druid wolves, engineer turrets, etc.)
    if (e._friendly) {
      e._lifespan -= dt;
      if (e._lifespan <= 0) {
        e.alive = false;
        spawnParticles(state, e.x, e.y, '#55cc55', 6);
        continue;
      }
      // Pick target. Skeletons prefer enemies with a Death Mark from their owner.
      let nt = null;
      let nd = Infinity;
      let ntMarked = null;
      let ndMarked = Infinity;
      const isSkeleton = e.type === '_skeleton';
      for (const e2 of state.enemies) {
        if (!e2.alive || e2._friendly || e2 === e) continue;
        const d = dist(e.x, e.y, e2.x, e2.y);
        if (isSkeleton && e2._markName === 'death' && e2._markOwner === e._owner && e2._markStacks > 0 && d < ndMarked) {
          ndMarked = d; ntMarked = e2;
        }
        if (d < nd) { nd = d; nt = e2; }
      }
      // Prefer marked target when not far out of the way (within 1.8x nearest distance + small buffer).
      const target = (ntMarked && ndMarked < nd * 1.8 + 80) ? ntMarked : nt;
      if (target) {
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const dd = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const moveSpd = isSkeleton ? 95 : 80;
        e.x += (dx / dd) * moveSpd * dt;
        e.y += (dy / dd) * moveSpd * dt;
        e.atkTimer -= dt;
        if (e.atkTimer <= 0 && dd < 25) {
          e.atkTimer = TIMING.ANIM_ATTACK;
          const isMarked = target._markName === 'death' && target._markOwner === e._owner && target._markStacks > 0;
          const baseDmg = isSkeleton ? 3 : 2;
          const dmgMul = (e._dmgMul || 1) * (isSkeleton && isMarked ? 1.4 : 1);
          damageEnemy(state, target, baseDmg * dmgMul, e._owner);
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
        // Invoker passive: stunned+burning enemies take 2x burn damage
        const burnOwnerPlayer = state.players[e._burnOwner || 0];
        const burnDmg = (burnOwnerPlayer && burnOwnerPlayer.clsKey === 'invoker' && e.stunTimer > 0) ? 2 : 1;
        damageEnemy(state, e, burnDmg, e._burnOwner || 0);

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

    // Mark timer decay
    if (e._markTimer > 0) {
      e._markTimer -= dt;
      if (e._markTimer <= 0) {
        e._markName = '';
        e._markStacks = 0;
        e._markTimer = 0;
      }
    }
  }
}
