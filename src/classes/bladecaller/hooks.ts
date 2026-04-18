import { registerClassHooks } from '../hooks';
import { damageEnemy } from '../../systems/combat';
import { dist, flashScreen, netSfx, spawnParticles, spawnShockwave, spawnText, shake } from '../../state';
import { EnemyView, SfxName } from '../../types';
import { DEFAULT_MOVE_SPEED } from '../../constants';

registerClassHooks('bladecaller', {
  // Rush speed, stealth HoT/speed, Thousand Cuts flurry auto-strikes.
  onTick: (state, p, dt) => {
    if (p._rushSpeed && p._rushSpeed > state.time) {
      p.moveSpeed = Math.max(p.moveSpeed, DEFAULT_MOVE_SPEED * 1.1);
    }
    // Phantom Veil: stealth tick — decay, HoT, +30% ms.
    if (p._stealth > 0) {
      p._stealth -= dt;
      const q = p.cls.spells[2];
      const healTotal = q?.heal || 4;
      const dur = q?.duration || 2;
      p.hp = Math.min(p.maxHp, p.hp + (healTotal / dur) * dt);
      const clsMs = p.cls.moveSpeed ?? DEFAULT_MOVE_SPEED;
      p.moveSpeed = Math.max(p.moveSpeed, clsMs * 1.3);
      if (p._stealth <= 0) p._stealth = 0;
      // _critPending persists so the first attack out of stealth still crits.
    }
    // Thousand Cuts flurry: teleport-dash auto-strike every 0.2s.
    if (p._bladeFlurry > 0) {
      p._bladeFlurry -= dt;
      p._bladeFlurryTick -= dt;
      p.iframes = Math.max(p.iframes, 0.2);
      const clsMs = p.cls.moveSpeed ?? DEFAULT_MOVE_SPEED;
      p.moveSpeed = Math.max(p.moveSpeed, clsMs * 1.3);
      if (p._bladeFlurryTick <= 0) {
        p._bladeFlurryTick = 0.2;
        let nearest: EnemyView | null = null;
        let nearestD = Infinity;
        for (const e of state.enemies) {
          if (!e.alive || e._friendly || e._deathTimer >= 0) continue;
          const d = dist(p.x, p.y, e.x, e.y);
          if (d < nearestD) { nearestD = d; nearest = e; }
        }
        if (nearest) {
          const offA = Math.random() * Math.PI * 2;
          const offD = 18 + Math.random() * 8;
          spawnParticles(state, p.x, p.y, '#cc3355', 6, 0.3);
          p.x = nearest.x + Math.cos(offA) * offD;
          p.y = nearest.y + Math.sin(offA) * offD;
          p.angle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
          const dmg = Math.round(6 * (p.ultPower || 1)) * 2; // 2x auto-crit
          damageEnemy(state, nearest, dmg, p.idx);
          const heal = Math.ceil(dmg * 0.2);
          p.hp = Math.min(p.maxHp, p.hp + heal);
          spawnParticles(state, nearest.x, nearest.y, '#cc3355', 8, 0.4);
          netSfx(state, SfxName.Hit);
          shake(state, 2);
        }
      }
      if (p._bladeFlurry <= 0) {
        p._bladeFlurry = 0;
        p._bladeFlurryTick = 0;
      }
    }
  },

  // Kill Rush: kills within 1.5s of Shadow Step reset its cd; kills grant speed boost.
  onKill: (state, p) => {
    if (p._lastShadowStep && state.time - p._lastShadowStep < 1.5) {
      p.cd[1] = 0;
      spawnText(state, p.x, p.y - 15, 'RESET!', '#cc3355');
    }
    p._rushSpeed = state.time + 3;
  },

  // Phantom Veil Q: 2s stealth, heals over duration, +30% ms, next attack auto-crits.
  castQAbility: (state, p, def) => {
    p._stealth = def.duration || 2;
    p._critPending = true;
    p._stealthLastX = p.x;
    p._stealthLastY = p.y;
    spawnParticles(state, p.x, p.y, '#cc3355', 20, 0.8);
    spawnShockwave(state, p.x, p.y, 50, 'rgba(68,17,34,.5)');
    netSfx(state, SfxName.Blink);
    spawnText(state, p.x, p.y - 20, 'VEILED', '#cc3355');
    return true;
  },

  // Thousand Cuts: 2.5s vampiric flurry — physics ticks the auto-strike loop.
  castUltimate: (state, p) => {
    p._bladeFlurry = 2.5;
    p._bladeFlurryTick = 0;
    p.iframes = Math.max(p.iframes, 0.4);
    spawnShockwave(state, p.x, p.y, 80, 'rgba(204,51,85,.5)');
    spawnParticles(state, p.x, p.y, '#cc3355', 30, 1.0);
    flashScreen(state, 0.2, '204,51,85');
    shake(state, 6);
    netSfx(state, SfxName.Kill);
    spawnText(state, p.x, p.y - 25, 'BLOOD FRENZY', '#cc3355');
    return true;
  },
});
