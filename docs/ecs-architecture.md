# ECS Architecture Specification

## Overview

The wizard-duel game currently uses a monolithic entity model: `Player` has 60+ fields, `Enemy` has 30+, and `Spell` has 20+. Game logic lives in large system files (`combat.ts` at 1,300+ lines, `waves.ts` at 320+ lines) that iterate flat arrays with O(n^2) collision detection. Dead entities stay in arrays (`alive=false`) causing wasted iteration. Class-specific logic is scattered across if/else chains that check `clsKey` or individual upgrade flags.

An Entity Component System (ECS) solves these problems:

1. **Collision performance**: A spatial grid reduces O(n^2) pair checks to ~O(n) for uniformly distributed entities. In late waves (100+ enemies, 50+ spells), this is the single largest performance win.

2. **Cache efficiency**: Dense component arrays (e.g., all `Position` values contiguous in memory) improve iteration speed for hot-path systems like movement and collision. TypeScript/V8 benefits from predictable object shapes in typed arrays.

3. **Entity composition flexibility**: New entity types (turrets, traps, summons) are composed from existing components without new interfaces. The necromancer's friendly summons currently require `_friendly`, `_owner`, `_lifespan` hacks on the Enemy interface -- with ECS, a summon is just an entity with `EnemyAI` + `TeamTag { friendly: true }` + `Lifetime`.

4. **Clean entity lifecycle**: Entities are despawned by ID rather than spliced from arrays. No more `alive=false` zombies or reverse-index iteration (`for (let i = arr.length - 1; i >= 0; i--)`).

5. **System isolation**: Each system declares exactly which components it reads/writes, making dependencies explicit. Currently `updateSpells()` in `waves.ts` directly mutates enemy positions (gravity well), enemy health (damageEnemy), and player HP (drain) -- all of which should be separate system concerns.

---

## Core Framework

### Entity

An entity is a numeric ID. Nothing more.

```typescript
// src/ecs/entity.ts
export type EntityId = number;

let nextId: EntityId = 1;

export function createEntityId(): EntityId {
  return nextId++;
}

export function resetEntityIds(start: EntityId = 1): void {
  nextId = start;
}
```

Entity IDs are monotonically increasing u32 values. They are never reused within a session. The current codebase already uses monotonic IDs for enemies (`state._nextEnemyId` in `state.ts:141`), so this is a natural extension.

### ComponentStore\<T\>

Each component type has its own store. The store maps `EntityId -> T` using a sparse-set pattern for O(1) add/remove/lookup with dense iteration.

```typescript
// src/ecs/component-store.ts
import { EntityId } from './entity';

export class ComponentStore<T> {
  /** Dense array of component values */
  private dense: T[] = [];
  /** Dense array of entity IDs (parallel to dense[]) */
  private entities: EntityId[] = [];
  /** Sparse map: entityId -> index in dense array. -1 or undefined = absent. */
  private sparse: Map<EntityId, number> = new Map();

  /** Number of entities with this component */
  get length(): number {
    return this.dense.length;
  }

  /** Add or overwrite a component value for an entity */
  set(id: EntityId, value: T): void {
    const idx = this.sparse.get(id);
    if (idx !== undefined) {
      this.dense[idx] = value;
    } else {
      this.sparse.set(id, this.dense.length);
      this.dense.push(value);
      this.entities.push(id);
    }
  }

  /** Get the component value, or undefined if absent */
  get(id: EntityId): T | undefined {
    const idx = this.sparse.get(id);
    return idx !== undefined ? this.dense[idx] : undefined;
  }

  /** Check if entity has this component */
  has(id: EntityId): boolean {
    return this.sparse.has(id);
  }

  /** Remove a component from an entity (swap-remove for O(1)) */
  remove(id: EntityId): boolean {
    const idx = this.sparse.get(id);
    if (idx === undefined) return false;

    const lastIdx = this.dense.length - 1;
    if (idx !== lastIdx) {
      // Swap last element into removed slot
      const lastEntity = this.entities[lastIdx];
      this.dense[idx] = this.dense[lastIdx];
      this.entities[idx] = lastEntity;
      this.sparse.set(lastEntity, idx);
    }
    this.dense.pop();
    this.entities.pop();
    this.sparse.delete(id);
    return true;
  }

  /** Iterate all (entityId, value) pairs. Dense iteration = cache-friendly. */
  *[Symbol.iterator](): Iterator<[EntityId, T]> {
    for (let i = 0; i < this.dense.length; i++) {
      yield [this.entities[i], this.dense[i]];
    }
  }

  /** Get the dense arrays directly for performance-critical iteration */
  raw(): { entities: readonly EntityId[]; values: readonly T[] } {
    return { entities: this.entities, values: this.dense };
  }

  /** Remove all entries */
  clear(): void {
    this.dense.length = 0;
    this.entities.length = 0;
    this.sparse.clear();
  }
}
```

Why sparse-set over `Map<EntityId, T>`:
- Dense iteration over `values[]` is cache-friendly (V8 can optimize typed iteration)
- O(1) add/remove/lookup (same as Map)
- Parallel `entities[]` array enables efficient joins in queries

### System Interface

```typescript
// src/ecs/system.ts
import { World } from './world';

export interface System {
  /** Human-readable name for the profiler (F3 overlay) */
  readonly name: string;

  /** Called every frame with the world and delta time */
  update(world: World, dt: number): void;
}
```

Systems are executed in a fixed order defined by the World. Each system declares its component dependencies through the queries it makes, not through metadata -- this keeps the API simple and avoids a registration ceremony.

### World

The World is the central registry that owns all component stores, manages entity lifecycles, and runs systems.

