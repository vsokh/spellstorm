# Spellstorm — Game Design Document

Reference spec for the current 2D build. Written with enough mechanical detail to port the design to a 3D engine (Unity, Unreal, Godot) without reverse-engineering the TypeScript source.

---

## 1. Concept

**Spellstorm** is a top-down action roguelike. One or two players pick a magical archetype and survive escalating waves of enemies across procedural rooms, collecting XP, gold, and augments. Combat is real-time and skill-shot based — most abilities must be aimed at the cursor.

- **Perspective (2D build):** orthographic top-down, fixed camera that follows the arena.
- **Recommended for 3D:** fixed orbital / 45° angled camera above a flat arena. All gameplay is planar (XY in 2D, XZ in 3D). Vertical motion is purely visual (arrow arcs, meteors) — nothing collides in Y/Z-height.
- **Tick model:** fixed-step game loop with variable `dt` passed into every system. No fixed physics tick; everything uses delta-time integration.

---

## 2. Arena & World

| Constant        | Value     | Notes                                       |
| --------------- | --------- | ------------------------------------------- |
| `ROOM_WIDTH`    | 1000      | world units                                 |
| `ROOM_HEIGHT`   | 700       | world units                                 |
| `WIZARD_SIZE`   | 13        | player collision radius                     |
| Wave count      | 20        | `MAX_WAVES`, boss every 5 waves (5/10/15/20) |

The arena is a single flat rectangle with clamped player boundaries. Pillars may be placed as collision obstacles. Rooms are generated per-wave.

---

## 3. Core Resources

| Resource       | Range              | Notes                                                       |
| -------------- | ------------------ | ----------------------------------------------------------- |
| **HP**         | 6–14 (class-based) | `maxHp` baseline; +1 every 3 levels                         |
| **Mana**       | 70–120             | regen 10–18 / s; pays for abilities                         |
| **Ult Charge** | 0–100 (or 120)     | +3 per hit, +8 per kill. Space ability unlocks at threshold |
| **XP**         | Accumulator        | level-up every `XP_BASE_THRESHOLD=28` base; step grows      |
| **Gold**       | Accumulator        | spent in Shop between waves                                 |

### Ult Charge

- `ULT_CHARGE_HIT = 3` — gained per enemy damaged
- `ULT_CHARGE_KILL = 8` — bonus per enemy killed
- `ULT_THRESHOLD = 100` — standard Space ult threshold
- `ULT_THRESHOLD_OVERFLOW = 200` — caps overcharge
- Charge is visible in HUD as a filling bar on the Space slot.

### Leveling

- On level up the player picks 1 of 3 (or 4 at wave 12+) augment cards. See §11.
- Every `HP_LEVEL_INTERVAL = 3` levels → +1 max HP and heal to full.
- XP per level scales: +22 (L≤5), +28 (L≤10), +38 (L≤15), +50 (L>15).

### Gold

- Drops from kills (1 base + wave bonus). Wave 4+ `+1`, Wave 8+ `+2`, Wave 15+ `+3`.
- Clearing a wave rewards `5 + wave*3` gold.
- Shop opens between waves; items buyable repeatedly or capped (see Shop Items §10).

---

## 4. Movement

- **Input**: 8-way WASD (or equivalent). Normalized diagonal speed. Aim follows mouse cursor instantly.
- **Base moveSpeed** varies per class, 160–210 u/s.
- **Slowed**: `slowTimer > 0` → `0.5×` move speed.
- **Stunned**: no movement or casting.
- **Charging** (channeled chargeable spells): `moveSpeed × chargeSlow` (typically 0.4–0.7).
- **Channeling** (Stormcaller): `moveSpeed × channelSlow`.
- **Roll / Dash** (Ranger RMB, Arcanist Blink, etc.): velocity override for a short window with i-frames.
- **Haste / Fury**: temporary `×1.5` speed bonuses.

### Roll (Ranger) — velocity-based dash

```
_rollTimer > 0 → overrides vx,vy with fixed roll velocity
                 appends afterimage ghosts every frame
                 iframes for entire duration + 0.2s tail
```

This is an animated slide (200u over 0.28s). Distinct from instant-teleport blinks (Arcanist, Stormcaller Storm Step).

---

## 5. Combat

### Damage pipeline (player → enemy)

1. **Base damage** from spell def × multipliers (combo chain, spell weaving, echo, crit, fury, blood rage, etc.)
2. **Armor reduction** on enemies (bosses/elites): subtractive.
3. **Frostbite**: `+1` bonus damage vs slowed targets (Cryomancer passive).
4. **Heavy Caliber**: Cannoneer `every 4th hit ×2` damage.
5. **Backstab**: if player strikes enemy from behind (> `BACKSTAB_ANGLE = π/4` from facing), bonus damage (Monk ×1.5, Bladecaller ×2.5).
6. **Bonus damage soft cap** via `softCapBonusDmg()` hyperbolic curve past `+8`.

### Damage pipeline (enemy → player)

1. Iframes: skip if `iframes > 0`.
2. Stealth Shield (Bladecaller): `_stealthShield > 0` blocks hit, sets 0.3s iframes.
3. Ward Stone (shop): block hit.
4. Dodge: `dodgeChance` roll (Monk 25% baseline).
5. **Bulwark** (Knight): `×0.75`.
6. **Blood Rage** (Berserker ult): `×2` damage taken.
7. **Cursed** augment: `×damageTakenMul`.
8. **Bastion** ally DR (Warden zone): `×0.8` if inside allied Warden zone.
9. **Armor** subtractive, floor = 1.
10. After damage applied → `iframes = IFRAME_DAMAGE (0.4s)` and the `onDamagePlayer` class hook fires (Warlock Blood Doll mirrors).

### Crit

- Default 0% crit chance; augments or class effects grant.
- Crit mult defaults to 2×. Stealth-crit (Bladecaller) = 2× guaranteed.
- Ranger Eagle Eye: 3rd consecutive hit on same target crits.

### I-frames (defaults)

| Source           | Duration |
| ---------------- | -------- |
| Damage           | 0.4s     |
| Dash             | 0.2s     |
| Block            | 0.3s    |
| Respawn          | 1.5s     |
| Blink / Leap     | 0.3s     |
| Shield Wall ult  | 1.5s     |

---

## 6. Spell Types

The `SpellType` enum drives runtime dispatch. Every ability maps to one type. Port this enum first — it defines most gameplay dispatch.

