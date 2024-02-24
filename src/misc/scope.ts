import { Maybe, None, Some } from './maybe';
import { panic } from './utils';

type Import<T> = {
  module: string,
  scope: Scope<T>,
  members: Set<string>,
};

export class Scope<T> {
  members: Map<string, T>;
  parent?: Scope<T>;
  allowShadowing = false;
  imports: Import<T>[] = []

  constructor(parent?: Scope<T>, allowShadowing = false) {
    this.members = new Map();
    this.parent = parent;
    this.allowShadowing = allowShadowing ?? parent?.allowShadowing ?? false;
  }

  public has(name: string): boolean {
    return this.members.has(name) ||
      this.hasImport(name) ||
      (this.parent != null && this.parent.has(name));
  }

  public hasImport(name: string): boolean {
    return this.imports.some(imp => (imp.members.size === 0 || imp.members.has(name)) && imp.scope.has(name));
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

    for (const imp of this.imports) {
      if ((imp.members.size === 0 || imp.members.has(name)) && imp.scope.has(name)) {
        return imp.scope.lookup(name);
      }
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

  public *entries(depth = Infinity, visited: Set<Scope<T>> = new Set()): IterableIterator<[string, T]> {
    if (depth <= 0 || visited.has(this)) return;

    visited.add(this);
    yield* this.members;

    for (const imp of this.imports) {
      yield* imp.scope.entries(1, visited);
    }

    if (this.parent != null) {
      yield* this.parent.entries(depth - 1, visited);
    }
  }
}
