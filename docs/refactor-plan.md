# Refactor Plan — Post-Bladecaller / Stormcaller Reworks

Date: 2026-04-18
Motivation: Two recent class reworks (Stormcaller, Bladecaller) surfaced the
same friction over and over — class-specific logic is scattered across many
files, state is bolted onto monoliths, and adding/modifying a class requires
touching a dozen places. This plan lists concrete refactors, ordered from
highest impact/lowest risk to biggest structural work.

## Scale of the problem

| File | Lines | Class-specific branches |
|---|---:|---:|
| `src/systems/combat.ts` | 2274 | **54** `p.clsKey === '...'` checks |
| `src/systems/physics.ts` | 862 | **19** `p.clsKey === '...'` checks |
| `src/rendering/draw-entities.ts` | 4779 | **24** class-body / ult-anim cases |
| `src/types.ts` | 975 | **81** underscore-prefixed Player state fields |
| `src/constants.ts` | 1067 | — (CLASSES + UPGRADE_POOL + tuning all in one) |
| `src/ui/class-select.ts` | 454 | — (per-type + per-class descriptions) |

To add a new class today you touch **~10 files** (types, state, constants,
combat, physics, draw-entities, draw-hud, class-select, character-mechanics
docs, tests). To tweak a spell you often touch 4 (def, cast, physics, UI
description).

---

## 1. Co-locate class-specific behavior (HIGHEST IMPACT)

**Problem.** `stormcaller`, `bladecaller`, `cannoneer`, `voidweaver` etc.
each have behavior stitched across combat.ts / physics.ts / draw-entities
/ class-select. Example from the Bladecaller rework — the class touches:

- `constants.ts` (def, augments)
- `types.ts` (5 new player fields)
- `state.ts` (field defaults + `normalizeSpellDef` wiring)
- `combat.ts` (cast branch, damagePlayer stealth-break, damageEnemy crit+lifesteal, ult branch)
- `physics.ts` (stealth tick, flurry tick, ms boost)
- `enemy-ai-system.ts` + `enemy-attack-system.ts` (stealth targeting skip)
- `rendering/draw-entities.ts` (stealth alpha)
- `ui/class-select.ts` (targetLock description, Phantom Veil copy)

**Fix.** Introduce a per-class module pattern: `src/classes/<name>/`
holding `def.ts`, `hooks.ts`, `render.ts`. Hooks are small callback functions
that the core systems call at well-defined points:

```ts
// src/classes/bladecaller/hooks.ts
export const bladecallerHooks: ClassHooks = {
  onDamageEnemy: (ctx, dmg) => { /* crit pending, lifesteal */ },
  onDamagePlayer: (ctx, dmg) => { /* stealth break */ },
  onKill: (ctx, enemy) => { /* shield grant */ },
  onTick: (ctx, dt) => { /* stealth hp regen, flurry ticks */ },
  castUltimate: (ctx, angle) => { /* Thousand Cuts */ },
  isTargetable: (player) => !(player._stealth > 0),
  renderOverlay: (ctx, player) => { /* stealth alpha */ },
};
```

The core systems iterate a `CLASS_HOOKS[clsKey]` registry. Adding a class
becomes: create a folder, register hooks. No more scrolling through a 2274-line
combat.ts.

**Risk.** Medium. Requires defining the hook surface carefully (which
context does each callback need?). Start with the 3 most branch-heavy hooks
(damageEnemy, physics tick, cast ultimate), leave generic spell dispatch
in combat.ts for now.

**Order.** Do AFTER item #2 (player state) since hooks need typed
class state.

---

## 2. Replace monolithic Player state with per-class state bags

**Problem.** `Player` interface in `types.ts` has 81 underscore-prefixed
private fields. Every class rework adds 2–5 more. Every player pays memory
cost for every other class's state. Harder to reason about what state is
in scope for a given class. ECS `components.ts` Upgrades mirror is missing
several fields (`_lastShadowStep`, `_stealth`, etc.) → inconsistency.

**Fix.** A single generic map:

```ts
// types.ts
interface Player {
  // …identity, stats, cooldowns, upgrades…
  classState: Record<string, unknown>;  // typed via class module
}

// src/classes/bladecaller/state.ts
export interface BladecallerState {
  lastShadowStep: number;
  rushSpeed: number;
  stealth: number;
  critPending: boolean;
  stealthShield: number;
  bladeFlurry: number;
  bladeFlurryTick: number;
}
export const createBladecallerState = (): BladecallerState => ({ /* defaults */ });
```

