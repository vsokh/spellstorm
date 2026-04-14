import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the profiler to avoid importing real game dependencies
vi.mock('../../debug/profiler', () => ({
  profiler: {
    begin: vi.fn(),
    end: vi.fn(),
  },
}));

import { SystemRunner } from '../../ecs/system-runner';
import type { GameSystem } from '../../ecs/system-runner';
import { profiler } from '../../debug/profiler';

describe('SystemRunner', () => {
  let runner: SystemRunner;

  beforeEach(() => {
    runner = new SystemRunner();
    vi.clearAllMocks();
  });

  it('executes systems in ascending priority order', () => {
    const log: string[] = [];
    runner.add('C', 30, () => log.push('C'));
    runner.add('A', 10, () => log.push('A'));
    runner.add('B', 20, () => log.push('B'));

    runner.update({} as any, 0.016);
    expect(log).toEqual(['A', 'B', 'C']);
  });

  it('accepts a system object via add()', () => {
    const log: string[] = [];
    const system: GameSystem = {
      name: 'obj-system',
      priority: 5,
      enabled: true,
      update: () => log.push('obj'),
    };
    runner.add(system);
    runner.update({} as any, 0.016);
    expect(log).toEqual(['obj']);
  });

  it('supports chained add() calls', () => {
    const result = runner
      .add('A', 10, () => {})
      .add('B', 20, () => {});
    expect(result).toBe(runner);
  });

  it('skips disabled systems', () => {
    const log: string[] = [];
    runner.add('A', 10, () => log.push('A'));
    runner.add('B', 20, () => log.push('B'));
    runner.add('C', 30, () => log.push('C'));

    const sysB = runner.get('B');
    expect(sysB).toBeDefined();
    sysB!.enabled = false;

    runner.update({} as any, 0.016);
    expect(log).toEqual(['A', 'C']);
  });

  it('finds a system by name with get()', () => {
    runner.add('physics', 10, () => {});
    runner.add('render', 20, () => {});

    const found = runner.get('physics');
    expect(found).toBeDefined();
    expect(found!.name).toBe('physics');
    expect(found!.priority).toBe(10);
  });

  it('returns undefined from get() for unknown name', () => {
    runner.add('physics', 10, () => {});
    expect(runner.get('nonexistent')).toBeUndefined();
  });

  it('returns systems in sorted order via list()', () => {
    runner.add('C', 30, () => {});
    runner.add('A', 10, () => {});
    runner.add('B', 20, () => {});

    const systems = runner.list();
    expect(systems.map(s => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('maintains stable order for systems with equal priority', () => {
    const log: string[] = [];
    runner.add('first', 10, () => log.push('first'));
    runner.add('second', 10, () => log.push('second'));
    runner.add('third', 10, () => log.push('third'));

    runner.update({} as any, 0.016);
    expect(log).toEqual(['first', 'second', 'third']);
  });

  it('passes state and dt to system update functions', () => {
    const mockState = { foo: 'bar' } as any;
    const mockFn = vi.fn();
    runner.add('test', 10, mockFn);

    runner.update(mockState, 0.032);
    expect(mockFn).toHaveBeenCalledWith(mockState, 0.032);
  });

  it('calls profiler.begin and profiler.end around each system', () => {
    runner.add('A', 10, () => {});
    runner.add('B', 20, () => {});

    runner.update({} as any, 0.016);

    expect(profiler.begin).toHaveBeenCalledWith('A');
    expect(profiler.end).toHaveBeenCalledWith('A');
    expect(profiler.begin).toHaveBeenCalledWith('B');
    expect(profiler.end).toHaveBeenCalledWith('B');
  });

  it('does not call profiler for disabled systems', () => {
    runner.add('disabled', 10, () => {});
    runner.get('disabled')!.enabled = false;

    runner.update({} as any, 0.016);

    expect(profiler.begin).not.toHaveBeenCalled();
    expect(profiler.end).not.toHaveBeenCalled();
  });

  it('re-sorts after adding a new system between updates', () => {
    const log: string[] = [];
    runner.add('B', 20, () => log.push('B'));
    runner.update({} as any, 0.016);
    expect(log).toEqual(['B']);

    log.length = 0;
    runner.add('A', 5, () => log.push('A'));
    runner.update({} as any, 0.016);
    expect(log).toEqual(['A', 'B']);
  });
});
