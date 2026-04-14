import { GameState } from '../state';

/**
 * System 1: Enemy Timers (priority 50)
 * Ticks hitFlash, atkAnim, dmgReduction timers, and death animation.
 */
export function enemyTimers(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;

    // Tick animation timers
    if (e._hitFlash > 0) e._hitFlash -= dt;
    if (e._atkAnim > 0) e._atkAnim -= dt;

    // Cross-spell synergy: decay LMB hit timer for Combo augment
    if (e._lmbHitTimer > 0) e._lmbHitTimer -= dt;

    // Boss damage reduction phase timer
    if (e._dmgReductionTimer > 0) {
      e._dmgReductionTimer -= dt;
      if (e._dmgReductionTimer <= 0) {
        e._dmgReductionActive = false;
        e._dmgReductionTimer = 0;
      }
    }

    // Death animation timer
    if (e._deathTimer >= 0) {
      e._deathTimer -= dt;
      if (e._deathTimer <= 0) {
        e.alive = false;
      }
    }
  }
}
