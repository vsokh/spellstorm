# Stormcaller — Design Reference

Comprehensive design spec for the Stormcaller class. This is the source of
truth for numbers, behaviors, and the reasoning behind each choice.

---

## Identity

Channeled lightning mage. Commits to position to deal damage (LMB), commits
to position to survive (RMB), teleports as a tactical reset (Q). Every spell
interacts with the same resource (Static Charge) and the same debuff (static
marks), so the kit reads as one system rather than four unrelated buttons.

**Class color:** `#bb66ff` (purple). Theme color for beams, shockwaves, dome,
HUD charge bar: `#cc88ff`.

---

## Bindings

| Slot | Key | Name | Type |
|------|-----|------|------|
| 0 | LMB | Lightning | Beam (channeled) |
| 1 | RMB | Discharge | Nova (channeled) |
| 2 | Q | Storm Step | Blink |
| 3 | Space | Thunder God | Ultimate |

Generic augments ("Secondary Mastery", "Q Mastery", etc.) operate on slot
indices, so they tune Discharge (slot 1) and Storm Step (slot 2) respectively.

---

## Resource — Static Charge

Stormcaller does not use mana. The `mana` field is reused as Static Charge
(0–100, `maxMana: 100`, `manaRegen: 2`). The HUD bar renders in `#cc88ff`.

**Generators**
- Lightning beam hit (primary or chain arc): **+4 charge**
- Auto-detonation on beam hit: **+10 charge**
- Passive trickle: **+2/sec**

**Spenders**
- Discharge activation: **50 charge**
- Discharge sustained drain while channeling: **20/sec**
- Storm Step: **25 charge**
- Thunder God: free — uses the separate ult meter

A full 100-charge bar supports exactly one full 2.5s Discharge channel
(50 + 20 × 2.5 = 100). Discharge ends the instant charge hits 0.

---

## Spells

### Lightning — LMB (Beam, channeled)

```
dmg 1, range 320, mana 0, cd 0.28,
channel 1.5, channelSlow 0.5, channelScale 2.5, channelBreak 3,
applyMark: { name: 'static', duration: 4.0, maxStacks: 3, visual: '#cc88ff' }
```

- Sustained purple beam while LMB held. Beam follows the mouse.
- Damage scales **1x → 2.5x** linearly with channel progress (0 → 1.5s).
- Movement slowed to **50%** while channeling; +50% during Thunder God.
- Breaks if you take **3+ damage** in a single hit.
- Damage tick rate is gated by enemy iframes (0.1s), so ~10 effective
  damage applications per second per enemy.
- Applies a static stack on every landed hit, up to 3 stacks.

**Auto-detonate:** When a hit lands on an enemy already at max (3) static
stacks, the marks detonate for `1.5 × stacks` bonus damage and the stacks
reset to 0. The beam then starts building marks again.

**Chain Lightning augment** adds arcs from each primary hit to N nearby
unhit enemies (150 unit range). Arcs also apply marks and can auto-detonate.

### Discharge — RMB (Nova, channeled)

```
dmg 10, range 180, mana 50, cd 5,
stun 2.0,
channel 2.5, channelSlow 0.6, channelBreak 5,
detonateMark: { name: 'static', dmgPerStack: 3.0, effectOnDetonate: { stun: 0.5 } }
```

**On activation (press RMB)**
- Purple dome appears around the caster (180 radius).
- 10 damage + 2.0s stun to every enemy inside.
- Static marks on enemies inside detonate for +3 dmg and +0.5s stun per
  stack. A prior-max-stacked enemy eats ~10 + 9 = 19 damage + 3.5s stun
  on the opening alone.
- Spawns 50 charge cost, shockwave, particles, screen flash, shake, zap SFX.

**While held**
- Dome stays at full visual strength. Caster movement slowed to **60%**.
- Every 0.2s, any enemy still inside the radius is **re-stunned for 0.3s**
  and takes **2 damage**. Tick rate (0.2s) < stun duration (0.3s), so the
  field is a one-way trap: walk-ins get pinned the moment they cross the
  boundary and can't leave.
- Any enemy projectile that enters the radius is destroyed on contact
  (cosmetic spark, no damage to the caster).
- Static Charge drains at 20/sec.

**Ends when** any of: RMB released, channel duration hits 2.5s, Static
Charge hits 0, caster takes 5+ damage in one hit.

**On end:** Dome disappears **instantly** (timer zeroed, not faded). 5s
cooldown starts.

### Storm Step — Q (Blink)

```
range 180, mana 25, cd 2.5
```

Tactical teleport. Toward the mouse direction, capped to arena bounds.
Grants brief iframes (`IFRAME_BLINK = 0.3s`). Cost 25 Static Charge.

The Feedback Loop passive refunds **0.3s of Storm Step cd** on every
auto-detonation during a Lightning channel. Aggressive beaming keeps
Storm Step almost always available.

### Thunder God — Space (Ultimate)

