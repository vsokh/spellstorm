# Rebalance Task Cards -- Wizard Duel

**Date:** 2026-04-13
**Source:** [Power Scaling Audit](./power-scaling-audit.md), [Progression Rebalance Plan](./progression-rebalance-plan.md)
**Status:** Ready for implementation

---

## Summary

- **Total task cards:** 16
- **Phase 1 (P1 Critical):** 7 tasks (RC-01 through RC-07)
- **Phase 2 (P2 High):** 5 tasks (RC-08 through RC-12)
- **Phase 3 (P3 Polish):** 4 tasks (RC-13 through RC-16)

### Recommended Execution Order

**Phase 1** -- implement together, test as a unit:
1. RC-01 (CD floor constants) and RC-04 (Split Shot constant) -- no dependencies, pure constants
2. RC-05 (Global bonus damage soft cap) -- foundational for DPS compression
3. RC-06 (Evolution additive cap) -- depends on soft cap being in place
4. RC-02 (Boss HP formula) -- formula change, independent
5. RC-03 (Boss damage reduction phase) -- depends on RC-02
6. RC-07 (Crit damage cap via 3e) -- covered by RC-06, verification only

**Phase 2** -- after P1 is playtested and stable:
1. RC-08 (Smooth enemy count) -- independent
2. RC-10 (Strengthen timeMul) -- independent, trivial
3. RC-11 (Bloodlust cap) -- independent
4. RC-09 (Boss wave XP boost) -- independent but best tested after RC-08
5. RC-12 (Enemy HP multiplicative component) -- depends on RC-10

**Phase 3** -- after P2 is playtested and stable:
1. RC-13 (hpScale smoothing) -- trivial, independent
2. RC-14 (Late-game elite enemies) -- independent, medium effort
3. RC-15 (Upgrade choice count increase) -- independent
4. RC-16 (Cursed upgrades) -- depends on RC-15

### Dependency Graph

```
Phase 1 (P1 Critical):
  RC-01 (CD Floor) ─────────────────────────────┐
  RC-02 (Boss HP Formula) ──> RC-03 (Boss Phase) │
  RC-04 (Split Shot Nerf) ──────────────────────┤
  RC-05 (Bonus Dmg Soft Cap) ──> RC-06 (Evo Cap) ├──> [P1 Playtest Gate]
  RC-07 (Crit Cap = RC-06 verification) ────────┘

Phase 2 (P2 High):
  [P1 Playtest Gate] ──> RC-08 (Enemy Count Curve) ─┐
                    ──> RC-09 (Boss XP Boost)  ──────┤
                    ──> RC-10 (timeMul Buff) ────────┤
                    ──> RC-11 (Bloodlust Cap) ───────┤
                    ──> RC-12 (Enemy HP Mult) ───────┴──> [P2 Playtest Gate]
                          (depends on RC-10)

Phase 3 (P3 Polish):
  [P2 Playtest Gate] ──> RC-13 (hpScale Smoothing) ──────┐
                    ──> RC-14 (Elite Enemies) ────────────┤
                    ──> RC-15 (Choice Count) ──> RC-16 ───┴──> [P3 Playtest Gate]
                                              (Cursed Upgrades)
```

---

## Phase 1 -- Priority 1 (Critical)

All P1 tasks should be implemented together and playtested as a unit. Implementing only some P1 changes creates an imbalanced intermediate state.

---

### RC-01: Cooldown reduction floor

