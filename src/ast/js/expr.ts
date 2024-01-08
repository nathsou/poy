import { DataType, constructors, match } from 'itsamatch';
import { Name } from '../../codegen/js/jsScope';
import { Constructors, Impl, Show } from '../../misc/traits';
import { Literal } from '../../parse/token';
import { Stmt } from './stmt';

export type Expr = DataType<{
  Literal: { literal: Literal };
  Variable: { name: Name };
  Unary: { op: UnaryOp; expr: Expr };
  Binary: { lhs: Expr; op: BinaryOp; rhs: Expr };
  Ternary: { cond: Expr; then: Expr; otherwise: Expr };
  Array: { elems: Expr[] };
  Closure: { args: { name: Name }[]; stmts: Stmt[] };
  Generator: { args: { name: Name }[]; stmts: Stmt[] };
  Call: { fun: Expr; args: Expr[] };
  Paren: { expr: Expr };
  Object: { entries: { key: string; value: Expr }[] };
  Dot: { lhs: Expr; field: string | number };
}>;

export type UnaryOp = '!' | '-' | '+';
type CompoundOp = '+=' | '-=' | '*=' | '/=' | '**=';
export type BinaryOp =
  | CompoundOp
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '**'
  | '&&'
  | '||'
  | '&'
  | '|';

export const Expr = {
  ...constructors<Expr>().get(
    'Literal',
    'Unary',
    'Binary',
    'Ternary',
    'Array',
    'Closure',
    'Object',
    'Generator',
  ),
  Variable: (name: Name): Expr => ({ variant: 'Variable', name }) as const,
  Paren: (expr: Expr): Expr => ({ variant: 'Paren', expr }) as const,
  Call: (fun: Expr, args: Expr[]): Expr =>
    ({
      variant: 'Call',
      fun,
      args,
    }) as const,
  Dot: (lhs: Expr, field: string | number) =>
    ({
      variant: 'Dot',
      lhs,
      field,
    }) satisfies Expr,
  show,
} satisfies Impl<Show<Expr> & Constructors<Expr>>;

function show(expr: Expr, indentLevel: number = 0): string {
  const indent = ' '.repeat(indentLevel * 2);

  return match(expr, {
    Literal: ({ literal }) =>
      match(literal, {
        Unit: () => 'undefined',
        Bool: q => (q ? 'true' : 'false'),
        Num: x => x.toString(),
        Str: s => `"${s}"`,
      }),
    Variable: ({ name }) => name.mangled,
    Unary: ({ op, expr }) => `${op}${show(expr, indentLevel)}`,
    Binary: ({ lhs, op, rhs }) =>
      `(${show(lhs, indentLevel)} ${op === '==' ? '===' : op} ${show(rhs, indentLevel)})`,
    Ternary: ({ cond, then, otherwise }) =>
      `(${show(cond, indentLevel)} ? ${show(then, indentLevel)} : ${show(otherwise, indentLevel)})`,
    Array: ({ elems }) => `[${elems.map(e => show(e, indentLevel)).join(', ')}]`,
    Closure: ({ args, stmts }) =>
      `(${args.map(({ name }) => name.mangled).join(', ')}) => {\n${indent}${Stmt.showStmts(
        stmts,
        indentLevel + 1,
      )}\n${indent}}`,
    Generator: ({ args, stmts }) =>
      `function* (${args.map(({ name }) => name.mangled).join(', ')}) {\n${indent}${Stmt.showStmts(
        stmts,
        indentLevel + 1,
      )}\n${indent}}`,
    Call: ({ fun, args }) => {
      if (fun.variant === 'Closure') {
        fun = Expr.Paren(fun);
      }

      return `${show(fun, indentLevel)}(${args.map(e => show(e, indentLevel)).join(', ')})`;
    },
    Paren: ({ expr }) => `(${show(expr, indentLevel)})`,
    Object: ({ entries }) => {
      if (entries.length === 0) {
        return '{}';
      }

      const entriesFmt = entries.map(({ key, value }) =>
        value.variant === 'Variable' && value.name.mangled === key
          ? key
          : `${key}: ${show(value, indentLevel)}`,
      );

      if (entries.length <= 5) {
        return `{ ${entriesFmt.join(', ')} }`;
      } else {
        return `{\n${entriesFmt.map(e => `${indent}    ${e}`).join(',\n')}\n${indent}  }`;
      }
    },
    Dot: ({ lhs, field }) =>
      typeof field === 'number' || field.includes('.')
        ? `${show(lhs)}[${field}]`
        : `${show(lhs)}.${field}`,
  });
}
