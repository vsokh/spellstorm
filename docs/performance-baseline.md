# Performance Baseline

## Methodology

### Profiler (`src/debug/profiler.ts`)

The profiler is a lightweight, singleton-based instrumentation layer embedded in the game loop. It measures:

- **FPS** via a rolling average over the last 60 frames.
- **Per-system timings** using `performance.now()` around each subsystem call (begin/end pairs).
- **Entity counts** per frame, capturing the length of every entity array on `GameState`.
- **GC pause detection** by flagging any frame whose total time exceeds 2x the rolling average.

Data is stored in a **ring buffer of 300 frames** (~5 seconds at 60 FPS), enabling post-hoc analysis of performance spikes.

The profiler has zero overhead when disabled (`profiler.enabled = false`). All timing methods early-return when the profiler is off. Toggling the F3 overlay automatically enables/disables the profiler.

**System runner integration:** The `SystemRunner` (`src/ecs/system-runner.ts`) wraps every registered system with automatic `profiler.begin(name)` / `profiler.end(name)` calls, so instrumentation is guaranteed for all systems without manual annotation.

### Debug HUD Overlay (`src/debug/perf-overlay.ts`)

Press **F3** to toggle an in-game overlay drawn directly on the Canvas2D surface (no DOM elements). It displays:

- FPS counter with color coding (green >= 55, yellow >= 30, red < 30)
- Frame time in milliseconds with a budget bar (16.67ms target)
- Per-system timing breakdown with proportional bar visualization
- Entity counts for key arrays
- GC pause warning when detected

The overlay's `SECTION_ORDER` reflects the decomposed enemy systems:

| Section          | Priority | Source                           |
| ---------------- | -------- | -------------------------------- |
| updatePlayers    | 10       | `systems/physics.ts`             |
| updateSpells     | 20       | `systems/waves.ts`               |
| updateAoe        | 30       | `systems/waves.ts`               |
| updateZones      | 40       | `systems/waves.ts`               |
| enemyTimers      | 50       | `systems/enemies.ts`             |
| enemyStatus      | 51       | `systems/enemies.ts`             |
| enemyAI          | 52       | `systems/enemies.ts`             |
| enemyPhysics     | 53       | `systems/enemies.ts`             |
| enemyAttack      | 54       | `systems/enemies.ts`             |
| enemyTraps       | 55       | `systems/enemies.ts`             |
| updateEProj      | 60       | `systems/enemies.ts`             |
| updateWaves      | 70       | `systems/dungeon.ts`             |
| camera           | --       | `rendering/renderer.ts`          |
| effects          | --       | `rendering/draw-effects.ts`      |
| hud              | --       | `rendering/draw-hud.ts`          |
| render           | --       | All Canvas2D draw calls          |

### Console Access

For programmatic inspection:

```js
// In browser console:
profiler.enabled = true;           // Enable without overlay
profiler.getData();                // Current frame snapshot
profiler.getHistory();             // Last 300 frames
profiler.getHistory().filter(f => f.gcPause);  // Find GC pauses
```

## Architecture

The game uses a **priority-based ECS system runner** (`src/ecs/system-runner.ts`) driven by a single `requestAnimationFrame` loop in `src/main.ts`. Systems are registered with a name and priority number; the runner executes them in ascending priority order each frame.

### Entity storage

- **Enemies** — Structure-of-Arrays (SoA) via `EnemyPool` (`src/ecs/enemy-pool.ts`) using `Float32Array`, `Int32Array`, and `Uint8Array` for cache-friendly iteration.
- **Spells** — SoA via `SpellPool` (`src/ecs/spell-pool.ts`), max 128 active spells.
- **Enemy projectiles** — SoA via `EProjPool` (`src/ecs/eproj-pool.ts`), max 64 active projectiles.
- **Particles, trails, shockwaves, beams, zones, AoE markers** — Object pools (`src/systems/pools.ts`) with `Pool<T>` class using swap-and-pop O(1) removal.

