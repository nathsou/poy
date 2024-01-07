import { Stmt } from "../../ast/js/stmt";
import { assert, panic } from "../../misc/utils";
import { sanitizeKeyword } from './normalize';

export type Name = {
    name: string;
    mangled: string;
};

// virtual scopes represent poy scopes like block expressions
// which do not compile to an actual JS scope
// adding a linearized statement to a virtual scope
// will add it to the closest real parent scope
export class JSScope {
    protected stmts: Stmt[];
    private members = new Map<string, Name>();
    private parent?: JSScope;
    private usedNames: Set<string>;

    constructor(isVirtual: boolean, parent?: JSScope) {
        if (isVirtual) {
            assert(parent != null, 'Virtual scopes must have a parent');
            this.stmts = parent.stmts;
            this.usedNames = parent.usedNames;
        } else {
            this.stmts = [];
            this.usedNames = new Set();
        }

        this.parent = parent;
    }

    public get statements(): Stmt[] {
        return this.stmts;
    }

    public clearStatements() {
        this.stmts = [];
    }

    public realChild(): JSScope {
        return new JSScope(false, this);
    }

    public virtualChild(): JSScope {
        return new JSScope(true, this);
    }

    private mangle(name: string, tries = 0): string {
        const mangledName = tries === 0 ? name : `${name}${tries}`;

        if (this.usedNames.has(mangledName)) {
            return this.mangle(name, tries + 1);
        }

        return sanitizeKeyword(mangledName);
    }

    public declare(name: string, as_?: string): Name {
        if (this.members.has(name)) {
            throw new Error(`Member '${name}' already declared`);
        }

        const mangled = as_ ?? this.mangle(name);
        const result = { name, mangled };
        this.members.set(name, result);
        this.usedNames.add(mangled);

        return result;
    }

    public lookup(name: string): Name {
        if (this.members.has(name)) {
            return this.members.get(name)!;
        }

        if (this.parent) {
            return this.parent.lookup(name);
        }

        return panic(`Member '${name}' not found`);
    }

    public add(...stmts: Stmt[]) {
        this.stmts.push(...stmts);
    }

    public declareUnused(prefix: string): Name {
        return this.declare(this.mangle(prefix));
    }
}
