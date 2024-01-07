import { VariantOf, match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Expr as SweetExpr } from '../../ast/sweet/expr';
import { Type } from '../../infer/type';
import { assert, panic } from '../../misc/utils';
import { bitterStmtOf } from './stmt';
import {
    ClauseMatrix,
    CtorMetadata,
    DecisionTree,
    Occurrence,
} from '../decision-trees/ClauseMatrix';
import { Pattern } from '../../ast/sweet/pattern';
import { Literal } from '../../parse/token';

export function bitterExprOf(sweet: SweetExpr): BitterExpr {
    assert(sweet.ty != null, 'missing type after type inference');
    const ty = sweet.ty;

    return match(sweet, {
        Literal: ({ literal }) => BitterExpr.Literal(literal, ty),
        Variable: ({ name }) => BitterExpr.Variable({ name, ty }),
        Unary: ({ op, expr }) =>
            BitterExpr.Unary({ op, expr: bitterExprOf(expr), ty }),
        Binary: ({ lhs, op, rhs }) =>
            BitterExpr.Binary({
                lhs: bitterExprOf(lhs),
                op,
                rhs: bitterExprOf(rhs),
                ty,
            }),
        Block: ({ stmts, ret }) =>
            BitterExpr.Block({
                stmts: stmts.flatMap(bitterStmtOf),
                ret: ret ? bitterExprOf(ret) : undefined,
                ty,
            }),
        If: ({ cond, then, otherwise }) =>
            BitterExpr.If({
                cond: bitterExprOf(cond),
                then: bitterExprOf(then),
                otherwise: otherwise ? bitterExprOf(otherwise) : undefined,
                ty,
            }),
        Tuple: ({ elems }) =>
            BitterExpr.Tuple({ elems: elems.map(bitterExprOf), ty }),
        Array: ({ elems }) =>
            BitterExpr.Array({ elems: elems.map(bitterExprOf), ty }),
        UseIn: ({ name, value, rhs }) =>
            BitterExpr.UseIn({
                name,
                value: bitterExprOf(value),
                rhs: bitterExprOf(rhs),
                ty,
            }),
        Fun: ({ args, body, isIterator }) =>
            BitterExpr.Fun({
                args: args.map(arg => ({ name: arg.name, ty: arg.ann! })),
                body: bitterExprOf(body),
                isIterator,
                ty,
            }),
        Call: ({ fun, args, ty }) => {
            if (
                fun.variant === 'VariableAccess' &&
                fun.extensionUuid != null &&
                !fun.isNative
            ) {
                const { lhs, field, extensionUuid } = fun;
                return BitterExpr.Call({
                    fun: BitterExpr.Variable({
                        name: `${field}_${extensionUuid}`,
                        ty: Type.Function(
                            [lhs.ty!, ...args.map(arg => arg.ty!)],
                            ty!,
                        ),
                    }),
                    args: [lhs, ...args].map(bitterExprOf),
                    ty: ty!,
                });
            }

            return BitterExpr.Call({
                fun: bitterExprOf(fun),
                args: args.map(bitterExprOf),
                ty: ty!,
            });
        },
        ModuleAccess: ({ path, member, extensionUuid }) => {
            if (extensionUuid != null) {
                if (path.length > 1) {
                    return BitterExpr.ModuleAccess(
                        path.slice(0, -1),
                        `${member}_${extensionUuid}`,
                        ty,
                    );
                }

                return BitterExpr.Variable({
                    name: `${member}_${extensionUuid}`,
                    ty: ty,
                });
            }

            return BitterExpr.ModuleAccess(path, member, ty);
        },
        Struct: ({ path, name, fields }) =>
            BitterExpr.Struct({
                path,
                name,
                fields: fields.map(field => ({
                    name: field.name,
                    value: bitterExprOf(field.value),
                })),
                ty,
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
            assert(
                extensionUuid != null,
                'Extension uuid must be present in extension access',
            );
            return BitterExpr.Variable({
                name: `${member}_${extensionUuid}`,
                ty: sweet.ty!,
            });
        },
        TupleAccess: ({ lhs, index }) =>
            BitterExpr.VariableAccess({
                lhs: bitterExprOf(lhs),
                field: index,
                isCalled: false,
                ty,
            }),
        Match: ({ subject, cases }) => {
            const cm = new ClauseMatrix({
                rows: cases.map(({ pattern }) => [
                    pattern.variant === 'Variable' ? Pattern.Any : pattern,
                ]),
                actions: cases.map((_, index) => index),
            });

            const signature = new Set<string>();

            for (const { pattern } of cases) {
                if (pattern.variant === 'Ctor') {
                    signature.add(pattern.name);
                }
            }

            const selectColumn = (matrix: ClauseMatrix) => {
                for (let i = 0; i < matrix.width; i++) {
                    const col = matrix.getColumn(i);
                    if (col.some(p => p.variant !== 'Any')) {
                        return i;
                    }
                }

                return panic('no column found');
            };

            const dt = cm.compile(
                cm.actions.map(() => []),
                selectColumn,
                isSignature,
            );

            if (dt.variant === 'Switch' && subject.variant !== 'Variable') {
                return bitterExprOf(
                    SweetExpr.UseIn({
                        name: 'x',
                        value: subject,
                        rhs: exprOfDecisionTree(
                            SweetExpr.Variable({
                                name: 'x',
                                typeParams: [],
                                ty: subject.ty!,
                            }),
                            dt,
                            cases,
                            sweet.ty!,
                        ),
                        ty: sweet.ty!,
                    }),
                );
            }

            return bitterExprOf(
                exprOfDecisionTree(subject, dt, cases, sweet.ty!),
            );
        },
    });
}

function exprOfOccurence(occ: Occurrence, subject: SweetExpr): SweetExpr {
    if (occ.length === 0) return subject;

    const [head, ...tail] = occ;
    return exprOfOccurence(
        tail,
        SweetExpr.TupleAccess({
            lhs: subject,
            index: head,
            ty: subject.ty,
        }),
    );
}

function getPatternTest(
    lhs: SweetExpr,
    ctor: string,
    meta: CtorMetadata | undefined,
): SweetExpr | null {
    if (meta) {
        return match(meta, {
            Ctor: ({ kind }) => {
                switch (kind) {
                    case 'Unit':
                        return SweetExpr.Binary({
                            op: '==',
                            lhs,
                            rhs: {
                                ...SweetExpr.Literal(Literal.Unit),
                                ty: Type.Unit,
                            },
                            ty: Type.Unit,
                        });
                    case 'Bool':
                        if (ctor === 'true') {
                            return lhs;
                        } else {
                            return SweetExpr.Unary({
                                op: '!',
                                expr: lhs,
                                ty: Type.Bool,
                            });
                        }
                    case 'Num':
                        return SweetExpr.Binary({
                            op: '==',
                            lhs,
                            rhs: {
                                ...SweetExpr.Literal(Literal.Num(Number(ctor))),
                                ty: Type.Num,
                            },
                            ty: Type.Num,
                        });
                    case 'Str':
                        return SweetExpr.Binary({
                            op: '==',
                            lhs,
                            rhs: {
                                ...SweetExpr.Literal(Literal.Str(ctor)),
                                ty: Type.Str,
                            },
                            ty: Type.Str,
                        });
                    case 'Tuple':
                        // the type checker ensures that the type of the lhs is a tuple of the same length
                        return null;
                }

                return panic(`Unknown ctor: ${kind}(${ctor})`);
            },
            Variant: () =>
                SweetExpr.Binary({
                    op: '==',
                    lhs: SweetExpr.VariableAccess({
                        lhs,
                        field: 'variant',
                        isCalled: false,
                        isNative: false,
                        typeParams: [],
                        ty: Type.Str,
                    }),
                    rhs: {
                        ...SweetExpr.Literal(Literal.Str(ctor)),
                        ty: Type.Str,
                    },
                    ty: Type.Bool,
                }),
        });
    }

    return null;
}

function exprOfDecisionTree(
    subject: SweetExpr,
    dt: DecisionTree,
    cases: VariantOf<SweetExpr, 'Match'>['cases'],
    retTy: Type,
): SweetExpr {
    return match(dt, {
        Leaf: ({ action }) => cases[action].body,
        Switch: ({ occurrence, tests }) => {
            if (tests.length === 0) {
                return exprOfDecisionTree(
                    subject,
                    DecisionTree.Fail(),
                    cases,
                    retTy,
                );
            }

            const [head, ...tail] = tests;

            if (head.ctor === '_') {
                return exprOfDecisionTree(subject, head.dt, cases, retTy);
            }

            const lhs = exprOfOccurence(occurrence, subject);
            const cond = getPatternTest(lhs, head.ctor, head.meta);

            if (cond == null) {
                return exprOfDecisionTree(subject, head.dt, cases, retTy);
            } else {
                return SweetExpr.If({
                    cond,
                    then: exprOfDecisionTree(subject, head.dt, cases, retTy),
                    otherwise:
                        tail.length > 0
                            ? exprOfDecisionTree(
                                  subject,
                                  DecisionTree.Switch({
                                      occurrence,
                                      tests: tail,
                                  }),
                                  cases,
                                  retTy,
                              )
                            : undefined,
                    ty: retTy,
                });
            }
        },
        Fail: () => ({
            ...SweetExpr.Literal(Literal.Str('Match fail')),
            ty: Type.Str,
        }),
    });
}

// returns wether the given set of heads is a signature for the given constructor kind
function isSignature(
    heads: Map<string, { arity: number; meta?: CtorMetadata }>,
): boolean {
    if (heads.size === 0) return false;

    const entries = [...heads.entries()];
    const [, { meta }] = entries[0];

    if (meta) {
        return match(meta, {
            Ctor: ({ kind }) => {
                assert(
                    entries.every(
                        ([_, { meta }]) =>
                            meta?.variant === 'Ctor' && meta.kind === kind,
                    ),
                );

                switch (kind) {
                    case 'Unit':
                        return true;
                    case 'Bool':
                        return heads.has('true') && heads.has('false');
                    case 'Num':
                        return false;
                    case 'Str':
                        return false;
                    case 'Tuple':
                        return true;
                    default:
                        return panic(`Unknown ctor kind: ${kind}`);
                }
            },
            Variant: ({ enumDecl }) => {
                assert(
                    entries.every(
                        ([_, { meta }]) =>
                            meta?.variant === 'Variant' &&
                            meta.enumDecl === enumDecl,
                    ),
                );

                for (const variant of enumDecl.variants) {
                    if (!heads.has(variant.name)) {
                        return false;
                    }
                }

                return true;
            },
        });
    }

    return false;
}