| Type            | Behavior                                                                                |
| --------------- | --------------------------------------------------------------------------------------- |
| `Projectile`    | Travels along a vector, lifetime-based, may `pierce`, `explode`, `homing`, apply marks. |
| `Homing`        | Projectile with seek behavior toward nearest enemy.                                     |
| `Beam`          | Instantaneous line from caster in aim direction, hits everything in its path.           |
| `Cone`          | Angular arc from caster; hits enemies within angle + range.                             |
| `Nova`          | Expanding circle centered on caster; hits everything in radius.                         |
| `Zone`          | Persistent ground area; ticks damage/heal/slow/stun over `duration`.                    |
| `AoeDelayed`    | Spawns a marker at cursor; after `delay`, deals damage in `radius`. Telegraphed.        |
| `Blink`         | Instant teleport to aim-direction point, ≤ `range`. No animation.                       |
| `Leap`          | Arc jump to cursor or target with AoE landing strike.                                   |
| `Barrage`       | Spawns N projectiles in a spread cone over short delay.                                 |
| `Trap`          | Places persistent ground traps that detonate when enemies enter.                        |
| `Tether`        | Links caster ↔ enemy for `tetherDuration`. Ticks dmg/heal while in range.               |
| `AllyShield`    | Grants temp shield buff to caster and nearby ally.                                      |
| `Rewind`        | Time-rewind: restore HP/mana/position snapshot.                                         |
| `Ultimate`      | **Placeholder** type: routes to `castUltimate` (Space, charge=100), `castQAbility` (Q, charge=0), or `castRMBAbility` (RMB, charge=0) class hooks. The handler defines actual behavior. |

### Spell modifiers (common fields)

| Field             | Used by                              |
| ----------------- | ------------------------------------ |
| `dmg`             | damage                               |
| `speed`           | projectiles                          |
| `radius`          | collision/explosion                  |
| `range`           | beam/cone/blink/leap max distance    |
| `life`            | projectile lifetime (s)              |
| `mana`            | mana cost                            |
| `cd`              | cooldown (s)                         |
| `pierce`          | # enemies before despawn             |
| `homing`          | seek strength (0=none, 2.5=strong)   |
| `explode`         | AoE radius on impact                 |
| `burn`            | DoT applied (damage over 2s)         |
| `slow`            | slow timer applied                   |
| `stun`            | stun timer applied                   |
| `drain`           | HP heal to caster per hit            |
| `applyMark`       | mark name + duration + stacks + color |
| `detonateMark`    | stacks consumed → bonus dmg + spread |
| `chargeTime`      | s to fully charge                    |
| `chargeSlow`      | move speed multiplier while charging |
| `chargeMinDmg/MaxDmg` | charge scaling range              |
| `chargeRadius`    | bonus explode radius at max charge   |
| `channel`         | channel duration (max)               |
| `channelScale`    | max damage multiplier over channel   |
| `channelBreak`    | damage threshold to interrupt channel |
| `tetherRange`     | max distance before tether breaks    |
| `tetherDmg`       | damage per tick                      |
| `tetherHeal`      | healing per tick                     |
| `tetherTickRate`  | s between ticks                      |
| `tetherDuration`  | total tether seconds                 |
| `tetherReward`    | bonus on full completion (stun/burst heal/burst dmg) |
| `targetLock`      | ability snaps to a target enemy (Bladecaller Shadow Step) |

---

## 7. Marks (Stacking Debuffs)

Enemies carry a single mark name with stacks. Applying a different mark replaces.

| Mark       | Applied by             | Color     | Detonator                                    |
| ---------- | ---------------------- | --------- | -------------------------------------------- |
| `frost`    | Cryomancer Frost Ray   | `#88CCFF` | Freeze Breath cone — +2/stack, AoE + stun    |
| `soul`     | Soulbinder LMB         | `#55aa88` | Ally kills: +1 dmg + 0.5 HP heal on allies   |
| `judgment` | Paladin Smite          | `#ffddaa` | Consecrate zone — +3/stack, AoE + heal       |
| `static`   | Stormcaller LMB        | `#ffcc44` | Discharge nova — +3/stack, stun              |
| `death`    | Necromancer Skull Bolt | `#77ffaa` | Priority target for owned skeletons (+40% dmg) |
| `voodoo`   | Warlock Hex Powder     | `#cc55ee` | Release Hex — ×3 dmg/stack, heals caster     |

**Max stacks** vary per mark def (1–10). **Duration** resets on each application.

---

## 8. Status Effects

| Effect       | Field                                  | Behavior                                     |
| ------------ | -------------------------------------- | -------------------------------------------- |
| Stun         | `stunTimer > 0`                        | Enemy can't move or attack                   |
| Slow         | `slowTimer > 0`                        | Enemy `moveSpeed × SLOW_MULT (0.4)`          |
| Burn         | `_burnTimer > 0`                       | Damage per `BURN_TICK (0.5s)` until expired  |
| Iframe       | `iframes > 0`                          | Cannot take damage                           |
| Stealth      | `_stealth > 0`                         | Enemies target last-seen position            |
| Haste        | `_hasteBonus`                          | +15% move speed                              |
| Fury         | `_furyActive` (Berserker, HP < 50%)    | +50% dmg, +lifesteal, aura dps               |
| Rage         | `_rage > 0` (Blood Rage ult)           | ×2 dmg, takes ×2 dmg                         |
| Invuln       | `_invulnTimer > 0`                     | Untouchable                                  |

---

## 9. Enemies

### AI Types

- **Chase**: walks straight toward target, melee attacks at `atkR`.
- **Ranged**: stops at preferred range, fires projectiles at `atkR` with `projSpd`.

Both AI types may:
- Kite at close range (back away when enemy is too close).
- Retarget to friendly summons (skeletons, totems, etc.) when closer than the player.

### Enemy Roster (abridged)

| Key           | Name            | HP  | Spd  | Sz | Dmg | AI     | Notes                           |
| ------------- | --------------- | --- | ---- | -- | --- | ------ | ------------------------------- |
| `slime`       | Slime           | 2   | 55   | 11 | 1   | Chase  | Basic trash                     |
| `bat`         | Bat             | 1   | 120  | 8  | 1   | Chase  | Fast fragile swarm              |
| `skeleton`    | Skeleton        | 3   | 70   | 11 | 1   | Ranged | Bow-firer 220r                  |
| `wraith`      | Wraith          | 3   | 130  | 10 | 2   | Chase  | Phases through walls            |
| `spider`      | Spider          | 3   | 100  | 9  | 1   | Chase  |                                 |
| `necro`       | Necro           | 5   | 50   | 12 | 1   | Ranged | Ranged caster                   |
| `shieldbearer`| Shield Bearer   | 8   | 40   | 14 | 2   | Chase  | Armored                         |
| `assassin`    | Assassin        | 2   | 160  | 8  | 3   | Chase  | Very fast melee                 |
| `bomber`      | Bomber          | 4   | 45   | 12 | 1   | Chase  | Explodes on death (60r)         |
| `teleporter`  | Teleporter      | 3   | 70   | 9  | 2   | Chase  | Blinks close every few seconds  |
| `splitter`    | Splitter        | 5   | 60   | 13 | 1   | Chase  | Spawns 2 splitlings on death    |
| `berserker`   | Berserker       | 6   | 50   | 11 | 3   | Chase  | Enrages at low HP (×1.5 spd/atk) |
| `golem`       | Golem           | 20  | 35   | 24 | 3   | Chase  | Boss (wave 5)                   |
| `demon`       | Demon           | 25  | 50   | 22 | 3   | Ranged | Boss (wave 10)                  |
| `archlord`    | Archlord        | 125 | 45   | 28 | 3   | Ranged | Boss (wave 20)                  |

