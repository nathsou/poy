import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Expr as SweetExpr } from '../../ast/sweet/expr';
import { Type } from '../../infer/type';
import { assert } from '../../misc/utils';
import { bitterStmtOf } from './stmt';

export function bitterExprOf(sweet: SweetExpr): BitterExpr {
    assert(sweet.ty != null);
    const ty = sweet.ty!;

    return match(sweet, {
        Literal: ({ literal }) => BitterExpr.Literal(literal, ty),
        Variable: ({ name }) => BitterExpr.Variable({ name, ty }),
        Unary: ({ op, expr }) => BitterExpr.Unary({ op, expr: bitterExprOf(expr), ty }),
        Binary: ({ lhs, op, rhs }) => BitterExpr.Binary({
            lhs: bitterExprOf(lhs),
            op,
            rhs: bitterExprOf(rhs),
            ty
        }),
        Block: ({ stmts, ret }) => BitterExpr.Block({
            stmts: stmts.flatMap(bitterStmtOf),
            ret: ret ? bitterExprOf(ret) : undefined,
            ty
        }),
        If: ({ cond, then, otherwise }) => BitterExpr.If({
            cond: bitterExprOf(cond),
            then: bitterExprOf(then),
            otherwise: otherwise ? bitterExprOf(otherwise) : undefined,
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
        Fun: ({ args, body, isIterator }) => BitterExpr.Fun({
            args: args.map(arg => ({ name: arg.name, ty: arg.ann! })),
            body: bitterExprOf(body),
            isIterator,
            ty,
        }),
        Call: ({ fun, args, ty }) => {
            if (fun.variant === 'VariableAccess' && fun.extensionUuid != null && !fun.isNative) {
                const { lhs, field, extensionUuid } = fun;
                return BitterExpr.Call({
                    fun: BitterExpr.Variable({
                        name: `${field}_${extensionUuid}`,
                        ty: Type.Function([lhs.ty!, ...args.map(arg => arg.ty!)], ty!),
                    }),
                    args: [lhs, ...args].map(bitterExprOf),
                    ty: ty!,
                });
            }

            return BitterExpr.Call({ fun: bitterExprOf(fun), args: args.map(bitterExprOf), ty: ty! });
        },
        ModuleAccess: ({ path, member, extensionUuid }) => {
            if (extensionUuid != null) {
                if (path.length > 1) {
                    return BitterExpr.ModuleAccess(path.slice(0, -1), `${member}_${extensionUuid}`, ty);
                }

                return BitterExpr.Variable({
                    name: `${member}_${extensionUuid}`,
                    ty: ty,
                });
            }

            return BitterExpr.ModuleAccess(path, member, ty);
        },
        Struct: ({ path, name, fields }) => BitterExpr.Struct({
            path,
            name,
            fields: fields.map(field => ({ name: field.name, value: bitterExprOf(field.value) })),
            ty
        }),
        VariableAccess: ({ lhs, field, extensionUuid, isCalled, isNative }) => {
            if (isNative) {
                return BitterExpr.VariableAccess({
                    lhs: bitterExprOf(lhs),
                    field,
                    isCalled,
                    ty,
                });
            }

            if (extensionUuid != null && !isCalled) {
                return BitterExpr.Variable({
                    name: extensionUuid ? `${field}_${extensionUuid}` : field,
                    ty: Type.Function([lhs.ty!], ty),
                });
            }

            return BitterExpr.VariableAccess({
                lhs: bitterExprOf(lhs),
                field: extensionUuid ? `${field}_${extensionUuid}` : field,
                isCalled,
                ty,
            });
        },
        ExtensionAccess: ({ member, extensionUuid }) => {
            assert(extensionUuid != null, 'Extension uuid must be present in extension access');
            return BitterExpr.Variable({
                name: `${member}_${extensionUuid}`,
                ty: sweet.ty!,
            });
        },
        TupleAccess: ({ lhs, index }) => BitterExpr.VariableAccess({
            lhs: bitterExprOf(lhs),
            field: index,
            isCalled: false,
            ty,
        }),
    });
}
