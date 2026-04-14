import { EntityId, createEntityId } from './entity';
import { ComponentStore } from './component-store';
import { System } from './system';
import { SpatialGrid } from './spatial-grid';

export type ComponentType<T> = { new(): T } | { readonly __brand: symbol };

type StoreMap = Map<ComponentType<any>, ComponentStore<any>>;

export class World {
  private stores: StoreMap = new Map();
  private systems: System[] = [];
  private alive: Set<EntityId> = new Set();
  private despawnQueue: EntityId[] = [];

  readonly grid: SpatialGrid;
  globals: Record<string, any> = {};

  constructor(gridCellSize: number = 128) {
    this.grid = new SpatialGrid(gridCellSize);
  }

  spawn(...components: [ComponentType<any>, any][]): EntityId {
    const id = createEntityId();
    this.alive.add(id);
    for (const [type, value] of components) {
      this.store(type).set(id, value);
    }
    return id;
  }

  despawn(id: EntityId): void {
    this.despawnQueue.push(id);
  }

  private removeEntity(id: EntityId): void {
    this.alive.delete(id);
    for (const store of this.stores.values()) {
      store.remove(id);
    }
  }

  flushDespawns(): void {
    for (const id of this.despawnQueue) {
      this.removeEntity(id);
    }
    this.despawnQueue.length = 0;
  }

  isAlive(id: EntityId): boolean {
    return this.alive.has(id);
  }

  get entityCount(): number {
    return this.alive.size;
  }

  store<T>(type: ComponentType<T>): ComponentStore<T> {
    let s = this.stores.get(type);
    if (!s) {
      s = new ComponentStore<T>();
      this.stores.set(type, s);
    }
    return s as ComponentStore<T>;
  }

  get<T>(id: EntityId, type: ComponentType<T>): T | undefined {
    return this.store(type).get(id);
  }

  set<T>(id: EntityId, type: ComponentType<T>, value: T): void {
    this.store(type).set(id, value);
  }

  has(id: EntityId, type: ComponentType<any>): boolean {
    return this.store(type).has(id);
  }

  query<A>(a: ComponentType<A>): Generator<[EntityId, A]>;
  query<A, B>(a: ComponentType<A>, b: ComponentType<B>): Generator<[EntityId, A, B]>;
  query<A, B, C>(a: ComponentType<A>, b: ComponentType<B>, c: ComponentType<C>): Generator<[EntityId, A, B, C]>;
  *query(...types: ComponentType<any>[]): Generator<[EntityId, ...any[]]> {
    if (types.length === 0) return;

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

  addSystem(system: System): void {
    this.systems.push(system);
  }

  update(dt: number): void {
    for (const system of this.systems) {
      system.update(this, dt);
    }
  }
}
