import { match } from "itsamatch";
import { Decl } from "../ast/sweet/decl";
import { Expr } from "../ast/sweet/expr";
import { Stmt } from "../ast/sweet/stmt";
import { Scope } from "../misc/scope";
import { panic } from "../misc/utils";
import { BinaryOp, UnaryOp } from "../parse/token";
import { TRS } from "./rewrite";
import { Type, TypeVar } from "./type";

export class TypeEnv {
    public variables: Scope<{ mutable: boolean, ty: Type }>;
    public modules: Scope<TypeEnv>;
    public typeRules: TRS;
    private letLevel: number;

    constructor(parent?: TypeEnv) {
        this.variables = new Scope(parent?.variables);
        this.modules = new Scope(parent?.modules);
        this.typeRules = TRS.create(parent?.typeRules);
        this.letLevel = parent?.letLevel ?? 0;
    }

    public child(): TypeEnv {
        return new TypeEnv(this);
    }

    public freshType(): Type {
        return Type.fresh(this.letLevel);
    }

    private unify(s: Type, t: Type): void {
        const unifiable = Type.unify(
            TRS.normalize(this.typeRules, s),
            TRS.normalize(this.typeRules, t),
        );

        if (!unifiable) {
            panic(`Cannot unify '${Type.show(s)}' with '${Type.show(t)}'`);
        }
    }

    private inferLet(mutable: boolean, name: string, ann: Type | undefined, value: Expr): Type {
        this.letLevel += 1;
        const rhsEnv = this.child();
        const freshTy = rhsEnv.freshType();
        rhsEnv.variables.declare(name, { mutable, ty: freshTy });
        const ty = rhsEnv.inferExpr(value);
        this.unify(ty, freshTy);
        this.letLevel -= 1;

        if (ann) {
            this.unify(ann, ty);
        }

        // https://en.wikipedia.org/wiki/Value_restriction
        const genTy = mutable ? ty : Type.generalize(ty, this.letLevel);
        this.variables.declare(name, { mutable, ty: genTy });

        return genTy;
    }

    public inferDecl(decl: Decl): void {
        match(decl, {
            Stmt: ({ stmt }) => {
                this.inferStmt(stmt);
            },
            Type: ({ lhs, rhs }) => {
                TRS.add(this.typeRules, lhs, rhs);
            },
            Declare: ({ sig }) => match(sig, {
                Variable: ({ mutable, name, ty }) => {
                    const genTy = mutable ? ty : Type.generalize(ty, this.letLevel);
                    this.variables.declare(name, { mutable, ty: genTy });
                },
                Module: ({ name, signatures }) => {
                    const moduleEnv = this.child();
                    this.modules.declare(name, moduleEnv);

                    for (const sig of signatures) {
                        moduleEnv.inferDecl(Decl.Declare(sig));
                    }
                },
                Type: ({ lhs, rhs }) => {
                    TRS.add(this.typeRules, lhs, rhs);
                },
            }),
            Module: ({ name, decls }) => {
                const moduleEnv = this.child();
                this.modules.declare(name, moduleEnv);

                for (const decl of decls) {
                    moduleEnv.inferDecl(decl);
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
            Let: ({ mutable, name, ann, value }) => {
                this.inferLet(mutable, name, ann, value);
            },
            Assign: ({ lhs, rhs }) => {
                const lhsTy = this.inferExpr(lhs);
                const rhsTy = this.inferExpr(rhs);
                this.unify(lhsTy, rhsTy);
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

                args.forEach(({ name }, i) => {
                    funEnv.variables.declare(name, {
                        mutable: false,
                        ty: argTys[i],
                    });

                    args[i].ann = argTys[i];
                });

                const bodyTy = funEnv.inferExpr(body);
                if (ret) {
                    this.unify(bodyTy, ret);
                }

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
                const elseTy = this.inferExpr(otherwise);
                this.unify(thenTy, elseTy);

                return thenTy;
            },
            Tuple: ({ elems }) => {
                const elemTys = elems.map(elem => this.inferExpr(elem));
                return Type.Tuple(elemTys);
            },
            UseIn: ({ name, ann, value, rhs }) => {
                const rhsEnv = this.child();
                rhsEnv.inferLet(false, name, ann, value);
                return rhsEnv.inferExpr(rhs);
            },
            Path: ({ path, member }) => {
                let mod: TypeEnv = this;

                for (const name of path) {
                    mod = mod.modules.lookup(name).unwrap();
                }

                return mod.variables.lookup(member).unwrap().ty;
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
            this.modules.show(env => env.show(indent + 1)),
        ].map(str => '  '.repeat(indent) + str).join('\n');
    }
}
