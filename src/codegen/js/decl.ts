import { match } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Decl as JSDecl } from '../../ast/js/decl';
import { Expr as JSExpr } from '../../ast/js/expr';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { assert, panic } from '../../misc/utils';
import { JSScope } from './jsScope';
import { jsStmtOf } from './stmt';

export function jsOfDecl(decl: BitterDecl, scope: JSScope): JSDecl {
    const aux = (decl: BitterDecl): JSDecl[] => {
        return match(decl, {
            Module: ({ name, decls }) => {
                const moduleToStmt = (
                    name: string,
                    decls: BitterDecl[],
                    moduleScope: JSScope,
                ): { stmt: JSStmt } => {
                    scope.declare(name);
                    const members: { name: string }[] = [];

                    for (const decl of decls) {
                        match(decl, {
                            Stmt: ({ stmt }) => {
                                moduleScope.add(jsStmtOf(stmt, moduleScope));

                                if (stmt.variant === 'Let') {
                                    members.push({ name: stmt.name });
                                }
                            },
                            Module: ({ name, decls }) => {
                                const { stmt } = moduleToStmt(
                                    name,
                                    decls,
                                    moduleScope.realChild(),
                                );

                                moduleScope.add(stmt);
                                members.push({ name });
                            },
                            Type: () => {},
                            Struct: () => {},
                            Extend: ({ decls }) => {
                                for (const decl of decls) {
                                    if (decl.variant === 'Stmt') {
                                        const stmt = decl.stmt;
                                        moduleScope.add(
                                            jsStmtOf(stmt, moduleScope),
                                        );

                                        if (stmt.variant === 'Let') {
                                            members.push({ name: stmt.name });
                                        }
                                    }
                                }
                            },
                            Declare: ({ sig, attrs }) => {
                                match(sig, {
                                    Variable: ({ name }) => {
                                        moduleScope.declare(name, attrs.as);
                                    },
                                    Module: ({ name }) => {
                                        moduleScope.declare(name, attrs.as);
                                    },
                                    Type: () => {},
                                });
                            },
                            Import: ({ module, members }) => {
                                const moduleName = moduleScope.declare(module);

                                if (members) {
                                    for (const {
                                        name,
                                        native,
                                        kind,
                                    } of members) {
                                        if (
                                            kind === 'value' ||
                                            kind === 'module'
                                        ) {
                                            const memberName =
                                                moduleScope.declare(name);
                                            if (!native) {
                                                moduleScope.add(
                                                    JSStmt.Const({
                                                        name: memberName,
                                                        value: JSExpr.Dot(
                                                            JSExpr.Variable(
                                                                moduleName,
                                                            ),
                                                            name,
                                                        ),
                                                    }),
                                                );
                                            }
                                        }
                                    }
                                }
                            },
                            Enum: () => {},
                        });
                    }

                    const stmt = JSStmt.Const({
                        name: moduleScope.declare(name),
                        value: JSExpr.Call(
                            JSExpr.Closure({
                                args: [],
                                stmts: [
                                    ...moduleScope.statements,
                                    JSStmt.Return(
                                        JSExpr.Object({
                                            entries: members.map(member => ({
                                                key: member.name,
                                                value: JSExpr.Variable(
                                                    moduleScope.lookup(
                                                        member.name,
                                                    ),
                                                ),
                                            })),
                                        }),
                                    ),
                                ],
                            }),
                            [],
                        ),
                    });

                    return { stmt };
                };

                return [
                    JSDecl.Stmt(
                        moduleToStmt(name, decls, scope.realChild()).stmt,
                    ),
                ];
            },
            _: () => panic('Declaration outside of a module'),
        });
    };

    const decls = aux(decl);
    assert(decls.length === 1);
    return decls[0];
}