### Friendly Summons

| Key          | Purpose                                          |
| ------------ | ------------------------------------------------ |
| `_ally`      | Generic ally (legacy)                            |
| `_wolf`      | Druid Spirit Wolf ult                            |
| `_imp`       | Warlock (legacy, replaced)                       |
| `_skeleton`  | Necromancer skeleton (cap 6) + Bone Warrior ult  |
| `_totem`     | Warlock Voodoo Totem (stationary, curses aura)   |
| `_loa`       | Warlock Summon the Loa ult (stationary, aura)    |

All friendly entities live in `state.enemies` with `_friendly = true` and `_owner = playerIdx`. Systems must filter `_friendly` on hostile-only logic.

### Elites

- Wave ≥ 13: 10% elite chance per spawn.
- Wave ≥ 17: 20%.
- Elites: `HP × 2.5`, `DMG × 1.3`, `XP × 2`.

### Boss Damage Reduction

- Wave ≥ 15 bosses at `HP < 50%` gain `×0.5` incoming dmg for 3s after triggering.

---

## 10. Shop (between waves)

Each wave clear opens a shop with rotating items.

| Item           | Price           | Effect                        |
| -------------- | --------------- | ----------------------------- |
| Health Potion  | 8 (+2/buy)      | Restore 3 HP                  |
| Vitality Charm | 30 (+15/buy, ×5)| +2 Max HP                     |
| Power Shard    | 15 (+5/buy)     | +1 spell dmg (this wave only) |
| Ward Stone     | 20 (+5/buy)     | Block next 2 hits             |
| Swift Boots    | 25 (+20/buy, ×3)| +15% move speed permanent     |

---

## 11. Augments (level-up upgrades)

On level-up, player picks 1 card from 3 (or 4 past wave 12). Pool is class-specific + global pool.

- Shared augments: stat boosts, multishot, pierce, burn, vampirism, homing, crit, dodge, bloodlust, spell weaving, full rotation, etc.
- **Each class has 3 signature augments** keyed to their kit (e.g., Ranger → Multishot, Poison Arrows, Volley Master; Warlock → Hex Saturation, Extended Ritual, Bigger Detonations).

**Dev flag `DEV_DISABLE_AUGMENTS`** can be flipped to disable the pool entirely for testing raw class balance.

**Scaling**:
- `flatScaling(base, stacks)`: first 3 stacks give full value; beyond that, logarithmic decay `base × ln(4)/ln(stacks+1)`.
- `softCapBonusDmg(rawBonus)`: hyperbolic soft-cap past +8 flat damage.

---

## 12. Ultimate Charge

Each Space ability has a `ultCharge` threshold. Charge fills from combat:

- `+3` per enemy damaged
- `+8` per kill
- Some classes have different thresholds (Berserker Blood Rage = 80, Monk Thousand Fists = 80, Bladecaller/Arcanist = 100, Knight Shield Wall = 120, Engineer Mega Turret = 120, Warlock Doom = 90)

`ultPower` = multiplier for ult damage (scales from kills + level during a run).

**Slot routing**: Q and RMB can also be `SpellType.Ultimate` with `ultCharge = 0` (instant-cast, no charge needed). This pattern is used for per-class special abilities (Necromancer Raise Skeleton, Ranger Roll, Warlock Release Hex / Voodoo Totem, Cannoneer Heavy Shell / Rocket Barrage — well, Space always has non-zero ultCharge).

---

## 13. FX Pool Sizes (rendering budget)

| Pool                | Cap |
| ------------------- | --- |
| Particles           | 200 |
| Shockwaves          | 50  |
| Floating Texts      | 50  |
| Trails              | 300 |
| Spell Projectiles   | 128 |
| Enemy Projectiles   | 64  |
| Zones               | 32  |
| AoE Markers         | 32  |
| Beams               | 64  |

All pools are fixed-size and reuse slots. Port as object pools in the target engine — `acquire()` returns null if exhausted, in which case the effect is silently dropped.

---

## 14. Characters

All 24 classes. Each entry: **identity** + **passive** + **LMB / RMB / Q / Space**.
Values are raw numbers from `src/classes/defs.ts`. Ultimate behaviors reference `ULTIMATE` constants or per-class hook implementations (`src/classes/*/hooks.ts`).

### 14.1 Pyromancer

- **Color:** `#ff6633` | **HP 7 · Speed 185 · Mana 100 (regen 14)**
- **Identity:** fire mastery, high burst damage. Classic mage fantasy.
- **Passive — Ignite:** enemies hit by any fire source burn for 4 damage over 2s.
- **LMB Fireball** (Projectile): 2 dmg, 400 spd, 10 radius, 50 explode AoE, 2 burn, mana 10, cd 0.35s.
- **RMB Flame Wave** (Cone): 2 dmg, 110 range, 0.8 rad angle, mana 22, cd 2.5s.
- **Q Meteor** (AoeDelayed): 4 dmg, 75 radius, 0.8s delay, mana 32, cd 7s.
- **Space Inferno** (Ultimate, charge 100): area-denial fire storm + burn-zone linger (`BURN_ZONE_LINGER 300`, ticks every 0.5s).

### 14.2 Cryomancer

- **Color:** `#44bbff` | **HP 7 · Speed 185 · Mana 100 (regen 14)**
- **Identity:** ice control, frostbite synergy — slowed enemies take bonus damage.
- **Passive — Frostbite:** slowed enemies take +1 dmg.
- **LMB Frost Ray** (Beam): 1.2 dmg, 250 range, 1.0s slow, applies `frost` mark (3 stacks).
- **RMB Freeze Breath** (Cone): 2 dmg, 120 range, 1.5s slow. Detonates `frost` stacks (+2/stack, AoE 60, spread to nearby, 0.3s stun).
- **Q Blizzard** (Zone): 1 dmg/tick, 90 radius, 4s, 0.8s slow. Persistent cold zone.
- **Space Absolute Zero** (Ultimate, charge 100): global freeze for `FREEZE_DURATION 1.5s`.