```typescript
// src/ecs/world.ts
import { EntityId, createEntityId } from './entity';
import { ComponentStore } from './component-store';
import { System } from './system';
import { SpatialGrid } from './spatial-grid';

/** Component type identifier -- used as key for store lookup */
export type ComponentType<T> = { new(): T } | { readonly __brand: symbol };

/** Map from component type to its store */
type StoreMap = Map<ComponentType<any>, ComponentStore<any>>;

export class World {
  private stores: StoreMap = new Map();
  private systems: System[] = [];
  private alive: Set<EntityId> = new Set();
  private despawnQueue: EntityId[] = [];

  /** Spatial grid for collision broadphase */
  readonly grid: SpatialGrid;

  /** Global/singleton state (phase, wave, gold, etc.) */
  globals: Record<string, any> = {};

  constructor(gridCellSize: number = 128) {
    this.grid = new SpatialGrid(gridCellSize);
  }

  // ── Entity lifecycle ──

  /** Create a new entity and return its ID */
  spawn(...components: [ComponentType<any>, any][]): EntityId {
    const id = createEntityId();
    this.alive.add(id);
    for (const [type, value] of components) {
      this.store(type).set(id, value);
    }
    return id;
  }

  /** Mark an entity for removal (processed at end of frame by CleanupSystem) */
  despawn(id: EntityId): void {
    this.despawnQueue.push(id);
  }

  /** Immediately remove an entity from all stores */
  private removeEntity(id: EntityId): void {
    this.alive.delete(id);
    for (const store of this.stores.values()) {
      store.remove(id);
    }
  }

  /** Process all queued despawns. Called by CleanupSystem at end of frame. */
  flushDespawns(): void {
    for (const id of this.despawnQueue) {
      this.removeEntity(id);
    }
    this.despawnQueue.length = 0;
  }

  /** Check if entity is alive */
  isAlive(id: EntityId): boolean {
    return this.alive.has(id);
  }

  /** Total number of living entities */
  get entityCount(): number {
    return this.alive.size;
  }

  // ── Component access ──

  /** Get or create the store for a component type */
  store<T>(type: ComponentType<T>): ComponentStore<T> {
    let s = this.stores.get(type);
    if (!s) {
      s = new ComponentStore<T>();
      this.stores.set(type, s);
    }
    return s as ComponentStore<T>;
  }

  /** Shorthand: get a single component value */
  get<T>(id: EntityId, type: ComponentType<T>): T | undefined {
    return this.store(type).get(id);
  }

  /** Shorthand: set a single component value */
  set<T>(id: EntityId, type: ComponentType<T>, value: T): void {
    this.store(type).set(id, value);
  }

  /** Shorthand: check if entity has a component */
  has(id: EntityId, type: ComponentType<T>): boolean {
    return this.store(type).has(id);
  }

  // ── Queries ──

  /**
   * Query entities that have ALL specified component types.
   * Returns an iterator of [EntityId, ...component values].
   *
   * Implementation: iterates the smallest store, checks membership in others.
   * For hot paths, systems should cache the smallest store and iterate raw().
   */
  *query<A>(a: ComponentType<A>): Generator<[EntityId, A]>;
  *query<A, B>(a: ComponentType<A>, b: ComponentType<B>): Generator<[EntityId, A, B]>;
  *query<A, B, C>(a: ComponentType<A>, b: ComponentType<B>, c: ComponentType<C>): Generator<[EntityId, A, B, C]>;
  *query(...types: ComponentType<any>[]): Generator<[EntityId, ...any[]]> {
    if (types.length === 0) return;

    // Find smallest store to iterate
    const stores = types.map(t => this.store(t));
    let smallest = stores[0];
    let smallestIdx = 0;
    for (let i = 1; i < stores.length; i++) {
      if (stores[i].length < smallest.length) {
        smallest = stores[i];
        smallestIdx = i;
      }
    }

    const { entities, values } = smallest.raw();
    for (let i = 0; i < entities.length; i++) {
      const id = entities[i];
      const result: [EntityId, ...any[]] = [id] as any;
      let hasAll = true;

      for (let j = 0; j < stores.length; j++) {
        if (j === smallestIdx) {
          result.push(values[i]);
        } else {
          const val = stores[j].get(id);
          if (val === undefined) { hasAll = false; break; }
          result.push(val);
        }
      }

      if (hasAll) yield result;
    }
  }

  // ── System management ──

  /** Add a system to the execution pipeline */
  addSystem(system: System): void {
    this.systems.push(system);
  }

  /** Run all systems in order */
  update(dt: number): void {
    for (const system of this.systems) {
      system.update(this, dt);
    }
  }
}
```

---

## Component Definitions

Each component is a plain object (struct-of-fields). Components are data-only -- no methods, no inheritance. Component types are identified by class constructors used as keys.

### Position

Replaces `x`, `y` on Player, Enemy, Spell, Particle, Trail, Shockwave, FloatingText, Beam, Zone, AoeMarker, EnemyProjectile, Pillar, Pickup.

```typescript
export class Position {
  x: number = 0;
  y: number = 0;
}
```

### Velocity

Replaces `vx`, `vy` on Player, Enemy, Spell, Particle, EnemyProjectile.

```typescript
export class Velocity {
  vx: number = 0;
  vy: number = 0;
}
```

### Health

Replaces `hp`, `maxHp`, `iframes` on Player and Enemy. Replaces `alive` flag -- entities with Health where `hp <= 0` are marked for despawn.

```typescript
export class Health {
  hp: number = 0;
  maxHp: number = 0;
  iframes: number = 0;
}
```

### Mana

Player-only. Replaces `mana`, `maxMana`, `manaRegen` on Player.

```typescript
export class Mana {
  mana: number = 0;
  maxMana: number = 0;
  regen: number = 0;
}
```

### Collider

Collision shape and filtering. Replaces the implicit `radius` fields and the hardcoded `ENEMIES[e.type].size` lookups in `waves.ts:145`.

```typescript
export const enum CollisionLayer {
  Player       = 1 << 0,  // 0x01
  Enemy        = 1 << 1,  // 0x02
  PlayerSpell  = 1 << 2,  // 0x04
  EnemyProj    = 1 << 3,  // 0x08
  Pickup       = 1 << 4,  // 0x10
  Pillar       = 1 << 5,  // 0x20
  Zone         = 1 << 6,  // 0x40
}

export class Collider {
  radius: number = 0;
  layer: CollisionLayer = 0;
  /** Bitmask of layers this collider can interact with */
  mask: CollisionLayer = 0;
}
```

Layer/mask filtering eliminates the current pattern of "iterate all enemies, skip dead ones, check distance" -- the collision system only checks pairs whose layers match.

### Render

Visual representation. Replaces color/size/flash fields scattered across entity types.

```typescript
export const enum RenderShape {
  Circle,
  Rect,
  Beam,
  Text,
  Shockwave,
  Zone,
  AoeMarker,
  Trail,
}

export class Render {
  shape: RenderShape = RenderShape.Circle;
  color: string = '#ffffff';
  size: number = 0;
  alpha: number = 1;
  /** Trail color (for spells that leave trails) */
  trailColor: string = '';
}
```

### Movement

Movement modifiers. Replaces `moveSpeed`, `slowTimer`, `stunTimer` on Player and Enemy.

```typescript
export class Movement {
  speed: number = 0;
  slowTimer: number = 0;
  stunTimer: number = 0;
}
```

### SpellData

Spell behavior data. Replaces the `Spell` interface fields that describe behavior (homing, pierce, explode, etc.).

