import { registerClassHooks } from '../hooks';
import { netSfx, rand, spawnParticles, spawnText } from '../../state';
import { SfxName, SpellType } from '../../types';
import { ULTIMATE, WIZARD_SIZE, TIMING } from '../../constants';

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

  castUltimate: (state, p, angle) => {
    const pw = p.ultPower || 1;
    // Arrow Rain: 20 arrows in a spread cone in aimed direction.
    const cos0 = Math.cos(angle);
    const sin0 = Math.sin(angle);
    const spreadHalf = ULTIMATE.RANGER_SPREAD_BASE;
    for (let i = 0; i < 20; i++) {
      const aOff = -spreadHalf + (spreadHalf * 2) * (i / 19) + rand(-ULTIMATE.RANGER_SPREAD_STEP, ULTIMATE.RANGER_SPREAD_STEP);
      const sa = angle + aOff;
      const aCos = Math.cos(sa);
      const aSin = Math.sin(sa);
      setTimeout(() => {
        state.spells.push({
          type: SpellType.Projectile, dmg: Math.round(2 * pw), speed: 400, radius: 5, life: ULTIMATE.RANGER_ARROW_LIFE,
          color: '#88cc44', trail: '#668833',
          x: p.x + cos0 * WIZARD_SIZE, y: p.y + sin0 * WIZARD_SIZE,
          vx: aCos * 400, vy: aSin * 400,
          owner: p.idx, age: 0, zapTimer: 0, pierceLeft: ULTIMATE.RANGER_ARROW_PIERCE,
          homing: 0, zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
          stun: 0, clsKey: p.clsKey, _reversed: false, _bounces: 0,
        });
        netSfx(state, SfxName.Hit);
      }, i * 30);
    }
    return true;
  },
});
