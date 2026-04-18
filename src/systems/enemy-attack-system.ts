import { GameState, dist, spawnText } from '../state';
import { EnemyAI } from '../types';
import { ENEMIES, TIMING } from '../constants';
import { damagePlayer } from './combat';

/**
 * System 5: Enemy Attack (priority 54)
 * Handles attack timer, melee damage, and ranged projectile spawning.
 */
export function enemyAttack(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e._deathTimer >= 0) continue;
    if (e._friendly) continue;
    if (e.stunTimer > 0) continue;

    const et = ENEMIES[e.type];

    // Need target for attack range/direction — skip stealthed players
    const isVisible = (pl: any) => pl && pl.alive && !(pl._stealth > 0);
    let target = state.players[e.target];
    if (!isVisible(target)) {
      target = state.players.find(p => isVisible(p)) || state.players.find(p => p.alive) || state.players[0];
      if (!target) continue;
    }

    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    // Attack
    e.atkTimer -= dt;
    if (e.atkTimer <= 0 && d < et.atkR) {
      e.atkTimer = et.atkCd;
      e._atkAnim = TIMING.ANIM_ATTACK_WIND;
      if (et.ai === EnemyAI.Chase) {
        if (target.iframes <= 0) damagePlayer(state, target, Math.ceil(et.dmg * (e._dmgMul || 1)), e);
        // Ice Armor: melee attackers get frozen
        if (target.iceArmor) {
          e.stunTimer = (e.stunTimer || 0) + 1;
          spawnText(state, e.x, e.y - 15, 'FROZEN', '#88ddff');
        }
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
  }
}
