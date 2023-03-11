import { DataType, genConstructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { BinaryOp, Literal, UnaryOp } from '../../parse/token';
import { Stmt } from './stmt';

export type Expr = DataType<{
    Literal: { literal: Literal },
    Variable: string,
    Unary: { op: UnaryOp, expr: Expr },
    Binary: { lhs: Expr, op: BinaryOp, rhs: Expr },
    Block: { stmts: Stmt[], ret?: Expr },
    If: { cond: Expr, then: Expr, otherwise?: Expr },
    Tuple: { elems: Expr[] },
    Array: { elems: Expr[] },
    UseIn: { name: string, ann?: Type, value: Expr, rhs: Expr },
    Fun: { args: FunctionArgument[], ret?: Type, body: Expr },
    Call: { fun: Expr, args: Expr[] },
    Struct: { path: string[], name: string, fields: { name: string, value: Expr }[] },
    VariableAccess: { lhs: Expr, field: string, extensionUuid?: string, isCalled: boolean, isNative: boolean },
    ModuleAccess: { path: string[], member: string, extensionUuid?: string },
    ExtensionAccess: { subject: Type, member: string, extensionUuid?: string },
}> & { ty?: Type };

export type FunctionArgument = { name: string, ann?: Type };

export const Expr = {
    ...genConstructors<Expr>([
        'Variable', 'Unary', 'Binary', 'Block', 'If', 'Tuple', 'Array',
        'UseIn', 'Fun', 'Call', 'Struct', 'VariableAccess', 'ExtensionAccess', 'ModuleAccess',
    ]),
    Literal: (literal: Literal): Expr => ({ variant: 'Literal', literal }) as const,
};