### 14.3 Stormcaller

- **Color:** `#bb66ff` | **HP 7 · Speed 190 · Mana 100 (regen 2 — slow!)**
- **Identity:** channeled lightning caster. Mana-starved by design — relies on channel ramp-up + feedback loop rewards.
- **Passive — Feedback Loop:** auto-detonations refund 0.3s of Storm Step cd and build +5% channel damage (caps at +50%).
- **LMB Lightning** (Beam, channel): 1 dmg, 320 range, mana 0 (free), 0.28s cd, **channel 1.5s** ramping to ×2.5 dmg, slow 0.5 while channeling, breaks at 3+ dmg taken. Applies `static` mark (3 stacks).
- **RMB Discharge** (Nova, channel): 10 dmg, 180 range, 2s stun, mana 50, cd 5s, channel 2.5s to full power, breaks at 5+ dmg. Detonates `static` stacks (+3/stack, 0.5s stun).
- **Q Storm Step** (Blink): 180 range teleport, mana 25, cd 2.5s.
- **Space Thunder God** (Ultimate, charge 100): 50% movement speed buff + infinite chain-lightning auto-targeting for duration.

### 14.4 Arcanist

- **Color:** `#ff55aa` | **HP 7 · Speed 195 · Mana 90 (regen 13)**
- **Identity:** arcane mobility, homing attacks, bounce-y kit.
- **Passive — Arcane Echo:** hits have 25% chance to echo (re-cast LMB for free).
- **LMB Arcane Bolt** (Homing): 1.5 dmg, 300 spd, homing strength 2.5, mana 7, cd 0.28s.
- **RMB Blink** (Blink): 170 range teleport.
- **Q Barrage** (Barrage): 7 projectiles, 1 dmg each, 0.4 rad spread.
- **Space Arcane Storm** (Ultimate): homing missile swarm over duration (`ARCANE_STORM_TIMEOUT 50` total).

### 14.5 Necromancer

- **Color:** `#55cc88` | **HP 7 · Speed 180 · Mana 100 (regen 14)**
- **Identity:** master of undead. Builds a skeleton army via Death Marks, drains HP to sustain.
- **Passive — Bone Collector:** kills heal you 0.5 HP and the nearest skeleton 1 HP.
- **LMB Skull Bolt** (Homing): 1 dmg, 340 spd, homing 1.8, applies `death` mark (1 stack, 5s). Skeletons prioritize death-marked targets and deal +40% damage to them.
- **RMB Raise Skeleton** (Ultimate, charge 0): summons a skeleton at cursor. Cap 6. 6 HP, 20s lifespan.
- **Q Drain Tether** (Tether): 220 range, 2 dmg/tick, 1.5 heal/tick, 0.3s tick rate, 4s duration. Heal splashes to skeletons within 200u.
- **Space Army of Dead** (Ultimate, charge 100): summons 8 Bone Warriors (10 HP × ultPower, `_dmgMul 1.5`) around the player for 15s.

### 14.6 Chronomancer

- **Color:** `#ffcc44` | **HP 6 · Speed 195 · Mana 110 (regen 16)**
- **Identity:** time magic — haste allies, slow/stun enemies.
- **Passive — Haste Aura:** nearby ally gains +15% move speed.
- **LMB Time Bolt** (Projectile): 2 dmg, 480 spd, 0.3s stun.
- **RMB Temporal Field** (Zone): no dmg, 2.5s slow, 0.3s stun per tick, 70 radius, 3.5s.
- **Q Temporal Tether** (Tether): 200 range, full reward = 2.5s stun.
- **Space Time Stop** (Ultimate, charge 100): freezes all enemies `TIME_STOP_DURATION 3s`, player moves at ×1.5.

### 14.7 Knight

- **Color:** `#aabbcc` | **HP 12 · Speed 170 · Mana 80 (regen 12)**
- **Identity:** tank. Absorbs damage, shields allies, charges in.
- **Passive — Bulwark:** take 25% less damage.
- **LMB Shield Throw** (Projectile): 2 dmg, 350 spd, pierce 1.
- **RMB Shield Combo** (Leap): 100 range, 60 AoE, 0.5 slow. Combo (2 steps): step 2 stuns 1s and deals ×2 dmg.
- **Q Charge** (Blink): 200 range dash.
- **Space Shield Wall** (Ultimate, charge 120): `UNBREAKABLE_DURATION 5s` invuln + reflect.

### 14.8 Berserker

- **Color:** `#ff4444` | **HP 14 · Speed 200 · Mana 70 (regen 10)**
- **Identity:** melee, lower HP = stronger.
- **Passive — Fury:** below 50% HP: +50% dmg & spd, 5% lifesteal, aura DPS (80u range, +1 dps, +30% dmg).
- **LMB Axe Combo** (Cone): 2.5 dmg, 50 range, 1.5 rad angle. Combo 3: step 3 adds 50 AoE.
- **RMB Throwing Axe** (Projectile): 3 dmg, 500 spd.
- **Q Leap Slam** (Leap): 180 range, 60 AoE, 3 dmg.
- **Space Blood Rage** (Ultimate, charge 80): `BLOOD_RAGE_DURATION 5s` × `BLOOD_RAGE_DMG_MULT 2` damage dealt + taken.

### 14.9 Paladin

- **Color:** `#ffddaa` | **HP 10 · Speed 180 · Mana 120 (regen 16)**
- **Identity:** support. Heals ally, smites undead, zone control.
- **Passive — Aura of Light:** nearby ally regens 2 HP/s.
- **LMB Smite** (Projectile): 2 dmg, 25 explode, applies `judgment` mark.
- **RMB Holy Shield** (AllyShield): 3s shield on player + ally.
- **Q Consecrate** (Zone): 2 dmg/tick, 100 radius, 3s, heals 2/tick, detonates judgment (+3/stack, 100 AoE, heals on detonate).
- **Space Holy Light** (Ultimate, charge 100): heal all allies `PALADIN_HEAL_FRACTION 75%` max HP, smite all enemies.

### 14.10 Ranger

- **Color:** `#88cc44` | **HP 6 · Speed 210 · Mana 90 (regen 14)**
- **Identity:** fast shooter with safety. Spammy charged LMB, evasive rolls, sky-strike + storm for wave clear.
- **Passive — Eagle Eye:** primary range +40%. 3rd+ consecutive hit on same target crits.
- **LMB Power Shot** (Projectile, chargeable): 1 dmg base, 620 spd, pierce 2. Charges in 0.45s (slow ×0.7) to 4 dmg. Auto-fires on full charge. Pillar-proximity grants ×1.5 bonus.
- **RMB Roll** (class hook, velocity dash): 200u slide over 0.28s at 720 u/s, iframes for duration + 0.2s. Animated afterimages. Mana 12, cd 2.5s.
- **Q Plunging Arrow** (AoeDelayed): arrow from sky at cursor, 65 radius, 4 dmg, 0.45s telegraph.
- **Space Arrow Storm** (Ultimate, charge 100): rain arrows in 180r circle around player for 3s, ~17 volleys of 2 markers each. Follows player position every volley.

