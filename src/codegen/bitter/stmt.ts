import { match } from 'itsamatch';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Stmt as SweetStmt } from '../../ast/sweet/stmt';
import { bitterExprOf } from './expr';
import { Pattern } from '../../ast/sweet/pattern';
import { array } from '../../misc/utils';
import { Occurrence } from '../decision-trees/ClauseMatrix';

export const bitterStmtOf = (sweet: SweetStmt): BitterStmt[] =>
  match(sweet, {
    Let: ({ pub, mutable, static: isStatic, lhs, value, attrs }) => {
      const decls = array<BitterStmt>();

      for (const [name, occ] of Pattern.variableOccurrences(lhs).shared) {
        decls.push(
          BitterStmt.Let({
            pub,
            mutable,
            static: isStatic,
            name,
            value: bitterExprOf(Occurrence.toExpr(occ, value)),
            attrs,
          }),
        );
      }

      return decls;
    },
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
