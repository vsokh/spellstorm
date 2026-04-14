import { World } from './world';

export interface System {
  readonly name: string;
  update(world: World, dt: number): void;
}
