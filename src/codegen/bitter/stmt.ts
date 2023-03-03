import { match } from "itsamatch";
import { Stmt as BitterStmt } from "../../ast/bitter/stmt";
import { Stmt as SweetStmt } from "../../ast/sweet/stmt";
import { bitterExprOf } from "./expr";

export const bitterStmtOf = (sweet: SweetStmt): BitterStmt[] => match(sweet, {
    Let: ({ mutable, name, value }) => [BitterStmt.Let({
        mutable,
        name,
        value: bitterExprOf(value),
    })],
    Expr: ({ expr }) => [BitterStmt.Expr(bitterExprOf(expr))],
    _Many: ({ stmts }) => stmts.flatMap(bitterStmtOf),
});
