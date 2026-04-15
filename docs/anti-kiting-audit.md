# Anti-Kiting Mechanics Audit Report

**Date:** 2026-04-15
**Scope:** 8 anti-kiting mechanics across 24 wizard classes
**Sources:** `docs/anti-kiting-mechanics.md` (design spec) vs `src/shared/constants.ts` (implementation)

---

## System-Level Status

| # | Mechanic | Types | Runtime | Rendering | Status |
|---|----------|-------|---------|-----------|--------|
| 1 | Channeled Casting | ✅ | ✅ | ✅ | **Complete** |
| 2 | Charge-Up System | ✅ | ✅ | ✅ | **Complete** |
| 3 | Combo Chains | ✅ | ✅ | ✅ | **Complete** |
| 4 | Stance Switching | ✅ | ✅ | ⚠️ | **Complete** (no dedicated form indicator) |
| 5 | Tether Mechanics | ✅ | ✅ | ✅ | **Complete** |
| 6 | Positional Bonuses | ✅ | ✅ | ✅ | **Complete** |
| 7 | Alternative Resources | ⚠️ | ⚠️ | ❌ | **Partial** — only Rage (Blood Rage ult); Ammo/Heat not built |
| 8 | Mark/Detonate | ✅ | ✅ | ✅ | **Complete** |

**7 of 8** mechanics are fully operational at the system level. Alternative Resources remains partially implemented.

---

## Per-Class Audit

### 1. Pyromancer

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None.
- **Status:** N/A (potential candidate for future mechanics).

---

### 2. Cryomancer

- **Spec:** Mark/Detonate (frost marks on LMB, detonate on RMB).
- **Implemented:**
  - ✅ Frost Ray LMB — `applyMark: { name: 'frost', duration: 3.0, maxStacks: 3 }`
  - ✅ Freeze Breath RMB — `detonateMark: { name: 'frost', dmgPerStack: 2.0, aoeOnDetonate: 60, spreadOnDetonate: true, effectOnDetonate: { stun: 0.3 } }`
- **Status:** Fully compliant.

---

### 3. Stormcaller

- **Spec:** Channeled Casting on LMB + Mark/Detonate (static marks).
- **Implemented:**
  - ✅ Lightning LMB — `channel: 1.5, channelSlow: 0.5, channelScale: 2.5, channelTicks: 5, channelBreak: 3`
  - ✅ Ball Zap — `applyMark: { name: 'static', duration: 4.0, maxStacks: 3 }`
  - ✅ Thunder — `detonateMark: { name: 'static', dmgPerStack: 2.0, aoeOnDetonate: 65, effectOnDetonate: { stun: 0.5 } }`
- **Status:** Fully compliant.

---

### 4. Arcanist

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None.
- **Status:** N/A.

---

### 5. Necromancer

- **Spec:** Tether (RMB Life Siphon) + Stance Switching (Shadow Mage/Death Knight forms).
- **Implemented:**
  - ✅ Tether on RMB Life Siphon — `tetherRange: 180, tetherDmg: 1.5, tetherHeal: 1.0, tetherDuration: 3, tetherReward: { dmgBurst: 3, healBurst: 2 }`
  - ❌ No stance switching — still single form.
- **Status:** Partial. **Gap: Missing stance switching (Shadow Mage/Death Knight forms).**

---

### 6. Chronomancer

- **Spec:** Tether on Q.
- **Implemented:**
  - ✅ Temporal Tether on Q — `tetherRange: 200, tetherDuration: 4, tetherReward: { stun: 2.5 }`
- **Status:** Fully compliant.

---

### 7. Knight

- **Spec:** Combo on RMB (2-hit Shield Bash).
- **Implemented:**
  - ✅ Shield Combo RMB — `combo: { steps: 2, timeout: 2.0, dmgScale: [1.0, 2.0], effects: { 2: { stun: 1.0 } } }`
- **Status:** Fully compliant.

