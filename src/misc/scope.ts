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
}

export class TypeParamScope extends Scope<Type> {
    public typeVarIdMapping: Map<TypeVarId, string>;

    constructor(parent?: TypeParamScope) {
        super(parent);
        this.typeVarIdMapping = new Map();
        this.allowShadowing = true;
    }

    override declare(name: string, value: Type): void {
        super.declare(name, value);
        if (value.variant === 'Var' && 'id' in value.ref) {
            this.typeVarIdMapping.set(value.ref.id, name);
        }
    }

    public lookupParam(id: TypeVarId): Maybe<string> {
        if (this.typeVarIdMapping.has(id)) {
            return Some(this.typeVarIdMapping.get(id)!);
        }

        if (this.parent != null && this.parent instanceof TypeParamScope) {
            return this.parent.lookupParam(id);
        }

        return None;
    }

    public substitute(subst: Subst): void {
        let fixpoint = true;

        for (const [id, name] of this.typeVarIdMapping) {
            if (subst.has(id)) {
                const mapped = Type.utils.unlink(subst.get(id)!);
                if (
                    mapped.variant === 'Var' &&
                    'id' in mapped.ref &&
                    !this.typeVarIdMapping.has(mapped.ref.id)
                ) {
                    fixpoint = false;
                    this.typeVarIdMapping.set(mapped.ref.id, name);
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
        return [...this.typeVarIdMapping.entries()].map(([id, name]) => `${showTypeVarId(id)} -> ${name}`).join(', ');
    }
}