**Priority:** P1
**Phase:** Phase 1, Step 1-2
**Depends on:** None
**Files:** `src/constants.ts`, `src/systems/combat.ts`
**Scope:** Add minimum cooldown floor constants and enforce them in the combat system. After all cooldown multipliers are applied (Rapid Fire 0.6x, Swift Cast 0.8x, Spell Mastery 0.7x), clamp the result to the floor using `Math.max(cdFloor, baseCd * allMultipliers)`. This prevents the 100-projectile-per-second absurdity while still allowing players to feel a meaningful fire rate increase (Pyromancer goes from 0.35s to 0.15s = 2.3x faster).
**Acceptance criteria:**
- `CD_FLOOR_PRIMARY = 0.15` defined in `src/constants.ts`
- `CD_FLOOR_SECONDARY = 1.0` defined in `src/constants.ts`
- `CD_FLOOR_Q = 2.0` defined in `src/constants.ts`
- Primary attack cooldown never goes below 0.15s regardless of how many CD reduction upgrades are stacked (Rapid Fire + Swift Cast + Spell Mastery combined)
- Secondary attack cooldown never goes below 1.0s
- Q ability cooldown never goes below 2.0s
- Pyromancer primary with Rapid Fire + Swift Cast + Spell Mastery: `max(0.15, 0.35 * 0.6 * 0.8 * 0.7) = max(0.15, 0.118) = 0.15s`
- Monk Chi Blast with same stack: `max(0.15, 0.25 * 0.336) = max(0.15, 0.084) = 0.15s`
- Maximum primary fire rate is 6.67 casts/sec (1 / 0.15)
**Estimated effort:** Low

---

### RC-02: Boss HP exponential scaling formula

**Priority:** P1
**Phase:** Phase 1, Step 1
**Depends on:** None
**Files:** `src/constants.ts`, `src/systems/dungeon.ts`
**Scope:** Replace the linear boss HP formula `ceil((baseHP + wave * 4) * timeMul)` with an exponential formula `ceil(baseHP * (1.4 ^ (wave / 5)) * timeMul)`. Similarly update the Archlord formula from `ceil((60 + wave * 5) * timeMul)` to use the same exponential structure with its higher base HP. Add the exponent constants to `src/constants.ts`.
**Acceptance criteria:**
- `BOSS_HP_EXPONENT = 1.4` defined in `src/constants.ts`
- `BOSS_HP_EXPONENT_DIVISOR = 5` defined in `src/constants.ts`
- Boss HP formula is `ceil(baseHP * (BOSS_HP_EXPONENT ^ (wave / BOSS_HP_EXPONENT_DIVISOR)) * timeMul)`
- Wave 5 Golem: `ceil(20 * 1.4^1 * 1.04) = ceil(29.12) = 30 HP`
- Wave 10 Demon: `ceil(25 * 1.4^2 * 1.08) = ceil(52.92) = 53 HP`
- Wave 15 Golem: `ceil(20 * 1.4^3 * 1.12) = ceil(61.47) = 62 HP`
- Wave 20 Archlord: `ceil(60 * 1.4^4 * 1.16) = ceil(267.17) = 267 HP` (using Archlord base HP of 60)
- Old linear `wave * 4` or `wave * 5` additive term is removed from boss HP calculation
**Estimated effort:** Low

---

### RC-03: Boss damage reduction phase mechanic

**Priority:** P1
**Phase:** Phase 1, Step 3
**Depends on:** RC-02
**Files:** `src/systems/combat.ts`, `src/systems/dungeon.ts`
**Scope:** Add a damage reduction phase to wave 15 and wave 20 bosses. When the boss drops below 50% HP, it enters a "shielded" state with 50% damage reduction lasting 3 seconds. This requires new boss state tracking (a phase flag and a countdown timer), damage reduction logic in the combat system, and a visual indicator (shield effect or glow change) so the player understands why damage numbers appear reduced. The phase triggers once per boss fight and guarantees a minimum fight duration even against extreme builds.
**Acceptance criteria:**
- Wave 15 Golem and Wave 20 Archlord activate a damage reduction phase at 50% HP
- During the phase, all incoming damage is multiplied by 0.5 (50% reduction)
- The phase lasts exactly 3 seconds, then normal damage resumes
- The phase triggers at most once per boss fight (not re-triggerable)
- A visual indicator is displayed during the phase (shield effect, color shift, or similar)
- Damage numbers during the phase are visually distinct (smaller, grayed out, or marked)
- Wave 5 Golem and Wave 10 Demon do NOT have the damage reduction phase
- With P1 changes combined, Archlord fight lasts approximately 15-20 seconds (267 HP + phase vs ~100 DPS)
**Estimated effort:** Medium

---

### RC-04: Split Shot side bolt damage reduction

