# Network Architecture Audit

**Project:** Wizard Crawl (co-op roguelike dungeon crawler)
**Version:** 0.4.0
**Date:** 2026-04-13
**Scope:** Full audit of the multiplayer networking layer — protocol, bandwidth, bottlenecks, and optimization roadmap.

---

## 1. Executive Summary

This audit examines the multiplayer networking architecture of Wizard Crawl, a two-player cooperative dungeon crawler that uses browser-to-browser WebRTC data channels for real-time state synchronization.

**Key finding:** The transport layer (WebRTC via PeerJS) is fundamentally sound. All identified bottlenecks are in the **application layer** — specifically in state serialization, entity matching, and message design. This is good news: it means significant improvements are achievable without changing the underlying transport.

**Architecture:** Host-authoritative P2P model over PeerJS 1.5.4 / WebRTC DataConnection (reliable, ordered). The host runs all game logic and broadcasts a full state snapshot to the guest every 50ms (20 Hz). The guest sends raw input every frame (~60 FPS) and applies client-side prediction with server reconciliation.

**Current bandwidth profile:** 80-200 KB/s depending on wave intensity, with 20 state updates per second. Late-wave scenarios with 80+ enemies and 50+ spells push payloads to ~10 KB per message.

**Results:** 10 bottlenecks identified across severity levels, with 14 recommendations organized into 4 priority tiers. Tier 1 quick wins alone could reduce bandwidth by 30-40%.

---

## 2. Architecture Overview

### 2.1 Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Signaling & NAT traversal | PeerJS | 1.5.4 |
| Transport | WebRTC DataConnection | reliable, ordered |
| Serialization | JSON (native `JSON.stringify`) | N/A |
| Game loop | `requestAnimationFrame` | ~60 FPS |

The connection is established in `src/network.ts` line 199 with the `{ reliable: true }` option:

```ts
conn = peer!.connect('wcrawl-' + code, { reliable: true });
```

This configures the underlying SCTP data channel for reliable, ordered delivery — equivalent to TCP semantics over UDP.

### 2.2 Host-Authoritative Model

The game uses a strict host-authoritative architecture:

- **Host** (player 0): Runs all game logic — physics, combat, wave spawning, collision detection. Serializes and sends full game state at 20 Hz.
- **Guest** (player 1): Sends raw input every frame. Receives authoritative state snapshots and applies interpolation/prediction for smooth rendering.

State authority is enforced in the main loop (`src/main.ts` lines 207-235):

```ts
if (state.mode !== NetworkMode.Guest) {
  // Host/local: full game logic
  updatePlayers(state, gameDt);
  updateSpells(state, gameDt);
  // ... all systems run here
  state.netTimer -= dt;
  if (state.netTimer <= 0) {
    state.netTimer = NET_SEND_INTERVAL;
    sendState(state);
  }
}
```

### 2.3 Network Tick Rate

The network tick rate is fixed at 20 Hz, defined in `src/constants.ts` line 32:

```ts
export const NET_SEND_INTERVAL = 0.05; // 50ms
```

This means a full state snapshot is sent from host to guest every 50 milliseconds. The guest's input, by contrast, is sent every render frame (~16ms at 60 FPS), resulting in approximately 3x more input messages than state messages.

### 2.4 Interpolation Strategies

The guest uses different interpolation strategies per entity type to balance smoothness with accuracy:

| Entity | Strategy | Details |
|--------|----------|---------|
| **Local player** | Client-side prediction + correction | Guest predicts own movement locally; corrections blend toward authoritative position with error thresholds (snap >50px, lerp >4px) |
| **Remote player** | Linear interpolation | Lerps from previous to target position over one tick interval (50ms) |
| **Enemies** | Linear interpolation + animation preservation | Matched to previous frame by proximity; visual timers (`_hitFlash`, `_deathTimer`, `_atkAnim`) preserved across updates |
| **Spells** | Snap + velocity extrapolation | Position snaps to authoritative, then extrapolates using `vx`/`vy` between ticks; includes wall-bounce logic |
| **Zones / AOE / Pickups / Pillars** | Full replacement (snap) | Entire arrays replaced each tick, no interpolation |

The enemy interpolation and player prediction are handled in `src/main.ts` lines 259-319, while spell extrapolation includes wall-bounce mirroring from the host logic (lines 307-319).

---

## 3. Message Protocol

### 3.1 NetStateMessage (Host -> Guest)

