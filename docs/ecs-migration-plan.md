# ECS Migration Plan

Incremental migration from the current monolithic entity model to ECS. Each phase is self-contained: it can be merged independently, and the game remains fully functional between phases. The old and new systems run in parallel during each phase for validation.

---

## Phase 0: Foundation

**Goal**: Build the ECS framework with no gameplay changes. All new code, no modifications to existing systems.

**Estimated complexity**: Medium (framework design, unit tests)

### Files to Create

| File | Purpose |
| ---- | ------- |
| `src/ecs/entity.ts` | EntityId type, ID generation, reset |
| `src/ecs/component-store.ts` | Generic sparse-set `ComponentStore<T>` |
| `src/ecs/world.ts` | World class (entity registry, store manager, system executor, query API) |
| `src/ecs/system.ts` | System interface |
| `src/ecs/spatial-grid.ts` | Uniform grid for collision broadphase |
| `src/ecs/components.ts` | All component class definitions |
| `src/ecs/index.ts` | Re-exports |
| `__tests__/ecs/component-store.test.ts` | ComponentStore unit tests |
| `__tests__/ecs/world.test.ts` | World lifecycle + query tests |
| `__tests__/ecs/spatial-grid.test.ts` | Spatial grid insertion, query, pair enumeration tests |

### Files to Modify

None. Phase 0 is purely additive.

### Unit Tests Required

**ComponentStore**:
- `set()` adds a new entry, `get()` retrieves it
- `set()` overwrites an existing entry
- `has()` returns true/false correctly
- `remove()` returns true on success, false on missing
- `remove()` uses swap-remove (last element fills gap)
- Iterator yields all entries
- `raw()` returns parallel dense arrays
- `clear()` empties the store
- Multiple stores are independent

**World**:
- `spawn()` returns unique IDs
- `spawn()` with components makes them queryable
- `despawn()` queues removal, `flushDespawns()` removes
- `isAlive()` reflects entity state
- `query(A)` returns entities with component A
- `query(A, B)` returns only entities with both A and B
- `query()` iterates the smallest store for efficiency
- `get()`/`set()`/`has()` delegate to stores
- `entityCount` is correct after spawn/despawn

**SpatialGrid**:
- `insert()` places entity in correct cells
- Entity spanning cell boundary appears in multiple cells
- `queryArea()` returns entities in overlapping cells
- `queryArea()` does not return entities in distant cells
- `queryPairs()` enumerates all pairs within same cells
- `queryPairs()` does not duplicate pairs
- `clear()` empties all cells
- Edge cases: entity at grid boundary, entity outside grid, zero-radius entity

### Risk Assessment

- **Risk**: Low. No existing code is modified.
- **What could break**: Nothing -- this is new code alongside existing code.

### Validation Criteria

- All unit tests pass
- Game runs normally with ECS module imported but unused
- No increase in bundle size beyond the new module (~3-5 KB gzipped)

### Rollback Strategy

Delete `src/ecs/` directory and test files. No other changes to revert.

---

## Phase 1: Particles & Pickups

**Goal**: Migrate the simplest entity types to ECS. Particles have 7 fields and no interactions beyond rendering. Pickups have 10 fields and only interact with player proximity.

**Estimated complexity**: Low

### Files to Create

| File | Purpose |
| ---- | ------- |
| `src/ecs/systems/particle-system.ts` | ParticleSystem: move + fade + despawn expired particles |
| `src/ecs/systems/pickup-system.ts` | PickupSystem: check player proximity, apply effect, despawn |
| `src/ecs/archetypes.ts` | Spawn functions for all entity archetypes (start with particles + pickups) |

### Files to Modify