**Priority:** P1
**Phase:** Phase 1, Step 1-2
**Depends on:** None
**Files:** `src/constants.ts`, `src/systems/combat.ts`
**Scope:** Reduce the damage dealt by Split Shot side projectiles from 100% to 60% of the primary bolt's damage. The central bolt continues to deal full damage. When spawning side bolts in the projectile creation logic, multiply the damage value by the `SPLIT_SHOT_SIDE_DAMAGE_MULT` constant. This brings the effective DPS multiplier from Split Shot down from 2.2-3.0x to 1.6-2.2x.
**Acceptance criteria:**
- `SPLIT_SHOT_SIDE_DAMAGE_MULT = 0.6` defined in `src/constants.ts`
- Central (main) projectile deals full damage (unchanged)
- Both side projectiles deal `damage * 0.6`
- With a 5-damage primary: center bolt = 5, each side bolt = 3
- Effective DPS multiplier from Split Shot is 1.6-2.2x (down from 2.2-3.0x), depending on hit rate
- Split Shot remains one of the strongest upgrades in the game (60-120% DPS increase)
**Estimated effort:** Low

---

### RC-05: Global bonus damage soft cap

**Priority:** P1
**Phase:** Phase 1, Step 2
**Depends on:** None
**Files:** `src/constants.ts`, `src/systems/combat.ts`
**Scope:** Implement a hyperbolic soft cap on total combined flat bonus damage from all sources (Spell Power, Primary Boost, evolution flat bonuses). The first 6 points of bonus damage are uncapped. Beyond 6, a hyperbolic diminishing formula applies: `effectiveBonus = 6 + (totalBonus - 6) * (1 - 1 / (1 + (totalBonus - 6) / 6))`. This requires aggregating all flat damage bonus contributions into a single total before applying the cap, then using the capped value for damage calculation.
**Acceptance criteria:**
- `BONUS_DMG_SOFT_CAP_THRESHOLD = 6` defined in `src/constants.ts`
- `BONUS_DMG_SOFT_CAP_KNEE = 6` defined in `src/constants.ts`
- Total bonus <= 6: effective bonus equals total bonus (no reduction)
- Total bonus = 8: effective bonus = 6.67 (mild reduction)
- Total bonus = 10: effective bonus = 7.50
- Total bonus = 12: effective bonus = 8.00 (67% efficiency on excess)
- Total bonus = 16: effective bonus = 9.00
- Total bonus = 20: effective bonus = 9.71 (hard diminishing)
- All flat damage sources are aggregated before the cap (Spell Power + Primary Boost + evolution flat bonuses)
- Early-game damage (first 2-3 Spell Power picks) is unaffected since total stays <= 6
- Late-game stacking (+15 total) yields ~9 effective instead of 15 (40% reduction)
**Estimated effort:** Medium

---

### RC-06: Evolution upgrades additive cap with parent

**Priority:** P1
**Phase:** Phase 1, Step 2
**Depends on:** RC-05
**Files:** `src/constants.ts`, `src/systems/upgrades.ts`
**Scope:** Change how evolution upgrades interact with their parent upgrade stacks. Instead of adding their flat bonus on top of the parent's accumulated bonus, evolutions replace the parent's bonus with a capped total. Spell Mastery caps the Spell Power path at +7 total flat damage (up from +4.63 base, but less than the current +9.63 combined). Primary Overload caps the Primary Boost path at +10 total flat damage (up from +7.72, less than current +13.72). Lethal Precision is nerfed to +25% crit chance (down from +30%) and 2.5x crit multiplier (down from 3x). Void Lance's +3 primary damage remains unchanged (subject to the global soft cap from RC-05).
**Acceptance criteria:**
- Spell Mastery evolution: total Spell Power path bonus is capped at +7 flat damage (not +4.63 base + 5 evolution = 9.63)
- Spell Mastery -30% CD component is unchanged
- Primary Overload evolution: total Primary Boost path bonus is capped at +10 flat damage (not +7.72 base + 6 evolution = 13.72)
- Primary Overload AoE +3 component is unchanged
- `LETHAL_PRECISION_CRIT_CHANCE = 0.25` defined in `src/constants.ts` (down from 0.30)
- `LETHAL_PRECISION_CRIT_MULT = 2.5` defined in `src/constants.ts` (down from 3.0)
- With 3 stacks Critical Strike (31%) + Lethal Precision: total crit chance = 56% (down from 61%)
- Average damage multiplier from crit path: `0.44 * 1 + 0.56 * 2.5 = 1.84x` (down from 2.22x, an 18% reduction)
- Void Lance +3 primary damage unchanged
**Estimated effort:** Medium

