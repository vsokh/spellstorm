import { Player, Enemy } from '../types';
import { GameState } from '../state';

/**
 * Class-specific behavior hooks. Register a class's hooks via registerClassHooks(key, hooks).
 *
 * Only hooks that are actually wired into core systems run. Scope today:
 *   - castUltimate: invoked from combat.ts when Space ult fires.
 *
 * Add new hook points as the corresponding combat/physics branches get migrated.
 */
export interface ClassHooks {
  /** Called when Space ultimate is cast. Return true if handled; falsy falls through to legacy chain. */
  castUltimate?: (state: GameState, p: Player, angle: number) => boolean | void;

  /** Called when slot 2 (Q) is cast. Return true to fully replace default spell dispatch. */
  castQAbility?: (state: GameState, p: Player, def: import('../types').SpellDef, angle: number) => boolean | void;

  /** Called when slot 1 (RMB) is cast. Return true to fully replace default spell dispatch. */
  castRMBAbility?: (state: GameState, p: Player, def: import('../types').SpellDef, angle: number) => boolean | void;

  /** Called after each successful damageEnemy. Hook for class on-hit effects (lifesteal, crit-pending, ult charge). */
  onDamageEnemy?: (state: GameState, p: Player, e: Enemy, dmg: number) => void;

  /** Called when the attacker's hit reduces enemy hp to 0 or below. */
  onKill?: (state: GameState, p: Player, e: Enemy) => void;

  /** Called per tick while the player is alive. dt in seconds. */
  onTick?: (state: GameState, p: Player, dt: number) => void;

  /** Should enemies currently be able to target this player? Return false to hide (stealth). */
  isTargetable?: (p: Player) => boolean;
}

const REGISTRY: Record<string, ClassHooks> = {};

export function registerClassHooks(clsKey: string, hooks: ClassHooks): void {
  REGISTRY[clsKey] = hooks;
}

export function getClassHooks(clsKey: string): ClassHooks | undefined {
  return REGISTRY[clsKey];
}

/** Dispatch helper for castUltimate. Returns true if a hook handled it. */
export function dispatchCastUltimate(state: GameState, p: Player, angle: number): boolean {
  const h = REGISTRY[p.clsKey];
  if (!h?.castUltimate) return false;
  return h.castUltimate(state, p, angle) === true;
}

/** Dispatch helper for Q ability cast. Returns true if a hook fully handled the cast. */
export function dispatchCastQAbility(state: GameState, p: Player, def: import('../types').SpellDef, angle: number): boolean {
  const h = REGISTRY[p.clsKey];
  if (!h?.castQAbility) return false;
  return h.castQAbility(state, p, def, angle) === true;
}

/** Dispatch helper for RMB ability cast. Returns true if a hook fully handled the cast. */
export function dispatchCastRMBAbility(state: GameState, p: Player, def: import('../types').SpellDef, angle: number): boolean {
  const h = REGISTRY[p.clsKey];
  if (!h?.castRMBAbility) return false;
  return h.castRMBAbility(state, p, def, angle) === true;
}

/** Run onTick for the active class, if registered. */
export function dispatchTick(state: GameState, p: Player, dt: number): void {
  REGISTRY[p.clsKey]?.onTick?.(state, p, dt);
}

/** Run onDamageEnemy for the active class. */
export function dispatchDamageEnemy(state: GameState, p: Player, e: Enemy, dmg: number): void {
  REGISTRY[p.clsKey]?.onDamageEnemy?.(state, p, e, dmg);
}

/** Run onKill for the active class. */
export function dispatchKill(state: GameState, p: Player, e: Enemy): void {
  REGISTRY[p.clsKey]?.onKill?.(state, p, e);
}

/** Check targetability for a player. Defaults to true. */
export function isPlayerTargetable(p: Player): boolean {
  const h = REGISTRY[p.clsKey];
  if (!h?.isTargetable) return true;
  return h.isTargetable(p) !== false;
}
