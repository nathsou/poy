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
    private letLevel = 0;

    constructor(parent?: TypeEnv) {
        this.variables = new Scope(parent?.variables);
        this.modules = new Scope(parent?.modules);
        this.typeRules = TRS.create(parent?.typeRules);
    }

    public child(): TypeEnv {
        return new TypeEnv(this);
    }

    private inferLet(mutable: boolean, name: string, value: Expr): Type {
        this.letLevel += 1;
        const ty = this.inferExpr(value);
        this.variables.declare(name, { mutable, ty });
        this.letLevel -= 1;

        return ty;
    }

    public inferDecl(decl: Decl): void {
        match(decl, {
            Let: (decl) => this.inferLet(decl.mutable, decl.name, decl.value),
            Fun: ({ name, args, body }) => {
                this.inferLet(false, name, Expr.Fun({ args, body }));
            },
            Type: ({ lhs, rhs }) => {
                TRS.add(this.typeRules, lhs, rhs);
            },
            Module: ({ name, decls }) => {
                const moduleEnv = this.child();
                this.modules.declare(name, moduleEnv);

                for (const decl of decls) {
                    moduleEnv.inferDecl(decl);
                }
            },
        });
    }

    public inferStmt(stmt: Stmt): void {
        match(stmt, {
            Expr: ({ expr }) => {
                this.inferExpr(expr);
            },
            Let: ({ mutable, name, value }) => {
                this.inferLet(mutable, name, value);
            },
        });
    }

    public inferExpr(expr: Expr): Type {
        if (expr.ty) return expr.ty;

        const ty = match(expr, {
            Literal: ({ literal }) => Type[literal.variant],
            Variable: name => this.variables.lookup(name).match({
                Some: ({ ty }) => ty,
                None: () => panic(`Variable ${name} not found`),
            }),
            Unary: ({ op, expr }) => {
                const exprTy = this.inferExpr(expr);
                const UNARY_OP_TYPE: Record<UnaryOp, Type> = {
                    '!': Type.Bool,
                    '-': Type.Num,
                    '+': Type.Num,
                };

                Type.unify(exprTy, UNARY_OP_TYPE[op]);

                return exprTy;
            },
            Binary: ({ lhs, op, rhs }) => {
                const lhsTy = this.inferExpr(lhs);
                const rhsTy = this.inferExpr(rhs);

                const BINARY_OP_TYPE: Record<BinaryOp, [Type, Type]> = {
                    '+': [Type.Num, Type.Num],
                    '-': [Type.Num, Type.Num],
                    '*': [Type.Num, Type.Num],
                    '/': [Type.Num, Type.Num],
                    '%': [Type.Num, Type.Num],
                    '**': [Type.Num, Type.Num],
                    '==': [Type.Var(TypeVar.Generic({ id: 0 })), Type.Var(TypeVar.Generic({ id: 0 }))],
                    '!=': [Type.Var(TypeVar.Generic({ id: 0 })), Type.Var(TypeVar.Generic({ id: 0 }))],
                    '<': [Type.Num, Type.Num],
                    '>': [Type.Num, Type.Num],
                    '<=': [Type.Num, Type.Num],
                    '>=': [Type.Num, Type.Num],
                    '&&': [Type.Bool, Type.Bool],
                    '||': [Type.Bool, Type.Bool],
                    '&': [Type.Num, Type.Num],
                    '|': [Type.Num, Type.Num],
                };

                const [lhsExpected, rhsExpected] = BINARY_OP_TYPE[op];
                Type.unify(lhsTy, lhsExpected);
                Type.unify(rhsTy, rhsExpected);

                return lhsTy;
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
                const elemTy = Type.fresh(this.letLevel);

                for (const elem of elems) {
                    Type.unify(elemTy, this.inferExpr(elem));
                }

                return Type.Array(elemTy);
            },
            Fun: ({ args, body }) => {
                const funEnv = this.child();
                const argTys = args.map(() => Type.fresh(this.letLevel));

                args.forEach((arg, i) => {
                    funEnv.variables.declare(arg, {
                        mutable: false,
                        ty: argTys[i],
                    });
                });

                const bodyTy = funEnv.inferExpr(body);

                return Type.Function(argTys, bodyTy);
            },
            Call: ({ fun, args }) => {
                const funTy = this.inferExpr(fun);
                const argTys = args.map(arg => this.inferExpr(arg));
                const retTy = Type.fresh(this.letLevel);
                const expectedFunTy = Type.Function(argTys, retTy);
                Type.unify(funTy, expectedFunTy);

                return retTy;
            },
            If: ({ cond, then, otherwise }) => {
                Type.unify(this.inferExpr(cond), Type.Bool);
                const thenTy = this.inferExpr(then);
                const elseTy = this.inferExpr(otherwise);
                Type.unify(thenTy, elseTy);

                return thenTy;
            },
            Tuple: ({ elems }) => {
                const elemTys = elems.map(elem => this.inferExpr(elem));
                return Type.Tuple(elemTys);
            },
            UseIn: ({ name, value, rhs }) => {
                const rhsEnv = this.child();
                rhsEnv.inferLet(false, name, value);
                return rhsEnv.inferExpr(rhs);
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