### Collision detection

A **spatial hash grid** (`src/ecs/spatial-grid.ts`) with 128px cells covering the 1000x700 arena is rebuilt once per frame at priority 5 (before all other systems). It is used for spell homing, gravity well, zap aura, spell-enemy collision, and pillar collision queries.

### Execution order

1. **Spatial grid rebuild** (p5) — Inserts all enemies into the hash grid
2. **Input processing** — Keyboard/mouse state captured via event listeners
3. **Game simulation** (p10-p70) — Physics, AI, spawning, collisions
4. **Camera & effects** — Camera follow, screen shake, effect decay
5. **Rendering** — Canvas2D draw calls in painter's order

All game state lives in a single mutable `GameState` object passed to every system.

## Frame Budget

At 60 FPS, each frame has a budget of **16.67ms**. Breakdown of expected costs:

| Category         | Expected Time | Notes                                                      |
| ---------------- | ------------- | ---------------------------------------------------------- |
| Spatial grid     | 0.1-0.3ms     | Hash grid rebuild, scales linearly with enemy count         |
| Update systems   | 0.5-2ms       | SoA layout + spatial queries reduce per-entity cost         |
| Camera/FX/HUD    | 0.5-1ms       | Mostly lightweight                                          |
| Rendering        | 2-6ms         | Batched draw calls, no shadow blur, cached gradients        |
| Browser/rAF      | 1-2ms         | Compositing, layout, GC                                     |
| **Headroom**     | 5-12ms        | Available for new features                                   |

Late-wave scenarios (wave 20+) with 30+ enemies and 100+ particles should remain well within budget due to spatial partitioning and object pooling.

## Systems Profiled

Each system is automatically instrumented by the `SystemRunner`, which wraps every `update()` call with `profiler.begin(name)` / `profiler.end(name)`.

### Update Phase (host/local only)

| Section          | Priority | System                    | Description                                                    |
| ---------------- | -------- | ------------------------- | -------------------------------------------------------------- |
| rebuildEnemyGrid | 5        | `systems/spatial.ts`      | Rebuild spatial hash grid with current enemy positions (not shown in overlay) |
| updatePlayers    | 10       | `systems/physics.ts`      | Player movement, collision with walls/pillars, pickup magnet    |
| updateSpells     | 20       | `systems/waves.ts`        | Spell movement, wall bouncing, spell-enemy collision via grid   |
| updateAoe        | 30       | `systems/waves.ts`        | Area-of-effect damage ticks and lifetime                        |
| updateZones      | 40       | `systems/waves.ts`        | Persistent zone damage and effects                              |
| enemyTimers      | 50       | `systems/enemies.ts`      | Cooldown/timer decrements for all enemies                       |
| enemyStatus      | 51       | `systems/enemies.ts`      | Status effect processing (stun, slow, poison, etc.)             |
| enemyAI          | 52       | `systems/enemies.ts`      | Target selection and AI state transitions                       |
| enemyPhysics     | 53       | `systems/enemies.ts`      | Enemy movement, wall/pillar collision, knockback                |
| enemyAttack      | 54       | `systems/enemies.ts`      | Attack execution and projectile spawning                        |
| enemyTraps       | 55       | `systems/enemies.ts`      | Trap placement and trigger logic                                |
| updateEProj      | 60       | `systems/enemies.ts`      | Enemy projectile movement and player collision                  |
| updateWaves      | 70       | `systems/dungeon.ts`      | Wave spawning, progression, boss logic                          |

### Shared Phase

| Section | System                     | Description                         |
| ------- | -------------------------- | ----------------------------------- |
| camera  | `rendering/renderer.ts`    | Camera follow and screen shake      |
| effects | `rendering/draw-effects.ts`| Particle/trail/shockwave/text decay |
| hud     | `rendering/draw-hud.ts`    | HP/mana bars, wave counter, combo   |