Accessed via helper: `const bc = getClassState<BladecallerState>(p, 'bladecaller')`.

**Risk.** Medium. Touches the whole codebase that reads `p._xxx`. But
regex-find-replace handles 90%, and the end state is far cleaner. Net bytes
saved too — an Arcanist player no longer pays for Bladecaller fields.

**Order.** Do FIRST. Enables #1 (hooks can declare their state type).

---

## 3. Extract class-specific draw logic from `draw-entities.ts`

**Problem.** `draw-entities.ts` is 4779 lines. It contains 24 `case '<classKey>':`
blocks for class-specific body rendering and ult animations, plus
class-specific dome/beam/mark rendering. It's the single biggest file in the
repo and a frequent source of merge conflicts.

**Fix.** Each class module contributes a `render()` function called from a
thin dispatcher. Split `draw-entities.ts` into:

- `draw-entities.ts`: common wizard body + aura + animation scaffolding
- `classes/<name>/render.ts`: class body, weapon, ult anim, overlays
- `rendering/effects.ts`: shared particle/shockwave/beam/zone rendering

This maps 1:1 to #1 (class module). Could ship independently as pure
splitting.

**Risk.** Low. No logic changes, just file moves. Each class renderer is
self-contained today.

**Order.** Can do in parallel with #1.

---

## 4. Centralize theming and class colors

**Problem.** Class colors are copy-pasted in at least 5 places: constants
def (`color`, `glow`), HUD (`p.clsKey === 'stormcaller' ? '#cc88ff' : '#4488ff'`
for the mana bar), draw-entities (literal hex in class body cases), DOM
styling for class-select cards, augment pool `color` fields.

**Fix.** Single `CLASS_THEME` map:

```ts
// src/classes/theme.ts
export const CLASS_THEME: Record<string, ClassTheme> = {
  stormcaller: {
    primary: '#bb66ff', glow: '#9944dd', accent: '#cc88ff',
    resource: 'static', resourceColor: '#cc88ff',
  },
  bladecaller: {
    primary: '#cc3355', glow: '#aa2244', accent: '#ff4466',
    resource: 'mana', resourceColor: '#cc3355',
  },
  // …
};
```

Then HUD reads `CLASS_THEME[p.clsKey].resourceColor` instead of a class-name
ternary. Adding a class → one entry, everywhere picks it up.

**Risk.** Low. Incremental: introduce the theme map, migrate one consumer
at a time.

**Order.** Standalone quick win. Do early.

---

## 5. Break `constants.ts` into domain files

**Problem.** `constants.ts` is 1067 lines with: arena sizes, combat tuning,
timing constants, ultimate tuning, class defs, enemy defs, upgrade pool,
boss tuning, class order. Edits to a class def conflict with edits to
combat tuning.

**Fix.** Split into:

- `src/constants/arena.ts` — room, wizard, camera sizes
- `src/constants/combat.ts` — COMBAT, TIMING, RANGES, CD_FLOORS, softCap helpers
- `src/constants/ultimate.ts` — ULTIMATE tuning block
- `src/constants/enemies.ts` — ENEMIES + ENEMY_AI
- `src/classes/<name>/def.ts` — per-class def (CLASSES object becomes a
  registry that imports from each class module)
- `src/upgrades/pool.ts` — UPGRADE_POOL

Re-export everything from `src/constants.ts` as a compatibility layer so
existing imports don't break during the migration.

**Risk.** Low (pure moves). High impact on mental load.

**Order.** Can run in parallel with #3.

---

## 6. Type-safe spell dispatch

**Problem.** `castSpell` in combat.ts is a ~600-line `if (def.type === X) else
if (def.type === Y)` chain. Nova channel path forks inside it. Ultimate-typed
Q spells (druid, warlock, bladecaller Phantom Veil, tidecaller summon) are
hidden under `SpellType.Ultimate && def.key === 'Q'` with a further `clsKey`
switch — double-nested branching.

**Fix.** Table of handlers:

```ts
const SPELL_HANDLERS: Record<SpellType, SpellHandler> = {
  [SpellType.Projectile]: handleProjectile,
  [SpellType.Cone]: handleCone,
  [SpellType.Leap]: handleLeap,
  // …
};
```

Plus a "class Q override" hook for the summon-style spells (Phantom Veil,
Spirit Wolf, Summon Imp, Summon Elemental) — these should go through the
class hook system from #1.