| File | Change |
| ---- | ------ |
| `src/state.ts` | Add `world: World` to GameState. Keep `particles[]` and `pickups[]` arrays (parallel running). Add `spawnParticlesECS()` helper that creates particle entities. |
| `src/main.ts` | After existing update loop, call `world.update(dt)` for ECS systems. |
| `src/rendering/draw-entities.ts` | Add rendering path that reads particle entities from World alongside the old `state.particles[]` array. |
| `src/rendering/draw-effects.ts` | Same: dual rendering path for particles. |
| `src/systems/physics.ts` | In `updatePlayers()` where pickups are collected (lines ~90-130), add flag to route pickup spawns through ECS. |
| `src/systems/dungeon.ts` | In `spawnEnemy()` and gold/health drop logic, route to ECS pickup spawner. |

### Migration Steps

1. Add `world: World` to GameState, initialized in `createGameState()`
2. Register ParticleSystem and PickupSystem with the World
3. Replace `state.particles.push(...)` calls with `spawnParticleEntity(world, ...)` calls
4. Replace `state.pickups.push(...)` with `spawnPickupEntity(world, ...)`
5. Keep old arrays populated in parallel for one release cycle
6. Verify visual parity: same particle count, same positions, same lifetimes
7. Remove old `particles[]` and `pickups[]` arrays and their update loops

### Parallel Validation Strategy

During migration, both old and new systems run. A debug flag (`ECS_PARTICLES=true`) toggles which system's output is rendered. The F3 overlay shows entity counts from both systems for comparison.

```typescript
// In main.ts loop, temporarily:
if (DEBUG_FLAGS.ECS_PARTICLES) {
  // ECS particles rendered
} else {
  // Old particles rendered
}
```

### Risk Assessment

- **Risk**: Low. Particles are fire-and-forget visual effects with no gameplay impact. Pickups have simple proximity logic.
- **What could break**: Visual particle count/position differences (cosmetic only). Pickup collection timing if proximity check differs slightly.
- **Mitigations**: Side-by-side rendering comparison. Pickup proximity uses same radius constants.

### Validation Criteria

- Particle visual behavior identical (spawn position, velocity, fade, lifetime)
- Pickup collection works at same distance
- No particle memory leak (entity count stays bounded)
- F3 profiler shows ParticleSystem/PickupSystem timing
- Performance: no regression (ECS particles should be faster due to dense iteration)

### Rollback Strategy

Set `ECS_PARTICLES=false`, remove ECS system registrations from `main.ts`. Old arrays still functional.

---

## Phase 2: Spells & Collision

**Goal**: Migrate spells to ECS with spatial grid collision. This is the highest-impact phase for performance -- O(n^2) collision becomes ~O(n).

**Estimated complexity**: High

### Files to Create

| File | Purpose |
| ---- | ------- |
| `src/ecs/systems/spell-system.ts` | SpellSystem: homing, boomerang, wall bounce, gravity well, zap aura |
| `src/ecs/systems/collision-system.ts` | CollisionSystem: spatial grid broadphase + narrowphase |
| `src/ecs/systems/damage-system.ts` | DamageSystem: process collision events, apply damage/effects |

### Files to Modify

| File | Change |
| ---- | ------ |
| `src/systems/waves.ts` | `updateSpells()`: Add ECS path behind feature flag. Gradually move spell logic to SpellSystem. |
| `src/systems/combat.ts` | `damageEnemy()`: Refactor to accept EntityId instead of Enemy reference. Keep backward compat. |
| `src/state.ts` | Keep `spells[]` array for network serialization during transition. |
| `src/network.ts` | `sendState()`: Read spell data from ECS World instead of `state.spells[]`. |
| `src/main.ts` | Insert CollisionSystem and DamageSystem into the World system pipeline. |

### Migration Steps

1. Create SpellSystem that replicates `updateSpells()` logic using component queries
2. Create CollisionSystem with spatial grid (spell-enemy, spell-pillar pairs)
3. Create DamageSystem that processes collision events
4. Wire up spell spawning: `castSpell()` in `combat.ts` creates ECS spell entities
5. Run old and new collision detection in parallel, compare hit counts
6. Once validated, disable old `updateSpells()` and `state.spells[]` iteration
7. Benchmark: compare F3 profiler timings before/after

