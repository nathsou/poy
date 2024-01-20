import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Expr as SweetExpr } from '../../ast/sweet/expr';
import { Pattern } from '../../ast/sweet/pattern';
import { Type } from '../../infer/type';
import { array, assert, block, panic } from '../../misc/utils';
import {
  ClauseMatrix,
  CtorMetadata,
  DecisionTree,
  Occurrence,
} from '../decision-trees/ClauseMatrix';
import { bitterStmtOf } from './stmt';

export function bitterExprOf(sweet: SweetExpr): BitterExpr {
  assert(sweet.ty != null, 'missing type after type inference');
  const ty = sweet.ty;

  return match(sweet, {
    Literal: ({ literal }) => BitterExpr.Literal(literal, ty),
    Variable: ({ name }) => BitterExpr.Variable({ name, ty }),
    Unary: ({ op, expr }) => BitterExpr.Unary({ op, expr: bitterExprOf(expr), ty }),
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
    Tuple: ({ elems }) => BitterExpr.Tuple({ elems: elems.map(bitterExprOf), ty }),
    Array: ({ elems }) => BitterExpr.Array({ elems: elems.map(bitterExprOf), ty }),
    UseIn: ({ lhs, value, rhs }) => {
      const { shared } = Pattern.variableOccurrences(lhs);
      const stmts = array<BitterStmt>();

      for (const [name, occ] of shared) {
        stmts.push(
          BitterStmt.Let({
            mutable: false,
            static: false,
            name,
            value: bitterExprOf(Occurrence.toExpr(occ, value)),
            attrs: {},
          }),
        );
      }

      return BitterExpr.Block({
        stmts,
        ret: bitterExprOf(rhs),
        ty,
      });
    },
    Fun: ({ args, body, isIterator }) => {
      const renamedArgs = args.map((arg, idx) => ({
        name: Pattern.isVariable(arg.pat) ? arg.pat.name : `arg${idx}`,
        ty: arg.ann!,
      }));

      return BitterExpr.Fun({
        args: renamedArgs,
        body: block(() => {
          if (args.every(arg => Pattern.isVariable(arg.pat))) {
            return bitterExprOf(body);
          }

          const decls = array<BitterStmt>();

          args.forEach((arg, idx) => {
            if (!Pattern.isVariable(arg.pat)) {
              const renamedArg = renamedArgs[idx];
              const { shared } = Pattern.variableOccurrences(arg.pat, {
                name: renamedArg.name,
                alreadyDeclared: true,
              });

              const renamed = SweetExpr.Variable({ ...renamedArg, typeParams: [] });

              for (const [name, occ] of shared) {
                decls.push(
                  BitterStmt.Let({
                    mutable: false,
                    static: false,
                    name,
                    value: bitterExprOf(Occurrence.toExpr(occ, renamed)),
                    attrs: {},
                  }),
                );
              }
            }
          });

          return BitterExpr.Block({
            stmts: decls,
            ret: bitterExprOf(body),
            ty,
          });
        }),
        isIterator,
        ty,
      });
    },
    Call: ({ fun, args, ty }) => {
      if (fun.variant === 'FieldAccess' && fun.extensionUuid != null && !fun.isNative) {
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

      return BitterExpr.Call({
        fun: bitterExprOf(fun),
        args: args.map(bitterExprOf),
        ty: ty!,
      });
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
    FieldAccess: ({ lhs, field, extensionUuid, isCalled, isNative }) => {
      if (isNative) {
        return BitterExpr.FieldAccess({
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

      return BitterExpr.FieldAccess({
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
    TupleAccess: ({ lhs, index }) =>
      BitterExpr.FieldAccess({
        lhs: bitterExprOf(lhs),
        field: index,
        isCalled: false,
        ty,
      }),
    Match: ({ subject, cases }) => {
      const cm = new ClauseMatrix({
        rows: cases.map(({ pattern }) => [pattern.variant === 'Variable' ? Pattern.Any : pattern]),
        actions: cases.map((_, index) => index),
      });

      const signature = new Set<string>();

      for (const { pattern } of cases) {
        if (pattern.variant === 'Ctor') {
          signature.add(pattern.name);
        }
      }

      const dt = cm.compile(
        cm.actions.map(() => []),
        isSignature,
      );

      if (
        dt.variant === 'Switch' &&
        !SweetExpr.isPurelyCopyable(subject) &&
        DecisionTree.totalTestsCount(dt) > 1
      ) {
        // bind the subject to a variable
        // to avoid evaluating it multiple times
        return bitterExprOf(
          SweetExpr.UseIn({
            lhs: Pattern.Variable('$subject'),
            value: subject,
            rhs: DecisionTree.toExpr(
              SweetExpr.Variable({
                name: '$subject',
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

      return bitterExprOf(DecisionTree.toExpr(subject, dt, cases, sweet.ty!));
    },
    VariantShorthand: ({ variantName, args, resolvedEnum }) => {
      assert(resolvedEnum != null, 'unresolved enum in variant shorthand');
      const ctor = BitterExpr.ModuleAccess([resolvedEnum.name], variantName, ty);

      if (args.length === 0) {
        return ctor;
      }

      return BitterExpr.Call({
        fun: ctor,
        args: args.map(bitterExprOf),
        ty,
      });
    },
  });
}

// returns wether the given set of heads is a signature for the given constructor kind
function isSignature(heads: Map<string, { arity: number; meta?: CtorMetadata }>): boolean {
  if (heads.size === 0) return false;

  const entries = [...heads.entries()];
  const [, { meta }] = entries[0];

  if (meta) {
    return match(meta, {
      Ctor: ({ kind }) => {
        assert(entries.every(([_, { meta }]) => meta?.variant === 'Ctor' && meta.kind === kind));

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
            ([_, { meta }]) => meta?.variant === 'Variant' && meta.enumDecl === enumDecl,
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
