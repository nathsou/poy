import { panic } from './utils';

type Ok<T> = { type: 'ok'; data: T };
type Err<E> = { type: 'error'; data: E };
type Res<T, E> = Ok<T> | Err<E>;

export class Result<T, E> {
  public raw: Res<T, E>;

  private constructor(res: Res<T, E>) {
    this.raw = res;
  }

  static Ok<T, E>(data: T): Result<T, E> {
    return new Result<T, E>({ type: 'ok', data });
  }

  static Error<T, E>(data: E): Result<T, E> {
    return new Result<T, E>({ type: 'error', data });
  }

  static wrap<T, E>([data, errors]: [T, E[]]): Result<T, E[]> {
    return errors.length === 0 ? Result.Ok(data) : Result.Error(errors);
  }

  isOk(): boolean {
    return this.raw.type === 'ok';
  }

  isError(): boolean {
    return this.raw.type === 'error';
  }

  map<U>(f: (data: T) => U): Result<U, E> {
    if (this.raw.type === 'ok') {
      return Result.Ok(f(this.raw.data));
    }

    return Result.Error(this.raw.data);
  }

  flatMap<U>(f: (data: T) => Result<U, E>): Result<U, E> {
    if (this.raw.type === 'ok') {
      return f(this.raw.data);
    }

    return Result.Error(this.raw.data);
  }

  match<U>(actions: { Ok: (data: T) => U; Error: (error: E) => U }): U {
    if (this.raw.type === 'ok') {
      return actions.Ok(this.raw.data);
    }

    return actions.Error(this.raw.data);
  }

  do(f: (data: T) => void): void {
    if (this.raw.type === 'ok') {
      f(this.raw.data);
    }
  }

  unwrap(): T {
    if (this.raw.type === 'ok') {
      return this.raw.data;
    }

    return panic('Tried to unwrap an error result');
  }

  unwrapError(): E {
    if (this.raw.type === 'error') {
      return this.raw.data;
    }

    return panic('Tried to unwrapError an ok result');
  }

  flat(): T | undefined {
    if (this.raw.type === 'ok') {
      return this.raw.data;
    }

    return undefined;
  }

  pair(): [T | undefined, E | undefined] {
    if (this.raw.type === 'ok') {
      return [this.raw.data, undefined];
    }

    return [undefined, this.raw.data];
  }

  try<T>(action: () => T): Result<T, unknown> {
    try {
      return Result.Ok(action());
    } catch (e) {
      return Result.Error(e);
    }
  }
}

export const { Ok, Error: Err } = Result;
