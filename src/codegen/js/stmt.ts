import { match } from 'itsamatch';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { jsExprOf } from './expr';

export const jsStmtOf = (bitter: BitterStmt): JSStmt => {
    return match(bitter, {
        Let: ({ mutable, name, value }) => JSStmt.Let({ const_: !mutable, name, value: jsExprOf(value) }),
        Expr: ({ expr }) => JSStmt.Expr(jsExprOf(expr)),
    });
}
