# Class Playtest Validation Report

**Date:** 2026-04-15
**Method:** Code-level systematic audit of all 14 implemented classes
**Goal:** Validate mechanical distinctness and verify "circle-kite + LMB + R" is no longer universally dominant

---

## 1. Executive Summary

**OVERALL VERDICT: PASS (with caveats)**

The 14 original wizard classes demonstrate strong mechanical differentiation. The circle-kite + LMB + R pattern is **not universally dominant** — 6 classes actively punish it, 4 make it suboptimal, and only 4 can still use it effectively (though with trade-offs). All 14 class passives are correctly implemented in runtime code.

However, 10 newer classes (Graviturge through Voidweaver) have passives and ultimates **defined only in constants with zero runtime implementation**, making them effectively passive-less and ultimate-less. These classes show dramatically lower sim performance as a result (avg wave 3.5-7.9 vs 8.7-24.4 for the original 14).

**Key Metrics:**
- 14/14 original class passives: IMPLEMENTED
- 10/10 new class passives: NOT IMPLEMENTED (constants-only)
- 10/10 new class ultimates: NOT IMPLEMENTED (no castUltimate handler)
- Circle-kiting dominance: BROKEN for 10/14 original classes

---

## 2. Per-Class Analysis

### 2.1 Pyromancer — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 12.6 |
| DPS | 44.2 |
| BKT10 | 9.1s |
| HP | 7 |
| Move Speed | 185 |

**Gameplay Loop:** Fire-and-explode. LMB Fireball has explode:50 radius, creating splash damage. RMB Flame Wave is a cone (range 110), requiring close-medium positioning. Q Meteor is delayed AoE with burn zones. Ultimate rains 8 meteors room-wide with lingering burn.

**Passive — Ignite:** IMPLEMENTED (combat.ts:159). Enemies hit get `_burnTimer += 2`, burn DOT ticks in enemy system. Creates sustained damage layer beyond direct hits.

**Optimal Range:** Medium (110-200px). Fireball explode radius rewards hitting clusters. Flame Wave demands close approach.

**Circle-Kiting Viability:** Partially viable for LMB-only play, but the cone RMB and delayed Q require deliberate positioning near enemies. Ignite passive rewards sustained engagement over kiting. The high DPS (44.2) comes from burn DOT stacking + explosions, not raw LMB spam.

**Rating: DISTINCT** — Explosion splash + burn DOT + cone secondary create a "controlled aggression" pattern incompatible with pure kiting.

---

### 2.2 Cryomancer — MOSTLY DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 17.9 |
| DPS | 18.9 |
| BKT10 | 15.4s |
| HP | 7 |
| Move Speed | 185 |

**Gameplay Loop:** Continuous beam damage with crowd control. LMB Frost Ray is a beam (range 250, slow 1.0), requiring sustained aim on target. RMB Freeze Breath is a cone (range 120, slow 1.5). Q Blizzard creates slow zone. Ultimate freezes all enemies.

**Passive — Frostbite:** IMPLEMENTED (combat.ts:148). Slowed enemies take +1 bonus damage per hit. Synergizes with the class's heavy slow kit.

**Optimal Range:** Medium-close (120-250px). Beam requires continuous line-of-sight; cone requires close approach.

**Circle-Kiting Viability:** The beam LMB actually enables kiting somewhat (range 250, continuous damage while moving). However, the passive rewards keeping enemies slowed and the cone RMB requires closing distance. The highest value comes from stacking slows then dealing bonus damage, not from maximizing range.

**Rating: MOSTLY DISTINCT** — Beam allows mobile play, but Frostbite passive and cone RMB incentivize staying in engagement range. BKT10 of 15.4s shows strong sustained survivability through CC rather than evasion.

---

### 2.3 Stormcaller — MOSTLY DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 9.0 |
| DPS | 11.9 |
| BKT10 | 13.2s |
| HP | 7 |
| Move Speed | 190 |

