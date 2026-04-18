# Bladecaller — Design Reference

Comprehensive design spec for the Bladecaller class. This is the source of
truth for numbers, behaviors, and the reasoning behind each choice.

---

## Identity

Vampiric fencer. A squishy, high-mobility assassin that commits to single
targets, punishes backstabs, and sustains through lifesteal. Every spell
feeds the vampire theme — connect and you heal, whiff and you die.

**Class color:** `#cc3355` (crimson). Stealth tint: `#441122`.

---

## Bindings

| Slot | Key | Name | Type |
|------|-----|------|------|
| 0 | LMB | Blade Thrust | Cone (narrow, combo) |
| 1 | RMB | Shadow Step | Leap (target-locked) |
| 2 | Q | Phantom Veil | Stealth + HoT + crit-prime |
| 3 | Space | Thousand Cuts | Ultimate (flurry) |

---

## Base Stats

- HP **6** (squishy)
- Move speed **210** (fastest tier)
- Mana **100**, regen **14**
- Color `#cc3355`

---

## Passive — Crimson Edge

- **15% lifesteal** baseline on all damage dealt.
- **Backstabs** deal `2.5x` damage (the `passive.backstab` multiplier) and
  lifesteal an additional **40%** of the damage dealt.
- **Stealth-crit kill** grants `_stealthShield = 1.5s` — the next hit taken
  is blocked entirely (gives iframes).
- **Kill Rush (kept from prior kit):** Kills within 1.5s of Shadow Step
  reset its cooldown. Kills grant +10% move speed for 3s.

---

## Spells

### Blade Thrust — LMB (Cone, narrow combo)

```
dmg 4, range 70, angle 0.18, mana 3, cd 0.3,
combo: steps 3, timeout 1.5,
  dmgScale [1.0, 1.3, 2.8],
  effects: { 3: { aoeR 35, stun 0.1 } }
```

- A very narrow cone (0.3 rad ≈ 17°) that reads as a fencing thrust rather
  than a swing.
- Damage per step: **4 → 5.2 → 11.2**. Step 3 lunge bursts an AOE and stuns
  briefly, and pops bleed on the target.
- Phantom-Veil-primed crit multiplies the hit by 2x. Step-3 Veil-crit =
  **22.4** damage single-target.

### Shadow Step — RMB (Leap, `targetLock: true`)

```
dmg 14, aoeR 0, range 140, mana 12, cd 3
```

- **Single-target by default.** `aoeR === 0` makes the combat handler damage
  only the selected target. An augment can raise `aoeR` to enable the
  shockwave cleave later.
- Picks the **enemy nearest the cursor** within `range` (200 units from the
  caster, measured from the caster position, not the cursor).
- Teleports the caster to a point **behind** that enemy
  (`enemy + (enemy - caster).normalize() * (enemySize + WIZARD_SIZE + 4)`),
  then deals the backstab-multiplied hit — the post-teleport position puts
  the caster behind the target so the passive `backstab` trigger fires
  naturally.
- If no valid enemy is in range → spell fizzles: **mana is refunded, cd is
  cleared**, "NO TARGET" text shown. No whiff penalty.
- Grants `TIMING.IFRAME_LEAP` on arrival.
- Sets `_lastShadowStep = state.time` for the Kill Rush cd reset hook.
- Effective single-target damage: 14 × 2.5 (backstab) = **35**. Stealth-primed
  from Phantom Veil = **70**.

### Phantom Veil — Q (Ultimate-typed, `key: 'Q'`)

```
type Ultimate, ultCharge 0, mana 20, cd 10, duration 2, heal 4
```

- Sets `p._stealth = 2` and `p._critPending = true`.
- Enemy AI (`enemy-ai-system.ts`) and attack targeting
  (`enemy-attack-system.ts`) skip players with `_stealth > 0` — they cannot
  be targeted, though already-fired projectiles still travel their paths.
- Heals `heal / duration = 2 HP/s` while active (4 HP total over 2s).
- Grants **+30% move speed** while active (enforced in physics tick).
- **Breaks on damage taken** (`damagePlayer` clears `_stealth` and
  `_critPending`).
- Does NOT break on Shadow Step (repositioning stealth is intentional) and
  does NOT break on Q re-press. Breaks on next damaging attack via the
  crit-pending consumption path.

### Thousand Cuts — Space (Ultimate, reworked)

```
type Ultimate, ultCharge 100
```