### Render Phase

| Section | Description                                                     |
| ------- | --------------------------------------------------------------- |
| render  | All Canvas2D draw calls: room, entities, effects, UI overlays   |

## Known Hotspots (Status)

These were identified from static code analysis during initial profiling and have since been addressed:

### 1. Spell-Enemy Collision: O(spells x enemies) -- RESOLVED

**Before:** In `systems/waves.ts`, `updateSpells` checked every spell against every enemy each frame using a nested loop. With 20 spells and 30 enemies, that was 600 distance checks per frame.

**After:** Spatial hash grid (`src/ecs/spatial-grid.ts`) with 128px cells. Spell-enemy collision now queries only nearby cells, reducing complexity from O(spells x enemies) to roughly O(n) with constant-factor grid lookups. The grid is also used for homing, gravity well, and zap aura queries.

### 2. Enemy AI Target Selection -- PARTIALLY RESOLVED

**Before:** In `systems/enemies.ts`, the monolithic `updateEnemies` function handled AI, physics, attacks, and status effects in a single pass, making it difficult to profile individual subsystems.

**After:** Decomposed into 6 ECS-style systems (enemyTimers, enemyStatus, enemyAI, enemyPhysics, enemyAttack, enemyTraps) with separate profiler sections. SoA storage via `EnemyPool` using typed arrays improves cache locality during iteration. Per-enemy AI cost remains proportional to enemy count, but is now independently measurable and optimizable.

### 3. Rendering (`rendering/draw-entities.ts`) -- PARTIALLY RESOLVED

**Before:** Each entity type had complex per-entity rendering with multiple canvas state changes (save/restore, globalAlpha, shadow effects, gradient fills). `shadowBlur` was used extensively, which is very expensive on Canvas2D.

**After:**
- **Color-batched draw calls** for particles, trails, and shockwaves (grouped by color before drawing, reducing canvas state changes).
- **3-pass beam rendering** (outer glow, mid, core) instead of per-beam multi-pass.
- **Bulk enemy health bar rendering** to minimize state changes.
- **`shadowBlur` replaced** with double-draw glow technique throughout, eliminating the most expensive Canvas2D operation.
- **Gradient cache** (`src/rendering/gradient-cache.ts`) — caches `CanvasGradient` objects by key, max 512 entries, cleared per frame to avoid stale references.
- **RGBA color cache** (`src/rendering/rgba-cache.ts`) — caches color strings by packed 32-bit key, avoiding string allocation per draw call.

### 4. Particle/Trail Array Growth -- RESOLVED

**Before:** `state.particles` and `state.trails` were plain arrays that grew during gameplay. Trails had no explicit cap and could accumulate hundreds of entries, each requiring a draw call. Array `splice()` for removal was O(n).

**After:** All effect arrays replaced with `Pool<T>` (`src/systems/pools.ts`) using pre-allocated fixed-size storage and swap-and-pop O(1) removal. Pool limits:
- `MAX_PARTICLES` = 200
- `MAX_TRAILS` = 300
- `MAX_SHOCKWAVES` = 50
- `MAX_FLOATING_TEXTS` = 50
- `MAX_BEAMS` = 64
- `MAX_ZONES` = 32
- `MAX_AOE_MARKERS` = 32

No per-frame array allocation or garbage generation from effect entities.

### 5. No Spatial Partitioning -- RESOLVED

**Before:** All collision detection (spell-enemy, enemy-player, projectile-player, pickup-player) used brute-force distance checks with no spatial indexing. Cost scaled as O(n*m) for each pair type.

**After:** Spatial hash grid (`src/ecs/spatial-grid.ts`) with 128px cells for the 1000x700 arena. Grid is rebuilt once per frame (priority 5) and queried by all collision-dependent systems. Broad-phase spatial queries eliminate the vast majority of distance checks.

## Recommendations

