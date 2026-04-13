import { GameState, dist, clamp, spawnParticles, spawnText } from '../state';
import { getInput } from '../input';
import {
  WIZARD_SIZE,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  DEFAULT_MOVE_SPEED,
  getXpStep,
} from '../constants';
import { Enemy, PickupType, SfxName } from '../types';
import { sfx } from '../audio';
import { castSpell, castSpellSilent, castUltimate, damageEnemy } from './combat';

/** Callback set by main.ts to break circular dep with upgrades module */
export let onChestPickup: ((state: GameState) => void) | null = null;
export function setChestPickupHandler(handler: (state: GameState) => void): void {
  onChestPickup = handler;
}

// ═══════════════════════════════════
//       PLAYER UPDATE
// ═══════════════════════════════════

export function updatePlayers(state: GameState, dt: number): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    const input = getInput(state, p.idx);
    if (p.stunTimer > 0) { p.stunTimer -= dt; continue; }
    const slow = p.slowTimer > 0 ? 0.5 : 1;
    if (p.slowTimer > 0) p.slowTimer -= dt;

    // Aim follows mouse instantly
    if (!isNaN(input.angle)) p.angle = input.angle;

    // Absolute movement: W=up S=down A=left D=right
    const ms = p.moveSpeed * slow;
    let mvx = (input.mx || 0) * ms;
    let mvy = (input.my || 0) * ms;
    // Normalize diagonal
    const mvLen = Math.sqrt(mvx * mvx + mvy * mvy);
    if (mvLen > ms) { mvx *= ms / mvLen; mvy *= ms / mvLen; }
    p.vx = mvx;
    p.vy = mvy;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
    p.y = clamp(p.y, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);

    // Pillar collision
    for (const pl of state.pillars) {
      const d = dist(p.x, p.y, pl.x, pl.y);
      if (d < pl.radius + WIZARD_SIZE) {
        const nx = (p.x - pl.x) / d;
        const ny = (p.y - pl.y) / d;
        p.x = pl.x + nx * (pl.radius + WIZARD_SIZE + 1);
        p.y = pl.y + ny * (pl.radius + WIZARD_SIZE + 1);
      }
    }

    // Mana regen
    p.mana = Math.min(p.maxMana, p.mana + p.manaRegen * dt);
    // HP regen from evolution upgrades
    if (p.hpRegen && p.hpRegen > 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * dt);
    }
    // Cooldowns
    for (let i = 0; i < 4; i++) { if (p.cd[i] > 0) p.cd[i] -= dt; }
    if (p.iframes > 0) p.iframes -= dt;

    // Storm Shield: lightning strikes random nearby enemy every 1s
    if (p.stormShield) {
      p._stormTimer = (p._stormTimer || 0) + dt;
      if (p._stormTimer >= 1.0) {
        p._stormTimer = 0;
        // Find all enemies within 120px
        const nearby: Enemy[] = [];
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (dist(p.x, p.y, e.x, e.y) <= 120) nearby.push(e);
        }
        if (nearby.length > 0) {
          const target = nearby[Math.floor(Math.random() * nearby.length)];
          damageEnemy(state, target, 1, p.idx);
          // Visual lightning bolt from player to target
          state.beams.push({
            x: p.x, y: p.y,
            angle: Math.atan2(target.y - p.y, target.x - p.x),
            range: dist(p.x, p.y, target.x, target.y),
            width: 2,
            color: '#bb66ff',
            life: 0.15,
          });
        }
      }
    }

    // Rewind snapshot (save every 3s)
    p._snapTimer = (p._snapTimer || 0) + dt;
    if (p._snapTimer >= 3) {
      p._snapTimer = 0;
      p._rewindSnap = { hp: p.hp, mana: p.mana };
    }

    // ── SPELL CASTING ──
    const sd = p.cls.spells;

    // Primary (LMB)
    if (input.shoot && p.cd[0] <= 0 && p.mana >= sd[0].mana) {
      castSpell(state, p, 0, input.angle);
      // Split shot: extra bolts at angles
      if (p.splitShot) {
        for (let ss = 1; ss <= p.splitShot; ss++) {
          const off = Math.ceil(ss / 2) * 0.26 * (ss % 2 === 0 ? 1 : -1);
          castSpellSilent(state, p, 0, input.angle + off);
        }
      }
      // Double tap: fire again after short delay
      if (p.doubleTap) {
        for (let dt2 = 0; dt2 < p.doubleTap; dt2++) {
          setTimeout(() => castSpellSilent(state, p, 0, input.angle), 60 * (dt2 + 1));
        }
      }
    }

    // Secondary (RMB)
    if (input.shoot2 && p.cd[1] <= 0 && p.mana >= sd[1].mana) {
      castSpell(state, p, 1, input.angle);
    }

    // Ability (Q) - only trigger once per press
    if (input.ability && p.cd[2] <= 0 && p.mana >= sd[2].mana && !state.keys[`_q${p.idx}`]) {
      state.keys[`_q${p.idx}`] = true;
      castSpell(state, p, 2, input.angle);
    }
    if (!input.ability) state.keys[`_q${p.idx}`] = false;

    // Ultimate (R) - needs full charge
    const ultThreshold = p.ultOverflow ? 200 : 100;
    if (input.ult && p.ultCharge >= ultThreshold && !state.keys[`_r${p.idx}`]) {
      state.keys[`_r${p.idx}`] = true;
      const wasOverflowed = p.ultOverflow && p.ultCharge >= 200;
      castUltimate(state, p, input.angle);
      if (wasOverflowed) {
        // Overflow: cast a second time
        castUltimate(state, p, input.angle);
      }
    }
    if (!input.ult) state.keys[`_r${p.idx}`] = false;

    // ── PASSIVES ──

    // Chronomancer: haste aura for ally
    if (p.clsKey === 'chronomancer') {
      const ally = state.players[1 - p.idx];
      if (ally && ally.alive && dist(p.x, p.y, ally.x, ally.y) < 150) {
        ally._hasteBonus = true;
      } else if (ally) {
        ally._hasteBonus = false;
      }
    }
    if (p._hasteBonus) p.moveSpeed = Math.max(p.moveSpeed, DEFAULT_MOVE_SPEED * 1.1);

    // Berserker: fury below 50% HP
    p._furyActive = p.clsKey === 'berserker' && p.hp <= p.maxHp / 2;

    // Druid: Regrowth - regen 1 HP every 10 seconds
    if (p.clsKey === 'druid') {
      p._auraTick = (p._auraTick || 0) + dt;
      if (p._auraTick >= 10) {
        p._auraTick = 0;
        if (p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          spawnText(state, p.x, p.y - 20, '+1 HP', '#44aa33');
        }
      }
    }

    // Monk: Inner Peace - 20% dodge naturally (added at creation, stacks with Dodge upgrade)
    // Applied via dodgeChance in damagePlayer, set below
    if (p.clsKey === 'monk' && p.dodgeChance < 0.2) {
      p.dodgeChance = 0.2;
    }

    // Paladin: aura of light - heal nearby ally 2 HP/s
    if (p.clsKey === 'paladin') {
      const ally = state.players[1 - p.idx];
      if (ally && ally.alive && dist(p.x, p.y, ally.x, ally.y) < 120) {
        p._auraTick = (p._auraTick || 0) + dt;
        if (p._auraTick >= 0.5) {
          p._auraTick = 0;
          if (ally.hp < ally.maxHp) {
            ally.hp = Math.min(ally.maxHp, ally.hp + 1);
            spawnText(state, ally.x, ally.y - 20, '+1', '#ffffaa');
          }
        }
      }
    }

    // Time stop decay
    if (p._timeStopTimer > 0) {
      p._timeStopTimer -= dt;
      if (p._timeStopTimer <= 0) p.moveSpeed = DEFAULT_MOVE_SPEED;
    }

    // Blood rage decay
    if (p._rage > 0) {
      p._rage -= dt;
      if (p._rage <= 0) p._rageDmgMul = 1;
    }

    // Shield wall decay
    if (p._shieldWall > 0) p._shieldWall -= dt;

    // Holy shield decay
    if (p._holyShield > 0) p._holyShield -= dt;

    // Dash (SHIFT)
    if (p.hasDash) {
      if (p.dashCd > 0) p.dashCd -= dt;
      const dashKey = input.dash;
      if (dashKey && p.dashCd <= 0 && !state.keys[`_dash${p.idx}`]) {
        state.keys[`_dash${p.idx}`] = true;
        p.dashCd = 2;
        const dx = input.mx || 0;
        const dy = input.my || 0;
        const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
        p.x += (dx / dLen) * 120;
        p.y += (dy / dLen) * 120;
        p.x = clamp(p.x, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
        p.y = clamp(p.y, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
        p.iframes = Math.max(p.iframes, 0.2);
        sfx(SfxName.Blink);
        spawnParticles(state, p.x, p.y, p.cls.color, 10);
      }
      if (!dashKey) state.keys[`_dash${p.idx}`] = false;
    }

    // Magnet pass: pull XP and Gold pickups toward player
    for (const pk of state.pickups) {
      if (pk.collected) continue;
      if (pk.type !== PickupType.Xp && pk.type !== PickupType.Gold) continue;
      const md = dist(p.x, p.y, pk.x, pk.y);
      if (md < p.magnetRange && md > 1) {
        const pull = 300 * dt;
        const nx = (p.x - pk.x) / md;
        const ny = (p.y - pk.y) / md;
        pk.x += nx * Math.min(pull, md);
        pk.y += ny * Math.min(pull, md);
      }
    }

    // Pickup collection
    for (const pk of state.pickups) {
      if (pk.collected) continue;
      if (dist(p.x, p.y, pk.x, pk.y) < WIZARD_SIZE + 15) {
        pk.collected = true;
        sfx(SfxName.Pickup);
        if (pk.type === PickupType.Chest) {
          if (onChestPickup) onChestPickup(state);
        } else if (pk.type === PickupType.Health) {
          p.hp = Math.min(p.maxHp, p.hp + 2);
          spawnText(state, pk.x, pk.y - 15, '+2 HP', '#44ff88');
        } else if (pk.type === PickupType.Gold) {
          state.gold += pk.value;
          spawnText(state, pk.x, pk.y - 10, '+' + pk.value + 'g', '#ddcc44');
        } else if (pk.type === PickupType.Xp) {
          const xpGain = Math.ceil(pk.value * (1 + p.xpBoost));
          p.xp += xpGain;
          spawnText(state, pk.x, pk.y - 10, '+' + xpGain + ' XP', '#88ccff');
          if (p.xp >= p.xpToNext) {
            p.xp = 0;
            p.level++;
            p.xpToNext = p.xpToNext + getXpStep(p.level);
            if (onChestPickup) onChestPickup(state);
          }
        }
      }
    }
  }
}