```typescript
export class SpellData {
  type: string = '';
  dmg: number = 0;
  homing: number = 0;
  pierce: number = 0;
  pierceLeft: number = 0;
  explode: number = 0;
  burn: number = 0;
  slow: number = 0;
  drain: number = 0;
  stun: number = 0;
  zap: number = 0;
  zapRate: number = 0;
  zapTimer: number = 0;
  clsKey: string = '';
  reversed: boolean = false;
  bounces: number = 0;
}
```

### EnemyAIData

AI behavior. Replaces `target`, `atkTimer`, `_spdMul`, `_dmgMul`, and AI-type fields on Enemy. The current `EnemyAI` enum (`Chase`, `Ranged`) maps directly to AI behavior selection within the system.

```typescript
export class EnemyAIData {
  aiType: string = 'chase';       // 'chase' | 'ranged'
  enemyType: string = '';         // key into ENEMIES constant
  target: number = 0;             // player index
  atkTimer: number = 0;
  atkAnim: number = 0;
  spdMul: number = 1;
  dmgMul: number = 1;
  teleportTimer: number = 0;
  // Boss mechanics
  dmgReductionActive: boolean = false;
  dmgReductionTimer: number = 0;
  dmgReductionTriggered: boolean = false;
  elite: boolean = false;
}
```

### PlayerInput

Input state. Replaces the `PlayerInput` interface in `types.ts:521-530` and the `keys`/`mouseX`/`mouseY` fields on GameState.

```typescript
export class PlayerInputData {
  angle: number = 0;
  mx: number = 0;       // movement X axis (-1..1)
  my: number = 0;       // movement Y axis (-1..1)
  shoot: boolean = false;
  shoot2: boolean = false;
  ability: boolean = false;
  ult: boolean = false;
  dash: boolean = false;
}
```

### Cooldowns

Ability cooldowns. Replaces `cd[]`, `ultCharge`, `ultReady` on Player.

```typescript
export class Cooldowns {
  cd: number[] = [];
  ultCharge: number = 0;
  ultReady: boolean = false;
}
```

### StatusEffects

Damage-over-time and crowd control. Replaces `_burnTimer`, `_burnTick`, `_burnOwner`, `slowTimer`, `stunTimer` on Enemy. Players use the `Movement` component for slow/stun.

```typescript
export class StatusEffects {
  burnTimer: number = 0;
  burnTick: number = 0;
  burnOwner: number = 0;     // EntityId of the player who applied the burn
  slowTimer: number = 0;
  stunTimer: number = 0;
}
```

### NetworkSync

Network interpolation state. Replaces `_targetX`, `_targetY`, `_prevX`, `_prevY`, `_lerpT`, `_serverVx`, `_serverVy` on Player and Enemy.

```typescript
export class NetworkSync {
  targetX: number = 0;
  targetY: number = 0;
  prevX: number = 0;
  prevY: number = 0;
  lerpT: number = 0;
  serverVx: number = 0;
  serverVy: number = 0;
}
```

### Lifetime

Auto-despawn after duration. Replaces `life`/`age` on Spell, `life` on Particle/Trail, `duration`/`age` on Zone/Shockwave, `_lifespan` on friendly enemies.

```typescript
export class Lifetime {
  age: number = 0;
  maxLife: number = 0;
}
```

### Upgrades

Upgrade-modified stats. Replaces the 50+ upgrade fields on Player (`vampirism`, `pierce`, `armor`, `critChance`, etc.). Uses a flat struct for the hot-path numeric modifiers and a Map for tracking taken upgrade IDs.

```typescript
export class Upgrades {
  takenUpgrades: Map<number, number> = new Map();

  // Numeric modifiers (hot path -- accessed during combat calculations)
  vampirism: number = 0;
  pierce: number = 0;
  armor: number = 0;
  critChance: number = 0;
  critMul: number = 1;
  splitShot: number = 0;
  ricochet: number = 0;
  chainHit: number = 0;
  doubleTap: number = 0;
  manaOnKill: number = 0;
  manaOnHit: number = 0;
  lifeSteal: number = 0;
  secondWind: number = 0;
  thorns: number = 0;
  dodgeChance: number = 0;
  hpRegen: number = 0;
  magnetRange: number = 0;
  goldMul: number = 1;
  xpBoost: number = 0;
  damageTakenMul: number = 1;
  selfDmgChance: number = 0;

  // Boolean flags
  overkill: boolean = false;
  killResetCD: boolean = false;
  chainFullDmg: boolean = false;
  hasDash: boolean = false;
  momentum: boolean = false;
  aftershock: boolean = false;
  chaosDmg: boolean = false;
  selfDmg: boolean = false;
  boomerang: boolean = false;
  volatile: boolean = false;
  forkOnKill: boolean = false;
  gravityWell: boolean = false;
  spectral: boolean = false;
  frozenTouch: boolean = false;
  seekerMines: boolean = false;
  burstFire: boolean = false;

  // Class-specific upgrade flags
  burnSpread: boolean = false;
  magmaArmor: boolean = false;
  fireZoneOnExplode: boolean = false;
  shatter: boolean = false;
  permafrost: boolean = false;
  iceArmor: boolean = false;
  chainLightning: number = 0;
  overcharge: boolean = false;
  stormShield: boolean = false;
  blinkExplode: boolean = false;
  spellMirror: number = 0;
  raiseDead: number = 0;
  deathMark: boolean = false;
  soulWell: boolean = false;
  timeLoop: number = 0;
  hasteZone: boolean = false;
  temporalEcho: boolean = false;
  shieldBounce: number = 0;
  tauntAura: boolean = false;
  bloodlust: boolean = false;
  undyingRage: number = 0;
  reflectShield: boolean = false;
  resurrection: boolean = false;
  packLeader: boolean = false;
  overgrowthHeal: boolean = false;
  barkSkinRegen: boolean = false;
  soulSiphon: boolean = false;
  demonicPact: boolean = false;
  hexChain: number = 0;
  zenMana: boolean = false;
  turretArmy: boolean = false;
  laserTurret: boolean = false;
  turretExplode: boolean = false;

  // Internal stacking accumulators
  _hyperAcc: Record<string, number> = {};
  _baseSpellDmg: number[] = [];
}
```

Note: The Upgrades component intentionally mirrors the current Player fields 1:1. A future refactor could split class-specific flags into a `ClassUpgrades` component, but for migration safety, keeping a single component reduces the risk of missed field transfers.

### Animation

Visual state for rendering. Replaces `_animCastFlash`, `_animHitFlash`, `_animDeathFade`, `_animMoving`, `_animUltTimer`, `respawnTimer` on Player, and `_hitFlash`, `_deathTimer`, `_atkAnim` on Enemy.

