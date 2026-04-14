export class Pool<T> {
  private items: T[];
  private _count: number = 0;
  readonly capacity: number;

  constructor(capacity: number, factory: () => T) {
    this.capacity = capacity;
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      this.items.push(factory());
    }
  }

  get count(): number { return this._count; }
  get length(): number { return this._count; }  // alias for array compat

  get(i: number): T { return this.items[i]; }

  /** Acquire a recycled item. Returns null if pool is full. */
  acquire(): T | null {
    if (this._count >= this.capacity) return null;
    return this.items[this._count++];
  }

  /** Release item at index (swap-and-pop pattern) */
  release(i: number): void {
    this._count--;
    const temp = this.items[i];
    this.items[i] = this.items[this._count];
    this.items[this._count] = temp;
  }

  /** Clear pool (keeps pre-allocated objects, just resets count) */
  clear(): void { this._count = 0; }

  /** Make pool iterable for for-of loops */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this._count; i++) {
      yield this.items[i];
    }
  }

  /** Find first item matching predicate (for test compat) */
  find(predicate: (item: T) => boolean): T | undefined {
    for (let i = 0; i < this._count; i++) {
      if (predicate(this.items[i])) return this.items[i];
    }
    return undefined;
  }
}
