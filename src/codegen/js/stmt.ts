import { match } from 'itsamatch';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { jsExprOf } from './expr';
import { JSScope } from './jsScope';

export const jsStmtOf = (bitter: BitterStmt, scope: JSScope): JSStmt => {
    return match(bitter, {
        Let: ({ mutable, name, value, attrs }) => {
            const declaredName = scope.declare(name, attrs.as);
            const jsValue = jsExprOf(value, scope);

            if (mutable) {
                return JSStmt.Let({ name: declaredName, value: jsValue });
            } else {
                return JSStmt.Const({ name: declaredName, value: jsValue });
            }
        },
        Expr: ({ expr }) => {
            const jsExpr = jsExprOf(expr, scope);
            return JSStmt.Expr(jsExpr);
        },
        Assign: ({ lhs, op, rhs }) => {
            const jsLhs = jsExprOf(lhs, scope);
            const jsRhs = jsExprOf(rhs, scope);
            return JSStmt.Assign(jsLhs, op, jsRhs);
        },
        While: ({ cond, body }) => {
            const jsCond = jsExprOf(cond, scope);
            const jsScope = scope.realChild();
            const stmts: JSStmt[] = [];

            for (const bitterStmt of body) {
                jsScope.clearStatements();
                const jsStmt = jsStmtOf(bitterStmt, jsScope);
                stmts.push(...jsScope.statements, jsStmt);
            }

            return JSStmt.While(jsCond, stmts);
        },
        For: ({ name, iterator, body }) => {
            const declaredName = scope.declare(name);
            const jsIterator = jsExprOf(iterator, scope);
            const jsScope = scope.realChild();
            const stmts: JSStmt[] = [];

            for (const bitterStmt of body) {
                jsScope.clearStatements();
                const jsStmt = jsStmtOf(bitterStmt, jsScope);
                stmts.push(...jsScope.statements, jsStmt);
            }

            return JSStmt.For(declaredName, jsIterator, stmts);
        },
        Return: ({ expr }) => {
            const jsExpr = jsExprOf(expr, scope);
            return JSStmt.Return(jsExpr);
        },
        Yield: ({ expr }) => {
            const jsExpr = jsExprOf(expr, scope);
            return JSStmt.Yield(jsExpr);
        },
        Break: () => JSStmt.Break(),
    });
};
