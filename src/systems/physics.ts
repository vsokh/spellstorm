import { GameState, dist, clamp, spawnParticles, spawnText, shake, netSfx } from '../state';
import { getInput } from '../input';
import {
  WIZARD_SIZE,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  DEFAULT_MOVE_SPEED,
  getXpStep,
  healthPickupAmount,
  HP_LEVEL_INTERVAL,
  COMBAT,
  TIMING,
  RANGES,
  WAVE_PHYSICS,
  DUNGEON_TIMING,
  GAME_OVER_DELAY_MS,
  CD_FLOORS,
} from '../constants';
import { Enemy, EnemyView, GamePhase, NetworkMode, PickupType, SfxName, SpellType } from '../types';
import { castSpell, castChargedSpell, castSpellSilent, castUltimate, damageEnemy, switchStance, applyMarkToEnemy, detonateMarks } from './combat';

/** Callback set by main.ts to break circular dep with upgrades module */
export let onChestPickup: ((state: GameState) => void) | null = null;
export function setChestPickupHandler(handler: (state: GameState) => void): void {
  onChestPickup = handler;
}

// ═══════════════════════════════════
//       PLAYER UPDATE
// ═══════════════════════════════════

export function updatePlayers(state: GameState, dt: number): void {
  // Synchronous game over timer (replaces setTimeout race condition)
  if (state._gameOverTimer > 0) {
    state._gameOverTimer -= dt;
    if (state._gameOverTimer <= 0) {
      state._gameOverTimer = 0;
      if (state.gamePhase === GamePhase.GameOver) {
        const statsEl = document.getElementById('go-stats');
        if (statsEl) {
          const livesInfo = state.mode === NetworkMode.Local ? `<br>Lives Used: ${state.maxLives}` : '';
          statsEl.innerHTML = `Wave Reached: ${state.wave} / 20<br>Kills: ${state.totalKills}<br>Gold: ${state.gold}${livesInfo}`;
        }
        const goEl = document.getElementById('gameover');
        if (goEl) goEl.style.display = 'flex';
      }
    }
  }

  for (const p of state.players) {
    if (!p.alive) {
      // Cancel any active charge on death
      p._chargeSlot = -1;
      p._chargeLevel = 0;
      if (p.respawnTimer > 0) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0 && state.lives > 0 && state.gamePhase === GamePhase.Playing) {
          // Respawn this player
          state.lives--;
          p.alive = true;
          p.hp = Math.floor(p.maxHp * 0.5);
          p.mana = p.maxMana * 0.5;
          p.iframes = 2.0;
          p.respawnTimer = 0;
          p._animDeathFade = -1;
          p.x = ROOM_WIDTH / 2 + (p.idx === 0 ? -30 : 30);
          p.y = ROOM_HEIGHT * 0.6;
          p.vx = 0;
          p.vy = 0;
          p.stunTimer = 0;
          p.slowTimer = 0;
        } else if (p.respawnTimer <= 0 && state.lives <= 0 && state.gamePhase === GamePhase.Playing) {
          // No lives left -- check if all players dead for game over
          let allDead = true;
          for (let i = 0; i < state.players.length; i++) {
            if (state.players[i].alive) { allDead = false; break; }
          }
          if (allDead) {
            state.gamePhase = GamePhase.GameOver;
            document.exitPointerLock();
            document.body.classList.remove('in-game');
            state._gameOverTimer = GAME_OVER_DELAY_MS / 1000;
          }
        }
      }
      continue;
    }
    const input = getInput(state, p.idx);
    if (p.stunTimer > 0) { p.stunTimer -= dt; p._chargeSlot = -1; p._chargeLevel = 0; continue; }
    const slow = p.slowTimer > 0 ? WAVE_PHYSICS.SLOW_MOVE_MULT : 1;
    if (p.slowTimer > 0) p.slowTimer -= dt;

    // Reset move speed to form value for stance classes
    if (p.cls.stanceForms && p.currentForm) {
      const form = p.currentForm === 'A' ? p.cls.stanceForms.formA : p.cls.stanceForms.formB;
      if (form.moveSpeed) p.moveSpeed = form.moveSpeed;
    }

    // Aim follows mouse instantly
    if (!isNaN(input.angle)) p.angle = input.angle;

    // Absolute movement: W=up S=down A=left D=right
    let ms = p.moveSpeed * slow;
    // Charge-up movement slow
    if (p._chargeSlot >= 0) {
      const chargeDef = p.cls.spells[p._chargeSlot];
      if (chargeDef && chargeDef.chargeSlow) {
        ms *= chargeDef.chargeSlow;
      }
    }
    // Channel slow: reduce speed while channeling (Thunder God bypasses)
    if (p.channeling && p.channelSlot !== undefined && p._thunderGod <= 0) {
      const chDef = p.cls.spells[p.channelSlot];
      if (chDef && chDef.channelSlow !== undefined) {
        ms *= chDef.channelSlow;
      }
    }
    // Thunder God: +50% move speed
    if (p._thunderGod > 0) ms *= 1.5;
    let mvx = (input.mx || 0) * ms;
    let mvy = (input.my || 0) * ms;
    // Normalize diagonal
    const mvLen = Math.sqrt(mvx * mvx + mvy * mvy);
    if (mvLen > ms) { mvx *= ms / mvLen; mvy *= ms / mvLen; }
    p.vx = mvx;
    p.vy = mvy;
    p._animMoving = (Math.abs(p.vx) > 1 || Math.abs(p.vy) > 1);
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
    if (p._animCastFlash > 0) p._animCastFlash -= dt;
    if (p._animHitFlash > 0) p._animHitFlash -= dt;
    if (p._animUltTimer > 0) p._animUltTimer -= dt;

    // Ranger Eagle Eye: decay streak timer
    if (p._eagleEyeTimer > 0) {
      p._eagleEyeTimer -= dt;
      if (p._eagleEyeTimer <= 0) {
        p._eagleEyeStreak = 0;
        p._eagleEyeTimer = 0;
      }
    }

    // Stance switching timers
    if (p.formSwitchCd > 0) p.formSwitchCd -= dt;
    if (p.formSwitchBuff > 0) {
      p.formSwitchBuff -= dt;
      if (p.formSwitchBuff <= 0) {
        p._formDmgMult = 1;
        p._formArmor = 0;
      }
    }

    // Full Rotation timers
    if (p.fullRotation) {
      if (p.fullRotationTimer > 0) {
        p.fullRotationTimer -= dt;
        if (p.fullRotationTimer <= 0) {
          p.fullRotationSpells = 0;
        }
      }
      if (p.fullRotationBuff > 0) {
        p.fullRotationBuff -= dt;
      }
    }

    // Combo chain timer: increment per frame, reset chain if timeout exceeded
    if (p.comboChainSlot >= 0) {
      p.comboChainTimer += dt;
      const activeSpell = p.cls.spells[p.comboChainSlot];
      if (activeSpell?.combo && p.comboChainTimer >= activeSpell.combo.timeout) {
        p.comboChainCount = 0;
        p.comboChainSlot = -1;
        p.comboChainTimer = 0;
      }
    }

    // Thunder God ultimate: tick down buff timer + keep Storm Step off cooldown
    if (p._thunderGod > 0) {
      p._thunderGod = Math.max(0, p._thunderGod - dt);
      p.cd[2] = 0;
    }
    // Discharge shield: tick down active-field timer
    if (p._dischargeShield > 0) p._dischargeShield = Math.max(0, p._dischargeShield - dt);

    // Storm Shield: lightning strikes random nearby enemy every 1s
    if (p.stormShield) {
      p._stormTimer = (p._stormTimer || 0) + dt;
      if (p._stormTimer >= TIMING.STORM_SHIELD_TIME) {
        p._stormTimer = 0;
        // Find all enemies within range (using spatial grid for broad phase)
        const nearby: EnemyView[] = [];
        const shieldCandidates = state.enemyGrid.queryArea(p.x, p.y, RANGES.STORM_SHIELD);
        for (const idx of shieldCandidates) {
          const e = state.enemies.at(idx);
          if (!e.alive) continue;
          if (dist(p.x, p.y, e.x, e.y) <= RANGES.STORM_SHIELD) nearby.push(e);
        }
        if (nearby.length > 0) {
          const target = nearby[Math.floor(Math.random() * nearby.length)];
          damageEnemy(state, target, 1, p.idx);
          // Visual lightning bolt from player to target
          const stormBeam = state.beams.acquire();
          if (stormBeam) {
            stormBeam.x = p.x; stormBeam.y = p.y;
            stormBeam.angle = Math.atan2(target.y - p.y, target.x - p.x);
            stormBeam.range = dist(p.x, p.y, target.x, target.y);
            stormBeam.width = 2; stormBeam.color = '#bb66ff'; stormBeam.life = 0.15;
          }
        }
      }
    }

    // Rewind snapshot (save every 3s)
    p._snapTimer = (p._snapTimer || 0) + dt;
    if (p._snapTimer >= DUNGEON_TIMING.REWIND_SNAPSHOT_INTERVAL) {
      p._snapTimer = 0;
      p._rewindSnap = { hp: p.hp, mana: p.mana };
    }

    // ── SPELL CASTING ──
    const sd = p.cls.spells;

    // ── CHANNELING UPDATE ──
    if (p.channeling && p.channelSlot !== undefined) {
      const chSlot = p.channelSlot;
      const chDef = sd[chSlot];
      if (!chDef || !chDef.channel) {
        // Invalid channel state — reset
        p.channeling = false;
        p.channelTimer = 0;
        p.channelSlot = undefined;
        p.channelAngle = undefined;
      } else {
        p.channelTimer = (p.channelTimer || 0) + dt;
        // Track current aim so the channeled beam follows the mouse
        if (!isNaN(input.angle)) p.channelAngle = input.angle;

        // Determine if the cast key is still held
        const slotHeld = (chSlot === 0 && input.shoot)
          || (chSlot === 1 && input.shoot2)
          || (chSlot === 2 && input.ability)
          || (chSlot === 3 && input.ult);

        // Nova channels (Discharge): keep the shield topped up every frame so it
        // stays at full strength until the channel ends, then naturally fades.
        // Every 0.2s, stun any enemy currently inside the field for 0.3s so
        // anything that walks in gets pinned the moment it crosses the boundary.
        if (chDef.type === SpellType.Nova && p.clsKey === 'stormcaller') {
          p._dischargeShield = Math.max(p._dischargeShield, 0.5);
          // Static Charge drain: 20/sec while channeling
          p.mana = Math.max(0, p.mana - 20 * dt);
          const tickInterval = 0.2;
          const prevTicks = Math.floor(((p.channelTimer || 0) - dt) / tickInterval);
          const currTicks = Math.floor((p.channelTimer || 0) / tickInterval);
          if (currTicks > prevTicks) {
            const shieldR = chDef.range || 180;
            const tickDmg = 2;
            const cand = state.enemyGrid.queryArea(p.x, p.y, shieldR);
            for (const ei of cand) {
              const e = state.enemies.at(ei);
              if (!e.alive) continue;
              if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < shieldR * shieldR) {
                e.stunTimer = Math.max(e.stunTimer || 0, 0.3);
                damageEnemy(state, e, tickDmg, p.idx);
                spawnParticles(state, e.x, e.y, '#cc88ff', 2, 0.4);
              }
            }
          }
        }

        // Continuous beam channels: render beam + damage every frame (iframes gate rate)
        if (chDef.type === SpellType.Beam) {
          const inThunderGod = p._thunderGod > 0;
          const progress = inThunderGod ? 1 : Math.min(1, (p.channelTimer || 0) / chDef.channel);
          const fbBonus = Math.min(0.5, (p._channelDetStacks || 0) * 0.05);
          const scaledDmg = chDef.dmg * (1 + ((chDef.channelScale || 1) - 1) * progress) * (1 + fbBonus);
          const ang = p.channelAngle ?? p.angle;
          const range = chDef.range || 200;
          const beam = state.beams.acquire();
          if (beam) {
            beam.x = p.x; beam.y = p.y;
            beam.angle = ang;
            beam.range = range;
            beam.width = (chDef.width || 3) * (1 + progress * 0.5);
            beam.color = chDef.color;
            beam.life = 0.15;
          }
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);
          const step = 20;
          const hitThisFrame = new Set<number>();
          for (let d = 0; d < range; d += step) {
            const bx = p.x + cos * d;
            const by = p.y + sin * d;
            const nearby = state.enemyGrid.queryArea(bx, by, step);
            for (const ei of nearby) {
              if (hitThisFrame.has(ei)) continue;
              const e = state.enemies.at(ei);
              if (!e.alive) continue;
              if (e.iframes > 0) continue;
              if ((e.x - bx) ** 2 + (e.y - by) ** 2 < step * step) {
                damageEnemy(state, e, Math.ceil(scaledDmg), p.idx);
                // Static Charge: Stormcaller beam hits build charge (mana-as-charge)
                if (p.clsKey === 'stormcaller') {
                  p.mana = Math.min(p.maxMana, p.mana + 4);
                }
                if (chDef.applyMark) {
                  const maxStk = chDef.applyMark.maxStacks ?? 1;
                  const atMax = e._markName === chDef.applyMark.name && e._markStacks >= maxStk;
                  if (atMax || inThunderGod) {
                    const autoDet = { name: chDef.applyMark.name, dmgPerStack: 1.5 };
                    if (inThunderGod) {
                      e._markName = chDef.applyMark.name;
                      e._markStacks = maxStk;
                      e._markTimer = chDef.applyMark.duration;
                    }
                    detonateMarks(state, e, autoDet, p.idx, chDef.color);
                    if (p.clsKey === 'stormcaller') {
                      p.cd[2] = Math.max(0, (p.cd[2] || 0) - 0.3);
                      p._channelDetStacks = Math.min(10, (p._channelDetStacks || 0) + 1);
                      p.mana = Math.min(p.maxMana, p.mana + 10);
                    }
                  } else {
                    applyMarkToEnemy(state, e, chDef.applyMark, p.idx);
                  }
                }
                hitThisFrame.add(ei);
              }
            }
          }
          // Chain Lightning: arc from each primary hit to nearby unhit enemies
          if (p.chainLightning > 0 && hitThisFrame.size > 0) {
            for (const srcIdx of Array.from(hitThisFrame)) {
              const src = state.enemies.at(srcIdx);
              let arcsLeft = p.chainLightning;
              const cand = state.enemyGrid.queryArea(src.x, src.y, 150);
              for (const cIdx of cand) {
                if (arcsLeft <= 0) break;
                if (hitThisFrame.has(cIdx)) continue;
                const ce = state.enemies.at(cIdx);
                if (!ce.alive || ce.iframes > 0) continue;
                if ((ce.x - src.x) ** 2 + (ce.y - src.y) ** 2 < 150 * 150) {
                  damageEnemy(state, ce, Math.ceil(scaledDmg), p.idx);
                  if (p.clsKey === 'stormcaller') {
                    p.mana = Math.min(p.maxMana, p.mana + 4);
                  }
                  if (chDef.applyMark) {
                    const maxStk = chDef.applyMark.maxStacks ?? 1;
                    const atMax = ce._markName === chDef.applyMark.name && ce._markStacks >= maxStk;
                    if (atMax || inThunderGod) {
                      const autoDet = { name: chDef.applyMark.name, dmgPerStack: 1.5 };
                      if (inThunderGod) {
                        ce._markName = chDef.applyMark.name;
                        ce._markStacks = maxStk;
                        ce._markTimer = chDef.applyMark.duration;
                      }
                      detonateMarks(state, ce, autoDet, p.idx, chDef.color);
                      if (p.clsKey === 'stormcaller') {
                        p.cd[2] = Math.max(0, (p.cd[2] || 0) - 0.3);
                        p._channelDetStacks = Math.min(10, (p._channelDetStacks || 0) + 1);
                        p.mana = Math.min(p.maxMana, p.mana + 10);
                      }
                    } else {
                      applyMarkToEnemy(state, ce, chDef.applyMark, p.idx);
                    }
                  }
                  hitThisFrame.add(cIdx);
                  const arc = state.beams.acquire();
                  if (arc) {
                    arc.x = src.x; arc.y = src.y;
                    arc.angle = Math.atan2(ce.y - src.y, ce.x - src.x);
                    arc.range = Math.sqrt((ce.x - src.x) ** 2 + (ce.y - src.y) ** 2);
                    arc.width = 2;
                    arc.color = chDef.color;
                    arc.life = 0.12;
                  }
                  arcsLeft--;
                }
              }
            }
          }
        }

        // Channel completion or key release (Discharge also ends when Static Charge runs out)
        const chargeEmpty = chDef.type === SpellType.Nova && p.clsKey === 'stormcaller' && p.mana <= 0;
        if (!slotHeld || (p.channelTimer || 0) >= chDef.channel || chargeEmpty) {
          const progress = Math.min(1, (p.channelTimer || 0) / chDef.channel);

          // Non-Beam non-Nova channels (charge-and-release): fire the spell on completion
          // with scaled damage. Beam channels damage continuously and Nova channels
          // applied their burst on activation — neither re-fires here.
          if (chDef.type !== SpellType.Beam && chDef.type !== SpellType.Nova) {
            const scaledDmg = chDef.dmg * (1 + ((chDef.channelScale || 1) - 1) * progress);
            const origDmg = chDef.dmg;
            const origMana = chDef.mana;
            (chDef as any).dmg = Math.ceil(scaledDmg);
            (chDef as any).mana = 0; // already deducted at channel start
            p.channeling = false;
            castSpell(state, p, chSlot, p.channelAngle ?? p.angle);
            (chDef as any).dmg = origDmg;
            (chDef as any).mana = origMana;
          }

          // Reset Feedback Loop damage stacks when the channel ends
          p._channelDetStacks = 0;

          // Discharge shield: drop instantly on release instead of fading
          if (chDef.type === SpellType.Nova && p.clsKey === 'stormcaller') {
            p._dischargeShield = 0;
          }

          // Set cooldown (deferred from channel start)
          let cd = chDef.cd;
          if (p.bloodlust && p._bloodlustStacks > 0) {
            const speedBonus = Math.min(p._bloodlustStacks * 0.05, COMBAT.BLOODLUST_SPEED_CAP);
            cd = cd / (1 + speedBonus);
          }
          if (p.fullRotationBuff > 0) cd = cd / 3;
          p.cd[chSlot] = Math.max(CD_FLOORS[chSlot] ?? 0, cd);

          // Clear channeling state
          p.channeling = false;
          p.channelTimer = 0;
          p.channelSlot = undefined;
          p.channelAngle = undefined;
        }
      }
    }

    // Don't cast new spells while channeling
    if (!p.channeling) {
    // Primary (LMB) — with charge-up support
    const lmbDef = sd[0];
    if (lmbDef.chargeTime && lmbDef.chargeTime > 0) {
      // Charge-up spell
      if (input.shoot && p.cd[0] <= 0 && p.mana >= lmbDef.mana) {
        if (p._chargeSlot !== 0) {
          // Start charging
          p._chargeSlot = 0;
          p._chargeLevel = 0;
        } else {
          // Continue charging
          p._chargeLevel = Math.min(1, p._chargeLevel + dt / lmbDef.chargeTime);
        }
      }
      if (!input.shoot && p._chargeSlot === 0) {
        // Released — fire charged spell if we have mana
        if (p.cd[0] <= 0 && p.mana >= lmbDef.mana) {
          castChargedSpell(state, p, 0, input.angle, p._chargeLevel);
          p._animCastFlash = TIMING.ANIM_CAST;
          // Split shot support
          if (p.splitShot) {
            for (let ss = 1; ss <= p.splitShot; ss++) {
              const off = Math.ceil(ss / 2) * WAVE_PHYSICS.SPLIT_SHOT_ANGLE * (ss % 2 === 0 ? 1 : -1);
              castSpellSilent(state, p, 0, input.angle + off, COMBAT.SPLIT_SHOT_SIDE_DAMAGE_MULT);
            }
          }
          if (p.doubleTap) {
            for (let dt2 = 0; dt2 < p.doubleTap; dt2++) {
              setTimeout(() => castSpellSilent(state, p, 0, input.angle), 60 * (dt2 + 1));
            }
          }
        }
        p._chargeSlot = -1;
        p._chargeLevel = 0;
      }
    } else {
      // Original non-charge LMB logic (unchanged)
      if (input.shoot && p.cd[0] <= 0 && p.mana >= sd[0].mana) {
        castSpell(state, p, 0, input.angle);
        p._animCastFlash = TIMING.ANIM_CAST;
        if (p.splitShot) {
          for (let ss = 1; ss <= p.splitShot; ss++) {
            const off = Math.ceil(ss / 2) * WAVE_PHYSICS.SPLIT_SHOT_ANGLE * (ss % 2 === 0 ? 1 : -1);
            castSpellSilent(state, p, 0, input.angle + off, COMBAT.SPLIT_SHOT_SIDE_DAMAGE_MULT);
          }
        }
        if (p.doubleTap) {
          for (let dt2 = 0; dt2 < p.doubleTap; dt2++) {
            setTimeout(() => castSpellSilent(state, p, 0, input.angle), 60 * (dt2 + 1));
          }
        }
      }
    }

    // Secondary (RMB) — with charge-up support
    const rmbDef = sd[1];
    if (rmbDef.chargeTime && rmbDef.chargeTime > 0) {
      if (input.shoot2 && p.cd[1] <= 0 && p.mana >= rmbDef.mana) {
        if (p._chargeSlot !== 1) {
          p._chargeSlot = 1;
          p._chargeLevel = 0;
        } else {
          p._chargeLevel = Math.min(1, p._chargeLevel + dt / rmbDef.chargeTime);
        }
      }
      if (!input.shoot2 && p._chargeSlot === 1) {
        if (p.cd[1] <= 0 && p.mana >= rmbDef.mana) {
          castChargedSpell(state, p, 1, input.angle, p._chargeLevel);
          p._animCastFlash = TIMING.ANIM_CAST;
        }
        p._chargeSlot = -1;
        p._chargeLevel = 0;
      }
    } else {
      if (input.shoot2 && p.cd[1] <= 0 && p.mana >= sd[1].mana) {
        castSpell(state, p, 1, input.angle);
        p._animCastFlash = TIMING.ANIM_CAST;
      }
    }

    // Ability (Q) - only trigger once per press
    if (input.ability && p.cd[2] <= 0 && p.mana >= sd[2].mana && !state.keys[`_q${p.idx}`]) {
      state.keys[`_q${p.idx}`] = true;
      castSpell(state, p, 2, input.angle);
      p._animCastFlash = TIMING.ANIM_CAST;
      // Double Q: fire again after short delay
      if (p.doubleQ) {
        for (let dq = 0; dq < p.doubleQ; dq++) {
          setTimeout(() => castSpellSilent(state, p, 2, input.angle), 60 * (dq + 1));
        }
      }
    }
    if (!input.ability) state.keys[`_q${p.idx}`] = false;

    // Ultimate (Space) / Stance Switch
    if (input.ult && !state.keys[`_r${p.idx}`]) {
      state.keys[`_r${p.idx}`] = true;
      if (p.cls.stanceForms) {
        // Stance classes: Space switches form
        if (p.formSwitchCd <= 0) {
          switchStance(state, p);
          p._animCastFlash = TIMING.ANIM_CAST;
        }
      } else {
        // Normal classes: Space casts ultimate
        const ultThreshold = p.ultOverflow ? COMBAT.ULT_THRESHOLD_OVERFLOW : COMBAT.ULT_THRESHOLD;
        if (p.ultCharge >= ultThreshold) {
          const wasOverflowed = p.ultOverflow && p.ultCharge >= COMBAT.ULT_THRESHOLD_OVERFLOW;
          castUltimate(state, p, input.angle);
          p._animCastFlash = TIMING.ANIM_CAST;
          if (wasOverflowed) {
            // Overflow: cast a second time
            castUltimate(state, p, input.angle);
          }
        }
      }
    }
    if (!input.ult) state.keys[`_r${p.idx}`] = false;
    } // end !channeling guard

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
    if (p._hasteBonus) p.moveSpeed = Math.max(p.moveSpeed, DEFAULT_MOVE_SPEED * 1.15);

    // Berserker: fury below 50% HP
    p._furyActive = p.clsKey === 'berserker' && p.hp <= p.maxHp / 2;
    if (p._furyActive) p.moveSpeed = Math.max(p.moveSpeed, DEFAULT_MOVE_SPEED * 1.5);

    // Proximity aura damage
    if (p.cls.passive.proximityBonus?.aura) {
      p._proximityAuraTick -= dt;
      if (p._proximityAuraTick <= 0) {
        p._proximityAuraTick = COMBAT.PROXIMITY_AURA_TICK_RATE;
        const auraRange = p.cls.passive.proximityBonus.range + (p.closeQuarters * 20);
        const auraDmg = p.cls.passive.proximityBonus.aura * COMBAT.PROXIMITY_AURA_TICK_RATE;
        // Use spatial grid for efficiency
        const candidates = state.enemyGrid.queryArea(p.x, p.y, auraRange);
        for (const idx of candidates) {
          const e = state.enemies.at(idx);
          if (!e.alive) continue;
          if (dist(p.x, p.y, e.x, e.y) < auraRange) {
            damageEnemy(state, e, Math.max(1, Math.round(auraDmg)), p.idx);
          }
        }
      }
    }

    // Druid: Regrowth - regen 1 HP every 7 seconds
    if (p.clsKey === 'druid') {
      p._auraTick = (p._auraTick || 0) + dt;
      if (p._auraTick >= 7) {
        p._auraTick = 0;
        if (p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          spawnText(state, p.x, p.y - 20, '+1 HP', '#44aa33');
        }
      }
    }

    // Monk: Inner Peace - 25% dodge naturally (added at creation, stacks with Dodge upgrade)
    // Applied via dodgeChance in damagePlayer, set below
    if (p.clsKey === 'monk' && p.dodgeChance < COMBAT.MONK_DODGE_CHANCE) {
      p.dodgeChance = COMBAT.MONK_DODGE_CHANCE;
    }

    // Paladin: aura of light - heal nearby ally 2 HP/s
    if (p.clsKey === 'paladin') {
      const ally = state.players[1 - p.idx];
      if (ally && ally.alive && dist(p.x, p.y, ally.x, ally.y) < RANGES.AURA) {
        p._auraTick = (p._auraTick || 0) + dt;
        if (p._auraTick >= TIMING.AURA_HEAL_TICK) {
          p._auraTick = 0;
          if (ally.hp < ally.maxHp) {
            ally.hp = Math.min(ally.maxHp, ally.hp + 1);
            spawnText(state, ally.x, ally.y - 20, '+1', '#ffffaa');
          }
        }
      }
    }

    // Graviturge: gravity well aura — enemies within 80 units take 0.5 dps, each nearby enemy grants +1 mana/s
    if (p.clsKey === 'graviturge') {
      let nearbyCount = 0;
      for (const e of state.enemies) {
        if (!e.alive || e._friendly) continue;
        if (dist(p.x, p.y, e.x, e.y) < 80) {
          nearbyCount++;
          e.hp -= 0.5 * dt;
          if (e.hp <= 0 && e._deathTimer < 0) {
            damageEnemy(state, e, 1, p.idx);
          }
        }
      }
      if (nearbyCount > 0) {
        p.mana = Math.min(p.maxMana, p.mana + nearbyCount * 1 * dt);
      }
    }

    // Bladecaller: kill rush speed boost decay
    if (p.clsKey === 'bladecaller' && p._rushSpeed && p._rushSpeed > state.time) {
      p.moveSpeed = Math.max(p.moveSpeed, DEFAULT_MOVE_SPEED * 1.1);
    }

    // Bladecaller: Phantom Veil stealth tick + heal-over-time + ms boost
    if (p.clsKey === 'bladecaller' && p._stealth > 0) {
      p._stealth -= dt;
      // Heal over stealth duration: 4 HP spread across 2s = 2 HP/s
      const q = p.cls.spells[2];
      const healTotal = q?.heal || 4;
      const dur = q?.duration || 2;
      p.hp = Math.min(p.maxHp, p.hp + (healTotal / dur) * dt);
      // +30% move speed while veiled
      const clsMs = p.cls.moveSpeed ?? DEFAULT_MOVE_SPEED;
      p.moveSpeed = Math.max(p.moveSpeed, clsMs * 1.3);
      if (p._stealth <= 0) {
        p._stealth = 0;
        // Crit-pending persists briefly past veil end so the first attack out of stealth still crits
      }
    }
    // Stealth shield decay (brief shield from stealth-crit kill)
    if (p._stealthShield > 0) p._stealthShield -= dt;

    // Bladecaller: Thousand Cuts flurry — teleport-dash between nearest targets
    if (p.clsKey === 'bladecaller' && p._bladeFlurry > 0) {
      p._bladeFlurry -= dt;
      p._bladeFlurryTick -= dt;
      p.iframes = Math.max(p.iframes, 0.2);
      const clsMs = p.cls.moveSpeed ?? DEFAULT_MOVE_SPEED;
      p.moveSpeed = Math.max(p.moveSpeed, clsMs * 1.3);
      if (p._bladeFlurryTick <= 0) {
        p._bladeFlurryTick = 0.2;
        // Pick the nearest living non-friendly enemy; teleport next to it; strike it.
        let nearest: any = null;
        let nearestD = Infinity;
        for (const e of state.enemies) {
          if (!e.alive || e._friendly || e._deathTimer >= 0) continue;
          const d = dist(p.x, p.y, e.x, e.y);
          if (d < nearestD) { nearestD = d; nearest = e; }
        }
        if (nearest) {
          // Dash-teleport to a random offset around the target (slashing pass)
          const offA = Math.random() * Math.PI * 2;
          const offD = 18 + Math.random() * 8;
          spawnParticles(state, p.x, p.y, '#cc3355', 6, 0.3);
          p.x = nearest.x + Math.cos(offA) * offD;
          p.y = nearest.y + Math.sin(offA) * offD;
          p.angle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
          const dmg = Math.round(6 * (p.ultPower || 1)) * 2; // 2x auto-crit
          damageEnemy(state, nearest, dmg, p.idx);
          // Bonus lifesteal during flurry (20% on top of baseline)
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

    // Architect: fortification near own zones — 20% DR flag + bonus mana regen
    if (p.clsKey === 'architect') {
      p._fortified = false;
      for (const z of state.zones) {
        if (!z || z.duration <= 0 || z.owner !== p.idx) continue;
        if (dist(p.x, p.y, z.x, z.y) < z.radius) {
          p._fortified = true;
          p.mana = Math.min(p.maxMana, p.mana + 1 * dt);
          break;
        }
      }
    }

    // Warden: sentinel — 20% DR when facing enemies, mark melee attackers
    if (p.clsKey === 'warden') {
      p._facingDR = false;
      for (const e of state.enemies) {
        if (!e.alive || e._friendly) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < 100) {
          const aimAngle = Math.atan2(e.y - p.y, e.x - p.x);
          const diff = Math.abs(((aimAngle - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff < Math.PI / 3) {
            p._facingDR = true;
          }
          // Mark melee-range enemies for ally bonus damage
          if (d < 50) {
            e._wardenMark = true;
          }
        }
      }
    }

    // Warden DR decay
    if (p._wardenDR > 0) p._wardenDR -= dt;
    // Invuln timer decay
    if (p._invulnTimer > 0) p._invulnTimer -= dt;

    // Tidecaller: count active summons for Rising Tide passive
    if (p.clsKey === 'tidecaller') {
      let summonCount = 0;
      for (const e of state.enemies) {
        if (e.alive && e._friendly && e._owner === p.idx) summonCount++;
      }
      p._summonCount = Math.min(3, summonCount);
    }

    // Time stop decay
    if (p._timeStopTimer > 0) {
      p._timeStopTimer -= dt;
      if (p._timeStopTimer <= 0) p.moveSpeed = p.cls.moveSpeed ?? DEFAULT_MOVE_SPEED;
    }

    // Haste zone speed boost decay
    if (p._hasteTimer > 0) {
      p.moveSpeed = Math.max(p.moveSpeed, DEFAULT_MOVE_SPEED * 2);
      p._hasteTimer -= dt;
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

    // Resurrection cooldown decay
    if (p._resurrectionCd > 0) p._resurrectionCd -= dt;

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
        p.x += (dx / dLen) * RANGES.DASH_DISTANCE;
        p.y += (dy / dLen) * RANGES.DASH_DISTANCE;
        p.x = clamp(p.x, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
        p.y = clamp(p.y, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
        p.iframes = Math.max(p.iframes, TIMING.IFRAME_DASH);
        netSfx(state, SfxName.Blink);
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
        const pull = RANGES.MAGNET_PULL * dt;
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
        netSfx(state, SfxName.Pickup);
        if (pk.type === PickupType.Chest) {
          if (onChestPickup) onChestPickup(state);
        } else if (pk.type === PickupType.Health) {
          const healAmt = healthPickupAmount(state.wave);
          p.hp = Math.min(p.maxHp, p.hp + healAmt);
          spawnText(state, pk.x, pk.y - 15, '+' + healAmt + ' HP', '#44ff88');
        } else if (pk.type === PickupType.Gold) {
          state.gold += pk.value;
          spawnText(state, pk.x, pk.y - 10, '+' + pk.value + 'g', '#ddcc44');
        } else if (pk.type === PickupType.Xp) {
          const xpGain = Math.ceil(pk.value * (1 + p.xpBoost));
          p.xp += xpGain;
          spawnText(state, pk.x, pk.y - 10, '+' + xpGain + ' XP', '#88ccff');
          while (p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level++;
            // Passive max HP growth: +1 every 3 levels
            if (p.level > 0 && p.level % HP_LEVEL_INTERVAL === 0) {
              p.maxHp += 1;
              p.hp = Math.min(p.maxHp, p.hp + 1); // also heal 1 when max increases
            }
            p.xpToNext += getXpStep(p.level);
            if (onChestPickup) onChestPickup(state);
          }
        }
      }
    }
  }
}
