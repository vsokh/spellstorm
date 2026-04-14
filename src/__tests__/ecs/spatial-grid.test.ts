import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialGrid } from '../../ecs/spatial-grid';

describe('SpatialGrid', () => {
  let grid: SpatialGrid;

  beforeEach(() => {
    // 1000x700 arena, 128px cells
    grid = new SpatialGrid(128, 1000, 700);
  });

  it('insert() places entity in correct cell and queryArea finds it', () => {
    grid.insert(1, 100, 100, 10);
    const result = grid.queryArea(100, 100, 10);
    expect(result).toContain(1);
  });

  it('entity spanning cell boundary appears in multiple cells', () => {
    // Place entity at cell boundary (128) with radius that spans both cells
    grid.insert(1, 128, 100, 20);

    // Query left cell — should find entity
    const left = grid.queryArea(110, 100, 10);
    expect(left).toContain(1);

    // Query right cell — should also find entity
    const right = grid.queryArea(140, 100, 10);
    expect(right).toContain(1);
  });

  it('queryArea() returns entities in overlapping cells', () => {
    grid.insert(1, 50, 50, 10);
    grid.insert(2, 60, 60, 10);

    const result = grid.queryArea(55, 55, 30);
    expect(result).toContain(1);
    expect(result).toContain(2);
  });

  it('queryArea() does not return entities in distant cells', () => {
    grid.insert(1, 50, 50, 10);
    grid.insert(2, 900, 600, 10);

    const result = grid.queryArea(50, 50, 20);
    expect(result).toContain(1);
    expect(result).not.toContain(2);
  });

  it('queryPairs() enumerates all pairs within same cells', () => {
    grid.insert(1, 50, 50, 10);
    grid.insert(2, 60, 60, 10);
    grid.insert(3, 70, 70, 10);

    const pairs: [number, number][] = [];
    grid.queryPairs((a, b) => pairs.push([a, b]));

    // 3 entities in same cell = 3 pairs: (1,2), (1,3), (2,3)
    expect(pairs).toHaveLength(3);
  });

  it('queryPairs() does not duplicate pairs', () => {
    // Insert entities that span cell boundaries so they appear in multiple cells
    grid.insert(1, 128, 128, 20);
    grid.insert(2, 128, 128, 20);

    const pairs: [number, number][] = [];
    grid.queryPairs((a, b) => pairs.push([a, b]));

    // Even though both appear in multiple cells, the pair should only be reported once
    expect(pairs).toHaveLength(1);
  });

  it('clear() empties all cells', () => {
    grid.insert(1, 50, 50, 10);
    grid.insert(2, 200, 200, 10);
    grid.clear();

    const r1 = grid.queryArea(50, 50, 20);
    const r2 = grid.queryArea(200, 200, 20);
    expect(r1).toHaveLength(0);
    expect(r2).toHaveLength(0);
  });

  it('edge: entity at grid boundary', () => {
    // Entity at the very edge of the grid (0,0)
    grid.insert(1, 0, 0, 5);
    const result = grid.queryArea(0, 0, 10);
    expect(result).toContain(1);

    // Entity near max boundary
    grid.insert(2, 999, 699, 5);
    const result2 = grid.queryArea(999, 699, 10);
    expect(result2).toContain(2);
  });

  it('edge: entity outside grid bounds (negative coords) does not crash', () => {
    // Negative coords — should clamp and not crash
    expect(() => grid.insert(1, -50, -50, 10)).not.toThrow();
    expect(() => grid.queryArea(-50, -50, 10)).not.toThrow();
  });

  it('edge: entity beyond arena bounds does not crash', () => {
    expect(() => grid.insert(1, 2000, 2000, 10)).not.toThrow();
    expect(() => grid.queryArea(2000, 2000, 10)).not.toThrow();
  });
});