Sent every 50ms. Contains the full authoritative game state. Defined in `src/types.ts` lines 679-701 and serialized in `src/network.ts` lines 254-318.

#### Entity Arrays

**Players (`p`)** — `NetStatePlayerData[]`
| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `x` | number | `~~p.x` | X position (truncated to int) |
| `y` | number | `~~p.y` | Y position (truncated to int) |
| `a` | number | `Math.round(p.angle * 100) / 100` | Aim angle (2 decimal places) |
| `hp` | number | `p.hp` | Current HP |
| `mhp` | number | `p.maxHp` | Max HP |
| `mn` | number | `~~p.mana` | Current mana (truncated) |
| `mmn` | number | `p.maxMana` | Max mana |
| `al` | boolean | `p.alive` | Alive flag |
| `cd` | number[] | `p.cd.map(...)` | Cooldowns (1 decimal place) |
| `if` | boolean | `p.iframes > 0` | Invincibility frames active |

**Enemies (`e`)** — `NetStateEnemyData[]`
| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `t` | string | `e.type` | Enemy type name (e.g. "goblin") |
| `x` | number | `~~e.x` | X position |
| `y` | number | `~~e.y` | Y position |
| `hp` | number | `e.hp` | Current HP |
| `mhp` | number | `e.maxHp` | Max HP |
| `al` | boolean | `e.alive` | Alive flag |
| `tgt` | number | `e.target` | Target player index |

**Spells (`sp`)** — `NetStateSpellData[]`
| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `x` | number | `~~s.x` | X position |
| `y` | number | `~~s.y` | Y position |
| `vx` | number | `~~s.vx` | X velocity |
| `vy` | number | `~~s.vy` | Y velocity |
| `r` | number | `s.radius` | Radius |
| `c` | string | `s.color` | Color (rgba string) |
| `o` | number | `s.owner` | Owner player index |
| `k` | string | `s.clsKey` | Class key (for rendering) |
| `t` | string | `s.type` | Spell type |
| `tr` | string | `s.trail` | Trail color (rgba string) |
| `ex` | number | `s.explode` | Explosion radius |
| `sl` | number | `s.slow` | Slow duration |
| `ho` | number | `s.homing` | Homing strength |
| `z` | number | `s.zap` | Zap range |
| `dr` | number | `s.drain` | Mana drain |
| `bn` | number | `s.burn` | Burn damage |
| `st` | number | `s.stun` | Stun duration |
| `l` | number | `Math.round(s.life * 100) / 100` | Remaining life |
| `ag` | number | `Math.round(s.age * 100) / 100` | Current age |

**Enemy Projectiles (`ep`)** — `NetStateEProjData[]`
| Field | Type | Description |
|-------|------|-------------|
| `x` | number | X position |
| `y` | number | Y position |
| `r` | number | Radius |
| `c` | string | Color |

**Zones (`zn`)** — `NetStateZoneData[]`
| Field | Type | Description |
|-------|------|-------------|
| `x` | number | X position |
| `y` | number | Y position |
| `r` | number | Radius |
| `c` | string | Color |
| `age` | number | Current age |
| `dur` | number | Total duration |

**AOE Markers (`aoe`)** — `NetStateAoeData[]`
| Field | Type | Description |
|-------|------|-------------|
| `x` | number | X position |
| `y` | number | Y position |
| `r` | number | Radius |
| `c` | string | Color |
| `age` | number | Current age |
| `del` | number | Delay before detonation |

**Pickups (`pk`)** — `NetStatePickupData[]`
| Field | Type | Description |
|-------|------|-------------|
| `x` | number | X position |
| `y` | number | Y position |
| `t` | PickupType | Type enum (chest, health, gold, xp, trap) |

**Pillars (`pl`)** — `NetStatePillarData[]`
| Field | Type | Description |
|-------|------|-------------|
| `x` | number | X position |
| `y` | number | Y position |
| `r` | number | Radius |

#### Global Fields

| Key | Field | Type | Description |
|-----|-------|------|-------------|
| `w` | wave | number | Current wave number |
| `wA` | waveActive | boolean | Wave in progress |
| `wBr` | waveBreakTimer | number | Time until next wave (1 decimal) |
| `g` | gold | number | Team gold |
| `tk` | totalKills | number | Total kills this run |
| `gp` | gamePhase | GamePhase | Current game phase enum |
| `ct` | countdownTimer | number | Countdown seconds remaining |
| `sc` | screenFlash | number | Flash intensity (>0 only) |
| `sk` | shakeIntensity | number | Screen shake intensity (>0 only) |
| `lv` | lives | number | Lives remaining |
| `mlv` | maxLives | number | Maximum lives |