---

### 8. Berserker

- **Spec:** Combo on LMB + Proximity Bonus passive + Rage resource system (replace mana) + Channeled ultimate (Blood Rage 1.5s wind-up).
- **Implemented:**
  - ✅ Axe Combo LMB — `combo: { steps: 3, timeout: 2.0, dmgScale: [1.0, 1.2, 2.0], effects: { 3: { aoeR: 50 } } }`
  - ✅ Proximity bonus on passive — `proximityBonus: { range: 80, dmgMult: 1.3, aura: 1.0 }`
  - ❌ No Rage resource system — still uses mana (Blood Rage exists as ultimate buff, but not the full resource replacement the spec describes).
  - ❌ Blood Rage ultimate is not a channeled 1.5s wind-up.
- **Status:** Partial. **Gaps: Missing Rage resource system, missing channeled ultimate wind-up.**

---

### 9. Paladin

- **Spec:** Mark/Detonate (judgment marks on LMB, detonate on Q Consecrate).
- **Implemented:**
  - ✅ Smite LMB — `applyMark: { name: 'judgment', duration: 3.0, maxStacks: 1 }`
  - ✅ Consecrate Q — `detonateMark: { name: 'judgment', dmgPerStack: 3.0, aoeOnDetonate: 100, effectOnDetonate: { heal: 1.5 } }`
- **Status:** Fully compliant.

---

### 10. Ranger

- **Spec:** Charge-Up on LMB + Pillar position bonus.
- **Implemented:**
  - ✅ Power Shot LMB — `chargeTime: 1.2, chargeSlow: 0.5, chargeMinDmg: 0.5, chargeMaxDmg: 4.5, chargePierce: 2`
  - ✅ Pillar position bonus — `positionBonus: { type: 'pillar', mult: 1.5, pillarRange: 100 }`
- **Status:** Fully compliant.

---

### 11. Druid

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None.
- **Status:** N/A.

---

### 12. Warlock

- **Spec:** Charge-Up on RMB Shadow Bolt (0.8s charge).
- **Implemented:**
  - ✅ Shadow Bolt has charge-up — `chargeTime: 0.8, chargeSlow: 0.5, chargeMinDmg: 1.5, chargeMaxDmg: 6.0, chargeRadius: 30`
  - ⚠️ Charge placed on LMB, spec said RMB.
- **Status:** Functionally compliant. **Minor deviation: charge is on LMB instead of RMB — flag for design review.**

---

### 13. Monk

- **Spec:** Combo on LMB (3-hit Chi Combo) + Backstab passive.
- **Implemented:**
  - ✅ Chi Combo LMB — `combo: { steps: 3, timeout: 1.5, dmgScale: [0.8, 1.2, 2.5], effects: { 3: { stun: 0.5, aoeR: 40 } } }`
  - ✅ Passive — `backstab: 1.5`
- **Status:** Fully compliant.

---

### 14. Engineer

- **Spec:** Heat resource system (replace mana).
- **Implemented:**
  - ❌ No heat system. Still uses standard mana.
- **Status:** Not implemented. **Gap: Missing Heat resource system.** Blocked by Alternative Resources system not being built at system level.

---

### 15. Graviturge

- **Spec:** Tether on Q (Event Horizon).
- **Implemented:**
  - ✅ Event Horizon Q — SpellType.Tether with `tetherRange: 200, tetherDmg: 2.0, tetherHeal: 1.0, tetherDuration: 3, tetherReward: { stun: 2.0, dmgBurst: 3, healBurst: 2 }`
- **Status:** Fully compliant.

---

### 16. Bladecaller

- **Spec:** 4-hit combo on LMB + Backstab passive (2.0).
- **Implemented:**
  - ✅ Blade Chain LMB — `combo: { steps: 4, timeout: 1.8, dmgScale: [0.8, 1.0, 1.5, 3.0], effects: { 4: { aoeR: 60, stun: 0.3 } } }`
  - ✅ Passive — `backstab: 2.0`