### 14.11 Druid

- **Color:** `#44aa33` | **HP 9 · Speed 185 · Mana 100 (regen 14)**
- **Identity:** nature + summons + heals.
- **Passive — Regrowth:** regen 1 HP every 7s.
- **LMB Thorn Swipe** (Cone): 1.5 dmg, 80 range, 0.4s slow.
- **RMB Entangle** (Zone): 60 radius, 2s stun per tick, 2s duration.
- **Q Spirit Wolf** (Ultimate, charge 0): summons a wolf ally (8 HP, 120 spd, 2 dmg). Augment grants 2.
- **Space Nature's Wrath** (Ultimate, charge 100): ring of 6 thorn zones + 2 Treants (auto-fighting summons, 10s life).

### 14.12 Warlock

- **Color:** `#8833aa` | **HP 6 · Speed 175 · Mana 120 (regen 18)**
- **Identity:** voodoo priest — cone-sprays curses, detonates for lifesteal bursts.
- **Passive — Voodoo Priest's Pact:**
  - *Blood Doll*: damage you take mirrors to the most-cursed enemy owned by you.
  - *Contagion*: killing a cursed enemy spreads 1 stack to 2 nearest enemies within 120u.
- **LMB Hex Powder** (Cone): 1 dmg, 120 range, 1.2 rad angle. Applies `voodoo` mark (cap 10, 6s duration).
- **RMB Release Hex** (class hook): detonates every cursed enemy within 180u of cursor. Damage = `stacks × 3`. Heals caster `stacks × 1` HP per enemy consumed. Splash applies 1 stack for chain-setup. Mana 18, cd 2.5s.
- **Q Voodoo Totem** (class hook): plants `_totem` entity at cursor (5s, 10 HP). Curses enemies within 150u at 1 stack / 0.8s; regens player 1 HP/s while within 150u. Mana 22, cd 6s.
- **Space Summon the Loa** (Ultimate, charge 100): places giant `_loa` spirit (10s, 60 HP, 250u curse aura at +1 stack/0.4s). On expire, every cursed enemy globally detonates for `stacks × 5` with 80r AoE splash.

### 14.13 Monk

- **Color:** `#eedd88` | **HP 7 · Speed 210 · Mana 80 (regen 12)**
- **Identity:** martial arts, dodge, backstab.
- **Passive — Inner Peace:** 25% dodge chance, +50% dmg from behind enemies.
- **LMB Chi Combo** (Cone): 1 dmg, 60 range, combo 3 (0.8/1.2/2.5 scaling, step 3 stuns 0.5s + 40 AoE).
- **RMB Flying Kick** (Leap): 180 range, 55 AoE, 4 dmg.
- **Q Chi Burst** (Zone): 40r heal zone, 2 HP/tick.
- **Space Thousand Fists** (Ultimate, charge 80): cone of 20 rapid melee strikes with knockback (`MONK_CONE_ANGLE 0.8`, `MONK_KNOCKBACK 30`).

### 14.14 Engineer

- **Color:** `#dd8833` | **HP 9 · Speed 175 · Mana 100 (regen 14)**
- **Identity:** builds turrets and gadgets.
- **Passive — Overclock:** turrets fire 20% faster.
- **LMB Wrench Throw** (Projectile, weak homing).
- **RMB Deploy Turret** (Zone): 15s turret that fires 1 dmg every 0.8s in 120r.
- **Q Mine Field** (Trap): 3 mines, 4 dmg, 45r.
- **Space Mega Turret** (Ultimate, charge 120): 12s, `TURRET_RADIUS 100`, 20 HP, high fire rate.

### 14.15 Graviturge

- **Color:** `#6644aa`
- **Identity:** gravity aura + sustain.
- **Passive — Gravity Well:** enemies within 80u take 0.5 dps, each nearby enemy grants +1 mana/s.
- **LMB Gravity Bolt** (Projectile): 0.5s slow on hit.
- **RMB Singularity** (Zone): 80r, 4s, 0.8s slow, 1.5 dps.
- **Q Event Horizon** (Tether): 200 range, 2 dmg tick, 1 heal tick. Reward: 2s stun + 3 burst dmg + 2 burst heal.
- **Space Gravitational Ruin** (Ultimate, charge 100): 200r pull vortex (`GRAVITY_PULL_RANGE`, `GRAVITY_PULL_DMG 4`, 3s slow).

### 14.16 Bladecaller

- **Color:** `#cc3355` | **HP 6 · Speed 210 · Mana 100 (regen 14)**
- **Identity:** vampiric fencer — stealth, backstab bursts, lifesteal.
- **Passive — Crimson Edge:** 15% lifesteal. Backstabs ×2.5, lifesteal 40%. Stealth-crit kill grants 3 HP shield.
- **LMB Blade Thrust** (Cone, narrow 0.18 rad = line thrust): 4 dmg, 70 range. Combo 3: step 3 +35 AoE, 0.1s stun.
- **RMB Shadow Step** (Leap, target-locked): 140 range, 14 dmg on the locked target. Teleports + strikes.
- **Q Phantom Veil** (Ultimate, charge 0): 2s stealth, heals 4 HP, +30% speed, next attack auto-crits.
- **Space Thousand Cuts** (Ultimate, charge 100): 12 auto-hits of 2 dmg on 3 nearest enemies every 0.25s for 2.5s, all crit, vampiric.

### 14.17 Architect

- **Color:** `#44aacc`
- **Identity:** zone constructs, fortification DR near own zones.
- **Passive — Fortification:** −20% dmg taken + 1 mana/s while near own zones.
- **LMB Arcane Bolt** (Homing).
- **RMB Deploy Construct** (Zone): 12s turret zone, 0.3s slow.
- **Q Scatter Mines** (Trap): 4 mines, 3 dmg, 1.5s slow.
- **Space Mega Construct** (Ultimate, charge 100): massive persistent arcane construct (`MEGA_CONSTRUCT_RADIUS 130`, 15s, 2 dps slow).

### 14.18 Hexblade