**Gameplay Loop:** Lightning beam with stun control. LMB Lightning is a beam (range 320, highest beam range). RMB Ball Zap is a slow projectile with zap AoE (radius 75). Q Thunder Strike is delayed AoE with chain lightning and stun.

**Passive — Static:** IMPLEMENTED (combat.ts:139). Tracks `hitCounter`; every 5th hit stuns for 0.5s. Creates rhythm-based play.

**Optimal Range:** Medium-long (200-320px). Longest beam range in the game.

**Circle-Kiting Viability:** The long beam range enables kiting, but the Static passive rewards consistent hitting (not repositioning). The Ball Zap RMB requires placing a slow projectile strategically, and Thunder Strike Q rewards committing to an area. The stun rhythm creates windows for ability usage rather than pure LMB spam.

**Rating: MOSTLY DISTINCT** — Long range enables kiting, but stun rhythm and Ball Zap placement create decision points. Low DPS (11.9) suggests pure kiting underperforms.

---

### 2.4 Arcanist — MOSTLY DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 11.5 |
| DPS | 18.2 |
| BKT10 | 8.4s |
| HP | 7 |
| Move Speed | 195 |

**Gameplay Loop:** Homing bolts with mobility. LMB Arcane Bolt is homing (tracking factor 2.5), requiring less precise aim. RMB Blink provides instant repositioning. Q Arcane Salvo fires 5 homing missiles. Ultimate spirals 20 homing missiles.

**Passive — Arcane Echo:** IMPLEMENTED (combat.ts:154). 25% chance on hit to auto-fire a primary projectile at the target. ARCANIST_ECHO_CHANCE = 0.25.

**Optimal Range:** Flexible (any range works due to homing). Move speed 195 is above average.

**Circle-Kiting Viability:** Homing projectiles are the ultimate kiting tool — they hit regardless of precise aim. However, Blink RMB is a repositioning tool (not damage), meaning kiting sacrifices DPS. The Arcane Echo passive adds free DPS just from hitting, rewarding volume of fire over positioning.

**Rating: MOSTLY DISTINCT** — Homing enables kiting, but Blink provides aggressive repositioning too. The class plays as "mobile mage" rather than "circle kiter." Echo passive adds automatic DPS layer.

---

### 2.5 Necromancer — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 24.4 |
| DPS | 17.5 |
| BKT10 | 12.3s |
| HP | 8 |
| Move Speed | 180 |

**Gameplay Loop:** Drain tank with summons. LMB Soul Bolt has drain:1 (heals on hit). RMB Death Coil is a homing drain projectile (drain:2). Q Plague creates a DOT zone with pull. Ultimate summons 6 friendly skeletons.

**Passive — Soul Harvest:** IMPLEMENTED (combat.ts:250). Every kill heals 1 HP. Combined with drain on spells, creates extreme sustain.

**Optimal Range:** Medium (200-360px). Needs to be close enough for kills to trigger Soul Harvest.

**Circle-Kiting Viability:** Not incentivized. The class survives through drain + kill healing, not through evasion. Kiting reduces kill rate and thus reduces healing. The optimal play is sustained engagement — stay in mid-range, drain-heal through damage, use minions as meat shields.

**Rating: DISTINCT** — Drain-tank playstyle is fundamentally different. Sim confirms: highest average wave (24.4) and 98% wave-10 survival through sustain, not evasion. Flagged as NEEDS NERF by sim.

---

### 2.6 Chronomancer — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 15.2 |
| DPS | 7.1 |
| BKT10 | 28.5s |
| HP | 6 |
| Move Speed | 195 |

**Gameplay Loop:** Time manipulation support. LMB Time Bolt stuns (0.3s per hit). RMB Temporal Field is a slow+stun zone. Q Rewind restores HP/mana to a snapshot from 3s ago. Ultimate freezes all enemies for 3s + 1.5x speed.

**Passive — Haste Aura:** IMPLEMENTED (physics.ts:238). Nearby ally gets +15% move speed. Pure co-op support passive.

**Optimal Range:** Medium (100-480px). Time Bolt speed 480 is fastest projectile in game.

