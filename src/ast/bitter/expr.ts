import { DataType, genConstructors } from "itsamatch";
import { Type } from "../../infer/type";
import { BinaryOp, Literal, UnaryOp } from "../../parse/token";
import { FunctionArgument } from "./decl";
import { Stmt } from "./stmt";

type Typed<T> = { [K in keyof T]: T[K] & { ty: Type } };

export type Expr = DataType<Typed<{
    Literal: { literal: Literal },
    Variable: { name: string },
    Unary: { op: UnaryOp, expr: Expr },
    Binary: { lhs: Expr, op: BinaryOp, rhs: Expr },
    Block: { stmts: Stmt[], ret?: Expr },
    If: { cond: Expr, then: Expr, otherwise: Expr },
    Tuple: { elems: Expr[] },
    Array: { elems: Expr[] },
    UseIn: { name: string, value: Expr, rhs: Expr },
    Fun: { args: FunctionArgument[], body: Expr },
    Call: { fun: Expr, args: Expr[] },
}>>;

export const Expr = {
    ...genConstructors<Expr>([
        'Variable', 'Unary', 'Binary', 'Block', 'If', 'Tuple', 'Array',
        'UseIn', 'Fun', 'Call',
    ]),
    Literal: (literal: Literal, ty: Type): Expr => ({ variant: 'Literal', literal, ty }) as const,
};