---

### RC-07: Crit damage cap (verification of RC-06)

**Priority:** P1
**Phase:** Phase 1, Step 2
**Depends on:** RC-06
**Files:** `src/constants.ts`, `src/systems/upgrades.ts`
**Scope:** This is not a separate implementation task -- the crit damage cap is fully covered by RC-06's Lethal Precision changes. This task card exists for verification and documentation purposes. Confirm that after RC-06, the base crit multiplier remains 2x for non-evolution crit builds, and Lethal Precision provides 2.5x (not 3x). Verify the total average damage multiplier from the full crit path is 1.84x instead of the previous 2.22x.
**Acceptance criteria:**
- Base crit multiplier without Lethal Precision: 2x (unchanged)
- Lethal Precision crit multiplier: 2.5x (verified from RC-06)
- Lethal Precision crit chance bonus: +25% (verified from RC-06)
- With max Critical Strike (31%) + Lethal Precision: 56% chance for 2.5x = 1.84x average multiplier
- Without Lethal Precision: 31% chance for 2x = 1.31x average multiplier (unchanged from current)
- Crit builds remain strong but no longer dominate all other paths (17% reduction in average crit damage)
**Estimated effort:** Low (verification only)

---

## Phase 2 -- Priority 2 (High)

Implement after Phase 1 is playtested and stable. These changes can be tuned based on P1 playtesting results.

---

### RC-08: Smooth enemy count curve

**Priority:** P2
**Phase:** Phase 2, Step 5
**Depends on:** None (requires P1 playtest gate)
**Files:** `src/systems/dungeon.ts`
**Scope:** Replace the current 3-tier enemy count formula with a single smooth formula: `count = floor(5 + wave * 2.5 + floor(wave / 8) * wave)`. The current formula creates a 79% jump at wave 8 (19 to 34 enemies), causing a massive XP windfall that grants 2+ levels instantly. The new formula smooths this transition and slightly reduces late-game counts (fewer but individually tougher enemies when combined with HP changes).
**Acceptance criteria:**
- Enemy count formula is a single expression: `floor(5 + wave * 2.5 + floor(wave / 8) * wave)`
- Wave 1: 7 enemies (unchanged)
- Wave 7: 22 enemies (up from 19, smoother ramp)
- Wave 8: 28 enemies (down from 34, removes the jarring jump)
- Wave 14: 52 enemies (unchanged)
- Wave 16: 61 enemies (down from 79)
- Wave 19: 71 enemies (down from 91)
- No more than a 25% increase in enemy count between any two consecutive non-boss waves
- Total XP over a full run decreases by roughly 15% (resulting in ~1-2 fewer upgrades by wave 20)
**Estimated effort:** Low

---

### RC-09: Boss wave XP boost with minion trickle-spawn

**Priority:** P2
**Phase:** Phase 2, Step 5
**Depends on:** None (requires P1 playtest gate)
**Files:** `src/constants.ts`, `src/systems/dungeon.ts`
**Scope:** Increase boss base XP values so boss waves are rewarding milestones rather than XP valleys. Change boss gem drops from 1 gem to 3 gems (same total XP, more satisfying pickup). Increase boss minion count by +3 at each boss wave. Implement a trickle-spawn timer for boss minions: instead of spawning all at once, minions spawn over a 10-second window to extend the encounter feel and provide sustained XP during the fight.
**Acceptance criteria:**
- Boss base XP: Golem wave 5 = 60, Demon wave 10 = 80, Golem wave 15 = 100, Archlord wave 20 = 150
- Bosses drop 3 XP gems instead of 1 (total XP unchanged per boss, just split into 3 pickups)
- Boss minion count is increased by +3 at each boss wave compared to current values
- Boss minions spawn over a 10-second trickle window (not all at once)
- Wave 5 total XP: ~110 (up from ~56, a 96% increase)
- Wave 10 total XP: ~160 (up from ~85, an 88% increase)
- Wave 15 total XP: ~190 (up from ~95, a 100% increase)
- Wave 20 total XP: ~300 (up from ~166, an 81% increase)
- Boss waves no longer feel like XP valleys relative to adjacent normal waves
**Estimated effort:** Low-Medium