```typescript
export class Animation {
  castFlash: number = 0;
  hitFlash: number = 0;
  deathTimer: number = -1;    // -1 = alive, positive = dying
  moving: boolean = false;
  ultTimer: number = 0;
  respawnTimer: number = 0;
}
```

### TeamTag

Ownership and allegiance. Replaces `owner` on Spell/Zone/AoeMarker and `_friendly`/`_owner` on Enemy.

```typescript
export class TeamTag {
  owner: number = 0;       // player index or EntityId of creator
  friendly: boolean = true; // true = ally, false = hostile
}
```

### PlayerIdentity

Player-specific metadata that does not fit other components. Replaces `idx`, `cls`, `clsKey`, `hitCounter`, `killCount`, `xp`, `xpToNext`, `level` on Player.

```typescript
export class PlayerIdentity {
  idx: number = 0;
  clsKey: string = '';
  cls: any = null;            // ClassDef reference
  hitCounter: number = 0;
  killCount: number = 0;
  xp: number = 0;
  xpToNext: number = 0;
  level: number = 0;
}
```

### ClassAbilities

Class-specific internal timers. Replaces the `_snapTimer`, `_rewindSnap`, `_hasteBonus`, `_furyActive`, `_auraTick`, `_timeStopTimer`, `_rage`, `_rageDmgMul`, `_shieldWall`, `_holyShield`, `_stormTimer`, `_bloodlustStacks` fields on Player.

```typescript
export class ClassAbilities {
  snapTimer: number = 0;
  rewindSnap: { hp: number; mana: number } | null = null;
  hasteBonus: boolean = false;
  furyActive: boolean = false;
  auraTick: number = 0;
  timeStopTimer: number = 0;
  rage: number = 0;
  rageDmgMul: number = 1;
  shieldWall: number = 0;
  holyShield: number = 0;
  stormTimer: number = 0;
  bloodlustStacks: number = 0;
  dashCd: number = 0;
}
```

### SecondaryUpgrades

Replaces `doubleSecondary`, `comboBonus`, and ultimate upgrade fields on Player.

```typescript
export class SecondaryUpgrades {
  doubleSecondary: number = 0;
  comboBonus: boolean = false;
  ultChargeRate: number = 1;
  ultPower: number = 1;
  ultOverflow: boolean = false;
  ultEcho: number = 0;
  ultEchoLeft: number = 0;
  ultHeal: boolean = false;
  ultResetCDs: boolean = false;
  // Cross-spell synergies
  spellWeaving: boolean = false;
  spellWeaveStack: number = 0;
  lastSpellSlot: number = -1;
  cdCascade: boolean = false;
  fullRotation: boolean = false;
  fullRotationTimer: number = 0;
  fullRotationSpells: number = 0;
  fullRotationBuff: number = 0;
}
```

---

## Entity Archetypes

Archetypes define the standard component bundles for each entity type. They serve as spawn templates.

### PlayerArchetype

Components: `Position`, `Velocity`, `Health`, `Mana`, `Collider`, `Render`, `Movement`, `PlayerInputData`, `Cooldowns`, `Upgrades`, `SecondaryUpgrades`, `ClassAbilities`, `Animation`, `NetworkSync`, `TeamTag`, `PlayerIdentity`

```typescript
export function spawnPlayer(world: World, idx: number, cls: ClassDef, x: number, y: number): EntityId {
  return world.spawn(
    [Position,       { x, y }],
    [Velocity,       { vx: 0, vy: 0 }],
    [Health,         { hp: WIZARD_HP, maxHp: WIZARD_HP, iframes: 0 }],
    [Mana,           { mana: MAX_MANA, maxMana: MAX_MANA, regen: MANA_REGEN }],
    [Collider,       { radius: WIZARD_SIZE, layer: CollisionLayer.Player, mask: CollisionLayer.Enemy | CollisionLayer.EnemyProj | CollisionLayer.Pickup }],
    [Render,         { shape: RenderShape.Circle, color: cls.color, size: WIZARD_SIZE }],
    [Movement,       { speed: DEFAULT_MOVE_SPEED, slowTimer: 0, stunTimer: 0 }],
    [PlayerInputData, new PlayerInputData()],
    [Cooldowns,      { cd: cls.spells.map(() => 0), ultCharge: 0, ultReady: false }],
    [Upgrades,       new Upgrades()],
    [SecondaryUpgrades, new SecondaryUpgrades()],
    [ClassAbilities, new ClassAbilities()],
    [Animation,      new Animation()],
    [NetworkSync,    new NetworkSync()],
    [TeamTag,        { owner: idx, friendly: true }],
    [PlayerIdentity, { idx, clsKey: cls.key, cls, hitCounter: 0, killCount: 0, xp: 0, xpToNext: getXpStep(1), level: 1 }],
  );
}
```

### EnemyArchetype

Components: `Position`, `Velocity`, `Health`, `Collider`, `Render`, `Movement`, `EnemyAIData`, `StatusEffects`, `Animation`, `NetworkSync`, `TeamTag`

```typescript
export function spawnEnemyEntity(world: World, type: string, x: number, y: number, hpScale: number, spdMul: number): EntityId {
  const def = ENEMIES[type];
  return world.spawn(
    [Position,      { x, y }],
    [Velocity,      { vx: 0, vy: 0 }],
    [Health,        { hp: def.hp * hpScale, maxHp: def.hp * hpScale, iframes: 0 }],
    [Collider,      { radius: def.size, layer: CollisionLayer.Enemy, mask: CollisionLayer.PlayerSpell | CollisionLayer.Player }],
    [Render,        { shape: RenderShape.Circle, color: def.color, size: def.size }],
    [Movement,      { speed: def.speed, slowTimer: 0, stunTimer: 0 }],
    [EnemyAIData,   { aiType: def.ai, enemyType: type, target: 0, atkTimer: 0, atkAnim: 0, spdMul, dmgMul: 1, teleportTimer: 0, elite: false, dmgReductionActive: false, dmgReductionTimer: 0, dmgReductionTriggered: false }],
    [StatusEffects, new StatusEffects()],
    [Animation,     new Animation()],
    [NetworkSync,   new NetworkSync()],
    [TeamTag,       { owner: -1, friendly: false }],
  );
}
```

### SpellArchetype

Components: `Position`, `Velocity`, `Collider`, `Render`, `SpellData`, `Lifetime`, `TeamTag`