**Risk.** Medium. `castSpell` has a lot of side-effect sharing (cooldown
writes, mana refunds, combo tracking). Needs careful extraction of the
shared prelude/epilogue.

**Order.** After #1. This is partly what class hooks enable.

---

## 7. Auto-generate spell descriptions from def

**Problem.** `class-select.ts` has a hand-written description generator
(`case 'leap': parts.push('...')`, `case 'cone': …`) AND a per-class
`ULTIMATE_DESCRIPTIONS` map that's edited every time a mechanic changes.
Each new field (`targetLock`, `channel`, `applyMark`) requires a new
generator branch. Manual copy drifts from the actual spell def fast.

**Fix.** Declarative description. Either:

- Attach a `description?: string` or `describe?: (def) => string` to each
  SpellDefInput in the class def. The spell's author writes the one-liner
  once, next to the numbers.
- Or keep central generator but drive it entirely off typed fields
  (iterate SpellDef flags, translate each into a tag — same as
  `EFFECT_DEFS` already does for status effects; extend to numeric stats).

Option 1 is simpler and invites authorial voice. Option 2 is DRY-er.
Recommend Option 1 with Option 2 fallback for untagged spells.

**Risk.** Low.

**Order.** Do after #5 (class defs live in per-class files), since
descriptions naturally belong there.

---

## 8. Unify "effect timer" patterns

**Problem.** Many class buffs are timers that decay in physics tick:
`_thunderGod`, `_dischargeShield`, `_bloodlustStacks`, `_rushSpeed`,
`_stealth`, `_stealthShield`, `_bladeFlurry`, `_invulnTimer`, `_hasteTimer`,
`_rage`, `_holyShield`, `_shieldWall`, `_fortified`, `_facingDR`, `_wardenDR`,
`_timeStopTimer`, … each implemented slightly differently (some decay per
dt, some use `state.time + X` timestamps, some are booleans reset each
frame).

**Fix.** A tiny `Timers` mixin per player:

```ts
class TimerBag {
  private t = new Map<string, number>();
  set(key: string, seconds: number) { this.t.set(key, seconds); }
  active(key: string) { return (this.t.get(key) || 0) > 0; }
  tick(dt: number) { /* decrement all, drop <=0 */ }
}
```

Reduces ~20 fields to one bag and one tick loop. Can coexist with existing
fields during migration.

**Risk.** Low–medium. Easy to pilot on 3–4 timers first.

**Order.** Can ship standalone.

---

## 9. Keep ECS `components.ts` Upgrades in sync (or delete it)

**Problem.** `src/ecs/components.ts` has an `Upgrades` class that mirrors
some Player fields (`_thunderGod`, `_channelDetStacks`, `_dischargeShield`,
`lifeSteal`, etc.) but is missing Bladecaller fields, Ranger Eagle Eye
fields, Warden fields, and more. It appears to be an in-progress ECS
migration that stalled. Live in limbo.

**Fix.** Either:

- Delete the ECS components layer if it's truly unused (check callers
  first) and stop maintaining the mirror.
- Finish the ECS migration and use components as the single source of
  truth, dropping the Player interface bloat entirely.

Status quo is the worst of both.

**Risk.** Medium — need to audit what actually consumes these components.

**Order.** Decide direction first, then execute. Blocks #2 (otherwise #2
creates a 3rd state representation).

---

## Suggested sequencing

1. **Week 1:** #4 (theme map) — lowest risk, highest daily-quality-of-life.
2. **Week 1:** #9 (ECS audit) — decide before touching state.
3. **Week 2:** #5 (constants split) — pure moves, clears mental space.
4. **Week 2:** #2 (per-class state bags) — foundation for everything.
5. **Week 3:** #1 (class hooks registry) + #3 (draw-entities split) — these
   fall out naturally once per-class modules exist.
6. **Week 4:** #6 (spell dispatch) + #7 (spell descriptions) + #8 (timers)
   — polish / incremental.

Each step ships independently and doesn't block gameplay work. Class rework
velocity should roughly double after steps 1–5.

---

## What we should NOT do

- **Do not introduce an event bus** ("emit ON_KILL, subscribers react"). It
  hides control flow and makes cast-order bugs impossible to trace. Explicit
  hook callbacks are better for this size of game.
- **Do not generalize the combo/mark/channel systems further** — they're
  already generic enough. Each is a clean data-driven pipeline. Resist the
  urge to unify them into one "spell lifecycle" abstraction.
- **Do not auto-generate class defs from LLM / data files.** The class
  definitions are the game's design — keep them hand-written and
  version-controlled.