### Key Technical Challenges

**Homing spells** (`waves.ts:16-33`): Currently scans all enemies linearly. With ECS, the SpellSystem uses `world.grid.queryArea(spellPos.x, spellPos.y, 280)` to find nearby enemies, then picks the nearest. This replaces the O(enemies) scan with O(k) where k = entities in nearby grid cells.

**Spell-enemy collision** (`waves.ts:142-164`): Currently `for (const e of state.enemies)` inside `for (const s of state.spells)` = O(spells * enemies). With CollisionSystem, the spatial grid enumerates only pairs in the same grid cells. Layer/mask filtering ensures only spell-enemy and spell-pillar pairs are checked.

**Explode-on-death** (`waves.ts:167-241`): When a spell explodes, it damages all enemies in the explosion radius. This is a secondary collision query: `world.grid.queryArea(spellPos.x, spellPos.y, spell.explode)` filtered to enemies.

**Pierce** (`waves.ts:160`): A spell with pierce > 0 continues after hitting an enemy instead of being despawned. The DamageSystem decrements `SpellData.pierceLeft` and only despawns the spell when pierce is exhausted.

**Network serialization**: During transition, `sendState()` in `network.ts` must be able to read spell data from the ECS World. A bridge function converts ECS spell entities back to the wire format expected by `NetStateMessage`.

### Risk Assessment

- **Risk**: High. Collision detection is the core gameplay loop. Subtle differences in collision order, timing, or precision will change gameplay behavior.
- **What could break**: Hit registration timing (spells hitting enemies a frame early/late). Explode radius differences. Pierce count tracking. Homing accuracy. Network desync if spell state diverges between old/new systems.
- **Mitigations**: Parallel collision validation with hit count comparison. Feature flag for instant rollback. Extensive manual testing on waves 10-20 where entity counts are highest.

### Validation Criteria

- Spell-enemy hit registration identical (compare hit counts per wave)
- Explosion AoE damage identical (count enemies hit per explosion)
- Homing accuracy unchanged (visual inspection)
- Pierce works correctly (spell passes through N enemies)
- Wall bounce behavior unchanged
- F3 profiler shows collision time reduction (target: 3-5x faster on wave 15+)
- No network desyncs in co-op mode
- No new console errors or warnings

### Performance Benchmarks

Before migration, record F3 timings for waves 10, 15, 20 with 2 players:
- `updateSpells` time per frame
- Total frame time
- Entity counts (enemies, spells)

After migration, compare:
- `collision` + `damage` + `spell` combined time vs old `updateSpells` time
- Target: 50-70% reduction in combined time for wave 15+

### Rollback Strategy

Feature flag `ECS_SPELLS=false` reverts to old `updateSpells()` in `waves.ts`. Old `state.spells[]` array still populated during transition. Network serialization falls back to array-based format.

---

## Phase 3: Enemies

**Goal**: Migrate enemies to ECS. Convert enemy AI, status effects, and boss mechanics to component-based systems.

**Estimated complexity**: Medium-High

### Files to Create

| File | Purpose |
| ---- | ------- |
| `src/ecs/systems/enemy-ai-system.ts` | EnemyAISystem: chase, ranged, teleporter, friendly summon behavior |
| `src/ecs/systems/status-effect-system.ts` | StatusEffectSystem: burn DOT, slow/stun decay |

### Files to Modify

| File | Change |
| ---- | ------ |
| `src/systems/enemies.ts` | `updateEnemies()`: Replace with ECS system behind flag. |
| `src/systems/dungeon.ts` | `spawnEnemy()`: Create ECS enemy entities. Map `ENEMIES[type]` constants to component values. |
| `src/systems/combat.ts` | `damageEnemy()`: Accept EntityId, query Health/StatusEffects/EnemyAIData components. |
| `src/network.ts` | `sendState()`: Read enemy data from ECS. Maintain `e.id` -> `EntityId` mapping for network protocol. |
| `src/state.ts` | Keep `enemies[]` for transition. Add `enemyIdMap: Map<number, EntityId>` for network ID <-> ECS ID mapping. |

