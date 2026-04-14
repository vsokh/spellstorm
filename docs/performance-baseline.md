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

### Debug HUD Overlay (`src/debug/perf-overlay.ts`)

Press **F3** to toggle an in-game overlay drawn directly on the Canvas2D surface (no DOM elements). It displays:

- FPS counter with color coding (green >= 55, yellow >= 30, red < 30)
- Frame time in milliseconds with a budget bar (16.67ms target)
- Per-system timing breakdown with proportional bar visualization
- Entity counts for key arrays
- GC pause warning when detected

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

The game uses a single `requestAnimationFrame` loop (`src/main.ts`) that runs all systems sequentially each frame:

1. **Input processing** - keyboard/mouse state captured via event listeners
2. **Game simulation** (host/local only) - physics, AI, spawning, collisions
3. **Camera & effects** - shared between host and guest
4. **Rendering** - Canvas2D draw calls in painter's order

All game state lives in a single mutable `GameState` object passed to every system.

## Frame Budget

At 60 FPS, each frame has a budget of **16.67ms**. Breakdown of expected costs:

| Category       | Expected Time | Notes                                    |
| -------------- | ------------- | ---------------------------------------- |
| Update systems | 1-4ms         | Scales with entity count                 |
| Camera/FX/HUD  | 0.5-1ms       | Mostly lightweight                       |
| Rendering      | 4-10ms        | Dominated by draw calls and alpha blends |
| Browser/rAF    | 1-2ms         | Compositing, layout, GC                  |
| **Headroom**   | 1-8ms         | Available for new features               |

Late-wave scenarios (wave 20+) with 30+ enemies and 100+ particles may push total frame time toward 12-16ms.

## Systems Profiled

Each `profiler.begin(name)` / `profiler.end(name)` pair instruments one subsystem:

### Update Phase (host/local only)

| Section        | System                  | Description                                                  |
| -------------- | ----------------------- | ------------------------------------------------------------ |
| updatePlayers  | `systems/physics.ts`    | Player movement, collision with walls/pillars, pickup magnet |
| updateSpells   | `systems/waves.ts`      | Spell movement, wall bouncing, spell-enemy collision         |
| updateAoe      | `systems/waves.ts`      | Area-of-effect damage ticks and lifetime                     |
| updateZones    | `systems/waves.ts`      | Persistent zone damage and effects                           |
| updateEnemies  | `systems/enemies.ts`    | Enemy AI, movement, attacks, death                           |
| updateEProj    | `systems/enemies.ts`    | Enemy projectile movement and player collision               |
| updateWaves    | `systems/dungeon.ts`    | Wave spawning, progression, boss logic                       |

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

## Known Hotspots

These are identified from static code analysis, not runtime profiling:

### 1. Spell-Enemy Collision: O(spells x enemies)

In `systems/waves.ts`, `updateSpells` checks every spell against every enemy each frame using a nested loop. With 20 spells and 30 enemies, that is 600 distance checks per frame. This is the most likely bottleneck in late-game waves.

### 2. Enemy AI Target Selection

In `systems/enemies.ts`, each enemy scans all players to find its target. While the player count is small (1-2), the per-enemy logic includes multiple distance calculations and state checks that add up with 30+ enemies.

### 3. Rendering (`rendering/draw-entities.ts`)

At 3467 lines, this is the largest file in the codebase. Each entity type has complex per-entity rendering with multiple canvas state changes (save/restore, globalAlpha, shadow effects, gradient fills). The sheer number of draw calls per frame is a concern.

### 4. Particle/Trail Array Growth

`state.particles` and `state.trails` arrays grow during gameplay as spells create visual effects. While particles have a cap of 150, trails have no explicit cap and can accumulate hundreds of entries during intense combat, each requiring a draw call.

### 5. No Spatial Partitioning

All collision detection (spell-enemy, enemy-player, projectile-player, pickup-player) uses brute-force distance checks with no spatial indexing (no grid, no quadtree). This means collision cost scales as O(n*m) for each pair type.

## Recommendations

### What to Profile First

1. **Late-game waves (15+)**: Enemy count peaks, spell count is high, most particles active.
2. **Boss fights**: Boss minion spawns create sudden entity spikes.
3. **Multi-projectile classes**: Classes with spread/chain shots create the most spells.

### How to Interpret Results

- **Frame time > 12ms consistently**: Performance is marginal; any spike will cause dropped frames.
- **`render` dominates**: GPU-bound; reduce draw calls, simplify visual effects.
- **`updateSpells` dominates**: Collision-bound; implement spatial partitioning.
- **`updateEnemies` dominates**: AI-bound; simplify pathfinding or reduce update frequency.
- **GC pauses appearing**: Object allocation is creating garbage; pool entities and reduce temporary objects.

### Optimization Priorities

1. Add spatial grid for spell-enemy collision (biggest algorithmic win).
2. Pool particle/trail objects instead of push/splice.
3. Batch similar draw calls in the render phase.
4. Consider offscreen canvas for static elements (room, pillars).

## How to Use

- **F3** to toggle the overlay during gameplay.
- **`profiler.getData()`** in the browser console to inspect the current frame.
- **`profiler.getHistory()`** for the last 300 frames of data.
- **`profiler.getHistory().filter(f => f.gcPause)`** to find GC pause frames.
- **`profiler.getHistory().map(f => f.sections.render)`** to chart render times.
