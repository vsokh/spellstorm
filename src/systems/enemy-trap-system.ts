import { GameState, dist, spawnParticles, spawnShockwave, shake } from '../state';
import { SfxName, PickupType } from '../types';
import { sfx } from '../audio';
import { damageEnemy } from './combat';

/**
 * System 6: Enemy Trap Collision (priority 55)
 * Checks trap pickup collision, applies damage/slow.
 */
export function enemyTraps(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e._deathTimer >= 0) continue;
    if (e._friendly) continue;
    if (e.stunTimer > 0) continue;

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