### Migration Steps

1. Create EnemyAISystem replicating `updateEnemies()` from `enemies.ts`
2. Create StatusEffectSystem for burn/slow/stun
3. Modify `spawnEnemy()` in `dungeon.ts` to create ECS entities
4. Bridge enemy network IDs (`e.id` from `state._nextEnemyId`) to ECS EntityIds
5. Modify `damageEnemy()` to work with ECS component queries
6. Handle friendly summons (necromancer ultimate) as enemies with `TeamTag.friendly=true` + `Lifetime`
7. Handle boss damage reduction phase as EnemyAIData fields
8. Handle elite enemies via `EnemyAIData.elite` flag
9. Validate: compare enemy movement paths, damage taken, death timing

### Key Technical Challenges

**Enemy-to-enemy iteration** (`enemies.ts:46-51`): Friendly summons chase the nearest non-friendly enemy. With ECS, this queries `[Position, EnemyAIData, TeamTag]` and filters by `!teamTag.friendly`.

**Burn spread** (fire mage class upgrade): When a burning enemy dies, burn spreads to nearby enemies. The DamageSystem must handle this on-kill effect by querying nearby enemies via the spatial grid and writing StatusEffects.

**Boss mechanics** (`enemies.ts:19-26`): Damage reduction phase is a timer on EnemyAIData. The DamageSystem checks `ai.dmgReductionActive` before applying damage. This is simpler in ECS because it is just a component field check rather than a method on a class.

**Network enemy IDs**: The current network protocol uses `e.id` (monotonic counter from `state._nextEnemyId`). ECS EntityIds are also monotonic but may not start at the same value. Solution: store the network-visible ID in `EnemyAIData.networkId` and use a Map for lookup.

### Risk Assessment

- **Risk**: Medium-High. Enemy AI directly affects game difficulty. Off-by-one errors in targeting, timing, or pathfinding will change game feel.
- **What could break**: Enemy chase speed (if slowTimer/spdMul applied differently). Burn DOT timing. Boss damage reduction not triggering. Friendly summon targeting. Enemy-player collision damage. Network interpolation for enemies.
- **Mitigations**: Record enemy behavior videos before/after. Automated test: spawn 50 enemies, run 10 seconds, compare total damage dealt. Feature flag for rollback.

### Validation Criteria

- Enemy movement speed matches (same chase speed, same slow effect)
- Burn DOT deals same DPS (1 damage per `TIMING.BURN_TICK` interval)
- Boss damage reduction triggers at correct HP threshold
- Friendly summons attack enemies, not players
- Elite enemies have correct HP/damage multipliers
- Enemy death animation plays correctly
- Network interpolation smooth for guest player
- Enemy projectile spawning works (ranged enemies)

### Rollback Strategy

Feature flag `ECS_ENEMIES=false`. Old `state.enemies[]` array still populated. `updateEnemies()` falls back to existing code.

---

## Phase 4: Players

**Goal**: Migrate players to ECS. This is the most complex phase due to the 60+ fields on Player and deep integration with the upgrade system.

**Estimated complexity**: High

### Files to Create

| File | Purpose |
| ---- | ------- |
| `src/ecs/systems/input-system.ts` | InputSystem: reads keyboard/mouse, writes PlayerInputData |
| `src/ecs/systems/player-movement-system.ts` | Player-specific movement (speed, dash, stun, slow) |
| `src/ecs/systems/cooldown-system.ts` | CooldownSystem: tick cooldowns, mana regen |
| `src/ecs/systems/upgrade-system.ts` | UpgradeSystem: apply upgrade modifiers to components |

### Files to Modify