- **Status:** Fully compliant.

---

### 17. Architect

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None.
- **Status:** N/A.

---

### 18. Hexblade

- **Spec:** Stance Switching (Caster/Blade forms).
- **Implemented:**
  - ✅ Full stanceForms with formA (Caster: Hex Bolt, Doom Mark, Void Zone) and formB (Blade: Hex Slash, Shadow Leap, Whirlwind).
  - ✅ `switchCd: 3.5, switchBuff: { duration: 1.0, dmgMult: 1.5, armor: 2 }`
- **Status:** Fully compliant.

---

### 19. Warden

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None.
- **Status:** N/A.

---

### 20. Cannoneer

- **Spec:** Charge-Up on LMB + Ammo resource system + Channeled ultimate (4s root, 4 sniper shots).
- **Implemented:**
  - ✅ Power Shot LMB — `chargeTime: 1.0, chargeSlow: 0.4, chargeMinDmg: 1.0, chargeMaxDmg: 8.0, chargePierce: 1, chargeRadius: 25`
  - ❌ No Ammo resource system.
  - ❌ Ultimate is not channeled.
- **Status:** Partial. **Gaps: Missing Ammo resource system, missing channeled ultimate.** Blocked by Ammo system not being built at system level.

---

### 21. Soulbinder

- **Spec:** Tether on RMB.
- **Implemented:**
  - ✅ Soul Tether RMB — SpellType.Tether with `tetherRange: 250, tetherDuration: 2, tetherReward: { stun: 1.5 }`
- **Status:** Fully compliant.

---

### 22. Invoker

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None (has elemental synergies via passive but no anti-kiting fields).
- **Status:** N/A.

---

### 23. Tidecaller

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None.
- **Status:** N/A.

---

### 24. Voidweaver

- **Spec:** No anti-kiting mechanics specified.
- **Implemented:** None.
- **Status:** N/A.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total classes | 24 (14 original + 10 new) |
| Classes with at least one anti-kiting mechanic specified | 15 |
| Classes fully compliant | 11 |
| Classes with gaps | 4 |
| Classes with no anti-kiting mechanics specified (N/A) | 9 |

---

## Gap Summary

| Class | Missing Mechanic | Blocked By |
|-------|-----------------|------------|
| Berserker | Rage resource system | Alt Resources system not built |
| Berserker | Channeled Blood Rage wind-up | — (system exists, just not wired) |
| Engineer | Heat resource system | Alt Resources system not built |
| Cannoneer | Ammo resource system | Alt Resources system not built |
| Cannoneer | Channeled ultimate | — (system exists, just not wired) |
| Necromancer | Stance switching (Shadow Mage/Death Knight) | — (system exists via Hexblade, needs class definition) |

---

## Recommendations

### Priority 1: Build the Alternative Resources system

This unblocks 3 classes (Berserker Rage, Engineer Heat, Cannoneer Ammo). The type system needs a `resource` field on `ClassDefInput`, `ammo`/`heat`/`reloading`/`overheated` fields on `Player`, and runtime logic in `combat.ts` + `physics.ts`. This is the single largest remaining gap.

### Priority 2: Wire Berserker Blood Rage as channeled

The channeled casting system already works (Stormcaller uses it). Add `channel: 1.5, channelSlow: 0` to Blood Rage. Quick fix.

### Priority 3: Wire Cannoneer Artillery Barrage as channeled

Same approach as Priority 2 — add channel fields to the ultimate. Quick fix.

### Priority 4: Add Necromancer stance switching

The stance switching system works (Hexblade uses it). Define Shadow Mage + Death Knight forms for Necromancer. Medium effort — requires designing 6 spells across 2 forms.

### Priority 5: Warlock slot deviation

Minor: spec says charge on RMB, implementation has it on LMB. Determine if intentional or oversight — flag for design review.
