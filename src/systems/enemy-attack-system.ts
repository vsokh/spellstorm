import { GameState, dist, spawnParticles, spawnText } from '../state';
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
    let target: any = state.players[e.target];
    if (!isVisible(target)) {
      const visible = state.players.find(p => isVisible(p));
      if (!visible) continue; // nothing to hit while all players stealthed
      target = visible;
    }

    // Chase AI: if a friendly skeleton is closer than the player, prefer it
    // as the melee target (matches enemy-ai-system movement preference).
    if (et.ai === EnemyAI.Chase) {
      let bestF: any = null;
      let bestD = Infinity;
      for (const f of state.enemies) {
        if (!f.alive || !f._friendly || f.type !== '_skeleton') continue;
        const d = dist(e.x, e.y, f.x, f.y);
        if (d < bestD) { bestD = d; bestF = f; }
      }
      if (bestF) {
        const playerD = dist(e.x, e.y, target.x, target.y);
        if (bestD < playerD * 0.9 && bestD < 150) target = bestF;
      }
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
        const dmg = Math.ceil(et.dmg * (e._dmgMul || 1));
        if (target._friendly) {
          // Hit a friendly skeleton: direct HP hit, no XP/gold/kill credit.
          target.hp -= dmg;
          target._hitFlash = 0.12;
          if (target.hp <= 0) {
            target.alive = false;
            spawnParticles(state, target.x, target.y, '#556655', 8, 0.5);
          }
        } else {
          if (target.iframes <= 0) damagePlayer(state, target, dmg, e);
          // Ice Armor: melee attackers get frozen
          if (target.iceArmor) {
            e.stunTimer = (e.stunTimer || 0) + 1;
            spawnText(state, e.x, e.y - 15, 'FROZEN', '#88ddff');
          }
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
