export type EntityId = number;

let nextId: EntityId = 1;

export function createEntityId(): EntityId {
  return nextId++;
}

export function resetEntityIds(start: EntityId = 1): void {
  nextId = start;
}
