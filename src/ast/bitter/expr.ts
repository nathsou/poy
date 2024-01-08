import { DataType, constructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { BinaryOp, Literal, UnaryOp } from '../../parse/token';
import { FunctionArgument } from './decl';
import { Stmt } from './stmt';
import { Constructors, Impl } from '../../misc/traits';

type Typed<T> = { [K in keyof T]: T[K] & { ty: Type } };

export type Expr = DataType<
  Typed<{
    Literal: { literal: Literal };
    Variable: { name: string };
    Unary: { op: UnaryOp; expr: Expr };
    Binary: { lhs: Expr; op: BinaryOp; rhs: Expr };
    Block: { stmts: Stmt[]; ret?: Expr };
    If: { cond: Expr; then: Expr; otherwise?: Expr };
    Tuple: { elems: Expr[] };
    Array: { elems: Expr[] };
    UseIn: { name: string; value: Expr; rhs: Expr };
    Fun: { args: FunctionArgument[]; body: Expr; isIterator: boolean };
    Call: { fun: Expr; args: Expr[] };
    Struct: {
      path: string[];
      name?: string;
      fields: { name: string; value: Expr }[];
    };
    FieldAccess: {
      lhs: Expr;
      field: string | number;
      isCalled: boolean;
    };
    ModuleAccess: { path: string[]; member: string };
  }>
>;

export const Expr = {
  ...constructors<Expr>().get(
    'Variable',
    'Unary',
    'Binary',
    'Block',
    'If',
    'Tuple',
    'Array',
    'UseIn',
    'Fun',
    'Call',
    'Struct',
    'FieldAccess',
  ),
  Literal: (literal: Literal, ty: Type) => ({
    variant: 'Literal',
    literal,
    ty,
  }),
  ModuleAccess: (path: string[], member: string, ty: Type) => ({
    variant: 'ModuleAccess',
    path,
    member,
    ty,
  }),
} satisfies Impl<Constructors<Expr>>;