```typescript
export function spawnSpellEntity(world: World, def: SpellDef, x: number, y: number, vx: number, vy: number, owner: number, clsKey: string): EntityId {
  return world.spawn(
    [Position,  { x, y }],
    [Velocity,  { vx, vy }],
    [Collider,  { radius: def.radius, layer: CollisionLayer.PlayerSpell, mask: CollisionLayer.Enemy | CollisionLayer.Pillar }],
    [Render,    { shape: RenderShape.Circle, color: def.color, size: def.radius, trailColor: def.trail }],
    [SpellData, { type: def.type, dmg: def.dmg, homing: def.homing || 0, pierce: def.pierce || 0, pierceLeft: def.pierce || 0, explode: def.explode || 0, burn: def.burn || 0, slow: def.slow || 0, drain: def.drain || 0, stun: def.stun || 0, zap: def.zap || 0, zapRate: def.zapRate || 0, zapTimer: 0, clsKey, reversed: false, bounces: 0 }],
    [Lifetime,  { age: 0, maxLife: def.life }],
    [TeamTag,   { owner, friendly: true }],
  );
}
```

### PickupArchetype

Components: `Position`, `Collider`, `Render`, `Lifetime`

Pickups do not have Velocity (they are static). They use Collider for player proximity detection. The current `collected` flag is replaced by despawning the entity.

```typescript
export function spawnPickupEntity(world: World, x: number, y: number, type: PickupType, value: number): EntityId {
  return world.spawn(
    [Position, { x, y }],
    [Collider, { radius: 12, layer: CollisionLayer.Pickup, mask: CollisionLayer.Player }],
    [Render,   { shape: RenderShape.Circle, color: pickupColor(type), size: 8 }],
    [Lifetime, { age: 0, maxLife: 30 }],  // pickups despawn after 30s
    [TeamTag,  { owner: -1, friendly: true }],
  );
}
```

### ParticleArchetype

Components: `Position`, `Velocity`, `Render`, `Lifetime`

```typescript
export function spawnParticleEntity(world: World, x: number, y: number, color: string, life: number = 1): EntityId {
  const angle = Math.random() * Math.PI * 2;
  const speed = 30 + Math.random() * 80;
  return world.spawn(
    [Position, { x, y }],
    [Velocity, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }],
    [Render,   { shape: RenderShape.Circle, color, size: 1 + Math.random() * 2, alpha: 1 }],
    [Lifetime, { age: 0, maxLife: life }],
  );
}
```

### Other Archetypes

| Entity Type     | Components                                                |
| --------------- | --------------------------------------------------------- |
| Trail           | Position, Render, Lifetime                                |
| Shockwave       | Position, Render, Lifetime (radius animated in RenderSystem) |
| FloatingText    | Position, Velocity, Render, Lifetime                      |
| Beam            | Position, Render, Lifetime (angle/range stored in Render) |
| Zone            | Position, Collider, Render, Lifetime, TeamTag, ZoneData   |
| AoeMarker       | Position, Collider, Render, Lifetime, TeamTag, AoeData    |
| EnemyProjectile | Position, Velocity, Collider, Render, Lifetime, TeamTag   |
| Pillar          | Position, Collider, Render                                |
| FriendlySummon  | Same as EnemyArchetype + Lifetime, with TeamTag.friendly=true |

Zone and AoeMarker need small additional components for their unique fields:

```typescript
export class ZoneData {
  dmg: number = 0;
  slow: number = 0;
  tickRate: number = 0;
  tickTimer: number = 0;
  drain: number = 0;
  heal: number = 0;
  pull: number = 0;
  freezeAfter: number = 0;
  isTurret: boolean = false;
  isMegaTurret: boolean = false;
}

export class AoeData {
  dmg: number = 0;
  delay: number = 0;
  stun: number = 0;
}
```

---

## System Definitions

Systems are listed in execution order. This order matches the current `loop()` function in `main.ts:222-242` with the addition of explicit cleanup and collision phases.

### 1. InputSystem

**Reads**: keyboard/mouse state (from globals)
**Writes**: `PlayerInputData`
**Replaces**: `getInput()` in `src/input.ts`

```typescript
class InputSystem implements System {
  readonly name = 'input';

  update(world: World, dt: number): void {
    for (const [id, input, identity] of world.query(PlayerInputData, PlayerIdentity)) {
      // Read raw input for this player index from globals
      const raw = world.globals.mode === NetworkMode.Guest && identity.idx !== world.globals.localIdx
        ? world.globals.remoteInput
        : readLocalInput(world.globals);
      Object.assign(input, raw);
    }
  }
}
```

### 2. MovementSystem

**Reads**: `Velocity`, `Movement`, `PlayerInputData` (optional)
**Writes**: `Position`
**Replaces**: Movement code in `updatePlayers()` (`physics.ts:80-100`) and enemy movement in `updateEnemies()` (`enemies.ts:57-58`)

```typescript
class MovementSystem implements System {
  readonly name = 'movement';

  update(world: World, dt: number): void {
    // Player movement: read input, apply speed + slow/stun
    for (const [id, pos, vel, mov, input] of world.query(Position, Velocity, Movement, PlayerInputData)) {
      if (mov.stunTimer > 0) { mov.stunTimer -= dt; continue; }
      const slow = mov.slowTimer > 0 ? WAVE_PHYSICS.SLOW_MOVE_MULT : 1;
      if (mov.slowTimer > 0) mov.slowTimer -= dt;

      const ms = mov.speed * slow;
      vel.vx = (input.mx || 0) * ms;
      vel.vy = (input.my || 0) * ms;
      const len = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
      if (len > ms) { vel.vx *= ms / len; vel.vy *= ms / len; }

      pos.x = clamp(pos.x + vel.vx * dt, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
      pos.y = clamp(pos.y + vel.vy * dt, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
    }

    // Generic velocity integration (spells, particles, enemy projectiles)
    for (const [id, pos, vel] of world.query(Position, Velocity)) {
      // Skip entities already handled above (have PlayerInputData)
      if (world.has(id, PlayerInputData)) continue;
      // Skip entities with Movement component handled by EnemyAISystem
      if (world.has(id, EnemyAIData)) continue;

      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
    }
  }
}
```

### 3. CooldownSystem

**Reads**: `Cooldowns`, `Mana`
**Writes**: `Cooldowns`, `Mana`
**Replaces**: Cooldown tick/mana regen in `updatePlayers()` (`physics.ts:170-195`)

```typescript
class CooldownSystem implements System {
  readonly name = 'cooldowns';

  update(world: World, dt: number): void {
    for (const [id, cd, mana] of world.query(Cooldowns, Mana)) {
      // Tick cooldowns
      for (let i = 0; i < cd.cd.length; i++) {
        if (cd.cd[i] > 0) cd.cd[i] -= dt;
      }
      // Mana regen
      mana.mana = Math.min(mana.maxMana, mana.mana + mana.regen * dt);
    }
  }
}
```

