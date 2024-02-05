import { Maybe, None, Some } from './maybe';
import { panic } from './utils';

export class Scope<T> {
  members: Map<string, T>;
  parent?: Scope<T>;
  allowShadowing = false;

  constructor(parent?: Scope<T>, allowShadowing = false) {
    this.members = new Map();
    this.parent = parent;
    this.allowShadowing = allowShadowing ?? parent?.allowShadowing ?? false;
  }

  public has(name: string): boolean {
    return this.members.has(name) || (this.parent != null && this.parent.has(name));
  }

  public declare(name: string, value: T): void {
    if (!this.allowShadowing && this.members.has(name)) {
      panic(`Member '${name}' already declared`);
    }

    this.members.set(name, value);
  }

  public declareMany(decls: Iterable<[name: string, value: T]>): void {
    for (const [name, value] of decls) {
      this.declare(name, value);
    }
  }

  public lookup(name: string): Maybe<T> {
    if (this.members.has(name)) {
      return Some(this.members.get(name)!);
    }

    if (this.parent != null) {
      return this.parent.lookup(name);
    }

    return None;
  }

  public child(): Scope<T> {
    return new Scope(this);
  }

  public show(showT: (val: T) => string): string {
    return [...this.members.entries()].map(([name, val]) => `${name}: ${showT(val)}`).join('\n');
  }

  public *[Symbol.iterator](): IterableIterator<[string, T]> {
    yield* this.members;

    if (this.parent != null) {
      yield* this.parent;
    }
  }
}
