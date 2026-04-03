import { Entity, type EntityType } from "./Entity";

function constructorChain(entity: Entity): Function[] {
  const types: Function[] = [];
  let proto: object | null = Object.getPrototypeOf(entity);

  while (proto !== null) {
    const ctor = (proto as { constructor?: Function }).constructor;
    if (ctor === undefined || ctor === Object) {
      break;
    }

    types.push(ctor);
    if (ctor === Entity) {
      break;
    }

    proto = Object.getPrototypeOf(proto);
  }

  return types;
}

export class Tracker {
  private readonly entities = new Map<Function, Entity[]>();

  track(entity: Entity): void {
    for (const type of constructorChain(entity)) {
      const bucket = this.entities.get(type);
      if (bucket !== undefined) {
        bucket.push(entity);
      } else {
        this.entities.set(type, [entity]);
      }
    }
  }

  untrack(entity: Entity): void {
    for (const type of constructorChain(entity)) {
      const bucket = this.entities.get(type);
      if (bucket === undefined) {
        continue;
      }

      const index = bucket.indexOf(entity);
      if (index >= 0) {
        bucket.splice(index, 1);
      }
    }
  }

  getEntity<T extends Entity>(type: EntityType<T>): T | null {
    const bucket = this.entities.get(type);
    if (bucket === undefined || bucket.length === 0) {
      return null;
    }

    return bucket[0] as T;
  }

  getEntities<T extends Entity>(type: EntityType<T>): readonly T[] {
    const bucket = this.entities.get(type);
    if (bucket === undefined) {
      return [];
    }

    return bucket as unknown as readonly T[];
  }
}