---

### RC-10: Strengthen time-based scaling (timeMul)

**Priority:** P2
**Phase:** Phase 2, Step 6
**Depends on:** None (requires P1 playtest gate)
**Files:** `src/constants.ts`
**Scope:** Increase the time-based scaling factor from 0.05 to 0.12 per minute. Change the `TIME_SCALING_FACTOR` constant so that `timeMul = 1 + (state.time / 60) * 0.12`. This makes time pressure a real factor: a slow player at wave 15 (minute 15) faces enemies with 30% more HP instead of the current negligible 12.5%.
**Acceptance criteria:**
- `TIME_SCALING_FACTOR = 0.12` in `src/constants.ts` (changed from 0.05)
- At 5 minutes: timeMul = 1.12 (up from 1.05)
- At 10 minutes: timeMul = 1.20 (up from 1.08)
- At 15 minutes: timeMul = 1.30 (up from 1.13)
- At 18 minutes: timeMul = 1.36 (up from 1.15)
- Time pressure creates meaningful urgency in late-game decision-making
- Fast, skilled players are rewarded with an easier run
**Estimated effort:** Low (single constant change)

---

### RC-11: Bloodlust attack speed cap with crit overflow

**Priority:** P2
**Phase:** Phase 2, Step 6
**Depends on:** None (requires P1 playtest gate)
**Files:** `src/constants.ts`, `src/systems/upgrades.ts` or `src/systems/combat.ts`
**Scope:** Cap the Berserker's Bloodlust attack speed bonus at +100% (reached at 20 kills). After the speed cap is reached, each subsequent kill grants +1% crit chance instead, capped at +15%. This prevents the current situation where 300+ kills yield +1500% attack speed (16x fire rate), making Bloodlust bounded but still powerful: 2x attack speed + 15% crit chance from 35 total kills.
**Acceptance criteria:**
- `BLOODLUST_SPEED_CAP = 1.0` defined in `src/constants.ts` (100% max bonus = 2x speed)
- `BLOODLUST_CRIT_CAP = 0.15` defined in `src/constants.ts` (15% max crit bonus)
- Bloodlust attack speed bonus: +5% per kill, capped at +100% (20 kills)
- After reaching speed cap, each kill grants +1% crit chance instead
- Crit chance overflow capped at +15% (reached at 35 total kills: 20 for speed + 15 for crit)
- At saturation: Bloodlust provides 2x attack speed and +15% crit chance
- Speed cap is reached during wave 3-4 (20 kills), giving the Berserker full speed bonus early
- Bloodlust value is significant but bounded and comparable to other class augments
**Estimated effort:** Low

---

### RC-12: Enemy HP multiplicative wave component

**Priority:** P2
**Phase:** Phase 2, Step 6
**Depends on:** RC-10
**Files:** `src/constants.ts`, `src/systems/dungeon.ts`
**Scope:** Add a multiplicative wave-based component to the enemy HP formula: `hp = ceil((baseHP + hpScale - 1) * timeMul * (1 + wave * 0.04))`. The added `(1 + wave * ENEMY_HP_WAVE_MULT)` term makes enemy HP growth track closer to the player's multiplicative DPS growth. At wave 15, enemies have roughly 60% more HP than before, which combined with the P1 DPS nerfs means enemies survive 2-3 hits instead of being one-shot.
**Acceptance criteria:**
- `ENEMY_HP_WAVE_MULT = 0.04` defined in `src/constants.ts`
- HP formula becomes: `ceil((baseHP + hpScale - 1) * timeMul * (1 + wave * ENEMY_HP_WAVE_MULT))`
- Wave 5 enemies: 1.2x HP multiplier (minor increase)
- Wave 10 enemies: 1.4x HP multiplier (noticeable)
- Wave 15 enemies: 1.6x HP multiplier (significant)
- Wave 20 enemies: 1.8x HP multiplier (major)
- Wraith at wave 15 (with updated timeMul from RC-10): ~17 HP (up from current ~10)
- Shieldbearer at wave 15: ~27 HP (up from current ~16)
- Wraith at wave 20: ~22 HP (up from current ~12)
- Shieldbearer at wave 20: ~33 HP (up from current ~18)
- Late-game enemies survive 2-3 hits from a damage-focused build (combined with P1 DPS compression)
**Estimated effort:** Low