- **Color:** `#7755cc`
- **Identity:** stance-switching hybrid. Caster form vs Blade form.
- **Passive — Hex Mastery:** hex-marked enemies take +25% dmg from all sources; 3 stacks also slows 30%.
- **Caster form**: Hex Bolt (weak homing projectile), Doom Mark (applies mark), Void Zone (slow zone).
- **Blade form**: Hex Slash (wide cone), Shadow Leap (instant AoeDelayed), Whirlwind (Nova).
- **Stance switch** Space: swaps kits, 3.5s cd, 1s buff (×1.5 dmg, +2 armor).

### 14.19 Warden

- **Color:** `#5588aa`
- **Identity:** shield tank, body-blocks for allies. Faces determine DR.
- **Passive — Sentinel:** take 20% less damage from enemies you face; melee attackers marked for +1 ally dmg.
- **LMB Guardian Strike** (Cone).
- **RMB Bastion** (Zone): 70r aura, allies inside take ×0.8 damage (`BASTION_ALLY_DR_MULT`).
- **Q Aegis Link** (AllyShield): 4s shield on self + ally.
- **Space Unbreakable** (Ultimate, charge 100): `UNBREAKABLE_DURATION 5s` at `UNBREAKABLE_DR 0.8` (80% DR) + aura shield.

### 14.20 Cannoneer

- **Color:** `#aa7733` | **HP 10 · Speed 160 · Mana 90 (regen 12)**
- **Identity:** heavy artillery. Devastating damage, low mobility. LMB/RMB = single-target, Q/Space = wave clear.
- **Passive — Heavy Caliber:** every 4th shot deals ×2 damage with doubled explode radius.
- **LMB Power Shot** (Projectile, chargeable): 3 dmg, 500 spd, 40 explode, pierce 1. Charges in 1.0s to 8 dmg + 25 bonus radius. Auto-fires on full charge.
- **RMB Cannonball** (Projectile + class hook): 5 dmg, 420 spd, pierce 99, 2.2s life. Casting also triggers `Recoil` — player pushed backward ~90u over 0.14s with 0.1s iframes (weaker escape than Ranger Roll).
- **Q Heavy Shell** (class hook): single massive slow rocket arcs to cursor (0.65s), 110r blast, 10 dmg. Triple-ring shockwave, fat particle burst, screen shake.
- **Space Rocket Barrage** (class hook, charge 100): rains ~17 medium rockets on the cursor over 3s (180ms between launches, ±36u scatter), each 5 dmg in 70r AoE. Cursor re-read per volley — sweep the mouse to steer.

### 14.21 Soulbinder

- **Color:** `#55aa88`
- **Identity:** soul mage + ally empowerment via marks.
- **Passive — Soul Bond:** LMB marks enemies (4s); allies deal +1 dmg and heal 0.5 HP on marked kills.
- **LMB Soul Lash** (Beam): 1.5 dmg, 220 range.
- **RMB Soul Tether** (Tether): 250 range, 0.4s tick, 2s duration. Reward: 1.5s stun.
- **Q Soul Surge** (Zone): 80r heal zone, 1.5 heal/tick, 4s.
- **Space Soul Storm** (Ultimate, charge 100): `SOUL_STORM_RADIUS 200` + 3 dps.

### 14.22 Invoker

- **Color:** `#cc8844`
- **Identity:** multi-element combos.
- **Passive — Elemental Attunement:** burning + slowed enemies take +1 dmg/tick; stunned + burning enemies take ×2 burn dmg.
- **LMB Flame Bolt** (Projectile): 2 burn applied.
- **RMB Frost Spike** (Projectile): 1.5s slow, pierce 1.
- **Q Storm Strike** (AoeDelayed): 3.5 dmg, 70r, 0.8s stun.
- **Space Elemental Convergence** (Ultimate, charge 100): triple-element storm (`CONVERGENCE_RADIUS 90`, 4s, 2 dps).

### 14.23 Tidecaller

- **Color:** `#3388bb`
- **Identity:** water mage + summons with stacking damage bonus.
- **Passive — Rising Tide:** each active summon grants +10% ability damage (max 3); 2+ summons enhance slow 0.6s.
- **LMB Water Bolt** (Homing).
- **RMB Tidal Wave** (Cone): 130 range, 1.5s slow.
- **Q Summon Elemental** (Ultimate, charge 0).
- **Space Tsunami** (Ultimate, charge 100): `TSUNAMI_RADIUS 300`, 4 dmg, 150 push, 2s slow.

### 14.24 Voidweaver

- **Color:** `#aa44cc`
- **Identity:** debuffs, traps, zones.
- **Passive — Entropic Decay:** debuffed enemies take +15% dmg; debuffed kills explode for 1 AoE dmg.
- **LMB Void Bolt** (Projectile): 3 burn, 0.4s slow.
- **RMB Corruption Zone** (Zone): 90r, 5s, 1s slow, 1 dps.
- **Q Void Traps** (Trap): 3 traps, 3 dmg, 2s slow.
- **Space Void Rift** (Ultimate, charge 100): `VOID_RIFT_RADIUS 160`, 5s, 3 dps persistent zone.

---

## 15. Porting Notes (2D → 3D)

### Coordinate mapping

- 2D `x, y` → 3D `x, z` (ground plane). Y is always 0 for gameplay, reserved for visual-only motion (meteor arcs, arrow drops, floating damage text).
- Angles: 2D `angle` is atan2(dy, dx); in 3D, use the same angle around the Y axis for facing/aim.

### Rendering translation

- **Projectiles**: replace sprite + trail particles with 3D meshes + trail renderer. Spell runtime already carries `vx, vy, color, trail, radius` — map radius to mesh scale.
- **Beams**: line renderer from caster to endpoint, width = spell `width`.
- **Zones / AoE markers**: decal on ground + optional vertical mesh (dome, pillar). Marker delay telegraph → warning ring decal that fills as `age/delay` approaches 1.
- **Shockwaves**: ring decal that expands, alpha fades out.
- **Particles**: GPU particle system, pooled. Colors and emitter scale match `spawnParticles()` inputs.
- **Cone spells**: arc-mesh decal on ground + line-cast hit detection.
- **Nova**: ring decal expanding from caster.

### Custom character renderers

Each class draws the player sprite differently in 2D (see `draw-entities.ts`). The 2D code doubles as a spec for silhouette/attitude: Berserker carries axes, Bladecaller has cape + sword, Warlock has staff + voodoo fetishes, Cannoneer has cannon backpack, Ranger carries bow, etc. Re-create these in 3D as distinct models/rigs.

### Animation states (shared)

All players drive these flags for anim:
- `_animMoving` — walk blend
- `_animCastFlash` — cast anim trigger (0.35s)
- `_animHitFlash` — hit reaction (0.3s)
- `_animDeathFade` — 1.0 → 0 on death (1s)
- `_animUltTimer` — ult signature anim window (0.8s)
- `_atkAnim` (enemies) — 0.2s wind-up before hit
- `_chargeLevel, _chargeSlot` — charge-up overlay (Ranger/Cannoneer/Warlock pre-rework)