| File | Change |
| ---- | ------ |
| `src/systems/physics.ts` | `updatePlayers()`: Replace with InputSystem + PlayerMovementSystem + CooldownSystem. |
| `src/systems/combat.ts` | `castSpell()`, `castUltimate()`: Accept EntityId, query player components. Major refactor (~300 lines). |
| `src/systems/upgrades.ts` | Upgrade `apply()` callbacks: modify component values instead of Player fields. |
| `src/constants.ts` | `UPGRADE_POOL`: Each upgrade's `apply()` function signature changes from `(p: Player)` to `(world: World, playerId: EntityId)`. |
| `src/network.ts` | `sendState()`: Read player data from ECS components. |
| `src/input.ts` | `getInput()`: Returns raw input; InputSystem writes to components. |
| `src/rendering/draw-entities.ts` | Player rendering reads from ECS components. |
| `src/ui/` | HUD reads player HP/mana/cooldowns from ECS components instead of Player interface. |

### Migration Steps

1. Create PlayerInputData, Cooldowns, Upgrades, ClassAbilities, SecondaryUpgrades components (already defined in Phase 0)
2. Create InputSystem, PlayerMovementSystem, CooldownSystem
3. Create spawn function `spawnPlayer()` that creates a player entity with all 16 components
4. Modify `updatePlayers()` to delegate to ECS systems
5. Refactor `castSpell()` and `castUltimate()` to use component queries
6. Refactor `UPGRADE_POOL` apply functions -- this is the largest single change
7. Update HUD rendering to read from components
8. Update network serialization for player state

### Key Technical Challenges

**Upgrade system** (`constants.ts` UPGRADE_POOL): There are 100+ upgrades, each with an `apply(p: Player, stacks: number)` callback that directly mutates Player fields. These must be changed to mutate Upgrades/ClassAbilities/SecondaryUpgrades components. This is mechanical but high-volume work.

Example transformation:
```typescript
// Before
{ name: 'Vampiric', apply: (p, s) => { p.vampirism += 0.15; } }

// After
{ name: 'Vampiric', apply: (world, id, s) => {
    const u = world.get(id, Upgrades)!;
    u.vampirism += 0.15;
  }
}
```

**Class-specific abilities** (`combat.ts:castUltimate()`): Each class has unique ultimate logic that reads/writes many player fields. These must be refactored to query components. The ultimate functions remain procedural (not component-based) because they are unique per class.

**Client-side prediction** (`main.ts:258-300`): The guest player's local movement prediction reads PlayerInputData and writes Position. In ECS, this is the same InputSystem + PlayerMovementSystem running on the guest, but only for the local player entity.

**Respawn logic** (`physics.ts:34-70`): Uses `state.lives`, `p.alive`, `p.respawnTimer`. In ECS, the respawn timer lives in the Animation component. When it reaches 0, the system either restores Health and resets Position (if lives remain) or triggers GameOver.

### Risk Assessment

- **Risk**: High. Player logic is the most interconnected part of the codebase. Every upgrade, class ability, and combat interaction touches Player fields.
- **What could break**: Any of 100+ upgrades not applying correctly. Class abilities malfunctioning. Mana regen rate changing. Cooldown timing off. Dash not working. Client-side prediction desyncing. HUD showing wrong values. Respawn logic failing.
- **Mitigations**: Migrate one system at a time (InputSystem first, then movement, then cooldowns). Test each class individually. Test each upgrade tier. Maintain old Player interface as a compatibility layer during transition.

### Compatibility Layer

During migration, a bridge object keeps the old `Player` interface working while components are the source of truth:

```typescript
// Temporary bridge: creates a Player-shaped proxy that reads/writes components
function playerProxy(world: World, id: EntityId): Player {
  return new Proxy({} as Player, {
    get(_, prop) {
      switch (prop) {
        case 'x': return world.get(id, Position)!.x;
        case 'hp': return world.get(id, Health)!.hp;
        case 'vampirism': return world.get(id, Upgrades)!.vampirism;
        // ... etc
      }
    },
    set(_, prop, value) {
      switch (prop) {
        case 'x': world.get(id, Position)!.x = value; return true;
        case 'hp': world.get(id, Health)!.hp = value; return true;
        // ... etc
      }
    }
  });
}
```