**Circle-Kiting Viability:** Lowest DPS in the game (7.1). This class doesn't kill through damage — it survives through crowd control. The Temporal Field and Rewind create a "safe zone" playstyle. In solo play, Haste Aura is useless, but the stun-heavy kit enables a "lockdown then punish" pattern.

**Rating: DISTINCT** — Pure controller/support. Cannot rely on LMB+R because DPS is too low. Must use all abilities strategically. BKT10 of 28.5s shows survival through CC duration, not damage.

---

### 2.7 Knight — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 13.9 |
| DPS | 12.2 |
| BKT10 | 16.7s |
| HP | 12 |
| Move Speed | 170 |

**Gameplay Loop:** Frontline tank with gap-closers. LMB Shield Throw has pierce:1 and short range (life 0.8). RMB Shield Rush is a leap with AoE stun (1.5s). Q Charge is a longer blink. Ultimate Shield Wall grants invulnerability for 3s.

**Passive — Bulwark:** IMPLEMENTED (combat.ts:467). Takes 25% less damage (BULWARK_DMG_MULT = 0.75). Applied in damagePlayer().

**Optimal Range:** Close (50-100px). Short projectile range + leap abilities demand melee range.

**Circle-Kiting Viability:** Actively punished. Move speed 170 is the slowest. Projectile life 0.8 with speed 350 = ~280px effective range (shortest of any projectile class). The kit screams "dive in" — Shield Rush stuns, Charge closes gap, Shield Wall lets you facetank. Kiting wastes the pierce and the short range.

**Rating: DISTINCT** — True tank. Lowest speed, highest HP (12), damage reduction passive. Circle-kiting is mechanically suboptimal.

---

### 2.8 Berserker — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 8.7 |
| DPS | 14.0 |
| BKT10 | 11.5s |
| HP | 12 |
| Move Speed | 200 |

**Gameplay Loop:** Melee brawler with risk/reward. LMB Axe Swing is a cone (range 50 — shortest in game, angle 1.5). RMB Throwing Axe is a ranged option. Q Leap Slam provides AoE + gap close. Ultimate Blood Rage grants 2x damage, 2x speed, but 2x damage taken for 5s.

**Passive — Fury:** IMPLEMENTED (physics.ts:249, combat.ts:88). Below 50% HP: +50% damage and +50% speed. Applied in damageEnemy() as multiplicative modifier and in physics.ts as speed boost.

**Optimal Range:** Melee (50px). Cone range 50 is the shortest attack in the game.

**Circle-Kiting Viability:** Impossible. LMB is a cone with 50px range — you must be in melee. The Fury passive rewards being at low HP, which means deliberately taking damage. The Blood Rage ultimate doubles incoming damage. This class is the anti-kiter: it wants to be in the enemy's face at low HP.

**Rating: DISTINCT** — Pure melee, risk/reward mechanics. Cannot kite by design. DPS/HP ratio of 3.97 (highest) shows glass cannon melee identity.

---

### 2.9 Paladin — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 15.8 |
| DPS | 28.7 |
| BKT10 | 10.1s |
| HP | 10 |
| Move Speed | 180 |

**Gameplay Loop:** Support healer with respectable damage. LMB Smite is a projectile with explode:25. RMB Holy Shield grants ally invulnerability. Q Consecrate is a heal+damage zone. Ultimate heals both players 75% + damages all enemies.

**Passive — Aura of Light:** IMPLEMENTED (physics.ts:271). Nearby ally regens 2 HP/s (ticks at AURA_HEAL_TICK = 0.5s intervals, +1 HP per tick). Requires staying near ally.

**Optimal Range:** Medium (close to ally). The passive demands proximity to teammate, creating a "stay together" obligation.

**Circle-Kiting Viability:** Solo-kiting is viable for the Smite LMB (projectile with explosion), but the class's value comes from supporting an ally. Holy Shield (RMB) is pure support. Consecrate (Q) requires placing yourself in a zone. The class incentivizes "stay near ally and create safe zones" rather than circle-kiting alone.

