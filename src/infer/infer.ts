import { match } from "itsamatch";
import { Decl } from "../ast/sweet/decl";
import { Expr } from "../ast/sweet/expr";
import { Stmt } from "../ast/sweet/stmt";
import { Maybe } from "../misc/maybe";
import { Scope } from "../misc/scope";
import { last, panic } from "../misc/utils";
import { AssignmentOp, BinaryOp, UnaryOp } from "../parse/token";
import { Module, ModulePath, Resolver } from "../resolve/resolve";
import { TRS } from "./rewrite";
import { Type, TypeVar } from "./type";

type VarInfo = { pub: boolean, mutable: boolean, ty: Type };
type ModuleInfo = Module & { local: boolean };

export class TypeEnv {
    public variables: Scope<VarInfo>;
    public modules: Scope<ModuleInfo>;
    public typeRules: TRS;
    private typeImports: Map<string, ModulePath>;
    private letLevel: number;
    private functionStack: Type[];
    private resolver: Resolver;
    private modulePath: string;
    private moduleName: string;

    constructor(resolver: Resolver, modulePath: string, moduleName: string, parent?: TypeEnv) {
        this.resolver = resolver;
        this.variables = new Scope(parent?.variables);
        this.modules = new Scope(parent?.modules);
        this.typeRules = TRS.create(parent?.typeRules);
        this.typeImports = new Map(parent?.typeImports);
        this.letLevel = parent?.letLevel ?? 0;
        this.functionStack = [...parent?.functionStack ?? []];
        this.modulePath = modulePath;
        this.moduleName = moduleName;
    }

    public child(): TypeEnv {
        return new TypeEnv(this.resolver, this.modulePath, this.modulePath, this);
    }

    public freshType(): Type {
        return Type.fresh(this.letLevel);
    }

    public normalize(ty: Type): Type {
        return TRS.normalize(this, ty);
    }

    private unify(s: Type, t: Type): void {
        const unifiable = Type.unify(this.normalize(s), this.normalize(t));

        if (!unifiable) {
            panic(`Cannot unify '${Type.show(s)}' with '${Type.show(t)}'`);
        }
    }

    private inferLet(
        pub: boolean,
        mutable: boolean,
        name: string,
        ann: Type | undefined,
        value: Expr
    ): Type {
        this.letLevel += 1;
        const rhsEnv = this.child();
        const freshTy = rhsEnv.freshType();
        rhsEnv.variables.declare(name, { pub, mutable, ty: freshTy });
        const ty = rhsEnv.inferExpr(value);
        this.unify(ty, freshTy);
        this.letLevel -= 1;

        if (ann) {
            this.unify(ann, ty);
        }

        // https://en.wikipedia.org/wiki/Value_restriction
        const genTy = mutable ? ty : Type.generalize(ty, this.letLevel);
        this.variables.declare(name, { pub, mutable, ty: genTy });

        return genTy;
    }

    public async inferDecl(decl: Decl): Promise<void> {
        await match(decl, {
            Stmt: ({ stmt }) => {
                this.inferStmt(stmt);
            },
            Type: ({ pub, lhs, rhs }) => {
                TRS.add(
                    this.typeRules,
                    this.resolveType(lhs),
                    this.resolveType(rhs),
                    pub
                );
            },
            Declare: ({ sig }) => match(sig, {
                Variable: ({ mutable, name, ty }) => {
                    const genTy = mutable ? ty : Type.generalize(ty, this.letLevel);
                    this.variables.declare(name, { pub: true, mutable, ty: genTy });
                },
                Module: ({ name, signatures }) => {
                    const moduleEnv = this.child();
                    const decls = signatures.map(sig => Decl.Declare(sig));
                    this.modules.declare(name, {
                        pub: true,
                        local: true,
                        name,
                        env: moduleEnv,
                        decls
                    });

                    for (const decl of decls) {
                        moduleEnv.inferDecl(decl);
                    }
                },
                Type: ({ pub, lhs, rhs }) => {
                    TRS.add(
                        this.typeRules,
                        this.resolveType(lhs),
                        this.resolveType(rhs),
                        pub
                    );
                },
            }),
            Module: ({ pub, name, decls }) => {
                const moduleEnv = this.child();
                this.modules.declare(name, { pub, local: true, name, env: moduleEnv, decls });

                for (const decl of decls) {
                    moduleEnv.inferDecl(decl);
                }
            },
            Import: async ({ path, module, members }) => {
                const moduleDir = this.resolver.fs.directoryName(this.modulePath);
                const fullPath = this.resolver.fs.join(moduleDir, ...path, `${module}.poy`);
                const mod = await this.resolver.resolve(fullPath);

                this.modules.declare(module, { ...mod, local: false });

                if (members) {
                    for (const member of members) {
                        const name = member.name;
                        mod.env.variables.lookup(name).match({
                            Some: ({ pub, mutable, ty }) => {
                                member.kind = 'value';

                                if (pub) {
                                    this.variables.declare(name, { pub, mutable, ty });
                                } else {
                                    panic(`Cannot import private variable '${name}' from module '${module}'`);
                                }
                            },
                            None: () => {
                                mod.env.modules.lookup(name).match({
                                    Some: (module) => {
                                        member.kind = 'module';

                                        if (module.pub) {
                                            this.modules.declare(name, { ...module, local: false });
                                        } else {
                                            panic(`Cannot import private module '${name}' from module '${module}'`);
                                        }
                                    },
                                    None: () => {
                                        Maybe.wrap(mod.env.typeRules.get(name)).match({
                                            Some: rules => {
                                                member.kind = 'type';

                                                const somePubRules = rules.some(rule => rule.pub);
                                                const somePrivateRules = rules.some(rule => !rule.pub);
                                                if (somePubRules && somePrivateRules) {
                                                    panic(`Cannot import partially public type '${name}' from module '${module}'`);
                                                }

                                                if (somePrivateRules) {
                                                    panic(`Cannot import private type '${name}' from module '${module}'`);
                                                }

                                                this.typeImports.set(name, { file: fullPath, subpath: path });
                                            },
                                            None: () => panic(`Cannot find member '${name}' in module '${module}'`),
                                        });
                                    },
                                });
                            },
                        });
                    }
                }
            },
            _Many: ({ decls }) => {
                for (const decl of decls) {
                    this.inferDecl(decl);
                }
            },
        });
    }

