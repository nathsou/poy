import { DataType, genConstructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { Expr } from './expr';

export type Decl = DataType<{
    Let: LetDecl,
    Fun: FunDecl,
    Type: TypeDecl,
    Module: ModuleDecl,
}>;

export const Decl = {
    ...genConstructors<Decl>(['Let', 'Fun', 'Module']),
    Type: (lhs: Type, rhs: Type): Decl => ({ variant: 'Type', lhs, rhs }),
};

export type LetDecl = {
    mutable: boolean,
    name: string,
    value: Expr,
};

export type FunDecl = {
    name: string,
    args: string[],
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
