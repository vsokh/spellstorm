import { registerClassHooks } from '../hooks';
import { dist, netSfx, spawnParticles, spawnShockwave, spawnText, toWorld } from '../../state';
import { createFriendlyEnemy } from '../../systems/dungeon';
import { SfxName } from '../../types';

const SKELETON_CAP = 6;

registerClassHooks('necromancer', {
  // Bone Collector: kills heal you + nearest skeleton.
  onKill: (state, p) => {
    p.hp = Math.min(p.maxHp, p.hp + 0.5);
    spawnText(state, p.x, p.y - 15, '+0.5 HP', '#77ffaa');
    let best: any = null;
    let bestD = Infinity;
    for (const ally of state.enemies) {
      if (!ally.alive || !ally._friendly || ally._owner !== p.idx) continue;
      if (ally.type !== '_skeleton') continue;
      if (ally.hp >= ally.maxHp) continue;
      const d = dist(p.x, p.y, ally.x, ally.y);
      if (d < bestD) { bestD = d; best = ally; }
    }
    if (best) {
      best.hp = Math.min(best.maxHp, best.hp + 1);
      spawnParticles(state, best.x, best.y, '#77ffaa', 5, 0.4);
    }
  },

  // Raise Skeleton RMB: summon at cursor, cap 6.
  castRMBAbility: (state, p) => {
    const wp = toWorld(state, state.mouseX, state.mouseY);
    const existing = state.enemies.filter(
      e => e.alive && e._friendly && e.type === '_skeleton' && e._owner === p.idx && e.maxHp < 9,
    );
    if (existing.length >= SKELETON_CAP) {
      const oldest = existing.reduce((a, b) => (a._lifespan < b._lifespan ? a : b));
      oldest.alive = false;
      spawnParticles(state, oldest.x, oldest.y, '#556655', 6, 0.4);
    }
    const skel = createFriendlyEnemy(state, wp.x, wp.y, p.idx);
    skel.type = '_skeleton';
    skel.hp = 6;
    skel.maxHp = 6;
    skel._lifespan = 20;
    state.enemies.push(skel);
    spawnParticles(state, wp.x, wp.y, '#77ddaa', 14, 0.7);
    spawnShockwave(state, wp.x, wp.y, 28, 'rgba(100,220,160,.45)');
    netSfx(state, SfxName.Arcane);
    spawnText(state, wp.x, wp.y - 20, 'RAISED', '#77ddaa');
    return true;
  },

  // Army of Dead Space: raise 8 bone warriors (larger + stronger) for 15s.
  castUltimate: (state, p) => {
    const pw = p.ultPower || 1;
    for (let i = 0; i < 8; i++) {
      const sa = p.angle + (i / 8) * Math.PI * 2;
      const sx = p.x + Math.cos(sa) * 55;
      const sy = p.y + Math.sin(sa) * 55;
      const warrior = createFriendlyEnemy(state, sx, sy, p.idx);
      warrior.type = '_skeleton';
      const hp = Math.round(10 * pw);
      warrior.hp = hp;
      warrior.maxHp = hp;
      warrior._lifespan = 15;
      warrior._dmgMul = 1.5;
      state.enemies.push(warrior);
      spawnParticles(state, sx, sy, '#77ffaa', 8, 0.5);
    }
    spawnShockwave(state, p.x, p.y, 120, 'rgba(85,204,136,.35)');
    spawnText(state, p.x, p.y - 35, 'ARMY OF DEAD', '#77ffaa');
    return true;
  },
});
