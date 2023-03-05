import { Maybe, None, Some } from "./maybe";
import { panic } from "./utils";

export class Scope<T> {
    private members: Map<string, T>;
    private parent?: Scope<T>;

    constructor(parent?: Scope<T>) {
        this.members = new Map();
        this.parent = parent;
    }

    public has(name: string): boolean {
        return this.members.has(name) || (this.parent != null && this.parent.has(name));
    }

    public declare(name: string, value: T): void {
        if (this.members.has(name)) {
            panic(`Member '${name}' already declared`);
        }

        this.members.set(name, value);
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
}
