import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentStore } from '../../ecs/component-store';

describe('ComponentStore', () => {
  let store: ComponentStore<{ x: number; y: number }>;

  beforeEach(() => {
    store = new ComponentStore();
  });

  it('set() adds a new entry and get() retrieves it', () => {
    store.set(1, { x: 10, y: 20 });
    expect(store.get(1)).toEqual({ x: 10, y: 20 });
  });

  it('set() overwrites an existing entry', () => {
    store.set(1, { x: 10, y: 20 });
    store.set(1, { x: 30, y: 40 });
    expect(store.get(1)).toEqual({ x: 30, y: 40 });
    expect(store.length).toBe(1);
  });

  it('get() returns undefined for missing entity', () => {
    expect(store.get(999)).toBeUndefined();
  });

  it('has() returns true for existing entity', () => {
    store.set(1, { x: 0, y: 0 });
    expect(store.has(1)).toBe(true);
  });

  it('has() returns false for missing entity', () => {
    expect(store.has(1)).toBe(false);
  });

  it('remove() returns true on success', () => {
    store.set(1, { x: 0, y: 0 });
    expect(store.remove(1)).toBe(true);
    expect(store.has(1)).toBe(false);
    expect(store.length).toBe(0);
  });

  it('remove() returns false on missing entity', () => {
    expect(store.remove(999)).toBe(false);
  });

  it('remove() uses swap-remove (last element fills gap)', () => {
    store.set(1, { x: 1, y: 0 });
    store.set(2, { x: 2, y: 0 });
    store.set(3, { x: 3, y: 0 });

    // Remove entity 1 — entity 3 (last) should fill the gap at index 0
    store.remove(1);

    const { entities, values } = store.raw();
    // After swap-remove of index 0, entity 3 moves to index 0, entity 2 stays at index 1
    expect(entities).toEqual([3, 2]);
    expect(values).toEqual([{ x: 3, y: 0 }, { x: 2, y: 0 }]);
  });

  it('iterator yields all entries', () => {
    store.set(10, { x: 1, y: 2 });
    store.set(20, { x: 3, y: 4 });

    const entries = [...store];
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual([10, { x: 1, y: 2 }]);
    expect(entries).toContainEqual([20, { x: 3, y: 4 }]);
  });

  it('raw() returns parallel dense arrays', () => {
    store.set(5, { x: 50, y: 60 });
    store.set(7, { x: 70, y: 80 });

    const { entities, values } = store.raw();
    expect(entities).toEqual([5, 7]);
    expect(values).toEqual([{ x: 50, y: 60 }, { x: 70, y: 80 }]);
  });

  it('clear() empties the store', () => {
    store.set(1, { x: 0, y: 0 });
    store.set(2, { x: 0, y: 0 });
    store.clear();
    expect(store.length).toBe(0);
    expect(store.has(1)).toBe(false);
    expect(store.has(2)).toBe(false);
  });

  it('multiple stores are independent', () => {
    const storeA = new ComponentStore<number>();
    const storeB = new ComponentStore<string>();

    storeA.set(1, 42);
    storeB.set(1, 'hello');

    expect(storeA.get(1)).toBe(42);
    expect(storeB.get(1)).toBe('hello');
    expect(storeA.length).toBe(1);
    expect(storeB.length).toBe(1);

    storeA.remove(1);
    expect(storeA.has(1)).toBe(false);
    expect(storeB.has(1)).toBe(true);
  });

  it('length property is correct', () => {
    expect(store.length).toBe(0);
    store.set(1, { x: 0, y: 0 });
    expect(store.length).toBe(1);
    store.set(2, { x: 0, y: 0 });
    expect(store.length).toBe(2);
    store.set(1, { x: 1, y: 1 }); // overwrite, no increase
    expect(store.length).toBe(2);
    store.remove(1);
    expect(store.length).toBe(1);
    store.remove(2);
    expect(store.length).toBe(0);
  });
});
