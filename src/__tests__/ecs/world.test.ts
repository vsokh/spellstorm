import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../ecs/world';
import { System } from '../../ecs/system';
import { resetEntityIds } from '../../ecs/entity';

class Pos { x = 0; y = 0; }
class Vel { vx = 0; vy = 0; }

describe('World', () => {
  let world: World;

  beforeEach(() => {
    resetEntityIds(1);
    world = new World();
  });

  it('spawn() returns unique IDs', () => {
    const a = world.spawn();
    const b = world.spawn();
    const c = world.spawn();
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('spawn() with components makes them queryable via get()', () => {
    const pos = { x: 10, y: 20 };
    const id = world.spawn([Pos, pos]);
    expect(world.get(id, Pos)).toBe(pos);
  });

  it('despawn() queues removal, flushDespawns() actually removes', () => {
    const id = world.spawn([Pos, { x: 0, y: 0 }]);
    world.despawn(id);

    // Still alive before flush
    expect(world.isAlive(id)).toBe(true);
    expect(world.get(id, Pos)).toBeDefined();

    world.flushDespawns();

    expect(world.isAlive(id)).toBe(false);
    expect(world.get(id, Pos)).toBeUndefined();
  });

  it('isAlive() reflects entity state before and after despawn', () => {
    const id = world.spawn();
    expect(world.isAlive(id)).toBe(true);

    world.despawn(id);
    world.flushDespawns();
    expect(world.isAlive(id)).toBe(false);
  });

  it('query(A) returns entities with component A', () => {
    const id1 = world.spawn([Pos, { x: 1, y: 2 }]);
    const id2 = world.spawn([Pos, { x: 3, y: 4 }]);
    world.spawn([Vel, { vx: 5, vy: 6 }]); // no Pos

    const results = [...world.query(Pos)];
    expect(results).toHaveLength(2);

    const ids = results.map(r => r[0]);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  it('query(A, B) returns only entities with both A and B', () => {
    const id1 = world.spawn([Pos, { x: 1, y: 2 }], [Vel, { vx: 10, vy: 20 }]);
    world.spawn([Pos, { x: 3, y: 4 }]); // only Pos
    world.spawn([Vel, { vx: 5, vy: 6 }]); // only Vel

    const results = [...world.query(Pos, Vel)];
    expect(results).toHaveLength(1);
    expect(results[0][0]).toBe(id1);
  });

  it('get()/set()/has() delegate correctly', () => {
    const id = world.spawn();

    expect(world.has(id, Pos)).toBe(false);
    expect(world.get(id, Pos)).toBeUndefined();

    world.set(id, Pos, { x: 5, y: 10 });
    expect(world.has(id, Pos)).toBe(true);
    expect(world.get(id, Pos)).toEqual({ x: 5, y: 10 });
  });

  it('entityCount is correct after spawn/despawn', () => {
    expect(world.entityCount).toBe(0);

    const a = world.spawn();
    const b = world.spawn();
    expect(world.entityCount).toBe(2);

    world.despawn(a);
    world.flushDespawns();
    expect(world.entityCount).toBe(1);

    world.despawn(b);
    world.flushDespawns();
    expect(world.entityCount).toBe(0);
  });

  it('addSystem() + update() calls systems in order', () => {
    const log: string[] = [];

    const sysA: System = {
      name: 'A',
      update(_w, _dt) { log.push('A'); },
    };
    const sysB: System = {
      name: 'B',
      update(_w, _dt) { log.push('B'); },
    };

    world.addSystem(sysA);
    world.addSystem(sysB);
    world.update(16);

    expect(log).toEqual(['A', 'B']);
  });
});
