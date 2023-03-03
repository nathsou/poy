import { match } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Decl as JSDecl } from '../../ast/js/decl';
import { Expr as JSExpr } from '../../ast/js/expr';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { TSType } from '../../ast/js/tsType';
import { assert } from '../../misc/utils';
import { jsStmtOf } from './stmt';

export function jsOfDecl(decl: BitterDecl): JSDecl {
    const aux = (decl: BitterDecl): JSDecl[] => {
        return match(decl, {
            Stmt: ({ stmt }) => [JSDecl.Stmt(jsStmtOf(stmt))],
            Module: ({ name, decls }) => {
                const moduleToStmt = (name: string, decls: BitterDecl[]): { stmt: JSStmt, ty: TSType } => {
                    const members: { name: string, ty: TSType }[] = [];
                    const stmts: JSStmt[] = [];

                    for (const decl of decls) {
                        match(decl, {
                            Stmt: ({ stmt }) => {
                                stmts.push(jsStmtOf(stmt));

                                if (stmt.variant === 'Let') {
                                    members.push({
                                        name: stmt.name,
                                        ty: TSType.from(stmt.value.ty)
                                    });
                                }
                            },
                            Module: ({ name, decls }) => {
                                const { stmt, ty } = moduleToStmt(name, decls);
                                stmts.push(stmt);
                                members.push({ name, ty });
                            },
                            Type: () => { },
                        });

                    }
                    const exportObjectTy = TSType.Record({
                        fields: Object.fromEntries(members.map(({ name, ty }) => [name, ty])),
                    });

                    const stmt = JSStmt.Let({
                        const_: true,
                        name,
                        value: JSExpr.Closure({
                            args: [],
                            stmts: [
                                ...stmts,
                                JSStmt.Return(JSExpr.Object({
                                    entries: members.map(member => ({
                                        key: member.name,
                                        value: JSExpr.Variable(member.name, member.ty),
                                    })),
                                    ty: exportObjectTy,
                                })),
                            ],
                            ty: exportObjectTy,
                        }),
                    });

                    return { stmt, ty: exportObjectTy };
                };

                return [JSDecl.Stmt(moduleToStmt(name, decls).stmt)];
            },
            Type: () => [],
        });
    };

    const decls = aux(decl);
    assert(decls.length === 1);
    return decls[0];
}