Gated by the generic ult meter (100 ult-charge, accumulates from kills).

**5-second transformation.** While active:
- Lightning is effectively instant: beam progress forced to 1 (full 2.5x
  damage scale from frame 0).
- Movement slow from the Lightning channel is bypassed; caster also gets
  **+50% move speed** on top.
- Every beam hit **force-sets the target to max stacks** and auto-detonates.
  Equivalent to popping marks every 0.1s on every target.
- Storm Step cooldown is held at 0 — unlimited teleports.

Implementation: sets `p._thunderGod = 5`. Ticked down in `updatePlayers`.
Visual: 40 `#ffcc44` particles + 160-radius shockwave + shake + zap SFX
on activation.

---

## Passive — Feedback Loop

Each auto-detonation during a Lightning channel:
- Refunds **0.3s** of Storm Step cooldown (`p.cd[2]`)
- Adds **+5%** damage to the current channel's damage multiplier
  (`p._channelDetStacks`, capped at 10 = +50%)

Stacks reset to 0 when the Lightning channel ends (release LMB, break, or
channel completion). Stormcaller's damage ceiling against priority targets
is dependent on staying on them.

---

## Augments

Stormcaller-specific augments (`forClass: 'stormcaller'`, UPGRADE_POOL
indices 76-78, plus evolution 122):

- **[76] Chain Lightning** (stackable ×3): `p.chainLightning += flatScaling(2, stacks)`.
  Each Lightning beam damage event also fires an arc to `chainLightning`
  unhit nearby enemies (150 range) with the same damage and mark application.
- **[77] Overcharge** (unique): raises Lightning's `channelScale` from 2.5
  to 4.0 (full-channel damage: 1x → 4x instead of 1x → 2.5x).
- **[78] Storm Shield** (unique): enables `p.stormShield`. Passive aura
  strikes a random enemy in range every 1s for 1 damage.
- **[122] Storm Lord** (evolution of Chain Lightning): `chainLightning += 5`
  and Lightning primary damage `+2`.

Generic augments that hit Stormcaller cleanly:
- Secondary Mastery / Power / Free Cast / Area Secondary → tune Discharge
- Q Rapid Cooldown / Efficiency / Area / Mastery → tune Storm Step

---

## Gameplay Loops

**Core rotation (solo):** Beam a priority target → marks cap at 3 → auto-pop
at hit 4 → Feedback Loop builds damage + refunds Storm Step cd → keep
beaming the same target for +50% damage ceiling or Storm Step to reposition.

**Under pressure:** RMB Discharge pins the cluster and eats projectiles while
you rebuild charge. Release when you're safe (instant drop) and resume beam.

**Ult window:** Thunder God makes every beam hit detonate immediately and
removes the Storm Step cd. Pop into a wave, melt enemies at +50% move speed,
teleport around freely for 5s.

---

## Decision history

(Short log of the iteration path so we can see why things ended where they
did. Add entries here when the kit changes.)

- **Original Stormcaller** (pre-rework) was "Lightning + Ball Zap + Thunder
  + chain-lightning ult" with every-4th-hit stun passive. Channel system
  existed in the codebase but was silently broken — `normalizeSpellDef` was
  stripping channel/mark fields when cloning class defs in `cloneClassDef`.
  Lightning was therefore firing as a plain beam every click and no mark
  chains worked for any class. Fixed in `src/state.ts:320-327`.
- **Lightning** moved from pulsed-tick channel to continuous beam rendered
  every frame, with auto-detonation at max stacks added on top of the
  channel-scale build-up. `channelTicks` field removed in favor of the
  iframe-gated continuous loop.
- **Ball Zap (RMB)** replaced with **Storm Step** (Blink) once Lightning
  took over mark application. Later swapped: Discharge is now RMB, Storm
  Step is Q, because the defensive channel feels right on the mouse and
  reposition feels right on a tap key.
- **Thunder (Q)** first recolored yellow→purple, then fully redesigned into
  **Discharge** — first an instant AoE nuke, then expanded into a channeled
  defense field with stun/projectile-eat/tick-damage so it reads as a mage
  ward instead of an offensive nuke. A leftover class-specific Q handler
  in `combat.ts` was still running the old Thunder Strike logic at the
  cursor; deleted so Discharge would fall through to the Nova branch.
- **Storm Fury (Space)** chain-lightning ult replaced with **Thunder God**
  transformation — rewards the existing beam/mark loop by making it
  instantly detonate for 5s instead of introducing a new pattern.
- **Passive** went Static (every 4th stun) → Overload (full-channel
  detonation) → **Feedback Loop** (per-auto-detonation cd refund + damage
  stack). Automatic detonation made "full-channel detonation" redundant;
  Feedback Loop rewards the same beam commit differently.
- **Static Charge** resource added last, replacing infinite mana. Beam
  generates, Discharge and Storm Step spend, Thunder God stays on its own
  ult meter. HUD mana bar recolored purple only for Stormcaller.