### Camera

Top-down orbital at ~45°, following the player. For co-op, camera framing should track midpoint of both players with padding.

### Input bindings (default)

- LMB → spell slot 0 (hold to charge if applicable)
- RMB → spell slot 1 (hold to charge if applicable)
- Q → spell slot 2
- Space → slot 3 (ultimate)
- WASD → movement
- Shift → auxiliary dash (via `hasDash` augment; optional)

### Authority model

Single-player: all logic local. Co-op: Host runs game logic, broadcasts state via network delta packets + `pendingFx` buffer. See `src/network.ts` for the schema.

---

## 16. Tuning Philosophy

- **Single-target vs wave-clear split:** every class should have one button for priority threats and one for clearing packs. Ranger and Cannoneer recently formalized: LMB+RMB = target, Q+Space = wave.
- **Mobility tradeoff:** faster classes (Ranger 210, Monk 210, Berserker 200) get 6–7 HP; tanks (Knight 12, Berserker 14, Warden 10) move 170 or slower. Cannoneer is the extreme: 160 spd + 10 HP + huge damage, weak escape.
- **Channeling / charging / rooting:** committed casting is rewarded with higher ceiling (Stormcaller channel, Cannoneer Power Shot). Removed hard movement locks from Cannoneer Siege Mode because they felt bad in playtests — the current tradeoff is slow base speed, not explicit root.
- **Passives must carry the identity** on their own if the spells were stripped. Voodoo Priest's Pact (Blood Doll + Contagion), Eagle Eye (consecutive crit), Heavy Caliber (every 4th shot), Crimson Edge (vampirism + backstab) — these define fantasy even without casting.
- **Marks + Detonators** are the main "combo point" system. A class applies stacks, another mechanism consumes them for burst. Cryomancer, Paladin, Stormcaller, Warlock, Necromancer all follow this.

---

## 17. Visual Identity & Animation

**Art direction today (2D):** neon-on-dark, saturated class colors, chunky readable silhouettes, strong color-coded spellwork. Readability beats realism — every class, enemy, mark, and AoE is recognizable at a glance by color + shape alone.

### 17.1 Core visual language (keep in 3D)

- **Glow-first palette**: every class has a primary color (`color`) and a secondary glow (`glow`). All class-owned particles, trails, shockwaves, and aura decals inherit these. Enemy marks also carry their own mark color. In 3D, use emissive materials for these — don't let rim-light be overwhelmed by scene lighting.
- **Color = team**: player color for your hits, red/purple hues for enemies, green for friendly summons. Never reuse the player's color on a threat.
- **Telegraphs before impact**: everything dangerous pulses/fills a ring for 0.3–0.9s before hitting (AoE markers, Meteor, Plunging Arrow, Mortar Strike, Cannoneer Shell). Keep that telegraph intact in 3D — decal ring on ground + fill percentage = `age/delay`.
- **Chunky impact hits**: on damage/detonate, spawn `spawnShockwave` + `spawnParticles` + `shake`. Layered feedback: ring, burst, camera jolt. Port as: ring decal + particle burst + camera impulse.
- **Floating damage numbers**: red for hits taken, spell-color for hits dealt, green for heals, gold for XP/gold pickups. `spawnText()` sends a string that bobs up 50u and fades over ~1s.
- **Screen flash** on big events (`flashScreen()`) — full-screen color overlay 0.2–0.3s at low alpha. Use a fullscreen post-process in 3D.
- **Screen shake** (`shake()`) — amplitude 2–12, fades exponentially. Camera Y/Z jitter in 3D.

### 17.2 Particle palette & FX timings

| FX                    | Duration | Count  | Scale |
| --------------------- | -------- | ------ | ----- |
| Hit particle          | 0.3s     | 4–8    | 0.3   |
| Cast flash            | 0.35s    | —      | ring + glow |
| Explosion             | 0.5–0.8s | 10–30  | 0.5–1.0 |
| Death puff            | 0.5s     | 8–12   | 0.5   |
| Muzzle flash          | 0.25s    | 3–5    | 0.3   |
| Zone lingering        | full duration | trickle 0.025/frame | small |
| Heal / pickup         | 0.3s     | 3–5    | 0.35  |

Particles in 2D have `r = 1 + rand*3`. In 3D, map to small billboard quads or small GPU-particle spawners with ~0.1–0.4 m radius.

### 17.3 Animation states (all entities)

Existing flags drive animation blending. Preserve semantics when re-rigging in 3D:

**Player**
- `_animMoving` → walk/run blend
- `_animCastFlash` (0.35s) → cast flourish; glow on weapon
- `_animHitFlash` (0.3s) → flinch + red tint
- `_animDeathFade` (1.0s → 0) → fade + scale-down collapse
- `_animUltTimer` (0.8s) → class-specific ult signature (e.g., Bladecaller thousand-cuts spinning, Cannoneer bracing)
- `_chargeLevel, _chargeSlot` → charge-up overlay growing ring/glow
- `_rollTimer` (Ranger) → rolling tumble anim; afterimage ghosts trail 6 frames
- Idle bob: `sin(time * 2.5) × 2px` vertical
- Move lean: `vx × 0.002` roll tilt into direction

**Enemy**
- `_atkAnim` (0.2s) → attack wind-up: pull-back, then lunge/fire on release
- `_hitFlash` (0.12s) → tint/scale flash on hit
- `_deathTimer` (1.0s) → death animation window; enemy disabled but still drawn

**Summons / totems**
- Skeleton: walking gait with bob, weapon bob, sway sword on aim angle
- Voodoo Totem: idle sway `sin(time × 2.5) × 2`, skull-eye pulse `0.5 + 0.5 sin(time × 3)`
- Loa: floating bob `sin(time × 1.8) × 4`, robe-bottom scalloping wave, flicker-out in final 1.5s of life

### 17.4 Per-class visual signatures

Condensed silhouette notes — preserve these in 3D model design.

