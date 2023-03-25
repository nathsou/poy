import { DataType, genConstructors } from 'itsamatch';
import { Type, TypeVarId } from '../../infer/type';
import { BinaryOp, Literal, UnaryOp } from '../../parse/token';
import { Stmt } from './stmt';

export type Expr = DataType<{
    Literal: { literal: Literal },
    Variable: { name: string, typeParams: Type[] },
    Unary: { op: UnaryOp, expr: Expr },
    Binary: { lhs: Expr, op: BinaryOp, rhs: Expr },
    Block: { stmts: Stmt[], ret?: Expr },
    If: { cond: Expr, then: Expr, otherwise?: Expr },
    Tuple: { elems: Expr[] },
    Array: { elems: Expr[] },
    UseIn: { name: string, ann?: Type, value: Expr, rhs: Expr },
    Fun: { generics: TypeVarId[], args: FunctionArgument[], ret?: Type, body: Expr },
    Call: { fun: Expr, args: Expr[] },
    Struct: { path: string[], name: string, fields: { name: string, value: Expr }[] },
    VariableAccess: { lhs: Expr, field: string, typeParams: Type[], extensionUuid?: string, isCalled: boolean, isNative: boolean },
    ModuleAccess: { path: string[], member: string, extensionUuid?: string },
    ExtensionAccess: { subject: Type, member: string, typeParams: Type[], extensionUuid?: string },
    TupleAccess: { lhs: Expr, index: number },
}> & { ty?: Type };

export type FunctionArgument = { name: string, ann?: Type };

export const Expr = {
    ...genConstructors<Expr>([
        'Variable', 'Unary', 'Binary', 'Block', 'If', 'Tuple', 'Array',
        'UseIn', 'Fun', 'Call', 'Struct', 'VariableAccess', 'ExtensionAccess', 'ModuleAccess',
        'TupleAccess',
    ]),
    Literal: (literal: Literal): Expr => ({ variant: 'Literal', literal }) as const,
};