### Completed Optimizations

1. ~~Add spatial grid for spell-enemy collision (biggest algorithmic win).~~ -- Done. Spatial hash grid in `src/ecs/spatial-grid.ts`.
2. ~~Pool particle/trail objects instead of push/splice.~~ -- Done. `Pool<T>` in `src/systems/pools.ts` with fixed caps.
3. ~~Batch similar draw calls in the render phase.~~ -- Done. Color-batched particles/trails/shockwaves, 3-pass beams, bulk health bars.
4. ~~Consider offscreen canvas for static elements (room, pillars).~~ -- Not yet implemented.

### Remaining Optimization Opportunities

1. **Offscreen canvas for static elements**: Room background and pillars could be rendered to an offscreen canvas once and blitted each frame, saving dozens of draw calls.
2. **Web Worker for AI**: Enemy AI computation could be offloaded to a Web Worker, freeing the main thread for rendering. Requires serializing the spatial grid or maintaining a shadow copy.
3. **Instanced rendering via WebGL**: If Canvas2D becomes the bottleneck at very high entity counts, migrating particle/trail rendering to WebGL with instanced draws would dramatically reduce draw call overhead.
4. **Frame-skip for off-screen entities**: Enemies and effects outside the camera viewport could skip rendering entirely.
5. **LOD for distant effects**: Reduce particle detail or skip trail rendering for entities far from the player.

### How to Interpret Results

- **Frame time > 12ms consistently**: Performance is marginal; any spike will cause dropped frames.
- **`render` dominates**: GPU-bound; reduce draw calls, simplify visual effects, consider offscreen canvas.
- **`updateSpells` dominates**: Check spatial grid cell size tuning; may need finer grid.
- **`enemyAI` dominates**: Simplify pathfinding or reduce update frequency for distant enemies.
- **`enemyPhysics` dominates**: Check SoA iteration patterns for cache misses.
- **GC pauses appearing**: Look for remaining temporary object allocations outside pooled systems.

## How to Use

- **F3** to toggle the overlay during gameplay.
- **`profiler.getData()`** in the browser console to inspect the current frame.
- **`profiler.getHistory()`** for the last 300 frames of data.
- **`profiler.getHistory().filter(f => f.gcPause)`** to find GC pause frames.
- **`profiler.getHistory().map(f => f.sections.render)`** to chart render times.
- **`profiler.getHistory().map(f => f.sections.enemyAI)`** to isolate AI cost from other enemy subsystems.

## Optimization History

| Date       | Task(s)   | Change                                                                                   |
| ---------- | --------- | ---------------------------------------------------------------------------------------- |
| 2026-04-14 | #112      | Migrated enemy storage from Array-of-Structs to SoA via `EnemyPool` (Float32/Int32/Uint8Array) |
| 2026-04-14 | #113      | Added `SystemRunner` for priority-based system execution with auto-profiling              |
| 2026-04-14 | #114      | Decomposed `updateEnemies` into 6 ECS-style systems with priority ordering               |
| 2026-04-14 | #115      | Migrated spell and enemy projectile storage to SoA via `SpellPool` and `EProjPool`        |
| 2026-04-14 | #116      | Implemented object pooling (`Pool<T>`) for particles, trails, shockwaves, texts, beams, zones |
| 2026-04-14 | #117      | Added RGBA color cache, gradient cache, and scratch buffers to reduce per-frame allocations |
| 2026-04-14 | #118      | Implemented spatial hash grid (`src/ecs/spatial-grid.ts`) for broad-phase collision       |
| 2026-04-14 | #119      | Color-batched rendering for particles/trails/shockwaves, 3-pass beams, bulk health bars   |
| 2026-04-14 | #121      | Replaced `shadowBlur` with double-draw glow technique throughout rendering                |
| 2026-04-14 | #122      | Cached `createRadialGradient`/`createLinearGradient` calls to avoid per-frame re-creation |