### 4. EnemyAISystem

**Reads**: `EnemyAIData`, `Position`, `Movement`, `StatusEffects`
**Writes**: `Velocity`, `Position`, `EnemyAIData`
**Replaces**: `updateEnemies()` in `enemies.ts`

The system handles chase AI, ranged AI, friendly summon behavior, and teleporter logic. Each AI type reads target player positions from the world.

```typescript
class EnemyAISystem implements System {
  readonly name = 'enemyAI';

  update(world: World, dt: number): void {
    for (const [id, ai, pos, vel, mov, status] of world.query(EnemyAIData, Position, Velocity, Movement, StatusEffects)) {
      // Skip stunned enemies
      if (mov.stunTimer > 0) { mov.stunTimer -= dt; continue; }
      if (mov.slowTimer > 0) mov.slowTimer -= dt;

      const def = ENEMIES[ai.enemyType];
      const slowMul = mov.slowTimer > 0 ? WAVE_PHYSICS.SLOW_MOVE_MULT : 1;
      const speed = mov.speed * ai.spdMul * slowMul;

      // Find target player position
      const targetPos = this.getTargetPosition(world, ai.target);
      if (!targetPos) continue;

      const dx = targetPos.x - pos.x;
      const dy = targetPos.y - pos.y;
      const dd = Math.max(1, Math.sqrt(dx * dx + dy * dy));

      if (ai.aiType === 'chase') {
        vel.vx = (dx / dd) * speed;
        vel.vy = (dy / dd) * speed;
        pos.x += vel.vx * dt;
        pos.y += vel.vy * dt;
      }
      // ... ranged, teleporter, etc.
    }
  }

  private getTargetPosition(world: World, targetIdx: number): Position | undefined {
    for (const [id, identity, pos] of world.query(PlayerIdentity, Position)) {
      if (identity.idx === targetIdx) return pos;
    }
    return undefined;
  }
}
```

### 5. SpellSystem

**Reads**: `SpellData`, `Position`, `Velocity`, `Lifetime`
**Writes**: `Position`, `Velocity`, `SpellData`
**Replaces**: `updateSpells()` in `waves.ts:11-242` (homing, boomerang, wall bounce, gravity well, zap aura)

This is the most complex system due to spell modifier interactions. Key logic extracted from `waves.ts`:

- **Homing** (lines 16-33): Queries enemies with Position, steers spell toward nearest
- **Boomerang** (lines 37-41): Reverses velocity at half lifetime
- **Wall bounce** (lines 48-58): Reflects off arena walls, uses ricochet upgrade count
- **Gravity well** (lines 61-71): Pulls nearby enemies (writes enemy Position)
- **Zap aura** (lines 79-128): Periodic damage to nearby enemies, chain lightning

The gravity well and zap interactions demonstrate why ECS is valuable: SpellSystem can query `[Position, EnemyAIData]` to find enemies near spells, rather than iterating `state.enemies` directly.

### 6. CollisionSystem

**Reads**: `Position`, `Collider`
**Writes**: Collision event queue (in World globals)
**Replaces**: The inline collision loops in `waves.ts:142-164`, `enemies.ts`, `physics.ts`

This is the highest-impact system for performance. See the Spatial Grid section below.

```typescript
interface CollisionEvent {
  entityA: EntityId;
  entityB: EntityId;
  layerA: CollisionLayer;
  layerB: CollisionLayer;
  distance: number;
}

class CollisionSystem implements System {
  readonly name = 'collision';

  update(world: World, dt: number): void {
    const grid = world.grid;
    grid.clear();

    // Insert all collidable entities
    for (const [id, pos, col] of world.query(Position, Collider)) {
      grid.insert(id, pos.x, pos.y, col.radius);
    }

    // Query pairs and check layer compatibility
    const events: CollisionEvent[] = [];
    const posStore = world.store(Position);
    const colStore = world.store(Collider);

    grid.queryPairs((idA: EntityId, idB: EntityId) => {
      const colA = colStore.get(idA)!;
      const colB = colStore.get(idB)!;

      // Layer/mask filter
      if (!(colA.layer & colB.mask) && !(colB.layer & colA.mask)) return;

      const posA = posStore.get(idA)!;
      const posB = posStore.get(idB)!;
      const dx = posA.x - posB.x;
      const dy = posA.y - posB.y;
      const distSq = dx * dx + dy * dy;
      const radiusSum = colA.radius + colB.radius;

      if (distSq < radiusSum * radiusSum) {
        events.push({
          entityA: idA,
          entityB: idB,
          layerA: colA.layer,
          layerB: colB.layer,
          distance: Math.sqrt(distSq),
        });
      }
    });

    world.globals.collisionEvents = events;
  }
}
```

### 7. DamageSystem

**Reads**: Collision events, `Health`, `SpellData`, `StatusEffects`, `Upgrades`
**Writes**: `Health`, `StatusEffects`, despawns spells
**Replaces**: `damageEnemy()` in `combat.ts:52-58`, spell-enemy collision in `waves.ts:142-164`

Processes collision events to apply damage, status effects, pierce, drain, and on-kill effects (vampirism, mana-on-kill, fork-on-kill, etc.).

### 8. StatusEffectSystem

**Reads**: `StatusEffects`
**Writes**: `StatusEffects`, `Health` (burn damage)
**Replaces**: Burn DOT logic in `enemies.ts:74-80`, burn spread logic in `combat.ts`

```typescript
class StatusEffectSystem implements System {
  readonly name = 'statusEffects';

  update(world: World, dt: number): void {
    for (const [id, status, health] of world.query(StatusEffects, Health)) {
      // Burn DOT
      if (status.burnTimer > 0) {
        status.burnTimer -= dt;
        status.burnTick -= dt;
        if (status.burnTick <= 0) {
          status.burnTick = TIMING.BURN_TICK;
          health.hp -= 1;  // DamageSystem handles kill logic
        }
      }
      // Slow/stun decay
      if (status.slowTimer > 0) status.slowTimer -= dt;
      if (status.stunTimer > 0) status.stunTimer -= dt;
    }
  }
}
```

### 9. LifetimeSystem

**Reads**: `Lifetime`
**Writes**: `Lifetime`, despawns expired entities
**Replaces**: `s.age > s.life` checks in `waves.ts:166`, particle/trail/zone age checks

```typescript
class LifetimeSystem implements System {
  readonly name = 'lifetime';

  update(world: World, dt: number): void {
    for (const [id, lt] of world.query(Lifetime)) {
      lt.age += dt;
      if (lt.age >= lt.maxLife) {
        world.despawn(id);
      }
    }
  }
}
```

