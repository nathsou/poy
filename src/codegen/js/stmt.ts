import { match } from 'itsamatch';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { jsExprOf } from './expr';
import { JSScope } from './jsScope';

export const jsStmtOf = (bitter: BitterStmt, scope: JSScope): JSStmt => {
    return match(bitter, {
        Let: ({ mutable, name, value }) => {
            const declaredName = scope.declare(name);
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
        Assign: ({ lhs, rhs }) => {
            const jsLhs = jsExprOf(lhs, scope);
            const jsRhs = jsExprOf(rhs, scope);
            return JSStmt.Assign(jsLhs, jsRhs);
        },
    });
}
