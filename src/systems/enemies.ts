import { GameState, dist, spawnParticles } from '../state';
import { ROOM_WIDTH, ROOM_HEIGHT, WIZARD_SIZE, WALL_THICKNESS, ENEMY_AI } from '../constants';
import { damagePlayer } from './combat';

// ═══════════════════════════════════
//   ENEMY SYSTEMS — barrel re-exports
// ═══════════════════════════════════
export { enemyTimers } from './enemy-timer-system';
export { enemyStatus } from './enemy-status-system';
export { enemyAI } from './enemy-ai-system';
export { enemyPhysics } from './enemy-physics-system';
export { enemyAttack } from './enemy-attack-system';
export { enemyTraps } from './enemy-trap-system';

// ═══════════════════════════════════
//       ENEMY PROJECTILE UPDATE
// ═══════════════════════════════════

export function updateEProj(state: GameState, dt: number): void {
  for (let i = state.eProj.length - 1; i >= 0; i--) {
    const p = state.eProj.at(i);
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

    if (Math.random() > ENEMY_AI.TRAIL_SPAWN_CHANCE) {
      const tr = state.trails.acquire();
      if (tr) {
        tr.x = p.x; tr.y = p.y; tr.life = ENEMY_AI.TRAIL_SPAWN_CHANCE; tr.r = 2; tr.color = p.color;
      }
    }

    let hit = false;
    for (const pl of state.players) {
      if (!pl.alive || pl.iframes > 0) continue;
      if (dist(p.x, p.y, pl.x, pl.y) < WIZARD_SIZE + p.radius) {
        // Paladin reflect shield: bounce projectile back instead of taking damage
        if (pl._holyShield > 0 && pl.reflectShield) {
          p.vx = -p.vx * 1.5;
          p.vy = -p.vy * 1.5;
          p.life = 3;
          spawnParticles(state, p.x, p.y, '#ffddaa', 8, 0.6);
          break; // exit player loop without setting hit
        }
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
      state.eProj.release(i);
    }
  }
}
