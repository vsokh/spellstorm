import { registerClassHooks } from '../hooks';
import { netSfx, spawnParticles, spawnShockwave, spawnText } from '../../state';
import { SfxName } from '../../types';
import { ULTIMATE, TIMING } from '../../constants';

const ROLL_DURATION = 0.28;
const ROLL_SPEED = 720;

registerClassHooks('ranger', {
  // RMB Roll: animated dash in aim direction with iframes.
  castRMBAbility: (state, p, _def, angle) => {
    p._rollTimer = ROLL_DURATION;
    p._rollVx = Math.cos(angle) * ROLL_SPEED;
    p._rollVy = Math.sin(angle) * ROLL_SPEED;
    p.iframes = Math.max(p.iframes, ROLL_DURATION + TIMING.IFRAME_DASH);
    p._rollGhosts.length = 0;
    spawnParticles(state, p.x, p.y, p.cls.color, 6, 0.3);
    spawnText(state, p.x, p.y - 20, 'ROLL', p.cls.color);
    netSfx(state, SfxName.Blink);
    return true;
  },

  // Arrow Storm: rain arrows around the player over ~3s. Follows the player
  // (each volley is placed relative to p.x/p.y at fire-time), so rolling carries
  // the storm with you.
  castUltimate: (state, p) => {
    const pw = p.ultPower || 1;
    const dmg = Math.round(ULTIMATE.ARROW_STORM_DMG * pw);
    const volleys = Math.floor(ULTIMATE.ARROW_STORM_DURATION * 1000 / ULTIMATE.ARROW_STORM_INTERVAL);
    for (let i = 0; i < volleys; i++) {
      setTimeout(() => {
        if (!p.alive) return;
        // Two markers per volley for density
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * ULTIMATE.ARROW_STORM_RADIUS;
          const tx = p.x + Math.cos(a) * r;
          const ty = p.y + Math.sin(a) * r;
          const marker = state.aoeMarkers.acquire();
          if (marker) {
            marker.x = tx; marker.y = ty;
            marker.radius = ULTIMATE.ARROW_STORM_MARKER_R;
            marker.delay = ULTIMATE.ARROW_STORM_DELAY;
            marker.dmg = dmg; marker.owner = p.idx;
            marker.color = '#88cc44'; marker.age = 0; marker.stun = 0;
          }
          spawnParticles(state, tx, ty - 40, '#bbee66', 3, 0.35);
        }
        if (i % 5 === 0) netSfx(state, SfxName.Hit);
      }, i * ULTIMATE.ARROW_STORM_INTERVAL);
    }
    spawnShockwave(state, p.x, p.y, ULTIMATE.ARROW_STORM_RADIUS, 'rgba(136,204,68,.28)');
    spawnText(state, p.x, p.y - 40, 'ARROW STORM', '#bbee66');
    return true;
  },
});
