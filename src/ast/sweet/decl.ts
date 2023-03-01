import { DataType, genConstructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { Expr } from './expr';

export type Decl = DataType<{
    Let: LetDecl,
    Fun: FunDecl,
    Type: TypeDecl,
    Module: ModuleDecl,
    _Many: { decls: Decl[] },
}>;

export const Decl = {
    ...genConstructors<Decl>(['Let', 'Fun', 'Module', '_Many']),
    Type: (lhs: Type, rhs: Type): Decl => ({ variant: 'Type', lhs, rhs }),
};

export type LetDecl = {
    mutable: boolean,
    name: string,
    ann?: Type,
    value: Expr,
};

export type FunctionArgument = {
    name: string,
    ann?: Type,
};

export type FunDecl = {
    name: string,
    args: FunctionArgument[],
    ret?: Type,
    body: Expr,
};

export type TypeDecl = {
    lhs: Type,
    rhs: Type,
};

export type ModuleDecl = {
    name: string,
    decls: Decl[],
};
