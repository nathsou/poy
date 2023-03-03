import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Expr as JSExpr } from '../../ast/js/expr';
import { Stmt } from '../../ast/js/stmt';
import { TSType } from '../../ast/js/tsType';
import { assert, letIn } from '../../misc/utils';
import { jsStmtOf } from './stmt';

export function jsExprOf(bitter: BitterExpr): JSExpr {
    assert(bitter.ty != null);
    const ty = TSType.from(bitter.ty);

    return match(bitter, {
        Literal: ({ literal }) => JSExpr.Literal({ literal, ty }),
        Variable: ({ name }) => JSExpr.Variable(name, ty),
        Unary: ({ op, expr }) => JSExpr.Unary({ op, expr: jsExprOf(expr), ty }),
        Binary: ({ lhs, op, rhs }) => JSExpr.Binary({ lhs: jsExprOf(lhs), op, rhs: jsExprOf(rhs), ty }),
        Block: ({ stmts, ret }) => {
            if (stmts.length === 0 && ret) {
                return jsExprOf(ret);
            }
            // TODO: Linearzie scopes for much better performance
            return JSExpr.Call(JSExpr.Paren(JSExpr.Closure({
                args: [],
                stmts: ret ? [...stmts.map(jsStmtOf), Stmt.Return(jsExprOf(ret))] : stmts.map(jsStmtOf),
                ty: TSType.Function({ args: [], ret: ty }),
            })), []);
        },
        // TODO: handle block expressions inside the then and otherwise branches
        If: ({ cond, then, otherwise }) => JSExpr.Ternary({
            cond: jsExprOf(cond),
            then: jsExprOf(then),
            otherwise: jsExprOf(otherwise),
            ty,
        }),
        Tuple: ({ elems }) => JSExpr.Array({ elems: elems.map(jsExprOf), ty }),
        Array: ({ elems }) => JSExpr.Array({ elems: elems.map(jsExprOf), ty }),
        UseIn: ({ name, value, rhs }) => letIn(TSType.from(value.ty), valTy =>
            JSExpr.Call(JSExpr.Closure({
                args: [{ name, ty: valTy }],
                stmts: [Stmt.Return(jsExprOf(rhs))],
                ty: TSType.Function({ args: [valTy], ret: ty }),
            }), [jsExprOf(value)])
        ),
        Fun: ({ args, body }) => JSExpr.Closure({
            args: args.map(arg => ({ name: arg.name, ty: TSType.from(arg.ty) })),
            stmts: [Stmt.Return(jsExprOf(body))],
            ty: TSType.Function({ args: args.map(arg => TSType.from(arg.ty)), ret: ty }),
        }),
        Call: ({ fun, args }) => JSExpr.Call(jsExprOf(fun), args.map(jsExprOf)),
    });
};
