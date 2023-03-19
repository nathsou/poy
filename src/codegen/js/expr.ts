import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Expr as JSExpr, BinaryOp as JSBinaryOp } from '../../ast/js/expr';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { TSType } from '../../ast/js/tsType';
import { Type } from '../../infer/type';
import { assert } from '../../misc/utils';
import { Literal, BinaryOp } from '../../parse/token';
import { JSScope } from './jsScope';
import { jsStmtOf } from './stmt';

export function jsExprOf(bitter: BitterExpr, scope: JSScope): JSExpr {
    assert(bitter.ty != null);
    const ty = TSType.from(bitter.ty);

    return match(bitter, {
        Literal: ({ literal }) => JSExpr.Literal({ literal, ty }),
        Variable: ({ name }) => JSExpr.Variable(scope.lookup(name), ty),
        Unary: ({ op, expr }) => JSExpr.Unary({ op, expr: jsExprOf(expr, scope), ty }),
        Binary: ({ lhs, op, rhs }) => JSExpr.Binary({
            lhs: jsExprOf(lhs, scope),
            op: jsBinaryOpOf(op),
            rhs: jsExprOf(rhs, scope),
            ty
        }),
        Block: ({ stmts, ret }) => {
            const blockScope = scope.virtualChild();
            blockScope.add(...stmts.map(stmt => jsStmtOf(stmt, blockScope)));
            return ret ? jsExprOf(ret, blockScope) : JSExpr.Literal({ literal: Literal.Unit, ty });
        },
        If: ({ cond, then, otherwise }) => {
            const condVal = jsExprOf(cond, scope);
            const thenScope = scope.realChild();
            const thenVal = jsExprOf(then, thenScope);

            if (otherwise === undefined) {
                scope.add(JSStmt.If({
                    cond: condVal,
                    then: [...thenScope.statements, JSStmt.Expr(thenVal)],
                }));

                return JSExpr.Literal({ literal: Literal.Unit, ty });
            }

            const elseScope = scope.realChild();
            const elseVal = jsExprOf(otherwise, elseScope);

            if (thenScope.statements.length === 0 && elseScope.statements.length === 0) {
                return JSExpr.Ternary({
                    cond: condVal,
                    then: thenVal,
                    otherwise: elseVal,
                    ty,
                });
            } else {
                if (Type.unify(bitter.ty, Type.Unit)) {
                    scope.add(JSStmt.If({
                        cond: condVal,
                        then: [...thenScope.statements, JSStmt.Expr(thenVal)],
                        otherwise: [...elseScope.statements, JSStmt.Expr(elseVal)],
                    }));

                    return JSExpr.Literal({ literal: Literal.Unit, ty });
                } else {
                    const resultName = scope.declareUnused('result');
                    const resultVar = JSExpr.Variable(resultName, ty);

                    scope.add(JSStmt.Let({ name: resultName }));
                    scope.add(JSStmt.If({
                        cond: condVal,
                        then: [...thenScope.statements, JSStmt.Assign(resultVar, '=', thenVal)],
                        otherwise: [...elseScope.statements, JSStmt.Assign(resultVar, '=', elseVal)],
                    }));

                    return resultVar;
                }
            }
        },
        Tuple: ({ elems }) => JSExpr.Array({ elems: elems.map(expr => jsExprOf(expr, scope)), ty }),
        Array: ({ elems }) => JSExpr.Array({ elems: elems.map(expr => jsExprOf(expr, scope)), ty }),
        UseIn: ({ name, value, rhs }) => {
            return jsExprOf(BitterExpr.Block({
                stmts: [BitterStmt.Let({ mutable: false, static: false, name, value })],
                ret: rhs,
                ty: rhs.ty,
            }), scope);
        },
        Fun: ({ args, body }) => {
            const bodyScope = scope.realChild();
            const declaredArgs = args.map(arg => ({ name: bodyScope.declare(arg.name), ty: TSType.from(arg.ty) }));
            const ret = jsExprOf(body, bodyScope);

            return JSExpr.Closure({
                args: declaredArgs,
                stmts: [...bodyScope.statements, JSStmt.Return(ret)],
                ty: TSType.Function({ args: args.map(arg => TSType.from(arg.ty)), ret: ty }),
            });
        },
        Call: ({ fun, args }) => {
            // TODO: remove once types can be represented with enums inside poy itself 
            if (fun.variant === 'Variable' && fun.name === 'showType' && args.length === 1) {
                return JSExpr.Literal({ literal: Literal.Str(Type.show(args[0].ty)), ty: TSType.String() });
            }

            return JSExpr.Call(jsExprOf(fun, scope), args.map(arg => jsExprOf(arg, scope)));
        },
        ModuleAccess: ({ path, member }) => {
            assert(path.length > 0);
            const pathExpr = path.slice(1).reduce(
                (lhs, name) => JSExpr.Dot(lhs, name),
                JSExpr.Variable(scope.lookup(path[0]), ty),
            );

            return JSExpr.Dot(pathExpr, member);
        },
        Struct: ({ fields }) => JSExpr.Object({
            entries: fields.map(({ name, value }) => ({ key: name, value: jsExprOf(value, scope) })),
            ty
        }),
        VariableAccess: ({ lhs, field }) => JSExpr.Dot(jsExprOf(lhs, scope), field),
    });
};

function jsBinaryOpOf(op: BinaryOp): JSBinaryOp {
    switch (op) {
        case 'and': return '&&';
        case 'or': return '||';
        case 'mod': return '%';
        default: return op;
    }
}
