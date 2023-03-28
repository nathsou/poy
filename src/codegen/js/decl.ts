import { match } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Decl as JSDecl } from '../../ast/js/decl';
import { Expr as JSExpr } from '../../ast/js/expr';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { TSType } from '../../ast/js/tsType';
import { assert, panic } from '../../misc/utils';
import { JSScope } from './jsScope';
import { jsStmtOf } from './stmt';

export function jsOfDecl(decl: BitterDecl, scope: JSScope): JSDecl {
    const aux = (decl: BitterDecl): JSDecl[] => {
        return match(decl, {
            Module: ({ name, decls }) => {
                const moduleToStmt = (name: string, decls: BitterDecl[]): { stmt: JSStmt, ty: TSType } => {
                    scope.declare(name);
                    const members: { name: string, ty: TSType }[] = [];
                    const moduleScope = scope.realChild();

                    for (const decl of decls) {
                        match(decl, {
                            Stmt: ({ stmt }) => {
                                moduleScope.add(jsStmtOf(stmt, moduleScope));

                                if (stmt.variant === 'Let') {
                                    members.push({
                                        name: stmt.name,
                                        ty: TSType.from(stmt.value.ty)
                                    });
                                }
                            },
                            Module: ({ name, decls }) => {
                                const { stmt, ty } = moduleToStmt(name, decls);
                                moduleScope.add(stmt);
                                members.push({ name, ty });
                            },
                            Type: () => { },
                            Struct: () => { },
                            Extend: ({ decls }) => {
                                for (const decl of decls) {
                                    if (decl.variant === 'Stmt') {
                                        const stmt = decl.stmt;
                                        moduleScope.add(jsStmtOf(stmt, moduleScope));

                                        if (stmt.variant === 'Let') {
                                            members.push({
                                                name: stmt.name,
                                                ty: TSType.from(stmt.value.ty)
                                            });
                                        }
                                    }
                                }
                            },
                            Declare: ({ sig }) => {
                                match(sig, {
                                    Variable: ({ name }) => {
                                        moduleScope.declare(name);
                                    },
                                    Module: ({ name }) => {
                                        moduleScope.declare(name);
                                    },
                                    Type: () => { },
                                });
                            },
                            Import: ({ module, members }) => {
                                const moduleName = moduleScope.declare(module);

                                if (members) {
                                    for (const { name, native, kind } of members) {
                                        if (kind === 'value' || kind === 'module') {
                                            const memberName = moduleScope.declare(name);
                                            if (!native) {
                                                moduleScope.add(JSStmt.Const({
                                                    name: memberName,
                                                    value: JSExpr.Dot(
                                                        JSExpr.Variable(moduleName, TSType.Any()),
                                                        name,
                                                    ),
                                                }));
                                            }
                                        }
                                    }
                                }
                            },
                        });
                    }
                    const exportObjectTy = TSType.Record({
                        fields: Object.fromEntries(members.map(({ name, ty }) => [name, ty])),
                    });

                    const stmt = JSStmt.Const({
                        name: moduleScope.declare(name),
                        value: JSExpr.Call(
                            JSExpr.Closure({
                                args: [],
                                stmts: [
                                    ...moduleScope.statements,
                                    JSStmt.Return(JSExpr.Object({
                                        entries: members.map(member => ({
                                            key: member.name,
                                            value: JSExpr.Variable(moduleScope.lookup(member.name), member.ty),
                                        })),
                                        ty: exportObjectTy,
                                    })),
                                ],
                                ty: exportObjectTy,
                            }),
                            [],
                        ),
                    });

                    return { stmt, ty: exportObjectTy };
                };

                return [JSDecl.Stmt(moduleToStmt(name, decls).stmt)];
            },
            _: () => panic('Declaration outside of a module'),
        });
    };

    const decls = aux(decl);
    assert(decls.length === 1);
    return decls[0];
}
