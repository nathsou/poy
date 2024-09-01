import { match } from 'itsamatch';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Stmt as SweetStmt } from '../../ast/sweet/stmt';
import { bitterExprOf } from './expr';
import { Pattern } from '../../ast/sweet/pattern';
import { array } from '../../misc/utils';
import { Occurrence } from '../decision-trees/ClauseMatrix';
import { TypeEnv } from '../../infer/infer';

export const bitterStmtOf = (sweet: SweetStmt, env: TypeEnv): BitterStmt[] => {
  return match(sweet, {
    Let: ({ pub, mutable, static: isStatic, lhs, value, attrs }) => {
      const decls = array<BitterStmt>();

      for (const [name, occ] of Pattern.variableOccurrences(lhs)) {
        decls.push(
          BitterStmt.Let({
            pub,
            mutable,
            static: isStatic,
            name,
            value: bitterExprOf(Occurrence.toExpr(occ, value), env),
            attrs,
          }),
        );
      }

      return decls;
    },
    Expr: ({ expr }) => [BitterStmt.Expr(bitterExprOf(expr, env))],
    Assign: ({ lhs, op, rhs }) => [BitterStmt.Assign(bitterExprOf(lhs, env), op, bitterExprOf(rhs, env))],
    While: ({ cond, body }) => [BitterStmt.While(bitterExprOf(cond, env), body.flatMap(expr => bitterStmtOf(expr, env)))],
    For: ({ name, iterator, body }) => [
      BitterStmt.For(name, bitterExprOf(iterator.ref, env), body.flatMap(expr => bitterStmtOf(expr, env))),
    ],
    Return: ({ expr }) => [BitterStmt.Return(bitterExprOf(expr, env))],
    Yield: ({ expr }) => [BitterStmt.Yield(bitterExprOf(expr, env))],
    Break: () => [BitterStmt.Break()],
    _Many: ({ stmts }) => stmts.flatMap(expr => bitterStmtOf(expr, env)),
  });
};
