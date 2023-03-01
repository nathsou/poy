import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Expr as SweetExpr } from '../../ast/sweet/expr';
import { assert } from '../../misc/utils';
import { bitterStmtOf } from './stmt';

export function bitterExprOf(sweet: SweetExpr): BitterExpr {
    assert(sweet.ty != null);
    const ty = sweet.ty!;

    return match(sweet, {
        Literal: ({ literal }) => BitterExpr.Literal(literal, ty),
        Variable: name => BitterExpr.Variable({ name, ty }),
        Unary: ({ op, expr }) => BitterExpr.Unary({ op, expr: bitterExprOf(expr), ty }),
        Binary: ({ lhs, op, rhs }) => BitterExpr.Binary({
            lhs: bitterExprOf(lhs),
            op,
            rhs: bitterExprOf(rhs),
            ty
        }),
        Block: ({ stmts }) => BitterExpr.Block({ stmts: stmts.map(bitterStmtOf), ty }),
        If: ({ cond, then, otherwise }) => BitterExpr.If({
            cond: bitterExprOf(cond),
            then: bitterExprOf(then),
            otherwise: bitterExprOf(otherwise),
            ty
        }),
        Tuple: ({ elems }) => BitterExpr.Tuple({ elems: elems.map(bitterExprOf), ty }),
        Array: ({ elems }) => BitterExpr.Array({ elems: elems.map(bitterExprOf), ty }),
        UseIn: ({ name, value, rhs }) => BitterExpr.UseIn({
            name,
            value: bitterExprOf(value),
            rhs: bitterExprOf(rhs),
            ty
        }),
        Fun: ({ args, body }) => BitterExpr.Fun({
            args: args.map(arg => ({ name: arg.name, ty: arg.ann! })),
            body: bitterExprOf(body),
            ty,
        }),
        Call: ({ fun, args }) => BitterExpr.Call({ fun: bitterExprOf(fun), args: args.map(bitterExprOf), ty }),
    });
}