- Sets `p._bladeFlurry = 2.5` and `p._bladeFlurryTick = 0`.
- Physics tick (`physics.ts`): every 0.2s, finds the **nearest** living
  non-friendly enemy, **teleport-dashes** to a random offset next to them
  (18-26 units around the target), and strikes for
  `Math.round(6 * ultPower) * 2` damage (12 base, auto-crit via `* 2`).
- The visible teleport each tick is what sells the ult as a "dancing
  flurry" — 12–13 dashes across 2.5s.
- Each strike grants **20% bonus lifesteal** on top of the baseline 15%.
- **+30% move speed** during the ult.
- Ongoing 0.2s iframe refresh each tick (so the dashing caster eats no
  incidental damage). Screen flash, shockwave, red particles on cast.

---

## Augments

The Bladecaller has no class-specific augments yet. The class benefits
heavily from the generic **Assassin's Mark** stackable (backstab +0.3x per
stack, requires `passive.backstab`) and the universal **Life Steal** and
**Vampiric Curse** augments.

Future augment candidates (not yet implemented):
- **Twin Fangs**: Shadow Step backstab hits twice.
- **Silent Kill**: Kills while stealthed refresh Phantom Veil cooldown.
- **Exsanguinate**: Bleed from Blade Thrust step-3 ticks for more damage
  against enemies below 50% HP.

---

## Gameplay Loops

**Core rotation:** Shadow Step onto priority target → guaranteed backstab
(~25 dmg, heal) → Blade Thrust combo into step 3 (11.2 + bleed + AOE)
→ kill resets Shadow Step cd → next target.

**Under pressure:** Phantom Veil. Vanish, heal 4 HP over 2s, reposition to
a flank, then unload a guaranteed crit on a priority target. The kill grants
a Crimson Shield that blocks the next hit — a safe re-engage window.

**Ult window:** Thousand Cuts for teamfights. 10 strikes across 2.5s at the
3 nearest enemies each tick = **up to 30 hits, all auto-crits with
lifesteal** — massive AOE with full HP sustain.

---

## Implementation Notes

**Player state fields added (`types.ts`, `state.ts`):**

- `_stealth: number` — remaining stealth duration.
- `_critPending: boolean` — next damage roll is 2x.
- `_stealthShield: number` — remaining brief shield (blocks next hit).
- `_bladeFlurry: number` — Thousand Cuts duration remaining.
- `_bladeFlurryTick: number` — flurry tick accumulator.

**SpellDef field added:** `targetLock?: boolean` for Leap target-locking.

**Enemy AI change:** `isVisible()` helper in
`enemy-ai-system.ts` and `enemy-attack-system.ts` skips stealthed players.

**Lifesteal hook:** Baseline 15% lifesteal for Bladecaller added to the
existing `lifeSteal` block in `damageEnemy` — stacks additively with the
upgrade-based `p.lifeSteal`.

**Backstab lifesteal hook:** Placed inside the existing positional-bonus
`backstab` block in `damageEnemy`, gated on `p.clsKey === 'bladecaller'`.

**Crit-pending hook:** Applied early in `damageEnemy` after the standard
crit roll, so it multiplies into subsequent positional bonuses cleanly.
Sets `bladecallerVeilCrit` local flag used later to spawn `_stealthShield`
on kill.

---

## Decision History

- **Original Bladecaller** (pre-rework) was "Blade Chain (4-step cone) +
  Shadow Step + Blade Toss (barrage) + Thousand Cuts (12-dash ult)." The
  kit was a skirmisher — dash-combo-kill-reset loop with no real sustain
  and no panic button.
- **Theme shift to vampire fencer:** LMB tightened to a narrow 3-step
  thrust for single-target commit. RMB gained `targetLock` so the dash
  always finds a backstab. Blade Toss (barrage) was dropped entirely.
- **Q replaced** with Phantom Veil — stealth + HoT + crit-prime. Fills the
  "I messed up, reset the engage" slot that the old kit lacked.
- **Ult reworked** from setTimeout-spammed 12-dash barrage (buggy when
  enemies died mid-loop) to a physics-ticked flurry that re-scans each
  tick for the 3 nearest live targets. Cleaner, AOE, vampire-themed.
- **Passive gained `Crimson Edge`:** baseline 15% lifesteal (the vampire
  payoff), backstab lifesteal 40% (reward for positioning), stealth-crit
  kill shield (reward for chaining the Q → execute play).
