import { DataType, constructors, match } from 'itsamatch';
import { TypeEnv } from '../../infer/infer';
import { Type } from '../../infer/type';
import { Constructors, Impl } from '../../misc/traits';
import { BinaryOp, Literal, UnaryOp } from '../../parse/token';
import { Pattern } from './pattern';
import { Stmt } from './stmt';
import { EnumDecl } from './decl';

export type Expr = DataType<{
  Literal: { literal: Literal };
  Variable: { name: string; typeParams: Type[] };
  Unary: { op: UnaryOp; expr: Expr };
  Binary: { lhs: Expr; op: BinaryOp; rhs: Expr };
  Block: { stmts: Stmt[]; ret?: Expr };
  If: { cond: Expr; then_: Expr; else_?: Expr };
  Tuple: { elems: Expr[] };
  Array: { elems: Expr[] };
  UseIn: { lhs: Pattern; ann?: Type; value: Expr; rhs: Expr };
  Fun: {
    generics: string[];
    args: FunctionArgument[];
    ret?: Type;
    body: Expr;
    isIterator: boolean;
  };
  Call: { fun: Expr; args: Expr[] };
  Struct: {
    path: string[];
    name: string;
    typeParams: Type[];
    fields: { name: string; value: Expr }[];
  };
  FieldAccess: {
    lhs: Expr;
    field: string;
    typeParams: Type[];
    extensionUuid?: string;
    isCalled: boolean;
    isNative: boolean;
  };
  ModuleAccess: { path: string[]; member: string; extensionUuid?: string };
  ExtensionAccess: {
    subject: Type;
    member: string;
    typeParams: Type[];
    extensionUuid?: string;
  };
  TupleAccess: { lhs: Expr; index: number };
  Match: { subject: Expr; cases: { pattern: Pattern; body: Expr }[] };
  VariantShorthand: { variantName: string; args: Expr[]; resolvedEnum?: EnumDecl };
  StringInterpolation: { parts: StringInterpolationPart[] };
}> & { ty?: Type };

export type FunctionArgument = { pat: Pattern; ann?: Type };

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
    'ExtensionAccess',
    'ModuleAccess',
    'TupleAccess',
    'Match',
    'VariantShorthand',
    'StringInterpolation',
  ),
  Literal: (literal: Literal): Expr => ({ variant: 'Literal', literal }) as const,
  isMutable: (expr: Expr, env: TypeEnv): boolean =>
    match(expr, {
      Variable: ({ name }) => env.variables.lookup(name).unwrap().mut ?? false,
      FieldAccess: ({ lhs, field }) => {
        if (!Expr.isMutable(lhs, env)) return false;
        if (lhs.ty === undefined) return false;
        if (lhs.ty.variant === 'Fun') {
          return env.structs.lookup(lhs.ty.name).match({
            Some: struct => {
              const fieldInfo = struct.fields.find(f => f.name === field);
              return fieldInfo?.mut ?? false;
            },
            None: () => false,
          });
        }

        return false;
      },
      Array: () => true,
      Struct: () => true,
      _: () => false,
    }),
  // can this expression be copied without any side effects?
  isPurelyCopyable: (expr: Expr): boolean =>
    match(expr, {
      Variable: () => true,
      Literal: () => true,
      _: () => false,
    }),
} satisfies Impl<Constructors<Expr>>;

export type StringInterpolationPart = DataType<{
  Str: { value: string };
  Expr: { expr: Expr };
}>;

export const StringInterpolationPart = {
  Str: (value: string): StringInterpolationPart => ({ variant: 'Str', value }),
  Expr: (expr: Expr): StringInterpolationPart => ({ variant: 'Expr', expr }),
} satisfies Impl<Constructors<StringInterpolationPart>>;