    public inferStmt(stmt: Stmt): void {
        match(stmt, {
            Expr: ({ expr }) => {
                this.inferExpr(expr);
            },
            Let: ({ pub, mutable, name, ann, value }) => {
                this.inferLet(pub, mutable, name, ann, value);
            },
            Assign: ({ lhs, op, rhs }) => {
                const alpha = Type.Var(TypeVar.Generic({ id: 0 }));
                const ASSIGNMENT_OP_TYPE: Record<AssignmentOp, [Type, Type]> = {
                    '=': [alpha, alpha],
                    '+=': [Type.Num, Type.Num],
                    '-=': [Type.Num, Type.Num],
                    '*=': [Type.Num, Type.Num],
                    '/=': [Type.Num, Type.Num],
                    '%=': [Type.Num, Type.Num],
                    '**=': [Type.Num, Type.Num],
                    '||=': [Type.Num, Type.Num],
                    '&&=': [Type.Num, Type.Num],
                    '|=': [Type.Num, Type.Num],
                    '&=': [Type.Num, Type.Num],
                };

                const [expectedLhsTy, expectedRhsTy] = ASSIGNMENT_OP_TYPE[op].map(Type.instantiate);

                const lhsTy = this.inferExpr(lhs);
                const rhsTy = this.inferExpr(rhs);

                this.unify(lhsTy, expectedLhsTy);
                this.unify(rhsTy, expectedRhsTy);

                this.unify(lhsTy, rhsTy);
            },
            While: ({ cond, body }) => {
                this.unify(this.inferExpr(cond), Type.Bool);

                const bodyEnv = this.child();
                for (const stmt of body) {
                    bodyEnv.inferStmt(stmt);
                }
            },
            Return: ({ expr }) => {
                if (this.functionStack.length === 0) {
                    panic('Return statement used outside of a function body');
                }

                const funReturnTy = last(this.functionStack);
                const exprTy = this.inferExpr(expr);
                this.unify(funReturnTy, exprTy);
            },
            _Many: ({ stmts }) => {
                for (const stmt of stmts) {
                    this.inferStmt(stmt);
                }
            },
        });
    }

