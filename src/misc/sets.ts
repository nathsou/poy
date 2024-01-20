import { some } from './utils';

export function setDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>();

  for (const item of a) {
    if (!b.has(item)) {
      result.add(item);
    }
  }

  return result;
}

export function setIntersection<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>();

  for (const item of a) {
    if (b.has(item)) {
      result.add(item);
    }
  }

  return result;
}

export type Container<T> = Set<T> | Map<T, unknown> | T[];

export function contains<T>(container: Container<T>, item: T): boolean {
  if (Array.isArray(container)) {
    return container.includes(item);
  } else {
    return container.has(item);
  }
}

export function setIntersectionMut<T>(a: Set<T>, b: Container<T>): void {
  for (const item of a) {
    if (!contains(b, item)) {
      a.delete(item);
    }
  }
}

export type SetLike<T> = Set<T> | Map<T, unknown>;

export function setEquals<T>(as: SetLike<T>, bs: SetLike<T>): boolean {
  return as.size === bs.size && !some(as.keys(), a => !bs.has(a));
}

export function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}
