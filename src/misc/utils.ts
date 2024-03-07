export type Ref<T> = { ref: T };
export const ref = <T>(ref: T): Ref<T> => ({ ref });

export const panic = (msg: string): never => {
  throw new Error(msg);
};

export const unreachable = (msg: string): never => {
  return panic(`unreachable code was reached: ${msg}`);
};

export const todo = (msg?: string): never => {
  if (msg) {
    return panic(`todo: ${msg}`);
  }

  return panic('todo block reached');
};

export const id = <T>(x: T): T => x;

export const noop = () => {};

export const proj = <T, K extends keyof T>(key: K): ((data: T) => T[K]) => {
  return (data: T) => data[key];
};

export function assert(test: boolean, message: string | (() => string) = ''): asserts test {
  if (!test) {
    throw new Error(`assertion failed: ${typeof message === 'string' ? message : message()}`);
  }
}

export const block = <T>(f: () => T): T => f();

export const letIn = <T, U>(val: T, f: (val: T) => U): U => f(val);

export const array = <T>(): T[] => [];

export const last = <T>(elems: T[]): T => {
  if (elems.length === 0) {
    panic('called last with an empty array');
  }

  return elems[elems.length - 1];
};

export const lastIndex = <T>(elems: T[]): number => {
  assert(elems.length > 0, 'called lastIndex with an empty array');
  return elems.length - 1;
};

export const first = <T>(elems: Iterable<T>): T => {
  const fst = elems[Symbol.iterator]().next();

  if (fst.done) {
    panic('called first with an empty iterable');
  }

  return fst.value;
};

export const zip = <A, B>(as: readonly A[], bs: readonly B[], checkSameLength = true): [A, B][] => {
  if (checkSameLength && as.length !== bs.length) {
    panic(`called zip with arrays of different lengths: ${as.length} and ${bs.length}`);
  }

  const zipped: [A, B][] = [];
  const len = Math.min(as.length, bs.length);

  for (let i = 0; i < len; i++) {
    zipped.push([as[i], bs[i]]);
  }

  return zipped;
};

export const indices = <T>(vals: T[], pred: (val: T) => boolean): number[] => {
  const indices: number[] = [];

  for (let i = 0; i < vals.length; i++) {
    if (pred(vals[i])) {
      indices.push(i);
    }
  }

  return indices;
};

export const pushMap = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const values = map.get(key);

  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
  }
};

export function* indexed<T>(elems: Iterable<T>): Iterable<[T, number]> {
  let i = 0;

  for (const elem of elems) {
    yield [elem, i];
    i += 1;
  }
}

export function gen<T>(count: number, f: (i: number) => T): T[] {
  const elems: T[] = [];

  for (let i = 0; i < count; i++) {
    elems.push(f(i));
  }

  return elems;
}

export function repeat<T>(elem: T, count: number): T[] {
  const elems: T[] = [];

  for (let i = 0; i < count; i++) {
    elems.push(elem);
  }

  return elems;
}

export function swapMut<T>(vals: T[], i: number, j: number): void {
  if (i !== j) {
    if (i < 0 || j < 0 || i >= vals.length || j >= vals.length) {
      panic(`invalid swap indices, len: ${vals.length}, i: ${i}, j: ${j}`);
    }
    const tmp = vals[i];
    vals[i] = vals[j];
    vals[j] = tmp;
  }
}

export function some<T>(it: Iterable<T>, pred: (val: T) => boolean): boolean {
  for (const val of it) {
    if (pred(val)) return true;
  }

  return false;
}

export function count<T>(it: Iterable<T>, pred: (val: T) => boolean): number {
  let count = 0;

  for (const val of it) {
    if (pred(val)) {
      count += 1;
    }
  }

  return count;
}

export function sum(elems: Iterable<number>): number {
  let sum = 0;

  for (const elem of elems) {
    sum += elem;
  }

  return sum;
}

export function* map<A, B>(iter: Iterable<A>, f: (elem: A) => B): Iterable<B> {
  for (const n of iter) {
    yield f(n);
  }
}

export function* range(start: number, end: number): Iterable<number> {
  for (let i = start; i < end; i += 1) {
    yield i;
  }
}

export function rangeInclusive(start: number, end: number): Iterable<number> {
  return range(start, end + 1);
}

export function mapObject<T, U>(obj: Record<string, T>, f: (val: T) => U): Record<string, U> {
  const mapped: Record<string, U> = {};

  for (const key in obj) {
    mapped[key] = f(obj[key]);
  }

  return mapped;
}