    public inferExpr(expr: Expr): Type {
        if (expr.ty) return expr.ty;

        const ty = match(expr, {
            Literal: ({ literal }) => Type[literal.variant],
            Variable: name => this.variables.lookup(name).match({
                Some: ({ ty }) => Type.instantiate(ty, this.letLevel),
                None: () => panic(`Variable ${name} not found`),
            }),
            Unary: ({ op, expr }) => {
                const exprTy = this.inferExpr(expr);
                const UNARY_OP_TYPE: Record<UnaryOp, Type> = {
                    '!': Type.Bool,
                    '-': Type.Num,
                    '+': Type.Num,
                };

                this.unify(exprTy, UNARY_OP_TYPE[op]);

                return exprTy;
            },
            Binary: ({ lhs, op, rhs }) => {
                const lhsTy = this.inferExpr(lhs);
                const rhsTy = this.inferExpr(rhs);

                const BINARY_OP_TYPE: Record<BinaryOp, [Type, Type, Type]> = {
                    '+': [Type.Num, Type.Num, Type.Num],
                    '-': [Type.Num, Type.Num, Type.Num],
                    '*': [Type.Num, Type.Num, Type.Num],
                    '/': [Type.Num, Type.Num, Type.Num],
                    '%': [Type.Num, Type.Num, Type.Num],
                    '**': [Type.Num, Type.Num, Type.Num],
                    '==': [Type.Var(TypeVar.Generic({ id: 0 })), Type.Var(TypeVar.Generic({ id: 0 })), Type.Bool],
                    '!=': [Type.Var(TypeVar.Generic({ id: 0 })), Type.Var(TypeVar.Generic({ id: 0 })), Type.Bool],
                    '<': [Type.Num, Type.Num, Type.Bool],
                    '>': [Type.Num, Type.Num, Type.Bool],
                    '<=': [Type.Num, Type.Num, Type.Bool],
                    '>=': [Type.Num, Type.Num, Type.Bool],
                    '&&': [Type.Bool, Type.Bool, Type.Bool],
                    '||': [Type.Bool, Type.Bool, Type.Bool],
                    '&': [Type.Num, Type.Num, Type.Num],
                    '|': [Type.Num, Type.Num, Type.Num],
                };

                const [lhsExpected, rhsExpected, retTy] = BINARY_OP_TYPE[op].map(Type.instantiate);
                this.unify(lhsTy, lhsExpected);
                this.unify(rhsTy, rhsExpected);

                return retTy;
            },
            Block: ({ stmts, ret }) => {
                const blockEnv = this.child();

                for (const stmt of stmts) {
                    blockEnv.inferStmt(stmt);
                }

                if (ret) {
                    return blockEnv.inferExpr(ret);
                } else {
                    return Type.Unit;
                }
            },
            Array: ({ elems }) => {
                const elemTy = this.freshType();

                for (const elem of elems) {
                    this.unify(elemTy, this.inferExpr(elem));
                }

                return Type.Array(elemTy);
            },
            Fun: ({ args, ret, body }) => {
                const funEnv = this.child();
                const argTys = args.map(arg => arg.ann ?? this.freshType());
                const returnTy = ret ?? this.freshType();
                funEnv.functionStack.push(returnTy);

                args.forEach(({ name }, i) => {
                    funEnv.variables.declare(name, {
                        pub: false,
                        mutable: false,
                        ty: argTys[i],
                    });

                    args[i].ann = argTys[i];
                });

                const bodyTy = funEnv.inferExpr(body);
                this.unify(bodyTy, returnTy);
                funEnv.functionStack.pop();

                return Type.Function(argTys, bodyTy);
            },
            Call: ({ fun, args }) => {
                const funTy = this.inferExpr(fun);
                const argTys = args.map(arg => this.inferExpr(arg));
                const retTy = this.freshType();
                const expectedFunTy = Type.Function(argTys, retTy);
                this.unify(funTy, expectedFunTy);

                return retTy;
            },
            If: ({ cond, then, otherwise }) => {
                this.unify(this.inferExpr(cond), Type.Bool);
                const thenTy = this.inferExpr(then);

                if (otherwise) {
                    const elseTy = this.inferExpr(otherwise);
                    this.unify(thenTy, elseTy);
                } else {
                    this.unify(thenTy, Type.Unit);
                }

                return thenTy;
            },
            Tuple: ({ elems }) => {
                const elemTys = elems.map(elem => this.inferExpr(elem));
                return Type.Tuple(elemTys);
            },
            UseIn: ({ name, ann, value, rhs }) => {
                const rhsEnv = this.child();
                rhsEnv.inferLet(false, false, name, ann, value);
                return rhsEnv.inferExpr(rhs);
            },
            Path: ({ path, member }) => {
                let mod: ModuleInfo = {
                    pub: true,
                    local: true,
                    name: this.moduleName,
                    env: this,
                    decls: [],
                };

                path.forEach((name, index) => {
                    mod = mod.env.modules.lookup(name).unwrap();

                    if (!mod.local && !mod.pub) {
                        panic(`Module ${path.slice(0, index).join('.')} is private`);
                    }
                });

                const { pub, ty } = mod.env.variables.lookup(member).unwrap();

                if (!mod.local && !pub) {
                    panic(`Member ${path.join('.')}.${member} is private`);
                }

                return ty;
            },
        });

        expr.ty = ty;
        return ty;
    }

    public show(indent = 0): string {
        return '\n' + [
            'Variables:',
            this.variables.show(({ ty }) => Type.show(ty)),
            'Modules:',
            this.modules.show(({ env }) => env.show(indent + 1)),
        ].map(str => '  '.repeat(indent) + str).join('\n');
    }

    public resolveModuleEnv(file: string, subpath?: string[]): TypeEnv {
        let env = file === this.modulePath ? this : this.resolver.modules.get(file)!.env;

        if (subpath) {
            subpath.forEach(name => {
                env = env.modules.lookup(name).unwrap(`Module ${name} not found`).env;
            });
        }

        return env;
    }

    public resolveType(ty: Type): Type {
        return Type.rewrite(ty, t => match(t, {
            Var: v => v,
            Fun: ({ name, args, path }) => Type.Fun(
                name,
                args.map(arg => this.resolveType(arg)),
                this.typeRules.has(name) ? path : this.typeImports.get(name) ?? path,
            ),
        }));
    }
}
