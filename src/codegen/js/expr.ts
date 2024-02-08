import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { BinaryOp as JSBinaryOp, Expr as JSExpr } from '../../ast/js/expr';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { EnumVariant } from '../../ast/sweet/decl';
import { Type, showTypeVarId } from '../../infer/type';
import { assert } from '../../misc/utils';
import { BinaryOp, Literal } from '../../parse/token';
import { JSScope } from './jsScope';
import { jsStmtOf } from './stmt';

export function jsExprOf(bitter: BitterExpr, scope: JSScope): JSExpr {
  assert(bitter.ty != null, 'missing type after type inference');

  return match(bitter, {
    Literal: ({ literal }) => JSExpr.Literal({ literal }),
    Variable: ({ name }) => JSExpr.Variable(scope.lookup(name)),
    Unary: ({ op, expr }) => JSExpr.Unary({ op, expr: jsExprOf(expr, scope) }),
    Binary: ({ lhs, op, rhs }) =>
      JSExpr.Binary({
        lhs: jsExprOf(lhs, scope),
        op: jsBinaryOpOf(op),
        rhs: jsExprOf(rhs, scope),
      }),
    Block: ({ stmts, ret }) => {
      const blockScope = scope.virtualChild();
      blockScope.add(...stmts.map(stmt => jsStmtOf(stmt, blockScope)));
      return ret ? jsExprOf(ret, blockScope) : JSExpr.Literal({ literal: Literal.Unit });
    },
    If: () => {
      const branches: { cond?: BitterExpr; then_: BitterExpr }[] = [];

      const getBranches = (expr: BitterExpr) => {
        if (expr.variant === 'If') {
          branches.push({ cond: expr.cond, then_: expr.then_ });
          if (expr.else_) {
            getBranches(expr.else_);
          }
        } else {
          branches.push({ then_: expr });
        }
      };

      getBranches(bitter);

      // special case for if-else expressions that return a boolean
      // if cond { true } else { false } ~> cond
      // if cond { false } else { true } ~> !cond
      // if !cond { true } else { false } ~> !cond
      // if !cond { false } else { true } ~> cond
      if (branches.length === 2 && branches[1].cond == null) {
        const cond = branches[0].cond;

        if (
          cond?.variant === 'Binary' &&
          (cond.op === '==' || cond.op === '!=') &&
          branches[0].then_.variant === 'Literal' &&
          branches[0].then_.literal.variant === 'Bool' &&
          branches[1].then_.variant === 'Literal' &&
          branches[1].then_.literal.variant === 'Bool' &&
          branches[0].then_.literal.$value !== branches[1].then_.literal.$value
        ) {
          const isFirstBranchTrue = branches[0].then_.literal.$value;
          const isNegated = cond.op === '==' ? !isFirstBranchTrue : isFirstBranchTrue;

          if (isNegated) {
            return JSExpr.Unary({
              op: '!',
              expr: jsExprOf(cond, scope),
            });
          }

          return jsExprOf(cond, scope);
        }
      }

      // declare $result before compiling branches to ensure
      // $results in branches are not shadowed by the declaration
      const resultName = scope.declareUnused('$result');

      const compiledBranches = branches.map(({ cond, then_: then }) => {
        const condVal = cond ? jsExprOf(cond, scope) : undefined;
        const thenScope = scope.realChild();
        const thenVal = jsExprOf(then, thenScope);

        return { cond: condVal, scope: thenScope, val: thenVal };
      });

      const lastBranch = compiledBranches[compiledBranches.length - 1];

      if (
        lastBranch.cond == null &&
        compiledBranches.every(({ scope }) => scope.statements.length === 0)
      ) {
        // build a ternary expression
        let ternary = lastBranch.val;

        for (let i = compiledBranches.length - 2; i >= 0; i--) {
          const { cond, val } = compiledBranches[i];
          ternary = JSExpr.Ternary({
            cond: cond!,
            then_: val,
            else_: ternary,
          });
        }

        return ternary;
      }

      const returnsUndefined = Type.unify(bitter.ty, Type.Unit);
      let lastStmtFn = (val: JSExpr): JSStmt => JSStmt.Expr(val);
      let resultVar: JSExpr | undefined;

      if (!returnsUndefined) {
        resultVar = JSExpr.Variable(resultName);
        scope.add(JSStmt.Let({ name: resultName }));
        lastStmtFn = (val: JSExpr) => JSStmt.Assign(resultVar!, '=', val);
      }

      scope.add(
        JSStmt.If({
          branches: compiledBranches.map(({ cond, scope, val }) => ({
            cond,
            then_: [...scope.statements, lastStmtFn(val)],
          })),
        }),
      );

      return resultVar ?? JSExpr.Literal({ literal: Literal.Unit });
    },
    Tuple: ({ elems }) => JSExpr.Array({ elems: elems.map(expr => jsExprOf(expr, scope)) }),
    Array: ({ elems }) => JSExpr.Array({ elems: elems.map(expr => jsExprOf(expr, scope)) }),
    UseIn: ({ name, value, rhs }) => {
      return jsExprOf(
        BitterExpr.Block({
          stmts: [
            BitterStmt.Let({
              mutable: false,
              static: false,
              name,
              value,
              attrs: {},
            }),
          ],
          ret: rhs,
          ty: rhs.ty,
        }),
        scope,
      );
    },
    Fun: ({ args, body, isIterator }) => {
      const bodyScope = scope.realChild();
      const declaredArgs = args.map(arg => ({
        name: bodyScope.declare(arg.name),
      }));
      const ret = jsExprOf(body, bodyScope);

      return JSExpr[isIterator ? 'Generator' : 'Closure']({
        args: declaredArgs,
        stmts: [...bodyScope.statements, JSStmt.Return(ret)],
      });
    },
    Call: ({ fun, args }) => {
      // typeOf
      if (fun.variant === 'Variable' && fun.name === 'typeOf' && args.length === 1) {
        const variable = (name: string) =>
          JSExpr.Object({
            entries: [
              { key: EnumVariant.TAG, value: JSExpr.Literal({ literal: Literal.Str('variable') }) },
              {
                key: EnumVariant.formatPositionalArg(0),
                value: JSExpr.Literal({ literal: Literal.Str(name) }),
              },
            ],
          });

        const aux = (ty: Type): JSExpr => {
          return match(ty, {
            Var: ({ ref }) =>
              match(ref, {
                Unbound: ({ id }) => variable(showTypeVarId(id)),
                Generic: ({ id }) => variable(showTypeVarId(id)),
                Param: ({ name }) => variable(name),
                Link: ({ type }) => aux(type),
              }),
            Fun: ({ name, args }) =>
              JSExpr.Object({
                entries: [
                  {
                    key: EnumVariant.TAG,
                    value: JSExpr.Literal({ literal: Literal.Str('compound') }),
                  },
                  {
                    key: EnumVariant.formatPositionalArg(0),
                    value: JSExpr.Literal({ literal: Literal.Str(name) }),
                  },
                  {
                    key: EnumVariant.formatPositionalArg(1),
                    value: JSExpr.Array({ elems: args.map(aux) }),
                  },
                ],
              }),
          });
        };

        return aux(args[0].ty!);
      }

      return JSExpr.Call(
        jsExprOf(fun, scope),
        args.map(arg => jsExprOf(arg, scope)),
      );
    },
    ModuleAccess: ({ path, member }) => {
      assert(path.length > 0);
      const pathExpr = path
        .slice(1)
        .reduce((lhs, name) => JSExpr.Dot(lhs, name), JSExpr.Variable(scope.lookup(path[0])));

      return JSExpr.Dot(pathExpr, member);
    },
    Struct: ({ fields }) =>
      JSExpr.Object({
        entries: fields.map(({ name, value }) => ({
          key: name,
          value: jsExprOf(value, scope),
        })),
      }),
    FieldAccess: ({ lhs, field }) => {
      // 3.toString() is not valid, so we need to wrap the literal in parentheses
      if (lhs.variant === 'Literal' && lhs.literal.variant === 'Num') {
        return JSExpr.Dot(JSExpr.Paren(jsExprOf(lhs, scope)), field);
      }

      return JSExpr.Dot(jsExprOf(lhs, scope), field);
    },
  });
}

function jsBinaryOpOf(op: BinaryOp): JSBinaryOp {
  switch (op) {
    case 'and':
      return '&&';
    case 'or':
      return '||';
    case 'mod':
      return '%';
    case '++':
      return '+';
    default:
      return op;
  }
}