---

## Phase 3 -- Priority 3 (Polish)

Implement after Phase 2 is playtested and stable. These changes add variety and smooth remaining rough edges.

---

### RC-13: hpScale formula smoothing

**Priority:** P3
**Phase:** Phase 3, Step 8
**Depends on:** None (requires P2 playtest gate)
**Files:** `src/systems/dungeon.ts`
**Scope:** Replace the current 2-tier hpScale formula (waves 1-10: `1 + floor(wave/4)`, waves 11+: `2 + floor(wave/3)`) with a single smooth formula: `hpScale = 1 + floor(wave * 0.6)`. The current formula has a discontinuity at wave 11 (hpScale jumps from 3 to 5, a 67% increase). The new formula provides smooth, predictable HP growth with no sudden jumps. The proposed values are generally higher than current, providing a built-in HP buff that works alongside the multiplicative component from RC-12.
**Acceptance criteria:**
- hpScale uses a single formula for all waves: `1 + floor(wave * 0.6)`
- No conditional logic switching between wave ranges
- Wave 1: hpScale = 1 (unchanged)
- Wave 5: hpScale = 4 (up from 2)
- Wave 8: hpScale = 5 (up from 3)
- Wave 10: hpScale = 7 (up from 3)
- Wave 11: hpScale = 7 (previously 5, no discontinuity from wave 10)
- Wave 15: hpScale = 10 (up from 7)
- Wave 20: hpScale = 13 (up from 8)
- Transition from wave 10 to wave 11 is smooth (7 to 7, not 3 to 5)
**Estimated effort:** Low

---

### RC-14: Late-game elite enemy system

**Priority:** P3
**Phase:** Phase 3, Step 9
**Depends on:** None (requires P2 playtest gate)
**Files:** `src/constants.ts`, `src/systems/dungeon.ts`, `src/systems/combat.ts`, rendering/visual system
**Scope:** Implement an elite enemy variant system for late-game waves. From wave 13+, 10% of spawned enemies are "elite" variants; from wave 17+, 20%. Elite enemies have 2.5x HP, 1.3x damage, a golden glow visual effect, and drop 2x XP on death. They use the same speed and behavior as their base type. This requires: adding an elite flag to the enemy spawn system, applying HP/damage multipliers during spawn, rendering the golden glow effect, and doubling XP drops for elites.
**Acceptance criteria:**
- `ELITE_SPAWN_RATE_WAVE_13 = 0.10` defined in `src/constants.ts`
- `ELITE_SPAWN_RATE_WAVE_17 = 0.20` defined in `src/constants.ts`
- `ELITE_HP_MULT = 2.5` defined in `src/constants.ts`
- `ELITE_DMG_MULT = 1.3` defined in `src/constants.ts`
- `ELITE_XP_MULT = 2.0` defined in `src/constants.ts`
- Waves 1-12: no elite enemies spawn
- Waves 13-16: 10% of spawned enemies are elite (e.g., wave 13 with 49 enemies = ~5 elites)
- Waves 17+: 20% of spawned enemies are elite (e.g., wave 17 with 83 enemies = ~17 elites)
- Elite enemies have a visible golden glow effect distinguishing them from normal enemies
- Elite enemies drop 2x XP on death
- Elite enemy HP at wave 15: base type HP * 2.5 (e.g., Wraith ~17 HP * 2.5 = ~43 HP)
- Elite enemies use the same movement speed and AI behavior as their base type
**Estimated effort:** Medium-High