#### Visual Effects (`fx`) — Optional

Sent only when `state.pendingFx.length > 0`. Each entry is a `NetFxEvent` (defined in `src/types.ts` lines 668-677):

| Field | Type | Description |
|-------|------|-------------|
| `t` | `'p' \| 't' \| 'sw'` | Event type: particle, text, shockwave |
| `x` | number | X position |
| `y` | number | Y position |
| `c` | string | Color |
| `n` | number? | Particle count |
| `s` | number? | Particle scale |
| `tx` | string? | Text content |
| `mr` | number? | Shockwave max radius |

The FX queue is populated by `spawnParticles()`, `spawnText()`, and `spawnShockwave()` in `src/state.ts` (lines 423-463) when running as host. The queue is cleared after each send (`src/network.ts` line 304):

```ts
state.pendingFx.length = 0;
```

### 3.2 NetInputMessage (Guest -> Host)

Sent every render frame (~60 FPS). Defined in `src/types.ts` lines 543-553 and sent from `src/network.ts` lines 524-541.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'input'` | Message discriminator |
| `angle` | number | Aim angle (radians) |
| `mx` | number | Movement X component |
| `my` | number | Movement Y component |
| `shoot` | boolean | Primary fire |
| `shoot2` | boolean | Secondary fire |
| `ability` | boolean | Q ability |
| `ult` | boolean | Ultimate (R) |
| `dash` | boolean | Dash |

Estimated size: ~100-120 bytes per message. At 60 FPS: ~6-7 KB/s upstream from guest.

### 3.3 Other Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `cls` | Guest -> Host | Class selection (contains `cls` string) |
| `go` | Host -> Guest | Start game (contains `h` and `g` class keys) |
| `upgrade` | Host -> Guest | Offer upgrade choices (contains `indices` array) |
| `host_picked` | Host -> Guest | Host's upgrade pick (contains `idx`) |
| `guest_picked` | Guest -> Host | Guest's upgrade pick (contains `idx`) |
| `resume` | Host -> Guest | Resume after upgrade phase |

All messages are validated against a whitelist set (`src/network.ts` line 19):

```ts
const VALID_MSG_TYPES = new Set([
  'input', 'cls', 'go', 'upgrade', 'host_picked', 'guest_picked', 'resume', 'state'
]);
```

---

## 4. Message Size Profiles

All estimates assume JSON serialization with short property names. Sizes are approximate and measured as UTF-8 encoded JSON string length.

### Per-Entity Size Estimates

| Entity | Fields | Est. JSON bytes |
|--------|--------|-----------------|
| Player | 10 fields | ~90 bytes |
| Enemy | 7 fields | ~65 bytes |
| Spell | 19 fields | ~140 bytes |
| Enemy Projectile | 4 fields + color string | ~55 bytes |
| Zone | 6 fields + color string | ~75 bytes |
| AOE Marker | 6 fields + color string | ~70 bytes |
| Pickup | 3 fields | ~35 bytes |
| Pillar | 3 fields | ~25 bytes |

### Bandwidth by Game Phase

| Phase | Enemies | Spells | Other | Est. Payload | Bandwidth (20 Hz) |
|-------|---------|--------|-------|-------------|-------------------|
| **Early wave (1-3)** | ~5 | ~5 | 2 players, 3 pickups, 3 pillars | ~1.2 KB | ~24 KB/s |
| **Mid wave (8-10)** | ~30 | ~25 | 2 players, 5 pickups, 5 pillars, 2 zones | ~4 KB | ~80 KB/s |
| **Late wave (15+)** | ~80 | ~50 | 2 players, 8 pickups, 5 pillars, 4 zones, 3 AOE | ~10 KB | ~200 KB/s |
| **Boss wave** | ~1 boss + 15 minions | ~40 | 2 players, 3 pickups, 5 pillars, 3 zones, 5 AOE | ~6 KB | ~120 KB/s |

**Dominant cost:** Spells (~140 bytes each) and enemies (~65 bytes each) make up 85-90% of the payload in combat-heavy phases. Color strings in spells/zones alone account for ~20% of entity bytes.

**Guest upstream:** ~6-7 KB/s constant (input at 60 FPS, ~100 bytes each).

**Combined peak:** ~207 KB/s (200 KB/s host->guest + 7 KB/s guest->host) during late waves.

---

## 5. Bottlenecks

### B1: O(n^2) Enemy Matching

**Severity:** Medium
**Location:** `src/network.ts` lines 365-381
**Impact:** For each incoming enemy in the state message, the guest iterates all existing local enemies to find the closest match by type and distance. With 50-100 enemies in late waves, this performs 2,500-10,000 distance calculations per tick (20 times per second).

```ts
for (const ed of msg.e) {
  let bestMatch: Enemy | null = null;
  let bestDist = 50;
  let bestIdx = -1;
  for (let j = 0; j < oldEnemies.length; j++) {
    const old = oldEnemies[j];
    if (old.type !== ed.t) continue;
    const dx = old.x - ed.x;
    const dy = old.y - ed.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) { bestDist = d; bestMatch = old; bestIdx = j; }
  }
