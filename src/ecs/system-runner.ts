import type { GameState } from '../state';
import { profiler } from '../debug/profiler';

export interface GameSystem {
  readonly name: string;
  readonly priority: number;
  enabled: boolean;
  update(state: GameState, dt: number): void;
}

export class SystemRunner {
  private systems: GameSystem[] = [];
  private sorted = true;

  /** Register a system object */
  add(system: GameSystem): this;
  /** Register a system from name + priority + function */
  add(name: string, priority: number, fn: (state: GameState, dt: number) => void): this;
  add(nameOrSystem: string | GameSystem, priority?: number, fn?: ((state: GameState, dt: number) => void)): this {
    if (typeof nameOrSystem === 'string') {
      this.systems.push({
        name: nameOrSystem,
        priority: priority!,
        enabled: true,
        update: fn!,
      });
    } else {
      this.systems.push(nameOrSystem);
    }
    this.sorted = false;
    return this;
  }

  /** Execute all enabled systems in ascending priority order. */
  update(state: GameState, dt: number): void {
    if (!this.sorted) {
      this.systems.sort((a, b) => a.priority - b.priority);
      this.sorted = true;
    }
    for (const sys of this.systems) {
      if (!sys.enabled) continue;
      profiler.begin(sys.name);
      sys.update(state, dt);
      profiler.end(sys.name);
    }
  }

  /** Get a registered system by name. */
  get(name: string): GameSystem | undefined {
    return this.systems.find(s => s.name === name);
  }

  /** Return all systems in execution order. */
  list(): readonly GameSystem[] {
    if (!this.sorted) {
      this.systems.sort((a, b) => a.priority - b.priority);
      this.sorted = true;
    }
    return this.systems;
  }
}
