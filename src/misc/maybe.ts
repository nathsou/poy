import { panic } from './utils';

type M<T> = { type: 'some'; data: T } | { type: 'none' };

export class Maybe<T> {
    private raw: M<T>;
    public static readonly None = new Maybe<any>({ type: 'none' });

    private constructor(value: M<T>) {
        this.raw = value;
    }

    static NoneAs<T>(): Maybe<T> {
        return Maybe.None;
    }

    static Some<T>(val: T): Maybe<T> {
        return new Maybe({ type: 'some', data: val });
    }

    isSome(): boolean {
        return this.raw.type === 'some';
    }

    isNone(): boolean {
        return this.raw.type === 'none';
    }

    map<U>(f: (val: T) => U): Maybe<U> {
        if (this.raw.type === 'some') {
            return Some(f(this.raw.data));
        }

        return None;
    }

    do(f: (val: T) => void): void {
        if (this.raw.type === 'some') {
            f(this.raw.data);
        }
    }

    mapWithDefault<U>(f: (val: T) => U, defaultValue: U | (() => U)): U {
        if (this.raw.type === 'some') {
            return f(this.raw.data);
        }

        return typeof defaultValue === 'function'
            ? (defaultValue as Function)()
            : defaultValue;
    }

    flatMap<U>(f: (val: T) => Maybe<U>): Maybe<U> {
        if (this.raw.type === 'some') {
            return f(this.raw.data);
        }

        return None;
    }

    or(other: Maybe<T> | (() => Maybe<T>)): Maybe<T> {
        if (this.raw.type === 'some') {
            return this;
        }

        return typeof other === 'function' ? other() : other;
    }

    orDefault(defaultValue: T | (() => T)): T {
        if (this.raw.type === 'some') {
            return this.raw.data;
        }

        /// @ts-ignore
        return typeof defaultValue === 'function'
            ? defaultValue()
            : defaultValue;
    }

    match<U>(actions: { Some: (data: T) => U; None: () => U }): U {
        if (this.raw.type === 'some') {
            return actions.Some(this.raw.data);
        }

        return actions.None();
    }

    unwrap(message?: string | (() => string)): T {
        if (this.raw.type === 'some') {
            return this.raw.data;
        }

        if (message) {
            const msg = typeof message === 'function' ? message() : message;
            return panic(`Maybe.unwrap: ${msg}`);
        }

        return panic('Tried to unwrap a None value');
    }

    flat(): T | undefined {
        if (this.raw.type === 'some') {
            return this.raw.data;
        }

        return undefined;
    }

    static firstSomeBy<T, U>(
        elems: T[],
        f: (elem: T) => Maybe<U>,
    ): Maybe<[U, number]> {
        for (let i = 0; i < elems.length; i++) {
            const mapped = f(elems[i]);
            if (mapped.isSome()) {
                return mapped.map(data => [data, i]);
            }
        }

        return None;
    }

    static wrap<T>(value?: T): Maybe<T> {
        return value === undefined ? None : Some(value);
    }

    static keepSome<T>(elems: Maybe<T>[]): T[] {
        const kept: T[] = [];

        for (const elem of elems) {
            elem.do(val => kept.push(val));
        }

        return kept;
    }
}

export const { None, NoneAs, Some } = Maybe;