This proxy allows unmigrated code (e.g., combat.ts functions that reference `p.x`, `p.hp`) to keep working while components are the real storage. The proxy is removed once all references are migrated.

### Validation Criteria

- All 10+ wizard classes function correctly (abilities, ultimates, passives)
- All 100+ upgrades apply correctly (spot-check 20 most critical)
- Mana regen rate unchanged
- Cooldown timing unchanged
- Dash mechanic works
- Client-side prediction smooth for guest player
- HUD shows correct HP, mana, cooldowns, level, XP
- Respawn system works (lives decrement, respawn position correct)
- Game over triggers when all players dead with 0 lives
- F3 profiler shows player system timing

### Rollback Strategy

Feature flag `ECS_PLAYERS=false`. The Player compatibility proxy means old code paths still work. Disable new systems, re-enable `updatePlayers()`.

---

## Phase 5: Network Adaptation

**Goal**: Adapt the multiplayer networking layer to work natively with ECS components instead of through bridge code. Maintain backward compatibility during transition.

**Estimated complexity**: Medium

### Files to Create

| File | Purpose |
| ---- | ------- |
| `src/ecs/systems/network-sync-system.ts` | NetworkSyncSystem: serialize/deserialize entity state |

### Files to Modify

| File | Change |
| ---- | ------ |
| `src/network.ts` | `sendState()`: Rewrite to query ECS components directly instead of `state.players[]`/`state.enemies[]`/`state.spells[]`. Delta compression operates on component stores. |
| `src/network.ts` | `applyState()` (guest): Rewrite to create/update/remove ECS entities from received state. |
| `src/main.ts` | Guest interpolation loop: Replace with NetworkSyncSystem reading NetworkSync components. |
| `src/types.ts` | Network message types: Add version field for backward compat. |

### Migration Steps

1. Create NetworkSyncSystem with two modes: serialize (host) and interpolate (guest)
2. Rewrite `sendState()` to iterate component stores instead of entity arrays
3. Implement entity ID mapping: network protocol IDs <-> ECS EntityIds
4. Rewrite guest-side state application to create/destroy ECS entities
5. Adapt delta compression to work per-component-store instead of per-array
6. Add protocol version field to all network messages
7. Test co-op play between old and new versions (version mismatch handling)
8. Remove old array-based serialization code

### Key Technical Challenges

**Delta compression** (`network.ts:404-434`): Currently compares JSON.stringify of entire arrays. With ECS, delta compression can be per-entity: track which entities changed which components, and only send those deltas. This is more efficient but requires change tracking in ComponentStore.

```typescript
// Component-level change tracking
class ComponentStore<T> {
  private dirtySet: Set<EntityId> = new Set();

  set(id: EntityId, value: T): void {
    // ... existing logic ...
    this.dirtySet.add(id);
  }

  getDirty(): Set<EntityId> {
    return this.dirtySet;
  }

  clearDirty(): void {
    this.dirtySet.clear();
  }
}
```

**Entity lifecycle over network**: When the host spawns an enemy, the guest must create a corresponding ECS entity. When the host despawns an entity, the guest must too. The network protocol must convey entity creation and destruction events, not just state updates.

**Client-side prediction**: The guest runs InputSystem + PlayerMovementSystem locally for the local player, then reconciles with server state. In ECS, the NetworkSync component stores the server's authoritative position, and the system blends local prediction toward it. This is the same exponential blend as `main.ts:290-296`.

**Culling and LOD** (`network.ts:322-340`): Distance-based culling (NET_CULL_RADIUS) and LOD (NET_LOD_RADIUS) use the guest player's position. In ECS, the NetworkSyncSystem queries the guest's Position component for the reference point, then uses the spatial grid for efficient culling.

### Network Protocol Changes