```

The matching is necessary because enemies lack persistent IDs — they are identified only by type and spatial proximity. Each matched enemy is removed via `splice()` (line 383), which is O(n) on the remaining array, compounding the cost.

**Worst case:** 100 enemies x 100 candidates = 10,000 iterations + 100 splice operations per tick.

---

### B2: Full State Serialization Every Tick

**Severity:** Medium
**Location:** `src/network.ts` lines 254-301
**Impact:** The entire game state is serialized into a single JSON message every 50ms with no delta encoding. Every entity is included in every message regardless of whether it changed. At 80 enemies and 50 spells, this produces ~10 KB of JSON per tick.

```ts
const msg: NetStateMessage = {
  type: 'state',
  p: state.players.map(p => ({ ... })),
  e: state.enemies.map(e => ({ ... })),
  sp: state.spells.map(s => ({ ... })),
  // ... all entities, every tick
};
```

Many entities (pillars, inactive pickups, slow-moving enemies) change minimally between ticks. Static pillars in particular are identical every frame yet are serialized 20 times per second.

---

### B3: Color Strings in Every Update

**Severity:** Low
**Location:** `src/network.ts` lines 268, 275, 277-278, 281
**Impact:** Spells, enemy projectiles, zones, and AOE markers include full `rgba()` color strings (e.g., `"rgba(255,102,51,0.8)"`) in every state message. These are 20-25 bytes each and never change after the entity spawns.

For 50 spells with both `color` and `trail` fields, that is ~2,000-2,500 bytes per tick of unchanging data, accounting for roughly 25% of spell payload.

---

### B4: Unreliable Input Over Reliable Channel

**Severity:** Medium
**Location:** `src/network.ts` lines 524-541 (sending), `src/main.ts` lines 239-240 (every frame)
**Impact:** The guest sends input messages every render frame (~60 FPS) over the reliable DataConnection. Input messages are inherently ephemeral — only the latest matters. However, because the channel is reliable and ordered, if a single packet is lost, WebRTC's SCTP layer will retransmit it and **block all subsequent messages** until the lost packet arrives (head-of-line blocking).

```ts
// Guest sends input every frame in the main loop:
const inp = getInput(state, state.localIdx);
sendInput(state, inp);
```

Under 1% packet loss, this means up to 16ms of queued input is blocked, which at 60 FPS affects 1-2 frames. Under higher loss (mobile, congested networks), the backup compounds rapidly because there are 60 messages per second in the queue.

---

### B5: Micro-Optimized Integer Truncation

**Severity:** Low
**Location:** `src/network.ts` lines 260-262, 272
**Impact:** The code uses `~~x` (double bitwise NOT) to truncate positions to integers and `Math.round(p.angle * 100) / 100` for angle precision. While technically correct, the savings are minimal with JSON serialization — the difference between `"123.456"` (7 chars) and `"123"` (3 chars) is only 4 bytes per field.

```ts
x: ~~p.x, y: ~~p.y, a: Math.round(p.angle * 100) / 100,
```

With JSON, the overhead of property names (`"x":`, `"y":`) and structural characters (`{`, `,`, `}`) dominates. True bandwidth savings require either fewer fields per entity or binary encoding, not truncation of individual values.

---

### B6: Visual Effects Lost on Packet Drop

**Severity:** Low
**Location:** `src/network.ts` lines 300-304, `src/state.ts` lines 423-463
**Impact:** Visual effect events (particles, floating text, shockwaves) are queued on the host in `state.pendingFx` and copied into the next state message. The queue is then immediately cleared (line 304). If that specific state message is dropped or arrives corrupted, those visual effects are permanently lost — they will never be resent.

```ts
fx: state.pendingFx.length > 0 ? state.pendingFx.slice() : undefined,
// ...
state.pendingFx.length = 0;
```

In practice, the reliable channel makes true packet loss rare. However, if the connection hiccups (e.g., tab backgrounding, network transition), any FX events queued during that window disappear. The result is missing hit particles, damage numbers, or explosion shockwaves on the guest — purely cosmetic but noticeable.

---

### B7: No Interest Management / Spatial Culling

**Severity:** Medium
**Location:** `src/network.ts` lines 259-288 (entity serialization)
**Impact:** All entities are serialized regardless of their position relative to the players. The game room is 1000x700 pixels (`src/constants.ts` lines 15-16), and with camera following the action, off-screen entities need not be sent at full fidelity.

In late waves with 80+ enemies, many are clustered at spawn points or chasing across the room. Enemies that are far from both players and off-screen for the guest provide no visual value but consume the same bandwidth as enemies in the camera viewport.

Estimated waste: In a typical late-wave frame, 30-40% of enemies may be off the guest's viewport, costing ~1.5-2.5 KB per tick unnecessarily.

---

### B8: Spell Metadata Bloat

**Severity:** Low
**Location:** `src/network.ts` lines 267-273
**Impact:** Every spell carries immutable metadata fields (`clsKey`, `type`, `trail`, `explode`, `slow`, `homing`, `zap`, `drain`, `burn`, `stun`) that are set at spawn and never change. These are resent in every tick for the spell's entire lifetime.

A typical spell has 8-10 modifier fields that are either 0 or a fixed value. With 50 active spells, the immutable fields alone consume ~3-4 KB per tick. Only `x`, `y`, `vx`, `vy`, `l` (life), and `ag` (age) actually change between ticks.

---

### B9: Fixed 50px Enemy Match Threshold

**Severity:** Low
**Location:** `src/network.ts` line 368
**Impact:** The enemy matching algorithm uses a hardcoded 50px maximum distance threshold. Fast enemies (speed 200+ pixels/second at late-wave speed multipliers) can travel more than 50px between two network ticks (50ms), causing failed matches.

```ts
let bestDist = 50; // max matching distance
```

When a match fails, the old enemy object is discarded and a new one is created at the authoritative position. This causes a visual "pop" — the enemy loses its interpolation state, hit flash animation, attack wind-up animation, and death timer. In late waves with fast or teleporting enemies, this creates noticeable visual discontinuities.

**Calculation:** An enemy with base speed 200px/s and a 1.5x wave speed multiplier moves 300px/s, or 15px per tick. This is within threshold. However, enemies with `enrage` (speed increases as HP drops) or `teleport` ability can exceed 50px between ticks.

---

### B10: Spell Extrapolation Drift

**Severity:** Low
**Location:** `src/main.ts` lines 307-319
**Impact:** Between state updates, the guest extrapolates spell positions using their velocity vectors. This provides smooth movement but accumulates drift when the host's physics differ from the guest's extrapolation — particularly for homing spells (whose velocity changes every frame on the host) and spells affected by collisions or bounces.

```ts
for (const s of state.spells) {
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  // Wall bounce mirroring...
}
```

The drift is corrected on the next state update (spells snap to authoritative position), but between ticks the guest may render spells 5-15px from their true position. For homing spells with rapidly changing trajectories, the snap is particularly visible.

---

## 6. Recommendations

### Tier 1 — Quick Wins (Low effort, Immediate impact)

#### R1: Replace O(n^2) Enemy Matching with ID-Keyed Map Lookup

**Addresses:** B1 (O(n^2) Enemy Matching)
**Effort:** Low (1-2 hours)
**Savings:** Eliminates 2,500-10,000 distance calculations per tick in late waves.

Assign each enemy a unique numeric ID on the host at spawn time. Include the ID in `NetStateEnemyData`. On the guest, maintain a `Map<number, Enemy>` for O(1) lookup. The matching loop becomes a single map get per incoming enemy.

**Trade-offs:** Adds 1 field per enemy (~3-5 bytes). The ID can be a simple incrementing counter. This also eliminates the need for the `splice()` removal of matched candidates.

#### R2: Adaptive Enemy Match Threshold

**Addresses:** B9 (Fixed 50px Threshold)
**Effort:** Low (<1 hour)
**Savings:** Eliminates visual pops for fast/enraged enemies.

If R1 (ID-based matching) is not immediately implemented, the threshold should at minimum be `max(50, enemySpeed * NET_SEND_INTERVAL * 2)`. This accommodates fast-moving enemies while keeping the threshold tight for slow ones.

**Trade-offs:** Slightly increases risk of mismatches for closely-packed fast enemies of the same type. ID-based matching (R1) is the proper solution.

#### R3: Strip Immutable Spell Fields After Initial Spawn

**Addresses:** B8 (Spell Metadata Bloat)
**Effort:** Low (2-3 hours)
**Savings:** ~3-4 KB/tick in late waves (~60-80 KB/s reduction at peak).

Track which spells the guest has already seen (by ID or index). On first appearance, send the full spell data. On subsequent ticks, send only the mutable fields: `x`, `y`, `vx`, `vy`, `l`, `ag`.

**Implementation sketch:** Add a `_netSent` Set on the host tracking spell references that have been sent at least once. For known spells, serialize only the 6 mutable fields (~35 bytes) instead of all 19 (~140 bytes). Send a "spell removed" signal when spells expire.

**Trade-offs:** Requires spell identity tracking (sequential IDs, similar to R1). If a "new spell" message is lost, the guest will see a moving dot with no metadata until the next full send. A periodic full refresh (every 1-2 seconds) mitigates this.

#### R4: Remove Color Strings from Per-Tick State

**Addresses:** B3 (Color Strings in Every Update)
**Effort:** Low (1-2 hours)
**Savings:** ~2-3 KB/tick in mid-to-late waves (~40-60 KB/s reduction at peak).

Color strings are immutable after spawn. Send them once with the entity's first appearance (similar to R3). Alternatively, use a color palette — map each unique color to an integer index and send the index instead.

**Implementation sketch for palette approach:** Build a `Map<string, number>` of all colors used in the session. Send the palette once at game start. Replace all `c`, `tr` color string fields with numeric indices. This reduces `"rgba(255,102,51,0.8)"` (22 bytes) to `3` (1 byte).

**Trade-offs:** Palette approach requires coordination. The simpler "send once" approach (paired with R3) has no coordination overhead.

---

### Tier 2 — Medium Effort, High Impact

#### R5: Delta State Encoding

**Addresses:** B2 (Full State Every Tick)
**Effort:** Medium (1-2 days)
**Savings:** 50-60% bandwidth reduction across all phases.

Instead of sending every entity every tick, send only entities that have changed since the last acknowledged state. For moved entities, send only the changed fields.

**Approach:**
1. Assign IDs to all entity types (enemies, spells, projectiles, zones, etc.)
2. Track previous-tick state on the host
3. Diff current state against previous state
4. Send: new entities (full), changed entities (changed fields only), removed entity IDs
5. Periodically send a full "keyframe" state (every 1-2 seconds) for recovery

**Expected savings by entity type:**
- Pillars: 100% savings (static, never change)
- Pickups: 90% savings (only change when collected)
- Enemies: 40-50% savings (positions change, but HP/type/alive often static between hits)
- Spells: 30-40% savings (positions always change, but modifiers are static)

**Trade-offs:** Significantly increases code complexity. Requires a reliable sequencing mechanism to handle out-of-order or dropped deltas. The periodic keyframe provides a recovery path but adds latency to error correction.

#### R6: Batch Guest Input

**Addresses:** B4 (Unreliable Input Over Reliable Channel)
**Effort:** Medium (3-4 hours)
**Savings:** Reduces guest->host message rate from ~60/s to ~20/s (~65% reduction in message count; bandwidth drops from ~7 KB/s to ~3 KB/s).

Instead of sending input every render frame, batch inputs and send every 50ms (matching the host's tick rate). Send only the latest input state per batch.

```ts
// Proposed: accumulate inputs, send at tick rate
state.inputSendTimer -= dt;
if (state.inputSendTimer <= 0) {
  state.inputSendTimer = NET_SEND_INTERVAL;
  sendInput(state, latestInput);
}
```

**Trade-offs:** Adds up to 50ms of input latency for the guest (on top of network RTT). For a cooperative PvE game at 20 Hz tick rate, this is generally acceptable. Button presses (shoot, ability, ult) should be sent immediately to avoid missed inputs; only analog values (angle, movement) should be batched.

#### R7: Bandwidth Profiling Instrumentation

**Addresses:** All bottlenecks (measurement)
**Effort:** Medium (2-3 hours)
**Savings:** Enables data-driven optimization decisions.

Add a lightweight profiling layer that measures:
- Bytes sent per tick (total and per entity type)
- Message count per second (state and input separately)
- Entity counts per tick (enemies, spells, zones, etc.)
- Round-trip time estimate (ping)

Display as an optional debug overlay (toggled with a key). Log periodic summaries to console for analysis.

**Trade-offs:** Adds minimal overhead (~0.1ms per tick for size measurement). Should be conditionally compiled or behind a debug flag for production.

#### R8: Smooth Remote Player Input Interpolation

**Addresses:** Visual quality
**Effort:** Medium (3-4 hours)
**Savings:** No bandwidth savings; improves perceived smoothness of the remote player's movement.

Currently the remote player lerps linearly from previous to target position over one tick. This produces correct but mechanically "stiff" movement. Implementing a small input buffer (2-3 ticks) with hermite interpolation would produce smoother curves, especially during direction changes.

**Trade-offs:** Adds 50-100ms of display latency for the remote player. In a cooperative game this is generally acceptable. Implementation requires buffering 2-3 state snapshots and interpolating between them.

---

### Tier 3 — High Effort, Significant Impact

#### R9: Interest Management / Spatial Culling

**Addresses:** B7 (No Spatial Culling)
**Effort:** High (1-2 days)
**Savings:** 20-35% bandwidth reduction in late waves.

Only send entities that are within the guest's viewport (plus a margin). The host tracks the guest's camera position (derived from the guest player's position and the viewport size) and filters entities before serialization.

**Implementation:**
1. Host calculates guest's viewport bounds: `[playerX - viewW/2 - margin, playerX + viewW/2 + margin]` (same for Y)
2. During serialization, skip entities outside this rectangle
3. Send full data for entities entering the viewport (new to the guest)
4. Send removal signals for entities leaving the viewport

**Margin:** Use 150-200px beyond viewport to ensure entities are visible before the camera reveals them.

**Trade-offs:** Enemies that move into view may appear suddenly if the margin is too small. Boss encounters where both players are far apart may still require sending all entities. The room size (1000x700) is small enough that on larger screens, the entire room may be visible, negating this optimization entirely.

#### R10: Binary Serialization

**Addresses:** B2 (Full State Size), B3 (String Overhead), B5 (Truncation Limits)
**Effort:** High (2-3 days)
**Savings:** 40-60% reduction in serialized message size.

Replace JSON serialization with a binary format such as MessagePack, Protocol Buffers (pbjs), or a custom binary encoder. JSON's structural overhead (property names, quotes, commas, braces) accounts for 40-50% of message bytes.

**Size comparison for a single spell entity:**
- JSON: `{"x":450,"y":300,"vx":-200,"vy":100,"r":10,"c":"#ff6633","o":0,"k":"pyromancer","t":"projectile","tr":"#ff3300","ex":35,"sl":0,"ho":0,"z":0,"dr":0,"bn":2,"st":0,"l":0.85,"ag":0.35}` = ~180 bytes
- Binary (fixed schema): 2+2+2+2+1+1+1+1+1+1+1+1+1+1+1+1+1+2+2 = ~22 bytes

**Trade-offs:** Increases code complexity. Requires schema definition and versioning. Debugging network messages becomes harder (no human-readable JSON in dev tools). MessagePack offers a good middle ground — semi-structured, widely supported, 30-40% smaller than JSON.

#### R11: Client-Side Spell Prediction

**Addresses:** B10 (Spell Extrapolation Drift)
**Effort:** High (2-3 days)
**Savings:** No bandwidth savings; significantly improves visual quality of spell rendering on the guest.

When the guest casts a spell (sends a shoot input), immediately spawn a predicted spell locally using the spell definition and current aim angle. When the host's state confirms the spell, merge the predicted spell with the authoritative one. If the host rejects the spell (insufficient mana, on cooldown), remove the prediction.

**Trade-offs:** Complex to implement correctly, especially for spells with server-side randomness or area effects. Mispredictions need graceful handling. Best suited for simple projectiles (LMB primary fire).

#### R12: Connection Quality Estimation with Adaptive Fidelity

**Addresses:** B4 (Reliable Channel Issues), B2 (Bandwidth)
**Effort:** High (1-2 days)
**Savings:** Reduces bandwidth under poor conditions; prevents connection collapse.

Estimate connection quality using:
- Message round-trip time (embed timestamps in input/state messages)
- Observed message delivery rate vs. expected rate
- Jitter (variance in inter-message arrival time)

When quality degrades:
1. Reduce state send rate (20 Hz -> 10 Hz)
2. Reduce entity fidelity (skip visual-only fields)
3. Increase interpolation buffer
4. Show connection quality indicator to players

**Trade-offs:** Adds complexity. Quality estimation on WebRTC is inherently noisy. Adaptive behavior can cause oscillation if thresholds are not well-tuned.

---

### Tier 4 — Future / Research

#### R13: Deterministic Spell Simulation Verification

**Addresses:** B10 (Spell Drift), reduces state message size
**Effort:** Very High (research-grade)
**Savings:** Could eliminate spell data from state messages entirely (~40% of payload).

If the guest runs the same deterministic spell physics as the host, spells only need to be sent once at spawn. The guest simulates them locally. Periodically, the host sends a checksum of spell state; if the guest's checksum diverges, it requests a full spell state correction.

**Requirements:** Fully deterministic physics (no `Math.random()` in spell updates), identical floating-point behavior across browsers, and a robust checksum comparison mechanism.

**Trade-offs:** JavaScript floating-point is not guaranteed deterministic across browsers/platforms. `Math.random()` is used in particle generation but not in core spell physics, so this may be partially feasible. The high implementation cost makes this a research item.

#### R14: Ack/Nack System for Visual Effects Delivery

**Addresses:** B6 (Visual Effects Lost)
**Effort:** Medium-High (4-6 hours)
**Savings:** No bandwidth savings; ensures visual parity between host and guest.

Instead of fire-and-forget FX events, assign each FX event a sequence number. The guest acknowledges received sequences. The host retains unacknowledged events and resends them in subsequent state messages until acknowledged.

**Implementation:** Add a `fxSeq` counter on the host. Each FX event gets a sequence number. The guest sends `lastFxSeq` in its input messages. The host includes all events with `seq > lastAckedSeq` in each state message.

**Trade-offs:** Adds ~2 bytes per input message and slight complexity. FX events are cosmetic, so the impact of lost events is purely visual. The reliable channel already prevents most losses; this is insurance against edge cases (connection hiccups, tab suspension).

---

## 7. Conclusion

The networking architecture of Wizard Crawl is well-designed at the transport level. PeerJS/WebRTC provides low-latency peer-to-peer communication, and the host-authoritative model ensures game state consistency. The guest's client-side prediction with threshold-based correction provides responsive gameplay despite network latency.

**The bottlenecks are application-layer.** Every identified issue relates to how data is structured, serialized, and matched — not to the underlying transport. This is favorable because application-layer optimizations are entirely within the project's control and require no changes to dependencies.

### Optimization Impact Summary

| Tier | Recommendations | Effort | Bandwidth Reduction |
|------|----------------|--------|-------------------|
| **Tier 1** | R1-R4 | 1-2 days total | 30-40% |
| **Tier 2** | R5-R8 | 3-5 days total | Additional 50-60% (with delta encoding) |
| **Tier 3** | R9-R12 | 1-2 weeks total | Additional 20-40% |
| **Tier 4** | R13-R14 | Research | Speculative |

**Current bandwidth:** 80-200 KB/s depending on wave.

**After Tier 1:** ~50-130 KB/s (quick wins, no architectural changes).

**After Tier 1+2:** ~15-40 KB/s (with delta encoding — the single highest-impact change).

**After all tiers:** ~8-20 KB/s (diminishing returns; binary encoding and spatial culling compound with deltas).

### Recommended Approach

1. **Implement R1 (enemy IDs) first.** It is the foundation for R3, R5, and R9. It also immediately eliminates the O(n^2) matching bottleneck with minimal risk.
2. **Add R7 (bandwidth profiling) early.** Measurement enables data-driven decisions for subsequent optimizations.
3. **Proceed through Tier 1, then evaluate Tier 2** based on profiling data. R5 (delta encoding) is the highest-impact single change but requires careful implementation.
4. **Tier 3 and 4 are optional** — pursue only if bandwidth targets are not met after Tier 1+2, or if targeting mobile/low-bandwidth scenarios.

The transport layer does not need to change. WebRTC data channels are the right choice for this use case, and PeerJS provides a clean abstraction. All optimization effort should focus on the application layer.