**Rating: DISTINCT** — Support-first design. Solo performance is decent (28.7 DPS) but the kit shines in co-op. Circle-kiting abandons the ally-support identity.

---

### 2.10 Ranger — NEEDS WORK

| Stat | Value |
|------|-------|
| Avg Wave | 11.5 |
| DPS | 20.2 |
| BKT10 | 7.3s |
| HP | 6 |
| Move Speed | 200 |

**Gameplay Loop:** Fast ranged DPS. LMB Arrow is the fastest projectile (speed 600, cd 0.25, pierce 2, life 1.8). With Eagle Eye, effective life is 2.52 (range ~1500px). RMB Volley fires 4 arrows in a spread. Q Trap places a slow trap. Ultimate fires 20 arrows in a cone.

**Passive — Eagle Eye:** IMPLEMENTED. Range +40% in castSpell (combat.ts:906) and castSpellSilent (combat.ts:605). Max-range crit in waves.ts:167 (triggers when `age > life * 0.7`).

**Optimal Range:** Maximum (600-1500px). Eagle Eye crit at max range explicitly rewards staying far away.

**Circle-Kiting Viability:** This is the purest kite class. Speed 200, pierce 2, longest effective range, fastest fire rate (0.25s), and a passive that rewards MAX RANGE with crits. The Trap Q slightly diversifies by requiring placement, and Volley RMB is a burst tool, but the LMB+kite pattern is extremely strong.

**Rating: NEEDS WORK** — Eagle Eye passive literally rewards circle-kiting at max range with crits. While Trap adds some zone control, the dominant pattern is still "maintain max range, spam arrows." The class could benefit from a mechanic that rewards controlled positioning rather than pure evasion (e.g., stationary bonus damage, or a "sniper" mechanic rewarding stillness).

---

### 2.11 Druid — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 22.8 |
| DPS | 13.0 |
| BKT10 | 43.1s |
| HP | 9 |
| Move Speed | 185 |

**Gameplay Loop:** Summoner with crowd control. LMB Thorn Swipe is a cone (range 80, slow 0.4) — mid-range melee. RMB Entangle is a stun zone. Q Spirit Wolf summons a wolf ally (15s lifespan, 8 HP). Ultimate creates 6 thorn zones + 2 treant allies.

**Passive — Regrowth:** IMPLEMENTED (physics.ts:253). Regens 1 HP every 5 seconds via `_auraTick` timer. Shows "+1 HP" text.

**Optimal Range:** Close-medium (80px cone). Must stay close for Thorn Swipe damage.

**Circle-Kiting Viability:** Not viable. LMB is a cone (80px range) requiring close proximity. The class survives through Regrowth passive, Entangle stuns, and wolf summons — not through kiting. BKT10 of 43.1s (highest in game) shows extreme survivability through sustain + summons, not evasion.

**Rating: DISTINCT** — Summoner/bruiser with unique playstyle. Cone LMB prevents kiting. Flagged as NEEDS NERF by sim.

---

### 2.12 Warlock — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 12.9 |
| DPS | 46.0 |
| BKT10 | 2.9s |
| HP | 6 |
| Move Speed | 175 |

**Gameplay Loop:** Glass cannon with HP-for-mana trade. LMB Shadow Bolt is slow (260) but high damage (3). RMB Drain Life is a beam (range 200, drain 2). Q summons an Imp ally. Ultimate Doom marks all enemies for delayed % HP damage.

