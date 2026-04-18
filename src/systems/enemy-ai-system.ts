import { GameState, dist, clamp, spawnParticles } from '../state';
import { EnemyAI } from '../types';
import { ENEMIES, ROOM_WIDTH, ROOM_HEIGHT, ENEMY_AI } from '../constants';

/**
 * System 3: Enemy AI (priority 52)
 * Handles target selection, teleport behavior, and movement AI (velocity computation).
 */
export function enemyAI(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e._deathTimer >= 0) continue;
    if (e._friendly) continue;
    if (e.stunTimer > 0) continue;

    const et = ENEMIES[e.type];
    const slow = e.slowTimer > 0 ? ENEMY_AI.SLOW_MULT : 1;
    const spdMul = e._spdMul || 1;

    // Target selection — skip stealthed players
    const isVisible = (pl: any) => pl && pl.alive && !(pl._stealth > 0);
    let target = state.players[e.target];
    if (!isVisible(target)) {
      const visible = state.players.find(p => isVisible(p));
      if (!visible) {
        // No visible player — idle (decelerate, don't chase the stealthed target)
        e.vx *= 0.85;
        e.vy *= 0.85;
        continue;
      }
      target = visible;
      e.target = target.idx;
    }

    // Occasional retarget to closer visible player
    if (Math.random() < dt * 0.5) {
      const other = state.players[1 - e.target];
      if (isVisible(other) && dist(e.x, e.y, other.x, other.y) < dist(e.x, e.y, target.x, target.y) * 0.7) {
        e.target = other.idx;
        target = other;
      }
    }

    // Taunt Aura: Knight forces enemies within 100px to target them
    for (const p of state.players) {
      if (p && p.alive && p.tauntAura && dist(e.x, e.y, p.x, p.y) < 100) {
        e.target = p.idx;
        target = p;
        break;
      }
    }

    // Teleport behavior
    if (et.teleport) {
      e._teleportTimer = (e._teleportTimer || 0) - dt;
      if (e._teleportTimer <= 0) {
        e._teleportTimer = 3 + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        const teleportDist = 60 + Math.random() * 40;
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
    const enrageMul = et.enrage ? 1 + (1 - e.hp / e.maxHp) * ENEMY_AI.ENRAGE_MULT : 1;
    const spd = et.speed * spdMul * slow * enrageMul;
    if (et.ai === EnemyAI.Chase) {
      if (d > et.atkR * ENEMY_AI.KITING_SLOW) {
        e.vx = (dx / d) * spd;
        e.vy = (dy / d) * spd;
      } else {
        e.vx *= ENEMY_AI.KITING_SLOW;
        e.vy *= ENEMY_AI.KITING_SLOW;
      }
    } else if (et.ai === EnemyAI.Ranged) {
      if (d > et.atkR * ENEMY_AI.BACK_AWAY_SLOW) {
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
  }
}