---

### RC-15: Upgrade choice count scaling by wave

**Priority:** P3
**Phase:** Phase 3, Step 10
**Depends on:** None (requires P2 playtest gate)
**Files:** `src/constants.ts`, `src/systems/upgrades.ts`
**Scope:** Scale the number of upgrade choices offered per level-up based on current wave. Waves 1-11: 3 choices (unchanged). Waves 12-15: 4 choices. Waves 16+: 5 choices. This gives late-game upgrade screens more variety and a higher chance of offering something interesting, preventing the "pick the least bad option" feeling when most desirable upgrades have already been taken.
**Acceptance criteria:**
- Waves 1-11: player is offered 3 upgrade choices (unchanged from current)
- Waves 12-15: player is offered 4 upgrade choices
- Waves 16+: player is offered 5 upgrade choices
- Choice count constants defined in `src/constants.ts`
- The upgrade selection UI properly renders 4 or 5 choices without layout issues
- All 4-5 choices are distinct (no duplicate upgrades in the same offer)
- If fewer upgrades are available than the choice count, show all available upgrades
**Estimated effort:** Low-Medium

---

### RC-16: Cursed upgrade pool for late-game waves

**Priority:** P3
**Phase:** Phase 3, Step 10
**Depends on:** RC-15
**Files:** `src/constants.ts`, `src/systems/upgrades.ts`, UI/rendering system
**Scope:** For waves 16+ (where 5 choices are offered per RC-15), one of the 5 choices is a "cursed" upgrade that provides a strong benefit paired with a drawback. Cursed upgrades are optional -- the player can always pick one of the 4 normal options. Implement at least 4 cursed upgrades: Glass Cannon (+4 damage all spells, -2 max HP), Reckless Haste (-40% all cooldowns, +50% damage taken), Blood Pact (+20% life steal, -3 max HP), Unstable Power (+8 primary damage, 5% self-damage chance per cast for 1 HP). Requires new data definitions, drawback application logic, and a distinct UI treatment (red border, warning icon) for cursed choices.
**Acceptance criteria:**
- At least 4 cursed upgrades are defined: Glass Cannon, Reckless Haste, Blood Pact, Unstable Power
- Glass Cannon: +4 damage to all spells AND -2 max HP (immediately applied)
- Reckless Haste: -40% all cooldowns AND +50% damage taken (multiplicative with other damage modifiers)
- Blood Pact: +20% life steal AND -3 max HP
- Unstable Power: +8 primary damage AND 5% chance per primary cast to take 1 HP self-damage
- Cursed upgrades appear only in wave 16+ level-up screens
- Exactly 1 cursed upgrade appears per level-up (the 5th slot)
- Cursed upgrades have a distinct visual treatment (red border, warning icon, or similar)
- The drawback is clearly communicated in the upgrade description text
- Players can always skip the cursed option by picking one of the 4 normal choices
- Cursed upgrade drawbacks are properly applied and persist for the rest of the run
**Estimated effort:** Medium-High

---

## Tuning Levers

After implementation, these constants are the primary adjustment points (in priority order):

| Constant | Default | Buff Player | Nerf Player | Location |
|----------|---------|-------------|-------------|----------|
| `BONUS_DMG_SOFT_CAP_THRESHOLD` | 6 | Increase to 8-10 | Decrease to 4 | `src/constants.ts` |
| `CD_FLOOR_PRIMARY` | 0.15 | Decrease to 0.12 | Increase to 0.18 | `src/constants.ts` |
| Boss base HP values | 20/25/20/60 | Decrease by 20% | Increase by 20% | `src/systems/dungeon.ts` |
| `ENEMY_HP_WAVE_MULT` | 0.04 | Decrease to 0.03 | Increase to 0.05 | `src/constants.ts` |
| `SPLIT_SHOT_SIDE_DAMAGE_MULT` | 0.6 | Increase to 0.7 | Decrease to 0.5 | `src/constants.ts` |
| `TIME_SCALING_FACTOR` | 0.12 | Decrease to 0.08 | Increase to 0.15 | `src/constants.ts` |
