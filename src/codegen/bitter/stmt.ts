import { match } from 'itsamatch';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Stmt as SweetStmt } from '../../ast/sweet/stmt';
import { bitterExprOf } from './expr';

export const bitterStmtOf = (sweet: SweetStmt): BitterStmt[] =>
  match(sweet, {
    Let: ({ mutable, static: isStatic, name, value, attrs }) => [
      BitterStmt.Let({
        mutable,
        static: isStatic,
        name,
        value: bitterExprOf(value),
        attrs,
      }),
    ],
    Expr: ({ expr }) => [BitterStmt.Expr(bitterExprOf(expr))],
    Assign: ({ lhs, op, rhs }) => [BitterStmt.Assign(bitterExprOf(lhs), op, bitterExprOf(rhs))],
    While: ({ cond, body }) => [BitterStmt.While(bitterExprOf(cond), body.flatMap(bitterStmtOf))],
    For: ({ name, iterator, body }) => [
      BitterStmt.For(name, bitterExprOf(iterator.ref), body.flatMap(bitterStmtOf)),
    ],
    Return: ({ expr }) => [BitterStmt.Return(bitterExprOf(expr))],
    Yield: ({ expr }) => [BitterStmt.Yield(bitterExprOf(expr))],
    Break: () => [BitterStmt.Break()],
    _Many: ({ stmts }) => stmts.flatMap(bitterStmtOf),
  });