| Class        | Visual signature |
| ------------ | ---------------- |
| Pyromancer   | Red robe, flame staff, fire aura |
| Cryomancer   | Blue robe, ice crystal staff, breath steam |
| Stormcaller  | Purple hood, tendrils of arcing lightning; channels build visible charge rings at feet |
| Arcanist     | Pink mage, book + floating glyphs, echo shimmer |
| Necromancer  | Green cloak, bone staff, skull motif; skeleton retinue has visible bones, glowing green eye sockets |
| Chronomancer | Gold robe, clock pendant, slow-motion distortion around target |
| Knight       | Full plate, large shield, metallic silver |
| Berserker    | Red shirtless barbarian, dual axes, gets blood-red when < 50% HP |
| Paladin      | White-gold plate, hammer, halo aura |
| Ranger       | Green hood, bow, quiver; roll shows afterimage silhouette trail |
| Druid        | Brown/green robes, antlers, wooden staff |
| Warlock      | Dark purple robes, bone-fetish staff, skull mask. Voodoo Totem: carved stake with skull + feather + bone charms + pulsing ritual circle. Loa: giant skeletal priest in dark robes with top hat + red band (Baron Samedi) |
| Monk         | Gold-yellow gi, bare hands, light bob |
| Engineer     | Brown-orange jumpsuit, wrench, deployable turret |
| Graviturge   | Deep purple, orb-above-hand, gravity well ripple on ground |
| Bladecaller  | Crimson + black, rapier + cape, stealth dissolve effect |
| Architect    | Teal robe, crystal arm, constructs as blueprint shimmer |
| Hexblade     | Purple ↔ red stance swap; visible stance aura color switch |
| Warden       | Blue plate, tower shield, wall-of-light on ally |
| Cannoneer    | Brown coat + heavy cannon on shoulder, recoil slide visible on RMB |
| Soulbinder   | Seafoam green, chain-link scarf, ghostly soul links between tethered targets |
| Invoker      | Orange-gold robes, elemental orbs rotating |
| Tidecaller   | Deep-blue robes, water orb, rising tide visible at feet |
| Voidweaver   | Dark purple + pink, void orb, reality-tear zone aura |

### 17.5 AoE & ability visual signatures (key pieces)

- **Meteor / Plunging Arrow / Heavy Shell**: projectile visibly falls from above during telegraph window. Shadow on ground scales with approach. Preserve for 3D — real 3D depth makes this even better.
- **Fire zones**: lingering flame licks + smoke. Inferno leaves burn-zone for 5 min in-run (`BURN_ZONE_LINGER 300`).
- **Ice zones**: frost crystal decals that persist; frozen enemies get crystalline overlay.
- **Lightning beams**: jagged polyline with branching sparks. Arc length 3–5 segments. In 3D, procedural mesh with jitter or particle-chain.
- **Voodoo curse indicator**: small purple skull floating above cursed enemies, scaled by stack count (visual pins accumulating). Currently uses `mark indicator` ring with stacks. In 3D, render as floating skull sprite or glyph above head; scale + rotate for stack count.
- **Tether visual**: pulsing beam from player to target with traveling flow-dots. Colored by class.
- **Rocket barrage (Cannoneer)**: each rocket has a dense flight trail (bright yellow core + orange wake + dark smoke plume). Impact: two-ring shockwave + 70r AoE. Port as actual 3D mesh rocket with flame particle tail.
- **Roll (Ranger)**: 6 afterimage ghosts trailing behind player for 0.35s each + streak line from oldest ghost to current position. In 3D, ghost meshes with decreasing alpha + motion blur or trail mesh.
- **Stealth (Bladecaller)**: player rendered at 0.22 alpha silhouette. In 3D, transparent/refractive shader with subtle outline.
- **Death marks (skull icons above enemies)**: visible floating indicator for mark stacks.

### 17.6 Cinematic upgrade opportunities (future)

The user wants to eventually push more cinematic feel. Preserve the current *idea* of each effect, but upgrade the fidelity:

- **Replace particle puffs with stylized animated sprites** (in 2D) or skinned FX meshes (3D) for signature spells. Example: Heavy Shell's impact could get a full slow-mo shockwave + lingering dust column.
- **Hit-stop frames** on big impacts (Cannoneer Heavy Shell, Bladecaller Shadow Step, Berserker Leap Slam): freeze the game for 4–6 frames on landing, then snap into animation. Already hinted at by current shake; add formal freeze.
- **Dynamic lighting** tied to spell cast — a pulse of class-color light at cast, bigger for ultimates. In 2D, radial gradient overlay; in 3D, a point light pulse on caster + projectile.
- **Camera nudges** — subtle zoom-in on ultimate cast (10–15% FOV pull for 0.3s), zoom-out on Tsunami/Arrow Storm/Rocket Barrage to reveal scope.
- **Chromatic aberration + vignette** on big hits, Fury activation, ult cast.
- **Slow-mo on final-kill frame** of a boss — 0.4x time scale for 0.8s.
- **Weapon trails in 3D** for melee classes (Berserker, Monk, Bladecaller) — ribbon trails on axe/sword paths during attack arcs.

All of these enhance the existing feedback loop without changing what each ability *communicates*. Readability (who is casting what, who is about to be hit where) is the floor — don't bury the telegraph under post-fx.

### 17.7 Must-preserve readability rules

When porting, these should never be sacrificed for aesthetics:

1. **Dangerous ground is always telegraphed** by a filling warning ring before damage.
2. **Player color is sacred** — the color of your own spells never gets hidden by the enemy color.
3. **Stack counts on marked enemies are visible** (floating count or scaled icon).
4. **Tether link is clearly drawn** — you can see which enemy you're bound to.
5. **Cooldown state on abilities** is clear from HUD (filled vs empty icon with overlay).
6. **Ult charge progress** is visible at all times on the Space icon.
7. **Low-HP feedback** — red vignette + louder heartbeat SFX as HP drops below 30%.

---

## 18. File Map (for implementers)

| Area              | Location                               |
| ----------------- | -------------------------------------- |
| Class defs        | `src/classes/defs.ts`                  |
| Class hooks       | `src/classes/<name>/hooks.ts`          |
| Hook interface    | `src/classes/hooks.ts`                 |
| Enemy defs        | `src/constants/enemies.ts`             |
| Ultimate constants| `src/constants/ultimate.ts`            |
| Combat constants  | `src/constants/combat.ts`              |
| Economy constants | `src/constants/economy.ts`             |
| Arena constants   | `src/constants/arena.ts`               |
| Combat system     | `src/systems/combat.ts`                |
| Physics / movement| `src/systems/physics.ts`               |
| Enemy AI          | `src/systems/enemy-ai-system.ts`       |
| Enemy attack      | `src/systems/enemy-attack-system.ts`   |
| Tether system     | `src/systems/tether-system.ts`         |
| Mark application  | `src/systems/combat.ts` (`applyMarkToEnemy`, `detonateMarks`) |
| Render entities   | `src/rendering/draw-entities.ts`       |
| Render effects    | `src/rendering/draw-effects.ts`        |
| Render HUD        | `src/rendering/draw-hud.ts`            |
| Augment pool      | `src/upgrades/pool.ts`                 |
| State / types     | `src/state.ts`, `src/types.ts`         |

---

*Doc generated 2026-04-19 to reflect current master. Keep in sync as the balance sheet evolves.*
