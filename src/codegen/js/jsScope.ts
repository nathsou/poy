import { Stmt } from '../../ast/js/stmt';
import { assert, panic } from '../../misc/utils';
import { sanitizeKeyword } from './normalize';

export type Name = {
  name: string;
  mangled: string;
  isNative: boolean;
};

// virtual scopes represent poy scopes like block expressions
// which do not compile to an actual JS scope
// adding a linearized statement to a virtual scope
// will add it to the closest real parent scope
export class JSScope {
  protected stmts: Stmt[];
  members = new Map<string, Name>();
  private parent?: JSScope;
  usedNames: Set<string>;
  imports: {
    pub: boolean;
    module: string;
    scope: JSScope;
    members: Set<string>;
    usedMembers: Name[];
  }[] = [];
  static topLevelModules = new Map<string, JSScope>();

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

    if (this.isShadowing(mangledName)) {
      return this.mangle(name, tries + 1);
    }

    return sanitizeKeyword(mangledName);
  }

  public declare(name: string, isNative = false, as_?: string): Name {
    if (this.members.has(name)) {
      throw new Error(`Member '${name}' already declared`);
    }

    const mangled = as_ ?? this.mangle(name);
    const result = { name, mangled, isNative };
    this.members.set(name, result);
    this.usedNames.add(mangled);

    return result;
  }

  public has(name: string): boolean {
    return this.usedNames.has(name);
  }

  public isShadowing(name: string): boolean {
    return (
      this.has(name) ||
      this.imports.some(
        imp =>
          ((imp.members.size === 0 || imp.members.has(name)) && imp.scope.has(name)) ||
          imp.scope.imports.some(
            exp =>
              exp.pub && (exp.members.size === 0 || exp.members.has(name)) && exp.scope.has(name),
          ),
      ) ||
      (this.parent?.isShadowing(name) ?? false)
    );
  }

  public lookup(name: string): Name {
    if (this.members.has(name)) {
      return this.members.get(name)!;
    }

    for (const imp of this.imports) {
      if ((imp.members.size === 0 || imp.members.has(name)) && imp.scope.has(name)) {
        const res = imp.scope.lookup(name);
        if (!res.isNative && !imp.usedMembers.some(m => m.name === res.name)) {
          imp.usedMembers.push(res);
        }

        return res;
      }

      // lookup public imports of the imported module (i.e. re-exports)
      // TODO: recurse to support nested re-exports
      for (const exp of imp.scope.imports) {
        if (
          exp.pub &&
          (exp.members.size === 0 || exp.members.has(name)) &&
          exp.scope.has(name)
        ) {
          const res = exp.scope.lookup(name);

          if (!res.isNative) {
            if (!imp.usedMembers.some(m => m.name === res.name)) {
              imp.usedMembers.push(res);
            }

            if (!exp.usedMembers.some(m => m.name === res.name)) {
              exp.usedMembers.push(res);
            }
          }

          return res;
        }
      }
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