**Passive — Dark Pact:** IMPLEMENTED (combat.ts:658). Refunds 30% mana cost on every cast but costs 1 HP (WARLOCK_MANA_REFUND = 0.3). HP floor at 1 (can't kill yourself). If soulSiphon upgrade is active, heals +1 instead of HP cost.

**Optimal Range:** Medium (200-390px). Drain Life beam needs line-of-sight at medium range.

**Circle-Kiting Viability:** HP cost on every cast creates a unique tension. Kiting reduces access to Drain Life healing. The class must balance aggression (to drain heal) with safety (low HP 6, slow speed 175). BKT10 of 2.9s (fastest boss kill!) but lowest survivability. This class demands precise HP management, not mindless kiting.

**Rating: DISTINCT** — HP-management mechanic is unique. Highest DPS (46.0) but lowest survivability. Creates "glass cannon" feel incompatible with safe kiting.

---

### 2.13 Monk — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 9.3 |
| DPS | 11.3 |
| BKT10 | 11.3s |
| HP | 7 |
| Move Speed | 210 |

**Gameplay Loop:** Fast melee with dodge. LMB Chi Blast is rapid-fire (cd 0.15, fastest in game) but short-range (life 0.5, speed 500 = ~250px). RMB Flying Kick is a leap with AoE. Q Chi Burst heals + knocks back enemies. Ultimate Thousand Fists is 20 rapid melee hits.

**Passive — Inner Peace:** IMPLEMENTED (physics.ts:266). Sets dodgeChance to 0.25 (MONK_DODGE_CHANCE). Applied in damagePlayer()'s dodge check (combat.ts:460).

**Optimal Range:** Close-medium (60-250px). Highest speed (210) but short projectile range.

**Circle-Kiting Viability:** Fast projectile speed (500) but very short life (0.5) makes effective range ~250px. The class must stay relatively close. Flying Kick and Chi Burst are melee-range abilities. The dodge passive enables facetanking, not kiting. The playstyle is "dart in, burst, dodge damage, dart out" — hit-and-run rather than circle-kiting.

**Rating: DISTINCT** — Fastest class with dodge mechanic. Short range forces engagement. Hit-and-run pattern is fundamentally different from circle-kiting.

---

### 2.14 Engineer — DISTINCT

| Stat | Value |
|------|-------|
| Avg Wave | 18.2 |
| DPS | 27.4 |
| BKT10 | 6.8s |
| HP | 9 |
| Move Speed | 175 |

**Gameplay Loop:** Turret-based zone control. LMB Wrench Throw has mild homing (1.0). RMB Deploy Turret creates a 15s auto-attacking zone (120px radius). Q Mine Field places 3 traps. Ultimate deploys a Mega Turret (20 HP, 3 dmg/shot, 12s).

**Passive — Overclock:** IMPLEMENTED (combat.ts:1092). Turret zones get `tickRate *= 0.8` (20% faster fire). Applied when zones with `_turret` flag are created. Also applied to Mega Turret (combat.ts:1587).

**Optimal Range:** Flexible (turrets do the work). The class wants to place turrets and kite around them.

**Circle-Kiting Viability:** The class does kite, but around its turrets — which is fundamentally different from "maintain max range and spam LMB." The Engineer's damage comes primarily from turrets (27.4 DPS), not from Wrench Throw. The gameplay is "deploy turrets, mine-field approaches, use Wrench Throw to supplement." Move speed 175 (second slowest) further limits pure kiting.

**Rating: DISTINCT** — Turret-anchor playstyle. Kiting happens around placed turrets, creating positional play rather than pure evasion.

---

## 3. Circle-Kiting Pattern Evaluation

### Summary Table

| Class | LMB Type | Range | Circle-Kite Rating |
|-------|----------|-------|-------------------|
| Pyromancer | Projectile (explode) | Medium | Suboptimal — cone RMB + burn reward close |
| Cryomancer | Beam | Medium-Long | Viable but suboptimal — Frostbite rewards engagement |
| Stormcaller | Beam | Long | Viable but weak DPS — stun rhythm matters more |
| Arcanist | Homing | Flexible | Viable — but Blink enables aggressive play too |
| Necromancer | Projectile (drain) | Medium | Not viable — drain-tank needs sustained combat |
| Chronomancer | Projectile (stun) | Medium | Not viable — DPS too low, must use CC kit |
| Knight | Projectile (short) | Close | Not viable — shortest range, tank kit |
| Berserker | Cone (melee) | Melee | Impossible — 50px cone range |
| Paladin | Projectile (explode) | Medium | Suboptimal — support role demands ally proximity |
| Ranger | Projectile (fast) | Max range | **DOMINANT** — Eagle Eye rewards max range |
| Druid | Cone (slow) | Close | Not viable — 80px cone, summoner kit |
| Warlock | Projectile (slow) | Medium | Risky — HP cost creates tension |
| Monk | Projectile (rapid) | Short | Not viable — short range, dodge-tank |
| Engineer | Projectile (homing) | Flexible | Turret-anchor replaces pure kiting |

### Verdict

**Circle-kiting is broken for 10/14 classes.** Only the Ranger has circle-kiting as its dominant strategy. Three classes (Cryomancer, Stormcaller, Arcanist) can kite but gain more from using their full kit. The remaining 10 classes either cannot kite (melee/short range) or are actively punished by kiting (drain-tank, support, turret-anchor).

---

## 4. Missing Passive Implementations

### Original 14 Classes (In Scope)

All 14 passives are **correctly implemented**:

| Class | Passive | Location | Status |
|-------|---------|----------|--------|
| Pyromancer | Ignite | combat.ts:159 | IMPLEMENTED |
| Cryomancer | Frostbite | combat.ts:148 | IMPLEMENTED |
| Stormcaller | Static | combat.ts:139 | IMPLEMENTED |
| Arcanist | Arcane Echo | combat.ts:154 | IMPLEMENTED |
| Necromancer | Soul Harvest | combat.ts:250 | IMPLEMENTED |
| Chronomancer | Haste Aura | physics.ts:238 | IMPLEMENTED |
| Knight | Bulwark | combat.ts:467 | IMPLEMENTED |
| Berserker | Fury | physics.ts:249, combat.ts:88 | IMPLEMENTED |
| Paladin | Aura of Light | physics.ts:271 | IMPLEMENTED |
| Ranger | Eagle Eye | combat.ts:605,906, waves.ts:167 | IMPLEMENTED |
| Druid | Regrowth | physics.ts:253 | IMPLEMENTED |
| Warlock | Dark Pact | combat.ts:658 | IMPLEMENTED |
| Monk | Inner Peace | physics.ts:266, combat.ts:460 | IMPLEMENTED |
| Engineer | Overclock | combat.ts:1092,1587 | IMPLEMENTED |

### New 10 Classes (Out of Scope but Critical)

All 10 new classes have passives defined in constants.ts but **NO runtime implementation** in combat.ts or physics.ts:

| Class | Passive | Status |
|-------|---------|--------|
| Graviturge | Gravity Well | NOT IMPLEMENTED |
| Bladecaller | Kill Rush | NOT IMPLEMENTED |
| Architect | Fortification | NOT IMPLEMENTED |
| Hexblade | Hex Mastery | NOT IMPLEMENTED |
| Warden | Sentinel | NOT IMPLEMENTED |
| Cannoneer | Heavy Caliber | NOT IMPLEMENTED |
| Soulbinder | Soul Bond | NOT IMPLEMENTED |
| Invoker | Elemental Attunement | NOT IMPLEMENTED |
| Tidecaller | Rising Tide | NOT IMPLEMENTED |
| Voidweaver | Entropic Decay | NOT IMPLEMENTED |

Additionally, none of the 10 new classes have ultimate ability handlers in `castUltimate()`. When their ultimate is cast, it fires the generic effects (shockwave, particles, text) but no class-specific ability.

---

## 5. DPS / Survivability Comparison Table

| Rank | Class | Avg Wave | Kills | DPS | BKT10 | W5% | W10% | W15% | W20% | DPS/HP |
|------|-------|----------|-------|-----|-------|-----|------|------|------|--------|
| 1 | Necromancer | 24.4 | 691.2 | 17.5 | 12.3s | 100% | 98% | 96% | 84% | 2.13 |
| 2 | Druid | 22.8 | 634.4 | 13.0 | 43.1s | 100% | 86% | 82% | 74% | 2.16 |
| 3 | Engineer | 18.2 | 487.4 | 27.4 | 6.8s | 100% | 82% | 82% | 0% | 2.59 |
| 4 | Cryomancer | 17.9 | 471.9 | 18.9 | 15.4s | 100% | 78% | 78% | 2% | 2.61 |
| 5 | Paladin | 15.8 | 394.0 | 28.7 | 10.1s | 100% | 50% | 50% | 14% | 2.53 |
| 6 | Chronomancer | 15.2 | 363.1 | 7.1 | 28.5s | 98% | 50% | 46% | 18% | 2.18 |
| 7 | Knight | 13.9 | 329.4 | 12.2 | 16.7s | 92% | 52% | 38% | 0% | 2.52 |
| 8 | Warlock | 12.9 | 284.9 | 46.0 | 2.9s | 86% | 44% | 30% | 18% | 2.49 |
| 9 | Pyromancer | 12.6 | 278.1 | 44.2 | 9.1s | 100% | 26% | 26% | 0% | 2.77 |
| 10 | Arcanist | 11.5 | 233.2 | 18.2 | 8.4s | 98% | 18% | 16% | 0% | 2.46 |
| 11 | Ranger | 11.5 | 235.6 | 20.2 | 7.3s | 100% | 20% | 16% | 0% | 2.34 |
| 12 | Monk | 9.3 | 173.5 | 11.3 | 11.3s | 68% | 20% | 12% | 2% | 2.28 |
| 13 | Stormcaller | 9.0 | 144.7 | 11.9 | 13.2s | 90% | 16% | 2% | 0% | 2.51 |
| 14 | Berserker | 8.7 | 148.5 | 14.0 | 11.5s | 88% | 6% | 2% | 0% | 3.97 |

**Key Observations:**
- **Sustain classes dominate:** Necromancer (drain), Druid (regen+summons), Engineer (turrets) all exceed wave 18.
- **Burst classes fall off:** Pyromancer (44.2 DPS) and Warlock (46.0 DPS) have highest DPS but mid-tier survivability.
- **Berserker has highest DPS/HP ratio** (3.97) confirming its glass cannon melee identity.
- **Chronomancer has lowest DPS** (7.1) but 6th best survival, confirming pure-CC identity.

---

## 6. Recommended Follow-Up Balance Changes

### High Priority

1. **Ranger (NEEDS WORK):** Eagle Eye's max-range crit actively encourages circle-kiting. Consider:
   - Replace max-range crit with "stationary for 0.5s = next shot crits" (sniper mechanic)
   - Or: progressive crit chance that increases with consecutive hits on same target (rewards target focus, not evasion)
   - Or: reduce base move speed to 185 and add "Steady Aim: standing still for 1s grants +30% damage"

2. **Necromancer (NERF):** 98% wave-10 survival is >2 sigma above mean. Soul Harvest + Soul Bolt drain creates too much sustain.
   - Consider: reduce Soul Harvest to healing every 2nd kill, or cap drain healing per second

3. **Druid (NERF):** 86% wave-10 survival, highest BKT10 (43.1s). Regrowth + summons + cone slow is too durable.
   - Consider: increase Regrowth interval to 7s, or reduce wolf lifespan to 10s

4. **Berserker (BUFF):** Only 6% wave-10 survival despite highest DPS/HP ratio. Glass cannon melee is too punishing.
   - Consider: add Fury passive granting a small lifesteal (5%) below 50% HP, or increase base HP to 14

5. **Stormcaller (BUFF):** Low DPS (11.9) and low survival (16% wave-10). Static stun every 5th hit is too infrequent.
   - Consider: reduce Static counter to every 4th hit, or increase base beam damage to 2.0

### Medium Priority

6. **Implement all 10 new class passives and ultimates** — these classes are non-functional without runtime code
7. **Monk:** 68% wave-5 survival is borderline. Consider increasing base HP to 8 or dodge chance to 30%

### Low Priority

8. **Warlock:** BKT10 of 2.9s (fastest boss kill) but 44% wave-10 survival. The risk/reward balance is actually well-tuned — no changes needed unless player feedback disagrees.
9. **Arcanist/Cryomancer:** Could benefit from slightly more incentive to use RMB/Q over pure LMB, but not critical.
