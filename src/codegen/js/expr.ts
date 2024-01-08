import { match } from 'itsamatch';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Expr as JSExpr, BinaryOp as JSBinaryOp } from '../../ast/js/expr';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { Type } from '../../infer/type';
import { assert } from '../../misc/utils';
import { Literal, BinaryOp } from '../../parse/token';
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
      const branches: { cond?: BitterExpr; then: BitterExpr }[] = [];

      const getBranches = (expr: BitterExpr) => {
        if (expr.variant === 'If') {
          branches.push({ cond: expr.cond, then: expr.then });
          if (expr.otherwise) {
            getBranches(expr.otherwise);
          }
        } else {
          branches.push({ then: expr });
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
          branches[0].then.variant === 'Literal' &&
          branches[0].then.literal.variant === 'Bool' &&
          branches[1].then.variant === 'Literal' &&
          branches[1].then.literal.variant === 'Bool' &&
          branches[0].then.literal.$value !== branches[1].then.literal.$value
        ) {
          const isFirstBranchTrue = branches[0].then.literal.$value;
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

      const compiledBranches = branches.map(({ cond, then }) => {
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
            then: val,
            otherwise: ternary,
          });
        }

        return ternary;
      }

      const returnsUndefined = Type.unify(bitter.ty, Type.Unit);
      let lastStmtFn = (val: JSExpr): JSStmt => JSStmt.Expr(val);
      let resultVar: JSExpr | undefined;

      if (!returnsUndefined) {
        const resultName = scope.declareUnused('result');
        resultVar = JSExpr.Variable(resultName);
        scope.add(JSStmt.Let({ name: resultName }));
        lastStmtFn = (val: JSExpr) => JSStmt.Assign(resultVar!, '=', val);
      }

      scope.add(
        JSStmt.If({
          branches: compiledBranches.map(({ cond, scope, val }) => ({
            cond,
            then: [...scope.statements, lastStmtFn(val)],
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
      // TODO: remove once types can be represented with enums inside poy itself
      if (fun.variant === 'Variable' && fun.name === 'showType' && args.length === 1) {
        return JSExpr.Literal({
          literal: Literal.Str(Type.show(args[0].ty)),
        });
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
    VariableAccess: ({ lhs, field }) => JSExpr.Dot(jsExprOf(lhs, scope), field),
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
    default:
      return op;
  }
}
