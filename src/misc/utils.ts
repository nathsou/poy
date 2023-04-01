
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

export const noop = () => { };

export const proj = <T, K extends keyof T>(key: K): (data: T) => T[K] => {
    return (data: T) => data[key];
};

export function assert(test: boolean, message: (string | (() => string)) = ''): asserts test {
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

export const zip = <A, B>(as: A[], bs: B[], checkSameLength = true): [A, B][] => {
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
    const values = map.get(key) ?? [];
    values.push(value);
    map.set(key, values);
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