```typescript
// Version 1 (current): Array-based state
interface NetStateV1 {
  type: 'state';
  p: PlayerWire[];
  e: EnemyWire[];
  sp: SpellWire[];
  // ...
}

// Version 2 (ECS): Component-based state
interface NetStateV2 {
  type: 'state';
  v: 2;
  entities: {
    id: number;
    components: Record<string, any>;  // only changed components
  }[];
  removed: number[];  // entity IDs that were despawned
  globals: Record<string, any>;  // wave, gold, phase, etc.
}
```

During the transition period, the host detects the guest's protocol version from the initial handshake and sends in the appropriate format.

### Risk Assessment

- **Risk**: Medium. Network code is latency-sensitive. Changes to serialization format or interpolation timing will cause visual jitter or desyncs.
- **What could break**: Entity desync (host and guest have different entity counts). Interpolation jitter. Delta compression missing changes. Culling/LOD radius changes. Backward compatibility failure (old guest connecting to new host).
- **Mitigations**: Protocol versioning. Extensive co-op testing. Interpolation smoothness metrics (measure position error over time). Keyframe interval unchanged (every 20 frames).

### Validation Criteria

- Co-op play smooth: no visible teleportation or jitter
- Entity counts match between host and guest (within culling bounds)
- Delta compression reduces bandwidth (measure average packet size)
- Client-side prediction for guest movement feels identical
- Backward compat: old client can connect to new host (during transition)
- No entity leaks: entity count on guest stays bounded

### Rollback Strategy

Revert `network.ts` to array-based serialization. Protocol version field allows graceful degradation.

---

## Phase Summary

| Phase | Entities Migrated | Risk | Complexity | Performance Impact |
| ----- | ----------------- | ---- | ---------- | ------------------ |
| 0 | None (framework) | Low | Medium | None |
| 1 | Particles, Pickups | Low | Low | Minor (dense iteration) |
| 2 | Spells + Collision | High | High | **Major** (O(n^2) -> ~O(n)) |
| 3 | Enemies | Medium-High | Medium-High | Moderate (no dead entity iteration) |
| 4 | Players | High | High | Minor (only 1-2 players) |
| 5 | Network | Medium | Medium | Moderate (better delta compression) |

### Recommended Order

Phases must be done in order (0 -> 1 -> 2 -> 3 -> 4 -> 5) because each phase builds on the framework and patterns established in prior phases. However, each phase can be merged independently -- the game is fully functional between phases.

Phase 2 (Spells & Collision) is the highest-value phase. It delivers the largest performance improvement and validates the ECS + spatial grid architecture. If the project needs to pause after any phase, pausing after Phase 2 captures the most value.

### Timeline Estimate

- Phase 0: 1-2 days (framework + tests)
- Phase 1: 1 day (simple entities)
- Phase 2: 3-5 days (collision refactor, extensive testing)
- Phase 3: 2-3 days (enemy AI)
- Phase 4: 3-5 days (player + upgrades, most code changes)
- Phase 5: 2-3 days (network adaptation)

Total: 12-19 days of focused development.

### Global Constraints

These must be preserved throughout all phases:

1. **Multiplayer P2P architecture**: Host authoritative, guest uses client-side prediction. PeerJS WebRTC data channel.
2. **Delta compression**: Only changed state sent over network. Keyframe every 20 frames.
3. **Client-side prediction**: Guest player movement runs locally, reconciled with server state.
4. **Upgrade system**: 100+ upgrades with evolution mechanics. `UPGRADE_POOL` in `constants.ts`.
5. **10+ wizard classes**: Each with unique spells, abilities, and ultimates defined in `CLASSES`.
6. **F3 performance profiler**: System timings visible in debug overlay.
7. **Visual FX**: Particles, trails, beams, shockwaves, screen shake, screen flash.
8. **Canvas2D rendering**: No WebGL dependency. All rendering via CanvasRenderingContext2D.
9. **Wave-based progression**: 20 waves, boss waves every 5, elite enemies at wave 13+.
10. **Lives/respawn system**: Shared lives pool, respawn with 50% HP/mana.
