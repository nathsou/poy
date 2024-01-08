import { DataType, constructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { AssignmentOp } from '../../parse/token';
import { Expr } from './expr';
import { Ref, ref } from '../../misc/utils';
import { Attributes } from './attribute';
import { Constructors, Impl } from '../../misc/traits';

export type Stmt = DataType<{
  Expr: { expr: Expr };
  Let: {
    pub: boolean;
    static: boolean;
    mutable: boolean;
    name: string;
    ann?: Type;
    value: Expr;
    attrs: Attributes;
  };
  Assign: { lhs: Expr; op: AssignmentOp; rhs: Expr };
  While: { cond: Expr; body: Stmt[] };
  For: { name: string; iterator: Ref<Expr>; body: Stmt[] };
  Return: { expr: Expr };
  Yield: { expr: Expr };
  Break: {};
  _Many: { stmts: Stmt[] };
}>;

export const Stmt = {
  ...constructors<Stmt>().get('Let', '_Many'),
  Expr: (expr: Expr): Stmt => ({ variant: 'Expr', expr }) satisfies Stmt,
  Assign: (lhs: Expr, op: AssignmentOp, rhs: Expr) =>
    ({ variant: 'Assign', lhs, op, rhs }) satisfies Stmt,
  While: (cond: Expr, body: Stmt[]) => ({ variant: 'While', cond, body }) satisfies Stmt,
  For: (name: string, iterator: Expr, body: Stmt[]) =>
    ({
      variant: 'For',
      name,
      iterator: ref(iterator),
      body,
    }) satisfies Stmt,
  Return: (expr: Expr) => ({ variant: 'Return', expr }) satisfies Stmt,
  Yield: (expr: Expr) => ({ variant: 'Yield', expr }) satisfies Stmt,
  Break: () => ({ variant: 'Break' }) satisfies Stmt,
} satisfies Impl<Constructors<Stmt>>;
