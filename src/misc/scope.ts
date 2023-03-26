import { showTypeVarId, Subst, Type, TypeVarId } from "../infer/type";
import { Maybe, None, Some } from "./maybe";
import { panic } from "./utils";

export class Scope<T> {
    protected members: Map<string, T>;
    protected parent?: Scope<T>;
    protected allowShadowing = false;

    constructor(parent?: Scope<T>) {
        this.members = new Map();
        this.parent = parent;
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

    public declareMany(decls: [name: string, value: T][]): void {
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
}

export class TypeParamScope extends Scope<Type> {
    public reversed: Map<TypeVarId, string>;

    constructor(parent?: TypeParamScope) {
        super(parent);
        this.reversed = new Map();
        this.allowShadowing = true;
    }

    override declare(name: string, value: Type): void {
        super.declare(name, value);
        if (value.variant === 'Var' && 'id' in value.ref) {
            this.reversed.set(value.ref.id, name);
        }
    }

    public lookupParam(id: TypeVarId): Maybe<string> {
        if (this.reversed.has(id)) {
            return Some(this.reversed.get(id)!);
        }

        if (this.parent != null && this.parent instanceof TypeParamScope) {
            return this.parent.lookupParam(id);
        }

        return None;
    }

    public substitute(subst: Subst): void {
        let fixpoint = true;

        // for (const [id, ty] of subst) {
        //     if (ty.variant === 'Var' && ty.ref.variant === 'Param' && !this.reversed.has(id)) {
        //         // fixpoint = false;
        //         console.log(`Adding ${showTypeVarId(id)} (${id}) -> ${ty.ref.name}`);
        //         this.reversed.set(id, ty.ref.name);
        //     }
        // }

        for (const [id, name] of this.reversed) {
            if (subst.has(id)) {
                const mapped = Type.utils.unlink(subst.get(id)!);
                if (
                    mapped.variant === 'Var' &&
                    'id' in mapped.ref &&
                    !this.reversed.has(mapped.ref.id)
                ) {
                    fixpoint = false;
                    this.reversed.set(mapped.ref.id, name);
                }
            }
        }


        if (!fixpoint) {
            this.substitute(subst);
        }
    }

    override child(): TypeParamScope {
        return new TypeParamScope(this);
    }

    public show(): string {
        return [...this.reversed.entries()].map(([id, name]) => `${showTypeVarId(id)} -> ${name}`).join('\n');
    }
}