### 10. WaveSystem

**Reads**: Global wave state
**Writes**: Spawns enemy entities
**Replaces**: `updateWaves()` in `dungeon.ts:56-77`, wave spawn queue logic

This system reads global state (wave number, spawn queue, timers) and calls `spawnEnemyEntity()` to create new enemies. It does not use component queries heavily -- it is event-driven (wave start/end triggers).

### 11. NetworkSyncSystem

**Reads**: `NetworkSync`, `Position`, `Velocity`
**Writes**: `Position`, `NetworkSync`
**Replaces**: Interpolation code in `main.ts:280-300`, `sendState()` in `network.ts:315-434`

Two sub-phases:
1. **Serialize** (host only): Iterates entities with `NetworkSync`, builds delta-compressed state message
2. **Interpolate** (guest only): Applies received state to `NetworkSync.target*` fields, lerps `Position` toward targets

### 12. RenderSystem

**Reads**: `Position`, `Render`, `Animation`
**Writes**: Canvas2D draw calls
**Replaces**: All rendering code in `src/rendering/draw-entities.ts`, `draw-effects.ts`

Not a traditional ECS "write" system -- it produces side effects (canvas draw calls). Queries entities by render shape and draws them. The F3 profiler overlay wraps this system's `update()` with `profiler.begin()`/`profiler.end()`.

### 13. CleanupSystem

**Reads**: despawn queue
**Writes**: removes entities from all stores
**Replaces**: `state.spells.splice(i, 1)` in `waves.ts:240`, `alive=false` checks everywhere

Must run last. Calls `world.flushDespawns()`.

```typescript
class CleanupSystem implements System {
  readonly name = 'cleanup';

  update(world: World, dt: number): void {
    world.flushDespawns();
  }
}
```

### 14. UpgradeSystem

**Reads**: `Upgrades`, `PlayerIdentity`, `Health`, `Mana`
**Writes**: `Upgrades`, modified spell definitions
**Replaces**: `apply()` callbacks in `UPGRADE_POOL` in `constants.ts`

This system is not a per-frame system -- it runs on-demand when a player picks an upgrade during the Upgrade phase. It applies the upgrade's stat modifications to the player's components.

### System Execution Order

```
1. InputSystem
2. MovementSystem
3. CooldownSystem
4. EnemyAISystem
5. SpellSystem
6. CollisionSystem     ← broadphase + narrowphase
7. DamageSystem        ← processes collision events
8. StatusEffectSystem
9. LifetimeSystem
10. WaveSystem
11. NetworkSyncSystem
12. RenderSystem
13. CleanupSystem
```

This mirrors the current `loop()` order in `main.ts:222-242`:
- `updatePlayers` -> InputSystem + MovementSystem + CooldownSystem
- `updateSpells` -> SpellSystem (part of collision handled separately)
- `updateAoe` -> LifetimeSystem + DamageSystem (AoE detonation)
- `updateZones` -> StatusEffectSystem + DamageSystem (zone ticks)
- `updateEnemies` -> EnemyAISystem + StatusEffectSystem
- `updateEProj` -> MovementSystem + LifetimeSystem
- `updateWaves` -> WaveSystem

---

## Spatial Grid

### Design

A uniform grid for collision broadphase. The arena is 1000x700 pixels (`ROOM_WIDTH` x `ROOM_HEIGHT` from `constants.ts:15-16`).

```typescript
// src/ecs/spatial-grid.ts
import { EntityId } from './entity';

export class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private cells: EntityId[][];

  constructor(cellSize: number = 128) {
    this.cellSize = cellSize;
    // Arena is 1000x700, so 128px cells = 8x6 grid = 48 cells
    this.cols = Math.ceil(ROOM_WIDTH / cellSize);
    this.rows = Math.ceil(ROOM_HEIGHT / cellSize);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = [];
    }
  }

  /** Clear all cells (call at start of each frame) */
  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].length = 0;
    }
  }

  /** Insert an entity into the grid */
  insert(id: EntityId, x: number, y: number, radius: number): void {
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        this.cells[r * this.cols + c].push(id);
      }
    }
  }

  /** Query all entities in the same cells as a point + radius */
  queryArea(x: number, y: number, radius: number): EntityId[] {
    const result: EntityId[] = [];
    const seen = new Set<EntityId>();

    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const id = cell[i];
          if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
          }
        }
      }
    }
    return result;
  }

  /** Iterate all unique pairs within the same cells.
   *  Callback receives (idA, idB) for each pair. */
  queryPairs(callback: (a: EntityId, b: EntityId) => void): void {
    const seen = new Set<number>();  // encode pair as a*MAX + b

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      for (let a = 0; a < cell.length; a++) {
        for (let b = a + 1; b < cell.length; b++) {
          const idA = cell[a];
          const idB = cell[b];
          const key = idA < idB ? idA * 0x100000 + idB : idB * 0x100000 + idA;
          if (!seen.has(key)) {
            seen.add(key);
            callback(idA, idB);
          }
        }
      }
    }
  }
}
```

### Cell Size Selection

- 128px cells: 8x6 = 48 cells. Good for the arena size (1000x700). Average entity density per cell is ~2-5 entities in normal waves, ~10-15 in dense late-game waves. The maximum collision radius is ~60px (boss enemies), so entities span at most 1-2 cells.
- 256px cells: 4x3 = 12 cells. Fewer cells but more entities per cell, reducing the benefit of spatial partitioning.
- 64px cells: 16x11 = 176 cells. More overhead per frame to clear/populate, diminishing returns for this entity count.

Recommendation: **128px**. For the typical 100-150 entity count in late waves, this reduces collision pair checks from ~10,000 (O(n^2)) to ~500-1000.

### Targeted Queries

The spatial grid also replaces the "find nearest enemy" pattern used by homing spells (`waves.ts:17-23`) and enemy AI target selection (`enemies.ts:47-51`). Instead of scanning all enemies:

```typescript
// Before (O(n))
for (const e of state.enemies) {
  if (!e.alive) continue;
  const d = dist(s.x, s.y, e.x, e.y);
  if (d < nd) { nd = d; nt = e; }
}

// After (O(k) where k = entities in nearby cells)
const nearby = world.grid.queryArea(pos.x, pos.y, 280);
for (const candidateId of nearby) {
  if (!world.has(candidateId, EnemyAIData)) continue;
  const ePos = world.get(candidateId, Position)!;
  const d = dist(pos.x, pos.y, ePos.x, ePos.y);
  if (d < nd) { nd = d; nearestId = candidateId; }
}
```

