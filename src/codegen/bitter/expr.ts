import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { StringInterpolationPart, Expr as SweetExpr } from '../../ast/sweet/expr';
import { Stmt as SweetStmt } from '../../ast/sweet/stmt';
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
import { Literal } from '../../parse/token';
import { TypeEnv } from '../../infer/infer';

export function bitterExprOf(sweet: SweetExpr, env: TypeEnv): BitterExpr {
  assert(
    sweet.ty != null,
    () => `missing type after type inference for expr: ${JSON.stringify(sweet, null, 2)}`,
  );

  const ty = sweet.ty;
  const aux = (sweet: SweetExpr) => bitterExprOf(sweet, env);

  return match(sweet, {
    Literal: ({ literal }) => BitterExpr.Literal(literal, ty),
    Variable: ({ name }) => BitterExpr.Variable({ name, ty }),
    Unary: ({ op, expr }) => {
      if (op === '?') {
        const resultEnumDecl = env.enums.lookup('Result').unwrap('Result enum not found');

        return aux(SweetExpr.Match({
          subject: expr,
          cases: [
            {
              pattern: Pattern.Variant({
                enumName: 'Result',
                variantName: 'ok',
                args: [Pattern.Variable('value')],
                resolvedEnum: resultEnumDecl,
              }),
              body: SweetExpr.Variable({ name: 'value', typeParams: [], ty }),
            },
            {
              pattern: Pattern.Variant({
                enumName: 'Result',
                variantName: 'err',
                args: [Pattern.Variable('err')],
                resolvedEnum: resultEnumDecl,
              }),
              body: SweetExpr.Block({
                stmts: [
                  SweetStmt.Return(SweetExpr.Variable({
                    name: 'err',
                    typeParams: [],
                    ty: Type.DontCare,
                  })),
                ],
                ty: Type.DontCare,
              }),
            },
          ],
          ty,
        }));
      } else {
        return BitterExpr.Unary({ op, expr: aux(expr), ty });
      }
    },
    Binary: ({ lhs, op, rhs }) =>
      BitterExpr.Binary({
        lhs: aux(lhs),
        op,
        rhs: aux(rhs),
        ty,
      }),
    Block: ({ stmts, ret }) =>
      BitterExpr.Block({
        stmts: stmts.flatMap(stmt => bitterStmtOf(stmt, env)),
        ret: ret ? aux(ret) : undefined,
        ty,
      }),
    If: ({ cond, then_, else_ }) =>
      BitterExpr.If({
        cond: aux(cond),
        then_: aux(then_),
        else_: else_ ? aux(else_) : undefined,
        ty,
      }),
    Tuple: ({ elems }) => BitterExpr.Tuple({ elems: elems.map(aux), ty }),
    Array: ({ elems }) => BitterExpr.Array({ elems: elems.map(aux), ty }),
    UseIn: ({ lhs, value, rhs }) => {
      const vars = Pattern.variableOccurrences(lhs);
      const stmts = array<BitterStmt>();

      for (const [name, occ] of vars) {
        stmts.push(
          BitterStmt.Let({
            pub: false,
            mutable: false,
            static: false,
            name,
            value: aux(Occurrence.toExpr(occ, value)),
            attrs: {},
          }),
        );
      }

      return BitterExpr.Block({
        stmts,
        ret: aux(rhs),
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
            return aux(body);
          }

          const decls = array<BitterStmt>();

          args.forEach((arg, idx) => {
            if (!Pattern.isVariable(arg.pat)) {
              const renamedArg = renamedArgs[idx];
              const vars = Pattern.variableOccurrences(arg.pat, {
                name: renamedArg.name,
                alreadyDeclared: true,
              });

              const renamed = SweetExpr.Variable({ ...renamedArg, typeParams: [] });

              for (const [name, occ] of vars) {
                decls.push(
                  BitterStmt.Let({
                    pub: false,
                    mutable: false,
                    static: false,
                    name,
                    value: aux(Occurrence.toExpr(occ, renamed)),
                    attrs: {},
                  }),
                );
              }
            }
          });

          return BitterExpr.Block({
            stmts: decls,
            ret: aux(body),
            ty,
          });
        }),
        isIterator,
        ty,
      });
    },
    Call: ({ fun, args, ty }) => {
      if (fun.variant === 'FieldAccess' && fun.extensionSuffix != null && !fun.isNative) {
        const { lhs, field, extensionSuffix } = fun;
        return BitterExpr.Call({
          fun: BitterExpr.Variable({
            name: `${field}_${extensionSuffix}`,
            ty: Type.Function([lhs.ty!, ...args.map(arg => arg.ty!)], ty!),
          }),
          args: [lhs, ...args].map(aux),
          ty: ty!,
        });
      }

      return BitterExpr.Call({
        fun: aux(fun),
        args: args.map(aux),
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
          value: aux(field.value),
        })),
        ty,
      }),
    FieldAccess: ({ lhs, field, extensionSuffix, isCalled, isNative }) => {
      if (isNative) {
        return BitterExpr.FieldAccess({
          lhs: aux(lhs),
          field,
          isCalled,
          ty,
        });
      }

      if (extensionSuffix != null && !isCalled) {
        return BitterExpr.Variable({
          name: extensionSuffix ? `${field}_${extensionSuffix}` : field,
          ty: Type.Function([lhs.ty!], ty),
        });
      }

      return BitterExpr.FieldAccess({
        lhs: aux(lhs),
        field: extensionSuffix ? `${field}_${extensionSuffix}` : field,
        isCalled,
        ty,
      });
    },
    ExtensionAccess: ({ member, extensionSuffix }) => {
      assert(extensionSuffix != null, 'Extension suffix must be present in extension access');
      return BitterExpr.Variable({
        name: `${member}_${extensionSuffix}`,
        ty: sweet.ty!,
      });
    },
    TupleAccess: ({ lhs, index }) =>
      BitterExpr.FieldAccess({
        lhs: aux(lhs),
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

      if (dt.variant === 'Switch' && !SweetExpr.isPurelyCopyable(subject)) {
        // bind the subject to a variable
        // to avoid evaluating it multiple times
        return aux(
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

      return aux(DecisionTree.toExpr(subject, dt, cases, sweet.ty!));
    },
    VariantShorthand: ({ variantName, args, resolvedEnum }) => {
      assert(resolvedEnum != null, 'unresolved enum in variant shorthand');
      const ctor = BitterExpr.ModuleAccess([resolvedEnum.name], variantName, ty);

      if (args.length === 0) {
        return ctor;
      }

      return BitterExpr.Call({
        fun: ctor,
        args: args.map(aux),
        ty,
      });
    },
    StringInterpolation: ({ parts }) => {
      const go = (parts: StringInterpolationPart[]): BitterExpr => {
        if (parts.length === 0) {
          return BitterExpr.Literal({ variant: 'Str', $value: '' }, ty);
        }

        const [head, ...rest] = parts;
        const lhs = match(head, {
          Str: ({ value }) => BitterExpr.Literal(Literal.Str(value), ty),
          Expr: ({ expr }) => aux(expr),
        });

        if (rest.length === 0) {
          return lhs;
        }

        return BitterExpr.Binary({
          lhs,
          op: '++',
          rhs: go(rest),
          ty,
        });
      };

      return go(parts);
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
