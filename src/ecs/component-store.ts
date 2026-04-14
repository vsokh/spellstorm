import { EntityId } from './entity';

export class ComponentStore<T> {
  private dense: T[] = [];
  private entities: EntityId[] = [];
  private sparse: Map<EntityId, number> = new Map();

  get length(): number {
    return this.dense.length;
  }

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

  get(id: EntityId): T | undefined {
    const idx = this.sparse.get(id);
    return idx !== undefined ? this.dense[idx] : undefined;
  }

  has(id: EntityId): boolean {
    return this.sparse.has(id);
  }

  remove(id: EntityId): boolean {
    const idx = this.sparse.get(id);
    if (idx === undefined) return false;

    const lastIdx = this.dense.length - 1;
    if (idx !== lastIdx) {
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

  *[Symbol.iterator](): Iterator<[EntityId, T]> {
    for (let i = 0; i < this.dense.length; i++) {
      yield [this.entities[i], this.dense[i]];
    }
  }

  raw(): { entities: readonly EntityId[]; values: readonly T[] } {
    return { entities: this.entities, values: this.dense };
  }

  clear(): void {
    this.dense.length = 0;
    this.entities.length = 0;
    this.sparse.clear();
  }
}