---

## World API Summary

```typescript
// Entity lifecycle
world.spawn(...components: [ComponentType, value][]) → EntityId
world.despawn(id: EntityId) → void          // queues for end-of-frame removal
world.isAlive(id: EntityId) → boolean
world.entityCount → number

// Component access
world.get<T>(id, Type) → T | undefined
world.set<T>(id, Type, value) → void
world.has(id, Type) → boolean
world.store<T>(Type) → ComponentStore<T>    // direct store access for hot paths

// Queries
world.query(A) → Iterator<[EntityId, A]>
world.query(A, B) → Iterator<[EntityId, A, B]>
world.query(A, B, C) → Iterator<[EntityId, A, B, C]>
// ... up to 6 component types

// Spatial
world.grid.insert(id, x, y, radius) → void
world.grid.queryArea(x, y, radius) → EntityId[]
world.grid.queryPairs(callback) → void
world.grid.clear() → void

// System management
world.addSystem(system: System) → void
world.update(dt: number) → void            // runs all systems in order

// Globals (non-ECS singleton state)
world.globals.gamePhase: GamePhase
world.globals.wave: number
world.globals.gold: number
world.globals.mode: NetworkMode
world.globals.localIdx: number
// etc. -- same fields as current GameState non-entity fields
```

---

## GameState Transition Mapping

### Entity Arrays -> ECS Entities

| Current (state.ts)         | ECS Equivalent                              |
| -------------------------- | ------------------------------------------- |
| `state.players[]`          | Entities with PlayerIdentity component       |
| `state.enemies[]`          | Entities with EnemyAIData component          |
| `state.spells[]`           | Entities with SpellData component            |
| `state.particles[]`        | Entities with Render + Lifetime (no Collider) |
| `state.trails[]`           | Entities with Render + Lifetime (Trail shape) |
| `state.shockwaves[]`       | Entities with Render + Lifetime (Shockwave)  |
| `state.texts[]`            | Entities with Render + Lifetime (Text shape) |
| `state.beams[]`            | Entities with Render + Lifetime (Beam shape) |
| `state.zones[]`            | Entities with ZoneData + Collider + Lifetime |
| `state.aoeMarkers[]`       | Entities with AoeData + Collider + Lifetime  |
| `state.eProj[]`            | Entities with Velocity + Collider + Lifetime |
| `state.pillars[]`          | Entities with Collider + Render (no Lifetime)|
| `state.pickups[]`          | Entities with Collider + Render + Lifetime   |

### Global State (remains as singletons in `world.globals`)

These fields do not belong to any single entity and remain as global/singleton state:

```typescript
// From GameState -- these stay in world.globals, not as components
interface GlobalState {
  // Screen
  width: number;
  height: number;

  // Mode
  mode: NetworkMode;
  gamePhase: GamePhase;
  localIdx: number;

  // Timing
  time: number;
  shakeIntensity: number;
  shakeX: number;
  shakeY: number;
  screenFlash: number;
  screenFlashColor: string;

  // Camera
  camX: number;
  camY: number;

  // Wave progress
  wave: number;
  waveActive: boolean;
  waveBreakTimer: number;
  waveEnemiesTotal: number;
  totalKills: number;
  gold: number;
  countdownTimer: number;

  // Wave spawn
  waveSpawnQueue: number;
  waveSpawnTimer: number;
  bossMinionQueue: number;
  bossMinionTimer: number;
  bossMinionInterval: number;

  // Combo
  comboCount: number;
  comboTimer: number;
  hitStop: number;

  // Network
  remoteInput: PlayerInput;
  netTimer: number;
  _lastNetTime: number;
  _netInterval: number;

  // Upgrade
  pendingUpgradeChoices: number[] | null;
  upgradePickedLocal: boolean;
  upgradePickedRemote: boolean;

  // Class selection
  selectedClassIndex: number;
  hostClassKey: string | null;
  guestClassKey: string | null;

  // Shop
  shopOpen: boolean;
  shopPurchases: Record<string, number>;
  shopTempDmg: number;
  shopShieldHits: number;

  // Synergy
  activeSynergy: any;
  synergyBannerTimer: number;

  // Lives
  lives: number;
  maxLives: number;

  // Network FX
  pendingFx: NetFxEvent[];

  // Collision events (written by CollisionSystem, read by DamageSystem)
  collisionEvents: CollisionEvent[];
}
```

### Input and Camera

- `state.keys`, `state.mouseX`, `state.mouseY`, `state.mouseDown`, `state.rightDown` remain as globals. The InputSystem reads these and writes to PlayerInputData components.
- Camera (`state.camX`, `state.camY`) remains global. It is derived from the local player's Position component each frame by the existing `updateCamera()` in `rendering/renderer.ts`.

---

## Performance Expectations

### Collision Detection

Current: `updateSpells()` iterates all spells x all enemies = O(spells * enemies). With 50 spells and 100 enemies, that is 5,000 distance checks per frame.

With spatial grid: Each spell checks only entities in its cell + adjacent cells. With 128px cells and uniform distribution across 48 cells, average entities per cell ~2. Each spell checks ~8-18 candidates instead of 100. Total: ~50 * 15 = 750 checks.

**Expected improvement: 5-7x reduction in collision checks**, most impactful during waves 10+ where entity counts peak.

### Entity Iteration

Current: Dead entities (`alive=false`) are iterated and skipped. In late waves, 30-50% of the enemy array can be dead entities waiting for `splice()`.

With ECS: Despawned entities are removed from component stores entirely. Dense iteration touches only living entities. No wasted iterations.

### Memory Layout

Current: Each Player/Enemy/Spell is a JS object with 20-60 properties. V8 may create hidden classes but cache behavior is unpredictable across mixed-shape objects.

With ECS: Component stores hold homogeneous typed values in dense arrays. Position values are contiguous in memory. V8 can optimize iteration over these arrays with inline caching.

---

## Integration with Profiler

The existing F3 performance profiler (`src/debug/`) wraps each system update call. In ECS, this maps directly:

```typescript
// In the game loop (main.ts)
for (const system of world.systems) {
  profiler.begin(system.name);
  system.update(world, dt);
  profiler.end(system.name);
}
```

The profiler labels (`updatePlayers`, `updateSpells`, `updateAoe`, `updateZones`, `updateEnemies`, `updateEProj`, `updateWaves`) from `main.ts:222-242` map to the new system names (`input`, `movement`, `cooldowns`, `enemyAI`, `spell`, `collision`, `damage`, `statusEffects`, `lifetime`, `wave`, `networkSync`, `render`, `cleanup`).
